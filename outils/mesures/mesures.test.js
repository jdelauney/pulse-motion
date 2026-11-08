"use strict";
// Tests des outils de mesure (spec Rapidité § 5.1). Lancer : node --test outils/mesures/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { mesurerTemoin, empreinteDossier, retoucheScriptee, poidsPage, statistiques, copierTemoin } = require("./mesurer.js");
const { bilanSession, lus } = require("./jetons.js");

const TEMOIN = path.join(__dirname, "temoins", "trois-minutes");
const PLUGIN = path.join(__dirname, "..", "..", "plugins", "pulse-motion");

test("mesures-temoin-trois-minutes-complet : 15 scènes, 180 s ± 5, tous les groupes du moteur couverts", () => {
  const deroule = JSON.parse(fs.readFileSync(path.join(TEMOIN, "deroule.json"), "utf8"));
  const scenes = deroule.scenes;
  assert.equal(scenes.length, 15);
  assert.equal(deroule.format.ratio, "16:9");
  assert.equal(deroule.style, "chaleureux");
  const { dureeVideo } = require(path.join(PLUGIN, "scripts", "lib", "voix.js"));
  const duree = dureeVideo(TEMOIN, deroule);
  assert.ok(Math.abs(duree - 180) <= 5, `durée ${duree} s`);
  // Son : musique générée, bruitages de transition, texte dit partout, sous-titres, aucune prise.
  assert.ok(deroule.musique && deroule.musique.generee, "musique générée");
  assert.equal(deroule.bruitages && deroule.bruitages.transitions, true);
  assert.ok(deroule.sousTitres, "sous-titres");
  for (const s of scenes) {
    assert.ok(s.voix && s.voix.texte, `${s.id} : texte dit`);
    assert.equal(s.voix.fichier, undefined, `${s.id} : sans prise enregistrée`);
  }
  assert.ok(!fs.existsSync(path.join(TEMOIN, "assets", "voix")), "aucune voix figée");
  const html = (s) => fs.readFileSync(path.join(TEMOIN, s.fichier), "utf8");
  const effet = (s) => (/data-effet="([^"]+)"/.exec(html(s)) || [])[1] || null;
  const personnage = (s) => /data-personnage=/.test(html(s));
  // 9 scènes toutes faites sans effet, de types variés ; 3 composées ; 2 à effet ; 1 avec touffu.
  const toutesFaites = scenes.filter((s) => s.type && !effet(s) && !personnage(s));
  assert.equal(toutesFaites.length, 9);
  assert.ok(new Set(toutesFaites.map((s) => s.type)).size >= 6, "types variés");
  const composees = scenes.filter((s) => !s.type && !effet(s) && !personnage(s));
  assert.equal(composees.length, 3);
  const effets = scenes.map(effet).filter(Boolean).sort();
  assert.deepEqual(effets, ["confettis", "etincelles"]);
  assert.match(html(scenes.find((s) => effet(s) === "etincelles")), /data-ancre|#valeur|chiffre/, "étincelles sur le chiffre");
  assert.equal(scenes.find((s) => effet(s) === "confettis"), scenes[scenes.length - 1], "confettis en conclusion");
  const avecPersonnage = scenes.filter(personnage);
  assert.equal(avecPersonnage.length, 1);
  assert.match(html(avecPersonnage[0]), /data-personnage="touffu"/);
  // 4 scènes avec des mouvements nommés, 1 transition par shader.
  assert.equal(scenes.filter((s) => Array.isArray(s.mouvements) && s.mouvements.length).length, 4);
  assert.equal(scenes.filter((s) => s.transition && typeof s.transition === "object" && s.transition.shader).length, 1);
  // Chaque fichier de scène existe et porte son id.
  for (const s of scenes) assert.match(html(s), new RegExp(`data-scene="${s.id}"`), s.id);
});

