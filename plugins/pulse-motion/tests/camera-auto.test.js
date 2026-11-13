'use strict';
/* Spec « Explication narrée » (S7), plan J3 « Caméra automatique » (5.8) : le plan de la caméra, calcul pur. Les cas de
 * test/director.test.js d'explainroo (MIT, © 2026 Vincent Schmalbach), traduits (genres et champs en français, cadre en
 * pixels de 1920 × 1080 comme l'original), puis l'analyse de data-camera="auto", le pont avec le relevé, les groupes du
 * moteur, le déroulé et le contrôle sans navigateur. */
const test = require('node:test');
const assert = require('node:assert/strict');
const CA = require('../moteur/camera-auto.js');
const { planifierCamera, cameraA, enMouvement, composer, rectCadre, rectVue } = CA;

const cadre = { L: 1920, H: 1080 };
const vue = { x: 134, y: 76, l: 1652, h: 928 };
// Genres d'explainroo -> genres de Pulse Motion : text texte, shape carte, arrow fleche, line trait, label etiquette,
// icon image, chart graphique, code code, focus cadrage.
const GENRES = { text: 'texte', shape: 'carte', arrow: 'fleche', line: 'trait', label: 'etiquette', icon: 'image', chart: 'graphique', code: 'code', focus: 'cadrage' };
const el = (genre, x, y, l, h, debut, sortie = Infinity) => ({ genre: GENRES[genre], debut, sortie, boite: { x: x + l / 2, y: y + h / 2, l, h } });
const centre = (genre, x, y, l, h, debut, sortie = Infinity, extra = {}) => ({ genre: GENRES[genre], boite: { x, y, l, h }, debut, sortie, ...extra });

/** Cartes ou étiquettes coupées par le plan : chacune est entièrement dans l'image, ou entièrement dehors. */
function coupes(plan, elements, marge = 1) {
  const r = rectCadre(plan, vue, cadre);
  return elements.filter((e) => {
    if (e.genre === 'fleche' || e.genre === 'trait') return false;
    const b = { x0: e.boite.x - e.boite.l / 2, x1: e.boite.x + e.boite.l / 2, y0: e.boite.y - e.boite.h / 2, y1: e.boite.y + e.boite.h / 2 };
    const dehors = b.x1 <= r.x0 + marge || b.x0 >= r.x1 - marge || b.y1 <= r.y0 + marge || b.y0 >= r.y1 - marge;
    const dedans = b.x0 >= r.x0 - marge && b.x1 <= r.x1 + marge && b.y0 >= r.y0 - marge && b.y1 <= r.y1 + marge;
    return !dedans && !dehors;
  });
}
const entier = (plan, e, v = vue) => {
  const r = rectCadre(plan, v, cadre);
  return e.boite.x - e.boite.l / 2 >= r.x0 - 0.5 && e.boite.x + e.boite.l / 2 <= r.x1 + 0.5 && e.boite.y - e.boite.h / 2 >= r.y0 - 0.5 && e.boite.y + e.boite.h / 2 <= r.y1 + 0.5;
};
/** Changements de sens du zoom (avant après arrière, ou l'inverse) à moins de « ecart » s l'un de l'autre. */
function allersRetours(plan, ecart = 5) {
  let prec = null;
  let n = 0;
  for (const m of plan.mouvements) {
    const dz = Math.log(m.vers.z / m.de.z);
    if (Math.abs(dz) < 0.1) continue;
    if (prec && Math.sign(dz) !== prec.signe && m.debut - prec.debut < ecart) n++;
    prec = { signe: Math.sign(dz), debut: m.debut };
  }
  return n;
}

const schema = [
  el('text', 760, 90, 400, 90, 0.1),
  el('shape', 200, 450, 260, 140, 1.5),
  el('arrow', 470, 500, 300, 40, 2.6),
  el('shape', 780, 450, 260, 140, 2.8),
  el('arrow', 1050, 500, 300, 40, 4.4),
  el('shape', 1360, 450, 260, 140, 4.6),
  el('text', 1360, 640, 260, 40, 6.2),
];

// --- Les cas de director.test.js, traduits ----------------------------------------------------------------------------

