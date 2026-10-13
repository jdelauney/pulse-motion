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
/** Même texte dit : identique, ou retouché seulement dans sa typographie (apostrophes, espaces, ponctuation, casse). */
function memeTexte(a, b) {
  if (a === b) return true;
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const cles = (t) => A.decouperMots(t).map((m) => m.cles[0]).join(' ');
  return cles(a) === cles(b);
}

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
  if (enregistres && enregistres.empreinte === sceau && memeTexte(enregistres.texte, scene.voix.texte) && Array.isArray(enregistres.mots)) {
    mots = enregistres.mots;
    approche = enregistres.approche || 'lettres';
    if (enregistres.echec) {
      alertes.push({ regle: 'transcription-echouee', gravite: 'alerte', scene: scene.id,
        message: `Scène « ${scene.id} » : ${enregistres.echec.replace(/\.$/, '')} ; relancer « pulse-motion voix transcrire », ou réenregistrer la scène.` });
    }
  } else {
    mots = A.calageApproche(scene.voix.texte, canal, son.taux);
    if (enregistres && enregistres.empreinte === sceau && typeof enregistres.texte === 'string' && enregistres.texte !== scene.voix.texte) {
      // Même prise, autre texte : la voix dit encore l'ancien.
      alertes.push({ regle: 'mots-perimes', gravite: 'alerte', scene: scene.id,
        message: prise.provisoire
          ? `Scène « ${scene.id} » : le texte dit a changé ; la voix provisoire lit encore l'ancien (relancer « pulse-motion voix provisoire --scene ${scene.id} »).`
          : `Scène « ${scene.id} » : le texte dit a changé depuis l'enregistrement ; la voix dit encore l'ancien texte : réenregistrer la scène (studio de l'aperçu) ou importer la nouvelle prise.` });
    } else if (enregistres && enregistres.approche === 'whisper') {
      alertes.push({ regle: 'mots-perimes', gravite: 'alerte', scene: scene.id,
        message: `Scène « ${scene.id} » : la prise ou son texte ont changé depuis la transcription ; mots calés approximativement (relancer « pulse-motion voix transcrire »).` });
    }
  }
  const opus = fichierOpus(prise.absolu);
  const opusValide = enregistres && enregistres.opus === sceau && fs.existsSync(opus);
  return { prise: { relatif: prise.relatif, provisoire: prise.provisoire }, duree, mots, approche, opus: opusValide ? relatifDe(projet, opus) : null, alertes };
}

/** Durée de la vidéo avec les scènes allongées par leur voix (délais maximaux de l'export et du contrôle). -> secondes */
function dureeVideo(projet, deroule) {
  const { calculerMinutage } = require('../../moteur/minutage.js');
  const { dureeTemps } = require('./deroule.js');
  const scenes = deroule.scenes.map((s) => {
    const v = s.voix && s.voix.texte ? lireVoixScene(projet, deroule, s) : null;
    return { ...s, voix: v && !v.erreur ? { debut: s.voix.debut, duree: v.duree } : undefined };
  });
  return calculerMinutage(scenes, {}, { dureeTemps: dureeTemps(deroule), decalageTemps: (deroule.tempo && deroule.tempo.decalage) || 0 }).duree;
}

/** Prise brute (WAV) -> prise prête, écrite avec ses mots (et son Opus si ffmpeg est donné). -> { relatif, duree } */
const borne = (t, max) => Math.round(Math.min(max, Math.max(0, t)) * 1000) / 1000;

