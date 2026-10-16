#!/usr/bin/env node
'use strict';
/* Pulse Motion – planche comparative : quelques scènes du déroulé rendues dans 1 à 3 styles, côte à côte.
 *
 *   node scripts/comparer.js <dossier-du-projet> <style1,style2,style3> [--scenes id1,id2] [--ouvrir]
 *
 * Pour chaque style, un projet temporaire reprend les scènes choisies (2 premières par défaut) avec
 * leurs textes, leurs durées, la charte et les fichiers du projet, mises dans les scènes toutes faites
 * du style ; sa planche est capturée par la voie de l'export (Chrome ou Edge sans fenêtre).
 * Écrit sortie/comparaison/comparaison.html et une image par style et par scène.
 * Affiche { ok, fichier, images, avertissements, secondes } ; code 1 avec { ok: false, message } en cas d'échec.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lireDeroule, tempoMusique } = require('./lib/deroule.js');
const { cheminDansProjet } = require('./lib/embarquer.js');
const { echapperHTML } = require('./lib/scenes.js');
const { adapterScene, choisirType, textesPour, lireNombre } = require('./lib/adapter.js');
const { trouverStyle, messageStyleInconnu, styleVerifie, ficheStyle, racinesStyles } = require('./styles.js');
const { exporterVideo, arreterProprementSurSignal } = require('./exporter.js');
const { ouvrirNavigateur } = require('./apercu.js');

/** Projet temporaire : les scènes `ids` du déroulé dans le style `st`. -> { dossier, avertissements } */
function preparerProjet(projet, deroule, st, ids, temporaires = []) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), `pm-comparer-${st.nom}-`));
  // Noté tout de suite : supprimé même si la préparation échoue ensuite.
  temporaires.push(dossier);
  fs.mkdirSync(path.join(dossier, 'scenes'));
  for (const sous of ['assets', 'charte']) {
    if (fs.existsSync(path.join(projet, sous))) fs.cpSync(path.join(projet, sous), path.join(dossier, sous), { recursive: true });
  }
  const catalogue = JSON.parse(fs.readFileSync(path.join(st.dossier, 'catalogue.json'), 'utf8'));
  const logo = Boolean(deroule.charte && deroule.charte.logo);
  const avertissements = [];
  const scenes = ids.map((id) => {
    const s = deroule.scenes.find((x) => x.id === id);
    const type = choisirType(s);
    const textes = textesPour(type, s.textes);
    const limites = (catalogue.scenes.find((c) => c.nom === type) || {}).textes || {};
    for (const [cle, max] of Object.entries(limites)) {
      if ((textes[cle] || '').length > max) avertissements.push(`Style « ${st.nom} », scène « ${id} » : le texte « ${cle} » a ${textes[cle].length} caractères, ce style en accepte ${max}.`);
    }
    let ancien = '';
    const fichierAncien = cheminDansProjet(projet, s.fichier);
    try { if (fichierAncien) ancien = fs.readFileSync(fichierAncien, 'utf8'); } catch { /* scène pas encore écrite */ }
    const modele = fs.readFileSync(path.join(st.dossier, 'scenes', `${type}.html`), 'utf8');
    const fichier = `scenes/${id}.html`;
    fs.writeFileSync(path.join(dossier, fichier), adapterScene(modele, { type, id, duree: s.duree, textes, logo, nombre: lireNombre(ancien) }));
    return { id, type, fichier, duree: s.duree, rythme: s.rythme, textes, transition: s.transition };
  });
  const copie = { ...deroule, titre: `${deroule.titre} – ${st.nom}`, style: st.nom, scenes };
  delete copie.musique;
  // Sans la musique, garder son tempo : les scènes en temps musicaux (« 4t ») restent lisibles.
  if (!copie.tempo && tempoMusique(deroule)) copie.tempo = { bpm: tempoMusique(deroule) };
  fs.writeFileSync(path.join(dossier, 'deroule.json'), JSON.stringify(copie, null, 2));
  return { dossier, avertissements };
}

