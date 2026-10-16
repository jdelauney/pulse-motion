'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../moteur/particules/recette.js');
const N = require('../moteur/particules/naissances.js');

const CHARTE = { primaire: '#3366cc', accent: '#ff9900', texte: '#111111', fond: '#ffffff' };
const compiler = (recette, dur = 4) => R.compiler(recette, { dur, graine: 7, charte: CHARTE });
const base = (o = {}) => ({ version: 1, nom: 'essai', emetteurs: [{ nom: 'e', naissance: { debit: 100, vie: [1, 1] }, forces: [{ type: 'gravite', valeur: 10 }] }], ...o });

test('modulation : débit compilé au coefficient maximal, forces hors voie rapide, pistes', () => {
  const sans = compiler(base());
  const r = compiler(base({ modulation: { debit: { par: 'basses', de: 0.5, a: 2 }, forces: { par: 'battement', de: 1, a: 3 }, taille: { par: 'enveloppe', a: 2 } } }));
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const em = r.effet.emetteurs[0];
  assert.equal(em.debit, 200);
  assert.ok(em.capContinu >= 2 * sans.effet.emetteurs[0].capContinu - 2, 'capacité au coefficient maximal');
  assert.deepEqual(em.modulation.debit, { par: 'basses', de: 0.5, a: 2, piste: 'musique' });
  assert.deepEqual(em.modulation.taille, { par: 'enveloppe', de: 1, a: 2, piste: 'voix' });
  assert.equal(em.modulation.couleur, null);
  assert.equal(em.voieRapide, false, 'forces modulées : simulé pas à pas');
  assert.equal(sans.effet.emetteurs[0].voieRapide, true);
  assert.deepEqual(r.effet.pistes, ['musique', 'voix']);
  assert.deepEqual(sans.effet.pistes, []);
  assert.equal(sans.effet.emetteurs[0].modulation, null);
  assert.equal(sans.effet.emetteurs[0].salveSon, null);
});

