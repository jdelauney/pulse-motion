'use strict';
/* Pulse Motion – contrôle de la vidéo rendue : page assemblée ouverte en temps réel dans Chrome ou Edge sans
 * fenêtre, pilotée par le CDP (page-mesures.js, ouvrirPageControle), flashs mesurés depuis Node (flashs.js), mesures de moteur/mesures.js (M.mesurer), débordements (M.detecterDebordements) et
 * formes exactes des collisions effacées à la fin de leur minutage (M.particules.formesVides, sans GPU) et photographies
 * des effets de fragmentation (M.particules.photosVides, sans GPU : ancre-vide, photographie-trop-grande), traduits en
 * problèmes. */
const { trouverNavigateur } = require('./navigateur.js');
const { mesurerPage, ouvrirPageControle } = require('./page-mesures.js');
const { mesurerFlashs, casesImage, seuilsFlashs, vignetteGrise } = require('./flashs.js');
const { suggererCouleur, phraseProposition } = require('./couleurs.js');
const { decoderPNG } = require('../logo.js');
const { scenesVisibles } = require('../../moteur/minutage.js');
const { navigateursParalleles } = require('./paralleles.js');
const SEUILS = require('../seuils.json');

const virgule = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
/** « 1 image », « 3 images » (au moins une). */
const images = (n) => { const k = Math.max(1, Math.round(n)); return `${k} image${k > 1 ? 's' : ''}`; };
const ZONES = { haut: 'en haut', bas: 'en bas', droite: 'à droite', gauche: 'à gauche' };

const MESSAGES = {
  chevauchement: (c) => { const [a, b] = c.element.split('|'); return `Scène « ${c.scene} » : « ${a} » et « ${b} » se chevauchent (vers ${virgule(c.instant)} s) ; les écarter, ou marquer celui qui passe volontairement par-dessus avec data-superpose. S'il s'agit d'un décor : data-decor (ou alt="" pour une image, aria-hidden="true" pour un SVG).`; },
  'hors-cadre': (c) => `Scène « ${c.scene} » : « ${c.element} » sort de l'image (vers ${virgule(c.instant)} s). S'il s'agit d'un décor : data-decor (ou alt="" pour une image, aria-hidden="true" pour un SVG).`,
  marge: (c) => `Scène « ${c.scene} » : ${c.image ? '' : 'le texte '}« ${c.element} » touche presque le bord de l'image (vers ${virgule(c.instant)} s) ; garder au moins ${virgule(SEUILS.margeMin * 100)} % de marge.`,
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
    ? `Scène « ${c.scene} » : les sous-titres ne se détachent pas assez de ce qu'il y a derrière eux (contraste ${virgule(c.valeur)}:1 vers ${virgule(c.instant)} s) ; dans le style, régler --pm-st-fond (bandeau derrière les sous-titres) ou --pm-st-texte (leur couleur)${proposition(c)}.`
    : `Scène « ${c.scene} » : le texte « ${c.element} » ne se détache pas assez de ce qu'il y a derrière lui (contraste ${virgule(c.valeur)}:1 vers ${virgule(c.instant)} s) ; assombrir ou éclaircir le fond sous le texte, ajouter un aplat, ou changer la couleur du texte${proposition(c)}.`),
