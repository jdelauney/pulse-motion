'use strict';
/* Pulse Motion – groupes de personnages : un conteneur data-groupe déplié en personnages ordinaires, à l'assemblage.
 *
 *   <div id="file" data-personnage="touffu" data-groupe="6" data-ecart="5" data-decalage="0.5t" data-x="8" …>
 *     <i id="entree" data-action="marcher" data-vers="60" data-start="0" data-dur="3"></i>
 *     <i data-action="jouer" data-clip="coucou" data-membre="4" data-start="#entree-4:fin"></i>
 *   </div>
 *
 * deplierGroupes(html, { scene, dureeTemps }) -> { html, erreurs }
 * Membre i (1 = tête) : id « file-i », data-x = x − (i − 1) × écart (sauf data-depart="commun" : tous à x), data-taille
 * varié de ± data-variation (même tirage à chaque assemblage) ; ses actions : data-start retardé de (i − 1) × décalage,
 * data-vers − (i − 1) × écart (l'espacement se garde à l'arrivée), ids « id-i » et références internes renommées. Une action
 * data-membre="k" ne va qu'au membre k, sans retard. Les autres enfants sont recopiés (ids suffixés).
 */
const { lireAttributs } = require('./extraire.js');
const { lireSecondes } = require('../../moteur/minutage.js');

const BALISE = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const VIDES = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const PROPRES = ['data-groupe', 'data-ecart', 'data-decalage', 'data-depart', 'data-variation'];
const TRAJETS = ['marcher', 'courir', 'glisser', 'bondir'];

function erreur(scene, message) { return { regle: 'personnage-invalide', gravite: 'erreur', scene, message: `Scène « ${scene} » : ${message}` }; }
const arrondi = (x) => Math.round(x * 10000) / 10000;

