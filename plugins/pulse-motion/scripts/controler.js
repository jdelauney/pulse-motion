#!/usr/bin/env node
'use strict';
/* Pulse Motion – contrôles automatiques d'un projet vidéo, sans navigateur.
 *
 *   node scripts/controler.js <dossier-du-projet> [--sans-correction] [--sans-rendu] [--gpu] [--complet]
 *
 * --gpu : compile aussi chaque shader et chaque module WGSL dans Chrome sans fenêtre avec WebGPU (shader-ne-compile-pas).
 * Contrôle aussi la vidéo rendue dans Chrome ou Edge sans fenêtre (débordements, chevauchements, cadre, marges,
 * zone des boutons en 9:16, logo, textes fugaces, mouvements rapides) ; sans navigateur : alerte rendu-non-verifie.
 * Écrit sortie/controle.json : { version: 2, problemes: [{ regle, gravite: "erreur" | "alerte" | "info" (rien à corriger : la personne est prévenue), scene?, element?, message (pour la personne, sans jargon), consigne (pour Claude : la correction technique, lib/messages.js), correction? }],
 *   corrections: [{ regle, scene, element?, avant, apres, message }], renduVerifie, rendu: "complet" | "partiel" | null, scenesMesurees,
 *   empreintes: { moteur, seuils, commun, scenes: { id: empreinte } } | null, rendus: { id: [problèmes du rendu] } | null,
 *   son: { empreinte, problemes } | null } (son mesuré : voix-couverte, silence-imprevu ; repris tant que son empreinte ne change pas).
 * Un seul assemblage par contrôle (deux après des corrections du déroulé) ; écrit aussi la page sortie/<titre>.html
 * quand elle a changé (plus besoin d'assembler avant de contrôler).
 * Contrôle du rendu incrémental (spec Rapidité 5.9) : les contrôles rapides se refont en entier ; le rendu ne mesure que
 * les scènes dont l'empreinte a changé depuis le contrôle précédent, et reprend les résultats des autres. Aucune scène
 * changée : aucun navigateur. Pas de contrôle précédent, ancien controle.json, moteur ou seuils changés, ou --complet :
 * contrôle complet (exigé avant l'export).
 * Corrige seul les cas sûrs (typographie, durées) dans deroule.json, après une copie d'historique ;
 * --sans-correction : signale seulement (chaque problème corrigeable porte sa « correction »).
 * Reprend les erreurs de l'assemblage (polices, fichiers…) et le rapport de débordement
 * envoyé par la page d'aperçu (sortie/controle-page.json).
 * Affiche un résumé JSON { erreurs, alertes, corrections, renduVerifie, fichier } ; code de sortie 1 s'il reste une erreur.
 */
const fs = require('node:fs');
const path = require('node:path');
// Appelé par le module (et non par une copie de la fonction) : les tests comptent les assemblages.
const Assembleur = require('./assembler.js');
const { charteFinale, RACINE } = Assembleur;
const { controlerCSS, controlerLettres, sonConnu, problemeSonInconnu } = require('./lib/controle-scene.js');
const { empreintesControle, plagesScenes, besoinEcoute, empreinteSonore } = require('./lib/empreintes.js');
const { ecrireAtomique } = require('./lib/fichiers.js');
const { avecConsignes } = require('./lib/messages.js');
const { trouverStyle } = require('./styles.js');
const { lireGlossaire, verifierGlossaire } = require('./vocabulaire.js');
const { lireDeroule, dureeTemps, grilleFixe, optionsMinutage } = require('./lib/deroule.js');
const { deplierGroupes } = require('./lib/groupes-personnages.js');
const { cheminDansProjet } = require('./lib/embarquer.js');
const W = require('../moteur/wav.js');
const { corrigerTypographie, corrigerMajuscules, motsDoubles, termesVariables, cleTerme } = require('./lib/typographie.js');
const { extraireScene, textesEnDur } = require('./lib/extraire.js');
const { calculerMinutage } = require('../moteur/minutage.js');
const CATALOGUE = require('../moteur/synthe/catalogue.js');
const { appliquerCorrections } = require('./lib/corriger.js');
const { controlerRendu } = require('./lib/rendu-controle.js');
const { verifierDeterminisme } = require('./lib/determinisme.js');
const { aDesShaders, compilerShadersGPU } = require('./lib/shaders-gpu.js');
const { LIMITES_INTERACTIONS, PLEINE_VOISINAGE, STRUCTURES_SCENE_MAX, SOMMETS_TISSU_MAX, RESOLUTION_MILIEU_ALERTE } = require('../moteur/particules/recette.js');
const { analyserCamera } = require('../moteur/camera.js');
const { analyserTemps } = require('../moteur/temps.js');
const { reglesRealisation } = require('./lib/realisation-regles.js');