test('caméra auto : aucun élément, aucune caméra', () => {
  assert.equal(planifierCamera([], { duree: 5, vue, cadre }), null);
  assert.equal(planifierCamera([el('shape', 0, 0, 1920, 1080, 0)], { duree: 5, vue, cadre }), null);
});

test('caméra auto : une scène qui commence petit commence serré et s\'élargit', () => {
  const rangee = [0, 1, 2, 3].map((i) => el('shape', 260 + i * 380, 470, 220, 140, 0.5 + i * 3));
  const plan = planifierCamera(rangee, { duree: 14, vue, cadre });
  assert.ok(plan.depart.z > 1.3, 'le premier plan est serré');
  for (const m of plan.mouvements) assert.ok(m.vers.z <= m.de.z + 1e-9, `pas de rapprochement à ${m.debut}`);
  const fin = rectCadre(cameraA(plan, 13.9), vue, cadre);
  for (const e of rangee) assert.ok(e.boite.x - e.boite.l / 2 >= fin.x0 && e.boite.x + e.boite.l / 2 <= fin.x1, 'la fin montre tout');
});

test('caméra auto : un élément qui tient déjà dans le plan ne fait pas bouger', () => {
  // Un grand graphique, puis un trait et une étiquette dessinés dedans.
  const graphique = [el('shape', 260, 160, 1400, 760, 0.2), el('line', 560, 540, 800, 0, 3), el('text', 900, 600, 160, 40, 6.5)];
  assert.equal(planifierCamera(graphique, { duree: 11, vue, cadre }).mouvements.length, 0);
});

test('caméra auto : rapprochement quand il y a le temps, pas juste après, recul à la fin', () => {
  const scene = [el('shape', 200, 200, 600, 300, 0.2), el('shape', 1100, 200, 600, 300, 0.2), el('text', 1250, 700, 300, 50, 3), el('text', 300, 700, 300, 50, 6.5)];
  const plan = planifierCamera(scene, { duree: 13, vue, cadre, finVoix: 11 });
  const rapprochements = plan.mouvements.filter((m) => m.vers.z > m.de.z * 1.1);
  assert.equal(rapprochements.length, 1, 'un rapprochement');
  assert.ok(Math.abs(rapprochements[0].debut - 2.7) < 1e-6, 'sur la première note');
  const fin = rectCadre(cameraA(plan, 12.9), vue, cadre);
  for (const e of scene) assert.ok(e.boite.x - e.boite.l / 2 >= fin.x0 - 0.5 && e.boite.x + e.boite.l / 2 <= fin.x1 + 0.5, 'la fin montre tout');
});

test('caméra auto : pas d\'aller-retour de zoom en moins de 5 s', () => {
  // Des choses nouvelles toutes les deux secondes, loin les unes des autres.
  const points = [[200, 200], [1500, 800], [300, 820], [1450, 180], [860, 500], [200, 500], [1500, 500]];
  const scene = points.map(([x, y], i) => el('shape', x - 90, y - 50, 180, 100, 0.2 + i * 2));
  const plan = planifierCamera(scene, { duree: 16, vue, cadre, finVoix: 14 });
  for (let i = 1; i < plan.mouvements.length; i++) assert.ok(plan.mouvements[i].debut - plan.mouvements[i - 1].debut >= 2.2 - 1e-9, 'mouvements espacés');
  assert.ok(allersRetours(plan) <= 1, `allers-retours : ${allersRetours(plan)}`);
  assert.ok(plan.mouvements.length <= 5, `mouvements : ${plan.mouvements.length}`);
});

test('caméra auto : aucun plan tenu ne coupe une carte ou une étiquette, dérive comprise', () => {
  const plan = planifierCamera(schema, { duree: 12, vue, cadre, finVoix: 9 });
  const tenus = [0.05, ...plan.mouvements.map((m) => m.debut + m.duree + 0.01), 11.9];
  for (const t of tenus) {
    const visibles = schema.filter((e) => e.debut <= t && e.sortie > t);
    assert.deepEqual(coupes(cameraA(plan, t), visibles).map((e) => e.genre), [], `t=${t}`);
  }
});

