'use strict';
/* Pulse Motion – parcours d'un tournage (spec S6, 5.2) : films/<nom>/parcours.json, écrit par Claude d'après les phrases de
 * la personne, validé ici (schéma écrit à la main, comme lib/deroule.js). Module pur, sauf lireParcours.
 *
 *   { "nom": "factures", "depart": "appli-essai", "appareil": "ordinateur", "apparence": "site",
 *     "preparation": [ … ], "etapes": [ { "faire": "cliquer", "cible": "Nouvelle facture", "dit": "Cliquez sur Nouvelle facture" } ] }
 *
 * validerParcours(p, { projet }) -> { ok, erreurs: [texte], etapes: [{ n, faire, phrase }] }
 *   Refus, en français pour Claude : verbe inconnu (avec la proposition : « clique » -> « cliquer »), mot de passe à taper,
 *   adresse autre que http, https ou file, fichier hors du projet, cible ou champ mal écrits.
 * lireParcours(projet, nom) -> { parcours, erreurs, fichier }
 * depart(p, { projet }) -> { sorte: 'essai' | 'fichier' | 'local' | 'en-ligne', url?, chemin?, site }
 *   'appli-essai' (ou 'appli-essai/<page>') : l'application de démonstration livrée, servie le temps du tournage.
 * lireTouches(texte) -> { modificateurs: ['Control'…], cle: { key, code, keyCode, text? } } ou null (« Ctrl+S », « Entrée »)
 * phraseEtape(e) -> texte : l'étape redite en français (« Cliquer sur « Nouvelle facture » »).
 * TAILLES : taille de tournage par appareil (px CSS, échelle, mobile), spec 5.12.
 * Idée du parcours scripté et des verbes : argo (fixtures.ts, demoType) et reanimate (capture.ts) ; format et recherche
 * écrits pour Pulse Motion, aucune reprise de code.
 */
const fs = require('node:fs');
const path = require('node:path');
const P = require('../../moteur/proches.js');
const { cheminDansProjet } = require('./embarquer.js');
const FL = require('./flou.js');

const NOM = /^[a-z0-9-]+$/;
const APPAREILS = ['ordinateur', 'tablette', 'telephone'];
const APPARENCES = ['site', 'claire', 'sombre'];
const ESSAI = 'appli-essai';
const TAILLES = {
  ordinateur: { largeur: 1280, hauteur: 800, echelle: 1.5, mobile: false },
  tablette: { largeur: 820, hauteur: 1180, echelle: 1.5, mobile: true },
  telephone: { largeur: 390, hauteur: 844, echelle: 2, mobile: true },
};

/** Verbes et leurs champs : obligatoires, puis facultatifs. */
const VERBES = {
  aller: { requis: ['url'], permis: ['montrer'] },
  cliquer: { requis: ['cible'], permis: [] },
  'double-cliquer': { requis: ['cible'], permis: [] },
  survoler: { requis: ['cible'], permis: [] },
  taper: { requis: ['cible', 'texte'], permis: ['puis'] },
  vider: { requis: ['cible'], permis: [] },
  choisir: { requis: ['cible', 'option'], permis: [] },
  cocher: { requis: ['cible'], permis: [] },
  decocher: { requis: ['cible'], permis: [] },
  defiler: { requis: [], permis: ['vers', 'ecrans'] },
  touche: { requis: ['touches'], permis: [] },
  attendre: { requis: [], permis: ['texte', 'secondes'] },
};
const COMMUNS = ['faire', 'dit'];

// Formes que la personne (ou Claude) écrit souvent, rapportées au verbe.
const FORMES = {
  clique: 'cliquer', cliques: 'cliquer', clic: 'cliquer', click: 'cliquer', appuie: 'cliquer', appuyer: 'cliquer', presse: 'cliquer',
  'double-clique': 'double-cliquer', 'double-clic': 'double-cliquer', doubleclic: 'double-cliquer',
  va: 'aller', vas: 'aller', ouvre: 'aller', ouvrir: 'aller', naviguer: 'aller',
  survole: 'survoler', passe: 'survoler', survol: 'survoler',
  tape: 'taper', saisis: 'taper', saisir: 'taper', ecris: 'taper', ecrire: 'taper', remplis: 'taper', remplir: 'taper',
  vide: 'vider', efface: 'vider', effacer: 'vider',
  choisis: 'choisir', selectionne: 'choisir', selectionner: 'choisir',
  coche: 'cocher', decoche: 'decocher',
  defile: 'defiler', descends: 'defiler', descendre: 'defiler', monte: 'defiler', scroll: 'defiler',
  touches: 'touche', raccourci: 'touche',
  attends: 'attendre', patiente: 'attendre',
};

