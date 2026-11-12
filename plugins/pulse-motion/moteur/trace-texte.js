/* Pulse Motion – texte sur un tracé (spec S9, 5.5).
 *
 *   <svg class="pm-sur-trace" viewBox="0 0 1000 400"><path id="arc-1" d="M50 350 Q500 0 950 350" fill="none"/>
 *     <text><textPath href="#arc-1" data-texte="slogan" data-start="0.5" data-sur-trace="defile 100→0 0+3 sine-inout"></textPath></text></svg>
 *
 * data-sur-trace="defile <de>→<à> <début>+<durée> [courbe]" : startOffset (en % du tracé) interpolé, sine-inout par défaut ;
 * data-sur-trace="ecrit <début>+<durée>" : le texte est découpé en <tspan> (graphèmes, dans la langue de la vidéo) qui
 * apparaissent tour à tour (fill-opacity). Début et durée en secondes depuis l'apparition de l'élément (data-start), ou en
 * temps musicaux (« 2t ») avec un tempo. Avant le début : la valeur de départ ; après la fin : celle d'arrivée.
 * Un <tspan> ne prend pas de transform dans Chrome : sur un <textPath>, data-lettres n'accepte que frappe et fondu
 * (moteur/lettres.js). Couleur : .pm-sur-trace text { fill: currentColor } (moteur/briques.css), mesurée comme un texte.
 *
 * Pur pour l'analyse (Node : require ; page : M.analyserSurTrace, M.valeurSurTrace, M.lettresEcrites) ; M.demarrerTraces()
 * branche les tracés de la page sur l'horloge (M.surRendu). Dépend de courbes et minutage (global M dans la page).
 */
