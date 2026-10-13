'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../moteur/particules/recette.js');

const S = R.SCHEMA;
const TYPES = ['nombre', 'intervalle', 'paire', 'couleur', 'choix', 'courbe', 'booleen', 'texte', 'valeur', 'liste', 'objet', 'dictionnaire'];
const CHARTE = { primaire: '#0a6cff', accent: '#b45309', texte: '#1a1a1a', fond: '#ffffff' };
const compiler = (r) => R.compiler(r, { dur: 2, graine: 7, charte: CHARTE });

/** Recette de départ : un émetteur racine « a » (une salve) qui lance le sous-émetteur « b ». */
function base() {
  return {
    version: 1,
    nom: 'essai',
    parametres: { p: { defaut: 1, min: 0, max: 10 } },
    emetteurs: [
      { nom: 'a', naissance: { salves: [{ t: 0, nombre: 5 }] }, a_la_mort: { emetteur: 'b' } },
      { nom: 'b', naissance: { nombre: 1 } },
    ],
  };
}

/** Valeur valide d'un nœud : exemple, sinon défaut, sinon objet de ses champs requis. */
function exemple(noeud) {
  if (noeud.exemple !== undefined && noeud.exemple !== null) return JSON.parse(JSON.stringify(noeud.exemple));
  if (noeud.defaut !== undefined && noeud.defaut !== null) return JSON.parse(JSON.stringify(noeud.defaut));
  if (noeud.type === 'objet') {
    const o = {};
    for (const [k, n] of Object.entries(noeud.champs)) if (n.requis) o[k] = exemple(n);
    return o;
  }
  if (noeud.type === 'liste') return [];
  if (noeud.type === 'dictionnaire') return {};
  throw new Error(`pas d'exemple pour « ${noeud.libelle} »`);
}

/** Feuilles du schéma : [{ chemin, noeud }] ; étape : nom de champ, '*' (élément), ou { variante } (type de force). */
function feuilles(noeud, chemin = []) {
  if (noeud.type === 'objet') {
    const r = [];
    for (const [k, n] of Object.entries(noeud.champs)) r.push(...feuilles(n, [...chemin, k]));
    if (noeud.variantes) {
      for (const [t, v] of Object.entries(noeud.variantes.types)) {
        for (const [k, n] of Object.entries(v.champs)) r.push(...feuilles(n, [...chemin, { variante: t }, k]));
      }
    }
    return r;
  }
  if (noeud.type === 'liste' || noeud.type === 'dictionnaire') return [{ chemin, noeud }, ...feuilles(noeud.element, [...chemin, '*'])];
  return [{ chemin, noeud }];
}
const cle = (chemin) => chemin.map((e) => (typeof e === 'object' ? e.variante : e)).join('.');

/** Recette de base où la feuille au chemin vaut v (undefined : conteneurs créés, feuille absente). */
function avec(chemin, v, contexte) {
  const r = base();
  let cible = r;
  let noeud = S;
  for (let i = 0; i < chemin.length; i++) {
    const etape = chemin[i];
    const fin = i === chemin.length - 1;
    if (typeof etape === 'object') {
      cible.type = etape.variante;
      noeud = { type: 'objet', champs: { ...noeud.champs, ...noeud.variantes.types[etape.variante].champs } };
      continue;
    }
    const n = noeud.champs[etape];
    if (fin) {
      if (v === undefined) delete cible[etape];
      else cible[etape] = JSON.parse(JSON.stringify(v));
      return r;
    }
    if (n.type === 'objet') {
      if (!(cible[etape] && typeof cible[etape] === 'object' && !Array.isArray(cible[etape]))) cible[etape] = exemple(n);
      cible = cible[etape];
      noeud = n;
    } else if (n.type === 'dictionnaire') {
      cible = cible[etape] = cible[etape] || {};
      i++; // '*' : l'entrée « p »
      if (i === chemin.length - 1) {
        if (v === undefined) delete cible.p;
        else cible.p = v;
        return r;
      }
      cible = cible.p = cible.p || exemple(n.element);
      noeud = n.element;
    } else if (n.type === 'liste') {
      i++; // '*'
      if (etape === 'emetteurs') {
        cible = cible.emetteurs[contexte === 'sous-emetteur' ? 1 : 0];
        noeud = n.element;
        continue;
      }
      cible[etape] = [exemple(n.element)];
      if (i === chemin.length - 1) {
        if (v !== undefined) cible[etape][0] = v;
        return r;
      }
      cible = cible[etape][0];
      noeud = n.element;
    }
  }
  return r;
}

