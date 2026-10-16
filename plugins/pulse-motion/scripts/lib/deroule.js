'use strict';
/* Pulse Motion – lecture et validation de deroule.json (schéma écrit à la main). */

const fs = require('node:fs');
const path = require('node:path');
const { TYPES } = require('./contrat.js');
const { AMBIANCES } = require('../../moteur/synthe/catalogue.js');
const { tonaliteValide, HUMEURS } = require('../../moteur/synthe/ambiances.js');

const TYPES_SCENE = Object.keys(TYPES);

const GENRES = ['formation', 'produit', 'storytelling', 'social'];
const PARCOURS = ['rapide', 'accompagne'];
const RATIOS = ['16:9', '9:16', '1:1', '4:5'];
const TRANSITIONS = ['aucune', 'fondu', 'glissement', 'balayage', 'rideau', 'zoom', 'coupe'];
const TONS = ['clair', 'sombre', 'auto'];
const ID = /^[a-z0-9-]+$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

// Noms injectés dans le CSS de la page : caractères sûrs seulement.
const CLE = /^[a-z0-9-]+$/;
const POLICE = /^[\p{L}\p{N} _.\/-]+$/u;

const NOM_SHADER = /^[a-z0-9-]+$/;
const MAX_POST = 4;

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const estTexte = (v) => typeof v === 'string' && v.trim() !== '';
const estPositif = (v) => typeof v === 'number' && isFinite(v) && v > 0;

/** Charte (du déroulé, de charte/charte.json ou enregistrée) -> messages, vide si valide. */
function validerCharte(c, nom = 'charte') {
  if (!estObjet(c)) return [`« ${nom} » doit être un objet.`];
  const err = [];
  if (c.couleurs !== undefined) {
    if (!estObjet(c.couleurs)) err.push(`« ${nom}.couleurs » doit être un objet.`);
    else for (const [cle, val] of Object.entries(c.couleurs)) {
      if (!CLE.test(cle)) err.push(`« ${nom}.couleurs.${cle} » : le nom doit contenir seulement a-z, 0-9 et des tirets.`);
      else if (!HEX.test(val)) err.push(`« ${nom}.couleurs.${cle} » doit être une couleur #rrggbb (reçu : ${JSON.stringify(val)}).`);
    }
  }
  if (c.polices !== undefined) {
    if (!estObjet(c.polices)) err.push(`« ${nom}.polices » doit être un objet.`);
    else for (const [cle, val] of Object.entries(c.polices)) {
      const ok = estObjet(val)
        ? estTexte(val.famille) && POLICE.test(val.famille) && estTexte(val.fichier) && POLICE.test(val.fichier) && /\.(woff2?|ttf|otf)$/i.test(val.fichier)
        : estTexte(val) && POLICE.test(val);
      if (!CLE.test(cle)) err.push(`« ${nom}.polices.${cle} » : le nom doit contenir seulement a-z, 0-9 et des tirets.`);
      else if (!ok) err.push(`« ${nom}.polices.${cle} » doit être un nom de police (lettres, chiffres, espaces, tirets), un fichier de police, ou { "famille", "fichier" }.`);
    }
  }
  if (c.logo !== undefined && !estTexte(c.logo)) err.push(`« ${nom}.logo » doit être un chemin de fichier.`);
  if (c.ton !== undefined && !TONS.includes(c.ton)) err.push(`« ${nom}.ton » doit être l'un de : ${TONS.join(', ')}.`);
  if (c.modele !== undefined && !(estTexte(c.modele) && ID.test(c.modele))) err.push(`« ${nom}.modele » doit être le nom d'une charte enregistrée (a-z, 0-9, tirets).`);
  return err;
}

