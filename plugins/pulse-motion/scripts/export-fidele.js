#!/usr/bin/env node
'use strict';
/* Pulse Motion – export fidèle : vraies captures d'écran de la page (Chrome ou Edge sans fenêtre), encodées par
 * ffmpeg en segments alignés sur les scènes (10 s au plus), capturés par plusieurs navigateurs en parallèle selon la
 * machine, gardés d'un export à l'autre sous l'empreinte de leurs pixels (une retouche ne recapture que les scènes
 * changées), assemblés sans réencodage avec le son de la page (mixage du moteur, −16 LUFS), vérifiés (ffprobe, sonie,
 * images comparées aux captures). Spec Rapidité 5.14 à 5.18. Export par usage (spec Rendu et export, 5.1 à 5.7) : réglages
 * de scripts/usages.json, couleurs BT.709 étiquetées, intermédiaire commun dont dérivent les usages, taille visée en deux
 * passes, brouillon par l'encodeur de la carte graphique, contrôles du fichier (étiquettes, taille).
 *
 *   node scripts/export-fidele.js <dossier-du-projet> [--pour <usage>] [--taille-max <Mo>] [--qualite 1080p|720p|540p] [--ips 30|60]
 *
 * Dossier de travail sortie/.export/ :
 *   verrou                                      un seul export à la fois par projet (pid, date) ;
 *   segments/pixels/<empreinte des pixels et de l'intermédiaire>-<morceau>.mp4   intermédiaire d'un segment : CRF 14
 *                                               medium, commun à tous les usages qui ont les mêmes images (le master et le
 *                                               brouillon ont le leur, qui est leur fichier même) ;
 *   segments/<empreinte du fichier dérivé>-<morceau>.mp4   segment d'un usage : écrit en même temps que l'intermédiaire
 *                                               (une seule passe de ffmpeg), ou réencodé depuis lui sans recapture ;
 *   segments/dernier.json                       segments du dernier export réussi (gardés avec ceux de l'export en cours) ;
 *   segments/pixels/<…>.mp4.stats.json          statistiques image par image du segment (spec S2, 5.12), gardées avec lui ;
 *   profil.json                                 temps cumulé par phase (PM_PROFIL=1) ;
 *   courriel-source.mp4, passe*                 vidéo assemblée et journal des deux passes d'une taille visée (retirés).
 * Suivi dans sortie/export.json ; résumé JSON ; code 1 en cas d'échec.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assembler, slug, ecrireSousTitres, lireMoteur, RACINE } = require('./assembler.js');
const { lireDeroule, optionsMinutage } = require('./lib/deroule.js');
const { trouverNavigateur } = require('./lib/navigateur.js');
const { ouvrirCapture } = require('./lib/capture-fidele.js');
const F = require('./lib/ffmpeg.js');
const { cheminDansProjet } = require('./lib/embarquer.js');
const { scenesProvisoires, messageProvisoire, minutageVideo } = require('./lib/voix.js');
const L = require('./lib/livrables.js');
const CADRE = require('../moteur/cadres/telephone.js');
const minutageModule = require('../moteur/minutage.js');
const U = require('./lib/usages.js');
const ME = require('./lib/mesures-export.js');
const { dossierPersonnel } = require('./lib/personnel.js');
const { navigateursParalleles, enParallele } = require('./lib/paralleles.js');
const { decouperSegments, empreintesPixels, empreinteDerivee, stable } = require('./lib/empreintes.js');
const V = require('./lib/verification.js');
const { joindre, analyserSerie } = require('./lib/series.js');
const SEUILS = require('./seuils.json');

const TAILLES = {
  '1080p': { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] },
  '720p': { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [720, 720], '4:5': [720, 900] },
  '540p': { '16:9': [960, 540], '9:16': [540, 960], '1:1': [540, 540], '4:5': [540, 676] },
};
/** Intermédiaire commun (spec Rendu et export, décision 1) : capturé une fois, chaque usage en dérive. */
const INTERMEDIAIRE = { crf: 14, preset: 'medium' };
/** Usages dont l'intermédiaire est le fichier lui-même : le master (CRF 14 slow), le brouillon (rapide, jamais réutilisé). */
const INTERMEDIAIRE_PROPRE = new Set(['master', 'brouillon']);
const ECART_MAX = 0.02;
const VERROU_PERIME = 24 * 3600 * 1000;
/** Message du verrou (spec Rendu et export, 5.23 point 1) : l'heure du premier export, « 14 h 02 ». */
function messageVerrou(depuis) {
  const d = new Date(depuis);
  if (!depuis || Number.isNaN(d.getTime())) return 'Un export de cette vidéo est déjà en cours : attendez sa fin.';
  return `Un export de cette vidéo est déjà en cours (commencé à ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}) : attendez sa fin.`;
}
/** Nom de l'usage dans les messages. */
const NOM_COURT = { web: 'web', reseaux: 'réseaux', presentation: 'présentation', master: 'master', courriel: 'courriel', brouillon: 'de travail' };
const GARDES = new Set(['segments', 'verrou']);

/** Code dont dépendent les pixels capturés, en plus de la page : moteur inclus dans la page, capture, pilote du navigateur et ses drapeaux. */
const CODE_CAPTURE = ['capture-fidele.js', 'cdp.js', 'navigateur.js'].map((f) => path.join(__dirname, 'lib', f));
function codeCapture(assemblage) {
  return String(assemblage.moteur || lireMoteur(RACINE)) + CODE_CAPTURE.map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');
}

/** Le projet demande-t-il WebGPU (Chrome gardera alors le GPU) ? Un effet de particules, un milieu (P5c) ou un fond par shader dans une
 *  scène, une transition par shader ou un post-traitement dans le déroulé. */
function avecEffets(projet, deroule) {
  const shaderDeroule = (deroule.post || []).length > 0
    || deroule.scenes.some((s) => (s.post || []).length > 0 || (s.transition && typeof s.transition === 'object'));
  return shaderDeroule || deroule.scenes.some((s) => {
    try { return /\sdata-(?:effet|milieu|shader)\s*=/.test(fs.readFileSync(path.join(projet, s.fichier), 'utf8')); } catch { return false; }
  });
}

/** Première image du segment fidèle à sa référence (capture de la page, ou première image de l'intermédiaire) ; taille : celle
 *  de la référence, si le segment est plus petit (sortie réduite). */
async function premiereImageJuste(outil, fichier, reference, taille) {
  if (!reference) return false;
  try {
    return F.ecartImages(await F.extraireImage({ ffmpeg: outil.chemin, fichier, t: 0, taille }), reference) <= ECART_MAX;
  } catch { return false; }
}

/** Segment valide : lisible, H.264, à la taille et avec le nombre d'images attendus (compté par paquets, sans décoder). */
async function segmentValide(outil, fichier, attendu) {
  if (!fs.existsSync(fichier)) return false;
  try {
    const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier, compter: 'paquets' });
    return s.video === 'h264' && s.largeur === attendu.largeur && s.hauteur === attendu.hauteur && s.images === attendu.images;
  } catch { return false; }
}

const processusVivant = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

