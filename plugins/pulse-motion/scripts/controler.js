#!/usr/bin/env node
'use strict';
/* Pulse Motion – contrôles automatiques d'un projet vidéo, sans navigateur.
 *
 *   node scripts/controler.js <dossier-du-projet> [--sans-correction] [--sans-rendu]
 *
 * Contrôle aussi la vidéo rendue dans Chrome ou Edge sans fenêtre (débordements, chevauchements, cadre, marges,
 * zone des boutons en 9:16, logo, textes fugaces, mouvements rapides) ; sans navigateur : alerte rendu-non-verifie.
 * Écrit sortie/controle.json : { problemes: [{ regle, gravite: "erreur" | "alerte", scene?, element?, message, correction? }],
 *   corrections: [{ regle, scene, element?, avant, apres, message }], renduVerifie }.
 * Corrige seul les cas sûrs (typographie, durées) dans deroule.json, après une copie d'historique ;
 * --sans-correction : signale seulement (chaque problème corrigeable porte sa « correction »).
 * Reprend les erreurs de l'assemblage (polices, fichiers…) et le rapport de débordement
 * envoyé par la page d'aperçu (sortie/controle-page.json).
 * Affiche un résumé JSON { erreurs, alertes, corrections, renduVerifie, fichier } ; code de sortie 1 s'il reste une erreur.
 */
const fs = require('node:fs');
const path = require('node:path');
const { assembler, charteFinale, RACINE } = require('./assembler.js');
const { trouverStyle } = require('./styles.js');
const { lireGlossaire, verifierGlossaire } = require('./vocabulaire.js');
const { lireDeroule, dureeTemps } = require('./lib/deroule.js');
const { cheminDansProjet } = require('./lib/embarquer.js');
const { corrigerTypographie, corrigerMajuscules, motsDoubles, termesVariables, cleTerme } = require('./lib/typographie.js');
const { extraireScene, textesEnDur } = require('./lib/extraire.js');
const { calculerMinutage, CHEVAUCHEMENT } = require('../moteur/minutage.js');
const CATALOGUE = require('../moteur/synthe/catalogue.js');
const { appliquerCorrections } = require('./lib/corriger.js');
const { controlerRendu } = require('./lib/rendu-controle.js');
const { EFFETS: EFFETS_LETTRES } = require('../moteur/lettres.js');
const { analyserCamera } = require('../moteur/camera.js');
const { analyserTemps } = require('../moteur/temps.js');

const SEUILS = JSON.parse(fs.readFileSync(path.join(__dirname, 'seuils.json'), 'utf8'));

const virgule = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
const EPS = 1e-6;
/** Arrondi au pas supérieur (0,1 ou 0,5 s), sans bruit de virgule flottante. */
const auPasSuperieur = (x, pas) => Math.round(Math.ceil(x / pas - EPS) * pas * 1000) / 1000;
const auPasInferieur = (x, pas) => Math.round(Math.floor(x / pas + EPS) * pas * 1000) / 1000;

const { contraste } = require('./lib/couleurs.js');

