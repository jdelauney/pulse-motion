'use strict';
/* Pulse Motion – ffmpeg et ffprobe : où ils sont (PM_FFMPEG, PATH, emplacements connus de winget, scoop, Homebrew,
 * apt), leur version (4.4 au moins), et la commande qui les installe sur ce système. ffmpeg n'est jamais livré
 * avec le plugin : la personne l'installe une fois, avec son accord (skill exporter). Seuls les dossiers absolus
 * du PATH sont lus : un dossier de projet ne peut pas fournir son propre ffmpeg. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { decoderPNG } = require('../logo.js');

const MINIMUM = { majeure: 4, mineure: 4 };
const RECENTE = { majeure: 99, mineure: 0 };

/** Première ligne de « ffmpeg -version » -> { majeure, mineure } ; versions git (N-…, git-…, AAAA-MM-JJ-git-…) : récentes. */
function lireVersion(texte) {
  const m = /ffmpeg version (\S+)/.exec(String(texte));
  if (!m) return null;
  if (/^(N-|git-|\d{4}-\d{2}-\d{2}-git-)/.test(m[1])) return RECENTE;
  const v = /^n?(\d+)\.(\d+)/.exec(m[1]);
  return v ? { majeure: Number(v[1]), mineure: Number(v[2]) } : null;
}

/** Commande d'installation de ffmpeg sur ce système (à montrer), ou null si aucune n'est connue. */
function commandeSysteme({ plateforme = process.platform, existe = fs.existsSync } = {}) {
  if (plateforme === 'win32') return 'winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements';
  if (plateforme === 'darwin') return 'brew install ffmpeg';
  if (existe('/usr/bin/apt')) return 'sudo apt install ffmpeg';
  if (existe('/usr/bin/dnf')) return 'sudo dnf install ffmpeg';
  if (existe('/usr/bin/pacman')) return 'sudo pacman -S ffmpeg';
  return null;
}

/** Commande que le skill peut lancer lui-même (sans sudo, qui demande un mot de passe), ou null. */
function commandeSure(options = {}) {
  const c = commandeSysteme(options);
  return c && !c.startsWith('sudo ') ? c : null;
}

/** Texte d'installation à montrer : la commande du système, ou une phrase si aucune n'est connue. */
function commandeInstallation(options = {}) {
  return commandeSysteme(options) || 'installer le paquet ffmpeg avec le gestionnaire de paquets du système';
}

