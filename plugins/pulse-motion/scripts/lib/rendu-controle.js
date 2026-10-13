'use strict';
/* Pulse Motion – contrôle de la vidéo rendue : page assemblée ouverte en temps réel dans Chrome ou Edge sans
 * fenêtre (page-mesures.js), mesures de moteur/mesures.js (M.mesurer), débordements (M.detecterDebordements) et
 * formes exactes des collisions effacées à la fin de leur minutage (M.particules.formesVides, sans GPU), traduits en
 * problèmes. */
const { trouverNavigateur } = require('./navigateur.js');
const { mesurerPage } = require('./page-mesures.js');
const SEUILS = require('../seuils.json');

const virgule = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
const ZONES = { haut: 'en haut', bas: 'en bas', droite: 'à droite' };

const MESSAGES = {
  chevauchement: (c) => { const [a, b] = c.element.split('|'); return `Scène « ${c.scene} » : « ${a} » et « ${b} » se chevauchent (vers ${virgule(c.instant)} s) ; les écarter, ou marquer celui qui passe volontairement par-dessus avec data-superpose. S'il s'agit d'un décor : data-decor (ou alt="" pour une image, aria-hidden="true" pour un SVG).`; },
  'hors-cadre': (c) => `Scène « ${c.scene} » : « ${c.element} » sort de l'image (vers ${virgule(c.instant)} s). S'il s'agit d'un décor : data-decor (ou alt="" pour une image, aria-hidden="true" pour un SVG).`,
  marge: (c) => `Scène « ${c.scene} » : le texte « ${c.element} » touche presque le bord de l'image (vers ${virgule(c.instant)} s) ; garder au moins ${virgule(SEUILS.margeMin * 100)} % de marge.`,
  'zone-sure': (c) => (c.element === 'sous-titres'
    ? `Scène « ${c.scene} » : en 9:16, les sous-titres passent sous les boutons des réseaux sociaux (${ZONES[c.valeur] || c.valeur}, vers ${virgule(c.instant)} s) ; garder les réglages par défaut du style, ou réduire --pm-st-largeur et revoir --pm-st-marge.`
    : `Scène « ${c.scene} » : en 9:16, le texte « ${c.element} » passe sous les boutons des réseaux sociaux (${ZONES[c.valeur] || c.valeur}, vers ${virgule(c.instant)} s) ; raccourcir les textes de la scène ou retirer un point, sinon les rapprocher du centre.`),
  'logo-masque': (c) => (c.valeur && c.valeur.par === 'sous-titres'
    ? `Scène « ${c.scene} » : les sous-titres cachent le logo à ${Math.round(c.valeur.part * 100)} % (vers ${virgule(c.instant)} s) ; passer les sous-titres en haut (« sousTitres »: { « position »: « haut » }) ou déplacer le logo.`
    : c.valeur === 'dehors'
    ? `Scène « ${c.scene} » : le logo sort de l'image (vers ${virgule(c.instant)} s).`
    : `Scène « ${c.scene} » : le logo est recouvert à ${Math.round(c.valeur * 100)} % (vers ${virgule(c.instant)} s) ; le dégager.`),
  'texte-fugace': (c) => (c.element === 'sous-titres'
    ? `Scène « ${c.scene} » : un sous-titre ne reste affiché que ${virgule(c.valeur.duree)} s (vers ${virgule(c.instant)} s) ; il faut au moins ${virgule(c.valeur.besoin)} s : raccourcir la phrase dite ou laisser une pause après elle.`
    : `Scène « ${c.scene} » : le texte « ${c.element} » ne reste lisible que ${virgule(c.valeur.duree)} s ; il faut au moins ${virgule(c.valeur.besoin)} s pour le lire.`),
'contraste-reel': (c) => (c.element === 'sous-titres'
    ? `Scène « ${c.scene} » : les sous-titres ne se détachent pas assez de ce qu'il y a derrière eux (contraste ${virgule(c.valeur)}:1 vers ${virgule(c.instant)} s) ; dans le style, régler --pm-st-fond (bandeau derrière les sous-titres) ou --pm-st-texte (leur couleur).`
    : `Scène « ${c.scene} » : le texte « ${c.element} » ne se détache pas assez de ce qu'il y a derrière lui (contraste ${virgule(c.valeur)}:1 vers ${virgule(c.instant)} s) ; assombrir ou éclaircir le fond sous le texte, ajouter un aplat, ou changer la couleur du texte.`),
flash: (c) => `Scène « ${c.scene} » : l'image clignote ${virgule(c.valeur)} fois par seconde vers ${virgule(c.instant)} s ; au-delà de ${SEUILS.flashMax} flashs par seconde sur une grande partie de l'image, la vidéo peut déclencher une crise chez une personne épileptique. Ralentir ou adoucir ce clignotement.`,
  'sous-titre-cache-texte': (c) => `Scène « ${c.scene} » : les sous-titres cachent le texte « ${c.element} » (vers ${virgule(c.instant)} s) ; passer les sous-titres en haut (« sousTitres »: { « position »: « haut » } dans le déroulé) ou remonter le texte.`,
  'mouvement-rapide': (c) => `Scène « ${c.scene} » : « ${c.element} » traverse l'image trop vite (vers ${virgule(c.instant)} s) ; au-delà d'une largeur d'image par seconde, le mouvement fatigue l'œil.`,
};

