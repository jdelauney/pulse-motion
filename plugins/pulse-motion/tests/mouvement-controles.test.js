'use strict';
/* Spec « Mouvement vivant », plan V2 « Contrôles du mouvement » (5.12) et planche image par image (5.14) : analyses pures
 * de moteur/mesures.js (M.mesurerMouvement.analyses) sur des relevés de partition, des images-clés et des caméras, messages,
 * seuils et documentation. Dans la page : mouvement-controles-page.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const S = require('../moteur/squelette.js');
const PA = require('../moteur/personnages/partition.js');
const V = require('../moteur/vivant.js');
const CAM = require('../moteur/camera.js');
const P = require('../scripts/lib/personnages.js');
const SEUILS = require('../scripts/seuils.json');
const { traduireConstats } = require('../scripts/lib/rendu-controle.js');
const { plancheCadence, instantsCadence, legendesCadence } = require('../scripts/regard.js');

globalThis.M = Object.assign(globalThis.M || {}, CAM);
require('../moteur/mesures.js');
const A = globalThis.M.mesurerMouvement.analyses;

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const lu = P.lire(null);
const bib = { poses: lu.poses, clips: lu.clips, expressions: lu.expressions };
const gab = S.completerGabarit(lu.gabarits.standard);
const partition = (actions, extra = {}) => Object.assign({ x0: 50, vue0: 0, largeur: 1600, hauteur: 900, echelle: 1, sel: V.sel('scene/a'), scene: { debut: 0, fin: 8 }, actions }, extra);
// Ancien clignement (0.24.0 à 0.31.0) : boucle de 3,2 s, fermé en 48 ms.
const ANCIEN = { nom: 'clignement', boucle: true, duree: 3.2, additif: true, cles: [{ t: 0, angles: { paupieres: 0 } }, { t: 0.94, angles: { paupieres: 0 }, courbe: 'linear' }, { t: 0.955, angles: { paupieres: -0.92 }, courbe: 'linear' }, { t: 0.985, angles: { paupieres: -0.92 }, courbe: 'linear' }] };

/** Relevé d'une partition comme M.personnages.releve (angles du squelette, touffe, paupières), tous les pasPersonnages. */
function releve(part, debut, fin, b = bib) {
  const cles = S.NOMS.os.filter((k) => k !== 'bassinY').concat(['touffeRot', 'paupieres']);
  const reduire = (pose) => Object.fromEntries(cles.map((k) => [k, typeof pose[k] === 'number' ? pose[k] : S.REPOS[k]]));
  const r = { t: [], tp: [], corps: [], poses: [], fixes: [], vie: null };
  for (let i = 0; i <= Math.floor((fin - debut) / SEUILS.pasPersonnages + 1e-6); i++) {
    const t = debut + i * SEUILS.pasPersonnages;
    const e = PA.etatAuTemps(part, t, b, gab, { releve: true });
    r.t.push(t); r.tp.push(t); r.corps.push(e.corps); r.poses.push(reduire(e.pose)); r.fixes.push(reduire(e.fixe)); r.vie = e.vie;
  }
  return r;
}

// --- 5.12 geste-bref ------------------------------------------------------------------------------------------------

test('geste-bref : l\'ancien clignement de 48 ms est signalé, le nouveau ne l\'est pas', () => {
  const ancienne = { poses: lu.poses, clips: Object.assign({}, lu.clips, { clignement: ANCIEN }), expressions: lu.expressions };
  const g = A.gestesBrefs(releve(partition([]), 0, 8, ancienne), SEUILS);
  assert.ok(g.length > 0 && g.every((x) => x.cle === 'paupieres'), JSON.stringify(g.slice(0, 2)));
  assert.ok(g[0].duree < 0.1 && g[0].ampleur >= 0.5, JSON.stringify(g[0]));
  // Le nouveau : 110 ms pour fermer, 190 pour rouvrir, sur tout le relevé (clignements réguliers, doubles et aux tournants).
  const part = partition([{ type: 'tourner', debut: 2, fin: 2.4, vue: 90 }, { type: 'regarder', debut: 5, fin: 6, cible: '#x' }]);
  assert.ok(PA.clignements(part, bib).length >= 2);
  assert.deepEqual(A.gestesBrefs(releve(part, 0, 8), SEUILS), []);
});