/** Attribut d'une balise ouvrante (texte) : remplacé, ajouté (valeur non nulle) ou retiré (valeur null). */
function attribut(balise, nom, valeur) {
  const re = new RegExp(`\\s${nom}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>"']+))?(?=[\\s/>])`);
  const sans = balise.replace(re, '');
  if (valeur === null) return sans;
  const v = String(valeur).replace(/"/g, '&quot;');
  return sans.replace(/\s*(\/?)>$/, (fin, barre) => ` ${nom}="${v}"${barre ? ' /' : ''}>`);
}

/** Jetons de balises : { debut, fin, fermeture, tag, texte, auto }. */
function jetons(html) {
  const out = [];
  let m;
  BALISE.lastIndex = 0;
  while ((m = BALISE.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    const tag = m[2].toLowerCase();
    out.push({ debut: m.index, fin: m.index + m[0].length, fermeture: !!m[1], tag, texte: m[3], brut: m[0], auto: /\/\s*$/.test(m[3]) || VIDES.has(tag) });
  }
  return out;
}

/** Index du jeton fermant l'élément ouvert au jeton i (même balise, profondeur ramenée à 0), ou -1. */
function fermant(js, i) {
  if (js[i].auto) return i;
  let prof = 0;
  for (let k = i; k < js.length; k++) {
    const j = js[k];
    if (j.auto) continue;
    if (!j.fermeture) prof++;
    else { prof--; if (prof === 0) return k; }
  }
  return -1;
}

/** Retard (secondes) ajouté à un data-start : nombre, temps musical, « #id… » ou « mot:… » avec leur écart. Une référence
 *  à une action du même membre (renommée) porte déjà son retard : on ne l'ajoute pas une seconde fois. */
function retarder(start, retard, renommer, dureeTemps) {
  const s = start === undefined ? '' : String(start).trim();
  if (s === '') return arrondi(retard);
  const direct = lireSecondes(s, dureeTemps);
  if (direct.valeur !== undefined) return arrondi(direct.valeur + retard);
  const m = /^(#[\w-]+(?::fin)?|mot:[^+\-\s]+(?:#\d+)?(?::fin)?)\s*(?:([+-])\s*([\d.]+t?))?$/.exec(s);
  if (!m) return null;
  let base = m[1];
  if (base.startsWith('#')) {
    const id = /^#([\w-]+)/.exec(base)[1], nouveau = renommer(id);
    if (nouveau !== id) retard = 0;
    base = '#' + nouveau + base.slice(1 + id.length);
  }
  let ecart = 0;
  if (m[3]) {
    const lu = lireSecondes(m[3], dureeTemps);
    if (lu.valeur === undefined) return null;
    ecart = (m[2] === '-' ? -1 : 1) * lu.valeur;
  }
  const total = arrondi(ecart + retard);
  return total === 0 ? base : `${base}${total > 0 ? '+' : '-'}${Math.abs(total)}`;
}

/** Tirage déterministe dans [0, 1[ pour un membre. */
function tirage(base, i) {
  let h = 2166136261;
  for (const c of `${base}:${i}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

function deplierGroupes(html, { scene = '?', dureeTemps = null } = {}) {
  const erreurs = [];
  if (!/data-groupe/.test(html)) return { html, erreurs };
  let sortie = html;
  // Du dernier groupe au premier : les positions des précédents ne bougent pas.
  const js = jetons(html);
  const groupes = [];
  js.forEach((j, i) => { if (!j.fermeture && /\sdata-groupe\b/.test(' ' + j.texte)) groupes.push(i); });
  const idsExistants = new Set(js.filter((j) => !j.fermeture).map((j) => (lireAttributs(j.texte).id || '').trim()).filter(Boolean));
  for (const gi of groupes.reverse()) {
    const ouvre = js[gi], fin = fermant(js, gi);
    const a = lireAttributs(ouvre.texte);
    const qui = `groupe${a.id ? ` « ${a.id} »` : ''}`;
    if (fin < 0 || ouvre.auto) { erreurs.push(erreur(scene, `${qui} : conteneur non fermé.`)); continue; }
    if (a['data-personnage'] === undefined) { erreurs.push(erreur(scene, `${qui} : data-groupe se pose sur un conteneur data-personnage.`)); continue; }
    const n = Number(a['data-groupe']);
    if (!Number.isInteger(n) || n < 2 || n > 20) { erreurs.push(erreur(scene, `${qui} : data-groupe="${a['data-groupe']}" doit être un nombre de membres, de 2 à 20.`)); continue; }
    const ecart = a['data-ecart'] === undefined ? 5 : Number(a['data-ecart']);
    if (!Number.isFinite(ecart)) { erreurs.push(erreur(scene, `${qui} : data-ecart="${a['data-ecart']}" doit être un nombre (% de la largeur).`)); continue; }
    const dec = a['data-decalage'] === undefined ? { valeur: 0 } : lireSecondes(String(a['data-decalage']).trim(), dureeTemps);
    if (dec.valeur === undefined) { erreurs.push(erreur(scene, `${qui} : data-decalage="${a['data-decalage']}" illisible (secondes, ou temps musicaux avec un tempo : « 0.5t »).`)); continue; }
    const variation = a['data-variation'] === undefined ? 0 : Number(a['data-variation']);
    if (!(variation >= 0 && variation < 1)) { erreurs.push(erreur(scene, `${qui} : data-variation="${a['data-variation']}" doit être un nombre de 0 à 0,9 (part de la taille).`)); continue; }
    const commun = (a['data-depart'] || '').trim() === 'commun';
    const base = (a.id || '').trim() || `groupe-${gi}`;
    const x0 = a['data-x'] === undefined ? 50 : Number(a['data-x']);
    const taille = a['data-taille'] === undefined ? 40 : Number(a['data-taille']);

    // Enfants directs du conteneur.
    const enfants = [];
    for (let k = gi + 1; k < fin; k++) {
      const j = js[k];
      if (j.fermeture) continue;
      const f = fermant(js, k);
      if (f < 0) break;
      enfants.push({ texte: sortie.slice(j.debut, js[f].fin), ouvre: j, a: lireAttributs(j.texte) });
      k = f;
    }
    const idsInternes = new Set(enfants.map((e) => (e.a.id || '').trim()).filter(Boolean));
    for (const e of enfants) {
      if (e.a['data-membre'] !== undefined) {
        const k = Number(e.a['data-membre']);
        if (!Number.isInteger(k) || k < 1 || k > n) erreurs.push(erreur(scene, `${qui} : data-membre="${e.a['data-membre']}" doit être un numéro de membre, de 1 à ${n}.`));
      }
    }
    for (let i = 1; i <= n; i++) {
      const id = `${base}-${i}`;
      if (idsExistants.has(id)) erreurs.push(erreur(scene, `${qui} : l'id « ${id} » est déjà pris dans la scène ; il nomme le membre ${i}.`));
    }

    const membres = [];
    for (let i = 1; i <= n; i++) {
      const renommer = (id) => (idsInternes.has(id) ? `${id}-${i}` : id);
      const retard = (i - 1) * dec.valeur;
      let tete = ouvre.brut;
      for (const p of PROPRES) tete = attribut(tete, p, null);
      tete = attribut(tete, 'id', `${base}-${i}`);
      tete = attribut(tete, 'data-x', arrondi(commun ? x0 : x0 - (i - 1) * ecart));
      if (variation > 0) tete = attribut(tete, 'data-taille', arrondi(taille * (1 + variation * (2 * tirage(base, i) - 1))));
      const corps = [];
      for (const e of enfants) {
        const membre = e.a['data-membre'] !== undefined ? Number(e.a['data-membre']) : null;
        if (membre !== null && membre !== i) continue;
        let balise = e.ouvre.brut;
        const reste = e.texte.slice(e.ouvre.brut.length);
        balise = attribut(balise, 'data-membre', null);
        if (e.a.id) balise = attribut(balise, 'id', `${e.a.id.trim()}-${i}`);
        if (e.a['data-action'] !== undefined) {
          const type = e.a['data-action'].trim();
          const decale = membre === null ? retard : 0;
          if (decale || (e.a['data-start'] || '').includes('#')) {
            const s = retarder(e.a['data-start'], decale, renommer, dureeTemps);
            if (s === null) erreurs.push(erreur(scene, `${qui} : data-start="${e.a['data-start']}" ne peut pas être retardé pour le membre ${i}.`));
            else balise = attribut(balise, 'data-start', s);
          }
          if (TRAJETS.includes(type) && e.a['data-vers'] !== undefined && Number.isFinite(Number(e.a['data-vers'])) && membre === null) {
            balise = attribut(balise, 'data-vers', arrondi(Number(e.a['data-vers']) - (i - 1) * ecart));
          }
          for (const attr of ['data-cible']) {
            if (e.a[attr] !== undefined && /^#/.test(e.a[attr].trim())) balise = attribut(balise, attr, '#' + renommer(e.a[attr].trim().slice(1)));
          }
        }
        corps.push(balise + reste);
      }
      membres.push(`${tete}\n${corps.join('\n')}\n</${ouvre.tag}>`);
    }
    sortie = sortie.slice(0, ouvre.debut) + membres.join('\n') + sortie.slice(js[fin].fin);
  }
  return { html: sortie, erreurs };
}

module.exports = { deplierGroupes, retarder, attribut };