const FEUILLES = feuilles(S).filter((f) => !['emetteurs', 'parametres', 'emetteurs.*'].includes(cle(f.chemin)));
// Feuilles déjà écrites dans la recette de base : leur absence change la recette, pas seulement la feuille.
const DANS_LA_BASE = new Set(['version', 'nom', 'parametres.*.defaut', 'parametres.*.min', 'parametres.*.max', 'emetteurs.*.nom',
  'emetteurs.*.naissance.salves', 'emetteurs.*.naissance.nombre', 'emetteurs.*.a_la_mort.emetteur']);

test('schéma : valeurs tirées des tables du compilateur, types connus, libellés, exemples', () => {
  const em = S.champs.emetteurs.element.champs;
  assert.deepEqual(em.naissance.champs.forme.champs.type.valeurs, Object.keys(R.CODES.forme));
  assert.deepEqual(em.forces.element.champs.type.valeurs, Object.keys(R.CODES.force));
  assert.deepEqual(Object.keys(em.forces.element.variantes.types), Object.keys(R.CODES.force), 'chaque force a ses champs décrits');
  assert.deepEqual(em.rendu.champs.type.valeurs, Object.keys(R.CODES.rendu));
  assert.deepEqual(em.rendu.champs.melange.valeurs, Object.keys(R.CODES.melange));
  assert.deepEqual(em.rendu.champs.texture.valeurs, Object.keys(R.CODES.texture).filter((t) => t !== 'image'));
  assert.equal(em.forces.maximum, R.FORCES_MAX);
  assert.equal(em.naissance.champs.salves.maximum, R.SALVES_MAX);
  for (const { chemin, noeud } of feuilles(S)) {
    assert.ok(TYPES.includes(noeud.type), `${cle(chemin)} : type « ${noeud.type} »`);
    assert.ok(typeof noeud.libelle === 'string' && noeud.libelle.length > 1, `${cle(chemin)} : libellé`);
    assert.ok('defaut' in noeud, `${cle(chemin)} : defaut (null s'il n'y en a pas)`);
    assert.doesNotThrow(() => exemple(noeud), cle(chemin));
  }
});

test('schéma : chaque champ du schéma, à sa valeur d\'exemple, compile', () => {
  for (const { chemin, noeud } of FEUILLES) {
    const r = compiler(avec(chemin, exemple(noeud), noeud.contexte));
    assert.equal(r.ok, true, `${cle(chemin)} : ${JSON.stringify(r.erreurs)}`);
  }
  // Raccourcis : une valeur seule à la place de l'objet.
  const raccourcis = avec(['emetteurs', '*', 'vie'], { taille: 0.5, couleur: '#ff0000', intensite: '2 * p' });
  assert.equal(compiler(raccourcis).ok, true);
});

test('schéma : la valeur par défaut d\'un champ est celle du compilateur', () => {
  for (const { chemin, noeud } of FEUILLES) {
    if (noeud.defaut === null || noeud.requis || DANS_LA_BASE.has(cle(chemin))) continue;
    const sans = compiler(avec(chemin, undefined, noeud.contexte));
    const explicite = compiler(avec(chemin, noeud.defaut, noeud.contexte));
    assert.equal(sans.ok, true, `${cle(chemin)} : ${JSON.stringify(sans.erreurs)}`);
    assert.deepEqual(explicite, sans, cle(chemin));
  }
});

test('schéma : les bornes min et max sont celles que le compilateur vérifie', () => {
  for (const { chemin, noeud } of FEUILLES) {
    // Planche : vérifiée seulement pour un rendu « planche » (image de assets/) ; couverte par particules-recette.
    if (noeud.type !== 'nombre' || cle(chemin).includes('planche')) continue;
    if (noeud.min !== undefined) {
      assert.equal(compiler(avec(chemin, noeud.min, noeud.contexte)).ok, true, `${cle(chemin)} = min`);
      assert.equal(compiler(avec(chemin, noeud.min - 1, noeud.contexte)).ok, false, `${cle(chemin)} < min`);
    }
    if (noeud.max !== undefined) {
      assert.equal(compiler(avec(chemin, noeud.max, noeud.contexte)).ok, true, `${cle(chemin)} = max`);
      assert.equal(compiler(avec(chemin, noeud.max + 1, noeud.contexte)).ok, false, `${cle(chemin)} > max`);
    }
  }
});

module.exports = { base, exemple, feuilles, avec, cle, compiler };
