'use strict';
/* Pulse Motion – la journée qui passe, côté assemblage et contrôle (spec S11, 5.9).
 *
 *   verifierJournee(html, { scene }) -> { erreurs, journee: { de, a } | null, lampes: n }     règle journee-invalide
 *   texteJournee(html, { scene, debut, fin, elements }) -> [problèmes]                      règle journee-texte
 *
 * data-journee="a-b" (τ de a à b pendant la scène, nombres de 0 à 1) ou "a" se pose sur la section de la scène ; data-lampe
 * (sans valeur) sur un élément d'une scène à journée. journee-texte (erreur) : aucun data-texte visible pendant le passage où
 * l'encre (--pm-encre) se lit mal sur le papier (--pm-papier), contraste sous 4,5, calculé d'après palette(τ)
 * (moteur/journee.js). Un texte est visible du début de son élément minuté (lui-même ou l'ancêtre minuté le plus proche ;
 * sinon dès le début de la scène) jusqu'à la fin de la scène, sauf si cet élément s'efface (data-tween « opacity … → 0 ») :
 * il est caché après sa fin. elements : temps absolus des éléments minutés de la scène (minutage : { cle: { debut, fin } }).
 */
const { lireAttributs, parcourir, estMinute } = require('./extraire.js');
const J = require('../../moteur/journee.js');

const BALISE = /<!--[\s\S]*?-->|<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const virgule = (x) => String(Math.round(x * 10) / 10).replace('.', ',');

function probleme(scene, message, gravite = 'erreur') { return { regle: 'journee-invalide', gravite, scene, message: `Scène « ${scene} » : ${message}` }; }

function verifierJournee(html, { scene }) {
  const erreurs = [];
  let journee = null;
  let lampes = 0;
  if (!/\sdata-(?:journee|lampe)\b/.test(html)) return { erreurs, journee, lampes };
  for (const m of String(html).matchAll(BALISE)) {
    if (m[0].startsWith('<!--')) continue;
    const balise = m[1].toLowerCase();
    const a = lireAttributs(m[2]);
    if (a['data-journee'] !== undefined) {
      if (a['data-scene'] === undefined) erreurs.push(probleme(scene, `data-journee se pose sur la section de la scène (l'élément data-scene), pas sur un ${balise}.`));
      else if (!J.lire(a['data-journee'])) erreurs.push(probleme(scene, `data-journee="${a['data-journee']}" : l'heure de la scène, de 0 (minuit) à 1, 0,5 à midi et 0,75 au crépuscule ; « 0.62-0.95 » la fait passer de l'une à l'autre pendant la scène, « 0.75 » la fixe (point décimal).`));
      else journee = J.lire(a['data-journee']);
    }
    if (a['data-lampe'] !== undefined) {
      lampes++;
      if (String(a['data-lampe']).trim() !== '') erreurs.push(probleme(scene, `data-lampe s'écrit sans valeur (« ${a['data-lampe']} » est ignoré) : chaque lampe tire son seuil au sort, toujours le même.`, 'alerte'));
    }
  }
  if (lampes && !journee && !erreurs.some((e) => e.gravite === 'erreur')) {
    erreurs.push(probleme(scene, `data-lampe dans une scène sans data-journee : ${lampes > 1 ? 'ces lampes ne s\'allumeront' : 'cette lampe ne s\'allumera'} jamais ; poser data-journee sur la section de la scène.`, 'alerte'));
  }
  return { erreurs, journee, lampes };
}

/** Une clause « opacity … → 0 » dans un data-tween : l'élément s'efface. */
const sEfface = (tween) => String(tween || '').replace(/->/g, '→').split(';').some((c) => /^\s*opacity\s+[^→\s]*→0(?:\.0*)?(?:\s|$)/.test(c));

function texteJournee(html, { scene, debut, fin, elements = {} }) {
  if (!/\sdata-journee\s*=/.test(html)) return [];
  const sans = String(html).replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  let decl = null;
  parcourir(sans, (balise, attrs) => { if (attrs['data-scene'] !== undefined && attrs['data-journee'] !== undefined) decl = J.lire(attrs['data-journee']); });
  if (!decl) return [];
  const passages = J.passages(decl, debut, fin);
  if (!passages.length) return [];
  const problemes = [];
  let n = 0;
  parcourir(sans, (balise, attrs, decor, ancetres) => {
    // Clés comme moteur/horloge.js et extraireScene : l'id, sinon « _n » dans l'ordre des éléments minutés.
    if (estMinute(attrs)) attrs.__cle = attrs.id || `_${++n}`;
    if (attrs['data-texte'] === undefined) return;
    let porteur = estMinute(attrs) ? attrs : null;
    for (let i = ancetres.length - 1; i >= 0 && !porteur; i--) if (estMinute(ancetres[i].attrs)) porteur = ancetres[i].attrs;
    const temps = porteur && elements[porteur.__cle];
    const de = temps ? temps.debut : debut;
    const a = temps && sEfface(porteur['data-tween']) ? temps.fin : fin;
    const vu = passages.find((p) => p.a >= de && p.de <= a);
    if (!vu) return;
    problemes.push({ regle: 'journee-texte', gravite: 'erreur', scene, element: attrs.id || attrs['data-texte'],
      message: `Scène « ${scene} » : le texte « ${attrs['data-texte']} » est visible pendant le passage du jour à la nuit (vers ${virgule(vu.de)} s), quand l'encre se lit mal sur le papier (contraste sous 4,5:1) ; le faire partir avant (data-tween « opacity 1→0 »), entrer après, ou passer l'heure dans une autre scène.` });
  });
  return problemes;
}

module.exports = { verifierJournee, texteJournee, sEfface };
