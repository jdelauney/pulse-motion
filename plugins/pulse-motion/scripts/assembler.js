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
const { lireDeroule, dureeTemps } = require('./lib/deroule.js');
const { embarquerRessources, versDataURI, cheminDansProjet } = require('./lib/embarquer.js');
const S = require('./lib/scenes.js');
const { preparerEffets } = require('./lib/effets.js');
const { variablesCSS } = require('../moteur/courbes.js');
const { trouverStyle, messageStyleInconnu } = require('./styles.js');
const { charteFinale, chartePour, variablesDerivees } = require('./lib/fusion-charte.js');
const { lireVoixScene } = require('./lib/voix.js');
const { DEBUT_VOIX, calculerMinutage } = require('../moteur/minutage.js');
const ST = require('../moteur/sous-titres.js');
const { trouverFichiersPolice } = require('./lib/police.js');

const RACINE = path.resolve(__dirname, '..');
const MOTEUR = ['courbes.js', 'aligner.js', 'sous-titres.js', 'minutage.js', 'transitions.js', 'tween.js', 'lettres.js', 'camera.js', 'temps.js', 'horloge.js', 'tailles.js', 'wav.js', 'sonie.js', 'mixage.js', 'audio.js', 'lecteur.js', 'sous-titres-rendu.js', 'debordement.js', 'mesures.js', 'pixels.js',
  'particules/instantanes.js', 'particules/gpu.js', 'particules/simulation.js', 'particules/rendu.js', 'particules/calques.js'];
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

function jsonDansHTML(objet) {
  return JSON.stringify(objet).replace(/</g, '\\u003c');
}

/**
 * assembler({ dossier, dossierStyles?: string | string[], dossierEffets?, ecrire? })
 * -> { ok, fichier, html, erreurs: [{ regle, gravite, scene?, message }], effets: [{ scene, ordre, calque, ancre, effet }], donnees (pm-donnees) }
 * Sans dossierStyles : styles livrés, puis styles personnels (~/.pulse-motion/styles).
 */
