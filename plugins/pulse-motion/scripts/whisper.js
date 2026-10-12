#!/usr/bin/env node
'use strict';
/* Pulse Motion – transcription des voix (Whisper).
 *
 *   node scripts/whisper.js                              état : { pret, python, modele, message, commandes, commandeSysteme? }
 *   node scripts/whisper.js installer [--modele small]   installe (environ 800 Mo, ou 250 Mo avec small)
 *
 * Code 0 si prête (ou installée), 1 sinon.
 */
const { etatWhisper, installerWhisper } = require('./lib/whisper.js');

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === 'installer') {
    const i = args.indexOf('--modele');
    installerWhisper(i >= 0 && args[i + 1] ? { modele: args[i + 1] } : {}).then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.ok ? 0 : 1);
    });
  } else {
    const e = etatWhisper();
    console.log(JSON.stringify({ ...e, commandes: e.commandes.map((c) => c.join(' ')) }, null, 2));
    process.exit(e.pret ? 0 : 1);
  }
}
