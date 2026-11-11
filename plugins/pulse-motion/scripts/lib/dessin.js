'use strict';
/* Pulse Motion – calque de dessin d'une scène (spec S7, 5.2 à 5.5) : préparation à l'assemblage et contrôle sans navigateur.
 *
 *   <i data-fleche="#client → #serveur" data-start="mot:serveur"><span data-texte="requete"></span></i>
 *   <i data-annoter="entoure" data-cible="#prix" data-start="mot:cher"></i>
 *   <script>M.dessin('s', function (d) { d.etiquette('legende', { x: 40, y: 20 }); d.icone('truck', { x: 60, y: 50 }); });</script>
 *
 * usagesDessin(html, scripts?) -> bool : la scène a une flèche, une annotation, une forme à main levée, un graphique
 *   (data-graphique), du code (data-code), ou un script qui appelle M.dessin (groupe « dessin » du moteur,
 *   moteur/dessin/dessin.css). Graphiques, code et formules : lib/donnees-scene.js.
 * preparerDessin(html, { scene, scripts }) -> { html, erreurs, icones }
 *   Une flèche sans data-dur reçoit 0,7 s, une annotation 0,6 s (0,8 s pour entoure). Les étiquettes d'un dessin libre
 *   (d.etiquette('cle')) deviennent des <span class="pm-calque-texte" data-texte="cle" data-pm-libre> en fin de scène, remplis
 *   ensuite comme tout texte du déroulé (un texte absent : texte-manquant). icones : noms des icônes de d.icone('nom'),
 *   tels qu'écrits, à embarquer (lib/icones.js, cheminsPour).
 *   Règles : fleche-cible-introuvable (erreur : un #id d'une flèche absent de la scène, avec les ids proches),
 *   dessin-invalide (erreur : flèche mal écrite, réglage hors bornes, annotation inconnue ou sans cible, data-main-levee
 *   ailleurs que sur une forme SVG, ou sur une forme minutée autre qu'un chemin), icone-inconnue (d.icone).
 */
const P = require('../../moteur/proches.js');
const { TYPES_ANNOTATION, DUREES_ANNOTATION } = require('../../moteur/dessin/geometrie.js');

