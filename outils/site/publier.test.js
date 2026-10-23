"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { fichiersAPublier, mediasReferences, mediasManquants } = require("./publier.js");

function depotEssai() {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "pm-publier-"));
  const ecrire = (rel, contenu) => {
    fs.mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
    fs.writeFileSync(path.join(racine, rel), contenu);
  };
  const git = (...args) => execFileSync("git", args, { cwd: racine, stdio: "ignore" });
  git("init", "-q");
  ecrire(".gitignore", "/docs/medias/\n");
  ecrire("docs/index.html", "<p>accueil</p>");
  ecrire("docs/a.html", "<p>a</p>");
  ecrire("docs/superpowers/x.md", "plan");
  ecrire("docs/tutoriels/t.html", '<video poster="../medias/absent.jpg"><source src="../medias/v.mp4"></video><a href="https://exemple.fr/medias/x.mp4">x</a>');
  git("add", "-f", ".gitignore", "docs/index.html", "docs/a.html", "docs/superpowers/x.md", "docs/tutoriels/t.html");
  ecrire("docs/brouillon.html", "<p>brouillon</p>");
  ecrire("docs/medias/v.mp4", "vidéo");
  return racine;
}

test("fichiersAPublier : fichiers suivis et médias, sans brouillon ni superpowers", () => {
  const racine = depotEssai();
  const f = fichiersAPublier(racine);
  for (const attendu of ["index.html", "a.html", "medias/v.mp4", "tutoriels/t.html"]) assert.ok(f.includes(attendu), attendu);
  assert.ok(!f.includes("brouillon.html"));
  assert.ok(!f.some((x) => x.startsWith("superpowers/")));
});

test("mediasReferences et mediasManquants : chemins relatifs résolus, liens externes ignorés", () => {
  const racine = depotEssai();
  assert.deepEqual(mediasReferences(racine), ["medias/absent.jpg", "medias/v.mp4"]);
  assert.deepEqual(mediasManquants(racine), ["medias/absent.jpg"]);
});
