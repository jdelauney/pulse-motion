#!/usr/bin/env node
'use strict';
/* Pulse Motion – assemble un projet vidéo en une page HTML autonome.
 *
 *   node scripts/assembler.js <dossier-du-projet>
 *
 * Lit deroule.json et scenes/, injecte textes et charte, embarque polices, images,
 * logo et musique, inclut le moteur, écrit sortie/<titre>.html.
 * Affiche un résumé JSON { ok, fichier, erreurs } ; code de sortie 1 si la page n'a pas pu être produite.
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireDeroule } = require('./lib/deroule.js');
const { embarquerRessources, versDataURI, cheminDansProjet } = require('./lib/embarquer.js');
const S = require('./lib/scenes.js');
const { preparerEffets } = require('./lib/effets.js');
const { variablesCSS } = require('../moteur/courbes.js');

const RACINE = path.resolve(__dirname, '..');
const MOTEUR = ['courbes.js', 'minutage.js', 'transitions.js', 'tween.js', 'horloge.js', 'lecteur.js', 'debordement.js',
  'particules/instantanes.js', 'particules/gpu.js', 'particules/simulation.js', 'particules/rendu.js', 'particules/calques.js'];
const CHARTE_DEFAUT = {
  couleurs: { primaire: '#0a6cff', accent: '#b45309', fond: '#ffffff', texte: '#1a1a1a' },
  polices: { titres: 'system-ui', texte: 'system-ui' },
};

function slug(texte) {
  return String(texte).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'video';
}

function lireJSON(fichier, defaut) {
  try { return JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch { return defaut; }
}

/** Fusionne la charte par défaut, celle du style et celle du déroulé. */
function chartePour(deroule, dossierStyle) {
  const duStyle = lireJSON(path.join(dossierStyle, 'charte.json'), {});
  const duDeroule = deroule.charte || {};
  return {
    couleurs: { ...CHARTE_DEFAUT.couleurs, ...duStyle.couleurs, ...duDeroule.couleurs },
    polices: { ...CHARTE_DEFAUT.polices, ...duStyle.polices, ...duDeroule.polices },
    logo: duDeroule.logo || null,
  };
}

const POLICES_SYSTEME = new Set(['system-ui', 'sans-serif', 'serif', 'monospace']);

