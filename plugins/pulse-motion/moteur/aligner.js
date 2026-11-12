/* Pulse Motion – mots d'une voix : découpage du texte dit, formes normalisées (ancres « mot: »),
 * calage approché des mots sur une prise (énergie de la parole, prorata des lettres).
 * L'alignement sur une transcription (Whisper) s'ajoute au plan 3.
 * Langue de la vidéo (spec S9, 5.1) : normaliserMot ramène ß, ø, ł, đ, þ, æ, œ aux lettres latines simples ; aligner et
 * decouperEnScenes prennent la langue en dernier argument : nombres en lettres de moteur/langues.js (0 à 100), comparaison sur
 * les chiffres seuls au-delà ; le français (par défaut) garde ses nombres jusqu'au milliard, décimales, % et €.
 *
 * Module pur : chargé tel quel dans la page (global M.aligner) et par Node (require).
 */
(function (racine, fabrique) {
  var node = typeof module === 'object' && module.exports;
  var api = fabrique(function () { return node ? require('./langues.js') : (racine.M && racine.M.langues) || null; });
  if (node) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.aligner = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (langues) {
  'use strict';

  var FENETRE = 0.02;      // 20 ms
  var SEUIL_PAROLE = -40;  // dBFS
  var PAUSE = 0.25;        // un silence plus long sépare deux groupes de parole

  function normaliserMot(texte) {
    return String(texte).toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss').replace(/ø/g, 'o').replace(/ł/g, 'l')
      .replace(/đ/g, 'd').replace(/þ/g, 'th')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  }

  var OUVRANTE = /^[«“‘([{—–-]+$/;

  /** Texte dit -> [{ w, cles }] ; ponctuation isolée rattachée au mot précédent, ouvrante (« — ( ) au mot suivant. */
  function decouperMots(texte) {
    var mots = [], enAttente = '';
    // Séparateurs gardés : une espace insécable (« 4 °C », « froid ? ») reste dans le mot, ou marque le mot
    // qu'on ne sépare pas du suivant (insecable : le caractère à remettre entre eux).
    var morceaux = String(texte).trim().split(/(\s+)/);
    for (var k = 0; k < morceaux.length; k += 2) {
      var brut = morceaux[k], avant = k > 0 ? morceaux[k - 1] : ' ';
      if (!brut) continue;
      var lien = /[ \t\n\r\f\v]/.test(avant) ? ' ' : avant;
      var cle = normaliserMot(brut);
      if (!cle) {
        // Guillemet ouvrant : l'espace qui le suit (insécable « bonjour ») est gardée telle quelle.
        if (OUVRANTE.test(brut) || !mots.length) enAttente += brut + (k + 1 < morceaux.length && !/[ \t\n\r\f\v]/.test(morceaux[k + 1]) ? morceaux[k + 1] : ' ');
        else { var p = mots[mots.length - 1]; p.w += lien + brut; delete p.insecable; }
        continue;
      }
      var cles = [cle];
      brut.split(/['’\-]/).map(normaliserMot).forEach(function (q) { if (q && cles.indexOf(q) < 0) cles.push(q); });
      if (mots.length && lien !== ' ' && !enAttente) mots[mots.length - 1].insecable = lien;
      mots.push({ w: enAttente + brut, cles: cles });
      enAttente = '';
    }
    if (enAttente && mots.length) mots[mots.length - 1].w += ' ' + enAttente.trim();
    return mots;
  }

  function lettres(m) { return Math.max(1, m.cles[0].length); }

  /** Groupes de parole [[debut, fin]] (secondes) : fenêtres de 20 ms au-dessus de −40 dBFS, pauses < 0,25 s comblées. */
  function groupesParole(canal, taux) {
    var pas = Math.max(1, Math.round(FENETRE * taux)), seuil = Math.pow(10, SEUIL_PAROLE / 20), groupes = [];
    for (var debut = 0; debut < canal.length; debut += pas) {
      var s = 0, n = 0;
      for (var i = debut; i < Math.min(canal.length, debut + pas); i++) { s += canal[i] * canal[i]; n++; }
      if (Math.sqrt(s / n) < seuil) continue;
      var a = debut / taux, b = Math.min(canal.length, debut + pas) / taux, d = groupes[groupes.length - 1];
      if (d && a - d[1] < PAUSE) d[1] = b; else groupes.push([a, b]);
    }
    return groupes;
  }

  /** Mots du texte calés sur la prise : la durée de parole est partagée au prorata des lettres. -> [{ w, t0, t1 }] */
  function calageApproche(texte, canal, taux) {
    var mots = decouperMots(texte);
    if (!mots.length) return [];
    var duree = canal.length / taux;
    var groupes = groupesParole(canal, taux);
    if (!groupes.length) groupes = [[0, duree]];
    var parole = groupes.reduce(function (t, g) { return t + g[1] - g[0]; }, 0);
    // Temps de parole cumulé -> temps de la prise (en sautant les silences).
    // Un début de mot qui tombe pile en fin de groupe passe au groupe suivant ; une fin de mot reste dans le sien.
    function versPrise(tp, estDebut) {
      for (var k = 0; k < groupes.length; k++) {
        var l = groupes[k][1] - groupes[k][0];
        var dedans = estDebut ? tp < l - 1e-9 : tp <= l + 1e-9;
        if (dedans || k === groupes.length - 1) return groupes[k][0] + Math.min(tp, l);
        tp -= l;
      }
      return duree;
    }
    var total = mots.reduce(function (t, m) { return t + lettres(m); }, 0), cumul = 0;
    return mots.map(function (m) {
      var a = cumul / total * parole;
      cumul += lettres(m);
      var b = cumul / total * parole;
      var t0 = versPrise(a, true), t1 = versPrise(b, false);
      return { w: m.w, t0: Math.round(Math.min(t0, t1) * 1000) / 1000, t1: Math.round(t1 * 1000) / 1000 };
    });
  }

  var UNITES = ['zero', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
  var DIZAINES = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };
  var MAX_NOMBRE = 999999999999;

  /** 0–99 en lettres, forme normalisée. */
  function moinsDeCent(n) {
    if (n < 17) return UNITES[n];
    if (n < 20) return 'dix' + UNITES[n - 10];
    if (n < 70) { var r = n % 10; return DIZAINES[Math.floor(n / 10)] + (r === 1 ? 'etun' : r ? UNITES[r] : ''); }
    if (n < 80) return 'soixante' + (n === 71 ? 'etonze' : moinsDeCent(n - 60));
    if (n === 80) return 'quatrevingts';
    return 'quatrevingt' + moinsDeCent(n - 80);
  }

  /** 0–999 ; invariable : devant « mille » (« deux cent mille », « quatre-vingt mille »). */
  function centaine(n, invariable) {
    var r;
    if (n < 100) r = moinsDeCent(n);
    else {
      var c = Math.floor(n / 100), reste = n % 100;
      r = (c > 1 ? UNITES[c] : '') + 'cent' + (reste ? moinsDeCent(reste) : c > 1 ? 's' : '');
    }
    return invariable ? r.replace(/(cent|vingt)s$/, '$1') : r;
  }

  /**
   * Entier de 0 à 999 999 999 999 en lettres, forme normalisée (sans espaces ni traits d'union) : règles de « vingt » et
   * « cent » (pluriel final, invariables devant « mille »), « mille » invariable, « million » et « milliard » au pluriel.
   */
  function nombreEnLettres(n) {
    n = Math.floor(Number(n));
    if (!(n >= 0) || n > MAX_NOMBRE) return String(n);
    if (n < 1000) return centaine(n, false);
    var milliards = Math.floor(n / 1e9), millions = Math.floor(n / 1e6) % 1000, milliers = Math.floor(n / 1000) % 1000, reste = n % 1000;
    var s = '';
    if (milliards) s += centaine(milliards, false) + 'milliard' + (milliards > 1 ? 's' : '');
    if (millions) s += centaine(millions, false) + 'million' + (millions > 1 ? 's' : '');
    if (milliers) s += (milliers > 1 ? centaine(milliers, true) : '') + 'mille';
    if (reste) s += centaine(reste, false);
    return s;
  }

  /** Ordinal en lettres : 1er premier, 1re première, 2e deuxième, 5e cinquième, 9e neuvième, 21e vingt et unième. */
  function ordinalEnLettres(n, feminin) {
    if (n === 1) return feminin ? 'premiere' : 'premier';
    var l = nombreEnLettres(n).replace(/(cent|vingt)s$/, '$1');
    if (/cinq$/.test(l)) l += 'u';
    else if (/neuf$/.test(l)) l = l.slice(0, -1) + 'v';
    else if (/e$/.test(l)) l = l.slice(0, -1);
    return l + 'ieme';
  }

  var BLANC = '[\\s\\u00a0\\u202f]';
  var ENTIER = new RegExp('^(?:\\d{1,3}(?:' + BLANC + '\\d{3})+|\\d+)$');
  var DECIMAL = new RegExp('^(\\d{1,3}(?:' + BLANC + '\\d{3})+|\\d+),(\\d+)$');
  var SUFFIXE = new RegExp('^(.*\\d)' + BLANC + '*(%|€)$');
  var ORDINAL = /^(\d+)(er|re|ère|e|ème|eme|è)$/i;
  function chiffres(t) { return Number(String(t).replace(/\D/g, '')); }

  /**
   * Formes dites d'un mot écrit (formes normalisées, mots collés) : nombres jusqu'au milliard (« 1 250 », années), décimales
   * (« 3,5 » trois virgule cinq), « % » (pour cent), « € » (euros), ordinaux (« 1er », « 2e »). -> [forme] (vide sinon).
   * Un sigle (« SNCF ») n'en a pas besoin : sa clé est déjà la suite de ses lettres.
   */
  function formesDites(brut) {
    var w = String(brut).trim().replace(/^[«“‘("'[]+/, '').replace(/[»”’)"'\].,;:!?…]+$/, '').trim();
    var suffixe = '', m, texte = null, valeur = null;
    if ((m = SUFFIXE.exec(w))) { w = m[1]; suffixe = m[2]; }
    if (ENTIER.test(w)) { valeur = chiffres(w); if (valeur <= MAX_NOMBRE) texte = nombreEnLettres(valeur); }
    else if ((m = DECIMAL.exec(w))) {
      valeur = chiffres(m[1]);
      var zeros = /^0*/.exec(m[2])[0].length, decimales = m[2].slice(zeros);
      if (valeur <= MAX_NOMBRE) texte = nombreEnLettres(valeur) + 'virgule' + new Array(zeros + 1).join('zero') + (decimales ? nombreEnLettres(chiffres(decimales.slice(0, 12))) : '');
    } else if (!suffixe && (m = ORDINAL.exec(w))) texte = ordinalEnLettres(Number(m[1]), /^(re|ère)$/i.test(m[2]));
    if (texte === null) return [];
    if (suffixe === '%') texte += 'pourcent';
    else if (suffixe === '€') texte += valeur === 1 ? 'euro' : 'euros';
    return [texte];
  }

  /** Lecture des nombres d'une langue : { lettres(n) -> forme ou null, dites(brut) -> [formes] }. Français par défaut. */
  var FRANCAIS = { lettres: nombreEnLettres, dites: formesDites };
  function lecture(langue) {
    var L = langue && langues();
    if (!L || L.estFrancais(langue)) return FRANCAIS;
    var nb = L.de(langue).nombres;
    if (!nb) return { lettres: function () { return null; }, dites: function () { return []; } };
    return {
      lettres: nb,
      // Un entier écrit en chiffres (« 21 », « 21 % ») : sa forme en lettres, jusqu'à 100.
      dites: function (brut) {
        var w = String(brut).trim().replace(/^[«“‘„("'[]+/, '').replace(/[»”’)"'\].,;:!?…%€]+$/, '').trim();
        var f = /^\d{1,3}$/.test(w) ? nb(Number(w)) : null;
        return f ? [f] : [];
      },
    };
  }

  /** Clé de comparaison : un nombre écrit en chiffres devient sa forme en lettres (français : jusqu'au milliard). */
  function cleComparee(cle, F) {
    if (!/^\d{1,12}$/.test(cle)) return cle;
    var l = (F || FRANCAIS).lettres(Number(cle));
    return l === null || l === undefined ? cle : l;
  }

  function distance(a, b) {
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) d.push([i]);
    for (j = 1; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[a.length][b.length];
  }

  /**
   * Même mot : clés égales (nombres compris), une lettre d'écart pour des mots de plus de 4 lettres, ou une distance
   * d'édition relative d'au plus 0,34 pour des mots de plus de 3 lettres sans chiffre (similar d'explainroo).
   */
  function memeMot(a, b, langue) {
    var F = typeof langue === 'object' && langue ? langue : lecture(langue);
    var x = cleComparee(a, F), y = cleComparee(b, F);
    if (x === y) return true;
    // Un nombre ne ressemble qu'à lui-même : 2025 n'est pas 2026, même écrits en lettres.
    if (/\d/.test(a + b)) return false;
    if (x.length > 4 && y.length > 4 && distance(x, y) <= 1) return true;
    var long = Math.max(x.length, y.length);
    return long > 3 && !/\d/.test(x + y) && distance(x, y) / long <= 0.34;
  }

  /** Clés comparables d'un mot (clés normalisées, nombres en lettres, formes dites). */
  function comparables(mot, F) {
    var r = [];
    mot.cles.forEach(function (c) { var x = cleComparee(c, F); if (r.indexOf(x) < 0) r.push(x); });
    (F || FRANCAIS).dites(mot.w).forEach(function (x) { if (r.indexOf(x) < 0) r.push(x); });
    return r;
  }

  /** Un mot du script (ou une de ses parties : « faut-il » entendu « faut » « -il ») correspond au mot entendu. */
  function correspond(script, entendu, F) {
    // Mot écrit ou entendu en chiffres : formes égales seulement (nombre, forme dite).
    var exact = script.cles.concat(entendu.cles).some(function (c) { return /\d/.test(c); });
    return script.comp.some(function (c) { return entendu.comp.some(function (h) { return exact ? c === h : memeMot(c, h, F || FRANCAIS); }); });
  }

  var GROUPE_ENTENDU = 6;   // mots entendus pour un mot écrit (« deux mille vingt-six », « s n c f »)
  var GROUPE_ECRIT = 3;     // mots écrits pour un mot entendu (« 1 250 » écrit avec une espace ordinaire)

  /**
   * Mots du script calés sur les mots entendus (transcription) : programmation dynamique sur les mots, retour arrière.
   * Pas : un pour un (égaux, ou substitués), un mot écrit pour plusieurs entendus (nombre, sigle épelé), plusieurs écrits pour
   * un entendu (et l'inverse pour un nombre écrit en morceaux), mot écrit sauté, mot entendu en trop. Les mots appariés
   * prennent les temps entendus ; les autres sont interpolés au prorata des lettres entre leurs voisins.
   * -> { mots, reconnus, ecarts: [{ rang, mot, entendu }] } | null si aucun mot n'est égal. Logique d'alignWords et d'expand (src/align.js d'explainroo, MIT,
   * © 2026 Vincent Schmalbach), adaptée ; lecture des nombres réécrite pour le français.
   */
  function aligner(texte, entendus, duree, langue) {
    var F = lecture(langue);
    var script = decouperMots(texte).map(function (s) { return { w: s.w, cles: s.cles, comp: comparables(s, F) }; });
    var oui = [];
    (entendus || []).forEach(function (h) {
      var dec = decouperMots(h.w);
      if (!dec.length) return;
      var mot = { w: dec.map(function (d) { return d.w; }).join(' '), cles: [dec[0].cles[0]], t0: h.t0, t1: h.t1 };
      mot.comp = comparables(mot, F);
      oui.push(mot);
    });
    var n = script.length, m = oui.length, i, j;
    if (!n || !m) return null;
    // Formes jointes d'une suite de mots écrits : clés collées, et formes dites de la suite (nombre écrit en morceaux).
    var joint = function (a, k) {
      var mots = script.slice(a, a + k);
      var r = [mots.map(function (s) { return cleComparee(s.cles[0], F); }).join(''), mots.map(function (s) { return s.cles[0]; }).join('')];
      F.dites(mots.map(function (s) { return s.w; }).join(' ')).forEach(function (f) { r.push(f); });
      return r;
    };
    var entendu = function (b, q) { return oui.slice(b, b + q).map(function (h) { return h.comp[0]; }).join(''); };
    var INF = 1e9;
    var D = [], choix = [];
    for (i = 0; i <= n; i++) { D.push(new Array(m + 1).fill(INF)); choix.push(new Array(m + 1).fill(null)); }
    D[0][0] = 0;
    for (i = 0; i <= n; i++) {
      for (j = 0; j <= m; j++) {
        var c = D[i][j];
        if (c >= INF) continue;
        var poser = function (a, b, v, quoi) { if (v < D[a][b]) { D[a][b] = v; choix[a][b] = quoi; } };
        // Un pour un d'abord (à égalité, il l'emporte), puis les groupes, puis les mots sautés.
        if (i < n && j < m) { var ok = correspond(script[i], oui[j], F); poser(i + 1, j + 1, c + (ok ? 0 : 1), { k: 1, q: 1, egal: ok }); }
        for (var k = 1; k <= GROUPE_ECRIT && i + k <= n; k++) {
          var formes = k === 1 ? script[i].comp : joint(i, k);
          for (var q = 1; q <= GROUPE_ENTENDU && j + q <= m; q++) {
            if (k === 1 && q === 1) continue;
            var h = q === 1 ? oui[j].comp : [entendu(j, q)];
            // Un groupe coûte un rien de plus par mot en plus : à égalité, les mots appariés un à un l'emportent.
            if (formes.some(function (f) { return h.indexOf(f) >= 0; })) poser(i + k, j + q, c + 0.01 * (k + q - 2), { k: k, q: q, egal: true });
          }
        }
        if (i < n) poser(i + 1, j, c + 1, { k: 1, q: 0 });
        if (j < m) poser(i, j + 1, c + 1, { k: 0, q: 1 });
      }
    }
    var mots = script.map(function (s) { return { w: s.w, t0: null, t1: null }; });
    var utilise = new Array(m), seuls = [], egaux = 0, ecarts = [];
    i = n; j = m;
    while (i > 0 || j > 0) {
      var x = choix[i][j];
      if (!x) break;
      var i0 = i - x.k, j0 = j - x.q;
      // Mots écrits non reconnus (spec S7, 5.13) : ce qui a été entendu à leur place (rien : mot sauté).
      if (x.k === 1 && !x.egal) ecarts.push({ rang: i0, mot: script[i0].w, entendu: x.q ? oui[j0].w.trim() : '' });
      if (x.k && x.q) {
        for (var u = j0; u < j; u++) utilise[u] = true;
        if (x.egal) egaux += x.k;
        if (x.k === 1 && x.q === 1) seuls.push([i0, j0]);
        // Plusieurs mots écrits sur une plage entendue : partagée au prorata des lettres.
        var a = oui[j0].t0, b = oui[j - 1].t1, total = 0, cumul = 0, v;
        for (v = i0; v < i; v++) total += lettres(script[v]);
        for (v = i0; v < i; v++) {
          mots[v].t0 = Math.round((a + (b - a) * cumul / total) * 1000) / 1000;
          cumul += lettres(script[v]);
          mots[v].t1 = Math.round((a + (b - a) * cumul / total) * 1000) / 1000;
        }
      }
      i = i0; j = j0;
    }
    if (!egaux) return null;
    // Morceaux voisins entendus du même mot (« faut » « -il ») : du début du premier à la fin du dernier.
    seuls.forEach(function (p) {
      var s = script[p[0]], premier = p[1], dernier = p[1];
      while (premier > 0 && !utilise[premier - 1] && correspond(s, oui[premier - 1], F)) premier--;
      while (dernier < m - 1 && !utilise[dernier + 1] && correspond(s, oui[dernier + 1], F)) dernier++;
      mots[p[0]].t0 = oui[premier].t0;
      mots[p[0]].t1 = oui[dernier].t1;
    });
    // Mots sans paire : répartis entre la fin du mot précédent et le début du suivant, au prorata des lettres.
    for (var k2 = 0; k2 < n; k2++) {
      if (mots[k2].t0 !== null) continue;
      var a2 = k2;
      while (a2 < n && mots[a2].t0 === null) a2++;
      var avant = k2 > 0 ? mots[k2 - 1].t1 : (a2 < n ? Math.max(0, mots[a2].t0 - 0.3 * (a2 - k2)) : 0);
      var apres = a2 < n ? mots[a2].t0 : avant + 0.3 * (a2 - k2);
      // Mots entendus qui se chevauchent : la plage ne recule pas ; après le dernier mot entendu : pas au-delà de la prise.
      if (k2 > 0) avant = Math.max(mots[k2 - 1].t0, Math.min(avant, apres));
      if (a2 === n && duree > 0) apres = Math.max(avant, Math.min(apres, duree));
      var tot = 0, cum = 0, z;
      for (z = k2; z < a2; z++) tot += lettres(script[z]);
      for (z = k2; z < a2; z++) {
        var t0 = avant + (apres - avant) * cum / tot;
        cum += lettres(script[z]);
        mots[z].t0 = Math.round(t0 * 1000) / 1000;
        mots[z].t1 = Math.round((avant + (apres - avant) * cum / tot) * 1000) / 1000;
      }
      k2 = a2 - 1;
    }
    return { mots: mots, reconnus: egaux, ecarts: ecarts.reverse() };
  }

  /**
   * Enregistrement unique -> une plage par texte de scène, coupée au milieu du silence entre le dernier mot d'une
   * scène et le premier de la suivante. -> [{ debut, fin, mots (temps de l'enregistrement), reconnus, total }] | null
   */
  function decouperEnScenes(textes, entendus, duree, langue) {
    var r = aligner(textes.join(' '), entendus, duree, langue);
    if (!r) return null;
    var scenes = [], k = 0;
    textes.forEach(function (t) {
      // Mots écrits de la scène elle-même : une ponctuation de tête (« … et puis ») reste à la scène qui commence.
      var propres = decouperMots(t), nb = propres.length;
      scenes.push({ mots: r.mots.slice(k, k + nb).map(function (m, q) { return { w: propres[q].w, t0: m.t0, t1: m.t1 }; }), total: nb });
      k += nb;
    });
    var coupes = [0];
    for (var i = 1; i < scenes.length; i++) {
      var precedents = scenes[i - 1].mots, suivants = scenes[i].mots;
      var a = precedents.length ? precedents[precedents.length - 1].t1 : coupes[i - 1];
      var b = suivants.length ? suivants[0].t0 : a;
      coupes.push(Math.round((a + Math.max(a, b)) / 2 * 1000) / 1000);
    }
    coupes.push(duree);
    return scenes.map(function (s, i) {
      var debut = coupes[i], fin = coupes[i + 1];
      // Mots reconnus de la scène : son texte réaligné sur les mots entendus de sa plage seulement.
      var dedans = entendus.filter(function (h) { return h.t0 >= debut - 1e-9 && h.t1 <= fin + 1e-9; });
      var seule = aligner(textes[i], dedans, undefined, langue);
      return { debut: debut, fin: fin, mots: s.mots, reconnus: seule ? seule.reconnus : 0, total: s.total };
    });
  }

  // --- Texte dit (spec S7, 5.11) : repères, forme affichée et forme dite, pauses ------------------------------------------

  var NOM_REPERE = /^[A-Za-z0-9_-]+$/;

  /** Termes du glossaire dans un morceau de texte -> [{ texte } | { affiche, dit }] (mots entiers, casse ignorée). */
  function appliquerPrononciations(texte, prononciations) {
    var termes = Object.keys(prononciations || {}).filter(function (t) { return t && String(prononciations[t] || '').trim(); })
      .sort(function (a, b) { return b.length - a.length; });
    if (!termes.length) return [{ texte: texte }];
    var echapper = function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'); };
    var motif = new RegExp('(^|[^\\p{L}\\p{N}])(' + termes.map(echapper).join('|') + ')(?![\\p{L}\\p{N}])', 'giu');
    var r = [], depuis = 0, x;
    while ((x = motif.exec(texte))) {
      var debut = x.index + x[1].length;
      if (debut > depuis) r.push({ texte: texte.slice(depuis, debut) });
      var trouve = termes.filter(function (t) { return t.toLowerCase() === x[2].toLowerCase().replace(/\s+/g, ' '); })[0] || x[2];
      r.push({ affiche: x[2], dit: String(prononciations[trouve] || prononciations[x[2]] || '').trim() || x[2] });
      depuis = debut + x[2].length;
    }
    if (depuis < texte.length) r.push({ texte: texte.slice(depuis) });
    return r;
  }

  /**
   * Texte dit avec son balisage -> { affiche, dit, unites, reperes: [{ nom, mot }], pauses: [{ apres, duree }], erreurs }.
   *   [#nom]        repère, à l'instant du mot affiché qui suit (mot : son rang) ; ancre data-start="repere:nom"
   *   {affiché|dit} les sous-titres et les ancres « mot: » voient la forme affichée et la forme dite ; la voix dit la seconde
   *   [pause 0.6]   silence ajouté par la voix de synthèse (après le mot dit de rang apres) ; ignoré pour une prise
   * options.prononciations : { terme: prononciation } du glossaire, appliqué hors des {…|…} explicites (voix provisoire et
   * de synthèse). Un autre texte entre crochets reste tel quel. Erreurs en français : crochet ou accolade non fermé,
   * accolade sans « | », nom de repère invalide ou en double, pause hors de 0 à 5 s.
   */
  function lireTexteDit(texte, options) {
    var src = String(texte || ''), erreurs = [], unites = [], reperes = [], pauses = [], vus = {};
    var prononciations = options && options.prononciations;
    var tampon = '';
    function vider() { if (tampon) { appliquerPrononciations(tampon, prononciations).forEach(function (u) { unites.push(u); }); tampon = ''; } }
    for (var i = 0; i < src.length;) {
      var ch = src[i];
      if (ch === '[' && (src[i + 1] === '#' || /^\[\s*pause\b/i.test(src.slice(i, i + 12)))) {
        var fin = src.indexOf(']', i);
        var ouvre = src.indexOf('[', i + 1);
        if (fin < 0 || (ouvre >= 0 && ouvre < fin)) { erreurs.push('le crochet « ' + src.slice(i, i + 12).trim() + '… » n\'est pas fermé : écrire [#nom] pour un repère ou [pause 0.6] pour un silence.'); tampon += src.slice(i, i + 1); i++; continue; }
        var dedans = src.slice(i + 1, fin).trim();
        vider();
        if (dedans[0] === '#') {
          var nom = dedans.slice(1).trim();
          if (!NOM_REPERE.test(nom)) erreurs.push('le repère « [' + dedans + '] » doit avoir un nom fait de lettres, de chiffres et de tirets, ex. [#serveur].');
          else if (vus[nom]) erreurs.push('le repère « [#' + nom + '] » est posé deux fois : chaque repère a un nom unique.');
          else { vus[nom] = true; unites.push({ repere: nom }); }
        } else {
          var p = /^pause\s+(\d*[.,]?\d+)\s*s?$/i.exec(dedans);
          var d = p ? parseFloat(p[1].replace(',', '.')) : NaN;
          if (!(d > 0 && d <= 5)) erreurs.push('la pause « [' + dedans + '] » doit donner une durée de 0 à 5 secondes, ex. [pause 0.6].');
          else unites.push({ pause: d });
        }
        i = fin + 1;
        continue;
      }
      if (ch === '{') {
        var ferme = src.indexOf('}', i);
        var autre = src.indexOf('{', i + 1);
        if (ferme < 0 || (autre >= 0 && autre < ferme)) { erreurs.push('l\'accolade « ' + src.slice(i, i + 14).trim() + '… » n\'est pas fermée : écrire {affiché|dit}, ex. {HACCP|hache a cé cé pé}.'); i++; continue; }
        var corps = src.slice(i + 1, ferme), barre = corps.indexOf('|');
        vider();
        if (barre < 0) { erreurs.push('« {' + corps + '} » doit donner la forme affichée et la forme dite séparées par « | », ex. {HACCP|hache a cé cé pé}.'); unites.push({ texte: corps }); }
        else unites.push({ affiche: corps.slice(0, barre).trim(), dit: corps.slice(barre + 1).trim() });
        i = ferme + 1;
        continue;
      }
      if (ch === '}') { erreurs.push('une accolade « } » ferme sans avoir été ouverte : écrire {affiché|dit}.'); i++; continue; }
      tampon += ch;
      i++;
    }
    vider();
    // Formes affichée et dite ; correspondance des mots (rangs) par unité.
    var affiche = '', dit = '', groupes = [], na = 0, nd = 0;
    var coller = function (a, b) { return !a ? b : !b ? a : /\s$/.test(a) || /^\s/.test(b) ? a + b : a + ' ' + b; };
    unites.forEach(function (u) {
      if (u.repere) { reperes.push({ nom: u.repere, mot: na }); return; }
      if (u.pause) { pauses.push({ apres: nd, duree: u.pause }); return; }
      var a = u.texte !== undefined ? u.texte : u.affiche, b = u.texte !== undefined ? u.texte : u.dit;
      var ka = decouperMots(a).length, kd = decouperMots(b).length;
      // Morceau sans mot (ponctuation) : rattaché au mot précédent, des deux côtés.
      affiche = u.texte !== undefined ? affiche + a : coller(affiche, a);
      dit = u.texte !== undefined ? dit + b : coller(dit, b);
      if (ka || kd) groupes.push({ a: na, na: ka, d: nd, nd: kd, autre: u.texte === undefined });
      na += ka; nd += kd;
    });
    var net = function (t) { return t.replace(/[ \t\n\r]+/g, ' ').replace(/ ([,.;:!?…»)])/g, function (x, p) { return /[;:!?»]/.test(p) ? x : p; }).trim(); };
    affiche = net(affiche); dit = net(dit);
    // Comptes vérifiés sur le texte entier (ponctuation entre deux morceaux) : sinon, correspondance au prorata.
    var totalA = decouperMots(affiche).length, totalD = decouperMots(dit).length;
    if (totalA !== na || totalD !== nd) groupes = [{ a: 0, na: totalA, d: 0, nd: totalD, autre: true }];
    return { affiche: affiche, dit: dit, groupes: groupes, reperes: reperes, pauses: pauses, erreurs: erreurs, balise: unites.some(function (u) { return u.texte === undefined; }) };
  }

  /**
   * Mots dits (temps de la prise, forme dite) -> mots affichés [{ w, t0, t1, dit? }] : un mot affiché prend la plage de ses
   * mots dits ; plusieurs mots affichés pour une plage la partagent au prorata des lettres ; un mot affiché sans mot dit
   * prend l'instant de la fin du précédent. dit : forme dite d'un {affiché|dit} (cherchée aussi par les ancres « mot: »).
   */
  function motsAffiches(lu, motsDits) {
    var affiches = decouperMots(lu.affiche), dits = decouperMots(lu.dit);
    if (!lu.balise && affiches.length === (motsDits || []).length) return (motsDits || []).map(function (m, k) { return { w: affiches[k].w, t0: m.t0, t1: m.t1 }; });
    var r = affiches.map(function (a) { return { w: a.w, t0: null, t1: null }; });
    var dernier = 0;
    lu.groupes.forEach(function (g) {
      var plage = (motsDits || []).slice(g.d, g.d + g.nd).filter(function (m) { return m && m.t0 !== null && m.t0 !== undefined; });
      var a = plage.length ? plage[0].t0 : dernier, b = plage.length ? plage[plage.length - 1].t1 : dernier;
      var total = 0, cumul = 0, k;
      for (k = g.a; k < g.a + g.na; k++) total += Math.max(1, (affiches[k] ? affiches[k].cles[0].length : 1));
      for (k = g.a; k < g.a + g.na && k < r.length; k++) {
        r[k].t0 = Math.round((a + (b - a) * cumul / total) * 1000) / 1000;
        cumul += Math.max(1, affiches[k].cles[0].length);
        r[k].t1 = Math.round((a + (b - a) * cumul / total) * 1000) / 1000;
        if (g.autre && g.nd) r[k].dit = dits.slice(g.d, g.d + g.nd).map(function (x) { return x.w; }).join(' ');
      }
      dernier = b;
    });
    r.forEach(function (m, k) { if (m.t0 === null) { m.t0 = m.t1 = k ? r[k - 1].t1 : 0; } });
    return r;
  }

  /** Repères datés (secondes de la prise) : début du mot affiché qui suit, ou fin du dernier. -> { nom: t } */
  function reperesDates(lu, mots) {
    var r = {};
    (lu.reperes || []).forEach(function (x) {
      var m = mots[x.mot];
      r[x.nom] = m ? m.t0 : mots.length ? mots[mots.length - 1].t1 : 0;
    });
    return r;
  }

  return { normaliserMot: normaliserMot, decouperMots: decouperMots, calageApproche: calageApproche, groupesParole: groupesParole,
    nombreEnLettres: nombreEnLettres, ordinalEnLettres: ordinalEnLettres, formesDites: formesDites, memeMot: memeMot, aligner: aligner,
    decouperEnScenes: decouperEnScenes, lireTexteDit: lireTexteDit, appliquerPrononciations: appliquerPrononciations,
    motsAffiches: motsAffiches, reperesDates: reperesDates };
});
