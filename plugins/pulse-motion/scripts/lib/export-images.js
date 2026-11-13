'use strict';
/* Pulse Motion – séquence d'images pour un monteur (spec S9, 5.14) : chaque image de la vidéo (ou d'un passage) en PNG, ou en
 * JPEG de qualité 95, par la capture fidèle (Chrome ou Edge sans fenêtre), **sans ffmpeg**. Premiere, DaVinci Resolve et After
 * Effects les importent comme une séquence.
 *
 *   sortie/images/<titre>/000001.png …   une image par instant (debut + (n − 1) / ips), numérotées sans trou
 *   sortie/images/<titre>/images.json    { ips, largeur, hauteur, debut, duree, nombre, empreinte, format, son, page }
 *   sortie/images/<titre>/son.wav        le mixage de la page sur la même plage (celui de « pulse-motion musique ecouter »)
 *
 * Taille : estimée avant de commencer (environ 2 Mo par image en PNG 1080p, 0,4 Mo en JPEG) ; au-delà de 2 Go, l'accord de la
 * personne est demandé (accord). Reprise : après une interruption, les images déjà écrites et valides de la même page (même
 * empreinte : page, taille, cadence, format, plage) sont gardées ; seules les autres sont capturées.
 * empreinte : sha256 de la suite des empreintes des images (deux exports du même projet donnent la même).
 *
 * exporterImages({ dossier, format?, de?, a?, ips?, estimer?, accord?, navigateur?, dossierStyles?, avecProvisoire?,
 *                  surProgression?, arreterApres? }) -> { ok, … }
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { lireDeroule } = require('./deroule.js');
const { ecrireAtomique } = require('./fichiers.js');
const { verifierPNG } = require('./png.js');

const MO_PAR_IMAGE = { png: 2, jpeg: 0.4 };
const ACCORD_OCTETS = 2 * 1024 ** 3;
const QUALITE_JPEG = 95;
const sha = (donnees) => crypto.createHash('sha256').update(donnees).digest('hex');
const virgule = (x) => String(Math.round(x * 100) / 100).replace('.', ',');

/** « png », « jpeg » ou « jpg » -> 'png' | 'jpeg' | null */
function lireFormat(v) {
  const f = String(v === undefined || v === null || v === true || v === '' ? 'png' : v).toLowerCase();
  return f === 'png' ? 'png' : f === 'jpeg' || f === 'jpg' ? 'jpeg' : null;
}

/** Secondes « 12,5 » ou « 12.5 » -> nombre | null (absent) | NaN (illisible). */
function lireSecondes(v) {
  if (v === undefined || v === null || v === '') return null;
  return /^\s*\d+(?:[.,]\d+)?\s*$/.test(String(v)) ? Number(String(v).replace(',', '.')) : NaN;
}

/** Image valide sur le disque (structure entière) : PNG vérifié avec ses sommes, JPEG de son début à sa fin. */
function imageValide(octets, format) {
  if (format === 'png') return !verifierPNG(octets, { sommes: true });
  return octets.length > 4 && octets[0] === 0xff && octets[1] === 0xd8 && octets[octets.length - 2] === 0xff && octets[octets.length - 1] === 0xd9;
}

/** Estimation de la taille de la séquence, avant toute capture. */
function estimer({ nombre, largeur, hauteur, format }) {
  const octets = Math.round(nombre * MO_PAR_IMAGE[format] * 1e6 * ((largeur * hauteur) / (1920 * 1080)));
  return { nombre, octets, taille: require('./usages.js').tailleFrancaise(octets), accordNecessaire: octets > ACCORD_OCTETS };
}

/** WAV coupé aux instants [debut, fin) (secondes). */
function couperWav(donnees, debut, fin) {
  const W = require('../../moteur/wav.js');
  const son = W.lire(new Uint8Array(donnees.buffer, donnees.byteOffset, donnees.byteLength));
  const a = Math.max(0, Math.round(debut * son.taux));
  const b = Math.max(a, Math.min(son.canaux[0].length, Math.round(fin * son.taux)));
  return Buffer.from(W.ecrire({ taux: son.taux, canaux: son.canaux.map((c) => c.subarray(a, b)) }));
}