/** Variables CSS de la charte et @font-face embarqués. -> { css, erreurs } */
function cssCharte(charte, dossierProjet, dossierStyle) {
  const erreurs = [];
  const lignes = [];
  for (const [nom, valeur] of Object.entries(charte.couleurs)) lignes.push(`  --c-${nom}: ${valeur};`);
  const faces = [];
  const dejaVues = new Set();
  for (const [role, valeur] of Object.entries(charte.polices)) {
    let famille = valeur;
    if (/\.(woff2?|ttf|otf)$/i.test(valeur)) {
      famille = path.basename(valeur).replace(/\.[^.]+$/, '');
      const absolu = cheminDansProjet(dossierProjet, valeur);
      if (absolu && fs.existsSync(absolu) && !dejaVues.has(famille)) {
        faces.push(`@font-face { font-family: '${famille}'; src: url("${versDataURI(absolu)}"); font-weight: 100 900; font-display: block; }`);
        dejaVues.add(famille);
      } else if (!absolu || !fs.existsSync(absolu)) {
        erreurs.push({ regle: 'police-non-embarquee', gravite: 'erreur', message: `Police « ${valeur} » introuvable dans le projet (charte.polices.${role}).` });
      }
    } else if (!POLICES_SYSTEME.has(famille) && !dejaVues.has(famille)) {
      const fichier = path.join(dossierStyle, 'polices', `${famille}.woff2`);
      if (fs.existsSync(fichier)) {
        faces.push(`@font-face { font-family: '${famille}'; src: url("${versDataURI(fichier)}"); font-weight: 100 900; font-display: block; }`);
        dejaVues.add(famille);
      } else {
        erreurs.push({ regle: 'police-non-embarquee', gravite: 'erreur', message: `Police « ${famille} » non fournie : ajoutez son fichier dans assets/ et indiquez-le dans charte.polices.${role}.` });
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
 * assembler({ dossier, dossierStyles?, dossierEffets?, ecrire? })
 * -> { ok, fichier, html, erreurs: [{ regle, gravite, scene?, message }], effets: [{ scene, ordre, calque, ancre, effet }] }
 */
function assembler({ dossier, dossierStyles = path.join(RACINE, 'styles'), dossierEffets = path.join(RACINE, 'effets'), ecrire = true }) {
  const projet = path.resolve(dossier);
  const { deroule, erreurs: erreursDeroule } = lireDeroule(projet);
  if (erreursDeroule.length) {
    return { ok: false, fichier: null, html: null, effets: [], erreurs: erreursDeroule.map((message) => ({ regle: 'deroule-invalide', gravite: 'erreur', message })) };
  }
  const dossierStyle = path.join(dossierStyles, deroule.style);
  if (!fs.existsSync(path.join(dossierStyle, 'style.css'))) {
    const dispo = fs.existsSync(dossierStyles) ? fs.readdirSync(dossierStyles).join(', ') : 'aucun';
    return { ok: false, fichier: null, html: null, effets: [], erreurs: [{ regle: 'style-inconnu', gravite: 'erreur', message: `Style « ${deroule.style} » introuvable. Styles disponibles : ${dispo}.` }] };
  }

  const erreurs = [];
  const charte = chartePour(deroule, dossierStyle);
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
    const { html: avecTextes, manquants } = S.injecterTextes(sansScripts, scene.textes);
    manquants.forEach((cle) => erreurs.push({ regle: 'texte-manquant', gravite: 'erreur', scene: scene.id, message: `Scène « ${scene.id} » : data-texte="${cle}" n'a pas de texte dans le déroulé.` }));
    const { html: avecEffets, effets: effetsScene, erreurs: erreursEffets } = preparerEffets(avecTextes, {
      scene: scene.id, projet, bibliotheque: dossierEffets, charte: charte.couleurs, premierIndex: effets.length,
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

  let audio = '';
  if (deroule.musique) {
    const uri = embarquerFichier(projet, deroule.musique.fichier, 'Musique', erreurs);
    if (uri) audio = `<audio id="pm-musique" preload="auto" src="${uri}"></audio>`;
  }

  const [l, h] = deroule.format.ratio.split(':');
  const donnees = {
    titre: deroule.titre,
    format: { ratio: deroule.format.ratio, ips: deroule.format.ips || 30 },
    musique: deroule.musique ? { volume: deroule.musique.volume ?? 1 } : null,
    scenes: deroule.scenes.map((s) => ({ id: s.id, duree: s.duree, rythme: s.rythme || 1, transition: s.transition || 'aucune' })),
    effets: effets.map(({ calque, ancre, effet }) => ({ calque, ancre, effet })),
  };

  const page = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Pulse Motion">
<title>${S.echapperHTML(deroule.titre)}</title>
<style>
:root { --pm-ratio-l: ${l}; --pm-ratio-h: ${h}; }
${fs.readFileSync(path.join(RACINE, 'moteur', 'base.css'), 'utf8')}
${variablesCSS()}
${cssDeCharte}
${cssStyle}
</style>
</head>
<body>
<div id="pm-scene">
${sections.join('\n')}
</div>
${audio}
<script type="application/json" id="pm-donnees">${jsonDansHTML(donnees)}</script>
<script>
${lireMoteur(RACINE)}
</script>
<script>
${scriptsScenes.join('\n')}
M.demarrer();
M.demarrerLecteur();
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
    // Le rapport de débordement portait sur l'ancienne page : l'aperçu en renverra un pour la nouvelle.
    fs.rmSync(path.join(dossierSortie, 'controle-page.json'), { force: true });
  }
  return { ok: true, fichier: sortie, html: page, erreurs, effets };
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

module.exports = { assembler, slug, chartePour, RACINE };
