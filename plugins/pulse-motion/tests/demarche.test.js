'use strict';
/* Spec S11, jalon J5 (5.7) : la marche calculée (moteur/demarche.js), sans navigateur. Pose fonction de la phase seule, pied
 * posé immobile au sol (partition, squelette et placement de la scène, comme moteur/personnages/scene.js), hanche plus basse en
 * double appui, course avec une phase de vol, repli sur le clip hors du profil ; préréglages, validation, données de la page. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../moteur/demarche.js');
const S = require('../moteur/squelette.js');
const PA = require('../moteur/personnages/partition.js');
const P = require('../scripts/lib/personnages.js');
const GM = require('../scripts/lib/groupes-moteur.js');
const { preparerPersonnages, donneesPersonnages } = require('../scripts/lib/personnages-scene.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const lu = P.lire(null);
const BIB = { poses: lu.poses, clips: lu.clips, expressions: lu.expressions, demarches: lu.demarches };
const W = 1600, H = 900;
const DEG = Math.PI / 180;

/** Partition d'un personnage qui va de 10 % à 60 % en 3 s (marche) ou 1,4 s (course), à partir de 0,3 s. */
function partition(nom, { type = 'marcher', demarche = 'calculee', vue, clip, taille = 45 } = {}) {
  const g = S.completerGabarit(P.gabaritDe(lu.dessins[nom], lu));
  const echelle = taille / 100 * H / PA.hauteur(g);
  const fin = type === 'courir' ? 1.7 : 3.3;
  const a = { type, debut: 0.3, fin, vers: 60 };
  if (vue !== undefined) a.vue = vue;
  if (clip) a.clip = clip;
  return { g, echelle, fin, part: { x0: 10, sol0: 90, vue0: 0, calme: true, vie: 'pleine', sel: 7, scene: { debut: 0, fin: 5 }, largeur: W, hauteur: H,
    echelle, taille, sols: {}, actions: [a], demarche } };
}

/** Pose placée dans la scène comme scene.js (placerBase), puis le squelette. */
function rendu(x, t) {
  const e = PA.etatAuTemps(x.part, t, BIB, x.g);
  const pose = Object.assign(e.pose, { x: e.x / 100 * W, y: e.sol / 100 * H - (S.sol(x.g) + 7) * x.echelle, echelle: x.echelle });
  return { e, r: S.calculer(pose, x.g), pose };
}

/** Point d'appui d'un pied dans la scène : la cheville, plus la pointe à la semelle tournée de l'angle du pied (pivot). */
function appui(r, cote, g) {
  const A = r.articulations, p = r.efficace, c = A['cheville' + cote], th = (p['pied' + cote] || 0) * DEG;
  const sens = Math.cos(p.vue * DEG) >= 0 ? 1 : -1;
  const lx = g.pied * Math.cos(th) - D.SEMELLE * Math.sin(th), ly = g.pied * Math.sin(th) + D.SEMELLE * Math.cos(th);
  return [p.x + (c[0] + sens * lx) * p.echelle, p.y + (c[1] + ly) * p.echelle];
}

test('demarche : même t, même pose', () => {
  const d = D.demarche({ genre: 'marche' }, lu.gabarits.standard);
  assert.deepEqual(d.pose(0.37, 1), d.pose(0.37, 1));
  const un = d.pose(1.37, 1).angles, zero = d.pose(0.37, 1).angles;
  for (const k of Object.keys(zero)) assert.ok(Math.abs(un[k] - zero[k]) < 1e-9, `cycle : phase + 1, même pose (${k})`);
  const x = partition('passant');
  const ordre1 = [0.9, 1.2345, 2.5, 1.2345].map((t) => rendu(x, t).pose);
  const ordre2 = [1.2345, 3, 0.5].map((t) => rendu(partition('passant'), t).pose);
  assert.deepEqual(ordre1[1], ordre1[3], 'même t dans la même partition');
  assert.deepEqual(ordre2[0], ordre1[1], 'même t, une autre partition, un autre ordre');
  assert.notDeepEqual(ordre1[0], ordre1[1], 'il marche');
});

