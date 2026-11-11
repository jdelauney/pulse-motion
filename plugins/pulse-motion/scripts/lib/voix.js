'use strict';
/* Pulse Motion – voix d'un projet : prises (assets/voix/<scène>.wav, voix de synthèse dans assets/voix/synthese/, voix
 * provisoire dans assets/voix/provisoire/),
 * mots calés à côté (<prise>.mots.json, empreinte de la prise), Opus pour une page plus légère.
 * Texte dit balisé (spec S7, 5.11 ; moteur/aligner.js, lireTexteDit) : la prise est calée sur la forme dite (avec la
 * prononciation du glossaire pour la voix provisoire), puis les mots sont gardés dans la forme affichée (forme « affichee »
 * dans <prise>.mots.json), avec la forme dite d'un {affiché|dit} ; les repères [#nom] sont datés. */
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

/** Prise utilisée par une scène, ou null : la prise de la personne, puis la voix de synthèse (spec S7, 5.12), puis la
 *  voix provisoire. -> { relatif, absolu, provisoire, synthese? } | { relatif, erreur } */
function priseDeScene(projet, deroule, scene) {
  if (!scene.voix) return null;
  if (scene.voix.fichier) {
    const absolu = cheminDansProjet(projet, scene.voix.fichier);
    if (!absolu) return { relatif: scene.voix.fichier, erreur: `Scène « ${scene.id} » : la voix « ${scene.voix.fichier} » doit être dans le dossier du projet ; ${conseilImport(scene.id)}.` };
    return { relatif: scene.voix.fichier, absolu, provisoire: false };
  }
  if (deroule.voix && deroule.voix.synthese) {
    const relatif = `${DOSSIER_VOIX}/synthese/${scene.id}.wav`;
    const absolu = path.join(projet, relatif);
    if (fs.existsSync(absolu)) return { relatif, absolu, provisoire: false, synthese: true };
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

/** Prononciations du glossaire du projet (charte/glossaire.md, colonne Prononciation) : { terme: prononciation }. */
function prononciationsDuProjet(projet) {
  try {
    const { lireGlossaire } = require('../vocabulaire.js');
    return Object.fromEntries(lireGlossaire(projet).termes.filter((t) => t.prononciation).map((t) => [t.terme, t.prononciation]));
  } catch { return {}; }
}

/** Texte dit lu pour une prise : la voix provisoire et la voix de synthèse (machine vrai) appliquent la prononciation du
 *  glossaire ; une prise enregistrée se cale sur la forme dite explicite. */
function texteDitPour(projet, texte, machine) {
  return A.lireTexteDit(texte, machine ? { prononciations: prononciationsDuProjet(projet) } : {});
}

/** Seuil de mots reconnus d'une voix vérifiée par la transcription (spec S7, 5.13). */
const SEUIL_RECONNUS = 0.85;

/** Alerte d'une vérification gardée à côté de la prise : voix de synthèse mal lue, ou enregistrement qui ne correspond pas
 *  au texte de la scène. -> alerte | null */
function alerteVerification(scene, verification, synthese) {
  if (!verification || !(verification.taux < SEUIL_RECONNUS)) return null;
  const pct = Math.round(verification.taux * 100);
  const mots = (verification.aVerifier || []).slice(0, 3).map((x) => `« ${x.mot} »${x.entendu ? ` (entendu « ${x.entendu} »)` : ''}`);
  return synthese
    ? { regle: 'voix-mal-lue', gravite: 'alerte', scene: scene.id,
      message: `Scène « ${scene.id} » : la voix de synthèse lit mal une partie du texte (${pct} % des mots reconnus${mots.length ? ` ; à vérifier : ${mots.join(', ')}` : ''}) : corriger la prononciation par le glossaire, ou écrire {affiché|dit} dans le texte dit.` }
    : { regle: 'voix-ecart-texte', gravite: 'alerte', scene: scene.id,
      message: `Scène « ${scene.id} » : l'enregistrement ne correspond pas au texte de la scène (${pct} % des mots reconnus) : l'écouter, et réenregistrer la scène seule si besoin.` };
}

/** Mots enregistrés -> mots affichés : déjà dans cette forme (« affichee »), sinon (ancien fichier, ou mots de la forme
 *  dite) convertis. */
function versAffiches(lu, enregistres) {
  if (enregistres.forme === 'affichee') return enregistres.mots;
  return A.motsAffiches(lu, enregistres.mots);
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
  const machine = prise.provisoire || Boolean(prise.synthese);
  const lu = texteDitPour(projet, scene.voix.texte, machine);
  if (enregistres && enregistres.empreinte === sceau && memeTexte(enregistres.texte, scene.voix.texte) && Array.isArray(enregistres.mots)) {
    mots = versAffiches(lu, enregistres);
    approche = enregistres.approche || 'lettres';
    const verifiee = alerteVerification(scene, enregistres.verification, prise.synthese);
    if (verifiee) alertes.push(verifiee);
    if (enregistres.echec) {
      alertes.push({ regle: 'transcription-echouee', gravite: 'alerte', scene: scene.id,
        message: `Scène « ${scene.id} » : ${enregistres.echec.replace(/\.$/, '')} ; relancer « pulse-motion voix transcrire », ou réenregistrer la scène.` });
    }
  } else {
    mots = A.motsAffiches(lu, A.calageApproche(lu.dit, canal, son.taux));
    if (enregistres && enregistres.empreinte === sceau && typeof enregistres.texte === 'string' && enregistres.texte !== scene.voix.texte) {
      // Même prise, autre texte : la voix dit encore l'ancien.
      alertes.push({ regle: 'mots-perimes', gravite: 'alerte', scene: scene.id,
        message: prise.provisoire
          ? `Scène « ${scene.id} » : le texte dit a changé ; la voix provisoire lit encore l'ancien (relancer « pulse-motion voix provisoire --scene ${scene.id} »).`
          : prise.synthese
            ? `Scène « ${scene.id} » : le texte dit a changé ; la voix de synthèse lit encore l'ancien (relancer « pulse-motion voix synthese --scene ${scene.id} »).`
            : `Scène « ${scene.id} » : le texte dit a changé depuis l'enregistrement ; la voix dit encore l'ancien texte : réenregistrer la scène (studio de l'aperçu) ou importer la nouvelle prise.` });
    } else if (enregistres && enregistres.approche === 'whisper') {
      alertes.push({ regle: 'mots-perimes', gravite: 'alerte', scene: scene.id,
        message: `Scène « ${scene.id} » : la prise ou son texte ont changé depuis la transcription ; mots calés approximativement (relancer « pulse-motion voix transcrire »).` });
    }
  }
  const opus = fichierOpus(prise.absolu);
  const opusValide = enregistres && enregistres.opus === sceau && fs.existsSync(opus);
  return { prise: { relatif: prise.relatif, provisoire: prise.provisoire, ...(prise.synthese ? { synthese: true } : {}) }, duree, mots, reperes: A.reperesDates(lu, mots), approche, opus: opusValide ? relatifDe(projet, opus) : null, alertes };
}

/** Durée de la vidéo avec les scènes allongées par leur voix (délais maximaux de l'export et du contrôle). -> secondes */
function dureeVideo(projet, deroule) {
  return minutageVideo(projet, deroule).duree;
}

/** Minutage des scènes de la vidéo (débuts, fins, entrées), voix comprises, sans ouvrir la page (extraits, chapitres). */
function minutageVideo(projet, deroule) {
  const { calculerMinutage } = require('../../moteur/minutage.js');
  const { optionsMinutage } = require('./deroule.js');
  const scenes = deroule.scenes.map((s) => {
    const v = s.voix && s.voix.texte ? lireVoixScene(projet, deroule, s) : null;
    return { ...s, voix: v && !v.erreur ? { debut: s.voix.debut, duree: v.duree } : undefined };
  });
  return calculerMinutage(scenes, {}, optionsMinutage(deroule));
}

/** Prise brute (WAV) -> prise prête, écrite avec ses mots (et son Opus si ffmpeg est donné). -> { relatif, duree } */
const borne = (t, max) => Math.round(Math.min(max, Math.max(0, t)) * 1000) / 1000;

/** mots (facultatifs) : temps mesurés sur la prise brute (transcription), recalés après le rognage. */
/** synthese : voix de synthèse (assets/voix/synthese/) ; extra : champs gardés à côté des mots (empreinte de fabrication,
 *  vérification). */
async function ecrirePrise({ projet, scene, octets, texte, provisoire = false, synthese = false, outil = null, mots = null, approche, extra = {} }) {
  // mots : de la forme dite (transcription, découpe, synthèse). Gardés dans la forme affichée (spec S7, 5.11).
  const lu = texteDitPour(projet, texte, provisoire || synthese);
  const pret = W.preparerPrise(W.lire(octets));
  const wav = W.ecrire(pret);
  const relatif = `${DOSSIER_VOIX}/${provisoire ? 'provisoire/' : synthese ? 'synthese/' : ''}${scene}.wav`;
  const absolu = path.join(projet, relatif);
  fs.mkdirSync(path.dirname(absolu), { recursive: true });
  fs.writeFileSync(absolu, wav);
  const sceau = empreinte(wav);
  const duree = Math.round(pret.canaux[0].length / pret.taux * 1000) / 1000;
  const calage = mots
    ? mots.map((m) => ({ w: m.w, t0: borne(m.t0 - pret.decalage, duree), t1: borne(m.t1 - pret.decalage, duree) }))
    : A.calageApproche(lu.dit, pret.canaux[0], pret.taux);
  const donnees = { ...extra, empreinte: sceau, texte, duree, approche: approche || (mots ? 'whisper' : 'lettres'), forme: 'affichee', mots: A.motsAffiches(lu, calage) };
  fs.rmSync(fichierOpus(absolu), { force: true });
  if (outil && outil.present) {
    try {
      await F.encoderOpus({ ffmpeg: outil.chemin, wav: absolu, sortie: fichierOpus(absolu) });
      donnees.opus = sceau;
    } catch { /* la page embarquera le WAV */ }
  }
  fs.writeFileSync(fichierMots(absolu), JSON.stringify(donnees, null, 2), 'utf8');
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

/** verifier (voix de synthèse, spec S7, 5.13) : taux de mots reconnus et mots à vérifier, gardés à côté des mots
 *  (« verification ») et rendus. -> { ok, message?, verification? } */
async function transcrirePrise({ projet, relatif, texte, whisper, surProgression, provisoire = false, synthese = false, verifier = false }) {
  const lu = texteDitPour(projet, texte, provisoire || synthese);
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
  try { r = await whisper.transcrire({ wav, duree, surProgression, attendu: lu.dit }); } finally { if (copie) fs.rmSync(copie, { recursive: true, force: true }); }
  // Prise remplacée pendant la transcription (nouvelle prise du studio) : rien n'est écrit pour l'ancienne.
  const sceau = empreinte(octets);
  const remplacee = () => { try { return empreinte(fs.readFileSync(absolu)) !== sceau; } catch { return true; } };
  const ecrire = (champs) => {
    const ancien = lireJSON(fichierMots(absolu)) || {};
    const { echec, ...reste } = ancien;
    fs.writeFileSync(fichierMots(absolu), JSON.stringify({ ...reste, ...champs }, null, 2), 'utf8');
  };
  // Échec : gardé à côté de la prise (alerte transcription-echouee au contrôle), mots calés approximativement.
  let verification;
  const echouer = (message) => {
    if (!remplacee()) {
      const ancien = lireJSON(fichierMots(absolu)) || {};
      if (ancien.empreinte === sceau) fs.writeFileSync(fichierMots(absolu), JSON.stringify({ ...ancien, echec: message, ...(verification ? { verification } : {}) }, null, 2), 'utf8');
    }
    return { ok: false, message, ...(verification ? { verification } : {}) };
  };
  if (!r.ok) return echouer(r.message);
  const a = A.aligner(lu.dit, r.mots, duree);
  const total = A.decouperMots(lu.dit).length;
  if (verifier) {
    verification = { taux: total && a ? Math.round(a.reconnus / total * 1000) / 1000 : 0,
      aVerifier: a ? a.ecarts.map((x) => ({ mot: x.mot.replace(/[.,;:!?…»«"]+/g, '').trim() || x.mot, entendu: x.entendu })) : [] };
  }
  if (!a) return echouer('La transcription n\'a reconnu aucun mot du texte : mots calés approximativement (vérifier que la prise dit bien le texte de la scène).');
  // Une prise qui ne dit plus son texte (texte réécrit) n'est pas déclarée transcrite : il faut la réenregistrer.
  if (a.reconnus < total / 2) {
    return echouer(`La transcription a reconnu moins de la moitié des mots du texte (${a.reconnus} sur ${total}) : la prise ne dit peut-être plus ce texte ; la réenregistrer si besoin (mots calés approximativement).`);
  }
  if (remplacee()) return { ok: false, message: 'La prise a été remplacée pendant la transcription : ses mots ne sont pas gardés.' };
  ecrire({ empreinte: sceau, texte, duree: Math.round(duree * 1000) / 1000, approche: 'whisper', forme: 'affichee', mots: A.motsAffiches(lu, a.mots), ...(verification ? { verification } : {}) });
  return { ok: true, ...(verification ? { verification } : {}) };
}

/** Scènes qui jouent encore la voix provisoire du système. -> [id] */
function scenesProvisoires(projet, deroule) {
  return deroule.scenes.filter((s) => { const p = priseDeScene(projet, deroule, s); return p && p.provisoire; }).map((s) => s.id);
}

/**
 * Empreinte des prises provisoires (spec Retouches et ergonomie, 5.17) : liste des scènes et contenu de leurs fichiers ; un
 * accord « voix provisoire » ne vaut que pour cette empreinte (il tombe dès qu'une prise provisoire change). -> texte | null
 */
function empreinteProvisoire(projet, deroule) {
  const crypto = require('node:crypto');
  const h = crypto.createHash('sha256');
  let n = 0;
  for (const s of deroule.scenes) {
    const p = priseDeScene(projet, deroule, s);
    if (!p || !p.provisoire) continue;
    n++;
    h.update(`${s.id}\n`);
    try { h.update(fs.readFileSync(p.absolu)); } catch { h.update('absent'); }
    h.update('\n');
  }
  return n ? h.digest('hex').slice(0, 32) : null;
}

/** Voix entendue dans la vidéo (résultat de l'export, spec S7, 5.12) : « personne », « synthese », « provisoire », « mixte »
 *  (plusieurs sortes), ou null (aucune voix). */
function natureVoix(projet, deroule) {
  const sortes = new Set();
  for (const s of deroule.scenes) {
    const p = priseDeScene(projet, deroule, s);
    if (!p || p.erreur) continue;
    sortes.add(p.provisoire ? 'provisoire' : p.synthese ? 'synthese' : 'personne');
  }
  return sortes.size === 0 ? null : sortes.size === 1 ? [...sortes][0] : 'mixte';
}

/** Nom d'un export fait avec la voix provisoire (5.17) : « <nom>-version-de-travail.mp4 », jamais le nom du définitif. */
function nomVersionDeTravail(nom) {
  return String(nom).replace(/(\.[a-z0-9]+)$/i, '-version-de-travail$1');
}

function messageProvisoire(ids) {
  return `La vidéo contient encore la voix provisoire (scènes : ${ids.join(', ')}) : enregistrez votre voix d'abord, ou exportez une version de travail (un fichier à part, le MP4 définitif n'est pas touché).`;
}

module.exports = { SEUIL_RECONNUS, alerteVerification, natureVoix, prononciationsDuProjet, texteDitPour, minutageVideo, DOSSIER_VOIX, empreinte, priseDeScene, lireVoixScene, dureeVideo, ecrirePrise, transcrirePrise, scenesProvisoires, messageProvisoire,
  empreinteProvisoire, nomVersionDeTravail };
