'use strict';
/* Correctifs des défauts trouvés par S7 J5 + J6 (témoin explication-facture), rendus dans Chrome ou Edge sans fenêtre :
 * (a) une scène toute faite (moyeu) dans une caméra automatique garde sa mise en page, et un chevauchement sous une caméra qui
 * bouge est vu par le contrôle ; (b) le corps d'un code, à sa taille par défaut, n'est jamais compté comme un débordement.
 * (c) et (d) : tests/son-style.test.js (étapes d'un code) et tests/explication-temoin.test.js (preuve à l'octet près). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { controlerRendu } = require('../scripts/lib/rendu-controle.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { miniProjet } = require('./aide/mini-projet.js');

const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const RACINE = path.join(__dirname, '..');

function page(scenes, deroule = {}) {
  const dir = miniProjet({ scenes, deroule });
  const a = assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const fichier = path.join(dir, `page-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(fichier, a.html);
  return { a, fichier };
}
const json = async (c, code) => JSON.parse(await c.evaluer(`Promise.resolve(${code}).then(function (r) { return JSON.stringify(r); })`));

// La scène toute faite « moyeu » du style, posée telle quelle dans un conteneur de caméra automatique.
const MOYEU = fs.readFileSync(path.join(RACINE, 'styles', 'clair-pedagogique', 'scenes', 'moyeu.html'), 'utf8')
  .replace(/<!--[\s\S]*?-->/, '').replace('<section data-scene="moyeu">', '<section data-scene="m"><div data-camera="auto">').replace('</section>', '</div></section>');
const TEXTES_MOYEU = { titre: 'Pourquoi une facture est payée en retard', centre: 'Paiement en retard', partie1: 'Montant erroné', partie2: 'Mention manquante', partie3: 'Mauvais destinataire', partie4: 'Relance oubliée', partie5: 'Délai trop court' };

test('correctif (a) : le moyeu dans une caméra automatique garde sa mise en page (titre jamais recouvert)', { ...SANS, timeout: 180000 }, async () => {
  const p = page([{ id: 'm', html: MOYEU, duree: 10, textes: TEXTES_MOYEU, transition: 'coupe' }]);
  const c = await ouvrirCapture({ fichierHtml: p.fichier, largeur: 640, hauteur: 360, navigateur, delai: 60000 });
  try {
    const r = await json(c, `M.seek(9).then(function () {
      var cam = document.querySelector('[data-camera]'), sec = cam.parentElement;
      var titre = document.getElementById('titre').getBoundingClientRect();
      var parties = Array.prototype.map.call(document.querySelectorAll('.moyeu-partie, .moyeu-centre'), function (el) { return el.getBoundingClientRect(); });
      var touche = parties.filter(function (b) { return Math.min(b.right, titre.right) > Math.max(b.left, titre.left) && Math.min(b.bottom, titre.bottom) > Math.max(b.top, titre.top); }).length;
      var cs = getComputedStyle(cam), ss = getComputedStyle(sec);
      return { touche: touche, display: cs.display, direction: cs.flexDirection, padding: cs.paddingTop === ss.paddingTop, moyeu: document.querySelector('.moyeu').getBoundingClientRect().height };
    })`);
    assert.equal(r.touche, 0, JSON.stringify(r));
    assert.equal(r.display, 'flex');
    assert.equal(r.direction, 'column');
    assert.ok(r.padding, 'marges de la scène reprises');
  } finally { await c.fermer(); }
  // Et le contrôle rendu n'y voit rien à redire.
  const v = await controlerRendu({ html: p.a.html, ratio: '16:9', duree: 10, navigateur });
  assert.equal(v.renduVerifie, true);
  assert.deepEqual(v.problemes.filter((x) => x.regle === 'chevauchement'), []);
});

test('correctif (a) : une carte dont le cadre recouvre un titre est vue par le contrôle, même si leurs lettres ne se touchent pas', { ...SANS, timeout: 180000 }, async () => {
  // Le défaut du témoin : les cadres des parties du moyeu couvraient le bas du titre ; le contrôle comparait seulement
  // l'étendue des lettres de chaque texte, qui ne se touchaient pas. Une carte compte maintenant pour toute sa boîte.
  const html = `<style>@scope { .t { position: absolute; left: 20cqh; top: 10cqh; margin: 0; font-size: 7cqh; }
    .c { position: absolute; left: 30cqh; top: 16cqh; width: 50cqh; padding: 12cqh 2cqh 3cqh; border: 0.5cqh solid var(--c-primaire); font-size: 4cqh; } }</style>
  <div data-camera="auto"><h2 id="titre" class="t" data-texte="titre" data-start="0.3"></h2>
  <div id="carte" class="c" data-texte="carte" data-start="0.6"></div></div>`;
  const p = page([{ id: 's', html, duree: 10, textes: { titre: 'Un titre bien visible', carte: 'Une carte' }, transition: 'coupe' }]);
  const v = await controlerRendu({ html: p.a.html, ratio: '16:9', duree: 10, navigateur });
  assert.equal(v.renduVerifie, true);
  assert.ok(v.problemes.some((x) => x.regle === 'chevauchement' && x.scene === 's' && /titre/.test(x.message) && /carte/.test(x.message)), JSON.stringify(v.problemes.map((x) => x.regle)));
});

test('correctif (b) : un code à la taille par défaut, ligne surlignée comprise, n\'est jamais un débordement', { ...SANS, timeout: 180000 }, async () => {
  const code = { ttc: { langage: 'tableur', titre: 'Facture.xlsx', etapes: [{ code: '=B2' }, { code: '=B2*(1+C2)', debut: 2, surligner: [1] }, { code: '=ARRONDI(B2*(1+C2);2)', debut: 4 }] } };
  const p = page([{ id: 'd', html: '<h2 data-texte="titre" data-start="0.2"></h2><figure id="f" data-code="ttc" data-start="0.5"></figure>', duree: 6, textes: { titre: 'La formule' }, code, transition: 'coupe' }]);
  const c = await ouvrirCapture({ fichierHtml: p.fichier, largeur: 640, hauteur: 360, navigateur, delai: 60000 });
  try {
    const r = await json(c, `M.seek(0).then(function () {
      var corps = document.querySelector('.pm-code-corps');
      return { debordements: M.detecterDebordements(), taille: getComputedStyle(corps).fontSize, depasse: corps.scrollWidth > corps.clientWidth };
    })`);
    assert.deepEqual(r.debordements, [], JSON.stringify(r));
    assert.ok(r.depasse, 'la bande de la ligne surlignée dépasse bien du corps (ce qui faisait le faux débordement)');
  } finally { await c.fermer(); }
});
