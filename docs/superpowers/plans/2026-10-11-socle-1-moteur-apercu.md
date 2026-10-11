# Pulse Motion – Plan 1 : moteur, page autonome et aperçu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer un projet vidéo (`deroule.json` + `scenes/*.html` + `assets/`) en une page HTML autonome animée, et la montrer dans un aperçu local qui se recharge à chaque modification, à la même position de lecture.

**Architecture:** Le moteur (`moteur/`) est un ensemble de fichiers JavaScript sans dépendance : modules purs (courbes, minutage, transitions, tween) testés sous Node et chargés tels quels dans la page via un global `M`, plus deux modules navigateur (horloge, lecteur). Les scripts Node (`scripts/`) valident le déroulé, assemblent la page (textes, charte, polices, images, musique et moteur embarqués) et servent l'aperçu avec rechargement par Server-Sent Events.

**Tech Stack:** Node ≥ 20 (bibliothèque standard seulement, `node:test`), JavaScript ES5/ES2015 côté page, CSS (container queries `cqh`, `linear()`), Chrome ou Edge sans fenêtre pour les tests navigateur.

**Spec:** `docs/superpowers/specs/2026-10-11-socle-design.md` (sections 3, 4, 5, 10, 11). Ce plan est le premier des trois plans du socle :

1. **Plan 1 (celui-ci)** : moteur, page autonome, aperçu.
2. Plan 2 : style v1 `clair-pedagogique`, contrôles (`controler.js`), guidage (commandes, `etat.js`, agent animateur, hook, historique).
3. Plan 3 : export MP4 dans le navigateur.

## Global Constraints

- Node ≥ 20, **aucune dépendance npm** : seulement la bibliothèque standard ; tests avec `node --test`.
- Licence MIT ; seules les briques MIT, Apache 2.0, ISC, MPL 2.0, SIL OFL sont admises, mentions conservées (`NOTICE.md`).
- Tout en local : aucune ressource distante dans la page produite, serveur d'aperçu sur `127.0.0.1` seulement.
- Textes destinés à la personne (erreurs, messages) **en français**, avec accents, et nommant le champ, la scène ou l'élément en cause.
- Identifiants et noms de fichiers du code en français, comme dans la spec (`deroule`, `scenes`, `duree`, `rythme`…).
- Le moteur respecte le contrat « l'état visible ne dépend que de t » : `M.rendre(t)` produit la même image quel que soit l'ordre des appels.
- Chevauchement de transition : **0,5 s** ; durée d'élément par défaut : **1 s** ; ips par défaut : **30** ; transitions : `aucune`, `fondu`, `glissement`, `balayage`.
- Les modules purs du moteur suivent le motif « module universel » (même fichier pour Node via `require` et pour la page via le global `M`).
- Windows, macOS et Linux : chemins construits avec `node:path`, aucun appel à un shell POSIX.

## Review Focus

Cas que la spec implique sans les nommer, les plus susceptibles de gêner une vraie personne ; chacun a son test dans la tâche indiquée.

1. **Dossier de projet avec espaces et accents** (« Mes vidéos à moi ») : l'assemblage et l'aperçu fonctionnent → test dans la tâche 7.
2. **Fichier d'image nommé avec `%` ou des accents** (« 100%.png », « été.svg ») : embarqué sans plantage (`decodeURI` ne doit pas lever d'exception) → test dans la tâche 5.
3. **Scène enregistrée par un éditeur Windows** (BOM UTF-8, fins de ligne CRLF) : la scène est reconnue, aucun caractère parasite dans la page → test dans la tâche 7.
4. **`deroule.json` à moitié écrit pendant l'édition** : l'aperçu garde la dernière page valide, affiche l'erreur, puis se rétablit seul à la correction suivante → test dans la tâche 8.
5. **Vidéo de 5 minutes** (40 scènes, 30 éléments chacune) : le minutage reste instantané (< 50 ms) → test dans la tâche 3.

---

## Structure des fichiers

```
.claude-plugin/plugin.json     manifeste du plugin Claude Code
package.json                   « npm test » = node --test ; aucune dépendance
LICENSE, NOTICE.md             licence MIT et provenance du code repris
moteur/
  courbes.js                   courbes (portage de BZAnimationTool), linear() CSS      [pur]
  tween.js                     data-tween : analyse et valeurs, nombres en français     [pur]
  minutage.js                  temps absolus des scènes et des éléments                 [pur]
  transitions.js               style d'entrée d'une scène (fondu, glissement, balayage) [pur]
  horloge.js                   M.demarrer, M.rendre(t), M.seek(t), gel des animations   [navigateur]
  lecteur.js                   barre de lecture, raccourcis, rechargement de l'aperçu   [navigateur]
  base.css                     scène au bon format, lecteur, panneau d'erreur
scripts/
  assembler.js                 projet -> sortie/<titre>.html (page autonome)
  apercu.js                    serveur local 127.0.0.1 + rechargement (SSE)
  lib/deroule.js               lecture et validation de deroule.json
  lib/scenes.js                section, textes, scripts, logo, panneau d'erreur
  lib/embarquer.js             fichiers du projet -> URL data:
tests/
  *.test.js                    node --test
  navigateur.html              vérifications du moteur dans le navigateur
  aide/navigateur.js           trouve Chrome/Edge, rend une page sans fenêtre
  aide/projet.js               copie un projet d'exemple dans un dossier temporaire
  fixtures/                    style « test » et projet « projet-simple »
```

---

### Task 1: Fondations du plugin et courbes d'animation

**Files:**
- Create: `package.json`, `.claude-plugin/plugin.json`, `LICENSE`, `NOTICE.md`
- Create: `moteur/courbes.js`
- Test: `tests/courbes.test.js`

**Interfaces:**
- Consumes: rien.
- Produces (module `moteur/courbes.js`, `require` sous Node, global `M` dans la page) :
  - `TYPES: string[]`, `MODES: string[]`
  - `courbe(type: string, mode = 'in', param?): (t: number) => number` (t borné à [0,1])
  - `analyserNom(nom: string): { type, mode }` (« back-out », « linear », « quad-spike-arch-inv »)
  - `courbeNommee(nom: string): (t) => number`
  - `mix(a, b, k)`, `fondu(a, b)`, `echelle(a)`, `echelleInverse(a)` : fonctions → fonction
  - `courbeCSS(type | fn, mode?, param?, n = 24): string` → `'linear(0 0%, …, 1 100%)'`, fidèle à 1 % près
  - `variablesCSS(): string` → `':root { --ease-<type>-<mode>: linear(…); … }'` (30 variables : quad, cubic, quart, quint, expo, sine, circle, elastic, back, bounce × in, out, inout)

- [ ] **Étape 1 : créer les fichiers du plugin**

`package.json` :

```json
{
  "name": "pulse-motion",
  "version": "0.1.0",
  "private": true,
  "description": "Créer des vidéos de motion design sur votre ordinateur, sans cloud.",
  "license": "MIT",
  "engines": { "node": ">=20" },
  "scripts": { "test": "node --test" }
}
```

`.claude-plugin/plugin.json` :

```json
{
  "name": "pulse-motion",
  "version": "0.1.0",
  "description": "Créer des vidéos de motion design sur votre ordinateur, sans cloud : décrivez votre idée, validez le déroulé, regardez la vidéo.",
  "author": { "name": "Jérôme Delauney" },
  "license": "MIT"
}
```

`LICENSE` : texte standard de la licence MIT, première ligne `MIT License`, puis `Copyright (c) 2026 Jérôme Delauney`.

`NOTICE.md` :

```markdown
# Provenance du code repris

| Origine | Licence | Ce qui est repris | Où |
|---|---|---|---|
| BZScene – `BZAnimationTool.pas` (J. Delauney, 2017) | publié sous MIT par son auteur dans Pulse Motion | Formes de courbes et modes composés (in, out, inout, outin, spike, arch…), opérateurs mix, crossFade, scale | `moteur/courbes.js` |
| showtime – `skills/showtime/runtime/stage.js` (Copyright (c) 2026 Favio Vazquez) | MIT | Principe de l'horloge virtuelle, algorithme d'aléa mulberry32, valeur EPOCH | `moteur/horloge.js` |
| motion-graphics – `skills/motion/engine/motion.js` (Copyright (c) 2026 Bart) | MIT | Idée des ressorts en forme close | `moteur/courbes.js` |
| Robert Penner / easings.net (formule du rebond) | BSD / MIT (formules publiques) | Rebond « out » à 4 paraboles | `moteur/courbes.js` |
```

- [ ] **Étape 2 : écrire le test qui échoue**

`tests/courbes.test.js` :

```js
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
```

- [ ] **Étape 3 : vérifier l'échec**

Lancer : `node --test tests/courbes.test.js`
Attendu : FAIL – « Cannot find module '../moteur/courbes.js' ».

- [ ] **Étape 4 : écrire l'implémentation**