flash: (c) => `Scène « ${c.scene} » : l'image clignote ${virgule(c.valeur)} fois par seconde vers ${virgule(c.instant)} s ; au-delà de ${SEUILS.flashMax} flashs par seconde sur une grande partie de l'image, la vidéo peut déclencher une crise chez une personne épileptique. Ralentir ou adoucir ce clignotement.`,
  'sous-titre-cache-texte': (c) => `Scène « ${c.scene} » : les sous-titres cachent le texte « ${c.element} » (vers ${virgule(c.instant)} s) ; passer les sous-titres en haut (« sousTitres »: { « position »: « haut » } dans le déroulé) ou remonter le texte.`,
  'mouvement-rapide': (c) => `Scène « ${c.scene} » : « ${c.element} » traverse l'image trop vite (vers ${virgule(c.instant)} s) ; au-delà d'une largeur d'image par seconde, le mouvement fatigue l'œil.`,
  // Réalisation et vérité sur la vidéo rendue (spec S2, 5.8), messages sans nom d'attribut.
  'texte-casse': (c) => `Scène « ${c.scene} » : le texte « ${c.element} » affiche « ${c.valeur} » vers ${virgule(c.instant)} s ; un compteur ou un calcul est cassé.`,
  'texte-epingle': (c) => `Le petit texte « ${c.element} » reste dans un coin de l'image ${virgule(c.valeur)} s en tout ; un repère permanent (numéro, compteur, nom de scène) alourdit l'image. S'il est voulu, le garder.`,
  accroche: (c) => `Vidéo pour les réseaux : ${c.element
    ? `le texte « ${c.element} » est lisible à ${virgule(c.instant)} s mais petit (${virgule(c.valeur.p)} % du petit côté ; il faut ${virgule(c.valeur.min)} %)`
    : `aucun texte assez grand n'est lisible avant ${virgule(SEUILS.accrocheMax)} s (${c.valeur && c.valeur.t !== null ? `le premier l'est à ${virgule(c.valeur.t)} s` : 'aucun ne l\'est'})`} ; on décide en ${virgule(SEUILS.accrocheMax)} secondes, souvent sans le son : afficher la promesse dès le début, en grand.`,
  'image-zero': (c) => `Vidéo pour les réseaux : la première image (scène « ${c.scene} ») est vide, et c'est elle qui sert de vignette ; faire apparaître le titre dès la première image.`,
  'image-agrandie': (c) => `Scène « ${c.scene} » : l'image « ${c.element} » est affichée ${virgule(c.valeur.f)} fois plus grande que sa taille réelle vers ${virgule(c.instant)} s (zoom compris${c.valeur.kenBurns ? ', jusqu\'au zoom final du Ken Burns' : ''}) ; elle sera floue. Fournir une image d'au moins ${c.valeur.px} pixels de large, ou l'afficher plus petite.`,
  // QR codes (spec S9, 5.4) : taille d'un module à l'export en 1080p, zones des réseaux.
  'qr-trop-petit': (c) => `Scène « ${c.scene} » : les carrés du QR code « ${c.element} » ne font que ${virgule(c.valeur.px)} pixels dans la vidéo exportée ; en dessous de ${c.valeur.min} pixels, un téléphone a du mal à le lire. Agrandir le QR code, ou raccourcir le lien (moins de carrés).`,
  'qr-hors-zone': (c) => `Scène « ${c.scene} » : le QR code « ${c.element} » passe sous l'interface des réseaux (${ZONES[c.valeur] || c.valeur}) vers ${virgule(c.instant)} s ; le placer au centre de l'image.`,
  'texte-petit-lecteur': (c) => `Scène « ${c.scene} » : ${c.element === 'sous-titres' ? 'les sous-titres ne font' : `le texte « ${c.element} » ne fait`} que ${virgule(c.valeur.px)} pixels quand la vidéo est vue en petit (${c.valeur.largeur} pixels de large, comme dans un fil ou sur un téléphone) ; il faut au moins ${c.valeur.min} pixels : l'agrandir ou le raccourcir.`,
  'sujet-petit': (c) => `Scène « ${c.scene} » : à ${virgule(c.instant)} s, le contenu n'occupe que ${c.valeur} % de l'image ; au moment clé, il doit en occuper au moins un tiers : l'agrandir ou rapprocher la caméra.`,
  'transition-vide': (c) => { const [a, b] = String(c.element).split('|'); return `Entre les scènes « ${a} » et « ${b} » (vers ${virgule(c.instant)} s), l'image est vide pendant la transition ; faire entrer un élément de « ${b} » dès son début, ou choisir la coupe.`; },
  'sous-titre-cache-sujet': (c) => `Scène « ${c.scene} » : les sous-titres passent sur « ${c.element} » vers ${virgule(c.instant)} s ; les mettre en haut, ou remonter l'élément.`,
  'erreur-de-scene': (c) => `Scène « ${c.scene} » : son code s'arrête sur une erreur (« ${c.valeur} ») ; une partie de la scène ne s'anime pas.`,
  // Images figées et vides (spec S2, 5.10), son mesuré (5.11).
  'image-figee': (c) => `Scène « ${c.scene} » : l'image ne change presque pas pendant ${virgule(c.valeur.d)} s (de ${virgule(c.valeur.a)} s à ${virgule(c.valeur.b)} s) alors que des éléments sont censés bouger ; leurs mouvements sont trop petits pour se voir.`,
  'image-vide': (c) => `Scène « ${c.scene} » : l'image est unie vers ${virgule(c.instant)} s ; un élément manque, ou n'est pas encore entré.`,
  'voix-couverte': (c) => `Scène « ${c.scene} » : la voix est couverte par la musique ou les bruitages pendant ${c.valeur} % du temps où elle parle ; baisser la musique, ou passer la musique de cette scène en « calme ».`,
  // Mouvement (spec Mouvement vivant, 5.12).
  'geste-bref': (c) => `Scène « ${c.scene} » : « ${c.element} » change de pose en moins de ${virgule(SEUILS.gesteBrefDuree)} s vers ${virgule(c.instant)} s (${c.valeur.partie}${c.valeur.partie === 'paupières' ? '' : `, ${Math.round(c.valeur.ampleur)}°`}) : à ${c.valeur.ips} images par seconde, ce geste tient en ${images(c.valeur.duree * c.valeur.ips)} et scintille ; l'étaler sur au moins 0,15 s.`,
  'pose-figee': (c) => `Scène « ${c.scene} » : « ${c.element} » reste figé ${virgule(c.valeur.duree)} s (de ${virgule(c.valeur.debut)} s à ${virgule(c.valeur.fin)} s) : il paraît mort ; garder data-vie="pleine" ou lui donner un geste.`,
  'raccord-boucle': (c) => `Scène « ${c.scene} » : « ${c.element} » : son mouvement répété ne revient pas à son point de départ et saute à chaque tour ; le finir comme il commence.`,
  'tout-en-phase': (c) => `Scène « ${c.scene} » : ${c.valeur} éléments « ${c.element} » bougent exactement ensemble : décaler leur départ (data-start, --pm-phase) pour que chacun vive à son rythme.`,
  'a-coup-camera': (c) => (c.valeur && c.valeur.retour
    ? `Scène « ${c.scene} » : la caméra avance puis recule aussitôt vers ${virgule(c.instant)} s (zoom) : laisser au moins ${virgule(SEUILS.zoomRetourMin)} s entre les deux, ou n'en garder qu'un.`
    : `Scène « ${c.scene} » : la caméra part ou s'arrête d'un coup vers ${virgule(c.instant)} s (${c.valeur ? c.valeur.partie : 'cadrage'}) : prendre une courbe douce (sine-inout) ; pour un choc voulu, une secousse.`),
  // Écrans des tutoriels (spec S6, 5.8 et 5.15).
  'etapes-trop-rapprochees': (c) => (c.valeur.film
    ? (c.valeur.a
      ? `Scène « ${c.scene} » : les étapes ${c.valeur.a} et ${c.valeur.b} sont trop rapprochées. Il faut au moins ${virgule(c.valeur.minimum)} s entre elles (le temps de voir la page réagir puis d'aller cliquer).`
      : `Scène « ${c.scene} » : l'étape ${c.valeur.b} commence trop tôt ; il faut au moins ${virgule(c.valeur.minimum)} s depuis le début de la scène (le temps d'aller cliquer).`)
    : `Scène « ${c.scene} » : les gestes ${c.valeur.a} et ${c.valeur.b} du pointeur sont trop rapprochés (${virgule(c.valeur.ecart)} s) ; il faut au moins ${virgule(c.valeur.minimum)} s entre eux, le temps de voir le clic puis d'aller au suivant.`),
  'pointeur-hors-ecran': (c) => `Scène « ${c.scene} » : le pointeur doit aller sur « ${c.element} », qui est hors de l'image de l'écran.`,
  // Calque de dessin (spec S7, 5.2 et 5.4).
  'dessin-erreur': (c) => `Scène « ${c.scene} » : un dessin de la scène ne se fait pas (vers ${virgule(c.instant)} s) : ${c.valeur} ; le reste de la scène s'affiche sans lui.`,
  'fleche-cible-introuvable': (c) => `Scène « ${c.scene} » : ${c.valeur}.`,
  // Caméra automatique (spec S7, 5.8).
  'camera-auto-cadre': (c) => `Scène « ${c.scene} » : ${c.valeur}`,
  // Code animé (spec S7, 5.9).
  'code-trop-large': (c) => `Scène « ${c.scene} » : ${c.valeur}.`,
  'silence-imprevu': (c) => `De ${virgule(c.valeur.a)} s à ${virgule(c.valeur.b)} s, on n'entend rien pendant ${virgule(c.valeur.d)} s alors que la musique devrait jouer ; vérifier la musique de la scène « ${c.scene} ».`,
};

