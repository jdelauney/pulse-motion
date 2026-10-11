'use strict';
/* Styles d'essai : copies de clair-pedagogique sous d'autres noms, chaque scène marquée <!-- style:<nom> -->. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLAIR = path.join(__dirname, '..', '..', 'styles', 'clair-pedagogique');

function modifierJSON(fichier, fn) {
  const j = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  fn(j);
  fs.writeFileSync(fichier, JSON.stringify(j, null, 2));
}

/** -> dossier racine contenant un style par nom. */
function stylesEssai(noms = ['alpha', 'beta', 'gamma']) {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-styles-'));
  for (const nom of noms) {
    const d = path.join(racine, nom);
    fs.cpSync(CLAIR, d, { recursive: true });
    for (const f of ['catalogue.json', 'identite.json']) modifierJSON(path.join(d, f), (j) => { j.style = nom; });
    for (const f of fs.readdirSync(path.join(d, 'scenes'))) {
      const p = path.join(d, 'scenes', f);
      fs.writeFileSync(p, `<!-- style:${nom} -->\n${fs.readFileSync(p, 'utf8')}`);
    }
  }
  return racine;
}

/** Dossier personnel temporaire, à mettre dans PULSE_MOTION_DOSSIER. */
function dossierPersonnelEssai() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pm-perso-'));
}

module.exports = { CLAIR, modifierJSON, stylesEssai, dossierPersonnelEssai };
