'use strict';
/* Pulse Motion – vidéo à fond transparent, voie fidèle (spec Rendu et export, 5.14), « à incruster dans mon montage ».
 *
 * La page est capturée sans fond (classe pm-transparent, fond par défaut du navigateur à alpha nul), en PNG à couche alpha, puis
 * encodée en MOV ProRes 4444 (montage, par défaut) ou en WebM VP9 à couche alpha (pour le web), étiquetés BT.709, avec le son
 * en PCM 16 bits (MOV) ou en Opus (WebM). Chemin à part de l'export par usage : les segments sont faits directement dans le
 * conteneur final (aucun intermédiaire H.264, aucun cache par scène, aucun flou), capturés en parallèle, assemblés sans
 * réencodage. Ni couverture, ni vignette, ni chapitres ; crédits écrits.
 * Règle fond-opaque (bloquante pour cet export seul) : une scène dont 90 % des pixels sont opaques à 35, 65 et 95 % de sa
 * partie visible n'aurait rien de transparent ; l'export s'arrête avant toute capture, avec le nom de la scène.
 *
 * exporterTransparent({ projet, deroule, u, demande, navigateur, outil, ... }) -> résultat de l'export (comme exporterFidele)
 * fondOpaque(parScene, { seuil? }) -> [id des scènes à fond plein] ; messageFondOpaque(ids) -> message
 */
const fs = require('node:fs');
const path = require('node:path');
const F = require('./ffmpeg.js');
const L = require('./livrables.js');
const U = require('./usages.js');
const PNG = require('./png.js');
const { ouvrirCapture } = require('./capture-fidele.js');
const { decouperSegments } = require('./empreintes.js');
const { navigateursParalleles } = require('./paralleles.js');
const { partieVisible } = require('../../moteur/minutage.js');

/** Part de pixels opaques au-delà de laquelle une image est « pleine » (5.14, point 2). */
const PART_OPAQUE = 0.9;
const INSTANTS_FOND = [0.35, 0.65, 0.95];
const ECART_MAX = 0.02;

/** parScene : { id: [part opaque à 35, 65, 95 %] } -> scènes dont les trois images sont pleines. */
function fondOpaque(parScene, { seuil = PART_OPAQUE } = {}) {
  return Object.entries(parScene).filter(([, parts]) => parts.length && parts.every((p) => p >= seuil)).map(([id]) => id);
}

function messageFondOpaque(ids) {
  if (ids.length === 1) return `La scène « ${ids[0]} » a un fond plein : rien n'y serait transparent. Je peux retirer son fond pour cette version.`;
  return `Les scènes ${ids.map((id) => `« ${id} »`).join(', ')} ont un fond plein : rien n'y serait transparent. Je peux retirer leur fond pour cette version.`;
}