/** Couleur lisible proposée pour un contraste réel trop faible (spec S2, 5.9) : fin de message, ou rien. */
function proposition(c) {
  if (!c.fond || !c.couleur || !c.minimum) return '';
  return ` ; ${phraseProposition(suggererCouleur(c.couleur, c.fond, c.minimum, c.charte || {}))}`;
}

const GRAVITES = { flash: 'erreur', 'texte-casse': 'erreur', 'erreur-de-scene': 'erreur', 'etapes-trop-rapprochees': 'erreur', 'dessin-erreur': 'erreur', 'fleche-cible-introuvable': 'erreur', 'code-trop-large': 'erreur', 'camera-auto-cadre': 'erreur', 'qr-trop-petit': 'erreur' };

/** Constats bruts de M.mesurer -> problèmes (alertes, sauf GRAVITES). Règle inconnue : ignorée. */
function traduireConstats(constats) {
  return (constats || []).filter((c) => MESSAGES[c.regle]).map((c) => ({ regle: c.regle, gravite: GRAVITES[c.regle] || 'alerte', scene: c.scene, element: c.element, message: MESSAGES[c.regle](c) }));
}

const nonVerifie = (regle, message) => ({ renduVerifie: false, problemes: [{ regle, gravite: 'alerte', message }], ajustements: [] });