const MOT_DE_PASSE = /mot\s*de\s*passe|password|\bmdp\b|passcode|code\s+secret/i;
const MESSAGE_MOT_DE_PASSE = 'Je ne tape jamais de mot de passe : la personne se connecte elle-même (étape de connexion).';

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const estTexte = (v) => typeof v === 'string' && v.trim() !== '';
const sansAccents = (t) => P.normaliser(t).replace(/\s+/g, ' ');

/** Adresse : http(s), file, chemin du projet, ou l'appli d'essai. -> { sorte, url?, chemin?, site } ou { erreur }. */
function lireAdresse(texte, { projet } = {}) {
  const a = String(texte || '').trim();
  if (!a) return { erreur: 'adresse vide' };
  if (a === ESSAI || a.startsWith(`${ESSAI}/`)) return { sorte: 'essai', chemin: a.slice(ESSAI.length).replace(/^\/+/, ''), site: ESSAI };
  const schema = /^([a-z][a-z0-9+.-]*):/i.exec(a);
  if (schema && !/^[a-z]:[\\/]/i.test(a)) {
    const s = schema[1].toLowerCase();
    if (s === 'http' || s === 'https') {
      let u;
      try { u = new URL(a); } catch { return { erreur: `adresse « ${a} » illisible` }; }
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || u.hostname.endsWith('.localhost');
      return { sorte: local ? 'local' : 'en-ligne', url: u.href, site: u.hostname };
    }
    if (s === 'file') {
      let chemin;
      try { chemin = require('node:url').fileURLToPath(a); } catch { return { erreur: `adresse « ${a} » illisible` }; }
      return verifierFichier(chemin, projet, a);
    }
    return { erreur: `adresse « ${a} » : seules les adresses http, https et file se filment` };
  }
  return verifierFichier(a, projet, a);
}

function verifierFichier(chemin, projet, texte) {
  if (!projet) return { sorte: 'fichier', chemin, site: 'fichier' };
  const absolu = path.isAbsolute(chemin) ? path.resolve(chemin) : cheminDansProjet(projet, chemin);
  const racine = path.resolve(projet);
  if (!absolu || !(absolu === racine || absolu.startsWith(racine + path.sep))) return { erreur: `le fichier « ${texte} » est hors du dossier de la vidéo : le copier dans le dossier, ou filmer son adresse` };
  return { sorte: 'fichier', chemin: absolu, site: 'fichier' };
}

/** Cible : texte, { texte, rang, dans }, { selecteur }, { point: [x, y] } (en % de la page). -> message ou null. */
function erreurCible(c) {
  if (estTexte(c)) return null;
  if (!estObjet(c)) return 'cible : un texte (le libellé visible), { "texte", "rang", "dans" }, { "selecteur" } ou { "point": [x, y] }';
  const cles = Object.keys(c);
  if (c.point !== undefined) {
    if (cles.length !== 1 || !Array.isArray(c.point) || c.point.length !== 2 || !c.point.every((x) => typeof x === 'number' && x >= 0 && x <= 100)) return 'cible « point » : [x, y] en % de la page, de 0 à 100, seul';
    return null;
  }
  if (c.selecteur !== undefined) {
    if (!estTexte(c.selecteur) || cles.length !== 1) return 'cible « selecteur » : un sélecteur CSS seul (écrit seulement après un échec, d\'après les candidats)';
    return null;
  }
  if (!estTexte(c.texte)) return 'cible : « texte » est obligatoire (le libellé visible)';
  const inconnus = cles.filter((k) => !['texte', 'rang', 'dans'].includes(k));
  if (inconnus.length) return `cible : champ${inconnus.length > 1 ? 's' : ''} ${inconnus.map((k) => `« ${k} »`).join(', ')} inconnu${inconnus.length > 1 ? 's' : ''} (texte, rang, dans)`;
  if (c.rang !== undefined && !(Number.isInteger(c.rang) && c.rang >= 1)) return 'cible « rang » : un entier à partir de 1 (« le 2ᵉ Modifier » : 2)';
  if (c.dans !== undefined && !estTexte(c.dans)) return 'cible « dans » : le titre ou le libellé du conteneur (« fenêtre »)';
  return null;
}

