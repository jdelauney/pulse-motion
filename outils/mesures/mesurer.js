#!/usr/bin/env node
// Mesures Pulse Motion – protocole de mesure de la spec Rapidité (S1 § 5.1) : temps des commandes réelles d'un plugin
// sur les vidéos témoins, poids de la page, temps jusqu'à M.pret, durée de npm test par phase.
//
// Lancer : node outils/mesures/mesurer.js [--plugin <dossier du plugin>] [--passages 3] [--temoins chaine-du-froid,trois-minutes]
//                                          [--seulement assemblage,page,controle-complet,…] [--tests] [--sortie <fichier.json>]
//                                          [--jalon <nom>] [--modele <modèle de la session>]
//
// Chaque témoin est copié dans un dossier temporaire à chaque passage : les originaux ne sont jamais touchés.
// Les commandes sont celles que lancent les compétences (node <plugin>/scripts/pm.js …), chronométrées de bout en bout ;
// PM_SANS_OUVRIR=1 (aucune fenêtre) et PM_PROFIL=1 (profil d'export, s'il existe) leur sont passés.
// Une passe : assemblage, page (poids, M.pret), contrôle complet, contrôle sans changement, export fidèle, sauvegarde
// d'historique, retouche scriptée (titre de la scène 7) puis contrôle, réexport, comparaison de 3 styles.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { decrireMachine } = require("./machine.js");

const DEPOT = path.join(__dirname, "..", "..");
const PLUGIN_DEFAUT = path.join(DEPOT, "plugins", "pulse-motion");
const MESURES = ["assemblage", "page", "controle-complet", "controle-sans-changement", "export", "historique", "controle-retouche", "reexport", "comparer", "historique-medias"];
const MEDIAS_MO = 50;
const IGNORES = new Set(["sortie", ".historique", ".pulse-motion", "temoin.json"]);

/** Dossier source de chaque témoin : chaine-du-froid vient du plugin mesuré, les autres de outils/mesures/temoins/. */
function sourceTemoin(nom, plugin) {
  return nom === "chaine-du-froid" ? path.join(plugin, "exemples", "chaine-du-froid") : path.join(__dirname, "temoins", nom);
}

/** Empreinte du contenu d'un dossier (chemins relatifs et octets), pour vérifier qu'un témoin n'a pas bougé. */
function empreinteDossier(dossier) {
  const h = crypto.createHash("sha256");
  const parcourir = (rel) => {
    const abs = path.join(dossier, rel);
    for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) parcourir(r);
      else { h.update(r.split(path.sep).join("/")); h.update("\0"); h.update(fs.readFileSync(path.join(dossier, r))); h.update("\0"); }
    }
  };
  parcourir("");
  return h.digest("hex");
}

function tailleDossier(dossier) {
  if (!fs.existsSync(dossier)) return 0;
  let total = 0;
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    total += e.isDirectory() ? tailleDossier(p) : fs.statSync(p).size;
  }
  return total;
}

/** Copie de travail d'un témoin, sans ses sorties ni son historique. -> chemin */
function copierTemoin(source) {
  const copie = fs.mkdtempSync(path.join(os.tmpdir(), `pm-mesure-${path.basename(source)}-`));
  for (const e of fs.readdirSync(source)) {
    if (IGNORES.has(e)) continue;
    fs.cpSync(path.join(source, e), path.join(copie, e), { recursive: true });
  }
  return copie;
}

/** Lanceur réel : node <plugin>/scripts/pm.js <args> dans le dossier de la copie. -> { code, duree, resultat, sortie } */
function lanceurPlugin(plugin) {
  const pm = path.join(plugin, "scripts", "pm.js");
  return (args, { cwd }) => {
    const debut = process.hrtime.bigint();
    const r = spawnSync(process.execPath, [pm, ...args], {
      cwd, encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, PM_SANS_OUVRIR: "1", PM_PROFIL: "1" },
    });
    const duree = Number(process.hrtime.bigint() - debut) / 1e9;
    let resultat = null;
    try { resultat = JSON.parse(r.stdout); } catch { resultat = null; }
    return { code: r.status, duree, resultat, sortie: r.stdout, erreurs: String(r.stderr || "").slice(-2000) };
  };
}

/** Retouche scriptée : le titre de la scène 7 (ou de la scène du milieu si la vidéo en a moins) reçoit « (bis) ». */
function retoucheScriptee(copie) {
  const fichier = path.join(copie, "deroule.json");
  const deroule = JSON.parse(fs.readFileSync(fichier, "utf8"));
  const i = deroule.scenes.length >= 7 ? 6 : Math.floor(deroule.scenes.length / 2);
  const scene = deroule.scenes[i];
  scene.textes = scene.textes || {};
  const cle = "titre" in scene.textes ? "titre" : Object.keys(scene.textes)[0] || "titre";
  scene.textes[cle] = `${scene.textes[cle] || "Titre"} (bis)`;
  fs.writeFileSync(fichier, JSON.stringify(deroule, null, 2));
  return { scene: scene.id, cle };
}

