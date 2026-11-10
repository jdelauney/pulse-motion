'use strict';
/* Pulse Motion – vidéo en boucle parfaite (spec Rendu et export, 5.18) : contrôles en alerte de la jointure et de la mesure.
 * Seuils et idée de video-director (scripts/qa_video.py : loop, duplicate, speed_ratio ; check_timeline.py : mesures entières ;
 * MIT, © win4r), réécrits. Module pur.
 *
 * ecart(a, b) -> écart moyen de deux vignettes en gris (0 à 1)
 * jointure({ premiere, deuxieme, avantDerniere, derniere, paires }) -> [{ type: 'saut' | 'vitesse' | 'arret', valeur }]
 *   vignettes grises de 192 px des images 0, 1, N − 2, N − 1 ; paires : [[a, b]] d'images voisines, pour la médiane.
 * mesureEntiere({ duree, temps, ips, tempsParMesure? }) -> null (la durée fait un nombre entier de mesures, à une image près)
 *   | { ajouter } (secondes à ajouter à la dernière scène pour finir sur une mesure)
 * problemesJointure(liste, scene) · problemeMesure(r) -> problèmes du contrôle (alertes)
 */

/** Écarts en niveaux de gris (0 à 255) ramenés à 0–1. */
const UN_NIVEAU = 1 / 255;
const SEUIL_MOUVEMENT = 0.5 * UN_NIVEAU;
const SEUIL_IDENTIQUE = 0.1 * UN_NIVEAU;
const FACTEUR_SAUT = 2;
const VITESSE_MIN = 0.5;
const VITESSE_MAX = 2;
const LARGEUR = 192;

function ecart(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return s / n / 255;
}

const mediane = (v) => { const s = [...v].sort((x, y) => x - y); if (!s.length) return 0; return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

function jointure({ premiere, deuxieme, avantDerniere, derniere, paires = [] }) {
  const m = mediane(paires.map(([a, b]) => ecart(a, b)));
  const dj = ecart(derniere, premiere);
  const d0 = ecart(premiere, deuxieme);
  const dn = ecart(avantDerniere, derniere);
  const constats = [];
  if (dj < SEUIL_IDENTIQUE && m > SEUIL_MOUVEMENT) constats.push({ type: 'arret', valeur: dj });
  else if (dj > Math.max(FACTEUR_SAUT * m, SEUIL_MOUVEMENT)) constats.push({ type: 'saut', valeur: dj, mediane: m });
  if (d0 > SEUIL_MOUVEMENT && dn > SEUIL_MOUVEMENT) {
    const r = dn / d0;
    if (r < VITESSE_MIN || r > VITESSE_MAX) constats.push({ type: 'vitesse', valeur: r });
  }
  return constats;
}

function mesureEntiere({ duree, temps, ips = 30, tempsParMesure = 4 }) {
  if (!(temps > 0) || !(duree > 0)) return null;
  const mesure = temps * tempsParMesure;
  const k = duree / mesure;
  if (Math.abs(k - Math.round(k)) * mesure <= 1 / ips + 1e-9) return null;
  const ajouter = Math.ceil(k - 1e-9) * mesure - duree;
  return { ajouter: Math.round(ajouter * 10) / 10 || 0.1, mesure };
}

const virgule = (x) => String(Math.round(x * 10) / 10).replace('.', ',');

const MESSAGES = {
  saut: { message: 'En boucle, la dernière image saute trop par rapport à la première : finir la dernière scène sur l\'image de départ.',
    consigne: 'dernière scène : ramener ses éléments à la position, la taille et la couleur de la première image de la vidéo (voir references/rythme.md, « Finir sur l\'image de départ »).' },
  arret: { message: 'En boucle, la dernière image répète la première : la boucle marque un temps d\'arrêt.',
    consigne: 'dernière scène : finir une image avant l\'image de départ (l\'image de départ revient au tour suivant).' },
  vitesse: { message: 'En boucle, le mouvement change de vitesse à la jointure : finir la dernière scène au rythme du début.',
    consigne: 'dernière scène : la courbe de fin doit garder la vitesse de la première image (éviter un ralenti de sortie si la vidéo démarre en mouvement).' },
};

function problemesJointure(constats, scene = null) {
  return constats.map((c) => ({ regle: 'boucle-jointure', gravite: 'alerte', ...(scene ? { scene } : {}), message: MESSAGES[c.type].message, consigne: MESSAGES[c.type].consigne }));
}

function problemeMesure(r) {
  return { regle: 'boucle-mesure', gravite: 'alerte',
    message: `En boucle, la vidéo s'arrête au milieu d'une mesure : allonger la dernière scène de ${virgule(r.ajouter)} s.`,
    consigne: `durée de la dernière scène + ${virgule(r.ajouter)} s (mesure de ${virgule(r.mesure)} s, 4 temps).` };
}

module.exports = { ecart, jointure, mesureEntiere, problemesJointure, problemeMesure, mediane, LARGEUR, SEUIL_MOUVEMENT, SEUIL_IDENTIQUE };