Notes : le rebond de base est la forme « in » (l'original Pascal était « out ») pour que `bounce-out` rebondisse à l'arrivée comme en CSS ; `tardis` est un escalier adouci (l'original renvoyait une constante) ; `arch-spike` est le symétrique de `spike-arch` ; `courbeCSS` subdivise là où la corde s'écarte de plus de 0,002 de la courbe (pentes verticales de `circle`, rebonds).

`moteur/courbes.js` :

```js
/* Pulse Motion – courbes d'animation.
 *
 * Portage JavaScript de BZAnimationTool.pas (J. Delauney, BZScene, 2017), publié
 * sous licence MIT dans Pulse Motion. Une courbe = un type (forme « in » de base)
 * composé avec un mode (in, out, inout, spike, arch…).
 *
 * Écarts assumés avec l'original :
 * - bounce : la forme de base est le rebond « in » (l'original était « out ») ;
 * - tardis : escalier adouci (l'original renvoyait toujours la même valeur) ;
 * - arch-spike : symétrique de spike-arch (l'original était un fondu fixe) ;
 * - ressort et cubic-bezier ajoutés (forme close, sans état).
 *
 * Module pur : chargé tel quel dans la page (global M) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; Object.assign(racine.M, api); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PI = Math.PI;

  function rebondOut(t) {
    var n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) { t -= 1.5 / d; return n * t * t + 0.75; }
    if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + 0.9375; }
    t -= 2.625 / d; return n * t * t + 0.984375;
  }

  function sinusInOut(t) { return 0.5 - 0.5 * Math.cos(PI * t); }

  function bezierCubique(p) {
    var x1 = p[0], y1 = p[1], x2 = p[2], y2 = p[3];
    function bx(s) { return 3 * x1 * s * (1 - s) * (1 - s) + 3 * x2 * s * s * (1 - s) + s * s * s; }
    function by(s) { return 3 * y1 * s * (1 - s) * (1 - s) + 3 * y2 * s * s * (1 - s) + s * s * s; }
    function dbx(s) { return 3 * x1 * (1 - s) * (1 - s) + 6 * (x2 - x1) * s * (1 - s) + 3 * (1 - x2) * s * s; }
    return function (t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      var s = t;
      for (var i = 0; i < 8; i++) {
        var e = bx(s) - t, d = dbx(s);
        if (Math.abs(e) < 1e-7) return by(s);
        if (Math.abs(d) < 1e-6) break;
        s -= e / d;
      }
      var a = 0, b = 1;
      s = t;
      for (var j = 0; j < 40; j++) {
        var x = bx(s);
        if (Math.abs(x - t) < 1e-7) break;
        if (x < t) a = s; else b = s;
        s = (a + b) / 2;
      }
      return by(s);
    };
  }

  function ressort(p) {
    var k = (p && p.raideur) || 100;
    var c = (p && p.amortissement) || 10;
    var w0 = Math.sqrt(k);
    var zeta = c / (2 * w0);
    var x, duree;
    if (zeta < 1) {
      var wd = w0 * Math.sqrt(1 - zeta * zeta);
      duree = -Math.log(0.001) / (zeta * w0);
      x = function (T) {
        return 1 - Math.exp(-zeta * w0 * T) * (Math.cos(wd * T) + (zeta * w0 / wd) * Math.sin(wd * T));
      };
    } else {
      duree = 9.23 / w0;
      x = function (T) { return 1 - Math.exp(-w0 * T) * (1 + w0 * T); };
    }
    return function (t) { return t >= 1 ? 1 : t <= 0 ? 0 : x(t * duree); };
  }

  // Formes de base (« in »), param facultatif.
  var BASES = {
    linear: function () { return function (t) { return t; }; },
    quad: function () { return function (t) { return t * t; }; },
    cubic: function () { return function (t) { return t * t * t; }; },
    quart: function () { return function (t) { return t * t * t * t; }; },
    quint: function () { return function (t) { return t * t * t * t * t; }; },
    expo: function () { return function (t) { return t === 0 ? 0 : Math.pow(2, 10 * (t - 1)); }; },
    sine: function () { return function (t) { return Math.sin((t - 1) * PI / 2) + 1; }; },
    circle: function () { return function (t) { return 1 - Math.sqrt(Math.max(0, 1 - t * t)); }; },
    elastic: function () { return function (t) { return Math.sin(13 * PI / 2 * t) * Math.pow(2, 10 * (t - 1)); }; },
    back: function () { return function (t) { return t * t * t - t * Math.sin(t * PI); }; },
    bounce: function () { return function (t) { return 1 - rebondOut(1 - t); }; },
    bell: function () { return function (t) { var u = 1 - t; return (1 - u * u * u) * t * t * t; }; },
    power: function (p) { var e = p === undefined ? 2 : p; return function (t) { return Math.pow(t, e); }; },
    step: function (p) {
      var n = p === undefined ? 5 : p;
      return function (t) { return t >= 1 ? 1 : Math.floor(t * n) / n; };
    },
    swing: function () { return function (t) { return t + Math.sin(t * 10 * PI) / 10; }; },
    jitter: function () { return function (t) { return t + Math.sin(t * 3 * PI) * 0.1; }; },
    // Oscillateur (ne part pas de 0) : utile pour un clignotement ou une pulsation.
    wave: function () { return function (t) { return 0.5 * Math.sin(2 * PI * 4 * t + 0.2) + 0.5; }; },
    tardis: function (p) {
      var n = p === undefined ? 9 : p;
      return function (t) {
        var seg = Math.min(Math.floor(t * n), n - 1);
        return (seg + sinusInOut(t * n - seg)) / n;
      };
    },
    'cubic-bezier': function (p) { return bezierCubique(p || [0.25, 0.1, 0.25, 1]); },
    ressort: function (p) { return ressort(p); },
  };

  // Modes (TBZAnimationMode) : composent une forme de base F.
  function aller(t) { return t < 0.5 ? t + t : 2 - t - t; }
  var MODES_FN = {
    'in': function (F) { return function (t) { return F(t); }; },
    'in-inv': function (F) { return function (t) { return F(1 - t); }; },
    'out': function (F) { return function (t) { return 1 - F(1 - t); }; },
    'out-inv': function (F) { return function (t) { return 1 - F(t); }; },
    'inout': function (F) { return function (t) { return t < 0.5 ? F(t + t) / 2 : 1 - F(2 - t - t) / 2; }; },
    'outin': function (F) { return function (t) { return t < 0.5 ? (1 - F(1 - t - t)) / 2 : 0.5 + F(t + t - 1) / 2; }; },
    'spike': function (F) { return function (t) { return F(aller(t)); }; },
    'spike-inv': function (F) { return function (t) { return 1 - F(aller(t)); }; },
    'arch': function (F) { return function (t) { return 1 - F(1 - aller(t)); }; },
    'arch-inv': function (F) { return function (t) { return F(1 - aller(t)); }; },
    'spike-arch': function (F) { return function (t) { return t < 0.5 ? F(t + t) : 1 - F(t + t - 1); }; },
    'spike-arch-inv': function (F) { return function (t) { return t < 0.5 ? F(1 - t - t) : 1 - F(2 - t - t); }; },
    'arch-spike': function (F) { return function (t) { return t < 0.5 ? 1 - F(1 - t - t) : F(2 - t - t); }; },
  };

  var TYPES = Object.keys(BASES);
  var MODES = Object.keys(MODES_FN);

  /** courbe(type, mode = 'in', param) -> (t ∈ [0,1]) => nombre */
  function courbe(type, mode, param) {
    var base = BASES[type];
    if (!base) throw new Error('Courbe inconnue : « ' + type + ' ». Types : ' + TYPES.join(', '));
    var m = MODES_FN[mode || 'in'];
    if (!m) throw new Error('Mode inconnu : « ' + mode + ' ». Modes : ' + MODES.join(', '));
    var f = m(base(param));
    return function (t) { return f(t < 0 ? 0 : t > 1 ? 1 : t); };
  }

  /** Nom court « back-out », « linear », « spike-arch-inv »… -> { type, mode } */
  var MODES_PAR_LONGUEUR = MODES.slice().sort(function (a, b) { return b.length - a.length; });
  function analyserNom(nom) {
    if (BASES[nom]) return { type: nom, mode: 'in' };
    for (var i = 0; i < MODES_PAR_LONGUEUR.length; i++) {
      var m = MODES_PAR_LONGUEUR[i];
      var suffixe = '-' + m;
      if (nom.length > suffixe.length && nom.slice(-suffixe.length) === suffixe) {
        var type = nom.slice(0, -suffixe.length);
        if (BASES[type]) return { type: type, mode: m };
      }
    }
    throw new Error('Nom de courbe inconnu : « ' + nom + ' » (exemples : cubic-out, back-inout, bounce-out).');
  }

  function courbeNommee(nom) { var c = analyserNom(nom); return courbe(c.type, c.mode); }

  // Opérateurs (easeMix, easeCrossFade, easeScale, easeReverseScale).
  function mix(a, b, k) { return function (t) { var x = a(t); return x + k * (b(t) - x); }; }
  function fondu(a, b) { return function (t) { var x = a(t); return x + t * (b(t) - x); }; }
  function echelle(a) { return function (t) { return t * a(t); }; }
  function echelleInverse(a) { return function (t) { return (1 - t) * a(t); }; }

  function arrondi(x, n) { var f = Math.pow(10, n); return Math.round(x * f) / f; }

  // Ajoute des points là où la corde s'écarte de la courbe (pentes raides, rebonds).
  function subdiviser(f, a, fa, b, fb, profondeur, sortie) {
    var m = (a + b) / 2, fm = f(m);
    var ecart = Math.abs(fm - (fa + fb) / 2);
    var q1 = a + (b - a) / 4, q3 = a + 3 * (b - a) / 4;
    ecart = Math.max(ecart, Math.abs(f(q1) - (fa * 3 + fb) / 4), Math.abs(f(q3) - (fa + fb * 3) / 4));
    if (profondeur > 0 && ecart > 0.002) {
      subdiviser(f, a, fa, m, fm, profondeur - 1, sortie);
      sortie.push([m, fm]);
      subdiviser(f, m, fm, b, fb, profondeur - 1, sortie);
    }
  }

  /** Échantillonne une courbe en fonction CSS linear(…) : n segments réguliers, affinés si besoin. */
  function courbeCSS(type, mode, param, n) {
    var f = typeof type === 'function' ? type : courbe(type, mode, param);
    n = n || 24;
    var pts = [[0, f(0)]];
    for (var i = 1; i <= n; i++) {
      var a = pts[pts.length - 1], t = i / n, ft = f(t);
      subdiviser(f, a[0], a[1], t, ft, 6, pts);
      pts.push([t, ft]);
    }
    return 'linear(' + pts.map(function (p) {
      return arrondi(p[1], 4) + ' ' + arrondi(p[0] * 100, 3) + '%';
    }).join(', ') + ')';
  }

  var TYPES_CSS = ['quad', 'cubic', 'quart', 'quint', 'expo', 'sine', 'circle', 'elastic', 'back', 'bounce'];
  var MODES_CSS = ['in', 'out', 'inout'];

  /** Bloc CSS « :root { --ease-<type>-<mode>: linear(…); … } » pour les combinaisons usuelles. */
  function variablesCSS() {
    var lignes = [];
    TYPES_CSS.forEach(function (ty) {
      MODES_CSS.forEach(function (mo) {
        lignes.push('  --ease-' + ty + '-' + mo + ': ' + courbeCSS(ty, mo) + ';');
      });
    });
    return ':root {\n' + lignes.join('\n') + '\n}\n';
  }

  return {
    TYPES: TYPES,
    MODES: MODES,
    courbe: courbe,
    analyserNom: analyserNom,
    courbeNommee: courbeNommee,
    mix: mix,
    fondu: fondu,
    echelle: echelle,
    echelleInverse: echelleInverse,
    courbeCSS: courbeCSS,
    variablesCSS: variablesCSS,
  };
});
```

- [ ] **Étape 5 : vérifier le succès**

Lancer : `node --test tests/courbes.test.js`
Attendu : PASS – 12 tests.

- [ ] **Étape : commit**

```bash
git add package.json .claude-plugin/plugin.json LICENSE NOTICE.md moteur/courbes.js tests/courbes.test.js
git commit -m "feat(moteur): courbes d'animation (portage de BZAnimationTool)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Interpolation de valeurs (data-tween)

**Files:**
- Create: `moteur/tween.js`
- Test: `tests/tween.test.js`

**Interfaces:**
- Consumes: `courbeNommee(nom)` de `moteur/courbes.js` (via `require('./courbes.js')` sous Node, via `M` dans la page).
- Produces (module `moteur/tween.js`) :
  - `analyserTween(texte: string): Clause[]` avec `Clause = { prop, de: number, a: number, unite: string, decimales: number, nomCourbe: string, courbe: fn }` ; courbe par défaut `cubic-out` ; `->` accepté pour `→` ; lève une `Error` en français si la clause est illisible.
  - `valeurTween(clause, p): number`
  - `texteTween(clause, p): string` (valeur + unité, ou nombre formaté si `prop === 'nombre'`)
  - `nombre(v: number, decimales = 0): string` (format `fr-FR`)

- [ ] **Étape 1 : écrire le test qui échoue**

`tests/tween.test.js` :

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../moteur/tween.js');

test('analyse de plusieurs clauses', () => {
  const c = T.analyserTween('opacity 0→1 back-out; --x -10cqh->0cqh;nombre 0→1250');
  assert.equal(c.length, 3);
  assert.deepEqual(
    c.map(({ prop, de, a, unite, nomCourbe }) => ({ prop, de, a, unite, nomCourbe })),
    [
      { prop: 'opacity', de: 0, a: 1, unite: '', nomCourbe: 'back-out' },
      { prop: '--x', de: -10, a: 0, unite: 'cqh', nomCourbe: 'cubic-out' },
      { prop: 'nombre', de: 0, a: 1250, unite: '', nomCourbe: 'cubic-out' },
    ],
  );
});

test('valeurs aux extrémités et au milieu', () => {
  const [c] = T.analyserTween('--x 10cqh→20cqh linear');
  assert.equal(T.texteTween(c, 0), '10cqh');
  assert.equal(T.texteTween(c, 0.5), '15cqh');
  assert.equal(T.texteTween(c, 1), '20cqh');
});

test('nombre : format français, décimales reprises des bornes', () => {
  const [c] = T.analyserTween('nombre 0→1250 linear');
  assert.equal(T.texteTween(c, 1).replace(/\s/g, ' '), '1 250');
  const [d] = T.analyserTween('nombre 0→3.5 linear');
  assert.equal(T.texteTween(d, 1), '3,5');
  assert.equal(T.nombre(1234567).replace(/\s/g, ' '), '1 234 567');
});

test('erreurs explicites', () => {
  assert.throws(() => T.analyserTween('opacity 0 1'), /attendue sous la forme/);
  assert.throws(() => T.analyserTween('--x 0px→1cqh'), /unités différentes/);
  assert.throws(() => T.analyserTween('--x a→1'), /illisible/);
  assert.throws(() => T.analyserTween('opacity 0→1 rebond'), /Nom de courbe inconnu/);
});

test('une chaîne vide ne produit aucune clause', () => {
  assert.deepEqual(T.analyserTween(''), []);
  assert.deepEqual(T.analyserTween(' ; '), []);
});
```

- [ ] **Étape 2 : vérifier l'échec**

Lancer : `node --test tests/tween.test.js`
Attendu : FAIL – « Cannot find module '../moteur/tween.js' ».

- [ ] **Étape 3 : écrire l'implémentation**

`moteur/tween.js` :

```js
/* Pulse Motion – interpolation de valeurs (attribut data-tween).
 *
 *   data-tween="opacity 0→1 back-out; --x -10cqh→0cqh; nombre 0→1250 cubic-out"
 *
 * Chaque clause : propriété, valeur de départ → valeur d'arrivée (même unité),
 * courbe facultative (cubic-out par défaut). « -> » est accepté pour « → ».
 * La propriété spéciale « nombre » remplace le texte de l'élément par la valeur
 * formatée en français (1 250).
 *
 * Module pur : chargé tel quel dans la page (global M) et par Node (require).
 */
(function (racine, fabrique) {
  var C = typeof require === 'function' && typeof module === 'object' ? require('./courbes.js') : racine.M;
  var api = fabrique(C);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; Object.assign(racine.M, api); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';

  var VALEUR = /^(-?\d*\.?\d+)([a-z%]*)$/i;

  function lireValeur(texte, clause) {
    var m = VALEUR.exec(texte);
    if (!m) throw new Error('data-tween : valeur « ' + texte + ' » illisible dans « ' + clause + ' » (exemples : 0, 1.5, 10cqh, 45deg).');
    var decimales = (m[1].split('.')[1] || '').length;
    return { nombre: parseFloat(m[1]), unite: m[2], decimales: decimales };
  }

  /** "opacity 0→1 back-out; …" -> [{ prop, de, a, unite, decimales, courbe, nomCourbe }] */
  function analyserTween(texte) {
    return String(texte).split(';').map(function (s) { return s.trim(); }).filter(Boolean).map(function (clause) {
      var morceaux = clause.replace(/->/g, '→').split(/\s+/);
      if (morceaux.length < 2 || morceaux[1].indexOf('→') < 0) {
        throw new Error('data-tween : clause « ' + clause + ' » attendue sous la forme « propriété départ→arrivée [courbe] ».');
      }
      var bornes = morceaux[1].split('→');
      var de = lireValeur(bornes[0], clause);
      var a = lireValeur(bornes[1], clause);
      if (de.unite !== a.unite) {
        throw new Error('data-tween : unités différentes (« ' + de.unite + ' » et « ' + a.unite + ' ») dans « ' + clause + ' ».');
      }
      var nomCourbe = morceaux[2] || 'cubic-out';
      return {
        prop: morceaux[0],
        de: de.nombre,
        a: a.nombre,
        unite: a.unite,
        decimales: Math.max(de.decimales, a.decimales),
        nomCourbe: nomCourbe,
        courbe: C.courbeNommee(nomCourbe),
      };
    });
  }

  /** Valeur d'une clause pour une progression p ∈ [0,1], sous forme de nombre. */
  function valeurTween(clause, p) {
    return clause.de + (clause.a - clause.de) * clause.courbe(p);
  }

  /** Formate un nombre en français : séparateur de milliers, virgule décimale. */
  function nombre(v, decimales) {
    var d = decimales || 0;
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  }

  /** Texte CSS à écrire pour une clause (avec unité), ou texte affiché pour « nombre ». */
  function texteTween(clause, p) {
    var v = valeurTween(clause, p);
    if (clause.prop === 'nombre') return nombre(v, clause.decimales);
    return String(Math.round(v * 10000) / 10000) + clause.unite;
  }

  return { analyserTween: analyserTween, valeurTween: valeurTween, texteTween: texteTween, nombre: nombre };
});
```

- [ ] **Étape 4 : vérifier le succès**

Lancer : `node --test tests/tween.test.js`
Attendu : PASS – 5 tests.

- [ ] **Étape : commit**

```bash
git add moteur/tween.js tests/tween.test.js
git commit -m "feat(moteur): interpolation data-tween et nombres en français

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Minutage et transitions

**Files:**
- Create: `moteur/minutage.js`, `moteur/transitions.js`
- Test: `tests/minutage.test.js`, `tests/transitions.test.js`

**Interfaces:**
- Consumes: `courbe('cubic', 'inout')` de `moteur/courbes.js` (dans `transitions.js`).
- Produces :
  - `moteur/minutage.js` :
    - `CHEVAUCHEMENT = 0.5`
    - `calculerMinutage(scenes: {id, duree, rythme?, transition?}[], elementsParScene: { [idScene]: {cle, start?, dur?}[] })` → `{ duree, scenes: [{ id, debut, fin, rythme, transition, entree }], elements: { [idScene]: { [cle]: { debut, fin } } }, erreurs: [{ regle, scene, element, message }] }` — règles : `reference-circulaire`, `reference-inconnue`, `start-invalide`, `dur-invalide`.
    - `progression(t, debut, fin): number` ∈ [0,1] ; `etat(t, debut, fin)` → `'avant' | 'pendant' | 'apres'` ; `scenesVisibles(minutage, t): string[]`.
  - `moteur/transitions.js` : `TRANSITIONS`, `styleTransition(type, q)` → `{ opacity, transform, clipPath }` (chaînes, `''` = défaut).

Règles de temps (spec §4) : durée effective = `duree / rythme` ; une scène dont `transition` ≠ `aucune` commence 0,5 s avant la fin de la précédente (sauf la première) ; temps internes divisés par `rythme` ; `#id` = début de l'élément, `#id:fin` = sa fin, décalage `±x` ; un début négatif est ramené à 0.

- [ ] **Étape 1 : écrire les tests qui échouent**

`tests/minutage.test.js` :

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Mi = require('../moteur/minutage.js');

const proche = (a, b) => Math.abs(a - b) < 1e-9;

test('scènes bout à bout, sans transition', () => {
  const m = Mi.calculerMinutage([{ id: 'a', duree: 4 }, { id: 'b', duree: 6 }], {});
  assert.deepEqual(m.scenes.map((s) => [s.id, s.debut, s.fin]), [['a', 0, 4], ['b', 4, 10]]);
  assert.equal(m.duree, 10);
  assert.deepEqual(m.erreurs, []);
});

test('transition d\'entrée : chevauchement de 0,5 s, sauf pour la première scène', () => {
  const m = Mi.calculerMinutage([
    { id: 'a', duree: 4, transition: 'fondu' },
    { id: 'b', duree: 6, transition: 'glissement' },
    { id: 'c', duree: 2, transition: 'aucune' },
  ], {});
  assert.deepEqual(m.scenes.map((s) => [s.debut, s.fin, s.entree]), [[0, 4, 0], [3.5, 9.5, 0.5], [9.5, 11.5, 0]]);
  assert.equal(m.duree, 11.5);
});

test('rythme : durée effective et temps internes étirés', () => {
  const m = Mi.calculerMinutage(
    [{ id: 'a', duree: 4 }, { id: 'b', duree: 4, rythme: 0.8 }],
    { b: [{ cle: 'titre', start: '1', dur: '2' }] },
  );
  assert.equal(m.scenes[1].fin, 4 + 5);
  assert.ok(proche(m.elements.b.titre.debut, 4 + 1.25));
  assert.ok(proche(m.elements.b.titre.fin, 4 + 3.75));
});

test('références relatives au début et à la fin, avec décalage', () => {
  const m = Mi.calculerMinutage([{ id: 's', duree: 10 }], {
    s: [
      { cle: 'c', start: '#b:fin-0.2' },
      { cle: 'a', start: '0.4', dur: '1.2' },
      { cle: 'b', start: '#a+0.3', dur: '2' },
      { cle: 'd' },
    ],
  });
  const e = m.elements.s;
  assert.ok(proche(e.a.debut, 0.4) && proche(e.a.fin, 1.6));
  assert.ok(proche(e.b.debut, 0.7) && proche(e.b.fin, 2.7));
  assert.ok(proche(e.c.debut, 2.5) && proche(e.c.fin, 3.5));
  assert.ok(proche(e.d.debut, 0) && proche(e.d.fin, 1));
  assert.deepEqual(m.erreurs, []);
});

test('un décalage négatif ne fait pas démarrer avant 0', () => {
  const m = Mi.calculerMinutage([{ id: 's', duree: 5 }], { s: [{ cle: 'a', start: '0' }, { cle: 'b', start: '#a-2' }] });
  assert.equal(m.elements.s.b.debut, 0);
});

test('référence circulaire détectée, nommée, sans boucle infinie', () => {
  const m = Mi.calculerMinutage([{ id: 's', duree: 5 }], {
    s: [{ cle: 'a', start: '#b' }, { cle: 'b', start: '#a' }],
  });
  assert.equal(m.erreurs.length, 1);
  assert.equal(m.erreurs[0].regle, 'reference-circulaire');
  assert.equal(m.erreurs[0].scene, 's');
  assert.match(m.erreurs[0].message, /référence circulaire/);
});

test('référence inconnue, data-start et data-dur illisibles', () => {
  const m = Mi.calculerMinutage([{ id: 's', duree: 5 }], {
    s: [{ cle: 'a', start: '#zz+1' }, { cle: 'b', start: 'bientôt' }, { cle: 'c', dur: 'long' }],
  });
  assert.deepEqual(m.erreurs.map((e) => [e.regle, e.element]), [
    ['reference-inconnue', 'a'], ['start-invalide', 'b'], ['dur-invalide', 'c'],
  ]);
  assert.match(m.erreurs[0].message, /« #zz » n'existe pas/);
  assert.equal(m.elements.s.a.debut, 0);
});

test('progression, état et scènes visibles', () => {
  assert.equal(Mi.progression(1, 2, 4), 0);
  assert.equal(Mi.progression(3, 2, 4), 0.5);
  assert.equal(Mi.progression(9, 2, 4), 1);
  assert.deepEqual([1, 2, 3, 4].map((t) => Mi.etat(t, 2, 4)), ['avant', 'pendant', 'pendant', 'apres']);
  const m = Mi.calculerMinutage([{ id: 'a', duree: 4 }, { id: 'b', duree: 4, transition: 'fondu' }], {});
  assert.deepEqual(Mi.scenesVisibles(m, 1), ['a']);
  assert.deepEqual(Mi.scenesVisibles(m, 3.7), ['a', 'b']);
  assert.deepEqual(Mi.scenesVisibles(m, 7.5), ['b']);
  assert.deepEqual(Mi.scenesVisibles(m, 99), ['b'], 'après la fin : dernière scène');
});

test('vidéo de 5 minutes : 40 scènes de 30 éléments minutées en moins de 50 ms', () => {
  const scenes = [], elements = {};
  for (let i = 0; i < 40; i++) {
    scenes.push({ id: `s${i}`, duree: 7.5, transition: i % 2 ? 'fondu' : 'aucune' });
    elements[`s${i}`] = Array.from({ length: 30 }, (_, k) => ({ cle: `e${k}`, start: k ? `#e${k - 1}+0.1` : '0' }));
  }
  const debut = process.hrtime.bigint();
  const m = Mi.calculerMinutage(scenes, elements);
  const ms = Number(process.hrtime.bigint() - debut) / 1e6;
  assert.deepEqual(m.erreurs, []);
  assert.ok(Math.abs(m.duree - (300 - 20 * 0.5)) < 1e-9);
  assert.ok(ms < 50, `${ms} ms`);
});
```

`tests/transitions.test.js` :

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Tr = require('../moteur/transitions.js');

const VIDE = { opacity: '', transform: '', clipPath: '' };

test('fondu, glissement, balayage : début, milieu, fin', () => {
  assert.deepEqual(Tr.styleTransition('fondu', 0), { opacity: '0', transform: '', clipPath: '' });
  assert.deepEqual(Tr.styleTransition('fondu', 0.5), { opacity: '0.5', transform: '', clipPath: '' });
  assert.deepEqual(Tr.styleTransition('glissement', 0), { opacity: '', transform: 'translateX(100%)', clipPath: '' });
  assert.deepEqual(Tr.styleTransition('balayage', 0.5), { opacity: '', transform: '', clipPath: 'inset(0 50% 0 0)' });
  for (const t of Tr.TRANSITIONS) assert.deepEqual(Tr.styleTransition(t, 1), VIDE);
});

test('aucune transition : style vide ; q hors bornes ramené dans [0,1]', () => {
  assert.deepEqual(Tr.styleTransition('aucune', 0), VIDE);
  assert.deepEqual(Tr.styleTransition('fondu', -1), { opacity: '0', transform: '', clipPath: '' });
  assert.deepEqual(Tr.styleTransition('fondu', 3), VIDE);
});

test('transition inconnue : message en français', () => {
  assert.throws(() => Tr.styleTransition('zoom', 0.2), /Transition inconnue : « zoom »/);
});
```

- [ ] **Étape 2 : vérifier l'échec**

Lancer : `node --test tests/minutage.test.js tests/transitions.test.js`
Attendu : FAIL – modules introuvables.

- [ ] **Étape 3 : écrire l'implémentation**

`moteur/minutage.js` :

```js
/* Pulse Motion – minutage : temps absolus des scènes et des éléments.
 *
 * Entrée : les scènes du déroulé et, par scène, les éléments minutés lus dans le HTML.
 *   data-start="0.4"            absolu dans la scène
 *   data-start="#titre+0.3"     début de #titre + 0,3 s
 *   data-start="#titre:fin-0.2" fin de #titre − 0,2 s
 *   data-dur="1.2"              durée (1 s par défaut)
 * Les temps internes d'une scène sont divisés par son rythme.
 *
 * Module pur : chargé tel quel dans la page (global M) et par Node (require).
 */
(function (racine, fabrique) {
  var api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; Object.assign(racine.M, api); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CHEVAUCHEMENT = 0.5;
  var DUREE_DEFAUT = 1;
  var REFERENCE = /^#([A-Za-z0-9_-]+)(:fin)?\s*(?:([+-])\s*(\d*\.?\d+))?$/;
  var NOMBRE = /^\d*\.?\d+$/;

  function chevauchement(scene, index) {
    return index > 0 && scene.transition && scene.transition !== 'aucune' ? CHEVAUCHEMENT : 0;
  }

  /**
   * calculerMinutage(scenes, elementsParScene)
   *   scenes : [{ id, duree, rythme?, transition? }]
   *   elementsParScene : { [idScene]: [{ cle, start?, dur? }] }  (start, dur : textes des attributs)
   * -> { duree, scenes: [{ id, debut, fin, rythme, transition, entree }],
   *      elements: { [idScene]: { [cle]: { debut, fin } } }, erreurs: [{ regle, scene, element, message }] }
   */
  function calculerMinutage(scenes, elementsParScene) {
    var erreurs = [];
    var resultat = { duree: 0, scenes: [], elements: {}, erreurs: erreurs };
    var fin = 0;

    scenes.forEach(function (s, i) {
      var rythme = s.rythme > 0 ? s.rythme : 1;
      var entree = chevauchement(s, i);
      var debut = Math.max(0, fin - entree);
      var finScene = debut + s.duree / rythme;
      resultat.scenes.push({ id: s.id, debut: debut, fin: finScene, rythme: rythme, transition: s.transition || 'aucune', entree: entree });
      resultat.elements[s.id] = minuterScene(s.id, debut, rythme, (elementsParScene && elementsParScene[s.id]) || [], erreurs);
      fin = finScene;
    });
    resultat.duree = fin;
    return resultat;
  }

  function minuterScene(idScene, debutScene, rythme, elements, erreurs) {
    var parCle = {};
    elements.forEach(function (e) { parCle[e.cle] = e; });
    var local = {};      // cle -> { debut, fin } en temps de scène
    var enCours = {};

    function erreur(regle, cle, message) {
      erreurs.push({ regle: regle, scene: idScene, element: cle, message: message });
    }

    function lireDuree(e) {
      if (e.dur === undefined || e.dur === null || e.dur === '') return DUREE_DEFAUT;
      var d = String(e.dur).trim();
      if (!NOMBRE.test(d)) {
        erreur('dur-invalide', e.cle, 'Scène « ' + idScene + ' », élément « ' + e.cle + ' » : data-dur « ' + e.dur + ' » n\'est pas un nombre de secondes.');
        return DUREE_DEFAUT;
      }
      return parseFloat(d);
    }

    function resoudre(cle) {
      if (local[cle]) return local[cle];
      var e = parCle[cle];
      if (enCours[cle]) {
        erreur('reference-circulaire', cle, 'Scène « ' + idScene + ' » : référence circulaire autour de « #' + cle + ' ».');
        return { debut: 0, fin: DUREE_DEFAUT };
      }
      enCours[cle] = true;
      var debut = 0;
      var s = e.start === undefined || e.start === null ? '' : String(e.start).trim();
      if (s === '') debut = 0;
      else if (NOMBRE.test(s)) debut = parseFloat(s);
      else {
        var m = REFERENCE.exec(s);
        if (!m) {
          erreur('start-invalide', cle, 'Scène « ' + idScene + ' », élément « ' + cle + ' » : data-start « ' + s + ' » illisible (exemples : 0.4, #titre+0.3, #titre:fin-0.2).');
        } else if (!parCle[m[1]]) {
          erreur('reference-inconnue', cle, 'Scène « ' + idScene + ' », élément « ' + cle + ' » : « #' + m[1] + ' » n\'existe pas dans cette scène (ou n\'est pas minuté).');
        } else {
          var ref = resoudre(m[1]);
          var decalage = m[4] ? parseFloat(m[4]) * (m[3] === '-' ? -1 : 1) : 0;
          debut = Math.max(0, (m[2] ? ref.fin : ref.debut) + decalage);
        }
      }
      var res = { debut: debut, fin: debut + lireDuree(e) };
      enCours[cle] = false;
      local[cle] = res;
      return res;
    }

    var absolus = {};
    elements.forEach(function (e) {
      var r = resoudre(e.cle);
      absolus[e.cle] = { debut: debutScene + r.debut / rythme, fin: debutScene + r.fin / rythme };
    });
    return absolus;
  }

  /** Progression bornée [0,1] et état d'un intervalle à l'instant t. */
  function progression(t, debut, fin) {
    if (t <= debut) return 0;
    if (t >= fin) return 1;
    return (t - debut) / (fin - debut);
  }
  function etat(t, debut, fin) { return t < debut ? 'avant' : t < fin ? 'pendant' : 'apres'; }

  /** Identifiants des scènes visibles à t (deux pendant un chevauchement). */
  function scenesVisibles(minutage, t) {
    var visibles = minutage.scenes.filter(function (s) { return t >= s.debut && t < s.fin; });
    if (!visibles.length && minutage.scenes.length) visibles = [minutage.scenes[minutage.scenes.length - 1]];
    return visibles.map(function (s) { return s.id; });
  }

  return {
    CHEVAUCHEMENT: CHEVAUCHEMENT,
    calculerMinutage: calculerMinutage,
    progression: progression,
    etat: etat,
    scenesVisibles: scenesVisibles,
  };
});
```

`moteur/transitions.js` :

```js
/* Pulse Motion – transitions d'entrée d'une scène.
 *
 * styleTransition(type, q) : style inline de la scène qui entre, q ∈ [0,1] étant
 * la progression de la transition. Pour la première scène, l'entrée se fait
 * depuis le fond, sans chevauchement.
 *
 * Module pur : chargé tel quel dans la page (global M) et par Node (require).
 */
(function (racine, fabrique) {
  var C = typeof require === 'function' && typeof module === 'object' ? require('./courbes.js') : racine.M;
  var api = fabrique(C);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { racine.M = racine.M || {}; Object.assign(racine.M, api); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';

  var TRANSITIONS = ['aucune', 'fondu', 'glissement', 'balayage'];
  var douce = C.courbe('cubic', 'inout');

  function arrondi(x) { return Math.round(x * 10000) / 10000; }

  /** -> { opacity, transform, clipPath } ('' = valeur par défaut) */
  function styleTransition(type, q) {
    var k = douce(q < 0 ? 0 : q > 1 ? 1 : q);
    var vide = { opacity: '', transform: '', clipPath: '' };
    if (k >= 1 || type === 'aucune' || !type) return vide;
    if (type === 'fondu') return { opacity: String(arrondi(k)), transform: '', clipPath: '' };
    if (type === 'glissement') return { opacity: '', transform: 'translateX(' + arrondi((1 - k) * 100) + '%)', clipPath: '' };
    if (type === 'balayage') return { opacity: '', transform: '', clipPath: 'inset(0 ' + arrondi((1 - k) * 100) + '% 0 0)' };
    throw new Error('Transition inconnue : « ' + type + ' ». Transitions : ' + TRANSITIONS.join(', '));
  }

  return { TRANSITIONS: TRANSITIONS, styleTransition: styleTransition };
});
```

- [ ] **Étape 4 : vérifier le succès**

Lancer : `node --test tests/minutage.test.js tests/transitions.test.js`
Attendu : PASS – 9 + 3 tests.

- [ ] **Étape : commit**

```bash
git add moteur/minutage.js moteur/transitions.js tests/minutage.test.js tests/transitions.test.js
git commit -m "feat(moteur): minutage des scènes et transitions d'entrée

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Lecture et validation de deroule.json

**Files:**
- Create: `scripts/lib/deroule.js`
- Test: `tests/deroule.test.js`

**Interfaces:**
- Consumes: rien.
- Produces (`scripts/lib/deroule.js`, CommonJS) :
  - `validerDeroule(objet): string[]` — messages en français, vides si valide ; chaque message nomme le champ (« « duree » ») et, pour une scène, commence par `La scène « <id> »` ou `La scène n° <n>`.
  - `lireDeroule(dossier): { deroule: object | null, erreurs: string[] }` — fichier absent, JSON invalide, BOM accepté.
  - `GENRES`, `PARCOURS`, `RATIOS`, `TRANSITIONS`.

Schéma : table du §4 de la spec, plus `format.ips` entier entre 12 et 60 et `scenes[].fichier` obligatoire.

- [ ] **Étape 1 : écrire le test qui échoue**

`tests/deroule.test.js` :

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validerDeroule, lireDeroule } = require('../scripts/lib/deroule.js');

const valide = () => ({
  version: 1,
  titre: 'La chaîne du froid',
  genre: 'formation',
  parcours: 'rapide',
  format: { ratio: '16:9', ips: 30 },
  style: 'test',
  charte: { couleurs: { primaire: '#0a6cff' }, polices: { titres: 'Figtree' } },
  musique: { fichier: 'assets/musique.mp3', volume: 0.6 },
  scenes: [{ id: 'intro', fichier: 'scenes/01-intro.html', duree: 6, textes: { titre: 'Pourquoi 4 °C ?' }, transition: 'fondu' }],
});

test('un déroulé complet est valide', () => {
  assert.deepEqual(validerDeroule(valide()), []);
});

test('les champs facultatifs peuvent manquer', () => {
  const d = valide();
  delete d.charte; delete d.musique; delete d.format.ips; delete d.scenes[0].transition;
  assert.deepEqual(validerDeroule(d), []);
});

test('chaque erreur nomme le champ et la scène', () => {
  const d = valide();
  d.genre = 'tuto';
  d.charte.couleurs.primaire = 'bleu';
  d.scenes.push({ id: 'intro', fichier: 'x.html', duree: 0, textes: { a: 3 }, transition: 'zoom', rythme: -1 });
  const e = validerDeroule(d);
  assert.ok(e.some((m) => m.startsWith('« genre » doit être')));
  assert.ok(e.some((m) => m.includes('« charte.couleurs.primaire »') && m.includes('"bleu"')));
  for (const champ of ['« id » est déjà utilisé', '« duree »', '« textes.a »', '« transition »', '« rythme »']) {
    assert.ok(e.some((m) => m.startsWith('La scène « intro »') && m.includes(champ)), `manque : ${champ}`);
  }
});

test('id de scène invalide, aucune scène, pas un objet', () => {
  const d = valide();
  d.scenes[0].id = 'Intro !';
  assert.ok(validerDeroule(d).some((m) => m.includes('a-z, 0-9')));
  assert.deepEqual(validerDeroule({ ...valide(), scenes: [] }).slice(-1), ['« scenes » doit contenir au moins une scène.']);
  assert.deepEqual(validerDeroule([]), ['Le déroulé doit être un objet JSON.']);
});

test('lireDeroule : fichier absent, JSON invalide, BOM accepté', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-'));
  assert.match(lireDeroule(dir).erreurs[0], /Fichier introuvable/);
  fs.writeFileSync(path.join(dir, 'deroule.json'), '{ titre: ');
  assert.match(lireDeroule(dir).erreurs[0], /n'est pas un JSON valide/);
  fs.writeFileSync(path.join(dir, 'deroule.json'), '\uFEFF' + JSON.stringify(valide()));
  assert.deepEqual(lireDeroule(dir).erreurs, []);
});
```

- [ ] **Étape 2 : vérifier l'échec**

Lancer : `node --test tests/deroule.test.js`
Attendu : FAIL – « Cannot find module '../scripts/lib/deroule.js' ».

- [ ] **Étape 3 : écrire l'implémentation**

`scripts/lib/deroule.js` :

```js
'use strict';
/* Pulse Motion – lecture et validation de deroule.json (schéma écrit à la main). */

const fs = require('node:fs');
const path = require('node:path');

const GENRES = ['formation', 'produit', 'storytelling', 'social'];
const PARCOURS = ['rapide', 'accompagne'];
const RATIOS = ['16:9', '9:16', '1:1'];
const TRANSITIONS = ['aucune', 'fondu', 'glissement', 'balayage'];
const ID = /^[a-z0-9-]+$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

const estTexte = (v) => typeof v === 'string' && v.trim() !== '';
const estPositif = (v) => typeof v === 'number' && isFinite(v) && v > 0;

/** -> liste de messages en français, vide si le déroulé est valide. */
function validerDeroule(d) {
  const err = [];
  if (!d || typeof d !== 'object' || Array.isArray(d)) return ['Le déroulé doit être un objet JSON.'];

  if (d.version !== 1) err.push('« version » doit valoir 1.');
  if (!estTexte(d.titre)) err.push('« titre » est obligatoire (texte).');
  if (!GENRES.includes(d.genre)) err.push(`« genre » doit être l'un de : ${GENRES.join(', ')}.`);
  if (!PARCOURS.includes(d.parcours)) err.push(`« parcours » doit être l'un de : ${PARCOURS.join(', ')}.`);
  if (!d.format || !RATIOS.includes(d.format.ratio)) err.push(`« format.ratio » doit être l'un de : ${RATIOS.join(', ')}.`);
  if (d.format && d.format.ips !== undefined && !(Number.isInteger(d.format.ips) && d.format.ips >= 12 && d.format.ips <= 60)) {
    err.push('« format.ips » doit être un entier entre 12 et 60.');
  }
  if (!estTexte(d.style)) err.push('« style » est obligatoire (nom d\'un style du catalogue).');

  if (d.charte !== undefined) {
    const c = d.charte;
    if (c.couleurs) {
      for (const [nom, val] of Object.entries(c.couleurs)) {
        if (!HEX.test(val)) err.push(`« charte.couleurs.${nom} » doit être une couleur #rrggbb (reçu : ${JSON.stringify(val)}).`);
      }
    }
    if (c.polices) {
      for (const [nom, val] of Object.entries(c.polices)) {
        if (!estTexte(val)) err.push(`« charte.polices.${nom} » doit être un nom de police ou un fichier dans assets/.`);
      }
    }
    if (c.logo !== undefined && !estTexte(c.logo)) err.push('« charte.logo » doit être un chemin de fichier dans assets/.');
  }

  if (d.musique !== undefined) {
    if (!estTexte(d.musique.fichier)) err.push('« musique.fichier » doit être un chemin de fichier dans assets/.');
    if (d.musique.volume !== undefined && !(typeof d.musique.volume === 'number' && d.musique.volume >= 0 && d.musique.volume <= 1)) {
      err.push('« musique.volume » doit être un nombre entre 0 et 1.');
    }
  }

  if (!Array.isArray(d.scenes) || d.scenes.length === 0) {
    err.push('« scenes » doit contenir au moins une scène.');
    return err;
  }
  const vus = new Set();
  d.scenes.forEach((s, i) => {
    const nom = s && estTexte(s.id) ? `scène « ${s.id} »` : `scène n° ${i + 1}`;
    if (!s || typeof s !== 'object') { err.push(`La ${nom} doit être un objet.`); return; }
    if (!estTexte(s.id) || !ID.test(s.id)) err.push(`La ${nom} : « id » doit contenir seulement a-z, 0-9 et des tirets.`);
    else if (vus.has(s.id)) err.push(`La ${nom} : « id » est déjà utilisé par une autre scène.`);
    else vus.add(s.id);
    if (!estTexte(s.fichier)) err.push(`La ${nom} : « fichier » est obligatoire (ex. scenes/01-intro.html).`);
    if (!estPositif(s.duree)) err.push(`La ${nom} : « duree » doit être un nombre de secondes supérieur à 0.`);
    if (s.rythme !== undefined && !estPositif(s.rythme)) err.push(`La ${nom} : « rythme » doit être un nombre supérieur à 0.`);
    if (!s.textes || typeof s.textes !== 'object' || Array.isArray(s.textes)) err.push(`La ${nom} : « textes » doit être un objet { clé: texte }.`);
    else for (const [k, v] of Object.entries(s.textes)) {
      if (typeof v !== 'string') err.push(`La ${nom} : « textes.${k} » doit être un texte.`);
    }
    if (s.transition !== undefined && !TRANSITIONS.includes(s.transition)) {
      err.push(`La ${nom} : « transition » doit être l'une de : ${TRANSITIONS.join(', ')}.`);
    }
  });
  return err;
}

/** Lit et valide <dossier>/deroule.json. -> { deroule, erreurs } */
function lireDeroule(dossier) {
  const fichier = path.join(dossier, 'deroule.json');
  let brut;
  try { brut = fs.readFileSync(fichier, 'utf8'); } catch {
    return { deroule: null, erreurs: [`Fichier introuvable : ${fichier}`] };
  }
  let d;
  try { d = JSON.parse(brut.replace(/^\uFEFF/, '')); } catch (e) {
    return { deroule: null, erreurs: [`deroule.json n'est pas un JSON valide : ${e.message}`] };
  }
  return { deroule: d, erreurs: validerDeroule(d) };
}

module.exports = { validerDeroule, lireDeroule, GENRES, PARCOURS, RATIOS, TRANSITIONS };
```

- [ ] **Étape 4 : vérifier le succès**

Lancer : `node --test tests/deroule.test.js`
Attendu : PASS – 5 tests.

- [ ] **Étape : commit**

```bash
git add scripts/lib/deroule.js tests/deroule.test.js
git commit -m "feat(scripts): validation de deroule.json

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Préparation des scènes et embarquement des fichiers

**Files:**
- Create: `scripts/lib/scenes.js`, `scripts/lib/embarquer.js`
- Test: `tests/scenes.test.js`

**Interfaces:**
- Consumes: rien.
- Produces :
  - `scripts/lib/scenes.js` : `echapperHTML(texte)` (`\n` → `<br>`) ; `verifierSection(html, id): string | null` ; `injecterTextes(html, textes): { html, manquants: string[] }` ; `extraireScripts(html): { html, scripts: string[] }` ; `injecterLogo(html, uriLogo | null): string` ; `panneauErreur(id, message): string` (section `data-pm-erreur` avec `.pm-erreur`).
  - `scripts/lib/embarquer.js` : `TYPES_MIME` ; `cheminDansProjet(dossier, relatif): string | null` (null si hors du dossier) ; `versDataURI(fichier): string` ; `embarquerRessources(html, dossier, contexte?): { html, erreurs: [{ regle, gravite, message }] }` — règles `ressource-distante`, `chemin-hors-projet`, `fichier-introuvable`, `fichier-non-pris-en-charge`.

Remarque : l'injection de textes vise les éléments « feuilles » (un `data-texte` ne contient pas d'élément de même balise). C'est la règle donnée aux animateurs dans le plan 2.

- [ ] **Étape 1 : écrire le test qui échoue**

Le dernier test couvre le point 2 du Review Focus (noms avec `%` et accents).

`tests/scenes.test.js` :

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const S = require('../scripts/lib/scenes.js');
const { embarquerRessources, cheminDansProjet } = require('../scripts/lib/embarquer.js');

test('verifierSection : une seule section, bon identifiant', () => {
  assert.equal(S.verifierSection('<section data-scene="a"></section>', 'a'), null);
  assert.match(S.verifierSection('<div></div>', 'a'), /exactement une <section> \(trouvé : 0\)/);
  assert.match(S.verifierSection('<section data-scene="a"></section><section data-scene="b"></section>', 'a'), /trouvé : 2/);
  assert.match(S.verifierSection('<section></section>', 'a'), /doit porter data-scene="a"/);
  assert.match(S.verifierSection('<section data-scene="b"></section>', 'a'), /porte data-scene="b" au lieu de "a"/);
});

test('injecterTextes : textes échappés, sauts de ligne, clés manquantes signalées', () => {
  const { html, manquants } = S.injecterTextes(
    '<h1 class="t" data-texte="titre">x</h1><p data-texte="corps"></p><span data-texte="absent">y</span>',
    { titre: 'Pourquoi <4 °C> ?', corps: 'ligne 1\nligne 2' },
  );
  assert.equal(html, '<h1 class="t" data-texte="titre">Pourquoi &lt;4 °C&gt; ?</h1><p data-texte="corps">ligne 1<br>ligne 2</p><span data-texte="absent">[texte « absent » manquant]</span>');
  assert.deepEqual(manquants, ['absent']);
});

test('extraireScripts et injecterLogo', () => {
  const { html, scripts } = S.extraireScripts('<p>a</p><script>M.x(1)</script><p>b</p>');
  assert.equal(html, '<p>a</p><p>b</p>');
  assert.deepEqual(scripts, ['M.x(1)']);
  assert.equal(S.injecterLogo('<img data-logo alt="L" src="old.png">', 'data:x'), '<img data-logo alt="L" src="data:x">');
  assert.equal(S.injecterLogo('<img data-logo>', null), '<img data-logo>');
});

test('panneauErreur : section visible, texte échappé', () => {
  assert.equal(S.panneauErreur('a', 'fichier <x> introuvable'),
    '<section data-scene="a" data-pm-erreur><div class="pm-erreur">Scène « a » : fichier &lt;x&gt; introuvable</div></section>');
});

test('embarquerRessources : data:, distantes, hors projet, introuvables', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-emb-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'a b.svg'), '<svg/>');
  const { html, erreurs } = embarquerRessources(
    '<img src="assets/a%20b.svg"><div style="background:url(\'assets/a%20b.svg\')"></div>' +
    '<img src="https://exemple.fr/x.png"><img src="../secret.png"><img src="assets/zz.png"><a href="#ancre"></a>',
    dir, 'scène « t »',
  );
  const uri = 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64');
  assert.ok(html.startsWith(`<img src="${uri}"><div style="background:url("${uri}")">`));
  assert.ok(html.includes('href="#ancre"'));
  assert.deepEqual(erreurs.map((e) => e.regle), ['ressource-distante', 'chemin-hors-projet', 'fichier-introuvable']);
  assert.match(erreurs[0].message, /hors ligne/);
  assert.match(erreurs[0].message, /\(scène « t »\)/);
});