test('modulation : erreurs de déclaration', () => {
  const erreur = (modulation) => { const r = compiler(base({ modulation })); assert.equal(r.ok, false); return r.erreurs[0]; };
  assert.match(erreur({ debit: { par: 'grave' } }).message, /modulation\.debit\.par : « grave » : l'une de volume, basses/);
  assert.match(erreur({ debit: { par: 'basses', de: -1 } }).message, /« de » et « a » : nombres positifs ou nuls/);
  assert.match(erreur({ debit: { par: 'basses', de: 0, a: 0 } }).message, /aucune particule ne naît/);
  assert.match(erreur({ vitesse: { par: 'basses' } }).message, /champ inconnu/);
  assert.equal(erreur({ debit: { par: 'grave' } }).regle, 'effet-invalide');
});

test('salve au battement : bloc réservé, fin des naissances, une seule par émetteur', () => {
  const r = compiler({ version: 1, nom: 'essai', emetteurs: [{ nom: 'e', naissance: { vie: [0.5, 0.5], salves: [{ t: 0, nombre: 5 }, { au: 'battement', nombre: 20 }] } }] }, 3);
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const em = r.effet.emetteurs[0];
  assert.deepEqual(em.salves, [{ t: 0, nombre: 5, debut: 0 }]);
  assert.deepEqual(em.salveSon, { au: 'battement', piste: 'musique', nombre: 20, debut: 5, max: 13 });
  assert.equal(em.capacite, 5 + 20 * 13);
  assert.equal(em.fin, 3.5);
  assert.deepEqual(r.effet.pistes, ['musique']);
  const sy = compiler({ version: 1, nom: 'essai', emetteurs: [{ nom: 'e', naissance: { vie: [0.5, 0.5], salves: [{ au: 'syllabe', nombre: 3 }] } }] }, 2);
  assert.deepEqual(sy.effet.emetteurs[0].salveSon, { au: 'syllabe', piste: 'voix', nombre: 3, debut: 0, max: 17 });
  const deux = compiler({ version: 1, nom: 'essai', emetteurs: [{ nom: 'e', naissance: { salves: [{ au: 'battement', nombre: 1 }, { au: 'syllabe', nombre: 1 }] } }] });
  assert.match(deux.erreurs[0].message, /une seule salve « au » par émetteur/);
  const tEtAu = compiler({ version: 1, nom: 'essai', emetteurs: [{ nom: 'e', naissance: { salves: [{ t: 1, au: 'battement', nombre: 1 }] } }] });
  assert.match(tEtAu.erreurs[0].message, /« t » ou « au », pas les deux/);
  const piste = compiler({ version: 1, nom: 'essai', emetteurs: [{ nom: 'e', naissance: { salves: [{ au: 'battement', nombre: 2, piste: 'batterie' }] } }] });
  assert.deepEqual(piste.effet.pistes, ['batterie'], 'piste écrite gardée : piste-inconnue au contrôle');
});

test('modulation : sans effet sur les fragments et les sous-émetteurs pour le débit', () => {
  const r = compiler({ version: 1, nom: 'essai', modulation: { debit: { par: 'basses', a: 2 }, couleur: { par: 'aigus', a: 3 } },
    emetteurs: [{ nom: 'p', naissance: { debit: 10, vie: [1, 1] }, a_la_mort: { emetteur: 'f' } }, { nom: 'f', naissance: { nombre: 2, vie: [0.5, 0.5] } }] });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const [p, f] = r.effet.emetteurs;
  assert.equal(p.debit, 20);
  assert.equal(f.modulation.debit, null, 'un sous-émetteur naît de son parent');
  assert.deepEqual(f.modulation.couleur, { par: 'aigus', de: 1, a: 3, piste: 'musique' });
});

test('modulation héritée (etend) d\'un effet de la bibliothèque', () => {
  const dossier = path.join(__dirname, '..', 'effets');
  const charger = (n) => JSON.parse(fs.readFileSync(path.join(dossier, `${n}.json`), 'utf8'));
  const derivee = { version: 1, nom: 'neige-basses', etend: 'neige', modulation: { debit: { par: 'basses', de: 0.2, a: 1.5 } } };
  const resolue = R.resoudre('neige-basses', (n) => (n === 'neige-basses' ? derivee : charger(n)));
  const r = compiler(resolue, 5);
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.deepEqual(r.effet.pistes, ['musique']);
});

test('bibliothèque : aucun effet livré ne lit le son', () => {
  const dossier = path.join(__dirname, '..', 'effets');
  for (const f of fs.readdirSync(dossier).filter((x) => x.endsWith('.json'))) {
    const recette = JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8'));
    if (recette.milieu) continue;
    const r = compiler(R.resoudre(recette.nom, (n) => JSON.parse(fs.readFileSync(path.join(dossier, `${n}.json`), 'utf8'))), 5);
    if (r.ok) assert.deepEqual(r.effet.pistes, [], f);
  }
});

test('miroir des naissances : éclaircissement reproductible, bloc de salves aux instants de la table', () => {
  const r = compiler(base({ modulation: { debit: { par: 'basses', de: 0, a: 1 } } }), 10);
  const em = r.effet.emetteurs[0];
  const n = 602;
  const plein = { n, coefs: new Float32Array(4 * n).fill(1), instants: new Float32Array(0), cMax: 1 };
  const moitie = { n, coefs: new Float32Array(4 * n).fill(1), instants: new Float32Array(0), cMax: 1 };
  moitie.coefs.fill(0.5, 0, n);
  const vivantes = (son) => {
    em.son = son;
    let k = 0;
    for (let s = 0; s < em.capContinu; s++) if (N.occupant(em, s, 1.5, 7)) k++;
    return k;
  };
  const tous = vivantes(plein);
  assert.equal(tous, Math.min(em.capContinu, Math.ceil(1.5 * em.debit)));
  const demi = vivantes(moitie);
  assert.ok(demi > 0.4 * tous && demi < 0.6 * tous, `${demi} sur ${tous}`);
  assert.equal(vivantes(moitie), demi, 'même tirage à chaque fois');
  assert.equal(N.coefSon(em, 0, 0.5), 0.5);
  assert.equal(N.coefSon({ index: 0 }, 2, 1), 1, 'sans table : 1');

  const s = compiler({ version: 1, nom: 'essai', emetteurs: [{ nom: 'e', naissance: { vie: [1, 1], salves: [{ au: 'battement', nombre: 4 }] } }] }, 2);
  const eb = s.effet.emetteurs[0];
  eb.son = { n: 2, coefs: new Float32Array(8).fill(1), instants: new Float32Array(eb.salveSon.max).fill(1e30), cMax: 1 };
  eb.son.instants.set([0.5, 1]);
  assert.deepEqual(N.occupant(eb, 0, 0.6), { n: 0, gen: 0, t: Math.fround(0.5) });
  assert.equal(N.occupant(eb, 4, 0.6), null, 'deuxième salve pas encore partie');
  assert.deepEqual(N.occupant(eb, 5, 1.2), { n: 5, gen: 0, t: 1 });
  assert.equal(N.occupant(eb, 8, 1.9), null, 'case sans instant');
  assert.deepEqual(N.naissanceDuPas(eb, 1, 0.45, 0.55), { n: 1, gen: 0, t: Math.fround(0.5) });
  assert.equal(N.naissanceDuPas(eb, 1, 0.55, 0.65), null);
});