function emplacements(env, plateforme) {
  const exe = plateforme === 'win32' ? '.exe' : '';
  // Chemins du système visé (et non de celui qui lance) : les mêmes en vrai, et justes quand un test simule un autre système.
  const chemins = plateforme === 'win32' ? path.win32 : path.posix;
  const dossiers = [];
  if (env.PM_FFMPEG) {
    const v = env.PM_FFMPEG.replace(/^"(.*)"$/, '$1');
    dossiers.push(/ffmpeg(\.exe)?$/i.test(v) ? chemins.dirname(v) : v);
  }
  const separateur = plateforme === 'win32' ? ';' : ':';
  for (const brut of String(env.PATH || env.Path || '').split(separateur)) {
    const d = brut.trim().replace(/^"(.*)"$/, '$1');
    if (d && chemins.isAbsolute(d)) dossiers.push(d);
  }
  if (plateforme === 'win32') {
    if (env.LOCALAPPDATA) dossiers.push(chemins.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'));
    if (env.USERPROFILE) dossiers.push(chemins.join(env.USERPROFILE, 'scoop', 'shims'));
    dossiers.push('C:\\ffmpeg\\bin', 'C:\\Program Files\\ffmpeg\\bin');
  } else if (plateforme === 'darwin') {
    dossiers.push('/opt/homebrew/bin', '/usr/local/bin');
  } else {
    dossiers.push('/usr/bin', '/usr/local/bin', '/snap/bin');
  }
  return dossiers.map((d) => ({ ffmpeg: chemins.normalize(chemins.join(d, `ffmpeg${exe}`)), ffprobe: chemins.normalize(chemins.join(d, `ffprobe${exe}`)) }));
}

const executerParDefaut = (chemin, args) => execFileSync(chemin, args, { encoding: 'utf8', timeout: 15000, windowsHide: true });
const suffisante = (v) => v.majeure > MINIMUM.majeure || (v.majeure === MINIMUM.majeure && v.mineure >= MINIMUM.mineure);

/** -> { present, chemin, cheminProbe, version, versionOk, commande, installer, message } */
function trouverFfmpeg({ env = process.env, plateforme = process.platform, existe = fs.existsSync, executer = executerParDefaut } = {}) {
  const commande = commandeSure({ plateforme, existe });
  const installer = commandeInstallation({ plateforme, existe });
  const conseil = commandeSysteme({ plateforme, existe }) ? `« ${installer} »` : installer;
  const absent = (message) => ({ present: false, chemin: null, cheminProbe: null, version: null, versionOk: false, commande, installer, message });
  let sansProbe = null;
  let ancien = null;
  for (const e of emplacements(env, plateforme)) {
    if (!existe(e.ffmpeg)) continue;
    if (!existe(e.ffprobe)) { sansProbe = sansProbe || e.ffmpeg; continue; }
    let sortie;
    try { sortie = executer(e.ffmpeg, ['-version']); } catch { continue; }
    if (!/ffmpeg version/.test(String(sortie))) continue;
    // Version illisible : gardée, supposée récente (ffmpeg dira lui-même s'il ne sait pas faire).
    const v = lireVersion(sortie);
    const version = v ? (v === RECENTE ? 'récente' : `${v.majeure}.${v.mineure}`) : 'inconnue';
    const trouve = { present: true, chemin: e.ffmpeg, cheminProbe: e.ffprobe, version, commande, installer };
    if (!v || suffisante(v)) return { ...trouve, versionOk: true, message: `ffmpeg ${version === 'inconnue' ? '(version inconnue)' : version} est prêt pour l'export fidèle.` };
    // Trop ancien : gardé en réserve, un plus récent peut suivre (winget, scoop…).
    ancien = ancien || { ...trouve, versionOk: false, message: `ffmpeg ${version} est trop ancien : il faut la version 4.4 ou plus récente (${conseil}).` };
  }
  if (ancien) return ancien;
  if (sansProbe) return absent(`ffmpeg est là (${sansProbe}) mais pas ffprobe, qui l'accompagne d'habitude : réinstaller ffmpeg (${conseil}).`);
  return absent(`ffmpeg n'est pas installé : l'export fidèle en a besoin (${conseil}). Sans lui, la vidéo s'exporte dans le navigateur.`);
}

/** Lance un programme ; -> Promise<{ code, sortie: Buffer, erreurs: string }> ; arrêté si signal. */
function lancer(programme, args, { entree = null, signal, erreursMax = 4000 } = {}) {
  return new Promise((resoudre, rejeter) => {
    const p = spawn(programme, args, { stdio: [entree ? 'pipe' : 'ignore', 'pipe', 'pipe'], windowsHide: true });
    const sortie = [];
    let erreurs = '';
    let annule = false;
    let erreurEntree = null;
    const surAnnulation = () => { annule = true; try { p.kill(); } catch { /* déjà arrêté */ } };
    if (signal) { if (signal.aborted) surAnnulation(); else signal.addEventListener('abort', surAnnulation, { once: true }); }
    p.stdout.on('data', (d) => sortie.push(d));
    p.stderr.on('data', (d) => { erreurs = (erreurs + d.toString()).slice(-erreursMax); });
    p.on('error', (e) => rejeter(e));
    p.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', surAnnulation);
      // Rejet seulement une fois ffmpeg arrêté : son fichier de sortie est alors libre (Windows).
      if (erreurEntree) rejeter(erreurEntree);
      else if (annule) rejeter(new Error('export annulé'));
      else resoudre({ code, sortie: Buffer.concat(sortie), erreurs });
    });
    if (entree) entree(p.stdin).catch((e) => { erreurEntree = e; try { p.kill(); } catch { /* déjà arrêté */ } });
  });
}

const derniereLigne = (texte) => String(texte).trim().split(/\r?\n/).slice(-3).join(' ');

