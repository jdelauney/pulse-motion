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

/** Commande sûre à lancer pour installer ffmpeg sur ce système, ou null s'il n'y en a pas de connue. */
function commandeSure({ plateforme = process.platform, existe = fs.existsSync } = {}) {
  if (plateforme === 'win32') return 'winget install --id Gyan.FFmpeg -e';
  if (plateforme === 'darwin') return 'brew install ffmpeg';
  if (existe('/usr/bin/apt')) return 'sudo apt install ffmpeg';
  if (existe('/usr/bin/dnf')) return 'sudo dnf install ffmpeg';
  if (existe('/usr/bin/pacman')) return 'sudo pacman -S ffmpeg';
  return null;
}

/** Texte d'installation à montrer : la commande, ou une phrase si aucune commande n'est connue. */
function commandeInstallation(options = {}) {
  return commandeSure(options) || 'installer le paquet ffmpeg avec le gestionnaire de paquets du système';
}

function emplacements(env, plateforme) {
  const exe = plateforme === 'win32' ? '.exe' : '';
  const chemins = plateforme === 'win32' ? path.win32 : path.posix;
  const dossiers = [];
  if (env.PM_FFMPEG) {
    const v = env.PM_FFMPEG.replace(/^"(.*)"$/, '$1');
    dossiers.push(/ffmpeg(\.exe)?$/i.test(v) ? path.dirname(v) : v);
  }
  const separateur = plateforme === 'win32' ? ';' : ':';
  for (const brut of String(env.PATH || env.Path || '').split(separateur)) {
    const d = brut.trim().replace(/^"(.*)"$/, '$1');
    if (d && chemins.isAbsolute(d)) dossiers.push(d);
  }
  if (plateforme === 'win32') {
    if (env.LOCALAPPDATA) dossiers.push(path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'));
    if (env.USERPROFILE) dossiers.push(path.join(env.USERPROFILE, 'scoop', 'shims'));
    dossiers.push('C:\\ffmpeg\\bin', 'C:\\Program Files\\ffmpeg\\bin');
  } else if (plateforme === 'darwin') {
    dossiers.push('/opt/homebrew/bin', '/usr/local/bin');
  } else {
    dossiers.push('/usr/bin', '/usr/local/bin', '/snap/bin');
  }
  return dossiers.map((d) => ({ ffmpeg: path.normalize(path.join(d, `ffmpeg${exe}`)), ffprobe: path.normalize(path.join(d, `ffprobe${exe}`)) }));
}

const executerParDefaut = (chemin, args) => execFileSync(chemin, args, { encoding: 'utf8', timeout: 15000, windowsHide: true });
const suffisante = (v) => v.majeure > MINIMUM.majeure || (v.majeure === MINIMUM.majeure && v.mineure >= MINIMUM.mineure);

/** -> { present, chemin, cheminProbe, version, versionOk, commande, installer, message } */
function trouverFfmpeg({ env = process.env, plateforme = process.platform, existe = fs.existsSync, executer = executerParDefaut } = {}) {
  const commande = commandeSure({ plateforme, existe });
  const installer = commandeInstallation({ plateforme, existe });
  const conseil = commande ? `« ${commande} »` : installer;
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
function lancer(programme, args, { entree = null, signal } = {}) {
  return new Promise((resoudre, rejeter) => {
    const p = spawn(programme, args, { stdio: [entree ? 'pipe' : 'ignore', 'pipe', 'pipe'], windowsHide: true });
    const sortie = [];
    let erreurs = '';
    let annule = false;
    const surAnnulation = () => { annule = true; try { p.kill(); } catch { /* déjà arrêté */ } };
    if (signal) { if (signal.aborted) surAnnulation(); else signal.addEventListener('abort', surAnnulation, { once: true }); }
    p.stdout.on('data', (d) => sortie.push(d));
    p.stderr.on('data', (d) => { erreurs = (erreurs + d.toString()).slice(-4000); });
    p.on('error', (e) => rejeter(e));
    p.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', surAnnulation);
      if (annule) rejeter(new Error('export annulé'));
      else resoudre({ code, sortie: Buffer.concat(sortie), erreurs });
    });
    if (entree) entree(p.stdin).catch((e) => { try { p.kill(); } catch { /* déjà arrêté */ } rejeter(e); });
  });
}

