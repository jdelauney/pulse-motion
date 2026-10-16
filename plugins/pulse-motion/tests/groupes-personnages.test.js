'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { deplierGroupes } = require('../scripts/lib/groupes-personnages.js');
const { preparerPersonnages } = require('../scripts/lib/personnages-scene.js');
const { lireAttributs } = require('../scripts/lib/extraire.js');
const P = require('../scripts/lib/personnages.js');

const lu = P.lire(null);
const balises = (html, motif) => [...html.matchAll(/<(div|i)\b([^>]*)>/g)].map((m) => lireAttributs(m[2])).filter((a) => motif(a));

test('groupe déplié : ids, positions, retards (nombres, temps, références, mots), membre seul, références internes', () => {
  const r = deplierGroupes(`<section><div id="file" data-personnage="touffu" data-groupe="3" data-ecart="5" data-decalage="0.5t" data-x="20" data-sol="75">
    <i id="va" data-action="marcher" data-vers="60" data-start="1" data-dur="2"></i>
    <i data-action="pose" data-pose="montrer" data-start="#va:fin+0.2" data-dur="1"></i>
    <i data-action="regarder" data-cible="#titre" data-start="mot:froid"></i>
    <i data-action="jouer" data-clip="coucou" data-membre="2" data-start="#va:fin"></i>
  </div><h1 id="titre"></h1></section>`, { scene: 's', dureeTemps: 0.5 });
  assert.deepEqual(r.erreurs, []);
  const conteneurs = balises(r.html, (a) => a['data-personnage']);
  assert.deepEqual(conteneurs.map((a) => [a.id, a['data-x'], a['data-sol'], a['data-groupe']]), [['file-1', '20', '75', undefined], ['file-2', '15', '75', undefined], ['file-3', '10', '75', undefined]]);
  const marches = balises(r.html, (a) => a['data-action'] === 'marcher');
  assert.deepEqual(marches.map((a) => [a.id, a['data-start'], a['data-vers']]), [['va-1', '1', '60'], ['va-2', '1.25', '55'], ['va-3', '1.5', '50']]);
  const poses = balises(r.html, (a) => a['data-action'] === 'pose');
  assert.deepEqual(poses.map((a) => a['data-start']), ['#va-1:fin+0.2', '#va-2:fin+0.2', '#va-3:fin+0.2'], 'référence interne : déjà retardée');
  assert.deepEqual(balises(r.html, (a) => a['data-action'] === 'regarder').map((a) => [a['data-start'], a['data-cible']]), [['mot:froid', '#titre'], ['mot:froid+0.25', '#titre'], ['mot:froid+0.5', '#titre']]);
  const coucou = balises(r.html, (a) => a['data-clip'] === 'coucou');
  assert.deepEqual(coucou.map((a) => [a['data-start'], a['data-membre']]), [['#va-2:fin', undefined]], 'membre 2 seulement, sans retard');
});

test('départ commun, variation déterministe, erreurs', () => {
  const html = '<div id="g" data-personnage="touffu" data-groupe="4" data-depart="commun" data-x="8" data-ecart="6" data-variation="0.2" data-taille="20"><i data-action="marcher" data-vers="70" data-start="0" data-dur="3"></i></div>';
  const a = deplierGroupes(html, {}), b = deplierGroupes(html, {});
  assert.equal(a.html, b.html, 'même tirage à chaque assemblage');
  const c = balises(a.html, (x) => x['data-personnage']);
  assert.ok(c.every((x) => x['data-x'] === '8'), 'tous au même point de départ');
  assert.deepEqual(balises(a.html, (x) => x['data-action']).map((x) => x['data-vers']), ['70', '64', '58', '52'], 'espacés à l\'arrivée');
  const tailles = c.map((x) => Number(x['data-taille']));
  assert.ok(tailles.every((t) => t >= 16 && t <= 24) && new Set(tailles).size > 1);
  const mauvais = preparerPersonnages(`<section><div id="g" data-personnage="touffu" data-groupe="40"></div><div id="h" data-personnage="touffu" data-groupe="2" data-ecart="loin"></div>
    <div id="k" data-personnage="touffu" data-groupe="2" data-decalage="2t"></div><div id="m" data-personnage="touffu" data-groupe="2"><i data-action="jouer" data-clip="coucou" data-membre="5" data-start="0"></i></div>
    <p id="m-2"></p><div id="z" data-personnage="touffu"><i data-action="pose" data-pose="montrer" data-membre="1" data-start="0" data-dur="1"></i></div></section>`, { scene: 's', lu });
  const m = mauvais.erreurs.map((e) => e.message).join(' | ');
  for (const motif of [/data-groupe="40" doit être un nombre de membres, de 2 à 20/, /data-ecart="loin"/, /data-decalage="2t" est en temps musicaux, mais le déroulé n'a pas de tempo/, /data-membre="5" doit être un numéro de membre, de 1 à 2/, /l'id « m-2 » est déjà pris/, /data-membre="1" hors d'un groupe/]) assert.match(m, motif);
});

test('revue : groupe imbriqué refusé, groupe invalide rendu ordinaire, renvoi #groupe vers la tête, référence à un membre seul, attribut sûr, mot à trait d\'union', () => {
  const imbrique = deplierGroupes('<section><div id="a" data-personnage="touffu" data-groupe="2"><div id="b" data-personnage="touffu" data-groupe="2"></div></div></section>', {});
  assert.match(imbrique.erreurs.map((e) => e.message).join(), /un groupe ne peut pas en contenir un autre/);
  assert.ok(!/data-groupe/.test(imbrique.html), 'neutralisé');
  const invalide = deplierGroupes('<div id="g" data-personnage="touffu" data-groupe="99"><i data-action="jouer" data-clip="coucou" data-membre="1" data-start="0"></i></div>', {});
  assert.equal(invalide.erreurs.length, 1);
  assert.ok(!/data-groupe|data-membre/.test(invalide.html));
  const r = deplierGroupes(`<section><div id="file" data-personnage="touffu" data-groupe="2" data-decalage="0.5">
    <i id="salut" data-action="jouer" data-clip="coucou" data-membre="2" data-start="0"></i>
    <i data-action="regarder" data-cible="#salut" data-start="mot:peut-être+0.1"></i>
    <i data-action="pose" data-pose="montrer" data-dire="mon id est là" data-start="1" data-dur="1"></i>
  </div><p id="pancarte" data-tenu-par="#file" data-start="0" data-dur="1"></p></section>`, { scene: 's' });
  assert.deepEqual(r.erreurs, []);
  assert.match(r.html, /data-tenu-par="#file-1"/, '#file vise la tête');
  assert.deepEqual([...r.html.matchAll(/data-cible="([^"]+)"/g)].map((m) => m[1]), ['#salut-2', '#salut-2'], 'enfant du seul membre 2');
  assert.deepEqual([...r.html.matchAll(/data-start="(mot:[^"]+)"/g)].map((m) => m[1]), ['mot:peut-être+0.1', 'mot:peut-être+0.6']);
  assert.ok([...r.html.matchAll(/data-dire="mon id est là"/g)].length === 2 && !/id="[^"]*"[^>]*\sid=/.test(r.html), 'une valeur qui contient « id » ne perturbe pas');
});

