/* Pulse Motion – recettes d'effets de particules : héritage, réglages, couleurs, compilation.
 *
 * resoudre(nom, charger)   applique « etend » (fusion profonde, émetteurs fusionnés par nom)
 * differences(base, r)     plus petite recette dérivée d telle que fusionner(base, d) redonne r (atelier)
 * fusionner(base, ajout), egal(a, b)
 * analyserReglages(texte)  "nombre: 3000; couleur: accent" -> { valeurs, erreurs }
 * valeursParametres(recette, reglages, charte, invalide) -> { nombres, couleurs (hex), erreurs }   (shaders, P6)
 * compiler(recette, o)     recette -> paramètres numériques pour le GPU (cqh, s de τ, radians,
 *                          RVB linéaire, tables de 64 valeurs, capacités)
 * SCHEMA                   description déclarative du format (atelier : formulaire ; compilateur : champs refusés)
 * Modules (P6) : « modules » d'un émetteur ({ force, couleur, forme } : noms de shaders) -> em.modules ; un module de force
 * fait quitter la voie rapide ; effet.reglages = { nombres, couleurs } (valeurs des réglages, hex pour les couleurs).
 * Fragments (P4) : forme « pixels » (naissance sur les pixels de l'ancre photographiée), couleur « source », rendu
 * « eclats », « cible » (arrivée sur un élément) ; un émetteur de fragments naît tout entier à τ = 0 (une salve dont le
 * nombre est fixé à la photographie : fragments.js).
 * Interactions (P5a) : bloc « interactions » d'un émetteur (essaim, fluide, grains : em.interactions), liens « avec » entre
 * émetteurs d'un même effet (effet.groupes : un groupe de voisinage par ensemble lié, un type par groupe) ; rendu « fluide »
 * (em.fluide : nappe lissée). Un émetteur à interactions quitte la voie rapide ; erreurs « interactions-invalides ».
 * Structures (P5b) : bloc « structure » d'un émetteur (corde ou tissu : sommets, attaches, réglages XPBD, déchirure, perles,
 * apparence : em.structure) ; un émetteur de structure existe pendant toute la fenêtre de l'effet (vie = dur, pas de
 * naissance en flux), hors voie rapide ; effet.elements : ids visés par les attaches « #id » ; le dégradé est dans
 * em.tables.couleur, l'image de assets/ dans em.rendu.textureFichier ; erreurs « structure-invalide ».
 * Milieux (P5c) : bloc « milieu » à la racine d'une recette (milieu fluide posé par data-milieu : grille, flottaison,
 * refroidissement, dissipation, vorticité, viscosité, bords, sources sur une forme de P1, rendu fumée, feu ou encre, table du
 * feu) ; une recette de milieu n'a pas d'émetteurs (effet.milieu, capacité nulle) ; erreurs « milieu-invalide ». Couplages
 * des effets : force « milieu » (vent du milieu), bloc « injecte » d'un émetteur (dépôt de fumée, de chaleur, d'encre),
 * « structure.milieu » (poussée sur une corde ou un tissu) ; effet.couplage.
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
  var RAYON_INTERACTION = 2;   // cqh : rayon d'interaction par défaut
  var RAYON_MIN = 0.25;        // cqh : grille d'un million de cellules au plus (scène élargie, plan 2)
  var RAYON_MAX = 20;
  var GROUPE_MAX = 8;          // émetteurs liés par « avec » (uniforme du groupe sur le GPU)
  var ITERATIONS_GRAINS = 6;   // itérations de contacts par sous-pas (deux sous-pas : plan 3)
  var LIMITES_INTERACTIONS = { essaim: 100000, fluide: 60000, grains: 60000 };
  var PLEINE_VOISINAGE = 96;   // corps par cellule au-delà desquels la cellule est ignorée pour le pas (voisinage.js, PLEINE)
  var RESOLUTION_CORDE = [8, 128];   // sommets d'une corde
  var RESOLUTION_TISSU = [2, 128];   // colonnes et lignes d'un tissu
  var SOMMETS_TISSU_MAX = 4096;      // 64 × 64 : au-delà, alerte budget-structures (contrôle)
  var STRUCTURES_SCENE_MAX = 16;     // cordes et tissus par scène : au-delà, alerte budget-structures
  var STRUCTURES_EFFET_MAX = 32;     // par effet (uniforme des structures sur le GPU)
  var ATTACHES_MAX = 16;             // attaches par structure
  var ELEMENTS_MAX = 8;              // éléments visés par les attaches d'un effet : l'ancre (ou la balise) et 7 « #id »
  var DECHIRURE_MIN = 1.05;
  var RESOLUTION_MILIEU = [64, 1024];   // cellules sur le grand côté d'un milieu (P5c)
  var RESOLUTION_MILIEU_ALERTE = 512;   // au-delà : alerte budget-milieu (contrôle)
  var SOURCES_MILIEU_MAX = 8;           // sources d'un milieu (uniforme de la grille sur le GPU)
  var KELVIN_MIN = 800;                 // feu le plus froid de la table (rouge sombre)
  var KELVIN_MAX = 6500;                // feu le plus chaud de la table (blanc)
  var PLACES = { corde: ['debut', 'fin'], tissu: ['haut', 'bas', 'gauche', 'droite', 'coins'] };
  var CODES = {
    forme: { point: 0, cercle: 1, anneau: 2, rectangle: 3, ligne: 4, ancre: 5, pixels: 6 },
    force: { gravite: 0, trainee: 1, vent: 2, turbulence: 3, attracteur: 4, vortex: 5, rappel: 6, milieu: 7 },
    rendu: { sprite: 0, etincelle: 1, trainee: 2, planche: 3, eclats: 4, fluide: 5 },
    melange: { additif: 0, alpha: 1, premultiplie: 2 },
    texture: { 'disque-doux': 0, etoile: 1, fumee: 2, flamme: 3, eclat: 4, confetti: 5, image: 6, pixel: 7 },
    reponse: { rebond: 0, poser: 1, mourir: 2 },
    cible: { sol: 1, murs: 2, elements: 4, formes: 8 },
    ordre: { hasard: 0, 'gauche-droite': 1, centre: 2 },
    arrivee: { guidee: 0, choree: 1 },
    source: { ancre: 0, cible: 1 },
    interaction: { essaim: 0, fluide: 1, grains: 2 },
    structure: { corde: 0, tissu: 1 },
    sourceMilieu: { fumee: 0, chaleur: 1, encre: 2 },
    renduMilieu: { fumee: 0, feu: 1, encre: 2 },
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

  /** Champs d'une forme de P1 (types donnés) : émetteurs, et sources d'un milieu (P5c, sans les champs des pixels). */
  function champsForme(types) {
    return {
      type: ch('Forme', types, 'ancre'),
      zone: ch('Zone', ['surface', 'contour'], 'surface'),
      rayon: nb('Rayon', null, { min: 0, unite: 'cqh', exemple: 5, curseur: [0, 50] }),
      rayon_interieur: nb('Rayon intérieur', 0, { min: 0, unite: 'cqh', curseur: [0, 50] }),
      largeur: nb('Largeur', null, { min: 0, unite: 'cqh', exemple: 10, curseur: [0, 180] }),
      hauteur: nb('Hauteur', null, { min: 0, unite: 'cqh', exemple: 10, curseur: [0, 100] }),
      angle: nb('Angle', 0, { unite: '°', curseur: [-180, 180] }),
      decalage: pr('Décalage (fraction de la zone)', [0, 0]),
    };
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
    milieu: ob('Milieu fluide (balise data-milieu : fumée, feu, encre ; sans émetteurs)', {
      resolution: nb('Cellules sur le grand côté', 192, { min: RESOLUTION_MILIEU[0], max: RESOLUTION_MILIEU[1], pas: 1, curseur: [64, RESOLUTION_MILIEU_ALERTE] }),
      flottaison: nb('Flottaison (la chaleur monte ; négative : elle descend)', 1, { min: -5, max: 5, curseur: [-2, 3], pas: 0.05 }),
      refroidissement: nb('Refroidissement (par seconde)', 0.6, { min: 0, max: 10, curseur: [0, 3], pas: 0.05 }),
      dissipation: nb('Dissipation de la fumée et de l\'encre (par seconde)', 0.3, { min: 0, max: 10, curseur: [0, 3], pas: 0.05 }),
      vorticite: nb('Tourbillons (confinement de vorticité)', 0.4, { min: 0, max: 2, curseur: [0, 2], pas: 0.05 }),
      viscosite: nb('Viscosité', 0, { min: 0, max: 1, curseur: [0, 1], pas: 0.01 }),
      bords: ch('Bords de la zone (ouverts : la fumée en sort)', ['ouverts', 'fermes'], 'ouverts'),
      sources: li('Sources (posées dans la zone)', ob('Source', {
        type: ch('Type', Object.keys(CODES.sourceMilieu), null, { requis: true, exemple: 'fumee' }),
        forme: ob('Forme de la source (centrée sur la zone)', champsForme(Object.keys(CODES.forme).filter(function (t) { return t !== 'pixels'; }))),
        debit: nb('Débit (par seconde)', 1, { min: 0, curseur: [0, 10], pas: 0.1 }),
        temperature: nb('Température apportée (fumée, encre)', 0, { min: 0, max: 5, curseur: [0, 3], pas: 0.05 }),
        couleur: noeud('couleur', 'Couleur de l\'encre', null, { exemple: '#1d3fbf' }),
      }), { defaut: [], exemple: [{ type: 'fumee' }], maximum: SOURCES_MILIEU_MAX }),
      rendu: ob('Rendu', {
        type: ch('Type', Object.keys(CODES.renduMilieu), 'fumee'),
        couleur: noeud('couleur', 'Couleur de la fumée', '#8a8f99'),
        corps_noir: noeud('booleen', 'Feu : couleur du corps noir selon la température', true),
        opacite: nb('Opacité', 0.8, { min: 0, max: 1, curseur: [0, 1], pas: 0.05 }),
        intensite: nb('Éclat du feu (au-delà de 1 : halo)', 3, { min: 0, max: 20, curseur: [0, 8], pas: 0.1 }),
        lumiere: pr('Direction de la lumière (ombrage de la fumée)', [-0.4, -1]),
      }),
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
        forme: ob('Forme d\'émission', Object.assign(champsForme(Object.keys(CODES.forme)), {
          densite: nb('Densité (forme « pixels ») : une particule pour N pixels de l\'ancre', DENSITE, { min: 1, max: DENSITE_MAX, pas: 1, curseur: [1, DENSITE_MAX] }),
          instant: nb('Photographie de l\'ancre (s de scène ; absent : début de l\'effet)', null, { min: 0, exemple: 1, unite: 's', curseur: [0, 30] }),
          liberation: nb('Libération des pixels étalée sur', 0, { min: 0, unite: 's', curseur: [0, 5] }),
          ordre: ch('Ordre de libération', Object.keys(CODES.ordre), 'hasard'),
        })),
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
            milieu: { libelle: 'Milieu (entraînée par le vent du milieu de la scène, data-milieu)', champs: { coef: nb('Prise au vent', 1, { min: 0, curseur: [0, 10] }) } },
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
        origine: pr('Point d\'impact des éclats (fraction de la boîte du contenu visible)', [0.5, 0.5]),
        impulsion: nb('Impulsion des éclats', 40, { unite: 'cqh/s', curseur: [0, 300] }),
        rotation_max: nb('Rotation maximale des éclats', 180, { min: 0, unite: '°/s', curseur: [0, 1080] }),
        teinte: noeud('couleur', 'Teinte du fluide', '#4aa8ff'),
        opacite: nb('Opacité du fluide', 0.85, { min: 0, max: 1, curseur: [0, 1], pas: 0.05 }),
        absorption: nb('Absorption du fluide (par cqh d\'épaisseur)', 0.25, { min: 0, curseur: [0, 2], pas: 0.05 }),
        refraction: nb('Réfraction de la scène sous le fluide', 0, { min: 0, max: 1, curseur: [0, 1], pas: 0.05 }),
        lissage: nb('Lissage de la nappe', 1, { min: 0, max: 5, unite: 'cqh', curseur: [0, 5], pas: 0.1 }),
      }),
      a_la_mort: ob('À la mort', {
        emetteur: noeud('texte', 'Émetteur lancé', null, { motif: '^[a-z0-9-]+$', parmi: 'emetteurs', exemple: 'b' }),
      }),
      modules: ob('Modules WGSL (shaders de la personne)', {
        force: noeud('texte', 'Force ajoutée à l\'accélération (shader module-force)', null, { motif: '^[a-z0-9-]+$', exemple: 'spirale' }),
        couleur: noeud('texte', 'Couleur au cours de la vie (shader module-couleur)', null, { motif: '^[a-z0-9-]+$', exemple: 'couleur-vitesse' }),
        forme: noeud('texte', 'Motif de la particule (shader module-forme)', null, { motif: '^[a-z0-9-]+$', exemple: 'etoile' }),
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
      interactions: ob('Interactions entre particules', {
        type: ch('Type', Object.keys(CODES.interaction), null, { requis: true, exemple: 'essaim' }),
        rayon: nb('Rayon d\'interaction', RAYON_INTERACTION, { min: RAYON_MIN, max: RAYON_MAX, unite: 'cqh', curseur: [0.5, 10], pas: 0.1 }),
        avec: li('Interagit aussi avec (émetteurs du même effet, même type)',
          noeud('texte', 'Émetteur', null, { motif: '^[a-z0-9-]+$', parmi: 'emetteurs', exemple: 'b' }), { defaut: [], maximum: GROUPE_MAX - 1 }),
      }, {
        exemple: { type: 'essaim' },
        variantes: {
          cle: 'type',
          types: {
            essaim: { libelle: 'Essaim (nuée, banc, lucioles)', champs: {
              separation: nb('Séparation', 1.5, { min: 0, max: 5, curseur: [0, 5], pas: 0.1 }),
              alignement: nb('Alignement', 1, { min: 0, max: 5, curseur: [0, 5], pas: 0.1 }),
              cohesion: nb('Cohésion', 1, { min: 0, max: 5, curseur: [0, 5], pas: 0.1 }),
              vision: ob('Vision', {
                rayon: nb('Rayon de vision', 6, { min: RAYON_MIN, max: 40, unite: 'cqh', curseur: [1, 30] }),
                angle: nb('Angle de vision', 270, { min: 10, max: 360, unite: '°', curseur: [10, 360] }),
              }),
              vitesse: iv('Vitesse', [5, 20], { unite: 'cqh/s', curseur: [0, 100] }),
              cible: pr('Cible (fraction de la zone, ou « ancre »)', null, { exemple: [0.5, 0.5] }),
              fuite: nb('Fuite des obstacles', 30, { min: 0, curseur: [0, 200] }),
            } },
            fluide: { libelle: 'Fluide (eau, miel)', champs: {
              densite: nb('Densité au repos (particules par cellule)', 6, { min: 1, max: 30, curseur: [2, 20] }),
              viscosite: nb('Viscosité', 0.05, { min: 0, max: 1, curseur: [0, 1], pas: 0.01 }),
              tension: nb('Tension de surface', 0.1, { min: 0, max: 1, curseur: [0, 1], pas: 0.01 }),
              incompressibilite: nb('Incompressibilité (itérations)', 4, { min: 2, max: 6, pas: 1, curseur: [2, 6] }),
            } },
            grains: { libelle: 'Grains (sable, neige lourde)', champs: {
              frottement: ob('Frottement entre grains', {
                statique: nb('Statique', 0.6, { min: 0, max: 1.5, curseur: [0, 1.5], pas: 0.05 }),
                dynamique: nb('Dynamique', 0.4, { min: 0, max: 1.5, curseur: [0, 1.5], pas: 0.05 }),
              }),
              cohesion: nb('Cohésion', 0, { min: 0, max: 1, curseur: [0, 1], pas: 0.05 }),
              restitution: nb('Rebond entre grains', 0.1, { min: 0, max: 1, curseur: [0, 1], pas: 0.05 }),
            } },
          },
        },
      }),
      structure: ob('Corde ou tissu (sommets reliés, simulés ensemble)', {
        type: ch('Type', Object.keys(CODES.structure), null, { requis: true, exemple: 'corde' }),
        attaches: li('Attaches (sommets tenus)', ob('Attache', {
          ou: ch('Sommets tenus', PLACES.corde.concat(PLACES.tissu), null, {
            requis: true, exemple: 'debut', autre: { motif: '^\\s*\\d+(\\s*,\\s*\\d+)*\\s*$', libelle: 'Indices de sommets (« 0, 12 »)' },
          }),
          a: noeud('texte', 'Tenus par (« ancre », « #id », ou point [x, y] de la zone)', 'ancre', { motif: '^(ancre|#[A-Za-z0-9_-]+)$' }),
          lacher: nb('Lâchée à (s de τ ; absent : jamais)', null, { min: 0, exemple: 2.5, unite: 's', curseur: [0, 10] }),
          glisse: ob('Glissement (les sommets tenus s\'écartent de leur place)', {
            vers: pr('Décalage final (fraction de l\'élément ou de la zone)', [0, 0], { requis: true, exemple: [-0.25, 0] }),
            duree: nb('Durée du glissement depuis le début de l\'effet', 1, { min: 0.05, unite: 's', curseur: [0.05, 5] }),
          }),
        }), { defaut: [], exemple: [{ ou: 'debut', a: 'ancre' }], maximum: ATTACHES_MAX }),
        raideur: nb('Raideur', 0.9, { min: 0, max: 1, curseur: [0, 1], pas: 0.01 }),
        flexion: nb('Raideur de flexion', 0.1, { min: 0, max: 1, curseur: [0, 1], pas: 0.01 }),
        amortissement: nb('Amortissement', 0.02, { min: 0, max: 1, curseur: [0, 1], pas: 0.01 }),
        dechirure: nb('Déchirure (étirement de rupture d\'un lien ; absent : indéchirable)', null, { min: DECHIRURE_MIN, exemple: 1.6, curseur: [1.05, 3], pas: 0.01 }),
        epaisseur: nb('Épaisseur', 0.4, { min: 0.05, max: 10, unite: 'cqh', curseur: [0.05, 3], pas: 0.05 }),
        apparence: ob('Apparence', {
          couleur: noeud('couleur', 'Couleur (teinte qui multiplie dégradé, image et photographie)', '#ffffff'),
          degrade: li('Dégradé', noeud('couleur', 'Couleur', '#ffffff'), { exemple: ['#ff0000', '#0000ff'] }),
          sens: ch('Sens du dégradé', ['horizontal', 'vertical'], 'horizontal'),
          bandes: bo('Bandes nettes (drapeau)'),
          image: noeud('texte', 'Image du projet (assets/…)', null, { motif: '^assets/.+\\.(png|webp|jpe?g|svg)$', exemple: 'assets/toile.png' }),
          source: ch('Photographie de l\'ancre (cachée pendant que le tissu la remplace)', ['ancre'], null, { exemple: 'ancre' }),
          mailles: bo('Mailles seules (filet)'),
          lumiere: pr('Direction de la lumière', [-0.4, -1]),
        }),
        milieu: ob('Prise au vent du milieu (poussée selon la surface exposée)', {
          coef: nb('Prise au vent', 1, { min: 0, curseur: [0, 10] }),
        }),
      }, {
        exemple: { type: 'corde' },
        variantes: {
          cle: 'type',
          horsType: { perles: 'des perles se posent sur une corde', fente: 'fente : tissu seulement (couture coupée entre deux colonnes)' },
          types: {
            corde: { libelle: 'Corde (fil, guirlande)', champs: {
              resolution: nb('Sommets', 32, { min: RESOLUTION_CORDE[0], max: RESOLUTION_CORDE[1], pas: 1, curseur: [8, 128] }),
              perles: ob('Perles (émetteur posé sur les sommets)', {
                tous: nb('Une perle tous les N sommets', 4, { min: 2, max: 64, pas: 1, curseur: [2, 16] }),
                emetteur: noeud('texte', 'Émetteur des perles', null, { requis: true, motif: '^[a-z0-9-]+$', parmi: 'emetteurs', exemple: 'b' }),
              }),
            } },
            tissu: { libelle: 'Tissu (drapeau, rideau, filet)', champs: {
              resolution: pr('Sommets [colonnes, lignes]', [24, 16]),
              fente: nb('Fente (couture coupée avant la colonne indiquée, de haut en bas ; absent : aucune)', null, { min: 1, pas: 1, exemple: 12, curseur: [1, 127] }),
            } },
          },
        },
      }),
      injecte: ob('Dépôt dans le milieu de la scène (là où passe chaque particule)', {
        fumee: nb('Fumée déposée (par seconde et par particule)', 0, { min: 0, curseur: [0, 5], pas: 0.05 }),
        chaleur: nb('Chaleur déposée (par seconde et par particule)', 0, { min: 0, curseur: [0, 5], pas: 0.05 }),
        encre: noeud('texte', 'Encre déposée (couleur, ou « couleur » : celle de la particule)', null, {
          motif: '^(couleur|#[0-9a-fA-F]{3,8}|[a-z_][a-z0-9_]*)$', exemple: '#202060',
        }),
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

  // ---- Milieu (P5c) : corps noir, encre ----

  /** Couleur d'un corps noir à k kelvins, sRGB dans [0, 1] (approximation publique de T. Helland, 2012). */
  function corpsNoir(k) {
    var t = k / 100;
    var r;
    var g;
    var b;
    if (t <= 66) {
      r = 255;
      g = 99.4708025861 * Math.log(t) - 161.1195681661;
    } else {
      r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
      g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    }
    if (t >= 66) b = 255;
    else if (t <= 19) b = 0;
    else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    return [r, g, b].map(function (x) { return Math.max(0, Math.min(255, x)) / 255; });
  }

  /** Table du feu : 64 RVBA linéaires d'émission (HDR) pour la température normalisée t = i / 63 : couleur du corps noir de
   *  KELVIN_MIN (rouge sombre) à KELVIN_MAX (blanc), ou teinte fixe [r, v, b, a] linéaire ; intensité × t² (un feu tiède
   *  luit à peine) ; alpha : min(1, t²). */
  function tableFeu(teinte, intensite) {
    var t = [];
    for (var i = 0; i < TAILLE_TABLE; i++) {
      var x = i / (TAILLE_TABLE - 1);
      var c = teinte ? teinte.slice(0, 3) : corpsNoir(KELVIN_MIN + (KELVIN_MAX - KELVIN_MIN) * x).map(versLineaire);
      var e = intensite * x * x;
      t.push(arrondi(c[0] * e), arrondi(c[1] * e), arrondi(c[2] * e), arrondi(Math.min(1, x * x)));
    }
    return t;
  }

  /** Absorbance par canal d'une encre de couleur linéaire c : −ln(c), bornée (une encre blanche n'absorbe rien). */
  function absorbanceEncre(c) {
    return [0, 1, 2].map(function (k) { return arrondi(-Math.log(Math.max(c[k], 0.02))); });
  }

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
        if (!Object.prototype.hasOwnProperty.call(champs, k) && n.variantes && n.variantes.horsType && Object.prototype.hasOwnProperty.call(n.variantes.horsType, k)) {
          throw invalide(c, n.variantes.horsType[k]); // champ d'un autre type : message propre
        }
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
      var c = chemin || '';
      var regle = /(^|\.)interactions(\.|\[|$)/.test(c) ? 'interactions-invalides'
        : /(^|\.)structure(\.|\[|$)/.test(c) ? 'structure-invalide'
        : /(^|\.)(collisions|a_la_collision)(\.|\[|$)/.test(c) ? 'collisions-invalides'
        : /(^|\.)milieu(\.|\[|$)/.test(c) ? 'milieu-invalide' : 'effet-invalide';
      return ErreurRecette(regle, prefixe + (chemin ? ', ' + chemin : '') + ' : ' + message + '.', chemin || '');
    }
    // Règle des structures (P5b) quel que soit le champ en cause (naissance, rendu, perles d'un émetteur de structure).
    function invalideS(chemin, message) {
      return ErreurRecette('structure-invalide', prefixe + (chemin ? ', ' + chemin : '') + ' : ' + message + '.', chemin || '');
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
          } else if (type === 'milieu') {
            r.coef = nombre(f.coef, c + '.coef', 1);
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

      /** Rendu « fluide » (P5a) : champs vérifiés pour tout rendu, gardés pour le rendu « fluide » (nappe en espace écran). */
      function compilerFluide(r, ch) {
        r = objet(r, ch);
        function entre(cle, defaut, max) {
          var x = nombre(r[cle], ch + '.' + cle, defaut);
          if (x < 0 || (max !== undefined && x > max)) {
            throw invalide(ch + '.' + cle, max !== undefined ? 'valeur entre 0 et ' + max + ' attendue' : 'valeur positive ou nulle attendue');
          }
          return x;
        }
        var res = {
          teinte: couleur(r.teinte === undefined ? '#4aa8ff' : r.teinte, ch + '.teinte'),
          opacite: entre('opacite', 0.85, 1),
          absorption: entre('absorption', 0.25),
          refraction: entre('refraction', 0, 1),
          lissage: entre('lissage', 1, 5),
        };
        if (r.type !== 'fluide') return null;
        return res;
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

      /** Dépôt dans le milieu (P5c) : fumée et chaleur par seconde, encre (couleur fixe, ou « couleur » : celle de la particule
       *  au cours de sa vie) ; null si rien n'est déposé. */
      function compilerInjecte(v, ch) {
        if (v === undefined || v === null) return null;
        v = objet(v, ch);
        function positif(cle) {
          var x = nombre(v[cle], ch + '.' + cle, 0);
          if (x < 0) throw invalide(ch + '.' + cle, 'valeur positive ou nulle attendue');
          return x;
        }
        var fumee = positif('fumee');
        var chaleur = positif('chaleur');
        var encre = null;
        if (v.encre !== undefined && v.encre !== null) {
          encre = v.encre === 'couleur' ? { mode: 'particule', absorbance: [0, 0, 0] } : { mode: 'fixe', absorbance: absorbanceEncre(couleur(v.encre, ch + '.encre')) };
        }
        if (!fumee && !chaleur && !encre) return null;
        return { fumee: fumee, chaleur: chaleur, encre: encre };
      }

      /** Bloc « interactions » (P5a) : type, rayon, émetteurs liés (noms vérifiés avec les groupes), réglages du type ;
       *  cote : côté de cellule de voisinage propre à l'émetteur (essaim : rayon de vision s'il est plus grand). */
      function compilerInteractions(v, ch) {
        if (v === undefined || v === null) return null;
        v = objet(v, ch);
        var type = choix(v.type, CODES.interaction, ch + '.type');
        function entre(o, cle, chemin, defaut, min, max) {
          var x = nombre(o[cle], chemin, defaut);
          if (x < min || (max !== undefined && x > max)) {
            throw invalide(chemin, max !== undefined ? 'valeur entre ' + min + ' et ' + max + ' attendue' : 'valeur supérieure ou égale à ' + min + ' attendue');
          }
          return x;
        }
        function sousObjet(cle) { return v[cle] === undefined || v[cle] === null ? {} : objet(v[cle], ch + '.' + cle); }
        var r = { type: type, code: CODES.interaction[type], rayon: entre(v, 'rayon', ch + '.rayon', RAYON_INTERACTION, RAYON_MIN, RAYON_MAX), avec: [] };
        if (v.avec !== undefined && v.avec !== null) {
          if (!Array.isArray(v.avec)) throw invalide(ch + '.avec', 'liste de noms d\'émetteurs attendue');
          if (v.avec.length > GROUPE_MAX - 1) throw invalide(ch + '.avec', (GROUPE_MAX - 1) + ' émetteurs au plus');
          r.avec = v.avec.map(function (nom, k) {
            if (typeof nom !== 'string') throw invalide(ch + '.avec[' + k + ']', 'nom d\'émetteur attendu');
            return nom;
          });
        }
        if (type === 'essaim') {
          var vision = sousObjet('vision');
          var vitesse = intervalle(v.vitesse, ch + '.vitesse', [5, 20]);
          if (vitesse[0] < 0 || vitesse[1] <= 0) throw invalide(ch + '.vitesse', 'vitesses positives attendues (minimum ≥ 0, maximum > 0)');
          var cible = null;
          if (v.cible === 'ancre') cible = [0.5, 0.5];
          else if (v.cible !== undefined && v.cible !== null) cible = paire(v.cible, ch + '.cible', [0.5, 0.5]);
          r.separation = entre(v, 'separation', ch + '.separation', 1.5, 0, 5);
          r.alignement = entre(v, 'alignement', ch + '.alignement', 1, 0, 5);
          r.cohesion = entre(v, 'cohesion', ch + '.cohesion', 1, 0, 5);
          r.vision = {
            rayon: entre(vision, 'rayon', ch + '.vision.rayon', 6, RAYON_MIN, 40),
            angle: rad(entre(vision, 'angle', ch + '.vision.angle', 270, 10, 360)),
          };
          r.vitesse = vitesse;
          r.cible = cible;
          r.fuite = entre(v, 'fuite', ch + '.fuite', 30, 0);
          r.cote = Math.max(r.rayon, r.vision.rayon);
        } else if (type === 'fluide') {
          r.densite = entre(v, 'densite', ch + '.densite', 6, 1, 30);
          r.viscosite = entre(v, 'viscosite', ch + '.viscosite', 0.05, 0, 1);
          r.tension = entre(v, 'tension', ch + '.tension', 0.1, 0, 1);
          r.incompressibilite = Math.round(entre(v, 'incompressibilite', ch + '.incompressibilite', 4, 2, 6));
          // Densité au repos visée par le solveur : somme du noyau (1 − q²)³ sur « densite » particules par cellule h × h.
          r.rho0 = arrondi(r.densite * Math.PI / 4);
          r.cote = r.rayon;
        } else {
          var fr = sousObjet('frottement');
          r.frottement = {
            statique: entre(fr, 'statique', ch + '.frottement.statique', 0.6, 0, 1.5),
            dynamique: entre(fr, 'dynamique', ch + '.frottement.dynamique', 0.4, 0, 1.5),
          };
          r.cohesion = entre(v, 'cohesion', ch + '.cohesion', 0, 0, 1);
          r.restitution = entre(v, 'restitution', ch + '.restitution', 0.1, 0, 1);
          r.cote = r.rayon;
        }
        return r;
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

      /** Règles d'un émetteur à interactions (après sa compilation : fragments, collisions, taille connus). */
      function verifierInteractions(em, ch) {
        var c = ch + '.interactions';
        if (em.fragment) {
          throw invalide(c, 'un émetteur de fragments (forme « pixels », éclats, « cible ») suit sa photographie ou son trajet (voie rapide forcée pour une arrivée chorégraphiée) : retirer « interactions »');
        }
        if (em.collisions && em.collisions.reponse === 'poser') {
          throw invalide(c, 'des particules qui interagissent ne se posent pas sur les obstacles : « collisions.reponse » « rebond » ou « mourir » (les grains forment eux-mêmes leur tas, sans « empiler »)');
        }
        if (em.interactions.type === 'grains' && em.taille[1] > em.interactions.rayon) {
          throw invalide(c + '.rayon', 'un grain doit tenir dans une cellule de voisinage : rayon ' + em.interactions.rayon + ' cqh sous la taille maximale ' +
            em.taille[1] + ' cqh ; augmenter « rayon » ou réduire « naissance.taille »');
        }
        // Une cellule de voisinage (côté « rayon ») tient (rayon / taille)² grains tassés ; au-delà de PLEINE_VOISINAGE
        // corps, elle est ignorée et ses grains passent les uns à travers les autres (marge de 1,2 pour un tas serré).
        if (em.interactions.type === 'grains' && Math.pow(em.interactions.rayon / Math.max(em.taille[0], 1e-6), 2) > PLEINE_VOISINAGE / 1.2) {
          throw invalide(c + '.rayon', 'rayon ' + em.interactions.rayon + ' cqh trop grand pour des grains de ' + em.taille[0] +
            ' cqh : une cellule de voisinage en tiendrait plus de ' + PLEINE_VOISINAGE + ' (au-delà, ils passent les uns à travers les autres) ; garder « rayon » sous ' +
            Math.floor(Math.sqrt(PLEINE_VOISINAGE / 1.2) * 10) / 10 + ' × la taille minimale (« rayon » proche de la taille maximale)');
        }
      }

      /** Règles de l'émetteur des perles d'une corde : posé sur ses sommets, sans mouvement propre. corde : nom de la corde. */
      function verifierPerles(e, n, ch, P, corde) {
        var de = '« ' + corde + ' »';
        if (P) throw invalideS(ch, 'les perles de ' + de + ' sont posées sur ses sommets, pas lancées par « ' + P.nom + ' »');
        if (e.structure !== undefined && e.structure !== null) throw invalideS(ch + '.structure', 'les perles de ' + de + ' ne sont pas une structure');
        ['forces', 'collisions', 'interactions', 'cible', 'a_la_mort', 'a_la_collision', 'injecte'].forEach(function (k) {
          var x = e[k];
          if (x !== undefined && x !== null && !(Array.isArray(x) && !x.length)) throw invalideS(ch + '.' + k, 'les perles suivent les sommets de ' + de + ' : retirer « ' + k + ' »');
        });
        if (estObjet(e.modules) && e.modules.force) throw invalideS(ch + '.modules.force', 'les perles suivent les sommets de ' + de + ' : pas de module de force');
        Object.keys(n).forEach(function (k) {
          if (['taille', 'z', 'rotation'].indexOf(k) < 0) {
            throw invalideS(ch + '.naissance.' + k, 'les perles de ' + de + ' naissent une fois sur ses sommets : seuls « taille », « z » et « rotation » s\'y règlent');
          }
        });
        var r = estObjet(e.rendu) ? e.rendu.type : undefined;
        if (r === 'trainee' || r === 'eclats' || r === 'fluide') throw invalideS(ch + '.rendu.type', 'les perles se dessinent en points (sprite, étincelle, planche) : pas « ' + r + ' »');
      }

      /** Groupes de voisinage : composantes connexes des liens « avec » (un lien dans un seul sens suffit), membres dans
       *  l'ordre de la recette, même type, GROUPE_MAX au plus ; pose em.interactions.groupe. */
      function grouperInteractions(emetteurs) {
        var racineDe = emetteurs.map(function (e, i) { return i; });
        function trouver(i) { while (racineDe[i] !== i) i = racineDe[i]; return i; }
        var noms = emetteurs.map(function (x) { return x.nom; }).join(', ');
        var liensStructures = [];
        emetteurs.forEach(function (em, i) {
          if (!em.interactions) return;
          em.interactions.avec.forEach(function (nom, k) {
            var c = 'emetteurs[' + em.nom + '].interactions.avec[' + k + ']';
            var j = parNom[nom];
            if (j === undefined) throw invalide(c, '« ' + nom + ' » n\'est pas un émetteur de cet effet (émetteurs : ' + noms + ')');
            if (j === i) throw invalide(c, 'un émetteur interagit déjà avec lui-même : retirer « ' + nom + ' »');
            var autre = emetteurs[j];
            // Corde ou tissu (P5b) : ses sommets rejoignent le groupe (corps que les particules repoussent et qui les retiennent).
            if (autre.structure) { liensStructures.push({ i: i, j: j, chemin: c }); return; }
            if (!autre.interactions) throw invalide(c, '« ' + nom + ' » n\'a pas de bloc « interactions » : lui en donner un du même type (« ' + em.interactions.type + ' »)');
            if (autre.interactions.type !== em.interactions.type) {
              throw invalide(c, '« ' + nom + ' » est de type « ' + autre.interactions.type + ' », « ' + em.interactions.type + ' » attendu (un groupe lié a un seul type)');
            }
            var a = trouver(i);
            var b = trouver(j);
            if (a !== b) racineDe[Math.max(a, b)] = Math.min(a, b);
          });
        });
        var parRacine = {};
        var groupes = [];
        emetteurs.forEach(function (em, i) {
          if (!em.interactions) return;
          var r = trouver(i);
          if (parRacine[r] === undefined) {
            parRacine[r] = groupes.length;
            groupes.push({ type: em.interactions.type, code: em.interactions.code, membres: [], cote: 0 });
          }
          var g = groupes[parRacine[r]];
          g.membres.push(i);
          g.cote = Math.max(g.cote, em.interactions.cote);
          em.interactions.groupe = parRacine[r];
        });
        groupes.forEach(function (g) {
          if (g.membres.length > GROUPE_MAX) {
            var premier = emetteurs[g.membres[0]].nom;
            throw invalide('emetteurs[' + premier + '].interactions.avec', GROUPE_MAX + ' émetteurs liés au plus (le groupe de « ' + premier + ' » en compte ' + g.membres.length + ')');
          }
        });
        // Structures liées : un seul groupe chacune, épaisseur dans la cellule de voisinage, 8 corps liés au plus en tout.
        liensStructures.forEach(function (l) {
          var g = groupes[emetteurs[l.i].interactions.groupe];
          var st = emetteurs[l.j];
          if (groupes.some(function (x) { return x !== g && x.structures && x.structures.indexOf(l.j) >= 0; })) {
            throw invalide(l.chemin, 'la structure « ' + st.nom + ' » est déjà liée à un autre groupe d\'interactions');
          }
          if (st.structure.epaisseur > g.cote) {
            throw invalide(l.chemin, 'épaisseur ' + st.structure.epaisseur + ' cqh de « ' + st.nom + ' » au-delà de la cellule de voisinage (' + g.cote + ' cqh) : augmenter « rayon » ou réduire « epaisseur »');
          }
          if (!g.structures) g.structures = [];
          if (g.structures.indexOf(l.j) < 0) g.structures.push(l.j);
        });
        groupes.forEach(function (g) {
          if (!g.structures) return;
          g.structures.sort(function (a, b) { return a - b; });
          if (g.membres.length + g.structures.length > GROUPE_MAX) {
            var premier = emetteurs[g.membres[0]].nom;
            throw invalide('emetteurs[' + premier + '].interactions.avec', GROUPE_MAX + ' émetteurs liés au plus, structures comprises (le groupe de « ' + premier + ' » en compte ' + (g.membres.length + g.structures.length) + ')');
          }
        });
        return groupes;
      }

      /** Réglages du calque (bloom, seuil, tons). */
      function compilerCalque(v) {
        var rc = objet(v, 'rendu_calque');
        return {
          bloom: nombre(rc.bloom, 'rendu_calque.bloom', 0.6),
          seuil_bloom: nombre(rc.seuil_bloom, 'rendu_calque.seuil_bloom', 1),
          tons: choix(rc.tons, { douce: 1, aces: 1, neutre: 1 }, 'rendu_calque.tons', 'douce'),
        };
      }

      /** Bloc « milieu » (P5c) : grille, réglages du solveur, sources (forme de P1), rendu. -> contrat effet.milieu */
      function compilerMilieu(v, ch) {
        v = objet(v, ch);
        function entre(o, cle, chemin, defaut, min, max) {
          var x = nombre(o[cle], chemin, defaut);
          if (x < min || x > max) throw invalide(chemin, 'valeur entre ' + min + ' et ' + max + ' attendue');
          return x;
        }
        var resolution = Math.round(nombre(v.resolution, ch + '.resolution', 192));
        if (resolution < RESOLUTION_MILIEU[0] || resolution > RESOLUTION_MILIEU[1]) {
          throw invalide(ch + '.resolution', 'cellules sur le grand côté entre ' + RESOLUTION_MILIEU[0] + ' et ' + RESOLUTION_MILIEU[1] +
            ' attendues (192 : une fumée nette ; au-delà de ' + RESOLUTION_MILIEU_ALERTE + ', l\'aperçu saccade)');
        }
        var bords = choix(v.bords, { ouverts: 1, fermes: 1 }, ch + '.bords', 'ouverts');
        var lesSources = v.sources === undefined || v.sources === null ? [] : v.sources;
        if (!Array.isArray(lesSources)) throw invalide(ch + '.sources', 'liste attendue');
        if (lesSources.length > SOURCES_MILIEU_MAX) throw invalide(ch + '.sources', SOURCES_MILIEU_MAX + ' sources au plus');
        var sources = lesSources.map(function (s, k) {
          var c = ch + '.sources[' + k + ']';
          s = objet(s, c);
          var type = choix(s.type, CODES.sourceMilieu, c + '.type');
          var forme = compilerForme(s.forme, c + '.forme');
          if (forme.type === 'pixels') {
            throw invalide(c + '.forme.type', 'une source se pose sur une forme (point, cercle, anneau, rectangle, ligne, ancre), pas sur les pixels d\'un élément');
          }
          var debit = nombre(s.debit, c + '.debit', 1);
          if (debit < 0) throw invalide(c + '.debit', 'valeur positive ou nulle attendue');
          var temperature = entre(s, 'temperature', c + '.temperature', 0, 0, 5);
          var teinte = s.couleur === undefined || s.couleur === null ? null : couleur(s.couleur, c + '.couleur');
          if (type === 'encre' && !teinte) throw invalide(c + '.couleur', 'une source d\'encre a une couleur (#rrggbb, ou primaire, accent, texte, fond)');
          return {
            type: type, code: CODES.sourceMilieu[type], forme: forme, debit: debit, temperature: temperature,
            encre: type === 'encre' ? absorbanceEncre(teinte) : [0, 0, 0],
          };
        });
        var chr = ch + '.rendu';
        var r = v.rendu === undefined || v.rendu === null ? {} : objet(v.rendu, chr);
        var typeRendu = choix(r.type, CODES.renduMilieu, chr + '.type', 'fumee');
        if (r.corps_noir !== undefined && typeof r.corps_noir !== 'boolean') throw invalide(chr + '.corps_noir', 'true ou false attendu');
        var lu = paire(r.lumiere, chr + '.lumiere', [-0.4, -1]);
        var ll = Math.sqrt(lu[0] * lu[0] + lu[1] * lu[1]);
        if (ll === 0) throw invalide(chr + '.lumiere', 'direction nulle');
        var teinteRendu = couleur(r.couleur === undefined ? '#8a8f99' : r.couleur, chr + '.couleur');
        var intensite = entre(r, 'intensite', chr + '.intensite', 3, 0, 20);
        var corpsNoirActif = r.corps_noir !== false;
        return {
          resolution: resolution,
          flottaison: entre(v, 'flottaison', ch + '.flottaison', 1, -5, 5),
          refroidissement: entre(v, 'refroidissement', ch + '.refroidissement', 0.6, 0, 10),
          dissipation: entre(v, 'dissipation', ch + '.dissipation', 0.3, 0, 10),
          vorticite: entre(v, 'vorticite', ch + '.vorticite', 0.4, 0, 2),
          viscosite: entre(v, 'viscosite', ch + '.viscosite', 0, 0, 1),
          bords: bords,
          bordsCode: bords === 'fermes' ? 1 : 0,
          sources: sources,
          rendu: {
            type: typeRendu, code: CODES.renduMilieu[typeRendu], couleur: teinteRendu, corpsNoir: corpsNoirActif,
            opacite: entre(r, 'opacite', chr + '.opacite', 0.8, 0, 1), intensite: intensite,
            lumiere: [arrondi(lu[0] / ll), arrondi(lu[1] / ll)],
            feu: tableFeu(corpsNoirActif ? null : teinteRendu, intensite),
          },
        };
      }

      // Structures (P5b) : ids des éléments visés par les attaches « #id » (élément k ≥ 1 = elementsEffet[k − 1]).
      var elementsEffet = [];

      // Émetteurs : noms, liens parent → enfant, profondeur.
      // Milieu (P5c) : recette d'un milieu fluide (balise data-milieu), sans émetteurs.
      if (recette.milieu !== undefined && recette.milieu !== null) {
        if (recette.emetteurs !== undefined && recette.emetteurs !== null) {
          throw invalide('milieu', 'une recette de milieu n\'a pas d\'« emetteurs » : le milieu se pose avec data-milieu, les effets qui s\'y couplent sont des recettes à part (force « milieu », « injecte », « structure.milieu »)');
        }
        return {
          ok: true,
          erreurs: [],
          effet: {
            version: 1,
            nom: nomEffet,
            graine: (o.graine >>> 0),
            duree: dur,
            reglages: { nombres: Object.assign({}, vp.nombres), couleurs: Object.assign({}, vp.couleurs) },
            rendu_calque: compilerCalque(recette.rendu_calque),
            capacite: 0,
            fin: dur,
            emetteurs: [],
            groupes: [],
            elements: [],
            couplage: { vent: false, injecte: false },
            milieu: compilerMilieu(recette.milieu, 'milieu'),
          },
        };
      }

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
      // Perles (P5b) : émetteur porté par une seule corde (règles complètes dans compilerStructure et verifierPerles).
      var perlesDe = liste.map(function () { return -1; });
      liste.forEach(function (e, i) {
        var pl = estObjet(e.structure) && estObjet(e.structure.perles) ? e.structure.perles : null;
        if (!pl || typeof pl.emetteur !== 'string' || parNom[pl.emetteur] === undefined || parNom[pl.emetteur] === i) return;
        var j = parNom[pl.emetteur];
        if (perlesDe[j] >= 0) throw invalideS('emetteurs[' + e.nom + '].structure.perles.emetteur', '« ' + pl.emetteur + ' » porte déjà les perles de « ' + liste[perlesDe[j]].nom + ' »');
        perlesDe[j] = i;
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

      /** Modules WGSL d'un émetteur : noms de shaders (le code est attaché après la compilation, M.codeShader.attacherModules). */
      function compilerModules(m, chemin) {
        var o = objet(m, chemin);
        var r = { force: null, couleur: null, forme: null };
        ['force', 'couleur', 'forme'].forEach(function (k) {
          if (o[k] === undefined || o[k] === null) return;
          if (typeof o[k] !== 'string' || !/^[a-z0-9-]+$/.test(o[k])) throw invalide(chemin + '.' + k, 'nom de shader attendu (minuscules, chiffres, tirets)');
          r[k] = o[k];
        });
        return r;
      }

      /** Sommets désignés par « ou » : place (debut, fin d'une corde ; haut, bas, gauche, droite, coins d'un tissu), indice,
       *  liste d'indices, ou texte « 0, 12 ». */
      function selectionner(ou, type, C, R, chemin) {
        var n = C * R;
        var indices = null;
        var x;
        if (typeof ou === 'string' && PLACES[type].indexOf(ou) >= 0) {
          indices = [];
          if (ou === 'debut') indices = [0];
          else if (ou === 'fin') indices = [C - 1];
          else if (ou === 'haut') for (x = 0; x < C; x++) indices.push(x);
          else if (ou === 'bas') for (x = 0; x < C; x++) indices.push((R - 1) * C + x);
          else if (ou === 'gauche') for (x = 0; x < R; x++) indices.push(x * C);
          else if (ou === 'droite') for (x = 0; x < R; x++) indices.push(x * C + C - 1);
          else indices = [0, C - 1, (R - 1) * C, R * C - 1];
          return indices;
        }
        if (typeof ou === 'number') indices = [ou];
        else if (Array.isArray(ou)) indices = ou.slice();
        else if (typeof ou === 'string' && /^\s*\d+(\s*,\s*\d+)*\s*$/.test(ou)) indices = ou.split(',').map(Number);
        if (!indices || !indices.length) {
          throw invalide(chemin, '« ' + (typeof ou === 'string' ? ou : JSON.stringify(ou)) + ' » inconnu : ' + PLACES[type].join(', ') + ' (' + type + '), ou indices de sommets (« 0, 12 »)');
        }
        indices.forEach(function (v) {
          if (typeof v !== 'number' || v !== Math.floor(v) || v < 0 || v >= n) throw invalide(chemin, 'indice de sommet ' + v + ' hors de [0, ' + (n - 1) + ']');
        });
        return indices;
      }

      /** Dégradé (couleurs linéaires) en table de 64 RVBA : lissé, ou en bandes nettes (entrée i : couleur ⌊i × n / 64⌋) ;
       *  une seule couleur : aplat. */
      function tableDegrade(cs, bandes) {
        var t = [];
        for (var i = 0; i < TAILLE_TABLE; i++) {
          var c;
          if (cs.length === 1) c = cs[0];
          else if (bandes) c = cs[Math.min(cs.length - 1, Math.floor(i * cs.length / TAILLE_TABLE))];
          else {
            var u = i / (TAILLE_TABLE - 1) * (cs.length - 1);
            var k = Math.min(Math.floor(u), cs.length - 2);
            var r = u - k;
            c = cs[k].map(function (x, j) { return x + (cs[k + 1][j] - x) * r; });
          }
          for (var j = 0; j < 4; j++) t.push(arrondi(c[j]));
        }
        return t;
      }

      /** Bloc « structure » (P5b) : corde (resolution : sommets) ou tissu ([colonnes, lignes]) ; attaches (sommets tenus, élément
       *  ou point visé, lâcher) ; réglages XPBD ; déchirure ; perles (corde) ; apparence. i : rang de l'émetteur.
       *  -> { structure (contrat em.structure), degrade (couleurs linéaires | null), image (chemin | null) } */
      function compilerStructure(v, ch, i) {
        v = objet(v, ch);
        var type = choix(v.type, CODES.structure, ch + '.type');
        var C;
        var R;
        if (type === 'corde') {
          if (Array.isArray(v.resolution)) throw invalide(ch + '.resolution', 'nombre de sommets attendu pour une corde (entre ' + RESOLUTION_CORDE[0] + ' et ' + RESOLUTION_CORDE[1] + ')');
          C = Math.round(nombre(v.resolution, ch + '.resolution', 32));
          if (C < RESOLUTION_CORDE[0] || C > RESOLUTION_CORDE[1]) throw invalide(ch + '.resolution', 'entre ' + RESOLUTION_CORDE[0] + ' et ' + RESOLUTION_CORDE[1] + ' sommets');
          R = 1;
        } else {
          if (v.resolution !== undefined && v.resolution !== null && !Array.isArray(v.resolution)) throw invalide(ch + '.resolution', '[colonnes, lignes] attendu pour un tissu');
          var cr = paire(v.resolution, ch + '.resolution', [24, 16]).map(Math.round);
          if (cr.some(function (x) { return x < RESOLUTION_TISSU[0] || x > RESOLUTION_TISSU[1]; })) {
            throw invalide(ch + '.resolution', 'colonnes et lignes entre ' + RESOLUTION_TISSU[0] + ' et ' + RESOLUTION_TISSU[1]);
          }
          C = cr[0];
          R = cr[1];
        }
        function entre(cle, defaut, min, max) {
          var x = nombre(v[cle], ch + '.' + cle, defaut);
          if (x < min || x > max) throw invalide(ch + '.' + cle, 'valeur entre ' + min + ' et ' + max + ' attendue');
          return x;
        }
        // Fente (tissu) : couture coupée entre les colonnes fente − 1 et fente, sur toute la hauteur (rideau en deux pans).
        var fente = null;
        if (v.fente !== undefined && v.fente !== null) {
          if (type !== 'tissu') throw invalide(ch + '.fente', 'fente : tissu seulement (couture coupée entre deux colonnes)');
          fente = nombre(v.fente, ch + '.fente');
          if (fente !== Math.floor(fente) || fente < 1 || fente > C - 1) throw invalide(ch + '.fente', 'indice de colonne entier entre 1 et ' + (C - 1) + ' attendu (couture coupée avant cette colonne)');
        }
        var dechirure = null;
        if (v.dechirure !== undefined && v.dechirure !== null) {
          dechirure = nombre(v.dechirure, ch + '.dechirure');
          if (dechirure < DECHIRURE_MIN) throw invalide(ch + '.dechirure', 'rapport d\'étirement d\'au moins ' + DECHIRURE_MIN + ' attendu (1,6 : un lien rompt à 160 % de sa longueur ; absent : indéchirable)');
        }

        // Attaches.
        var lesAttaches = v.attaches === undefined || v.attaches === null ? [] : v.attaches;
        if (!Array.isArray(lesAttaches)) throw invalide(ch + '.attaches', 'liste attendue');
        if (lesAttaches.length > ATTACHES_MAX) throw invalide(ch + '.attaches', ATTACHES_MAX + ' attaches au plus');
        var attaches = lesAttaches.map(function (a, k) {
          var c = ch + '.attaches[' + k + ']';
          a = objet(a, c);
          if (a.ou === undefined || a.ou === null) throw invalide(c + '.ou', 'valeur obligatoire (' + PLACES[type].join(', ') + ', ou indices de sommets)');
          var sommets = selectionner(a.ou, type, C, R, c + '.ou');
          var but = a.a === undefined || a.a === null ? 'ancre' : a.a;
          var cible;
          if (but === 'ancre') cible = { genre: 'element', element: 0 };
          else if (typeof but === 'string' && /^#[A-Za-z0-9_-]+$/.test(but)) {
            var id = but.slice(1);
            var e = elementsEffet.indexOf(id);
            if (e < 0) {
              if (elementsEffet.length >= ELEMENTS_MAX - 1) throw invalide(c + '.a', (ELEMENTS_MAX - 1) + ' éléments « #id » au plus par effet (avec l\'ancre)');
              elementsEffet.push(id);
              e = elementsEffet.length - 1;
            }
            cible = { genre: 'element', element: e + 1 };
          } else if (Array.isArray(but)) {
            if (sommets.length !== 1) throw invalide(c + '.a', 'un point de la zone tient un seul sommet (« debut », « fin » ou un indice) : viser « ancre » ou « #id » pour tenir un bord');
            cible = { genre: 'point', point: paire(but, c + '.a') };
          } else throw invalide(c + '.a', '« ancre », « #id » ou point [x, y] de la zone attendu');
          var lacher = null;
          if (a.lacher !== undefined && a.lacher !== null) {
            lacher = nombre(a.lacher, c + '.lacher');
            if (lacher < 0) throw invalide(c + '.lacher', 'secondes de τ positives ou nulles attendues');
          }
          // Glissement : les points tenus s'écartent de leur place de « vers » (fraction de l'élément visé, ou de la zone pour
          // un point), en douceur, de τ = 0 à τ = duree (rideau ouvert par ses attaches).
          var glisse = null;
          if (a.glisse !== undefined && a.glisse !== null) {
            var g = objet(a.glisse, c + '.glisse');
            if (g.vers === undefined || g.vers === null) throw invalide(c + '.glisse.vers', 'décalage [x, y] obligatoire (fraction de l\'élément ou de la zone)');
            var duree = nombre(g.duree, c + '.glisse.duree', 1);
            if (duree < 0.05) throw invalide(c + '.glisse.duree', 'au moins 0,05 s attendu');
            glisse = { vers: paire(g.vers, c + '.glisse.vers'), duree: duree };
          }
          return { sommets: sommets, cible: cible, lacher: lacher, glisse: glisse };
        });

        // Apparence.
        var cha = ch + '.apparence';
        var ap = v.apparence === undefined || v.apparence === null ? {} : objet(v.apparence, cha);
        var textures = ['degrade', 'image', 'source'].filter(function (k) { return ap[k] !== undefined && ap[k] !== null; });
        if (textures.length > 1) throw invalide(cha, 'une seule texture : « degrade », « image » ou « source » (ici ' + textures.join(', ') + ')');
        var degrade = null;
        if (ap.degrade !== undefined && ap.degrade !== null) {
          if (!Array.isArray(ap.degrade) || !ap.degrade.length) throw invalide(cha + '.degrade', 'liste non vide de couleurs attendue');
          degrade = ap.degrade.map(function (x, k) { return couleur(x, cha + '.degrade[' + k + ']'); });
        }
        var image = null;
        if (ap.image !== undefined && ap.image !== null) {
          if (typeof ap.image !== 'string' || !/^assets\/.+\.(png|webp|jpe?g|svg)$/i.test(ap.image)) throw invalide(cha + '.image', 'image de assets/ (PNG, WebP, JPEG ou SVG) attendue');
          image = ap.image;
        }
        var source = ap.source === undefined || ap.source === null ? null : choix(ap.source, { ancre: 1 }, cha + '.source');
        ['bandes', 'mailles'].forEach(function (k) {
          if (ap[k] !== undefined && typeof ap[k] !== 'boolean') throw invalide(cha + '.' + k, 'true ou false attendu');
        });
        if (ap.mailles === true && type === 'corde') throw invalide(cha + '.mailles', 'mailles : tissu seulement (filet)');
        var lu = paire(ap.lumiere, cha + '.lumiere', [-0.4, -1]);
        var ll = Math.sqrt(lu[0] * lu[0] + lu[1] * lu[1]);
        if (ll === 0) throw invalide(cha + '.lumiere', 'direction nulle');
        var apparence = {
          couleur: couleur(ap.couleur === undefined ? '#ffffff' : ap.couleur, cha + '.couleur'),
          mode: textures.length ? textures[0] : 'couleur',
          sens: choix(ap.sens, { horizontal: 1, vertical: 1 }, cha + '.sens', 'horizontal'),
          bandes: ap.bandes === true,
          mailles: ap.mailles === true,
          source: source,
          lumiere: [arrondi(lu[0] / ll), arrondi(lu[1] / ll)],
        };

        // Prise au vent du milieu (P5c) : poussée selon la surface exposée (force « milieu » ajoutée par compilerEmetteur).
        var milieu = null;
        if (v.milieu !== undefined && v.milieu !== null) {
          var mi = objet(v.milieu, ch + '.milieu');
          var coef = nombre(mi.coef, ch + '.milieu.coef', 1);
          if (coef < 0) throw invalide(ch + '.milieu.coef', 'valeur positive ou nulle attendue');
          milieu = { coef: coef };
        }

        // Perles (tâche 3 : émetteur des perles).
        var perles = null;
        if (v.perles !== undefined && v.perles !== null) {
          if (type !== 'corde') throw invalide(ch + '.perles', 'des perles se posent sur une corde');
          var pl = objet(v.perles, ch + '.perles');
          var tous = Math.round(nombre(pl.tous, ch + '.perles.tous', 4));
          if (tous < 2 || tous > 64) throw invalide(ch + '.perles.tous', 'entre 2 et 64 sommets');
          if (typeof pl.emetteur !== 'string') throw invalide(ch + '.perles.emetteur', 'nom d\'émetteur attendu');
          var j = parNom[pl.emetteur];
          if (j === undefined) {
            throw invalide(ch + '.perles.emetteur', '« ' + pl.emetteur + ' » n\'est pas un émetteur de cet effet (émetteurs : ' + liste.map(function (x) { return x.nom; }).join(', ') + ')');
          }
          if (j === i) throw invalide(ch + '.perles.emetteur', 'une corde ne porte pas ses propres perles : un autre émetteur de la recette');
          var debut = Math.min(Math.floor(tous / 2), C - 1);
          perles = { emetteur: j, tous: tous, debut: debut, nombre: Math.floor((C - 1 - debut) / tous) + 1 };
        }

        return {
          structure: {
            type: type, code: CODES.structure[type], colonnes: C, lignes: R, nSommets: C * R, attaches: attaches,
            raideur: entre('raideur', 0.9, 0, 1), flexion: entre('flexion', 0.1, 0, 1), amortissement: entre('amortissement', 0.02, 0, 1),
            dechirure: dechirure, fente: fente, epaisseur: entre('epaisseur', 0.4, 0.05, 10), perles: perles, apparence: apparence, milieu: milieu,
          },
          degrade: degrade,
          image: image,
        };
      }

      /** Règles d'un émetteur de structure : posé par la scène, sans naissance en flux ni rendu de particules. */
      function verifierStructure(e, n, ch, P) {
        if (P) throw invalideS(ch, 'une structure est posée par la scène, pas lancée par « ' + P.nom + ' »');
        var interdits = {
          a_la_mort: 'elle ne meurt pas', a_la_collision: 'elle ne lance rien au contact', cible: 'elle ne vise pas d\'élément d\'arrivée',
          interactions: 'une structure rejoint un groupe d\'interactions par le « avec » de ses particules',
          vie: 'elle se dessine selon son « apparence »', rendu: 'elle se dessine selon son type (maillage d\'un tissu, ruban d\'une corde) et son « apparence »',
          modules: 'pas de module WGSL sur une structure',
          injecte: 'une structure ne dépose rien dans le milieu (elle en prend le vent par « milieu »)',
        };
        Object.keys(interdits).forEach(function (k) {
          if (e[k] !== undefined && e[k] !== null) throw invalideS(ch + '.' + k, 'une structure ne prend pas « ' + k + ' » : ' + interdits[k]);
        });
        Object.keys(n).forEach(function (k) {
          if (k !== 'masse' && k !== 'z') throw invalideS(ch + '.naissance.' + k, 'une structure existe pendant toute la fenêtre de l\'effet : seuls « masse » et « z » s\'y règlent');
        });
        if (estObjet(e.collisions) && e.collisions.reponse !== undefined && e.collisions.reponse !== 'rebond') {
          throw invalideS(ch + '.collisions.reponse', 'une structure ne se pose ni ne meurt sur un obstacle : seulement « rebond »');
        }
      }


      function compilerEmetteur(e, i, P) {
        var ch = 'emetteurs[' + e.nom + ']';
        var n = objet(e.naissance, ch + '.naissance');
        // Structure (P5b) : règles de l'émetteur, puis le bloc ; présente pendant toute la fenêtre de l'effet.
        var estStructure = e.structure !== undefined && e.structure !== null;
        if (estStructure) verifierStructure(e, n, ch, P);
        var cs = estStructure ? compilerStructure(e.structure, ch + '.structure', i) : null;
        // Perles d'une corde : présentes pendant toute la fenêtre de l'effet, nombre fixé par la corde (après la compilation).
        var estPerle = perlesDe[i] >= 0;
        if (estPerle) verifierPerles(e, n, ch, P, liste[perlesDe[i]].nom);
        var cible = compilerCible(e.cible, ch + '.cible');
        var vie = estStructure || estPerle ? [dur, dur] : intervalle(n.vie, ch + '.naissance.vie', [1, 1]);
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
          fluide: compilerFluide(e.rendu, ch + '.rendu'),
          cible: cible,
          modules: compilerModules(e.modules, ch + '.modules'),
          interactions: compilerInteractions(e.interactions, ch + '.interactions'),
          structure: cs ? cs.structure : null,
          injecte: compilerInjecte(e.injecte, ch + '.injecte'),
          perlesDe: -1,
        };
        em.fragment = !!(em.pixels || em.eclats || em.cible);
        if (em.fragment) verifierFragment(n, em, ch, P);
        else if (em.tables.source.some(function (x) { return x > 0; })) {
          throw invalide(ch + '.vie.couleur', '« source » est la couleur des pixels d\'un élément photographié : seulement avec la forme « pixels » ou une « cible »');
        }
        if (em.fluide && em.fragment) throw invalide(ch + '.rendu.type', 'un émetteur de fragments se dessine en grains ou en éclats : pas de rendu « fluide »');
        if (em.interactions) verifierInteractions(em, ch);
        // Milieu (P5c) : une corde ou un tissu prend le vent du milieu par « structure.milieu » (force de la structure, pondérée
        // sur le GPU par sa surface exposée), jamais par une force « milieu ».
        if (estStructure) {
          em.forces.forEach(function (f, k) {
            if (f.type === 'milieu') throw invalideS(ch + '.forces[' + k + ']', 'une corde ou un tissu prend le vent du milieu par « structure.milieu » (poussée selon sa surface exposée), pas par une force « milieu »');
          });
          if (em.structure.milieu) {
            if (em.forces.length >= FORCES_MAX) throw invalideS(ch + '.structure.milieu', FORCES_MAX + ' forces au plus, poussée du milieu comprise');
            em.forces.push({ type: 'milieu', code: CODES.force.milieu, coef: em.structure.milieu.coef });
          }
        }
        // Structure : dégradé dans la table des couleurs, image de assets/ comme une texture de P1 (chargée à l'assemblage).
        if (cs && cs.degrade) em.tables.couleur = tableDegrade(cs.degrade, cs.structure.apparence.bandes);
        if (cs && cs.image) {
          em.rendu.texture = 'image';
          em.rendu.textureCode = CODES.texture.image;
          em.rendu.textureFichier = cs.image;
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
        } else if (estStructure || estPerle) {
          // Structure : un sommet par case, aucun né en flux (les sommets sont posés au pas 0 par la simulation).
          em.k = 0;
          em.G = 1;
          em.debit = 0;
          em.nTotal = 0;
          em.capContinu = 0;
          em.salves = [];
          em.capacite = estStructure ? cs.structure.nSommets : 1;
          em.espacement = Infinity;
          em.gigue = 0;
          em.finNaissances = 0;
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
        // Un module de force n'a pas de forme close : l'émetteur est simulé pas à pas.
        if (em.modules.force) em.voieRapide = false;
        // Interactions : l'état d'une particule dépend de ses voisines, aucune forme close.
        if (em.interactions) em.voieRapide = false;
        // Structure : sommets reliés, simulés pas à pas.
        if (estStructure || estPerle) em.voieRapide = false;
        // Milieu (P5c) : vent du milieu et dépôts se calculent pas à pas.
        if (em.injecte || em.forces.some(function (f) { return f.type === 'milieu'; })) em.voieRapide = false;
        return em;
      }

      // Un parent est compilé avant ses enfants (capacité et période).
      var ordre = liste.map(function (e, i) { return i; }).sort(function (a, b) { return profondeur[a] - profondeur[b] || a - b; });
      var emetteurs = [];
      ordre.forEach(function (i) { emetteurs[i] = compilerEmetteur(liste[i], i, parent[i] >= 0 ? emetteurs[parent[i]] : null); });
      // Perles : émetteur rattaché à sa corde, une perle tous les « tous » sommets, toutes nées à τ = 0.
      emetteurs.forEach(function (em) {
        if (!em.structure || !em.structure.perles) return;
        var p = emetteurs[em.structure.perles.emetteur];
        p.perlesDe = em.index;
        p.capacite = em.structure.perles.nombre;
        p.salves = [{ t: 0, nombre: p.capacite, debut: 0 }];
      });
      var nStructures = emetteurs.filter(function (em) { return em.structure; }).length;
      if (nStructures > STRUCTURES_EFFET_MAX) throw invalideS('emetteurs', STRUCTURES_EFFET_MAX + ' cordes et tissus au plus par effet (ici ' + nStructures + ')');

      var groupes = grouperInteractions(emetteurs);

      var effet = {
        version: 1,
        nom: nomEffet,
        graine: (o.graine >>> 0),
        duree: dur,
        // Valeurs des réglages (modules WGSL : réglages de même nom).
        reglages: { nombres: Object.assign({}, vp.nombres), couleurs: Object.assign({}, vp.couleurs) },
        rendu_calque: compilerCalque(recette.rendu_calque),
        capacite: emetteurs.reduce(function (s, e) { return s + e.capacite; }, 0),
        fin: emetteurs.reduce(function (s, e) { return Math.max(s, e.fin); }, 0),
        emetteurs: emetteurs,
        // Interactions (P5a) : groupes de voisinage ([] sans interactions).
        groupes: groupes,
        // Structures (P5b) : ids des éléments visés par les attaches « #id » ([] sans structure).
        elements: elementsEffet,
        // Milieu (P5c) : effet couplé au milieu de sa scène (vent lu, ou dépôts).
        couplage: {
          vent: emetteurs.some(function (e) { return e.forces.some(function (f) { return f.type === 'milieu'; }); }),
          injecte: emetteurs.some(function (e) { return !!e.injecte; }),
        },
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
    RAYON_INTERACTION: RAYON_INTERACTION,
    RAYON_MIN: RAYON_MIN,
    RAYON_MAX: RAYON_MAX,
    GROUPE_MAX: GROUPE_MAX,
    ITERATIONS_GRAINS: ITERATIONS_GRAINS,
    LIMITES_INTERACTIONS: LIMITES_INTERACTIONS,
    PLEINE_VOISINAGE: PLEINE_VOISINAGE,
    RESOLUTION_CORDE: RESOLUTION_CORDE,
    RESOLUTION_TISSU: RESOLUTION_TISSU,
    SOMMETS_TISSU_MAX: SOMMETS_TISSU_MAX,
    STRUCTURES_SCENE_MAX: STRUCTURES_SCENE_MAX,
    STRUCTURES_EFFET_MAX: STRUCTURES_EFFET_MAX,
    ATTACHES_MAX: ATTACHES_MAX,
    ELEMENTS_MAX: ELEMENTS_MAX,
    DECHIRURE_MIN: DECHIRURE_MIN,
    RESOLUTION_MILIEU: RESOLUTION_MILIEU,
    RESOLUTION_MILIEU_ALERTE: RESOLUTION_MILIEU_ALERTE,
    SOURCES_MILIEU_MAX: SOURCES_MILIEU_MAX,
    corpsNoir: corpsNoir,
    tableFeu: tableFeu,
    absorbanceEncre: absorbanceEncre,
    SCHEMA: SCHEMA,
    ErreurRecette: ErreurRecette,
    resoudre: resoudre,
    fusionner: fusionner,
    differences: differences,
    egal: egal,
    analyserReglages: analyserReglages,
    couleurLineaire: couleurLineaire,
    valeursParametres: valeursParametres,
    compiler: compiler,
  };
});
