'use strict';
/* Spec Rendu et export, 5.19 : zones sûres des plateformes (TikTok, Shorts, Reels), contrôle, sous-titres, touche Z. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { assembler } = require('../scripts/assembler.js');
const { validerDeroule } = require('../scripts/lib/deroule.js');
const { controlerRendu } = require('../scripts/lib/rendu-controle.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { injecterApercu } = require('../scripts/apercu.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { miniProjet } = require('./aide/mini-projet.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const SEUILS = require('../scripts/seuils.json');

/** Vidéo 9:16 d'une scène : un titre dont le bas tombe à 30 % du bas de l'image (dans la bande de TikTok, hors de l'ancienne). */
const projet = (format = {}, deroule = {}) => miniProjet({
  scenes: [{ id: 'bas', duree: 3, textes: { t: 'Le froid' }, html: '<h1 data-texte="t" style="position:absolute;left:30%;top:66.4%;width:40%;margin:0;font-size:3cqh;line-height:1.2"></h1>' }],
  deroule: { format: { ratio: '9:16', ips: 30, ...format }, ...deroule },
});
const zones = (v) => v.problemes.filter((p) => p.regle === 'zone-sure');

test('zones-sures.test.js › marges des plateformes dans seuils.json, recopiées dans controles.md', () => {
  assert.equal(SEUILS.zonesDate, '2026-11');
  assert.deepEqual(SEUILS.zonesPlateformes.tiktok, { haut: 0.125, droite: 0.2, bas: 0.34, gauche: 0.11 });
  assert.deepEqual(SEUILS.zonesPlateformes.toutes, { haut: 0.15, droite: 0.2, bas: 0.35, gauche: 0.11 });
  const doc = fs.readFileSync(path.join(__dirname, '..', 'references', 'controles.md'), 'utf8');
  for (const [p, z] of Object.entries(SEUILS.zonesPlateformes)) {
    const v = (x) => String(x).replace('.', ',').replace(/^(0,\d)$/, '$10');
    assert.ok(doc.includes(`| \`${p}\` | ${v(z.haut)} | ${v(z.droite)} | ${v(z.bas)} | ${v(z.gauche)} |`), p);
  }
});