const retirer = (f) => { try { fs.rmSync(f, { force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* laissé */ } };

async function exporterTransparent({ projet, deroule, u, demande, navigateur, outil, dossierStyles, dossierEffets, surProgression = () => {}, surPhase = () => {}, signal,
  paralleles, dureeSegment = 10, surOuverture = () => {}, versionDeTravail = false }) {
  const debutExport = performance.now();
  const { assembler, slug } = require('../assembler.js');
  const { prendreVerrou, messageVerrou, avecEffets, TAILLES } = require('../export-fidele.js');
  const format = demande.transparent;
  const T = F.TRANSPARENTS[format];
  const sortieDir = path.join(projet, 'sortie');
  const suivi = path.join(sortieDir, 'export.json');
  const etat = (e) => { fs.mkdirSync(sortieDir, { recursive: true }); fs.writeFileSync(suivi, JSON.stringify({ ...e, mode: 'fidele', date: new Date().toISOString() }, null, 2), 'utf8'); };
  const assemblage = assembler({ dossier: projet, dossierStyles, dossierEffets, ecrire: false });
  if (!assemblage.ok) return { ok: false, audio: false, message: `La page ne s'assemble pas : ${assemblage.erreurs.map((e) => e.message).join(' ')}` };
  const [largeur, hauteur] = TAILLES[u.definition][deroule.format.ratio] || TAILLES[u.definition]['16:9'];
  const ips = u.ips;
  const travail = path.join(sortieDir, '.export');
  const dossierT = path.join(travail, 'transparent');
  fs.mkdirSync(dossierT, { recursive: true });
  const verrou = prendreVerrou(travail);
  if (!verrou.ok) return { ok: false, audio: false, message: messageVerrou(verrou.depuis), usage: u.usage };
  const nomSlug = slug(deroule.titre);
  const nom = L.nomSortie(nomSlug, { usage: u.usage, scene: demande.scene, plage: demande.plage, transparent: true, extension: T.conteneur });
  // Voix provisoire (spec Retouches et ergonomie, 5.17) : une version de travail nommée à part.
  const final = path.join(sortieDir, versionDeTravail ? require('./voix.js').nomVersionDeTravail(nom) : nom);
  const partiel = `${final}.part`;
  const page = path.join(dossierT, 'page.html');
  const gpu = avecEffets(projet, deroule);
  const captures = [];
  const controle = new AbortController();
  const surAnnulation = () => controle.abort();
  if (signal) { if (signal.aborted) controle.abort(); else signal.addEventListener('abort', surAnnulation, { once: true }); }
  const ouvrir = async () => {
    const c = await ouvrirCapture({ fichierHtml: page, largeur, hauteur, navigateur, gpu, erreurs: true, transparent: true });
    captures.push(c);
    if (controle.signal.aborted) { await c.fermer().catch(() => {}); throw new Error('export annulé'); }
    surOuverture(c);
    return c;
  };
  const fermer = async (c) => { const i = captures.indexOf(c); if (i >= 0) captures.splice(i, 1); await c.fermer().catch(() => {}); };
  try {
    for (const x of fs.readdirSync(dossierT)) retirer(path.join(dossierT, x));
    fs.writeFileSync(page, assemblage.html, 'utf8');
    const premiere = await ouvrir();
    const minutage = premiere.minutage;
    const total = Math.round(premiere.duree * ips);
    const plageImages = demande.extrait ? L.preparerSortie({ deroule, minutage, ips, scene: demande.scene, plage: demande.plage }) : { f0: 0, f1: total };
    if (plageImages.erreur) throw Object.assign(new Error(plageImages.erreur), { sortie: true });
    const { f0, f1 } = plageImages;
    // Fonds pleins (5.14, point 2), vérifiés avant toute capture de la vidéo, par une page qui est ensuite refermée.
    surPhase('transparent');
    const parScene = {};
    for (let i = 0; i < minutage.scenes.length; i++) {
      const v = partieVisible(minutage, i);
      // La première scène entre en fondu depuis le fond (sa transition) : ses images ne comptent qu'après.
      if (i === 0 && minutage.scenes[0].dureeTransition > 0) v.debut = Math.min(v.fin, Math.max(v.debut, minutage.scenes[0].dureeTransition));
      // Seules les scènes montrées par la vidéo (ou l'extrait) comptent.
      if (v.fin * ips <= f0 || v.debut * ips >= f1) continue;
      parScene[minutage.scenes[i].id] = [];
      for (const part of INSTANTS_FOND) parScene[minutage.scenes[i].id].push(PNG.alphaOpaque(await premiere.capturer(v.debut + (v.fin - v.debut) * part)));
    }
    const pleins = fondOpaque(parScene);
    if (pleins.length) throw Object.assign(new Error(messageFondOpaque(pleins)), { sortie: true, fondOpaque: pleins });
    // Son : le mixage de la page, rendu une fois (tranche avec fondus pour un extrait).
    surPhase('son');
    const avertissements = [];
    let audio = null;
    try {
      const son = await premiere.rendreSon();
      avertissements.push(...son.avertissements);
      if (son.wav) {
        const wav = path.join(dossierT, 'son.wav');
        fs.writeFileSync(wav, son.wav);
        audio = path.join(dossierT, `son.${T.conteneur}`);
        await F.encoderSon({ ffmpeg: outil.chemin, wav, duree: (f1 - f0) / ips, sortie: audio, signal: controle.signal, debit: u.fidele.audio, codec: T.son,
          ...(demande.extrait ? { debut: f0 / ips, fondu: 0.1 } : {}) });
      }
    } catch (err) {
      if (controle.signal.aborted) throw err;
      audio = null;
      avertissements.push('Le son n\'a pas pu être préparé : vidéo exportée sans son.');
    }
    await fermer(premiere);
    // Segments de la plage, capturés dans l'ordre du temps par chaque page (jamais en arrière).
    const segments = decouperSegments(minutage, ips, dureeSegment)
      .map((g) => ({ ...g, debut: Math.max(g.debut, f0), fin: Math.min(g.fin, f1) })).filter((g) => g.fin > g.debut);
    const fichiers = segments.map((g, k) => path.join(dossierT, `segment-${String(k).padStart(3, '0')}.${T.conteneur}`));
    const aFaire = f1 - f0;
    const regle = paralleles ? { nombre: Math.max(1, Math.min(paralleles, segments.length)), regle: 'option' } : navigateursParalleles({ taches: segments.length, gpu });
    const temoins = new Map([[f0, null], [Math.floor((f0 + f1) / 2), null], [f1 - 1, null]]);
    let faites = 0;
    etat({ etat: 'en-cours', images: 0, total: aFaire });
    surPhase('images');
    const file = segments.map((_, k) => k);
    async function travailleur() {
      const capture = await ouvrir();
      try {
        while (!controle.signal.aborted && file.length) {
          const k = file.shift();
          const g = segments[k];
          async function* images() {
            for (let n = g.debut; n < g.fin; n++) {
              if (controle.signal.aborted) return;
              const png = await capture.capturer(n / ips);
              if (temoins.has(n)) temoins.set(n, png);
              faites++;
              surProgression(faites, aFaire, { reprises: 0 });
              if (faites % 10 === 0 || faites === aFaire) etat({ etat: 'en-cours', images: faites, total: aFaire });
              yield png;
            }
          }
          await F.encoderTransparent({ ffmpeg: outil.chemin, sortie: fichiers[k], ips, format, images: images(), signal: controle.signal });
        }
      } finally { await fermer(capture); }
    }
    const travaux = [];
    for (let j = 0; j < regle.nombre; j++) travaux.push(travailleur().catch((e) => { controle.abort(); throw e; }));
    const issues = await Promise.allSettled(travaux);
    const echec = issues.find((i) => i.status === 'rejected' && !/export annulé/.test(i.reason && i.reason.message));
    if (echec) throw echec.reason;
    if (controle.signal.aborted) throw new Error('export annulé');
    surPhase('assemblage');
    await F.assemblerTransparent({ ffmpeg: outil.chemin, segments: fichiers, sortie: partiel, audio, format, titre: deroule.titre,
      langueSon: deroule.langue !== undefined ? require('../../moteur/langues.js').de(deroule.langue).iso6392 : null });
    // Vérification (5.22, point 4) : piste, taille, nombre d'images, couleurs étiquetées, couche alpha ; trois images comparées.
    surPhase('verification');
    const s = await F.sonder({ ffprobe: outil.cheminProbe, fichier: partiel, compter: 'paquets' });
    const n = f1 - f0;
    if (s.video !== T.codec || s.largeur !== largeur || s.hauteur !== hauteur) throw new Error('la vidéo à fond transparent n\'a pas la piste ou la taille attendues');
    const defauts = F.controlesSortie(s, { etiquettes: format === 'mov' ? 'sans-plage' : true, alpha: true });
    if (defauts.length) throw Object.assign(new Error(defauts[0]), { sortie: true });
    if (s.images !== n) throw new Error(`la vidéo a ${s.images} images au lieu de ${n}`);
    if (audio && !s.audio) throw new Error('la piste son est absente');
    for (const [k, capturee] of temoins) {
      if (!capturee) continue;
      // Une demi-image avant l'instant : le WebM range ses temps à la milliseconde (la dernière image peut tomber 2 ms plus tôt).
      const lire = () => F.extraireImage({ ffmpeg: outil.chemin, fichier: partiel, t: Math.max(0, (k - f0 - 0.5) / ips), decodeur: format === 'webm' ? 'libvpx-vp9' : null, pixels: 'rgba' });
      const ecart = await F.ecartTemoin(lire, capturee);
      if (ecart > ECART_MAX) throw new Error(`l'image ${k + 1} de la vidéo ne correspond pas à la page (écart de ${Math.round(ecart * 100)} %)`);
    }
    try {
      fs.renameSync(partiel, final);
    } catch (err) {
      if (['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw Object.assign(new Error(`« ${path.basename(final)} » est ouvert ailleurs : fermez la vidéo puis relancez l'export.`), { sortie: true });
      throw err;
    }
    const octets = fs.statSync(final).size;
    const rel = (x) => path.relative(projet, x).replace(/\\/g, '/');
    let livrables = { creditsAPreciser: [], alertes: [], fichiers: {} };
    try { livrables = L.ecrireLivrables({ projet, deroule, assemblage, usage: { fichiers: ['credits'] }, extrait: true, minutage }); } catch (err) {
      avertissements.push(`Les crédits n'ont pas pu être écrits (${err.message}).`);
    }
    const resultat = {
      ok: true, fichier: final, images: n, duree: n / ips, largeur, hauteur, audio: Boolean(audio), usage: u.usage, octets, taille: U.tailleFrancaise(octets),
      definition: u.definition, ips, transparent: format, ...(versionDeTravail ? { versionDeTravail: true } : {}), flou: { applique: false, sousImages: 1 }, chapitresIntegres: false,
      fichiers: { video: rel(final), ...livrables.fichiers }, creditsAPreciser: livrables.creditsAPreciser,
      ...(demande.extrait ? { extrait: { scene: demande.scene, debut: f0 / ips, fin: f1 / ips } } : {}),
      couleurs: s.couleurs, segments: segments.length, paralleles: regle.nombre, regleParalleles: regle.regle,
      secondes: Math.round((performance.now() - debutExport) / 100) / 10,
    };
    if (avertissements.length) resultat.avertissement = avertissements.join(' ');
    etat({ etat: 'fini', fichier: rel(final), images: n, duree: n / ips, audio: Boolean(audio), usage: u.usage, octets, transparent: format });
    return resultat;
  } catch (e) {
    const annule = controle.signal.aborted && /annulé/.test(e.message);
    controle.abort();
    const message = annule ? 'Export annulé : rien n\'est écrit.'
      : e.sortie || e.script ? e.message : `L'export de la vidéo à fond transparent a échoué (${e.message}) : relancez-le.`;
    etat({ etat: annule ? 'annule' : 'erreur', message });
    return { ok: false, audio: false, message, usage: u.usage,
      ...(e.fondOpaque ? { fondOpaque: e.fondOpaque, probleme: { regle: 'fond-opaque', gravite: 'erreur', scene: e.fondOpaque[0], message } } : {}),
      ...(e.script ? { erreurScript: { scene: e.scene, instant: e.instant, detail: e.detail } } : {}) };
  } finally {
    if (signal) signal.removeEventListener('abort', surAnnulation);
    for (const c of [...captures]) await fermer(c);
    retirer(partiel);
    try { fs.rmSync(dossierT, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* laissé */ }
    verrou.liberer();
  }
}

module.exports = { exporterTransparent, fondOpaque, messageFondOpaque, PART_OPAQUE };
