'use strict';
/* Correctifs de la synthèse : partitions mal formées, « x » mélodique, basse sur la fondamentale, sub,
 * son-sous-voix (fichiers, volume 0), sons importés (apostrophe, embarqués une fois), fondu des bruitages. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../moteur/synthe/partition.js');
const A = require('../moteur/synthe/ambiances.js');
const C = require('../moteur/synthe/catalogue.js');
const W = require('../moteur/wav.js');
const V = require('../scripts/lib/voix.js');
const { controler } = require('../scripts/controler.js');
const { assembler } = require('../scripts/assembler.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { wavSinus } = require('./aide/son.js');

const base = (piste) => ({ tempo: 120, mesures: 4, pistes: [{ instrument: 'pad', motif: ['do4 1'], ...piste }] });

test('partition : durée à dénominateur nul, de ≥ a, pas qui n\'est pas du texte, trop de notes : erreurs nommant la piste', () => {
  assert.match(P.validerPartition(base({ motif: ['do4 1/0'] })).join(' '), /piste 1, note 1 : durée « 1\/0 »/);
  assert.match(P.validerPartition(base({ de: 3, a: 2 })).join(' '), /piste 1 : « de » \(3\) doit être avant « a » \(2\)/);
  assert.match(P.validerPartition(base({ motif: [4] })).join(' '), /piste 1, note 1 : un texte est attendu/);
  assert.match(P.validerPartition({ tempo: 120, mesures: 2000, pistes: [{ instrument: 'charleston', motif: ['x 1/64'] }] }).join(' '), /piste 1 : trop de notes/);
});

test('partition : « x » refusé sur un instrument mélodique, accepté sur une percussion', () => {
  for (const instrument of ['pluck', 'pad', 'basse', 'sub', 'cloche']) {
    assert.match(P.validerPartition(base({ instrument, motif: ['x 1/4'] })).join(' '), /« x » .*percussion/, instrument);
  }
  assert.deepEqual(P.validerPartition(base({ instrument: 'kick', motif: ['x 1/4'] })), []);
});

/** Fondamentale (classe de hauteur) d'une triade : la note r dont la quinte (juste ou diminuée) est dans l'accord. */
function fondamentale(notes) {
  const pcs = notes.map((n) => ((P.midi(n) % 12) + 12) % 12);
  return pcs.find((r) => pcs.includes((r + 7) % 12) || (pcs.includes((r + 6) % 12) && pcs.includes((r + 3) % 12)));
}

test('ambiances : la basse joue la fondamentale de chaque accord, renversé ou non', () => {
  for (const ambiance of Object.keys(C.AMBIANCES)) {
    for (let graine = 1; graine <= 6; graine++) {
      const p = A.generer({ ambiance, graine, intensite: 0.5, duree: 40, scenes: [{ debut: 0, fin: 10 }, { debut: 10, fin: 30 }, { debut: 30, fin: 40 }] });
      const nappe = p.pistes.find((x) => x.instrument === 'pad' && x.motif.length > 1);
      const basse = p.pistes.find((x) => x.instrument === 'basse');
      if (!nappe || !basse || ambiance === 'suspense') continue;
      const parMesure = basse.motif.length / nappe.motif.length;
      nappe.motif.forEach((accord, i) => {
        const notes = accord.split(' ')[0].split('+');
        const b = basse.motif[i * parMesure].split(' ')[0];
        assert.equal(((P.midi(b) % 12) + 12) % 12, fondamentale(notes), `${ambiance} graine ${graine} mesure ${i} : ${accord} / ${b}`);
      });
    }
  }
});

test('ambiances : « sub » sur les temps forts en tech et entraînant à forte intensité', () => {
  for (const ambiance of ['tech', 'entrainant']) {
    const p = A.generer({ ambiance, intensite: 0.9, duree: 30, scenes: [{ debut: 0, fin: 8 }, { debut: 8, fin: 30 }] });
    assert.ok(p.pistes.some((x) => x.instrument === 'sub'), ambiance);
    assert.deepEqual(P.validerPartition(p), []);
    const calme = A.generer({ ambiance, intensite: 0.5, duree: 30, scenes: [{ debut: 0, fin: 8 }, { debut: 8, fin: 30 }] });
    assert.ok(!calme.pistes.some((x) => x.instrument === 'sub'), ambiance);
  }
});

function avecElements(dir, html) {
  const f = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</section>', `${html}</section>`));
}
async function avecVoix(dir) {
  const x = new Float32Array(48000 * 4);
  for (let i = 24000; i < 48000 * 3.5; i++) x[i] = 0.3 * Math.sin(i / 5);
  const r = await V.ecrirePrise({ projet: dir, scene: 'intro', octets: W.ecrire({ taux: 48000, canaux: [x] }), texte: 'un deux trois quatre' });
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'un deux trois quatre', fichier: r.relatif }; });
}

test('son-sous-voix : un son importé fort compte, un son fort à volume 0 ne compte pas', async () => {
  const dir = copierProjet('projet-simple');
  await avecVoix(dir);
  fs.mkdirSync(path.join(dir, 'assets', 'sons'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'sons', 'porte.wav'), wavSinus({ secondes: 0.5 }));
  avecElements(dir, '<p data-start="mot:deux" data-son="assets/sons/porte.wav">x</p><p data-start="mot:trois" data-son="impact" data-son-volume="0">y</p>');
  const p = controler({ dossier: dir, dossierStyles: STYLES, ecrire: false }).problemes.filter((x) => x.regle === 'son-sous-voix');
  assert.equal(p.length, 1, JSON.stringify(p));
  assert.match(p[0].message, /porte\.wav/);
});

test('sons importés : chemin avec apostrophe embarqué ; même fichier embarqué une seule fois', () => {
  const dir = copierProjet('projet-simple');
  fs.mkdirSync(path.join(dir, 'assets', 'sons'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'sons', "l'été.wav"), wavSinus({ secondes: 0.3 }));
  avecElements(dir, `<p data-start="1" data-son="assets/sons/l'été.wav">a</p><p data-start="2" data-son="assets/sons/l'été.wav">b</p>`);
  const r = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.deepEqual(r.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const blocs = r.html.match(/id="pm-son-fichier-\d+"/g) || [];
  assert.equal(blocs.length, 1, String(blocs));
  assert.equal((r.html.match(/data-son="fichier:pm-son-fichier-0"/g) || []).length, 2);
});

const { trouverNavigateur } = require('./aide/navigateur.js');
const { ouvrirPageSon } = require('./aide/page-son.js');
const navigateur = trouverNavigateur();

test('bruitages : fondu de sortie en fin de vidéo (un son long ne s\'arrête pas net)', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-simple');
  avecElements(dir, '<p data-start="1" data-son="fichier:pm-son-fichier-0">x</p>');
  const page = await ouvrirPageSon({ dir, navigateur, sons: { 'pm-son-fichier-0': wavSinus({ secondes: 12, taux: 48000 }) } });
  try {
    const r = await page.evaluer(`M.rendreSon().then(function (r) {
      var x = r.buffer.getChannelData(0), t = r.buffer.sampleRate;
      function rms(a, z) { var s = 0, n = 0; for (var k = Math.round(a * t); k < Math.round(z * t); k++) { s += x[k] * x[k]; n++; } return Math.sqrt(s / n); }
      return { milieu: rms(2, 3), fin: rms(M.duree - 0.02, M.duree) };
    })`);
    assert.ok(r.fin < r.milieu * 0.1, JSON.stringify(r));
  } finally { await page.fermer(); }
});
