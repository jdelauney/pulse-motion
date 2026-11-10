'use strict';
/* Pulse Motion – graphiques, code et formules d'une scène (spec S7, 5.6, 5.9 et 5.10) : préparation à l'assemblage et
 * contrôle sans navigateur. Les données viennent du déroulé (règle des textes) :
 *
 *   scenes[].graphiques.ventes = { "type": "barres", "valeurs": [{ "etiquette": "2023", "valeur": 19, "debut": "mot:2023" }], "unite": "%", "source": "Insee, 2025" }
 *   scenes[].code.formule = { "langage": "tableur", "titre": "Ventes.xlsx", "etapes": [{ "code": "=SOMME(B2:B13)", "debut": "mot:somme", "surligner": [1] }] }
 *   scenes[].formules.aire = "\\pi r^2"
 *
 *   <figure data-graphique="ventes" data-start="mot:ventes" style="width: 90cqh; height: 50cqh"></figure>
 *   <figure data-code="formule" data-start="1"></figure>
 *   <span data-formule="aire" class="pm-m-pop" data-start="2"></span>
 *
 * usagesDonnees(html) -> { graphique, code, formule } (bool) : ce que la scène montre.
 * preparerDonnees(html, { scene }) -> { html, erreurs, code, formule } (scene : la scène du déroulé), après l'injection des
 *   textes. Graphique : data-pm-graphique (données), et dans la figure ses étiquettes, ses valeurs finales et sa source en
 *   <span class="pm-calque-texte" data-texte="graphique:<clé>:…" data-pm-role> déjà remplis (typographie française) ;
 *   code : data-pm-code (étapes, pistes des jetons, lignes, largeur), fenêtre (barre de titre, grille à chasse fixe, jetons
 *   placés par --col et --ligne, bandes des lignes surlignées), corps jugé comme un texte (data-texte="code:<clé>") ;
 *   formule : son MathML (lib/formules.js) dans l'élément, data-texte="formule:<clé>", classe pm-formule.
 *   Règles (erreurs) : donnees-manquantes (clé absente du déroulé), graphique-donnees-invalides, code-invalide,
 *   formule-non-prise-en-charge ; code-trop-large se mesure dans la page (moteur/dessin/composants.js).
 * cssDonnees({ code, formule }) -> { css, polices, detail } : @font-face de JetBrains Mono (code) et de Libertinus Math
 *   (formules), vendor/polices/ (OFL), embarqués seulement si la vidéo en a besoin ; detail : pour les crédits.
 * CLE_GENEREE : motif des clés de texte posées ici (jamais des clés du déroulé : aucune correction de taille ne les vise).
 */
const fs = require('node:fs');
const path = require('node:path');
const G = require('../../moteur/dessin/graphiques.js');
const C = require('../../moteur/dessin/code.js');
const F = require('./formules.js');
const { corrigerTypographie } = require('./typographie.js');
const { versDataURI } = require('./embarquer.js');

