/* Pulse Motion – expressions des recettes de particules.
 *
 *   "30cqh * vitesse", "nombre / dur", "(a + 2) * -1"
 *
 * Quatre opérations, parenthèses, moins unaire, nombres (unité cqh facultative, sans effet),
 * noms de paramètres. Analyseur écrit à la main : jamais d'eval.
 *
 * Module pur : chargé tel quel dans la page (global M.expression) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.expression = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var JETON = /\s*(?:(\d+\.?\d*|\.\d+)(cqh)?|([a-z_][a-z0-9_]*)|([-+*\/()]))/y;

  function decouper(texte) {
    var s = String(texte), jetons = [], pos = 0;
    while (pos < s.length) {
      if (/^\s+$/.test(s.slice(pos))) break;
      JETON.lastIndex = pos;
      var m = JETON.exec(s);
      if (!m) throw new Error('« ' + s.slice(pos).trim().charAt(0) + ' » inattendu dans « ' + s + ' »');
      if (m[1] !== undefined) jetons.push({ type: 'nombre', valeur: parseFloat(m[1]) });
      else if (m[3] !== undefined) jetons.push({ type: 'nom', valeur: m[3] });
      else jetons.push({ type: m[4] });
      pos = JETON.lastIndex;
    }
    return jetons;
  }

  /** "30cqh * vitesse" -> arbre { type: 'nombre' | 'nom' | 'neg' | 'op', … } ; lève une Error en français. */
  function analyser(texte) {
    var jetons = decouper(texte);
    var i = 0;
    function voir() { return jetons[i]; }
    function attendu(quoi) { return new Error(quoi + ' attendu dans « ' + texte + ' »'); }

    function expression() {
      var a = terme();
      while (voir() && (voir().type === '+' || voir().type === '-')) {
        var op = jetons[i++].type;
        a = { type: 'op', op: op, a: a, b: terme() };
      }
      return a;
    }
    function terme() {
      var a = facteur();
      while (voir() && (voir().type === '*' || voir().type === '/')) {
        var op = jetons[i++].type;
        a = { type: 'op', op: op, a: a, b: facteur() };
      }
      return a;
    }
    function facteur() {
      var j = jetons[i++];
      if (!j) throw attendu('une valeur');
      if (j.type === '-') return { type: 'neg', a: facteur() };
      if (j.type === 'nombre') return { type: 'nombre', valeur: j.valeur };
      if (j.type === 'nom') return { type: 'nom', nom: j.valeur };
      if (j.type === '(') {
        var e = expression();
        if (!voir() || voir().type !== ')') throw attendu('« ) »');
        i++;
        return e;
      }
      throw new Error('« ' + j.type + ' » mal placé dans « ' + texte + ' »');
    }

    if (!jetons.length) throw new Error('expression vide');
    var arbre = expression();
    if (i < jetons.length) {
      var reste = jetons[i];
      throw new Error('« ' + (reste.valeur !== undefined ? reste.valeur : reste.type) + ' » en trop dans « ' + texte + ' »');
    }
    return arbre;
  }

  function calculer(n, valeurs, texte) {
    if (n.type === 'nombre') return n.valeur;
    if (n.type === 'nom') {
      if (!Object.prototype.hasOwnProperty.call(valeurs, n.nom) || typeof valeurs[n.nom] !== 'number') {
        var noms = Object.keys(valeurs).filter(function (k) { return typeof valeurs[k] === 'number'; });
        throw new Error('« ' + n.nom + ' » inconnu dans « ' + texte + ' » (noms possibles : ' + (noms.join(', ') || 'aucun') + ')');
      }
      return valeurs[n.nom];
    }
    if (n.type === 'neg') return -calculer(n.a, valeurs, texte);
    var a = calculer(n.a, valeurs, texte);
    var b = calculer(n.b, valeurs, texte);
    if (n.op === '+') return a + b;
    if (n.op === '-') return a - b;
    if (n.op === '*') return a * b;
    if (b === 0) throw new Error('division par zéro dans « ' + texte + ' »');
    return a / b;
  }

  /** evaluer("nombre / dur", { nombre: 300, dur: 2 }) -> 150 */
  function evaluer(texte, valeurs) {
    var r = calculer(analyser(texte), valeurs || {}, texte);
    if (!isFinite(r)) throw new Error('résultat non fini pour « ' + texte + ' »');
    return r;
  }

  return { analyser: analyser, evaluer: evaluer };
});
