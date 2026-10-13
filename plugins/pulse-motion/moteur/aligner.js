/* Pulse Motion – mots d'une voix : découpage du texte dit, formes normalisées (ancres « mot: »),
 * calage approché des mots sur une prise (énergie de la parole, prorata des lettres).
 * L'alignement sur une transcription (Whisper) s'ajoute au plan 3.
 *
 * Module pur : chargé tel quel dans la page (global M.aligner) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.aligner = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FENETRE = 0.02;      // 20 ms
  var SEUIL_PAROLE = -40;  // dBFS
  var PAUSE = 0.25;        // un silence plus long sépare deux groupes de parole

  function normaliserMot(texte) {
    return String(texte).toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
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

  /** 0–100 en lettres, forme normalisée (sans espaces ni traits d'union). */
  function nombreEnLettres(n) {
    if (n < 17) return UNITES[n];
    if (n < 20) return 'dix' + UNITES[n - 10];
    if (n < 70) { var r = n % 10; return DIZAINES[Math.floor(n / 10)] + (r === 1 ? 'etun' : r ? UNITES[r] : ''); }
    if (n < 80) return 'soixante' + (n === 71 ? 'etonze' : nombreEnLettres(n - 60));
    if (n === 80) return 'quatrevingts';
    if (n < 100) return 'quatrevingt' + nombreEnLettres(n - 80);
    return 'cent';
  }

  /** Clé de comparaison : un nombre de 0 à 100 écrit en chiffres devient sa forme en lettres. */
  function cleComparee(cle) {
    return /^\d+$/.test(cle) && Number(cle) <= 100 ? nombreEnLettres(Number(cle)) : cle;
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

  /** Même mot : clés égales (nombres compris), ou une lettre d'écart pour des mots de plus de 4 lettres. */
  function memeMot(a, b) {
    var x = cleComparee(a), y = cleComparee(b);
    return x === y || (x.length > 4 && y.length > 4 && distance(x, y) <= 1);
  }

  /** Un mot du script (ou une de ses parties : « faut-il » entendu « faut » « -il ») correspond au mot entendu. */
  function correspond(cles, cle) {
    return cles.some(function (c) { return memeMot(c, cle); });
  }

  /**
   * Mots du script calés sur les mots entendus (transcription) : distance d'édition sur les mots, retour arrière.
   * Les mots appariés (égaux ou substitués) prennent les temps entendus ; les autres sont interpolés au prorata des
   * lettres entre leurs voisins. -> { mots, reconnus } | null si aucun mot n'est égal.
   */
  function aligner(texte, entendus, duree) {
    var script = decouperMots(texte);
    var oui = [];
    (entendus || []).forEach(function (h) {
      var dec = decouperMots(h.w);
      if (dec.length) oui.push({ cle: dec[0].cles[0], t0: h.t0, t1: h.t1 });
    });
    // Nombres du texte écrits en chiffres et dits en plusieurs mots (« 21 » → « vingt » « et » « un ») : un seul mot entendu.
    var nombres = {};
    script.forEach(function (s) { if (/^\d+$/.test(s.cles[0]) && Number(s.cles[0]) <= 100) nombres[nombreEnLettres(Number(s.cles[0]))] = true; });
    if (Object.keys(nombres).length) {
      var regroupes = [];
      for (var x = 0; x < oui.length; x++) {
        var pris = 1;
        for (var long = Math.min(4, oui.length - x); long > 1; long--) {
          var mot = '';
          for (var y = x; y < x + long; y++) mot += oui[y].cle;
          if (nombres[mot]) { pris = long; break; }
        }
        regroupes.push(pris > 1 ? { cle: oui.slice(x, x + pris).map(function (o) { return o.cle; }).join(''), t0: oui[x].t0, t1: oui[x + pris - 1].t1 } : oui[x]);
        x += pris - 1;
      }
      oui = regroupes;
    }
    var n = script.length, m = oui.length, i, j;
    if (!n || !m) return null;
    var D = [];
    for (i = 0; i <= n; i++) { D.push(new Array(m + 1)); D[i][0] = i; }
    for (j = 0; j <= m; j++) D[0][j] = j;
    for (i = 1; i <= n; i++) {
      for (j = 1; j <= m; j++) {
        var c = correspond(script[i - 1].cles, oui[j - 1].cle) ? 0 : 1;
        D[i][j] = Math.min(D[i - 1][j - 1] + c, D[i - 1][j] + 1, D[i][j - 1] + 1);
      }
    }
    var paire = new Array(n), utilise = new Array(m), egaux = 0;
    i = n; j = m;
    while (i > 0 && j > 0) {
      var cout = correspond(script[i - 1].cles, oui[j - 1].cle) ? 0 : 1;
      if (D[i][j] === D[i - 1][j - 1] + cout) { paire[i - 1] = j - 1; utilise[j - 1] = true; if (!cout) egaux++; i--; j--; }
      else if (D[i][j] === D[i - 1][j] + 1) i--;
      else j--;
    }
    if (!egaux) return null;
    var mots = script.map(function (s, k) {
      if (paire[k] === undefined) return { w: s.w, t0: null, t1: null };
      // Morceaux voisins entendus du même mot (« faut » « -il ») : du début du premier à la fin du dernier.
      var premier = paire[k], dernier = paire[k];
      while (premier > 0 && !utilise[premier - 1] && correspond(s.cles, oui[premier - 1].cle)) premier--;
      while (dernier < m - 1 && !utilise[dernier + 1] && correspond(s.cles, oui[dernier + 1].cle)) dernier++;
      return { w: s.w, t0: oui[premier].t0, t1: oui[dernier].t1 };
    });
    // Mots sans paire : répartis entre la fin du mot précédent et le début du suivant, au prorata des lettres.
    for (var k = 0; k < n; k++) {
      if (mots[k].t0 !== null) continue;
      var a = k;
      while (a < n && mots[a].t0 === null) a++;
      var avant = k > 0 ? mots[k - 1].t1 : (a < n ? Math.max(0, mots[a].t0 - 0.3 * (a - k)) : 0);
      var apres = a < n ? mots[a].t0 : avant + 0.3 * (a - k);
      // Mots entendus qui se chevauchent : la plage ne recule pas ; après le dernier mot entendu : pas au-delà de la prise.
      if (k > 0) avant = Math.max(mots[k - 1].t0, Math.min(avant, apres));
      if (a === n && duree > 0) apres = Math.max(avant, Math.min(apres, duree));
      var total = 0, cumul = 0, q;
      for (q = k; q < a; q++) total += lettres(script[q]);
      for (q = k; q < a; q++) {
        var t0 = avant + (apres - avant) * cumul / total;
        cumul += lettres(script[q]);
        mots[q].t0 = Math.round(t0 * 1000) / 1000;
        mots[q].t1 = Math.round((avant + (apres - avant) * cumul / total) * 1000) / 1000;
      }
      k = a - 1;
    }
    return { mots: mots, reconnus: egaux };
  }

  /**
   * Enregistrement unique -> une plage par texte de scène, coupée au milieu du silence entre le dernier mot d'une
   * scène et le premier de la suivante. -> [{ debut, fin, mots (temps de l'enregistrement), reconnus, total }] | null
   */
  function decouperEnScenes(textes, entendus, duree) {
    var r = aligner(textes.join(' '), entendus, duree);
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
      var seule = aligner(textes[i], dedans);
      return { debut: debut, fin: fin, mots: s.mots, reconnus: seule ? seule.reconnus : 0, total: s.total };
    });
  }

  return { normaliserMot: normaliserMot, decouperMots: decouperMots, calageApproche: calageApproche, groupesParole: groupesParole,
    nombreEnLettres: nombreEnLettres, aligner: aligner, decouperEnScenes: decouperEnScenes };
});
