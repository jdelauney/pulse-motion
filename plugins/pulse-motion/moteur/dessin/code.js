/* Pulse Motion – code animé (spec S7, 5.9) : coloration, jetons, appariement d'une étape à l'autre, état au temps t.
 * Les données viennent du déroulé (scenes[].code.<clé>) :
 *   { langage: 'tableur' | 'js' | 'python' | 'html' | 'css' | 'sql' | 'json' | 'sh' | 'texte', titre: 'Ventes.xlsx',
 *     etapes: [{ code: '=SOMME(B2:B13)', debut: 'mot:somme', surligner: [1] }] }
 *
 * LANGAGES ; CLASSES (motcle, fonction, chaine, nombre, commentaire, ponctuation, operateur, reference, balise, attribut,
 *   propriete, texte) ; DUREE (0,8 s : passage d'une étape à l'autre, divisée par l'allure) ; PAR_LIGNE (0,12 s).
 * colorer(ligne, langage) -> [{ texte, classe }] : tableur (« = », fonctions en capitales, références A1, B2:B13, $A$1,
 *   Feuil1!A1, textes entre guillemets, nombres à virgule, séparateur « ; »), mots-clés, chaînes, nombres, commentaires et
 *   appels de fonction des autres langages ; html (balises, attributs, valeurs) ; css (propriétés, valeurs) ; texte brut.
 * lignes(code) -> lignes (tabulations en deux espaces). jetons(lignes, langage) -> [{ texte, classe, col, ligne }] sans
 *   espaces (identifiants et opérateurs séparés : un renommage ne remplace pas toute la ligne).
 * apparier(a, b) -> [[i, j]] : jetons communs (même texte, même classe) par plus longue sous-suite commune.
 * pistes(etapes, langage) -> { pistes: [{ t, c, p: [[col, ligne] | null par étape], o? }], lignes: [n par étape], largeur } : un jeton
 *   suivi d'une étape à l'autre (o : rang de sa première lettre dans le texte de la première étape, pour la frappe).
 * etat(debuts, t, duree) -> { de, vers, p, retires, ajoutes } : vers = dernière étape commencée ; les jetons retirés
 *   s'effacent sur la première moitié du passage, les nouveaux apparaissent sur la seconde.
 * valider(c) -> [messages en français] (règle code-invalide).
 * highlightLine, codeTokens, matchTokens, codeMorphState de engine/code.js d'explainroo (MIT, © 2026 Vincent Schmalbach) :
 * traduits, coloration du tableur ajoutée. Module pur : page (M.code) et Node.
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.code = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var LANGAGES = ['tableur', 'js', 'python', 'html', 'css', 'sql', 'json', 'sh', 'texte'];
  var CLASSES = ['motcle', 'fonction', 'chaine', 'nombre', 'commentaire', 'ponctuation', 'operateur', 'reference', 'balise', 'attribut', 'propriete', 'texte'];
  var DUREE = 0.8, PAR_LIGNE = 0.12;
  var MOTS = {
    js: 'async await break case catch class const continue default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield',
    python: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield self',
    sh: 'if then else elif fi for while do done case esac in function return export local echo exit sudo cd npm npx node git curl',
    sql: 'select from where join left right inner outer on group by order having limit insert into values update set delete create table index as and or not null is in like count sum avg distinct',
    json: 'true false null',
    tableur: 'VRAI FAUX TRUE FALSE',
  };
  var ensembles = {};
  function motsDe(l) {
    if (!ensembles[l]) {
      var s = {};
      String(MOTS[l] || '').split(' ').forEach(function (w) { if (w) s[l === 'sql' ? w.toLowerCase() : w] = true; });
      ensembles[l] = s;
    }
    return ensembles[l];
  }
  function commentaires(l) {
    if (l === 'python' || l === 'sh') return ['#'];
    if (l === 'sql') return ['--'];
    if (l === 'js') return ['//', '/*'];
    if (l === 'css') return ['/*'];
    return [];
  }

  function ajouter(sortie, texte, classe) {
    if (!texte) return;
    var der = sortie[sortie.length - 1];
    if (der && der.classe === classe && (classe === 'texte' || classe === 'ponctuation' || classe === 'commentaire')) der.texte += texte;
    else sortie.push({ texte: texte, classe: classe });
  }

  var REF = /^(?:(?:'[^']+'|[A-Za-zÀ-ÿ_][\wÀ-ÿ.]*)!)?\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?(?![\w(])/;
  var FONCTION_TABLEUR = /^[A-ZÀ-Ý][A-ZÀ-Ý0-9.]*(?=\s*\()/;
  function colorerTableur(ligne) {
    var s = [], i = 0;
    while (i < ligne.length) {
      var reste = ligne.slice(i), ch = ligne[i], m;
      if (ch === '"') {
        var j = i + 1;
        while (j < ligne.length && !(ligne[j] === '"' && ligne[j + 1] !== '"')) j += ligne[j] === '"' ? 2 : 1;
        ajouter(s, ligne.slice(i, j + 1), 'chaine'); i = j + 1; continue;
      }
      if ((m = REF.exec(reste))) { ajouter(s, m[0], 'reference'); i += m[0].length; continue; }
      if ((m = FONCTION_TABLEUR.exec(reste))) { ajouter(s, m[0], 'fonction'); i += m[0].length; continue; }
      if ((m = /^\d+(?:,\d+)?%?/.exec(reste)) && !/[\wÀ-ÿ]/.test(ligne[i - 1] || '')) { ajouter(s, m[0], 'nombre'); i += m[0].length; continue; }
      if ((m = /^[A-Za-zÀ-ÿ_][\wÀ-ÿ.]*/.exec(reste))) { ajouter(s, m[0], motsDe('tableur')[m[0]] ? 'motcle' : 'texte'); i += m[0].length; continue; }
      if ((m = /^(?:<=|>=|<>|[=+\-*/^&<>])/.exec(reste))) { ajouter(s, m[0], 'operateur'); i += m[0].length; continue; }
      if (/[();,{}[\]:!]/.test(ch)) { ajouter(s, ch, 'ponctuation'); i++; continue; }
      ajouter(s, ch, 'texte'); i++;
    }
    return s;
  }

  function colorerHtml(ligne) {
    var s = [], i = 0, dansBalise = false;
    while (i < ligne.length) {
      var reste = ligne.slice(i), m;
      if (!dansBalise && reste.indexOf('<!--') === 0) { var f = ligne.indexOf('-->', i); var fin = f < 0 ? ligne.length : f + 3; ajouter(s, ligne.slice(i, fin), 'commentaire'); i = fin; continue; }
      if (!dansBalise && (m = /^<\/?[A-Za-z][\w-]*/.exec(reste))) { ajouter(s, m[0], 'balise'); i += m[0].length; dansBalise = true; continue; }
      if (dansBalise) {
        if ((m = /^\/?>/.exec(reste))) { ajouter(s, m[0], 'balise'); i += m[0].length; dansBalise = false; continue; }
        if ((m = /^"[^"]*"?|^'[^']*'?/.exec(reste))) { ajouter(s, m[0], 'chaine'); i += m[0].length; continue; }
        if ((m = /^[A-Za-z_:][\w:.-]*/.exec(reste))) { ajouter(s, m[0], 'attribut'); i += m[0].length; continue; }
        if (reste[0] === '=') { ajouter(s, '=', 'ponctuation'); i++; continue; }
        ajouter(s, reste[0], 'texte'); i++; continue;
      }
      m = /^[^<]+/.exec(reste);
      ajouter(s, m ? m[0] : reste[0], 'texte'); i += m ? m[0].length : 1;
    }
    return s;
  }

  function colorerCss(ligne) {
    var s = [], i = 0;
    var propriete = /^\s*[a-z-]+\s*:(?!:)/i.test(ligne) && !/\{/.test(ligne.split(':')[0]);
    while (i < ligne.length) {
      var reste = ligne.slice(i), m;
      if (reste.indexOf('/*') === 0) { var f = ligne.indexOf('*/', i + 2); var fin = f < 0 ? ligne.length : f + 2; ajouter(s, ligne.slice(i, fin), 'commentaire'); i = fin; continue; }
      if ((m = /^"[^"]*"?|^'[^']*'?/.exec(reste))) { ajouter(s, m[0], 'chaine'); i += m[0].length; continue; }
      if ((m = /^@[a-z-]+/i.exec(reste))) { ajouter(s, m[0], 'motcle'); i += m[0].length; continue; }
      if ((m = /^#[0-9a-f]{3,8}\b/i.exec(reste)) && propriete) { ajouter(s, m[0], 'nombre'); i += m[0].length; continue; }
      if ((m = /^-?\d*\.?\d+(?:[a-z%]+)?/i.exec(reste)) && !/[\w-]/.test(ligne[i - 1] || '')) { ajouter(s, m[0], 'nombre'); i += m[0].length; continue; }
      if ((m = /^[a-z-]+(?=\s*:)/i.exec(reste)) && propriete && !s.some(function (x) { return x.classe === 'propriete'; })) { ajouter(s, m[0], 'propriete'); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_-][\w-]*(?=\()/.exec(reste))) { ajouter(s, m[0], 'fonction'); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_.#-][\w-]*/.exec(reste))) { ajouter(s, m[0], 'texte'); i += m[0].length; continue; }
      if (/[{}();:,>+~[\]=]/.test(reste[0])) { ajouter(s, reste[0], 'ponctuation'); i++; continue; }
      ajouter(s, reste[0], 'texte'); i++;
    }
    return s;
  }

  function colorerGenerique(ligne, l) {
    var s = [], i = 0;
    var mots = motsDe(l), sql = l === 'sql', debuts = commentaires(l);
    while (i < ligne.length) {
      var reste = ligne.slice(i), ch = ligne[i], m;
      var com = debuts.filter(function (c) { return reste.indexOf(c) === 0; })[0];
      if (com) {
        if (com === '/*') { var f = ligne.indexOf('*/', i + 2); var fin = f < 0 ? ligne.length : f + 2; ajouter(s, ligne.slice(i, fin), 'commentaire'); i = fin; continue; }
        ajouter(s, reste, 'commentaire'); break;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        var j = i + 1;
        while (j < ligne.length && ligne[j] !== ch) j += ligne[j] === '\\' ? 2 : 1;
        ajouter(s, ligne.slice(i, j + 1), 'chaine'); i = j + 1; continue;
      }
      if ((m = /^(0x[0-9a-f]+|\d+(\.\d+)?)/i.exec(reste)) && !/[A-Za-z_$]/.test(ligne[i - 1] || '')) { ajouter(s, m[0], 'nombre'); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_$][\w$]*/.exec(reste))) {
        var mot = m[0], suite = ligne.slice(i + mot.length).replace(/^\s+/, '')[0];
        if (mots[sql ? mot.toLowerCase() : mot]) ajouter(s, mot, 'motcle');
        else if (suite === '(' && l !== 'json') ajouter(s, mot, 'fonction');
        else ajouter(s, mot, 'texte');
        i += mot.length; continue;
      }
      if (/[{}()[\];,.:=<>+\-*/%!&|?]/.test(ch)) { ajouter(s, ch, 'ponctuation'); i++; continue; }
      ajouter(s, ch, 'texte'); i++;
    }
    return s;
  }

  function colorer(ligne, langage) {
    var l = String(langage || 'texte');
    ligne = String(ligne);
    if (l === 'tableur') return colorerTableur(ligne);
    if (l === 'html') return colorerHtml(ligne);
    if (l === 'css') return colorerCss(ligne);
    if (l === 'texte' || LANGAGES.indexOf(l) < 0) return ligne ? [{ texte: ligne, classe: 'texte' }] : [];
    return colorerGenerique(ligne, l);
  }

  function lignes(code) { return String(code).replace(/\r\n?/g, '\n').replace(/\t/g, '  ').split('\n'); }

  var DECOUPE = /\s+|[A-Za-zÀ-ÿ_$][\wÀ-ÿ$]*|===|!==|=>|==|!=|<=|>=|<>|&&|\|\||\?\?|\.\.\.|->|::|[^\s]/g;
  function jetons(ls, langage) {
    var r = [];
    ls.forEach(function (ligne, rang) {
      var col = 0;
      colorer(ligne, langage).forEach(function (j) {
        var parts = j.classe === 'texte' || j.classe === 'ponctuation' ? (j.texte.match(DECOUPE) || []) : [j.texte];
        parts.forEach(function (t) {
          if (/\S/.test(t)) r.push({ texte: t, classe: j.classe, col: col, ligne: rang });
          col += t.length;
        });
      });
    });
    return r;
  }

  function apparier(a, b) {
    var n = a.length, m = b.length, cols = m + 1;
    var L = new Uint32Array((n + 1) * cols);
    var pareil = function (i, j) { return a[i].texte === b[j].texte && a[i].classe === b[j].classe; };
    for (var i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        L[i * cols + j] = pareil(i, j) ? 1 + L[(i + 1) * cols + j + 1] : Math.max(L[(i + 1) * cols + j], L[i * cols + j + 1]);
      }
    }
    var paires = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (pareil(i, j)) paires.push([i++, j++]);
      else if (L[(i + 1) * cols + j] >= L[i * cols + j + 1]) i++;
      else j++;
    }
    return paires;
  }

  function pistes(etapes, langage) {
    var n = etapes.length;
    var liste = [], precedents = null, prec = null, nbLignes = [], largeur = 0;
    etapes.forEach(function (e, s) {
      var ls = lignes(e.code);
      nbLignes.push(ls.length);
      ls.forEach(function (x) { largeur = Math.max(largeur, x.length); });
      var jets = jetons(ls, langage);
      var cour = new Array(jets.length);
      if (s > 0) apparier(prec, jets).forEach(function (p) { cour[p[1]] = precedents[p[0]]; });
      var decalages = null;
      if (s === 0) { decalages = []; var o = 0; ls.forEach(function (x) { decalages.push(o); o += x.length + 1; }); }
      jets.forEach(function (j, k) {
        if (cour[k] === undefined) {
          cour[k] = liste.length;
          var p = [];
          for (var q = 0; q < n; q++) p.push(null);
          liste.push(s === 0 ? { t: j.texte, c: j.classe, p: p, o: decalages[j.ligne] + j.col } : { t: j.texte, c: j.classe, p: p });
        }
        liste[cour[k]].p[s] = [j.col, j.ligne];
      });
      precedents = cour;
      prec = jets;
    });
    return { pistes: liste, lignes: nbLignes, largeur: largeur };
  }

  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function douce(x) { return 0.5 - 0.5 * Math.cos(Math.PI * clamp(x)); }
  function etat(debuts, t, duree) {
    var vers = 0;
    for (var i = 1; i < debuts.length; i++) if (t >= debuts[i]) vers = i;
    var de = Math.max(0, vers - 1);
    var brut = vers ? (duree > 0 ? clamp((t - debuts[vers]) / duree) : 1) : 1;
    return { de: de, vers: vers, p: douce(brut), retires: 1 - douce(brut * 2), ajoutes: douce(brut * 2 - 1) };
  }

  function valider(c) {
    var err = [];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return ['doit être un objet { "langage": "tableur", "etapes": [{ "code": "=SOMME(B2:B13)" }] }.'];
    var champs = ['langage', 'titre', 'etapes'];
    Object.keys(c).forEach(function (k) { if (champs.indexOf(k) < 0) err.push('champ « ' + k + ' » inconnu (champs : ' + champs.join(', ') + ').'); });
    if (c.langage !== undefined && LANGAGES.indexOf(c.langage) < 0) err.push('langage « ' + c.langage + ' » inconnu (' + LANGAGES.join(', ') + ').');
    if (c.titre !== undefined && typeof c.titre !== 'string') err.push('« titre » doit être un texte (ex. « Ventes.xlsx »).');
    if (!Array.isArray(c.etapes) || !c.etapes.length) { err.push('« etapes » est vide : donner au moins une étape, ex. [{ "code": "=SOMME(B2:B13)" }].'); return err; }
    c.etapes.forEach(function (e, i) {
      var n = 'l\'étape n° ' + (i + 1);
      if (!e || typeof e !== 'object' || Array.isArray(e)) { err.push(n + ' doit être un objet { "code": "…", "debut": "mot:…" }.'); return; }
      Object.keys(e).forEach(function (k) { if (['code', 'debut', 'surligner'].indexOf(k) < 0) err.push(n + ' : champ « ' + k + ' » inconnu (code, debut, surligner).'); });
      if (typeof e.code !== 'string' || !e.code.trim()) err.push(n + ' : « code » doit être un texte non vide.');
      if (e.debut !== undefined && typeof e.debut !== 'string' && typeof e.debut !== 'number') err.push(n + ' : « debut » doit être un instant (« mot:somme », 2.5).');
      if (i > 0 && e.debut === undefined) err.push(n + ' : « debut » manque (l\'instant du passage à cette étape, « mot:somme »).');
      if (e.surligner !== undefined) {
        var nb = typeof e.code === 'string' ? lignes(e.code).length : 0;
        if (!Array.isArray(e.surligner) || !e.surligner.every(function (x) { return x === Math.round(x) && x >= 1 && x <= nb; })) err.push(n + ' : « surligner » doit être une liste de numéros de ligne, de 1 à ' + nb + '.');
      }
    });
    return err;
  }

  return { LANGAGES: LANGAGES, CLASSES: CLASSES, DUREE: DUREE, PAR_LIGNE: PAR_LIGNE, colorer: colorer, lignes: lignes, jetons: jetons,
    apparier: apparier, pistes: pistes, etat: etat, valider: valider };
});
