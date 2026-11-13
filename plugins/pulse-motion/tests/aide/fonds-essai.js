'use strict';
/* Fonds de carte d'essai (spec S9, 5.10) : pays, départements et villes inventés, aux formes simples, passés par le vrai outil du
 * mainteneur (outils/cartes/preparer.js) dans un dossier temporaire. Ce ne sont pas des données de Natural Earth : seulement
 * des carrés et des polygones placés là où sont les vrais pays, pour éprouver projection, topologie, cadres et repères. */
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./temporaire.js');

const DEPOT = path.join(__dirname, '..', '..', '..', '..');
const OUTIL = path.join(DEPOT, 'outils', 'cartes', 'preparer.js');

const poly = (anneaux) => ({ type: 'Polygon', coordinates: anneaux.map((a) => a.concat([a[0]])) });
const multi = (polys) => ({ type: 'MultiPolygon', coordinates: polys.map((p) => p.map((a) => a.concat([a[0]]))) });
const pays = (props, geometrie) => ({ type: 'Feature', properties: props, geometry: geometrie });

// FR et DE partagent la frontière (8, 47) – (8, 49) – (8, 51) ; FR a une île (Corse) et une partie lointaine (Guyane).
const PAYS = [
  pays({ ISO_A2: '-99', ISO_A2_EH: 'FR', NAME: 'France', NAME_FR: 'France', CONTINENT: 'Europe', ADM0_A3: 'FRA' }, multi([
    [[[-5, 42], [8, 42], [8, 47], [8, 49], [8, 51], [2, 51.5], [-5, 48]]],
    [[[8.6, 41.4], [9.5, 41.4], [9.5, 43], [8.6, 43]]],
    [[[-54, 2], [-51.6, 2], [-51.6, 5.8], [-54, 5.8]]],
  ])),
  pays({ ISO_A2: 'DE', NAME: 'Germany', NAME_FR: 'Allemagne', CONTINENT: 'Europe', ADM0_A3: 'DEU' }, poly([[[8, 47], [15, 47], [15, 55], [8, 55], [8, 51], [8, 49]]])),
  pays({ ISO_A2: 'ES', NAME: 'Spain', NAME_FR: 'Espagne', CONTINENT: 'Europe', ADM0_A3: 'ESP' }, poly([[[-9, 36], [3, 36], [3, 41.9], [-9, 41.9]]])),
  pays({ ISO_A2: 'BR', NAME: 'Brazil', NAME_FR: 'Brésil', CONTINENT: 'South America', ADM0_A3: 'BRA' }, poly([[[-70, -30], [-40, -30], [-40, 1], [-70, 1]]])),
  pays({ ISO_A2: 'CA', NAME: 'Canada', NAME_FR: 'Canada', CONTINENT: 'North America', ADM0_A3: 'CAN' }, poly([[[-140, 45], [-55, 45], [-55, 70], [-140, 70]]])),
  pays({ ISO_A2: '-99', ISO_A2_EH: '-99', NAME: 'Somewhere', ADM0_A3: 'XSW', CONTINENT: 'Africa' }, poly([[[40, 8], [45, 8], [45, 11], [40, 11]]])),
];

const DEPARTEMENTS = [
  pays({ iso_3166_2: 'FR-75', name: 'Paris' }, poly([[[2.2, 48.8], [2.5, 48.8], [2.5, 48.9], [2.2, 48.9]]])),
  pays({ iso_3166_2: 'FR-92', name: 'Hauts-de-Seine' }, poly([[[2.0, 48.8], [2.2, 48.8], [2.2, 48.9], [2.0, 48.9]]])),
  pays({ iso_3166_2: 'FR-69', name: 'Rhône' }, poly([[[4.5, 45.5], [5, 45.5], [5, 46], [4.5, 46]]])),
  pays({ iso_3166_2: 'FR-971', name: 'Guadeloupe' }, poly([[[-61.8, 15.9], [-61.0, 15.9], [-61.0, 16.5], [-61.8, 16.5]]])),
];

const point = (props, lon, lat) => ({ type: 'Feature', properties: { ...props, LATITUDE: lat, LONGITUDE: lon }, geometry: { type: 'Point', coordinates: [lon, lat] } });
const VILLES = [
  point({ NAME: 'Paris', NAME_FR: 'Paris', ISO_A2: 'FR', POP_MAX: 11000000 }, 2.3522, 48.8566),
  point({ NAME: 'Berlin', NAME_FR: 'Berlin', ISO_A2: 'DE', POP_MAX: 3400000 }, 13.405, 52.52),
  point({ NAME: 'Madrid', NAME_FR: 'Madrid', ISO_A2: 'ES', POP_MAX: 5500000 }, -3.7038, 40.4168),
  point({ NAME: 'Montreal', NAME_FR: 'Montréal', ISO_A2: 'CA', POP_MAX: 3500000 }, -73.5673, 45.5017),
];
const VILLES_DETAIL = [
  point({ NAME: 'Lyon', NAME_FR: 'Lyon', ISO_A2: 'FR', POP_MAX: 1600000 }, 4.8357, 45.764),
  point({ NAME: 'Basse-Terre', NAME_FR: 'Basse-Terre', ISO_A2: 'FR', POP_MAX: 10000 }, -61.7261, 15.9985),
];

/** Écrit les GeoJSON d'essai et prépare monde.json, france.json et villes.json avec l'outil. -> { dossier, sources, bilan } */
function fondsEssai() {
  const sources = dossierTemporaire('pm-ne-essai-');
  const dossier = dossierTemporaire('pm-cartes-essai-');
  const ecrire = (nom, features) => { const f = path.join(sources, nom); fs.writeFileSync(f, JSON.stringify({ type: 'FeatureCollection', features }), 'utf8'); return f; };
  const args = ['--pays', ecrire('pays.geojson', PAYS), '--departements', ecrire('departements.geojson', DEPARTEMENTS),
    '--villes', ecrire('villes.geojson', VILLES), '--villes-detail', ecrire('villes-detail.geojson', VILLES_DETAIL), '--sortie', dossier, '--aire-min', '0.01'];
  const journal = console.log;
  let sortie = '';
  console.log = (t) => { sortie += t; };
  try {
    const code = require(OUTIL).principal(args);
    if (code !== 0) throw new Error(`préparation des fonds d'essai : code ${code}`);
  } finally { console.log = journal; }
  return { dossier, sources, bilan: JSON.parse(sortie) };
}

module.exports = { fondsEssai, OUTIL, DEPOT, PAYS, DEPARTEMENTS, VILLES };
