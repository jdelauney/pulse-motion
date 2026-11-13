#!/usr/bin/env node
'use strict';
/* Pulse Motion – styles personnels (~/.pulse-motion/styles/<nom>/, ou $PULSE_MOTION_DOSSIER/styles/<nom>/).
 *
 *   node scripts/style-perso.js nouveau <nom> [--depuis <style>] [--emprunts <style>,<style>]   squelette repris d'un style
 *                                                    (sa base notée dans identite.json, sa fiche copiée dans guide.md)
 *   node scripts/style-perso.js verifier <nom>       contrat, contrôles et rendu (16:9, 1:1, 4:5, 9:16, tons) ;
 *                                                    avertit pour un guide hors format et au-delà de 5 changements par tour ;
 *                                                    avis police-trop-vue (spec S11, 5.5), levé par un changement noté --charte
 *   node scripts/style-perso.js planche <nom> [--scenes titre,liste] [--ratio 16:9] [--ton clair|sombre] [--textes exemple|maximum]
 *                                             [--temoin | --avec-base] [--ouvrir]
 *   node scripts/style-perso.js noter <nom> <section> "<avant>" "<après>" "<pourquoi>" [--nouveau-tour] [--charte]
 *                                                    un changement au journal du style (changements.json)
 *   node scripts/style-perso.js base <nom> [--a-jour]   la base du style a-t-elle changé ? --a-jour : sa nouvelle version est reprise
 *
 * Résumé JSON ; code 1 avec { ok: false, message } en cas d'échec.
 * Trois groupes de réglages, cinq changements par tour, base à gauche et journal des changements : idées et tableau de
 * lemo-opuscar (MY-STYLES.md § 1 à § 4, MIT, © 2026 LemoLab), adaptés ; voir THIRD-PARTY-NOTICES.md.
 */
const fs = require('node:fs');
const path = require('node:path');
const { trouverStyle, messageStyleInconnu, verifierStyle, marquerVerifie, lireJSON, LIVRES, RACINE, dossierPersonnel,
  empreinteBase, ficheDuStyle, baseAChanger, MARQUE_BASE, CHANGEMENTS } = require('./styles.js');
const { NOM_STYLE, TYPES, SECTIONS_FICHE } = require('./lib/contrat.js');
const { projetEssai } = require('./lib/projet-essai.js');
const { verifierRendu } = require('./lib/rendu-style.js');
const { verifierFiche } = require('./lib/fiche-style.js');
const { controler } = require('./controler.js');
const { exporterVideo } = require('./exporter.js');
const { ouvrirNavigateur } = require('./apercu.js');

