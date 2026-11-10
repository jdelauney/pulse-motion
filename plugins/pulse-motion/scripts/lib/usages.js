'use strict';
/* Pulse Motion – usages d'export (spec Rendu et export, 5.1 et 5.3) : la source unique est scripts/usages.json, lue par
 * l'export fidèle, la commande exporter et, servie par l'aperçu, la voie du navigateur. Module pur (fichier lu une fois).
 *
 * lireUsages() -> le contenu de usages.json
 * resoudreUsage({ pour?, qualite?, ips?, tailleMax?, deroule, duree, titre? }) -> réglages effectifs, ou { erreur } :
 *   { usage, nom, definition, ips, fidele, navigateur, grainMax, tailleMax (octets) | null, debitVideo (kbit/s) | null,
 *     flou, fichiers, nomFichier } ; priorité : --qualite et --ips, puis l'usage, puis format.ips du déroulé ;
 *   débits de usages.json donnés à la définition de l'usage et à 30 images par seconde : ×1,5 au-delà de 30, et selon la
 *   définition (1080p 1, 720p 0,5, 540p 0,3) ; tune « auto » : animation, ou film si le déroulé a un post-traitement grain.
 * planTaille({ cible, duree, audio }) -> { definition, debitVideo } | { erreur } (5.3 : V = C × 8 × 0,96 / D − A).
 * nomFichier(slug, usage) -> « <slug>.mp4 » pour le web, « <slug>-<usage>.mp4 » sinon.
 * tailleFrancaise(octets) -> « 8,4 Mo » ; dureeFrancaise(secondes) -> « 6 min 10 s ».
 * tableauUsages() -> Markdown (pulse-motion reference usages) : usages, mots de la personne, réglages mesurés.
 */
const fs = require('node:fs');
const path = require('node:path');

const FICHIER = path.join(__dirname, '..', 'usages.json');
const DEFINITIONS = ['1080p', '720p', '540p'];
const FACTEUR_DEFINITION = { '1080p': 1, '720p': 0.5, '540p': 0.3 };
/** Seuils du courriel (5.3, à confirmer par la planche) : débit vidéo minimal de chaque définition, en kbit/s. */
const SEUILS_TAILLE = [['1080p', 2000], ['720p', 900], ['540p', 350]];
const MARGE_CONTENEUR = 0.96;
const MO = 1e6;

let cache = null;
function lireUsages() {
  if (!cache) cache = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  return cache;
}

const nomsUsages = (u = lireUsages()) => Object.keys(u.usages);
const listeFrancaise = (noms) => (noms.length < 2 ? noms.join('') : `${noms.slice(0, -1).join(', ')} ou ${noms[noms.length - 1]}`);

function messageUsageInconnu(pour, u = lireUsages()) {
  return `Usage « ${pour} » inconnu : ${listeFrancaise(nomsUsages(u))}.`;
}

function nombreFrancais(x, decimales = 1) {
  const r = Math.round(x * 10 ** decimales) / 10 ** decimales;
  return String(r).replace('.', ',');
}

function tailleFrancaise(octets) {
  const o = Number(octets) || 0;
  if (o >= 1e9) return `${nombreFrancais(o / 1e9)} Go`;
  if (o >= MO) return `${nombreFrancais(o / MO)} Mo`;
  return `${Math.max(1, Math.round(o / 1e3))} Ko`;
}

function dureeFrancaise(secondes) {
  const s = Math.max(0, Math.round(secondes));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
}

function nomFichier(slug, usage) {
  return usage === 'web' ? `${slug}.mp4` : `${slug}-${usage}.mp4`;
}

/** Taille visée (octets) et durée (s) -> définition et débit vidéo (kbit/s), ou refus avant toute capture. */
function planTaille({ cible, duree, audio = 96 }) {
  const debitVideo = Math.floor((cible * 8 * MARGE_CONTENEUR) / Math.max(0.1, duree) / 1000 - audio);
  for (const [definition, minimum] of SEUILS_TAILLE) if (debitVideo >= minimum) return { definition, debitVideo };
  // Taille qu'il faudrait au plus petit seuil, puis une proposition arrondie aux 5 Mo supérieurs.
  const necessaire = ((SEUILS_TAILLE[SEUILS_TAILLE.length - 1][1] + audio) * 1000 * Math.max(0.1, duree)) / 8 / MARGE_CONTENEUR;
  const mo = Math.ceil(necessaire / MO);
  const proposition = Math.max(mo, Math.ceil(mo / 5) * 5);
  return {
    erreur: `La vidéo dure ${dureeFrancaise(duree)} : même en petite définition, elle ne tient pas en ${nombreFrancais(cible / MO)} Mo (il faudrait environ ${mo} Mo). Je peux faire une version de ${proposition} Mo, ou une vidéo d'une seule scène.`,
    necessaireMo: mo,
    propositionMo: proposition,
  };
}