test('caméra auto : la caméra est continue et ne se dit en mouvement que pendant un vrai mouvement', () => {
  const plan = planifierCamera(schema, { duree: 12, vue, cadre, finVoix: 9 });
  let prec = cameraA(plan, 0);
  for (let t = 0.01; t < 12; t += 0.01) {
    const c = cameraA(plan, t);
    assert.ok(Math.abs(c.x - prec.x) < 25 && Math.abs(c.y - prec.y) < 25 && Math.abs(Math.log(c.z / prec.z)) < 0.03, `saut à ${t.toFixed(2)}`);
    prec = c;
  }
  const m = plan.mouvements[0];
  assert.equal(enMouvement(plan, m.debut + m.duree / 2), true);
  assert.equal(enMouvement(plan, m.debut - 0.01), false);
});

test('caméra auto : un gros plan laisse un voisin entièrement dehors ou le prend, et se replie sur l\'image entière', () => {
  const rangee = [0, 1, 2, 3, 4].map((i) => el('shape', 805 + i * 205, 335, 190, 130, 3 + i * 0.2));
  const musique = el('icon', 1050, 700, 120, 120, 6.7);
  const plan = composer([musique], [...rangee, musique], vue, cadre);
  assert.ok(plan.z > 1.2);
  assert.deepEqual(coupes(plan, rangee), []);
  // Un voisin qui serre le sujet de tous les côtés ne peut pas être évité.
  const sujet = el('shape', 900, 500, 120, 80, 1);
  const anneau = [el('text', 700, 380, 600, 60, 0), el('text', 700, 640, 600, 60, 0), el('text', 560, 380, 60, 320, 0), el('text', 1300, 380, 60, 320, 0)];
  const serre = composer([sujet], [sujet, ...anneau], vue, cadre);
  assert.deepEqual(coupes(serre, anneau), []);
  const v = rectVue(serre, vue);
  assert.ok(sujet.boite.x - sujet.boite.l / 2 >= v.x0 && sujet.boite.x + sujet.boite.l / 2 <= v.x1);
});

test('caméra auto : une scène continue la précédente quand sa première image est la dernière image de celle-ci', () => {
  const a = [el('shape', 200, 450, 260, 140, 0), el('shape', 780, 450, 260, 140, 1), el('text', 780, 640, 260, 40, 2)];
  const b = [el('shape', 200, 450, 260, 140, -1), el('shape', 780, 450, 260, 140, -1), el('text', 780, 640, 260, 40, -1), el('shape', 1360, 450, 260, 140, 2)];
  const tout = { x0: 0, y0: 0, x1: 1920, y1: 1080 };
  assert.equal(CA.continue(a, b, tout), true);
  // Pas quand a finit sur une chose que b laisse de côté.
  assert.equal(CA.continue(a, b.filter((e) => e.genre !== 'texte'), tout), false);
  // Pas quand le dernier gros plan de a montre peu de ce que b reprend.
  assert.equal(CA.continue(a, b, { x0: 760, y0: 620, x1: 1060, y1: 700 }), false);
  // Pas quand b dessine sa propre image.
  assert.equal(CA.continue(a, [el('shape', 100, 100, 200, 100, -1), el('shape', 400, 100, 200, 100, -1)], tout), false);
});

test('caméra auto : une scène qui continue la précédente part de son dernier plan', () => {
  const depart = { x: 700, y: 520, z: 1.4 };
  const plan = planifierCamera(schema, { duree: 12, vue, cadre, depart, immobile: 0.6 });
  assert.deepEqual(plan.depart, depart);
  assert.ok(plan.mouvements.every((m) => m.debut >= 0.6));
  const c = cameraA(plan, 0);
  assert.ok(Math.abs(c.x - depart.x) < 1e-9 && Math.abs(c.z - depart.z) < 1e-9);
});

test('caméra auto : l\'allure 1,5 raccourcit les mouvements', () => {
  const lente = planifierCamera(schema, { duree: 12, vue, cadre, allure: 1 });
  const vive = planifierCamera(schema, { duree: 12, vue, cadre, allure: 1.5 });
  assert.ok(lente.mouvements.length && vive.mouvements.length);
  assert.ok(vive.mouvements[0].duree < lente.mouvements[0].duree);
});