test('zones-sures.test.js › plateforme sur une vidéo 16:9 : erreur du déroulé ; plateforme inconnue refusée', () => {
  const d = JSON.parse(fs.readFileSync(path.join(projet(), 'deroule.json'), 'utf8'));
  assert.deepEqual(validerDeroule({ ...d, format: { ratio: '9:16', plateforme: 'tiktok' } }), []);
  assert.ok(validerDeroule({ ...d, format: { ratio: '16:9', plateforme: 'tiktok' } }).some((e) => /ne sert qu'à une vidéo verticale/.test(e)));
  assert.ok(validerDeroule({ ...d, format: { ratio: '9:16', plateforme: 'snapchat' } }).some((e) => /tiktok, shorts, reels, toutes/.test(e)));
});

test('zones-sures.test.js › tiktok : texte à 30 % du bas → alerte zone-sure « bas » ; sans plateforme : rien (seuils d\'avant inchangés)', sans, async () => {
  const avec = projet({ plateforme: 'tiktok' });
  const a = assembler({ dossier: avec, ecrire: false });
  assert.equal(a.ok, true, a.erreurs.map((e) => e.message).join(' '));
  assert.match(a.cssPage, /#pm-scene \{ --pm-zone-haut: 12\.5cqh; --pm-zone-bas: 34cqh; --pm-zone-gauche: 11cqw; --pm-zone-droite: 20cqw; \}/);
  const v = await controlerRendu({ html: a.html, ratio: '9:16', duree: 3, navigateur });
  assert.equal(v.renduVerifie, true);
  const z = zones(v);
  assert.equal(z.length, 1, JSON.stringify(v.problemes));
  assert.match(z[0].message, /« t » passe sous les boutons des réseaux sociaux \(en bas/);
  // Sans plateforme, la règle d'avant (20 % du bas) ne voit rien ; la page n'a pas de variables de zone.
  const b = assembler({ dossier: projet(), ecrire: false });
  assert.doesNotMatch(b.cssPage, /#pm-scene { --pm-zone-haut/);
  assert.deepEqual(zones(await controlerRendu({ html: b.html, ratio: '9:16', duree: 3, navigateur })), []);
  // Export vers les réseaux sans plateforme : la ligne « toutes » demandée par l'export (en alerte).
  const t = zones(await controlerRendu({ html: b.html, ratio: '9:16', duree: 3, navigateur, plateforme: 'toutes' }));
  assert.equal(t.length, 1);
  assert.equal(t[0].gravite, 'alerte');
});

test('zones-sures.test.js › sous-titres au-dessus de la bande du bas, entre les zones de gauche et de droite', sans, async () => {
  const dir = projet({ plateforme: 'tiktok' }, { sousTitres: {} });
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
  d.scenes[0].voix = { texte: 'Garder les produits au froid, toujours.' };
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify(d));
  const a = assembler({ dossier: dir, ecrire: false });
  assert.equal(a.ok, true);
  const fichier = path.join(dir, 'page.html');
  fs.writeFileSync(fichier, a.html);
  const page = await ouvrirPage({ navigateur, largeur: 540, hauteur: 960 });
  try {
    await page.aller(`${pathToFileURL(fichier).href}?capture=1`);
    const r = await page.evaluer(`M.pret.then(async function () {
      await M.seek(1.2);
      var s = document.getElementById('pm-scene').getBoundingClientRect();
      var c = document.querySelector('#pm-sous-titres .pm-st-carton');
      var rc = c.getBoundingClientRect();
      return { haut: s.top, bas: s.bottom, gauche: s.left, droite: s.right, H: s.height, W: s.width, c: { bas: rc.bottom, gauche: rc.left, droite: rc.right } };
    })`);
    const z = SEUILS.zonesPlateformes.tiktok;
    assert.ok(r.c.bas <= r.bas - z.bas * r.H + 0.5, `bas du carton ${r.c.bas}, limite ${r.bas - z.bas * r.H}`);
    assert.ok(r.c.gauche >= r.gauche + z.gauche * r.W - 0.5, 'à droite de la zone de gauche');
    assert.ok(r.c.droite <= r.droite - z.droite * r.W + 0.5, 'à gauche de la zone de droite');
  } finally { await page.fermer(); }
});

test('zones-sures.test.js › touche Z : zone visible à l\'aperçu, absente des images exportées', sans, async () => {
  const dir = projet({ plateforme: 'shorts' });
  const a = assembler({ dossier: dir, ecrire: false });
  const apercu = injecterApercu(a.html, []);
  assert.match(apercu, /window\.__PM_ZONES__ = \{"plateforme":"shorts","declaree":true,"haut":0\.15,"droite":0\.12,"bas":0\.35,"gauche":0\.06\}/);
  // Vidéo 9:16 sans plateforme : la zone de toutes les applications ; 16:9 : aucune.
  assert.match(injecterApercu(assembler({ dossier: projet(), ecrire: false }).html, []), /"plateforme":"toutes","declaree":false/);
  // Page de l'aperçu sans ses modules servis (fichier local) : seules les variables de l'aperçu comptent ici.
  const fichier = path.join(dir, 'apercu.html');
  fs.writeFileSync(fichier, apercu.replace(/<script (type="module" )?src="\/_pm\/[^"]+"><\/script>|<script defer src="\/_pm\/[^"]+"><\/script>/g, ''));
  const page = await ouvrirPage({ navigateur, largeur: 540, hauteur: 960 });
  try {
    await page.aller(pathToFileURL(fichier).href);
    const r = await page.evaluer(`M.pret.then(function () {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true }));
      var z = document.getElementById('pm-zones');
      var vu = z && getComputedStyle(z).display !== 'none';
      var s = document.getElementById('pm-scene').getBoundingClientRect();
      var rz = z.getBoundingClientRect();
      M.modeCapture(true);
      var enCapture = getComputedStyle(z).display;
      M.modeCapture(false);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Z', bubbles: true }));
      return { vu: vu, enCapture: enCapture, haut: (rz.top - s.top) / s.height, gauche: (rz.left - s.left) / s.width, retire: !document.getElementById('pm-zones') };
    })`);
    assert.equal(r.vu, true);
    assert.equal(r.enCapture, 'none');
    assert.ok(Math.abs(r.haut - 0.15) < 0.01 && Math.abs(r.gauche - 0.06) < 0.01, JSON.stringify(r));
    assert.equal(r.retire, true);
  } finally { await page.fermer(); }
});
