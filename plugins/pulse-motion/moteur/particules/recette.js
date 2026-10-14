/* Pulse Motion – recettes d'effets de particules : héritage, réglages, couleurs, compilation.
 *
 * resoudre(nom, charger)   applique « etend » (fusion profonde, émetteurs fusionnés par nom)
 * differences(base, r)     plus petite recette dérivée d telle que fusionner(base, d) redonne r (atelier)
 * fusionner(base, ajout), egal(a, b)
 * analyserReglages(texte)  "nombre: 3000; couleur: accent" -> { valeurs, erreurs }
 * compiler(recette, o)     recette -> paramètres numériques pour le GPU (cqh, s de τ, radians,
 *                          RVB linéaire, tables de 64 valeurs, capacités)
 * SCHEMA                   description déclarative du format (atelier : formulaire ; compilateur : champs refusés)
 * Fragments (P4) : forme « pixels » (naissance sur les pixels de l'ancre photographiée), couleur « source », rendu
 * « eclats », « cible » (arrivée sur un élément) ; un émetteur de fragments naît tout entier à τ = 0 (une salve dont le
 * nombre est fixé à la photographie : fragments.js).
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
  var SALVES_MAX = 8;
  var CAPACITE_MAX = 2000000;
  var HISTORIQUE_MAX = 16777216; // capacité × longueur d'une traînée (8 octets chacun : 128 Mio)
  var DENSITE = 4;          // pixels de l'élément photographié par particule (forme « pixels », « cible »)
  var DENSITE_MAX = 64;
  var MORCEAUX_MIN = 8;
  var MORCEAUX_MAX = 512;
  var CODES = {
    forme: { point: 0, cercle: 1, anneau: 2, rectangle: 3, ligne: 4, ancre: 5, pixels: 6 },
    force: { gravite: 0, trainee: 1, vent: 2, turbulence: 3, attracteur: 4, vortex: 5, rappel: 6 },
    rendu: { sprite: 0, etincelle: 1, trainee: 2, planche: 3, eclats: 4 },
    melange: { additif: 0, alpha: 1, premultiplie: 2 },
    texture: { 'disque-doux': 0, etoile: 1, fumee: 2, flamme: 3, eclat: 4, confetti: 5, image: 6, pixel: 7 },
    reponse: { rebond: 0, poser: 1, mourir: 2 },
    cible: { sol: 1, murs: 2, elements: 4, formes: 8 },
    ordre: { hasard: 0, 'gauche-droite': 1, centre: 2 },
    arrivee: { guidee: 0, choree: 1 },
    source: { ancre: 0, cible: 1 },
  };
  var COULEURS_CHARTE = ['primaire', 'accent', 'texte', 'fond'];
  var HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

  // ---- Schéma du format ----
  //
  // Description déclarative de chaque champ d'une recette : l'atelier en génère son formulaire et le compilateur
  // refuse tout champ qui n'y figure pas. Une force ou une option nouvelle s'ajoute ici et au compilateur.
  //
  // Nœud : { type, libelle, defaut, … }
  //   type        nombre | intervalle | paire | couleur | choix | courbe | booleen | texte | valeur | liste | objet | dictionnaire
  //   defaut      valeur du compilateur quand le champ est absent ; null : pas de valeur fixe (taille de la zone,
  //               « a » égal à « de », courbe linéaire…)
  //   exemple     valeur valide quand defaut est null ou que le champ est requis ; requis : à écrire dans un objet écrit
  //   min, max    bornes vérifiées par le compilateur ; curseur : [a, b], course du curseur de l'atelier ; pas ; unite
  //   expression  nombre, intervalle, paire : une expression des réglages est permise (« 30 * vitesse »)
  //   valeurs     choix : valeurs permises ; autre : { motif, libelle }, valeur libre permise en plus (image de assets/)
  //   motif       texte : expression régulière du texte permis ; parmi : 'emetteurs' (nom d'un émetteur de la recette)
  //   selon       valeur : nombre ou couleur selon le champ frère nommé (réglages exposés)
  //   contexte    'racine' : émetteur lancé par la scène ; 'sous-emetteur' : lancé par « a_la_mort »
  //   champs      objet : { nom: nœud } ; raccourci : 'nombre' | 'couleur', une valeur seule permise à la place de l'objet ;
  //               variantes : { cle, types: { nom: { libelle, champs } } }, champs propres à chaque valeur de « cle »
  //   element     liste, dictionnaire : nœud d'un élément ; maximum : nombre d'éléments ; cle : motif des noms (dictionnaire)

  function noeud(type, libelle, defaut, o) {
    var n = { type: type, libelle: libelle, defaut: defaut };
    Object.keys(o || {}).forEach(function (k) { n[k] = o[k]; });
    return n;
  }
  function nb(libelle, defaut, o) { return noeud('nombre', libelle, defaut, Object.assign({ expression: true }, o)); }
  function iv(libelle, defaut, o) { return noeud('intervalle', libelle, defaut, Object.assign({ expression: true }, o)); }
  function pr(libelle, defaut, o) { return noeud('paire', libelle, defaut, Object.assign({ expression: true }, o)); }
  function ch(libelle, valeurs, defaut, o) { return noeud('choix', libelle, defaut, Object.assign({ valeurs: valeurs }, o)); }
  function bo(libelle) { return noeud('booleen', libelle, false); }
  function ob(libelle, champs, o) { return noeud('objet', libelle, null, Object.assign({ champs: champs }, o)); }
  function li(libelle, element, o) { return noeud('liste', libelle, null, Object.assign({ element: element }, o)); }
  function cb(libelle) { return noeud('courbe', libelle, null, { exemple: 'quad-out' }); }
  function tableVie(libelle, defaut) {
    return ob(libelle, {
      de: nb('Au début de la vie', defaut, { curseur: [0, 10] }),
      a: nb('À la fin de la vie', null, { exemple: 0.5, curseur: [0, 10] }),
      courbe: cb('Courbe'),
    }, { raccourci: 'nombre' });
  }
  function centre() { return pr('Centre (fraction de la zone)', [0.5, 0.5]); }
  function attraction() {
    return { force: nb('Force', 20, { curseur: [-200, 200] }), rayon: nb('Rayon', 10, { unite: 'cqh', curseur: [1, 100] }), centre: centre() };
  }

  var SCHEMA = ob('Recette', {
    version: nb('Version du format', 1, { requis: true, min: 1, max: 1, expression: false }),
    nom: noeud('texte', 'Nom', null, { motif: '^[a-z0-9-]+$', exemple: 'essai' }),
    description: noeud('texte', 'Description', null, { exemple: 'Essai' }),
    etend: noeud('texte', 'Hérite de', null, { motif: '^[a-z0-9-]+$', exemple: 'etincelles' }),
    parametres: noeud('dictionnaire', 'Réglages exposés', null, {
      cle: '^[a-z_][a-z0-9_]*$',
      element: ob('Réglage', {
        type: ch('Type', ['nombre', 'couleur'], 'nombre'),
        defaut: noeud('valeur', 'Valeur par défaut', null, { selon: 'type', requis: true, exemple: 1 }),
        min: nb('Minimum', null, { expression: false, exemple: 0 }),
        max: nb('Maximum', null, { expression: false, exemple: 10 }),
      }),
    }),
    rendu_calque: ob('Rendu du calque', {
      bloom: nb('Halo lumineux', 0.6, { curseur: [0, 4], pas: 0.05 }),
      seuil_bloom: nb('Seuil du halo', 1, { curseur: [0, 4], pas: 0.05 }),
      tons: ch('Courbe de tons', ['douce', 'aces', 'neutre'], 'douce'),
    }),
    emetteurs: li('Émetteurs', ob('Émetteur', {
      nom: noeud('texte', 'Nom', null, { requis: true, motif: '^[a-z0-9-]+$', exemple: 'e' }),
      naissance: ob('Naissance', {
        debit: nb('Débit (par seconde)', 0, { min: 0, contexte: 'racine', curseur: [0, 5000] }),
        salves: li('Salves', ob('Salve', {
          t: nb('Instant', 0, { min: 0, unite: 's', curseur: [0, 10] }),
          nombre: nb('Nombre', null, { requis: true, min: 1, exemple: 10, curseur: [1, 5000] }),
        }), { defaut: [], exemple: [{ t: 0, nombre: 10 }], maximum: SALVES_MAX, contexte: 'racine' }),
        nombre: nb('Nombre par particule morte', null, { requis: true, min: 1, exemple: 2, contexte: 'sous-emetteur', curseur: [1, 50] }),
        forme: ob('Forme d\'émission', {
          type: ch('Forme', Object.keys(CODES.forme), 'ancre'),
          zone: ch('Zone', ['surface', 'contour'], 'surface'),
          rayon: nb('Rayon', null, { min: 0, unite: 'cqh', exemple: 5, curseur: [0, 50] }),
          rayon_interieur: nb('Rayon intérieur', 0, { min: 0, unite: 'cqh', curseur: [0, 50] }),
          largeur: nb('Largeur', null, { min: 0, unite: 'cqh', exemple: 10, curseur: [0, 180] }),
          hauteur: nb('Hauteur', null, { min: 0, unite: 'cqh', exemple: 10, curseur: [0, 100] }),
          angle: nb('Angle', 0, { unite: '°', curseur: [-180, 180] }),
          decalage: pr('Décalage (fraction de la zone)', [0, 0]),
          densite: nb('Densité (forme « pixels ») : une particule pour N pixels de l\'ancre', DENSITE, { min: 1, max: DENSITE_MAX, pas: 1, curseur: [1, DENSITE_MAX] }),
          instant: nb('Photographie de l\'ancre (s de scène ; absent : début de l\'effet)', null, { min: 0, exemple: 1, unite: 's', curseur: [0, 30] }),
          liberation: nb('Libération des pixels étalée sur', 0, { min: 0, unite: 's', curseur: [0, 5] }),
          ordre: ch('Ordre de libération', Object.keys(CODES.ordre), 'hasard'),
        }),
        vitesse: ob('Vitesse de départ', {
          direction: pr('Direction', [0, -1]),
          cone: nb('Ouverture du cône', 0, { min: 0, max: 360, unite: '°', curseur: [0, 360] }),
          valeur: iv('Vitesse', [0, 0], { unite: 'cqh/s', curseur: [0, 200] }),
          radiale: bo('Vers l\'extérieur de la forme'),
          heritage: nb('Part de la vitesse du parent', 0, { curseur: [0, 1] }),
        }),
        vie: iv('Durée de vie', [1, 1], { unite: 's', curseur: [0.05, 10] }),
        taille: iv('Taille', [1, 1], { unite: 'cqh', curseur: [0, 20] }),
        masse: iv('Masse', [1, 1], { curseur: [0.1, 5] }),
        z: iv('Profondeur', [0, 0], { curseur: [-1, 1] }),
        rotation: iv('Rotation', [0, 0], { unite: '°', curseur: [-180, 180] }),
        vitesse_angulaire: iv('Vitesse de rotation', [0, 0], { unite: '°/s', curseur: [-720, 720] }),
      }),
      forces: li('Forces', ob('Force', {
        type: ch('Type', Object.keys(CODES.force), null, { requis: true, exemple: 'gravite' }),
      }, {
        variantes: {
          cle: 'type',
          types: {
            gravite: { libelle: 'Gravité', champs: { valeur: nb('Accélération', 40, { unite: 'cqh/s²', curseur: [0, 200] }), direction: pr('Direction', [0, 1]) } },
            trainee: { libelle: 'Traînée', champs: { coef: nb('Coefficient', 1, { min: 0, curseur: [0, 10] }), quadratique: bo('Quadratique (freine davantage les rapides)') } },
            vent: { libelle: 'Vent', champs: { vitesse: pr('Vitesse du vent', [10, 0], { unite: 'cqh/s' }), coef: nb('Prise au vent', 1, { min: 0, curseur: [0, 10] }) } },
            turbulence: { libelle: 'Turbulence', champs: { echelle: nb('Taille des tourbillons', 10, { unite: 'cqh', curseur: [1, 100] }), force: nb('Force', 10, { curseur: [0, 200] }), vitesse: nb('Évolution', 0.5, { curseur: [0, 5] }) } },
            attracteur: { libelle: 'Attracteur (force négative : répulseur)', champs: attraction() },
            vortex: { libelle: 'Vortex', champs: attraction() },
            rappel: { libelle: 'Rappel (ressort)', champs: { raideur: nb('Raideur', 10, { curseur: [0, 100] }), amortissement: nb('Amortissement', 1, { curseur: [0, 10] }), centre: centre() } },
          },
        },
      }), { defaut: [], maximum: FORCES_MAX }),
      vie: ob('Au cours de la vie', {
        couleur: ob('Couleur', {
          degrade: li('Dégradé', noeud('couleur', 'Couleur', '#ffffff'), { requis: true, exemple: ['#ffffff', '#000000'] }),
          courbe: cb('Courbe'),
        }, { raccourci: 'couleur' }),
        taille: tableVie('Taille (facteur)', 1),
        intensite: tableVie('Intensité (au-delà de 1 : brille)', 1),
        opacite: tableVie('Opacité', 1),
      }),
      rendu: ob('Rendu', {
        type: ch('Type', Object.keys(CODES.rendu), 'sprite'),
        texture: ch('Texture', Object.keys(CODES.texture).filter(function (t) { return t !== 'image'; }), 'disque-doux', {
          autre: { motif: '^assets/.+\\.(png|webp|jpe?g|svg)$', libelle: 'Image du projet (assets/…)' },
        }),
        melange: ch('Mélange', Object.keys(CODES.melange), 'additif'),
        etirement: nb('Étirement selon la vitesse', 0.03, { curseur: [0, 0.2], pas: 0.005 }),
        flou: bo('Flou de mouvement'),
        longueur: nb('Longueur de la traînée (points)', 8, { min: 2, max: TRAINEE_MAX, pas: 1, curseur: [2, TRAINEE_MAX] }),
        planche: ob('Planche de sprites', {
          colonnes: nb('Colonnes', null, { requis: true, min: 1, pas: 1, exemple: 2, curseur: [1, 16] }),
          lignes: nb('Lignes', null, { requis: true, min: 1, pas: 1, exemple: 2, curseur: [1, 16] }),
          ips: nb('Images par seconde', 0, { curseur: [0, 60] }),
        }),
        morceaux: nb('Morceaux (éclats)', 24, { min: MORCEAUX_MIN, max: MORCEAUX_MAX, pas: 1, curseur: [MORCEAUX_MIN, MORCEAUX_MAX] }),
        origine: pr('Point d\'impact des éclats (fraction de la boîte)', [0.5, 0.5]),
        impulsion: nb('Impulsion des éclats', 40, { unite: 'cqh/s', curseur: [0, 300] }),
        rotation_max: nb('Rotation maximale des éclats', 180, { min: 0, unite: '°/s', curseur: [0, 1080] }),
      }),
      a_la_mort: ob('À la mort', {
        emetteur: noeud('texte', 'Émetteur lancé', null, { motif: '^[a-z0-9-]+$', parmi: 'emetteurs', exemple: 'b' }),
      }),
      collisions: ob('Collisions avec la scène', {
        cibles: li('Cibles', ch('Cible', Object.keys(CODES.cible), null, { exemple: 'sol' }), { defaut: Object.keys(CODES.cible), exemple: ['sol'], maximum: 4 }),
        reponse: ch('Réponse au contact', Object.keys(CODES.reponse), 'rebond'),
        restitution: iv('Rebond (part de la vitesse normale gardée)', [0.4, 0.4], { min: 0, max: 1, curseur: [0, 1], pas: 0.05 }),
        frottement: iv('Frottement (part de la vitesse tangentielle perdue)', [0.2, 0.2], { min: 0, max: 1, curseur: [0, 1], pas: 0.05 }),
        repos_apres: iv('Fondu après la pose', null, { exemple: 2, min: 0, unite: 's', curseur: [0, 10] }),
        empiler: bo('Former une couche (avec « poser »)'),
        epaisseur: iv('Épaisseur dans la couche', null, { exemple: 0.5, min: 0, unite: 'cqh', curseur: [0, 5] }),
        talus: nb('Angle de talus de la couche', 35, { min: 5, max: 80, unite: '°', curseur: [5, 80] }),
        sol: nb('Sol décalé (depuis le haut)', null, { exemple: 90, unite: 'cqh', curseur: [0, 100] }),
      }),
      a_la_collision: ob('Au contact', {
        emetteur: noeud('texte', 'Émetteur lancé', null, { motif: '^[a-z0-9-]+$', parmi: 'emetteurs', exemple: 'b' }),
      }),
      cible: ob('Arrivée sur un élément', {
        source: ch('Élément visé (data-ancre ou data-cible)', Object.keys(CODES.source), 'ancre'),
        arrivee: ch('Arrivée', Object.keys(CODES.arrivee), 'guidee'),
        a: nb('Instant d\'arrivée (s de τ ; absent : fin de data-dur)', null, { min: 0, exemple: 2, unite: 's', curseur: [0, 10] }),
        echelonnement: nb('Échelonnement des départs', 0, { min: 0, max: 1, curseur: [0, 1], pas: 0.05 }),
        ordre: ch('Ordre d\'arrivée', Object.keys(CODES.ordre), 'hasard'),
        guidage: nb('Début du rattrapage (fraction du trajet)', 0.6, { min: 0, max: 1, curseur: [0, 1], pas: 0.05 }),
        densite: nb('Densité de la cible : une particule pour N pixels', DENSITE, { min: 1, max: DENSITE_MAX, pas: 1, curseur: [1, DENSITE_MAX] }),
        courbe: cb('Courbe du trajet (chorégraphié)'),
      }),
    }, { exemple: { nom: 'emetteur', naissance: { debit: 50, vie: [0.5, 1] } } }), { requis: true }),
  });

  function ErreurRecette(regle, message, chemin) {
    var e = new Error(message);
    e.name = 'ErreurRecette';
    e.regle = regle;
    if (chemin !== undefined) e.chemin = chemin;
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
      if (k === '__proto__') return;
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

  // ---- Différences (atelier : recette dérivée par « etend ») ----

  function possede(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /** Égalité profonde de valeurs JSON (ordre des clés indifférent). */
  function egal(a, b) {
    if (a === b) return true;
    if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every(function (x, i) { return egal(x, b[i]); });
    if (estObjet(a)) {
      if (!estObjet(b)) return false;
      var ka = Object.keys(a);
      return ka.length === Object.keys(b).length && ka.every(function (k) { return possede(b, k) && egal(a[k], b[k]); });
    }
    return false;
  }

  function inexprimable(raison) {
    return ErreurRecette('effet-invalide', 'Impossible à écrire par « etend » : ' + raison + '.');
  }

  function diffObjet(base, recette, chemin) {
    var d = {};
    Object.keys(base).forEach(function (k) {
      if (!possede(recette, k)) throw inexprimable('le champ « ' + chemin + k + ' » est retiré');
    });
    Object.keys(recette).forEach(function (k) {
      if (k === '__proto__') return;
      var b = base[k];
      var r = recette[k];
      if (possede(base, k) && egal(b, r)) return;
      if (k === 'emetteurs' && Array.isArray(b) && Array.isArray(r)) d[k] = diffEmetteurs(b, r);
      else if (possede(base, k) && estObjet(b) && estObjet(r)) d[k] = diffObjet(b, r, chemin + k + '.');
      else d[k] = cloner(r);
    });
    return d;
  }

  /** Émetteurs : ceux de base restent dans l'ordre (l'ordre fixe le tirage), modifiés par nom ; les nouveaux suivent. */
  function diffEmetteurs(base, recette) {
    var noms = recette.map(function (e) { return estObjet(e) ? e.nom : undefined; });
    base.forEach(function (b, i) {
      if (!estObjet(b)) throw inexprimable('un émetteur de base n\'a pas de nom');
      var j = noms.indexOf(b.nom);
      if (j < 0) throw inexprimable('l\'émetteur « ' + b.nom + ' » est retiré');
      if (j !== i) throw inexprimable('l\'ordre des émetteurs change');
    });
    var d = [];
    recette.forEach(function (r, i) {
      if (i >= base.length) { d.push(cloner(r)); return; }
      if (egal(base[i], r)) return;
      d.push(Object.assign({ nom: r.nom }, diffObjet(base[i], r, 'emetteurs[' + r.nom + '].')));
    });
    return d;
  }

  /**
   * differences(base, recette) -> plus petit objet r tel que fusionner(base, r) redonne recette (émetteurs par nom).
   * Lève une ErreurRecette si recette retire un champ ou un émetteur de base, ou change l'ordre des émetteurs :
   * « etend » ne sait qu'ajouter et remplacer.
   */
  function differences(base, recette) {
    if (!estObjet(base) || !estObjet(recette)) throw inexprimable('deux recettes (objets JSON) attendues');
    return diffObjet(base, recette, '');
  }

  // ---- Réglages et couleurs ----

  /** "nombre: 3000; couleur: accent" -> { valeurs: { nombre: '3000', couleur: 'accent' }, erreurs: [message] } */
  function analyserReglages(texte) {
    var valeurs = {};
    var erreurs = [];
    String(texte || '').split(';').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (clause) {
      var m = /^([a-z_][a-z0-9_]*)\s*:\s*(\S(?:.*\S)?)$/.exec(clause);
      if (!m) erreurs.push('réglage « ' + clause + ' » illisible (attendu « nom: valeur »)');
      else Object.defineProperty(valeurs, m[1], { value: m[2], enumerable: true, writable: true, configurable: true });
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

  // ---- Contrôle des champs ----

  /** Chemin d'un élément de liste : émetteur par nom (comme le compilateur), sinon par rang. */
  function cheminElement(chemin, x, i) {
    var nom = estObjet(x) && typeof x.nom === 'string' && /^[a-z0-9-]+$/.test(x.nom) ? x.nom : i;
    return chemin + '[' + nom + ']';
  }

  /** Refuse tout champ absent du schéma ; les types et les valeurs restent l'affaire du compilateur. */
  function verifierChamps(v, n, chemin, invalide) {
    if (!n) return;
    if (n.type === 'objet') {
      if (!estObjet(v)) return; // raccourci, ou type faux : le compilateur le dit
      var champs = n.champs;
      if (n.variantes) {
        var t = v[n.variantes.cle];
        if (typeof t !== 'string' || !Object.prototype.hasOwnProperty.call(n.variantes.types, t)) return; // type inconnu : le compilateur liste les types
        champs = Object.assign({}, n.champs, n.variantes.types[t].champs);
      }
      Object.keys(v).forEach(function (k) {
        var c = chemin ? chemin + '.' + k : k;
        if (!Object.prototype.hasOwnProperty.call(champs, k)) throw invalide(c, 'champ inconnu (champs possibles : ' + Object.keys(champs).join(', ') + ')');
        verifierChamps(v[k], champs[k], c, invalide);
      });
    } else if (n.type === 'liste') {
      if (!Array.isArray(v)) return;
      v.forEach(function (x, i) { verifierChamps(x, n.element, cheminElement(chemin, x, i), invalide); });
    } else if (n.type === 'dictionnaire') {
      if (!estObjet(v)) return;
      Object.keys(v).forEach(function (k) { verifierChamps(v[k], n.element, chemin + '.' + k, invalide); });
    }
  }

  // ---- Compilation ----

  function rad(d) { return d * Math.PI / 180; }
  function arrondi(x) { return Math.round(x * 1e6) / 1e6; }

  /** Valeurs des paramètres : défauts de la recette, puis réglages de la scène. */
  function valeursParametres(recette, reglages, charte, invalide) {
    var params = recette.parametres === undefined ? {} : recette.parametres;
    if (!estObjet(params)) throw invalide('', '« parametres » doit être un objet');
    var nombres = Object.create(null);
    var couleurs = Object.create(null);
    var erreurs = [];
    var possede = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
    Object.keys(params).forEach(function (nom) {
      var p = params[nom];
      var ch = 'parametres.' + nom;
      if (!/^[a-z_][a-z0-9_]*$/.test(nom) || nom === 'dur' || nom === 'source') throw invalide(ch, 'nom de paramètre invalide (minuscules, chiffres, _ ; « dur » et « source » sont réservés)');
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
      var p = possede(params, nom) ? params[nom] : undefined;
      var v = reglages[nom];
      if (!p) {
        erreurs.push({ chemin: 'reglages.' + nom, message: '« ' + nom + ' » n\'est pas un réglage de l\'effet « ' + recette.nom + ' » (réglages : ' + (Object.keys(params).join(', ') || 'aucun') + ').' });
        return;
      }
      if (p.type === 'couleur') {
        try { couleurs[nom] = resoudreCouleur(v, { charte: charte }); } catch (e) { erreurs.push({ chemin: 'reglages.' + nom, message: 'réglage « ' + nom + ' » : ' + e.message + '.' }); }
        return;
      }
      var x = Number(v);
      if (v === '' || !isFinite(x)) { erreurs.push({ chemin: 'reglages.' + nom, message: 'réglage « ' + nom + ' » : « ' + v + ' » n\'est pas un nombre.' }); return; }
      if (p.min !== undefined && x < p.min) { erreurs.push({ chemin: 'reglages.' + nom, message: 'réglage « ' + nom + ' » : ' + x + ' est sous le minimum ' + p.min + '.' }); return; }
      if (p.max !== undefined && x > p.max) { erreurs.push({ chemin: 'reglages.' + nom, message: 'réglage « ' + nom + ' » : ' + x + ' est au-delà du maximum ' + p.max + '.' }); return; }
      nombres[nom] = x;
    });
    return { nombres: nombres, couleurs: couleurs, erreurs: erreurs };
  }

  /**
   * compiler(recette, { reglages, charte, dur, graine }) -> { ok, effet, erreurs: [{ regle, message, chemin }] }
   * La recette est déjà résolue (resoudre). Champs hors du SCHEMA refusés ; arrêt à la première erreur de
   * structure ; toutes les erreurs de réglage sont listées. chemin : champ en cause (emetteurs[gerbe].naissance.vie,
   * reglages.nombre), '' si aucun.
   */
  function compiler(recette, options) {
    var o = options || {};
    var nomEffet = recette && recette.nom ? recette.nom : '?';
    var prefixe = 'Effet « ' + nomEffet + ' »';
    function invalide(chemin, message) {
      var regle = /(^|\.)(collisions|a_la_collision)(\.|\[|$)/.test(chemin || '') ? 'collisions-invalides' : 'effet-invalide';
      return ErreurRecette(regle, prefixe + (chemin ? ', ' + chemin : '') + ' : ' + message + '.', chemin || '');
    }
    try {
      if (!estObjet(recette)) throw invalide('', 'objet JSON attendu');
      if (recette.version !== 1) throw invalide('', '« version » doit valoir 1');
      verifierChamps(recette, SCHEMA, '', invalide);
      var reg = analyserReglages(o.reglages);
      var vp = valeursParametres(recette, reg.valeurs, o.charte, invalide);
      var erreursReglages = reg.erreurs.map(function (m) { return { chemin: 'reglages', message: m }; }).concat(vp.erreurs);
      if (erreursReglages.length) {
        return { ok: false, effet: null, erreurs: erreursReglages.map(function (x) { return { regle: 'reglage-invalide', message: prefixe + ' : ' + x.message, chemin: x.chemin }; }) };
      }
      var dur = o.dur > 0 ? o.dur : 1;
      var valeurs = Object.create(null);
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
        // -1 : valeur interne « taille de la zone » quand le champ est absent ; négatif donné par l'auteur refusé.
        function dimension(cle, defaut) {
          var x = nombre(f[cle], ch + '.' + cle, defaut);
          if (f[cle] !== undefined && f[cle] !== null && x < 0) throw invalide(ch + '.' + cle, 'valeur positive ou nulle attendue');
          return x;
        }
        var rayon = dimension('rayon', -1);
        var rayonInterieur = dimension('rayon_interieur', 0);
        var largeur = dimension('largeur', -1);
        var hauteur = dimension('hauteur', -1);
        if (f.rayon !== undefined && f.rayon !== null && f.rayon_interieur !== undefined && f.rayon_interieur !== null && rayonInterieur > rayon) {
          throw invalide(ch + '.rayon_interieur', 'le rayon intérieur ' + rayonInterieur + ' dépasse le rayon ' + rayon);
        }
        return {
          type: type,
          code: CODES.forme[type],
          contour: zone === 'contour',
          rayon: rayon,
          rayonInterieur: rayonInterieur,
          largeur: largeur,
          hauteur: hauteur,
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
            var l = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
            if (l === 0) throw invalide(c + '.direction', 'direction nulle');
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

      /** Dégradé (64 RVBA linéaires) et part de la couleur « source » (64 valeurs) : un arrêt « source » vaut blanc dans le
       *  dégradé et 1 dans la part ; le moteur multiplie le dégradé par mix(1, couleur du pixel d'origine, part). */
      function tableCouleur(v, ch) {
        var stops = ['#ffffff'];
        var f = C.courbe('linear', 'in');
        if (typeof v === 'string') stops = [v];
        else if (estObjet(v)) {
          stops = v.degrade;
          f = courbe(v.courbe, ch + '.courbe');
          if (!Array.isArray(stops) || !stops.length) throw invalide(ch + '.degrade', 'liste de couleurs non vide attendue');
        } else if (v !== undefined) throw invalide(ch, 'couleur ou objet { degrade, courbe } attendu');
        var cs = stops.map(function (s, k) { return s === 'source' ? [1, 1, 1, 1] : couleur(s, ch + '.degrade[' + k + ']'); });
        var ps = stops.map(function (s) { return s === 'source' ? 1 : 0; });
        var t = [];
        var part = [];
        for (var i = 0; i < TAILLE_TABLE; i++) {
          var u = Math.max(0, Math.min(1, f(i / (TAILLE_TABLE - 1)))) * (cs.length - 1);
          var k = Math.min(Math.floor(u), Math.max(0, cs.length - 2));
          var r = cs.length === 1 ? 0 : u - k;
          var c0 = cs[k];
          var c1 = cs[Math.min(k + 1, cs.length - 1)];
          for (var j = 0; j < 4; j++) t.push(arrondi(c0[j] + (c1[j] - c0[j]) * r));
          part.push(arrondi(ps[k] + (ps[Math.min(k + 1, ps.length - 1)] - ps[k]) * r));
        }
        return { couleur: t, source: part };
      }

      function compilerVie(v, ch) {
        v = objet(v, ch);
        var c = tableCouleur(v.couleur, ch + '.couleur');
        return {
          couleur: c.couleur,
          source: c.source,
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
        if (type === 'eclats') {
          // Un éclat est un morceau de la photographie de son ancre : pas d'autre texture.
          if (r.texture !== undefined) throw invalide(ch + '.texture', 'un éclat montre la photographie de son ancre : retirer « texture »');
          texture = 'image';
        } else if (typeof texture === 'string' && /^assets\//.test(texture)) {
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

      function compilerCollisions(c, ch) {
        if (c === undefined || c === null) return null;
        c = objet(c, ch);
        var cibles = c.cibles === undefined ? Object.keys(CODES.cible) : c.cibles;
        if (!Array.isArray(cibles) || !cibles.length) throw invalide(ch + '.cibles', 'liste non vide parmi ' + Object.keys(CODES.cible).join(', ') + ' attendue');
        if (cibles.length > 4) throw invalide(ch + '.cibles', '4 cibles au plus');
        var masque = 0;
        cibles.forEach(function (x, k) { masque |= CODES.cible[choix(x, CODES.cible, ch + '.cibles[' + k + ']')]; });
        var reponse = choix(c.reponse, CODES.reponse, ch + '.reponse', 'rebond');
        function entre01(cle, defaut) {
          var x = intervalle(c[cle], ch + '.' + cle, defaut);
          if (x[0] < 0 || x[1] > 1) throw invalide(ch + '.' + cle, 'valeurs entre 0 et 1 attendues');
          return x;
        }
        function positif(cle) {
          if (c[cle] === undefined || c[cle] === null) return null;
          var x = intervalle(c[cle], ch + '.' + cle, [0, 0]);
          if (x[0] < 0) throw invalide(ch + '.' + cle, 'valeur positive ou nulle attendue');
          return x;
        }
        if (Array.isArray(c.talus)) throw invalide(ch + '.talus', 'nombre ou expression attendu (angle de la couche, pas un intervalle)');
        var talus = nombre(c.talus, ch + '.talus', 35);
        if (talus < 5 || talus > 80) throw invalide(ch + '.talus', 'angle entre 5 et 80 degrés attendu');
        if (c.empiler !== undefined && typeof c.empiler !== 'boolean') throw invalide(ch + '.empiler', 'true ou false attendu');
        var empiler = c.empiler === true;
        if (empiler && reponse !== 'poser') throw invalide(ch + '.empiler', 'une couche se forme avec « reponse »: « poser »');
        if (Array.isArray(c.sol)) throw invalide(ch + '.sol', 'nombre ou expression attendu (hauteur du sol en cqh depuis le haut)');
        return {
          masque: masque,
          reponse: reponse,
          reponseCode: CODES.reponse[reponse],
          restitution: entre01('restitution', [0.4, 0.4]),
          frottement: entre01('frottement', [0.2, 0.2]),
          reposApres: positif('repos_apres'),
          empiler: empiler,
          epaisseur: positif('epaisseur'),
          talus: talus,
          sol: c.sol === undefined || c.sol === null ? null : nombre(c.sol, ch + '.sol'),
        };
      }

      /** Naissance sur les pixels de l'ancre : champs vérifiés pour toute forme, gardés pour la forme « pixels ». */
      function compilerPixels(f, ch) {
        f = f === undefined ? {} : objet(f, ch);
        var densite = nombre(f.densite, ch + '.densite', DENSITE);
        if (densite < 1 || densite > DENSITE_MAX) throw invalide(ch + '.densite', 'entre 1 et ' + DENSITE_MAX + ' pixels par particule');
        var instant = null;
        if (f.instant !== undefined && f.instant !== null && f.instant !== 'debut') {
          instant = nombre(f.instant, ch + '.instant');
          if (instant < 0) throw invalide(ch + '.instant', 'secondes de scène positives ou nulles, ou « debut », attendues');
        }
        var liberation = nombre(f.liberation, ch + '.liberation', 0);
        if (liberation < 0) throw invalide(ch + '.liberation', 'durée positive ou nulle attendue');
        var ordre = choix(f.ordre, CODES.ordre, ch + '.ordre', 'hasard');
        if (f.type !== 'pixels') return null;
        return { densite: densite, instant: instant, liberation: liberation, ordre: ordre, ordreCode: CODES.ordre[ordre] };
      }

      /** Éclats : champs vérifiés pour tout rendu, gardés pour le rendu « eclats ». */
      function compilerEclats(r, ch) {
        r = objet(r, ch);
        var morceaux = Math.round(nombre(r.morceaux, ch + '.morceaux', 24));
        if (morceaux < MORCEAUX_MIN || morceaux > MORCEAUX_MAX) throw invalide(ch + '.morceaux', 'entre ' + MORCEAUX_MIN + ' et ' + MORCEAUX_MAX + ' morceaux');
        var origine = paire(r.origine, ch + '.origine', [0.5, 0.5]);
        var impulsion = nombre(r.impulsion, ch + '.impulsion', 40);
        var rotation = nombre(r.rotation_max, ch + '.rotation_max', 180);
        if (rotation < 0) throw invalide(ch + '.rotation_max', 'valeur positive ou nulle attendue');
        if (r.type !== 'eclats') return null;
        return { morceaux: morceaux, origine: origine, impulsion: impulsion, rotationMax: rad(rotation) };
      }

      /** Arrivée sur un élément : instant arrondi au pas de 1/120 s (au moins un pas), fenêtre et ordre des trajets. */
      function compilerCible(c, ch) {
        if (c === undefined || c === null) return null;
        c = objet(c, ch);
        var source = choix(c.source, CODES.source, ch + '.source', 'ancre');
        var arrivee = choix(c.arrivee, CODES.arrivee, ch + '.arrivee', 'guidee');
        var a = dur;
        if (c.a !== undefined && c.a !== null && c.a !== 'fin') {
          a = nombre(c.a, ch + '.a');
          if (a < 0) throw invalide(ch + '.a', 'secondes de τ positives ou nulles, ou « fin », attendues');
        }
        var k = Math.max(1, Math.round(a / PAS));
        function fraction(cle, defaut) {
          var x = nombre(c[cle], ch + '.' + cle, defaut);
          if (x < 0 || x > 1) throw invalide(ch + '.' + cle, 'valeur entre 0 et 1 attendue');
          return x;
        }
        var echelonnement = fraction('echelonnement', 0);
        var guidage = fraction('guidage', 0.6);
        var densite = nombre(c.densite, ch + '.densite', DENSITE);
        if (densite < 1 || densite > DENSITE_MAX) throw invalide(ch + '.densite', 'entre 1 et ' + DENSITE_MAX + ' pixels par particule');
        var ordre = choix(c.ordre, CODES.ordre, ch + '.ordre', 'hasard');
        var f = courbe(c.courbe, ch + '.courbe');
        var progression = [];
        for (var i = 0; i < TAILLE_TABLE; i++) progression.push(arrondi(f(i / (TAILLE_TABLE - 1))));
        return {
          source: source, sourceCode: CODES.source[source], arrivee: arrivee, arriveeCode: CODES.arrivee[arrivee],
          k: k, a: arrondi(k * PAS), echelonnement: echelonnement, ordre: ordre, ordreCode: CODES.ordre[ordre],
          guidage: guidage, densite: densite, progression: progression, bruit: [1, 0, 0],
        };
      }

      /** Règles d'un émetteur de fragments (pixels, éclats ou cible). */
      function verifierFragment(n, em, ch, P) {
        if (P) throw invalide(ch, 'un sous-émetteur ne naît pas d\'une photographie (forme « pixels », éclats, « cible ») : réservé aux émetteurs lancés par la scène');
        if (n.debit !== undefined || n.salves !== undefined) {
          throw invalide(ch + '.naissance', 'un émetteur de fragments naît tout entier au début de l\'effet (une particule par pixel ou par éclat) : retirer « debit » et « salves »');
        }
        if (em.cible && em.eclats) throw invalide(ch + '.cible', 'les éclats ne visent pas de cible');
        if (!em.pixels && !em.cible && em.tables.source.some(function (x) { return x > 0; })) {
          throw invalide(ch + '.vie.couleur', '« source » est la couleur des pixels d\'un élément photographié : seulement avec la forme « pixels » ou une « cible »');
        }
        if (em.cible && em.collisions && em.collisions.reponse !== 'rebond') {
          throw invalide(ch + '.collisions.reponse', 'une particule qui vise une cible doit pouvoir repartir vers elle : seulement « rebond »');
        }
        if (em.cible && em.cible.arrivee === 'choree' && (em.aLaMort >= 0 || em.aLaCollision >= 0 || em.rendu.type === 'trainee')) {
          throw invalide(ch + '.cible.arrivee', 'une arrivée chorégraphiée (calculée sans état) n\'a ni sous-émetteur ni traînée : « guidee »');
        }
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
      var enfantCollision = liste.map(function () { return -1; });
      var declencheur = liste.map(function () { return null; });
      // Un émetteur n'a qu'un parent, par « a_la_mort » ou par « a_la_collision ».
      function lier(e, i, cle) {
        var cible = e[cle] && e[cle].emetteur;
        if (cible === undefined || cible === null) return;
        var ch = 'emetteurs[' + e.nom + '].' + cle + '.emetteur';
        if (parNom[cible] === undefined) throw invalide(ch, 'émetteur « ' + cible + ' » inconnu');
        var j = parNom[cible];
        if (j === i) throw invalide(ch, 'un émetteur ne peut pas se lancer lui-même');
        if (parent[j] >= 0) throw invalide(ch, '« ' + cible + ' » est déjà lancé par « ' + liste[parent[j]].nom + ' »');
        if (cle === 'a_la_collision' && (e.collisions === undefined || e.collisions === null)) {
          throw invalide(ch, '« a_la_collision » demande « collisions » sur « ' + e.nom + ' »');
        }
        parent[j] = i;
        declencheur[j] = cle === 'a_la_mort' ? 'mort' : 'collision';
        if (cle === 'a_la_mort') enfant[i] = j;
        else enfantCollision[i] = j;
      }
      liste.forEach(function (e, i) { lier(e, i, 'a_la_mort'); });
      liste.forEach(function (e, i) { lier(e, i, 'a_la_collision'); });
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
        var cible = compilerCible(e.cible, ch + '.cible');
        var vie = intervalle(n.vie, ch + '.naissance.vie', [1, 1]);
        if (cible) {
          if (n.vie !== undefined) throw invalide(ch + '.naissance.vie', 'une particule qui vise une cible vit jusqu\'à son arrivée : retirer « vie »');
          vie = [cible.a, cible.a];
        }
        if (vie[0] <= 0) throw invalide(ch + '.naissance.vie', 'la durée de vie doit être positive');
        var em = {
          nom: e.nom,
          index: i,
          parent: P ? P.index : -1,
          profondeur: profondeur[i],
          aLaMort: enfant[i],
          aLaCollision: enfantCollision[i],
          declencheur: declencheur[i],
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
          collisions: compilerCollisions(e.collisions, ch + '.collisions'),
          pixels: compilerPixels(n.forme, ch + '.naissance.forme'),
          eclats: compilerEclats(e.rendu, ch + '.rendu'),
          cible: cible,
        };
        em.fragment = !!(em.pixels || em.eclats || em.cible);
        if (em.fragment) verifierFragment(n, em, ch, P);
        else if (em.tables.source.some(function (x) { return x > 0; })) {
          throw invalide(ch + '.vie.couleur', '« source » est la couleur des pixels d\'un élément photographié : seulement avec la forme « pixels » ou une « cible »');
        }
        if (cible) {
          // Bruit du trajet chorégraphié : celui de la première turbulence (amplitude = force × 0,1 cqh).
          var turbulence = em.forces.filter(function (f) { return f.type === 'turbulence'; })[0];
          if (turbulence) cible.bruit = [turbulence.echelle, arrondi(turbulence.force * 0.1), turbulence.vitesse];
        }
        // Fragments tenus à leur place un pas (raccord exact), puis libérés selon « liberation ».
        var tenue = em.pixels || em.eclats ? PAS : 0;
        var liberation = em.pixels ? em.pixels.liberation : 0;
        // Mort au contact ou fondu après la pose : une particule peut mourir dès sa naissance.
        var etendueMorts = (em.collisions && (em.collisions.reponse === 'mourir' || em.collisions.reposApres) ? vie[1] : vie[1] - vie[0]) + tenue + liberation;
        // À l'arrondi près : une arrivée au premier pas (cible.a = 0) vaut 0.008333 s.
        if (enfant[i] >= 0 && vie[0] < PAS - 1e-6) {
          throw invalide(ch + '.naissance.vie', 'durée de vie minimale ' + vie[0] + ' sous 1/120 s : deux morts dans le même pas feraient perdre des enfants');
        }
        if (em.masse[0] <= 0) throw invalide(ch + '.naissance.masse', 'la masse doit être positive');
        if (P) {
          if (n.debit !== undefined || n.salves !== undefined) {
            throw invalide(ch + '.naissance', 'un sous-émetteur naît de la mort de « ' + P.nom + ' » : utiliser « nombre », pas « debit » ni « salves »');
          }
          em.k = Math.round(nombre(n.nombre, ch + '.naissance.nombre'));
          if (em.k < 1) throw invalide(ch + '.naissance.nombre', 'au moins 1');
          // S : écart entre deux occupants successifs d'une case parent ; J : gigue de leurs morts.
          // G : générations d'une case enfant, pour que G·S − J ≥ vie max de l'enfant.
          // Collision : un impact peut tomber n'importe quand dans la vie du parent (gigue des naissances + vie min du parent).
          var gigueNaissances = declencheur[i] === 'collision' ? P.gigue + P.vie[0] : P.gigue;
          em.G = P.espacement === Infinity ? 1 : Math.max(1, Math.ceil((vie[1] + gigueNaissances) / P.espacement));
          em.debit = 0;
          em.nTotal = 0;
          em.capContinu = 0;
          em.salves = [];
          em.capacite = P.capacite * em.G * em.k;
          em.espacement = P.espacement === Infinity ? Infinity : em.G * P.espacement;
          em.gigue = gigueNaissances + etendueMorts;
          em.finNaissances = P.fin;
        } else if (em.fragment) {
          // Une particule par éclat, ou par pixel (nombre fixé à la photographie : fragments.ajusterCapacites), toutes
          // nées à τ = 0.
          if (n.nombre !== undefined) throw invalide(ch + '.naissance.nombre', '« nombre » est réservé aux sous-émetteurs ; utiliser « debit » ou « salves »');
          var nombreFragments = em.eclats ? em.eclats.morceaux : 1;
          em.k = 0;
          em.G = 1;
          em.debit = 0;
          em.nTotal = 0;
          em.capContinu = 0;
          em.salves = [{ t: 0, nombre: nombreFragments, debut: 0 }];
          em.capacite = nombreFragments;
          em.espacement = Infinity;
          em.gigue = etendueMorts;
          em.finNaissances = 0;
        } else {
          if (n.nombre !== undefined) throw invalide(ch + '.naissance.nombre', '« nombre » est réservé aux sous-émetteurs ; utiliser « debit » ou « salves »');
          em.k = 0;
          em.G = 1;
          em.debit = nombre(n.debit, ch + '.naissance.debit', 0);
          if (em.debit < 0) throw invalide(ch + '.naissance.debit', 'valeur positive ou nulle attendue');
          var salves = n.salves === undefined ? [] : n.salves;
          if (!Array.isArray(salves)) throw invalide(ch + '.naissance.salves', 'liste attendue');
          if (salves.length > SALVES_MAX) throw invalide(ch + '.naissance.salves', SALVES_MAX + ' salves au plus');
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
          em.espacement = em.capContinu > 0 && em.capContinu < em.nTotal ? em.capContinu / em.debit : Infinity;
          em.gigue = etendueMorts;
          em.finNaissances = finN;
        }
        if (em.capacite > CAPACITE_MAX) {
          throw invalide(ch, 'capacité de ' + em.capacite + ' particules, au-delà du maximum ' + CAPACITE_MAX + ' ; baisser nombre, debit ou la durée de vie');
        }
        if (em.rendu.type === 'trainee' && em.capacite * em.rendu.longueur > HISTORIQUE_MAX) {
          throw invalide(ch + '.rendu', 'traînée trop longue pour ' + em.capacite + ' particules (capacité × longueur au plus ' + HISTORIQUE_MAX + ')');
        }
        em.fin = em.cible ? em.cible.a : arrondi(em.finNaissances + tenue + liberation + vie[1]);
        em.voieRapide = em.parent < 0 && em.aLaMort < 0 && em.rendu.type !== 'trainee' && (em.cible
          ? em.cible.arrivee === 'choree'
          : em.forces.every(function (f) { return f.type === 'gravite' || (f.type === 'trainee' && !f.quadratique); }));
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
          tons: choix(rc.tons, { douce: 1, aces: 1, neutre: 1 }, 'rendu_calque.tons', 'douce'),
        },
        capacite: emetteurs.reduce(function (s, e) { return s + e.capacite; }, 0),
        fin: emetteurs.reduce(function (s, e) { return Math.max(s, e.fin); }, 0),
        emetteurs: emetteurs,
      };
      emetteurs.forEach(function (e) { delete e.espacement; delete e.gigue; delete e.finNaissances; });
      return { ok: true, effet: effet, erreurs: [] };
    } catch (e) {
      if (e && e.regle) return { ok: false, effet: null, erreurs: [{ regle: e.regle, message: e.message, chemin: e.chemin || '' }] };
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
    SALVES_MAX: SALVES_MAX,
    CAPACITE_MAX: CAPACITE_MAX,
    DENSITE: DENSITE,
    DENSITE_MAX: DENSITE_MAX,
    MORCEAUX_MIN: MORCEAUX_MIN,
    MORCEAUX_MAX: MORCEAUX_MAX,
    SCHEMA: SCHEMA,
    ErreurRecette: ErreurRecette,
    resoudre: resoudre,
    fusionner: fusionner,
    differences: differences,
    egal: egal,
    analyserReglages: analyserReglages,
    couleurLineaire: couleurLineaire,
    compiler: compiler,
  };
});