test('caméra auto : le plan d\'ouverture ne coupe rien de ce qui est à l\'écran avant le premier mouvement', () => {
  // Deux cartes d'ouverture partent à 1 s ; le gros plan sur la carte de 2 s les couperait.
  const ouverture = [el('shape', 160, 150, 1600, 100, 0, 1), el('shape', 700, 440, 400, 200, 0, 1), el('shape', 1300, 465, 200, 150, 2)];
  const plan = planifierCamera(ouverture, { duree: 8, vue, cadre });
  for (const t of [0.05, 0.5, 0.9]) {
    const visibles = ouverture.filter((e) => e.debut <= t && e.sortie > t);
    assert.deepEqual(coupes(cameraA(plan, t), visibles).map((e) => e.boite.x), [], `t=${t}`);
  }
});

test('caméra auto : chaque mouvement finit avant la fin de la scène', () => {
  const tard = [el('shape', 200, 450, 260, 140, 0), el('shape', 1500, 700, 200, 120, 7.5)];
  const plan = planifierCamera(tard, { duree: 8, vue, cadre });
  for (const m of plan.mouvements) assert.ok(m.debut + m.duree <= 8 + 1e-9, `mouvement ${m.debut}+${m.duree}`);
});

test('caméra auto : un plan d\'image entière ne fait pas dériver sous les boutons de l\'application ce qui tient dans la part libre', () => {
  const haut = { L: 1080, H: 1920 };
  const sure = { x: 119, y: 240, l: 745, h: 1027 };
  const utile = { x0: 119, y0: 240, x1: 864, y1: 1267 };
  const cartes = [el('shape', 119, 703, 200, 100, 0), el('shape', 664, 703, 200, 100, 0.2)];
  const plan = planifierCamera(cartes, { duree: 8, vue: sure, cadre: haut, utile });
  for (const t of [0.5, 4, 7.9]) {
    const cam = cameraA(plan, t);
    const cx = sure.x + sure.l / 2;
    for (const e of cartes) {
      const x0 = cx + (e.boite.x - e.boite.l / 2 - cam.x) * cam.z;
      const x1 = cx + (e.boite.x + e.boite.l / 2 - cam.x) * cam.z;
      assert.ok(x0 >= utile.x0 - 0.5 && x1 <= utile.x1 + 0.5, `t=${t} : ${x0.toFixed(1)}..${x1.toFixed(1)}`);
    }
  }
});

test('caméra auto : les plans évitent la bande des sous-titres', () => {
  // Bande des sous-titres à partir de 860 px : rien de ce qui est montré pendant un plan tenu n'y descend.
  const utile = { x0: 0, y0: 0, x1: 1920, y1: 860 };
  const scene = [el('shape', 200, 200, 600, 300, 0.2), el('shape', 1100, 200, 600, 300, 0.2), el('text', 1250, 700, 300, 50, 3), el('text', 300, 700, 300, 50, 6.5)];
  const plan = planifierCamera(scene, { duree: 13, vue, cadre, finVoix: 11, utile });
  const cy = vue.y + vue.h / 2;
  for (let t = 0.05; t < 13; t += 0.1) {
    if (enMouvement(plan, t)) continue;
    const cam = cameraA(plan, t);
    const r = rectCadre(cam, vue, cadre);
    for (const e of scene.filter((x) => x.debut <= t)) {
      const visible = e.boite.y + e.boite.h / 2 > r.y0 && e.boite.y - e.boite.h / 2 < r.y1 && e.boite.x + e.boite.l / 2 > r.x0 && e.boite.x - e.boite.l / 2 < r.x1;
      if (!visible) continue;
      const bas = cy + (e.boite.y + e.boite.h / 2 - cam.y) * cam.z;
      assert.ok(bas <= utile.y1 + 0.5, `t=${t.toFixed(2)} : bas à ${bas.toFixed(1)} px`);
    }
  }
});

test('caméra auto : un mouvement qui garde entière une chose nouvelle se fait, si petit soit-il', () => {
  const large = { x: 76, y: 76, l: 1768, h: 928 };
  const items = [centre('shape', 1525, 650, 500, 100, 0), centre('shape', 1000, 450, 550, 300, 3), centre('shape', 900, 300, 400, 100, 4.5), centre('shape', 1200, 900, 500, 200, 6)];
  const plan = planifierCamera(items, { duree: 14, vue: large, cadre, finVoix: 12 });
  for (let t = 6.2; t < 13.9; t += 0.1) if (!enMouvement(plan, t)) assert.ok(entier(cameraA(plan, t), items[3], large), `t=${t.toFixed(1)}`);
});