/** Étiquettes de couleur posées sur tout encodage H.264 (spec Rendu et export, 5.2) : BT.709 en plage limitée. */
const ETIQUETTES = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
/** Conversion des PNG capturés (RVB pleine plage) en YUV 4:2:0 BT.709 plage limitée, faite une fois par ffmpeg. Idée d'argo
 *  (src/export.ts) et de reanimate (render.ts : out_color_matrix=bt709:out_range=tv), réécrite. */
const VERS_BT709 = 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p';
const PARAMS_X264 = 'aq-mode=3:aq-strength=0.8:colorprim=bt709:transfer=bt709:colormatrix=bt709';
/** Réglages des encodeurs matériels du brouillon (5.7), à qualité constante. */
const MATERIEL = {
  h264_nvenc: { args: ['-preset', 'p4', '-rc', 'vbr', '-cq', '26', '-b:v', '0'], pixels: 'yuv420p' },
  h264_qsv: { args: ['-global_quality', '26'], pixels: 'nv12' },
  h264_amf: { args: ['-quality', 'balanced', '-rc', 'cqp', '-qp_i', '26', '-qp_p', '28'], pixels: 'yuv420p' },
  h264_videotoolbox: { args: ['-q:v', '55'], pixels: 'yuv420p' },
};
const ORDRE_MATERIEL = ['h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox'];

/**
 * Réglages d'encodage vidéo (usages.json, voie fidèle : crf ou debit, preset, tune, debitMax, tampon, gop en secondes, profil,
 * niveau, encodeur) -> arguments de sortie de ffmpeg (H.264, BT.709 étiqueté, -video_track_timescale 90000). Les segments
 * d'un même fichier reçoivent tous les mêmes arguments : la concaténation sans réencodage l'exige.
 */
function argsVideo(r, ips) {
  const gop = Math.max(1, Math.round((r.gop || 2) * ips));
  const commun = ['-r', String(ips), '-g', String(gop), ...ETIQUETTES, '-video_track_timescale', '90000'];
  const materiel = r.encodeur && MATERIEL[r.encodeur];
  if (materiel) return ['-c:v', r.encodeur, ...materiel.args, '-pix_fmt', materiel.pixels, ...commun];
  const a = ['-c:v', 'libx264', '-preset', r.preset || 'medium'];
  if (r.tune) a.push('-tune', r.tune);
  if (r.debit) a.push('-b:v', `${r.debit}k`); else a.push('-crf', String(r.crf === undefined || r.crf === null ? 18 : r.crf));
  if (r.debitMax) a.push('-maxrate', `${r.debitMax}k`, '-bufsize', `${r.tampon || 2 * r.debitMax}k`);
  if (r.profil) a.push('-profile:v', r.profil);
  if (r.niveau) a.push('-level:v', String(r.niveau));
  a.push('-x264-params', PARAMS_X264, '-pix_fmt', 'yuv420p');
  return [...a, ...commun];
}

/** Ancien appel ({ crf, preset }) ou réglages complets -> réglages. */
const reglagesDe = ({ reglages, crf, preset }) => reglages || { crf, preset: preset || 'medium' };
const reduction = (taille) => (taille ? `scale=${taille[0]}:${taille[1]}:flags=lanczos:in_color_matrix=bt709:out_color_matrix=bt709:in_range=tv:out_range=tv` : null);

/** Largeur des vignettes en gris des statistiques d'export (spec S2, 5.12). */
const LARGEUR_STATS = 192;

/** Images PNG (itérable asynchrone) -> segment H.264 ; écriture respectant la contre-pression de ffmpeg.
 *  Une seule passe de ffmpeg : les PNG sont convertis une fois en BT.709, puis écrits dans l'intermédiaire (sortie, reglages)
 *  et, si derive est donné ({ sortie, reglages, taille? }), dans le fichier dérivé d'un usage (sans perte de génération ;
 *  taille : réduction lanczos). profil(phase, ms) : temps d'écriture vers ffmpeg, attente de la contre-pression comprise
 *  (« ecriture »). stats : vignettes en gris de 192 px sur la sortie standard -> { vignettes: [Uint8Array] }. */
