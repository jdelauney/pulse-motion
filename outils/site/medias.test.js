"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { dossierTemporaire } = require("../../plugins/pulse-motion/tests/aide/temporaire.js");
const { copieSansVoix, MEDIAS, sortiesDe } = require("./medias.js");

const EXEMPLE = path.join(__dirname, "..", "..", "plugins", "pulse-motion", "exemples", "chaine-du-froid");

test("copieSansVoix : ni voix, ni sous-titres, ni logo ; l'exemple d'origine intact", () => {
  const origine = fs.readFileSync(path.join(EXEMPLE, "deroule.json"));
  const copie = copieSansVoix(EXEMPLE);
  try {
    const d = JSON.parse(fs.readFileSync(path.join(copie, "deroule.json"), "utf8"));
    assert.equal(d.scenes.length, 6);
    assert.ok(d.scenes.every((s) => !("voix" in s)));
    assert.ok(!("sousTitres" in d));
    assert.ok(!(d.charte && "logo" in d.charte));
    assert.equal(fs.readdirSync(path.join(copie, "scenes")).length, 6);
    assert.ok(fs.readFileSync(path.join(EXEMPLE, "deroule.json")).equals(origine));
  } finally {
    fs.rmSync(copie, { recursive: true, force: true });
  }
});

test("MEDIAS : identifiants uniques, sorties relatives à docs/", () => {
  const ids = MEDIAS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const m of MEDIAS) assert.match(m.sortie, /^(medias|assets\/captures)\//);
});

test("galerie : une sortie par entrée de chaque source (mouvements, styles, effets, personnages)", () => {
  const { MEDIAS, sortiesDe } = require("./medias.js");
  const G = require("./galerie-medias.js");
  const lot = (id) => sortiesDe(MEDIAS.find((m) => m.id === id));
  assert.equal(lot("galerie-mouvements").length, G.dictionnaire().mouvements.length * 2);
  assert.equal(lot("galerie-styles").length, G.STYLES_LIVRES().reduce((n, s) => n + 1 + G.scenesDuStyle(s).length, 0));
  assert.equal(lot("galerie-effets").length, G.effets().length * 2);
  assert.equal(lot("galerie-personnages").length, G.clipsPersonnages().length * 2);
  assert.ok(!G.clipsPersonnages().includes("respiration"), "les calques additifs ne sont pas des mouvements");
  assert.deepEqual(sortiesDe({ sortie: "medias/a.mp4", aussi: ["assets/b.jpg"] }), ["medias/a.mp4", "assets/b.jpg"]);
});

test("galerie : chaque démo d'effet et de mouvement s'assemble", () => {
  const G = require("./galerie-medias.js");
  const { projetDeDemos, projetDeMouvements } = require("../../plugins/pulse-motion/scripts/lib/choisir-mouvements.js");
  const { assembler } = require("../../plugins/pulse-motion/scripts/assembler.js");
  const d1 = dossierTemporaire("pm-galerie-");
  projetDeDemos(d1, G.effets().map(G.demoEffet));
  assert.deepEqual(assembler({ dossier: d1 }).erreurs, []);
  const d2 = dossierTemporaire("pm-galerie-");
  const { plages } = projetDeMouvements(d2, G.dictionnaire().mouvements);
  assert.deepEqual(assembler({ dossier: d2 }).erreurs, []);
  assert.equal(plages.length, G.dictionnaire().mouvements.length);
  for (let i = 1; i < plages.length; i++) assert.ok(Math.abs(plages[i].debut - plages[i - 1].fin) < 1e-6, "plages contiguës");
});

test("exemples : une vidéo et une affiche par modèle (la chaîne du froid réutilise la sienne)", () => {
  const G = require("./galerie-medias.js");
  const lot = MEDIAS.find((m) => m.id === "exemples");
  assert.ok(lot, "lot exemples");
  const sorties = sortiesDe(lot);
  assert.equal(sorties.length, G.exemplesAFabriquer().length * 2);
  assert.equal(G.exemplesAFabriquer().length, 6);
  for (const m of G.modelesVideo()) {
    const [mp4, jpg] = G.fichiersExemple(m);
    assert.match(mp4, /\.mp4$/);
    assert.match(jpg, /\.jpg$/);
    if (m.id !== "formation-courte") assert.ok(sorties.includes(mp4) && sorties.includes(jpg), m.id);
  }
  assert.deepEqual(G.fichiersExemple(G.modelesVideo().find((m) => m.id === "formation-courte")), ["medias/chaine-du-froid.mp4", "assets/captures/chaine-du-froid-affiche.jpg"]);
});