test("mesures-ne-modifie-pas-les-temoins : chaque passe travaille sur une copie temporaire, l'original reste identique", async () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "pm-temoin-essai-"));
  try {
    fs.cpSync(path.join(PLUGIN, "exemples", "chaine-du-froid"), source, { recursive: true });
    const avant = empreinteDossier(source);
    const vus = [];
    // Faux lanceur : écrit et modifie dans le dossier reçu, comme le feraient assembler, controler et exporter.
    const lancer = (args, { cwd }) => {
      vus.push(cwd);
      fs.mkdirSync(path.join(cwd, "sortie"), { recursive: true });
      fs.writeFileSync(path.join(cwd, "sortie", "page.html"), "<html></html>");
      fs.appendFileSync(path.join(cwd, "deroule.json"), "\n");
      if (args[0] === "styles") return { code: 0, duree: 0.01, resultat: [{ style: "a" }, { style: "b" }, { style: "c" }] };
      return { code: 0, duree: 0.5, resultat: { ok: true } };
    };
    const r = await mesurerTemoin({ source, passages: 2, lancer, mesurerPret: async () => 42 });
    assert.equal(r.intact, true);
    assert.equal(empreinteDossier(source), avant);
    assert.ok(vus.length > 0 && vus.every((d) => path.resolve(d) !== path.resolve(source)), "jamais le dossier d'origine");
    assert.ok(vus.every((d) => !fs.existsSync(d)), "copies retirées après la mesure");
    assert.equal(r.mesures["controle-complet"].mediane, 0.5);
    assert.deepEqual(r.mesures.page.pretMs.valeurs, [42, 42]);
    assert.ok(!fs.existsSync(path.join(source, "sortie")));
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("mesures-jetons-par-modele-et-par-agent : transcription d'essai (réponse sur deux lignes comptée une fois)", () => {
  const b = bilanSession(path.join(__dirname, "fixtures", "session-essai.jsonl"));
  assert.deepEqual(Object.keys(b.parModele).sort(), ["claude-opus-5-5", "claude-sonnet-5"]);
  const opus = b.parModele["claude-opus-5-5"];
  assert.equal(opus.reponses, 3);
  assert.equal(opus.input_tokens, 18);
  assert.equal(opus.cache_creation_input_tokens, 1300);
  assert.equal(opus.cache_read_input_tokens, 18000);
  assert.equal(opus.output_tokens, 170);
  assert.equal(b.parAgent["pulse-motion:animateur"].output_tokens, 1060);
  assert.equal(b.parAgent["pulse-motion:animateur"].appelsOutils, 2);
  assert.equal(b.parAgent.principal.appelsOutils, 3);
  assert.equal(lus(b.total), 19318 + 31104);
  assert.equal(b.premierePhraseS, 5);
  assert.equal(b.appelsAvantPremierePhrase, 2);
  assert.equal(b.duree, 59);
  assert.deepEqual(b.commandes, ["pulse-motion consignes creer", "pulse-motion whisper", "pulse-motion reference moteur"]);
  assert.match(b.blocDeFin, /^✅ \*\*Fait\*\*/);
});

test("mesures : poids de la page, retouche scriptée, médiane, copie sans sorties", () => {
  const html = '<style>@font-face { src: url("data:font/woff2;base64,QUJD"); }</style><script type="application/json" id="pm-donnees">{}</script>\n<script>\nvar M={};\n</script>';
  const p = poidsPage(html);
  assert.equal(p.total, Buffer.byteLength(html));
  assert.equal(p.moteur, Buffer.byteLength("\nvar M={};\n"));
  assert.equal(p.polices, Buffer.byteLength("data:font/woff2;base64,QUJD"));
  assert.deepEqual(statistiques([3, 1, 2]), { mediane: 2, min: 1, max: 3 });
  assert.deepEqual(statistiques([4, 1, 2, 3]), { mediane: 2.5, min: 1, max: 4 });
  const copie = copierTemoin(TEMOIN);
  try {
    assert.ok(!fs.existsSync(path.join(copie, "sortie")));
    const r = retoucheScriptee(copie);
    const d = JSON.parse(fs.readFileSync(path.join(copie, "deroule.json"), "utf8"));
    assert.equal(r.scene, d.scenes[6].id);
    assert.match(d.scenes[6].textes.titre, / \(bis\)$/);
  } finally {
    fs.rmSync(copie, { recursive: true, force: true });
  }
});

test("mesures-seance-bin-du-plugin-en-tete : la séance lance le « pulse-motion » du plugin mesuré, pas celui installé", () => {
  const { envSeance } = require("./seance.js");
  const plugin = path.join(os.tmpdir(), "plugin mesuré");
  const env = envSeance(plugin);
  const cle = Object.keys(env).find((k) => k.toUpperCase() === "PATH");
  assert.equal(env[cle].split(path.delimiter)[0], path.join(plugin, "bin"));
  assert.equal(env.PM_SANS_OUVRIR, "1");
});
