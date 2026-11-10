'use strict';
/* Pulse Motion – ébauche animée (spec Retouches et ergonomie, 5.3 ; friction 1) : dès l'accord sur le déroulé, chaque scène
 * absente reçoit un point de départ qui bouge déjà, remplacé ensuite par la scène écrite par son animateur.
 *
 * - scène avec un `type` : la scène toute faite du style, adaptée comme au changement de style (lib/adapter.js) ;
 * - scène composée : une carte neutre aux couleurs du style (classes pm-ebauche de moteur/base.css), avec ses textes ;
 * - la <section> porte data-ebauche : l'état reste « fabrication », le contrôle le signale (ebauche-restante), l'export
 *   le refuse, l'aperçu montre une pastille « Ébauche ».
 *
 * estEbauche(html) -> bool ; scenesEbauche(projet, deroule) -> [id] ; nombreDeScene(scene) -> '4' | null ; sansCompteur(html)
 * carteNeutre({ id, duree, textes, derniere }) -> html ; ecrireEbauche({ dossier, dossierStyles?, suivi? })
 *   -> { ok, ecrites: [id], gardees: [id] } | { ok: false, message }
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireDeroule } = require('./deroule.js');
const { cheminDansProjet } = require('./embarquer.js');
const { adapterScene } = require('./adapter.js');
const { ecrireAtomique } = require('./fichiers.js');

const SECTION_EBAUCHE = /<section\b[^>]*\sdata-ebauche(?=[\s=>/])/i;

const estEbauche = (html) => SECTION_EBAUCHE.test(String(html || ''));

/** Scènes du déroulé dont le fichier est encore une ébauche (fichier absent : pas une ébauche, une scène manquante). */
function scenesEbauche(projet, deroule) {
  const ids = [];
  for (const s of (deroule && deroule.scenes) || []) {
    const f = cheminDansProjet(projet, s.fichier);
    if (!f) continue;
    let html = '';
    try { html = fs.readFileSync(f, 'utf8'); } catch { continue; }
    if (estEbauche(html)) ids.push(s.id);
  }
  return ids;
}

/** Nombres écrits en lettres que le compteur peut reprendre (« quatre degrés ») ; jamais « un », le plus souvent un article. */
const EN_LETTRES = { deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13,
  quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100, mille: 1000 };
const ESPACES = /[ \u00a0\u202f]/g;

/** Premier nombre écrit pour la scène (textes, texte dit, intention ; en chiffres d'abord, puis en lettres), au format du
 *  compteur (« 1 250 » -> 1250, « 3,5 » -> 3.5) ; null sinon : jamais la valeur d'exemple du style, un chiffre inventé. */
function nombreDeScene(scene) {
  const sources = [...Object.values((scene && scene.textes) || {}), scene && scene.voix && scene.voix.texte, scene && scene.intention]
    .filter((x) => typeof x === 'string');
  for (const t of sources) {
    const m = /(\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[.,](\d+))?/.exec(t);
    if (m) return `${m[1].replace(ESPACES, '')}${m[2] ? `.${m[2]}` : ''}`;
  }
  for (const t of sources) {
    const mot = t.toLowerCase().split(/[^a-zàâçéèêëîïôûùüÿœ-]+/).find((x) => EN_LETTRES[x]);
    if (mot) return String(EN_LETTRES[mot]);
  }
  return null;
}

