#!/usr/bin/env node
'use strict';
/* Pulse Motion – assemble un projet vidéo en une page HTML autonome.
 *
 *   node scripts/assembler.js <dossier-du-projet>
 *
 * Lit deroule.json et scenes/, injecte textes et charte, embarque polices, images,
 * logo et sources sonores, inclut le moteur, écrit sortie/<titre>.html.
 * Affiche un résumé JSON { ok, fichier, erreurs } ; code de sortie 1 si la page n'a pas pu être produite.
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireDeroule, dureeTemps, tempoMusique, grilleFixe, optionsMinutage } = require('./lib/deroule.js');
const { embarquerRessources, versDataURI, cheminDansProjet } = require('./lib/embarquer.js');
const S = require('./lib/scenes.js');
const { preparerEffets } = require('./lib/effets.js');
const { preparerPersonnages, donneesPersonnages } = require('./lib/personnages-scene.js');
const Pers = require('./lib/personnages.js');
const { preparerObstacles, obstaclesVideo } = require('./lib/obstacles.js');
const { preparerMilieux } = require('./lib/milieux.js');
const { chargeurShaders, preparerShaders, shadersDuDeroule, BIBLIOTHEQUE: BIBLIOTHEQUE_SHADERS } = require('./lib/shaders.js');
const { besoinsSon } = require('./lib/son.js');
const { variablesCSS } = require('../moteur/courbes.js');
const { trouverStyle, messageStyleInconnu } = require('./styles.js');
const { charteFinale, chartePour, variablesDerivees } = require('./lib/fusion-charte.js');
const { lireVoixScene } = require('./lib/voix.js');
const { DEBUT_VOIX, calculerMinutage, DUREE_TRANSITION_SHADER } = require('../moteur/minutage.js');
const ST = require('../moteur/sous-titres.js');
const SP = require('../moteur/synthe/partition.js');
const SA = require('../moteur/synthe/ambiances.js');
const { trouverFichiersPolice } = require('./lib/police.js');

const RACINE = path.resolve(__dirname, '..');
const MOTEUR = ['courbes.js', 'aligner.js', 'sous-titres.js', 'minutage.js', 'transitions.js', 'tween.js', 'lettres.js', 'camera.js', 'squelette.js', 'clips.js', 'habillage-batonnets.js', 'habillage-pieces.js', 'personnages/levres.js', 'personnages/partition.js', 'personnages/interactions.js', 'personnages/scene.js', 'personnages/objets.js', 'temps.js', 'horloge.js', 'tailles.js', 'wav.js', 'sonie.js', 'mixage.js', 'synthe/catalogue.js', 'synthe/partition.js', 'synthe/ambiances.js', 'synthe/instruments.js', 'synthe/bruitages.js', 'analyse-son.js', 'audio.js', 'son-reactif.js', 'lecteur.js', 'sous-titres-rendu.js', 'debordement.js', 'mesures.js', 'pixels.js',
  'figer.js', 'shaders/glsl.js', 'shaders/code.js', 'particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js', 'particules/fragments.js', 'particules/simulation.js', 'particules/voisinage.js', 'particules/maillage.js', 'particules/structures.js', 'particules/milieu.js', 'particules/rendu.js', 'particules/glsl.js', 'particules/shaders.js', 'particules/composition.js', 'particules/formes.js', 'particules/reperes.js', 'particules/calques.js'];
function slug(texte) {
  return String(texte).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'video';
}

const POLICES_SYSTEME = new Set(['system-ui', 'sans-serif', 'serif', 'monospace']);

/** Variables CSS de la charte (et dérivées) et @font-face embarqués. -> { css, erreurs } */
function cssCharte(charte, dossierProjet, dossierStyle) {
  const erreurs = [];
  const lignes = Object.entries(charte.couleurs).map(([nom, valeur]) => `  --c-${nom}: ${valeur};`);
  lignes.push(...variablesDerivees(charte.couleurs));
  const faces = [];
  const dejaVues = new Set();
  const face = (famille, fichier, graisse, italique = false) => {
    try {
      faces.push(`@font-face { font-family: '${famille}'; src: url("${versDataURI(fichier)}"); font-weight: ${graisse || '100 900'};${italique ? ' font-style: italic;' : ''} font-display: block; }`);
    } catch (e) {
      erreurs.push({ regle: 'police-non-embarquee', gravite: 'erreur', message: `Police « ${famille} » : fichier « ${path.basename(fichier)} » illisible (${e.code || e.message}).` });
    }
  };
  for (const [role, valeur] of Object.entries(charte.polices)) {
    let famille;
    if (valeur && typeof valeur === 'object') {
      famille = valeur.famille;
      const absolu = cheminDansProjet(dossierProjet, valeur.fichier);
      if (!absolu || !fs.existsSync(absolu)) erreurs.push({ regle: 'police-non-embarquee', gravite: 'erreur', message: `Police « ${famille} » : fichier « ${valeur.fichier} » introuvable (charte.polices.${role}).` });
      else if (!dejaVues.has(famille)) { face(famille, absolu); dejaVues.add(famille); }
    } else if (/\.(woff2?|ttf|otf)$/i.test(valeur)) {
      famille = path.basename(valeur).replace(/\.[^.]+$/, '');
      const absolu = cheminDansProjet(dossierProjet, valeur);
      if (!absolu || !fs.existsSync(absolu)) erreurs.push({ regle: 'police-non-embarquee', gravite: 'erreur', message: `Police « ${valeur} » introuvable dans le projet (charte.polices.${role}).` });
      else if (!dejaVues.has(famille)) { face(famille, absolu); dejaVues.add(famille); }
    } else {
      famille = valeur;
      if (!POLICES_SYSTEME.has(famille) && !dejaVues.has(famille)) {
        const fichiers = trouverFichiersPolice(famille, [path.join(dossierProjet, 'charte', 'polices'), path.join(dossierStyle, 'polices')]);
        if (fichiers.length) { fichiers.forEach((f) => face(famille, f.fichier, f.graisse, f.italique)); dejaVues.add(famille); }
        else erreurs.push({ regle: 'police-non-embarquee', gravite: 'erreur', message: `Police « ${famille} » non fournie : récupérez-la avec « pulse-motion police "${famille}" », ou ajoutez son fichier dans charte/polices/ (charte.polices.${role}).` });
      }
    }
    lignes.push(`  --f-${role}: '${famille}', system-ui, sans-serif;`);
  }
  return { css: `${faces.join('\n')}\n:root {\n${lignes.join('\n')}\n}\n`, erreurs };
}

