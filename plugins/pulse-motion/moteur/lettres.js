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
 * Saisie (data-lettres="saisie", spec S6 5.9) : chaque lettre porte son délai --pm-d (paquets irréguliers à graine, voir
 * paquetsSaisie) ; la dernière lettre de chaque paquet porte data-pm-curseur et --pm-dc (le curseur de saisie jusqu'au
 * paquet suivant), la dernière data-pm-curseur="fin" (curseur qui clignote à 1 Hz) ; CSS dans moteur/ecran.css.
 * Légende en morceaux (data-morceaux="2" ou "3", spec Styles et réalisation 5.12, style info-sans-son) : le texte injecté est
 * coupé aux limites de mots en 2 ou 3 morceaux de longueur proche (couperMorceaux) ; chaque mot porte --pm-i, le rang de son
 * morceau (les mots d'un morceau arrivent ensemble), l'élément --pm-n et --pm-pas (0,12 s, ou data-pas). data-mot-cle="<mot>"
 * pose un bloc d'accent sur ce mot (première occurrence, sans accents ni casse ; « auto » : le mot le plus long) : un seul
 * mot-clé par légende. Aucune syntaxe dans le texte du déroulé : changer de style reste propre. Animations dans base.css.
 * Écrit à la main (data-lettres="ecrit", spec Styles et réalisation 5.13, styles dessinés) : chaque lettre s'écrit de gauche à
 * droite, deux lettres à la fois au plus ; sans data-pas, le pas suit data-dur pour que la dernière lettre finisse à son
 * échéance (pas = durée / (n + 1), lettre en deux pas, --pm-lettre-dur posé sur l'élément). Animation dans base.css.
 * Navigateur seulement ; dépend de minutage (M.lireSecondes). Sous Node : EFFETS, paquetsSaisie, couperMorceaux, motCleDe.
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};

  // Écart par défaut entre deux lettres, en secondes ; entre deux mots : PAS_MOTS.
  var EFFETS = { monte: 0.05, flou: 0.05, frappe: 0.04, onde: 0.02, chute: 0.05, brouille: 0.04, saisie: 0.04, ecrit: 0.06 };
  // Écrit à la main : une lettre dure LETTRE_ECRIT pas (deux lettres s'écrivent ensemble au plus).
  var LETTRE_ECRIT = 2;
  // Saisie (spec S6, 5.9) : paquets de 1 à 3 lettres (probabilités 0,6, 0,3, 0,1), 45 à 140 ms entre deux paquets, × 2,5
  // après une espace ou une ponctuation ; graine : le texte et la scène. Valeurs propres à Pulse Motion ; la même suite pilote
  // les touches du tournage (plan 2 de S6).
  var SAISIE = { paquets: [0.6, 0.9], ecartMin: 0.045, ecartMax: 0.14, pause: 2.5 };
  var PAUSE_SAISIE = /[\s.,;:!?…»)\]]/;
  // Texte brouillé : signes tirés au hasard (même tirage pour la même image) avant la vraie lettre.
  var SIGNES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=?';
  var PAS_MOTS = 0.12;
  var BLANC = /^[ \t\n\r]+$/;
  // Légende en morceaux : 2 ou 3 morceaux, 0,12 s entre deux (chiffres de lemo-opuscar, caption-news § 4, MIT).
  var MORCEAUX = ['2', '3'];
  var PAS_MORCEAUX = 0.12;

  function graphemes(mot) {
    if (racine.Intl && Intl.Segmenter) {
      return Array.prototype.map.call(Array.from(new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(mot)), function (s) { return s.segment; });
    }
    return Array.from(mot);
  }

  function graineSaisie(texte) {
    var h = 0x811c9dc5;
    for (var i = 0; i < texte.length; i++) { h ^= texte.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  /** Délais de saisie (s) de chaque caractère de `caracteres` (graphèmes, espaces compris) : un par caractère ; les
   *  caractères d'un même paquet ont le même délai. -> { delais, fins } (fins[i] : vrai pour le dernier caractère d'un paquet). */
  function paquetsSaisie(caracteres, graine) {
    var liste = typeof caracteres === 'string' ? graphemes(caracteres) : caracteres;
    var a = graineSaisie(String(graine === undefined ? '' : graine) + '|' + liste.join('')) | 0;
    function hasard() {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    var delais = [], fins = [];
    var t = 0, i = 0;
    while (i < liste.length) {
      var r = hasard();
      var n = r < SAISIE.paquets[0] ? 1 : r < SAISIE.paquets[1] ? 2 : 3;
      var j = Math.min(liste.length, i + n);
      for (var k = i; k < j; k++) { delais.push(Math.round(t * 1000) / 1000); fins.push(k === j - 1); }
      var ecart = SAISIE.ecartMin + (SAISIE.ecartMax - SAISIE.ecartMin) * hasard();
      if (PAUSE_SAISIE.test(liste[j - 1])) ecart *= SAISIE.pause;
      t += ecart;
      i = j;
    }
    return { delais: delais, fins: fins, duree: Math.round(t * 1000) / 1000 };
  }

  function span(classe, texte) {
    var s = document.createElement('span');
    s.className = classe;
    if (texte !== undefined) s.textContent = texte;
    return s;
  }

  /** Longueur d'un mot pour l'équilibre des morceaux : ses caractères (graphèmes). */
  function longueur(mot) { return graphemes(mot).length; }

  /**
   * Coupe une suite de mots en n morceaux consécutifs de longueur proche (espaces comprises) : le plus long morceau le plus
   * court possible, puis l'écart le plus petit, puis la première coupe. -> tailles des morceaux, en mots (un morceau par mot
   * s'il y a n mots ou moins).
   */
  function couperMorceaux(mots, n) {
    var k = mots.length;
    if (k <= n) return mots.map(function () { return 1; });
    var l = mots.map(longueur);
    var poids = function (a, b) { var t = b - a - 1; for (var i = a; i < b; i++) t += l[i]; return t; };
    var meilleur = null;
    var essayer = function (coupes) {
      var bornes = [0].concat(coupes, [k]);
      var tailles = [], longs = [];
      for (var i = 0; i < bornes.length - 1; i++) { tailles.push(bornes[i + 1] - bornes[i]); longs.push(poids(bornes[i], bornes[i + 1])); }
      var max = Math.max.apply(null, longs);
      var moy = longs.reduce(function (a, b) { return a + b; }, 0) / longs.length;
      var ecart = longs.reduce(function (a, b) { return a + (b - moy) * (b - moy); }, 0);
      if (!meilleur || max < meilleur.max || (max === meilleur.max && ecart < meilleur.ecart - 1e-9)) meilleur = { max: max, ecart: ecart, tailles: tailles };
    };
    if (n === 2) for (var a = 1; a < k; a++) essayer([a]);
    else for (var b = 1; b < k - 1; b++) for (var c = b + 1; c < k; c++) essayer([b, c]);
    return meilleur.tailles;
  }

  /** Forme comparable d'un mot : sans accents, sans casse, sans ponctuation autour. */
  function nu(mot) {
    return String(mot).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  }

  /** Rang du mot-clé dans `mots` : première occurrence ; « auto » : le mot le plus long (le premier à égalité). -1 : absent. */
  function motCleDe(mots, voulu) {
    var v = String(voulu || '').trim();
    if (v === 'auto') {
      var rang = -1, max = 0;
      mots.forEach(function (m, i) { var n = longueur(nu(m)); if (n > max) { max = n; rang = i; } });
      return rang;
    }
    var cible = nu(v);
    if (!cible) return -1;
    for (var i = 0; i < mots.length; i++) if (nu(mots[i]) === cible) return i;
    return -1;
  }

  /** Légende en morceaux : découpe un élément [data-morceaux] ; -> erreur ou null. */
  function decouperMorceaux(el, idScene, dureeTemps) {
    var cle = el.id || el.getAttribute('data-texte') || el.tagName.toLowerCase();
    var debut = 'Scène « ' + idScene + ' », élément « ' + cle + ' » : ';
    var valeur = el.getAttribute('data-morceaux');
    if (MORCEAUX.indexOf(valeur) < 0) return { regle: 'lettres-invalide', message: debut + 'data-morceaux « ' + valeur + ' » : 2 ou 3 morceaux.' };
    if (el.hasAttribute('data-lettres') || el.hasAttribute('data-mots')) return { regle: 'lettres-invalide', message: debut + 'data-morceaux ne se combine pas avec data-lettres ni data-mots.' };
    var pas = PAS_MORCEAUX;
    var brut = el.getAttribute('data-pas');
    if (brut !== null) {
      var lu = M.lireSecondes(brut, dureeTemps);
      if (lu.erreur === 'tempo-absent') return { regle: 'tempo-absent', message: debut + 'data-pas « ' + brut + ' » est en temps musicaux, mais le déroulé n\'a pas de « tempo ».' };
      if (lu.erreur) return { regle: 'lettres-invalide', message: debut + 'data-pas « ' + brut + ' » n\'est pas un nombre de secondes (ex. 0.12, ou 0.25t avec un tempo).' };
      pas = lu.valeur;
    }
    var texte = el.textContent;
    var mots = texte.split(/[ \t\n\r ]+/).filter(Boolean);
    if (!mots.length) return null;
    var voulu = el.getAttribute('data-mot-cle');
    var rangCle = -1;
    if (voulu !== null) {
      if (/\s/.test(voulu.trim())) return { regle: 'lettres-invalide', message: debut + 'data-mot-cle « ' + voulu + ' » : un seul mot-clé par légende, en un mot.' };
      rangCle = motCleDe(mots, voulu);
      if (rangCle < 0) return { regle: 'lettres-invalide', message: debut + 'data-mot-cle « ' + voulu + ' » absent du texte « ' + texte.trim() + ' ».' };
    }
    var tailles = couperMorceaux(mots, Number(valeur));
    var fragment = document.createDocumentFragment();
    var i = 0;
    tailles.forEach(function (taille, morceau) {
      for (var j = 0; j < taille; j++, i++) {
        if (i > 0) fragment.appendChild(document.createTextNode(' '));
        var mot = span(i === rangCle ? 'pm-mot pm-mot-cle' : 'pm-mot', mots[i]);
        mot.setAttribute('aria-hidden', 'true');
        mot.style.setProperty('--pm-i', String(morceau));
        fragment.appendChild(mot);
      }
    });
    el.setAttribute('aria-label', texte.replace(/\s+/g, ' ').trim());
    el.textContent = '';
    el.appendChild(fragment);
    el.style.setProperty('--pm-n', String(tailles.length));
    el.style.setProperty('--pm-pas', pas + 's');
    return null;
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
    if (effet === 'brouille' && !parLettres) {
      return { regle: 'lettres-invalide', message: debut + 'data-mots « brouille » : le texte se brouille lettre par lettre, écrire data-lettres="brouille".' };
    }
    if (effet === 'ecrit' && !parLettres) {
      return { regle: 'lettres-invalide', message: debut + 'data-mots « ecrit » : le texte s'écrit lettre par lettre, écrire data-lettres="ecrit".' };
    }
    var pas = parLettres ? EFFETS[effet] : PAS_MOTS;
    var brut = el.getAttribute('data-pas');
    // Écrit à la main sans data-pas : le pas suit data-dur (calculé une fois les lettres comptées).
    var ajuster = effet === 'ecrit' && brut === null ? M.lireSecondes(el.getAttribute('data-dur') || '', dureeTemps) : null;
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
    // Saisie : délais tirés sur la suite des caractères (une espace par blanc ou retour à la ligne). Le curseur suit la
    // dernière lettre de chaque paquet jusqu'à la lettre suivante, puis clignote après la dernière lettre.
    var saisie = null, rang = 0;
    if (effet === 'saisie' && parLettres) {
      var caracteres = [];
      suite.forEach(function (morceau) {
        if (morceau === '') return;
        if (morceau === null || BLANC.test(morceau)) caracteres.push(' ');
        else caracteres.push.apply(caracteres, graphemes(morceau));
      });
      saisie = paquetsSaisie(caracteres, idScene);
      saisie.suivante = [];
      var prochaine;
      for (var r = caracteres.length - 1; r >= 0; r--) {
        saisie.suivante[r] = prochaine;
        if (!/^\s$/.test(caracteres[r])) prochaine = r;
      }
    }
    suite.forEach(function (morceau) {
      if (morceau === '') return;
      if (morceau === null) { rang++; fragment.appendChild(document.createElement('br')); return; }
      if (BLANC.test(morceau)) { rang++; fragment.appendChild(document.createTextNode(morceau)); return; }
      var mot = span('pm-mot');
      mot.setAttribute('aria-hidden', 'true');
      if (parLettres) {
        graphemes(morceau).forEach(function (g) {
          var lettre = span('pm-lettre', g);
          // Une espace insécable reste dans le mot mais ne compte pas comme une lettre.
          if (/^\s$/.test(g)) lettre.className = 'pm-lettre pm-blanc';
          else {
            lettre.style.setProperty('--pm-i', String(n++));
            if (saisie) {
              var d = saisie.delais[rang];
              var k = saisie.suivante[rang];
              lettre.style.setProperty('--pm-d', d + 's');
              if (k === undefined) lettre.setAttribute('data-pm-curseur', 'fin');
              else if (saisie.delais[k] !== d) {
                lettre.setAttribute('data-pm-curseur', '');
                lettre.style.setProperty('--pm-dc', Math.round((saisie.delais[k] - d) * 1000) / 1000 + 's');
              }
            }
            // Seules les lettres et les chiffres se brouillent ; la ponctuation reste en place.
            if (effet === 'brouille' && /[\p{L}\p{N}]/u.test(g)) lettre.setAttribute('data-pm-vraie', g);
          }
          rang++;
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
    if (effet === 'ecrit') {
      if (ajuster && !ajuster.erreur && ajuster.valeur > 0) pas = Math.round(ajuster.valeur / (n - 1 + LETTRE_ECRIT) * 10000) / 10000;
      el.style.setProperty('--pm-lettre-dur', Math.round(pas * LETTRE_ECRIT * 10000) / 10000 + 's');
    }
    el.style.setProperty('--pm-n', String(n));
    el.style.setProperty('--pm-pas', pas + 's');
    return null;
  }

  /** Découpe les éléments [data-lettres] et [data-mots] d'une section ; -> erreurs [{ regle, scene, message }]. */
  M.decouper = function (section, idScene, dureeTemps) {
    var erreurs = [];
    section.querySelectorAll('[data-lettres],[data-mots],[data-morceaux]').forEach(function (el) {
      var e = el.hasAttribute('data-morceaux') ? decouperMorceaux(el, idScene, dureeTemps) : decouperElement(el, idScene, dureeTemps);
      if (e) erreurs.push({ regle: e.regle, scene: idScene, message: e.message });
    });
    return erreurs;
  };
  /** Durée CSS (« 0.3s », « 300ms ») en secondes, ou null. */
  function secondes(texte) {
    var m = /^\s*([\d.]+)\s*(ms|s)?\s*$/.exec(texte || '');
    return m ? parseFloat(m[1]) / (m[2] === 'ms' ? 1000 : 1) : null;
  }
  // Signe de la lettre i au pas de brouillage k : tiré d'un hachage, il ne dépend que du temps de l'élément (figé pendant
  // un arrêt sur image, le même à 30 ou 60 images par seconde). 30 changements par seconde.
  function signeDe(i, k) {
    var h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    return SIGNES.charAt(((h ^ (h >>> 12)) >>> 0) % SIGNES.length);
  }
  /**
   * Texte brouillé : pose sur chaque lettre de `el` ce qu'elle montre à l'instant `local` (secondes depuis le début de
   * l'élément) : rien avant son tour (rang × pas), un signe au hasard pendant --pm-lettre-dur (0,3 s), puis la vraie lettre.
   * Le signe est dessiné par-dessus la vraie lettre, cachée : la largeur du texte ne bouge pas.
   */
  M.brouiller = function (el, local) {
    var pas = secondes(el.style.getPropertyValue('--pm-pas')) || EFFETS.brouille;
    if (el.__pmDurBrouille === undefined) el.__pmDurBrouille = secondes(getComputedStyle(el).getPropertyValue('--pm-lettre-dur')) || 0.3;
    var dur = el.__pmDurBrouille;
    el.querySelectorAll('.pm-lettre[data-pm-vraie]').forEach(function (l) {
      var i = Number(l.style.getPropertyValue('--pm-i'));
      var d = local - i * pas;
      if (d >= dur) { l.removeAttribute('data-pm-brouille'); return; }
      if (d < 0) { l.setAttribute('data-pm-brouille', ''); return; }
      var signe = signeDe(i, Math.floor(local * 30));
      var vraie = l.getAttribute('data-pm-vraie');
      l.setAttribute('data-pm-brouille', vraie !== vraie.toUpperCase() ? signe.toLowerCase() : signe);
    });
  };
  M.EFFETS_LETTRES = EFFETS;
  M.paquetsSaisie = paquetsSaisie;
  M.couperMorceaux = couperMorceaux;
  // Sous Node (controler.js) : la liste des effets, les délais de la saisie (tournage, tests) et la coupe des légendes.
  if (typeof module === 'object' && module.exports) {
    module.exports = { EFFETS: EFFETS, paquetsSaisie: paquetsSaisie, SAISIE: SAISIE, couperMorceaux: couperMorceaux, motCleDe: motCleDe, MORCEAUX: MORCEAUX, PAS_MORCEAUX: PAS_MORCEAUX, LETTRE_ECRIT: LETTRE_ECRIT };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
