'use strict';
/* Pulse Motion – contrôle de la vidéo rendue : page assemblée ouverte en temps réel dans Chrome ou Edge sans
 * fenêtre, pilotée par le CDP (page-mesures.js, ouvrirPageControle), flashs mesurés depuis Node (flashs.js), mesures de moteur/mesures.js (M.mesurer), débordements (M.detecterDebordements) et
 * formes exactes des collisions effacées à la fin de leur minutage (M.particules.formesVides, sans GPU) et photographies
 * des effets de fragmentation (M.particules.photosVides, sans GPU : ancre-vide, photographie-trop-grande), traduits en
 * problèmes. */
const { trouverNavigateur } = require('./navigateur.js');
const { mesurerPage, ouvrirPageControle } = require('./page-mesures.js');
const { mesurerFlashs, casesImage, seuilsFlashs } = require('./flashs.js');
const { decoderPNG } = require('../logo.js');
const { scenesVisibles } = require('../../moteur/minutage.js');
const { navigateursParalleles } = require('./paralleles.js');
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

/** Script des mesures dans la page (après M.pret et les polices). flashs : flashs mesurés dans la page (repli). */
function scriptMesures({ ratio, scenes, plages, plagesFlashs, flashs }) {
  const opts = (extra) => JSON.stringify({ ratio, seuils: SEUILS, ...extra });
  const choix = scenes ? { scenes } : {};
  return `
    // Formes exactes des collisions effacées à la fin de leur minutage (avant les mesures : elles rendent des scènes).
    var formesVides = M.particules && M.particules.formesVides ? await M.particules.formesVides() : [];
    // Photographies des effets de fragmentation (elles rendent aussi des scènes).
    var photos = M.particules && M.particules.photosVides ? await M.particules.photosVides() : [];
    var constats = M.mesurer(${opts(plages ? { plages } : {})});
    var debordements = M.detecterDebordements(${JSON.stringify(choix)});
    var ajustements = M.essayerTailles(${JSON.stringify({ minimumCqh: SEUILS.texteMinCqh, ...choix })});
    return { constats: constats.concat(await M.mesurerPixels(${opts({ ...choix, flashs, ...(flashs && plagesFlashs ? { plagesFlashs } : {}) })})), debordements: debordements, ajustements: ajustements, formesVides: formesVides, photos: photos };`;
}

/** Résultat brut de la page -> { renduVerifie, problemes, ajustements } (seulement les scènes demandées, s'il y en a). */
function traduireResultat(resultat, scenes) {
  const garder = (p) => !scenes || !p.scene || scenes.includes(p.scene);
  const debordements = (resultat.debordements || []).map((d) => ({ regle: 'debordement', gravite: 'erreur', scene: d.scene, element: d.element, message: d.message }));
  return { renduVerifie: true, problemes: [...debordements, ...traduireConstats(resultat.constats), ...traduireFormesVides(resultat.formesVides), ...traduirePhotos(resultat.photos)].filter(garder), ajustements: (resultat.ajustements || []).filter(garder) };
}

/** Prépare une page aux flashs (sous-titres masqués, comme dans la page) -> géométrie de la scène et minutage. */
const PREPARER_FLASHS = `(function () {
    var r = document.getElementById('pm-scene').getBoundingClientRect();
    var st = document.createElement('style');
    st.id = 'pm-flashs-sans-sous-titres';
    st.textContent = '#pm-sous-titres { display: none !important; }';
    document.head.appendChild(st);
    return { x: r.left, y: r.top, l: r.width, h: r.height, duree: M.duree, ips: M.ips || 30, depart: M.temps(),
      scenes: M.minutage.scenes.map(function (s) { return { id: s.id, debut: s.debut, fin: s.fin }; }) };
  })()`;

/**
 * Flashs depuis Node : M.rendre(t) puis capture PNG réduite à largeurFlash (clip.scale), décodée en JavaScript.
 * aides : autres pages de contrôle de la même vidéo ; les instants sont répartis entre toutes les pages, en morceaux
 * contigus (chaque capture attend une image du navigateur : plusieurs pages en même temps vont plus vite).
 */
async function flashsParCDP(page, { plagesFlashs, aides = [] } = {}) {
  const info = await page.evaluer(PREPARER_FLASHS);
  const pages = [page];
  for (const aide of aides) {
    try { await aide.evaluer(PREPARER_FLASHS); pages.push(aide); } catch { /* page d'aide perdue : les autres suffisent */ }
  }
  const S = seuilsFlashs(SEUILS);
  const echelle = S.largeurFlash / Math.max(1, info.l);
  const minutage = { scenes: info.scenes };
  const relever = async (p, t) => {
    await p.evaluer(`M.rendre(${Number(t)}), true`);
    const r = await p.envoyer('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: false,
      clip: { x: info.x, y: info.y, width: info.l, height: info.h, scale: echelle } });
    const image = decoderPNG(Buffer.from(r.data, 'base64'));
    return casesImage(image.pixel, image.largeur, image.hauteur, S.flashCases);
  };
  const releverTous = async (instants) => {
    const k = Math.max(1, Math.min(pages.length, Math.ceil(instants.length / 8)));
    const taille = Math.ceil(instants.length / k);
    const morceaux = await Promise.all(Array.from({ length: k }, async (_, j) => {
      const r = [];
      for (const t of instants.slice(j * taille, (j + 1) * taille)) r.push(await relever(pages[j], t));
      return r;
    }));
    return morceaux.flat();
  };
  try {
    return await mesurerFlashs({ duree: info.duree, ips: info.ips, seuils: SEUILS, plages: plagesFlashs || null, sceneA: (t) => scenesVisibles(minutage, t)[0] || null, releverTous });
  } finally {
    await page.evaluer(`(function () { var st = document.getElementById('pm-flashs-sans-sous-titres'); if (st) st.remove(); M.rendre(${Number(info.depart) || 0}); return true; })()`);
  }
}