async function encoderSegment({ ffmpeg, sortie, ips, crf, preset, reglages, derive = null, images, signal, profil, stats = false }) {
  let n = 0;
  const r = reglagesDe({ reglages, crf, preset });
  const entree = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(ips), '-c:v', 'png', '-i', '-'];
  const branches = [];
  if (derive) {
    branches.push(`[c]${VERS_BT709},split=2[i][d0]`);
    branches.push(derive.taille ? `[d0]${reduction(derive.taille)}[d]` : '[d0]null[d]');
  } else branches.push(`[c]${VERS_BT709}[i]`);
  const graphe = stats
    ? ['[0:v]split=2[c][s]', ...branches, `[s]scale=${LARGEUR_STATS}:-2:flags=area,format=gray[g]`]
    : ['[0:v]null[c]', ...branches];
  const args = [...entree, '-filter_complex', graphe.join(';'), '-map', '[i]', ...argsVideo(r, ips), '-f', 'mp4', sortie];
  if (derive) args.push('-map', '[d]', ...argsVideo(derive.reglages, ips), '-f', 'mp4', derive.sortie);
  if (stats) args.push('-map', '[g]', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1');
  const res = await lancer(ffmpeg, args, {
    signal,
    entree: async (stdin) => {
      stdin.on('error', () => { /* ffmpeg arrêté : sa sortie d'erreur dira pourquoi */ });
      for await (const png of images) {
        if (signal && signal.aborted) break;
        n++;
        const t0 = profil ? performance.now() : 0;
        if (!stdin.write(png)) await new Promise((r2) => stdin.once('drain', r2));
        if (profil) profil('ecriture', performance.now() - t0);
      }
      stdin.end();
    },
  });
  if (res.code !== 0) throw new Error(`ffmpeg n'a pas pu encoder la vidéo (${derniereLigne(res.erreurs) || `code ${res.code}`})`);
  if (!stats) return undefined;
  // Vignettes brutes bout à bout : une par image écrite (taille déduite du total).
  const taille = n ? res.sortie.length / n : 0;
  if (!n || !Number.isInteger(taille) || taille % LARGEUR_STATS) return { vignettes: null };
  const vignettes = [];
  for (let k = 0; k < n; k++) vignettes.push(new Uint8Array(res.sortie.buffer, res.sortie.byteOffset + k * taille, taille));
  return { vignettes };
}

/** Segment déjà encodé (intermédiaire) -> fichier dérivé avec d'autres réglages, sans recapture (spec Rapidité 5.16) ;
 *  taille : réduction lanczos (une sortie 720p ou 540p tirée d'un intermédiaire 1080p, spec Rendu et export 5.1.7). */
