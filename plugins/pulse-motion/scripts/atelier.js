#!/usr/bin/env node
'use strict';
/* Pulse Motion – atelier des effets de particules : ouvre la page d'atelier de l'aperçu.
 *
 *   node scripts/atelier.js [<recette>] [--dossier <dossier>] [--port 4321]
 *
 * Depuis le dossier d'une vidéo : l'aperçu du projet (rouvert s'il tourne déjà) sur /_pm/atelier?recette=<nom> ;
 * « Enregistrer » y écrit effets/<nom>.json. Hors d'un projet : aperçu sur un dossier temporaire vide ; la page joue
 * les recettes de la bibliothèque et dit de lancer l'atelier depuis le dossier d'une vidéo pour enregistrer.
 * Le processus reste ouvert tant qu'il sert l'aperçu qu'il a démarré.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lancerApercu, ouvrirNavigateur } = require('./apercu.js');

const NOM = /^[a-z0-9-]+$/;
const USAGE = 'Usage : pulse-motion atelier [<recette>] [--dossier <dossier>] [--port 4321]';

/** -> Promise<{ url, deja, projet }> ; recette : nom d'effet (bibliothèque ou projet), ou null (recette vide). */
async function lancerAtelier({ dossier = '.', recette = null, port = 4321, lancer = lancerApercu, ouvrirUrl = ouvrirNavigateur } = {}) {
  if (recette !== null && !NOM.test(recette)) throw new Error(`Nom d'effet « ${recette} » invalide (minuscules, chiffres, tirets ; exemple : etincelles).`);
  const projet = fs.existsSync(path.join(dossier, 'deroule.json'));
  const cible = projet ? dossier : fs.mkdtempSync(path.join(os.tmpdir(), 'pm-atelier-'));
  const { url, deja } = await lancer({ dossier: cible, port, ouvrir: false });
  const adresse = `${url}_pm/atelier${recette ? `?recette=${encodeURIComponent(recette)}` : ''}`;
  ouvrirUrl(adresse);
  return { url: adresse, deja, projet };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const valeur = (nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : undefined; };
  const libres = args.filter((a, i) => !a.startsWith('--') && !['--dossier', '--port'].includes(args[i - 1]));
  const port = valeur('--port') === undefined ? 4321 : parseInt(valeur('--port'), 10);
  if (libres.length > 1 || !Number.isInteger(port) || (libres[0] !== undefined && !NOM.test(libres[0]))) {
    console.error(USAGE);
    process.exit(2);
  }
  lancerAtelier({ dossier: valeur('--dossier') || '.', recette: libres[0] || null, port }).then(({ url, deja, projet }) => {
    console.log(`Atelier : ${url}`);
    if (!projet) console.log('Aucune vidéo dans ce dossier : les effets se règlent, mais pour les enregistrer, lancez l\'atelier depuis le dossier d\'une vidéo.');
    // Aperçu déjà actif : ce processus n'a rien à servir.
    if (deja) process.exit(0);
  }, (e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { lancerAtelier };