test('caméra auto : une zone cadrée est montrée entière, et une flèche qui tient ne l\'annule pas', () => {
  const panoramique = [centre('code', 960, 540, 1600, 700, 0), centre('focus', 600, 540, 200, 80, 0, 3.9, { explicite: true }), centre('focus', 1050, 540, 200, 80, 4, Infinity, { explicite: true })];
  assert.ok(entier(cameraA(planifierCamera(panoramique, { duree: 14, vue, cadre, finVoix: 12 }), 6), panoramique[2]));
  const fleche = [centre('shape', 960, 540, 1400, 700, 0), centre('focus', 960, 540, 200, 80, 3, Infinity, { explicite: true }), centre('arrow', 960, 700, 500, 20, 3.9)];
  assert.ok(cameraA(planifierCamera(fleche, { duree: 14, vue, cadre, finVoix: 12 }), 6).z > 1.5, 'le gros plan a lieu');
});

test('caméra auto : un rapprochement est tenu un moment avant que la caméra recule', () => {
  const items = [centre('shape', 500, 350, 600, 300, 0), centre('shape', 1400, 350, 600, 300, 0), centre('text', 1400, 725, 300, 50, 8.5)];
  const plan = planifierCamera(items, { duree: 12, vue, cadre, finVoix: 10 });
  plan.mouvements.forEach((m, i) => {
    if (m.vers.z <= m.de.z * 1.1) return;
    const suivant = plan.mouvements[i + 1] ? plan.mouvements[i + 1].debut : 12;
    assert.ok(suivant - (m.debut + m.duree) >= 1.5 - 1e-9, `tenu ${(suivant - m.debut - m.duree).toFixed(2)} s`);
  });
});

test('caméra auto : un grand graphique est l\'image, et une étiquette dedans n\'a pas de gros plan', () => {
  const items = [centre('chart', 960, 540, 1600, 800, 0), centre('line', 960, 540, 1400, 0, 3), centre('text', 960, 700, 160, 40, 6.5)];
  const plan = planifierCamera(items, { duree: 12, vue, cadre, finVoix: 10 });
  for (let t = 0.1; t < 11.9; t += 0.5) assert.ok(entier(cameraA(plan, t), items[0]), `t=${t.toFixed(1)}`);
});

test('caméra auto : un rapprochement laisse la place à un cadrage qui vient juste après', () => {
  const items = [centre('shape', 500, 350, 600, 300, 0), centre('shape', 1400, 350, 600, 300, 0), centre('text', 500, 725, 300, 50, 3), centre('focus', 1400, 350, 200, 80, 5.5, Infinity, { explicite: true })];
  const plan = planifierCamera(items, { duree: 12, vue, cadre, finVoix: 10 });
  plan.mouvements.forEach((m, i) => {
    const suivant = plan.mouvements[i + 1] ? plan.mouvements[i + 1].debut : 12;
    if (m.vers.z > m.de.z * 1.1) assert.ok(suivant - (m.debut + m.duree) >= 1.5 - 1e-9, `tenu ${(suivant - m.debut - m.duree).toFixed(2)} s`);
  });
  assert.ok(entier(cameraA(plan, 8), items[3]) && cameraA(plan, 8).z > 1.5, 'le cadrage a son gros plan');
});

test('caméra auto : une scène trop courte pour le recul finit quand même sur l\'image entière', () => {
  // Trois étapes en rangée ; la dernière arrive une seconde avant la fin, et elles restent jusqu'au bout.
  for (const sortie of [Infinity, 5.6]) {
    const etapes = [0, 1, 2].map((i) => el('shape', 300 + i * 520, 470, 260, 140, [0.3, 2.4, 4.4][i], sortie));
    const fin = cameraA(planifierCamera(etapes, { duree: 5.6, vue, cadre, finVoix: 5 }), 5.55);
    for (const e of etapes) assert.ok(entier(fin, e), `étape de ${e.debut}, sortie ${sortie}`);
  }
});