const SEUILS = JSON.parse(fs.readFileSync(path.join(__dirname, 'seuils.json'), 'utf8'));

const virgule = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
const EPS = 1e-6;
/** Arrondi au pas supérieur (0,1 ou 0,5 s), sans bruit de virgule flottante. */
const auPasSuperieur = (x, pas) => Math.round(Math.ceil(x / pas - EPS) * pas * 1000) / 1000;
const auPasInferieur = (x, pas) => Math.round(Math.floor(x / pas + EPS) * pas * 1000) / 1000;

const { contraste, suggererCouleur, phraseProposition } = require('./lib/couleurs.js');
const { dureeVideo } = require('./lib/voix.js');

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

/** Contrôles sans navigateur, sur l'assemblage donné (sinon assemblé ici). -> { problemes, ok } (ok : le projet s'assemble) */
function controlesRapides({ projet, dossierStyles, dossierEffets, assemblage = Assembleur.assembler({ dossier: projet, dossierStyles, dossierEffets, ecrire: false }) }) {
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
      // Groupes de personnages dépliés comme à l'assemblage : mêmes éléments minutés que dans la page.
      if (/data-groupe/.test(html)) html = deplierGroupes(html, { scene: s.id, dureeTemps: dureeTemps(deroule) }).html;
      scenesLues[s.id] = extraireScene(html);
      elementsParScene[s.id] = scenesLues[s.id].elements;
    }
    const temps = dureeTemps(deroule);
    // Scènes de la page (avec leur voix) : durées effectives et ancres « mot: » comme dans le navigateur.
    const scenesMinutees = (assemblage.donnees && assemblage.donnees.scenes) || deroule.scenes;
    const min = calculerMinutage(scenesMinutees, elementsParScene, optionsMinutage(deroule));
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
        if (!sonConnu(e.son)) {
          problemes.push(problemeSonInconnu(s.id, e.son));
          continue;
        }
        const el = min.elements[s.id][e.cle];
        const volume = e.sonVolume === undefined || !isFinite(parseFloat(e.sonVolume)) ? 1 : Math.max(0, Math.min(1, parseFloat(e.sonVolume)));
        if (el) sonsJoues.push({ t: el.debut, nom: e.son, scene: s.id, volume, fichier: /[/.]/.test(e.son) });
      }
    }
    if (deroule.bruitages && deroule.bruitages.transitions) {
      min.scenes.forEach((s, i) => { const nom = i > 0 && CATALOGUE.sonTransition(s.transition); if (nom) sonsJoues.push({ t: s.debut, nom, scene: s.id }); });
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
    // Son fort : un fort de la bibliothèque, ou un fichier importé dont la crête dépasse −12 dBFS (illisible ici : compté fort) ;
    // un son à volume 0 ne s'entend pas.
    const crete = new Map();
    const fort = (x) => {
      if (x.volume <= 0) return false;
      if (!x.fichier) return CATALOGUE.FORTS.includes(x.nom);
      if (!crete.has(x.nom)) {
        let c = 1;
        try {
          const son = W.lire(new Uint8Array(fs.readFileSync(cheminDansProjet(projet, x.nom))));
          c = 0;
          for (const canal of son.canaux) for (const v of canal) c = Math.max(c, Math.abs(v));
        } catch { /* format non lu ici (mp3…) : compté fort */ }
        crete.set(x.nom, c);
      }
      return crete.get(x.nom) * x.volume > Math.pow(10, -12 / 20);
    };
    for (const son of sonsJoues.filter(fort)) {
      if (motsDits.some((m) => son.t >= m.t0 - 0.02 && son.t <= m.t1 + 0.02)) {
        problemes.push({ regle: 'son-sous-voix', gravite: 'alerte', scene: son.scene, message: `Scène « ${son.scene} » : le son « ${son.nom} » tombe pendant un mot (vers ${virgule(son.t)} s) et couvre la voix ; le placer dans une pause.` });
      }
    }

    // Boucle parfaite (spec Rendu et export, 5.18) : avec un tempo connu, la durée fait un nombre entier de mesures de 4 temps.
    if (deroule.boucle === true && temps) {
      const r = require('./lib/boucle.js').mesureEntiere({ duree: min.duree, temps, ips: deroule.format.ips || 30 });
      if (r) problemes.push(require('./lib/boucle.js').problemeMesure(r));
    }
    // Grille fixe : chaque scène commence sur un temps (à une demi-image près) ; la première commence la vidéo.
    if (temps && grilleFixe(deroule)) {
      const tolerance = 0.5 / (deroule.format.ips || 30);
      for (const s of min.scenes.slice(1)) {
        const ecart = (s.debut - ((deroule.tempo && deroule.tempo.decalage) || 0)) / temps;
        if (Math.abs(ecart - Math.round(ecart)) * temps > tolerance) {
          problemes.push({ regle: 'hors-tempo', gravite: 'alerte', scene: s.id, message: `Scène « ${s.id} » : elle commence à ${virgule(s.debut)} s, entre deux temps (${Math.round(60 / temps)} bpm), alors que la musique ne se recale pas sur les scènes ; ajuster la durée de la scène précédente, ou passer à une musique composée ou à une partition calée sur les scènes.` });
        }
      }
    }

    // Fenêtre d'une balise d'effet : jusqu'à la mort de la dernière particule, pas seulement data-dur.
    const nomsEffets = {};
    const finEffet = (scene, rythme) => {
      const fins = {};
      nomsEffets[scene.id] = {};
      const balises = elementsParScene[scene.id].filter((e) => e.effet !== undefined);
      for (const e of (assemblage.effets || []).filter((x) => x.scene === scene.id)) {
        const balise = balises[e.ordre];
        if (balise && min.elements[scene.id][balise.cle]) {
          fins[balise.cle] = min.elements[scene.id][balise.cle].debut + e.effet.fin / (rythme || 1);
          nomsEffets[scene.id][balise.cle] = e.effet.nom;
        }
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
    // Musique calée sur les scènes : une durée corrigée ne la décale pas. Grille fixe (fichier, partition continue) :
    // une durée corrigée décalerait les scènes suivantes par rapport à la musique.
    const fixe = grilleFixe(deroule);
    const corrigeable = !fixe;

    // Temps morts : aucun élément en mouvement pendant plus que le seuil (pause finale exceptée).
    const derniere = min.scenes[min.scenes.length - 1];
    min.scenes.forEach((s, i) => {
      const dureeEntree = s.entree > 0 ? s.entree : (i === 0 ? s.dureeTransition || 0 : 0);
      const intervalles = Object.entries(min.elements[s.id]).map(([cle, e]) => [e.debut, finElement(s.id, cle, e)]);
      if (dureeEntree) intervalles.push([s.debut, s.debut + dureeEntree]);
      // Un personnage qui parle bouge pendant toute la voix de sa scène.
      const sv = scenesMinutees.find((x) => x.id === s.id);
      if (sv && sv.voix && /data-action\s*=\s*["']?parler/.test(scenesHtml[s.id] || '')) intervalles.push([s.debut + sv.voix.debut, s.debut + sv.voix.debut + sv.voix.duree]);
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
    const fins = Object.entries(min.elements[derniere.id]).map(([cle, e]) => [cle, finElement(derniere.id, cle, e)]);
    const pause = derniere.fin - Math.max(derniere.debut, ...fins.map((f) => f[1]));
    if (pause < SEUILS.pauseFinale - EPS) {
      let message = `La vidéo s'arrête ${virgule(pause)} s après le dernier mouvement : laisser au moins ${virgule(SEUILS.pauseFinale)} s pour finir sur une image stable.`;
      if (pause < -EPS) {
        // Un mouvement (souvent un effet de particules et la vie de ses particules) dépasse la fin de la vidéo.
        const [cle] = fins.reduce((a, b) => (b[1] > a[1] ? b : a));
        const nom = nomsEffets[derniere.id][cle];
        const quoi = nom ? `l'effet « ${nom} »` : `« ${cle} »`;
        message = `Scène « ${derniere.id} » : ${quoi} continue ${virgule(-pause)} s après la fin de la vidéo et sera coupé : avancer data-start, donner un data-dur plus court ou allonger la scène (laisser ensuite au moins ${virgule(SEUILS.pauseFinale)} s d'image stable).`;
      }
      const p = { regle: 'pause-finale', gravite: 'alerte', scene: derniere.id, message };
      const manque = SEUILS.pauseFinale - pause;
      if (corrigeable && !avecVoix.has(derniere.id) && manque <= SEUILS.pauseFinaleMaxAjout + EPS) {
        const duree = deroule.scenes[deroule.scenes.length - 1].duree;
        p.correction = { scene: derniere.id, duree: auPasSuperieur(duree + manque * derniere.rythme, 0.1) };
      }
      problemes.push(p);
    }

    // Trop d'animations vives en même temps : l'œil ne sait plus où regarder (les mouvements lents du décor ne comptent pas,
    // ni les fonds et auras par shader : une ambiance, pas un point d'attention).
    for (const s of min.scenes) {
      const ambiances = new Set(elementsParScene[s.id].filter((e) => e.shader !== undefined).map((e) => e.cle));
      const vifs = Object.entries(min.elements[s.id]).filter(([cle]) => !ambiances.has(cle)).map(([, e]) => e)
        .filter((e) => e.fin - e.debut > 0 && e.fin - e.debut < SEUILS.animationLongue).sort((x, y) => x.debut - y.debut);
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
      controlerLettres(scenesLues[s.id].decoupes, s.id, problemes);
    }

    // Effets de particules : budget par scène, effet du calque avant posé sur un texte long.
    // Aire de la scène en cqh² (hauteur 100 cqh, largeur selon le format déclaré).
    const [rl, rh] = String((deroule.format && deroule.format.ratio) || '16:9').split(':').map(Number);
    const aireScene = 100 * (rl > 0 && rh > 0 ? 100 * rl / rh : 177.78);
    for (const s of min.scenes) {
      const effets = (assemblage.effets || []).filter((e) => e.scene === s.id);
      if (!effets.length) continue;
      const total = effets.reduce((n, e) => n + e.effet.capacite, 0);
      if (total > SEUILS.budgetParticules) {
        problemes.push({ regle: 'budget-particules', gravite: 'alerte', scene: s.id, message: `Scène « ${s.id} » : jusqu'à ${total} particules en même temps (au-delà de ${SEUILS.budgetParticules}, l'aperçu ralentit) ; baisser « nombre » ou la durée de vie.` });
      }
      // Interactions (P5a) : au-delà de la limite de son type, un émetteur dépasse le temps de simulation d'une image.
      for (const e of effets) {
        for (const em of e.effet.emetteurs) {
          if (!em.interactions) continue;
          const limite = LIMITES_INTERACTIONS[em.interactions.type];
          const nom = `Scène « ${s.id} » : l'effet « ${e.effet.nom} », émetteur « ${em.nom} » (${em.interactions.type}), peut compter ${em.capacite} particules`;
          if (em.capacite > limite) {
            problemes.push({ regle: 'budget-interactions', gravite: 'alerte', scene: s.id, message: `${nom} ; au-delà de ${limite} par émetteur, la simulation des interactions dépasse son temps (aperçu saccadé). Baisser « nombre », « debit » ou la durée de vie.` });
          }
          // Cellules pleines : même étalées sur toute la scène, plus de PLEINE_VOISINAGE / 2 particules en moyenne par
          // cellule de voisinage (côté : rayon, ou vision d'un essaim) ; une cellule de plus de PLEINE_VOISINAGE corps est
          // ignorée (ses particules s'ignorent entre elles), ce qui arrive vite là où elles se rassemblent.
          const cote = em.interactions.cote;
          const parCellule = em.capacite * cote * cote / aireScene;
          if (parCellule > PLEINE_VOISINAGE / 2) {
            const champ = em.interactions.type === 'essaim' ? '« vision.rayon » et « rayon »' : '« rayon »';
            problemes.push({ regle: 'budget-interactions', gravite: 'alerte', scene: s.id, message: `${nom} pour des cellules de voisinage de ${virgule(cote)} cqh de côté : ${Math.round(parCellule)} par cellule en moyenne sur toute la scène ; au-delà de ${PLEINE_VOISINAGE} dans une cellule, ses particules s'ignorent entre elles. Baisser ${champ} ou le nombre de particules.` });
          }
        }
      }
      // Structures (P5b) : au-delà de 16 cordes et tissus par scène, ou de 64 × 64 sommets par tissu, la simulation d'une
      // image dépasse son temps.
      const structures = effets.flatMap((e) => e.effet.emetteurs.filter((em) => em.structure).map((em) => ({ e, em })));
      if (structures.length > STRUCTURES_SCENE_MAX) {
        problemes.push({ regle: 'budget-structures', gravite: 'alerte', scene: s.id, message: `Scène « ${s.id} » : ${structures.length} cordes et tissus ; au-delà de ${STRUCTURES_SCENE_MAX} par scène, leur simulation dépasse son temps (aperçu saccadé). En retirer, ou les répartir sur plusieurs scènes. Même sous cette limite, mesurée sur une carte graphique récente, une machine modeste peut saccader à l'aperçu (l'export reste exact).` });
      }
      for (const { e, em } of structures) {
        const st = em.structure;
        if (st.type !== 'tissu' || st.nSommets <= SOMMETS_TISSU_MAX) continue;
        problemes.push({ regle: 'budget-structures', gravite: 'alerte', scene: s.id, message: `Scène « ${s.id} » : l'effet « ${e.effet.nom} », tissu « ${em.nom} » de ${st.colonnes} × ${st.lignes} sommets ; au-delà de 64 × 64 (${SOMMETS_TISSU_MAX}), sa simulation dépasse son temps (aperçu saccadé). Baisser « resolution » (même sous cette limite, mesurée sur une carte graphique récente, une machine modeste peut saccader à l'aperçu).` });
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
    // Milieu (P5c) : au-delà de 512 cellules sur le grand côté, la simulation de la grille dépasse son temps.
    for (const mi of assemblage.milieux || []) {
      const res = mi.effet.milieu.resolution;
      if (res <= RESOLUTION_MILIEU_ALERTE) continue;
      problemes.push({ regle: 'budget-milieu', gravite: 'alerte', scene: mi.scene, message: `Scène « ${mi.scene} » : le milieu « ${mi.effet.nom} » a ${res} cellules sur le grand côté ; au-delà de ${RESOLUTION_MILIEU_ALERTE}, sa simulation dépasse son temps (aperçu saccadé). Baisser « resolution » (192 suffit à une fumée nette : la grille est échantillonnée en bicubique ; l'export reste exact).` });
    }
    // Glossaire de la charte : formes à éviter, sigles mal écrits ; typographie et graphie des textes.
    const termesGlossaire = lireGlossaire(projet).termes;
    problemes.push(...verifierGlossaire(deroule.scenes, termesGlossaire));
    controlerTextes(deroule, scenesHtml, termesGlossaire, problemes);
    // Réalisation et vérité (spec S2, 5.7) : nouveauté, comparaison, caméra, termes clés, chiffres, glyphes, emoji, images
    // répétées, code des scènes.
    problemes.push(...reglesRealisation({ deroule, min, scenesMinutees, scenesHtml, scenesLues, besoinLecture, avecVoix, corrigeable,
      temps, termes: termesGlossaire, fichiersPolices: assemblage.polices, seuils: SEUILS }));

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
          // Couleur lisible proposée (spec S2, 5.9), jamais appliquée seule : la charte est celle de la personne (sans scène,
          // corriger.js ne l'applique pas).
          const autres = Object.fromEntries(Object.entries(couleurs).filter(([k]) => k !== 'fond' && k !== nom));
          const s = suggererCouleur(couleurs[nom], couleurs.fond, minimum, autres);
          problemes.push({ regle: 'contraste', gravite: 'alerte', correction: { couleur: nom, valeur: s.hex },
            message: `Charte : ${quoi} (${couleurs[nom]}) sur le fond (${couleurs.fond}) n'a qu'un contraste de ${virgule(c)}:1 ; il faut au moins ${virgule(minimum)}:1 pour être lu facilement ; ${phraseProposition(s)}.` });
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

/** Fichiers dont dépend la mesure du rendu : le moteur inclus dans la page, les modules du contrôle et la capture qu'y injecte
 *  la page de mesure, et le code de mesure côté Node. */
const MESURE = [path.join(RACINE, 'moteur', 'mesures.js'), path.join(RACINE, 'moteur', 'pixels.js'), path.join(RACINE, 'moteur', 'ecoute.js'), path.join(RACINE, 'moteur', 'capture.js'), path.join(__dirname, 'lib', 'rendu-controle.js'), path.join(__dirname, 'lib', 'flashs.js'), path.join(__dirname, 'lib', 'page-mesures.js'), path.join(__dirname, 'lib', 'couleurs.js')];
const lireCode = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
function codeDeMesure(assemblage) {
  return String(assemblage.moteur || Assembleur.lireMoteur(RACINE)) + MESURE.map(lireCode).join('\n');
}
/** Code dont dépend le son mesuré (spec S2, 5.11) : mixage, sonie, synthétiseur, écoute. */
const SON = ['audio.js', 'mixage.js', 'sonie.js', 'ecoute.js', 'wav.js', 'synthe/catalogue.js', 'synthe/partition.js', 'synthe/ambiances.js', 'synthe/instruments.js', 'synthe/bruitages.js']
  .map((f) => path.join(RACINE, 'moteur', f));
const codeDuSon = () => SON.map(lireCode).join('\n');

/** controle.json précédent, s'il est au format v2 avec ses empreintes ; sinon null (ancien format : contrôle complet). */
function lirePrecedent(projet) {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(projet, 'sortie', 'controle.json'), 'utf8'));
    if (c && c.version === 2 && c.empreintes && c.empreintes.scenes && c.rendus && typeof c.rendus === 'object') return c;
  } catch { /* pas de contrôle précédent */ }
  return null;
}

/**
 * controler({ dossier, dossierStyles?, dossierEffets?, ecrire?, corriger? })
 * -> { problemes, corrections, fichier, assemblage } ; corriger : applique les corrections sûres au déroulé.
 * Un assemblage, deux si des corrections changent le déroulé ; ecrire : la page sortie/<titre>.html est écrite si elle a
 * changé, et sortie/controle.json (contrôles rapides seulement).
 */
function controler({ dossier, dossierStyles, dossierEffets = path.join(RACINE, 'effets'), ecrire = true, corriger = false }) {
  const projet = path.resolve(dossier);
  let assemblage = Assembleur.assembler({ dossier: projet, dossierStyles, dossierEffets, ecrire: false });
  const premier = controlesRapides({ projet, dossierStyles, dossierEffets, assemblage });
  let { problemes } = premier;
  let corrections = [];
  if (corriger && premier.ok) {
    const r = appliquerCorrections(projet, problemes);
    corrections = r.corrections;
    if (corrections.length) {
      assemblage = Assembleur.assembler({ dossier: projet, dossierStyles, dossierEffets, ecrire: false });
      ({ problemes } = controlesRapides({ projet, dossierStyles, dossierEffets, assemblage }));
    }
    if (r.erreur) problemes.push({ regle: 'correction-impossible', gravite: 'alerte', message: r.erreur });
  }
  let fichier = null;
  if (ecrire) {
    // La page suit le déroulé (corrigé) : l'aperçu se recharge seul, l'export lit cette page.
    if (assemblage.ok) Assembleur.ecrireSortie(projet, assemblage, { siChangee: true });
    fichier = path.join(projet, 'sortie', 'controle.json');
    ecrireAtomique(fichier, JSON.stringify({ problemes, corrections }, null, 2));
  }
  return { problemes, corrections, fichier, assemblage };
}

/**
 * controlerComplet({ dossier, dossierStyles?, dossierEffets?, ecrire?, corriger?, rendu?, gpu?, navigateur?, complet?, mesurer? })
 * -> Promise<{ problemes, corrections, renduVerifie, rendu, scenesMesurees, fichier }> : contrôles rapides, corrections,
 * vidéo rendue (seulement les scènes changées, sauf complet), puis (gpu) compilation réelle des shaders.
 * mesurer : remplace controlerRendu (tests). avancement : suivi (lib/avancement.js, suivre) annoncé à chaque étape, puis par
 * scène pendant le rendu (spec Retouches et ergonomie, 5.2) ; null : rien d'annoncé.
 */
async function controlerComplet({ dossier, dossierStyles, dossierEffets = path.join(RACINE, 'effets'), ecrire = true, corriger = true, rendu = true, gpu = false, navigateur, complet = false, mesurer = controlerRendu, prouver = verifierDeterminisme, avancement = null }) {
  const projet = path.resolve(dossier);
  const av = avancement || (() => {});
  av(0, 10, 'textes, durées et son');
  const precedent = lirePrecedent(projet);
  const r = controler({ dossier: projet, dossierStyles, dossierEffets, ecrire, corriger });
  const { assemblage } = r;
  let { problemes } = r;
  let corrections = r.corrections;
  let renduVerifie = false;
  let modeRendu = null;
  let scenesMesurees = [];
  let empreintes = null;
  let rendus = null;
  let son = null;
  let determinisme = precedent && precedent.determinisme ? precedent.determinisme : null;
  let preuve = null;
  if (rendu && assemblage.ok) {
    const { deroule } = lireDeroule(projet);
    const duree = dureeVideo(projet, deroule);
    const options = optionsMinutage(deroule);
    empreintes = empreintesControle(assemblage, { seuils: SEUILS, moteur: codeDeMesure(assemblage), options });
    const ids = assemblage.donnees.scenes.map((s) => s.id);
    const comparable = !complet && Boolean(precedent) && precedent.empreintes.moteur === empreintes.moteur
      && precedent.empreintes.seuils === empreintes.seuils && precedent.empreintes.commun === empreintes.commun;
    const changees = comparable ? ids.filter((id) => precedent.empreintes.scenes[id] !== empreintes.scenes[id] || !Array.isArray(precedent.rendus[id])) : ids;
    modeRendu = comparable ? 'partiel' : 'complet';
    scenesMesurees = changees;
    // Son (spec S2, 5.11) : mesuré seulement si son empreinte a changé depuis le contrôle précédent (même en contrôle complet,
    // le son n'est rendu qu'une fois par version du son).
    const humeurs = Object.fromEntries(deroule.scenes.filter((s) => s.musique).map((s) => [s.id, s.musique]));
    const empreinteSon = besoinEcoute(assemblage) ? empreinteSonore(assemblage, { seuils: SEUILS, code: codeDuSon(), humeurs }) : null;
    const sonPrecedent = empreinteSon && precedent && precedent.son && precedent.son.empreinte === empreinteSon && Array.isArray(precedent.son.problemes) ? precedent.son : null;
    const ecoute = empreinteSon && !sonPrecedent ? { humeurs } : null;
    let v;
    if (comparable && !changees.length && !ecoute) {
      // Rien n'a changé à l'écran : aucun navigateur, les résultats du rendu sont repris tels quels.
      v = { renduVerifie: true, problemes: [], ajustements: [] };
    } else {
      av(2, 10, `vidéo rendue dans le navigateur (${changees.length} scène${changees.length > 1 ? 's' : ''})`);
      // Avancement par scène pendant le rendu : scènes dont les images ont été relevées.
      // Boucle (5.18) : jointure mesurée quand la première ou la dernière scène est mesurée (la dernière porte l'alerte).
      const bout = deroule.boucle === true && (!comparable || changees.includes(ids[0]) || changees.includes(ids[ids.length - 1]));
      if (bout && comparable && !changees.includes(ids[ids.length - 1])) changees.push(ids[ids.length - 1]);
      const opt = { html: assemblage.html, ratio: deroule.format.ratio, duree, genre: deroule.genre, ecoute, boucle: bout,
        surScene: (k, n) => av(2 + Math.round((6 * k) / Math.max(1, n)), 10, `scène ${k} sur ${n}`) };
      if (navigateur !== undefined) opt.navigateur = navigateur;
      if (comparable) {
        const minutage = calculerMinutage(assemblage.donnees.scenes, {}, options);
        opt.scenes = changees;
        // Mesures : deux relevés avant et après la scène (transitions, textes qui s'effacent) ; flashs : 1 s de chaque côté.
        opt.plages = plagesScenes(minutage, changees, 2 * (SEUILS.pasMesure || 0.2));
        opt.plagesFlashs = plagesScenes(minutage, changees, 1);
      }
      v = await mesurer(opt);
    }
    renduVerifie = v.renduVerifie;
    let duRendu = v.problemes;
    if (renduVerifie && comparable) {
      // Scènes mesurées : leurs nouveaux résultats ; les autres : ceux du contrôle précédent (même empreinte).
      const mesurees = new Set(changees);
      const sansScene = duRendu.filter((p) => !p.scene || !ids.includes(p.scene));
      duRendu = [...ids.flatMap((id) => (mesurees.has(id) ? duRendu.filter((p) => p.scene === id) : precedent.rendus[id])), ...sansScene];
    }
    // Le rendu remplace le rapport de débordement de l'aperçu (même page, plus récent).
    if (renduVerifie) problemes = problemes.filter((p) => p.regle !== 'debordement');
    if (corriger && renduVerifie) {
      // Seulement les textes dont le débordement est bien signalé par le rendu.
      const corrigibles = v.ajustements.filter((a) => a.taille && duRendu.some((p) => p.regle === 'debordement' && p.scene === a.scene && p.element === a.element));
      if (corrigibles.length) {
        const appli = appliquerCorrections(projet, corrigibles.map((a) => ({ regle: 'debordement', correction: { scene: a.scene, ajustement: { cle: a.cle, taille: a.taille } } })), { copieFaite: r.corrections.length > 0 });
        corrections = [...corrections, ...appli.corrections];
        const corriges = new Set(appli.corrections.map((c) => `${c.scene}|${c.element}`));
        duRendu = duRendu.filter((p) => !(p.regle === 'debordement' && corrigibles.some((a) => a.scene === p.scene && a.element === p.element && corriges.has(`${a.scene}|${a.cle}`))));
        if (appli.corrections.length && ecrire) Assembleur.assembler({ dossier: projet, dossierStyles, dossierEffets, ecrire: true });
        if (appli.erreur) problemes.push({ regle: 'correction-impossible', gravite: 'alerte', message: appli.erreur });
      }
      // Débordement que la taille ne suffit pas à corriger : le conseil de raccourcir.
      duRendu = duRendu.map((p) => (p.regle === 'debordement' && v.ajustements.some((a) => a.scene === p.scene && a.element === p.element && a.taille === null)
        ? { ...p, message: `${p.message} Même réduit autant que possible (jusqu'à 80 %), il ne tient pas : raccourcir le texte.`,
          consigne: `${p.message} Même réduit autant que possible (jusqu'à 80 %, sans passer sous ${virgule(SEUILS.texteMinCqh)} cqh), il ne tient pas : raccourcir le texte.` } : p));
    }
    problemes = [...problemes, ...duRendu];
    if (renduVerifie) {
      rendus = Object.fromEntries(ids.map((id) => [id, duRendu.filter((p) => p.scene === id)]));
      // Son : mesuré à l'instant (v.son), ou repris (empreinte inchangée) ; non mesuré (erreur du rendu du son) : rien de gardé.
      son = sonPrecedent || (ecoute && Array.isArray(v.son) ? { empreinte: empreinteSon, problemes: v.son } : null);
      if (son) problemes = [...problemes, ...son.problemes];
      // Preuve du déterminisme (spec S2, 5.13) : seulement les scènes à risque dont l'empreinte a changé.
      av(8, 10, "la vidéo rejouée, pour vérifier qu’elle ne change pas d’une lecture à l’autre");
      const p = await prouver({ assemblage, precedent: determinisme, minutage: calculerMinutage(assemblage.donnees.scenes, {}, options), seuils: SEUILS,
        ratio: deroule.format.ratio, forcer: complet, ...(navigateur !== undefined ? { navigateur } : {}) });
      determinisme = p.determinisme;
      preuve = { lancee: p.lancee, scenes: p.scenes, duree: p.duree };
      problemes = [...problemes, ...p.problemes];
    } else {
      empreintes = null;
      modeRendu = null;
      scenesMesurees = [];
    }
  } else if (!rendu && precedent) {
    // Sans rendu (--sans-rendu) : les résultats du dernier rendu restent comparables au prochain contrôle.
    empreintes = precedent.empreintes;
    rendus = precedent.rendus;
    son = precedent.son || null;
  }
  if (gpu && assemblage.ok && aDesShaders(assemblage.donnees)) {
    const g = await compilerShadersGPU({ html: assemblage.html, ...(navigateur !== undefined ? { navigateur } : {}) });
    problemes = [...problemes, ...g.problemes];
  }
  // Messages pour la personne sans jargon, consigne technique pour Claude (spec Retouches et ergonomie, 5.15).
  problemes = avecConsignes(problemes);
  corrections = avecConsignes(corrections);
  if (r.fichier) {
    ecrireAtomique(r.fichier, JSON.stringify({ version: 2, problemes, corrections, renduVerifie, rendu: modeRendu, scenesMesurees, empreintes, rendus, son, determinisme }, null, 2));
  }
  if (avancement && avancement.terminer) avancement.terminer(true);
  return { problemes, corrections, renduVerifie, rendu: modeRendu, scenesMesurees, determinisme: preuve, fichier: r.fichier };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dossier = args.find((a) => !a.startsWith('--'));
  if (!dossier) {
    console.error('Usage : node scripts/controler.js <dossier-du-projet> [--sans-correction] [--sans-rendu] [--gpu] [--complet]');
    process.exit(2);
  }
  const avancement = require('./lib/avancement.js').suivre(path.resolve(dossier), { travail: 'controle', libelle: 'Contrôle de la vidéo' });
  controlerComplet({ dossier, corriger: !args.includes('--sans-correction'), rendu: !args.includes('--sans-rendu'), gpu: args.includes('--gpu'), complet: args.includes('--complet'), avancement }).then(({ problemes, corrections, renduVerifie, rendu, scenesMesurees, determinisme, fichier }) => {
    const erreurs = problemes.filter((p) => p.gravite === 'erreur').length;
    const alertes = problemes.filter((p) => p.gravite === 'alerte').length;
    const informations = problemes.filter((p) => p.gravite === 'info').length;
    console.log(JSON.stringify({ erreurs, alertes, informations, corrections: corrections.length, renduVerifie, rendu, scenesMesurees, determinisme, fichier }, null, 2));
    process.exit(erreurs ? 1 : 0);
  }, (e) => { avancement.terminer(false, e.message); console.error(e.message); process.exit(1); });
}

module.exports = { controler, controlerComplet, controlesRapides, contraste, compterMots, trous, SEUILS };
