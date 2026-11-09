#!/usr/bin/env node
'use strict';
/* Pulse Motion – export fidèle : vraies captures d'écran de la page (Chrome ou Edge sans fenêtre), encodées par
 * ffmpeg en segments alignés sur les scènes (10 s au plus), capturés par plusieurs navigateurs en parallèle selon la
 * machine, gardés d'un export à l'autre sous l'empreinte de leurs pixels (une retouche ne recapture que les scènes
 * changées), assemblés sans réencodage avec le son de la page (mixage du moteur, −16 LUFS), vérifiés (ffprobe, sonie,
 * images comparées aux captures). Spec Rapidité 5.14 à 5.18.
 *
 *   node scripts/export-fidele.js <dossier-du-projet> [--qualite 1080p|720p] [--ips 30|60]
 *
 * Dossier de travail sortie/.export/ :
 *   verrou                                      un seul export à la fois par projet (pid, date) ;
 *   segments/pixels/<empreinte des pixels>-<morceau>.mp4   intermédiaire d'un segment (aujourd'hui encodé avec les
 *                                               réglages par défaut : c'est le segment lui-même) ;
 *   segments/<empreinte du fichier dérivé>-<morceau>.mp4   segment réencodé depuis l'intermédiaire, seulement quand les
 *                                               réglages d'encodage diffèrent de ceux de l'intermédiaire (S5) ;
 *   segments/dernier.json                       segments du dernier export réussi (gardés avec ceux de l'export en cours) ;
 *   profil.json                                 temps cumulé par phase (PM_PROFIL=1).
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
const { scenesProvisoires, messageProvisoire } = require('./lib/voix.js');
const { navigateursParalleles, enParallele } = require('./lib/paralleles.js');
const { decouperSegments, empreintesPixels, empreinteDerivee, stable } = require('./lib/empreintes.js');

const TAILLES = {
  '1080p': { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] },
  '720p': { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [720, 720], '4:5': [720, 900] },
};
const CRF = { '1080p': 18, '720p': 21 };
const PRESET = 'medium';
const ECART_MAX = 0.02;
const VERROU_PERIME = 24 * 3600 * 1000;
const MESSAGE_VERROU = 'Un export de cette vidéo est déjà en cours : attendez qu\'il se termine.';
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

/** Première image du segment fidèle à sa référence (capture de la page, ou première image de l'intermédiaire). */
async function premiereImageJuste(outil, fichier, reference) {
  if (!reference) return false;
  try {
    return F.ecartImages(await F.extraireImage({ ffmpeg: outil.chemin, fichier, t: 0 }), reference) <= ECART_MAX;
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
      fs.writeFileSync(fichier, JSON.stringify({ pid: process.pid, date: new Date().toISOString(), jeton }), { flag: 'wx' });
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
    if (v && recent && processusVivant(v.pid)) return { ok: false };
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
 * exporterFidele({ dossier, qualite?, ips?, navigateur?, outil?, dossierStyles?, dossierEffets?, surProgression?, signal?,
 *                  dureeSegment?, arreterApres?, paralleles?, avecProvisoire?, encodage?, parametresPixels?, profil?, surOuverture? })
 * encodage : réglages x264 du fichier dérivé ({ crf, preset }) ; par défaut ceux de l'intermédiaire. parametresPixels : réglages
 * qui changent les pixels (S5), ajoutés à l'empreinte des pixels. surOuverture(capture) : chaque page ouverte (tests).
 */
async function exporterFidele({ dossier, qualite = '1080p', ips, navigateur = trouverNavigateur(), outil = F.trouverFfmpeg(), dossierStyles,
  dossierEffets = path.join(RACINE, 'effets'), surProgression = () => {}, signal, dureeSegment = 10, arreterApres, paralleles, avecProvisoire = false,
  encodage, parametresPixels = {}, profil = process.env.PM_PROFIL === '1', surOuverture = () => {} } = {}) {
  const debutExport = performance.now();
  const projet = path.resolve(dossier);
  const sortieDir = path.join(projet, 'sortie');
  const suivi = path.join(sortieDir, 'export.json');
  const etat = (e) => { fs.mkdirSync(sortieDir, { recursive: true }); fs.writeFileSync(suivi, JSON.stringify({ ...e, mode: 'fidele', date: new Date().toISOString() }, null, 2)); };
  if (!outil || !outil.present || outil.versionOk === false) return { ok: false, audio: false, message: (outil && outil.message) || 'ffmpeg n\'est pas installé.' };
  if (!navigateur) return { ok: false, audio: false, message: 'Chrome ou Edge introuvable : installez l\'un des deux, ou indiquez son chemin avec la variable PM_NAVIGATEUR.' };
  if (!TAILLES[qualite]) return { ok: false, audio: false, message: `Qualité « ${qualite} » inconnue : 1080p ou 720p.` };

  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, audio: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  const provisoires = scenesProvisoires(projet, deroule);
  if (provisoires.length && !avecProvisoire) return { ok: false, audio: false, message: messageProvisoire(provisoires) };
  const P = creerProfil(Boolean(profil));
  const assemblage = await P.mesurer('assemblagePage', () => assembler({ dossier: projet, dossierStyles, dossierEffets, ecrire: false }));
  if (!assemblage.ok) return { ok: false, audio: false, message: `La page ne s'assemble pas : ${assemblage.erreurs.map((e) => e.message).join(' ')}` };
  // Les fichiers de sous-titres suivent le texte exporté, même sans aperçu ouvert.
  ecrireSousTitres(sortieDir, deroule.titre, assemblage.donnees.sousTitres && assemblage.donnees.sousTitres.cartons);
  const [largeur, hauteur] = TAILLES[qualite][deroule.format.ratio] || TAILLES[qualite]['16:9'];
  const cadence = ips || (deroule.format && deroule.format.ips) || 30;
  // Intermédiaire : réglages par défaut tant que S5 n'en fixe pas d'autres ; fichier dérivé : réglages de l'usage.
  const intermediaire = { crf: CRF[qualite], preset: PRESET };
  const derive = { ...intermediaire, ...(encodage || {}) };
  const memeEncodage = stable(derive) === stable(intermediaire);

  const travail = path.join(sortieDir, '.export');
  const dossierSegments = path.join(travail, 'segments');
  const dossierPixels = path.join(dossierSegments, 'pixels');
  fs.mkdirSync(dossierPixels, { recursive: true });
  const verrou = prendreVerrou(travail);
  if (!verrou.ok) return { ok: false, audio: false, message: MESSAGE_VERROU };
  // Musique importée seulement (une musique générée n'a pas de fichier).
  const musique = deroule.musique && deroule.musique.fichier ? cheminDansProjet(projet, deroule.musique.fichier) : null;
  const page = path.join(travail, 'page.html');

  const final = path.join(sortieDir, `${slug(deroule.titre)}.mp4`);
  const partiel = `${final}.part`;
  const captures = [];
  const partiels = new Set();
  const gpu = avecEffets(projet, deroule);
  const controle = new AbortController();
  const fermer = async (c) => { const i = captures.indexOf(c); if (i >= 0) captures.splice(i, 1); await c.fermer().catch(() => {}); };
  const ouvrir = () => P.mesurer('ouverture', async () => {
    const c = await ouvrirCapture({ fichierHtml: page, largeur, hauteur, navigateur, gpu });
    captures.push(c);
    // Export arrêté pendant l'ouverture : page refermée aussitôt.
    if (controle.signal.aborted) { await fermer(c); throw new Error('export annulé'); }
    surOuverture(c);
    return c;
  });
  const surAnnulation = () => controle.abort();
  if (signal) { if (signal.aborted) controle.abort(); else signal.addEventListener('abort', surAnnulation, { once: true }); }
  const resume = { segments: 0, imagesCapturees: 0, paralleles: 0 };
  const travaux = [];
  try {
    // Dossier de travail d'une version précédente (empreinte, segment-NN.mp4, page, son) : retiré, rien n'en est repris.
    for (const f of fs.readdirSync(travail)) if (!GARDES.has(f)) retirer(path.join(travail, f));
    for (const d of [dossierSegments, dossierPixels]) for (const f of fs.readdirSync(d)) if (f.endsWith('.part')) retirer(path.join(d, f));
    fs.writeFileSync(page, assemblage.html);
    const premiere = await ouvrir();
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
      moteur: codeCapture(assemblage), options: optionsMinutage(deroule), segments, cadence, largeur, hauteur,
      extra: { navigateur: version, gpu, pixels: parametresPixels },
    });
    const inter = segments.map((g, k) => path.join(dossierPixels, nomSegment(pixels[k], g.morceau)));
    const fichiers = segments.map((g, k) => (memeEncodage ? inter[k] : path.join(dossierSegments, nomSegment(empreinteDerivee(pixels[k], derive), g.morceau))));

    // Seuls les segments du dernier export réussi et ceux de cet export restent sur le disque.
    const dernier = path.join(dossierSegments, 'dernier.json');
    let precedents = [];
    try { precedents = JSON.parse(fs.readFileSync(dernier, 'utf8')).fichiers || []; } catch { /* aucun export réussi */ }
    const garder = new Set([...precedents, ...inter.map((f) => path.relative(dossierSegments, f)), ...fichiers.map((f) => path.relative(dossierSegments, f))].map((f) => f.replace(/\\/g, '/')));
    const purger = (conserves) => {
      for (const [d, prefixe] of [[dossierSegments, ''], [dossierPixels, 'pixels/']]) {
        for (const f of fs.readdirSync(d)) if (f.endsWith('.mp4') && !conserves.has(prefixe + f)) retirer(path.join(d, f));
      }
    };
    purger(garder);

    // Ce qui est déjà sur le disque : fichier dérivé, ou intermédiaire seul (réencodé sans recapture).
    const surDisque = await P.mesurer('verifications', () => enParallele(segments.map((g, k) => async () => {
      const attendu = { largeur, hauteur, images: g.fin - g.debut };
      if (await segmentValide(outil, fichiers[k], attendu)) return 'fichier';
      if (!memeEncodage && await segmentValide(outil, inter[k], attendu)) return 'intermediaire';
      return null;
    }), 8));
    const aCapturer = segments.map((g, k) => k).filter((k) => !surDisque[k]);
    const regle = paralleles ? { nombre: Math.max(1, Math.min(paralleles, aCapturer.length || 1)), regle: 'option' } : navigateursParalleles({ taches: Math.max(1, aCapturer.length), gpu });
    resume.paralleles = regle.nombre;

    const temoins = new Map([[0, null], [Math.floor(total / 2), null], [total - 1, null]]);
    const noter = (n, png) => { if (temoins.has(n) && !temoins.get(n)) temoins.set(n, png); };
    let faites = 0;
    let repris = 0;
    let reencodes = 0;
    let produits = 0;
    const recapturees = new Set();
    etat({ etat: 'en-cours', images: 0, total });
    const avancer = (n) => {
      faites += n;
      surProgression(faites, total);
      if (faites % 10 === 0 || faites === total) etat({ etat: 'en-cours', images: faites, total });
    };

    /** Fichier dérivé depuis l'intermédiaire (autres réglages d'encodage), vérifié : nombre d'images, première image. */
    async function deriver(k, attendu) {
      const sortie = `${fichiers[k]}.part`;
      partiels.add(sortie);
      await P.mesurer('reencodage', () => F.reencoderSegment({ ffmpeg: outil.chemin, entree: inter[k], sortie, ips: cadence, crf: derive.crf, preset: derive.preset, signal: controle.signal }));
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
      const attendu = { largeur, hauteur, images: g.fin - g.debut };
      if (surDisque[k]) {
        const capturee = await capture.capturer(g.debut / cadence, P.ajouter);
        noter(g.debut, capturee);
        if (surDisque[k] === 'fichier' && await P.mesurer('verifications', () => premiereImageJuste(outil, fichiers[k], capturee))) {
          await temoinsDuSegment(g, capture);
          repris++;
          avancer(attendu.images);
          return;
        }
        if (surDisque[k] === 'intermediaire' && await P.mesurer('verifications', () => premiereImageJuste(outil, inter[k], capturee))) {
          await temoinsDuSegment(g, capture);
          await deriver(k, attendu);
          reencodes++;
          avancer(attendu.images);
          return;
        }
      }
      // Capture : l'intermédiaire, puis le fichier dérivé s'il a d'autres réglages.
      retirer(fichiers[k]);
      retirer(inter[k]);
      const segmentPartiel = `${inter[k]}.part`;
      partiels.add(segmentPartiel);
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
      await F.encoderSegment({ ffmpeg: outil.chemin, sortie: segmentPartiel, ips: cadence, crf: intermediaire.crf, preset: intermediaire.preset, images: images(), signal: controle.signal, profil: P.ajouter });
      if (P.actif && finImages) P.ajouter('finEncodage', performance.now() - finImages);
      if (controle.signal.aborted) throw new Error('export annulé');
      const valide = await P.mesurer('verifications', () => segmentValide(outil, segmentPartiel, attendu));
      if (!valide) throw new Error(`le segment ${k + 1} est incomplet`);
      if (!(await P.mesurer('verifications', () => premiereImageJuste(outil, segmentPartiel, premiereImage)))) throw new Error(`le segment ${k + 1} ne correspond pas à la page`);
      fs.renameSync(segmentPartiel, inter[k]);
      partiels.delete(segmentPartiel);
      if (!memeEncodage) await deriver(k, attendu);
      recapturees.add(g.scene);
      produits++;
      if (arreterApres && produits >= arreterApres) controle.abort();
    }

    // File dans l'ordre du temps : chaque page ne fait qu'avancer dans la vidéo, comme une lecture. Revenir en arrière après
    // une scène plus tardive peut changer une image du témoin de 3 min (constat de S1-4, à corriger dans le moteur en S1-5).
    const file = segments.map((g, k) => k);
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
    try {
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
        await P.mesurer('encodageSon', () => F.encoderSon({ ffmpeg: outil.chemin, wav, duree: total / cadence, sortie: piste, signal: controle.signal }));
        return piste;
      } catch (err) {
        erreurSon = err;
        return null;
      }
    })() : Promise.resolve(null));
    if (controle.signal.aborted) throw new Error('export annulé');
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
    for (const c of [...captures]) await fermer(c);

    if (erreurSon) avertissements.push('Le son n\'a pas pu être encodé : vidéo exportée sans son.');
    const avertissement = avertissements.length ? avertissements.join(' ') : undefined;

    await P.mesurer('assemblage', () => F.assemblerSegments({ ffmpeg: outil.chemin, segments: fichiers, sortie: partiel, audio }));
    await P.mesurer('verifications', async () => {
      // Le fichier final garde un décodage complet : la garantie de lecture. Sonie et images témoins lues en même temps.
      // ebur128 ne mesure rien sous 400 ms (un bloc) : la sonie d'une vidéo plus courte n'est pas vérifiée.
      const sonie = audio && typeof son.sonie === 'number' && total / cadence >= 0.4;
      const [s, m, lues] = await Promise.all([
        F.sonder({ ffprobe: outil.cheminProbe, fichier: partiel }),
        sonie ? F.mesurerSonie({ ffmpeg: outil.chemin, fichier: partiel }) : null,
        Promise.all([...temoins.keys()].map((n) => F.extraireImage({ ffmpeg: outil.chemin, fichier: partiel, t: Math.max(0, n / cadence - 0.001) }))),
      ]);
      if (s.video !== 'h264' || s.largeur !== largeur || s.hauteur !== hauteur) throw new Error('la vidéo n\'a pas la piste ou la taille attendues');
      if (s.images !== total || Math.abs(s.duree - total / cadence) > 1 / cadence + 0.01) throw new Error(`la vidéo a ${s.images} images au lieu de ${total}`);
      if (audio && (s.audio !== 'aac' || Math.abs(s.dureeAudio - total / cadence) > 0.1)) throw new Error('la piste son est absente ou n\'a pas la durée de l\'image');
      if (sonie) {
        if (!(Math.abs(m.integree - son.sonie) <= 1)) throw new Error(`le son n'a pas la sonie attendue (${m.integree.toFixed(1)} LUFS au lieu de ${son.sonie.toFixed(1)})`);
      }
      // Trois images de la vidéo comparées aux captures (segment décalé, image noire).
      for (const [i, [n, capturee]] of [...temoins].entries()) {
        const ecart = F.ecartImages(lues[i], capturee);
        if (ecart > ECART_MAX) {
          // Le segment fautif est retiré : il ne sera pas repris au prochain export.
          const k = segments.findIndex((g) => n >= g.debut && n < g.fin);
          if (k >= 0) { retirer(fichiers[k]); retirer(inter[k]); }
          throw new Error(`l'image ${n + 1} de la vidéo ne correspond pas à la page (écart de ${Math.round(ecart * 100)} %)`);
        }
      }
    });
    if (controle.signal.aborted) throw new Error('export annulé');
    try {
      fs.renameSync(partiel, final);
    } catch (err) {
      if (['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw Object.assign(new Error(`« ${path.basename(final)} » est ouvert ailleurs : fermez la vidéo (lecteur, explorateur) puis relancez l'export`), { verrou: true });
      throw err;
    }
    // Export réussi : ses segments deviennent « le dernier export » ; les autres sont retirés.
    const conserves = new Set([...inter, ...fichiers].map((f) => path.relative(dossierSegments, f).replace(/\\/g, '/')));
    fs.writeFileSync(dernier, JSON.stringify({ date: new Date().toISOString(), fichiers: [...conserves] }, null, 2));
    purger(conserves);
    const resultat = {
      ok: true, fichier: final, images: total, duree: total / cadence, largeur, hauteur, audio: Boolean(audio),
      segments: segments.length, segmentsRepris: repris, segmentsReencodes: reencodes,
      scenesRecapturees: segments.map((g) => g.scene).filter((id, i, t) => recapturees.has(id) && t.indexOf(id) === i),
      paralleles: regle.nombre, regleParalleles: regle.regle,
    };
    if (avertissement) resultat.avertissement = avertissement;
    etat({ etat: 'fini', fichier: path.relative(projet, final).replace(/\\/g, '/'), images: total, duree: total / cadence, audio: Boolean(audio), ...(avertissement ? { avertissement } : {}) });
    return resultat;
  } catch (e) {
    const annule = controle.signal.aborted && !e.verrou && /annulé/.test(e.message);
    // Travailleurs encore en cours (erreur ailleurs) : arrêtés, attendus avant de fermer leurs pages.
    if (travaux.length) { controle.abort(); await Promise.allSettled(travaux); }
    const message = annule ? 'Export annulé : les segments déjà faits seront repris au prochain export.'
      : e.verrou ? `${e.message} ; les segments déjà faits seront repris.`
        : `L'export fidèle a échoué (${e.message}) : relancez-le ; les segments déjà faits seront repris.`;
    etat({ etat: annule ? 'annule' : 'erreur', message });
    return { ok: false, audio: false, message };
  } finally {
    if (signal) signal.removeEventListener('abort', surAnnulation);
    for (const c of [...captures]) await fermer(c);
    // Fichiers partiels, page et son de travail retirés ; encore verrouillés (Windows) : nouvel essai, puis laissés.
    for (const f2 of [...partiels, partiel, page, path.join(travail, 'son.wav'), path.join(travail, 'son.m4a')]) retirer(f2);
    if (P.actif) {
      const phases = Object.fromEntries(Object.entries(P.phases).map(([k, v]) => [k, Math.round(v)]));
      try {
        fs.writeFileSync(path.join(travail, 'profil.json'), JSON.stringify({ version: 1, unite: 'ms', totalMs: Math.round(performance.now() - debutExport), ...resume, phases }, null, 2));
      } catch { /* profil facultatif */ }
    }
    verrou.liberer();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const valeur = (o) => { const i = args.indexOf(o); return i >= 0 ? args[i + 1] : undefined; };
  const dossier = args.find((a, i) => !a.startsWith('--') && !['--qualite', '--ips'].includes(args[i - 1]));
  if (!dossier) {
    console.error('Usage : node scripts/export-fidele.js <dossier-du-projet> [--qualite 1080p|720p] [--ips 30|60]');
    process.exit(2);
  }
  const controle = new AbortController();
  process.on('SIGINT', () => controle.abort());
  exporterFidele({ dossier, qualite: valeur('--qualite') || '1080p', ips: valeur('--ips') ? Number(valeur('--ips')) : undefined, signal: controle.signal,
    surProgression: (n, total) => process.stderr.write(`\r${Math.round((100 * n) / total)} %`) })
    .then((r) => { process.stderr.write('\n'); console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); },
      (err) => { console.log(JSON.stringify({ ok: false, message: `L'export fidèle a échoué (${err.message}).` }, null, 2)); process.exit(1); });
}

module.exports = { exporterFidele, avecEffets, prendreVerrou, TAILLES, CRF };