const texteCible = (c) => (estTexte(c) ? c : estObjet(c) ? c.texte || c.selecteur || '' : '');

const NOMS_TOUCHES = {
  entree: ['Enter', 'Enter', 13, '\r'], enter: ['Enter', 'Enter', 13, '\r'], retour: ['Enter', 'Enter', 13, '\r'],
  echap: ['Escape', 'Escape', 27], echappe: ['Escape', 'Escape', 27], esc: ['Escape', 'Escape', 27], escape: ['Escape', 'Escape', 27],
  tab: ['Tab', 'Tab', 9], tabulation: ['Tab', 'Tab', 9],
  espace: [' ', 'Space', 32, ' '], space: [' ', 'Space', 32, ' '],
  effacer: ['Backspace', 'Backspace', 8], backspace: ['Backspace', 'Backspace', 8], 'retour arriere': ['Backspace', 'Backspace', 8],
  suppr: ['Delete', 'Delete', 46], supprimer: ['Delete', 'Delete', 46], delete: ['Delete', 'Delete', 46],
  haut: ['ArrowUp', 'ArrowUp', 38], bas: ['ArrowDown', 'ArrowDown', 40], gauche: ['ArrowLeft', 'ArrowLeft', 37], droite: ['ArrowRight', 'ArrowRight', 39],
  debut: ['Home', 'Home', 36], fin: ['End', 'End', 35], 'page suivante': ['PageDown', 'PageDown', 34], 'page precedente': ['PageUp', 'PageUp', 33],
};
const MODIFICATEURS = { ctrl: 'Control', control: 'Control', controle: 'Control', maj: 'Shift', shift: 'Shift', majuscule: 'Shift', alt: 'Alt', cmd: 'Meta', commande: 'Meta', meta: 'Meta', windows: 'Meta' };

function lireTouches(texte) {
  if (!estTexte(texte)) return null;
  const morceaux = String(texte).split('+').map((x) => sansAccents(x)).filter(Boolean);
  if (!morceaux.length) return null;
  const derniere = morceaux.pop();
  const modificateurs = [];
  for (const m of morceaux) {
    if (!MODIFICATEURS[m]) return null;
    modificateurs.push(MODIFICATEURS[m]);
  }
  let cle = null;
  if (NOMS_TOUCHES[derniere]) {
    const [key, code, keyCode, text] = NOMS_TOUCHES[derniere];
    cle = { key, code, keyCode, ...(text ? { text } : {}) };
  } else if (/^f([1-9]|1[0-2])$/.test(derniere)) {
    const n = Number(derniere.slice(1));
    cle = { key: `F${n}`, code: `F${n}`, keyCode: 111 + n };
  } else if ([...derniere].length === 1) {
    const ch = derniere;
    const haut = ch.toUpperCase();
    const lettre = /^[a-z]$/.test(ch);
    const chiffre = /^[0-9]$/.test(ch);
    cle = { key: ch, code: lettre ? `Key${haut}` : chiffre ? `Digit${ch}` : '', keyCode: lettre || chiffre ? haut.charCodeAt(0) : 0, text: ch };
  } else return null;
  return { modificateurs, cle };
}