test('cheminDansProjet refuse de sortir du projet', () => {
  assert.equal(cheminDansProjet('/p', '../x'), null);
  assert.ok(cheminDansProjet('/p', 'assets/x.png').endsWith(path.join('assets', 'x.png')));
});

test('embarquerRessources : nom de fichier avec % et accents', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-emb-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', '100%.svg'), '<svg/>');
  fs.writeFileSync(path.join(dir, 'assets', 'été.svg'), '<svg/>');
  const { html, erreurs } = embarquerRessources('<img src="assets/100%.svg"><img src="assets/été.svg">', dir);
  assert.deepEqual(erreurs, []);
  assert.equal((html.match(/data:image\/svg\+xml;base64,/g) || []).length, 2);
});
```

- [ ] **Étape 2 : vérifier l'échec**

Lancer : `node --test tests/scenes.test.js`
Attendu : FAIL – modules introuvables.

- [ ] **Étape 3 : écrire l'implémentation**

`scripts/lib/scenes.js` :

```js
'use strict';
/* Pulse Motion – préparation d'une scène : contrôle de la section, textes, scripts. */

function echapperHTML(texte) {
  return String(texte)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

/** Vérifie qu'un fichier de scène contient une seule <section data-scene="id">. -> message ou null */
function verifierSection(html, id) {
  const sections = html.match(/<section\b[^>]*>/gi) || [];
  if (sections.length !== 1) return `le fichier doit contenir exactement une <section> (trouvé : ${sections.length}).`;
  const m = /\sdata-scene=(["'])([^"']*)\1/.exec(sections[0]);
  if (!m) return 'la <section> doit porter data-scene="' + id + '".';
  if (m[2] !== id) return `la <section> porte data-scene="${m[2]}" au lieu de "${id}".`;
  return null;
}

const ELEMENT_TEXTE = /<([a-zA-Z][\w-]*)(\b[^>]*?\sdata-texte=(["'])([^"']+)\3[^>]*)>([\s\S]*?)<\/\1>/g;

/**
 * Remplit les éléments data-texte="clé" avec les textes du déroulé (échappés).
 * -> { html, manquants: [clé] }
 */
function injecterTextes(html, textes) {
  const manquants = [];
  const sortie = html.replace(ELEMENT_TEXTE, (tout, balise, attributs, g, cle) => {
    if (!Object.prototype.hasOwnProperty.call(textes || {}, cle)) {
      manquants.push(cle);
      return `<${balise}${attributs}>[texte « ${echapperHTML(cle)} » manquant]</${balise}>`;
    }
    return `<${balise}${attributs}>${echapperHTML(textes[cle])}</${balise}>`;
  });
  return { html: sortie, manquants };
}

/** Retire les <script> d'une scène. -> { html, scripts: [code] } */
function extraireScripts(html) {
  const scripts = [];
  const sortie = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (tout, code) => {
    scripts.push(code);
    return '';
  });
  return { html: sortie, scripts };
}

/** Ajoute src="logo" aux <img data-logo>. */
function injecterLogo(html, uriLogo) {
  if (!uriLogo) return html;
  return html.replace(/<img\b([^>]*\sdata-logo\b[^>]*?)\/?>/gi, (tout, attributs) => {
    const sansSrc = attributs.replace(/\ssrc=(["'])[^"']*\1/i, '');
    return `<img${sansSrc} src="${uriLogo}">`;
  });
}

/** Section de remplacement affichée dans l'aperçu quand une scène est en erreur. */
function panneauErreur(id, message) {
  return `<section data-scene="${echapperHTML(id)}" data-pm-erreur><div class="pm-erreur">Scène « ${echapperHTML(id)} » : ${echapperHTML(message)}</div></section>`;
}

module.exports = { echapperHTML, verifierSection, injecterTextes, extraireScripts, injecterLogo, panneauErreur };
```

`scripts/lib/embarquer.js` :

```js
'use strict';
/* Pulse Motion – embarque les fichiers du projet dans la page (data:), pour une page autonome. */

const fs = require('node:fs');
const path = require('node:path');

const TYPES_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
};

/** Chemin relatif au projet -> chemin absolu, ou null s'il sort du projet. */
function cheminDansProjet(dossierProjet, relatif) {
  const racine = path.resolve(dossierProjet);
  const absolu = path.resolve(racine, relatif);
  return absolu === racine || absolu.startsWith(racine + path.sep) ? absolu : null;
}

/** Fichier -> URL data:. Lève une erreur en français si le type n'est pas pris en charge. */
function versDataURI(fichier) {
  const mime = TYPES_MIME[path.extname(fichier).toLowerCase()];
  if (!mime) throw new Error(`type de fichier non pris en charge : ${path.basename(fichier)}`);
  return `data:${mime};base64,${fs.readFileSync(fichier).toString('base64')}`;
}

const RESSOURCE_ATTR = /(\s(?:src|href|xlink:href)=)(["'])([^"']+)\2/g;
const RESSOURCE_CSS = /url\((["']?)([^)"']+)\1\)/g;
const IGNOREES = /^(data:|#|about:|javascript:)/i;
const DISTANTES = /^(https?:)?\/\//i;

/**
 * Remplace les chemins de fichiers (src, href, url()) par des URL data:.
 * -> { html, erreurs: [{ regle, gravite, message }] }
 */
function embarquerRessources(html, dossierProjet, contexte) {
  const erreurs = [];
  const cache = new Map();
  const ou = contexte ? ` (${contexte})` : '';

  function remplacer(chemin) {
    if (IGNOREES.test(chemin)) return null;
    if (DISTANTES.test(chemin)) {
      erreurs.push({ regle: 'ressource-distante', gravite: 'erreur', message: `« ${chemin} » est sur internet${ou} : copiez le fichier dans assets/ pour que la vidéo fonctionne hors ligne.` });
      return null;
    }
    if (cache.has(chemin)) return cache.get(chemin);
    let decode = chemin;
    try { decode = decodeURI(chemin); } catch { /* « 100%.png » : nom pris tel quel */ }
    const absolu = cheminDansProjet(dossierProjet, decode);
    let resultat = null;
    if (!absolu) {
      erreurs.push({ regle: 'chemin-hors-projet', gravite: 'erreur', message: `« ${chemin} » sort du dossier du projet${ou}.` });
    } else if (!fs.existsSync(absolu)) {
      erreurs.push({ regle: 'fichier-introuvable', gravite: 'erreur', message: `Fichier introuvable : « ${chemin} »${ou}.` });
    } else {
      try { resultat = versDataURI(absolu); } catch (e) {
        erreurs.push({ regle: 'fichier-non-pris-en-charge', gravite: 'erreur', message: `« ${chemin} »${ou} : ${e.message}.` });
      }
    }
    cache.set(chemin, resultat);
    return resultat;
  }

  let sortie = html.replace(RESSOURCE_ATTR, (tout, debut, guillemet, chemin) => {
    const uri = remplacer(chemin);
    return uri ? `${debut}${guillemet}${uri}${guillemet}` : tout;
  });
  sortie = sortie.replace(RESSOURCE_CSS, (tout, guillemet, chemin) => {
    const uri = remplacer(chemin);
    return uri ? `url("${uri}")` : tout;
  });
  return { html: sortie, erreurs };
}

module.exports = { TYPES_MIME, cheminDansProjet, versDataURI, embarquerRessources };
```

- [ ] **Étape 4 : vérifier le succès**

Lancer : `node --test tests/scenes.test.js`
Attendu : PASS – 7 tests.

- [ ] **Étape : commit**

```bash
git add scripts/lib/scenes.js scripts/lib/embarquer.js tests/scenes.test.js
git commit -m "feat(scripts): préparation des scènes et embarquement des fichiers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Horloge, lecteur et mise en page (navigateur)

**Files:**
- Create: `moteur/horloge.js`, `moteur/lecteur.js`, `moteur/base.css`
- Create: `tests/aide/navigateur.js`
- Test: `tests/navigateur.html`, `tests/navigateur.test.js`

**Interfaces:**
- Consumes (global `M`, fichiers chargés avant dans cet ordre : courbes, minutage, transitions, tween) : `M.calculerMinutage`, `M.progression`, `M.etat`, `M.scenesVisibles`, `M.CHEVAUCHEMENT`, `M.styleTransition`, `M.analyserTween`, `M.texteTween`.
- Produces :
  - `moteur/horloge.js` : `M.demarrer()` (lit `<script type="application/json" id="pm-donnees">` = `{ titre, format: { ratio, ips }, musique: { volume } | null, scenes: [{ id, duree, rythme, transition }] }` et `#pm-scene > section[data-scene]`) ; `M.rendre(t): number` (t borné) ; `M.seek(t): Promise<number>` ; `M.pret: Promise` ; `M.temps()` ; `M.chaqueImage(idScene, fn(p, tScene))` ; `M.surRendu(fn(t))` ; `M.modeCapture(bool)` ; `M.reel = { now, dateNow, raf }` ; `M.donnees`, `M.ips`, `M.minutage`, `M.duree`, `M.erreurs`. Pose `--p` et `data-etat` sur chaque élément minuté, `data-pm-cle` (id ou `_n`), `data-pm-pret` sur `<html>`.
  - `moteur/lecteur.js` : `M.demarrerLecteur()` ; crée `#pm-lecteur` et `#pm-bandeau` ; lit `window.__PM_APERCU__` (active `EventSource('/_pm/evenements')`, événements `recharger` et `erreur` avec `data: { message }`) et `window.__PM_ERREURS__` (`[{ message }]`) ; position conservée dans `sessionStorage['pm-position']`.
  - `moteur/base.css` : variables `--pm-ratio-l`, `--pm-ratio-h` attendues sur `:root` ; `#pm-scene` en `container-type: size`.
  - `tests/aide/navigateur.js` : `trouverNavigateur(): string | null` (variable `PM_NAVIGATEUR`, sinon emplacements usuels de Chrome et Edge) ; `rendreDOM(navigateur, fichierOuURL): Promise<string>` (`--headless=new --dump-dom --virtual-time-budget=5000`).

Points d'attention (constatés au prototype) :
- **Toutes** les scènes sont rendues à chaque image (seules les visibles sont affichées) : sinon l'état d'une scène masquée reste figé et `seek` n'est plus déterministe.
- Le temps SMIL ne démarre qu'**une tâche après `load`** : `M.pret` le signale et provoque un nouveau rendu ; `M.seek` l'attend.
- Une animation CSS est calée sur le début de l'élément minuté le plus proche qui la porte (lui-même ou un ancêtre dans la scène), sinon sur le début de la scène ; `currentTime` négatif ramené à 0.
- Sous `--dump-dom`, une connexion `EventSource` ouverte empêche Chrome de rendre la main : les tests navigateur chargent les pages en `file://`.

- [ ] **Étape 1 : écrire le test qui échoue**

`tests/aide/navigateur.js` :

```js
'use strict';
/* Trouve Chrome ou Edge et rend une page en mode sans fenêtre (tests seulement). */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const CANDIDATS = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'],
};

function trouverNavigateur() {
  if (process.env.PM_NAVIGATEUR) return process.env.PM_NAVIGATEUR;
  return (CANDIDATS[process.platform] || []).find((p) => fs.existsSync(p)) || null;
}

/** Charge un fichier HTML ou une URL ; -> Promise du DOM après exécution des scripts. */
function rendreDOM(navigateur, cible) {
  const url = /^https?:/.test(cible) ? cible : pathToFileURL(path.resolve(cible)).href;
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-chrome-'));
  return new Promise((resolve, reject) => {
    execFile(navigateur, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profil}`, '--allow-file-access-from-files',
      '--virtual-time-budget=5000', '--dump-dom', url,
    ], { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 26 }, (erreur, sortie) => {
      fs.rmSync(profil, { recursive: true, force: true });
      if (erreur) reject(erreur); else resolve(sortie);
    });
  });
}

module.exports = { trouverNavigateur, rendreDOM };
```

`tests/navigateur.test.js` :

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { trouverNavigateur, rendreDOM } = require('./aide/navigateur.js');

const navigateur = trouverNavigateur();

test('moteur dans le navigateur (tests/navigateur.html)', { skip: !navigateur && 'Chrome ou Edge introuvable (variable PM_NAVIGATEUR pour l\'indiquer)' }, async () => {
  const dom = await rendreDOM(navigateur, path.join(__dirname, 'navigateur.html'));
  const m = /RESULTAT: [^<]*/.exec(dom);
  assert.ok(m, 'résultat absent de la page');
  assert.match(m[0], /^RESULTAT: OK/, m[0]);
});
```

`tests/navigateur.html` :

```html
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Pulse Motion – test du moteur</title>
<link rel="stylesheet" href="../moteur/base.css">
<style>
  body { --pm-ratio-l: 16; --pm-ratio-h: 9; }
  @keyframes apparait { from { opacity: 0; } to { opacity: 1; } }
  #anime { animation: apparait 1s linear both; }
  #glisse { transform: translateX(calc((1 - var(--p)) * 10cqh)); }
</style>
</head>
<body>
<div id="pm-scene">
  <section data-scene="a">
    <h1 id="titre" data-start="0.5" data-dur="1">Titre</h1>
    <p id="anime" data-start="#titre:fin+0" data-dur="1">Apparaît</p>
    <p id="glisse" data-start="1" data-dur="2" data-tween="--x 0cqh→10cqh linear">Glisse</p>
    <span id="compteur" data-start="0" data-dur="2" data-tween="nombre 0→1250 linear">0</span>
    <svg width="10" height="10"><rect width="10" height="10"><animate attributeName="x" from="0" to="10" dur="2s" fill="freeze"/></rect></svg>
  </section>
  <section data-scene="b">
    <p id="b1" data-start="0.2" data-dur="0.5">B</p>
  </section>
</div>
<pre id="resultat">EN COURS</pre>
<script type="application/json" id="pm-donnees">
{"titre":"test","format":{"ratio":"16:9","ips":30},"musique":null,
 "scenes":[{"id":"a","duree":4,"rythme":1,"transition":"aucune"},{"id":"b","duree":2,"rythme":0.5,"transition":"fondu"}]}
</script>
<script src="../moteur/courbes.js"></script>
<script src="../moteur/minutage.js"></script>
<script src="../moteur/transitions.js"></script>
<script src="../moteur/tween.js"></script>
<script src="../moteur/horloge.js"></script>
<script src="../moteur/lecteur.js"></script>
<script>
  // Le temps SMIL ne démarre qu'après le chargement : les vérifications attendent M.pret.
  var rappels = [];
  M.chaqueImage('a', function (p, tScene) { rappels.push([p, tScene]); });
  M.demarrer();
  M.demarrerLecteur();
  M.pret.then(verifierTout);

  function verifierTout() {

  var echecs = [], total = 0;
  function verifier(nom, ok, detail) { total++; if (!ok) echecs.push(nom + (detail ? ' (' + detail + ')' : '')); }
  function proche(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-3); }
  function cs(id, prop) { return getComputedStyle(document.getElementById(id)).getPropertyValue(prop).trim(); }
  function photo() {
    var o = {};
    document.querySelectorAll('[data-pm-cle], section[data-scene]').forEach(function (e) {
      var s = getComputedStyle(e);
      o[e.id || e.getAttribute('data-scene')] = [s.opacity, s.transform, s.display, s.getPropertyValue('--p'), s.getPropertyValue('--x'), e.getAttribute('data-etat'), e.textContent];
    });
    return JSON.stringify(o);
  }

  // Durée : 4 + 2 / 0,5 − 0,5 de chevauchement = 7,5 s
  verifier('durée totale', proche(M.duree, 7.5), M.duree);
  verifier('aucune erreur de minutage', M.erreurs.length === 0, JSON.stringify(M.erreurs));

  // Déterminisme : même image en arrivant par 0→t ou par 5→t.
  M.rendre(0); M.rendre(2.3); var direct = photo();
  M.rendre(5); M.rendre(2.3); var detour = photo();
  verifier('seek déterministe (0→2,3 / 5→2,3)', direct === detour, direct + ' ≠ ' + detour);
  M.rendre(6.1); M.rendre(3.75); var a1 = photo();
  M.rendre(0.2); M.rendre(3.75); var a2 = photo();
  verifier('seek déterministe pendant le chevauchement', a1 === a2);

  // Animation CSS calée sur l'élément porteur : #anime commence à 1,5 s.
  M.rendre(2.0);
  verifier('animation CSS à mi-course', proche(parseFloat(cs('anime', 'opacity')), 0.5, 0.02), cs('anime', 'opacity'));
  M.rendre(1.0);
  verifier('animation CSS avant son début', proche(parseFloat(cs('anime', 'opacity')), 0, 0.02), cs('anime', 'opacity'));

  // --p, data-etat, data-tween, nombre.
  M.rendre(2);
  verifier('--p à mi-course', cs('glisse', '--p') === '0.5', cs('glisse', '--p'));
  verifier('data-tween --x', cs('glisse', '--x') === '5cqh', cs('glisse', '--x'));
  verifier('data-etat pendant', document.getElementById('glisse').getAttribute('data-etat') === 'pendant');
  verifier('data-etat après', document.getElementById('titre').getAttribute('data-etat') === 'apres');
  verifier('compteur en français', document.getElementById('compteur').textContent.replace(/\s/g, ' ') === '1 250');

  // SMIL : temps de la scène.
  M.rendre(1.25);
  var svg = document.querySelector('section[data-scene="a"] svg');
  verifier('SMIL en pause et calé', svg.animationsPaused() && proche(svg.getCurrentTime(), 1.25), svg.animationsPaused() + ' ' + svg.getCurrentTime());

  // Visibilité et transition.
  M.rendre(1);
  verifier('scène b masquée au début', getComputedStyle(document.querySelector('[data-scene="b"]')).display === 'none');
  M.rendre(3.75);
  var opB = parseFloat(getComputedStyle(document.querySelector('[data-scene="b"]')).opacity);
  verifier('fondu de b à mi-chevauchement', proche(opB, 0.5, 0.02), opB);
  M.rendre(7);
  verifier('scène a masquée à la fin', getComputedStyle(document.querySelector('[data-scene="a"]')).display === 'none');

  // Rythme 0,5 : b1 à 0,2 s de scène → 3,5 + 0,4 = 3,9 s absolu.
  M.rendre(3.9);
  verifier('rythme appliqué aux éléments', document.getElementById('b1').getAttribute('data-etat') === 'pendant');

  // Rappels M.chaqueImage.
  rappels = []; M.rendre(2);
  verifier('M.chaqueImage reçoit p et t de scène', rappels.length === 1 && proche(rappels[0][0], 0.5) && proche(rappels[0][1], 2));

  // t borné, aléa reproductible, capture.
  verifier('t borné à la durée', M.rendre(99) === 7.5 && M.rendre(-3) === 0);
  M.modeCapture(true); M.rendre(2);
  verifier('Date.now suit t en capture', Date.now() === 1767225600000 + 2000);
  M.modeCapture(false);
  verifier('lecteur présent', !!document.getElementById('pm-lecteur'));

  M.seek(1).then(function (t) {
    verifier('seek renvoie une promesse', t === 1);
    document.getElementById('resultat').textContent = echecs.length
      ? 'RESULTAT: ECHEC ' + echecs.length + '/' + total + '\n' + echecs.join('\n')
      : 'RESULTAT: OK ' + total + '/' + total;
  });
  }
</script>
</body>
</html>
```

- [ ] **Étape 2 : vérifier l'échec**

Lancer : `node --test tests/navigateur.test.js`
Attendu : FAIL – « résultat absent de la page » (`M` non défini). Sans Chrome ni Edge, le test est ignoré (« skipped ») : définir `PM_NAVIGATEUR` vers l'exécutable du navigateur.

- [ ] **Étape 3 : écrire l'implémentation**

`moteur/horloge.js` :

```js
/* Pulse Motion – horloge : l'état visible ne dépend que de t.
 *
 * M.demarrer()        lit #pm-donnees et les scènes, calcule le minutage, rend t = 0
 * M.rendre(t)         pose l'état de la page à l'instant t (synchrone)
 * M.pret             Promise résolue quand le temps SMIL a démarré (après « load »)
 * M.seek(t)           attend M.pret, rend t puis attend polices et images (Promise)
 * M.temps()           instant courant
 * M.chaqueImage(id, fn(p, tScene))   seul point d'entrée JavaScript d'une scène
 * M.surRendu(fn(t))   prévenu après chaque rendu (lecteur, export)
 * M.modeCapture(bool) Date.now et performance.now suivent t (export)
 *
 * Aléa reproductible et horloge virtuelle : idée et algorithme mulberry32 repris de
 * showtime (skills/showtime/runtime/stage.js), licence MIT.
 * Navigateur seulement ; dépend de courbes, minutage, transitions, tween (global M).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var EPOCH = 1767225600000; // 2026-01-01T00:00:00Z : Date.now() à t = 0 en capture

  var reel = {
    now: racine.performance.now.bind(racine.performance),
    dateNow: Date.now,
    raf: racine.requestAnimationFrame.bind(racine),
  };
  M.reel = reel;

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  Math.random = mulberry32(0x5eed1234);

  var etat = { t: 0, scenes: [], rappels: {}, auditeurs: [] };

  // Le temps SMIL ne démarre qu'une tâche après « load » : on rend à nouveau à ce moment-là.
  M.pret = new Promise(function (resolve) {
    function apresChargement() { setTimeout(function () { if (M.minutage) M.rendre(etat.t); resolve(); }, 0); }
    if (document.readyState === 'complete') apresChargement();
    else racine.addEventListener('load', apresChargement);
  });

  function arrondi(x) { return Math.round(x * 10000) / 10000; }

  function lireElements(section) {
    var liste = [];
    var n = 0;
    section.querySelectorAll('[data-start],[data-dur],[data-tween]').forEach(function (el) {
      var cle = el.id || ('_' + (++n));
      el.setAttribute('data-pm-cle', cle);
      liste.push({ cle: cle, start: el.getAttribute('data-start'), dur: el.getAttribute('data-dur'), el: el });
    });
    return liste;
  }

  M.demarrer = function () {
    var donnees = JSON.parse(document.getElementById('pm-donnees').textContent);
    M.donnees = donnees;
    M.ips = (donnees.format && donnees.format.ips) || 30;
    var erreurs = [];
    var sections = {};
    document.querySelectorAll('#pm-scene > section[data-scene]').forEach(function (s) { sections[s.getAttribute('data-scene')] = s; });

    var elementsParScene = {};
    donnees.scenes.forEach(function (sc) {
      elementsParScene[sc.id] = sections[sc.id] ? lireElements(sections[sc.id]) : [];
    });
    var min = M.calculerMinutage(donnees.scenes, elementsParScene);
    M.minutage = min;
    M.duree = min.duree;

    etat.scenes = min.scenes.map(function (info, index) {
      var sec = sections[info.id];
      var elements = elementsParScene[info.id].map(function (e) {
        var tweens = [];
        var attr = e.el.getAttribute('data-tween');
        if (attr) {
          try { tweens = M.analyserTween(attr); } catch (err) {
            erreurs.push({ regle: 'tween-invalide', scene: info.id, element: e.cle, message: 'Scène « ' + info.id + ' », élément « ' + e.cle + ' » : ' + err.message });
          }
        }
        var temps = min.elements[info.id][e.cle];
        return { el: e.el, debut: temps.debut, fin: temps.fin, tweens: tweens };
      });
      var debuts = new Map();
      elements.forEach(function (e) { debuts.set(e.el, e.debut); });
      return {
        info: info,
        index: index,
        sec: sec,
        elements: elements,
        debuts: debuts,
        svgs: sec ? Array.prototype.slice.call(sec.querySelectorAll('svg')) : [],
      };
    });
    M.erreurs = min.erreurs.concat(erreurs);
    M.erreurs.forEach(function (e) { console.warn('[Pulse Motion] ' + e.message); });
    M.rendre(0);
    document.documentElement.setAttribute('data-pm-pret', '');
  };

  function rendreScene(s, t) {
    var info = s.info;
    // Transition d'entrée : chevauchement, ou entrée depuis le fond pour la première scène.
    var dureeEntree = info.entree > 0 ? info.entree : (s.index === 0 ? M.CHEVAUCHEMENT : 0);
    var q = dureeEntree > 0 ? (t - info.debut) / dureeEntree : 1;
    var st = M.styleTransition(info.transition, q);
    s.sec.style.opacity = st.opacity;
    s.sec.style.transform = st.transform;
    s.sec.style.clipPath = st.clipPath;

    s.elements.forEach(function (e) {
      var p = M.progression(t, e.debut, e.fin);
      e.el.style.setProperty('--p', String(arrondi(p)));
      e.el.setAttribute('data-etat', M.etat(t, e.debut, e.fin));
      e.tweens.forEach(function (c) {
        if (c.prop === 'nombre') e.el.textContent = M.texteTween(c, p);
        else e.el.style.setProperty(c.prop, M.texteTween(c, p));
      });
    });

    // Animations CSS et WAAPI : en pause, positionnées depuis le début de l'élément minuté porteur.
    s.sec.getAnimations({ subtree: true }).forEach(function (a) {
      a.pause();
      var base = info.debut;
      var cible = a.effect && a.effect.target;
      while (cible && cible !== s.sec) {
        if (s.debuts.has(cible)) { base = s.debuts.get(cible); break; }
        cible = cible.parentElement;
      }
      a.currentTime = Math.max(0, (t - base) * info.rythme * 1000);
    });

    // SMIL : temps de la scène.
    s.svgs.forEach(function (svg) {
      if (svg.pauseAnimations) {
        svg.pauseAnimations();
        svg.setCurrentTime(Math.max(0, (t - info.debut) * info.rythme));
      }
    });

    (etat.rappels[info.id] || []).forEach(function (fn) {
      try { fn(M.progression(t, info.debut, info.fin), Math.max(0, (t - info.debut) * info.rythme)); } catch (err) {
        console.error('[Pulse Motion] Scène « ' + info.id + ' » : erreur dans M.chaqueImage : ' + err.message);
      }
    });
  }

  M.rendre = function (t) {
    if (!M.minutage) throw new Error('M.demarrer() doit être appelé avant M.rendre().');
    t = Math.max(0, Math.min(M.duree, Number(t) || 0));
    etat.t = t;
    var visibles = M.scenesVisibles(M.minutage, t);
    // Toutes les scènes sont rendues (l'état d'une scène masquée reste juste) ; seules les visibles s'affichent.
    etat.scenes.forEach(function (s) {
      if (!s.sec) return;
      var affichage = visibles.indexOf(s.info.id) < 0 ? 'none' : '';
      if (s.sec.style.display !== affichage) s.sec.style.display = affichage;
      rendreScene(s, t);
    });
    etat.auditeurs.forEach(function (fn) { fn(t); });
    return t;
  };

  M.seek = function (t) {
    return M.pret.then(function () {
      M.rendre(t);
      var attentes = [document.fonts ? document.fonts.ready : Promise.resolve()];
      document.querySelectorAll('#pm-scene img').forEach(function (img) {
        if (!img.complete) attentes.push(img.decode().catch(function () {}));
      });
      return Promise.all(attentes);
    }).then(function () { return etat.t; });
  };

  M.temps = function () { return etat.t; };
  M.chaqueImage = function (idScene, fn) { (etat.rappels[idScene] = etat.rappels[idScene] || []).push(fn); };
  M.surRendu = function (fn) { etat.auditeurs.push(fn); };

  M.modeCapture = function (actif) {
    if (actif) {
      racine.performance.now = function () { return etat.t * 1000; };
      Date.now = function () { return EPOCH + Math.round(etat.t * 1000); };
    } else {
      racine.performance.now = reel.now;
      Date.now = reel.dateNow;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

`moteur/lecteur.js` :

```js
/* Pulse Motion – lecteur : barre de lecture de la page (aperçu et page livrée).
 *
 * Espace : lecture/pause · ←/→ : une image · Maj+←/→ : scène précédente/suivante
 * B : boucle sur la scène courante · clic sur l'image : lecture/pause.
 * Sous l'aperçu (window.__PM_APERCU__), écoute /_pm/evenements : rechargement à la
 * même position après une retouche, bandeau en cas d'erreur d'assemblage.
 * Navigateur seulement ; dépend de horloge (global M).
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var CLE_POSITION = 'pm-position';

  function el(tag, attrs, parent) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'texte') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }

  function horodatage(t) {
    var s = Math.floor(t);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  M.demarrerLecteur = function () {
    var ips = M.ips;
    var scenes = M.minutage.scenes;
    var musique = document.getElementById('pm-musique');
    var volume = M.donnees.musique && typeof M.donnees.musique.volume === 'number' ? M.donnees.musique.volume : 1;
    var lecture = false, dernier = 0, boucle = null;

    var barre = el('div', { id: 'pm-lecteur' }, document.body);
    var bouton = el('button', { type: 'button', 'aria-label': 'Lecture', texte: '▶' }, barre);
    var piste = el('div', { class: 'pm-piste' }, barre);
    var curseur = el('input', { type: 'range', min: '0', max: String(M.duree), step: String(1 / ips), value: '0', 'aria-label': 'Position' }, piste);
    var reperes = el('div', { class: 'pm-reperes' }, piste);
    scenes.forEach(function (s) {
      var r = el('span', { title: s.id }, reperes);
      r.style.left = (100 * s.debut / M.duree) + '%';
    });
    var etiquette = el('span', { class: 'pm-etiquette' }, barre);
    var bandeau = el('div', { id: 'pm-bandeau', hidden: '' }, document.body);

    function indexScene(t) {
      var i = 0;
      scenes.forEach(function (s, k) { if (t >= s.debut) i = k; });
      return i;
    }

    function afficher(t) {
      curseur.value = String(t);
      var i = indexScene(t);
      etiquette.textContent = 'Scène ' + (i + 1) + '/' + scenes.length + ' · ' + scenes[i].id + (boucle ? ' (boucle)' : '') +
        ' · ' + horodatage(t) + ' / ' + horodatage(M.duree);
      if (musique && lecture) {
        musique.volume = Math.max(0, Math.min(1, volume * Math.min(1, t / 0.5, (M.duree - t) / 1.5)));
        if (Math.abs(musique.currentTime - t) > 0.15) musique.currentTime = t;
      }
    }
    M.surRendu(afficher);

    function jouer() {
      if (M.temps() >= M.duree) M.rendre(0);
      lecture = true;
      bouton.textContent = '⏸';
      bouton.setAttribute('aria-label', 'Pause');
      if (musique) { musique.currentTime = M.temps(); musique.play().catch(function () {}); }
      dernier = M.reel.now();
      M.reel.raf(boucler);
    }
    function pause() {
      lecture = false;
      bouton.textContent = '▶';
      bouton.setAttribute('aria-label', 'Lecture');
      if (musique) musique.pause();
    }
    function basculer() { if (lecture) pause(); else jouer(); }
    function boucler() {
      if (!lecture) return;
      var maintenant = M.reel.now();
      var t = M.temps() + (maintenant - dernier) / 1000;
      dernier = maintenant;
      if (boucle && t >= boucle.fin) t = boucle.debut;
      if (t >= M.duree) { M.rendre(M.duree); pause(); return; }
      M.rendre(t);
      M.reel.raf(boucler);
    }
    function aller(t) {
      M.rendre(t);
      if (musique && lecture) musique.currentTime = M.temps();
    }

    bouton.addEventListener('click', basculer);
    document.getElementById('pm-scene').addEventListener('click', basculer);
    curseur.addEventListener('input', function () { aller(parseFloat(curseur.value)); });
    document.addEventListener('keydown', function (e) {
      if (e.target && e.target.tagName === 'INPUT' && e.key !== ' ') return;
      var i = indexScene(M.temps());
      if (e.key === ' ') { e.preventDefault(); basculer(); }
      else if (e.key === 'ArrowRight' && e.shiftKey) { e.preventDefault(); aller(scenes[Math.min(i + 1, scenes.length - 1)].debut); }
      else if (e.key === 'ArrowLeft' && e.shiftKey) { e.preventDefault(); aller(scenes[Math.max(i - 1, 0)].debut); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); pause(); aller(M.temps() + 1 / ips); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); pause(); aller(M.temps() - 1 / ips); }
      else if (e.key === 'b' || e.key === 'B') { boucle = boucle ? null : scenes[i]; afficher(M.temps()); }
    });

    // Position conservée au rechargement provoqué par l'aperçu.
    var sauvee = null;
    try { sauvee = JSON.parse(sessionStorage.getItem(CLE_POSITION) || 'null'); sessionStorage.removeItem(CLE_POSITION); } catch (e) { /* stockage indisponible */ }
    if (sauvee && typeof sauvee.t === 'number') { M.rendre(sauvee.t); if (sauvee.lecture) jouer(); }
    else afficher(M.temps());

    if (racine.__PM_APERCU__ && racine.EventSource) {
      var source = new EventSource('/_pm/evenements');
      source.addEventListener('recharger', function () {
        try { sessionStorage.setItem(CLE_POSITION, JSON.stringify({ t: M.temps(), lecture: lecture })); } catch (e) { /* ignoré */ }
        location.reload();
      });
      source.addEventListener('erreur', function (ev) {
        var message = 'Erreur d\'assemblage';
        try { message = JSON.parse(ev.data).message; } catch (e) { /* ignoré */ }
        bandeau.textContent = message;
        bandeau.hidden = false;
      });
    }
    // Erreurs d'assemblage (transmises par l'aperçu) et de minutage : visibles tout de suite.
    var erreurs = (racine.__PM_ERREURS__ || []).concat(M.erreurs || []);
    if (erreurs.length) {
      bandeau.textContent = erreurs.map(function (e) { return e.message; }).join(' · ');
      bandeau.hidden = false;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

`moteur/base.css` :

```css
/* Pulse Motion – mise en page de base : scène au bon format, lecteur dessous. */
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #111; }
body {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  --pm-barre: 48px;
}
#pm-scene {
  position: relative; overflow: hidden; container-type: size;
  aspect-ratio: var(--pm-ratio-l) / var(--pm-ratio-h);
  width: min(100vw, calc((100vh - var(--pm-barre)) * var(--pm-ratio-l) / var(--pm-ratio-h)));
  background: var(--c-fond, #fff); color: var(--c-texte, #111);
  font-family: var(--f-texte, system-ui, sans-serif);
}
#pm-scene > section[data-scene] { position: absolute; inset: 0; }
.pm-erreur {
  position: absolute; inset: 8cqh; display: grid; place-items: center; text-align: center;
  padding: 4cqh; border: 0.6cqh dashed #c0392b; background: #fdecea; color: #7b1d14;
  font: 600 4cqh/1.3 system-ui, sans-serif;
}
#pm-lecteur {
  display: flex; align-items: center; gap: 12px; height: var(--pm-barre);
  width: min(100vw, calc((100vh - var(--pm-barre)) * var(--pm-ratio-l) / var(--pm-ratio-h)));
  padding: 0 12px; color: #eee; font: 13px/1 system-ui, sans-serif; background: #1b1b1b;
}
#pm-lecteur button { width: 32px; height: 32px; border: 0; border-radius: 50%; background: #eee; color: #111; cursor: pointer; }
.pm-piste { position: relative; flex: 1; }
.pm-piste input { width: 100%; margin: 0; }
.pm-reperes { position: absolute; inset: 0; pointer-events: none; }
.pm-reperes span { position: absolute; top: -4px; width: 2px; height: 6px; background: #888; }
.pm-etiquette { white-space: nowrap; font-variant-numeric: tabular-nums; }
#pm-bandeau {
  position: fixed; top: 0; left: 0; right: 0; padding: 10px 16px;
  background: #c0392b; color: #fff; font: 600 14px/1.4 system-ui, sans-serif; z-index: 10;
}
```

- [ ] **Étape 4 : vérifier le succès**

Lancer : `node --test tests/navigateur.test.js`
Attendu : PASS – la page affiche « RESULTAT: OK 22/22 ».

- [ ] **Étape : commit**

```bash
git add moteur/horloge.js moteur/lecteur.js moteur/base.css tests/aide/navigateur.js tests/navigateur.html tests/navigateur.test.js
git commit -m "feat(moteur): horloge déterministe, lecteur et mise en page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Assembleur de la page autonome

**Files:**
- Create: `scripts/assembler.js`
- Create: `tests/aide/projet.js`, fixtures listées ci-dessous
- Test: `tests/assembler.test.js`

**Interfaces:**
- Consumes : `lireDeroule` (tâche 4) ; `verifierSection`, `injecterTextes`, `extraireScripts`, `injecterLogo`, `panneauErreur`, `echapperHTML` (tâche 5) ; `embarquerRessources`, `versDataURI`, `cheminDansProjet` (tâche 5) ; `variablesCSS` (tâche 1) ; les fichiers `moteur/*.js` et `moteur/base.css` (tâches 1 à 6).
- Produces (`scripts/assembler.js`) :
  - `assembler({ dossier, dossierStyles = <plugin>/styles, ecrire = true })` → `{ ok: boolean, fichier: string | null, html: string | null, erreurs: [{ regle, gravite, scene?, message }] }`. `ok = false` (et aucune page) seulement si le déroulé est invalide (`deroule-invalide`) ou le style introuvable (`style-inconnu`). Autres règles : `scene-invalide` (panneau d'erreur à la place de la scène), `texte-manquant`, `police-non-embarquee`, `fichier-introuvable`, et celles de `embarquerRessources`.
  - `slug(texte): string`
  - Ligne de commande : `node scripts/assembler.js <dossier>` → JSON `{ ok, fichier, erreurs }` sur la sortie standard, code 1 si `ok = false`.
  - Un style = dossier `styles/<nom>/` avec `style.css` (obligatoire), `charte.json` (couleurs et polices par défaut, facultatif), `polices/<Famille>.woff2` (polices variables, poids 100 à 900).
  - Ordre de la charte : défaut du moteur ← `charte.json` du style ← `charte` du déroulé. Variables : `--c-<nom>`, `--f-<role>`.
  - La page est écrite dans un fichier temporaire puis renommée (l'aperçu ne lit jamais une page à moitié écrite).
- `tests/aide/projet.js` : `FIXTURES`, `STYLES`, `copierProjet(nom): string` (copie dans un dossier temporaire), `modifierDeroule(dossier, fn)`.

- [ ] **Étape 1 : créer les fixtures**

Une police factice suffit (le contenu n'est pas décodé par les tests) :

```bash
mkdir -p tests/fixtures/styles/test/polices
node -e "require('fs').writeFileSync('tests/fixtures/styles/test/polices/Testfont.woff2', 'wOF2-police-factice')"
```

`tests/fixtures/styles/test/style.css` :

```css
/* Style de test : minimal. */
h1 { font-family: var(--f-titres); font-size: 8cqh; color: var(--c-primaire); margin: 0; }
p { font-size: 4cqh; }
.fond { background: url(fond.svg) center / cover; }
```

`tests/fixtures/styles/test/fond.svg` :

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#eef"/></svg>
```

`tests/fixtures/styles/test/charte.json` :

```json
{ "couleurs": { "fond": "#fafafa" }, "polices": { "titres": "Testfont", "texte": "system-ui" } }
```

`tests/fixtures/projet-simple/deroule.json` :

```json
{
  "version": 1,
  "titre": "La chaîne du froid",
  "genre": "formation",
  "parcours": "rapide",
  "format": { "ratio": "16:9", "ips": 30 },
  "style": "test",
  "charte": { "couleurs": { "primaire": "#0a6cff" }, "logo": "assets/logo.svg" },
  "scenes": [
    { "id": "intro", "fichier": "scenes/01-intro.html", "duree": 4, "textes": { "titre": "Pourquoi 4 °C ?", "sous": "3 minutes <pour> comprendre" }, "transition": "fondu" },
    { "id": "chiffre", "fichier": "scenes/02-chiffre.html", "duree": 3, "rythme": 0.8, "textes": { "legende": "bactéries en 1 h" }, "transition": "glissement" }
  ]
}
```

`tests/fixtures/projet-simple/scenes/01-intro.html` :

```html
<section data-scene="intro" class="fond">
  <h1 id="titre" data-texte="titre" data-start="0.3">Titre provisoire</h1>
  <p data-texte="sous" data-start="#titre:fin+0.2">…</p>
  <img data-logo alt="Logo" data-start="1">
  <img src="assets/photo.svg" alt="">
</section>
```

`tests/fixtures/projet-simple/scenes/02-chiffre.html` :

```html
<section data-scene="chiffre">
  <style>@scope { .grand { font-size: 20cqh; } }</style>
  <p class="grand" data-tween="nombre 0→1250 cubic-out" data-dur="2">0</p>
  <p data-texte="legende" data-start="0.5"></p>
  <script>M.chaqueImage('chiffre', function (p) { document.body.dataset.vu = '1'; });</script>
</section>
```

`tests/fixtures/projet-simple/assets/logo.svg` :

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="5" fill="#0a6cff"/></svg>
```

`tests/fixtures/projet-simple/assets/photo.svg` :

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#eef"/></svg>
```

`tests/aide/projet.js` :

```js
'use strict';
/* Copie un projet d'exemple de tests/fixtures dans un dossier temporaire. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const STYLES = path.join(FIXTURES, 'styles');

function copierProjet(nom) {
  const cible = fs.mkdtempSync(path.join(os.tmpdir(), `pm-${nom}-`));
  fs.cpSync(path.join(FIXTURES, nom), cible, { recursive: true });
  return cible;
}

function modifierDeroule(dossier, fn) {
  const fichier = path.join(dossier, 'deroule.json');
  const d = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  fn(d);
  fs.writeFileSync(fichier, JSON.stringify(d, null, 2));
}

module.exports = { FIXTURES, STYLES, copierProjet, modifierDeroule };
```

- [ ] **Étape 2 : écrire le test qui échoue**

Les points 1 et 3 du Review Focus sont couverts par « dossier avec espaces et accents, scène enregistrée avec BOM et CRLF ».

`tests/assembler.test.js` :

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { assembler, slug } = require('../scripts/assembler.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { trouverNavigateur, rendreDOM } = require('./aide/navigateur.js');

test('slug : accents et ponctuation', () => {
  assert.equal(slug('La chaîne du froid !'), 'la-chaine-du-froid');
  assert.equal(slug('***'), 'video');
});

test('projet valide : page autonome écrite dans sortie/', () => {
  const dir = copierProjet('projet-simple');
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true);
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.fichier, path.join(dir, 'sortie', 'la-chaine-du-froid.html'));
  const html = fs.readFileSync(r.fichier, 'utf8');
  assert.match(html, /<title>La chaîne du froid<\/title>/);
  assert.match(html, /--pm-ratio-l: 16; --pm-ratio-h: 9;/);
  assert.match(html, /--c-primaire: #0a6cff;/, 'couleur du déroulé');
  assert.match(html, /--c-fond: #fafafa;/, 'couleur du style');
  assert.match(html, /@font-face \{ font-family: 'Testfont'; src: url\("data:font\/woff2;base64,/);
  assert.match(html, /--ease-bounce-out: linear\(/);
  assert.match(html, />Pourquoi 4 °C \?</);
  assert.match(html, />3 minutes &lt;pour&gt; comprendre</);
  assert.match(html, /<img data-logo alt="Logo" data-start="1" src="data:image\/svg\+xml;base64,/);
  assert.match(html, /<img src="data:image\/svg\+xml;base64,/, 'image de la scène');
  assert.match(html, /url\("data:image\/svg\+xml;base64,/, 'image du style');
  assert.doesNotMatch(html, /src="assets\//);
  assert.match(html, /M\.chaqueImage\('chiffre'/);
  assert.match(html, /"rythme":0\.8/);
  assert.match(html, /M\.demarrer\(\);\s*M\.demarrerLecteur\(\);/);
  assert.equal((html.match(/<section /g) || []).length, 2);
});

test('déroulé invalide : pas de page, erreurs du déroulé', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].duree = 0; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, false);
  assert.equal(r.erreurs[0].regle, 'deroule-invalide');
  assert.match(r.erreurs[0].message, /scène « intro » : « duree »/);
  assert.equal(fs.existsSync(path.join(dir, 'sortie')), false);
});

test('style inconnu : message avec les styles disponibles', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.style = 'neon'; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, false);
  assert.match(r.erreurs[0].message, /Style « neon » introuvable\. Styles disponibles : test\./);
});

test('scène en erreur : page produite, panneau d\'erreur à sa place', () => {
  const dir = copierProjet('projet-simple');
  fs.rmSync(path.join(dir, 'scenes', '02-chiffre.html'));
  modifierDeroule(dir, (d) => { d.scenes[0].textes = { titre: 'T' }; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true);
  assert.deepEqual(r.erreurs.map((e) => [e.regle, e.scene]), [['texte-manquant', 'intro'], ['scene-invalide', 'chiffre']]);
  assert.match(r.html, /<section data-scene="chiffre" data-pm-erreur><div class="pm-erreur">Scène « chiffre » : fichier introuvable/);
  assert.match(r.html, /\[texte « sous » manquant\]/);
});

test('police, logo et musique absents : erreurs nommées', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => {
    d.charte.polices = { titres: 'Inconnue', texte: 'assets/absente.woff2' };
    d.charte.logo = 'assets/rien.svg';
    d.musique = { fichier: 'assets/rien.mp3' };
  });
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true);
  assert.deepEqual(r.erreurs.map((e) => e.regle), ['police-non-embarquee', 'police-non-embarquee', 'fichier-introuvable', 'fichier-introuvable']);
  assert.match(r.erreurs[0].message, /Police « Inconnue » non fournie/);
});

test('musique embarquée et volume transmis au moteur', () => {
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'assets', 'musique.mp3'), Buffer.from([0xff, 0xfb, 0x90, 0x00]));
  modifierDeroule(dir, (d) => { d.musique = { fichier: 'assets/musique.mp3', volume: 0.6 }; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.match(r.html, /<audio id="pm-musique" preload="auto" src="data:audio\/mpeg;base64,/);
  assert.match(r.html, /"musique":\{"volume":0\.6\}/);
});

test('un texte contenant </script> ne casse pas les données', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.titre = 'a</script><b>'; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.match(r.html, /"titre":"a\\u003c\/script>\\u003cb>"/);
});

test('ligne de commande : résumé JSON et code de sortie', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.version = 2; });
  let code = 0, sortie = '';
  try { execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'assembler.js'), dir], { encoding: 'utf8' }); } catch (e) {
    code = e.status; sortie = e.stdout;
  }
  assert.equal(code, 1);
  assert.equal(JSON.parse(sortie).ok, false);
});

test('dossier avec espaces et accents, scène enregistrée avec BOM et CRLF', () => {
  const source = copierProjet('projet-simple');
  const dir = path.join(path.dirname(source), `Mes vidéos à moi ${path.basename(source)}`);
  fs.renameSync(source, dir);
  const scene = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(scene, '\uFEFF' + fs.readFileSync(scene, 'utf8').replace(/\n/g, '\r\n'));
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, true);
  assert.deepEqual(r.erreurs, []);
  assert.ok(r.fichier.startsWith(dir));
  assert.doesNotMatch(r.html, /\uFEFF/);
  assert.match(r.html, />Pourquoi 4 °C \?</);
});

const navigateur = trouverNavigateur();
test('la page assemblée démarre dans le navigateur', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierProjet('projet-simple');
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  const dom = await rendreDOM(navigateur, r.fichier);
  assert.match(dom, /<html lang="fr" data-pm-pret="">/);
  assert.match(dom, /<body[^>]*data-vu="1"/, 'script de scène exécuté');
  assert.match(dom, /<div id="pm-bandeau" hidden="">/, 'aucune erreur affichée');
  assert.match(dom, /id="pm-lecteur"/);
});
```

- [ ] **Étape 3 : vérifier l'échec**

Lancer : `node --test tests/assembler.test.js`
Attendu : FAIL – « Cannot find module '../scripts/assembler.js' ».

- [ ] **Étape 4 : écrire l'implémentation**

`scripts/assembler.js` :

```js
#!/usr/bin/env node
'use strict';
/* Pulse Motion – assemble un projet vidéo en une page HTML autonome.
 *
 *   node scripts/assembler.js <dossier-du-projet>
 *
 * Lit deroule.json et scenes/, injecte textes et charte, embarque polices, images,
 * logo et musique, inclut le moteur, écrit sortie/<titre>.html.
 * Affiche un résumé JSON { ok, fichier, erreurs } ; code de sortie 1 si la page n'a pas pu être produite.
 */
const fs = require('node:fs');
const path = require('node:path');
const { lireDeroule } = require('./lib/deroule.js');
const { embarquerRessources, versDataURI, cheminDansProjet } = require('./lib/embarquer.js');
const S = require('./lib/scenes.js');
const { variablesCSS } = require('../moteur/courbes.js');

const RACINE = path.resolve(__dirname, '..');
const MOTEUR = ['courbes.js', 'minutage.js', 'transitions.js', 'tween.js', 'horloge.js', 'lecteur.js'];
const CHARTE_DEFAUT = {
  couleurs: { primaire: '#0a6cff', accent: '#ffb000', fond: '#ffffff', texte: '#1a1a1a' },
  polices: { titres: 'system-ui', texte: 'system-ui' },
};

function slug(texte) {
  return String(texte).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'video';
}

function lireJSON(fichier, defaut) {
  try { return JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch { return defaut; }
}

/** Fusionne la charte par défaut, celle du style et celle du déroulé. */
function chartePour(deroule, dossierStyle) {
  const duStyle = lireJSON(path.join(dossierStyle, 'charte.json'), {});
  const duDeroule = deroule.charte || {};
  return {
    couleurs: { ...CHARTE_DEFAUT.couleurs, ...duStyle.couleurs, ...duDeroule.couleurs },
    polices: { ...CHARTE_DEFAUT.polices, ...duStyle.polices, ...duDeroule.polices },
    logo: duDeroule.logo || null,
  };
}

const POLICES_SYSTEME = new Set(['system-ui', 'sans-serif', 'serif', 'monospace']);

/** Variables CSS de la charte et @font-face embarqués. -> { css, erreurs } */
function cssCharte(charte, dossierProjet, dossierStyle) {
  const erreurs = [];
  const lignes = [];
  for (const [nom, valeur] of Object.entries(charte.couleurs)) lignes.push(`  --c-${nom}: ${valeur};`);
  const faces = [];
  const dejaVues = new Set();
  for (const [role, valeur] of Object.entries(charte.polices)) {
    let famille = valeur;
    if (/\.(woff2?|ttf|otf)$/i.test(valeur)) {
      famille = path.basename(valeur).replace(/\.[^.]+$/, '');
      const absolu = cheminDansProjet(dossierProjet, valeur);
      if (absolu && fs.existsSync(absolu) && !dejaVues.has(famille)) {
        faces.push(`@font-face { font-family: '${famille}'; src: url("${versDataURI(absolu)}"); font-weight: 100 900; font-display: block; }`);
        dejaVues.add(famille);
      } else if (!absolu || !fs.existsSync(absolu)) {
        erreurs.push({ regle: 'police-non-embarquee', gravite: 'erreur', message: `Police « ${valeur} » introuvable dans le projet (charte.polices.${role}).` });
      }
    } else if (!POLICES_SYSTEME.has(famille) && !dejaVues.has(famille)) {
      const fichier = path.join(dossierStyle, 'polices', `${famille}.woff2`);
      if (fs.existsSync(fichier)) {
        faces.push(`@font-face { font-family: '${famille}'; src: url("${versDataURI(fichier)}"); font-weight: 100 900; font-display: block; }`);
        dejaVues.add(famille);
      } else {
        erreurs.push({ regle: 'police-non-embarquee', gravite: 'erreur', message: `Police « ${famille} » non fournie : ajoutez son fichier dans assets/ et indiquez-le dans charte.polices.${role}.` });
      }
    }
    lignes.push(`  --f-${role}: '${famille}', system-ui, sans-serif;`);
  }
  return { css: `${faces.join('\n')}\n:root {\n${lignes.join('\n')}\n}\n`, erreurs };
}

function lireMoteur(racine) {
  return MOTEUR.map((f) => fs.readFileSync(path.join(racine, 'moteur', f), 'utf8')).join('\n;\n');
}

function jsonDansHTML(objet) {
  return JSON.stringify(objet).replace(/</g, '\\u003c');
}

/**
 * assembler({ dossier, dossierStyles?, ecrire? })
 * -> { ok, fichier, html, erreurs: [{ regle, gravite, scene?, message }] }
 */
function assembler({ dossier, dossierStyles = path.join(RACINE, 'styles'), ecrire = true }) {
  const projet = path.resolve(dossier);
  const { deroule, erreurs: erreursDeroule } = lireDeroule(projet);
  if (erreursDeroule.length) {
    return { ok: false, fichier: null, html: null, erreurs: erreursDeroule.map((message) => ({ regle: 'deroule-invalide', gravite: 'erreur', message })) };
  }
  const dossierStyle = path.join(dossierStyles, deroule.style);
  if (!fs.existsSync(path.join(dossierStyle, 'style.css'))) {
    const dispo = fs.existsSync(dossierStyles) ? fs.readdirSync(dossierStyles).join(', ') : 'aucun';
    return { ok: false, fichier: null, html: null, erreurs: [{ regle: 'style-inconnu', gravite: 'erreur', message: `Style « ${deroule.style} » introuvable. Styles disponibles : ${dispo}.` }] };
  }

  const erreurs = [];
  const charte = chartePour(deroule, dossierStyle);
  const { css: cssDeCharte, erreurs: erreursPolices } = cssCharte(charte, projet, dossierStyle);
  erreurs.push(...erreursPolices);

  let uriLogo = null;
  if (charte.logo) {
    const absolu = cheminDansProjet(projet, charte.logo);
    if (absolu && fs.existsSync(absolu)) uriLogo = versDataURI(absolu);
    else erreurs.push({ regle: 'fichier-introuvable', gravite: 'erreur', message: `Logo introuvable : « ${charte.logo} ».` });
  }

  const sections = [];
  const scriptsScenes = [];
  for (const scene of deroule.scenes) {
    const fichier = cheminDansProjet(projet, scene.fichier);
    let html = null;
    let probleme = null;
    if (!fichier) probleme = `le fichier « ${scene.fichier} » sort du dossier du projet.`;
    else if (!fs.existsSync(fichier)) probleme = `fichier introuvable : « ${scene.fichier} ».`;
    else {
      html = fs.readFileSync(fichier, 'utf8').replace(/^\uFEFF/, '');
      probleme = S.verifierSection(html, scene.id);
    }
    if (probleme) {
      erreurs.push({ regle: 'scene-invalide', gravite: 'erreur', scene: scene.id, message: `Scène « ${scene.id} » : ${probleme}` });
      sections.push(S.panneauErreur(scene.id, probleme));
      continue;
    }
    const { html: sansScripts, scripts } = S.extraireScripts(html);
    const { html: avecTextes, manquants } = S.injecterTextes(sansScripts, scene.textes);
    manquants.forEach((cle) => erreurs.push({ regle: 'texte-manquant', gravite: 'erreur', scene: scene.id, message: `Scène « ${scene.id} » : data-texte="${cle}" n'a pas de texte dans le déroulé.` }));
    const { html: embarque, erreurs: erreursRes } = embarquerRessources(S.injecterLogo(avecTextes, uriLogo), projet, `scène « ${scene.id} »`);
    erreursRes.forEach((e) => erreurs.push({ ...e, scene: scene.id }));
    sections.push(embarque.trim());
    scripts.forEach((code) => scriptsScenes.push(`(function () { try {\n${code}\n} catch (e) { console.error('[Pulse Motion] Scène « ${scene.id} » : ' + e.message); } })();`));
  }

  const { html: cssStyle, erreurs: erreursStyle } = embarquerRessources(fs.readFileSync(path.join(dossierStyle, 'style.css'), 'utf8'), dossierStyle, `style « ${deroule.style} »`);
  erreurs.push(...erreursStyle);

  let audio = '';
  if (deroule.musique) {
    const absolu = cheminDansProjet(projet, deroule.musique.fichier);
    if (absolu && fs.existsSync(absolu)) audio = `<audio id="pm-musique" preload="auto" src="${versDataURI(absolu)}"></audio>`;
    else erreurs.push({ regle: 'fichier-introuvable', gravite: 'erreur', message: `Musique introuvable : « ${deroule.musique.fichier} ».` });
  }

  const [l, h] = deroule.format.ratio.split(':');
  const donnees = {
    titre: deroule.titre,
    format: { ratio: deroule.format.ratio, ips: deroule.format.ips || 30 },
    musique: deroule.musique ? { volume: deroule.musique.volume ?? 1 } : null,
    scenes: deroule.scenes.map((s) => ({ id: s.id, duree: s.duree, rythme: s.rythme || 1, transition: s.transition || 'aucune' })),
  };

  const page = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Pulse Motion">
<title>${S.echapperHTML(deroule.titre)}</title>
<style>
:root { --pm-ratio-l: ${l}; --pm-ratio-h: ${h}; }
${fs.readFileSync(path.join(RACINE, 'moteur', 'base.css'), 'utf8')}
${variablesCSS()}
${cssDeCharte}
${cssStyle}
</style>
</head>
<body>
<div id="pm-scene">
${sections.join('\n')}
</div>
${audio}
<script type="application/json" id="pm-donnees">${jsonDansHTML(donnees)}</script>
<script>
${lireMoteur(RACINE)}
</script>
<script>
${scriptsScenes.join('\n')}
M.demarrer();
M.demarrerLecteur();
</script>
</body>
</html>
`;

  let sortie = null;
  if (ecrire) {
    const dossierSortie = path.join(projet, 'sortie');
    fs.mkdirSync(dossierSortie, { recursive: true });
    sortie = path.join(dossierSortie, `${slug(deroule.titre)}.html`);
    const temporaire = `${sortie}.${process.pid}.tmp`;
    fs.writeFileSync(temporaire, page);
    fs.renameSync(temporaire, sortie);
  }
  return { ok: true, fichier: sortie, html: page, erreurs };
}

if (require.main === module) {
  const dossier = process.argv[2];
  if (!dossier) {
    console.error('Usage : node scripts/assembler.js <dossier-du-projet>');
    process.exit(2);
  }
  const { ok, fichier, erreurs } = assembler({ dossier });
  console.log(JSON.stringify({ ok, fichier, erreurs }, null, 2));
  process.exit(ok ? 0 : 1);
}

module.exports = { assembler, slug };
```

- [ ] **Étape 5 : vérifier le succès**

Lancer : `node --test tests/assembler.test.js`
Attendu : PASS – 11 tests (dont « la page assemblée démarre dans le navigateur »).

- [ ] **Étape : commit**

```bash
git add scripts/assembler.js tests/aide/projet.js tests/assembler.test.js tests/fixtures
git commit -m "feat(scripts): assemblage de la page autonome

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Serveur d'aperçu avec rechargement

**Files:**
- Create: `scripts/apercu.js`
- Test: `tests/apercu.test.js`

**Interfaces:**
- Consumes : `assembler()` (tâche 7) ; `M.demarrerLecteur` côté page lit `window.__PM_APERCU__` et `window.__PM_ERREURS__` (tâche 6).
- Produces (`scripts/apercu.js`) :
  - `demarrerApercu({ dossier, port = 4321, dossierStyles?, delai = 150 })` → `Promise<{ port, url, fermer(): Promise }>`. Écoute `127.0.0.1` ; essaie 20 ports à partir de `port` ; écrit `.pulse-motion/etat.json` → `{ apercu: { port, url, pid } }` (en conservant les autres clés).
  - Routes : `GET /` (page + `window.__PM_APERCU__ = true; window.__PM_ERREURS__ = [...]`, ou page d'erreur lisible si le projet n'a jamais pu être assemblé) ; `GET /_pm/evenements` (SSE : `recharger` → `{ erreurs: n }`, `erreur` → `{ message }`, battement toutes les 15 s) ; sinon 404.
  - Surveillance récursive du projet, sauf `sortie/`, `.pulse-motion/`, `.historique/`, `.git/` ; regroupement des modifications (`delai` ms). Si le nouvel assemblage échoue, la dernière page valide reste servie.
  - `injecterApercu(html, erreurs): string`
  - Ligne de commande : `node scripts/apercu.js <dossier> [--port 4321] [--ouvrir]` → affiche `Aperçu : http://127.0.0.1:<port>/` ; `--ouvrir` lance le navigateur par défaut (`cmd /c start`, `open`, `xdg-open`).

- [ ] **Étape 1 : écrire le test qui échoue**

Le point 4 du Review Focus est couvert par « une modification recharge la page ; un déroulé cassé envoie une erreur » (retour à la normale après correction).

`tests/apercu.test.js` :

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { demarrerApercu, injecterApercu } = require('../scripts/apercu.js');
const { assembler } = require('../scripts/assembler.js');
const { FIXTURES, STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { trouverNavigateur, rendreDOM } = require('./aide/navigateur.js');

function obtenir(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let corps = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { corps += d; });
      res.on('end', () => resolve({ statut: res.statusCode, corps }));
    }).on('error', reject);
  });
}

/** Ouvre le flux d'événements ; attendre(nom) résout au prochain événement de ce nom. */
function ecouterEvenements(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let tampon = '';
      const attentes = [];
      res.setEncoding('utf8');
      res.on('data', (d) => {
        tampon += d;
        let i;
        while ((i = tampon.indexOf('\n\n')) >= 0) {
          const bloc = tampon.slice(0, i);
          tampon = tampon.slice(i + 2);
          const nom = /^event: (.*)$/m.exec(bloc);
          const donnees = /^data: (.*)$/m.exec(bloc);
          if (!nom) continue;
          const k = attentes.findIndex((a) => a.nom === nom[1]);
          if (k >= 0) attentes.splice(k, 1)[0].resolve(JSON.parse(donnees[1]));
        }
      });
      resolve({
        attendre: (nom, ms = 5000) => new Promise((ok, ko) => {
          const minuterie = setTimeout(() => ko(new Error(`événement « ${nom} » non reçu`)), ms);
          attentes.push({ nom, resolve: (v) => { clearTimeout(minuterie); ok(v); } });
        }),
        fermer: () => req.destroy(),
      });
    });
    req.on('error', reject);
  });
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