const dossierStylesPerso = () => path.join(dossierPersonnel(), 'styles');
const versionPlugin = () => { try { return JSON.parse(fs.readFileSync(path.join(RACINE, '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch { return 'inconnue'; } };
/** Au plus 5 changements par tour (un changement imposé par la charte ne compte pas). */
const CHANGEMENTS_MAX = 5;
const LIGNE_ADAPTE = /^Adapté du style « [^»]* »\.?\n\n?/m;

/** guide.md d'un style personnel : la fiche de sa base, entière, titrée à son nom, avec « Adapté du style « <base> » » dessous. */
function guideAdapte(fiche, nom, depuis) {
  const texte = String(fiche || '# Style\n\n## L\'essentiel\n').replace(/\r\n/g, '\n')
    .replace(/^- Repris du style « [^»]* » : .*\n\n?/gm, '') // mention des versions d'avant
    .replace(LIGNE_ADAPTE, ''); // une seule mention de la base : celle d'un style personnel repris est remplacée
  return texte.replace(/^# .*\n\n?/, `# Style « ${nom} »\n\nAdapté du style « ${depuis} ».\n\n`);
}

function nouveauStyle({ nom, depuis = 'clair-pedagogique', emprunts = [] }) {
  if (!NOM_STYLE.test(nom || '')) return { ok: false, message: 'Nom de style : seulement des lettres minuscules, des chiffres et des tirets (ex. papercraft).' };
  if (fs.existsSync(path.join(LIVRES, nom))) return { ok: false, message: `« ${nom} » est le nom d'un style livré : choisissez un autre nom.` };
  const cible = path.join(dossierStylesPerso(), nom);
  if (fs.existsSync(cible)) return { ok: false, message: `Le style personnel « ${nom} » existe déjà (${cible}) : choisissez un autre nom, ou modifiez-le directement.` };
  const base = trouverStyle(depuis);
  if (!base) return { ok: false, message: messageStyleInconnu(depuis) };
  const inconnu = emprunts.find((e) => !trouverStyle(e));
  if (inconnu) return { ok: false, message: messageStyleInconnu(inconnu) };
  try {
    fs.mkdirSync(dossierStylesPerso(), { recursive: true });
    fs.cpSync(base.dossier, cible, { recursive: true });
    // Ce qui appartient à la base personnelle reprise (sa vérification, son journal, sa marque) ne la suit pas.
    for (const f of ['.verifie.json', MARQUE_BASE, CHANGEMENTS]) fs.rmSync(path.join(cible, f), { force: true });
    for (const f of ['catalogue.json', 'identite.json']) {
      const j = lireJSON(path.join(cible, f)) || {};
      j.style = nom;
      // La base : son nom, l'empreinte de sa fiche et de ses fichiers, la version du plugin (spec 5.5 point 6).
      if (f === 'identite.json') j.base = { style: depuis, empreinte: empreinteBase(base), versionPlugin: versionPlugin(), ...(emprunts.length ? { emprunts } : {}) };
      fs.writeFileSync(path.join(cible, f), JSON.stringify(j, null, 2), 'utf8');
    }
    const source = ficheDuStyle(base);
    fs.writeFileSync(path.join(cible, 'guide.md'), guideAdapte(fs.existsSync(source) ? fs.readFileSync(source, 'utf8') : null, nom, depuis), 'utf8');
  } catch (e) {
    try { fs.rmSync(cible, { recursive: true, force: true }); } catch { /* rien à nettoyer */ }
    return { ok: false, message: `Le style « ${nom} » n'a pas pu être créé (${e.code || e.message}) : vérifiez les droits de ${dossierStylesPerso()}, ou indiquez un autre dossier avec la variable PULSE_MOTION_DOSSIER.` };
  }
  return { ok: true, nom, dossier: cible, depuis };
}

/** Journal des changements d'un style personnel : [{ tour, section, avant, apres, pourquoi, date, charte? }] (absent : []). */
function lireChangements(dossier) {
  const f = path.join(dossier, CHANGEMENTS);
  if (!fs.existsSync(f)) return [];
  const j = lireJSON(f);
  if (!Array.isArray(j)) throw new Error(`${CHANGEMENTS} illisible : une liste de changements est attendue.`);
  return j;
}

/** Avertissements du journal : un tour qui dépasse 5 changements (ceux imposés par la charte ne comptent pas). */
function verifierChangements(dossier) {
  let liste;
  try { liste = lireChangements(dossier); } catch (e) { return [`${e.message}`]; }
  const parTour = new Map();
  for (const c of liste) if (c && !c.charte) parTour.set(c.tour, (parTour.get(c.tour) || 0) + 1);
  return [...parTour].filter(([, n]) => n > CHANGEMENTS_MAX)
    .map(([tour, n]) => `${CHANGEMENTS} : le tour ${tour} compte ${n} changements, ${CHANGEMENTS_MAX} au plus par tour (hors charte) ; garder les autres pour un tour suivant.`);
}

/** Avertissements du guide : fiche aux 11 sections (spec 5.1), ligne « Adapté du style » si la base est notée. */
function verifierGuide(dossier) {
  const f = path.join(dossier, 'guide.md');
  if (!fs.existsSync(f)) return ['guide.md absent : la fiche du style (11 sections) est à écrire.'];
  const texte = fs.readFileSync(f, 'utf8');
  const identite = lireJSON(path.join(dossier, 'identite.json')) || {};
  const avert = verifierFiche(texte, { dossierStyle: dossier, identite }).map((e) => `guide.md : ${e}`);
  if (identite.base && !LIGNE_ADAPTE.test(texte.replace(/\r\n/g, '\n'))) avert.push(`guide.md : la ligne « Adapté du style « ${identite.base.style} » » manque sous le titre.`);
  return avert;
}

async function verifierStylePerso({ nom, navigateur }) {
  const st = trouverStyle(nom);
  if (!st) return { ok: false, erreurs: [], avertissements: [], controle: [], rendu: [], renduVerifie: false, message: messageStyleInconnu(nom) };
  const contrat = verifierStyle(st.dossier);
  // Guide et journal : des avertissements, jamais des erreurs (un style personnel d'avant reste valide).
  const avertissements = [...contrat.avertissements, ...(st.personnel ? [...verifierGuide(st.dossier), ...verifierChangements(st.dossier)] : [])];
  // Avis (spec S11, 5.5) : une police trop vue dans un style personnel, sauf si la charte de la personne l'impose ; jamais bloquant.
  const avis = st.personnel ? require('./lib/polices-styles.js').policeTropVue(st.dossier) : [];
  if (!contrat.ok) return { ok: false, erreurs: contrat.erreurs, avertissements, avis, controle: [], rendu: [], renduVerifie: false, message: 'Contrat non respecté : corriger d\'abord les erreurs (le rendu sera vérifié ensuite).' };
  const projet = projetEssai({ dossierStyle: st.dossier });
  let controle;
  try { controle = controler({ dossier: projet, ecrire: false }).problemes.map((p) => p.message); } finally { fs.rmSync(projet, { recursive: true, force: true }); }
  const rendu = await verifierRendu({ dossierStyle: st.dossier, navigateur });
  const ok = controle.length === 0 && rendu.ok !== false;
  if (ok && st.personnel) marquerVerifie(st.dossier);
  return {
    ok,
    erreurs: [], avertissements, avis, controle, rendu: rendu.problemes, renduVerifie: rendu.ok !== null,
    ...(rendu.message ? { message: rendu.message } : {}),
  };
}

/** Section d'une fiche : « 3 », « § 3 », « L'essentiel » ou son titre exact -> « § 3 » (ou « L'essentiel ») ; sinon null. */
function nomSection(section) {
  const s = String(section || '').trim();
  if (s === SECTIONS_FICHE[0]) return s;
  const n = (/^(?:§\s*)?(\d{1,2})\b/.exec(s) || [])[1];
  if (n && Number(n) >= 1 && Number(n) <= 11) return `§ ${Number(n)}`;
  const i = SECTIONS_FICHE.indexOf(s);
  return i > 0 ? `§ ${i}` : null;
}

/**
 * Ajoute un changement au journal du style (spec 5.5 point 4). tour : le dernier (1 s'il n'y en a pas) ; nouveauTour : le
 * suivant. charte : changement imposé par la charte (une police de marque), hors du compte des 5.
 * -> { ok, tour, changements (comptés dans ce tour), avertissement? }
 */
function noterChangement({ nom, section, avant, apres, pourquoi, nouveauTour = false, charte = false, date = new Date().toISOString().slice(0, 10) }) {
  const st = trouverStyle(nom);
  if (!st) return { ok: false, message: messageStyleInconnu(nom) };
  if (!st.personnel) return { ok: false, message: `« ${nom} » est un style livré : on note les changements d'un style personnel.` };
  const sec = nomSection(section);
  if (!sec) return { ok: false, message: `Section « ${section} » inconnue : de « 1 » à « 11 » (ou « L'essentiel »), comme les sections de la fiche.` };
  if (![avant, apres, pourquoi].every((x) => typeof x === 'string' && x.trim())) return { ok: false, message: 'Un changement se note avec ce qu\'il y avait avant, ce qu\'il y a après et pourquoi.' };
  let liste;
  try { liste = lireChangements(st.dossier); } catch (e) { return { ok: false, message: e.message }; }
  const dernier = liste.reduce((m, c) => Math.max(m, Number(c && c.tour) || 0), 0);
  const tour = nouveauTour || !dernier ? dernier + 1 : dernier;
  liste.push({ tour, section: sec, avant: avant.trim(), apres: apres.trim(), pourquoi: pourquoi.trim(), date, ...(charte ? { charte: true } : {}) });
  try { fs.writeFileSync(path.join(st.dossier, CHANGEMENTS), JSON.stringify(liste, null, 2), 'utf8'); } catch (e) {
    return { ok: false, message: `Le journal des changements n'a pas pu être écrit (${e.code || e.message}).` };
  }
  const compte = liste.filter((c) => c.tour === tour && !c.charte).length;
  return { ok: true, tour, changements: compte, ...(compte > CHANGEMENTS_MAX ? { avertissement: `${compte} changements dans le tour ${tour} : ${CHANGEMENTS_MAX} au plus ; garder les autres pour le tour suivant.` } : {}) };
}

/** Base d'un style personnel : { ok, base, versionPlugin, versionActuelle, modifiee } ; aJour : la base actuelle est reprise. */
function baseDuStyle({ nom, aJour = false }) {
  const st = trouverStyle(nom);
  if (!st || !st.personnel) return { ok: false, message: st ? `« ${nom} » est un style livré : il n'a pas de base.` : messageStyleInconnu(nom) };
  const fichier = path.join(st.dossier, 'identite.json');
  const identite = lireJSON(fichier) || {};
  const b = identite.base;
  if (!b || typeof b.style !== 'string') return { ok: false, message: `Le style « ${nom} » n'a pas de base notée (créé avec une version plus ancienne de Pulse Motion).` };
  const stBase = trouverStyle(b.style);
  if (!stBase) return { ok: false, message: `La base « ${b.style} » du style « ${nom} » est introuvable.` };
  const actuelle = empreinteBase(stBase);
  const resultat = { ok: true, base: b.style, versionPlugin: b.versionPlugin, versionActuelle: versionPlugin(), modifiee: actuelle !== b.empreinte };
  if (!aJour) return resultat;
  identite.base = { ...b, empreinte: actuelle, versionPlugin: versionPlugin() };
  fs.writeFileSync(fichier, JSON.stringify(identite, null, 2), 'utf8');
  fs.rmSync(path.join(st.dossier, MARQUE_BASE), { force: true });
  return { ...resultat, modifiee: false, aJour: true };
}

const RATIOS = ['16:9', '1:1', '4:5', '9:16'];
const TONS = ['clair', 'sombre'];
const TEXTES = ['exemple', 'maximum'];
const e = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Planche du témoin : A et B d'un style, ou de la base (à gauche) et du style (à droite). */
function pageTemoin(colonnes) {
  const rangees = ['A', 'B'].map((k) => `<tr><th>${k === 'A' ? 'A · titre' : 'B · chiffre'}</th>${colonnes.map((c) => `<td><img src="${e(path.basename(c.images[k]))}" alt="${e(`${c.titre}, image ${k}`)}"></td>`).join('')}</tr>`).join('\n');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Planche du témoin</title>
<style>body{margin:24px;font:15px system-ui,sans-serif;background:#f4f4f5;color:#222}table{border-collapse:separate;border-spacing:12px;width:100%;table-layout:fixed}th{font-weight:600;text-align:left;vertical-align:top}thead th{font-size:17px}tbody th{width:7em}img{width:100%;border-radius:6px;box-shadow:0 2px 8px rgb(0 0 0/.15)}</style>
</head><body><h1>Planche du témoin « La chaîne du froid »</h1>
<table><thead><tr><th></th>${colonnes.map((c) => `<th class="colonne">${e(c.titre)}</th>`).join('')}</tr></thead>
<tbody>
${rangees}
</tbody></table></body></html>`;
}

async function plancheTemoin({ st, nom, avecBase, ratio, ton, ouvrir, navigateur, imagesTemoin, ouvrirFichier }) {
  const rendre = imagesTemoin || require('./lib/temoin.js').imagesTemoin;
  let base = null;
  if (avecBase) {
    const b = (lireJSON(path.join(st.dossier, 'identite.json')) || {}).base;
    if (!b || typeof b.style !== 'string') return { ok: false, message: `Le style « ${nom} » n'a pas de base notée : la planche avec la base n'est pas possible (planche --temoin montre le style seul).` };
    base = trouverStyle(b.style);
    if (!base) return { ok: false, message: messageStyleInconnu(b.style) };
    const v = verifierStyle(base.dossier);
    if (!v.ok) return { ok: false, message: `La base « ${b.style} » n'est pas conforme : ${v.erreurs.join(' ')}` };
  }
  const sortie = path.join(dossierPersonnel(), 'essais', nom);
  try {
    fs.rmSync(sortie, { recursive: true, force: true });
    fs.mkdirSync(sortie, { recursive: true });
  } catch (err) {
    return { ok: false, message: `La planche n'a pas pu être rangée dans ${path.dirname(sortie)} (${err.code || err.message}) : vérifiez les droits de ce dossier, ou indiquez un autre dossier avec la variable PULSE_MOTION_DOSSIER.` };
  }
  const colonnes = [];
  // Mêmes textes, mêmes instants, même format pour les deux colonnes : la base à gauche, le style à droite.
  for (const [s, prefixe, titre] of [...(base ? [[base, 'base-', `Base : ${base.nom}`]] : []), [st, '', base ? `Votre style : ${nom}` : `Style : ${nom}`]]) {
    const r = await rendre({ dossierStyle: s.dossier, sortie, prefixe, ratio, ton, navigateur });
    if (!r.ok) return { ok: false, message: r.message };
    colonnes.push({ titre, images: r.images });
  }
  const fichier = path.join(sortie, 'planche.html');
  fs.writeFileSync(fichier, pageTemoin(colonnes), 'utf8');
  if (ouvrir) ouvrirFichier(fichier);
  return { ok: true, fichier, images: colonnes.flatMap((c) => [c.images.A, c.images.B]), ...(base ? { base: base.nom } : {}) };
}

/** textes : 'exemple' (vraies phrases, par défaut) ou 'maximum' (chaque texte à sa longueur maximale).
 * temoin : images A et B du témoin ; avecBase : celles de la base à gauche et du style à droite (spec 5.5 et 5.6). */
async function plancheStyle({ nom, scenes = ['titre', 'liste'], ratio = '16:9', ton, textes = 'exemple', temoin = false, avecBase = false, ouvrir = false, navigateur, exporter = exporterVideo, imagesTemoin, ouvrirFichier = ouvrirNavigateur }) {
  const st = trouverStyle(nom);
  if (!st) return { ok: false, message: messageStyleInconnu(nom) };
  if (!RATIOS.includes(ratio)) return { ok: false, message: `Format « ${ratio} » inconnu : 16:9, 1:1, 4:5 ou 9:16.` };
  if (ton !== undefined && !TONS.includes(ton)) return { ok: false, message: `Ton « ${ton} » inconnu : clair ou sombre.` };
  if (!TEXTES.includes(textes)) return { ok: false, message: `Textes « ${textes} » inconnus : exemple ou maximum.` };
  const inconnus = scenes.filter((t) => !TYPES[t]);
  if (inconnus.length) return { ok: false, message: `Type de scène inconnu : ${inconnus.join(', ')}. Types : ${Object.keys(TYPES).join(', ')}.` };
  const contrat = verifierStyle(st.dossier);
  if (!contrat.ok) return { ok: false, message: `Le style « ${nom} » n'est pas encore conforme : ${contrat.erreurs.join(' ')}` };
  if (temoin || avecBase) return plancheTemoin({ st, nom, avecBase, ratio, ton, ouvrir, navigateur, imagesTemoin, ouvrirFichier });
  const projet = projetEssai({ dossierStyle: st.dossier, ratio, ton, types: scenes, textes });
  try {
    const r = await exporter({ dossier: projet, planche: scenes, navigateur });
    if (!r.ok) return { ok: false, message: r.message };
    const sortie = path.join(dossierPersonnel(), 'essais', nom);
    try {
      fs.rmSync(sortie, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(sortie), { recursive: true });
      fs.cpSync(path.join(projet, 'sortie', 'planche'), sortie, { recursive: true });
    } catch (err) {
      return { ok: false, message: `La planche n'a pas pu être rangée dans ${path.dirname(sortie)} (${err.code || err.message}) : vérifiez les droits de ce dossier, ou indiquez un autre dossier avec la variable PULSE_MOTION_DOSSIER.` };
    }
    const fichier = path.join(sortie, 'planche.html');
    if (ouvrir) ouvrirFichier(fichier);
    return { ok: true, fichier, images: fs.readdirSync(sortie).filter((f) => f.endsWith('.png')).sort().map((f) => path.join(sortie, f)) };
  } finally {
    fs.rmSync(projet, { recursive: true, force: true });
  }
}

const OPTIONS_A_VALEUR = ['--depuis', '--scenes', '--ratio', '--ton', '--textes', '--emprunts'];

if (require.main === module) {
  const args = process.argv.slice(2);
  const valeur = (o) => { const i = args.indexOf(o); return i >= 0 ? args[i + 1] : undefined; };
  const libres = args.filter((a, i) => !a.startsWith('--') && !OPTIONS_A_VALEUR.includes(args[i - 1]));
  const [action, nom] = libres;
  const fini = (r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); };
  const echec = (err) => fini({ ok: false, message: err.message });
  const liste = (o) => (valeur(o) ? valeur(o).split(',').filter(Boolean) : undefined);
  if (action === 'nouveau') fini(nouveauStyle({ nom, depuis: valeur('--depuis'), emprunts: liste('--emprunts') }));
  else if (action === 'verifier') verifierStylePerso({ nom }).then(fini, echec);
  else if (action === 'planche') {
    plancheStyle({ nom, scenes: liste('--scenes'), ratio: valeur('--ratio'), ton: valeur('--ton'), textes: valeur('--textes'),
      temoin: args.includes('--temoin'), avecBase: args.includes('--avec-base'), ouvrir: args.includes('--ouvrir') }).then(fini, echec);
  } else if (action === 'noter') {
    const [, , section, avant, apres, pourquoi] = libres;
    fini(noterChangement({ nom, section, avant, apres, pourquoi, nouveauTour: args.includes('--nouveau-tour'), charte: args.includes('--charte') }));
  } else if (action === 'base') fini(baseDuStyle({ nom, aJour: args.includes('--a-jour') }));
  else {
    console.error('Usage : pulse-motion style nouveau <nom> [--depuis <style>] [--emprunts <style>,…] | verifier <nom> | planche <nom> [--scenes titre,liste] [--ratio 16:9|1:1|4:5|9:16] [--ton clair|sombre] [--textes exemple|maximum] [--temoin | --avec-base] [--ouvrir] | noter <nom> <section> "<avant>" "<après>" "<pourquoi>" [--nouveau-tour] [--charte] | base <nom> [--a-jour]');
    process.exit(2);
  }
}

module.exports = { nouveauStyle, verifierStylePerso, plancheStyle, noterChangement, baseDuStyle, verifierChangements, verifierGuide, guideAdapte, CHANGEMENTS_MAX, baseAChanger };