/** Étape redite en français, pour la relire à la personne. */
function phraseEtape(e) {
  const c = (x) => `« ${texteCible(x) || (estObjet(x) && x.point ? `le point ${x.point.join(' %, ')} %` : '?')} »`;
  switch (e.faire) {
    case 'aller': return `Aller sur ${e.url}`;
    case 'cliquer': return `Cliquer sur ${c(e.cible)}`;
    case 'double-cliquer': return `Double-cliquer sur ${c(e.cible)}`;
    case 'survoler': return `Passer la souris sur ${c(e.cible)}`;
    case 'taper': return `Dans ${c(e.cible)}, taper « ${e.texte} »${e.puis ? `, puis ${e.puis}` : ''}`;
    case 'vider': return `Effacer le champ ${c(e.cible)}`;
    case 'choisir': return `Choisir « ${e.option} » dans ${c(e.cible)}`;
    case 'cocher': return `Cocher ${c(e.cible)}`;
    case 'decocher': return `Décocher ${c(e.cible)}`;
    case 'defiler': return e.vers !== undefined ? `Descendre jusqu'à ${c(e.vers)}` : `Descendre de ${e.ecrans} écran${e.ecrans > 1 ? 's' : ''}`;
    case 'touche': return `Appuyer sur ${e.touches}`;
    case 'attendre': return e.texte !== undefined ? `Attendre que « ${e.texte} » s'affiche` : `Attendre ${e.secondes} s`;
    default: return String(e.faire);
  }
}

function proposition(faire) {
  const f = sansAccents(faire);
  if (FORMES[f]) return FORMES[f];
  const l = P.proches(f, Object.keys(VERBES));
  return l.length ? l[0] : null;
}

function validerEtape(e, ou, { projet, erreurs }) {
  const err = (m) => erreurs.push(`${ou} : ${m}.`);
  if (!estObjet(e)) { err('une étape est un objet { "faire": …, "dit": … }'); return; }
  if (!estTexte(e.faire)) { err('« faire » est obligatoire (aller, cliquer, taper, défiler, attendre…)'); return; }
  const v = VERBES[e.faire];
  if (!v) {
    const p = proposition(e.faire);
    err(`verbe « ${e.faire} » inconnu${p ? ` ; écrire « ${p} »` : ''} (verbes : ${Object.keys(VERBES).join(', ')})`);
    return;
  }
  const permis = new Set([...COMMUNS, ...v.requis, ...v.permis]);
  const inconnus = Object.keys(e).filter((k) => !permis.has(k));
  if (inconnus.length) err(`« ${e.faire} » : champ${inconnus.length > 1 ? 's' : ''} ${inconnus.map((k) => `« ${k} »`).join(', ')} inconnu${inconnus.length > 1 ? 's' : ''} (${[...v.requis, ...v.permis].join(', ') || 'aucun champ'})`);
  for (const r of v.requis) if (e[r] === undefined) err(`« ${e.faire} » : « ${r} » est obligatoire`);
  if (e.dit !== undefined && typeof e.dit !== 'string') err('« dit » : la phrase de la personne, en texte');
  for (const k of ['cible', 'vers']) {
    if (e[k] === undefined) continue;
    const m = erreurCible(e[k]);
    if (m) err(m);
  }
  if (e.faire === 'aller') {
    const a = lireAdresse(e.url, { projet });
    if (a.erreur) err(a.erreur);
    if (e.montrer !== undefined && e.montrer !== 'chargement') err('« montrer » : seule la valeur « chargement » existe (garder les images du chargement)');
  }
  if (e.faire === 'taper') {
    if (typeof e.texte !== 'string' || !e.texte.length) err('« taper » : « texte » est le texte à taper');
    if (e.puis !== undefined && !lireTouches(e.puis)) err(`« puis » : touche « ${e.puis} » illisible (Entrée, Tab, Échap, Ctrl+S…)`);
    if (MOT_DE_PASSE.test(texteCible(e.cible)) || MOT_DE_PASSE.test(e.dit || '')) err(MESSAGE_MOT_DE_PASSE.replace(/\.$/, ''));
  }
  if (e.faire === 'choisir' && !estTexte(e.option)) err('« choisir » : « option » est le libellé de l\'option choisie');
  if (e.faire === 'defiler') {
    if ((e.vers === undefined) === (e.ecrans === undefined)) err('« defiler » : « vers » (une cible) ou « ecrans » (un nombre d\'écrans), l\'un des deux');
    if (e.ecrans !== undefined && !(typeof e.ecrans === 'number' && e.ecrans > 0 && e.ecrans <= 20)) err('« ecrans » : un nombre d\'écrans de 0 à 20 (1 : un écran)');
  }
  if (e.faire === 'touche' && !lireTouches(e.touches)) err(`touche « ${e.touches} » illisible (Entrée, Tab, Échap, Ctrl+S, Maj+Tab…)`);
  if (e.faire === 'attendre') {
    if ((e.texte === undefined) === (e.secondes === undefined)) err('« attendre » : « texte » (qui doit s\'afficher) ou « secondes », l\'un des deux');
    if (e.texte !== undefined && !estTexte(e.texte)) err('« attendre » : « texte » est le texte attendu');
    if (e.secondes !== undefined && !(typeof e.secondes === 'number' && e.secondes > 0 && e.secondes <= 30)) err('« secondes » : de 0 à 30');
  }
}

