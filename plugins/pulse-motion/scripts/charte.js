#!/usr/bin/env node
'use strict';
/* Pulse Motion – chartes : enregistrer, lister, appliquer ; proposer des couleurs depuis un logo.
 *
 *   node scripts/charte.js enregistrer <nom> <dossier-du-projet>
 *   node scripts/charte.js liste
 *   node scripts/charte.js appliquer <nom> <dossier-du-projet>
 *   node scripts/charte.js depuis-logo <fichier> [--style <nom>] [--ton clair|sombre]
 *
 * Une charte enregistrée vit dans ~/.pulse-motion/chartes/<nom>/ (charte.json, logo, polices/, glossaire.md).
 * Appliquer la recopie dans charte/ du projet (qui reste autonome) et note son nom et son empreinte :
 * « pulse-motion etat » signale ensuite une charte enregistrée modifiée, sans rien changer seul.
 * Résumé JSON ; code 1 avec { ok: false, message } en cas d'échec.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { dossierPersonnel } = require('./lib/personnel.js');
const { lireDeroule, validerCharte } = require('./lib/deroule.js');
const { cheminDansProjet } = require('./lib/embarquer.js');
const { ajusterContraste } = require('./lib/couleurs.js');
const { sauvegarder } = require('./historique.js');
const { trouverStyle, messageStyleInconnu, lireJSON } = require('./styles.js');
const { couleursLogo, couleursDominantes } = require('./logo.js');
const { lireGlossaire, noterGlossaire } = require('./vocabulaire.js');
const SEUILS = require('./seuils.json');

const NOM = /^[a-z0-9-]+$/;
const MARQUE = '.modele.json';
const dossierChartes = () => path.join(dossierPersonnel(), 'chartes');
const nomRefuse = () => ({ ok: false, message: 'Nom de charte : seulement des lettres minuscules, des chiffres et des tirets (ex. client-dupont).' });

function fichiersDe(dossier, prefixe = '') {
  let liste = [];
  for (const e of fs.readdirSync(path.join(dossier, prefixe), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const relatif = prefixe ? `${prefixe}/${e.name}` : e.name;
    if (e.isDirectory()) liste = liste.concat(fichiersDe(dossier, relatif));
    else if (e.name !== MARQUE) liste.push(relatif);
  }
  return liste;
}

function empreinte(dossier) {
  const h = crypto.createHash('sha256');
  for (const relatif of fichiersDe(dossier)) h.update(relatif).update('\0').update(fs.readFileSync(path.join(dossier, relatif))).update('\0');
  return h.digest('hex');
}

/** renommer, supprimer : fs.renameSync, fs.rmSync (remplaçables dans les essais). */
function enregistrerCharte({ nom, dossier, renommer = fs.renameSync, supprimer = fs.rmSync }) {
  if (!NOM.test(nom || '')) return nomRefuse();
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  const ponctuel = { ...(deroule.charte || {}) };
  delete ponctuel.modele;
  const source = path.join(projet, 'charte');
  let base = {};
  if (fs.existsSync(path.join(source, 'charte.json'))) {
    base = lireJSON(path.join(source, 'charte.json'));
    if (!base) return { ok: false, message: 'Le fichier charte/charte.json du projet est illisible (JSON mal formé) : corrigez-le ou supprimez-le, puis relancez.' };
    const invalide = validerCharte(base, 'charte/charte.json');
    if (invalide.length) return { ok: false, message: `Le fichier charte/charte.json du projet est invalide : ${invalide.join(' ')}` };
  }
  const final = path.join(dossierChartes(), nom);
  const temporaire = `${final}.part-${process.pid}`;
  const ancienne = `${final}.ancienne-${process.pid}`;
  try {
    fs.rmSync(temporaire, { recursive: true, force: true });
    fs.mkdirSync(temporaire, { recursive: true });
    if (fs.existsSync(source)) fs.cpSync(source, temporaire, { recursive: true, filter: (f) => path.basename(f) !== MARQUE });
    const copier = (relatif, cible) => {
      const absolu = cheminDansProjet(projet, relatif);
      if (!absolu || !fs.existsSync(absolu)) throw new Error(`fichier introuvable : « ${relatif} »`);
      fs.mkdirSync(path.dirname(path.join(temporaire, cible)), { recursive: true });
      fs.copyFileSync(absolu, path.join(temporaire, cible));
      return cible;
    };
    const charte = { ...base, couleurs: { ...base.couleurs, ...ponctuel.couleurs }, polices: { ...base.polices } };
    for (const [role, v] of Object.entries(ponctuel.polices || {})) {
      if (v && typeof v === 'object') charte.polices[role] = { famille: v.famille, fichier: copier(v.fichier, `polices/${path.basename(v.fichier)}`) };
      else if (/\.(woff2?|ttf|otf)$/i.test(v)) charte.polices[role] = { famille: path.basename(v).replace(/\.[^.]+$/, ''), fichier: copier(v, `polices/${path.basename(v)}`) };
      else charte.polices[role] = v;
    }
    if (ponctuel.ton) charte.ton = ponctuel.ton;
    if (ponctuel.logo) charte.logo = copier(ponctuel.logo, `logo${path.extname(ponctuel.logo).toLowerCase()}`);
    if (!Object.keys(charte.couleurs).length) delete charte.couleurs;
    if (!Object.keys(charte.polices).length) delete charte.polices;
    fs.writeFileSync(path.join(temporaire, 'charte.json'), JSON.stringify(charte, null, 2));
    // L'ancienne version reste en place tant que la nouvelle n'a pas pris son nom.
    fs.rmSync(ancienne, { recursive: true, force: true });
    const remplace = fs.existsSync(final);
    if (remplace) renommer(final, ancienne);
    try {
      renommer(temporaire, final);
    } catch (e) {
      if (remplace) {
        try { renommer(ancienne, final); } catch {
          e.ancienne = ancienne;
        }
      }
      throw e;
    }
    // Ancienne version impossible à effacer (fichier verrouillé) : la nouvelle est en place, le reste est ignoré.
    if (remplace) { try { supprimer(ancienne, { recursive: true, force: true }); } catch { /* invisible : filtré par NOM */ } }
  } catch (e) {
    try { fs.rmSync(temporaire, { recursive: true, force: true }); } catch { /* rien à nettoyer */ }
    const ancienneGardee = e.ancienne ? ` L'ancienne version de la charte est gardée dans ${e.ancienne} : renommez ce dossier en « ${nom} » pour la retrouver.` : '';
    return { ok: false, message: `La charte « ${nom} » n'a pas pu être enregistrée (${e.code || e.message}) : vérifiez les droits de ${dossierChartes()}, ou indiquez un autre dossier avec la variable PULSE_MOTION_DOSSIER.${ancienneGardee}` };
  }
  return { ok: true, nom, dossier: final };
}

