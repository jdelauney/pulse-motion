'use strict';
/* Pulse Motion – effets de particules d'une scène : recettes, réglages, compilation.
 *
 * Une scène pose un effet avec <div data-effet="nom" data-ancre="#id" data-calque="avant|arriere"
 * data-reglages="nom: valeur; …" data-graine="7" data-start="…" data-dur="…"></div>.
 * Les recettes sont cherchées dans <projet>/effets/ puis dans la bibliothèque du plugin.
 * Chaque balise reçoit data-pm-effet="N" (index dans M.donnees.effets) ou data-pm-effet-erreur.
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireAttributs } = require('./extraire.js');
const { cheminDansProjet, versDataURI } = require('./embarquer.js');
const { echapperHTML } = require('./scenes.js');
const R = require('../../moteur/particules/recette.js');
const { lireSecondes } = require('../../moteur/minutage.js');

const NOM = /^[a-z0-9-]+$/;
const BALISE = /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const CALQUES = ['avant', 'arriere'];

/** charger(nom) -> recette JSON (projet d'abord, puis bibliothèque) | null ; lève une ErreurRecette si le JSON est cassé. */
function chargeurRecettes(projet, bibliotheque) {
  const cache = new Map();
  const dossiers = [[path.join(projet, 'effets'), 'du projet'], [bibliotheque, 'de la bibliothèque']];
  return (nom) => {
    if (!NOM.test(nom)) throw R.ErreurRecette('effet-invalide', `Nom d'effet « ${nom} » invalide (minuscules, chiffres, tirets).`);
    if (cache.has(nom)) return cache.get(nom);
    let recette = null;
    for (const [dossier, ou] of dossiers) {
      const fichier = path.join(dossier, `${nom}.json`);
      if (!fs.existsSync(fichier)) continue;
      try { recette = JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch (e) {
        throw R.ErreurRecette('effet-invalide', `Effet « ${nom} » : le fichier « effets/${nom}.json » ${ou} n'est pas un JSON valide (${e.message}).`);
      }
      break;
    }
    cache.set(nom, recette);
    return recette;
  };
}

/** Hachage FNV-1a 32 bits : graine par défaut d'un effet. */
function fnv1a(texte) {
  let h = 0x811c9dc5;
  for (const octet of Buffer.from(String(texte), 'utf8')) {
    h ^= octet;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * preparerEffets(html, { scene, projet, bibliotheque, charte, premierIndex, dureeTemps })
 * dureeTemps : secondes par temps musical (tempo du déroulé), pour un data-dur écrit en « t ».
 * -> { html, effets: [{ scene, ordre, calque, ancre, effet }], erreurs: [{ regle, gravite, scene, element?, message }] }
 * ordre : position de la balise parmi les data-effet de la scène (erreurs comprises).
 */
function preparerEffets(html, { scene, projet, bibliotheque, charte = {}, premierIndex = 0, dureeTemps = null }) {
  const effets = [];
  const erreurs = [];
  const source = String(html).replace(/<!--[\s\S]*?-->/g, '');
  const ids = new Set();
  for (const m of source.matchAll(BALISE)) {
    const a = lireAttributs(m[2]);
    if (a.id) ids.add(a.id);
  }
  const charger = chargeurRecettes(projet, bibliotheque);
  let ordre = 0;

  const sortie = source.replace(BALISE, (tout, balise, texteAttributs) => {
    const a = lireAttributs(texteAttributs);
    if (!('data-effet' in a)) return tout;
    const position = ordre++;
    const fermante = /\/\s*$/.test(texteAttributs) ? ' /' : '';
    const attributs = texteAttributs.replace(/\s*\/\s*$/, '');
    const element = a.id || undefined;
    const signaler = (liste) => {
      liste.forEach(({ regle, message }) => erreurs.push({ regle, gravite: 'erreur', scene, ...(element ? { element } : {}), message: `Scène « ${scene} » : ${message}` }));
      return `<${balise}${attributs} data-pm-effet-erreur="${echapperHTML(liste.map((e) => e.message).join(' '))}"${fermante}>`;
    };

    const nom = a['data-effet'].trim();
    const calque = (a['data-calque'] || 'avant').trim();
    if (!CALQUES.includes(calque)) return signaler([{ regle: 'effet-invalide', message: `data-calque « ${calque} » : avant ou arriere.` }]);
    let ancre = null;
    if (a['data-ancre'] !== undefined) {
      const m = /^#([A-Za-z0-9_-]+)$/.exec(a['data-ancre'].trim());
      if (!m || !ids.has(m[1])) return signaler([{ regle: 'ancre-introuvable', message: `data-ancre « ${a['data-ancre']} » ne désigne aucun élément de la scène (forme attendue : #id).` }]);
      ancre = m[1];
    }
    let graine = fnv1a(`${scene}|${position}|${nom}`);
    if (a['data-graine'] !== undefined) {
      if (!/^\d+$/.test(a['data-graine'].trim())) return signaler([{ regle: 'effet-invalide', message: `data-graine « ${a['data-graine']} » : nombre entier attendu.` }]);
      graine = Number(a['data-graine'].trim()) >>> 0;
    }
    // Durée illisible ou sans tempo : 1 s, comme le minutage (qui signale l'erreur).
    const lu = lireSecondes(String(a['data-dur'] || ''), dureeTemps);
    const dur = lu.erreur ? 1 : lu.valeur;

    let compile;
    try {
      compile = R.compiler(R.resoudre(nom, charger), { reglages: a['data-reglages'] || '', charte, dur, graine });
    } catch (e) {
      if (!e.regle) throw e;
      compile = { ok: false, erreurs: [{ regle: e.regle, message: e.message }] };
    }
    if (!compile.ok) return signaler(compile.erreurs);

    for (const em of compile.effet.emetteurs) {
      if (!em.rendu.textureFichier) continue;
      const absolu = cheminDansProjet(projet, em.rendu.textureFichier);
      if (!absolu || !fs.existsSync(absolu)) {
        return signaler([{ regle: 'fichier-introuvable', message: `texture « ${em.rendu.textureFichier} » de l'effet « ${nom} » introuvable.` }]);
      }
      em.rendu.textureImage = versDataURI(absolu);
    }

    const index = premierIndex + effets.length;
    effets.push({ scene, ordre: position, calque, ancre, effet: compile.effet });
    return `<${balise}${attributs} data-pm-effet="${index}"${fermante}>`;
  });

  return { html: sortie, effets, erreurs };
}

module.exports = { chargeurRecettes, fnv1a, preparerEffets };