/**
 * Script des mesures dans la page (après M.pret et les polices). flashs : flashs mesurés dans la page (repli). genre : celui
 * du déroulé (règles des réseaux). ecoute : { humeurs } pour mesurer le son (spec S2, 5.11), lancé avant les mesures (le rendu
 * du son avance pendant qu'elles tournent) et gardé dans window.__pmEcoute ; attendreEcoute : attendu ici (repli), sinon lu
 * plus tard par le CDP.
 */
function scriptMesures({ ratio, scenes, plages, plagesFlashs, flashs, genre = null, ecoute = null, attendreEcoute = false, plateforme = null }) {
  // plateforme : zones d'une plateforme imposées (« toutes » pour un export vers les réseaux, spec Rendu et export 5.19).
  const opts = (extra) => JSON.stringify({ ratio, seuils: SEUILS, ...(plateforme ? { plateforme } : {}), ...extra });
  const choix = scenes ? { scenes } : {};
  return `
    window.__pmEcoute = ${ecoute ? `M.ecouter ? M.ecouter(${JSON.stringify({ seuils: SEUILS, humeurs: ecoute.humeurs || {} })}).catch(function (e) { return { erreur: String((e && e.message) || e) }; }) : null` : 'null'};
    // Formes exactes des collisions effacées à la fin de leur minutage (avant les mesures : elles rendent des scènes).
    var formesVides = M.particules && M.particules.formesVides ? await M.particules.formesVides() : [];
    // Photographies des effets de fragmentation (elles rendent aussi des scènes).
    var photos = M.particules && M.particules.photosVides ? await M.particules.photosVides() : [];
    var constats = M.mesurer(${opts({ ...(plages ? { plages } : {}), genre })});
    // Contrôles du mouvement (spec Mouvement vivant, 5.12) : calculs purs, sans mise en page par image.
    try { if (M.mesurerMouvement) constats = constats.concat(M.mesurerMouvement(${opts(choix)})); } catch (e) { console.error('[Pulse Motion] mesure du mouvement : ' + e.message); }
    // Écrans des tutoriels (spec S6) : gestes trop rapprochés, cible hors de l'image.
    try { if (M.mesurerEcrans) constats = constats.concat(M.mesurerEcrans(${JSON.stringify(choix)})); } catch (e) { console.error('[Pulse Motion] mesure des écrans : ' + e.message); }
    // Calque de dessin (spec S7) : erreurs des dessins, cibles des flèches, relevés des scènes qui dessinent.
    var dessin = M.mesurerDessin ? M.mesurerDessin(${JSON.stringify(choix)}) : null;
    if (dessin) constats = constats.concat(dessin.constats);
    // Caméra automatique (spec S7, 5.8) : conteneur qui ne remplit pas la scène, plans des scènes filmées.
    var camera = M.mesurerCameraAuto ? M.mesurerCameraAuto(${JSON.stringify(choix)}) : null;
    if (camera) constats = constats.concat(camera.constats);
    var debordements = M.detecterDebordements(${JSON.stringify(choix)});
    var ajustements = M.essayerTailles(${JSON.stringify({ minimumCqh: SEUILS.texteMinCqh, ...choix })});
    var pixels = await M.mesurerPixels(${opts({ ...choix, flashs, ...(flashs && plagesFlashs ? { plagesFlashs } : {}) })});
    return { constats: constats.concat(pixels), debordements: debordements, ajustements: ajustements, formesVides: formesVides, photos: photos,
      erreursScenes: window.__pmErreursScenes || [], releves: dessin ? dessin.releves : null, cameras: camera ? camera.plans : null, ecoute: ${attendreEcoute ? 'await window.__pmEcoute' : 'null'} };`;
}