test('sert la page avec le marqueur d\'aperçu et écrit etat.json', async () => {
  const dir = copierProjet('projet-simple');
  const apercu = await demarrerApercu({ dossier: dir, port: 47210, dossierStyles: STYLES });
  try {
    const { statut, corps } = await obtenir(apercu.url);
    assert.equal(statut, 200);
    assert.match(corps, /window\.__PM_APERCU__ = true; window\.__PM_ERREURS__ = \[\];/);
    assert.match(corps, /<title>La chaîne du froid<\/title>/);
    assert.equal((await obtenir(apercu.url + 'rien')).statut, 404);
    const etat = JSON.parse(fs.readFileSync(path.join(dir, '.pulse-motion', 'etat.json'), 'utf8'));
    assert.deepEqual(etat.apercu, { port: apercu.port, url: apercu.url, pid: process.pid });
  } finally { await apercu.fermer(); }
});

test('port déjà pris : le suivant est utilisé', async () => {
  const occupant = net.createServer();
  await new Promise((r) => occupant.listen(47220, '127.0.0.1', r));
  const dir = copierProjet('projet-simple');
  const apercu = await demarrerApercu({ dossier: dir, port: 47220, dossierStyles: STYLES });
  try {
    assert.equal(apercu.port, 47221);
    assert.equal(apercu.url, 'http://127.0.0.1:47221/');
  } finally {
    await apercu.fermer();
    await new Promise((r) => occupant.close(r));
  }
});

