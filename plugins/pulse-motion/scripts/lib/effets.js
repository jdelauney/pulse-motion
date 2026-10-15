'use strict';
/* Pulse Motion – effets de particules d'une scène : recettes, réglages, compilation.
 *
 * Une scène pose un effet avec <div data-effet="nom" data-ancre="#id" data-calque="avant|arriere"
 * data-reglages="nom: valeur; …" data-graine="7" data-start="…" data-dur="…"></div> ; data-cible="#id" : élément
 * d'arrivée d'une métamorphose (fragmentation, P4). Une recette qui photographie son ancre (pixels, éclats, cible
 * « ancre ») demande data-ancre (ancre-vide), une métamorphose data-cible (metamorphose-sans-cible).
 * Structures (P5b) : un tissu photographié (apparence.source « ancre ») demande data-ancre (ancre-vide) ; chaque « #id » visé
 * par une attache (effet.elements) existe dans la scène (attache-introuvable).
 * Milieux (P5c) : une recette de milieu (bloc « milieu ») se pose avec data-milieu (milieu-invalide) ; un effet couplé au
 * milieu (force « milieu », « structure.milieu », « injecte ») demande un milieu valide dans sa scène (option milieu :
 * couplage-sans-milieu).
 * Les recettes sont cherchées dans <projet>/effets/ puis dans la bibliothèque du plugin.
 * Chaque balise reçoit data-pm-effet="N" (index dans M.donnees.effets) ou data-pm-effet-erreur.
 * Atelier : balisesEffets repère les balises (positions dans le texte d'origine, même rang que l'assemblage),
 * reecrireBalise et modifierEffet changent quelques attributs sans toucher au reste.
 * Modules WGSL (P6) : le code des modules d'une recette est attaché à l'effet compilé (S.attacherModules, chargerShader) ;
 * les sources utilisées sont rendues dans « modules ».
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireAttributs } = require('./extraire.js');
const { cheminDansProjet, versDataURI } = require('./embarquer.js');
const { echapperHTML } = require('./scenes.js');
const R = require('../../moteur/particules/recette.js');
const S = require('../../moteur/shaders/code.js');
const { lireSecondes } = require('../../moteur/minutage.js');

const NOM = /^[a-z0-9-]+$/;
const BALISE = /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const CALQUES = ['avant', 'arriere'];

/** charger(nom) -> recette JSON (projet d'abord, puis bibliothèque) | null ; lève une ErreurRecette si le JSON est cassé. */
function chargeurRecettes(projet, bibliotheque) {
  const cache = new Map();
  const dossiers = [[path.join(projet, 'effets'), 'du projet'], [bibliotheque, 'de la bibliothèque']];
  return (nom) => {
    if (!NOM.test(nom)) throw R.ErreurRecette('effet-invalide', `Nom d'effet « ${nom} » invalide (minuscules, chiffres, tirets).`);
    if (cache.has(nom)) return cache.get(nom);
    let recette = null;
    for (const [dossier, ou] of dossiers) {
      const fichier = path.join(dossier, `${nom}.json`);
      if (!fs.existsSync(fichier)) continue;
      try { recette = JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch (e) {
        throw R.ErreurRecette('effet-invalide', `Effet « ${nom} » : le fichier « effets/${nom}.json » ${ou} n'est pas un JSON valide (${e.message}).`);
      }
      break;
    }
    cache.set(nom, recette);
    return recette;
  };
}

/** Hachage FNV-1a 32 bits : graine par défaut d'un effet. */
function fnv1a(texte) {
  let h = 0x811c9dc5;
  for (const octet of Buffer.from(String(texte), 'utf8')) {
    h ^= octet;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Graine par défaut d'un effet : nom de scène, rang de la balise, nom de recette. */
function graineParDefaut(scene, ordre, nom) {
  return fnv1a(`${scene}|${ordre}|${nom}`);
}

/** Scripts puis commentaires remplacés par des espaces (mêmes longueurs) : comme l'assemblage, qui retire les
 *  scripts puis les commentaires, mais les positions restent celles du texte d'origine. */
function masquer(html) {
  const blanc = (t) => t.replace(/[^\n]/g, ' ');
  return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, blanc).replace(/<!--[\s\S]*?-->/g, blanc);
}

/** balisesAvec(html, attribut) -> [{ ordre, debut, fin, balise, attributs, texte }] : balises portant l'attribut, dans l'ordre du document. */
function balisesAvec(html, attribut) {
  const source = String(html);
  const liste = [];
  for (const m of masquer(source).matchAll(BALISE)) {
    const attributs = lireAttributs(m[2]);
    if (!(attribut in attributs)) continue;
    const fin = m.index + m[0].length;
    liste.push({ ordre: liste.length, debut: m.index, fin, balise: m[1], attributs, texte: source.slice(m.index, fin) });
  }
  return liste;
}

/** balisesEffets(html) -> balises data-effet dans l'ordre du document. */
function balisesEffets(html) {
  return balisesAvec(html, 'data-effet');
}

const ATTRIBUT_EN_PLACE = /(\s*)([^\s"'=<>/]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?/g;
const echapperAttribut = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * reecrireBalise('<div data-effet="x" …>', { 'data-reglages': 'nombre: 3', 'data-graine': null }) -> texte
 * Attribut présent : remplacé à sa place (guillemets doubles) ou retiré avec l'espace qui le précède ;
 * absent : ajouté en fin de balise. Les autres attributs, les retours à la ligne et « /> » restent tels quels.
 */
function reecrireBalise(texte, changements) {
  const m = /^<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>$/.exec(texte);
  if (!m) throw new Error(`Balise illisible : ${texte.slice(0, 60)}`);
  const fermante = (/\s*\/\s*$/.exec(m[2]) || [''])[0];
  let attributs = fermante ? m[2].slice(0, -fermante.length) : m[2];
  const restants = new Map(Object.entries(changements));
  attributs = attributs.replace(ATTRIBUT_EN_PLACE, (tout, espace, nom) => {
    const cle = nom.toLowerCase();
    if (!restants.has(cle)) return tout;
    const v = restants.get(cle);
    restants.delete(cle);
    return v === null ? '' : `${espace || ' '}${cle}="${echapperAttribut(v)}"`;
  });
  for (const [nom, v] of restants) if (v !== null) attributs += ` ${nom}="${echapperAttribut(v)}"`;
  return `<${m[1]}${attributs}${fermante}>`;
}

/** modifierEffet(html, ordre, changements) -> html, ou null si la scène n'a pas de balise data-effet de ce rang. */
function modifierEffet(html, ordre, changements) {
  const b = balisesEffets(html)[ordre];
  if (!b) return null;
  return html.slice(0, b.debut) + reecrireBalise(b.texte, changements) + html.slice(b.fin);
}

/**
 * preparerEffets(html, { scene, projet, bibliotheque, charte, premierIndex, dureeTemps, chargerShader, milieu })
 * chargerShader : chargeurShaders (scripts/lib/shaders.js), pour les modules des recettes.
 * milieu : la scène a un milieu valide (data-milieu ; P5c).
 * dureeTemps : secondes par temps musical (tempo du déroulé), pour un data-dur écrit en « t ».
 * -> { html, effets: [{ scene, ordre, calque, ancre, cible, effet }], erreurs: [{ regle, gravite, scene, element?, message }],
 *    modules: { nom: { json, code } } }
 * ordre : position de la balise parmi les data-effet de la scène (erreurs comprises).
 */
function preparerEffets(html, { scene, projet, bibliotheque, charte = {}, premierIndex = 0, dureeTemps = null, chargerShader = null, milieu = false }) {
  const effets = [];
  const erreurs = [];
  const modules = {};
  const source = String(html).replace(/<!--[\s\S]*?-->/g, '');
  const ids = new Set();
  for (const m of source.matchAll(BALISE)) {
    const a = lireAttributs(m[2]);
    if (a.id) ids.add(a.id);
  }
  const charger = chargeurRecettes(projet, bibliotheque);
  let ordre = 0;

  const sortie = source.replace(BALISE, (tout, balise, texteAttributs) => {
    const a = lireAttributs(texteAttributs);
    if (!('data-effet' in a)) return tout;
    const position = ordre++;
    const fermante = /\/\s*$/.test(texteAttributs) ? ' /' : '';
    const attributs = texteAttributs.replace(/\s*\/\s*$/, '');
    const element = a.id || undefined;
    const signaler = (liste) => {
      liste.forEach(({ regle, message }) => erreurs.push({ regle, gravite: 'erreur', scene, ...(element ? { element } : {}), message: `Scène « ${scene} » : ${message}` }));
      return `<${balise}${attributs} data-pm-effet-erreur="${echapperHTML(liste.map((e) => e.message).join(' '))}"${fermante}>`;
    };

    const nom = a['data-effet'].trim();
    const calque = (a['data-calque'] || 'avant').trim();
    if (!CALQUES.includes(calque)) return signaler([{ regle: 'effet-invalide', message: `data-calque « ${calque} » : avant ou arriere.` }]);
    let ancre = null;
    if (a['data-ancre'] !== undefined) {
      const m = /^#([A-Za-z0-9_-]+)$/.exec(a['data-ancre'].trim());
      if (!m || !ids.has(m[1])) return signaler([{ regle: 'ancre-introuvable', message: `data-ancre « ${a['data-ancre']} » ne désigne aucun élément de la scène (forme attendue : #id).` }]);
      ancre = m[1];
    }
    let cible = null;
    if (a['data-cible'] !== undefined) {
      const m = /^#([A-Za-z0-9_-]+)$/.exec(a['data-cible'].trim());
      if (!m || !ids.has(m[1])) return signaler([{ regle: 'cible-introuvable', message: `data-cible « ${a['data-cible']} » ne désigne aucun élément de la scène (forme attendue : #id).` }]);
      cible = m[1];
    }
    let graine = graineParDefaut(scene, position, nom);
    if (a['data-graine'] !== undefined) {
      if (!/^\d+$/.test(a['data-graine'].trim())) return signaler([{ regle: 'effet-invalide', message: `data-graine « ${a['data-graine']} » : nombre entier attendu.` }]);
      graine = Number(a['data-graine'].trim()) >>> 0;
    }
    // Durée illisible ou sans tempo : 1 s, comme le minutage (qui signale l'erreur).
    const lu = lireSecondes(String(a['data-dur'] || ''), dureeTemps);
    const dur = lu.erreur ? 1 : lu.valeur;

    let compile;
    try {
      compile = R.compiler(R.resoudre(nom, charger), { reglages: a['data-reglages'] || '', charte, dur, graine });
    } catch (e) {
      if (!e.regle) throw e;
      compile = { ok: false, erreurs: [{ regle: e.regle, message: e.message }] };
    }
    if (!compile.ok) return signaler(compile.erreurs);
    // Milieu (P5c) : une recette de milieu se pose avec data-milieu ; un effet couplé demande un milieu dans sa scène.
    if (compile.effet.milieu) {
      return signaler([{ regle: 'milieu-invalide', message: `« ${nom} » est un milieu fluide : le poser avec data-milieu="${nom}" (un par scène), pas data-effet.` }]);
    }
    const couplage = compile.effet.couplage;
    if (couplage && (couplage.vent || couplage.injecte) && !milieu) {
      return signaler([{ regle: 'couplage-sans-milieu', message: `l'effet « ${nom} » est couplé au milieu de la scène (force « milieu », « structure.milieu » ou « injecte »), mais la scène n'en a pas : ajouter un milieu (<div data-milieu="air"></div>, un par scène), ou retirer le couplage.` }]);
    }
    // Fragmentation : un élément à photographier (ancre), un élément d'arrivée (cible).
    const ems = compile.effet.emetteurs;
    if (ems.some((em) => em.cible && em.cible.source === 'cible') && !cible) {
      return signaler([{ regle: 'metamorphose-sans-cible', message: `l'effet « ${nom} » transforme son ancre en un autre élément : data-cible="#id" attendu (l'élément d'arrivée, dans la même scène).` }]);
    }
    if (ems.some((em) => em.pixels || em.eclats || (em.cible && em.cible.source === 'ancre') || (em.structure && em.structure.apparence.source === 'ancre')) && !ancre) {
      return signaler([{ regle: 'ancre-vide', message: `l'effet « ${nom} » photographie son ancre : data-ancre="#id" attendu (rien à photographier sans elle).` }]);
    }
    // Structures : chaque élément visé par une attache « #id » est dans la scène.
    const absents = (compile.effet.elements || []).filter((id) => !ids.has(id));
    if (absents.length) {
      return signaler([{ regle: 'attache-introuvable', message: `l'effet « ${nom} » attache une structure à « #${absents[0]} », absent de la scène (attendu : #id d'un élément de la même scène, ou « ancre »).` }]);
    }

    // Modules WGSL : code assemblé avec les réglages de la recette (S.attacherModules), sources gardées pour l'atelier.
    if (ems.some((em) => em.modules && (em.modules.force || em.modules.couleur || em.modules.forme))) {
      const chargerModule = (n) => { try { return chargerShader ? chargerShader(n) : null; } catch { return null; } };
      const fautes = S.attacherModules(compile.effet, chargerModule, charte);
      if (fautes.length) return signaler(fautes);
      ems.forEach((em) => S.CLES_MODULES.forEach((k) => {
        const n = em.modules[k];
        if (n) { const src = chargerModule(n); modules[n] = { json: src.json, code: src.code }; }
      }));
    }

    for (const em of compile.effet.emetteurs) {
      if (!em.rendu.textureFichier) continue;
      const absolu = cheminDansProjet(projet, em.rendu.textureFichier);
      if (!absolu || !fs.existsSync(absolu)) {
        return signaler([{ regle: 'fichier-introuvable', message: `texture « ${em.rendu.textureFichier} » de l'effet « ${nom} » introuvable.` }]);
      }
      em.rendu.textureImage = versDataURI(absolu);
    }

    const index = premierIndex + effets.length;
    effets.push({ scene, ordre: position, calque, ancre, cible, effet: compile.effet });
    return `<${balise}${attributs} data-pm-effet="${index}"${fermante}>`;
  });

  return { html: sortie, effets, erreurs, modules };
}

module.exports = { chargeurRecettes, fnv1a, graineParDefaut, preparerEffets, balisesAvec, balisesEffets, reecrireBalise, modifierEffet };
