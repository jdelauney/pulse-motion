'use strict';
/* Pulse Motion – adapter une scène toute faite d'un style à une scène du déroulé.
 * Utilisé par le changement de style et par la comparaison des styles. */
const { TYPES, OPTIONNELLES } = require('./contrat.js');

const echapperRegex = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Retire l'élément qui porte l'attribut (balise vide ou à texte simple, ou balise sans fermeture comme <img>). */
function retirerElement(html, attribut) {
  const re = new RegExp(`[ \\t]*<([a-zA-Z][\\w-]*)\\b[^>]*\\s${echapperRegex(attribut)}(?=[\\s>/])[^>]*>(?:[^<]*<\\/\\1>)?[ \\t]*(?:\\r?\\n)?`, 'g');
  return html.replace(re, '');
}

/** Valeur d'arrivée du premier compteur (« nombre 0→1250 »), ou null. */
function lireNombre(html) {
  const m = /data-tween=(["'])[^"']*?\bnombre\s+-?[\d.]+\s*→\s*(-?[\d.]+)/.exec(String(html));
  return m ? m[2] : null;
}

/**
 * adapterScene(html, { type, id, duree, textes, derniere, logo, nombre }) -> html
 * - data-scene du type → id de la scène ;
 * - éléments data-decor : data-dur = durée de la scène (dernière scène : durée − 1 s, pour finir sur une image stable) ;
 * - clés facultatives sans texte (liste : point3, point4) et logo absent : élément retiré ;
 * - nombre : valeur d'arrivée du compteur, reprise de l'ancienne scène.
 */
function adapterScene(html, { type, id, duree, textes = {}, derniere = false, logo = false, nombre = null }) {
  let h = String(html).replace(new RegExp(`(<section\\b[^>]*\\sdata-scene=)(["'])${echapperRegex(type)}\\2`), `$1$2${id}$2`);
  const dureeDecor = Math.max(0.5, Math.round((derniere ? duree - 1 : duree) * 100) / 100);
  h = h.replace(/<[a-zA-Z][\w-]*\b[^>]*\sdata-decor\b[^>]*>/g, (balise) => balise.replace(/\sdata-dur=(["'])[^"']*\1/, ` data-dur="${dureeDecor}"`));
  for (const cle of OPTIONNELLES[type] || []) {
    if (typeof textes[cle] !== 'string' || !textes[cle].trim()) h = retirerElement(h, `data-texte="${cle}"`);
  }
  if (!logo) h = retirerElement(h, 'data-logo');
  if (nombre !== null && nombre !== undefined) {
    h = h.replace(/(data-tween=(["'])[^"']*?\bnombre\s+-?[\d.]+\s*→\s*)(-?[\d.]+)/, `$1${nombre}`);
  }
  return h;
}

/** Type de scène toute faite : celui de la scène, sinon celui qui partage le plus de clés de texte (titre à défaut). */
function choisirType(scene) {
  if (scene.type && TYPES[scene.type]) return scene.type;
  const cles = Object.keys(scene.textes || {});
  let meilleur = 'titre';
  let score = 0;
  for (const [type, attendues] of Object.entries(TYPES)) {
    const communes = attendues.filter((c) => cles.includes(c)).length;
    if (communes > score) { meilleur = type; score = communes; }
  }
  return meilleur;
}

/** Textes pour les clés du type : ceux de même clé, puis les textes restants dans l'ordre, '' sinon. */
function textesPour(type, textes = {}) {
  const attendues = TYPES[type];
  const restants = Object.entries(textes).filter(([c, v]) => !attendues.includes(c) && typeof v === 'string').map(([, v]) => v);
  const resultat = {};
  for (const cle of attendues) {
    if (typeof textes[cle] === 'string') resultat[cle] = textes[cle];
    else if ((OPTIONNELLES[type] || []).includes(cle)) resultat[cle] = '';
    else resultat[cle] = restants.length ? restants.shift() : '';
  }
  return resultat;
}

module.exports = { adapterScene, lireNombre, choisirType, textesPour, retirerElement };