/** Page assemblée de la copie (sortie/<titre>.html). */
function pageAssemblee(copie) {
  const sortie = path.join(copie, "sortie");
  const f = fs.existsSync(sortie) ? fs.readdirSync(sortie).find((n) => n.endsWith(".html")) : null;
  return f ? path.join(sortie, f) : null;
}

/** Poids d'une page : total, moteur (script qui suit les données de la page), polices embarquées. -> octets */
function poidsPage(html) {
  const total = Buffer.byteLength(html);
  const apres = html.indexOf('id="pm-donnees"');
  let moteur = null;
  if (apres >= 0) {
    const debut = html.indexOf("<script>", apres);
    const fin = debut >= 0 ? html.indexOf("</script>", debut) : -1;
    if (debut >= 0 && fin > debut) moteur = Buffer.byteLength(html.slice(debut + 8, fin));
  }
  let polices = 0;
  for (const m of html.matchAll(/url\("(data:(?:font\/|application\/(?:x-)?font)[^"]*)"\)/g)) polices += Buffer.byteLength(m[1]);
  return { total, moteur, polices };
}

/** Temps jusqu'à M.pret (ms depuis le début de la navigation), dans Chrome sans fenêtre en 1280 × 800. */
async function tempsPret(plugin, fichier) {
  const { trouverNavigateur } = require(path.join(plugin, "scripts", "lib", "navigateur.js"));
  const { ouvrirPage } = require(path.join(plugin, "scripts", "lib", "cdp.js"));
  const navigateur = trouverNavigateur();
  if (!navigateur) return null;
  const page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 800, delai: 120000 });
  try {
    await page.aller(pathToFileURL(fichier).href);
    return await page.evaluer("M.pret.then(() => performance.now())");
  } finally {
    await page.fermer();
  }
}

/** Trois premiers styles proposés pour le genre du témoin. */
function troisStyles(lancer, copie) {
  const genre = JSON.parse(fs.readFileSync(path.join(copie, "deroule.json"), "utf8")).genre || "formation";
  const r = lancer(["styles", "--genre", genre], { cwd: copie });
  return Array.isArray(r.resultat) ? r.resultat.slice(0, 3).map((s) => s.style) : [];
}

const statistiques = (valeurs) => {
  const v = valeurs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!v.length) return { mediane: null, min: null, max: null };
  const m = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  return { mediane: arrondi(m), min: arrondi(v[0]), max: arrondi(v[v.length - 1]) };
};
const arrondi = (x) => Math.round(x * 1000) / 1000;

