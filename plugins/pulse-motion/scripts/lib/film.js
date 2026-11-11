'use strict';
/* Pulse Motion – films figés d'un projet (spec S6, 5.7 et 5.8) : prises, validation de film.json, choix de la prise,
 * embarquement dans la page.
 *
 *   films/<nom>/parcours.json
 *   films/<nom>/prise-01/film.json
 *   films/<nom>/prise-01/images/0001.webp …    (états calmes)
 *   films/<nom>/prise-01/images/r03-0001.jpg … (réactions)
 *
 * validerFilm(film, { dossier? }) -> [messages] : film.json version 1 (avec dossier : chaque image existe).
 * lireFilm(projet, nom, prise) -> { film, dossier, erreurs }
 * prises(projet, nom) -> [{ prise, date, etapes, duree, poids, alertes, planche, choisie, ok }] (de la plus ancienne)
 * prochainePrise(projet, nom) -> 'prise-NN'
 * choisirPrise(projet, nom, prise) -> parcours.prise écrit · supprimerPrise(projet, nom, prise) : refuse la prise choisie
 * filmChoisi(projet, nom) -> { film, prise, dossier } | { regle: 'film-introuvable' | 'prise-non-choisie', message }
 * lireEtapes(texte | nombre | liste) -> [numéros] (« 2-4 », « 1,3 », 2) ou null
 * blocFilm(projet, nom, numeros) -> { id, html, poids, images, film } : bloc <script type="application/json" id="pm-film-<nom>">
 *   des seules étapes visées, images en URI data: (cache par chemin, taille et date : pas de réencodage à chaque assemblage).
 * poidsPrise(dossier) -> octets des images.
 */
const fs = require('node:fs');
const path = require('node:path');
const { ecrireJSON } = require('./fichiers.js');
const { NOM } = require('./parcours.js');

const VERSION = 1;
const PRISE = /^prise-(\d{2,})$/;
const IMAGE = /^[a-z0-9-]+\.(webp|jpg|jpeg|png)$/;
const MIME = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
const FAIRE = ['aller', 'cliquer', 'double-cliquer', 'survoler', 'taper', 'vider', 'choisir', 'cocher', 'decocher', 'defiler', 'touche', 'attendre', 'lire'];

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const estNombre = (v) => typeof v === 'number' && isFinite(v);
const dossierFilm = (projet, nom) => path.join(path.resolve(projet), 'films', nom);

