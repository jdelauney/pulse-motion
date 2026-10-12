#!/usr/bin/env node
'use strict';
/* Pulse Motion – export fidèle : vraies captures d'écran de la page (Chrome ou Edge sans fenêtre), encodées par
 * ffmpeg en segments de 10 s (deux navigateurs en parallèle sur une machine d'au moins 4 cœurs) repris après
 * interruption, assemblées sans réencodage avec le son de la page (mixage du moteur, −16 LUFS), vérifiées (ffprobe, sonie, images
 * comparées aux captures).
 *
 *   node scripts/export-fidele.js <dossier-du-projet> [--qualite 1080p|720p] [--ips 30|60]
 *
 * Suivi dans sortie/export.json ; résumé JSON ; code 1 en cas d'échec.
 */
const crypto = require('node:crypto');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { assembler, slug, RACINE } = require('./assembler.js');
const { lireDeroule } = require('./lib/deroule.js');
const { trouverNavigateur } = require('./lib/navigateur.js');
const { ouvrirCapture } = require('./lib/capture-fidele.js');
const F = require('./lib/ffmpeg.js');
const { cheminDansProjet } = require('./lib/embarquer.js');

const TAILLES = {
  '1080p': { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] },
  '720p': { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [720, 720], '4:5': [720, 900] },
};
const CRF = { '1080p': 18, '720p': 21 };
const ECART_MAX = 0.02;

function avecEffets(projet, deroule) {
  return deroule.scenes.some((s) => {
    try { return /\sdata-effet\s*=/.test(fs.readFileSync(path.join(projet, s.fichier), 'utf8')); } catch { return false; }
  });
}

/** Première image du segment fidèle à sa capture (segment décalé, noir, d'une autre page). */
async function premiereImageJuste(outil, fichier, capturee) {
  if (!capturee) return false;
  try {
    return F.ecartImages(await F.extraireImage({ ffmpeg: outil.chemin, fichier, t: 0 }), capturee) <= ECART_MAX;
  } catch { return false; }
}

/** Segment valide : lisible, H.264, à la taille et avec le nombre d'images attendus. */
async function segmentValide(outil, fichier, attendu) {
  if (!fs.existsSync(fichier)) return false;
  try {
    const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier });
    return s.video === 'h264' && s.largeur === attendu.largeur && s.hauteur === attendu.hauteur && s.images === attendu.images;
  } catch { return false; }
}