/** Le déroulé a-t-il un post-traitement de grain (vidéo ou scène) ? -> tune « film » au lieu d'« animation ». */
function avecGrain(deroule) {
  const posts = [...((deroule && deroule.post) || []), ...((deroule && deroule.scenes) || []).flatMap((s) => s.post || [])];
  return posts.some((p) => p && (p.shader === 'grain' || p.nom === 'grain'));
}

/** --flou : oui, non (ou vrai, faux) -> true, false ; absent -> null ; autre -> 'illisible'. */
function lireFlou(v) {
  if (v === undefined || v === null || v === '') return null;
  if (v === true || /^(oui|vrai|true|1)$/i.test(String(v))) return true;
  if (v === false || /^(non|faux|false|0)$/i.test(String(v))) return false;
  return 'illisible';
}

const arrondiKbit = (x) => Math.max(1, Math.round(x));

/**
 * Réglages effectifs d'un export. Erreurs (message français) : usage inconnu, qualité inconnue, images par seconde hors de
 * 1 à 60, taille visée trop petite pour la durée.
 */
function resoudreUsage({ pour, qualite, ips, tailleMax, flou, deroule = {}, duree = 0, usages = lireUsages() } = {}) {
  const usage = pour || usages.defaut;
  const u = usages.usages[usage];
  if (!u) return { erreur: messageUsageInconnu(usage, usages) };
  // Flou de mouvement (5.8) : celui de l'usage (le master), forcé par --flou oui|non.
  const flouLu = lireFlou(flou);
  if (flouLu === 'illisible') return { erreur: `Flou « ${flou} » illisible : oui ou non.` };
  if (qualite !== undefined && qualite !== null && !DEFINITIONS.includes(qualite)) return { erreur: `Qualité « ${qualite} » inconnue : 1080p, 720p ou 540p.` };
  let cadence;
  if (ips !== undefined && ips !== null && ips !== '') {
    cadence = Number(ips);
    if (!Number.isInteger(cadence) || cadence < 1 || cadence > 60) return { erreur: `Images par seconde « ${ips} » impossibles : de 1 à 60.` };
  } else {
    cadence = Math.min((deroule.format && deroule.format.ips) || 30, u.ipsMax || 60);
  }
  // Taille visée : --taille-max (Mo) pour tout usage, ou celle de l'usage (courriel).
  const tailleMo = tailleMax !== undefined && tailleMax !== null && tailleMax !== '' ? Number(tailleMax) : u.tailleMaxMo;
  if (tailleMo !== null && tailleMo !== undefined && !(tailleMo > 0)) return { erreur: `Taille « ${tailleMax} » illisible : un nombre de mégaoctets (ex. 25).` };
  const cible = tailleMo ? tailleMo * MO : null;
  const audio = u.fidele.audio || 128;
  let definition = qualite || (u.definition === 'auto' ? null : u.definition);
  let debitVideo = null;
  if (cible) {
    // Une vidéo à taille visée reste à 30 images par seconde au plus, même avec --ips.
    cadence = Math.min(cadence, 30);
    const plan = planTaille({ cible, duree, audio });
    if (plan.erreur) return { erreur: plan.erreur, necessaireMo: plan.necessaireMo, propositionMo: plan.propositionMo };
    if (!definition) definition = plan.definition;
    // Plafond : le débit ne dépasse jamais celui que l'usage s'autorise (une vidéo courte n'a pas besoin de remplir la taille).
    const plafond = u.fidele.debitMax ? u.fidele.debitMax * (FACTEUR_DEFINITION[definition] / FACTEUR_DEFINITION['1080p']) * (cadence > 30 ? 1.5 : 1) : Infinity;
    debitVideo = arrondiKbit(Math.min(plan.debitVideo, plafond));
  }
  if (!definition) definition = '1080p';
  // Débits de usages.json : à la définition de l'usage (1080p si « auto ») et à 30 images par seconde.
  const base = u.definition === 'auto' ? '1080p' : u.definition;
  const facteur = (FACTEUR_DEFINITION[definition] / FACTEUR_DEFINITION[base]) * (cadence > 30 ? 1.5 : 1);
  const tune = u.fidele.tune === 'auto' ? (avecGrain(deroule) ? 'film' : 'animation') : u.fidele.tune || null;
  const fidele = {
    crf: cible ? null : u.fidele.crf,
    preset: u.fidele.preset || 'medium',
    tune,
    debitMax: !cible && u.fidele.debitMax ? arrondiKbit(u.fidele.debitMax * facteur) : null,
    tampon: !cible && u.fidele.tampon ? arrondiKbit(u.fidele.tampon * facteur) : null,
    gop: u.fidele.gop || 2,
    profil: u.fidele.profil || 'high',
    niveau: (cadence > 30 ? u.fidele.niveau60 : u.fidele.niveau) || null,
    encodeur: u.fidele.encodeur || null,
    debit: debitVideo,
    passes: cible ? 2 : 1,
    audio,
  };
  const n = u.navigateur || {};
  const navigateur = {
    debit: debitVideo || arrondiKbit((n.debit || 6000) * facteur),
    gop: n.gop || 2,
    mode: cible ? 'constant' : n.mode || 'variable',
    latence: n.latence || 'quality',
    acceleration: n.acceleration || 'no-preference',
    codec: (cadence > 30 ? n.codec60 : n.codec) || null,
    audio,
  };
  return {
    usage, nom: u.nom, definition, ips: cadence, fidele, navigateur,
    grainMax: u.grainHz || null, tailleMax: cible, debitVideo,
    flou: flouLu === null ? Boolean(u.flou) : flouLu, flouForce: flouLu, fichiers: u.fichiers || [],
  };
}