function validerFilm(f, { dossier } = {}) {
  const err = [];
  if (!estObjet(f)) return ['film.json doit être un objet.'];
  if (f.version !== VERSION) err.push(`version ${JSON.stringify(f.version)} inconnue (version ${VERSION}).`);
  if (!['tournage', 'import'].includes(f.source)) err.push('« source » : tournage ou import.');
  for (const k of ['largeur', 'hauteur']) if (!(Number.isInteger(f[k]) && f[k] > 0)) err.push(`« ${k} » : en pixels de la page filmée.`);
  if (!(estNombre(f.echelle) && f.echelle > 0)) err.push('« echelle » : un nombre (1,5 : images de 1 920 px pour 1 280).');
  if (![30, 60].includes(f.cadence)) err.push('« cadence » : 30 ou 60.');
  if (f.bords !== undefined && !(Array.isArray(f.bords) && f.bords.length === 2 && f.bords.every((c) => /^#[0-9a-f]{6}$/i.test(c)))) err.push('« bords » : deux couleurs #rrggbb.');
  if (!Array.isArray(f.etapes) || !f.etapes.length) { err.push('« etapes » : au moins une étape.'); return err; }
  const images = new Set();
  const image = (nom, ou) => {
    if (typeof nom !== 'string' || !IMAGE.test(nom)) { err.push(`${ou} : image « ${nom} » mal nommée.`); return; }
    images.add(nom);
  };
  f.etapes.forEach((e, i) => {
    const ou = `étape ${i + 1}`;
    if (!estObjet(e)) { err.push(`${ou} : un objet.`); return; }
    if (e.n !== i + 1) err.push(`${ou} : « n » vaut ${i + 1}.`);
    if (!FAIRE.includes(e.faire)) err.push(`${ou} : « faire » inconnu (${e.faire}).`);
    if (e.url !== undefined && (typeof e.url !== 'string' || /[?#]/.test(e.url))) err.push(`${ou} : « url » sans paramètres ni fragment (origine et chemin).`);
    image(e.avant, `${ou}, avant`);
    image(e.apres, `${ou}, après`);
    for (const k of ['survol', 'vue']) if (e[k] !== undefined && e[k] !== null) image(e[k], `${ou}, ${k}`);
    if (e.point !== undefined && e.point !== null && !(Array.isArray(e.point) && e.point.length === 2 && e.point.every(estNombre))) err.push(`${ou} : « point » [x, y] en px.`);
    if (e.cible !== undefined && e.cible !== null && !(estObjet(e.cible) && Array.isArray(e.cible.boite) && e.cible.boite.length === 4 && e.cible.boite.every(estNombre))) err.push(`${ou} : « cible » { libelle, boite: [x, y, l, h] }.`);
    for (const k of ['reaction', 'approche']) {
      if (e[k] === undefined) continue;
      if (!Array.isArray(e[k]) || !e[k].every((r) => Array.isArray(r) && r.length === 2 && estNombre(r[0]) && r[0] >= 0)) { err.push(`${ou} : « ${k} » [[ms, image], …].`); continue; }
      let avant = -1;
      e[k].forEach((r) => { image(r[1], `${ou}, ${k}`); if (r[0] < avant) err.push(`${ou} : « ${k} » dans l'ordre des instants.`); avant = r[0]; });
    }
    if (e.duree !== undefined && !(estNombre(e.duree) && e.duree >= 0)) err.push(`${ou} : « duree » en ms.`);
    if (e.reperes !== undefined) {
      if (!Array.isArray(e.reperes)) err.push(`${ou} : « reperes » une liste [{ instant, point, boite? }].`);
      else e.reperes.forEach((r, k) => {
        const bon = estObjet(r) && estNombre(r.instant) && r.instant >= 0 && Array.isArray(r.point) && r.point.length === 2 && r.point.every(estNombre)
          && (r.boite === undefined || (Array.isArray(r.boite) && r.boite.length === 4 && r.boite.every(estNombre)));
        if (!bon) err.push(`${ou}, repère ${k + 1} : { instant (s), point [x, y] px, boite? [x, y, l, h] px }.`);
      });
    }
    if (e.coupes !== undefined && !(Array.isArray(e.coupes) && e.coupes.every((c) => Array.isArray(c) && c.length === 2 && estNombre(c[0]) && estNombre(c[1])))) err.push(`${ou} : « coupes » [[de, a], …] en ms.`);
    if (e.alertes !== undefined && !Array.isArray(e.alertes)) err.push(`${ou} : « alertes » une liste.`);
  });
  if (f.alertes !== undefined && !Array.isArray(f.alertes)) err.push('« alertes » : une liste.');
  if (dossier) for (const nom of images) if (!fs.existsSync(path.join(dossier, 'images', nom))) err.push(`image « ${nom} » absente.`);
  return err;
}

function lireFilm(projet, nom, prise) {
  const dossier = path.join(dossierFilm(projet, nom), prise);
  let film;
  try { film = JSON.parse(fs.readFileSync(path.join(dossier, 'film.json'), 'utf8')); } catch {
    return { film: null, dossier, erreurs: [`Film « ${nom} », ${prise} : film.json illisible ou absent.`] };
  }
  const e = validerFilm(film, { dossier });
  return { film, dossier, erreurs: e.map((m) => `Film « ${nom} », ${prise} : ${m}`) };
}

function poidsPrise(dossier) {
  let n = 0;
  try { for (const f of fs.readdirSync(path.join(dossier, 'images'))) n += fs.statSync(path.join(dossier, 'images', f)).size; } catch { /* aucune image */ }
  return n;
}

function lireParcoursBrut(projet, nom) {
  try { return JSON.parse(fs.readFileSync(path.join(dossierFilm(projet, nom), 'parcours.json'), 'utf8').replace(/^﻿/, '')); } catch { return null; }
}

function prises(projet, nom) {
  const d = dossierFilm(projet, nom);
  let noms = [];
  try { noms = fs.readdirSync(d).filter((x) => PRISE.test(x)).sort((a, b) => Number(PRISE.exec(a)[1]) - Number(PRISE.exec(b)[1])); } catch { return []; }
  const parcours = lireParcoursBrut(projet, nom) || {};
  return noms.map((prise) => {
    const { film, dossier, erreurs } = lireFilm(projet, nom, prise);
    const planche = path.join(path.resolve(projet), 'sortie', 'planche-film', `${nom}-${prise}`);
    return {
      prise,
      ok: !erreurs.length,
      date: film && film.date || null,
      etapes: film && Array.isArray(film.etapes) ? film.etapes.length : 0,
      duree: film && film.duree || null,
      poids: poidsPrise(dossier),
      alertes: film && Array.isArray(film.alertes) ? film.alertes : [],
      planche: fs.existsSync(planche) ? path.relative(path.resolve(projet), planche).split(path.sep).join('/') : null,
      choisie: parcours.prise === prise,
    };
  });
}

function prochainePrise(projet, nom) {
  const max = prises(projet, nom).reduce((m, p) => Math.max(m, Number(PRISE.exec(p.prise)[1])), 0);
  return `prise-${String(max + 1).padStart(2, '0')}`;
}

function ecrireParcours(projet, nom, modifier) {
  const fichier = path.join(dossierFilm(projet, nom), 'parcours.json');
  const p = lireParcoursBrut(projet, nom);
  if (!p) throw new Error(`Film « ${nom} » introuvable : aucun parcours dans films/${nom}/.`);
  modifier(p);
  ecrireJSON(fichier, p);
  return p;
}

function choisirPrise(projet, nom, prise) {
  if (!PRISE.test(String(prise))) throw new Error(`« ${prise} » : une prise s'écrit prise-01, prise-02…`);
  const p = prises(projet, nom).find((x) => x.prise === prise);
  if (!p) throw new Error(`Film « ${nom} » : la ${prise} n'existe pas.`);
  if (!p.ok) throw new Error(`Film « ${nom} » : la ${prise} est abîmée ; refilmer.`);
  ecrireParcours(projet, nom, (x) => { x.prise = prise; });
  return { nom, prise };
}

function supprimerPrise(projet, nom, prise) {
  if (!PRISE.test(String(prise))) throw new Error(`« ${prise} » : une prise s'écrit prise-01, prise-02…`);
  const parcours = lireParcoursBrut(projet, nom) || {};
  if (parcours.prise === prise) throw new Error(`Film « ${nom} » : la ${prise} est la prise choisie ; en choisir une autre avant de la supprimer.`);
  const d = path.join(dossierFilm(projet, nom), prise);
  if (!fs.existsSync(d)) throw new Error(`Film « ${nom} » : la ${prise} n'existe pas.`);
  fs.rmSync(d, { recursive: true, force: true });
  return { nom, prise, supprimee: true };
}

function filmChoisi(projet, nom) {
  if (!NOM.test(String(nom || ''))) return { regle: 'film-introuvable', message: `film « ${nom} » : nom invalide (a-z, 0-9, tirets).` };
  const parcours = lireParcoursBrut(projet, nom);
  const liste = prises(projet, nom);
  if (!parcours && !liste.length) return { regle: 'film-introuvable', message: `le film « ${nom} » n'existe pas (aucun dossier films/${nom}/) : le tourner d'abord.` };
  if (!parcours || !parcours.prise) return { regle: 'prise-non-choisie', message: `le film « ${nom} » n'a pas de prise choisie : faire choisir une prise à la personne.` };
  const { film, dossier, erreurs } = lireFilm(projet, nom, parcours.prise);
  if (erreurs.length) return { regle: 'film-introuvable', message: erreurs[0] };
  return { film, prise: parcours.prise, dossier };
}

function lireEtapes(v) {
  if (v === undefined || v === null) return null;
  if (Number.isInteger(v) && v > 0) return [v];
  if (Array.isArray(v)) return v.every((x) => Number.isInteger(x) && x > 0) ? v.slice() : null;
  if (typeof v !== 'string') return null;
  const r = [];
  for (const morceau of v.split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(morceau);
    if (!m) return null;
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    if (!(a > 0 && b >= a)) return null;
    for (let k = a; k <= b; k++) r.push(k);
  }
  return r.length ? r : null;
}

// Cache des URI data: par chemin, taille et date (aperçu : réassemblé à chaque retouche).
const CACHE = new Map();
function uriImage(fichier) {
  const st = fs.statSync(fichier);
  const cle = `${fichier}|${st.size}|${st.mtimeMs}`;
  if (!CACHE.has(cle)) {
    CACHE.set(cle, `data:${MIME[path.extname(fichier).toLowerCase()]};base64,${fs.readFileSync(fichier).toString('base64')}`);
    if (CACHE.size > 4000) CACHE.delete(CACHE.keys().next().value);
  }
  return CACHE.get(cle);
}

function blocFilm(projet, nom, numeros) {
  const r = filmChoisi(projet, nom);
  if (!r.film) return { erreur: r };
  const voulus = new Set(numeros && numeros.length ? numeros : r.film.etapes.map((e) => e.n));
  const etapes = r.film.etapes.filter((e) => voulus.has(e.n));
  const noms = new Set();
  for (const e of etapes) {
    for (const k of ['avant', 'vue', 'survol', 'apres']) if (e[k]) noms.add(e[k]);
    for (const x of [...(e.approche || []), ...(e.reaction || [])]) noms.add(x[1]);
  }
  const images = {};
  let poids = 0;
  for (const n of [...noms].sort()) {
    const f = path.join(r.dossier, 'images', n);
    poids += fs.statSync(f).size;
    images[n] = uriImage(f);
  }
  const garder = (e) => {
    const { dit, url, flous, alertes, coupes, ...reste } = e;
    return reste;
  };
  const donnees = { version: r.film.version, nom, prise: r.prise, largeur: r.film.largeur, hauteur: r.film.hauteur, cadence: r.film.cadence,
    ...(r.film.bords ? { bords: r.film.bords } : {}), etapes: etapes.map(garder), images };
  const json = JSON.stringify(donnees).replace(/</g, '\\u003c');
  const id = `pm-film-${nom}`;
  return { id, html: `<script type="application/json" id="${id}">${json}</script>`, poids, images: noms.size, film: r.film, prise: r.prise };
}

module.exports = { VERSION, PRISE, ecrireParcours, validerFilm, lireFilm, prises, prochainePrise, choisirPrise, supprimerPrise, filmChoisi, lireEtapes, blocFilm, poidsPrise, dossierFilm, lireParcoursBrut };
