#!/usr/bin/env node
'use strict';
/* Pulse Motion – avancement du travail en cours (spec Retouches et ergonomie, 5.2 point 3).
 *
 *   node scripts/avancement.js <dossier> [--suivre]
 *     sans option : une ligne de résumé (« Contrôle de la lisibilité : scène 3 sur 6, encore environ 40 s. ») ;
 *     --suivre : une ligne à chaque changement d'étape ou de palier (10 %), jusqu'à la fin du travail (2 h au plus) ; un
 *     travail fini avant le lancement est ignoré (on attend le suivant). Lu par l'outil de suivi de Claude Code (Monitor).
 * Code 0 ; avec --suivre, code 1 si le travail échoue ou si le délai passe.
 */
const path = require('node:path');
const A = require('./lib/avancement.js');

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Suit .pulse-motion/avancement.json. -> Promise<{ ok, lignes }>
 * ecrire(ligne) ; intervalle (ms, 500) ; max (s, 7 200) ; depuis (ms) : instant du lancement, un état fini plus ancien est ignoré.
 */
async function suivreAvancement({ projet, ecrire = (l) => process.stdout.write(`${l}\n`), intervalle = 500, max = 7200, depuis = Date.now(), maintenant = () => Date.now() }) {
  const lignes = [];
  let cle = null;
  const limite = maintenant() + max * 1000;
  while (maintenant() < limite) {
    const e = A.lire(projet);
    const ancien = e && e.fini && Date.parse(e.maj) < depuis - 2000;
    if (e && !ancien) {
      const palier = e.total > 0 ? Math.floor((10 * e.fait) / e.total) : 0;
      const k = `${e.travail}|${e.libelle}|${e.detail}|${palier}|${e.fini}`;
      if (k !== cle) {
        cle = k;
        const l = A.ligne(e);
        lignes.push(l);
        ecrire(l);
      }
      if (e.fini) return { ok: Boolean(e.ok), lignes };
    }
    await attendre(intervalle);
  }
  const l = 'Toujours en cours après 2 heures : je regarde où en est le travail.';
  lignes.push(l);
  ecrire(l);
  return { ok: false, lignes };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const projet = path.resolve(args.find((a) => !a.startsWith('--')) || '.');
  if (args.includes('--suivre')) {
    suivreAvancement({ projet }).then((r) => process.exit(r.ok ? 0 : 1));
  } else {
    console.log(A.ligne(A.lire(projet)));
  }
}

module.exports = { suivreAvancement };