async function exporterImages({ dossier, format: formatDemande, de, a, ips: ipsDemandees, estimer: seulementEstimer = false, accord = false,
  navigateur = require('./navigateur.js').trouverNavigateur(), dossierStyles, avecProvisoire = false, surProgression = () => {}, arreterApres = null } = {}) {
  const projet = path.resolve(dossier);
  const format = lireFormat(formatDemande);
  if (!format) return { ok: false, message: `Format d'image « ${formatDemande} » inconnu : png (sans perte, par défaut) ou jpeg (plus léger).` };
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  const E = require('./ebauche.js');
  const ebauches = E.scenesEbauche(projet, deroule);
  if (ebauches.length) return { ok: false, message: E.messageEbauches(ebauches), ebauches };
  const V = require('./voix.js');
  const provisoires = V.scenesProvisoires(projet, deroule);
  if (provisoires.length && !avecProvisoire) return { ok: false, message: V.messageProvisoire(provisoires) };
  const ips = ipsDemandees === undefined || ipsDemandees === null ? (deroule.format.ips || 30) : Number(ipsDemandees);
  if (!(Number.isInteger(ips) && ips >= 1 && ips <= 60)) return { ok: false, message: `Cadence « ${ipsDemandees} » : un nombre entier d'images par seconde, de 1 à 60 (24, 25, 30 ou 60 pour un monteur).` };
  const duree = V.minutageVideo(projet, deroule).duree;
  const d0 = lireSecondes(de), d1 = lireSecondes(a);
  if (Number.isNaN(d0) || Number.isNaN(d1)) return { ok: false, message: 'Début ou fin illisible : en secondes, par exemple --de 12,5 --a 18.' };
  if (d1 !== null && !(d1 > (d0 === null ? 0 : d0))) return { ok: false, message: 'La fin doit venir après le début.' };
  const L = require('./livrables.js');
  const plage = L.imagesDePlage({ debut: d0 === null ? 0 : d0, fin: d1 === null ? duree : d1 }, ips, duree);
  if (plage.erreur) return { ok: false, message: plage.erreur };
  const { TAILLES } = require('../export-fidele.js');
  const [largeur, hauteur] = TAILLES['1080p'][deroule.format.ratio] || TAILLES['1080p']['16:9'];
  const nombre = plage.f1 - plage.f0;
  const estimation = estimer({ nombre, largeur, hauteur, format });
  if (seulementEstimer) return { ok: true, estimation };
  if (estimation.accordNecessaire && !accord) {
    return { ok: false, raison: 'accord', estimation, message: `La séquence pèserait environ ${estimation.taille} (${nombre} images) : demandez l'accord de la personne avant de la faire (au-delà de 2 Go), ou proposez le JPEG, plus léger, ou un passage seulement.` };
  }
  if (!navigateur) return { ok: false, message: 'Chrome ou Edge introuvable : les images se capturent dans le navigateur. Lancez « pulse-motion outils » pour voir quoi installer.' };

  const { assembler, slug } = require('../assembler.js');
  const assemblage = assembler({ dossier: projet, dossierStyles, ecrire: false });
  if (!assemblage.ok) return { ok: false, message: `La page ne s'assemble pas : ${assemblage.erreurs.map((e) => e.message).join(' ')}` };
  const sortie = path.join(projet, 'sortie');
  const cible = path.join(sortie, 'images', slug(deroule.titre));
  const ext = format === 'png' ? 'png' : 'jpg';
  const nomImage = (k) => `${String(k + 1).padStart(6, '0')}.${ext}`;
  const page = sha(`${assemblage.html}\u0000${JSON.stringify({ largeur, hauteur, ips, format, f0: plage.f0, f1: plage.f1 })}`);
  fs.mkdirSync(cible, { recursive: true });
  // Reprise : une autre page (vidéo retouchée, autre plage, autre format) efface l'ancienne séquence ; la même la reprend.
  const fichierReprise = path.join(cible, '.reprise.json');
  const lireJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const precedente = lireJSON(fichierReprise) || lireJSON(path.join(cible, 'images.json'));
  const reprendre = Boolean(precedente && precedente.page === page);
  if (!reprendre) {
    for (const f of fs.readdirSync(cible)) if (/^\d{6}\.(png|jpg)$/.test(f) || f === 'images.json' || f === 'son.wav' || /\.part$/.test(f)) fs.rmSync(path.join(cible, f), { force: true });
  }
  ecrireAtomique(fichierReprise, `${JSON.stringify({ page }, null, 2)}\n`);
  const fichierPage = path.join(sortie, '.images-page.html');
  fs.writeFileSync(fichierPage, assemblage.html, 'utf8');
  const { ouvrirCapture } = require('./capture-fidele.js');
  let capture;
  const empreintes = [];
  let reprises = 0;
  let nouvelles = 0;
  try {
    capture = await ouvrirCapture({ fichierHtml: fichierPage, largeur, hauteur, navigateur, erreurs: true, gpu: require('../export-fidele.js').avecEffets(projet, deroule) });
    for (let k = 0; k < nombre; k++) {
      const fichier = path.join(cible, nomImage(k));
      if (reprendre && fs.existsSync(fichier)) {
        const octets = fs.readFileSync(fichier);
        if (imageValide(octets, format)) { empreintes.push(sha(octets)); reprises++; surProgression(k + 1, nombre, { reprises }); continue; }
      }
      if (arreterApres !== null && nouvelles >= arreterApres) return { ok: false, interrompu: true, message: 'Séquence interrompue : relancer la reprend là où elle s\'est arrêtée.', faites: k };
      const t = (plage.f0 + k) / ips;
      const octets = format === 'png' ? await capture.capturer(t) : await capture.capturerJpeg(t, { qualite: QUALITE_JPEG, sansSousTitres: false });
      ecrireAtomique(fichier, octets);
      empreintes.push(sha(octets));
      nouvelles++;
      surProgression(k + 1, nombre, { reprises });
    }
    // Son de la même plage : le mixage de la page (voix, musique, bruitages), sans ffmpeg.
    const son = await capture.rendreSon();
    const fichierSon = path.join(cible, 'son.wav');
    if (son.wav) ecrireAtomique(fichierSon, couperWav(son.wav, plage.f0 / ips, plage.f1 / ips));
    else fs.rmSync(fichierSon, { force: true });
    const info = { ips, largeur, hauteur, debut: plage.f0 / ips, duree: nombre / ips, nombre, empreinte: sha(empreintes.join('\n')), format, son: Boolean(son.wav), page };
    ecrireAtomique(path.join(cible, 'images.json'), `${JSON.stringify(info, null, 2)}\n`);
    fs.rmSync(fichierReprise, { force: true });
    const rel = (f) => path.relative(projet, f).split(path.sep).join('/');
    let octets = 0;
    for (const f of fs.readdirSync(cible)) octets += fs.statSync(path.join(cible, f)).size;
    return {
      ok: true, dossier: rel(cible), nombre, ips, largeur, hauteur, format, debut: info.debut, duree: info.duree, empreinte: info.empreinte, reprises,
      son: info.son, octets, taille: require('./usages.js').tailleFrancaise(octets),
      fichiers: { images: `${rel(cible)}/${nomImage(0)} … ${nomImage(nombre - 1)}`, info: rel(path.join(cible, 'images.json')), ...(info.son ? { son: rel(fichierSon) } : {}) },
      message: `${nombre} images ${format === 'png' ? 'PNG' : 'JPEG'} de ${largeur} × ${hauteur}, à ${ips} images par seconde, de ${virgule(info.debut)} s à ${virgule(info.debut + info.duree)} s${info.son ? ', avec le son à part (son.wav)' : ''}.`,
    };
  } finally {
    if (capture) await capture.fermer().catch(() => {});
    fs.rmSync(fichierPage, { force: true });
  }
}

module.exports = { exporterImages, estimer, imageValide, couperWav, lireFormat, MO_PAR_IMAGE, ACCORD_OCTETS, QUALITE_JPEG };