const compterMots = (texte) => (String(texte).match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;

/** Intervalles [a,b] de [debut,fin] non couverts par les intervalles donnés. */
function trous(debut, fin, intervalles) {
  const tries = intervalles.filter(([a, b]) => b > debut && a < fin).sort((x, y) => x[0] - y[0]);
  const resultat = [];
  let curseur = debut;
  for (const [a, b] of tries) {
    if (a > curseur) resultat.push([curseur, a]);
    curseur = Math.max(curseur, b);
  }
  if (curseur < fin) resultat.push([curseur, fin]);
  return resultat;
}

const EFFETS = [
  [/filter\s*:[^;}]*url\(/i, 'filter: url(…)'],
  [/mix-blend-mode\s*:/i, 'mix-blend-mode'],
  [/backdrop-filter\s*:/i, 'backdrop-filter'],
];

const FAMILLES_PERMISES = /^(inherit|initial|unset|system-ui|sans-serif|serif|monospace|var\(--f-[a-z0-9-]+\))$/i;

function controlerCSS(cssBrut, scene, ou, problemes) {
  const css = cssBrut.replace(/\/\*[\s\S]*?\*\//g, '');
  // Taille du texte : font-size, ou la propriété raccourcie font (« 700 5cqh/1.2 … »).
  const tailles = /font(?:-size\s*:\s*|\s*:[^;}]*?\s)(\d*\.?\d+)cqh/gi;
  let m;
  while ((m = tailles.exec(css))) {
    const valeur = parseFloat(m[1]);
    if (valeur < SEUILS.texteMinCqh) {
      problemes.push({ regle: 'texte-petit', gravite: 'alerte', scene, message: `${ou} : texte de ${virgule(valeur)} cqh, trop petit pour être lu (minimum ${virgule(SEUILS.texteMinCqh)} cqh).` });
    }
  }
  // Polices : seules celles de la charte (variables --f-…) sont embarquées.
  const familles = /font-family\s*:\s*([^;}]+)|font\s*:[^;}]*?(["'][^"']+["'][^;}]*)/gi;
  while ((m = familles.exec(css))) {
    const valeur = (m[1] || m[2]).trim();
    const nonEmbarquees = valeur.split(',').map((f) => f.trim()).filter((f) => f && !FAMILLES_PERMISES.test(f));
    if (nonEmbarquees.length) {
      problemes.push({ regle: 'police-non-embarquee', gravite: 'erreur', scene, message: `${ou} : la police « ${valeur} » n'est pas embarquée ; utiliser var(--f-titres) ou var(--f-texte) (polices de la charte).` });
    }
  }
  for (const [motif, nom] of EFFETS) {
    if (motif.test(css)) {
      problemes.push({ regle: 'effet-export', gravite: 'alerte', scene, message: `${ou} : l'effet ${nom} ne passera pas à l'export rapide (MP4 dans le navigateur).` });
    }
  }
}

const liste = (corrections) => corrections.join(', ');

/** Typographie, majuscules accentuées, mots doublés, termes variables (textes du déroulé et des scènes). */
function controlerTextes(deroule, scenesHtml, termesGlossaire, problemes) {
  const entrees = [];
  for (const s of deroule.scenes) {
    for (const [cle, texte] of Object.entries(s.textes || {})) {
      if (typeof texte !== 'string') continue;
      entrees.push({ scene: s.id, cle, texte });
      const typo = corrigerTypographie(texte);
      if (typo.corrections.length) {
        problemes.push({ regle: 'typographie', gravite: 'alerte', scene: s.id, element: cle, details: liste(typo.corrections), correction: { scene: s.id, texte: cle, valeur: typo.texte },
          message: `Scène « ${s.id} », texte « ${cle} » : typographie française (${liste(typo.corrections)}) : « ${typo.texte} ».` });
      }
      // Calculée sur le texte déjà corrigé : appliquée après la typographie, sa valeur contient les deux.
      const maj = corrigerMajuscules(typo.texte);
      if (maj.corrections.length) {
        problemes.push({ regle: 'majuscule-accentuee', gravite: 'alerte', scene: s.id, element: cle, details: liste(maj.corrections), correction: { scene: s.id, texte: cle, valeur: maj.texte },
          message: `Scène « ${s.id} », texte « ${cle} » : ${liste(maj.corrections)} : « ${maj.texte} ».` });
      }
      for (const d of motsDoubles(texte)) {
        problemes.push({ regle: 'mot-double', gravite: 'alerte', scene: s.id, element: cle,
          message: `Scène « ${s.id} », texte « ${cle} » : « ${d.mot} » écrit deux fois de suite ; proposition : « ${d.propose} ».` });
      }
    }
    for (const texte of textesEnDur(scenesHtml[s.id] || '')) {
      const juste = corrigerMajuscules(corrigerTypographie(texte).texte);
      const corrections = [...corrigerTypographie(texte).corrections, ...juste.corrections];
      if (corrections.length) {
        problemes.push({ regle: 'typographie', gravite: 'alerte', scene: s.id,
          message: `Scène « ${s.id} » : texte écrit dans la scène, typographie française (${liste(corrections)}) : « ${juste.texte} » (à corriger dans le fichier de la scène).` });
      }
    }
  }
  const exclus = new Set(termesGlossaire.flatMap((t) => [t.terme, ...t.eviter]).map(cleTerme));
  for (const { formes } of termesVariables(entrees, exclus)) {
    problemes.push({ regle: 'terme-variable', gravite: 'alerte', scene: formes[0].scene,
      message: `Le même mot est écrit de plusieurs façons : ${formes.map((f) => `« ${f.forme} » (scène « ${f.scene} »)`).join(', ')} ; choisir une graphie (et la noter au glossaire si c'est un mot du métier).` });
  }
}