/** mots (facultatifs) : temps mesurés sur la prise brute (transcription), recalés après le rognage. */
async function ecrirePrise({ projet, scene, octets, texte, provisoire = false, outil = null, mots = null, approche }) {
  const pret = W.preparerPrise(W.lire(octets));
  const wav = W.ecrire(pret);
  const relatif = `${DOSSIER_VOIX}/${provisoire ? 'provisoire/' : ''}${scene}.wav`;
  const absolu = path.join(projet, relatif);
  fs.mkdirSync(path.dirname(absolu), { recursive: true });
  fs.writeFileSync(absolu, wav);
  const sceau = empreinte(wav);
  const duree = Math.round(pret.canaux[0].length / pret.taux * 1000) / 1000;
  const calage = mots
    ? mots.map((m) => ({ w: m.w, t0: borne(m.t0 - pret.decalage, duree), t1: borne(m.t1 - pret.decalage, duree) }))
    : A.calageApproche(texte, pret.canaux[0], pret.taux);
  const donnees = { empreinte: sceau, texte, duree, approche: approche || (mots ? 'whisper' : 'lettres'), mots: calage };
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

/** Transcrit une prise du projet et réécrit ses mots (approche whisper). -> { ok, message? } */
/** WAV en PCM entier 16 bits (seul format lu par le script de transcription) ? */
function estPCM16(octets) {
  const b = Buffer.from(octets);
  for (let i = 12; i + 8 <= b.length; i += 8 + b.readUInt32LE(i + 4) + (b.readUInt32LE(i + 4) % 2)) {
    if (b.toString('latin1', i, i + 4) === 'fmt ') return [1, 0xFFFE].includes(b.readUInt16LE(i + 8)) && b.readUInt16LE(i + 22) === 16;
  }
  return false;
}

async function transcrirePrise({ projet, relatif, texte, whisper, surProgression }) {
  const absolu = path.join(projet, relatif);
  const octets = fs.readFileSync(absolu);
  const son = W.lire(new Uint8Array(octets));
  const duree = son.canaux[0].length / son.taux;
  // Prise posée à la main en flottant 32 bits : copie 16 bits pour la transcription.
  let wav = absolu, copie = null;
  if (!estPCM16(octets)) {
    copie = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'pm-transcrire-'));
    wav = path.join(copie, 'prise.wav');
    fs.writeFileSync(wav, W.ecrire(son));
  }
  let r;
  try { r = await whisper.transcrire({ wav, duree, surProgression }); } finally { if (copie) fs.rmSync(copie, { recursive: true, force: true }); }
  // Prise remplacée pendant la transcription (nouvelle prise du studio) : rien n'est écrit pour l'ancienne.
  const sceau = empreinte(octets);
  const remplacee = () => { try { return empreinte(fs.readFileSync(absolu)) !== sceau; } catch { return true; } };
  const ecrire = (champs) => {
    const ancien = lireJSON(fichierMots(absolu)) || {};
    const { echec, ...reste } = ancien;
    fs.writeFileSync(fichierMots(absolu), JSON.stringify({ ...reste, ...champs }, null, 2));
  };
  // Échec : gardé à côté de la prise (alerte transcription-echouee au contrôle), mots calés approximativement.
  const echouer = (message) => {
    if (!remplacee()) {
      const ancien = lireJSON(fichierMots(absolu)) || {};
      if (ancien.empreinte === sceau) fs.writeFileSync(fichierMots(absolu), JSON.stringify({ ...ancien, echec: message }, null, 2));
    }
    return { ok: false, message };
  };
  if (!r.ok) return echouer(r.message);
  const a = A.aligner(texte, r.mots, duree);
  if (!a) return echouer('La transcription n\'a reconnu aucun mot du texte : mots calés approximativement (vérifier que la prise dit bien le texte de la scène).');
  // Une prise qui ne dit plus son texte (texte réécrit) n'est pas déclarée transcrite : il faut la réenregistrer.
  const total = A.decouperMots(texte).length;
  if (a.reconnus < total / 2) {
    return echouer(`La transcription a reconnu moins de la moitié des mots du texte (${a.reconnus} sur ${total}) : la prise ne dit peut-être plus ce texte ; la réenregistrer si besoin (mots calés approximativement).`);
  }
  if (remplacee()) return { ok: false, message: 'La prise a été remplacée pendant la transcription : ses mots ne sont pas gardés.' };
  ecrire({ empreinte: sceau, texte, duree: Math.round(duree * 1000) / 1000, approche: 'whisper', mots: a.mots });
  return { ok: true };
}

/** Scènes qui jouent encore la voix provisoire du système. -> [id] */
function scenesProvisoires(projet, deroule) {
  return deroule.scenes.filter((s) => { const p = priseDeScene(projet, deroule, s); return p && p.provisoire; }).map((s) => s.id);
}

function messageProvisoire(ids) {
  return `La vidéo contient encore la voix provisoire (scènes : ${ids.join(', ')}) : enregistrez votre voix, ou exportez quand même avec --avec-provisoire.`;
}

module.exports = { DOSSIER_VOIX, empreinte, priseDeScene, lireVoixScene, dureeVideo, ecrirePrise, transcrirePrise, scenesProvisoires, messageProvisoire };