/**
 * Contrôle du rendu par la page de contrôle pilotée par le CDP (spec Rapidité 5.10) ; repli par la page qui renvoie son
 * résultat par POST (flashs mesurés dans la page) si le CDP échoue. -> { renduVerifie, problemes, ajustements, voie } ;
 * jamais d'exception. scenes : seules ces scènes sont jugées (contrôle partiel) ; plages : instants des mesures ;
 * plagesFlashs : instants de la passe rapide des flashs. ouvrir : remplace l'ouverture par le CDP (tests).
 * Pages d'aide aux flashs : autant que la règle commune des navigateurs (lib/paralleles.js) moins une, ouvertes pendant
 * les mesures de la page principale.
 */
async function controlerRendu({ html, ratio, duree, navigateur = trouverNavigateur(), scenes = null, plages = null, plagesFlashs = null, ouvrir }) {
  if (!navigateur) return nonVerifie('rendu-non-verifie', 'Chrome ou Edge introuvable : la vidéo rendue (chevauchements, marges, textes qui débordent…) n\'a pas été vérifiée. Installez l\'un des deux, ou indiquez son chemin avec la variable PM_NAVIGATEUR.');
  const delai = (30 + 2 * (duree || 0)) * 1000;
  const introuvable = () => nonVerifie('rendu-impossible', `Navigateur introuvable à « ${navigateur} » : vérifiez la variable PM_NAVIGATEUR (ou retirez-la pour utiliser Chrome ou Edge installés). Seuls les contrôles sans navigateur ont été faits.`);
  const impossible = (erreur) => nonVerifie('rendu-impossible', `La vidéo n'a pas pu être mesurée dans le navigateur (${erreur}) : seuls les contrôles sans navigateur ont été faits.`);
  const ouvrirUne = () => ouvrirPageControle({ html, navigateur, delai, ...(ouvrir ? { ouvrir } : {}) });
  let controle = null;
  try {
    controle = await ouvrirUne();
  } catch (e) {
    if (e.code === 'ENOENT') return introuvable();
    controle = null;
  }
  if (controle) {
    const { nombre } = navigateursParalleles({ taches: 4 });
    const aides = Promise.all(Array.from({ length: nombre - 1 }, () => ouvrirUne().catch(() => null)));
    try {
      const { page } = controle;
      const erreurPage = () => page.evaluer('window.__pmErreur === undefined ? null : window.__pmErreur');
      let erreur = await erreurPage();
      if (erreur !== null) return impossible(erreur);
      const resultat = await page.evaluer(`(async function () {${scriptMesures({ ratio, scenes, plages, flashs: false })}\n})()`);
      const pagesAide = (await aides).filter(Boolean).map((a) => a.page);
      resultat.constats = resultat.constats.concat(await flashsParCDP(page, { plagesFlashs, aides: pagesAide }));
      erreur = await erreurPage();
      if (erreur !== null) return impossible(erreur);
      return { ...traduireResultat(resultat, scenes), voie: 'cdp' };
    } catch (e) {
      return impossible(e.message);
    } finally {
      await Promise.all([controle.fermer(), aides.then((liste) => Promise.all(liste.filter(Boolean).map((a) => a.fermer())))]);
    }
  }
  // Repli : la page renvoie son résultat par POST, les flashs sont mesurés dans la page (captures foreignObject).
  const r = await mesurerPage({ html, navigateur, delai, script: scriptMesures({ ratio, scenes, plages, plagesFlashs, flashs: true }) });
  if (r.code === 'ENOENT') return introuvable();
  if (r.erreur) return impossible(r.erreur);
  return { ...traduireResultat(r.resultat, scenes), voie: 'page' };
}

/** Problèmes de photographie des fragments (M.particules.photosVides) : ancre-vide (erreur), photographie-trop-grande (alerte). */
function traduirePhotos(liste) {
  return (liste || []).map((p) => ({ regle: p.regle, gravite: p.regle === 'ancre-vide' ? 'erreur' : 'alerte', scene: p.scene, element: p.element, message: p.message }));
}

/** Formes exactes au masque vide (M.particules.formesVides) -> alertes « obstacle-forme-vide ». */
function traduireFormesVides(liste) {
  return (liste || []).map((f) => ({ regle: 'obstacle-forme-vide', gravite: 'alerte', scene: f.scene, element: f.element, message: f.message }));
}

module.exports = { traduireConstats, traduireFormesVides, traduirePhotos, controlerRendu, flashsParCDP };