/** Fichier du projet -> URL data:, ou null avec une erreur nommée (introuvable, type, lecture). */
function embarquerFichier(projet, relatif, quoi, erreurs) {
  const absolu = cheminDansProjet(projet, relatif);
  if (!absolu || !fs.existsSync(absolu)) {
    erreurs.push({ regle: 'fichier-introuvable', gravite: 'erreur', message: `${quoi} introuvable : « ${relatif} ».` });
    return null;
  }
  try { return versDataURI(absolu); } catch (e) {
    erreurs.push({ regle: 'fichier-non-pris-en-charge', gravite: 'erreur', message: `${quoi} « ${relatif} » : ${e.code ? `lecture impossible (${e.code})` : e.message}.` });
    return null;
  }
}

function lireMoteur(racine) {
  return MOTEUR.map((f) => fs.readFileSync(path.join(racine, 'moteur', f), 'utf8')).join('\n;\n');
}

/** Sous-titres pour les plateformes (sous-titres activables) : sortie/<titre>.srt et .vtt ; retirés quand il n'y en a plus. */
function ecrireSousTitres(dossierSortie, titre, cartons) {
  const base = path.join(dossierSortie, slug(titre));
  if (cartons && cartons.length) {
    fs.mkdirSync(dossierSortie, { recursive: true });
    fs.writeFileSync(`${base}.srt`, ST.versSRT(cartons));
    fs.writeFileSync(`${base}.vtt`, ST.versVTT(cartons));
  } else {
    fs.rmSync(`${base}.srt`, { force: true });
    fs.rmSync(`${base}.vtt`, { force: true });
  }
}

function jsonDansHTML(objet) {
  return JSON.stringify(objet).replace(/</g, '\\u003c');
}