test('caméra auto : un dernier rapprochement devenu plan large garde entières les choses suivantes', () => {
  const boites = [[1383, 438, 382, 227, 0], [1632, 306, 119, 209, 0.89], [622, 541, 303, 71, 1.38], [737, 839, 113, 70, 2.19], [252, 632, 252, 163, 3.06]];
  const items = boites.map(([x, y, l, h, debut]) => centre('shape', x, y, l, h, debut));
  const plan = planifierCamera(items, { duree: 5.7, vue, cadre, allure: 1 });
  const pose = Math.max(3.06, ...plan.mouvements.map((m) => m.debut + m.duree));
  for (let t = pose + 0.05; t < 5.7; t += 0.1) assert.ok(entier(cameraA(plan, t), items[4]), `t=${t.toFixed(2)}`);
});

test('caméra auto : une scène continuée finit aussi sur l\'image entière', () => {
  const items = [centre('shape', 350, 540, 260, 140, 0), centre('shape', 850, 540, 260, 140, 0), centre('shape', 1450, 540, 260, 140, 3.5)];
  const fin = cameraA(planifierCamera(items, { duree: 4.8, vue, cadre, depart: { x: 600, y: 540, z: 1.7 }, immobile: 0.7 }), 4.75);
  for (const e of items) assert.ok(entier(fin, e), `boîte en ${e.boite.x}`);
});

test('caméra auto : une étiquette de flèche reste entière, une flèche n\'a pas de gros plan', () => {
  const els = [el('shape', 300, 420, 300, 160, 0.3), el('shape', 1100, 420, 300, 160, 0.3), el('arrow', 600, 480, 500, 40, 4), el('label', 700, 380, 300, 40, 4), el('shape', 1300, 760, 300, 120, 9)];
  const plan = planifierCamera(els, { duree: 14, vue, cadre });
  assert.ok(!plan.mouvements.some((m) => m.debut > 3 && m.debut < 5.5), JSON.stringify(plan.mouvements.map((m) => m.debut)));
  for (let t = 0; t < 14; t += 0.05) {
    if (enMouvement(plan, t)) continue;
    assert.deepEqual(coupes(cameraA(plan, t), els.filter((e) => e.debut <= t && e.sortie > t)), [], `t=${t.toFixed(2)}`);
  }
  // Un gros plan à côté d'une flèche laisse son étiquette dehors ou la prend.
  const etiquette = el('label', 520, 300, 360, 50, 0);
  const plan2 = composer([el('shape', 860, 360, 200, 120, 0)], [etiquette, el('arrow', 400, 360, 460, 30, 0)], vue, cadre);
  assert.ok(plan2.z > 1.2, `z ${plan2.z}`);
  assert.deepEqual(coupes(plan2, [etiquette]), []);
});

test('caméra auto : une icône sans texte n\'a pas de gros plan', () => {
  // L'image remplit le cadre dès le début : l'icône tient dans le plan.
  const image = [el('text', 560, 120, 800, 120, 0.2), el('shape', 150, 400, 300, 300, 0.2), el('shape', 1470, 400, 300, 300, 0.2)];
  const plan = (icone) => planifierCamera([...image, icone], { duree: 12, vue, cadre, finVoix: 11 });
  const icone = el('icon', 900, 600, 120, 120, 3);
  const nue = plan({ ...icone, nu: true });
  assert.ok(!nue.mouvements.some((m) => m.debut > 2 && m.debut < 4 && m.vers.z > m.de.z * 1.2), JSON.stringify(nue.mouvements));
  const legendee = plan({ ...icone, boite: { ...icone.boite, h: 190 } });
  assert.ok(legendee.mouvements.some((m) => m.debut > 2 && m.debut < 4 && m.vers.z > m.de.z * 1.2), JSON.stringify(legendee.mouvements));
});