/** Une passe sur une copie neuve du témoin. -> { mesure: { duree, ok, details } } */
async function passe({ source, plugin, seulement, lancer, mesurerPret = tempsPret, journal = () => {} }) {
  const copie = copierTemoin(source);
  const r = {};
  const veut = (m) => !seulement || seulement.includes(m);
  const pas = (nom, args) => {
    journal(`  ${nom}…`);
    const x = lancer(args, { cwd: copie });
    r[nom] = { duree: arrondi(x.duree), ok: x.code === 0, details: resume(nom, x.resultat), ...(x.code === 0 ? {} : { erreurs: x.erreurs || (x.sortie || "").slice(-600) }) };
    return x;
  };
  try {
    pas("assemblage", ["assembler", "."]);
    if (veut("page")) {
      const f = pageAssemblee(copie);
      const poids = f ? poidsPage(fs.readFileSync(f, "utf8")) : null;
      let pret = null;
      try { pret = f ? await mesurerPret(plugin, f) : null; } catch (e) { pret = null; journal(`  M.pret impossible : ${e.message}`); }
      r.page = { ok: Boolean(f), poids, pretMs: typeof pret === "number" ? arrondi(pret) : null };
    }
    if (veut("controle-complet")) pas("controle-complet", ["controler", "."]);
    if (veut("controle-sans-changement")) pas("controle-sans-changement", ["controler", "."]);
    if (veut("export")) {
      pas("export", ["exporter", "."]);
      const profil = path.join(copie, "sortie", ".export", "profil.json");
      if (fs.existsSync(profil)) r.export.profil = JSON.parse(fs.readFileSync(profil, "utf8"));
    }
    if (veut("historique")) {
      const avant = tailleDossier(path.join(copie, ".historique"));
      pas("historique", ["historique", "sauvegarder", "."]);
      r.historique.octets = tailleDossier(path.join(copie, ".historique")) - avant;
    }
    const retouche = retoucheScriptee(copie);
    if (veut("controle-retouche")) { pas("controle-retouche", ["controler", "."]); r["controle-retouche"].retouche = retouche; }
    if (veut("reexport")) {
      pas("reexport", ["exporter", "."]);
      const profil = path.join(copie, "sortie", ".export", "profil.json");
      if (fs.existsSync(profil)) r.reexport.profil = JSON.parse(fs.readFileSync(profil, "utf8"));
    }
    if (veut("comparer")) {
      const styles = troisStyles(lancer, copie);
      pas("comparer", ["comparer", ".", styles.join(",")]);
      r.comparer.styles = styles;
    }
    if (seulement && seulement.includes("historique-medias")) {
      // Seulement sur demande (--seulement historique-medias). 50 Mo de médias (10 fichiers de 5 Mo) : une première sauvegarde, puis seul le déroulé change (spec 5.12).
      const medias = path.join(copie, "assets", "mesure-medias");
      fs.mkdirSync(medias, { recursive: true });
      for (let i = 0; i < 10; i++) fs.writeFileSync(path.join(medias, `media-${i}.bin`), crypto.randomBytes(MEDIAS_MO / 10 * 1024 * 1024));
      const retoucherDeroule = (n) => {
        const f = path.join(copie, "deroule.json");
        const d = JSON.parse(fs.readFileSync(f, "utf8"));
        d.titre = `${String(d.titre).replace(/ \(\d+\)$/, "")} (${n})`;
        fs.writeFileSync(f, JSON.stringify(d, null, 2));
      };
      lancer(["historique", "sauvegarder", "."], { cwd: copie });
      retoucherDeroule(1);
      const avant = tailleDossier(path.join(copie, ".historique"));
      pas("historique-medias", ["historique", "sauvegarder", "."]);
      r["historique-medias"].octets = tailleDossier(path.join(copie, ".historique")) - avant;
      for (let n = 2; n <= 19; n++) { retoucherDeroule(n); lancer(["historique", "sauvegarder", "."], { cwd: copie }); }
      // 20 sauvegardes : place prise sur le disque, rapportée à la taille des médias.
      r["historique-medias"].disqueSurMedias = arrondi(tailleDossier(path.join(copie, ".historique")) / (MEDIAS_MO * 1024 * 1024));
    }
  } finally {
    fs.rmSync(copie, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  return r;
}

/** Ce qu'on garde du résultat JSON d'une commande. */
function resume(nom, res) {
  if (!res || typeof res !== "object") return null;
  if (nom.startsWith("controle")) return { erreurs: res.erreurs, alertes: res.alertes, corrections: res.corrections, renduVerifie: res.renduVerifie, ...("rendu" in res ? { rendu: res.rendu, scenesMesurees: res.scenesMesurees } : {}) };
  if (nom === "export" || nom === "reexport") {
    const garder = ["ok", "mode", "duree", "images", "segments", "segmentsRepris", "segmentsReencodes", "paralleles", "regleParalleles", "audio", "message", "scenesRecapturees"];
    return Object.fromEntries(garder.filter((k) => k in res).map((k) => [k, res[k]]));
  }
  if (nom === "comparer") return { ok: res.ok, images: Array.isArray(res.images) ? res.images.length : null, message: res.message };
  return { ok: res.ok };
}

/** Toutes les passes d'un témoin. -> { source, empreinteAvant, empreinteApres, intact, passages: [...], mesures: { nom: { mediane, min, max, valeurs } } } */
async function mesurerTemoin({ source, plugin = PLUGIN_DEFAUT, passages = 3, seulement = null, lancer = lanceurPlugin(plugin), mesurerPret, journal = () => {} }) {
  const empreinteAvant = empreinteDossier(source);
  const liste = [];
  for (let i = 0; i < passages; i++) {
    journal(`${path.basename(source)} : passage ${i + 1} / ${passages}`);
    liste.push(await passe({ source, plugin, seulement, lancer, mesurerPret, journal }));
  }
  const empreinteApres = empreinteDossier(source);
  const mesures = {};
  for (const nom of MESURES) {
    if (nom === "page") {
      const pret = liste.map((p) => p.page && p.page.pretMs);
      if (liste.some((p) => p.page)) mesures.page = { pretMs: { ...statistiques(pret), valeurs: pret }, poids: (liste.find((p) => p.page && p.page.poids) || {}).page?.poids || null };
      continue;
    }
    const valeurs = liste.map((p) => (p[nom] ? p[nom].duree : null));
    if (valeurs.every((v) => v === null)) continue;
    mesures[nom] = { ...statistiques(valeurs), valeurs, unite: "s", ok: liste.every((p) => !p[nom] || p[nom].ok) };
    if (nom === "historique" || nom === "historique-medias") mesures[nom].octets = liste.map((p) => p[nom] && p[nom].octets);
    if (nom === "historique-medias") mesures[nom].disqueSurMedias = liste.map((p) => p[nom] && p[nom].disqueSurMedias);
  }
  const deroule = JSON.parse(fs.readFileSync(path.join(source, "deroule.json"), "utf8"));
  return { source, scenes: deroule.scenes.length, empreinteAvant, empreinteApres, intact: empreinteAvant === empreinteApres, mesures, passages: liste };
}

/** npm test, phase par phase (unitaires, puis navigateur). -> { unitaires, navigateur } : { duree, code, tests, reussis, echecs } */
function mesurerTests(plugin, journal = () => {}) {
  const r = {};
  for (const phase of ["unitaires", "navigateur"]) {
    journal(`npm test, phase ${phase}…`);
    const debut = process.hrtime.bigint();
    const x = spawnSync(process.execPath, [path.join(plugin, "scripts", "lancer-tests.js"), `--${phase}`], { cwd: plugin, encoding: "utf8", windowsHide: true, maxBuffer: 512 * 1024 * 1024 });
    const duree = Number(process.hrtime.bigint() - debut) / 1e9;
    const lire = (mot) => [...String(x.stdout).matchAll(new RegExp(`ℹ ${mot} (\\d+)`, "g"))].reduce((s, m) => s + Number(m[1]), 0);
    r[phase] = { duree: arrondi(duree), code: x.status, tests: lire("tests"), reussis: lire("pass"), echecs: lire("fail") };
  }
  return r;
}

function lireOptions(args) {
  const valeur = (o, d) => { const i = args.indexOf(o); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
  return {
    plugin: path.resolve(valeur("--plugin", PLUGIN_DEFAUT)),
    passages: Number(valeur("--passages", "3")),
    temoins: valeur("--temoins", "chaine-du-froid,trois-minutes").split(",").filter(Boolean),
    seulement: args.includes("--seulement") ? valeur("--seulement", "").split(",").filter(Boolean) : null,
    tests: args.includes("--tests"),
    sortie: args.includes("--sortie") ? path.resolve(valeur("--sortie")) : null,
    jalon: valeur("--jalon", null),
    modele: valeur("--modele", null),
  };
}

async function principal(args) {
  const o = lireOptions(args);
  const journal = (t) => process.stderr.write(`${t}\n`);
  const version = JSON.parse(fs.readFileSync(path.join(o.plugin, ".claude-plugin", "plugin.json"), "utf8")).version;
  const resultat = {
    date: new Date().toISOString(), jalon: o.jalon, plugin: { dossier: o.plugin, version },
    machine: { ...decrireMachine({ racinePlugin: o.plugin }), modeleSession: o.modele },
    passages: o.passages, temoins: {},
  };
  const ecrire = () => { if (o.sortie) { fs.mkdirSync(path.dirname(o.sortie), { recursive: true }); fs.writeFileSync(o.sortie, JSON.stringify(resultat, null, 2)); } };
  for (const nom of o.temoins) {
    resultat.temoins[nom] = await mesurerTemoin({ source: sourceTemoin(nom, o.plugin), plugin: o.plugin, passages: o.passages, seulement: o.seulement, journal });
    ecrire();
  }
  if (o.tests) { resultat.tests = mesurerTests(o.plugin, journal); ecrire(); }
  for (const [nom, t] of Object.entries(resultat.temoins)) {
    journal(`\n${nom} (${t.scenes} scènes)${t.intact ? "" : " – TÉMOIN MODIFIÉ"}`);
    for (const [m, v] of Object.entries(t.mesures)) journal(`  ${m.padEnd(26)} ${m === "page" ? `M.pret ${v.pretMs.mediane} ms, page ${v.poids && v.poids.total} o, moteur ${v.poids && v.poids.moteur} o, polices ${v.poids && v.poids.polices} o` : `${v.mediane} s (${v.min}–${v.max})${v.octets ? `, ${v.octets.join(" / ")} o` : ""}${v.ok ? "" : " ÉCHEC"}`}`);
  }
  if (resultat.tests) for (const [p, v] of Object.entries(resultat.tests)) journal(`  tests ${p.padEnd(20)} ${v.duree} s, ${v.reussis}/${v.tests}, code ${v.code}`);
  if (!o.sortie) console.log(JSON.stringify(resultat, null, 2));
  return Object.values(resultat.temoins).every((t) => t.intact) ? 0 : 1;
}

if (require.main === module) {
  principal(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
}

module.exports = { mesurerTemoin, copierTemoin, empreinteDossier, retoucheScriptee, poidsPage, statistiques, sourceTemoin, lanceurPlugin, MESURES };