function listerChartes() {
  let noms;
  try { noms = fs.readdirSync(dossierChartes()).filter((n) => NOM.test(n)).sort(); } catch { return []; }
  return noms.map((nom) => {
    const d = path.join(dossierChartes(), nom);
    const c = lireJSON(path.join(d, 'charte.json'));
    if (!c) return null;
    return { nom, couleurs: c.couleurs || {}, polices: c.polices || {}, logo: Boolean(c.logo), glossaire: fs.existsSync(path.join(d, 'glossaire.md')), date: fs.statSync(path.join(d, 'charte.json')).mtime.toISOString().slice(0, 10) };
  }).filter(Boolean);
}

function appliquerCharte({ nom, dossier }) {
  if (!NOM.test(nom || '')) return nomRefuse();
  const source = path.join(dossierChartes(), nom);
  if (!fs.existsSync(path.join(source, 'charte.json'))) {
    return { ok: false, message: `Charte « ${nom} » introuvable. Chartes enregistrées : ${listerChartes().map((c) => c.nom).join(', ') || 'aucune'}.` };
  }
  const invalide = validerCharte(lireJSON(path.join(source, 'charte.json')), 'charte.json');
  if (invalide.length) return { ok: false, message: `La charte « ${nom} » est invalide : ${invalide.join(' ')}` };
  const projet = path.resolve(dossier);
  const { erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  sauvegarder(projet);
  const cible = path.join(projet, 'charte');
  // Les mots du métier déjà notés pour cette vidéo rejoignent le glossaire de la charte appliquée.
  const glossaireAvant = lireGlossaire(projet).termes;
  fs.rmSync(cible, { recursive: true, force: true });
  fs.cpSync(source, cible, { recursive: true });
  fs.writeFileSync(path.join(cible, MARQUE), JSON.stringify({ nom, empreinte: empreinte(source) }, null, 2));
  for (const t of glossaireAvant) noterGlossaire({ dossier: projet, terme: t.terme, sens: t.sens || '—', eviter: t.eviter.join(', '), prononciation: t.prononciation, sauvegarde: false });
  // Le déroulé garde son ton, et son logo si la charte n'en a pas ; le reste vient désormais de la charte.
  const brut = JSON.parse(fs.readFileSync(path.join(projet, 'deroule.json'), 'utf8').replace(/^﻿/, ''));
  const avant = brut.charte || {};
  const charteAppliquee = lireJSON(path.join(source, 'charte.json')) || {};
  const garde = { modele: nom };
  if (avant.ton) garde.ton = avant.ton;
  if (avant.logo && !charteAppliquee.logo) garde.logo = avant.logo;
  const retires = Object.keys(avant).filter((cle) => cle !== 'modele' && !(cle in garde));
  brut.charte = garde;
  fs.writeFileSync(path.join(projet, 'deroule.json'), JSON.stringify(brut, null, 2));
  return { ok: true, nom, retires };
}

/** Charte enregistrée appliquée au projet : existe-t-elle encore, a-t-elle changé depuis ? */
function etatCharte(projet, deroule) {
  const nom = deroule && deroule.charte && deroule.charte.modele;
  if (!nom) return null;
  const source = path.join(dossierChartes(), nom);
  const existe = fs.existsSync(path.join(source, 'charte.json'));
  const marque = lireJSON(path.join(projet, 'charte', MARQUE));
  let aJour = false;
  try { aJour = Boolean(existe && marque && marque.empreinte === empreinte(source)); } catch { aJour = false; }
  return { modele: nom, existe, aJour };
}

function depuisLogo({ fichier, style = 'clair-pedagogique', ton = null, dossierStyles }) {
  const st = trouverStyle(style, dossierStyles);
  if (!st) return { ok: false, message: messageStyleInconnu(style, dossierStyles) };
  let dominantes;
  try { dominantes = couleursDominantes(couleursLogo(fichier)); } catch (e) {
    return { ok: false, message: `Logo « ${path.basename(fichier)} » : ${e.code === 'ENOENT' ? 'fichier introuvable' : e.message}.` };
  }
  if (!dominantes) return { ok: false, message: 'Le logo n\'a pas de couleur exploitable (noir, blanc ou transparent) : la charte du style est gardée.' };
  const couleur = (lireJSON(path.join(st.dossier, 'identite.json')) || {}).couleur || {};
  const charteStyle = (lireJSON(path.join(st.dossier, 'charte.json')) || {}).couleurs || {};
  const tons = Array.isArray(couleur.tons) && couleur.tons.length ? couleur.tons : ['clair'];
  const tonRetenu = tons.includes(ton) ? ton : (tons.includes(couleur.tonDefaut) ? couleur.tonDefaut : tons[0]);
  const variante = couleur[tonRetenu] || {};
  const fond = variante.fond || charteStyle.fond || '#ffffff';
  const couleurs = {};
  const ajustements = [];
  for (const [nom, minimum, quoi] of [['primaire', SEUILS.contrasteTitres, 'couleur primaire'], ['accent', SEUILS.contrasteTexte, 'couleur d\'accent']]) {
    const r = ajusterContraste(dominantes[nom], fond, minimum);
    if (!r.ok) {
      couleurs[nom] = charteStyle[nom] || dominantes[nom];
      ajustements.push(`${quoi} du logo (${dominantes[nom]}) illisible sur le fond : couleur du style gardée (${couleurs[nom]}).`);
    } else {
      couleurs[nom] = r.hex;
      if (r.ecart) ajustements.push(`${quoi} ${r.ecart < 0 ? 'foncée' : 'éclaircie'} de ${Math.round(Math.abs(r.ecart) * 100)} % pour rester lisible (${dominantes[nom]} → ${r.hex}).`);
    }
  }
  return { ok: true, style: st.nom, ton: tonRetenu, fond, logo: dominantes, couleurs, ajustements };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const valeur = (option) => { const i = args.indexOf(option); return i >= 0 ? args[i + 1] : undefined; };
  const [action, a, b] = args.filter((x, i) => !x.startsWith('--') && !['--style', '--ton'].includes(args[i - 1]));
  let r;
  if (action === 'enregistrer') r = enregistrerCharte({ nom: a, dossier: b || '.' });
  else if (action === 'appliquer') r = appliquerCharte({ nom: a, dossier: b || '.' });
  else if (action === 'liste') r = listerChartes();
  else if (action === 'depuis-logo') r = depuisLogo({ fichier: a || '', style: valeur('--style'), ton: valeur('--ton') });
  else {
    console.error('Usage : pulse-motion charte enregistrer <nom> <dossier> | liste | appliquer <nom> <dossier> | depuis-logo <fichier> [--style <nom>] [--ton clair|sombre]');
    process.exit(2);
  }
  console.log(JSON.stringify(r, null, 2));
  process.exit(Array.isArray(r) || r.ok ? 0 : 1);
}

module.exports = { enregistrerCharte, listerChartes, appliquerCharte, etatCharte, depuisLogo, empreinte };
