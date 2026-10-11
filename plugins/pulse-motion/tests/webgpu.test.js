'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { optionsWebGPU, executerPage, pageMoteur } = require('./aide/gpu.js');

test('banc WebGPU : une page sans fenêtre obtient un device et renvoie son résultat', async (t) => {
  const options = await optionsWebGPU();
  if (!options) return t.skip('WebGPU indisponible sans fenêtre (Chrome ou Edge absent, ou PM_OPTIONS_WEBGPU à régler)');
  const html = pageMoteur({
    fichiers: [],
    donnees: { x: 21 },
    code: `const a = await navigator.gpu.requestAdapter(); const d = await a.requestDevice(); envoyer({ double: DONNEES.x * 2, device: !!d });`,
  });
  const r = JSON.parse(await executerPage(html));
  assert.deepEqual(r, { double: 42, device: true });
});
