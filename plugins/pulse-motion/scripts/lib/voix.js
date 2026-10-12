'use strict';
/* Pulse Motion – voix d'un projet : prises (assets/voix/<scène>.wav, voix provisoire dans assets/voix/provisoire/),
 * mots calés à côté (<prise>.mots.json, empreinte de la prise), Opus pour une page plus légère. */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const W = require('../../moteur/wav.js');
const A = require('../../moteur/aligner.js');
const F = require('./ffmpeg.js');
const { cheminDansProjet } = require('./embarquer.js');

const DOSSIER_VOIX = 'assets/voix';

const empreinte = (octets) => crypto.createHash('sha256').update(octets).digest('hex');
const fichierMots = (absolu) => absolu.replace(/\.wav$/i, '') + '.mots.json';
const fichierOpus = (absolu) => absolu.replace(/\.wav$/i, '') + '.opus';
const relatifDe = (projet, absolu) => path.relative(projet, absolu).replace(/\\/g, '/');

const conseilImport = (id) => `utilisez « pulse-motion voix importer <fichier> --scene ${id} »`;

/** Prise utilisée par une scène, ou null. -> { relatif, absolu, provisoire } | { relatif, erreur } */
function priseDeScene(projet, deroule, scene) {
  if (!scene.voix) return null;
  if (scene.voix.fichier) {
    const absolu = cheminDansProjet(projet, scene.voix.fichier);
    if (!absolu) return { relatif: scene.voix.fichier, erreur: `Scène « ${scene.id} » : la voix « ${scene.voix.fichier} » doit être dans le dossier du projet ; ${conseilImport(scene.id)}.` };
    return { relatif: scene.voix.fichier, absolu, provisoire: false };
  }
  if (deroule.voix && deroule.voix.provisoire) {
    const relatif = `${DOSSIER_VOIX}/provisoire/${scene.id}.wav`;
    const absolu = path.join(projet, relatif);
    if (fs.existsSync(absolu)) return { relatif, absolu, provisoire: true };
  }
  return null;
}

function lireJSON(fichier) {
  try { return JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch { return null; }
}

/** Voix d'une scène prête pour la page. -> null | { prise, erreur } | { prise, duree, mots, approche, opus, alertes } */
function lireVoixScene(projet, deroule, scene) {
  const prise = priseDeScene(projet, deroule, scene);
  if (!prise) return null;
  if (prise.erreur) return { prise, erreur: prise.erreur };
  let octets;
  let son;
  try {
    octets = fs.readFileSync(prise.absolu);
    son = W.lire(new Uint8Array(octets));
  } catch (e) {
    return { prise, erreur: `Scène « ${scene.id} » : la voix « ${prise.relatif} » est illisible (${e.code === 'ENOENT' ? 'fichier introuvable' : e.message}) ; ${conseilImport(scene.id)}.` };
  }
  const canal = W.mono(son.canaux);
  const duree = Math.round(canal.length / son.taux * 1000) / 1000;
  const sceau = empreinte(octets);
  const enregistres = lireJSON(fichierMots(prise.absolu));
  const alertes = [];
  let mots;
  let approche = 'lettres';
  if (enregistres && enregistres.empreinte === sceau && enregistres.texte === scene.voix.texte && Array.isArray(enregistres.mots)) {
    mots = enregistres.mots;
    approche = enregistres.approche || 'lettres';
  } else {
    mots = A.calageApproche(scene.voix.texte, canal, son.taux);
    if (enregistres && enregistres.approche === 'whisper') {
      alertes.push({ regle: 'mots-perimes', gravite: 'alerte', scene: scene.id,
        message: `Scène « ${scene.id} » : la prise ou son texte ont changé depuis la transcription ; mots calés approximativement (relancer « pulse-motion voix transcrire »).` });
    }
  }
  const opus = fichierOpus(prise.absolu);
  const opusValide = enregistres && enregistres.opus === sceau && fs.existsSync(opus);
  return { prise: { relatif: prise.relatif, provisoire: prise.provisoire }, duree, mots, approche, opus: opusValide ? relatifDe(projet, opus) : null, alertes };
}

/** Prise brute (WAV) -> prise prête, écrite avec ses mots (et son Opus si ffmpeg est donné). -> { relatif, duree } */
async function ecrirePrise({ projet, scene, octets, texte, provisoire = false, outil = null }) {
  const pret = W.preparerPrise(W.lire(octets));
  const wav = W.ecrire(pret);
  const relatif = `${DOSSIER_VOIX}/${provisoire ? 'provisoire/' : ''}${scene}.wav`;
  const absolu = path.join(projet, relatif);
  fs.mkdirSync(path.dirname(absolu), { recursive: true });
  fs.writeFileSync(absolu, wav);
  const sceau = empreinte(wav);
  const duree = Math.round(pret.canaux[0].length / pret.taux * 1000) / 1000;
  const donnees = { empreinte: sceau, texte, duree, approche: 'lettres', mots: A.calageApproche(texte, pret.canaux[0], pret.taux) };
  fs.rmSync(fichierOpus(absolu), { force: true });
  if (outil && outil.present) {
    try {
      await F.encoderOpus({ ffmpeg: outil.chemin, wav: absolu, sortie: fichierOpus(absolu) });
      donnees.opus = sceau;
    } catch { /* la page embarquera le WAV */ }
  }
  fs.writeFileSync(fichierMots(absolu), JSON.stringify(donnees, null, 2));
  return { relatif, duree };
}

/** Scènes qui jouent encore la voix provisoire du système. -> [id] */
function scenesProvisoires(projet, deroule) {
  return deroule.scenes.filter((s) => { const p = priseDeScene(projet, deroule, s); return p && p.provisoire; }).map((s) => s.id);
}

function messageProvisoire(ids) {
  return `La vidéo contient encore la voix provisoire (scènes : ${ids.join(', ')}) : enregistrez votre voix, ou exportez quand même avec --avec-provisoire.`;
}

module.exports = { DOSSIER_VOIX, empreinte, priseDeScene, lireVoixScene, ecrirePrise, scenesProvisoires, messageProvisoire };
