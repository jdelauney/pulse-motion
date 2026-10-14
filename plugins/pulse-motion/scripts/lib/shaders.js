'use strict';
/* Pulse Motion – shaders WGSL à l'assemblage : fichiers (projet, puis bibliothèque), balises data-shader.
 *
 * chargeurShaders(projet, bibliotheque) -> charger(nom) -> { nom, json, code, fichier, source, erreurs } | null
 *   cherche shaders/<nom>.json et .wgsl dans le projet, puis dans la bibliothèque ; erreurs : JSON invalide, fichier .wgsl
 *   absent, contrôle (M.codeShader.validerShader) ; fichier : nom lisible dans les messages.
 * preparerShaders(html, { scene, charger, charte, projet, premierIndex }) -> { html, shaders, erreurs }
 *   <div data-shader="nom" data-calque="arriere|avant" data-ancre="#id" data-reglages="…" data-image="assets/…"
 *   data-start data-dur> : shader d'usage « fond » ; la balise reçoit data-pm-shader="N" (index dans M.donnees.shaders)
 *   ou data-pm-shader-erreur ; calque arrière par défaut ; ordre : rang parmi les data-shader de la scène.
 * donneeShader(src, extra) -> entrée de M.donnees.shaders ; embarquerImage(projet, chemin) -> { uri } | { erreur }
 * balisesShaders(html), modifierShader(html, ordre, changements) : atelier.
 */
const fs = require('node:fs');
const path = require('node:path');
const S = require('../../moteur/shaders/code.js');
const { lireAttributs } = require('./extraire.js');
const { echapperHTML } = require('./scenes.js');
const { cheminDansProjet, versDataURI } = require('./embarquer.js');
const { balisesAvec, reecrireBalise } = require('./effets.js');

const BIBLIOTHEQUE = path.resolve(__dirname, '..', '..', 'shaders');
const NOM = /^[a-z0-9-]+$/;
const BALISE = /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const CALQUES = ['arriere', 'avant'];

function chargeurShaders(projet, bibliotheque = BIBLIOTHEQUE) {
  const cache = new Map();
  const dossiers = [[path.join(projet, 'shaders'), 'projet'], [bibliotheque, 'bibliotheque']];
  return (nom) => {
    if (!NOM.test(nom)) throw new Error(`Nom de shader « ${nom} » invalide (minuscules, chiffres, tirets).`);
    if (cache.has(nom)) return cache.get(nom);
    let r = null;
    for (const [dossier, source] of dossiers) {
      const fichierJSON = path.join(dossier, `${nom}.json`);
      if (!fs.existsSync(fichierJSON)) continue;
      const fichier = source === 'projet' ? `shaders/${nom}.wgsl` : `bibliothèque : ${nom}.wgsl`;
      r = { nom, json: null, code: null, fichier, source, erreurs: [] };
      try { r.json = JSON.parse(fs.readFileSync(fichierJSON, 'utf8').replace(/^﻿/, '')); } catch (e) {
        r.erreurs.push({ regle: 'shader-invalide', message: `Shader « ${nom} » : le fichier ${fichier.replace(/\.wgsl$/, '.json')} n'est pas un JSON valide (${e.message}).` });
      }
      try { r.code = fs.readFileSync(path.join(dossier, `${nom}.wgsl`), 'utf8').replace(/^﻿/, ''); } catch {
        r.erreurs.push({ regle: 'shader-invalide', message: `Shader « ${nom} » : fichier ${fichier} introuvable.` });
      }
      if (!r.erreurs.length) r.erreurs = S.validerShader(nom, r.json, r.code);
      break;
    }
    cache.set(nom, r);
    return r;
  };
}

/** Image de assets/ en data: pour iChannel2. */
function embarquerImage(projet, chemin) {
  const absolu = /^assets\//.test(String(chemin)) ? cheminDansProjet(projet, chemin) : null;
  if (!absolu || !fs.existsSync(absolu)) return { erreur: `image « ${chemin} » introuvable dans assets/ du projet.` };
  try { return { uri: versDataURI(absolu) }; } catch (e) { return { erreur: `image « ${chemin} » : ${e.message}.` }; }
}

