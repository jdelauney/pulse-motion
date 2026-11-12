'use strict';
/* Pulse Motion – registre des vidéos de la personne (spec Retouches et ergonomie, 5.21).
 *
 * ~/.pulse-motion/videos.json : [{ dossier, titre, creee, vue }]. Une entrée s'ajoute au début d'une création
 * (« etat --parcours ») et se met à jour à chaque assemblage (titre, vue). Écrit en passant : jamais pendant les tests sans
 * PULSE_MOTION_DOSSIER (lib/personnel.js), et un échec d'écriture ne bloque jamais la commande qui l'appelle.
 * listerVideos() : pour chaque entrée dont le dossier existe, titre, étape, durée, format, style, MP4 (fichier, poids, date) et
 * date de dernière modification ; un dossier disparu est marqué « introuvable » et gardé (jamais retiré sans accord).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { dossierPersonnelEcrivable, dossierPersonnel } = require('./personnel.js');
const { ecrireAtomique } = require('./fichiers.js');

const MAX = 200;
const fichierRegistre = (dossier) => path.join(dossier, 'videos.json');
const meme = (a, b) => (process.platform === 'win32' || process.platform === 'darwin' ? a.toLowerCase() === b.toLowerCase() : a === b);

function lireRegistre(dossier = dossierPersonnel()) {
  try {
    const j = JSON.parse(fs.readFileSync(fichierRegistre(dossier), 'utf8'));
    return Array.isArray(j) ? j.filter((e) => e && typeof e.dossier === 'string') : [];
  } catch { return []; }
}

/** Ajoute ou met à jour la vidéo du dossier. -> l'entrée, ou null si rien n'a été écrit. */
function noterVideo({ dossier, titre = null, personnel = dossierPersonnelEcrivable(), date = new Date() }) {
  if (!personnel || !dossier) return null;
  try {
    const projet = path.resolve(dossier);
    // Dossier temporaire (exemple d'un modèle ouvert pour voir, page de choix) : ce n'est pas une vidéo de la personne
    // (PM_VIDEOS_TEMP=1 : admis, pour les tests).
    const temp = path.resolve(os.tmpdir());
    if (process.env.PM_VIDEOS_TEMP !== '1' && meme(projet.slice(0, temp.length), temp)) return null;
    const liste = lireRegistre(personnel);
    const maintenant = date.toISOString();
    let entree = liste.find((e) => meme(path.resolve(e.dossier), projet));
    if (entree) {
      if (titre) entree.titre = titre;
      entree.vue = maintenant;
    } else {
      entree = { dossier: projet, titre: titre || null, creee: maintenant, vue: maintenant };
      liste.push(entree);
    }
    fs.mkdirSync(personnel, { recursive: true });
    ecrireAtomique(fichierRegistre(personnel), `${JSON.stringify(liste.slice(-MAX), null, 2)}\n`);
    return entree;
  } catch { return null; }
}

function derniereModification(projet) {
  let max = 0;
  const voir = (f) => { try { max = Math.max(max, fs.statSync(f).mtimeMs); } catch { /* absent */ } };
  voir(path.join(projet, 'deroule.json'));
  for (const sous of ['scenes', 'sortie']) {
    try { for (const f of fs.readdirSync(path.join(projet, sous))) if (/\.(html|mp4)$/.test(f)) voir(path.join(projet, sous, f)); } catch { /* absent */ }
  }
  return max ? new Date(max).toISOString() : null;
}

/** Le MP4 le plus récent de sortie/ qui porte le nom de la vidéo (tous usages). -> { fichier, octets, date } | null */
function dernierMp4(projet, titre) {
  const { slug } = require('../assembler.js');
  const base = slug(titre || 'video');
  let meilleur = null;
  try {
    for (const f of fs.readdirSync(path.join(projet, 'sortie'))) {
      if (!f.endsWith('.mp4') || !(f === `${base}.mp4` || f.startsWith(`${base}-`))) continue;
      const s = fs.statSync(path.join(projet, 'sortie', f));
      if (!meilleur || s.mtimeMs > meilleur.ms) meilleur = { fichier: `sortie/${f}`, octets: s.size, date: new Date(s.mtimeMs).toISOString(), ms: s.mtimeMs };
    }
  } catch { return null; }
  if (!meilleur) return null;
  const { ms, ...mp4 } = meilleur;
  return mp4;
}

/** -> { ok, videos: [...] } (la plus récemment vue d'abord). */
function listerVideos({ personnel = dossierPersonnel() } = {}) {
  const { lireDeroule } = require('./deroule.js');
  const videos = lireRegistre(personnel).map((e) => {
    const projet = path.resolve(e.dossier);
    if (!fs.existsSync(path.join(projet, 'deroule.json'))) return { dossier: e.dossier, titre: e.titre, introuvable: true, creee: e.creee, vue: e.vue };
    const { deroule } = lireDeroule(projet);
    let etape = null;
    try { etape = require('../etat.js').etatProjet(projet).etape; } catch { etape = null; }
    let duree = null;
    try { duree = deroule ? Math.round(require('./voix.js').dureeVideo(projet, deroule) * 10) / 10 : null; } catch { duree = null; }
    const titre = (deroule && deroule.titre) || e.titre;
    return {
      dossier: e.dossier, titre, introuvable: false, etape, duree,
      format: deroule && deroule.format ? deroule.format.ratio || null : null, style: deroule ? deroule.style || null : null,
      page: fs.existsSync(path.join(projet, 'sortie', `${require('../assembler.js').slug(titre || 'video')}.html`)) ? `sortie/${require('../assembler.js').slug(titre || 'video')}.html` : null,
      mp4: dernierMp4(projet, titre), modifiee: derniereModification(projet), creee: e.creee, vue: e.vue,
    };
  });
  videos.sort((a, b) => String(b.vue || '').localeCompare(String(a.vue || '')));
  return { ok: true, videos };
}

module.exports = { noterVideo, listerVideos, lireRegistre };
