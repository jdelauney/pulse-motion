'use strict';
/* Spec S11 « Styles, seconde bibliothèque », jalon J3 « Fidèle au style » (5.4) : le rendu des vidéos témoins mesuré dans la
 * page (capture fidèle), contre leur style ; la planche de regard écrit sortie/regard/style.json, repris par le contrôle. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { trouverNavigateur } = require('./aide/navigateur.js');
const PNG = require('../scripts/lib/png.js');
const MS = require('../scripts/lib/mesure-style.js');
const { projetBoucle } = require('../scripts/lib/temoin.js');
const { controler } = require('../scripts/controler.js');

const RACINE = path.join(__dirname, '..');
const LIVRES_DIR = path.join(RACINE, 'styles');
const LIVRES = fs.readdirSync(LIVRES_DIR).filter((n) => fs.existsSync(path.join(LIVRES_DIR, n, 'identite.json'))).sort();
const navigateur = trouverNavigateur();
const sans = (timeout) => ({ skip: navigateur ? false : 'Chrome ou Edge introuvable', timeout });

/** Boucle témoin de riso, scène « titre » : un bandeau (ou une image de la personne) violet sur 40 % de la largeur. */
function risoAvecViolet({ image = false } = {}) {
  const projet = projetBoucle({ dossierStyle: path.join(LIVRES_DIR, 'riso') });
  const f = path.join(projet, 'scenes', 'titre.html');
  const pose = 'position: absolute; left: 0; top: 0; width: 40%; height: 100%';
  let ajout = `<div data-decor style="${pose}; background: #7c3aed"></div>`;
  if (image) {
    const d = new Uint8Array(32 * 32 * 3);
    for (let i = 0; i < 32 * 32; i++) d.set([0x7c, 0x3a, 0xed], i * 3);
    fs.writeFileSync(path.join(projet, 'assets', 'photo.png'), PNG.encoder({ largeur: 32, hauteur: 32, canaux: 3, donnees: d }));
    ajout = `<img src="assets/photo.png" alt="La chambre froide" style="${pose}; object-fit: cover">`;
  }
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/(<section[^>]*>)/, `$1\n  ${ajout}`), 'utf8');
  return projet;
}

test('style-couleur-etrangere : un fond violet ajouté à une vidéo riso est signalé ; la vidéo témoin de chaque style n\'a aucun avis', sans(600000), async () => {
  // Chaque style : sa boucle témoin en 16:9 dans chacun de ses tons, et en 9:16 dans son ton par défaut.
  for (const s of LIVRES) {
    const dossierStyle = path.join(LIVRES_DIR, s);
    const couleur = JSON.parse(fs.readFileSync(path.join(dossierStyle, 'identite.json'), 'utf8')).couleur;
    const essais = [...couleur.tons.map((ton) => ({ ratio: '16:9', ton })), { ratio: '9:16', ton: couleur.tonDefaut }];
    for (const { ratio, ton } of essais) {
      const projet = projetBoucle({ dossierStyle, ratio, ton });
      try {
        const r = await MS.mesurerStyleProjet({ dossier: projet, navigateur });
        assert.ok(r.ok, `${s} ${ratio} ${ton} : ${r.message}`);
        assert.equal(r.attendu.ton, ton);
        assert.deepEqual(r.avis.map((a) => `${a.regle} : ${a.message}`), [], `${s} ${ratio} ${ton}`);
        assert.deepEqual(controler({ dossier: projet, ecrire: false }).problemes.filter((p) => p.regle === 'effet-hors-style').map((p) => p.message), [], `${s} ${ratio}`);
      } finally { fs.rmSync(projet, { recursive: true, force: true }); }
    }
  }
  // Un bandeau violet dans la scène « titre » de riso : couleur étrangère, à cette scène.
  const projet = risoAvecViolet();
  try {
    const r = await MS.mesurerStyleProjet({ dossier: projet, navigateur });
    assert.ok(r.ok, r.message);
    const etrangere = r.avis.filter((a) => a.regle === 'style-couleur-etrangere');
    assert.equal(etrangere.length, 1, JSON.stringify(r.mesure.etrangeres));
    assert.equal(etrangere[0].scene, 'titre');
    assert.equal(etrangere[0].gravite, 'info');
    assert.ok(r.mesure.etrangeres[0].part > 0.3, JSON.stringify(r.mesure.etrangeres));
  } finally { fs.rmSync(projet, { recursive: true, force: true }); }
});

test('mesure-style : une image de la personne est masquée dans la page (aucune couleur étrangère)', sans(120000), async () => {
  const projet = risoAvecViolet({ image: true });
  try {
    const r = await MS.mesurerStyleProjet({ dossier: projet, navigateur });
    assert.ok(r.ok, r.message);
    assert.deepEqual(r.mesure.etrangeres, []);
    // 40 % de la scène « titre », une image sur neuf.
    assert.ok(r.mesure.masquee > 0.03, String(r.mesure.masquee));
  } finally { fs.rmSync(projet, { recursive: true, force: true }); }
});

test('planche --regard : sortie/regard/style.json écrit, ses avis repris par le contrôle tant que la page ne change pas', sans(240000), async () => {
  const { planchesRegard } = require('../scripts/regard.js');
  const projet = risoAvecViolet();
  try {
    const r = await planchesRegard({ dossier: projet, navigateur });
    assert.ok(r.ok, r.message);
    assert.equal(r.capture, 'fidele');
    assert.equal(r.style.fichier, 'sortie/regard/style.json');
    assert.ok(r.style.avis.includes('style-couleur-etrangere'), r.style.avis.join());
    const j = JSON.parse(fs.readFileSync(path.join(projet, 'sortie', 'regard', 'style.json'), 'utf8'));
    assert.equal(j.empreinte, r.empreinte);
    assert.equal(j.style, 'riso');
    assert.equal(j.ton, 'clair');
    assert.equal(j.mesure.images, 9);
    for (const k of ['couleurs', 'cle', 'contraste', 'chaleur', 'saturee', 'teintes', 'main']) assert.ok(k in j.mesure, k);
    assert.ok(Buffer.byteLength(JSON.stringify(j, null, 1)) < 6000, 'style.json reste court (lu par le critique)');
    const p = controler({ dossier: projet, ecrire: false }).problemes.filter((x) => x.regle === 'style-couleur-etrangere');
    assert.equal(p.length, 1);
    assert.equal(p[0].scene, 'titre');
  } finally { fs.rmSync(projet, { recursive: true, force: true }); }
});