test('caméra auto : l\'étiquette d\'une flèche ne compte pas seule quand une scène continue la précédente', () => {
  const carte = (x) => el('shape', x, 450, 260, 140, 0.5);
  const fleche = (x) => el('arrow', x, 500, 300, 40, 1);
  const etiquette = (x) => el('label', x + 60, 440, 180, 40, 1);
  const tout = { x0: 0, y0: 0, x1: 1920, y1: 1080 };
  const a = [carte(200), carte(780), fleche(470), etiquette(470), carte(1360), fleche(1050), etiquette(1050)];
  const b = [carte(200), carte(780), carte(1360), fleche(470), etiquette(470)].map((e) => ({ ...e, debut: -1 }));
  const sans = (l) => l.filter((e) => e.genre !== 'etiquette');
  assert.equal(CA.continue(a, b, tout), CA.continue(sans(a), sans(b), tout));
  const deux = [carte(200), carte(780), fleche(470), etiquette(470), fleche(1050), etiquette(1050)];
  const une = [carte(200), carte(780), fleche(470)].map((e) => ({ ...e, debut: -1 }));
  assert.ok(CA.continue(deux, une, tout));
});

// --- Pulse Motion : unités, relevé, attribut, déroulé, contrôle ---------------------------------------------------------

test('caméra auto : le plan est le même en cqh et en pixels, et ne tire rien au hasard', () => {
  const k = 100 / 1080;
  const enCqh = schema.map((e) => ({ ...e, boite: { x: e.boite.x * k, y: e.boite.y * k, l: e.boite.l * k, h: e.boite.h * k } }));
  const cqh = { L: 1920 * k, H: 100 };
  const a = planifierCamera(schema, { duree: 12, vue, cadre, finVoix: 9 });
  const vueCqh = { x: vue.x * k, y: vue.y * k, l: vue.l * k, h: vue.h * k };
  for (const c of ['x', 'y', 'l', 'h']) assert.ok(Math.abs(CA.vueDe(cqh)[c] - vueCqh[c]) < 0.1, `vue ${c}`);
  const b = planifierCamera(enCqh, { duree: 12, vue: vueCqh, cadre: cqh, finVoix: 9 });
  assert.equal(a.mouvements.length, b.mouvements.length);
  a.mouvements.forEach((m, i) => {
    assert.ok(Math.abs(m.debut - b.mouvements[i].debut) < 1e-6 && Math.abs(m.vers.z - b.mouvements[i].vers.z) < 1e-6, `mouvement ${i}`);
    const x = CA.versCamera(m.vers, cadre), y = CA.versCamera(b.mouvements[i].vers, cqh);
    assert.ok(Math.abs(x.x - y.x) < 0.01 && Math.abs(x.y - y.y) < 0.01, `point visé ${i}`);
  });
  assert.deepEqual(planifierCamera(schema, { duree: 12, vue, cadre, finVoix: 9 }), a);
});

test('caméra auto : le relevé donne ses éléments (secondes réelles, cadrage explicite borné, élément nu)', () => {
  const releve = { largeur: 177.78, hauteur: 100, elements: [
    { cle: 'a', genre: 'carte', debut: 0.4, fin: 1.2, boite: { x: 40, y: 50, l: 30, h: 12 }, forme: 'rect', nu: false },
    { cle: 'b', genre: 'image', debut: 1, fin: 2, boite: { x: 90, y: 50, l: 10, h: 10 }, forme: 'rect', nu: true },
    { cle: 'c', genre: 'cadrage', debut: 2, fin: 5, boite: { x: 40, y: 50, l: 30, h: 12 }, forme: 'rect', nu: false, explicite: true },
  ] };
  const e = CA.depuisReleve(releve, { rythme: 2 });
  assert.deepEqual(e.map((x) => [x.genre, x.debut, x.sortie, !!x.nu, !!x.explicite]), [['carte', 0.2, undefined, false, false], ['image', 0.5, undefined, true, false], ['cadrage', 1, 2.5, false, true]]);
  assert.deepEqual(CA.versCamera({ x: 88.89, y: 50, z: 1.5 }, { L: 177.78, H: 100 }), { zoom: 1.5, x: 50, y: 50 });
});