function assembler({ dossier, dossierStyles, dossierEffets = path.join(RACINE, 'effets'), ecrire = true }) {
  const projet = path.resolve(dossier);
  const { deroule, erreurs: erreursDeroule } = lireDeroule(projet);
  if (erreursDeroule.length) {
    return { ok: false, fichier: null, html: null, effets: [], donnees: null, erreurs: erreursDeroule.map((message) => ({ regle: 'deroule-invalide', gravite: 'erreur', message })) };
  }
  const style = trouverStyle(deroule.style, dossierStyles);
  if (!style) {
    return { ok: false, fichier: null, html: null, effets: [], donnees: null, erreurs: [{ regle: 'style-inconnu', gravite: 'erreur', message: messageStyleInconnu(deroule.style, dossierStyles) }] };
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
  const effets = [];
  for (const scene of deroule.scenes) {
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
    const { html: avecEffets, effets: effetsScene, erreurs: erreursEffets } = preparerEffets(avecTextes, {
      scene: scene.id, projet, bibliotheque: dossierEffets, charte: charte.couleurs, premierIndex: effets.length, dureeTemps: dureeTemps(deroule),
    });
    effets.push(...effetsScene);
    erreurs.push(...erreursEffets);
    const { html: embarque, erreurs: erreursRes } = embarquerRessources(S.injecterLogo(avecEffets, uriLogo), projet, `scène « ${scene.id} »`);
    erreursRes.forEach((e) => erreurs.push({ ...e, scene: scene.id }));
    sections.push(embarque.trim());
    scripts.forEach((code) => scriptsScenes.push(`(function () { try {\n${code}\n} catch (e) { console.error('[Pulse Motion] Scène « ${scene.id} » : ' + e.message); } })();`));
  }

  const { html: cssStyle, erreurs: erreursStyle } = embarquerRessources(fs.readFileSync(path.join(dossierStyle, 'style.css'), 'utf8'), dossierStyle, `style « ${deroule.style} »`);
  erreurs.push(...erreursStyle);

  // Sources sonores : un bloc texte par source (URL data:), lu et décodé par moteur/audio.js.
  const sons = [];
  const blocSon = (id, uri) => `<script type="text/plain" id="${id}">${uri}</script>`;
  let sourceMusique = null;
  if (deroule.musique) {
    const uri = embarquerFichier(projet, deroule.musique.fichier, 'Musique', erreurs);
    if (uri) { sourceMusique = 'pm-son-musique'; sons.push(blocSon(sourceMusique, uri)); }
  }

  // Voix : une prise par scène (ou la voix provisoire), mots calés ; Opus si encodé, sinon WAV.
  const voixScenes = {};
  let calageApproche = false;
  for (const scene of deroule.scenes) {
    const v = lireVoixScene(projet, deroule, scene);
    if (!v) continue;
    if (v.erreur) { erreurs.push({ regle: 'voix-illisible', gravite: 'erreur', scene: scene.id, message: v.erreur }); continue; }
    erreurs.push(...v.alertes);
    const uri = embarquerFichier(projet, v.opus || v.prise.relatif, `Voix de la scène « ${scene.id} »`, erreurs);
    if (!uri) continue;
    const id = `pm-son-voix-${scene.id}`;
    sons.push(blocSon(id, uri));
    voixScenes[scene.id] = { source: id, debut: scene.voix.debut ?? DEBUT_VOIX, duree: v.duree, mots: v.mots, ...(v.prise.provisoire ? { provisoire: true } : {}) };
    if (v.approche !== 'whisper') calageApproche = true;
    if (v.prise.provisoire) {
      erreurs.push({ regle: 'voix-provisoire', gravite: 'alerte', scene: scene.id,
        message: `Scène « ${scene.id} » : c'est encore la voix provisoire du système ; enregistrez la vôtre avant d'exporter.` });
    }
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

  const [l, h] = deroule.format.ratio.split(':');
  const donnees = {
    titre: deroule.titre,
    format: { ratio: deroule.format.ratio, ips: deroule.format.ips || 30 },
    musique: deroule.musique ? { volume: deroule.musique.volume ?? 1, source: sourceMusique } : null,
    voix: Object.keys(voixScenes).length ? { volume: deroule.voix && typeof deroule.voix.volume === 'number' ? deroule.voix.volume : 1 } : null,
    tempo: deroule.tempo ? { bpm: deroule.tempo.bpm, decalage: deroule.tempo.decalage || 0 } : null,
    scenes: deroule.scenes.map((s) => ({ id: s.id, duree: s.duree, rythme: s.rythme || 1, transition: s.transition || 'aucune', ...(voixScenes[s.id] ? { voix: voixScenes[s.id] } : {}) })),
    effets: effets.map(({ calque, ancre, effet }) => ({ calque, ancre, effet })),
  };

  // Sous-titres : cartons en temps absolus (minutage des scènes avec leurs voix), fichiers SRT et VTT.
  let cartons = [];
  if (deroule.sousTitres && deroule.scenes.some((s) => s.voix && s.voix.texte)) {
    const min = calculerMinutage(donnees.scenes, {}, { dureeTemps: dureeTemps(deroule) });
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

  const temps = dureeTemps(deroule);
  const page = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Pulse Motion">
<title>${S.echapperHTML(deroule.titre)}</title>
<style>
:root { --pm-ratio-l: ${l}; --pm-ratio-h: ${h};${temps ? ` --pm-temps: ${temps}s; --pm-bpm: ${deroule.tempo.bpm};` : ''} }
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
M.demarrerLecteur();
M.demarrerSousTitres();
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
    // Sous-titres pour les plateformes (sous-titres activables) ; retirés quand il n'y en a plus.
    const base = path.join(dossierSortie, slug(deroule.titre));
    if (cartons.length) {
      fs.writeFileSync(`${base}.srt`, ST.versSRT(cartons));
      fs.writeFileSync(`${base}.vtt`, ST.versVTT(cartons));
    } else {
      fs.rmSync(`${base}.srt`, { force: true });
      fs.rmSync(`${base}.vtt`, { force: true });
    }
    // Le rapport de débordement portait sur l'ancienne page : l'aperçu en renverra un pour la nouvelle.
    fs.rmSync(path.join(dossierSortie, 'controle-page.json'), { force: true });
  }
  return { ok: true, fichier: sortie, html: page, erreurs, effets, donnees };
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

module.exports = { assembler, slug, chartePour, charteFinale, RACINE };