test('demarche : pied d\'appui immobile au sol à 0,5 % de la hauteur près', () => {
  for (const [nom, type] of [['passant', 'marcher'], ['enfant', 'marcher'], ['passant', 'courir'], ['touffu', 'marcher']]) {
    const x = partition(nom, { type });
    const d = D.demarche(lu.demarches[type === 'courir' ? 'course' : 'marche'], x.g);
    const haut = PA.hauteur(x.g) * x.echelle, sol = 0.9 * H;
    // Hors des fondus de départ et d'arrivée (0,25 s), à 1/120 s.
    const pistes = { Avant: [], Arriere: [] };
    for (let t = 0.3 + 0.26; t < x.fin - 0.01; t += 1 / 120) {
      const { e, r } = rendu(x, t);
      assert.equal(e.vue, 0);
      const dist = (e.x - 10) / 100 * W;
      const p = d.pose(dist / (x.echelle * d.cycle), 1);
      ['Avant', 'Arriere'].forEach((cote, i) => pistes[cote].push({ t, appui: p.pieds[i].appui, point: appui(r, cote, x.g) }));
    }
    let appuis = 0;
    for (const cote of ['Avant', 'Arriere']) {
      let serie = [];
      const juger = () => {
        if (serie.length >= 3) {
          appuis++;
          const xs = serie.map((s) => s.point[0]), ys = serie.map((s) => s.point[1]);
          const ecart = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
          assert.ok(ecart <= 0.005 * haut, `${nom} (${type}), pied ${cote} posé de ${serie[0].t.toFixed(3)} à ${serie[serie.length - 1].t.toFixed(3)} s : il bouge de ${(100 * ecart / haut).toFixed(3)} % de la hauteur`);
          for (const y of ys) assert.ok(Math.abs(y - sol) <= 0.005 * haut, `${nom} (${type}), pied ${cote} : au sol (${y.toFixed(2)} pour ${sol})`);
        }
        serie = [];
      };
      for (const s of pistes[cote]) { if (s.appui) serie.push(s); else juger(); }
      juger();
    }
    assert.ok(appuis >= 3, `${nom} (${type}) : ${appuis} appuis jugés`);
  }
});

test('demarche : hanche plus basse en double appui qu\'en appui simple ; course avec une phase sans appui', () => {
  const g = lu.gabarits.standard;
  const marche = D.demarche(lu.demarches.marche, g);
  const par = { 1: [], 2: [] };
  for (let k = 0; k < 400; k++) {
    const p = marche.pose(k / 400, 1);
    par[p.appuis].push(p.hanche[1]);
  }
  assert.ok(par[2].length > 0 && par[1].length > 0, 'double et simple appui');
  const moyenne = (l) => l.reduce((a, b) => a + b, 0) / l.length;
  // y vers le bas : plus basse = plus grand.
  assert.ok(moyenne(par[2]) > moyenne(par[1]) + 1, `double appui ${moyenne(par[2]).toFixed(2)}, simple ${moyenne(par[1]).toFixed(2)}`);
  assert.ok(Math.max(...par[2]) > Math.max(...par[1]), 'le point le plus bas est en double appui');
  assert.ok(Math.min(...par[1]) < Math.min(...par[2]), 'le point le plus haut est en appui simple');
  // Le squelette suit : bassin à la hauteur de la hanche calculée.
  const r = S.calculer(marche.pose(0.05, 1).angles, g);
  assert.ok(Math.abs(r.articulations.bassin[1] - marche.pose(0.05, 1).hanche[1]) < 1e-9);
  // Course : des instants sans aucun pied posé, la hanche plus haute en vol.
  const course = D.demarche(lu.demarches.course, g);
  const vol = [], posee = [];
  for (let k = 0; k < 400; k++) { const p = course.pose(k / 400, 1); (p.appuis === 0 ? vol : posee).push(p.hanche[1]); }
  assert.ok(vol.length > 20, `${vol.length} instants de vol sur 400`);
  assert.ok(Math.min(...vol) < Math.min(...posee), 'au plus haut en vol');
  // Marche : jamais sans appui ; allant 0 : les deux pieds posés au repos.
  for (let k = 0; k < 100; k++) assert.ok(marche.pose(k / 100, 1).appuis >= 1);
  const arret = marche.pose(0.3, 0);
  assert.equal(arret.appuis, 2);
  assert.ok(arret.pieds.every((p) => Math.abs(p.cheville[1] - (g.cuisse + g.tibia)) < 1e-9 && p.angle === 0));
  // Le pied posé recule exactement à foulee / (appui × periode).
  const L = g.cuisse + g.tibia;
  assert.ok(Math.abs(marche.vitesse - 0.7 * L / (0.62 * 1)) < 1e-9);
  const a = marche.pose(0.1, 1).pieds[0].cheville[0], b = marche.pose(0.2, 1).pieds[0].cheville[0];
  assert.ok(Math.abs((a - b) / (0.1 * marche.reglages.periode) - marche.vitesse) < 1e-9);
});

test('demarche : vue de 3/4, repli sur le clip marche', () => {
  const t = [0.8, 1.4, 2.2];
  // Marche vue de 3/4 (data-vue="45" sur l'action) : la pose de la partition est celle du clip, avec ou sans démarche calculée.
  const avec = partition('passant', { vue: 45 }), sans = partition('passant', { vue: 45, demarche: null });
  for (const x of t) assert.deepEqual(rendu(avec, x).pose, rendu(sans, x).pose, `t = ${x}`);
  // De face aussi ; de profil, elle change.
  const face = partition('passant', { vue: 90 }), faceSans = partition('passant', { vue: 90, demarche: null });
  assert.deepEqual(rendu(face, 1.4).pose, rendu(faceSans, 1.4).pose);
  const profil = partition('passant'), profilSans = partition('passant', { demarche: null });
  assert.notDeepEqual(rendu(profil, 1.4).pose, rendu(profilSans, 1.4).pose);
  // Pas traînés de 3/4 : le clip marche (les réglages n'ont pas d'images-clés).
  const traines = partition('passant', { vue: 45, clip: 'pas-traines' });
  assert.deepEqual(rendu(traines, 1.4).pose, rendu(sans, 1.4).pose);
  // De profil, les pas traînés diffèrent de la marche calculée (pied plus bas, pas plus courts).
  assert.notDeepEqual(rendu(partition('passant', { clip: 'pas-traines' }), 1.4).pose, rendu(profil, 1.4).pose);
});