/** Constats bruts de M.mesurer -> problèmes (alertes). Règle inconnue : ignorée. */
function traduireConstats(constats) {
  return (constats || []).filter((c) => MESSAGES[c.regle]).map((c) => ({ regle: c.regle, gravite: c.regle === 'flash' ? 'erreur' : 'alerte', scene: c.scene, element: c.element, message: MESSAGES[c.regle](c) }));
}

const nonVerifie = (regle, message) => ({ renduVerifie: false, problemes: [{ regle, gravite: 'alerte', message }], ajustements: [] });

/** -> { renduVerifie, problemes } ; jamais d'exception. */
async function controlerRendu({ html, ratio, duree, navigateur = trouverNavigateur() }) {
  if (!navigateur) return nonVerifie('rendu-non-verifie', 'Chrome ou Edge introuvable : la vidéo rendue (chevauchements, marges, textes qui débordent…) n\'a pas été vérifiée. Installez l\'un des deux, ou indiquez son chemin avec la variable PM_NAVIGATEUR.');
  const r = await mesurerPage({ html, navigateur, delai: (30 + 2 * (duree || 0)) * 1000, script: `
    // Formes exactes des collisions effacées à la fin de leur minutage (avant les mesures : elles rendent des scènes).
    var formesVides = M.particules && M.particules.formesVides ? await M.particules.formesVides() : [];
    var constats = M.mesurer({ ratio: ${JSON.stringify(ratio)}, seuils: ${JSON.stringify(SEUILS)} });
    var debordements = M.detecterDebordements();
    var ajustements = M.essayerTailles({ minimumCqh: ${SEUILS.texteMinCqh} });
    return { constats: constats.concat(await M.mesurerPixels({ ratio: ${JSON.stringify(ratio)}, seuils: ${JSON.stringify(SEUILS)} })), debordements: debordements, ajustements: ajustements, formesVides: formesVides };` });
  if (r.code === 'ENOENT') return nonVerifie('rendu-impossible', `Navigateur introuvable à « ${navigateur} » : vérifiez la variable PM_NAVIGATEUR (ou retirez-la pour utiliser Chrome ou Edge installés). Seuls les contrôles sans navigateur ont été faits.`);
  if (r.erreur) return nonVerifie('rendu-impossible', `La vidéo n'a pas pu être mesurée dans le navigateur (${r.erreur}) : seuls les contrôles sans navigateur ont été faits.`);
  const debordements = (r.resultat.debordements || []).map((d) => ({ regle: 'debordement', gravite: 'erreur', scene: d.scene, element: d.element, message: d.message }));
  return { renduVerifie: true, problemes: [...debordements, ...traduireConstats(r.resultat.constats), ...traduireFormesVides(r.resultat.formesVides)], ajustements: r.resultat.ajustements || [] };
}

/** Formes exactes au masque vide (M.particules.formesVides) -> alertes « obstacle-forme-vide ». */
function traduireFormesVides(liste) {
  return (liste || []).map((f) => ({ regle: 'obstacle-forme-vide', gravite: 'alerte', scene: f.scene, element: f.element, message: f.message }));
}

module.exports = { traduireConstats, traduireFormesVides, controlerRendu };
