/* Pulse Motion – obstacles des collisions de particules.
 *
 * Déclarations (assemblage et page) :
 *   lireDeclaration(attrs) -> null | { obstacle } | { erreur }    attributs d'une balise (noms en minuscules)
 *     data-obstacle : '' (boîte de l'élément) | 'forme' | 'video' | 'forme video'
 *     data-obstacle-forme : 'ligne' (data-de, data-a) | 'cercle' (data-centre, data-rayon) | 'rectangle' (data-de, data-a, data-angle)
 *   lireObstaclesVideo(liste) -> { obstacles, erreurs, enTrop }   « obstacles » de deroule.json (8 au plus)
 * Repères (cqh de la scène de l'émetteur, radians) : { centre, angle, demi, echelle, actif } ; 8 nombres en f32
 *   [cx, cy, angle, actif, dx, dy, ex, ey]. Monde = centre + R(angle) · l (l : local à l'échelle).
 *   repereFixe(source, largeurCqh, sol), interpolerRepere(a, b, f), ecrireRepere(t, i, r), lireRepere(t, i),
 *   versLocal(r, p), versMonde(r, l)
 * Table d'un effet : construireTable({ largeurCqh, solRecette, propres, voisins, video }) -> { entrees, actif, sol },
 *   solDe(effet), emballerMonde(entrees, nGrille, largeurCqh, tans) -> ArrayBuffer (uniforme « Monde » du WGSL)
 *   largeursCases(entrees, cadres), effetsAnterieurs(liste, i) : profils d'empilement (« effet » dans construireTable)
 *   attacherFormes(table, couchePour) : formes exactes (type 4) attachées à leur couche de champ de distance
 * Coordonnées en cqh depuis le coin haut gauche de la scène, angles en degrés.
 *
 * Module pur : chargé tel quel dans la page (global M.obstacles) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; racine.M.obstacles = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_SCENE = 16;
  var MAX_VIDEO = 8;
  var FORMES = ['ligne', 'cercle', 'rectangle'];
  var CHAMPS_VIDEO = { sol: ['type', 'a'], ligne: ['type', 'de', 'a'], cercle: ['type', 'centre', 'rayon'], rectangle: ['type', 'de', 'a', 'angle'] };
  var NOMBRE = /^[-+]?(\d+\.?\d*|\.\d+)$/;
  var TYPES = { demiPlan: 0, boite: 1, cercle: 2, segment: 3, forme: 4 };
  var CATEGORIES = { sol: 1, murs: 2, elements: 4, formes: 8 };
  var TYPE_GENRE = { sol: 0, rectangle: 1, cercle: 2, ligne: 3 };
  var AUCUN = 0xffffffff;
  var MAX_TABLE = 48;
  var MAX_PROFILS = 8;
  var CASES = 256;
  var REPERE = 8;
  var OCTETS_MONDE = 816;
  var INACTIF = { centre: [0, 0], angle: 0, demi: [0, 0], echelle: [1, 1], actif: false };

  function possede(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function nombreTexte(t) {
    var s = String(t === undefined || t === null ? '' : t).trim();
    return NOMBRE.test(s) ? Number(s) : null;
  }
  function paireTexte(t) {
    var m = String(t === undefined || t === null ? '' : t).trim().split(/[\s,]+/);
    if (m.length !== 2) return null;
    var x = nombreTexte(m[0]);
    var y = nombreTexte(m[1]);
    return x === null || y === null ? null : [x, y];
  }
  function estNombre(v) { return typeof v === 'number' && isFinite(v); }
  function estPaire(v) { return Array.isArray(v) && v.length === 2 && estNombre(v[0]) && estNombre(v[1]); }
  function memePoint(a, b) { return a[0] === b[0] && a[1] === b[1]; }

  function lireDeclaration(a) {
    var obstacle = possede(a, 'data-obstacle');
    var forme = possede(a, 'data-obstacle-forme');
    if (!obstacle && !forme) return null;
    if (obstacle && forme) return { erreur: 'data-obstacle et data-obstacle-forme ne vont pas sur la même balise (un élément de la scène, ou une forme invisible).' };
    if (obstacle) {
      var mots = String(a['data-obstacle']).trim().split(/\s+/).filter(Boolean);
      if (mots.some(function (m) { return m !== 'forme' && m !== 'video'; })) {
        return { erreur: 'data-obstacle « ' + a['data-obstacle'] + ' » : valeurs possibles « » (boîte de l\'élément), « forme », « video », « forme video ».' };
      }
      return { obstacle: { genre: mots.indexOf('forme') >= 0 ? 'forme' : 'element', video: mots.indexOf('video') >= 0 } };
    }
    var g = String(a['data-obstacle-forme']).trim();
    if (FORMES.indexOf(g) < 0) return { erreur: 'data-obstacle-forme « ' + g + ' » inconnue (' + FORMES.join(', ') + ').' };
    if (g === 'cercle') {
      var c = paireTexte(a['data-centre']);
      var r = nombreTexte(a['data-rayon']);
      if (!c) return { erreur: 'cercle : data-centre="x y" (cqh) attendu.' };
      if (r === null || r <= 0) return { erreur: 'cercle : data-rayon positif (cqh) attendu.' };
      return { obstacle: { genre: 'cercle', video: false, centre: c, rayon: r } };
    }
    var de = paireTexte(a['data-de']);
    var fin = paireTexte(a['data-a']);
    if (!de || !fin) return { erreur: g + ' : data-de="x y" et data-a="x y" (cqh) attendus.' };
    if (g === 'ligne') {
      if (memePoint(de, fin)) return { erreur: 'ligne : data-de et data-a confondus.' };
      return { obstacle: { genre: 'ligne', video: false, de: de, a: fin } };
    }
    var angle = possede(a, 'data-angle') ? nombreTexte(a['data-angle']) : 0;
    if (angle === null) return { erreur: 'rectangle : data-angle en degrés attendu.' };
    if (de[0] === fin[0] || de[1] === fin[1]) return { erreur: 'rectangle : data-de et data-a sont deux coins opposés (largeur et hauteur non nulles).' };
    return { obstacle: { genre: 'rectangle', video: false, de: de, a: fin, angle: angle } };
  }

  function lireObstacleVideo(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { erreur: 'doit être un objet.' };
    if (!possede(CHAMPS_VIDEO, o.type)) return { erreur: ': « type » parmi ' + Object.keys(CHAMPS_VIDEO).join(', ') + '.' };
    var champs = CHAMPS_VIDEO[o.type];
    var inconnu = Object.keys(o).filter(function (k) { return champs.indexOf(k) < 0; })[0];
    if (inconnu !== undefined) return { erreur: ': champ « ' + inconnu + ' » inconnu (champs de ' + o.type + ' : ' + champs.join(', ') + ').' };
    if (o.type === 'sol') {
      if (!estNombre(o.a)) return { erreur: ': sol : « a » = hauteur du sol en cqh depuis le haut (ex. 92).' };
      return { obstacle: { type: 'sol', a: o.a } };
    }
    if (o.type === 'cercle') {
      if (!estPaire(o.centre) || !estNombre(o.rayon) || o.rayon <= 0) return { erreur: ': cercle : « centre » = [x, y] et « rayon » positif, en cqh.' };
      return { obstacle: { type: 'cercle', centre: o.centre.slice(), rayon: o.rayon } };
    }
    if (!estPaire(o.de) || !estPaire(o.a)) return { erreur: ': ' + o.type + ' : « de » et « a » = [x, y] en cqh.' };
    if (o.type === 'ligne') {
      if (memePoint(o.de, o.a)) return { erreur: ': ligne : « de » et « a » confondus.' };
      return { obstacle: { type: 'ligne', de: o.de.slice(), a: o.a.slice() } };
    }
    if (o.angle !== undefined && !estNombre(o.angle)) return { erreur: ': rectangle : « angle » en degrés.' };
    if (o.de[0] === o.a[0] || o.de[1] === o.a[1]) return { erreur: ': rectangle : « de » et « a » sont deux coins opposés (largeur et hauteur non nulles).' };
    return { obstacle: { type: 'rectangle', de: o.de.slice(), a: o.a.slice(), angle: o.angle === undefined ? 0 : o.angle } };
  }

  function lireObstaclesVideo(liste) {
    var r = { obstacles: [], erreurs: [], enTrop: 0 };
    if (liste === undefined) return r;
    if (!Array.isArray(liste)) { r.erreurs.push('« obstacles » doit être une liste, ex. [{ "type": "sol", "a": 92 }].'); return r; }
    liste.forEach(function (o, i) {
      var lu = lireObstacleVideo(o);
      if (lu.erreur) { r.erreurs.push('« obstacles[' + i + '] » ' + lu.erreur.replace(/^: /, ': ')); return; }
      if (r.obstacles.length >= MAX_VIDEO) { r.enTrop++; return; }
      r.obstacles.push(lu.obstacle);
    });
    return r;
  }

  function repere(centre, angle, demi) { return { centre: centre, angle: angle, demi: demi, echelle: [1, 1], actif: true }; }

  /** Repère d'un bord de l'image ou d'une primitive déclarée (scène ou déroulé). */
  function repereFixe(source, largeurCqh, sol) {
    var L = largeurCqh;
    if (source.bord === 'sol') return repere([L / 2, sol], 0, [L / 2, 0]);
    if (source.bord === 'gauche') return repere([0, 50], Math.PI / 2, [50, 0]);
    if (source.bord === 'droit') return repere([L, 50], -Math.PI / 2, [50, 0]);
    var d = source.fixe;
    var genre = d.genre || d.type;
    if (genre === 'sol') return repere([L / 2, d.a], 0, [L / 2, 0]);
    if (genre === 'cercle') return repere([d.centre[0], d.centre[1]], 0, [d.rayon, d.rayon]);
    var dx = d.a[0] - d.de[0];
    var dy = d.a[1] - d.de[1];
    var centre = [(d.a[0] + d.de[0]) / 2, (d.a[1] + d.de[1]) / 2];
    if (genre === 'ligne') return repere(centre, Math.atan2(dy, dx), [Math.sqrt(dx * dx + dy * dy) / 2, 0]);
    return repere(centre, (d.angle || 0) * Math.PI / 180, [Math.abs(dx) / 2, Math.abs(dy) / 2]);
  }

  /** Repère entre deux points de grille : position et échelle linéaires, angle par le plus court chemin. */
  function interpolerRepere(a, b, f) {
    var d = b.angle - a.angle;
    d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
    function m(x, y) { return [x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f]; }
    return { centre: m(a.centre, b.centre), angle: a.angle + d * f, demi: m(a.demi, b.demi), echelle: m(a.echelle, b.echelle), actif: a.actif };
  }

  function ecrireRepere(t, i, r) {
    t[i] = r.centre[0]; t[i + 1] = r.centre[1]; t[i + 2] = r.angle; t[i + 3] = r.actif ? 1 : 0;
    t[i + 4] = r.demi[0]; t[i + 5] = r.demi[1]; t[i + 6] = r.echelle[0]; t[i + 7] = r.echelle[1];
  }

  function lireRepere(t, i) {
    return { centre: [t[i], t[i + 1]], angle: t[i + 2], actif: t[i + 3] > 0.5, demi: [t[i + 4], t[i + 5]], echelle: [t[i + 6], t[i + 7]] };
  }

  function versLocal(r, p) {
    var c = Math.cos(r.angle);
    var s = Math.sin(r.angle);
    var x = p[0] - r.centre[0];
    var y = p[1] - r.centre[1];
    return [c * x + s * y, -s * x + c * y];
  }

  function versMonde(r, l) {
    var c = Math.cos(r.angle);
    var s = Math.sin(r.angle);
    return [r.centre[0] + c * l[0] - s * l[1], r.centre[1] + s * l[0] + c * l[1]];
  }

  /** Profils de hauteur : une entrée (pas un mur) ciblée par un émetteur qui empile ; talus du premier ; 8 au plus. */
  function attribuerProfils(table, effet) {
    var empileurs = effet.emetteurs.filter(function (em) { return em.collisions && em.collisions.empiler; });
    table.entrees.forEach(function (e) {
      if (table.tans.length >= MAX_PROFILS || e.categorie === CATEGORIES.murs || e.categorie === 0) return;
      for (var i = 0; i < empileurs.length; i++) {
        if ((empileurs[i].collisions.masque & e.categorie) !== 0) {
          e.profil = table.tans.length;
          table.tans.push(Math.tan(empileurs[i].collisions.talus * Math.PI / 180));
          return;
        }
      }
    });
    return table;
  }

  /** Largeur de case (cqh) de chaque profil, d'après les repères des entrées à la fin du pas. */
  function largeursCases(entrees, cadres) {
    var l = new Float32Array(MAX_PROFILS);
    entrees.forEach(function (e, i) { if (e.profil !== AUCUN) l[e.profil] = 2 * cadres[i].demi[0] / CASES; });
    return l;
  }

  /** Effets finis au plus tard au début de l'effet i, triés par début puis par rang (cumul des couches de la vidéo). */
  function effetsAnterieurs(liste, i) {
    var r = [];
    liste.forEach(function (x, j) { if (j !== i && x.fin <= liste[i].debut) r.push(j); });
    return r.sort(function (a, b) { return liste[a].debut - liste[b].debut || a - b; });
  }

  /** Table des obstacles d'un effet (ordre fixe : il donne l'indice des obstacles dans les contacts). */
  function construireTable(o) {
    var entrees = [];
    function ajouter(type, categorie, source) {
      if (entrees.length < MAX_TABLE) entrees.push({ type: type, categorie: categorie, forme: AUCUN, profil: AUCUN, source: source });
    }
    function declaration(d, voisin) {
      if (d.genre === 'element' || d.genre === 'forme') {
        ajouter(TYPES.boite, d.genre === 'forme' ? CATEGORIES.formes : CATEGORIES.elements, { element: d, voisin: voisin });
      } else ajouter(TYPE_GENRE[d.genre], CATEGORIES.elements, { fixe: d });
    }
    var propres = o.propres || [];
    var video = o.video || [];
    ajouter(TYPES.demiPlan, CATEGORIES.sol, { bord: 'sol' });
    ajouter(TYPES.demiPlan, CATEGORIES.murs, { bord: 'gauche' });
    ajouter(TYPES.demiPlan, CATEGORIES.murs, { bord: 'droit' });
    propres.forEach(function (d) { declaration(d, false); });
    (o.voisins || []).forEach(function (d) { declaration(d, true); });
    video.forEach(function (d, i) { ajouter(TYPE_GENRE[d.type], CATEGORIES.elements, { fixe: d, video: i }); });
    var solRecette = o.solRecette === undefined ? null : o.solRecette;
    var voisins = o.voisins || [];
    var table = { entrees: entrees, actif: propres.length + voisins.length + video.length > 0 || solRecette !== null, sol: solRecette === null ? 100 : solRecette, tans: [] };
    if (o.effet) attribuerProfils(table, o.effet);
    return table;
  }

  /** Sol de l'effet : celui du premier émetteur qui le décale, sinon null (bord bas). */
  function solDe(effet) {
    for (var i = 0; i < effet.emetteurs.length; i++) {
      var c = effet.emetteurs[i].collisions;
      if (c && c.sol !== null && c.sol !== undefined) return c.sol;
    }
    return null;
  }

  /** Uniforme « Monde » : n, nGrille, largeur, nProfils, tans[8], puis (type, categorie, forme, profil) par entrée. */
  function emballerMonde(entrees, nGrille, largeurCqh, tans) {
    var b = new ArrayBuffer(OCTETS_MONDE);
    var u = new Uint32Array(b);
    var f = new Float32Array(b);
    u[0] = entrees.length;
    u[1] = nGrille;
    f[2] = largeurCqh;
    u[3] = entrees.filter(function (e) { return e.profil !== AUCUN; }).length;
    (tans || []).forEach(function (t, i) { f[4 + i] = t; });
    entrees.forEach(function (e, i) {
      u[12 + i * 4] = e.type;
      u[13 + i * 4] = e.categorie;
      u[14 + i * 4] = e.forme;
      u[15 + i * 4] = e.profil;
    });
    return b;
  }

  /** Formes exactes : couche du champ de distance (type forme), masque vide (jamais ciblé), ou boîte en attendant. */
  function attacherFormes(table, couchePour) {
    table.entrees.forEach(function (e) {
      var d = e.source.element;
      if (!d || d.genre !== 'forme') return;
      var c = couchePour(d);
      if (c === null) e.categorie = 0;
      else if (typeof c === 'number') { e.type = TYPES.forme; e.forme = c; }
    });
    return table;
  }

  return {
    MAX_SCENE: MAX_SCENE,
    MAX_VIDEO: MAX_VIDEO,
    lireDeclaration: lireDeclaration,
    lireObstaclesVideo: lireObstaclesVideo,
    TYPES: TYPES,
    CATEGORIES: CATEGORIES,
    AUCUN: AUCUN,
    MAX_TABLE: MAX_TABLE,
    MAX_PROFILS: MAX_PROFILS,
    CASES: CASES,
    REPERE: REPERE,
    OCTETS_MONDE: OCTETS_MONDE,
    INACTIF: INACTIF,
    repereFixe: repereFixe,
    interpolerRepere: interpolerRepere,
    ecrireRepere: ecrireRepere,
    lireRepere: lireRepere,
    versLocal: versLocal,
    versMonde: versMonde,
    construireTable: construireTable,
    attacherFormes: attacherFormes,
    attribuerProfils: attribuerProfils,
    largeursCases: largeursCases,
    effetsAnterieurs: effetsAnterieurs,
    solDe: solDe,
    emballerMonde: emballerMonde,
  };
});