function validerParcours(p, { projet } = {}) {
  const erreurs = [];
  if (!estObjet(p)) return { ok: false, erreurs: ['Le parcours doit être un objet JSON.'], etapes: [] };
  // Vidéo importée (5.14) : pas de parcours à filmer, seulement le fichier d'origine et la prise choisie.
  if (p.import !== undefined) {
    const inconnus = Object.keys(p).filter((k) => !['nom', 'import', 'prise'].includes(k));
    if (inconnus.length) erreurs.push(`Vidéo importée : champ${inconnus.length > 1 ? 's' : ''} ${inconnus.map((k) => `« ${k} »`).join(', ')} inconnu${inconnus.length > 1 ? 's' : ''} (nom, import, prise).`);
    if (!estTexte(p.nom) || !NOM.test(p.nom)) erreurs.push('« nom » : a-z, 0-9 et des tirets (le nom du dossier films/<nom>).');
    if (!estTexte(p.import)) erreurs.push('« import » : le nom du fichier importé.');
    if (p.prise !== undefined && !(typeof p.prise === 'string' && /^prise-\d{2,}$/.test(p.prise))) erreurs.push('« prise » : la prise choisie, « prise-01 »…');
    return { ok: erreurs.length === 0, erreurs, etapes: [{ n: 1, faire: 'lire', phrase: `Lire la vidéo « ${p.import} »` }], importe: true };
  }
  const CHAMPS = ['nom', 'depart', 'appareil', 'apparence', 'connexion', 'preparation', 'etapes', 'flou', 'prise', 'graine', 'accord'];
  const inconnus = Object.keys(p).filter((k) => !CHAMPS.includes(k));
  if (inconnus.length) erreurs.push(`Champ${inconnus.length > 1 ? 's' : ''} ${inconnus.map((k) => `« ${k} »`).join(', ')} inconnu${inconnus.length > 1 ? 's' : ''} (${CHAMPS.join(', ')}).`);
  if (!estTexte(p.nom) || !NOM.test(p.nom)) erreurs.push('« nom » : a-z, 0-9 et des tirets (le nom du dossier films/<nom>).');
  if (!estTexte(p.depart)) erreurs.push('« depart » : l\'adresse de départ (https://…, http://localhost…, un fichier du dossier, ou « appli-essai »).');
  else { const a = lireAdresse(p.depart, { projet }); if (a.erreur) erreurs.push(`« depart » : ${a.erreur}.`); }
  if (p.appareil !== undefined && !APPAREILS.includes(p.appareil)) erreurs.push(`« appareil » : ${APPAREILS.join(', ')}.`);
  if (p.apparence !== undefined && !APPARENCES.includes(p.apparence)) erreurs.push(`« apparence » : ${APPARENCES.join(', ')}.`);
  if (p.connexion !== undefined && typeof p.connexion !== 'boolean') erreurs.push('« connexion » : true si la personne se connecte d\'abord.');
  for (const m of FL.erreursFlou(p.flou, erreurCible)) erreurs.push(m);
  if (p.prise !== undefined && !(typeof p.prise === 'string' && /^prise-\d{2,}$/.test(p.prise))) erreurs.push('« prise » : la prise choisie, « prise-01 »…');
  if (p.graine !== undefined && !estTexte(p.graine)) erreurs.push('« graine » : un texte.');
  if (p.accord !== undefined && !(estObjet(p.accord) && estTexte(p.accord.site) && estTexte(p.accord.date))) erreurs.push('« accord » : { "site", "date" }, écrit quand la personne a dit oui.');
  if (p.preparation !== undefined) {
    if (!Array.isArray(p.preparation)) erreurs.push('« preparation » : une liste d\'étapes jouées avant le tournage, non filmées.');
    else p.preparation.forEach((e, i) => validerEtape(e, `Préparation, étape ${i + 1}`, { projet, erreurs }));
  }
  if (!Array.isArray(p.etapes) || !p.etapes.length) erreurs.push('« etapes » : au moins une étape filmée.');
  else p.etapes.forEach((e, i) => validerEtape(e, `Étape ${i + 1}`, { projet, erreurs }));
  // Un seul site en ligne par parcours : l'accord de la personne vaut pour ce site (spec 5.4).
  const sites = [...new Set(sitesEnLigne(p, { projet }).map(domaineDe))];
  if (sites.length > 1) erreurs.push(`Un parcours filme un seul site en ligne (ici : ${sites.join(', ')}) : faire un parcours par site.`);
  const etapes = Array.isArray(p.etapes) ? p.etapes.map((e, i) => ({ n: i + 1, faire: e && e.faire, phrase: estObjet(e) && VERBES[e.faire] ? phraseEtape(e) : '' })) : [];
  return { ok: erreurs.length === 0, erreurs, etapes };
}