/** Résultat de l'écoute (M.ecouter) -> problèmes, ou null si le son n'a pas pu être mesuré. */
function traduireEcoute(e) {
  if (!e || e.erreur || !Array.isArray(e.constats)) return null;
  return traduireConstats(e.constats);
}

/** Résultat brut de la page -> { renduVerifie, problemes, ajustements, son, releves } (problèmes des seules scènes demandées,
 *  s'il y en a ; son : problèmes du son, de toute la vidéo, ou null ; releves : relevés des scènes qui dessinent, ou null). */
function traduireResultat(resultat, scenes) {
  const garder = (p) => !scenes || !p.scene || scenes.includes(p.scene);
  const debordements = (resultat.debordements || []).map((d) => ({ regle: 'debordement', gravite: 'erreur', scene: d.scene, element: d.element, message: d.message }));
  const erreurs = (resultat.erreursScenes || []).map((e) => ({ regle: 'erreur-de-scene', scene: e.scene, element: null, instant: 0, valeur: e.message }));
  return { renduVerifie: true, problemes: [...debordements, ...traduireConstats([...(resultat.constats || []), ...erreurs]), ...traduireFormesVides(resultat.formesVides), ...traduirePhotos(resultat.photos)].filter(garder),
    ajustements: (resultat.ajustements || []).filter(garder), son: traduireEcoute(resultat.ecoute), releves: resultat.releves || null,
    cameras: resultat.cameras && Object.keys(resultat.cameras).length ? resultat.cameras : null };
}