const FORMES = ['line', 'polyline', 'polygon', 'rect', 'ellipse', 'circle', 'path'];
const TETES = ['fin', 'debut', 'deux', 'aucune'];
const BALISE = /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTRIBUT = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const EXTREMITE = /^(#[A-Za-z0-9_-]+|-?\d*\.?\d+\s*,\s*-?\d*\.?\d+)$/;
const APPEL_DESSIN = /\bM\s*\.\s*dessin\s*\(/;
// Graphiques et code (spec S7 J2) : dessinés par le calque, comme les flèches (moteur/dessin/composants.js).
const DECLARATIFS = /\sdata-(?:fleche|annoter|main-levee|graphique|code)(?=[\s=>/])/;

const echapper = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const masquer = (html) => String(html).replace(/<!--[\s\S]*?-->|<(style|script)\b[\s\S]*?<\/\1\s*>/gi, (t) => ' '.repeat(t.length));

function lireAttributs(texte) {
  const r = {};
  let m;
  ATTRIBUT.lastIndex = 0;
  while ((m = ATTRIBUT.exec(texte))) {
    const nom = m[1].toLowerCase();
    if (nom === '/' || Object.hasOwn(r, nom)) continue;
    r[nom] = m[2] ?? m[3] ?? m[4] ?? null;
  }
  return r;
}

function usagesDessin(html, scripts = []) {
  return DECLARATIFS.test(masquer(html || '')) || (scripts || []).some((s) => APPEL_DESSIN.test(String(s)));
}

/** Clés citées par un appel `.nom('clé'` dans les scripts, dans l'ordre, sans doublon. */
function clesAppelees(scripts, nom) {
  const r = [];
  const motif = new RegExp(`\\.${nom}\\(\\s*(['"])([^'"\\\\]+)\\1`, 'g');
  for (const s of scripts || []) for (const m of String(s).matchAll(motif)) if (!r.includes(m[2])) r.push(m[2]);
  return r;
}

function preparerDessin(html, { scene, scripts = [] } = {}) {
  const erreurs = [];
  const ou = scene ? `Scène « ${scene} » : ` : '';
  const erreur = (regle, message) => erreurs.push({ regle, gravite: 'erreur', ...(scene ? { scene } : {}), message: ou + message });
  const vu = masquer(html);
  const ids = [...vu.matchAll(/\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => m[1] ?? m[2]);
  const proches = (id) => P.phrase(P.proches(id, ids).map((x) => `#${x}`));
  const avecProches = (id) => { const p = proches(id); return p ? ` ; ${p}` : '.'; };
  let sortie = '';
  let depuis = 0;
  let m;
  BALISE.lastIndex = 0;
  while ((m = BALISE.exec(vu))) {
    const [tout, balise, brut] = m;
    if (!/\sdata-(?:fleche|annoter|main-levee)(?=[\s=>/]|$)/.test(` ${brut}`)) continue;
    const a = lireAttributs(brut);
    const tag = balise.toLowerCase();
    const ajouts = [];
    if (Object.hasOwn(a, 'data-fleche')) {
      const valeur = String(a['data-fleche'] || '');
      const morceaux = valeur.split(/\s*(?:→|->)\s*/).map((x) => x.trim());
      if (morceaux.length !== 2 || !morceaux.every((x) => EXTREMITE.test(x))) {
        erreur('dessin-invalide', `data-fleche « ${valeur} » mal écrit : écrire « #depart → #arrivee » (un id de la scène, ou un point « x,y » en cqh).`);
      } else {
        for (const x of morceaux) {
          if (x[0] === '#' && !ids.includes(x.slice(1))) erreur('fleche-cible-introuvable', `la flèche « ${valeur} » vise « ${x} », qui n'est pas dans la scène${avecProches(x.slice(1))}`);
        }
      }
      const courbe = a['data-fleche-courbe'];
      if (courbe !== undefined && !(Math.abs(Number(courbe)) <= 1)) erreur('dessin-invalide', `data-fleche-courbe « ${courbe} » doit être un nombre de -1 à 1.`);
      const tete = a['data-fleche-tete'];
      if (tete !== undefined && !TETES.includes(tete)) erreur('dessin-invalide', `data-fleche-tete « ${tete} » inconnu (${TETES.join(', ')}).`);
      const ecart = a['data-fleche-ecart'];
      if (ecart !== undefined && !(Number(ecart) >= 0)) erreur('dessin-invalide', `data-fleche-ecart « ${ecart} » doit être une distance en cqh (0 ou plus).`);
      if (!Object.hasOwn(a, 'data-dur')) ajouts.push(' data-dur="0.7"');
    }
    if (Object.hasOwn(a, 'data-annoter')) {
      const type = String(a['data-annoter'] || '');
      if (!TYPES_ANNOTATION.includes(type)) {
        const p = P.phrase(P.proches(type, TYPES_ANNOTATION));
        erreur('dessin-invalide', `data-annoter « ${type} » inconnu${p ? ` ; ${p}` : ''} (${TYPES_ANNOTATION.join(', ')}).`);
      }
      const cible = a['data-cible'];
      if (!cible) erreur('dessin-invalide', `data-annoter="${type}" sans data-cible : nommer l'élément à mettre en valeur (data-cible="#id").`);
      else if (!/^#[A-Za-z0-9_-]+$/.test(cible) || !ids.includes(cible.slice(1))) erreur('dessin-invalide', `l'annotation « ${type} » vise « ${cible} », qui n'est pas un élément de la scène${/^#/.test(cible) ? avecProches(cible.slice(1)) : ' (écrire data-cible="#id").'}`);
      if (!Object.hasOwn(a, 'data-dur')) ajouts.push(` data-dur="${DUREES_ANNOTATION[type] || 0.6}"`);
    }
    if (Object.hasOwn(a, 'data-main-levee')) {
      if (!FORMES.includes(tag)) erreur('dessin-invalide', `data-main-levee se pose sur une forme SVG (${FORMES.join(', ')}), pas sur <${tag}>.`);
      else if (tag !== 'path' && (Object.hasOwn(a, 'data-start') || Object.hasOwn(a, 'data-dur'))) erreur('dessin-invalide', `data-main-levee sur un <${tag}> minuté : poser data-start et data-dur sur son <svg> (ou un <g>), ou en faire un <path>.`);
    }
    if (ajouts.length) {
      const fin = m.index + tout.length - (tout.endsWith('/>') ? 2 : 1);
      sortie += html.slice(depuis, fin) + ajouts.join('');
      depuis = fin;
    }
  }
  sortie += html.slice(depuis);
  // Étiquettes des dessins libres : posées en fin de scène, remplies par l'injection des textes.
  const deja = new Set([...masquer(sortie).matchAll(/<span\b[^>]*\sdata-pm-libre[^>]*>/g)].map((x) => (/data-texte="([^"]+)"/.exec(x[0]) || [])[1]).filter(Boolean));
  const libres = clesAppelees(scripts, 'etiquette').filter((c) => !deja.has(c));
  if (libres.length) {
    const spans = libres.map((c) => `<span class="pm-calque-texte" data-texte="${echapper(c)}" data-pm-libre></span>`).join('');
    const i = sortie.toLowerCase().lastIndexOf('</section>');
    sortie = i >= 0 ? `${sortie.slice(0, i)}${spans}${sortie.slice(i)}` : sortie + spans;
  }
  // Icônes des dessins libres (spec S9, 5.3 : bibliothèque Lucide) : nom inconnu, comme <svg data-icone>.
  const icones = [];
  const noms = clesAppelees(scripts, 'icone');
  if (noms.length) {
    const I = require('./icones.js');
    for (const nom of noms) {
      if (I.resoudre(nom)) icones.push(nom);
      else {
        const p = I.nomsProches(nom);
        erreurs.push({ regle: 'icone-inconnue', gravite: 'erreur', ...(scene ? { scene } : {}),
          message: `${ou}icône « ${nom} » inconnue (d.icone) ; ${p.length ? `noms proches : ${p.join(', ')}.` : 'cherchez-en une par un mot avec « pulse-motion icones chercher <mot> ».'}` });
      }
    }
  }
  return { html: sortie, erreurs, icones };
}

module.exports = { usagesDessin, preparerDessin, clesAppelees, FORMES, TETES };
