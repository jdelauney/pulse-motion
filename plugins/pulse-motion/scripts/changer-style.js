#!/usr/bin/env node
'use strict';
/* Pulse Motion – changer le style d'une vidéo sans toucher au déroulé ni aux textes.
 *
 *   node scripts/changer-style.js <dossier-du-projet> <style>
 *
 * Sauvegarde dans l'historique (« annule » revient au style d'avant), recopie les scènes toutes
 * faites du nouveau style (scènes qui ont un « type »), liste les scènes composées librement.
 * Affiche { ok, style, recopiees, aReecrire } ; code 1 avec { ok: false, message } en cas d'échec.
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireDeroule } = require('./lib/deroule.js');
const { cheminDansProjet } = require('./lib/embarquer.js');
const { adapterScene, lireNombre } = require('./lib/adapter.js');
const { trouverStyle, messageStyleInconnu, verifierStyle } = require('./styles.js');
const { sauvegarder } = require('./historique.js');

function changerStyle({ dossier, style, dossierStyles }) {
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (erreurs.length) return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  const st = trouverStyle(style, dossierStyles);
  if (!st) return { ok: false, message: messageStyleInconnu(style, dossierStyles) };
  if (st.personnel && !verifierStyle(st.dossier).ok) {
    return { ok: false, message: `Le style personnel « ${style} » ne passe pas la vérification : lancez « pulse-motion styles verifier ${style} » pour voir quoi corriger.` };
  }
  if (style === deroule.style) return { ok: true, style, recopiees: [], aReecrire: [], inchange: true };

  // Tout lire et tout vérifier avant d'écrire quoi que ce soit.
  const plan = [];
  const dossierScenes = path.join(projet, 'scenes');
  const proprietaires = new Map();
  for (const [i, s] of deroule.scenes.entries()) {
    const fichier = cheminDansProjet(projet, s.fichier);
    if (!fichier) return { ok: false, message: `La scène « ${s.id} » : le fichier « ${s.fichier} » sort du dossier du projet.` };
    // Seules les pages des scènes sont réécrites (jamais le déroulé, l'historique ni la sortie) :
    // c'est aussi ce que « annule » sait restaurer.
    if (!fichier.startsWith(dossierScenes + path.sep) || !/\.html$/i.test(fichier)) {
      return { ok: false, message: `La scène « ${s.id} » : le fichier « ${s.fichier} » doit être une page .html du dossier scenes/.` };
    }
    const cle = fichier.toLowerCase();
    if (proprietaires.has(cle)) {
      return { ok: false, message: `La scène « ${s.id} » : le fichier « ${s.fichier} » est déjà utilisé par la scène « ${proprietaires.get(cle)} ».` };
    }
    proprietaires.set(cle, s.id);
    if (!s.type) continue;
    let modele;
    try { modele = fs.readFileSync(path.join(st.dossier, 'scenes', `${s.type}.html`), 'utf8'); } catch {
      return { ok: false, message: `Le style « ${style} » n'a pas de scène toute faite « ${s.type} ».` };
    }
    let ancien = '';
    try { ancien = fs.readFileSync(fichier, 'utf8'); } catch { /* scène pas encore écrite */ }
    plan.push({ s, fichier, modele, ancien, derniere: i === deroule.scenes.length - 1 });
  }

  sauvegarder(projet);
  const logo = Boolean(deroule.charte && deroule.charte.logo);
  for (const { s, fichier, modele, ancien, derniere } of plan) {
    const html = adapterScene(modele, { type: s.type, id: s.id, duree: s.duree, textes: s.textes, derniere, logo, nombre: lireNombre(ancien) });
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    fs.writeFileSync(fichier, html);
  }
  const brut = JSON.parse(fs.readFileSync(path.join(projet, 'deroule.json'), 'utf8').replace(/^﻿/, ''));
  brut.style = style;
  fs.writeFileSync(path.join(projet, 'deroule.json'), JSON.stringify(brut, null, 2));
  return {
    ok: true,
    style,
    recopiees: plan.map((p) => p.s.id),
    aReecrire: deroule.scenes.filter((s) => !s.type).map((s) => s.id),
  };
}

if (require.main === module) {
  const [dossier, style] = process.argv.slice(2);
  if (!dossier || !style) {
    console.error('Usage : node scripts/changer-style.js <dossier-du-projet> <style>');
    process.exit(2);
  }
  let r;
  try { r = changerStyle({ dossier, style }); } catch (e) {
    r = { ok: false, message: `Le changement de style a échoué (${e.message}) : « annule » remet la vidéo dans son état d'avant.` };
  }
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}

module.exports = { changerStyle };