function pageComparaison(titre, colonnes) {
  const entete = colonnes.map((c) => {
    const perso = c.fiche.personnalite.length ? `<br><span>${echapperHTML(c.fiche.personnalite.join(' · '))}</span>` : '';
    return `<th><strong>${echapperHTML(c.fiche.style)}</strong>${perso}</th>`;
  }).join('');
  const lignes = colonnes[0].images.map((_, i) => `<tr>${colonnes.map((c) => `<td><img src="${c.images[i].src}" alt="${echapperHTML(`${c.fiche.style} – ${c.images[i].id}`)}"></td>`).join('')}</tr>`).join('\n');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Comparaison des styles – ${echapperHTML(titre)}</title>
<style>body{margin:24px;font:15px/1.4 system-ui,sans-serif;background:#f4f4f5;color:#18181b}table{width:100%;border-collapse:separate;border-spacing:12px;table-layout:fixed}th{text-align:left;font-size:18px}th span{font-weight:400;color:#52525b;font-size:14px}img{width:100%;border-radius:6px;box-shadow:0 2px 8px rgb(0 0 0/.15)}</style>
</head><body><h1>Comparaison des styles</h1><p>${echapperHTML(titre)} : les mêmes scènes, une colonne par style.</p>
<table><tr>${entete}</tr>
${lignes}</table></body></html>
`;
}

async function comparer({
  dossier, styles, scenes: idsDemandes = null, ouvrir = false, dossierStyles, navigateur,
  exporter = exporterVideo, ouvrirFichier = ouvrirNavigateur,
}) {
  const debut = Date.now();
  const fin = (r) => ({ ...r, secondes: Math.round((Date.now() - debut) / 100) / 10 });
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return fin({ ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` });
  const noms = [...new Set(styles || [])];
  if (noms.length < 1 || noms.length > 3) return fin({ ok: false, message: 'Indiquez de 1 à 3 styles à comparer, séparés par des virgules.' });
  const trouves = [];
  for (const nom of noms) {
    const st = trouverStyle(nom, dossierStyles);
    if (!st) return fin({ ok: false, message: messageStyleInconnu(nom, dossierStyles) });
    if (!styleVerifie(st)) return fin({ ok: false, message: `Le style personnel « ${nom} » ne passe pas la vérification : lancez « pulse-motion style verifier ${nom} ».` });
    trouves.push(st);
  }
  const ids = idsDemandes && idsDemandes.length ? idsDemandes : deroule.scenes.slice(0, 2).map((s) => s.id);
  const inconnues = ids.filter((id) => !deroule.scenes.some((s) => s.id === id));
  if (inconnues.length) return fin({ ok: false, message: `Scène inconnue : ${inconnues.join(', ')}.` });

  const sortie = path.join(projet, 'sortie', 'comparaison');
  fs.rmSync(sortie, { recursive: true, force: true });
  fs.mkdirSync(sortie, { recursive: true });
  const avertissements = [];
  const colonnes = [];
  const temporaires = [];
  const echec = (st, message) => {
    // Pas de comparaison à moitié faite dans sortie/.
    fs.rmSync(sortie, { recursive: true, force: true });
    return fin({ ok: false, message: `Style « ${st.nom} » : ${message}` });
  };
  try {
    for (const st of trouves) {
      let r;
      let prepare;
      try {
        prepare = preparerProjet(projet, deroule, st, ids, temporaires);
        avertissements.push(...prepare.avertissements);
        r = await exporter({ dossier: prepare.dossier, planche: ids, dossierStyles: racinesStyles(dossierStyles), navigateur });
      } catch (e) {
        return echec(st, e.message);
      }
      if (!r.ok) return echec(st, r.message);
      const images = ids.map((id) => {
        const src = `${st.nom}-${id}.png`;
        fs.copyFileSync(path.join(prepare.dossier, 'sortie', 'planche', `${id}-3.png`), path.join(sortie, src));
        return { id, src };
      });
      colonnes.push({ fiche: ficheStyle(st), images });
    }
  } finally {
    for (const t of temporaires) fs.rmSync(t, { recursive: true, force: true });
  }
  fs.writeFileSync(path.join(sortie, 'comparaison.html'), pageComparaison(deroule.titre, colonnes));
  const fichier = 'sortie/comparaison/comparaison.html';
  if (ouvrir) ouvrirFichier(path.join(projet, fichier));
  return fin({ ok: true, fichier, images: colonnes.flatMap((c) => c.images.map((i) => `sortie/comparaison/${i.src}`)), avertissements });
}

if (require.main === module) {
  // Interruption (la commande tourne en arrière-plan) : fermer le navigateur sans fenêtre et l'aperçu lancés.
  arreterProprementSurSignal();
  const args = process.argv.slice(2);
  const i = args.indexOf('--scenes');
  const positionnels = args.filter((a, k) => !a.startsWith('--') && args[k - 1] !== '--scenes');
  const [dossier = '.', liste = ''] = positionnels;
  comparer({
    dossier,
    styles: liste.split(',').filter(Boolean),
    scenes: i >= 0 && args[i + 1] ? args[i + 1].split(',').filter(Boolean) : null,
    ouvrir: args.includes('--ouvrir'),
  }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }, (e) => {
    console.log(JSON.stringify({ ok: false, message: e.message }, null, 2));
    process.exit(1);
  });
}

module.exports = { comparer, preparerProjet, pageComparaison };
