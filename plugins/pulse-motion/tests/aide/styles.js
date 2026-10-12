'use strict';
/* Styles d'essai : copies de clair-pedagogique sous d'autres noms, chaque scène marquée <!-- style:<nom> -->. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { adapterScene } = require('../../scripts/lib/adapter.js');

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

/** Projet de 4 scènes dans un style d'essai : titre, liste (3 points), chiffre (compteur 4), une scène libre. */
function projetTypes(racine, style = 'alpha') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-types-'));
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.mkdirSync(path.join(dir, 'assets'));
  const scenes = [
    { id: 'intro', type: 'titre', duree: 6, textes: { etiquette: 'Hygiène', titre: 'La chaîne du froid', sous: 'En 3 minutes' } },
    { id: 'regles', type: 'liste', duree: 9, textes: { titre: 'Trois règles', point1: 'Contrôler', point2: 'Ranger', point3: 'Noter' } },
    { id: 'seuil', type: 'chiffre', duree: 7, textes: { titre: 'Température maximale', unite: '°C', legende: 'dans le réfrigérateur' } },
    { id: 'carte', duree: 5, textes: { titre: 'La carte des zones' } },
  ];
  scenes.forEach((s, i) => {
    s.fichier = `scenes/0${i + 1}-${s.id}.html`;
    const html = s.type
      ? adapterScene(fs.readFileSync(path.join(racine, style, 'scenes', `${s.type}.html`), 'utf8'), { type: s.type, id: s.id, duree: s.duree, textes: s.textes, nombre: s.type === 'chiffre' ? '4' : null })
      : `<section data-scene="${s.id}"><h2 id="t" data-texte="titre" data-start="0.2" data-dur="0.7"></h2><span data-start="0" data-dur="4" data-tween="--dx 0cqh→5cqh linear"></span></section>`;
    fs.writeFileSync(path.join(dir, s.fichier), html);
  });
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify({
    version: 1, titre: 'Chaîne du froid', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9', ips: 30 }, style, scenes,
  }, null, 2));
  return dir;
}

module.exports = { CLAIR, modifierJSON, stylesEssai, dossierPersonnelEssai, projetTypes };
