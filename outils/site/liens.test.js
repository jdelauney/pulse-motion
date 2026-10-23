"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { liensDuWiki } = require("./liens.js");

test("liensDuWiki : page et ancre absentes cassées ; média déclaré absent accepté", () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "pm-liens-"));
  fs.mkdirSync(path.join(racine, "docs"));
  fs.writeFileSync(path.join(racine, "docs", "b.html"), '<section id="la"></section>');
  fs.writeFileSync(path.join(racine, "docs", "a.html"), [
    '<a href="absente.html">x</a>',
    '<a href="b.html#ici">x</a>',
    '<a href="b.html#la">x</a>',
    '<a href="#local">x</a>',
    '<a href="https://exemple.fr/z.html">x</a>',
    '<video><source src="medias/chaine-du-froid.mp4"></video>',
    '<video><source src="medias/inconnue.mp4"></video>',
  ].join("\n"));
  const { casses } = liensDuWiki(racine, new Set(["medias/chaine-du-froid.mp4"]));
  assert.deepEqual(casses.map((c) => c.cible).sort(), ["absente.html", "b.html#ici", "medias/inconnue.mp4"]);
});

test("liensDuWiki : un data-id ne vaut pas un id", () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "pm-liens-"));
  fs.mkdirSync(path.join(racine, "docs"));
  fs.writeFileSync(path.join(racine, "docs", "b.html"), '<div data-id="ici"></div>');
  fs.writeFileSync(path.join(racine, "docs", "a.html"), '<a href="b.html#ici">x</a>');
  assert.deepEqual(liensDuWiki(racine, new Set()).casses.map((c) => c.cible), ["b.html#ici"]);
});