/** Compteur sans nombre connu : la clause « nombre » retirée, « … » à la place du chiffre d'exemple. */
function sansCompteur(html) {
  return String(html).replace(/(<([a-zA-Z][\w-]*)\b[^>]*?)\sdata-tween=(["'])([^"']*)\3([^>]*>)[^<]*(?=<\/\2>)/g, (tout, avant, balise, q, valeur, apres) => {
    if (!/(^|;)\s*nombre\s/.test(valeur)) return tout;
    const reste = valeur.split(';').map((s) => s.trim()).filter((s) => s && !/^nombre\s/.test(s)).join('; ');
    return `${avant}${reste ? ` data-tween=${q}${reste}${q}` : ''}${apres}…`;
  });
}

const echapperAttribut = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const arrondi = (x) => Math.round(x * 100) / 100;

/**
 * Carte neutre d'une scène composée : ses textes (titre d'abord), un rond du décor qui dérive toute la scène (rien
 * d'immobile), « Scène en préparation » écrit par le style de base (aucun texte en dur dans la scène).
 */
function carteNeutre({ id, duree, textes = {}, derniere = false }) {
  const cles = Object.keys(textes).filter((k) => typeof textes[k] === 'string' && textes[k].trim());
  cles.sort((a, b) => (b === 'titre') - (a === 'titre'));
  // Décor jusqu'à la fin de la scène, voix comprise (data-dur="scene" s'arrête 1 s avant la fin sur la dernière).
  const lignes = cles.map((k, i) => {
    const balise = i === 0 ? 'h2' : 'p';
    const classe = i === 0 ? 'pm-ebauche-titre' : 'pm-ebauche-texte';
    return `    <${balise} class="${classe}" data-texte="${echapperAttribut(k)}" data-start="${arrondi(0.2 + 0.25 * i)}" data-dur="0.6" data-tween="opacity 0→1 cubic-out; --pm-eb-y 2cqh→0cqh cubic-out"></${balise}>`;
  });
  return [
    `<!-- Ébauche de la scène « ${id} » (pulse-motion ebauche) : point de départ, remplacé par la scène écrite. -->`,
    `<section data-scene="${echapperAttribut(id)}" data-ebauche class="pm-ebauche">`,
    `  <span class="pm-ebauche-rond" data-decor aria-hidden="true" data-start="0" data-dur="scene" data-tween="--dx 0cqh→8cqh sine-inout; --dy 0cqh→5cqh sine-inout"></span>`,
    '  <div class="pm-ebauche-carte">',
    ...lignes,
    `    <p class="pm-ebauche-note" aria-hidden="true" data-start="${arrondi(0.2 + 0.25 * cles.length)}" data-dur="0.6" data-tween="opacity 0→0.6"></p>`,
    '  </div>',
    '</section>',
    '',
  ].join('\n');
}

/** Scène toute faite adaptée, marquée data-ebauche ; son commentaire d'en-tête (consignes et valeurs d'exemple du style) est
 *  remplacé par celui de l'ébauche. */
function marquer(html, { id, type }) {
  const sans = String(html).replace(/^\s*<!--[\s\S]*?-->\s*/, '');
  const marque = estEbauche(sans) ? sans : sans.replace(/<section\b/i, '<section data-ebauche');
  return `<!-- Ébauche de la scène « ${id} » (pulse-motion ebauche) : scène toute faite « ${type} » du style, remplacée par la scène écrite. -->\n${marque}`;
}

function ecrireEbauche({ dossier, dossierStyles, suivi = null }) {
  const projet = path.resolve(dossier);
  const { deroule, erreurs } = lireDeroule(projet);
  if (!fs.existsSync(path.join(projet, 'deroule.json'))) return { ok: false, message: 'Aucune vidéo dans ce dossier : le déroulé n\'est pas encore écrit.' };
  if (!deroule || erreurs.length)return { ok: false, message: `Le déroulé contient des erreurs : ${erreurs.join(' ')}` };
  const { trouverStyle, messageStyleInconnu } = require('../styles.js');
  const st = trouverStyle(deroule.style, dossierStyles);
  if (!st) return { ok: false, message: messageStyleInconnu(deroule.style, dossierStyles) };
  const { charteFinale } = require('./fusion-charte.js');
  let logo = false;
  try { logo = Boolean(charteFinale(deroule, st.dossier, projet).logo); } catch { logo = Boolean(deroule.charte && deroule.charte.logo); }

  // Tout préparer avant d'écrire : un fichier hors du projet, ou une scène toute faite absente du style, n'écrit rien.
  const plan = [];
  const gardees = [];
  for (const [i, s] of deroule.scenes.entries()) {
    const fichier = cheminDansProjet(projet, s.fichier);
    if (!fichier) return { ok: false, message: `La scène « ${s.id} » : le fichier « ${s.fichier} » sort du dossier du projet.` };
    if (fs.existsSync(fichier)) { gardees.push(s.id); continue; }
    const derniere = i === deroule.scenes.length - 1;
    let html;
    if (s.type) {
      let modele;
      try { modele = fs.readFileSync(path.join(st.dossier, 'scenes', `${s.type}.html`), 'utf8'); } catch {
        return { ok: false, message: `Le style « ${deroule.style} » n'a pas de scène toute faite « ${s.type} ».` };
      }
      const nombre = s.type === 'chiffre' ? nombreDeScene(s) : null;
      html = marquer(adapterScene(modele, { type: s.type, id: s.id, duree: s.duree, textes: s.textes, derniere, logo, nombre }), { id: s.id, type: s.type });
      if (s.type === 'chiffre' && nombre === null) html = sansCompteur(html);
    } else {
      html = carteNeutre({ id: s.id, duree: s.duree, textes: s.textes, derniere });
    }
    plan.push({ id: s.id, fichier, html });
  }
  for (const [k, p] of plan.entries()) {
    fs.mkdirSync(path.dirname(p.fichier), { recursive: true });
    // Écriture atomique : l'aperçu, qui surveille scenes/, ne lit jamais un fichier à moitié écrit.
    ecrireAtomique(p.fichier, p.html);
    if (suivi) suivi(k + 1, plan.length, `scène ${k + 1} sur ${plan.length}`);
  }
  return { ok: true, ecrites: plan.map((p) => p.id), gardees };
}

/** Refus de l'export tant qu'il reste une ébauche (pour la personne, sans terme technique). */
function messageEbauches(ids) {
  const liste = ids.map((id) => `« ${id} »`).join(', ');
  return `La vidéo n'est pas encore finie : ${ids.length > 1 ? `les scènes ${liste} ne sont encore que des ébauches` : `la scène ${liste} n'est encore qu'une ébauche`}. Elles s'exportent une fois écrites.`;
}

module.exports = { estEbauche, scenesEbauche, nombreDeScene, sansCompteur, carteNeutre, ecrireEbauche, messageEbauches, SECTION_EBAUCHE };