test('une modification recharge la page ; un déroulé cassé envoie une erreur', async () => {
  const dir = copierProjet('projet-simple');
  const apercu = await demarrerApercu({ dossier: dir, port: 47230, dossierStyles: STYLES, delai: 50 });
  const flux = await ecouterEvenements(apercu.url + '_pm/evenements');
  try {
    await attendre(200);
    const recharge = flux.attendre('recharger');
    modifierDeroule(dir, (d) => { d.titre = 'Nouveau titre'; });
    await recharge;
    assert.match((await obtenir(apercu.url)).corps, /<title>Nouveau titre<\/title>/);

    const erreur = flux.attendre('erreur');
    fs.writeFileSync(path.join(dir, 'deroule.json'), '{ cassé');
    assert.match((await erreur).message, /n'est pas un JSON valide/);
    assert.match((await obtenir(apercu.url)).corps, /<title>Nouveau titre<\/title>/, 'la dernière page valide reste servie');
  } finally {
    flux.fermer();
    await apercu.fermer();
  }
});

test('les écritures dans sortie/ ne déclenchent pas de rechargement', async () => {
  const dir = copierProjet('projet-simple');
  const apercu = await demarrerApercu({ dossier: dir, port: 47240, dossierStyles: STYLES, delai: 50 });
  const flux = await ecouterEvenements(apercu.url + '_pm/evenements');
  try {
    await attendre(200);
    const recharge = flux.attendre('recharger', 600);
    fs.writeFileSync(path.join(dir, 'sortie', 'autre.txt'), 'x');
    await assert.rejects(recharge, /non reçu/);
  } finally {
    flux.fermer();
    await apercu.fermer();
  }
});

test('projet invalide dès le départ : page d\'erreur lisible', async () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.genre = 'tuto'; });
  const apercu = await demarrerApercu({ dossier: dir, port: 47250, dossierStyles: STYLES });
  try {
    const { corps } = await obtenir(apercu.url);
    assert.match(corps, /La vidéo n'a pas pu être assemblée/);
    assert.match(corps, /« genre » doit être l'un de/);
  } finally { await apercu.fermer(); }
});

