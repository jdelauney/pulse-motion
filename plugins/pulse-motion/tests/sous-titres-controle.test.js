'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');
const { ouvrirPageSon } = require('./aide/page-son.js');
const { traduireConstats, controlerRendu } = require('../scripts/lib/rendu-controle.js');
const { assembler } = require('../scripts/assembler.js');
const { STYLES } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };

// Le texte « sous » de la scène d'ouverture est placé tout en bas, là où passent les sous-titres.
function projet(position) {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.sousTitres = position ? { position } : {}; d.scenes[0].voix = { texte: 'Pourquoi garder les aliments au froid ?' }; });
  const f = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</section>', '<style>[data-scene="intro"] [data-texte="sous"] { position: absolute; left: 20%; right: 20%; bottom: 6cqh; margin: 0; }</style></section>'));
  return dir;
}

test('sous-titre qui cache un texte de la scène : constat sous-titre-cache-texte ; en haut : aucun', sans, async () => {
  const bas = await ouvrirPageSon({ dir: projet(), navigateur });
  try {
    const c = await bas.evaluer('M.mesurer({ ratio: "16:9" })');
    assert.ok(c.some((x) => x.regle === 'sous-titre-cache-texte' && x.element === 'sous'), JSON.stringify(c));
  } finally { await bas.fermer(); }
  const haut = await ouvrirPageSon({ dir: projet('haut'), navigateur });
  try {
    const c = await haut.evaluer('M.mesurer({ ratio: "16:9" })');
    assert.ok(!c.some((x) => x.regle === 'sous-titre-cache-texte'), JSON.stringify(c));
  } finally { await haut.fermer(); }
});

test('message du constat en français', () => {
  const [p] = traduireConstats([{ regle: 'sous-titre-cache-texte', scene: 'intro', element: 'sous', instant: 1.2, valeur: 0.5 }]);
  assert.equal(p.gravite, 'alerte');
  assert.match(p.message, /sous-titres cachent le texte « sous ».*« position »: « haut »/);
});

test('contraste des sous-titres lu aux pixels (sous-titres blancs sans bandeau sur fond blanc)', sans, async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.sousTitres = { position: 'haut' }; d.scenes[0].voix = { texte: 'Pourquoi garder les aliments au froid ?' }; });
  const { html } = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const illisible = html.replace('</head>', '<style>#pm-scene > section { background: #fff !important; } #pm-scene .pm-st-carton { background: transparent !important; color: #fff !important; }</style></head>');
  const r = await controlerRendu({ html: illisible, ratio: '16:9', duree: 8, navigateur });
  assert.equal(r.renduVerifie, true, JSON.stringify(r.problemes));
  assert.ok(r.problemes.some((p) => p.regle === 'contraste-reel' && p.element === 'sous-titres'), JSON.stringify(r.problemes.map((p) => [p.regle, p.element])));
});