test('geste-bref : la course n\'est pas signalée', () => {
  const part = partition([{ type: 'courir', debut: 0.5, fin: 4, vers: 95 }], { x0: 5 });
  const r = releve(part, 0, 6);
  assert.ok(r.corps.includes('course'));
  assert.deepEqual(A.gestesBrefs(r, SEUILS), []);
  // Sans l'exclusion, la course a bien des variations rapides : c'est l'état du corps qui la protège.
  const tousAuRepos = Object.assign({}, r, { corps: r.corps.map(() => 'repos') });
  assert.ok(A.gestesBrefs(tousAuRepos, Object.assign({}, SEUILS, { gesteBrefAngle: 5 })).length > 0);
});

test('geste-bref : un changement de pose de 45° en 2 images est signalé, avec la partie du corps', () => {
  const r = { t: [0, 1 / 60, 2 / 60, 3 / 60, 4 / 60], corps: ['repos', 'repos', 'repos', 'repos', 'repos'],
    poses: [0, 0, 22, 45, 45].map((v) => ({ avantBrasAvant: v, paupieres: 1 })) };
  const [g] = A.gestesBrefs(r, SEUILS);
  assert.equal(g.partie, 'avant-bras');
  assert.equal(g.ampleur, 45);
  assert.ok(Math.abs(g.duree - 2 / 60) < 1e-9);
});

// --- 5.12 pose-figee ------------------------------------------------------------------------------------------------

test('pose-figee : une pose de 3 s en data-vie sobre est signalée, en data-vie pleine non', () => {
  const actions = [{ type: 'pose', pose: 'montrer', debut: 1, fin: 4.25 }];
  const sobre = A.posesFigees(releve(partition(actions, { vie: 'sobre' }), 0, 6), SEUILS);
  assert.equal(sobre.length, 1, JSON.stringify(sobre));
  assert.ok(sobre[0].debut >= 1 && sobre[0].debut <= 1.3 && sobre[0].duree > 2.5, JSON.stringify(sobre[0]));
  assert.deepEqual(A.posesFigees(releve(partition(actions, { vie: 'pleine' }), 0, 6), SEUILS), []);
  // Au repos, le mouvement « repos » respire et balance les bras : il compte comme vivant.
  assert.deepEqual(A.posesFigees(releve(partition([], { vie: 'sobre' }), 0, 6), SEUILS), []);
});

test('pose-figee : data-vie aucune n\'est pas signalé', () => {
  const actions = [{ type: 'pose', pose: 'montrer', debut: 1, fin: 4.25 }];
  assert.deepEqual(A.posesFigees(releve(partition(actions, { vie: 'aucune' }), 0, 6), SEUILS), []);
  assert.deepEqual(A.posesFigees(releve(partition(actions, { calme: false }), 0, 6), SEUILS), []);
});

test('pose-figee : un arrêt sur image du conteneur coupe le passage figé', () => {
  const r = releve(partition([{ type: 'pose', pose: 'montrer', debut: 1, fin: 4.25 }], { vie: 'sobre' }), 0, 6);
  // Temps du personnage arrêté entre 2 et 2,5 s (data-gel) : deux passages de moins de 2 s.
  const gele = Object.assign({}, r, { tp: r.t.map((t) => (t >= 2 && t < 2.5 ? 2 : t)) });
  assert.deepEqual(A.posesFigees(gele, SEUILS), []);
});

// --- 5.12 raccord-boucle et tout-en-phase ----------------------------------------------------------------------------