const navigateur = trouverNavigateur();
test("dans le navigateur, la page d'aperçu affiche les erreurs d'assemblage", { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  // Sous file://, le flux d'événements échoue tout de suite : Chrome peut rendre la page.
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes[0].textes = { titre: 'T' }; });
  const r = assembler({ dossier: dir, dossierStyles: STYLES });
  const fichier = path.join(dir, 'sortie', 'apercu.html');
  fs.writeFileSync(fichier, injecterApercu(r.html, r.erreurs));
  const dom = await rendreDOM(navigateur, fichier);
  assert.match(dom, /<div id="pm-bandeau">[^<]*data-texte="sous" n'a pas de texte/);
});
```

- [ ] **Étape 2 : vérifier l'échec**

Lancer : `node --test tests/apercu.test.js`
Attendu : FAIL – « Cannot find module '../scripts/apercu.js' ».

- [ ] **Étape 3 : écrire l'implémentation**

`scripts/apercu.js` :

```js
#!/usr/bin/env node
'use strict';
/* Pulse Motion – aperçu : serveur local qui sert la page et la recharge à chaque modification.
 *
 *   node scripts/apercu.js <dossier-du-projet> [--port 4321] [--ouvrir]
 *
 * Écoute seulement 127.0.0.1. Surveille deroule.json, scenes/ et assets/ ; à chaque
 * changement, réassemble et prévient la page (événement « recharger » ou « erreur »).
 * Le port retenu est écrit dans .pulse-motion/etat.json.
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { assembler } = require('./assembler.js');

const IGNORES = /^(sortie|\.pulse-motion|\.historique|\.git)([\\/]|$)/;
const ESSAIS_PORT = 20;

function echapper(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pageErreur(erreurs) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Pulse Motion – erreur</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:3rem auto;padding:0 1rem;color:#7b1d14}</style>
<script>new EventSource('/_pm/evenements').addEventListener('recharger', function () { location.reload(); });</script>
</head><body><h1>La vidéo n'a pas pu être assemblée</h1><ul>${erreurs.map((e) => `<li>${echapper(e.message)}</li>`).join('')}</ul>
<p>La page se rechargera seule dès que le problème sera corrigé.</p></body></html>`;
}

function injecterApercu(html, erreurs) {
  const script = `<script>window.__PM_APERCU__ = true; window.__PM_ERREURS__ = ${JSON.stringify(erreurs).replace(/</g, '\\u003c')};</script>`;
  return html.replace('</head>', `${script}\n</head>`);
}

function ecrireEtat(dossier, apercu) {
  const dossierEtat = path.join(dossier, '.pulse-motion');
  const fichier = path.join(dossierEtat, 'etat.json');
  fs.mkdirSync(dossierEtat, { recursive: true });
  let etat = {};
  try { etat = JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch { /* premier lancement */ }
  etat.apercu = apercu;
  fs.writeFileSync(fichier, JSON.stringify(etat, null, 2));
}