const derniereLigne = (texte) => String(texte).trim().split(/\r?\n/).slice(-3).join(' ');

/** Images PNG (itérable asynchrone) -> segment H.264 ; écriture respectant la contre-pression de ffmpeg. */
async function encoderSegment({ ffmpeg, sortie, ips, crf, images, signal }) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(ips), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-r', String(ips), sortie];
  const r = await lancer(ffmpeg, args, {
    signal,
    entree: async (stdin) => {
      stdin.on('error', () => { /* ffmpeg arrêté : sa sortie d'erreur dira pourquoi */ });
      for await (const png of images) {
        if (signal && signal.aborted) break;
        if (!stdin.write(png)) await new Promise((r2) => stdin.once('drain', r2));
      }
      stdin.end();
    },
  });
  if (r.code !== 0) throw new Error(`ffmpeg n'a pas pu encoder la vidéo (${derniereLigne(r.erreurs) || `code ${r.code}`})`);
}

/** -> { duree, images, largeur, hauteur, video, audio } */
async function sonder({ ffprobe, fichier }) {
  const r = await lancer(ffprobe, ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', fichier]);
  if (r.code !== 0) throw new Error(`ffprobe n'a pas pu lire la vidéo (${derniereLigne(r.erreurs)})`);
  const j = JSON.parse(r.sortie.toString('utf8'));
  const v = (j.streams || []).find((s) => s.codec_type === 'video');
  const a = (j.streams || []).find((s) => s.codec_type === 'audio');
  return {
    duree: Number((j.format && j.format.duration) || (v && v.duration) || 0),
    images: v ? Number(v.nb_read_frames || v.nb_frames || 0) : 0,
    largeur: v ? v.width : 0,
    hauteur: v ? v.height : 0,
    video: v ? v.codec_name : null,
    audio: a ? a.codec_name : null,
  };
}

/** Image de la vidéo à l'instant t, en PNG. */
async function extraireImage({ ffmpeg, fichier, t }) {
  const r = await lancer(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', fichier, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-']);
  if (r.code !== 0 || !r.sortie.length) throw new Error(`ffmpeg n'a pas pu lire une image de la vidéo (${derniereLigne(r.erreurs)})`);
  return r.sortie;
}

/** Segments -> un fichier, sans réencodage (démultiplexeur concat), prêt à lire en flux (+faststart). */
async function assemblerSegments({ ffmpeg, segments, sortie }) {
  const liste = `${sortie}.liste.txt`;
  fs.writeFileSync(liste, segments.map((s) => `file '${path.resolve(s).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  try {
    const r = await lancer(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', liste, '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', sortie]);
    if (r.code !== 0) throw new Error(`ffmpeg n'a pas pu assembler la vidéo (${derniereLigne(r.erreurs)})`);
  } finally {
    fs.rmSync(liste, { force: true });
  }
}

/** Écart moyen (0 à 1) entre deux images PNG, sur le rouge, le vert et le bleu ; 1 si les tailles diffèrent. */
function ecartImages(a, b) {
  const x = decoderPNG(a);
  const y = decoderPNG(b);
  if (x.largeur !== y.largeur || x.hauteur !== y.hauteur) return 1;
  let somme = 0;
  let n = 0;
  const pas = Math.max(1, Math.floor(Math.sqrt((x.largeur * x.hauteur) / 40000)));
  for (let j = 0; j < x.hauteur; j += pas) {
    for (let i = 0; i < x.largeur; i += pas) {
      const p = x.pixel(i, j);
      const q = y.pixel(i, j);
      somme += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
      n += 3;
    }
  }
  return somme / n / 255;
}

module.exports = { lireVersion, commandeSure, commandeInstallation, trouverFfmpeg, MINIMUM, encoderSegment, sonder, extraireImage, assemblerSegments, ecartImages };