test('raccord-boucle : translate 0→10 répété signalé, rotation 0→360 non', () => {
  assert.equal(A.raccordBoucle([{ offset: 0, translate: '0px' }, { offset: 1, translate: '10px' }]), 'translate');
  assert.equal(A.raccordBoucle([{ offset: 1, transform: 'translateX(10px)' }]), 'transform', 'arrivée seule : comparée à la valeur de départ');
  assert.equal(A.raccordBoucle([{ offset: 0, rotate: '0deg' }, { offset: 1, rotate: '360deg' }]), null);
  assert.equal(A.raccordBoucle([{ offset: 1, rotate: '360deg' }]), null);
  // Images-clés implicites telles que Chrome les rend (valeur sous-jacente « none »).
  assert.equal(A.raccordBoucle([{ offset: 0, rotate: 'none', computedOffset: 0 }, { offset: 1, rotate: '360deg', computedOffset: 1 }]), null);
  assert.equal(A.raccordBoucle([{ offset: 0, transform: 'none', computedOffset: 0 }, { offset: 1, transform: 'rotate(360deg)', computedOffset: 1 }]), null);
  assert.equal(A.raccordBoucle([{ offset: 0, transform: 'rotate(0deg)' }, { offset: 1, transform: 'rotate(-720deg)' }]), null);
  assert.equal(A.raccordBoucle([{ offset: 0, rotate: '0deg' }, { offset: 1, rotate: '180deg' }]), 'rotate');
  assert.equal(A.raccordBoucle([{ offset: 0, scale: '1' }, { offset: 0.5, scale: '1.2' }, { offset: 1, scale: '1' }]), null);
  // Une goutte qui tombe et s'efface : invisible au raccord (scène « pluie » du témoin de 3 min).
  assert.equal(A.raccordBoucle([{ offset: 0, opacity: '0', transform: 'translateY(0px)' }, { offset: 0.2, opacity: '1' }, { offset: 1, opacity: '0', transform: 'translateY(30px)' }]), null);
  assert.equal(A.raccordBoucle([{ offset: 0, opacity: '0.2', transform: 'translateY(0px)' }, { offset: 1, opacity: '0.2', transform: 'translateY(30px)' }]), 'transform');
  assert.equal(A.raccordBoucle([{ offset: 0.5, opacity: '0.5' }]), null, 'propriété seulement au milieu : les deux bouts valent la valeur sous-jacente');
});

test('tout-en-phase : 3 étoiles au même départ signalées, pm-v-scintille non', () => {
  const etoiles = [1, 2, 3].map(() => ({ nom: 'brille', duree: 1.2, depart: 2, classe: 'etoile' }));
  assert.deepEqual(A.toutEnPhase(etoiles, SEUILS), [{ element: '.etoile', nombre: 3 }]);
  assert.deepEqual(A.toutEnPhase(etoiles.slice(0, 2), SEUILS), [], 'deux seulement');
  assert.deepEqual(A.toutEnPhase(etoiles.map((x, i) => ({ ...x, depart: 2 + i * 0.3 })), SEUILS), [], 'départs décalés');
  assert.deepEqual(A.toutEnPhase(etoiles.map((x) => ({ ...x, nom: 'pm-v-scintille', classe: 'pm-v-scintille' })), SEUILS), []);
});

// --- 5.12 a-coup-camera ---------------------------------------------------------------------------------------------

const clauses = (texte) => CAM.analyserCamera(texte, null);

test('a-coup-camera : une clause x en cubic-out qui démarre est signalée, sine-inout non, secousse non', () => {
  const [a] = A.acoupsCamera(clauses('x 50→30 1+1 cubic-out'), 4, 30, SEUILS);
  assert.equal(a.partie, 'cadrage');
  assert.ok(Math.abs(a.tau - 1) < 0.05, String(a.tau));
  assert.deepEqual(A.acoupsCamera(clauses('x 50→30 1+1 sine-inout'), 4, 30, SEUILS), []);
  assert.deepEqual(A.acoupsCamera(clauses('zoom 1→1.06 0+4'), 4, 30, SEUILS), [], 'le lent zoom des scènes livrées');
  assert.deepEqual(A.acoupsCamera(clauses('x 50→30 2+1 cubic-out; secousse 1.2 1.9+0.4'), 4, 30, SEUILS), [], 'choc voulu dans une secousse');
  assert.equal(A.acoupsCamera(clauses('zoom 1→1.4 1+1 cubic-out'), 4, 30, SEUILS)[0].partie, 'zoom');
  assert.equal(A.acoupsCamera(clauses('rotation 0→20 1+1 cubic-out'), 4, 30, SEUILS)[0].partie, 'rotation');
});

