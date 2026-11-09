'use strict';
/* Pulse Motion – moteur à la carte (spec Rapidité 5.19) : chaque module du moteur appartient à un seul groupe, et la page
 * n'embarque que les groupes dont la vidéo se sert. Module pur.
 *
 * MODULES : tous les modules, dans l'ordre de chargement (l'ordre relatif est gardé quand on filtre).
 * GROUPES : { nom: [modules] } ; un module ajouté sans groupe fait échouer le test moteur-chaque-module-dans-un-seul-groupe.
 * groupesDuDeroule(donnees, sections) -> [noms] : les groupes dont la page a besoin (tronc toujours, contrôle jamais :
 *   mesures.js, pixels.js et ecoute.js sont injectés par la page de mesure, lib/page-mesures.js).
 * modulesDesGroupes(groupes | 'tous') -> [modules] dans l'ordre de MODULES, absents.js en dernier.
 */

const GROUPES = {
  // tailles.js reste au tronc : la page livrée applique les tailles ajustées (M.appliquerTailles), pas seulement le contrôle.
  tronc: ['courbes.js', 'aligner.js', 'sous-titres.js', 'minutage.js', 'transitions.js', 'tween.js', 'lettres.js', 'camera.js',
    'temps.js', 'horloge.js', 'tailles.js', 'wav.js', 'sonie.js', 'mixage.js', 'audio.js', 'lecteur.js', 'sous-titres-rendu.js',
    'debordement.js', 'figer.js'],
  controle: ['mesures.js', 'pixels.js', 'ecoute.js'],
  'son-reactif': ['analyse-son.js', 'son-reactif.js'],
  synthe: ['synthe/catalogue.js', 'synthe/partition.js', 'synthe/ambiances.js', 'synthe/instruments.js', 'synthe/bruitages.js'],
  personnages: ['squelette.js', 'vivant.js', 'clips.js', 'habillage-batonnets.js', 'habillage-pieces.js', 'personnages/levres.js',
    'personnages/partition.js', 'personnages/interactions.js', 'personnages/scene.js', 'personnages/objets.js'],
  gpu: ['shaders/glsl.js', 'shaders/code.js', 'particules/instantanes.js', 'particules/gpu.js', 'particules/obstacles.js',
    'particules/fragments.js', 'particules/simulation.js', 'particules/voisinage.js', 'particules/maillage.js',
    'particules/structures.js', 'particules/milieu.js', 'particules/rendu.js', 'particules/glsl.js', 'particules/shaders.js',
    'particules/composition.js', 'particules/formes.js', 'particules/reperes.js', 'particules/calques.js'],
};

// Ordre de chargement : celui de la liste historique (dépendances au chargement), puis absents.js en dernier.
const MODULES = ['courbes.js', 'aligner.js', 'sous-titres.js', 'minutage.js', 'transitions.js', 'tween.js', 'lettres.js', 'camera.js',
  'squelette.js', 'vivant.js', 'clips.js', 'habillage-batonnets.js', 'habillage-pieces.js', 'personnages/levres.js', 'personnages/partition.js',
  'personnages/interactions.js', 'personnages/scene.js', 'personnages/objets.js', 'temps.js', 'horloge.js', 'tailles.js', 'wav.js',
  'sonie.js', 'mixage.js', 'synthe/catalogue.js', 'synthe/partition.js', 'synthe/ambiances.js', 'synthe/instruments.js',
  'synthe/bruitages.js', 'analyse-son.js', 'audio.js', 'son-reactif.js', 'lecteur.js', 'sous-titres-rendu.js', 'debordement.js',
  'mesures.js', 'pixels.js', 'ecoute.js', 'figer.js', 'shaders/glsl.js', 'shaders/code.js', 'particules/instantanes.js', 'particules/gpu.js',
  'particules/obstacles.js', 'particules/fragments.js', 'particules/simulation.js', 'particules/voisinage.js',
  'particules/maillage.js', 'particules/structures.js', 'particules/milieu.js', 'particules/rendu.js', 'particules/glsl.js',
  'particules/shaders.js', 'particules/composition.js', 'particules/formes.js', 'particules/reperes.js', 'particules/calques.js'];

/** Toujours inclus, en dernier : points d'entrée des groupes absents et liste des groupes (M.groupes). */
const ABSENTS = 'absents.js';
const NOMS = Object.keys(GROUPES);

const nonVide = (x) => (Array.isArray(x) ? x.length > 0 : !!(x && typeof x === 'object' && Object.keys(x).length > 0));

/**
 * Groupes dont la page a besoin, d'après les données de la page (pm-donnees) et les sections assemblées des scènes.
 * - son réactif : des pistes du son sont lues (donnees.son) ;
 * - synthé : musique générée ou partition, bruitages des transitions, ou un data-son dans une scène (même un son importé :
 *   moteur/audio.js prépare le bruit du synthétiseur dès qu'il y a un son à jouer) ;
 * - personnages : donnees.personnages (une scène a data-personnage ou data-action) ;
 * - GPU : effet, milieu, shader (fond, transition, post-traitement), module d'effet, ou obstacle (data-obstacle : le contrôle juge
 *   ses formes exactes par M.particules.formesVides).
 */
function groupesDuDeroule(donnees, sections = []) {
  const d = donnees || {};
  const groupes = ['tronc'];
  if (d.son) groupes.push('son-reactif');
  const textes = sections.join('\n');
  const musique = d.musique && (d.musique.partition || d.musique.generee);
  if (musique || (d.bruitages && d.bruitages.transitions) || /\sdata-son\s*=/.test(textes)) groupes.push('synthe');
  if (d.personnages) groupes.push('personnages');
  const obstacles = nonVide(d.obstacles) || nonVide(d.obstaclesVideo);
  if (nonVide(d.effets) || nonVide(d.milieux) || nonVide(d.shaders) || nonVide(d.modules) || obstacles) groupes.push('gpu');
  return groupes;
}

/** Modules des groupes demandés ('tous' : le moteur entier, contrôle compris), dans l'ordre de chargement, absents.js en dernier. */
function modulesDesGroupes(groupes) {
  const voulus = groupes === 'tous' ? NOMS : groupes;
  const inclus = new Set();
  for (const g of voulus) {
    if (!GROUPES[g]) throw new Error(`groupe de modules inconnu : « ${g} » (${NOMS.join(', ')})`);
    GROUPES[g].forEach((m) => inclus.add(m));
  }
  return MODULES.filter((m) => inclus.has(m)).concat(ABSENTS);
}

module.exports = { GROUPES, MODULES, ABSENTS, NOMS, groupesDuDeroule, modulesDesGroupes };