const VENDOR = path.join(__dirname, '..', '..', 'vendor', 'polices');
const POLICES = {
  code: { famille: 'JetBrains Mono', fichier: path.join(VENDOR, 'JetBrainsMono-400.woff2'), role: 'code' },
  formule: { famille: 'Libertinus Math', fichier: path.join(VENDOR, 'LibertinusMath-Regular.woff2'), role: 'formules' },
};
const CLE_GENEREE = /^(?:graphique|code|formule):/;
const BALISE = /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTR = (nom) => new RegExp(`\\s${nom}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);

const echapper = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const masquer = (html) => String(html).replace(/<!--[\s\S]*?-->|<(style|script)\b[\s\S]*?<\/\1\s*>/gi, (t) => ' '.repeat(t.length));
const typo = (t) => corrigerTypographie(String(t)).texte;

function usagesDonnees(html) {
  const vu = masquer(html || '');
  return { graphique: /\sdata-graphique\s*=/.test(vu), code: /\sdata-code\s*=/.test(vu), formule: /\sdata-formule\s*=/.test(vu) };
}

/** Ajoute des attributs à une balise ouvrante ; classe et style fusionnés avec ceux qui y sont. */
function completerBalise(ouvrante, { classe = null, style = null, attributs = '' }) {
  let t = ouvrante.replace(/\s*\/?>$/, '');
  if (classe) {
    const m = ATTR('class').exec(t);
    t = m ? t.replace(m[0], ` class="${echapper(`${m[1] ?? m[2]} ${classe}`.trim())}"`) : `${t} class="${classe}"`;
  }
  if (style) {
    const m = ATTR('style').exec(t);
    t = m ? t.replace(m[0], ` style="${echapper(`${(m[1] ?? m[2]).replace(/;?\s*$/, ';')} ${style}`)}"`) : `${t} style="${style}"`;
  }
  return `${t}${attributs}>`;
}

function htmlGraphique(cle, g) {
  const tx = G.textes(g);
  const spans = [];
  const span = (role, rang, texte, classe) => spans.push(`<span class="pm-calque-texte ${classe}" data-texte="graphique:${echapper(cle)}:${role}${rang === null ? '' : `:${rang}`}" data-pm-role="${role}"${rang === null ? '' : ` data-pm-rang="${rang}"`}>${echapper(texte)}</span>`);
  tx.etiquettes.forEach((t, i) => { if (t && t.trim()) span('etiquette', i, typo(t.trim()), 'pm-graphique-etiquette'); });
  tx.valeurs.forEach((t, i) => { if (t) span('valeur', i, t, 'pm-graphique-valeur'); });
  if (tx.source) span('source', null, `Source : ${typo(tx.source)}`, 'pm-graphique-source');
  const donnees = { type: g.type, valeurs: g.valeurs.map((x) => ({ valeur: x.valeur, ...(x.debut !== undefined ? { debut: x.debut } : {}), ...(x.accent ? { accent: true } : {}) })),
    ...(g.unite ? { unite: g.unite } : {}), ...(g.prefixe ? { prefixe: g.prefixe } : {}), ...(g.max !== undefined ? { max: g.max } : {}),
    ...(g.decimales !== undefined ? { decimales: g.decimales } : {}) };
  return { attributs: ` data-pm-graphique="${echapper(JSON.stringify(donnees))}"`, contenu: spans.join('') };
}

function htmlCode(cle, c) {
  const langage = c.langage || 'texte';
  const r = C.pistes(c.etapes, langage);
  const premiere = C.lignes(c.etapes[0].code).join('\n');
  const bandes = [];
  c.etapes.forEach((e, s) => (e.surligner || []).forEach((n) => bandes.push(`<span class="pm-code-bande" data-pm-etape="${s}" data-pm-ligne="${n}" style="--ligne: ${n - 1}"></span>`)));
  const jetons = r.pistes.map((p, j) => {
    const pos = p.p.find((x) => x) || [0, 0];
    return `<span class="pm-code-jeton pm-code-${p.c}" data-pm-piste="${j}" style="--col: ${pos[0]}; --ligne: ${pos[1]}">${echapper(p.t)}</span>`;
  });
  const titre = typeof c.titre === 'string' && c.titre.trim() ? `<span class="pm-code-titre" data-texte="code:${echapper(cle)}:titre">${echapper(c.titre.trim())}</span>` : '';
  const donnees = { etapes: c.etapes.map((e) => ({ ...(e.debut !== undefined ? { debut: e.debut } : {}), ...(e.surligner ? { surligner: e.surligner } : {}) })),
    pistes: r.pistes, lignes: r.lignes, largeur: r.largeur, texte: premiere };
  return {
    attributs: ` data-pm-code="${echapper(JSON.stringify(donnees))}"`,
    style: `--pm-code-colonnes: ${Math.max(1, r.largeur)}; --pm-code-lignes: ${r.lignes[0]};`,
    contenu: `<div class="pm-code-fenetre"><div class="pm-code-barre"><i></i><i></i><i></i>${titre}</div><div class="pm-code-corps" data-texte="code:${echapper(cle)}">${bandes.join('')}${jetons.join('')}</div></div>`,
  };
}

function preparerDonnees(html, { scene } = {}) {
  const sc = scene || {};
  const id = sc.id;
  const erreurs = [];
  const ou = id ? `Scène « ${id} »` : 'Scène';
  const erreur = (regle, message) => erreurs.push({ regle, gravite: 'erreur', ...(id ? { scene: id } : {}), message });
  const vu = masquer(html);
  const remplacements = [];
  let code = false, formule = false;
  let m;
  BALISE.lastIndex = 0;
  while ((m = BALISE.exec(vu))) {
    const [ouvrante, nomBalise, brut] = m;
    const sorte = /\sdata-graphique\s*=/.test(` ${brut}`) ? 'graphique' : /\sdata-code\s*=/.test(` ${brut}`) ? 'code' : /\sdata-formule\s*=/.test(` ${brut}`) ? 'formule' : null;
    if (!sorte) continue;
    const a = ATTR(`data-${sorte}`).exec(` ${brut}`);
    const cle = a ? (a[1] ?? a[2]) : '';
    const fermeture = new RegExp(`</${nomBalise}\\s*>`, 'i');
    const reste = vu.slice(m.index + ouvrante.length);
    const f = ouvrante.endsWith('/>') ? null : fermeture.exec(reste);
    const fin = f ? m.index + ouvrante.length + f.index : m.index + ouvrante.length;
    const table = sorte === 'graphique' ? sc.graphiques : sorte === 'code' ? sc.code : sc.formules;
    const champ = sorte === 'graphique' ? 'graphiques' : sorte === 'code' ? 'code' : 'formules';
    if (!table || typeof table !== 'object' || !Object.hasOwn(table, cle)) {
      erreur('donnees-manquantes', `${ou} : data-${sorte}="${cle}" n'a pas de données dans le déroulé (scenes[].${champ}.${cle || '<clé>'}).`);
      continue;
    }
    const donnee = table[cle];
    let r = null;
    if (sorte === 'graphique') {
      const fautes = G.valider(donnee);
      if (fautes.length) { erreur('graphique-donnees-invalides', `${ou}, graphique « ${cle} » : ${fautes.slice(0, 3).join(' ')}`); continue; }
      r = htmlGraphique(cle, donnee);
    } else if (sorte === 'code') {
      const fautes = C.valider(donnee);
      if (fautes.length) { erreur('code-invalide', `${ou}, code « ${cle} » : ${fautes.slice(0, 3).join(' ')}`); continue; }
      r = htmlCode(cle, donnee);
      code = true;
    } else {
      if (typeof donnee !== 'string') { erreur('formule-non-prise-en-charge', `${ou}, formule « ${cle} » : la formule doit être un texte TeX, ex. « \\pi r^2 ».`); continue; }
      const conv = F.convertir(donnee);
      if (conv.erreurs.length) { erreur('formule-non-prise-en-charge', `${ou}, formule « ${cle} » : ${conv.erreurs.slice(0, 2).join(' ')}`); continue; }
      r = { attributs: ` data-texte="formule:${echapper(cle)}"`, classe: 'pm-formule', contenu: conv.mathml };
      formule = true;
    }
    remplacements.push({ debut: m.index, fin, ouvrante: html.slice(m.index, m.index + ouvrante.length), r, fermer: f ? '' : `</${nomBalise}>` });
  }
  let sortie = '';
  let depuis = 0;
  for (const x of remplacements) {
    sortie += html.slice(depuis, x.debut) + completerBalise(x.ouvrante, { classe: x.r.classe || null, style: x.r.style || null, attributs: x.r.attributs }) + x.r.contenu + x.fermer;
    depuis = x.fin;
  }
  sortie += html.slice(depuis);
  return { html: sortie, erreurs, code, formule };
}

function cssDonnees({ code = false, formule = false } = {}) {
  const faces = [];
  const polices = [];
  const detail = [];
  for (const [sorte, p] of Object.entries(POLICES)) {
    if (!(sorte === 'code' ? code : formule)) continue;
    faces.push(`@font-face { font-family: '${p.famille}'; src: url("${versDataURI(p.fichier)}"); font-weight: 400; font-display: block; }`);
    polices.push(p.fichier);
    detail.push({ famille: p.famille, roles: [p.role], fichiers: [p.fichier] });
  }
  if (formule) faces.push("#pm-scene .pm-formule { font-family: 'Libertinus Math', math; white-space: nowrap; } #pm-scene .pm-formule math { font-family: 'Libertinus Math', math; font-size: 1em; }");
  return { css: faces.length ? `${faces.join('\n')}\n` : '', polices, detail };
}

module.exports = { usagesDonnees, preparerDonnees, cssDonnees, CLE_GENEREE, POLICES };