/** Verrou d'export (spec Rapidité 5.16.5). -> { ok, liberer() } ; un verrou dont le processus n'existe plus est repris. */
function prendreVerrou(travail) {
  const fichier = path.join(travail, 'verrou');
  const jeton = crypto.randomBytes(8).toString('hex');
  for (let essai = 0; essai < 3; essai++) {
    try {
      fs.writeFileSync(fichier, JSON.stringify({ pid: process.pid, date: new Date().toISOString(), jeton }), { encoding: 'utf8', flag: 'wx' });
      return {
        ok: true,
        liberer() {
          try { if (JSON.parse(fs.readFileSync(fichier, 'utf8')).jeton === jeton) fs.rmSync(fichier, { force: true }); } catch { /* déjà retiré */ }
        },
      };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    let v = null;
    try { v = JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch { /* illisible : repris */ }
    const recent = v && Date.now() - Date.parse(v.date) < VERROU_PERIME;
    if (v && recent && processusVivant(v.pid)) return { ok: false, depuis: v.date };
    fs.rmSync(fichier, { force: true });
  }
  return { ok: false };
}

/** Profil d'export (PM_PROFIL=1, spec Rapidité 5.14.1) : temps cumulé par phase, en millisecondes (tous navigateurs). */
function creerProfil(actif) {
  const phases = {};
  const ajouter = (phase, ms) => { phases[phase] = (phases[phase] || 0) + ms; };
  return {
    actif,
    ajouter: actif ? ajouter : undefined,
    async mesurer(phase, fn) {
      if (!actif) return fn();
      const t0 = performance.now();
      try { return await fn(); } finally { ajouter(phase, performance.now() - t0); }
    },
    phases,
  };
}

const nomSegment = (empreinte, morceau) => `${empreinte}-${String(morceau).padStart(2, '0')}.mp4`;
const retirer = (f) => { try { fs.rmSync(f, { force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* laissé */ } };
const navigateurArrete = (e) => /navigateur s'est arrêté/.test(String(e && e.message));

/**
 * exporterFidele({ dossier, pour?, qualite?, ips?, tailleMax?, navigateur?, outil?, dossierStyles?, dossierEffets?, surProgression?,
 *                  surPhase?, signal?, dureeSegment?, arreterApres?, paralleles?, avecProvisoire?, encodage?, parametresPixels?,
 *                  profil?, surOuverture?, whisper?, debitCourriel?, encodeurMateriel? })
 * pour : usage d'export (scripts/usages.json, web par défaut) ; qualite et ips priment sur l'usage ; tailleMax en Mo.
 * encodage : réglages du fichier dérivé, remplacent ceux de l'usage (tests). parametresPixels : réglages qui changent les pixels,
 * ajoutés à l'empreinte des pixels. surOuverture(capture) : chaque page ouverte (tests). surProgression(faites, total, { reprises }) ;
 * surPhase(nom) : « son », « assemblage », « seconde-passe », « verification ». debitCourriel(v, essai) : débit des deux passes
 * (tests du dépassement). encodeurMateriel : { encodeur } imposé (tests), sinon détecté (~/.pulse-motion/encodeurs.json). tailleFichier(fichier, essai) :
 * taille lue après chaque essai d'une taille visée (tests du dépassement).
 * whisper : { pret, transcrire } de la réécoute (tests ; par défaut la transcription installée). Résultat : usage, octets,
 * taille, definition, ips, fichiers, verification { erreurs, alertes, fichier } (sortie/verification.json, spec S2 5.12) ;
 * un noir ou un silence absent de la page, des couleurs non étiquetées ou une taille dépassée font échouer l'export.
 */
async function exporterFidele({ dossier, pour, qualite, ips, tailleMax, navigateur = trouverNavigateur(), outil = F.trouverFfmpeg(), dossierStyles,
  dossierEffets = path.join(RACINE, 'effets'), surProgression = () => {}, surPhase = () => {}, signal, dureeSegment = 10, arreterApres, paralleles, avecProvisoire = false,
  encodage, parametresPixels = {}, profil = process.env.PM_PROFIL === '1', surOuverture = () => {}, whisper = null, debitCourriel = (v) => v,
  encodeurMateriel = null, tailleFichier = (f) => fs.statSync(f).size, scene = null, plage = null, gif = false, largeurGif = null, cadre = null, cadreFormat = null } = {}) {
  const debutExport = performance.now();
  const projet = path.resolve(dossier);
  const sortieDir = path.join(projet, 'sortie');
  const suivi = path.join(sortieDir, 'export.json');
  const etat = (e) => { fs.mkdirSync(sortieDir, { recursive: true }); fs.writeFileSync(suivi, JSON.stringify({ ...e, mode: 'fidele', date: new Date().toISOString() }, null, 2), 'utf8'); };
  if (!outil || !outil.present || outil.versionOk === false) return { ok: false, audio: false, message: (outil && outil.message) || 'ffmpeg n\'est pas installé.' };
  if (!navigateur) return { ok: false, audio: false, message: 'Chrome ou Edge introuvable : installez l\'un des deux, ou indiquez son chemin avec la variable PM_NAVIGATEUR.' };

  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, audio: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  const provisoires = scenesProvisoires(projet, deroule);
  if (provisoires.length && !avecProvisoire) return { ok: false, audio: false, message: messageProvisoire(provisoires) };
  // Usage et réglages effectifs, avant toute capture (une taille visée impossible est refusée ici). Un GIF est capturé comme
  // l'usage web (l'usage courriel ne change que sa largeur).
  const minutageNode = minutageVideo(projet, deroule);
  let u = U.resoudreUsage({ pour: gif ? 'web' : pour, qualite, ips, tailleMax: gif ? undefined : tailleMax, deroule, duree: minutageNode.duree });
  if (u.erreur) return { ok: false, audio: false, message: u.erreur, ...(u.propositionMo ? { propositionMo: u.propositionMo } : {}) };
  // Extrait d'une scène, passage seul, GIF, cadre de téléphone (spec Rendu et export, 5.12, 5.13, 5.15) : vérifiés ici.
  const demande = L.preparerSortie({ deroule, minutage: minutageNode, ips: u.ips, scene, plage, gif, cadre, cadreFormat });
  if (demande.erreur) return { ok: false, audio: false, message: demande.erreur };
  if (demande.extrait && u.tailleMax) {
    // Taille visée d'un extrait : calculée sur sa durée.
    u = U.resoudreUsage({ pour, qualite, ips, tailleMax, deroule, duree: demande.duree });
    if (u.erreur) return { ok: false, audio: false, message: u.erreur, ...(u.propositionMo ? { propositionMo: u.propositionMo } : {}) };
  }
  const extrait = demande.extrait || demande.gif;
  const P = creerProfil(Boolean(profil));
  const assemblage = await P.mesurer('assemblagePage', () => assembler({ dossier: projet, dossierStyles, dossierEffets, ecrire: false }));
  if (!assemblage.ok) return { ok: false, audio: false, message: `La page ne s'assemble pas : ${assemblage.erreurs.map((e) => e.message).join(' ')}` };
  // Les fichiers de sous-titres suivent le texte exporté, même sans aperçu ouvert.
  ecrireSousTitres(sortieDir, deroule.titre, assemblage.donnees.sousTitres && assemblage.donnees.sousTitres.cartons);
  // Cadre de téléphone : la sortie est celle du cadre (1920 × 1080 ou 1080 × 1080 en 1080p), réduite comme les autres définitions.
  const tailleCadre = (definition) => {
    const [l, h] = CADRE.FORMATS[demande.cadreFormat];
    const f = { '1080p': 1, '720p': 2 / 3, '540p': 0.5 }[definition] || 1;
    return [Math.round((l * f) / 2) * 2, Math.round((h * f) / 2) * 2];
  };
  const tailleDe = (definition) => (demande.cadre ? tailleCadre(definition) : TAILLES[definition][deroule.format.ratio] || TAILLES[definition]['16:9']);
  // Taille de sortie (celle de l'usage) ; taille capturée : la même, sauf une taille visée, toujours tirée d'une capture 1080p
  // (le courriel ne recapture rien après un export web, et deux exports du même usage donnent les mêmes images).
  const [largeur, hauteur] = tailleDe(u.definition);
  const deuxPasses = u.fidele.passes === 2;
  const [largeurCapture, hauteurCapture] = deuxPasses ? tailleDe('1080p') : [largeur, hauteur];
  const reduite = largeurCapture !== largeur;
  const cadence = u.ips;
  // Brouillon : l'encodeur de la carte graphique s'il a passé l'essai d'une image, sinon libx264 veryfast (5.7).
  let encodeur = null;
  if (u.fidele.encodeur === 'materiel') {
    const d = encodeurMateriel || await F.detecterEncodeurs({ ffmpeg: outil.chemin, version: outil.version, dossier: dossierPersonnel() }).catch(() => ({ encodeur: null }));
    encodeur = d.encodeur || null;
  }
  // Fichier dérivé : réglages vidéo de l'usage ; intermédiaire : commun (CRF 14 medium), ou le fichier lui-même (master, brouillon).
  const usageVideo = { crf: u.fidele.crf, preset: u.fidele.preset, tune: u.fidele.tune, debitMax: u.fidele.debitMax, tampon: u.fidele.tampon, gop: u.fidele.gop, profil: u.fidele.profil, niveau: u.fidele.niveau, encodeur };
  if (encodeur) usageVideo.preset = null;
  const derive = Object.fromEntries(Object.entries({ ...usageVideo, ...(encodage || {}) }).filter(([, v]) => v !== null && v !== undefined));
  const intermediaire = INTERMEDIAIRE_PROPRE.has(u.usage) && !encodage ? derive : { ...INTERMEDIAIRE, tune: u.fidele.tune || undefined, gop: 2, profil: 'high' };
  const memeEncodage = stable(derive) === stable(intermediaire);
  // Segments dérivés un à un (les deux passes d'une taille visée portent sur la vidéo entière). Un extrait ou un GIF partent des
  // intermédiaires seuls : ils sont coupés à l'image près, puis encodés en une fois.
  const deriveParSegment = !memeEncodage && !deuxPasses && !extrait;
  // Livrables de diffusion de la vidéo entière (5.10, 5.11) : couverture et vignette, chapitres intégrés.
  const joints = (U.lireUsages().usages[u.usage] || {}).fichiers || [];
  const avecCouverture = joints.includes('couverture') && !extrait && !demande.cadre;
  const chapitres = joints.includes('chapitres') && !extrait && !demande.cadre && !deuxPasses ? L.chapitresDe(deroule, minutageNode) : [];
  // Plafond du grain : il ne change les pixels que si la page a un grain.
  const grainMax = u.grainMax && U.avecGrain(deroule) ? u.grainMax : null;

  const travail = path.join(sortieDir, '.export');
  const dossierSegments = path.join(travail, 'segments');
  const dossierPixels = path.join(dossierSegments, 'pixels');
  fs.mkdirSync(dossierPixels, { recursive: true });
  const verrou = prendreVerrou(travail);
  if (!verrou.ok) return { ok: false, audio: false, message: messageVerrou(verrou.depuis), usage: u.usage };
  // Musique importée seulement (une musique générée n'a pas de fichier).
  const musique = deroule.musique && deroule.musique.fichier ? cheminDansProjet(projet, deroule.musique.fichier) : null;
  const page = path.join(travail, 'page.html');

  const nomSlug = slug(deroule.titre);
  const final = path.join(sortieDir, extrait || demande.cadre
    ? L.nomSortie(nomSlug, { usage: gif ? (pour && pour !== 'web' ? pour : 'web') : u.usage, scene: demande.scene, plage: demande.plage, cadre: demande.cadre, extension: gif ? 'gif' : 'mp4' })
    : U.nomFichier(nomSlug, u.usage));
  const partiel = `${final}.part`;
  const captures = [];
  const partiels = new Set();
  const gpu = avecEffets(projet, deroule);
  const controle = new AbortController();
  const fermer = async (c) => { const i = captures.indexOf(c); if (i >= 0) captures.splice(i, 1); await c.fermer().catch(() => {}); };
  const ouvrir = () => P.mesurer('ouverture', async () => {
    const c = await ouvrirCapture({ fichierHtml: page, largeur: largeurCapture, hauteur: hauteurCapture, navigateur, gpu, erreurs: true, parametres: { grainMax }, cadre: demande.cadre });
    captures.push(c);
    // Export arrêté pendant l'ouverture : page refermée aussitôt.
    if (controle.signal.aborted) { await fermer(c); throw new Error('export annulé'); }
    surOuverture(c);
    return c;
  });
  const surAnnulation = () => controle.abort();
  if (signal) { if (signal.aborted) controle.abort(); else signal.addEventListener('abort', surAnnulation, { once: true }); }
  const resume = { segments: 0, imagesCapturees: 0, paralleles: 0, usage: u.usage };
  let debutCaptures = 0;
  let finCaptures = 0;
  const travaux = [];
  try {
    // Dossier de travail d'une version précédente (empreinte, segment-NN.mp4, page, son) : retiré, rien n'en est repris.
    for (const f of fs.readdirSync(travail)) if (!GARDES.has(f)) retirer(path.join(travail, f));
    for (const d of [dossierSegments, dossierPixels]) for (const f of fs.readdirSync(d)) if (f.endsWith('.part')) retirer(path.join(d, f));
    fs.writeFileSync(page, assemblage.html, 'utf8');
    const premiere = await ouvrir();
    surPhase('preparation');
    // Son : le mixage de la page (le même que l'aperçu), rendu une fois ; illisible : vidéo muette avec un avertissement.
    const avertissements = [];
    if (deroule.musique && deroule.musique.fichier && !(musique && fs.existsSync(musique))) avertissements.push(`La musique est introuvable (« ${deroule.musique.fichier} ») : vidéo exportée sans son.`);
    else if (deroule.musique && deroule.musique.fichier && !assemblage.html.includes('id="pm-son-musique"')) {
      avertissements.push(`La musique « ${deroule.musique.fichier} » n'a pas pu être embarquée (formats acceptés : mp3, m4a, aac, wav, ogg) : vidéo exportée sans son.`);
    }
    const total = Math.round(premiere.duree * cadence);
    const segments = decouperSegments(premiere.minutage, cadence, dureeSegment);
    if (segments.reduce((s, g) => s + g.fin - g.debut, 0) !== total) throw new Error('le découpage en segments ne couvre pas la vidéo');
    resume.segments = segments.length;
    const version = await premiere.version().catch(() => '');
    const pixels = empreintesPixels(assemblage, {
      moteur: codeCapture(assemblage), options: optionsMinutage(deroule), segments, cadence, largeur: largeurCapture, hauteur: hauteurCapture,
      extra: { navigateur: version, gpu, pixels: { ...parametresPixels, ...(grainMax ? { grainMax } : {}), ...(demande.cadre ? { cadre: demande.cadre, cadreFormat: demande.cadreFormat } : {}) } },
    });
    // Intermédiaire : sous l'empreinte de ses pixels et de ses propres réglages (le commun, ou celui du master) ; fichier dérivé :
    // pixels et réglages de l'usage (rangement de S1-4, inchangé).
    const inter = segments.map((g, k) => path.join(dossierPixels, nomSegment(empreinteDerivee(pixels[k], { intermediaire }), g.morceau)));
    const fichiers = segments.map((g, k) => (deriveParSegment ? path.join(dossierSegments, nomSegment(empreinteDerivee(pixels[k], derive), g.morceau)) : inter[k]));
    // Extrait, passage, GIF (5.12, 5.13) : images [f0, f1) d'après le minutage de la page ; seuls les segments qui les couvrent
    // sont repris ou capturés (cache par scène de S1-4 : aucune recapture d'un segment déjà fait).
    const plageImages = extrait ? L.preparerSortie({ deroule, minutage: premiere.minutage, ips: cadence, scene, plage, gif }) : { f0: 0, f1: total };
    if (plageImages.erreur) throw Object.assign(new Error(plageImages.erreur), { sortie: true });
    const utiles = segments.map((g, k) => k).filter((k) => segments[k].fin > plageImages.f0 && segments[k].debut < plageImages.f1);
    const estUtile = new Set(utiles);
    const aFaire = utiles.reduce((n, k) => n + segments[k].fin - segments[k].debut, 0);

    // Seuls les segments du dernier export réussi et ceux de cet export restent sur le disque.
    const dernier = path.join(dossierSegments, 'dernier.json');
    let precedents = [];
    let intermediaires = [];
    try {
      const d = JSON.parse(fs.readFileSync(dernier, 'utf8'));
      precedents = d.fichiers || [];
      intermediaires = Array.isArray(d.intermediaires) ? d.intermediaires.filter((x) => x && Array.isArray(x.fichiers)) : [];
    } catch { /* aucun export réussi */ }
    const relatif = (f) => path.relative(dossierSegments, f).replace(/\\/g, '/');
    // Deux intermédiaires au plus sont gardés (le commun et celui du master, par exemple) ; le plus ancien est effacé.
    const garder = new Set([...precedents, ...intermediaires.flatMap((x) => x.fichiers), ...inter.map(relatif), ...fichiers.map(relatif)].map((f) => f.replace(/\\/g, '/')));
    const purger = (conserves) => {
      for (const [d, prefixe] of [[dossierSegments, ''], [dossierPixels, 'pixels/']]) {
        for (const f of fs.readdirSync(d)) {
          // Statistiques d'un segment (<segment>.mp4.stats.json) : gardées avec lui.
          const segment = f.endsWith('.stats.json') ? f.slice(0, -'.stats.json'.length) : f;
          if (segment.endsWith('.mp4') && !conserves.has(prefixe + segment)) retirer(path.join(d, f));
        }
      }
    };
    purger(garder);

    // Ce qui est déjà sur le disque : fichier dérivé, ou intermédiaire seul (réencodé sans recapture).
    const surDisque = await P.mesurer('verifications', () => enParallele(segments.map((g, k) => async () => {
      if (!estUtile.has(k)) return 'hors';
      const attendu = { largeur: largeurCapture, hauteur: hauteurCapture, images: g.fin - g.debut };
      if (await segmentValide(outil, fichiers[k], attendu)) return 'fichier';
      if (deriveParSegment && await segmentValide(outil, inter[k], attendu)) return 'intermediaire';
      return null;
    }), 8));
    const aCapturer = utiles.filter((k) => !surDisque[k]);
    const regle = paralleles ? { nombre: Math.max(1, Math.min(paralleles, aCapturer.length || 1)), regle: 'option' } : navigateursParalleles({ taches: Math.max(1, aCapturer.length), gpu });
    resume.paralleles = regle.nombre;

    const { f0, f1 } = plageImages;
    const temoins = new Map([[f0, null], [Math.floor((f0 + f1) / 2), null], [f1 - 1, null]]);
    const noter = (n, png) => { if (temoins.has(n) && !temoins.get(n)) temoins.set(n, png); };
    let faites = 0;
    let repris = 0;
    let reencodes = 0;
    let produits = 0;
    const recapturees = new Set();
    etat({ etat: 'en-cours', images: 0, total: aFaire });
    let reprises = 0;
    const avancer = (n, repriseDeSegment = false) => {
      faites += n;
      if (repriseDeSegment) reprises += n;
      surProgression(faites, aFaire, { reprises });
      if (faites % 10 === 0 || faites === aFaire) etat({ etat: 'en-cours', images: faites, total: aFaire });
    };

    /** Fichier dérivé depuis l'intermédiaire (autres réglages d'encodage), vérifié : nombre d'images, première image. */
    async function deriver(k, attendu) {
      const sortie = `${fichiers[k]}.part`;
      partiels.add(sortie);
      await P.mesurer('reencodage', () => F.reencoderSegment({ ffmpeg: outil.chemin, entree: inter[k], sortie, ips: cadence, reglages: derive, signal: controle.signal }));
      if (controle.signal.aborted) throw new Error('export annulé');
      const juste = await P.mesurer('verifications', async () => (await segmentValide(outil, sortie, attendu))
        && premiereImageJuste(outil, sortie, await F.extraireImage({ ffmpeg: outil.chemin, fichier: inter[k], t: 0 })));
      if (!juste) throw new Error(`le segment ${k + 1} n'a pas pu être réencodé`);
      fs.renameSync(sortie, fichiers[k]);
      partiels.delete(sortie);
    }

    /** Images témoins d'un segment repris, capturées en avançant (la page ne revient jamais en arrière). */
    async function temoinsDuSegment(g, capture) {
      for (const n of [...temoins.keys()].sort((a, b) => a - b)) {
        if (n > g.debut && n < g.fin && !temoins.get(n)) temoins.set(n, await capture.capturer(n / cadence, P.ajouter));
      }
    }

    /** Un segment : repris s'il est sur le disque et fidèle (première image comparée à sa capture), sinon capturé, encodé, vérifié. */
    async function traiterSegment(k, capture) {
      const g = segments[k];
      const attendu = { largeur: largeurCapture, hauteur: hauteurCapture, images: g.fin - g.debut };
      if (surDisque[k]) {
        const capturee = await capture.capturer(g.debut / cadence, P.ajouter);
        noter(g.debut, capturee);
        if (surDisque[k] === 'fichier' && await P.mesurer('verifications', () => premiereImageJuste(outil, fichiers[k], capturee))) {
          await temoinsDuSegment(g, capture);
          repris++;
          avancer(attendu.images, true);
          return;
        }
        if (surDisque[k] === 'intermediaire' && await P.mesurer('verifications', () => premiereImageJuste(outil, inter[k], capturee))) {
          await temoinsDuSegment(g, capture);
          await deriver(k, attendu);
          reencodes++;
          avancer(attendu.images, true);
          return;
        }
      }
      // Capture : l'intermédiaire et, dans la même passe de ffmpeg, le fichier dérivé de l'usage s'il a d'autres réglages.
      retirer(fichiers[k]);
      retirer(inter[k]);
      const segmentPartiel = `${inter[k]}.part`;
      partiels.add(segmentPartiel);
      const derivePartiel = deriveParSegment ? `${fichiers[k]}.part` : null;
      if (derivePartiel) partiels.add(derivePartiel);
      if (!debutCaptures) debutCaptures = performance.now();
      let premiereImage = null;
      let finImages = 0;
      async function* images() {
        for (let n = g.debut; n < g.fin; n++) {
          if (controle.signal.aborted) return;
          const png = await capture.capturer(n / cadence, P.ajouter);
          noter(n, png);
          if (n === g.debut) premiereImage = png;
          resume.imagesCapturees++;
          avancer(1);
          yield png;
        }
        finImages = performance.now();
      }
      // Statistiques image par image (spec S2, 5.12) : seconde sortie de ffmpeg, pendant l'encodage, sans seconde capture.
      const encode = await F.encoderSegment({ ffmpeg: outil.chemin, sortie: segmentPartiel, ips: cadence, reglages: intermediaire, images: images(), signal: controle.signal, profil: P.ajouter, stats: true,
        derive: derivePartiel ? { sortie: derivePartiel, reglages: derive } : null });
      finCaptures = performance.now();
      if (P.actif && finImages) P.ajouter('finEncodage', performance.now() - finImages);
      if (controle.signal.aborted) throw new Error('export annulé');
      const valide = await P.mesurer('verifications', () => segmentValide(outil, segmentPartiel, attendu));
      if (!valide) throw new Error(`le segment ${k + 1} est incomplet`);
      if (!(await P.mesurer('verifications', () => premiereImageJuste(outil, segmentPartiel, premiereImage)))) throw new Error(`le segment ${k + 1} ne correspond pas à la page`);
      fs.renameSync(segmentPartiel, inter[k]);
      partiels.delete(segmentPartiel);
      retirer(V.fichierStats(inter[k]));
      if (encode && encode.vignettes && encode.vignettes.length === attendu.images) await P.mesurer('statistiques', () => V.ecrireStats(inter[k], encode.vignettes));
      if (derivePartiel) {
        const juste = await P.mesurer('verifications', async () => (await segmentValide(outil, derivePartiel, attendu)) && premiereImageJuste(outil, derivePartiel, premiereImage));
        if (!juste) throw new Error(`le segment ${k + 1} n'a pas pu être encodé pour cet usage`);
        fs.renameSync(derivePartiel, fichiers[k]);
        partiels.delete(derivePartiel);
      }
      recapturees.add(g.scene);
      produits++;
      if (arreterApres && produits >= arreterApres) controle.abort();
    }

    // File dans l'ordre du temps : chaque page ne fait qu'avancer dans la vidéo, comme une lecture. Revenir en arrière après
    // une scène plus tardive peut changer une image du témoin de 3 min (constat de S1-4, à corriger dans le moteur en S1-5).
    const file = [...utiles];
    const relances = new Set();
    const pages = [premiere];
    // Travailleurs : chacun sa page ; un navigateur arrêté remet son segment dans la file une fois, avec une page neuve.
    async function travailleur(i) {
      while (!controle.signal.aborted && file.length) {
        const k = file.shift();
        try {
          await traiterSegment(k, pages[i]);
        } catch (err) {
          if (controle.signal.aborted || !navigateurArrete(err) || relances.has(k)) throw err;
          relances.add(k);
          for (const f of [...partiels]) if (f.startsWith(inter[k]) || f.startsWith(fichiers[k])) { retirer(f); partiels.delete(f); }
          await fermer(pages[i]);
          pages[i] = await ouvrir();
          file.unshift(k);
        }
      }
    }
    const arreterSurErreur = (p) => p.catch((err) => { controle.abort(); throw err; });
    // Son rendu et encodé avant les captures, comme avant S1-4 : rendre le son pendant que d'autres pages capturent rendait
    // le témoin de 3 min non déterministe (des images différentes d'un export à l'autre).
    let son = null;
    surPhase('son');
    // Un GIF n'a pas de son.
    if (!gif) try {
      son = await P.mesurer('rendreSon', () => premiere.rendreSon());
      avertissements.push(...son.avertissements);
    } catch (err) {
      if (controle.signal.aborted) throw err;
      avertissements.push('Le son n\'a pas pu être préparé : vidéo exportée sans son.');
    }
    let erreurSon = null;
    const audio = await (son && son.wav ? (async () => {
      const wav = path.join(travail, 'son.wav');
      const piste = path.join(travail, 'son.m4a');
      fs.writeFileSync(wav, son.wav);
      try {
        // Extrait : la tranche du mixage, avec des fondus de 0,1 s aux bords (5.12, point 1).
        const tranche = demande.extrait ? { debut: f0 / cadence, fondu: 0.1 } : {};
        await P.mesurer('encodageSon', () => F.encoderSon({ ffmpeg: outil.chemin, wav, duree: (f1 - f0) / cadence, sortie: piste, signal: controle.signal, debit: u.fidele.audio, ...tranche }));
        return piste;
      } catch (err) {
        erreurSon = err;
        return null;
      }
    })() : Promise.resolve(null));
    if (controle.signal.aborted) throw new Error('export annulé');
    surPhase('images');
    for (let j = 1; j < regle.nombre; j++) travaux.push(arreterSurErreur(ouvrir().then((c) => travailleur(pages.push(c) - 1))));
    travaux.push(arreterSurErreur(travailleur(0)));
    const issues = await Promise.allSettled(travaux);
    travaux.length = 0;
    const echec = issues.find((i) => i.status === 'rejected' && !/export annulé/.test(i.reason && i.reason.message));
    if (echec) throw echec.reason;
    if (controle.signal.aborted) throw new Error('export annulé');
    // Image témoin encore absente (ne devrait pas arriver) : capturée par une page neuve, qui part de zéro.
    if ([...temoins.values()].some((png) => !png)) {
      const c = await ouvrir();
      for (const n of [...temoins.keys()].sort((a, b) => a - b)) if (!temoins.get(n)) temoins.set(n, await c.capturer(n / cadence, P.ajouter));
    }
    // Couverture (5.10) : l'instant du déroulé, sous-titres masqués, en JPEG de qualité 90, prise par la première page une fois
    // les images faites (une page ne revient en arrière qu'ici, pour cette seule image) ; vignette de 1 280 px et 200 Ko au plus.
    let couverture = null;
    let vignette = null;
    if (avecCouverture) {
      surPhase('livrables');
      const t = minutageModule.instantCouverture(premiere.minutage, deroule.couverture);
      couverture = path.join(travail, 'couverture.jpg');
      partiels.add(couverture);
      fs.writeFileSync(couverture, await P.mesurer('couverture', () => pages[0].capturerJpeg(t, { qualite: 90 })));
      vignette = path.join(travail, 'vignette.jpg');
      partiels.add(vignette);
      await P.mesurer('couverture', () => F.reduireVignette({ ffmpeg: outil.chemin, entree: couverture, sortie: vignette, taille: [largeurCapture, hauteurCapture] }));
    }
    for (const c of [...captures]) await fermer(c);

    if (erreurSon) avertissements.push('Le son n\'a pas pu être encodé : vidéo exportée sans son.');

    /**
     * Ce que montre et fait entendre le fichier, comparé à la page (spec S2, 5.12) : images isolées et sauts (statistiques de
     * capture), noirs et silences absents de la page (l'export échoue, segment noir retiré), crête, réécoute des scènes où la
     * voix risque d'être couverte. Écrit sortie/verification.json. m : résultat de F.verifierFichier.
     */
    async function verifierContenu({ m, sonie, propres = [] }) {
      const faites = [];
      const nonFaites = [];
      const problemes = [];
      const serie = joindre(segments.map((g, k) => ({ images: g.fin - g.debut, stats: V.lireStats(inter[k]) })));
      const analysees = segments.length - serie.nonAnalyses;
      let parasites = 0;
      let sauts = 0;
      if (analysees > 0) {
        let dico = [];
        try { dico = JSON.parse(fs.readFileSync(path.join(RACINE, 'references', 'mouvements', 'mouvements.json'), 'utf8')).mouvements; } catch { /* dictionnaire absent */ }
        const contexte = V.contexteSerie({ assemblage, deroule, dico, options: optionsMinutage(deroule) });
        const a = analyserSerie(serie.images, { ips: cadence, ...contexte, seuils: SEUILS });
        problemes.push(...a.problemes);
        ({ parasites, sauts } = a);
        faites.push('images');
      }
      if (serie.nonAnalyses) nonFaites.push({ quoi: 'images', pourquoi: `${serie.nonAnalyses} segment${serie.nonAnalyses > 1 ? 's' : ''} repris d'un export précédent sans statistiques` });
      faites.push('noirs');
      const noirs = V.noirsAbsents(m.noirs, serie.images, { ips: cadence, seuil: SEUILS.noirSeuil });
      problemes.push(...noirs.map(V.problemeNoir));
      let silences = [];
      if (audio) {
        faites.push('silences');
        let wav = null;
        try { wav = fs.readFileSync(path.join(travail, 'son.wav')); } catch { /* son de travail absent */ }
        if (wav) silences = V.silencesAbsents(m.silences, wav, { duree: total / cadence, niveau: SEUILS.silenceNiveau, dureeMin: SEUILS.silenceDuree });
        problemes.push(...silences.map(V.problemeSilence));
        if (sonie) faites.push('sonie');
        if (Number.isFinite(m.crete)) {
          faites.push('crete');
          if (m.crete > SEUILS.creteMax) problemes.push(V.problemeCrete(m.crete));
        }
        // Réécoute : les scènes que le dernier contrôle a signalées (voix couverte), sur le mixage.
        const parles = (assemblage.donnees.scenes || []).filter((s) => s.voix && s.voix.source).map((s) => s.id);
        if (parles.length) {
          const signalees = V.scenesVoixCouverte(projet).filter((id) => parles.includes(id));
          const w = whisper || require('./lib/whisper.js').whisperParDefaut();
          if (!w.pret) nonFaites.push({ quoi: 'reecoute', pourquoi: 'la transcription n\'est pas installée' });
          else if (!signalees.length) nonFaites.push({ quoi: 'reecoute', pourquoi: 'aucune scène où la musique risque de couvrir la voix' });
          else if (wav) {
            const min = premiere.minutage.scenes;
            const scenes = signalees.map((id) => {
              const sc = deroule.scenes.find((x) => x.id === id) || {};
              const ms = min.find((x) => x.id === id) || { debut: 0, fin: 0 };
              const dv = assemblage.donnees.scenes.find((x) => x.id === id);
              return { id, debut: ms.debut, fin: ms.fin, texte: (sc.voix && sc.voix.texte) || '', mots: (dv && dv.voix && dv.voix.mots) || [] };
            });
            const r = await V.reecouter({ scenes, wav, transcrire: w.transcrire, dossier: travail, seuil: SEUILS.motsConfirmes });
            if (r.faite) { faites.push('reecoute'); problemes.push(...r.problemes); } else nonFaites.push({ quoi: 'reecoute', pourquoi: r.pourquoi });
          }
        }
      } else {
        nonFaites.push({ quoi: 'son', pourquoi: 'la vidéo n\'a pas de son' });
      }
      // Vérifications propres à l'export par usage (spec Rendu et export, 5.22 point 4), déjà faites sur le fichier.
      faites.push(...propres);
      const v = {
        fichier: path.relative(projet, final).replace(/\\/g, '/'), faites, nonFaites,
        mesures: { sonie: Number.isFinite(m.integree) ? Math.round(m.integree * 10) / 10 : null, crete: Number.isFinite(m.crete) ? Math.round(m.crete * 10) / 10 : null,
          parasites, sauts, noirs: m.noirs, silences: m.silences },
        problemes,
      };
      V.ecrireVerification(projet, v);
      if (noirs.length || silences.length) {
        // Segment noir retiré : il ne sera pas repris au prochain export.
        for (const n of noirs) segments.forEach((g, k) => { if (g.fin / cadence > n.debut && g.debut / cadence < n.fin) { retirer(fichiers[k]); retirer(inter[k]); retirer(V.fichierStats(inter[k])); } });
        throw Object.assign(new Error('vérification'), { verification: (noirs.length ? V.problemeNoir(noirs[0]) : V.problemeSilence(silences[0])).message, resumeVerification: V.resume(v) });
      }
      return v;
    }

    const debutFinales = performance.now();
    surPhase('assemblage');
    let essais = 0;
    const titre = deroule.titre;
    // Images de la sortie (la vidéo entière, ou l'extrait).
    const n = f1 - f0;
    let meta = null;
    if (chapitres.length) {
      meta = path.join(travail, 'chapitres.txt');
      partiels.add(meta);
      fs.writeFileSync(meta, L.ffmetadata(chapitres, titre), 'utf8');
    }
    const tailleGif = gif ? L.tailleGif(largeurCapture, hauteurCapture, { usage: pour || 'web', largeur: largeurGif }) : null;
    if (extrait) {
      // Extrait, passage, GIF : intermédiaires des segments utiles concaténés sans réencodage, puis coupés à l'image près.
      const source = path.join(travail, 'extrait-source.mp4');
      partiels.add(source);
      await P.mesurer('assemblage', () => F.assemblerSegments({ ffmpeg: outil.chemin, segments: utiles.map((k) => inter[k]), sortie: source, audio: null }));
      const debut = f0 - segments[utiles[0]].debut;
      if (gif) {
        surPhase('gif');
        await P.mesurer('gif', () => F.encoderGif({ ffmpeg: outil.chemin, entree: source, sortie: partiel, debut, images: n, taille: tailleGif, palette: path.join(travail, 'palette.png'), signal: controle.signal }));
      } else {
        let debit = deuxPasses ? u.fidele.debit : null;
        for (;;) {
          const reglages = deuxPasses ? { ...derive, crf: undefined, debit: Math.max(1, Math.round(debitCourriel(debit, essais))) } : derive;
          if (deuxPasses) surPhase(essais ? 'reprise' : 'seconde-passe');
          await P.mesurer('extrait', () => F.transcoderExtrait({ ffmpeg: outil.chemin, entree: source, sortie: partiel, ips: cadence, debut, images: n, reglages,
            taille: reduite ? [largeur, hauteur] : null, audio, titre, journal: deuxPasses ? path.join(travail, 'passe') : null, signal: controle.signal }));
          if (!u.tailleMax) break;
          const octets = tailleFichier(partiel, essais);
          if (octets <= u.tailleMax) break;
          if (essais >= 1) throw Object.assign(new Error(F.controlesSortie({ octets }, { octetsMax: u.tailleMax, nom: NOM_COURT[u.usage] || u.usage })[0]), { sortie: true });
          essais++;
          debit = Math.floor(reglages.debit * (u.tailleMax / octets) * 0.95);
        }
      }
      retirer(source);
      partiels.delete(source);
    } else if (deuxPasses) {
      // Taille visée (5.3) : intermédiaires assemblés, puis deux passes au débit calculé ; une seule reprise si la taille dépasse.
      const source = path.join(travail, 'courriel-source.mp4');
      partiels.add(source);
      await P.mesurer('assemblage', () => F.assemblerSegments({ ffmpeg: outil.chemin, segments: inter, sortie: source, audio: null }));
      let debit = u.fidele.debit;
      for (;;) {
        const v = Math.max(1, Math.round(debitCourriel(debit, essais)));
        surPhase(essais ? 'reprise' : 'seconde-passe');
        await P.mesurer('deuxPasses', () => F.transcoderDeuxPasses({ ffmpeg: outil.chemin, entree: source, sortie: partiel, ips: cadence, reglages: { ...derive, crf: undefined, debit: v },
          taille: reduite ? [largeur, hauteur] : null, audio, journal: path.join(travail, 'passe'), signal: controle.signal, titre }));
        const octets = tailleFichier(partiel, essais);
        if (octets <= u.tailleMax) break;
        // Encore au-dessus après la reprise : échec, sans fichier (5.3, point 5).
        if (essais >= 1) throw Object.assign(new Error(F.controlesSortie({ octets }, { octetsMax: u.tailleMax, nom: NOM_COURT[u.usage] || u.usage })[0]), { sortie: true });
        essais++;
        debit = Math.floor(v * (u.tailleMax / octets) * 0.95);
      }
      retirer(source);
      partiels.delete(source);
    } else {
      // Vignette et chapitres intégrés à l'assemblage, sans réencodage (5.10, 5.11).
      await P.mesurer('assemblage', () => F.assemblerSegments({ ffmpeg: outil.chemin, segments: fichiers, sortie: partiel, audio, vignette, meta, titre }));
    }
    let verification = null;
    let sonde = null;
    surPhase('verification');
    if (extrait) {
      // Extrait ou GIF : pistes, taille, nombre d'images, étiquettes ; trois images comparées aux captures. La vérification de
      // la vidéo entière (sortie/verification.json) n'est ni refaite ni remplacée.
      await P.mesurer('verifications', async () => {
        const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: partiel, compter: gif ? 'images' : 'paquets' });
        sonde = s;
        if (gif) {
          const attendues = Math.round((n * 15) / cadence);
          if (s.video !== 'gif' || s.largeur !== tailleGif[0] || s.hauteur !== tailleGif[1] || Math.abs(s.images - attendues) > 1) throw new Error(`le GIF n'a pas la taille ou le nombre d'images attendus (${s.images} au lieu de ${attendues})`);
          return;
        }
        if (s.video !== 'h264' || s.largeur !== largeur || s.hauteur !== hauteur) throw new Error('l\'extrait n\'a pas la piste ou la taille attendues');
        const defauts = F.controlesSortie(s, { etiquettes: true, octetsMax: u.tailleMax, nom: NOM_COURT[u.usage] || u.usage });
        if (defauts.length) throw Object.assign(new Error(defauts[0]), { sortie: true });
        if (s.images !== n) throw new Error(`l'extrait a ${s.images} images au lieu de ${n}`);
        if (audio && (s.audio !== 'aac' || Math.abs(s.dureeAudio - n / cadence) > 0.1)) throw new Error('la piste son de l\'extrait est absente ou n\'a pas la durée de l\'image');
        for (const [k, capturee] of temoins) {
          const lue = await F.extraireImage({ ffmpeg: outil.chemin, fichier: partiel, t: Math.max(0, (k - f0) / cadence - 0.001), taille: reduite ? [largeurCapture, hauteurCapture] : undefined });
          const ecart = F.ecartImages(lue, capturee);
          if (ecart > ECART_MAX) throw new Error(`l'image ${k + 1} de l'extrait ne correspond pas à la page (écart de ${Math.round(ecart * 100)} %)`);
        }
      });
    } else {
      await P.mesurer('verifications', async () => {
        // Une seule passe sur le fichier final (spec S2, 5.12) : chaque image décodée et comptée (la garantie de lecture), noirs,
        // sonie, crête et silences ; ffprobe ne lit plus que les pistes. Images témoins lues en même temps.
        // ebur128 ne mesure rien sous 400 ms (un bloc) : la sonie d'une vidéo plus courte n'est pas vérifiée.
        const sonie = audio && typeof son.sonie === 'number' && total / cadence >= 0.4;
        const [s, m, lues] = await Promise.all([
          F.sonder({ ffprobe: outil.cheminProbe, fichier: partiel, compter: 'aucun' }),
          F.verifierFichier({ ffmpeg: outil.chemin, fichier: partiel, audio: Boolean(audio), noir: { duree: SEUILS.noirDuree, seuil: SEUILS.noirSeuil }, silence: { niveau: SEUILS.silenceNiveau, duree: SEUILS.silenceDuree } }),
          Promise.all([...temoins.keys()].map((k) => F.extraireImage({ ffmpeg: outil.chemin, fichier: partiel, t: Math.max(0, k / cadence - 0.001), taille: reduite ? [largeurCapture, hauteurCapture] : undefined }))),
        ]);
        sonde = s;
        if (s.video !== 'h264' || s.largeur !== largeur || s.hauteur !== hauteur) throw new Error('la vidéo n\'a pas la piste ou la taille attendues');
        // Contrôles propres à l'usage (5.22 point 4) : étiquettes de couleur, taille sous la cible, vignette et chapitres intégrés ;
        // un défaut arrête l'export.
        const defauts = F.controlesSortie(s, { etiquettes: true, octetsMax: u.tailleMax, nom: NOM_COURT[u.usage] || u.usage, vignette: Boolean(vignette), chapitres: chapitres.length > 0 });
        if (defauts.length) throw Object.assign(new Error(defauts[0]), { sortie: true });
        const decodees = m.images === null ? s.images : m.images;
        if (decodees !== total || Math.abs(s.duree - total / cadence) > 1 / cadence + 0.01) throw new Error(`la vidéo a ${decodees} images au lieu de ${total}`);
        if (audio && (s.audio !== 'aac' || Math.abs(s.dureeAudio - total / cadence) > 0.1)) throw new Error('la piste son est absente ou n\'a pas la durée de l\'image');
        if (sonie) {
          if (!(Math.abs(m.integree - son.sonie) <= 1)) throw new Error(`le son n'a pas la sonie attendue (${m.integree.toFixed(1)} LUFS au lieu de ${son.sonie.toFixed(1)})`);
        }
        verification = await P.mesurer('verificationContenu', () => verifierContenu({ m, sonie, propres: ['couleurs', ...(u.tailleMax ? ['taille'] : []), ...(vignette ? ['vignette'] : []), ...(chapitres.length ? ['chapitres'] : [])] }));
        // Trois images de la vidéo comparées aux captures (segment décalé, image noire).
        for (const [i, [k, capturee]] of [...temoins].entries()) {
          const ecart = F.ecartImages(lues[i], capturee);
          if (ecart > ECART_MAX) {
            // Le segment fautif est retiré : il ne sera pas repris au prochain export.
            const j = segments.findIndex((g) => k >= g.debut && k < g.fin);
            if (j >= 0) { retirer(fichiers[j]); retirer(inter[j]); }
            throw new Error(`l'image ${k + 1} de la vidéo ne correspond pas à la page (écart de ${Math.round(ecart * 100)} %)`);
          }
        }
      });
    }
    if (controle.signal.aborted) throw new Error('export annulé');
    try {
      fs.renameSync(partiel, final);
    } catch (err) {
      if (['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw Object.assign(new Error(`« ${path.basename(final)} » est ouvert ailleurs : fermez la vidéo (lecteur, explorateur) puis relancez l'export`), { verrou: true });
      throw err;
    }
    if (!extrait) {
      // Export réussi : ses segments deviennent « le dernier export » ; les autres sont retirés, sauf le dernier intermédiaire
      // d'une autre sorte (le commun et celui du master, par exemple : deux au plus). Sorte : réglages, définition, cadence.
      // Un extrait ne touche ni à ce dernier export ni au cache (5.12, point 3).
      const sorte = stable({ intermediaire, taille: [largeurCapture, hauteurCapture], cadence });
      const autres = intermediaires.filter((x) => x.sorte !== sorte).slice(-1);
      const gardes = [...autres, { sorte, fichiers: inter.map(relatif) }];
      const conserves = new Set([...inter, ...fichiers].map(relatif));
      for (const x of autres) for (const f of x.fichiers) conserves.add(f);
      fs.writeFileSync(dernier, JSON.stringify({ date: new Date().toISOString(), fichiers: [...new Set([...inter, ...fichiers].map(relatif))], intermediaires: gardes }, null, 2), 'utf8');
      purger(conserves);
    }
    const octets = fs.statSync(final).size;
    const rel = (f) => path.relative(projet, f).replace(/\\/g, '/');
    const sousTitres = extrait ? [] : ['srt', 'vtt'].map((e) => path.join(sortieDir, `${nomSlug}.${e}`)).filter((f) => fs.existsSync(f)).map(rel);
    // Livrables joints (5.10, 5.11, 5.20) : couverture, chapitres en texte, crédits ; un échec ne retire pas la vidéo.
    const joint = {};
    let livrables = { creditsAPreciser: [], alertes: [], fichiers: {} };
    try {
      if (couverture) {
        const cible = path.join(sortieDir, `${nomSlug}-couverture.jpg`);
        fs.copyFileSync(couverture, cible);
        joint.couverture = rel(cible);
      }
      livrables = L.ecrireLivrables({ projet, deroule, assemblage, usage: { fichiers: joints }, extrait, minutage: premiere.minutage });
    } catch (err) {
      avertissements.push(`Les fichiers joints (couverture, chapitres, crédits) n'ont pas pu être écrits (${err.message}).`);
    }
    const avertissementFinal = avertissements.length ? avertissements.join(' ') : undefined;
    const secondesCapture = debutCaptures && finCaptures > debutCaptures ? (finCaptures - debutCaptures) / 1000 : 0;
    const imagesParSeconde = resume.imagesCapturees && secondesCapture ? Math.round((resume.imagesCapturees / secondesCapture) * 10) / 10 : null;
    const images = gif && sonde ? sonde.images : n;
    const resultat = {
      ok: true, fichier: final, images, duree: n / cadence, largeur: gif ? tailleGif[0] : largeur, hauteur: gif ? tailleGif[1] : hauteur, audio: Boolean(audio),
      usage: u.usage, octets, taille: U.tailleFrancaise(octets), definition: u.definition, ips: gif ? 15 : cadence,
      flou: { applique: false, sousImages: 1 }, chapitresIntegres: Boolean(chapitres.length && sonde && sonde.chapitres > 0),
      fichiers: { [gif ? 'gif' : 'video']: rel(final), ...(sousTitres.length ? { sousTitres } : {}), ...joint, ...livrables.fichiers },
      ...(demande.extrait ? { extrait: { scene: demande.scene, debut: f0 / cadence, fin: f1 / cadence } } : {}),
      ...(demande.cadre ? { cadre: demande.cadre, cadreFormat: demande.cadreFormat } : {}),
      creditsAPreciser: livrables.creditsAPreciser,
      ...(livrables.alertes.length ? { alertes: livrables.alertes } : {}),
      ...(u.usage === 'brouillon' ? { encodeur: encodeur ? 'materiel' : 'logiciel' } : {}),
      ...(deuxPasses ? { tailleVisee: U.tailleFrancaise(u.tailleMax), reprises: essais } : {}),
      segments: segments.length, segmentsUtiles: utiles.length, segmentsRepris: repris, segmentsReencodes: reencodes,
      scenesRecapturees: segments.map((g) => g.scene).filter((id, i, t) => recapturees.has(id) && t.indexOf(id) === i),
      paralleles: regle.nombre, regleParalleles: regle.regle, imagesParSeconde,
      secondes: Math.round((performance.now() - debutExport) / 100) / 10,
    };
    if (sonde && sonde.couleurs && !gif) resultat.couleurs = sonde.couleurs;
    if (verification) resultat.verification = V.resume(verification);
    if (avertissementFinal) resultat.avertissement = avertissementFinal;
    // Vitesse de cet ordinateur (temps restant des prochains exports, 5.5) : seulement si des images ont été capturées.
    if (imagesParSeconde && !extrait) {
      ME.noterMesure({ voie: 'fidele', definition: deuxPasses ? '1080p' : u.definition, ips: cadence, flou: false, imagesParSeconde,
        finalesParSeconde: Math.round(((performance.now() - debutFinales) / 1000 / (total / cadence)) * 1000) / 1000 });
    }
    etat({ etat: 'fini', fichier: rel(final), images, duree: n / cadence, audio: Boolean(audio), usage: u.usage, octets, ...(avertissementFinal ? { avertissement: avertissementFinal } : {}),
      ...(verification ? { verification: resultat.verification } : {}) });
    return resultat;
  } catch (e) {
    const annule = controle.signal.aborted && !e.verrou && /annulé/.test(e.message);
    // Travailleurs encore en cours (erreur ailleurs) : arrêtés, attendus avant de fermer leurs pages.
    if (travaux.length) { controle.abort(); await Promise.allSettled(travaux); }
    const message = annule ? 'Export annulé : les segments déjà faits seront repris au prochain export.'
      : e.script || e.sortie ? e.message
      : e.verrou ? `${e.message} ; les segments déjà faits seront repris.`
        : e.verification ? `${e.verification} Les autres segments déjà faits seront repris.`
          : `L'export fidèle a échoué (${e.message}) : relancez-le ; les segments déjà faits seront repris.`;
    if (e.verification) {
      etat({ etat: 'erreur', message });
      return { ok: false, audio: false, message, verification: e.resumeVerification };
    }
    etat({ etat: annule ? 'annule' : 'erreur', message });
    return { ok: false, audio: false, message, usage: u.usage, ...(e.script ? { erreurScript: { scene: e.scene, instant: e.instant, detail: e.detail } } : {}) };
  } finally {
    if (signal) signal.removeEventListener('abort', surAnnulation);
    for (const c of [...captures]) await fermer(c);
    // Fichiers partiels, page et son de travail retirés ; encore verrouillés (Windows) : nouvel essai, puis laissés.
    for (const f2 of [...partiels, partiel, page, path.join(travail, 'son.wav'), path.join(travail, 'son.m4a'), path.join(travail, 'courriel-source.mp4')]) retirer(f2);
    if (P.actif) {
      const phases = Object.fromEntries(Object.entries(P.phases).map(([k, v]) => [k, Math.round(v)]));
      try {
        fs.writeFileSync(path.join(travail, 'profil.json'), JSON.stringify({ version: 1, unite: 'ms', totalMs: Math.round(performance.now() - debutExport), ...resume, phases }, null, 2), 'utf8');
      } catch { /* profil facultatif */ }
    }
    verrou.liberer();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const valeur = (o) => { const i = args.indexOf(o); return i >= 0 ? args[i + 1] : undefined; };
  const dossier = args.find((a, i) => !a.startsWith('--') && !['--qualite', '--ips', '--pour', '--taille-max'].includes(args[i - 1]));
  if (!dossier) {
    console.error('Usage : node scripts/export-fidele.js <dossier-du-projet> [--pour <usage>] [--taille-max <Mo>] [--qualite 1080p|720p|540p] [--ips 30|60]');
    process.exit(2);
  }
  const controle = new AbortController();
  process.on('SIGINT', () => controle.abort());
  exporterFidele({ dossier, pour: valeur('--pour'), tailleMax: valeur('--taille-max'), qualite: valeur('--qualite'), ips: valeur('--ips'), signal: controle.signal,
    surProgression: (n, total) => process.stderr.write(`\r${Math.round((100 * n) / total)} %`) })
    .then((r) => { process.stderr.write('\n'); console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); },
      (err) => { console.log(JSON.stringify({ ok: false, message: `L'export fidèle a échoué (${err.message}).` }, null, 2)); process.exit(1); });
}

module.exports = { exporterFidele, avecEffets, prendreVerrou, messageVerrou, TAILLES, INTERMEDIAIRE };
