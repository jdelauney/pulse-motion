'use strict';
/* Pulse Motion – fiche de style en 11 sections (spec Styles et réalisation, 5.1) : découpe, extrait pour
 * l'animateur, vérification des titres, des budgets et des noms cités (numéros du dictionnaire, classes, sons,
 * transitions, shaders). Sert aux fiches des styles livrés (references/styles/<style>.md) et aux guide.md des
 * styles personnels.
 *
 * Format adapté du gabarit de lemo-opuscar (styles/_template/STYLE.md, MIT, © 2026 LemoLab), traduit et adapté. */
const fs = require('node:fs');
const path = require('node:path');
const { SECTIONS_FICHE, SECTIONS_ANIMATEUR, TYPES_ENTREE } = require('./contrat.js');

const RACINE = path.resolve(__dirname, '..', '..');
const FICHE_MAX = 8000;
const EXTRAIT_MAX = 4000;
const octets = (t) => Buffer.byteLength(t, 'utf8');

/** -> { entete, sections: [{ titre, texte }] } ; texte d'une section : son titre « ## … » compris. */
function decouper(texte) {
  const brut = String(texte || '').replace(/\r\n/g, '\n');
  const morceaux = brut.split(/^(?=## )/m);
  const entete = morceaux[0].startsWith('## ') ? '' : morceaux.shift();
  return {
    entete,
    sections: morceaux.map((m) => ({ titre: m.split('\n', 1)[0].slice(3).trim(), texte: m })),
  };
}

/**
 * Extrait lu par l'animateur : en-tête, L'essentiel, § 2, § 4, § 5, § 8, § 9, § 10.
 * Une fiche à l'ancien format (une de ces sections manque) est rendue entière : rien n'est perdu.
 */
function extraitAnimateur(texte) {
  const { entete, sections } = decouper(texte);
  const choisies = SECTIONS_ANIMATEUR.map((t) => sections.find((s) => s.titre === t));
  if (choisies.some((s) => !s)) return String(texte || '');
  return entete + choisies.map((s) => s.texte.replace(/\n*$/, '\n')).join('\n');
}

/** Corps d'une section (sans son titre), ou '' si elle manque. */
function section(texte, titre) {
  const s = decouper(texte).sections.find((x) => x.titre === titre);
  return s ? s.texte.slice(s.texte.indexOf('\n') + 1) : '';
}

const codes = (texte) => [...String(texte).matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim());
const nomNu = (c) => /^[a-z][a-z0-9-]*$/.test(c) && !c.startsWith('data-');

/** Classes déclarées dans une feuille CSS (commentaires exclus). */
function classesCSS(css) {
  const sans = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
  return new Set([...sans.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]));
}

/** Classes citées dans un texte : « .rond », « .rond.accent », « .decor + .galet ». */
function classesCitees(texte) {
  const vues = new Set();
  for (const c of codes(texte)) {
    for (const m of c.matchAll(/(?:^|[^\w.])((?:\.[a-z][\w-]*)+)/g)) m[1].split('.').filter(Boolean).forEach((x) => vues.add(x));
  }
  return vues;
}

/** Noms connus du plugin, lus à la demande. */
function nomsConnus() {
  const lire = (...p) => JSON.parse(fs.readFileSync(path.join(RACINE, ...p), 'utf8'));
  const catalogue = require('../../moteur/synthe/catalogue.js');
  const { TRANSITIONS } = require('../../moteur/transitions.js');
  const liste = (dossier, ext) => { try { return fs.readdirSync(path.join(RACINE, dossier)).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)); } catch { return []; } };
  return {
    numeros: new Set(Object.keys(lire('references', 'mouvements', 'numeros.json'))),
    bruitages: catalogue.BRUITAGES,
    ambiances: Object.keys(catalogue.AMBIANCES),
    sonsTransition: catalogue.SONS_TRANSITION,
    transitions: TRANSITIONS.filter((t) => t !== 'aucune'),
    shaders: liste('shaders', '.json'),
    modules: liste(path.join('moteur', 'medium'), '.js'),
    classesMoteur: new Set([...classesCSS(fs.readFileSync(path.join(RACINE, 'moteur', 'mouvements.css'), 'utf8')), ...classesCSS(fs.readFileSync(path.join(RACINE, 'moteur', 'base.css'), 'utf8'))]),
  };
}

/** Gestes du § 8 : [{ nom, recette, convient: [..] }] (lignes « - **Nom.** … *Recette :* … *Convient à :* a ; b ; c. »). */
function gestes(texte) {
  return section(texte, SECTIONS_FICHE[8]).split('\n').filter((l) => /^- \*\*/.test(l)).map((l) => {
    const nom = (/^- \*\*([^*]+?)\.?\*\*/.exec(l) || [])[1] || '';
    const recette = (/\*Recette :\*\s*(.+?)\s*\*Convient à :\*/.exec(l) || [])[1] || '';
    const convient = ((/\*Convient à :\*\s*(.+?)\.?\s*$/.exec(l) || [])[1] || '').split(' ; ').map((x) => x.trim()).filter(Boolean);
    return { nom, recette, convient };
  });
}

