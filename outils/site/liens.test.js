"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { dossierTemporaire } = require("../../plugins/pulse-motion/tests/aide/temporaire.js");
const { liensDuWiki } = require("./liens.js");

test("liensDuWiki : page et ancre absentes cassées ; média déclaré absent accepté", () => {
  const racine = dossierTemporaire("pm-liens-");
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
  const racine = dossierTemporaire("pm-liens-");
  fs.mkdirSync(path.join(racine, "docs"));
  fs.writeFileSync(path.join(racine, "docs", "b.html"), '<div data-id="ici"></div>');
  fs.writeFileSync(path.join(racine, "docs", "a.html"), '<a href="b.html#ici">x</a>');
  assert.deepEqual(liensDuWiki(racine, new Set()).casses.map((c) => c.cible), ["b.html#ici"]);
});

test("liensDuWiki : un aperçu déclaré par un lot de la galerie est accepté", () => {
  const { MEDIAS, sortiesDe } = require("./medias.js");
  const declares = new Set(MEDIAS.flatMap(sortiesDe));
  assert.ok(declares.has("medias/galerie/mouvements/001.mp4"));
  const racine = dossierTemporaire("pm-liens-");
  fs.mkdirSync(path.join(racine, "docs"));
  fs.writeFileSync(path.join(racine, "docs", "a.html"), '<video src="medias/galerie/mouvements/001.mp4" poster="medias/galerie/mouvements/001.jpg"></video>');
  assert.deepEqual(liensDuWiki(racine, declares).casses, []);
});

test("liensDuWiki : un lien hreflang (adresse complète du site) vers une page absente est cassé", () => {
  const { SITE } = require("./langues.js");
  const racine = dossierTemporaire("pm-liens-");
  fs.mkdirSync(path.join(racine, "docs", "en"), { recursive: true });
  fs.writeFileSync(path.join(racine, "docs", "a.html"), [
    `<link rel="alternate" hreflang="fr" href="${SITE}a.html">`,
    `<link rel="alternate" hreflang="en" href="${SITE}en/a.html">`,
    `<link rel="alternate" hreflang="en" href="${SITE}en/absente.html">`,
    '<link rel="alternate" hreflang="de" href="https://exemple.fr/a.html">',
  ].join("\n"), "utf8");
  fs.writeFileSync(path.join(racine, "docs", "en", "a.html"), '<a href="../a.html" hreflang="fr">fr</a>', "utf8");
  assert.deepEqual(liensDuWiki(racine, new Set()).casses.map((c) => c.cible), [`${SITE}en/absente.html`]);
});

test("liensDuWiki : les pages anglaises du dépôt n'ont aucun lien cassé", () => {
  const { casses } = liensDuWiki(path.join(__dirname, "..", ".."));
  assert.deepEqual(casses.filter((c) => c.page.startsWith("en/")), []);
});