/** Mots de la personne -> usage (5.4, point 2) : repris par le skill exporter et le wiki. */
const MOTS = [
  ['« pour YouTube, mon site, l\'intranet, ma plateforme de formation »', 'web'],
  ['« pour LinkedIn, Instagram, TikTok, les Shorts »', 'reseaux'],
  ['« pour la projeter, pour PowerPoint, pour un salon »', 'presentation'],
  ['« pour archiver, la meilleure qualité, pour mon monteur »', 'master'],
  ['« par courriel, par mail, WhatsApp, moins de 20 Mo »', 'courriel', 'avec la taille dite'],
  ['« vite fait, juste pour vérifier »', 'brouillon'],
];

/** Durée la plus longue qui tient dans une taille (Mo), au plus petit seuil de définition. -> secondes */
function dureeMaxPour(tailleMo, audio = 96) {
  return Math.floor((tailleMo * MO * 8 * MARGE_CONTENEUR) / ((SEUILS_TAILLE[SEUILS_TAILLE.length - 1][1] + audio) * 1000));
}

/** Poids par minute et temps d'export, en mots, d'après les mesures de usages.json (« à mesurer » sinon) ; un usage à taille
 *  visée (courriel) dit sa taille et la durée la plus longue qui y tient, plutôt qu'un poids par minute. */
function poidsEtTemps(m, usage = null) {
  const cible = usage && usage.tailleMaxMo;
  const poids = cible ? `moins de ${nombreFrancais(cible)} Mo en tout (vidéo de ${dureeFrancaise(dureeMaxPour(cible, usage.fidele && usage.fidele.audio))} au plus)`
    : m && typeof m.moParMinute === 'number' ? `environ ${nombreFrancais(m.moParMinute)} Mo par minute` : 'à mesurer';
  const temps = m && typeof m.secondesParSeconde === 'number' ? `environ ${dureeFrancaise(m.secondesParSeconde * 60)} par minute de vidéo` : 'à mesurer';
  return { poids, temps };
}

const FICHIERS_JOINTS = { couverture: 'couverture', chapitres: 'chapitres', credits: 'crédits', 'sous-titres': 'sous-titres' };

function tableauUsages(u = lireUsages()) {
  const lignes = [
    '# Usages d\'export',
    '',
    'Source : `scripts/usages.json` (poids et temps mesurés sur les deux vidéos témoins). La personne dit à quoi sert la vidéo ; l\'export choisit les réglages. Aucun usage n\'exige ffmpeg : sans lui, la vidéo se fait dans le navigateur.',
    '',
    '| Usage | Pour quoi faire | Ce qui change à l\'image | Poids | Temps d\'export | Fichiers joints |',
    '|---|---|---|---|---|---|',
  ];
  for (const [nom, x] of Object.entries(u.usages)) {
    const { poids, temps } = poidsEtTemps(x.mesures, x);
    const joints = (x.fichiers || []).map((f) => FICHIERS_JOINTS[f] || f).join(', ') || 'aucun';
    lignes.push(`| \`${nom}\` (${x.nom}) | ${x.pourQuoi} | ${x.image} | ${poids} | ${temps} | ${joints} |`);
  }
  lignes.push('', '## Ce que dit la personne', '', '| Elle dit | Usage |', '|---|---|');
  for (const [mots, usage, complement] of MOTS) lignes.push(`| ${mots} | \`${usage}\`${complement ? `, ${complement}` : ''} |`);
  lignes.push('', 'Fichiers joints selon l\'usage : couverture (image de la miniature, sans sous-titres), chapitres (s\'ils sont déclarés dans la vidéo), crédits (toujours). « En boucle » et « des chapitres » changent la vidéo : c\'est une retouche (`/pulse-motion:retoucher`). « En GIF », « juste la scène 3 », « de 12 à 18 s », « dans un téléphone », « un PDF des scènes » : voir `pulse-motion reference sorties` ; « fond transparent » : pas encore possible.', '');
  return lignes.join('\n');
}

module.exports = {
  lireUsages, nomsUsages, messageUsageInconnu, resoudreUsage, planTaille, nomFichier, tailleFrancaise, dureeFrancaise,
  nombreFrancais, tableauUsages, lireFlou, poidsEtTemps, dureeMaxPour, avecGrain, MOTS, DEFINITIONS, SEUILS_TAILLE, FACTEUR_DEFINITION, MO,
};