function ecouter(serveur, hote, port) {
  return new Promise((resolve, reject) => {
    const surErreur = (e) => { serveur.off('listening', surEcoute); reject(e); };
    const surEcoute = () => { serveur.off('error', surErreur); resolve(serveur.address().port); };
    serveur.once('error', surErreur);
    serveur.once('listening', surEcoute);
    serveur.listen(port, hote);
  });
}

/**
 * demarrerApercu({ dossier, port?, dossierStyles?, delai? })
 * -> Promise<{ port, url, fermer(): Promise }>
 */
async function demarrerApercu({ dossier, port = 4321, dossierStyles, delai = 150 }) {
  const projet = path.resolve(dossier);
  const optionsAssemblage = dossierStyles ? { dossier: projet, dossierStyles } : { dossier: projet };
  let dernier = assembler(optionsAssemblage);
  const clients = new Set();

  function diffuser(evenement, donnees) {
    const message = `event: ${evenement}\ndata: ${JSON.stringify(donnees)}\n\n`;
    clients.forEach((res) => res.write(message));
  }

  const serveur = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/') {
      const corps = dernier.ok ? injecterApercu(dernier.html, dernier.erreurs) : pageErreur(dernier.erreurs);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(corps);
    } else if (req.method === 'GET' && url.pathname === '/_pm/evenements') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(': connecté\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Introuvable');
    }
  });
  const battement = setInterval(() => clients.forEach((res) => res.write(': battement\n\n')), 15000);

  let portRetenu = null;
  for (let p = port, essai = 0; essai < ESSAIS_PORT; essai++, p++) {
    try { portRetenu = await ecouter(serveur, '127.0.0.1', p); break; } catch (e) {
      if (e.code !== 'EADDRINUSE') throw e;
    }
  }
  if (portRetenu === null) {
    clearInterval(battement);
    throw new Error(`Aucun port libre entre ${port} et ${port + ESSAIS_PORT - 1}.`);
  }
  const adresse = `http://127.0.0.1:${portRetenu}/`;
  ecrireEtat(projet, { port: portRetenu, url: adresse, pid: process.pid });

  let minuterie = null;
  const surveillant = fs.watch(projet, { recursive: true }, (type, nom) => {
    if (nom && IGNORES.test(String(nom))) return;
    clearTimeout(minuterie);
    minuterie = setTimeout(() => {
      const resultat = assembler(optionsAssemblage);
      if (resultat.ok) {
        dernier = resultat;
        diffuser('recharger', { erreurs: resultat.erreurs.length });
      } else {
        if (!dernier.ok) dernier = resultat;
        diffuser('erreur', { message: resultat.erreurs.map((e) => e.message).join(' · ') });
      }
    }, delai);
  });

  function fermer() {
    clearTimeout(minuterie);
    clearInterval(battement);
    surveillant.close();
    clients.forEach((res) => res.end());
    return new Promise((resolve) => serveur.close(() => resolve()));
  }

  return { port: portRetenu, url: adresse, fermer };
}