(function (racine, fabrique) {
  var nodeJS = typeof require === 'function' && typeof module === 'object';
  var C = nodeJS ? require('./courbes.js') : racine.M;
  var Mi = nodeJS ? require('./minutage.js') : racine.M;
  var api = fabrique(C, Mi, racine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; Object.assign(racine.M, api); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, Mi, racine) {
  'use strict';

  var PLAGE = /^([^+]+)\+([^+]+)$/;
  var NOMBRE = /^-?\d*\.?\d+%?$/;

  function arrondi(x) { return Math.round(x * 1000) / 1000; }

  function lireTemps(texte, attribut, dureeTemps) {
    var lu = Mi.lireSecondes(texte, dureeTemps);
    if (lu.erreur === 'tempo-absent') throw new Error('data-sur-trace : « ' + texte + ' » est en temps musicaux, mais le déroulé n\'a pas de « tempo » (« ' + attribut + ' »).');
    if (lu.erreur) throw new Error('data-sur-trace : temps « ' + texte + ' » illisible dans « ' + attribut + ' » (ex. 0+3, ou 1t+2t avec un tempo).');
    return lu.valeur;
  }

  /** "defile 100→0 0+3 sine-inout" | "ecrit 0+2" -> { mode, de?, a?, debut, duree, nomCourbe?, courbe? } ; erreur en français. */
  function analyserSurTrace(texte, dureeTemps) {
    var brut = String(texte == null ? '' : texte).trim();
    var mots = brut.replace(/->/g, '→').split(/\s+/).filter(Boolean);
    var mode = mots[0];
    if (mode === 'defile') {
      if (!mots[1] || mots[1].indexOf('→') < 0) throw new Error('data-sur-trace « ' + brut + ' » : écrire « defile départ→arrivée début+durée [courbe] » (positions en % du tracé, ex. defile 100→0 0+3).');
      var bornes = mots[1].split('→');
      if (!NOMBRE.test(bornes[0]) || !NOMBRE.test(bornes[1])) throw new Error('data-sur-trace « ' + brut + ' » : positions « ' + mots[1] + ' » illisibles (en % du tracé, ex. 100→0).');
      var plage = PLAGE.exec(mots[2] || '');
      if (!plage) throw new Error('data-sur-trace « ' + brut + ' » : plage « début+durée » manquante (ex. 0+3).');
      var nomCourbe = mots[3] || 'sine-inout';
      var courbe;
      try { courbe = C.courbeNommee(nomCourbe); } catch (e) { throw new Error('data-sur-trace « ' + brut + ' » : ' + e.message); }
      return { mode: 'defile', de: parseFloat(bornes[0]), a: parseFloat(bornes[1]), debut: lireTemps(plage[1], brut, dureeTemps), duree: lireTemps(plage[2], brut, dureeTemps), nomCourbe: nomCourbe, courbe: courbe };
    }
    if (mode === 'ecrit') {
      var p = PLAGE.exec(mots[1] || '');
      if (!p || mots.length > 2) throw new Error('data-sur-trace « ' + brut + ' » : écrire « ecrit début+durée » (ex. ecrit 0+2).');
      return { mode: 'ecrit', debut: lireTemps(p[1], brut, dureeTemps), duree: lireTemps(p[2], brut, dureeTemps) };
    }
    throw new Error('data-sur-trace « ' + brut + ' » : mode « ' + (mode || '') + ' » inconnu (defile ou ecrit).');
  }

  /** startOffset (%) de « defile » à l'instant local (secondes depuis l'apparition de l'élément). */
  function valeurSurTrace(spec, local) {
    if (local <= spec.debut) return arrondi(spec.de);
    if (!(spec.duree > 0) || local >= spec.debut + spec.duree) return arrondi(spec.a);
    return arrondi(spec.de + (spec.a - spec.de) * spec.courbe((local - spec.debut) / spec.duree));
  }

  /** Nombre de lettres écrites de « ecrit » sur n, à l'instant local : la lettre i apparaît à début + durée × i / n. */
  function lettresEcrites(spec, local, n) {
    if (local < spec.debut - 1e-9) return 0;
    if (!(spec.duree > 0)) return n;
    return Math.min(n, Math.floor((local - spec.debut) * n / spec.duree + 1e-9) + 1);
  }

  var SVG = 'http://www.w3.org/2000/svg';

  function graphemes(texte) {
    var M = racine.M || {};
    if (racine.Intl && Intl.Segmenter) {
      var langue = (M.donnees && M.donnees.langue) || 'fr';
      return Array.prototype.map.call(Array.from(new Intl.Segmenter(langue, { granularity: 'grapheme' }).segment(texte)), function (s) { return s.segment; });
    }
    return Array.from(texte);
  }

  /** Page : lit les [data-sur-trace], découpe ceux qui s'écrivent, et pose leur état à chaque rendu. */
  function demarrerTraces() {
    var M = racine.M;
    var traces = [];
    var scenes = {};
    (M.minutage ? M.minutage.scenes : []).forEach(function (s) { scenes[s.id] = s; });
    document.querySelectorAll('#pm-scene > section[data-scene] [data-sur-trace]').forEach(function (el) {
      var sec = el.closest('section[data-scene]');
      var id = sec.getAttribute('data-scene');
      var info = scenes[id];
      if (!info) return;
      var nom = el.id || el.getAttribute('data-texte') || 'textPath';
      var spec;
      try {
        spec = analyserSurTrace(el.getAttribute('data-sur-trace'), M.dureeTemps);
        if (spec.mode === 'ecrit' && el.hasAttribute('data-lettres')) throw new Error('« ecrit » découpe déjà le texte lettre par lettre : retirer data-lettres.');
      } catch (e) {
        var err = { regle: 'sur-trace-invalide', scene: id, message: 'Scène « ' + id + ' », texte « ' + nom + ' » : ' + e.message };
        if (M.erreurs) M.erreurs.push(err);
        console.warn('[Pulse Motion] ' + err.message);
        return;
      }
      // Apparition : l'élément minuté, ou son ancêtre minuté le plus proche ; sinon le début de la scène.
      var base = info.debut;
      var elements = (M.minutage.elements && M.minutage.elements[id]) || {};
      for (var p = el; p && p !== sec; p = p.parentNode) {
        var cle = p.getAttribute && p.getAttribute('data-pm-cle');
        if (cle && elements[cle]) { base = elements[cle].debut; break; }
      }
      var lettres = [];
      if (spec.mode === 'ecrit') {
        var texte = el.textContent;
        el.setAttribute('aria-label', texte.replace(/\s+/g, ' ').trim());
        el.textContent = '';
        graphemes(texte).forEach(function (g) {
          var t = document.createElementNS(SVG, 'tspan');
          t.textContent = g;
          if (!/^\s$/.test(g)) lettres.push(t);
          el.appendChild(t);
        });
      }
      traces.push({ el: el, sec: sec, id: id, spec: spec, base: base, rythme: info.rythme || 1, lettres: lettres, dernier: null });
    });
    if (!traces.length) return;
    function poser(t) {
      var visibles = M.scenesVisibles(M.minutage, t);
      traces.forEach(function (x) {
        if (visibles.indexOf(x.id) < 0) return;
        var local = (M.tempsVuPar(x.el, t) - x.base) * x.rythme;
        if (x.spec.mode === 'defile') {
          var v = valeurSurTrace(x.spec, local) + '%';
          if (v !== x.dernier) { x.el.setAttribute('startOffset', v); x.dernier = v; }
        } else {
          var k = lettresEcrites(x.spec, local, x.lettres.length);
          if (k !== x.dernier) {
            x.lettres.forEach(function (l, i) { l.setAttribute('fill-opacity', i < k ? '1' : '0'); });
            x.dernier = k;
          }
        }
      });
    }
    M.surRendu(poser);
    poser(M.temps());
  }

  return { analyserSurTrace: analyserSurTrace, valeurSurTrace: valeurSurTrace, lettresEcrites: lettresEcrites, demarrerTraces: demarrerTraces };
});