/** Prépare une page aux flashs (sous-titres masqués, comme dans la page) -> géométrie de la scène et minutage. */
const PREPARER_FLASHS = `(function () {
    var r = document.getElementById('pm-scene').getBoundingClientRect();
    var st = document.createElement('style');
    st.id = 'pm-flashs-sans-sous-titres';
    st.textContent = '#pm-sous-titres { display: none !important; }';
    document.head.appendChild(st);
    // Contexte des images figées et vides : entrée, scène exclue (effets, shaders, temps figé), éléments minutés.
    return { x: r.left, y: r.top, l: r.width, h: r.height, duree: M.duree, ips: M.ips || 30, depart: M.temps(),
      scenes: M.minutage.scenes.map(function (s, i) {
        var sec = document.querySelector('#pm-scene > section[data-scene="' + CSS.escape(s.id) + '"]');
        var exclue = !sec || !!sec.querySelector('[data-effet], [data-milieu], [data-shader], [data-pm-shader], [data-gel], canvas, video') || (sec.hasAttribute('data-gel'));
        var el = (M.minutage.elements && M.minutage.elements[s.id]) || {};
        // Mouvements du contenu seulement : sur une vignette de 64 px, la dérive lente d'un décor fin (trame, grille) ne se voit
        // pas, même quand elle se voit en grand ; un décor n'est donc pas jugé.
        var decor = {};
        if (sec) sec.querySelectorAll('[data-pm-cle]').forEach(function (x) { if (x.closest('.decor, [data-decor]')) decor[x.getAttribute('data-pm-cle')] = true; });
        var mouvements = Object.keys(el).filter(function (k) { return !decor[k]; }).map(function (k) { return [el[k].debut, el[k].fin]; });
        return { id: s.id, debut: s.debut, fin: s.fin, entree: s.entree > 0 ? s.entree : (i === 0 ? (s.dureeTransition || 0) : 0), exclue: exclue, mouvements: mouvements };
      }) };
  })()`;

/**
 * Flashs depuis Node : M.rendre(t) puis capture PNG réduite à largeurFlash (clip.scale), décodée en JavaScript.
 * aides : autres pages de contrôle de la même vidéo ; les instants sont répartis entre toutes les pages, en morceaux
 * contigus (chaque capture attend une image du navigateur : plusieurs pages en même temps vont plus vite).
 */
async function flashsParCDP(page, { plagesFlashs, aides = [], surScene = null } = {}) {
  const info = await page.evaluer(PREPARER_FLASHS);
  const pages = [page];
  for (const aide of aides) {
    try { await aide.evaluer(PREPARER_FLASHS); pages.push(aide); } catch { /* page d'aide perdue : les autres suffisent */ }
  }
  const S = seuilsFlashs(SEUILS);
  const echelle = S.largeurFlash / Math.max(1, info.l);
  const minutage = { scenes: info.scenes };
  // Avancement par scène (spec Retouches et ergonomie, 5.2) : une scène est annoncée la première fois qu'une de ses images est
  // relevée (les pages d'aide relèvent en même temps des morceaux différents).
  const vues = new Set();
  // Contrôle partiel : seules les scènes que touchent les plages comptent (une marge peut en toucher une voisine).
  const nScenes = Math.max(1, plagesFlashs ? info.scenes.filter((sc) => plagesFlashs.some((p) => p[0] < sc.fin && p[1] > sc.debut)).length : info.scenes.length);
  const borne = (k) => Math.min(k, nScenes);
  const relever = async (p, t) => {
    if (surScene) {
      const id = scenesVisibles(minutage, t)[0];
      if (id && !vues.has(id)) { vues.add(id); try { surScene(borne(vues.size), nScenes, id); } catch { /* suivi facultatif */ } }
    }
    await p.evaluer(`M.rendre(${Number(t)}), true`);
    const r = await p.envoyer('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: false,
      clip: { x: info.x, y: info.y, width: info.l, height: info.h, scale: echelle } });
    const image = decoderPNG(Buffer.from(r.data, 'base64'));
    // La même capture sert aux flashs (cases) et aux images figées et vides (vignette en gris) : aucune capture de plus.
    return { cases: casesImage(image.pixel, image.largeur, image.hauteur, S.flashCases), gris: vignetteGrise(image.pixel, image.largeur, image.hauteur) };
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
    return await mesurerFlashs({ duree: info.duree, ips: info.ips, seuils: SEUILS, plages: plagesFlashs || null, sceneA: (t) => scenesVisibles(minutage, t)[0] || null, releverTous,
      images: { duree: info.duree, scenes: info.scenes } });
  } finally {
    await page.evaluer(`(function () { var st = document.getElementById('pm-flashs-sans-sous-titres'); if (st) st.remove(); M.rendre(${Number(info.depart) || 0}); return true; })()`);
  }
}