/** Contrôles sans navigateur. -> { problemes, ok } (ok : le projet s'assemble) */
function controlesRapides({ projet, dossierStyles, dossierEffets }) {
  const assemblage = assembler({ dossier: projet, dossierStyles, dossierEffets, ecrire: false });
  const problemes = assemblage.erreurs.map((e) => ({ ...e }));
  const { deroule } = lireDeroule(projet);

  if (assemblage.ok) {
    const dossierStyle = trouverStyle(deroule.style, dossierStyles).dossier;
    const scenesLues = {};
    const scenesHtml = {};
    const elementsParScene = {};
    for (const s of deroule.scenes) {
      const fichier = cheminDansProjet(projet, s.fichier);
      let html = '';
      try { html = fs.readFileSync(fichier, 'utf8'); } catch { /* déjà signalé par l'assemblage */ }
      scenesHtml[s.id] = html;
      scenesLues[s.id] = extraireScene(html);
      elementsParScene[s.id] = scenesLues[s.id].elements;
    }
    const temps = dureeTemps(deroule);
    // Scènes de la page (avec leur voix) : durées effectives et ancres « mot: » comme dans le navigateur.
    const scenesMinutees = (assemblage.donnees && assemblage.donnees.scenes) || deroule.scenes;
    const min = calculerMinutage(scenesMinutees, elementsParScene, { dureeTemps: temps });
    for (const e of min.erreurs) problemes.push({ ...e, gravite: 'erreur' });
    for (const s of min.scenes.filter((x) => x.allongee)) {
      problemes.push({ regle: 'voix-allonge', gravite: 'info', scene: s.id,
        message: `Scène « ${s.id} » : allongée à ${virgule(s.dureeEffective)} s pour laisser finir la voix (écrire "duree": ${Math.ceil(s.dureeEffective * 10) / 10} dans le déroulé pour la figer).` });
    }
    // La voix fixe la durée de sa scène : jamais de correction automatique de durée sous une voix.
    const avecVoix = new Set(scenesMinutees.filter((x) => x.voix).map((x) => x.id));

    // Sons : connus, pas trop serrés, les forts hors de la parole.
    const sonsJoues = [];
    for (const s of min.scenes) {
      for (const e of elementsParScene[s.id].filter((x) => x.son !== undefined)) {
        if (!CATALOGUE.BRUITAGES.includes(e.son) && !/[/.]/.test(e.son)) {
          problemes.push({ regle: 'son-inconnu', gravite: 'erreur', scene: s.id, message: `Scène « ${s.id} » : le son « ${e.son} » n'existe pas (sons : ${CATALOGUE.BRUITAGES.join(', ')} ; ou un fichier assets/…).` });
          continue;
        }
        const el = min.elements[s.id][e.cle];
        if (el) sonsJoues.push({ t: el.debut, nom: e.son, scene: s.id });
      }
    }
    if (deroule.bruitages && deroule.bruitages.transitions) {
      min.scenes.forEach((s, i) => { const nom = i > 0 && CATALOGUE.SONS_TRANSITION[s.transition]; if (nom) sonsJoues.push({ t: s.debut, nom, scene: s.id }); });
    }
    sonsJoues.sort((a, b) => a.t - b.t);
    for (let i = 0; i + 3 < sonsJoues.length; i++) {
      if (sonsJoues[i + 3].t - sonsJoues[i].t < 1) {
        problemes.push({ regle: 'trop-de-sons', gravite: 'alerte', scene: sonsJoues[i].scene, message: `Scène « ${sonsJoues[i].scene} » : plus de 3 sons dans la même seconde (vers ${virgule(sonsJoues[i].t)} s) ; en retirer ou les espacer.` });
        break;
      }
    }
    const motsDits = [];
    scenesMinutees.forEach((s, i) => {
      if (!s.voix || !s.voix.mots) return;
      const d = min.scenes[i].debut + (s.voix.debut || 0);
      s.voix.mots.forEach((m) => motsDits.push({ t0: d + m.t0, t1: d + m.t1 }));
    });
    for (const son of sonsJoues.filter((x) => CATALOGUE.FORTS.includes(x.nom))) {
      if (motsDits.some((m) => son.t >= m.t0 - 0.02 && son.t <= m.t1 + 0.02)) {
        problemes.push({ regle: 'son-sous-voix', gravite: 'alerte', scene: son.scene, message: `Scène « ${son.scene} » : le son « ${son.nom} » tombe pendant un mot (vers ${virgule(son.t)} s) et couvre la voix ; le placer dans une pause.` });
      }
    }

    // Tempo : chaque scène commence sur un temps (à une demi-image près) ; la première commence la vidéo.
    if (temps) {
      const tolerance = 0.5 / (deroule.format.ips || 30);
      for (const s of min.scenes.slice(1)) {
        const ecart = (s.debut - ((deroule.tempo && deroule.tempo.decalage) || 0)) / temps;
        if (Math.abs(ecart - Math.round(ecart)) * temps > tolerance) {
          problemes.push({ regle: 'hors-tempo', gravite: 'alerte', scene: s.id, message: `Scène « ${s.id} » : elle commence à ${virgule(s.debut)} s, entre deux temps (${Math.round(60 / temps)} bpm) ; ajuster la durée de la scène précédente pour tomber sur la musique.` });
        }
      }
    }

    // Fenêtre d'une balise d'effet : jusqu'à la mort de la dernière particule, pas seulement data-dur.
    const finEffet = (scene, rythme) => {
      const fins = {};
      const balises = elementsParScene[scene.id].filter((e) => e.effet !== undefined);
      for (const e of (assemblage.effets || []).filter((x) => x.scene === scene.id)) {
        const balise = balises[e.ordre];
        if (balise && min.elements[scene.id][balise.cle]) fins[balise.cle] = min.elements[scene.id][balise.cle].debut + e.effet.fin / (rythme || 1);
      }
      return fins;
    };
    const finsEffets = {};
    for (const s of min.scenes) finsEffets[s.id] = finEffet(s, s.rythme);
    const finElement = (id, cle, e) => Math.max(e.fin, finsEffets[id][cle] === undefined ? e.fin : finsEffets[id][cle]);

    const besoinLecture = {};
    for (const s of deroule.scenes) {
      const mots = Object.values(s.textes).reduce((n, t) => n + compterMots(t), 0);
      besoinLecture[s.id] = { mots, besoin: SEUILS.lectureBase + SEUILS.lectureParMot * mots };
    }
    // Une durée corrigée décalerait les scènes suivantes par rapport à la musique : rien avec un tempo.
    const corrigeable = !temps;

    // Temps morts : aucun élément en mouvement pendant plus que le seuil (pause finale exceptée).
    const derniere = min.scenes[min.scenes.length - 1];
    min.scenes.forEach((s, i) => {
      const dureeEntree = s.entree > 0 ? s.entree : (i === 0 && s.transition !== 'aucune' && s.transition !== 'coupe' ? CHEVAUCHEMENT : 0);
      const intervalles = Object.entries(min.elements[s.id]).map(([cle, e]) => [e.debut, finElement(s.id, cle, e)]);
      if (dureeEntree) intervalles.push([s.debut, s.debut + dureeEntree]);
      const suivante = min.scenes[i + 1];
      if (suivante && suivante.entree > 0) intervalles.push([suivante.debut, s.fin]);
      let morceaux = trous(s.debut, s.fin, intervalles);
      if (s === derniere) morceaux = morceaux.filter(([, b]) => b < s.fin);
      for (const [a, b] of morceaux) {
        if (b - a > SEUILS.tempsMort + EPS) {
          const p = { regle: 'temps-mort', gravite: 'alerte', scene: s.id, message: `Scène « ${s.id} » : rien ne bouge pendant ${virgule(b - a)} s (de ${virgule(a)} s à ${virgule(b)} s). Au-delà de ${virgule(SEUILS.tempsMort)} s, l'attention décroche.` };
          // En fin de scène (jusqu'à sa fin ou à l'entrée de la suivante) : raccourcir la scène, sans passer sous le temps de lecture.
          const finUtile = suivante && suivante.entree > 0 ? suivante.debut : s.fin;
          if (corrigeable && !avecVoix.has(s.id) && s !== derniere && Math.abs(b - finUtile) < EPS) {
            const duree = deroule.scenes[i].duree;
            const { mots, besoin } = besoinLecture[s.id];
            // Au dixième inférieur : le temps mort restant ne dépasse plus le seuil.
            const nouvelle = Math.max(auPasInferieur(duree - (b - a - SEUILS.tempsMort) * s.rythme, 0.1), mots ? auPasSuperieur(besoin * s.rythme, 0.1) : 0);
            if (nouvelle < duree - EPS) p.correction = { scene: s.id, duree: nouvelle };
          }
          problemes.push(p);
        }
      }
    });

    // Pause finale.
    const fins = Object.entries(min.elements[derniere.id]).map(([cle, e]) => finElement(derniere.id, cle, e));
    const pause = derniere.fin - Math.max(derniere.debut, ...fins);
    if (pause < SEUILS.pauseFinale - EPS) {
      const p = { regle: 'pause-finale', gravite: 'alerte', scene: derniere.id, message: `La vidéo s'arrête ${virgule(pause)} s après le dernier mouvement : laisser au moins ${virgule(SEUILS.pauseFinale)} s pour finir sur une image stable.` };
      const manque = SEUILS.pauseFinale - pause;
      if (corrigeable && !avecVoix.has(derniere.id) && manque <= SEUILS.pauseFinaleMaxAjout + EPS) {
        const duree = deroule.scenes[deroule.scenes.length - 1].duree;
        p.correction = { scene: derniere.id, duree: auPasSuperieur(duree + manque * derniere.rythme, 0.1) };
      }
      problemes.push(p);
    }

    // Trop d'animations vives en même temps : l'œil ne sait plus où regarder (les mouvements lents du décor ne comptent pas).
    for (const s of min.scenes) {
      const vifs = Object.values(min.elements[s.id]).filter((e) => e.fin - e.debut > 0 && e.fin - e.debut < SEUILS.animationLongue).sort((x, y) => x.debut - y.debut);
      let max = 0;
      let instant = 0;
      for (const e of vifs) {
        const n = vifs.filter((x) => x.debut <= e.debut + EPS && x.fin > e.debut + EPS).length;
        if (n > max) { max = n; instant = e.debut; }
      }
      if (max > SEUILS.animationsSimultanees) {
        problemes.push({ regle: 'trop-d-animations', gravite: 'alerte', scene: s.id, message: `Scène « ${s.id} » : ${max} éléments bougent en même temps vers ${virgule(instant)} s ; au-delà de ${SEUILS.animationsSimultanees}, l'œil ne sait plus où regarder. Décaler leurs départs (data-start).` });
      }
    }

    // Temps de lecture et CSS des scènes.
    for (const s of deroule.scenes) {
      const { mots, besoin } = besoinLecture[s.id];
      const minutee = min.scenes.find((x) => x.id === s.id);
      const disponible = minutee ? minutee.fin - minutee.debut : s.duree / (s.rythme || 1);
      if (mots && disponible < besoin - EPS) {
        const p = { regle: 'lecture', gravite: 'alerte', scene: s.id, message: `Scène « ${s.id} » : ${mots} mots à lire en ${virgule(disponible)} s ; prévoir au moins ${virgule(besoin)} s.` };
        const nouvelle = auPasSuperieur(besoin * (s.rythme || 1), 0.5);
        if (corrigeable && !avecVoix.has(s.id) && nouvelle <= s.duree * SEUILS.lectureMaxAllonge + EPS) p.correction = { scene: s.id, duree: nouvelle };
        problemes.push(p);
      }
      controlerCSS(scenesLues[s.id].css, s.id, `Scène « ${s.id} »`, problemes);
      for (const m of scenesLues[s.id].miseEnScene) {
        const signaler = (regle, message) => problemes.push({ regle, gravite: 'erreur', scene: s.id, message: `Scène « ${s.id} » : ${message}` });
        if (m.camera !== undefined && m.balise === 'section') signaler('camera-invalide', 'data-camera se pose sur un conteneur à l\'intérieur de la scène, pas sur la <section> (dont les transitions déplacent déjà l\'image).');
        else if (m.camera !== undefined) { try { analyserCamera(m.camera, temps); } catch (e) { signaler('camera-invalide', e.message); } }
        if (m.gel !== undefined || m.vitesse !== undefined) { try { analyserTemps(m.gel ?? null, m.vitesse ?? null, temps); } catch (e) { signaler('temps-invalide', e.message); } }
        if (m.profondeur !== undefined && !/^\d*\.?\d+$/.test(m.profondeur)) {
          signaler('profondeur-invalide', `data-profondeur « ${m.profondeur} » doit être un nombre (1 : suit la caméra, 0 : plan fixe, 0.3 : plan lointain).`);
        }
      }
      for (const { attribut, effet } of scenesLues[s.id].decoupes) {
        if (!Object.hasOwn(EFFETS_LETTRES, effet)) {
          problemes.push({ regle: 'lettres-invalide', gravite: 'erreur', scene: s.id, message: `Scène « ${s.id} » : ${attribut} « ${effet} » inconnu (effets : ${Object.keys(EFFETS_LETTRES).join(', ')}).` });
        }
      }
    }

    // Effets de particules : budget par scène, effet du calque avant posé sur un texte long.
    for (const s of min.scenes) {
      const effets = (assemblage.effets || []).filter((e) => e.scene === s.id);
      if (!effets.length) continue;
      const total = effets.reduce((n, e) => n + e.effet.capacite, 0);
      if (total > SEUILS.budgetParticules) {
        problemes.push({ regle: 'budget-particules', gravite: 'alerte', scene: s.id, message: `Scène « ${s.id} » : jusqu'à ${total} particules en même temps (au-delà de ${SEUILS.budgetParticules}, l'aperçu ralentit) ; baisser « nombre » ou la durée de vie.` });
      }
      const lus = scenesLues[s.id];
      const balisesEffet = lus.elements.filter((e) => e.effet !== undefined);
      const textes = (deroule.scenes.find((x) => x.id === s.id) || {}).textes || {};
      const longs = lus.textes.filter((cle) => compterMots(textes[cle] || '') > SEUILS.effetSurTexteMots).map((cle) => {
        const el = lus.elements.find((e) => e.texte === cle);
        return { cle, debut: el ? min.elements[s.id][el.cle].debut : s.debut };
      });
      for (const e of effets) {
        const balise = balisesEffet[e.ordre];
        if (e.calque !== 'avant' || !balise) continue;
        const debut = min.elements[s.id][balise.cle].debut;
        const fin = debut + e.effet.fin / s.rythme;
        // Un texte reste à l'écran de son entrée à la fin de la scène.
        const gene = longs.find((t) => debut < s.fin && fin > t.debut);
        if (gene) {
          problemes.push({ regle: 'effet-sur-texte', gravite: 'alerte', scene: s.id, element: balise.cle, message: `Scène « ${s.id} » : l'effet « ${e.effet.nom} » passe devant le texte « ${gene.cle} » pendant sa lecture ; le poser en data-calque="arriere" ou le décaler après la lecture.` });
        }
      }
    }
    // Glossaire de la charte : formes à éviter, sigles mal écrits ; typographie et graphie des textes.
    const termesGlossaire = lireGlossaire(projet).termes;
    problemes.push(...verifierGlossaire(deroule.scenes, termesGlossaire));
    controlerTextes(deroule, scenesHtml, termesGlossaire, problemes);

    // Style : tailles de texte et effets.
    try { controlerCSS(fs.readFileSync(path.join(dossierStyle, 'style.css'), 'utf8'), undefined, `Style « ${deroule.style} »`, problemes); } catch { /* style vérifié par l'assemblage */ }

    // Contraste de la charte.
    const { couleurs, ton, tonIndisponible } = charteFinale(deroule, dossierStyle, projet);
    if (tonIndisponible) {
      problemes.push({ regle: 'ton-indisponible', gravite: 'alerte', message: `Le style « ${deroule.style} » n'a pas de ton ${tonIndisponible} : la vidéo s'affiche en ton ${ton}. Choisissez un style qui propose le ton ${tonIndisponible}, ou retirez « ton » de la charte.` });
    }
    const paires = [
      ['texte', SEUILS.contrasteTexte, 'le texte'],
      ['primaire', SEUILS.contrasteTitres, 'les titres'],
      ['accent', SEUILS.contrasteTexte, 'les étiquettes'],
    ];
    for (const [nom, minimum, quoi] of paires) {
      if (couleurs[nom] && couleurs.fond) {
        const c = contraste(couleurs[nom], couleurs.fond);
        if (c < minimum) {
          problemes.push({ regle: 'contraste', gravite: 'alerte', message: `Charte : ${quoi} (${couleurs[nom]}) sur le fond (${couleurs.fond}) n'a qu'un contraste de ${virgule(c)}:1 ; il faut au moins ${virgule(minimum)}:1 pour être lu facilement.` });
        }
      }
    }
  }

  // Débordements relevés par la page d'aperçu.
  try {
    const page = JSON.parse(fs.readFileSync(path.join(projet, 'sortie', 'controle-page.json'), 'utf8'));
    for (const d of page.debordements || []) problemes.push({ regle: 'debordement', gravite: 'erreur', scene: d.scene, element: d.element, message: d.message });
  } catch { /* aucun rapport de la page */ }

  return { problemes, ok: assemblage.ok };
}