async function reencoderSegment({ ffmpeg, entree, sortie, ips, crf, preset, reglages, taille, signal }) {
  const filtre = taille ? ['-vf', reduction(taille)] : [];
  const r = await lancer(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', entree, '-an', ...filtre, ...argsVideo(reglagesDe({ reglages, crf, preset }), ips), '-f', 'mp4', sortie], { signal });
  if (r.code !== 0) throw new Error(`ffmpeg n'a pas pu réencoder le segment (${derniereLigne(r.erreurs) || `code ${r.code}`})`);
}

/**
 * Taille visée (spec Rendu et export, 5.3) : vidéo assemblée -> fichier final en deux passes x264 au débit reglages.debit,
 * réduite à taille si besoin, avec la piste son déjà encodée (copiée). journal : fichier des statistiques de la première
 * passe (sans extension), retiré ensuite. surPasse(1 | 2) : début de chaque passe.
 */
async function transcoderDeuxPasses({ ffmpeg, entree, sortie, ips, reglages, taille, audio = null, journal, signal, surPasse = () => {} }) {
  const filtre = taille ? ['-vf', reduction(taille)] : [];
  const video = argsVideo(reglages, ips);
  try {
    surPasse(1);
    const p1 = await lancer(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', entree, '-an', ...filtre, ...video, '-pass', '1', '-passlogfile', journal, '-f', 'null', '-'], { signal });
    if (p1.code !== 0) throw new Error(`ffmpeg n'a pas pu préparer la version légère (${derniereLigne(p1.erreurs) || `code ${p1.code}`})`);
    surPasse(2);
    const son = audio ? ['-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c:a', 'copy'] : ['-an'];
    const p2 = await lancer(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', entree, ...son, ...filtre, ...video, '-pass', '2', '-passlogfile', journal, '-movflags', '+faststart', '-f', 'mp4', sortie], { signal });
    if (p2.code !== 0) throw new Error(`ffmpeg n'a pas pu écrire la version légère (${derniereLigne(p2.erreurs) || `code ${p2.code}`})`);
  } finally {
    const dossier = path.dirname(journal);
    const base = path.basename(journal);
    try { for (const f of fs.readdirSync(dossier)) if (f.startsWith(base)) fs.rmSync(path.join(dossier, f), { force: true }); } catch { /* rien à nettoyer */ }
  }
}

/**
 * Encodeurs matériels utilisables pour le brouillon (5.7) : ceux que ffmpeg annonce, puis chacun essayé sur une image (un
 * encodeur listé mais sans pilote échoue ici, en silence). Résultat gardé dans <dossier>/encodeurs.json par chemin et
 * version de ffmpeg. -> { encodeur: nom | null, essayes: [{ nom, ok }] }. Ordre et idée d'argo (src/gpu-encoder.ts), réécrits.
 */
async function detecterEncodeurs({ ffmpeg, version = '', dossier, executer = lancer, plateforme = process.platform }) {
  const fichier = dossier ? path.join(dossier, 'encodeurs.json') : null;
  const cle = `${ffmpeg}|${version}`;
  let memoire = {};
  if (fichier) { try { memoire = JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch { /* première fois */ } }
  if (memoire[cle] && Array.isArray(memoire[cle].essayes)) return memoire[cle];
  let liste = '';
  try { liste = String((await executer(ffmpeg, ['-hide_banner', '-encoders'])).sortie || ''); } catch { liste = ''; }
  const candidats = ORDRE_MATERIEL.filter((n) => new RegExp(`\\s${n}\\s`).test(liste)).filter((n) => n !== 'h264_videotoolbox' || plateforme === 'darwin');
  const essayes = [];
  let choisi = null;
  for (const nom of candidats) {
    let ok = false;
    try {
      const r = await executer(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=256x256:r=30', '-frames:v', '1',
        '-c:v', nom, ...MATERIEL[nom].args, '-pix_fmt', MATERIEL[nom].pixels, '-f', 'null', '-']);
      ok = r.code === 0;
    } catch { ok = false; }
    essayes.push({ nom, ok });
    if (ok) { choisi = nom; break; }
  }
  const resultat = { encodeur: choisi, essayes, date: new Date().toISOString() };
  if (fichier) {
    try { fs.mkdirSync(dossier, { recursive: true }); fs.writeFileSync(fichier, JSON.stringify({ ...memoire, [cle]: resultat }, null, 2), 'utf8'); } catch { /* mémoire facultative */ }
  }
  return resultat;
}

/** -> { duree, images, largeur, hauteur, video, audio, dureeAudio, couleurs, vignette, chapitres, alpha, octets }
 *  compter : 'images' (décode tout : -count_frames, la garantie de lecture du fichier final) ou 'paquets' (-count_packets,
 *  sans décoder : validité d'un segment, spec Rapidité 5.18 ; une image H.264 par paquet). */
async function sonder({ ffprobe, fichier, compter = 'images' }) {
  // compter : 'aucun' : pistes et durée seulement, sans rien décoder (le nombre d'images est celui qu'annonce le fichier).
  const compte = compter === 'paquets' ? ['-count_packets'] : compter === 'aucun' ? [] : ['-count_frames'];
  const r = await lancer(ffprobe, ['-v', 'error', ...compte, '-show_streams', '-show_format', '-show_chapters', '-of', 'json', fichier]);
  if (r.code !== 0) throw new Error(`ffprobe n'a pas pu lire la vidéo (${derniereLigne(r.erreurs)})`);
  const j = JSON.parse(r.sortie.toString('utf8'));
  const flux = j.streams || [];
  const image = (s) => Boolean(s.disposition && s.disposition.attached_pic);
  const v = flux.find((s) => s.codec_type === 'video' && !image(s));
  const a = flux.find((s) => s.codec_type === 'audio');
  return {
    duree: Number((j.format && j.format.duration) || (v && v.duration) || 0),
    images: !v ? 0 : compter === 'paquets' ? Number(v.nb_read_packets || 0) : Number(v.nb_read_frames || v.nb_frames || 0),
    largeur: v ? v.width : 0,
    hauteur: v ? v.height : 0,
    video: v ? v.codec_name : null,
    audio: a ? a.codec_name : null,
    dureeAudio: a ? Number(a.duration || 0) : null,
    couleurs: v ? { espace: v.color_space || null, primaires: v.color_primaries || null, transfert: v.color_transfer || null, plage: v.color_range || null } : null,
    vignette: flux.some(image),
    chapitres: (j.chapters || []).length,
    // Couche transparente : format de pixels avec « a » (yuva420p, rgba…), ou alpha_mode du VP9 (jalon 4).
    alpha: Boolean(v && (/^(yuva|rgba|bgra|argb|abgr|gbrap|ya)/.test(String(v.pix_fmt || '')) || (v.tags && v.tags.alpha_mode === '1'))),
    octets: Number((j.format && j.format.size) || 0),
  };
}

/**
 * Vérifications propres à l'export par usage (spec Rendu et export, 5.22 point 4), lues par ffprobe, sans décodage :
 * étiquettes de couleur, taille sous la cible et, pour les jalons suivants, vignette, chapitres, couche transparente.
 * attendu : { etiquettes?, octetsMax?, vignette?, chapitres?, alpha?, nom? } -> [message français] (vide : rien à redire).
 */
function controlesSortie(sonde, attendu = {}) {
  const U = require('./usages.js');
  const defauts = [];
  const c = sonde.couleurs || {};
  if (attendu.etiquettes && !(c.espace === 'bt709' && c.primaires === 'bt709' && c.transfert === 'bt709' && c.plage === 'tv')) {
    defauts.push('Les couleurs de la vidéo ne sont pas marquées comme il faut (certains lecteurs les montreraient fausses) : l\'export s\'arrête, rien n\'est écrit.');
  }
  if (attendu.octetsMax && sonde.octets > attendu.octetsMax) {
    const plus = Math.ceil((sonde.octets / U.MO) * 1.1);
    defauts.push(`La version ${attendu.nom || 'demandée'} fait ${U.tailleFrancaise(sonde.octets)}, au-dessus des ${U.nombreFrancais(attendu.octetsMax / U.MO)} Mo demandés : je peux viser ${plus} Mo, ou exporter une seule scène.`);
  }
  if (attendu.vignette && !sonde.vignette) defauts.push('La vignette n\'a pas pu être intégrée à la vidéo : l\'export s\'arrête, rien n\'est écrit.');
  if (attendu.chapitres && !sonde.chapitres) defauts.push('Les chapitres n\'ont pas pu être intégrés à la vidéo : l\'export s\'arrête, rien n\'est écrit.');
  if (attendu.alpha && !sonde.alpha) defauts.push('La transparence n\'a pas été gardée dans la vidéo : l\'export s\'arrête, rien n\'est écrit.');
  return defauts;
}

/** Image de la vidéo à l'instant t, en PNG ; taille : [largeur, hauteur] pour la comparer à une capture d'une autre taille. */
async function extraireImage({ ffmpeg, fichier, t, taille }) {
  const filtre = taille ? ['-vf', `scale=${taille[0]}:${taille[1]}:flags=bicubic`] : [];
  const r = await lancer(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', fichier, '-frames:v', '1', ...filtre, '-f', 'image2pipe', '-c:v', 'png', '-']);
  if (r.code !== 0 || !r.sortie.length) throw new Error(`ffmpeg n'a pas pu lire une image de la vidéo (${derniereLigne(r.erreurs)})`);
  return r.sortie;
}

/** Piste son de la vidéo : WAV déjà mixé et normalisé par la page -> AAC (debit kbit/s, 192 par défaut), 48 kHz, stéréo, à
 *  la durée exacte (complétée par du silence ou coupée). */
async function encoderSon({ ffmpeg, wav, duree, sortie, signal, debit = 192 }) {
  const r = await lancer(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-vn', '-af', `apad,atrim=0:${duree}`,
    '-ar', '48000', '-ac', '2', '-c:a', 'aac', '-b:a', `${debit}k`, '-t', String(duree), '-f', 'mp4', sortie], { signal });
  if (r.code !== 0) throw new Error(`son illisible (${derniereLigne(r.erreurs) || `code ${r.code}`})`);
}

/** Prise WAV -> Opus 48 kbit/s mono (Ogg), plus léger à embarquer dans la page. */
async function encoderOpus({ ffmpeg, wav, sortie }) {
  const r = await lancer(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', wav, '-vn', '-ac', '1', '-c:a', 'libopus', '-b:a', '48k', '-f', 'ogg', sortie]);
  if (r.code !== 0) throw new Error(`encodage Opus impossible (${derniereLigne(r.erreurs)})`);
}

/** Tout fichier son lisible par ffmpeg -> WAV PCM 16 bits mono 48 kHz. */
async function importerAudio({ ffmpeg, entree, sortie }) {
  const r = await lancer(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', entree, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', '-f', 'wav', sortie]);
  if (r.code !== 0) throw new Error(`ce fichier son n'a pas pu être lu (${derniereLigne(r.erreurs)})`);
}

/** Sonie intégrée (LUFS) et crête vraie (dBTP) d'un fichier, mesurées par le filtre ebur128. */
async function mesurerSonie({ ffmpeg, fichier }) {
  const r = await lancer(ffmpeg, ['-hide_banner', '-nostats', '-i', fichier, '-vn', '-af', 'ebur128=peak=true:framelog=verbose', '-f', 'null', '-']);
  if (r.code !== 0) throw new Error(`sonie illisible (${derniereLigne(r.erreurs)})`);
  const nombre = (re) => {
    const m = [...r.erreurs.matchAll(re)].pop();
    return !m ? NaN : m[1] === '-inf' ? -Infinity : Number(m[1]);
  };
  return { integree: nombre(/I:\s+(-inf|-?[\d.]+) LUFS/g), crete: nombre(/Peak:\s+(-inf|-?[\d.]+) dBFS/g) };
}

/**
 * Vérification du fichier exporté en une seule passe (spec S2, 5.12) : chaque image décodée (comptée), noirs (blackdetect),
 * sonie intégrée et crête vraie (ebur128), silences (silencedetect). Le fichier n'est décodé qu'une fois.
 * -> { images, integree, crete, noirs: [{ debut, fin, duree }], silences: [{ debut, fin | null, duree | null }] }
 * noir : { duree, seuil } (noirDuree, noirSeuil) ; silence : { niveau, duree } (silenceNiveau, silenceDuree) ; audio : la vidéo a
 * une piste son. Idée : verify d'explainroo (MIT, © 2026 Vincent Schmalbach), chiffres repris.
 */
async function verifierFichier({ ffmpeg, fichier, audio = true, noir = { duree: 0.4, seuil: 0.08 }, silence = { niveau: -50, duree: 2.5 } }) {
  const filtres = ['-vf', `blackdetect=d=${noir.duree}:pix_th=${noir.seuil}`];
  if (audio) filtres.push('-af', `ebur128=peak=true,silencedetect=n=${silence.niveau}dB:d=${silence.duree}`);
  const r = await lancer(ffmpeg, ['-hide_banner', '-i', fichier, ...filtres, '-f', 'null', '-'], { erreursMax: 400000 });
  if (r.code !== 0) throw new Error(`la vidéo n'a pas pu être relue (${derniereLigne(r.erreurs)})`);
  const t = r.erreurs;
  const nombre = (re) => {
    const m = [...t.matchAll(re)].pop();
    return !m ? NaN : m[1] === '-inf' ? -Infinity : Number(m[1]);
  };
  const images = nombre(/frame=\s*(\d+)/g);
  const noirs = [...t.matchAll(/black_start:\s*(-?[\d.]+)\s+black_end:\s*([\d.]+)\s+black_duration:\s*([\d.]+)/g)]
    .map((m) => ({ debut: Number(m[1]), fin: Number(m[2]), duree: Number(m[3]) }));
  const silences = [];
  for (const m of t.matchAll(/silence_start:\s*(-?[\d.]+)|silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g)) {
    if (m[1] !== undefined) silences.push({ debut: Math.max(0, Number(m[1])), fin: null, duree: null });
    else if (silences.length && silences[silences.length - 1].fin === null) Object.assign(silences[silences.length - 1], { fin: Number(m[2]), duree: Number(m[3]) });
  }
  return {
    images: Number.isFinite(images) ? images : null,
    integree: audio ? nombre(/I:\s+(-inf|-?[\d.]+) LUFS/g) : null,
    crete: audio ? nombre(/Peak:\s+(-inf|-?[\d.]+) dBFS/g) : null,
    noirs,
    silences,
  };
}

/** Segments -> un fichier, sans réencodage (démultiplexeur concat), prêt à lire en flux (+faststart). */
async function assemblerSegments({ ffmpeg, segments, sortie, audio }) {
  const liste = `${sortie}.liste.txt`;
  fs.writeFileSync(liste, segments.map((s) => `file '${path.resolve(s).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
  try {
    // Piste son (facultative) ajoutée sans réencodage de l'image.
    // Pas de « -shortest » : il couperait les dernières images ; la piste est déjà à la durée exacte.
    const son = audio ? ['-i', audio, '-map', '0:v:0', '-map', '1:a:0'] : [];
    const r = await lancer(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', liste, ...son, '-c', 'copy', '-movflags', '+faststart', '-video_track_timescale', '90000', '-f', 'mp4', sortie]);
    if (r.code !== 0) throw new Error(`ffmpeg n'a pas pu assembler la vidéo (${derniereLigne(r.erreurs)})`);
  } finally {
    fs.rmSync(liste, { force: true });
  }
}

/** Écart moyen (0 à 1) entre deux images PNG, sur le rouge, le vert et le bleu, comparées par blocs d'environ 40 000 moyennes
 *  (un grain de pellicule ou un bruit fin, que l'encodage lisse, ne compte pas ; une image décalée ou noire, si) ; 1 si les
 *  tailles diffèrent. */
function ecartImages(a, b) {
  const x = decoderPNG(a);
  const y = decoderPNG(b);
  if (x.largeur !== y.largeur || x.hauteur !== y.hauteur) return 1;
  let somme = 0;
  let n = 0;
  const pas = Math.max(1, Math.floor(Math.sqrt((x.largeur * x.hauteur) / 40000)));
  for (let j = 0; j < x.hauteur; j += pas) {
    for (let i = 0; i < x.largeur; i += pas) {
      const d = [0, 0, 0];
      for (let v = j; v < Math.min(j + pas, x.hauteur); v++) {
        for (let u = i; u < Math.min(i + pas, x.largeur); u++) {
          const p = x.pixel(u, v);
          const q = y.pixel(u, v);
          for (let k = 0; k < 3; k++) d[k] += p[k] - q[k];
        }
      }
      const aire = (Math.min(j + pas, x.hauteur) - j) * (Math.min(i + pas, x.largeur) - i);
      for (let k = 0; k < 3; k++) somme += Math.abs(d[k]) / aire;
      n += 3;
    }
  }
  return somme / n / 255;
}

module.exports = {
  lireVersion, commandeSure, commandeInstallation, trouverFfmpeg, MINIMUM, encoderSegment, reencoderSegment, transcoderDeuxPasses, sonder,
  extraireImage, assemblerSegments, ecartImages, encoderSon, mesurerSonie, verifierFichier, encoderOpus, importerAudio, argsVideo,
  detecterEncodeurs, controlesSortie, lancer, LARGEUR_STATS, ETIQUETTES, VERS_BT709, MATERIEL, ORDRE_MATERIEL,
};
