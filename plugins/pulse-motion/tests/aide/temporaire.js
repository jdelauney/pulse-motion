'use strict';
/* Dossiers temporaires des tests : créés dans le dossier temporaire du système, supprimés à la fin du processus. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const crees = [];
process.on('exit', () => {
  for (const d of crees) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* fichier encore ouvert : laissé au système */ } }
});

/** -> chemin d'un nouveau dossier vide « <prefixe>XXXXXX », supprimé à la sortie. */
function dossierTemporaire(prefixe = 'pm-') {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefixe));
  crees.push(d);
  return d;
}

module.exports = { dossierTemporaire };