/**
 * controler({ dossier, dossierStyles?, dossierEffets?, ecrire?, corriger? })
 * -> { problemes, corrections, fichier } ; corriger : applique les corrections sûres au déroulé.
 */
function controler({ dossier, dossierStyles, dossierEffets = path.join(RACINE, 'effets'), ecrire = true, corriger = false }) {
  const projet = path.resolve(dossier);
  const premier = controlesRapides({ projet, dossierStyles, dossierEffets });
  let { problemes } = premier;
  let corrections = [];
  if (corriger && premier.ok) {
    const r = appliquerCorrections(projet, problemes);
    corrections = r.corrections;
    if (corrections.length) {
      ({ problemes } = controlesRapides({ projet, dossierStyles, dossierEffets }));
      // La page assemblée suit le déroulé corrigé (l'aperçu se recharge).
      if (ecrire) assembler({ dossier: projet, dossierStyles, dossierEffets, ecrire: true });
    }
    if (r.erreur) problemes.push({ regle: 'correction-impossible', gravite: 'alerte', message: r.erreur });
  }
  let fichier = null;
  if (ecrire) {
    fs.mkdirSync(path.join(projet, 'sortie'), { recursive: true });
    fichier = path.join(projet, 'sortie', 'controle.json');
    fs.writeFileSync(fichier, JSON.stringify({ problemes, corrections }, null, 2));
  }
  return { problemes, corrections, fichier };
}