function ouvrirNavigateur(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dossier = args.find((a) => !a.startsWith('--'));
  const iPort = args.indexOf('--port');
  const port = iPort >= 0 ? parseInt(args[iPort + 1], 10) : 4321;
  if (!dossier || !Number.isInteger(port)) {
    console.error('Usage : node scripts/apercu.js <dossier-du-projet> [--port 4321] [--ouvrir]');
    process.exit(2);
  }
  demarrerApercu({ dossier, port }).then(({ url }) => {
    console.log(`Aperçu : ${url}`);
    if (args.includes('--ouvrir')) ouvrirNavigateur(url);
  }, (e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { demarrerApercu, injecterApercu };
```

- [ ] **Étape 4 : vérifier le succès**

Lancer : `node --test tests/apercu.test.js`
Attendu : PASS – 6 tests.

- [ ] **Étape 5 : lancer toute la suite**

Lancer : `npm test`
Attendu : PASS – 59 tests, 0 échec (3 tests navigateur ignorés si Chrome et Edge sont absents).

- [ ] **Étape : commit**

```bash
git add scripts/apercu.js tests/apercu.test.js
git commit -m "feat(scripts): aperçu local avec rechargement à la même position

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Vérification de bout en bout dans un vrai navigateur

**Files:**
- Modify: `aidd_docs/memory/project.md` (ajout d'une ligne de décision)

**Interfaces:**
- Consumes : tout ce qui précède. Ne produit pas de code.

- [ ] **Étape 1 : lancer l'aperçu sur une copie du projet d'exemple**

Le style « test » n'existe que dans les fixtures (le vrai style arrive au plan 2) : l'aperçu est lancé depuis Node avec `dossierStyles`. La commande reste au premier plan ; Ctrl+C l'arrête.

```bash
node -e "const {demarrerApercu}=require('./scripts/apercu.js');const p=require('./tests/aide/projet.js');const d=p.copierProjet('projet-simple');demarrerApercu({dossier:d,dossierStyles:p.STYLES}).then(a=>console.log(a.url, d))"
```

Attendu : une URL `http://127.0.0.1:4321/` et le dossier du projet.

- [ ] **Étape 2 : vérifier à la main dans Chrome ou Edge**

Ouvrir l'URL et cocher :
- l'image est au format 16:9, la barre de lecture est dessous, avec 2 repères de scène ;
- Espace lance la lecture : le titre « Pourquoi 4 °C ? » apparaît, la scène 2 entre en glissement vers 3,5 s, le compteur monte jusqu'à « 1 250 » ;
- ←/→ avancent d'une image, Maj+→ saute à la scène 2, B affiche « (boucle) » ;
- aucune bannière rouge.

- [ ] **Étape 3 : vérifier le rechargement à la même position**

Mettre la lecture en pause vers 5 s, puis modifier `textes.legende` dans `deroule.json` du dossier copié et enregistrer. Attendu : la page se recharge en moins d'une seconde, la position reste à environ 5 s, la nouvelle légende est visible.

Remplacer ensuite le contenu de `deroule.json` par `{` : la bannière rouge « deroule.json n'est pas un JSON valide… » apparaît. Remettre le contenu : la page se recharge.

- [ ] **Étape 4 : vérifier la page autonome hors ligne**

Couper le serveur (Ctrl+C), ouvrir `sortie/la-chaine-du-froid.html` par double-clic. Attendu : la vidéo se lit, sans serveur ni connexion.

- [ ] **Étape 5 : noter la décision dans la mémoire du projet**

Dans `aidd_docs/memory/project.md`, section « Décisions importantes », ajouter :

```markdown
- 2026-10-11 : socle découpé en 3 plans (moteur et aperçu / style, contrôles, guidage / export) → `docs/superpowers/plans/`.
```

- [ ] **Étape : commit**

```bash
git add aidd_docs/memory/project.md
git commit -m "docs: plan 1 du socle vérifié de bout en bout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
