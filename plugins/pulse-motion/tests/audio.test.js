'use strict';
/* Spec S2, 5.11 : M.rendreSon({ detail: true }) (moteur/audio.js) pour le contrôle du son. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const W = require('../moteur/wav.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { miniProjet, poserVoix } = require('./aide/mini-projet.js');

const navigateur = trouverNavigateur();

function sinus(duree, freq, niveau) {
  const x = new Float32Array(Math.round(48000 * duree));
  for (let i = 0; i < x.length; i++) x[i] = niveau * Math.sin(2 * Math.PI * freq * i / 48000);
  return Buffer.from(W.ecrire({ taux: 48000, canaux: [x] }));
}

test('audio.test.js › rendreSon sans option inchangé ; detail donne voix et autres aux mêmes gains que le mixage', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const dir = miniProjet({ scenes: [{ id: 'a', duree: 4, textes: { titre: 'Le froid' }, voix: { texte: 'un deux trois' }, html: '<h2 data-texte="titre" data-start="0.3"></h2>' }],
    deroule: { musique: { fichier: 'assets/musique.wav', volume: 0.6 } }, assets: { 'musique.wav': sinus(4, 220, 0.2) } });
  await poserVoix(dir, 'a', sinus(3, 800, 0.2), 'un deux trois');
  const { html, ok, erreurs } = assembler({ dossier: dir, ecrire: false });
  assert.ok(ok, JSON.stringify(erreurs));
  const fichier = path.join(dir, 'page.html');
  fs.writeFileSync(fichier, html);
  const page = await ouvrirPage({ navigateur, largeur: 640, hauteur: 360 });
  try {
    await page.aller(pathToFileURL(fichier).href);
    const r = await page.evaluer(`(async function () {
      await M.pret;
      var a = await M.rendreSon();
      var memePromesse = M.rendreSon() === M.rendreSon();
      var b = await M.rendreSon({ detail: true });
      var l = a.buffer.getChannelData(0), rr = a.buffer.getChannelData(1), ecart = 0, identique = true, energieVoix = 0, energieAutres = 0;
      var bl = b.buffer.getChannelData(0);
      for (var i = 0; i < l.length; i++) {
        if (Math.abs(l[i] - bl[i]) > 1e-7) identique = false;
        ecart = Math.max(ecart, Math.abs((l[i] + rr[i]) / 2 - (b.detail.voix[i] + b.detail.autres[i])));
        energieVoix += b.detail.voix[i] * b.detail.voix[i];
        energieAutres += b.detail.autres[i] * b.detail.autres[i];
      }
      return { detailSansOption: 'detail' in a, memePromesse: memePromesse, identique: identique, ecart: ecart, taux: b.detail.taux,
        longueur: b.detail.voix.length === l.length, voix: energieVoix > 0, autres: energieAutres > 0, sonie: a.sonie, sonieDetail: b.sonie };
    })()`);
    assert.equal(r.detailSansOption, false);
    assert.equal(r.memePromesse, true);
    assert.equal(r.identique, true, 'le mixage est le même avec ou sans détail');
    assert.equal(r.sonie, r.sonieDetail);
    assert.equal(r.taux, 48000);
    assert.ok(r.longueur && r.voix && r.autres);
    assert.ok(r.ecart < 1e-4, `voix + autres = mélange avant le limiteur (écart ${r.ecart})`);
  } finally {
    await page.fermer();
  }
});