async function exporterFidele({ dossier, qualite = '1080p', ips, navigateur = trouverNavigateur(), outil = F.trouverFfmpeg(), dossierStyles,
  dossierEffets = path.join(RACINE, 'effets'), surProgression = () => {}, signal, dureeSegment = 10, arreterApres, paralleles } = {}) {
  const projet = path.resolve(dossier);
  const sortieDir = path.join(projet, 'sortie');
  const suivi = path.join(sortieDir, 'export.json');
  const etat = (e) => { fs.mkdirSync(sortieDir, { recursive: true }); fs.writeFileSync(suivi, JSON.stringify({ ...e, mode: 'fidele', date: new Date().toISOString() }, null, 2)); };
  if (!outil || !outil.present || outil.versionOk === false) return { ok: false, audio: false, message: (outil && outil.message) || 'ffmpeg n\'est pas installé.' };
  if (!navigateur) return { ok: false, audio: false, message: 'Chrome ou Edge introuvable : installez l\'un des deux, ou indiquez son chemin avec la variable PM_NAVIGATEUR.' };
  if (!TAILLES[qualite]) return { ok: false, audio: false, message: `Qualité « ${qualite} » inconnue : 1080p ou 720p.` };

  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, audio: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  const assemblage = assembler({ dossier: projet, dossierStyles, dossierEffets, ecrire: false });
  if (!assemblage.ok) return { ok: false, audio: false, message: `La page ne s'assemble pas : ${assemblage.erreurs.map((e) => e.message).join(' ')}` };
  const [largeur, hauteur] = TAILLES[qualite][deroule.format.ratio] || TAILLES[qualite]['16:9'];
  const cadence = ips || (deroule.format && deroule.format.ips) || 30;

  const travail = path.join(sortieDir, '.export');
  fs.mkdirSync(travail, { recursive: true });
  const musique = deroule.musique ? cheminDansProjet(projet, deroule.musique.fichier) : null;
  // Empreinte des images : la page sans ses sources sonores (changer seulement un son ne refait pas les images).
  const sansSons = assemblage.html.replace(/<script type="text\/plain" id="pm-son-[a-z0-9-]+">[^<]*<\/script>/g, '');
  const empreinte = crypto.createHash('sha256').update(sansSons).update(`|${qualite}|${cadence}|${dureeSegment}`).digest('hex');
  const fichierEmpreinte = path.join(travail, 'empreinte');
  const memeEmpreinte = fs.existsSync(fichierEmpreinte) && fs.readFileSync(fichierEmpreinte, 'utf8') === empreinte;
  if (!memeEmpreinte) {
    // Segments d'une autre version de la page ou d'autres réglages : retirés.
    for (const f of fs.readdirSync(travail)) fs.rmSync(path.join(travail, f), { recursive: true, force: true });
    fs.writeFileSync(fichierEmpreinte, empreinte);
  }
  const page = path.join(travail, 'page.html');
  fs.writeFileSync(page, assemblage.html);

  const final = path.join(sortieDir, `${slug(deroule.titre)}.mp4`);
  const partiel = `${final}.part`;
  const captures = [];
  const partiels = new Set();
  const gpu = avecEffets(projet, deroule);
  const ouvrir = async () => { const c = await ouvrirCapture({ fichierHtml: page, largeur, hauteur, navigateur, gpu }); captures.push(c); return c; };
  const controle = new AbortController();
  const surAnnulation = () => controle.abort();
  if (signal) { if (signal.aborted) controle.abort(); else signal.addEventListener('abort', surAnnulation, { once: true }); }
  try {
    const premiere = await ouvrir();
    // Son : le mixage de la page (le même que l'aperçu), rendu une fois ; illisible : vidéo muette avec un avertissement.
    const avertissements = [];
    if (deroule.musique && !(musique && fs.existsSync(musique))) avertissements.push(`La musique est introuvable (« ${deroule.musique.fichier} ») : vidéo exportée sans son.`);
    let son = null;
    try {
      son = await premiere.rendreSon();
      avertissements.push(...son.avertissements);
    } catch (err) {
      if (controle.signal.aborted) throw err;
      avertissements.push('Le son n\'a pas pu être préparé : vidéo exportée sans son.');
    }
    const total = Math.round(premiere.duree * cadence);
    const parSegment = Math.round(dureeSegment * cadence);
    const nombre = Math.ceil(total / parSegment);
    const travailleurs = Math.max(1, Math.min(nombre, paralleles || (os.cpus().length >= 4 && nombre >= 2 ? 2 : 1)));
    const temoins = new Map([[0, null], [Math.floor(total / 2), null], [total - 1, null]]);
    const segments = Array.from({ length: nombre }, (_, k) => path.join(travail, `segment-${String(k).padStart(2, '0')}.mp4`));
    let faites = 0;
    let repris = 0;
    let produits = 0;
    let suivant = 0;
    etat({ etat: 'en-cours', images: 0, total });
    const avancer = (n) => {
      faites += n;
      surProgression(faites, total);
      if (faites % 10 === 0 || faites === total) etat({ etat: 'en-cours', images: faites, total });
    };

    /** Un segment : repris s'il est valide et fidèle (première image comparée), sinon capturé, encodé, vérifié. */
    async function traiterSegment(k, capture) {
      const debut = k * parSegment;
      const fin = Math.min(total, debut + parSegment);
      const fichier = segments[k];
      if (await segmentValide(outil, fichier, { largeur, hauteur, images: fin - debut })
        && await premiereImageJuste(outil, fichier, await capture.capturer(debut / cadence))) {
        repris++;
        avancer(fin - debut);
        return;
      }
      fs.rmSync(fichier, { force: true });
      const segmentPartiel = `${fichier}.part`;
      partiels.add(segmentPartiel);
      let premiereImage = null;
      async function* images() {
        for (let n = debut; n < fin; n++) {
          if (controle.signal.aborted) return;
          const png = await capture.capturer(n / cadence);
          if (temoins.has(n)) temoins.set(n, png);
          if (n === debut) premiereImage = png;
          avancer(1);
          yield png;
        }
      }
      await F.encoderSegment({ ffmpeg: outil.chemin, sortie: segmentPartiel, ips: cadence, crf: CRF[qualite], images: images(), signal: controle.signal });
      if (controle.signal.aborted) throw new Error('export annulé');
      if (!(await segmentValide(outil, segmentPartiel, { largeur, hauteur, images: fin - debut }))) throw new Error(`le segment ${k + 1} est incomplet`);
      if (!(await premiereImageJuste(outil, segmentPartiel, premiereImage))) throw new Error(`le segment ${k + 1} ne correspond pas à la page`);
      fs.renameSync(segmentPartiel, fichier);
      partiels.delete(segmentPartiel);
      produits++;
      if (arreterApres && produits >= arreterApres) controle.abort();
    }

    // Travailleurs : chacun sa page, segments pris dans une file partagée ; une erreur arrête les autres.
    async function travailleur(capture) {
      while (!controle.signal.aborted && suivant < nombre) {
        const k = suivant++;
        await traiterSegment(k, capture);
      }
    }
    const pages = [premiere];
    for (let i = 1; i < travailleurs; i++) pages.push(await ouvrir());
    const issues = await Promise.allSettled(pages.map((c) => travailleur(c).catch((err) => { controle.abort(); throw err; })));
    for (const c of captures.splice(0)) await c.fermer().catch(() => {});
    const echec = issues.find((i) => i.status === 'rejected' && !/export annulé/.test(i.reason && i.reason.message));
    if (echec) throw echec.reason;
    if (controle.signal.aborted) throw new Error('export annulé');

    let audio = null;
    if (son && son.wav) {
      const wav = path.join(travail, 'son.wav');
      const piste = path.join(travail, 'son.m4a');
      fs.writeFileSync(wav, son.wav);
      try {
        await F.encoderSon({ ffmpeg: outil.chemin, wav, duree: total / cadence, sortie: piste, signal: controle.signal });
        audio = piste;
      } catch (err) {
        if (controle.signal.aborted) throw err;
        avertissements.push('Le son n\'a pas pu être encodé : vidéo exportée sans son.');
      }
    }
    const avertissement = avertissements.length ? avertissements.join(' ') : undefined;

    await F.assemblerSegments({ ffmpeg: outil.chemin, segments, sortie: partiel, audio });
    const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: partiel });
    if (s.video !== 'h264' || s.largeur !== largeur || s.hauteur !== hauteur) throw new Error('la vidéo n\'a pas la piste ou la taille attendues');
    if (s.images !== total || Math.abs(s.duree - total / cadence) > 1 / cadence + 0.01) throw new Error(`la vidéo a ${s.images} images au lieu de ${total}`);
    if (audio && (s.audio !== 'aac' || Math.abs(s.dureeAudio - total / cadence) > 0.1)) throw new Error('la piste son est absente ou n\'a pas la durée de l\'image');
    if (audio && typeof son.sonie === 'number') {
      const m = await F.mesurerSonie({ ffmpeg: outil.chemin, fichier: partiel });
      if (!(Math.abs(m.integree - son.sonie) <= 1)) throw new Error(`le son n'a pas la sonie attendue (${m.integree.toFixed(1)} LUFS au lieu de ${son.sonie.toFixed(1)})`);
    }
    // Trois images de la vidéo comparées aux captures (segment décalé, image noire).
    for (const [n, png] of temoins) {
      const capturee = png || await (async () => {
        const c = await ouvrir();
        try { return await c.capturer(n / cadence); } finally { captures.splice(captures.indexOf(c), 1); await c.fermer(); }
      })();
      const lue = await F.extraireImage({ ffmpeg: outil.chemin, fichier: partiel, t: Math.max(0, n / cadence - 0.001) });
      const ecart = F.ecartImages(lue, capturee);
      if (ecart > ECART_MAX) {
        // Le segment fautif est retiré : il ne sera pas repris au prochain export.
        fs.rmSync(segments[Math.floor(n / parSegment)], { force: true });
        throw new Error(`l'image ${n + 1} de la vidéo ne correspond pas à la page (écart de ${Math.round(ecart * 100)} %)`);
      }
    }
    if (controle.signal.aborted) throw new Error('export annulé');
    try {
      fs.renameSync(partiel, final);
    } catch (err) {
      if (['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw Object.assign(new Error(`« ${path.basename(final)} » est ouvert ailleurs : fermez la vidéo (lecteur, explorateur) puis relancez l'export`), { verrou: true });
      throw err;
    }
    fs.rmSync(travail, { recursive: true, force: true });
    const resultat = { ok: true, fichier: final, images: total, duree: total / cadence, largeur, hauteur, audio: Boolean(audio), segmentsRepris: repris, paralleles: travailleurs };
    if (avertissement) resultat.avertissement = avertissement;
    etat({ etat: 'fini', fichier: path.relative(projet, final).replace(/\\/g, '/'), images: total, duree: total / cadence, audio: Boolean(audio), ...(avertissement ? { avertissement } : {}) });
    return resultat;
  } catch (e) {
    const annule = controle.signal.aborted && !e.verrou && /annulé/.test(e.message);
    const message = annule ? 'Export annulé : les segments déjà faits seront repris au prochain export.'
      : e.verrou ? `${e.message} ; les segments déjà faits seront repris.`
        : `L'export fidèle a échoué (${e.message}) : relancez-le ; les segments déjà faits seront repris.`;
    etat({ etat: annule ? 'annule' : 'erreur', message });
    return { ok: false, audio: false, message };
  } finally {
    if (signal) signal.removeEventListener('abort', surAnnulation);
    for (const c of captures) await c.fermer().catch(() => {});
    // Fichiers partiels retirés ; encore verrouillés (Windows) : nouvel essai, puis laissés.
    for (const f2 of [...partiels, partiel]) {
      try { fs.rmSync(f2, { force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* laissé */ }
    }
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

module.exports = { exporterFidele, TAILLES };