test('a-coup-camera : zoom avant puis arrière collés signalé', () => {
  const [a] = A.acoupsCamera(clauses('zoom 1→1.3 1+0.6; zoom 1.3→1 1.7+0.6'), 4, 30, SEUILS);
  assert.equal(a.retour, true);
  assert.ok(Math.abs(a.tau - 1.7) < 0.05, String(a.tau));
  assert.deepEqual(A.acoupsCamera(clauses('zoom 1→1.3 1+0.6; zoom 1.3→1 2+0.6'), 4, 30, SEUILS), [], '0,4 s entre les deux');
});

// --- messages, seuils, documentation --------------------------------------------------------------------------------

test('contrôles du mouvement : messages en français, sans valeur manquante', () => {
  const constats = [
    { regle: 'geste-bref', scene: 's', element: 'chef', instant: 2.3, valeur: { partie: 'avant-bras', ampleur: 45, duree: 0.067, ips: 30 } },
    { regle: 'geste-bref', scene: 's', element: 'chef', instant: 2.3, valeur: { partie: 'paupières', ampleur: 0.92, duree: 0.05, ips: 30 } },
    { regle: 'pose-figee', scene: 's', element: 'chef', instant: 4, valeur: { debut: 4, fin: 7.1, duree: 3.1 } },
    { regle: 'raccord-boucle', scene: 's', element: 'roue', instant: 1, valeur: { propriete: 'translate' } },
    { regle: 'tout-en-phase', scene: 's', element: '.etoile', instant: 1, valeur: 3 },
    { regle: 'a-coup-camera', scene: 's', element: 'camera', instant: 3, valeur: { partie: 'cadrage', retour: false } },
    { regle: 'a-coup-camera', scene: 's', element: 'camera', instant: 3, valeur: { partie: 'zoom', retour: true } },
  ];
  const p = traduireConstats(constats);
  assert.equal(p.length, constats.length);
  for (const x of p) {
    assert.equal(x.gravite, 'alerte', x.regle);
    assert.doesNotMatch(x.message, /undefined|NaN|null|\[object/, x.message);
  }
  assert.match(p[0].message, /« chef » change de pose en moins de 0,1 s vers 2,3 s \(avant-bras, 45°\) : à 30 images par seconde, ce geste tient en 2 images et scintille ; l'étaler sur au moins 0,15 s\./);
  assert.match(p[1].message, /\(paupières\)/);
  assert.match(p[2].message, /reste figé 3,1 s \(de 4 s à 7,1 s\) : il paraît mort/);
  assert.match(p[4].message, /3 éléments « \.etoile » bougent exactement ensemble/);
  assert.match(p[5].message, /la caméra part ou s'arrête d'un coup vers 3 s \(cadrage\)/);
  assert.match(p[6].message, /avance puis recule aussitôt vers 3 s \(zoom\) : laisser au moins 0,3 s/);
});

test('controles.md : chaque nouvelle règle documentée avec ses seuils égaux à seuils.json', () => {
  const c = lire('references', 'controles.md');
  const section = c.slice(c.indexOf('## Mouvement'), c.indexOf('## Pixels'));
  for (const r of ['geste-bref', 'pose-figee', 'raccord-boucle', 'tout-en-phase', 'a-coup-camera']) assert.match(section, new RegExp('^\\| `' + r + '` \\|', 'm'), r);
  const attendus = { pasPersonnages: '0,0166667 s', gesteBrefDuree: '0,1 s', gesteBrefAngle: '20°', gesteBrefPaupieres: '0,5', poseFigee: '2 s', poseFigeeAngle: '0,3°', aCoupCamera: '20', aCoupRotation: '15 °/s', toutEnPhase: '3 éléments', zoomRetourMin: '0,3 s' };
  for (const [cle, texte] of Object.entries(attendus)) {
    assert.ok(section.includes(`${texte} (\`${cle}\`)`), `${cle} : « ${texte} (\`${cle}\`) »`);
    assert.equal(Number(texte.replace(/[^\d,]/g, '').replace(',', '.')), SEUILS[cle], cle);
  }
  // Valeurs de la spec (§ 5.12) ; zoomRetourMin écrit dans seuils.json plutôt que dans le code.
  assert.deepEqual([SEUILS.gesteBrefDuree, SEUILS.gesteBrefAngle, SEUILS.gesteBrefPaupieres, SEUILS.poseFigee, SEUILS.poseFigeeAngle, SEUILS.aCoupCamera, SEUILS.aCoupRotation, SEUILS.toutEnPhase], [0.1, 20, 0.5, 2, 0.3, 20, 15, 3]);
  assert.ok(Math.abs(SEUILS.pasPersonnages - 1 / 60) < 1e-6);
  assert.equal(SEUILS.zoomRetourMin, 0.3);
});

test('mesurerMouvement : relevé des personnages pur, sans ordre ni mémoire', () => {
  const part = partition([{ type: 'marcher', debut: 0, fin: 2, vers: 40 }, { type: 'pose', pose: 'montrer', debut: 2.5, fin: 5 }]);
  const a = PA.etatAuTemps(part, 3.3, bib, gab, { releve: true });
  PA.etatAuTemps(part, 1.1, bib, gab, { releve: true });
  const b = PA.etatAuTemps(part, 3.3, bib, gab, { releve: true });
  assert.deepEqual(a, b);
  // Le relevé ne change pas la pose rendue.
  assert.deepEqual(PA.etatAuTemps(part, 3.3, bib, gab).pose, a.pose);
  assert.equal(a.vie, 'pleine');
  assert.ok(Object.keys(a.fixe).length > 10);
});

// --- 5.14 planche image par image -----------------------------------------------------------------------------------

test('planche : fenêtre au-delà de 3 s refusée, en français', async () => {
  const r = await plancheCadence({ dossier: path.join(RACINE, 'exemples', 'chaine-du-froid'), scene: 'seuil', de: 0, duree: 3.5 });
  assert.equal(r.ok, false);
  assert.match(r.message, /une fenêtre de 3,5 s est trop longue ; 3 s au plus/);
  for (const [o, motif] of [[{ de: -1, duree: 1 }, /début \(--de\)/], [{ de: 0, duree: 0 }, /durée \(--duree\)/], [{ de: 0, duree: 1, pas: 0 }, /pas \(--pas\)/]]) {
    const x = await plancheCadence({ dossier: '.', scene: 'x', ...o });
    assert.equal(x.ok, false);
    assert.match(x.message, motif);
  }
  // Par la commande : la même réponse, code 1.
  const s = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'pm.js'), 'planche', path.join(RACINE, 'exemples', 'chaine-du-froid'), 'seuil', '--de', '1', '--duree', '4'], { encoding: 'utf8' });
  assert.equal(s.status, 1);
  assert.match(JSON.parse(s.stdout).message, /fenêtre de 4 s est trop longue/);
});

test('planche : instants à 30 i/s, une image sur pas, et légendes « n° · t s »', () => {
  const instants = instantsCadence({ de: 2, duree: 1, pas: 2, ips: 30 });
  assert.equal(instants.length, 15);
  assert.equal(instants[0], 2);
  assert.ok(Math.abs(instants[1] - (2 + 2 / 30)) < 1e-3);
  assert.ok(instants[14] < 3);
  assert.equal(instantsCadence({ de: 0, duree: 3, ips: 30 }).length, 90);
  assert.deepEqual(legendesCadence([{ t: 2 }, { t: 2.0667 }], 1), ['31 · 2,00 s', '32 · 2,07 s']);
});
