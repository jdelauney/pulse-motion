'use strict';
/* Pulse Motion – contrôle de la vidéo rendue : page assemblée ouverte dans Chrome ou Edge sans fenêtre,
 * mesures de moteur/mesures.js (M.mesurer) et débordements (M.detecterDebordements), traduits en problèmes. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { rendreDOM, trouverNavigateur } = require('./navigateur.js');
const SEUILS = require('../seuils.json');

const virgule = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
const ZONES = { haut: 'en haut', bas: 'en bas', droite: 'à droite' };

const MESSAGES = {
  chevauchement: (c) => { const [a, b] = c.element.split('|'); return `Scène « ${c.scene} » : « ${a} » et « ${b} » se chevauchent (vers ${virgule(c.instant)} s) ; les écarter, ou marquer celui qui passe volontairement par-dessus avec data-superpose. S'il s'agit d'un décor : data-decor (ou alt="" pour une image, aria-hidden="true" pour un SVG).`; },
  'hors-cadre': (c) => `Scène « ${c.scene} » : « ${c.element} » sort de l'image (vers ${virgule(c.instant)} s). S'il s'agit d'un décor : data-decor (ou alt="" pour une image, aria-hidden="true" pour un SVG).`,
  marge: (c) => `Scène « ${c.scene} » : le texte « ${c.element} » touche presque le bord de l'image (vers ${virgule(c.instant)} s) ; garder au moins ${virgule(SEUILS.margeMin * 100)} % de marge.`,
  'zone-sure': (c) => `Scène « ${c.scene} » : en 9:16, le texte « ${c.element} » passe sous les boutons des réseaux sociaux (${ZONES[c.valeur] || c.valeur}, vers ${virgule(c.instant)} s) ; raccourcir les textes de la scène ou retirer un point, sinon les rapprocher du centre.`,
  'logo-masque': (c) => (c.valeur === 'dehors'
    ? `Scène « ${c.scene} » : le logo sort de l'image (vers ${virgule(c.instant)} s).`
    : `Scène « ${c.scene} » : le logo est recouvert à ${Math.round(c.valeur * 100)} % (vers ${virgule(c.instant)} s) ; le dégager.`),
  'texte-fugace': (c) => `Scène « ${c.scene} » : le texte « ${c.element} » ne reste lisible que ${virgule(c.valeur.duree)} s ; il faut au moins ${virgule(c.valeur.besoin)} s pour le lire.`,
  'mouvement-rapide': (c) => `Scène « ${c.scene} » : « ${c.element} » traverse l'image trop vite (vers ${virgule(c.instant)} s) ; au-delà d'une largeur d'image par seconde, le mouvement fatigue l'œil.`,
};

/** Constats bruts de M.mesurer -> problèmes (alertes). Règle inconnue : ignorée. */
function traduireConstats(constats) {
  return (constats || []).filter((c) => MESSAGES[c.regle]).map((c) => ({ regle: c.regle, gravite: 'alerte', scene: c.scene, element: c.element, message: MESSAGES[c.regle](c) }));
}

const nonVerifie = (regle, message) => ({ renduVerifie: false, problemes: [{ regle, gravite: 'alerte', message }] });

/** -> { renduVerifie, problemes } ; jamais d'exception. */
async function controlerRendu({ html, ratio, duree, navigateur = trouverNavigateur() }) {
  if (!navigateur) return nonVerifie('rendu-non-verifie', 'Chrome ou Edge introuvable : la vidéo rendue (chevauchements, marges, textes qui débordent…) n\'a pas été vérifiée. Installez l\'un des deux, ou indiquez son chemin avec la variable PM_NAVIGATEUR.');
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-controle-'));
  try {
    const appel = `<script>M.pret.then(function () { return document.fonts ? document.fonts.ready : null; }).then(function () {
      var r;
      try { r = { constats: M.mesurer({ ratio: ${JSON.stringify(ratio)}, seuils: ${JSON.stringify(SEUILS)} }), debordements: M.detecterDebordements() }; }
      catch (e) { r = { echec: String((e && e.message) || e) }; }
      var pre = document.createElement('pre'); pre.id = 'pm-mesures'; pre.textContent = JSON.stringify(r); document.body.appendChild(pre);
    });</script>`;
    const fichier = path.join(dossier, 'controle.html');
    fs.writeFileSync(fichier, String(html).replace('</body>', `${appel}\n</body>`));
    let dom;
    try { dom = await rendreDOM(navigateur, fichier, { delai: (30 + 2 * (duree || 0)) * 1000 }); } catch (e) {
      if (e.code === 'ENOENT') return nonVerifie('rendu-impossible', `Navigateur introuvable à « ${navigateur} » : vérifiez la variable PM_NAVIGATEUR (ou retirez-la pour utiliser Chrome ou Edge installés). Seuls les contrôles sans navigateur ont été faits.`);
      return nonVerifie('rendu-impossible', `La vidéo n'a pas pu être rendue dans le navigateur (${e.killed ? 'délai dépassé' : e.code || e.message}) : seuls les contrôles sans navigateur ont été faits.`);
    }
    const m = /<pre id="pm-mesures">([^<]*)<\/pre>/.exec(dom);
    if (!m) return nonVerifie('rendu-impossible', 'La page ne s\'est pas affichée dans le navigateur (erreur dans une scène ?) : seuls les contrôles sans navigateur ont été faits.');
    const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    if (r.echec) return nonVerifie('rendu-impossible', `Les mesures de la vidéo ont échoué (${r.echec}) : seuls les contrôles sans navigateur ont été faits.`);
    const debordements = (r.debordements || []).map((d) => ({ regle: 'debordement', gravite: 'erreur', scene: d.scene, element: d.element, message: d.message }));
    return { renduVerifie: true, problemes: [...debordements, ...traduireConstats(r.constats)] };
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
}

module.exports = { traduireConstats, controlerRendu };