/** Noms d'hôte des adresses en ligne du parcours (départ et étapes « aller »), dans l'ordre. */
function sitesEnLigne(p, { projet } = {}) {
  if (!estObjet(p)) return [];
  const liste = [p.depart, ...[...(Array.isArray(p.preparation) ? p.preparation : []), ...(Array.isArray(p.etapes) ? p.etapes : [])]
    .filter((e) => estObjet(e) && e.faire === 'aller').map((e) => e.url)];
  const r = [];
  for (const a of liste) {
    if (!estTexte(a)) continue;
    const l = lireAdresse(a, { projet });
    if (l.sorte === 'en-ligne' && !r.includes(l.site)) r.push(l.site);
  }
  return r;
}

/** Domaine d'un nom d'hôte (« app.exemple.fr » -> « exemple.fr » ; « a.b.co.uk » -> « b.co.uk ») : le site, sous-domaines
 *  compris. Sans liste des suffixes publics : deux derniers libellés, trois si l'avant-dernier est court (co.uk, com.au). */
function domaineDe(hote) {
  const h = String(hote || '').toLowerCase().replace(/\.$/, '');
  if (/^\[|^\d+\.\d+\.\d+\.\d+$/.test(h)) return h;
  const l = h.split('.');
  if (l.length <= 2) return h;
  const n = l[l.length - 2].length <= 3 && l[l.length - 1].length === 2 && l.length >= 3 && ['co', 'com', 'net', 'org', 'gov', 'ac', 'edu', 'gouv'].includes(l[l.length - 2]) ? 3 : 2;
  return l.slice(-n).join('.');
}

/** Nom d'hôte réduit à a-z, 0-9 et tirets (dossier du profil d'un site). */
function siteReduit(hote) {
  return String(hote || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'site';
}

function lireParcours(projet, nom) {
  const fichier = path.join(path.resolve(projet), 'films', String(nom), 'parcours.json');
  if (!NOM.test(String(nom || ''))) return { parcours: null, erreurs: [`Film « ${nom} » : nom invalide (a-z, 0-9, tirets).`], fichier };
  let brut;
  try { brut = fs.readFileSync(fichier, 'utf8'); } catch { return { parcours: null, erreurs: [`Film « ${nom} » introuvable : aucun parcours dans films/${nom}/.`], fichier }; }
  let p;
  try { p = JSON.parse(brut.replace(/^﻿/, '')); } catch (e) { return { parcours: null, erreurs: [`films/${nom}/parcours.json n'est pas un JSON valide : ${e.message}`], fichier }; }
  const v = validerParcours(p, { projet });
  return { parcours: p, erreurs: v.erreurs, fichier, etapes: v.etapes };
}

module.exports = { validerParcours, lireParcours, lireAdresse, sitesEnLigne, domaineDe, siteReduit, erreurCible, lireTouches, phraseEtape, texteCible, VERBES, APPAREILS, APPARENCES, TAILLES, ESSAI, MOT_DE_PASSE, MESSAGE_MOT_DE_PASSE, NOM };