/**
 * assembler({ dossier, dossierStyles?: string | string[], dossierEffets?, dossierShaders?, ecrire? })
 * -> { ok, fichier, html, erreurs: [{ regle, gravite, scene?, message }], effets: [{ scene, ordre, calque, ancre, effet }], milieux: [{ scene, calque, ancre, sansDuree, effet }], shaders, donnees (pm-donnees) }
 * Sans dossierStyles : styles livrés, puis styles personnels (~/.pulse-motion/styles). dossierShaders : bibliothèque des
 * shaders (plugins/pulse-motion/shaders par défaut), après shaders/ du projet.
 */
function assembler({ dossier, dossierStyles, dossierEffets = path.join(RACINE, 'effets'), dossierShaders = BIBLIOTHEQUE_SHADERS, ecrire = true }) {
  const projet = path.resolve(dossier);
  const { deroule, erreurs: erreursDeroule } = lireDeroule(projet);
  if (erreursDeroule.length) {
    return { ok: false, fichier: null, html: null, effets: [], milieux: [], shaders: [], donnees: null, erreurs: erreursDeroule.map((message) => ({ regle: 'deroule-invalide', gravite: 'erreur', message })) };
  }
  const style = trouverStyle(deroule.style, dossierStyles);
  if (!style) {
    return { ok: false, fichier: null, html: null, effets: [], milieux: [], shaders: [], donnees: null, erreurs: [{ regle: 'style-inconnu', gravite: 'erreur', message: messageStyleInconnu(deroule.style, dossierStyles) }] };
  }
  const dossierStyle = style.dossier;

  const erreurs = [];
  const charte = charteFinale(deroule, dossierStyle, projet);
  charte.erreurs.forEach((message) => erreurs.push({ regle: 'charte-invalide', gravite: 'erreur', message }));
  const { css: cssDeCharte, erreurs: erreursPolices } = cssCharte(charte, projet, dossierStyle);
  erreurs.push(...erreursPolices);

  let uriLogo = null;
  if (charte.logo) uriLogo = embarquerFichier(projet, charte.logo, 'Logo', erreurs);

  const sections = [];
  const scriptsScenes = [];
  // Sources sonores : un bloc texte par source (URL data:), lu et décodé par moteur/audio.js.
  const sons = [];
  const blocSon = (id, uri) => `<script type="text/plain" id="${id}">${uri}</script>`;
  let fichiersSons = 0;
  const sonsEmbarques = new Map();   // chemin du son -> id du bloc
  const effets = [];
  const milieux = [];
  const obstacles = [];
  const shaders = [];
  const chargerShader = chargeurShaders(projet, dossierShaders);
  const sourcesModules = {};
  let luPersonnages = null;
  const utilisesPersonnages = { dessins: new Set(), gabarits: new Set() };
  const scenesQuiParlent = new Set();
  // Voix : une prise par scène (ou la voix provisoire), mots calés ; Opus si encodé, sinon WAV. Lues avant les scènes : la
  // durée d'une scène allongée par sa voix sert aux effets faits de structures sans data-dur (jusqu'à la fin de la scène).
  const voixScenes = {};
  const sonsVoix = [];
  const erreursVoix = [];
  let calageApproche = false;
  for (const scene of deroule.scenes) {
    const v = lireVoixScene(projet, deroule, scene);
    if (!v) continue;
    if (v.erreur) { erreursVoix.push({ regle: 'voix-illisible', gravite: 'erreur', scene: scene.id, message: v.erreur }); continue; }
    erreursVoix.push(...v.alertes);
    const uri = embarquerFichier(projet, v.opus || v.prise.relatif, `Voix de la scène « ${scene.id} »`, erreursVoix);
    if (!uri) continue;
    const id = `pm-son-voix-${scene.id}`;
    sonsVoix.push(blocSon(id, uri));
    voixScenes[scene.id] = { source: id, debut: scene.voix.debut ?? DEBUT_VOIX, duree: v.duree, mots: v.mots, ...(v.prise.provisoire ? { provisoire: true } : {}) };
    if (v.approche !== 'whisper') calageApproche = true;
    if (v.prise.provisoire) {
      erreursVoix.push({ regle: 'voix-provisoire', gravite: 'alerte', scene: scene.id,
        message: `Scène « ${scene.id} » : c'est encore la voix provisoire du système ; enregistrez la vôtre avant d'exporter.` });
    }
  }
  const scenesDonnees = deroule.scenes.map((s) => ({ id: s.id, duree: s.duree, rythme: s.rythme || 1,
    transition: s.transition && typeof s.transition === 'object' ? { shader: s.transition.shader, duree: s.transition.duree > 0 ? s.transition.duree : DUREE_TRANSITION_SHADER } : (s.transition || 'aucune'),
    ...(voixScenes[s.id] ? { voix: voixScenes[s.id] } : {}) }));
  const minutageScenes = calculerMinutage(scenesDonnees, {}, optionsMinutage(deroule));

  // Son réactif (P7) : texte de chaque scène, cherché ensuite pour les variables CSS du son.
  const textesScenes = [];
  for (const [rang, scene] of deroule.scenes.entries()) {
    const fichier = cheminDansProjet(projet, scene.fichier);
    let html = null;
    let probleme = null;
    if (!fichier) probleme = `le fichier « ${scene.fichier} » sort du dossier du projet.`;
    else if (!fs.existsSync(fichier)) probleme = `fichier introuvable : « ${scene.fichier} ».`;
    else {
      try {
        html = fs.readFileSync(fichier, 'utf8').replace(/^\uFEFF/, '');
        probleme = S.verifierSection(html, scene.id);
      } catch (e) {
        probleme = `lecture impossible de \u00AB ${scene.fichier} \u00BB (${e.code || e.message}).`;
      }
    }
    if (probleme) {
      erreurs.push({ regle: 'scene-invalide', gravite: 'erreur', scene: scene.id, message: `Scène « ${scene.id} » : ${probleme}` });
      sections.push(S.panneauErreur(scene.id, probleme));
      continue;
    }
    const { html: sansScripts, scripts } = S.extraireScripts(html);
    const { html: avecTextes, manquants } = S.injecterTextes(sansScripts, scene.textes, scene.ajustements);
    manquants.forEach((cle) => erreurs.push({ regle: 'texte-manquant', gravite: 'erreur', scene: scene.id, message: `Scène « ${scene.id} » : data-texte="${cle}" n'a pas de texte dans le déroulé.` }));
    // Milieu fluide (P5c) : un par scène, préparé avant les effets (qui peuvent s'y coupler).
    const { html: avecMilieux, milieux: milieuxScene, erreurs: erreursMilieux } = preparerMilieux(avecTextes, {
      scene: scene.id, projet, bibliotheque: dossierEffets, charte: charte.couleurs, premierIndex: milieux.length, dureeTemps: dureeTemps(deroule),
    });
    milieux.push(...milieuxScene);
    erreurs.push(...erreursMilieux);
    const { html: avecEffets, effets: effetsScene, erreurs: erreursEffets, modules: modulesScene } = preparerEffets(avecMilieux, {
      scene: scene.id, projet, bibliotheque: dossierEffets, charte: charte.couleurs, premierIndex: effets.length, dureeTemps: dureeTemps(deroule), chargerShader,
      milieu: milieuxScene.length > 0, dureeScene: minutageScenes.scenes[rang].dureeEffective,
    });
    Object.assign(sourcesModules, modulesScene);
    effets.push(...effetsScene);
    erreurs.push(...erreursEffets);
    const { html: avecShaders, shaders: shadersScene, erreurs: erreursShaders } = preparerShaders(avecEffets, {
      scene: scene.id, charger: chargerShader, charte: charte.couleurs, projet, premierIndex: shaders.length,
    });
    shaders.push(...shadersScene);
    erreurs.push(...erreursShaders);
    const { html: avecObstacles, obstacles: obstaclesScene, erreurs: erreursObstacles } = preparerObstacles(avecShaders, { scene: scene.id, premierIndex: obstacles.length });
    obstacles.push(...obstaclesScene);
    erreurs.push(...erreursObstacles);
    // Personnages : validés, durée des gestes écrite ; la bibliothèque n'est lue qu'au premier personnage rencontré.
    let avecPersonnages = avecObstacles;
    if (/data-personnage|data-action/.test(avecObstacles)) {
      if (!luPersonnages) {
        luPersonnages = Pers.lire(projet);
        luPersonnages.erreurs.forEach((e) => erreurs.push({ regle: 'personnage-invalide', gravite: 'alerte', message: e.message }));
      }
      const r = preparerPersonnages(avecObstacles, { scene: scene.id, lu: luPersonnages, voix: !!(scene.voix && scene.voix.texte) });
      avecPersonnages = r.html;
      if (r.parle) scenesQuiParlent.add(scene.id);
      r.utilises.dessins.forEach((n) => utilisesPersonnages.dessins.add(n));
      r.utilises.gabarits.forEach((n) => utilisesPersonnages.gabarits.add(n));
      erreurs.push(...r.erreurs);
    }
    // Sons importés (data-son="assets/…") : embarqués en bloc, l'attribut désigne le bloc ; un nom de bruitage reste tel quel.
    // Valeur entre guillemets doubles ou simples (une apostrophe dans un chemin entre guillemets doubles reste au chemin) ;
    // un même fichier n'est embarqué qu'une fois.
    const avecSons = avecPersonnages.replace(/(\sdata-son=)(?:"([^"]+)"|'([^']+)')/g, (tout, debut, double, simple) => {
      const valeur = double !== undefined ? double : simple;
      const guillemet = double !== undefined ? '"' : "'";
      if (!/[/.]/.test(valeur)) return tout;
      let id = sonsEmbarques.get(valeur);
      if (!id) {
        const uri = embarquerFichier(projet, valeur, `Son « ${valeur} » (scène « ${scene.id} »)`, erreurs);
        if (!uri) return tout;
        id = `pm-son-fichier-${fichiersSons++}`;
        sons.push(blocSon(id, uri));
        sonsEmbarques.set(valeur, id);
      }
      return `${debut}${guillemet}fichier:${id}${guillemet}`;
    });
    const { html: embarque, erreurs: erreursRes } = embarquerRessources(S.injecterLogo(avecSons, uriLogo), projet, `scène « ${scene.id} »`);
    erreursRes.forEach((e) => erreurs.push({ ...e, scene: scene.id }));
    sections.push(embarque.trim());
    textesScenes.push({ scene: scene.id, texte: embarque });
    scripts.forEach((code) => scriptsScenes.push(`(function () { try {\n${code}\n} catch (e) { console.error('[Pulse Motion] Scène « ${scene.id} » : ' + e.message); } })();`));
  }

  const { html: cssStyle, erreurs: erreursStyle } = embarquerRessources(fs.readFileSync(path.join(dossierStyle, 'style.css'), 'utf8'), dossierStyle, `style « ${deroule.style} »`);
  erreurs.push(...erreursStyle);

  let sourceMusique = null;
  if (deroule.musique && deroule.musique.fichier) {
    const uri = embarquerFichier(projet, deroule.musique.fichier, 'Musique', erreurs);
    if (uri) { sourceMusique = 'pm-son-musique'; sons.push(blocSon(sourceMusique, uri)); }
  }

  // Voix (lues avant les scènes) : blocs et messages rangés ici, à leur place habituelle.
  sons.push(...sonsVoix);
  erreurs.push(...erreursVoix);
  for (const id of scenesQuiParlent) {
    if (!voixScenes[id]) erreurs.push({ regle: 'personnage-invalide', gravite: 'alerte', scene: id,
      message: `Scène « ${id} » : un personnage doit parler, mais la voix n'est pas enregistrée : il restera bouche fermée (enregistrer la voix de la scène, ou « pulse-motion voix provisoire --scene ${id} »).` });
  }
  if (calageApproche) {
    erreurs.push({ regle: 'calage-approche', gravite: 'info',
      message: 'Les mots de la voix sont calés approximativement (sans transcription) : les ancres « mot: » et les sous-titres peuvent tomber un peu à côté ; « pulse-motion whisper » dit comment installer la transcription.' });
  }
  const poidsSons = sons.reduce((n, b) => n + b.length, 0);
  if (poidsSons > 20 * 1024 * 1024) {
    erreurs.push({ regle: 'page-lourde', gravite: 'alerte',
      message: `Les sons embarqués pèsent ${Math.round(poidsSons / 1024 / 1024)} Mo : la page sera lente à ouvrir ; installez ffmpeg (« pulse-motion ffmpeg ») pour les voix en Opus.` });
  }

  const video = obstaclesVideo(deroule);
  erreurs.push(...video.erreurs);
  // Transitions et post-traitements du déroulé : après les fonds (les indices data-pm-shader restent justes).
  const duDeroule = shadersDuDeroule(deroule, { charger: chargerShader, charte: charte.couleurs, projet });
  shaders.push(...duDeroule.shaders);
  erreurs.push(...duDeroule.erreurs);
  const [l, h] = deroule.format.ratio.split(':');
  const donnees = {
    titre: deroule.titre,
    format: { ratio: deroule.format.ratio, ips: deroule.format.ips || 30 },
    musique: deroule.musique ? { volume: deroule.musique.volume ?? 1, source: sourceMusique, partition: null } : null,
    voix: Object.keys(voixScenes).length ? { volume: deroule.voix && typeof deroule.voix.volume === 'number' ? deroule.voix.volume : 1 } : null,
    // Tempo du déroulé, sinon celui de la musique générée.
    tempo: dureeTemps(deroule) ? { bpm: (deroule.tempo && deroule.tempo.bpm) || tempoMusique(deroule), decalage: (deroule.tempo && deroule.tempo.decalage) || 0, ...(grilleFixe(deroule) ? { grille: true } : {}) } : null,
    bruitages: deroule.bruitages ? { transitions: deroule.bruitages.transitions === true, volume: deroule.bruitages.volume ?? 1 } : null,
    scenes: scenesDonnees,
    effets: effets.map(({ calque, ancre, cible, effet }) => ({ calque, ancre, cible, effet })),
    milieux: milieux.map(({ calque, ancre, sansDuree, effet }) => ({ calque, ancre, sansDuree, effet })),
    obstacles,
    obstaclesVideo: video.obstacles,
    shaders,
    modules: sourcesModules,
    ...(luPersonnages ? { personnages: donneesPersonnages(utilisesPersonnages, luPersonnages) } : {}),
  };

  // Son réactif (P7) : pistes lues par les effets, les shaders et le CSS ; analysées une fois dans la page.
  const besoins = besoinsSon({
    effets, shaders,
    css: [{ scene: null, texte: cssStyle }, { scene: null, texte: cssDeCharte }, ...textesScenes],
    presentes: { musique: !!deroule.musique, voix: Object.keys(voixScenes).length > 0 },
  });
  donnees.son = besoins.son;
  erreurs.push(...besoins.erreurs);

  // Sous-titres : cartons en temps absolus (minutage des scènes avec leurs voix), fichiers SRT et VTT.
  let cartons = [];
  if (deroule.sousTitres && deroule.scenes.some((s) => s.voix && s.voix.texte)) {
    const min = calculerMinutage(donnees.scenes, {}, optionsMinutage(deroule));
    const scenesST = deroule.scenes.map((s, i) => {
      const m = min.scenes[i];
      const mots = s.voix && s.voix.texte ? ST.motsDeScene({ debut: m.debut, fin: m.fin, texte: s.voix.texte, voix: voixScenes[s.id] || null }) : [];
      return { id: s.id, debut: m.debut, fin: m.fin, mots };
    }).filter((s) => s.mots.length);
    cartons = ST.cartons(scenesST, { ratio: deroule.format.ratio });
  }
  donnees.sousTitres = cartons.length ? {
    mode: deroule.sousTitres.mode || 'ligne',
    incrustes: deroule.sousTitres.incrustes !== false,
    position: deroule.sousTitres.position || null,
    cartons,
  } : null;

  // Musique générée (ambiance) ou partition libre : partition validée, jouée par le synthétiseur de la page.
  if (deroule.musique && deroule.musique.generee) {
    const min = calculerMinutage(donnees.scenes, {}, optionsMinutage(deroule));
    donnees.musique.partition = SA.generer({ ambiance: deroule.musique.generee, tempo: deroule.musique.tempo, tonalite: deroule.musique.tonalite,
      intensite: deroule.musique.intensite, graine: deroule.musique.graine, duree: min.duree,
      scenes: min.scenes.map((s, i) => ({ debut: s.debut, fin: s.fin, humeur: deroule.scenes[i].musique })) });
  } else if (deroule.musique && deroule.musique.partition) {
    const absolu = cheminDansProjet(projet, deroule.musique.partition);
    let lue = null;
    try { lue = JSON.parse(fs.readFileSync(absolu, 'utf8').replace(/^\uFEFF/, '')); } catch (e) {
      erreurs.push({ regle: 'partition-invalide', gravite: 'erreur', message: `Partition « ${deroule.musique.partition} » illisible (${e.code === 'ENOENT' || !absolu ? 'fichier introuvable dans le projet' : 'JSON invalide'}).` });
    }
    if (lue) {
      const fautes = SP.validerPartition(lue);
      if (fautes.length) erreurs.push({ regle: 'partition-invalide', gravite: 'erreur', message: `Partition « ${deroule.musique.partition} » : ${fautes.join(' ')}` });
      else {
        // Pistes calées sur une scène : leur grille part du vrai début de la scène et s'arrête au début de la suivante.
        const min = calculerMinutage(donnees.scenes, {}, optionsMinutage(deroule));
        const ids = min.scenes.map((s) => s.id);
        const inconnues = [...new Set(lue.pistes.filter((p) => p.scene !== undefined && !ids.includes(p.scene)).map((p) => p.scene))];
        if (inconnues.length) erreurs.push({ regle: 'partition-invalide', gravite: 'erreur', message: `Partition « ${deroule.musique.partition} » : scène${inconnues.length > 1 ? 's' : ''} ${inconnues.map((x) => `« ${x} »`).join(', ')} inconnue${inconnues.length > 1 ? 's' : ''} (scènes : ${ids.join(', ')}).` });
        donnees.musique.partition = { ...lue, pistes: lue.pistes.filter((p) => p.scene === undefined || ids.includes(p.scene)).map((p) => {
          if (p.scene === undefined) return p;
          const i = ids.indexOf(p.scene);
          const { scene, ...reste } = p;
          return { ...reste, origine: Math.round(min.scenes[i].debut * 1e6) / 1e6, jusqua: Math.round((i + 1 < ids.length ? min.scenes[i + 1].debut : min.duree) * 1e6) / 1e6 };
        }) };
      }
    }
  }

  const temps = dureeTemps(deroule);
  const page = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Pulse Motion">
