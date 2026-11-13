'use strict';
/* Pulse Motion – vent et pendules d'une scène, côté assemblage (spec S11, 5.8).
 *
 *   verifierPhysique(html, { scene }) -> { erreurs, vent: bool, pendules: n }
 *   validerVentDeroule(vent) -> [messages]   (champ « vent » du déroulé)
 *
 * data-vent (calme, brise, rafales, tempete) et data-vent-dir (degrés) se posent sur la section de la scène (data-scene) ;
 * data-pendule="<longueur> <amorti>" (longueur en cqh, de 0 à 200 ; amorti de 0 à 1) sur un groupe SVG (<g>). Règle
 * physique-invalide (erreur). Rien n'est réécrit : la page lit ces attributs (moteur/physique.js).
 */
const { lireAttributs } = require('./extraire.js');
const Ph = require('../../moteur/physique.js');

const BALISE = /<!--[\s\S]*?-->|<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const NIVEAUX = Object.keys(Ph.NIVEAUX);

function erreur(scene, message) { return { regle: 'physique-invalide', gravite: 'erreur', scene, message: `Scène « ${scene} » : ${message}` }; }

function nombre(v) { const n = Number(v); return String(v).trim() !== '' && Number.isFinite(n) ? n : null; }

function verifierPhysique(html, { scene }) {
  const erreurs = [];
  let vent = false;
  let pendules = 0;
  if (!/\sdata-(?:vent|vent-dir|pendule)\s*=/.test(html)) return { erreurs, vent, pendules };
  for (const m of String(html).matchAll(BALISE)) {
    if (m[0].startsWith('<!--')) continue;
    const balise = m[1].toLowerCase();
    const a = lireAttributs(m[2]);
    const surScene = a['data-scene'] !== undefined;
    for (const k of ['data-vent', 'data-vent-dir']) {
      if (a[k] !== undefined && !surScene) erreurs.push(erreur(scene, `${k} se pose sur la section de la scène (l'élément data-scene), pas sur un ${balise}.`));
    }
    if (surScene && a['data-vent'] !== undefined) {
      if (!Ph.niveau(a['data-vent'])) erreurs.push(erreur(scene, `data-vent="${a['data-vent']}" : ${NIVEAUX.join(', ')}.`));
      else vent = true;
    }
    if (surScene && a['data-vent-dir'] !== undefined) {
      const d = nombre(a['data-vent-dir']);
      if (d === null || d < -360 || d > 360) erreurs.push(erreur(scene, `data-vent-dir="${a['data-vent-dir']}" : direction où souffle le vent, en degrés (0 : vers la droite, 180 : vers la gauche, 90 : vers le bas).`));
      if (a['data-vent'] === undefined) erreurs.push({ ...erreur(scene, 'data-vent-dir sans data-vent : donner aussi la force du vent (calme, brise, rafales, tempete).'), gravite: 'alerte' });
    }
    if (a['data-pendule'] !== undefined) {
      pendules++;
      if (balise !== 'g') erreurs.push(erreur(scene, `data-pendule se pose sur un groupe SVG (<g>), pas sur un ${balise} : il pend de son bord haut.`));
      if (!Ph.lirePendule(a['data-pendule'])) erreurs.push(erreur(scene, `data-pendule="${a['data-pendule']}" : « <longueur> <amorti> », longueur en cqh (plus de 0, jusqu'à 200) et amorti de 0 à 1 (ex. « 12 0.2 »).`));
    }
  }
  return { erreurs, vent, pendules };
}

/** Champ « vent » du déroulé : [{ de, force, dir }] ; de en secondes (≥ 0), force de 0 à 1, dir en degrés. */
function validerVentDeroule(vent) {
  if (vent === undefined) return [];
  if (!Array.isArray(vent) || !vent.length) return ['« vent » : liste de clés [{ "de": 0, "force": 0.3, "dir": 0 }] (de en secondes, force de 0 à 1, dir en degrés).'];
  const err = [];
  vent.forEach((v, i) => {
    const ou = `« vent[${i}] »`;
    if (!v || typeof v !== 'object' || Array.isArray(v)) { err.push(`${ou} doit être un objet { "de", "force", "dir" }.`); return; }
    for (const k of Object.keys(v)) if (!['de', 'force', 'dir'].includes(k)) err.push(`${ou} : champ « ${k} » inconnu (de, force, dir).`);
    if (!(typeof v.de === 'number' && Number.isFinite(v.de) && v.de >= 0)) err.push(`${ou} : « de » est l'instant (secondes, positif ou nul) où ce vent commence à souffler.`);
    if (!(typeof v.force === 'number' && v.force >= 0 && v.force <= 1)) err.push(`${ou} : « force » de 0 (calme) à 1 (tempête).`);
    if (v.dir !== undefined && !(typeof v.dir === 'number' && Number.isFinite(v.dir) && v.dir >= -360 && v.dir <= 360)) err.push(`${ou} : « dir » en degrés, vers où souffle le vent (0 : vers la droite).`);
  });
  return err;
}

module.exports = { verifierPhysique, validerVentDeroule };
