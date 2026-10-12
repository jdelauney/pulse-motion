/* Pulse Motion – texte lettre par lettre ou mot par mot.
 *
 *   <h1 data-texte="titre" data-start="0.4" data-lettres="onde" data-pas="0.03"></h1>
 *   <p data-texte="detail" data-mots="monte"></p>
 *
 * Au démarrage, le texte (déjà injecté par l'assemblage) est découpé : chaque mot dans un
 * span.pm-mot insécable, chaque lettre dans un span.pm-lettre. Chaque morceau animé porte
 * --pm-i (rang, espaces non comptés) ; l'élément porte --pm-n (nombre de morceaux) et --pm-pas
 * (écart entre deux morceaux). Les animations pm-l-<effet> sont dans base.css et se calent,
 * comme toute animation, sur l'élément minuté le plus proche.
 * Navigateur seulement ; dépend de minutage (M.lireSecondes).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};

  // Écart par défaut entre deux lettres, en secondes ; entre deux mots : PAS_MOTS.
  var EFFETS = { monte: 0.05, flou: 0.05, frappe: 0.04, onde: 0.02, chute: 0.05 };
  var PAS_MOTS = 0.12;
  var BLANC = /^[ \t\n\r]+$/;

  function graphemes(mot) {
    if (racine.Intl && Intl.Segmenter) {
      return Array.prototype.map.call(Array.from(new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(mot)), function (s) { return s.segment; });
    }
    return Array.from(mot);
  }

  function span(classe, texte) {
    var s = document.createElement('span');
    s.className = classe;
    if (texte !== undefined) s.textContent = texte;
    return s;
  }

  /** Découpe un élément ; -> message d'erreur ou null. */
  function decouperElement(el, idScene, dureeTemps) {
    var parLettres = el.hasAttribute('data-lettres');
    var attribut = parLettres ? 'data-lettres' : 'data-mots';
    var effet = el.getAttribute(attribut);
    var cle = el.id || el.getAttribute('data-texte') || el.tagName.toLowerCase();
    var debut = 'Scène « ' + idScene + ' », élément « ' + cle + ' » : ';
    if (!Object.prototype.hasOwnProperty.call(EFFETS, effet)) {
      return { regle: 'lettres-invalide', message: debut + attribut + ' « ' + effet + ' » inconnu (effets : ' + Object.keys(EFFETS).join(', ') + ').' };
    }
    var pas = parLettres ? EFFETS[effet] : PAS_MOTS;
    var brut = el.getAttribute('data-pas');
    if (brut !== null) {
      var lu = M.lireSecondes(brut, dureeTemps);
      if (lu.erreur === 'tempo-absent') return { regle: 'tempo-absent', message: debut + 'data-pas « ' + brut + ' » est en temps musicaux, mais le déroulé n\'a pas de « tempo ».' };
      if (lu.erreur) return { regle: 'lettres-invalide', message: debut + 'data-pas « ' + brut + ' » n\'est pas un nombre de secondes (ex. 0.04, ou 0.25t avec un tempo).' };
      pas = lu.valeur;
    }
    // Morceaux de texte et retours à la ligne (<br>, posés par l'assemblage pour « \n ») ;
    // une autre balise dans le texte est aplatie en son texte.
    var morceaux = [];
    Array.prototype.forEach.call(el.childNodes, function (noeud) {
      if (noeud.nodeName === 'BR') morceaux.push(null);
      else morceaux.push(noeud.textContent);
    });
    var texte = morceaux.map(function (m) { return m === null ? ' ' : m; }).join('');
    if (texte.trim() === '') return null;

    var n = 0;
    var fragment = document.createDocumentFragment();
    var suite = [];
    morceaux.forEach(function (m) {
      if (m === null) suite.push(null);
      else suite.push.apply(suite, m.split(/([ \t\n\r]+)/));
    });
    suite.forEach(function (morceau) {
      if (morceau === '') return;
      if (morceau === null) { fragment.appendChild(document.createElement('br')); return; }
      if (BLANC.test(morceau)) { fragment.appendChild(document.createTextNode(morceau)); return; }
      var mot = span('pm-mot');
      mot.setAttribute('aria-hidden', 'true');
      if (parLettres) {
        graphemes(morceau).forEach(function (g) {
          var lettre = span('pm-lettre', g);
          // Une espace insécable reste dans le mot mais ne compte pas comme une lettre.
          if (/^\s$/.test(g)) lettre.className = 'pm-lettre pm-blanc';
          else lettre.style.setProperty('--pm-i', String(n++));
          mot.appendChild(lettre);
        });
      } else {
        mot.textContent = morceau;
        mot.style.setProperty('--pm-i', String(n++));
      }
      fragment.appendChild(mot);
    });
    el.setAttribute('aria-label', texte.replace(/\s+/g, ' ').trim());
    el.textContent = '';
    el.appendChild(fragment);
    el.style.setProperty('--pm-n', String(n));
    el.style.setProperty('--pm-pas', pas + 's');
    return null;
  }

  /** Découpe les éléments [data-lettres] et [data-mots] d'une section ; -> erreurs [{ regle, scene, message }]. */
  M.decouper = function (section, idScene, dureeTemps) {
    var erreurs = [];
    section.querySelectorAll('[data-lettres],[data-mots]').forEach(function (el) {
      var e = decouperElement(el, idScene, dureeTemps);
      if (e) erreurs.push({ regle: e.regle, scene: idScene, message: e.message });
    });
    return erreurs;
  };
  M.EFFETS_LETTRES = EFFETS;
  // Sous Node (controler.js) : la liste des effets seulement.
  if (typeof module === 'object' && module.exports) module.exports = { EFFETS: EFFETS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