test('demarche : sans data-demarche, la partition suit le clip exactement comme avant', () => {
  const sans = partition('touffu', { demarche: null });
  const bibSans = { poses: lu.poses, clips: lu.clips, expressions: lu.expressions };
  for (const t of [0.5, 1.1, 2.7]) {
    const a = PA.etatAuTemps(sans.part, t, bibSans, sans.g), b = PA.etatAuTemps(sans.part, t, BIB, sans.g);
    assert.deepEqual(a, b);
  }
});

test('demarches livrées : marche, pas-traines et course, réglages sans images-clés, valides', () => {
  assert.deepEqual(Object.keys(lu.demarches).sort(), ['course', 'marche', 'pas-traines']);
  assert.deepEqual(lu.erreurs.filter((e) => e.type === 'demarche'), []);
  for (const [nom, r] of Object.entries(lu.demarches)) {
    assert.equal(r.genre, nom);
    assert.equal(r.cles, undefined);
    assert.deepEqual(D.valider(r), []);
  }
  // Ni mouvement ni atelier : la liste des clips ne change pas.
  assert.equal(lu.clips['pas-traines'], undefined);
  assert.ok(lu.clips.marche.cles.length > 0);
  // Une démarche de la vidéo, invalide, est signalée et écartée.
  const v = dossierTemporaire('pm-demarche-');
  fs.mkdirSync(path.join(v, 'personnages', 'clips', 'demarches'), { recursive: true });
  fs.writeFileSync(path.join(v, 'personnages', 'clips', 'demarches', 'trop.json'), JSON.stringify({ genre: 'course', appui: 0.7, couleur: 1 }));
  fs.writeFileSync(path.join(v, 'personnages', 'clips', 'demarches', 'lente.json'), JSON.stringify({ nom: 'lente', genre: 'marche', periode: 1.6 }));
  const lv = P.lire(v);
  assert.equal(lv.demarches.trop, undefined);
  assert.equal(lv.demarches.lente.periode, 1.6);
  const msg = lv.erreurs.filter((e) => e.type === 'demarche').map((e) => e.message).join('\n');
  assert.match(msg, /« appui » .*vol/);
  assert.match(msg, /champ « couleur » inconnu/);
});

test('demarche dans la scène : data-demarche validé, démarche par data-clip, données et groupes seulement s\'il sert', () => {
  const scene = (attr, clip = '') => `<section data-scene="s"><div id="p" data-personnage="passant"${attr}><i data-action="marcher" data-vers="60" data-dur="2"${clip}></i></div></section>`;
  const ok = preparerPersonnages(scene(' data-demarche="calculee"', ' data-clip="pas-traines"'), { scene: 's', lu });
  assert.deepEqual(ok.erreurs, []);
  assert.equal(ok.utilises.demarche, true);
  assert.deepEqual(Object.keys(donneesPersonnages(ok.utilises, lu).bib.demarches).sort(), ['course', 'marche', 'pas-traines']);
  const faux = preparerPersonnages(scene(' data-demarche="oui"'), { scene: 's', lu });
  assert.match(faux.erreurs.map((e) => e.message).join(), /data-demarche="oui" : seule valeur, « calculee »/);
  const sansAttr = preparerPersonnages(scene('', ' data-clip="pas-traines"'), { scene: 's', lu });
  assert.match(sansAttr.erreurs.map((e) => e.message).join(), /démarche calculée : poser data-demarche="calculee"/);
  const rien = preparerPersonnages(scene(''), { scene: 's', lu });
  assert.equal(rien.utilises.demarche, false);
  assert.equal('demarches' in donneesPersonnages(rien.utilises, lu).bib, false, 'aucune donnée de plus dans les pages d\'avant');
  // Moteur à la carte.
  const d = { personnages: {} };
  assert.deepEqual(GM.groupesDuDeroule(d, [scene('')]).filter((x) => x === 'demarche' || x === 'physique'), []);
  assert.deepEqual(GM.groupesDuDeroule(d, [scene(' data-demarche="calculee"')]).filter((x) => x === 'demarche' || x === 'physique'), ['demarche', 'physique']);
  assert.ok(GM.modulesDesGroupes(['tronc', 'personnages', 'demarche']).includes('demarche.js'));
});
