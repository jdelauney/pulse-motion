'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../moteur/courbes.js');

const proche = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const SAUF_OSCILLATEUR = C.TYPES.filter((t) => t !== 'wave');

test('chaque type en mode in, out, inout, outin va de 0 à 1', () => {
  for (const type of SAUF_OSCILLATEUR) {
    for (const mode of ['in', 'out', 'inout', 'outin']) {
      const f = C.courbe(type, mode);
      assert.ok(proche(f(0), 0, 1e-3), `${type}-${mode}(0) = ${f(0)}`);
      assert.ok(proche(f(1), 1, 1e-3), `${type}-${mode}(1) = ${f(1)}`);
    }
  }
});

test('modes aller-retour : valeurs à 0, 0,5 et 1', () => {
  const attendu = {
    'spike': [0, 1, 0], 'spike-inv': [1, 0, 1],
    'arch': [0, 1, 0], 'arch-inv': [1, 0, 1],
    'spike-arch': [0, 1, 0], 'arch-spike': [0, 1, 0],
    'in-inv': [1, null, 0], 'out-inv': [1, null, 0],
  };
  for (const type of ['linear', 'quad', 'cubic', 'sine', 'expo', 'circle']) {
    for (const [mode, [a, b, c]] of Object.entries(attendu)) {
      const f = C.courbe(type, mode);
      assert.ok(proche(f(0), a, 1e-3), `${type}-${mode}(0) = ${f(0)}`);
      if (b !== null) assert.ok(proche(f(0.5), b, 1e-3), `${type}-${mode}(0.5) = ${f(0.5)}`);
      assert.ok(proche(f(1), c, 1e-3), `${type}-${mode}(1) = ${f(1)}`);
    }
  }
});

test('continuité en 0,5 des modes composés', () => {
  const e = 1e-7;
  for (const type of SAUF_OSCILLATEUR.filter((t) => t !== 'step' && t !== 'tardis')) {
    for (const mode of ['inout', 'outin', 'spike', 'arch', 'spike-arch', 'arch-spike', 'spike-inv', 'arch-inv']) {
      const f = C.courbe(type, mode);
      assert.ok(proche(f(0.5 - e), f(0.5 + e), 1e-3), `${type}-${mode} discontinue en 0,5`);
    }
  }
});

test('valeurs de référence', () => {
  assert.ok(proche(C.courbe('quad', 'in')(0.5), 0.25));
  assert.ok(proche(C.courbe('quad', 'out')(0.5), 0.75));
  assert.ok(proche(C.courbe('cubic', 'inout')(0.25), 0.0625));
  assert.ok(proche(C.courbe('power', 'in', 3)(0.5), 0.125));
  assert.equal(C.courbe('step', 'in', 4)(0.6), 0.5);
  assert.ok(C.courbe('back', 'out')(0.8) > 1, 'back-out dépasse 1 avant d\'arriver');
  assert.ok(C.courbe('elastic', 'out')(0.14) > 1, 'elastic-out oscille au-dessus de 1');
});

test('cubic-bezier : ease CSS et cas linéaire', () => {
  const lin = C.courbe('cubic-bezier', 'in', [0, 0, 1, 1]);
  for (const t of [0.1, 0.33, 0.5, 0.9]) assert.ok(proche(lin(t), t, 1e-4));
  const ease = C.courbe('cubic-bezier', 'in', [0.25, 0.1, 0.25, 1]);
  assert.ok(proche(ease(0.5), 0.8024, 1e-3), `ease(0.5) = ${ease(0.5)}`);
});

test('ressort : part de 0, converge vers 1', () => {
  for (const p of [undefined, { raideur: 200, amortissement: 8 }, { raideur: 100, amortissement: 30 }]) {
    const f = C.courbe('ressort', 'in', p);
    assert.equal(f(0), 0);
    assert.equal(f(1), 1);
    assert.ok(proche(f(0.95), 1, 0.01), `ressort(0.95) = ${f(0.95)}`);
  }
  assert.ok(C.courbe('ressort', 'in', { raideur: 200, amortissement: 8 })(0.15) > 1, 'ressort peu amorti dépasse 1');
});

test('analyserNom et courbeNommee', () => {
  assert.deepEqual(C.analyserNom('back-out'), { type: 'back', mode: 'out' });
  assert.deepEqual(C.analyserNom('linear'), { type: 'linear', mode: 'in' });
  assert.deepEqual(C.analyserNom('quad-spike-arch-inv'), { type: 'quad', mode: 'spike-arch-inv' });
  assert.deepEqual(C.analyserNom('cubic-bezier-out'), { type: 'cubic-bezier', mode: 'out' });
  assert.throws(() => C.analyserNom('rebond'), /Nom de courbe inconnu/);
  assert.ok(proche(C.courbeNommee('quad-out')(0.5), 0.75));
});

test('type ou mode inconnu : message en français', () => {
  assert.throws(() => C.courbe('xyz'), /Courbe inconnue : « xyz »/);
  assert.throws(() => C.courbe('quad', 'zz'), /Mode inconnu : « zz »/);
});

test('t hors de [0,1] est borné', () => {
  const f = C.courbe('quad', 'in');
  assert.equal(f(-1), 0);
  assert.equal(f(2), 1);
});

test('opérateurs mix, fondu, echelle', () => {
  const a = C.courbe('linear'), b = C.courbe('quad');
  assert.ok(proche(C.mix(a, b, 0.5)(0.5), 0.375));
  assert.ok(proche(C.fondu(a, b)(0.5), 0.375));
  assert.ok(proche(C.echelle(a)(0.5), 0.25));
  assert.ok(proche(C.echelleInverse(a)(0.5), 0.25));
});

function evaluerLinear(css, t) {
  const pts = css.slice(7, -1).split(', ').map((p) => {
    const [v, pc] = p.split(' ');
    return [parseFloat(pc) / 100, parseFloat(v)];
  });
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + (y1 - y0) * (t - x0) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

test('courbeCSS : fidèle à 1 % près', () => {
  for (const type of ['quad', 'cubic', 'expo', 'sine', 'circle', 'back', 'bounce', 'elastic', 'ressort']) {
    for (const mode of ['in', 'out', 'inout']) {
      const f = C.courbe(type, mode);
      const css = C.courbeCSS(type, mode);
      assert.match(css, /^linear\(0 0%, .* 100%\)$/);
      for (let i = 0; i <= 200; i++) {
        const t = i / 200;
        assert.ok(Math.abs(evaluerLinear(css, t) - f(t)) <= 0.01, `${type}-${mode} écart en ${t}`);
      }
    }
  }
});

test('variablesCSS publie les combinaisons usuelles', () => {
  const css = C.variablesCSS();
  assert.match(css, /^:root \{/);
  assert.match(css, /--ease-bounce-out: linear\(/);
  assert.match(css, /--ease-back-inout: linear\(/);
  assert.equal((css.match(/--ease-/g) || []).length, 30);
});