test('caméra auto : clause zoom avec auto → camera-auto-melangee', () => {
  const { analyserCamera } = require('../moteur/camera.js');
  const c = analyserCamera('auto; secousse 1 3+0.2; saturation 1→0.6 0+4', null);
  assert.equal(c.auto, true);
  assert.deepEqual(c.map((x) => x.prop), ['secousse', 'saturation']);
  assert.equal(analyserCamera('zoom 1→1.1 0+4', null).auto, undefined);
  for (const v of ['auto; zoom 1→1.2 0+2', 'x 40→60 0+2; auto', 'auto; y 50→40 1+1']) {
    assert.throws(() => analyserCamera(v, null), (e) => e.regle === 'camera-auto-melangee' && /« auto » cadre seule/.test(e.message), v);
  }
});

test('caméra auto : groupes du moteur (relevé à part, caméra automatique seulement si une scène la demande)', () => {
  const GM = require('../scripts/lib/groupes-moteur.js');
  const fs = require('node:fs');
  const path = require('node:path');
  assert.deepEqual(GM.GROUPES.releve, ['releve.js']);
  assert.deepEqual(GM.GROUPES['camera-auto'], ['camera-auto.js', 'camera-auto-page.js']);
  for (const m of GM.GROUPES['camera-auto']) assert.ok(GM.MODULES.includes(m) && fs.existsSync(path.join(__dirname, '..', 'moteur', m)), m);
  const g = (html) => GM.groupesDuDeroule({}, [`<section>${html}</section>`]);
  assert.deepEqual(g('<div data-camera="auto"></div>'), ['tronc', 'camera-auto', 'releve']);
  assert.deepEqual(g('<div data-camera="auto; secousse 1 2+0.2"></div>'), ['tronc', 'camera-auto', 'releve']);
  assert.deepEqual(g('<div data-camera="zoom 1→1.1 0+4"></div>'), ['tronc']);
  assert.deepEqual(g('<i data-fleche="#a → #b"></i>'), ['tronc', 'dessin', 'main-levee', 'releve']);
  // Le relevé est chargé avant le calque et la caméra automatique.
  const ordre = GM.modulesDesGroupes(['tronc', 'releve', 'dessin', 'camera-auto']);
  assert.ok(ordre.indexOf('releve.js') < ordre.indexOf('dessin/calque.js') && ordre.indexOf('releve.js') < ordre.indexOf('camera-auto-page.js'));
});

test('caméra auto : déroulé (camera, scenes[].camera), camera-auto-absente, cadrage-cible-introuvable, preuve du déterminisme', () => {
  const { validerDeroule } = require('../scripts/lib/deroule.js');
  const base = { version: 1, titre: 'a', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9' }, style: 'x', scenes: [{ id: 's', fichier: 'f', duree: 2, textes: {} }] };
  assert.deepEqual(validerDeroule({ ...base, camera: 'auto' }), []);
  assert.match(validerDeroule({ ...base, camera: 'mobile' }).join(' '), /« camera » doit valoir « auto »/);
  assert.match(validerDeroule({ ...base, scenes: [{ ...base.scenes[0], camera: 'z' }] }).join(' '), /La scène « s » : « camera » doit valoir « auto » ou « fixe »/);
  const C = require('../scripts/lib/camera-auto.js');
  const scene = { id: 's' };
  assert.deepEqual(C.controlerCameraAuto('<div data-camera="auto"><p id="prix"></p></div>', { deroule: { camera: 'auto' }, scene }), []);
  const absente = C.controlerCameraAuto('<p id="prix"></p>', { deroule: { camera: 'auto' }, scene });
  assert.deepEqual(absente.map((p) => [p.regle, p.gravite]), [['camera-auto-absente', 'alerte']]);
  assert.deepEqual(C.controlerCameraAuto('<p></p>', { deroule: { camera: 'auto' }, scene: { id: 's', camera: 'fixe' } }), []);
  const cible = C.controlerCameraAuto('<div data-camera="auto"><p id="prix"></p><i data-cadrer="#pri" data-start="1" data-dur="2"></i></div>', { deroule: {}, scene });
  assert.equal(cible[0].regle, 'cadrage-cible-introuvable');
  assert.match(cible[0].message, /#pri[^]*#prix/);
  const D = require('../scripts/lib/determinisme.js');
  assert.deepEqual(D.concernees({ parScene: [{ id: 's', section: '<section data-scene="s"><div data-camera="auto"></div></section>', scripts: [] }] }).map((c) => c.raisons), [['camera']]);
});
