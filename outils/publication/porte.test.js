"use strict";
// Porte de publication (chantier G ; spec S2, non-buts : « la porte de publication : chantier G »).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { dossierTemporaire } = require("../../plugins/pulse-motion/tests/aide/temporaire.js");
const P = require("./porte.js");

test("porte : un chemin de l'ordinateur se reconnaît sous toutes ses écritures, sans casse", () => {
  const m = P.motifChemin("C:\\Users\\dominique");
  for (const t of ["C:\\Users\\dominique\\video", "c:/users/dominique/x", "\"C:\\\\Users\\\\dominique\\\\a\"", "C:/Users/DOMINIQUE"]) assert.ok(m.test(t), t);
  assert.ok(!m.test("C:\\Users\\dominiqueX"), "un autre dossier qui commence pareil");
  assert.ok(!m.test("C:\\Users\\Marie\\Bureau\\mascotte.svg"), "chemin d'exemple d'une page");
  assert.ok(P.motifChemin("E:\\Projets").test("E:\\Projets\\pulse-motion"), "un lecteur et un dossier propre");
  assert.ok(P.motifChemin("/home/camille").test("/home/camille/pulse"));
});

test("porte : un chemin trop commun n'est pas un chemin de cet ordinateur", () => {
  for (const c of ["C:\\", "C:\\Users", "/home", "/", "D:\\Program Files"]) assert.equal(P.motifChemin(c), null, c);
});

test("porte : secrets reconnus, texte ordinaire accepté", () => {
  const chemins = [];
  const secrets = [
    "-----BEGIN OPENSSH " + "PRIVATE KEY-----",
    "ghp_" + "a".repeat(36),
    "github_pat_" + "b".repeat(50),
    "sk-ant-api03-" + "c".repeat(40),
    "AKIA" + "ABCDEFGHIJKLMNOP",
    "xoxb-" + "1234567890-abcdef",
  ];
  for (const s of secrets) assert.equal(P.examinerTexte(`cle = "${s}"`, chemins)[0].sorte, "secret", s);
  assert.deepEqual(P.examinerTexte("La clé du succès : sk-ant n'est pas un jeton. ghp_court.", chemins), []);
});

function depotEssai() {
  const racine = dossierTemporaire("pm-porte-");
  const git = (...a) => execFileSync("git", a, { cwd: racine, stdio: "ignore" });
  git("init", "-q");
  const ecrire = (rel, contenu) => {
    fs.mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
    fs.writeFileSync(path.join(racine, rel), contenu);
  };
  ecrire("docs/a.md", "Ouvrez C:\\Users\\Marie\\Documents.\n");
  ecrire("docs/b.md", "ligne 1\nmon dossier : /home/camille/projets\n");
  ecrire(".claude/settings.json", '{ "dossier": "/home/camille/projets" }');
  ecrire("image.png", Buffer.from([0x89, 0x50, 0, 0, 0x2f, 0x68, 0x6f, 0x6d, 0x65]));
  ecrire("cle.txt", "jeton : ghp_" + "z".repeat(36) + "\n");
  ecrire("brouillon.md", "/home/camille/projets (non suivi)");
  git("add", "docs/a.md", "docs/b.md", ".claude/settings.json", "image.png", "cle.txt");
  return racine;
}

test("porte : fichiers suivis examinés, hors .claude/, binaires et fichiers non suivis", () => {
  const racine = depotEssai();
  const problemes = P.verifierDepot(racine, { accueil: "/home/camille" });
  assert.deepEqual(problemes.map((p) => `${p.fichier}:${p.ligne}:${p.sorte}`).sort(), ["cle.txt:1:secret", "docs/b.md:2:chemin"]);
  assert.ok(!P.decrire(problemes.find((p) => p.sorte === "secret")).includes("zzzz"), "le secret n'est pas recopié");
});

test("porte : le dossier qui contient le dépôt compte comme un chemin de cet ordinateur", () => {
  const racine = depotEssai();
  const parent = path.dirname(P.racinePrincipale(racine));
  // Sauf s'il est trop commun pour dire quoi que ce soit (« /tmp » sous Linux).
  const attendu = P.motifChemin(parent) !== null;
  assert.equal(P.cheminsLocaux({ racine, accueil: "/home/camille" }).some((c) => c.chemin === parent), attendu);
  assert.ok(P.cheminsLocaux({ racine, accueil: "/home/camille" }).some((c) => c.chemin === "/home/camille"));
});