/**
 * Vérifie une fiche. options : { dossierStyle, identite } (classes du style, table des bruitages).
 * -> liste d'erreurs en français (vide si la fiche est conforme).
 */
function verifierFiche(texte, { dossierStyle, identite } = {}) {
  const erreurs = [];
  const t = String(texte || '').replace(/\r\n/g, '\n');
  const { entete, sections } = decouper(t);
  if (!/^# Style « [a-z0-9-]+ »\n/.test(entete)) erreurs.push('Titre : la fiche commence par « # Style « <nom> » ».');
  if (!/^> .+\n> Sources : .+/m.test(entete)) erreurs.push('En-tête : l\'essence (« > … ») puis la ligne « > Sources : … ».');
  const titres = sections.map((s) => s.titre);
  if (titres.join('|') !== SECTIONS_FICHE.join('|')) erreurs.push(`Sections : ${SECTIONS_FICHE.map((s) => `« ${s} »`).join(', ')}, dans cet ordre (trouvé : ${titres.map((s) => `« ${s} »`).join(', ') || 'aucune'}).`);
  if (octets(t) > FICHE_MAX) erreurs.push(`Fiche de ${octets(t)} octets : ${FICHE_MAX} au plus.`);
  const extrait = extraitAnimateur(t);
  if (octets(extrait) > EXTRAIT_MAX) erreurs.push(`Extrait pour l'animateur de ${octets(extrait)} octets : ${EXTRAIT_MAX} au plus.`);

  const connus = nomsConnus();
  for (const m of t.matchAll(/(?<![\w&])#(\d{3})(?![\w])/g)) {
    if (!connus.numeros.has(m[1])) erreurs.push(`Numéro #${m[1]} : absent du dictionnaire de mouvements.`);
  }
  if (dossierStyle) {
    const classes = new Set([...classesCSS(fs.readFileSync(path.join(dossierStyle, 'style.css'), 'utf8')), ...connus.classesMoteur]);
    for (const c of classesCitees(t)) if (!classes.has(c)) erreurs.push(`Classe .${c} : ni dans style.css ni dans le moteur.`);
  }
  const visuels = new Set([...connus.transitions, ...connus.shaders]);
  for (const titre of [SECTIONS_FICHE[2], SECTIONS_FICHE[6]]) {
    for (const c of codes(section(t, titre)).filter(nomNu)) {
      if (!visuels.has(c)) erreurs.push(`§ ${titre} : « ${c} » n'est ni une transition ni un shader.`);
    }
  }
  const sonores = new Set([...connus.bruitages, ...connus.ambiances, ...TYPES_ENTREE, ...connus.transitions]);
  const sept = section(t, SECTIONS_FICHE[7]);
  for (const c of codes(sept).filter(nomNu)) if (!sonores.has(c)) erreurs.push(`§ 7 : son « ${c} » inconnu.`);
  const son = identite && identite.son;
  if (son && son.bruitages) {
    const transitions = ((identite.mouvement || {}).transitions || []).map((x) => connus.sonsTransition[x]).filter(Boolean);
    const declares = new Set([...Object.values(son.bruitages).filter(Boolean), son.fort, son.matiere, ...transitions].filter(Boolean));
    for (const c of codes(sept).filter((x) => connus.bruitages.includes(x))) {
      if (!declares.has(c)) erreurs.push(`§ 7 : bruitage « ${c} » absent de son.bruitages (ni son fort, ni son d'une transition du style).`);
    }
  }
  if (!/^\| Mouvement \| Ce qu'il exprime \| Peut servir \|$/m.test(section(t, SECTIONS_FICHE[6]))) {
    erreurs.push('§ 6 : un tableau « | Mouvement | Ce qu\'il exprime | Peut servir | ».');
  }
  const g = gestes(t);
  if (g.length < 3) erreurs.push(`§ 8 : ${g.length} geste(s), il en faut au moins 3.`);
  for (const x of g) {
    if (!x.recette) erreurs.push(`§ 8, geste « ${x.nom} » : « *Recette :* » manquante.`);
    if (x.convient.length < 3) erreurs.push(`§ 8, geste « ${x.nom} » : au moins trois « convient à », séparés par « ; ».`);
  }
  return erreurs;
}

module.exports = { decouper, extraitAnimateur, section, gestes, classesCitees, verifierFiche, nomsConnus, FICHE_MAX, EXTRAIT_MAX };
