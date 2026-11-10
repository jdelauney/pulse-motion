'use strict';
/* Pulse Motion – nombre de navigateurs lancés en même temps (spec Rapidité 5.15, règle partagée : comparer dès 0.30.0,
 * l'export fidèle ensuite).
 *
 * navigateursParalleles({ taches, fils?, memoireLibre?, gpu?, force?, parNavigateur? }) -> { nombre, regle }
 *   nombre = min(⌊fils / 2⌋, 4, ⌊(mémoire libre − 1,5 Go) / mémoire par navigateur⌋, taches), au moins 1 ;
 *   gpu (vidéo à effets) : 2 au plus, les navigateurs se disputent la carte graphique (à 4, deux exports du témoin de
 *   3 min diffèrent encore à trois endroits en 0.36.0, après le correctif des fins de transition : plafond gardé) ;
 *   force (PM_PARALLELES, de 1 à 8) : ce nombre, sans dépasser le nombre de tâches.
 * Idées de reanimate, explainroo (min(8, cœurs / 2)) et lemo (seuil de mémoire), réécrites.
 */
const os = require('node:os');

const MEMOIRE_PAR_NAVIGATEUR = 700 * 1024 * 1024;
const RESERVE = 1.5 * 1024 * 1024 * 1024;
const PLAFOND = 4;
const PLAFOND_GPU = 2;

const filsMachine = () => (typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length);

function navigateursParalleles({ taches = 1, fils = filsMachine(), memoireLibre = os.freemem(), gpu = false, force = process.env.PM_PARALLELES, parNavigateur = MEMOIRE_PAR_NAVIGATEUR } = {}) {
  const n = Math.max(1, Math.floor(taches) || 1);
  const impose = Number.parseInt(force, 10);
  if (Number.isInteger(impose) && impose >= 1 && impose <= 8) return { nombre: Math.min(impose, n), regle: 'PM_PARALLELES' };
  const parFils = Math.floor(fils / 2);
  const parMemoire = Math.floor((memoireLibre - RESERVE) / parNavigateur);
  const limites = [['fils', parFils], ['plafond', PLAFOND], ['memoire', parMemoire], ['taches', n]];
  if (gpu) limites.push(['gpu', PLAFOND_GPU]);
  const [regle, nombre] = limites.reduce((a, b) => (b[1] < a[1] ? b : a));
  return { nombre: Math.max(1, nombre), regle };
}

/** Lance taches (fonctions -> Promise) avec au plus `limite` en même temps ; résultats dans l'ordre des tâches. */
async function enParallele(taches, limite) {
  const resultats = new Array(taches.length);
  let suivante = 0;
  const ouvrier = async () => {
    while (suivante < taches.length) {
      const i = suivante++;
      resultats[i] = await taches[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limite, taches.length)) }, ouvrier));
  return resultats;
}

module.exports = { navigateursParalleles, enParallele, MEMOIRE_PAR_NAVIGATEUR };