/** Shader déclaré dans le déroulé (transition, post-traitement) -> messages. */
function validerShaderDeclare(o, ou, champs) {
  if (!estObjet(o)) return [`${ou} doit être un objet { "shader": "nom", "reglages": { … } }.`];
  const err = [];
  for (const k of Object.keys(o)) if (!champs.includes(k)) err.push(`${ou} : champ « ${k} » inconnu (champs : ${champs.join(', ')}).`);
  if (!estTexte(o.shader) || !NOM_SHADER.test(o.shader)) err.push(`${ou} : « shader » doit être le nom d'un shader (minuscules, chiffres, tirets).`);
  const valeurOk = (x) => (typeof x === 'number' && isFinite(x)) || estTexte(x);
  if (o.reglages !== undefined && !(estObjet(o.reglages) && Object.values(o.reglages).every(valeurOk))) {
    err.push(`${ou} : « reglages » doit être un objet { nom: nombre ou couleur }.`);
  }
  if (o.image !== undefined && !(estTexte(o.image) && /^assets\//.test(o.image))) err.push(`${ou} : « image » doit être un fichier de assets/ (ex. « assets/motif.png »).`);
  return err;
}

/** Liste de post-traitements (scène ou vidéo) -> messages. */
function validerPost(liste, ou) {
  if (!Array.isArray(liste)) return [`${ou} doit être une liste, ex. [{ "shader": "grain" }].`];
  const err = [];
  if (liste.length > MAX_POST) err.push(`${ou} : ${MAX_POST} post-traitements au plus.`);
  liste.forEach((p, i) => err.push(...validerShaderDeclare(p, `${ou}[${i + 1}]`, ['shader', 'reglages', 'image'])));
  return err;
}

/** -> liste de messages en français, vide si le déroulé est valide. */
function validerDeroule(d) {
  const err = [];
  if (!d || typeof d !== 'object' || Array.isArray(d)) return ['Le déroulé doit être un objet JSON.'];

  if (d.version !== 1) err.push('« version » doit valoir 1.');
  if (!estTexte(d.titre)) err.push('« titre » est obligatoire (texte).');
  if (!GENRES.includes(d.genre)) err.push(`« genre » doit être l'un de : ${GENRES.join(', ')}.`);
  if (!PARCOURS.includes(d.parcours)) err.push(`« parcours » doit être l'un de : ${PARCOURS.join(', ')}.`);
  if (!d.format || !RATIOS.includes(d.format.ratio)) err.push(`« format.ratio » doit être l'un de : ${RATIOS.join(', ')}.`);
  if (d.format && d.format.ips !== undefined && !(Number.isInteger(d.format.ips) && d.format.ips >= 12 && d.format.ips <= 60)) {
    err.push('« format.ips » doit être un entier entre 12 et 60.');
  }
  if (!estTexte(d.style)) err.push('« style » est obligatoire (nom d\'un style du catalogue).');

  if (d.charte !== undefined) err.push(...validerCharte(d.charte));

  if (d.musique !== undefined && !estObjet(d.musique)) err.push('« musique » doit être un objet.');
  else if (d.musique !== undefined) {
    const formes = ['fichier', 'generee', 'partition'].filter((k) => d.musique[k] !== undefined);
    if (formes.length !== 1) err.push('« musique » doit avoir un seul de « fichier », « generee » ou « partition ».');
    if (d.musique.fichier !== undefined && !estTexte(d.musique.fichier)) err.push('« musique.fichier » doit être un chemin de fichier dans assets/.');
    if (d.musique.partition !== undefined && !estTexte(d.musique.partition)) err.push('« musique.partition » doit être le chemin d\'une partition JSON dans assets/.');
    if (d.musique.generee !== undefined && !Object.hasOwn(AMBIANCES, d.musique.generee)) err.push(`« musique.generee » doit être l'une de : ${Object.keys(AMBIANCES).join(', ')}.`);
    if (d.musique.tempo !== undefined && !(typeof d.musique.tempo === 'number' && d.musique.tempo >= 60 && d.musique.tempo <= 180)) err.push('« musique.tempo » doit être un nombre de battements par minute, de 60 à 180.');
    if (d.musique.tonalite !== undefined && !tonaliteValide(d.musique.tonalite)) err.push('« musique.tonalite » doit être une tonalité : do, re, mib, fa#… suivie de « m » pour mineur (ex. « lam »).');
    if (d.musique.intensite !== undefined && !(typeof d.musique.intensite === 'number' && d.musique.intensite >= 0 && d.musique.intensite <= 1)) err.push('« musique.intensite » doit être un nombre entre 0 et 1.');
    if (d.musique.graine !== undefined && !(Number.isInteger(d.musique.graine) && d.musique.graine >= 0)) err.push('« musique.graine » doit être un nombre entier positif ou nul.');
    if (d.musique.volume !== undefined && !(typeof d.musique.volume === 'number' && d.musique.volume >= 0 && d.musique.volume <= 1)) {
      err.push('« musique.volume » doit être un nombre entre 0 et 1.');
    }
    if (d.musique.generee && Object.hasOwn(AMBIANCES, d.musique.generee) && estObjet(d.tempo) && typeof d.tempo.bpm === 'number' && tempoMusique(d) !== d.tempo.bpm) {
      err.push(`Le tempo de la musique générée (${tempoMusique(d)}) et « tempo.bpm » (${d.tempo.bpm}) diffèrent : n'en garder qu'un.`);
    }
  }
  if (d.bruitages !== undefined && !estObjet(d.bruitages)) err.push('« bruitages » doit être un objet, ex. { "transitions": true }.');
  else if (d.bruitages !== undefined) {
    if (d.bruitages.transitions !== undefined && typeof d.bruitages.transitions !== 'boolean') err.push('« bruitages.transitions » doit valoir true ou false.');
    if (d.bruitages.volume !== undefined && !(typeof d.bruitages.volume === 'number' && d.bruitages.volume >= 0 && d.bruitages.volume <= 1)) err.push('« bruitages.volume » doit être un nombre entre 0 et 1.');
  }

  if (d.tempo !== undefined && !estObjet(d.tempo)) err.push('« tempo » doit être un objet, ex. { "bpm": 120 }.');
  else if (d.tempo !== undefined) {
    if (!(typeof d.tempo.bpm === 'number' && d.tempo.bpm >= 30 && d.tempo.bpm <= 300)) err.push('« tempo.bpm » doit être un nombre de battements par minute, de 30 à 300.');
    if (d.tempo.decalage !== undefined && !(typeof d.tempo.decalage === 'number' && isFinite(d.tempo.decalage) && d.tempo.decalage >= 0)) {
      err.push('« tempo.decalage » doit être un nombre de secondes positif ou nul (instant du premier temps).');
    }
  }

  if (d.voix !== undefined && !estObjet(d.voix)) err.push('« voix » doit être un objet, ex. { "provisoire": true }.');
  else if (d.voix !== undefined) {
    if (d.voix.provisoire !== undefined && typeof d.voix.provisoire !== 'boolean') err.push('« voix.provisoire » doit valoir true ou false.');
    if (d.voix.volume !== undefined && !(typeof d.voix.volume === 'number' && d.voix.volume >= 0 && d.voix.volume <= 1)) err.push('« voix.volume » doit être un nombre entre 0 et 1.');
  }

  if (d.sousTitres !== undefined && !estObjet(d.sousTitres)) err.push('« sousTitres » doit être un objet, ex. { "mode": "ligne" }.');
  else if (d.sousTitres !== undefined) {
    if (d.sousTitres.mode !== undefined && !['ligne', 'mot'].includes(d.sousTitres.mode)) err.push('« sousTitres.mode » doit être « ligne » ou « mot ».');
    if (d.sousTitres.incrustes !== undefined && typeof d.sousTitres.incrustes !== 'boolean') err.push('« sousTitres.incrustes » doit valoir true ou false.');
    if (d.sousTitres.position !== undefined && !['bas', 'haut'].includes(d.sousTitres.position)) err.push('« sousTitres.position » doit être « bas » ou « haut ».');
  }

  if (d.post !== undefined) err.push(...validerPost(d.post, '« post »'));

  if (!Array.isArray(d.scenes) || d.scenes.length === 0) {
    err.push('« scenes » doit contenir au moins une scène.');
    return err;
  }
  const vus = new Set();
  d.scenes.forEach((s, i) => {
    const nom = s && estTexte(s.id) ? `scène « ${s.id} »` : `scène n° ${i + 1}`;
    if (!s || typeof s !== 'object') { err.push(`La ${nom} doit être un objet.`); return; }
    if (!estTexte(s.id) || !ID.test(s.id)) err.push(`La ${nom} : « id » doit contenir seulement a-z, 0-9 et des tirets.`);
    else if (vus.has(s.id)) err.push(`La ${nom} : « id » est déjà utilisé par une autre scène.`);
    else vus.add(s.id);
    if (!estTexte(s.fichier)) err.push(`La ${nom} : « fichier » est obligatoire (ex. scenes/01-intro.html).`);
    if (!estPositif(s.duree)) err.push(`La ${nom} : « duree » doit être un nombre de secondes supérieur à 0.`);
    if (s.rythme !== undefined && !estPositif(s.rythme)) err.push(`La ${nom} : « rythme » doit être un nombre supérieur à 0.`);
    if (!s.textes || typeof s.textes !== 'object' || Array.isArray(s.textes)) err.push(`La ${nom} : « textes » doit être un objet { clé: texte }.`);
    else for (const [k, v] of Object.entries(s.textes)) {
      if (typeof v !== 'string') err.push(`La ${nom} : « textes.${k} » doit être un texte.`);
    }
    if (s.ajustements !== undefined) {
      if (!estObjet(s.ajustements)) err.push(`La ${nom} : « ajustements » doit être un objet, ex. { "titre": { "taille": 0.9 } }.`);
      else for (const [cle, a] of Object.entries(s.ajustements)) {
        if (!estObjet(s.textes) || !Object.hasOwn(s.textes, cle)) err.push(`La ${nom} : « ajustements.${cle} » : aucun texte « ${cle} » dans la scène.`);
        else if (!estObjet(a) || typeof a.taille !== 'number' || a.taille < 0.8 || a.taille > 1) err.push(`La ${nom} : « ajustements.${cle}.taille » doit être un nombre entre 0,8 et 1.`);
      }
    }
    if (s.voix !== undefined) {
      if (!estObjet(s.voix)) err.push(`La ${nom} : « voix » doit être un objet, ex. { "texte": "…" }.`);
      else {
        if (!estTexte(s.voix.texte)) err.push(`La ${nom} : « voix.texte » est obligatoire (le texte dit dans la scène).`);
        if (s.voix.fichier !== undefined && !estTexte(s.voix.fichier)) err.push(`La ${nom} : « voix.fichier » doit être un chemin de fichier dans assets/.`);
        if (s.voix.debut !== undefined && !(typeof s.voix.debut === 'number' && isFinite(s.voix.debut) && s.voix.debut >= 0)) err.push(`La ${nom} : « voix.debut » doit être un nombre de secondes positif ou nul.`);
      }
    }
    if (s.transition !== undefined) {
      if (typeof s.transition === 'string' || !estObjet(s.transition)) {
        if (!TRANSITIONS.includes(s.transition)) {
          err.push(`La ${nom} : « transition » doit être l'une de : ${TRANSITIONS.join(', ')}, ou un shader { "shader": "dissolution", "duree": 0.8 }.`);
        }
      } else {
        err.push(...validerShaderDeclare(s.transition, `La ${nom} : « transition »`, ['shader', 'duree', 'reglages', 'image']));
        const du = s.transition.duree;
        if (du !== undefined && !(typeof du === 'number' && du >= 0.1 && du <= 5)) {
          err.push(`La ${nom} : « transition.duree » doit être un nombre de secondes entre 0,1 et 5.`);
        } else {
          const duree = du === undefined ? 0.8 : du;
          // Durée réelle (duree / rythme) : la transition tient dans la scène qui entre et dans celle qui sort.
          const reelle = (x) => (x && estPositif(x.duree) ? x.duree / (estPositif(x.rythme) ? x.rythme : 1) : Infinity);
          const prec = i > 0 ? d.scenes[i - 1] : null;
          const plafond = Math.min(reelle(s), prec ? reelle(prec) : Infinity);
          if (duree > plafond + 1e-9) {
            const quelle = reelle(s) <= (prec ? reelle(prec) : Infinity) ? 'celle de la scène' : `celle de la scène précédente (« ${prec && prec.id} »)`;
            err.push(`La ${nom} : « transition.duree » (${String(duree).replace('.', ',')} s) dépasse ${quelle}, ${String(Math.round(plafond * 100) / 100).replace('.', ',')} s : la raccourcir ou allonger la scène.`);
          }
        }
      }
    }
    if (s.musique !== undefined && !HUMEURS.includes(s.musique)) err.push(`La ${nom} : « musique » (humeur de la musique pendant la scène) doit être l'une de : ${HUMEURS.join(', ')}.`);
    if (s.post !== undefined) err.push(...validerPost(s.post, `La ${nom} : « post »`));
    if (s.type !== undefined && !TYPES_SCENE.includes(s.type)) {
      err.push(`La ${nom} : « type » doit être l'un de : ${TYPES_SCENE.join(', ')} (ou absent pour une scène composée librement).`);
    }
  });
  return err;
}

/** Tempo de la musique : celui d'une musique générée (le sien, ou celui de l'ambiance), ou celui de la partition
 *  (retenu par lireDeroule), ou null. */
function tempoMusique(d) {
  if (!d || !d.musique) return null;
  if (d.musique.generee && Object.hasOwn(AMBIANCES, d.musique.generee)) return d.musique.tempo || AMBIANCES[d.musique.generee].tempo;
  if (d.musique.partition && typeof d.musique.tempoPartition === 'number') return d.musique.tempoPartition;
  return null;
}

/** Durée d'un temps musical en secondes (tempo du déroulé, sinon celui de la musique générée), ou null. */
function dureeTemps(d) {
  const bpm = d && d.tempo && d.tempo.bpm > 0 ? d.tempo.bpm : tempoMusique(d);
  return bpm ? 60 / bpm : null;
}

/** Lit et valide <dossier>/deroule.json. -> { deroule, erreurs } */
function lireDeroule(dossier) {
  const fichier = path.join(dossier, 'deroule.json');
  let brut;
  try { brut = fs.readFileSync(fichier, 'utf8'); } catch {
    return { deroule: null, erreurs: [`Fichier introuvable : ${fichier}`] };
  }
  let d;
  try { d = JSON.parse(brut.replace(/^\uFEFF/, '')); } catch (e) {
    return { deroule: null, erreurs: [`deroule.json n'est pas un JSON valide : ${e.message}`] };
  }
  const erreurs = validerDeroule(d);
  // Partition : son tempo devient celui de la vidéo (retenu sans être écrit dans deroule.json).
  if (estObjet(d.musique) && estTexte(d.musique.partition)) {
    let tempo = null;
    try { tempo = JSON.parse(fs.readFileSync(path.join(dossier, d.musique.partition), 'utf8').replace(/^\uFEFF/, '')).tempo; } catch { /* signalé à l'assemblage (partition-invalide) */ }
    if (typeof tempo === 'number' && tempo > 0) {
      Object.defineProperty(d.musique, 'tempoPartition', { value: tempo, enumerable: false, configurable: true, writable: true });
      if (estObjet(d.tempo) && typeof d.tempo.bpm === 'number' && d.tempo.bpm !== tempo) {
        erreurs.push(`Le tempo de la partition (${tempo}) et « tempo.bpm » (${d.tempo.bpm}) diffèrent : n'en garder qu'un (le tempo de la partition suffit).`);
      }
    }
  }
  return { deroule: d, erreurs };
}

module.exports = { validerDeroule, validerCharte, lireDeroule, dureeTemps, tempoMusique, GENRES, PARCOURS, RATIOS, TRANSITIONS, TYPES_SCENE, TONS, MAX_POST };
