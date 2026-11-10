#!/usr/bin/env node
'use strict';
/* Pulse Motion – transcription des voix (Whisper).
 *
 *   node scripts/whisper.js                              état : { pret, python, modele, message, commandes, commandeSysteme? }
 *   node scripts/whisper.js installer [--modele small]   installe (environ 800 Mo, ou 250 Mo avec small)
 *
 * Code 0 si prête (ou installée), 1 sinon.
 */
const { etatWhisper, installerWhisper, afficherCommande } = require('./lib/whisper.js');

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === 'installer') {
    const i = args.indexOf('--modele');
    // Avancement (spec Retouches et ergonomie, 5.2) : dans le dossier courant s'il contient une vidéo (l'aperçu le montre) ;
    // ailleurs, les lignes seulement (aucun dossier .pulse-motion laissé hors d'une vidéo).
    const ici = process.cwd();
    const avancement = require('./lib/avancement.js').suivre(require('node:fs').existsSync(require('node:path').join(ici, 'deroule.json')) ? ici : null, { travail: 'installation', libelle: 'Installation de la transcription' });
    const surEtape = (k, n, nom) => avancement(k, n, `${nom} (étape ${k + 1} sur ${n})`);
    installerWhisper({ ...(i >= 0 && args[i + 1] ? { modele: args[i + 1] } : {}), surEtape }).catch((e) => ({ ok: false, message: `L'installation de la transcription a échoué (${e.message}).` })).then((r) => {
      avancement.terminer(r.ok, r.ok ? undefined : r.message);
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.ok ? 0 : 1);
    });
  } else {
    const e = etatWhisper();
    console.log(JSON.stringify({ ...e, commandes: e.commandes.map(afficherCommande) }, null, 2));
    process.exit(e.pret ? 0 : 1);
  }
}