function donneeShader(src, extra) {
  return {
    usage: extra.usage, nom: src.nom, fichier: src.fichier,
    scene: extra.scene === undefined ? null : extra.scene,
    ordre: extra.ordre === undefined ? null : extra.ordre,
    rang: extra.rang === undefined ? null : extra.rang,
    calque: extra.calque || null, ancre: extra.ancre || null,
    duree: extra.duree === undefined ? null : extra.duree,
    code: src.code, parametres: src.json.parametres || {}, debord: src.json.debord || 0,
    valeurs: extra.valeurs, image: extra.image || null,
  };
}

function preparerShaders(html, { scene, charger, charte = {}, projet, premierIndex = 0 }) {
  const shaders = [];
  const erreurs = [];
  const source = String(html).replace(/<!--[\s\S]*?-->/g, '');
  const ids = new Set();
  for (const m of source.matchAll(BALISE)) {
    const a = lireAttributs(m[2]);
    if (a.id) ids.add(a.id);
  }
  let ordre = 0;
  const sortie = source.replace(BALISE, (tout, balise, texteAttributs) => {
    const a = lireAttributs(texteAttributs);
    if (!('data-shader' in a)) return tout;
    const position = ordre++;
    const fermante = /\/\s*$/.test(texteAttributs) ? ' /' : '';
    const attributs = texteAttributs.replace(/\s*\/\s*$/, '');
    const signaler = (liste) => {
      liste.forEach(({ regle, message }) => erreurs.push({ regle, gravite: 'erreur', scene, ...(a.id ? { element: a.id } : {}), message: `Scène « ${scene} » : ${message}` }));
      return `<${balise}${attributs} data-pm-shader-erreur="${echapperHTML(liste.map((e) => e.message).join(' '))}"${fermante}>`;
    };
    const nom = a['data-shader'].trim();
    let src;
    try { src = charger(nom); } catch (e) { return signaler([{ regle: 'shader-inconnu', message: e.message }]); }
    if (!src) return signaler([{ regle: 'shader-inconnu', message: `shader « ${nom} » introuvable (ni dans shaders/ du projet, ni dans la bibliothèque).` }]);
    if (src.erreurs.length) return signaler(src.erreurs);
    if (src.json.usage !== 'fond') return signaler([{ regle: 'usage-incompatible', message: `data-shader « ${nom} » : ce shader est une « ${src.json.usage} », « fond » attendu (une transition ou un post-traitement se déclare dans deroule.json).` }]);
    const calque = (a['data-calque'] || 'arriere').trim();
    if (!CALQUES.includes(calque)) return signaler([{ regle: 'shader-invalide', message: `data-calque « ${calque} » : arriere ou avant.` }]);
    let ancre = null;
    if (a['data-ancre'] !== undefined) {
      const m = /^#([A-Za-z0-9_-]+)$/.exec(a['data-ancre'].trim());
      if (!m || !ids.has(m[1])) return signaler([{ regle: 'ancre-introuvable', message: `data-ancre « ${a['data-ancre']} » ne désigne aucun élément de la scène (forme attendue : #id).` }]);
      ancre = m[1];
    }
    const v = S.valeursShader(src.json, a['data-reglages'] || '', charte);
    if (v.erreurs.length) return signaler(v.erreurs.map((e) => ({ regle: 'reglage-invalide', message: e.message })));
    let image = null;
    if (a['data-image'] !== undefined) {
      const im = embarquerImage(projet, a['data-image'].trim());
      if (im.erreur) return signaler([{ regle: 'fichier-introuvable', message: `data-image : ${im.erreur}` }]);
      image = im.uri;
    }
    const index = premierIndex + shaders.length;
    shaders.push(donneeShader(src, { usage: 'fond', scene, ordre: position, calque, ancre, valeurs: v.valeurs, image }));
    return `<${balise}${attributs} data-pm-shader="${index}"${fermante}>`;
  });
  return { html: sortie, shaders, erreurs };
}

function balisesShaders(html) { return balisesAvec(html, 'data-shader'); }

function modifierShader(html, ordre, changements) {
  const b = balisesShaders(html)[ordre];
  if (!b) return null;
  return html.slice(0, b.debut) + reecrireBalise(b.texte, changements) + html.slice(b.fin);
}

module.exports = { BIBLIOTHEQUE, chargeurShaders, embarquerImage, donneeShader, preparerShaders, balisesShaders, modifierShader };