/** Paires d'images voisines relevées pour la médiane des écarts de la jointure d'une boucle (5.18, point 4). */
const PAIRES_BOUCLE = 24;

/**
 * Jointure d'une vidéo en boucle (spec Rendu et export, 5.18) : vignettes grises de 192 px des images 0, 1, N − 2, N − 1 et de
 * paires d'images voisines réparties sur la vidéo (médiane des écarts), relevées par la page du contrôle ; alertes
 * boucle-jointure (saut, vitesse, arrêt), rangées sur la dernière scène. -> [problèmes]
 */
async function jointureParCDP(page) {
  const B = require('./boucle.js');
  const info = await page.evaluer(PREPARER_FLASHS);
  try {
    const ips = info.ips || 30;
    const total = Math.max(2, Math.round(info.duree * ips));
    const echelle = B.LARGEUR / Math.max(1, info.l);
    const vignette = async (n) => {
      await page.evaluer(`M.rendre(${Number(Math.min(n, total - 1) / ips)}), true`);
      const r = await page.envoyer('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: false,
        clip: { x: info.x, y: info.y, width: info.l, height: info.h, scale: echelle } });
      const image = decoderPNG(Buffer.from(r.data, 'base64'));
      return vignetteGrise(image.pixel, image.largeur, image.hauteur);
    };
    const paires = [];
    for (let j = 0; j < PAIRES_BOUCLE; j++) {
      const n = Math.floor(((j + 0.5) * (total - 1)) / PAIRES_BOUCLE);
      paires.push([await vignette(n), await vignette(n + 1)]);
    }
    const [premiere, deuxieme, avantDerniere, derniere] = [await vignette(0), await vignette(1), await vignette(total - 2), await vignette(total - 1)];
    const derniereScene = info.scenes.length ? info.scenes[info.scenes.length - 1].id : null;
    return B.problemesJointure(B.jointure({ premiere, deuxieme, avantDerniere, derniere, paires }), derniereScene);
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
 * les mesures de la page principale. genre : celui du déroulé (accroche et première image des réseaux). ecoute : { humeurs }
 * pour mesurer aussi le son (résultat dans son ; null : non mesuré).
 */
async function controlerRendu({ html, ratio, duree, navigateur = trouverNavigateur(), scenes = null, plages = null, plagesFlashs = null, ouvrir, genre = null, ecoute = null, plateforme = null, surScene = null, boucle = false }) {
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
      const resultat = await page.evaluer(`(async function () {${scriptMesures({ ratio, scenes, plages, flashs: false, genre, ecoute, plateforme })}\n})()`);
      const pagesAide = (await aides).filter(Boolean).map((a) => a.page);
      resultat.constats = resultat.constats.concat(await flashsParCDP(page, { plagesFlashs, aides: pagesAide, surScene }));
      // Son : rendu pendant les mesures et les flashs, attendu seulement maintenant.
      if (ecoute) resultat.ecoute = await page.evaluer('window.__pmEcoute');
      erreur = await erreurPage();
      if (erreur !== null) return impossible(erreur);
      const traduit = traduireResultat(resultat, scenes);
      // Boucle parfaite (5.18) : jointure mesurée sur la même page.
      if (boucle) traduit.problemes = [...traduit.problemes, ...(await jointureParCDP(page))];
      return { ...traduit, voie: 'cdp' };
    } catch (e) {
      return impossible(e.message);
    } finally {
      await Promise.all([controle.fermer(), aides.then((liste) => Promise.all(liste.filter(Boolean).map((a) => a.fermer())))]);
    }
  }
  // Repli : la page renvoie son résultat par POST, les flashs sont mesurés dans la page (captures foreignObject).
  const r = await mesurerPage({ html, navigateur, delai, script: scriptMesures({ ratio, scenes, plages, plagesFlashs, flashs: true, genre, ecoute, attendreEcoute: true, plateforme }) });
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

module.exports = { traduireConstats, traduireFormesVides, traduirePhotos, controlerRendu, flashsParCDP, jointureParCDP };