<title>${S.echapperHTML(deroule.titre)}</title>
<style>
:root { --pm-ratio-l: ${l}; --pm-ratio-h: ${h};${temps ? ` --pm-temps: ${temps}s; --pm-bpm: ${Math.round(60 / temps * 1000) / 1000};` : ''} }
${fs.readFileSync(path.join(RACINE, 'moteur', 'base.css'), 'utf8')}
${variablesCSS()}
${cssDeCharte}
${cssStyle}
</style>
</head>
<body>
<div id="pm-scene" data-ton="${charte.ton}">
${sections.join('\n')}
</div>
${sons.join('\n')}
<script type="application/json" id="pm-donnees">${jsonDansHTML(donnees)}</script>
<script>
${lireMoteur(RACINE)}
</script>
<script>
${scriptsScenes.join('\n')}
M.demarrer();
M.demarrerPersonnages();
M.demarrerLecteur();
M.demarrerSousTitres();
M.demarrerSonReactif();
M.demarrerParticules();
</script>
</body>
</html>
`;

  let sortie = null;
  if (ecrire) {
    const dossierSortie = path.join(projet, 'sortie');
    fs.mkdirSync(dossierSortie, { recursive: true });
    sortie = path.join(dossierSortie, `${slug(deroule.titre)}.html`);
    const temporaire = `${sortie}.${process.pid}.tmp`;
    fs.writeFileSync(temporaire, page);
    fs.renameSync(temporaire, sortie);
    ecrireSousTitres(dossierSortie, deroule.titre, cartons);
    // Le rapport de débordement portait sur l'ancienne page : l'aperçu en renverra un pour la nouvelle.
    fs.rmSync(path.join(dossierSortie, 'controle-page.json'), { force: true });
  }
  return { ok: true, fichier: sortie, html: page, erreurs, effets, milieux, shaders, donnees };
}

if (require.main === module) {
  const dossier = process.argv[2];
  if (!dossier) {
    console.error('Usage : node scripts/assembler.js <dossier-du-projet>');
    process.exit(2);
  }
  const { ok, fichier, erreurs } = assembler({ dossier });
  console.log(JSON.stringify({ ok, fichier, erreurs }, null, 2));
  process.exit(ok ? 0 : 1);
}

module.exports = { assembler, slug, chartePour, charteFinale, ecrireSousTitres, lireMoteur, RACINE };