/**
 * controlerComplet({ dossier, dossierStyles?, dossierEffets?, ecrire?, corriger?, rendu?, navigateur? })
 * -> Promise<{ problemes, corrections, renduVerifie, fichier }> : contrôles rapides, corrections, puis vidéo rendue.
 */
async function controlerComplet({ dossier, dossierStyles, dossierEffets = path.join(RACINE, 'effets'), ecrire = true, corriger = true, rendu = true, navigateur }) {
  const projet = path.resolve(dossier);
  const r = controler({ dossier: projet, dossierStyles, dossierEffets, ecrire, corriger });
  let { problemes } = r;
  let corrections = r.corrections;
  let renduVerifie = false;
  if (rendu) {
    const assemblage = assembler({ dossier: projet, dossierStyles, dossierEffets, ecrire: false });
    if (assemblage.ok) {
      const { deroule } = lireDeroule(projet);
      const duree = deroule.scenes.reduce((n, s) => n + s.duree / (s.rythme || 1), 0);
      const options = { html: assemblage.html, ratio: deroule.format.ratio, duree };
      if (navigateur !== undefined) options.navigateur = navigateur;
      const v = await controlerRendu(options);
      renduVerifie = v.renduVerifie;
      // Le rendu remplace le rapport de débordement de l'aperçu (même page, plus récent).
      if (renduVerifie) problemes = problemes.filter((p) => p.regle !== 'debordement');
      problemes = [...problemes, ...v.problemes];
      if (corriger && renduVerifie) {
          // Seulement les textes dont le débordement est bien signalé par le rendu.
          const corrigibles = v.ajustements.filter((a) => a.taille && v.problemes.some((p) => p.regle === 'debordement' && p.scene === a.scene && p.element === a.element));
          if (corrigibles.length) {
            const appli = appliquerCorrections(projet, corrigibles.map((a) => ({ regle: 'debordement', correction: { scene: a.scene, ajustement: { cle: a.cle, taille: a.taille } } })), { copieFaite: r.corrections.length > 0 });
            corrections = [...corrections, ...appli.corrections];
            const corriges = new Set(appli.corrections.map((c) => `${c.scene}|${c.element}`));
            problemes = problemes.filter((p) => !(p.regle === 'debordement' && corrigibles.some((a) => a.scene === p.scene && a.element === p.element && corriges.has(`${a.scene}|${a.cle}`))));
            if (appli.corrections.length && ecrire) assembler({ dossier: projet, dossierStyles, dossierEffets, ecrire: true });
            if (appli.erreur) problemes.push({ regle: 'correction-impossible', gravite: 'alerte', message: appli.erreur });
          }
          // Débordement que la taille ne suffit pas à corriger : le conseil de raccourcir.
          problemes = problemes.map((p) => (p.regle === 'debordement' && v.ajustements.some((a) => a.scene === p.scene && a.element === p.element && a.taille === null)
            ? { ...p, message: `${p.message} Même réduit autant que possible (jusqu'à 80 %, sans passer sous ${virgule(SEUILS.texteMinCqh)} cqh), il ne tient pas : raccourcir le texte.` } : p));
      }
    }
  }
  if (r.fichier) fs.writeFileSync(r.fichier, JSON.stringify({ problemes, corrections, renduVerifie }, null, 2));
  return { problemes, corrections, renduVerifie, fichier: r.fichier };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dossier = args.find((a) => !a.startsWith('--'));
  if (!dossier) {
    console.error('Usage : node scripts/controler.js <dossier-du-projet> [--sans-correction] [--sans-rendu]');
    process.exit(2);
  }
  controlerComplet({ dossier, corriger: !args.includes('--sans-correction'), rendu: !args.includes('--sans-rendu') }).then(({ problemes, corrections, renduVerifie, fichier }) => {
    const erreurs = problemes.filter((p) => p.gravite === 'erreur').length;
    const alertes = problemes.filter((p) => p.gravite === 'alerte').length;
    const informations = problemes.filter((p) => p.gravite === 'info').length;
    console.log(JSON.stringify({ erreurs, alertes, informations, corrections: corrections.length, renduVerifie, fichier }, null, 2));
    process.exit(erreurs ? 1 : 0);
  }, (e) => { console.error(e.message); process.exit(1); });
}

module.exports = { controler, controlerComplet, contraste, compterMots, trous, SEUILS };
