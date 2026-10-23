"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { copieSansVoix, MEDIAS } = require("./medias.js");

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
