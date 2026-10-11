/* Pulse Motion – recettes d'effets de particules : héritage, réglages, couleurs, compilation.
 *
 * resoudre(nom, charger)   applique « etend » (fusion profonde, émetteurs fusionnés par nom)
 * analyserReglages(texte)  "nombre: 3000; couleur: accent" -> { valeurs, erreurs }
 * compiler(recette, o)     recette -> paramètres numériques pour le GPU (cqh, s de τ, radians,
 *                          RVB linéaire, tables de 64 valeurs, capacités)
 *
 * Module pur : chargé tel quel dans la page (global M.recette) et par Node (require).
 */
(function (racine, fabrique) {
  var noeud = typeof require === 'function' && typeof module === 'object';
  var C = noeud ? require('../courbes.js') : racine.M;
  var X = noeud ? require('./expression.js') : racine.M.expression;
  var api = fabrique(C, X);
  if (noeud && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.recette = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, X) {
  'use strict';

  var PAS = 1 / 120;
  var TAILLE_TABLE = 64;
  var PROFONDEUR_MAX = 2;
  var FORCES_MAX = 8;
  var TRAINEE_MAX = 16;
  var CODES = {
    forme: { point: 0, cercle: 1, anneau: 2, rectangle: 3, ligne: 4, ancre: 5 },
    force: { gravite: 0, trainee: 1, vent: 2, turbulence: 3, attracteur: 4, vortex: 5, rappel: 6 },
    rendu: { sprite: 0, etincelle: 1, trainee: 2, planche: 3 },
    melange: { additif: 0, alpha: 1, premultiplie: 2 },
    texture: { 'disque-doux': 0, etoile: 1, fumee: 2, flamme: 3, eclat: 4, confetti: 5, image: 6 },
  };
  var COULEURS_CHARTE = ['primaire', 'accent', 'texte', 'fond'];
  var HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

  function ErreurRecette(regle, message) {
    var e = new Error(message);
    e.name = 'ErreurRecette';
    e.regle = regle;
    return e;
  }

  function estObjet(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function cloner(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  // ---- Héritage ----

  function fusionnerEmetteurs(base, ajout) {
    var r = cloner(base);
    ajout.forEach(function (e) {
      var i = -1;
      r.forEach(function (b, j) { if (estObjet(b) && estObjet(e) && b.nom === e.nom) i = j; });
      if (i >= 0) r[i] = fusionner(r[i], e);
      else r.push(cloner(e));
    });
    return r;
  }

  /** Fusion profonde : objets fusionnés, tableaux et valeurs remplacés ; emetteurs fusionnés par nom. */
  function fusionner(base, ajout) {
    if (!estObjet(base) || !estObjet(ajout)) return cloner(ajout);
    var r = cloner(base);
    Object.keys(ajout).forEach(function (k) {
      if (k === 'emetteurs' && Array.isArray(r.emetteurs) && Array.isArray(ajout.emetteurs)) r.emetteurs = fusionnerEmetteurs(r.emetteurs, ajout.emetteurs);
      else if (estObjet(r[k]) && estObjet(ajout[k])) r[k] = fusionner(r[k], ajout[k]);
      else r[k] = cloner(ajout[k]);
    });
    return r;
  }

  /** resoudre(nom, charger) -> recette complète ; charger(nom) -> objet JSON | null. */
  function resoudre(nom, charger) {
    var chaine = [];
    function charge(n) {
      if (chaine.indexOf(n) >= 0) {
        throw ErreurRecette('effet-invalide', 'Effet « ' + nom + ' » : héritage circulaire (' + chaine.concat(n).join(' → ') + ').');
      }
      chaine.push(n);
      var r = charger(n);
      if (!estObjet(r)) {
        if (chaine.length === 1) throw ErreurRecette('effet-inconnu', 'Effet « ' + n + ' » introuvable (ni dans effets/ du projet, ni dans la bibliothèque).');
        throw ErreurRecette('effet-invalide', 'Effet « ' + nom + ' » : « etend » vise « ' + n + ' », introuvable.');
      }
      if (r.etend !== undefined && r.etend !== null) {
        if (typeof r.etend !== 'string') throw ErreurRecette('effet-invalide', 'Effet « ' + n + ' » : « etend » doit être un nom d\'effet.');
        return fusionner(charge(r.etend), r);
      }
      return cloner(r);
    }
    var recette = charge(nom);
    recette.nom = nom;
    recette.etend = null;
    return recette;
  }

  // ---- Réglages et couleurs ----

  /** "nombre: 3000; couleur: accent" -> { valeurs: { nombre: '3000', couleur: 'accent' }, erreurs: [message] } */
  function analyserReglages(texte) {
    var valeurs = {};
    var erreurs = [];
    String(texte || '').split(';').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (clause) {
      var m = /^([a-z_][a-z0-9_]*)\s*:\s*(\S(?:.*\S)?)$/.exec(clause);
      if (!m) erreurs.push('réglage « ' + clause + ' » illisible (attendu « nom: valeur »)');
      else valeurs[m[1]] = m[2];
    });
    return { valeurs: valeurs, erreurs: erreurs };
  }

  function hexVersRVBA(hex) {
    var h = hex.slice(1);
    if (h.length <= 4) h = h.split('').map(function (c) { return c + c; }).join('');
    if (h.length === 6) h += 'ff';
    return [0, 2, 4, 6].map(function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; });
  }

  function versLineaire(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

  /** Texte -> hex, via les paramètres de type couleur puis la charte. */
  function resoudreCouleur(texte, ctx) {
    var t = String(texte).trim();
    if (HEX.test(t)) return t;
    if (ctx.couleurs && Object.prototype.hasOwnProperty.call(ctx.couleurs, t)) return resoudreCouleur(ctx.couleurs[t], { charte: ctx.charte });
    if (COULEURS_CHARTE.indexOf(t) >= 0 && ctx.charte && HEX.test(String(ctx.charte[t] || ''))) return ctx.charte[t];
    throw new Error('couleur « ' + t + ' » inconnue (hex comme #ffb347, ou ' + COULEURS_CHARTE.join(', ') + ')');
  }

  /** couleurLineaire('#ff8800', { couleurs, charte }) -> [r, g, b, a] (RVB linéaire, alpha inchangé) */
  function couleurLineaire(texte, ctx) {
    var c = hexVersRVBA(resoudreCouleur(texte, ctx || {}));
    return [versLineaire(c[0]), versLineaire(c[1]), versLineaire(c[2]), c[3]];
  }

  // ---- Compilation ----

  function rad(d) { return d * Math.PI / 180; }
  function arrondi(x) { return Math.round(x * 1e6) / 1e6; }

  /** Valeurs des paramètres : défauts de la recette, puis réglages de la scène. */
  function valeursParametres(recette, reglages, charte, invalide) {
    var params = recette.parametres === undefined ? {} : recette.parametres;
    if (!estObjet(params)) throw invalide('', '« parametres » doit être un objet');
    var nombres = {};
    var couleurs = {};
    var erreurs = [];
    Object.keys(params).forEach(function (nom) {
      var p = params[nom];
      var ch = 'parametres.' + nom;
      if (!/^[a-z_][a-z0-9_]*$/.test(nom) || nom === 'dur') throw invalide(ch, 'nom de paramètre invalide (minuscules, chiffres, _ ; « dur » est réservé)');
      if (!estObjet(p)) throw invalide(ch, 'objet { defaut, min, max } attendu');
      if (p.type === 'couleur') {
        try { couleurs[nom] = resoudreCouleur(p.defaut, { charte: charte }); } catch (e) { throw invalide(ch + '.defaut', e.message); }
        return;
      }
      if (p.type !== undefined && p.type !== 'nombre') throw invalide(ch + '.type', '« nombre » ou « couleur » attendu');
      if (typeof p.defaut !== 'number' || !isFinite(p.defaut)) throw invalide(ch + '.defaut', 'nombre attendu');
      ['min', 'max'].forEach(function (b) {
        if (p[b] !== undefined && (typeof p[b] !== 'number' || !isFinite(p[b]))) throw invalide(ch + '.' + b, 'nombre attendu');
      });
      if (p.min !== undefined && p.max !== undefined && p.min > p.max) throw invalide(ch, 'min dépasse max');
      if ((p.min !== undefined && p.defaut < p.min) || (p.max !== undefined && p.defaut > p.max)) throw invalide(ch + '.defaut', 'hors des bornes min et max');
      nombres[nom] = p.defaut;
    });
    Object.keys(reglages).forEach(function (nom) {
      var p = params[nom];
      var v = reglages[nom];
      if (!p) {
        erreurs.push('« ' + nom + ' » n\'est pas un réglage de l\'effet « ' + recette.nom + ' » (réglages : ' + (Object.keys(params).join(', ') || 'aucun') + ').');
        return;
      }
      if (p.type === 'couleur') {
        try { couleurs[nom] = resoudreCouleur(v, { charte: charte }); } catch (e) { erreurs.push('réglage « ' + nom + ' » : ' + e.message + '.'); }
        return;
      }
      var x = Number(v);
      if (v === '' || !isFinite(x)) { erreurs.push('réglage « ' + nom + ' » : « ' + v + ' » n\'est pas un nombre.'); return; }
      if (p.min !== undefined && x < p.min) { erreurs.push('réglage « ' + nom + ' » : ' + x + ' est sous le minimum ' + p.min + '.'); return; }
      if (p.max !== undefined && x > p.max) { erreurs.push('réglage « ' + nom + ' » : ' + x + ' est au-delà du maximum ' + p.max + '.'); return; }
      nombres[nom] = x;
    });
    return { nombres: nombres, couleurs: couleurs, erreurs: erreurs };
  }

  /**
   * compiler(recette, { reglages, charte, dur, graine }) -> { ok, effet, erreurs: [{ regle, message }] }
   * La recette est déjà résolue (resoudre). Arrêt à la première erreur de structure ;
   * toutes les erreurs de réglage sont listées.
   */
  function compiler(recette, options) {
    var o = options || {};
    var nomEffet = recette && recette.nom ? recette.nom : '?';
    var prefixe = 'Effet « ' + nomEffet + ' »';
    function invalide(chemin, message) {
      return ErreurRecette('effet-invalide', prefixe + (chemin ? ', ' + chemin : '') + ' : ' + message + '.');
    }
    try {
      if (!estObjet(recette)) throw invalide('', 'objet JSON attendu');
      if (recette.version !== 1) throw invalide('', '« version » doit valoir 1');
      var reg = analyserReglages(o.reglages);
      var vp = valeursParametres(recette, reg.valeurs, o.charte, invalide);
      var erreursReglages = reg.erreurs.concat(vp.erreurs);
      if (erreursReglages.length) {
        return { ok: false, effet: null, erreurs: erreursReglages.map(function (m) { return { regle: 'reglage-invalide', message: prefixe + ' : ' + m }; }) };
      }
      var dur = o.dur > 0 ? o.dur : 1;
      var valeurs = {};
      Object.keys(vp.nombres).forEach(function (k) { valeurs[k] = vp.nombres[k]; });
      valeurs.dur = dur;
      var ctxCouleur = { couleurs: vp.couleurs, charte: o.charte };

      function nombre(v, chemin, defaut) {
        if (v === undefined || v === null) {
          if (defaut === undefined) throw invalide(chemin, 'valeur obligatoire');
          return defaut;
        }
        if (typeof v === 'number' && isFinite(v)) return v;
        if (typeof v === 'string') {
          try { return X.evaluer(v, valeurs); } catch (e) { throw invalide(chemin, e.message); }
        }
        throw invalide(chemin, 'nombre ou expression attendu');
      }
      function intervalle(v, chemin, defaut) {
        if (v === undefined || v === null) return defaut.slice();
        if (Array.isArray(v)) {
          if (v.length !== 2) throw invalide(chemin, 'intervalle [min, max] attendu');
          var a = nombre(v[0], chemin + '[0]');
          var b = nombre(v[1], chemin + '[1]');
          if (a > b) throw invalide(chemin, 'le minimum ' + a + ' dépasse le maximum ' + b);
          return [a, b];
        }
        var x = nombre(v, chemin);
        return [x, x];
      }
      function paire(v, chemin, defaut) {
        if (v === undefined || v === null) return defaut.slice();
        if (!Array.isArray(v) || v.length !== 2) throw invalide(chemin, 'paire [x, y] attendue');
        return [nombre(v[0], chemin + '[0]'), nombre(v[1], chemin + '[1]')];
      }
      function couleur(v, chemin) {
        try { return couleurLineaire(v, ctxCouleur); } catch (e) { throw invalide(chemin, e.message); }
      }
      function courbe(n, chemin) {
        if (n === undefined) return C.courbe('linear', 'in');
        if (typeof n !== 'string') throw invalide(chemin, 'nom de courbe attendu (exemples : cubic-out, sine-arch)');
        try { return C.courbeNommee(n); } catch (e) { throw invalide(chemin, e.message.replace(/\.$/, '')); }
      }
      function choix(v, liste, chemin, defaut) {
        if (v === undefined) {
          if (defaut === undefined) throw invalide(chemin, 'valeur obligatoire (' + Object.keys(liste).join(', ') + ')');
          return defaut;
        }
        if (typeof v !== 'string' || !Object.prototype.hasOwnProperty.call(liste, v)) {
          throw invalide(chemin, '« ' + v + ' » inconnu (' + Object.keys(liste).join(', ') + ')');
        }
        return v;
      }
      function objet(v, chemin) {
        if (v === undefined) return {};
        if (!estObjet(v)) throw invalide(chemin, 'objet attendu');
        return v;
      }

      function compilerForme(f, ch) {
        f = f === undefined ? { type: 'ancre' } : objet(f, ch);
        var type = choix(f.type, CODES.forme, ch + '.type', 'ancre');
        var zone = choix(f.zone, { surface: 1, contour: 1 }, ch + '.zone', 'surface');
        return {
          type: type,
          code: CODES.forme[type],
          contour: zone === 'contour',
          rayon: nombre(f.rayon, ch + '.rayon', -1),
          rayonInterieur: nombre(f.rayon_interieur, ch + '.rayon_interieur', 0),
          largeur: nombre(f.largeur, ch + '.largeur', -1),
          hauteur: nombre(f.hauteur, ch + '.hauteur', -1),
          angle: rad(nombre(f.angle, ch + '.angle', 0)),
          decalage: paire(f.decalage, ch + '.decalage', [0, 0]),
        };
      }

      function compilerVitesse(v, ch) {
        v = objet(v, ch);
        var d = paire(v.direction, ch + '.direction', [0, -1]);
        var l = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
        if (l === 0) throw invalide(ch + '.direction', 'direction nulle');
        var cone = nombre(v.cone, ch + '.cone', 0);
        if (cone < 0 || cone > 360) throw invalide(ch + '.cone', 'angle entre 0 et 360 degrés attendu');
        return {
          direction: [d[0] / l, d[1] / l],
          cone: rad(cone),
          valeur: intervalle(v.valeur, ch + '.valeur', [0, 0]),
          radiale: v.radiale === true,
          heritage: nombre(v.heritage, ch + '.heritage', 0),
        };
      }

      function compilerForces(liste, ch) {
        if (liste === undefined) return [];
        if (!Array.isArray(liste)) throw invalide(ch, 'liste attendue');
        if (liste.length > FORCES_MAX) throw invalide(ch, FORCES_MAX + ' forces au plus');
        return liste.map(function (f, k) {
          var c = ch + '[' + k + ']';
          if (!estObjet(f)) throw invalide(c, 'objet attendu');
          var type = choix(f.type, CODES.force, c + '.type');
          var r = { type: type, code: CODES.force[type] };
          if (type === 'gravite') {
            var g = nombre(f.valeur, c + '.valeur', 40);
            var d = paire(f.direction, c + '.direction', [0, 1]);
            var l = Math.sqrt(d[0] * d[0] + d[1] * d[1]) || 1;
            r.a = [arrondi(d[0] / l * g), arrondi(d[1] / l * g)];
          } else if (type === 'trainee') {
            r.coef = nombre(f.coef, c + '.coef', 1);
            r.quadratique = f.quadratique === true;
          } else if (type === 'vent') {
            r.vitesse = paire(f.vitesse, c + '.vitesse', [10, 0]);
            r.coef = nombre(f.coef, c + '.coef', 1);
          } else if (type === 'turbulence') {
            r.echelle = nombre(f.echelle, c + '.echelle', 10);
            r.force = nombre(f.force, c + '.force', 10);
            r.vitesse = nombre(f.vitesse, c + '.vitesse', 0.5);
            if (r.echelle <= 0) throw invalide(c + '.echelle', 'valeur positive attendue');
          } else if (type === 'attracteur' || type === 'vortex') {
            r.force = nombre(f.force, c + '.force', 20);
            r.rayon = nombre(f.rayon, c + '.rayon', 10);
            r.centre = paire(f.centre, c + '.centre', [0.5, 0.5]);
            if (r.rayon <= 0) throw invalide(c + '.rayon', 'valeur positive attendue');
          } else {
            r.raideur = nombre(f.raideur, c + '.raideur', 10);
            r.amortissement = nombre(f.amortissement, c + '.amortissement', 1);
            r.centre = paire(f.centre, c + '.centre', [0.5, 0.5]);
          }
          if (r.coef !== undefined && r.coef < 0) throw invalide(c + '.coef', 'valeur positive ou nulle attendue');
          return r;
        });
      }

      function table(v, ch, defaut) {
        var de = defaut, a = defaut, f = C.courbe('linear', 'in');
        if (typeof v === 'number' || typeof v === 'string') { de = a = nombre(v, ch); }
        else if (estObjet(v)) {
          de = nombre(v.de, ch + '.de', defaut);
          a = nombre(v.a, ch + '.a', de);
          f = courbe(v.courbe, ch + '.courbe');
        } else if (v !== undefined) throw invalide(ch, 'nombre ou objet { de, a, courbe } attendu');
        var t = [];
        for (var i = 0; i < TAILLE_TABLE; i++) t.push(arrondi(de + (a - de) * f(i / (TAILLE_TABLE - 1))));
        return t;
      }

      function tableCouleur(v, ch) {
        var stops = ['#ffffff'];
        var f = C.courbe('linear', 'in');
        if (typeof v === 'string') stops = [v];
        else if (estObjet(v)) {
          stops = v.degrade;
          f = courbe(v.courbe, ch + '.courbe');
          if (!Array.isArray(stops) || !stops.length) throw invalide(ch + '.degrade', 'liste de couleurs non vide attendue');
        } else if (v !== undefined) throw invalide(ch, 'couleur ou objet { degrade, courbe } attendu');
        var cs = stops.map(function (s, k) { return couleur(s, ch + '.degrade[' + k + ']'); });
        var t = [];
        for (var i = 0; i < TAILLE_TABLE; i++) {
          var u = Math.max(0, Math.min(1, f(i / (TAILLE_TABLE - 1)))) * (cs.length - 1);
          var k = Math.min(Math.floor(u), Math.max(0, cs.length - 2));
          var r = cs.length === 1 ? 0 : u - k;
          var c0 = cs[k];
          var c1 = cs[Math.min(k + 1, cs.length - 1)];
          for (var j = 0; j < 4; j++) t.push(arrondi(c0[j] + (c1[j] - c0[j]) * r));
        }
        return t;
      }

      function compilerVie(v, ch) {
        v = objet(v, ch);
        return {
          couleur: tableCouleur(v.couleur, ch + '.couleur'),
          taille: table(v.taille, ch + '.taille', 1),
          intensite: table(v.intensite, ch + '.intensite', 1),
          opacite: table(v.opacite, ch + '.opacite', 1),
        };
      }

      function compilerRendu(r, ch) {
        r = objet(r, ch);
        var type = choix(r.type, CODES.rendu, ch + '.type', 'sprite');
        var texture = r.texture === undefined ? 'disque-doux' : r.texture;
        var fichier = null;
        if (typeof texture === 'string' && /^assets\//.test(texture)) {
          if (!/\.(png|webp|jpe?g|svg)$/i.test(texture)) throw invalide(ch + '.texture', 'image PNG, WebP, JPEG ou SVG attendue');
          fichier = texture;
          texture = 'image';
        } else if (texture === 'image' || !Object.prototype.hasOwnProperty.call(CODES.texture, texture)) {
          var noms = Object.keys(CODES.texture).filter(function (n) { return n !== 'image'; });
          throw invalide(ch + '.texture', '« ' + texture + ' » inconnue (' + noms.join(', ') + ', ou une image « assets/… »)');
        }
        var melange = choix(r.melange, CODES.melange, ch + '.melange', 'additif');
        var res = {
          type: type,
          code: CODES.rendu[type],
          texture: texture,
          textureCode: CODES.texture[texture],
          textureFichier: fichier,
          melange: melange,
          melangeCode: CODES.melange[melange],
          etirement: nombre(r.etirement, ch + '.etirement', 0.03),
          flou: r.flou === true,
          longueur: Math.round(nombre(r.longueur, ch + '.longueur', 8)),
          planche: null,
        };
        if (res.longueur < 2 || res.longueur > TRAINEE_MAX) throw invalide(ch + '.longueur', 'entre 2 et ' + TRAINEE_MAX + ' points');
        if (type === 'planche') {
          if (!fichier) throw invalide(ch + '.texture', 'une planche de sprites demande une image de assets/');
          var p = r.planche;
          if (!estObjet(p)) throw invalide(ch + '.planche', 'objet { colonnes, lignes, ips } attendu');
          res.planche = {
            colonnes: Math.round(nombre(p.colonnes, ch + '.planche.colonnes')),
            lignes: Math.round(nombre(p.lignes, ch + '.planche.lignes')),
            ips: nombre(p.ips, ch + '.planche.ips', 0),
          };
          if (res.planche.colonnes < 1 || res.planche.lignes < 1) throw invalide(ch + '.planche', 'au moins 1 colonne et 1 ligne');
        }
        return res;
      }

      // Émetteurs : noms, liens parent → enfant, profondeur.
      var liste = recette.emetteurs;
      if (!Array.isArray(liste) || !liste.length) throw invalide('', '« emetteurs » doit être une liste non vide');
      var parNom = Object.create(null);
      liste.forEach(function (e, i) {
        if (!estObjet(e)) throw invalide('emetteurs[' + i + ']', 'objet attendu');
        if (typeof e.nom !== 'string' || !/^[a-z0-9-]+$/.test(e.nom)) throw invalide('emetteurs[' + i + ']', '« nom » obligatoire (minuscules, chiffres, tirets)');
        if (parNom[e.nom] !== undefined) throw invalide('emetteurs[' + e.nom + ']', 'nom en double');
        parNom[e.nom] = i;
      });
      var parent = liste.map(function () { return -1; });
      var enfant = liste.map(function () { return -1; });
      liste.forEach(function (e, i) {
        var cible = e.a_la_mort && e.a_la_mort.emetteur;
        if (cible === undefined || cible === null) return;
        var ch = 'emetteurs[' + e.nom + '].a_la_mort.emetteur';
        if (parNom[cible] === undefined) throw invalide(ch, 'émetteur « ' + cible + ' » inconnu');
        var j = parNom[cible];
        if (j === i) throw invalide(ch, 'un émetteur ne peut pas se lancer lui-même');
        if (parent[j] >= 0) throw invalide(ch, '« ' + cible + ' » est déjà lancé par « ' + liste[parent[j]].nom + ' »');
        parent[j] = i;
        enfant[i] = j;
      });
      var profondeur = liste.map(function (e, i) {
        var p = 0, k = i, vus = [i];
        while (parent[k] >= 0) {
          k = parent[k];
          if (vus.indexOf(k) >= 0) throw invalide('emetteurs[' + e.nom + ']', 'sous-émetteurs en boucle');
          vus.push(k);
          p++;
        }
        if (p > PROFONDEUR_MAX) throw invalide('emetteurs[' + e.nom + ']', 'trop de niveaux de sous-émetteurs (' + PROFONDEUR_MAX + ' au plus)');
        return p;
      });

      function compilerEmetteur(e, i, P) {
        var ch = 'emetteurs[' + e.nom + ']';
        var n = objet(e.naissance, ch + '.naissance');
        var vie = intervalle(n.vie, ch + '.naissance.vie', [1, 1]);
        if (vie[0] <= 0) throw invalide(ch + '.naissance.vie', 'la durée de vie doit être positive');
        var em = {
          nom: e.nom,
          index: i,
          parent: P ? P.index : -1,
          profondeur: profondeur[i],
          aLaMort: enfant[i],
          vie: vie,
          taille: intervalle(n.taille, ch + '.naissance.taille', [1, 1]),
          masse: intervalle(n.masse, ch + '.naissance.masse', [1, 1]),
          z: intervalle(n.z, ch + '.naissance.z', [0, 0]),
          rotation: intervalle(n.rotation, ch + '.naissance.rotation', [0, 0]).map(rad),
          vitesseAngulaire: intervalle(n.vitesse_angulaire, ch + '.naissance.vitesse_angulaire', [0, 0]).map(rad),
          forme: compilerForme(n.forme, ch + '.naissance.forme'),
          vitesse: compilerVitesse(n.vitesse, ch + '.naissance.vitesse'),
          forces: compilerForces(e.forces, ch + '.forces'),
          tables: compilerVie(e.vie, ch + '.vie'),
          rendu: compilerRendu(e.rendu, ch + '.rendu'),
        };
        if (em.masse[0] <= 0) throw invalide(ch + '.naissance.masse', 'la masse doit être positive');
        if (P) {
          if (n.debit !== undefined || n.salves !== undefined) {
            throw invalide(ch + '.naissance', 'un sous-émetteur naît de la mort de « ' + P.nom + ' » : utiliser « nombre », pas « debit » ni « salves »');
          }
          em.k = Math.round(nombre(n.nombre, ch + '.naissance.nombre'));
          if (em.k < 1) throw invalide(ch + '.naissance.nombre', 'au moins 1');
          // G : une case d'enfant n'est réutilisée qu'après la mort de son occupant.
          em.G = P.periode === Infinity ? 1 : Math.max(1, Math.ceil(vie[1] / P.periode));
          em.debit = 0;
          em.nTotal = 0;
          em.capContinu = 0;
          em.salves = [];
          em.capacite = P.capacite * em.G * em.k;
          em.periode = P.periode === Infinity ? Infinity : em.G * P.periode - (vie[1] - vie[0]);
          em.finNaissances = P.fin;
        } else {
          if (n.nombre !== undefined) throw invalide(ch + '.naissance.nombre', '« nombre » est réservé aux sous-émetteurs ; utiliser « debit » ou « salves »');
          em.k = 0;
          em.G = 1;
          em.debit = nombre(n.debit, ch + '.naissance.debit', 0);
          if (em.debit < 0) throw invalide(ch + '.naissance.debit', 'valeur positive ou nulle attendue');
          var salves = n.salves === undefined ? [] : n.salves;
          if (!Array.isArray(salves)) throw invalide(ch + '.naissance.salves', 'liste attendue');
          em.nTotal = Math.floor(em.debit * dur + 1e-9);
          em.capContinu = em.debit > 0 ? Math.min(em.nTotal, Math.ceil(em.debit * vie[1]) + 1) : 0;
          var debut = em.capContinu;
          var finN = em.nTotal > 0 ? (em.nTotal - 1) / em.debit : 0;
          em.salves = salves.map(function (s, k) {
            var c = ch + '.naissance.salves[' + k + ']';
            if (!estObjet(s)) throw invalide(c, 'objet { t, nombre } attendu');
            var t = nombre(s.t, c + '.t', 0);
            var nb = Math.round(nombre(s.nombre, c + '.nombre'));
            if (t < 0 || nb < 1) throw invalide(c, 't ≥ 0 et nombre ≥ 1 attendus');
            var r = { t: t, nombre: nb, debut: debut };
            debut += nb;
            finN = Math.max(finN, t);
            return r;
          });
          if (em.nTotal === 0 && !em.salves.length) {
            throw invalide(ch + '.naissance', 'indiquer « debit » (avec une durée data-dur suffisante) ou « salves » ; un sous-émetteur se lance par « a_la_mort » de son parent');
          }
          em.capacite = debut;
          em.periode = em.capContinu > 0 && em.capContinu < em.nTotal ? em.capContinu / em.debit - (vie[1] - vie[0]) : Infinity;
          em.finNaissances = finN;
        }
        em.fin = arrondi(em.finNaissances + vie[1]);
        em.voieRapide = em.parent < 0 && em.aLaMort < 0 && em.rendu.type !== 'trainee' && em.forces.every(function (f) {
          return f.type === 'gravite' || (f.type === 'trainee' && !f.quadratique);
        });
        return em;
      }

      // Un parent est compilé avant ses enfants (capacité et période).
      var ordre = liste.map(function (e, i) { return i; }).sort(function (a, b) { return profondeur[a] - profondeur[b] || a - b; });
      var emetteurs = [];
      ordre.forEach(function (i) { emetteurs[i] = compilerEmetteur(liste[i], i, parent[i] >= 0 ? emetteurs[parent[i]] : null); });

      var rc = objet(recette.rendu_calque, 'rendu_calque');
      var effet = {
        version: 1,
        nom: nomEffet,
        graine: (o.graine >>> 0),
        duree: dur,
        rendu_calque: {
          bloom: nombre(rc.bloom, 'rendu_calque.bloom', 0.6),
          seuil_bloom: nombre(rc.seuil_bloom, 'rendu_calque.seuil_bloom', 1),
        },
        capacite: emetteurs.reduce(function (s, e) { return s + e.capacite; }, 0),
        fin: emetteurs.reduce(function (s, e) { return Math.max(s, e.fin); }, 0),
        emetteurs: emetteurs,
      };
      emetteurs.forEach(function (e) { delete e.periode; delete e.finNaissances; });
      return { ok: true, effet: effet, erreurs: [] };
    } catch (e) {
      if (e && e.regle) return { ok: false, effet: null, erreurs: [{ regle: e.regle, message: e.message }] };
      throw e;
    }
  }

  return {
    CODES: CODES,
    PAS: PAS,
    TAILLE_TABLE: TAILLE_TABLE,
    PROFONDEUR_MAX: PROFONDEUR_MAX,
    FORCES_MAX: FORCES_MAX,
    TRAINEE_MAX: TRAINEE_MAX,
    ErreurRecette: ErreurRecette,
    resoudre: resoudre,
    analyserReglages: analyserReglages,
    couleurLineaire: couleurLineaire,
    compiler: compiler,
  };
});
