#!/usr/bin/env node
// Mesures Pulse Motion – retouches directes (spec Retouches et ergonomie, 5.8 à 5.11 ; plan R3, avec S10-B).
//
// Lancer : node outils/mesures/retouches.js [--plugin <dossier du plugin>] [--temoins chaine-du-froid,trois-minutes]
//            [--passages 3] [--sortie <fichier.json>]
//
// Sur une copie neuve de chaque témoin, contrôlé une première fois (comme une vidéo finie), les commandes réelles que
// Claude lance pour :
// - une remarque de l'aperçu traitée (spec 5.8, point 6) : liste des remarques, sauvegarde d'historique avec la phrase,
//   retouche scriptée (le premier texte de la deuxième scène), contrôle (partiel : S1 P6), image de l'instant ré-ancré
//   (planche --instants), remarque marquée faite ; le temps de Claude (lire, écrire, regarder) n'est pas compté ;
// - l'avant / après de cette retouche (planche --avant precedente) ;
// - l'historique : annuler, rétablir, nommer, revenir, liste, et une version reconstituée (materialiser) ;
// - un réglage rapide (allure) puis le contrôle qui le suit ;
// - la version comparée de l'aperçu (/_pm/version/<n>) : premier appel, puis en cache.
// Repère : le contrôle complet de la même vidéo (ce que chaque remarque coûterait sans le contrôle limité).
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { copierTemoin, sourceTemoin, lanceurPlugin, statistiques } = require("./mesurer.js");

const DEPOT = path.join(__dirname, "..", "..");
const PLUGIN_DEFAUT = path.join(DEPOT, "plugins", "pulse-motion");
const arrondi = (x) => Math.round(x * 1000) / 1000;

function obtenir(url) {
  return new Promise((resolve, reject) => {
    const t0 = process.hrtime.bigint();
    http.get(url, (res) => {
      let n = 0;
      res.on("data", (m) => { n += m.length; });
      res.on("end", () => resolve({ statut: res.statusCode, octets: n, duree: arrondi(Number(process.hrtime.bigint() - t0) / 1e9) }));
    }).on("error", reject);
  });
}

/** Une passe sur un témoin. -> { remarque: { etapes, total }, avantApres, historique, reglage, version, controleComplet } (secondes) */
async function passe({ source, plugin, lancer }) {
  const copie = copierTemoin(source);
  const R = require(path.join(plugin, "scripts", "lib", "remarques.js"));
  const H = require(path.join(plugin, "scripts", "historique.js"));
  const G = require(path.join(plugin, "scripts", "lib", "reglages-rapides.js"));
  const { minutageVideo } = require(path.join(plugin, "scripts", "lib", "voix.js"));
  const { lireDeroule } = require(path.join(plugin, "scripts", "lib", "deroule.js"));
  const ok = (r, quoi) => { if (r.code !== 0) throw new Error(`${quoi} : ${r.erreurs || r.sortie}`); return arrondi(r.duree); };
  let apercu = null;
  try {
    const complet = ok(lancer(["controler", ".", "--complet"], { cwd: copie }), "contrôle complet");
    // Une remarque épinglée sur la deuxième scène, à 35 % de sa durée.
    const { deroule } = lireDeroule(copie);
    const s = minutageVideo(copie, deroule).scenes[1];
    const t = s.debut + 0.35 * (s.fin - s.debut);
    const r = R.creer(copie, { portee: "epingle", t, x: 0.5, y: 0.4, texte: "le texte arrive trop tôt" });
    R.envoyer(copie);
    const etapes = {};
    etapes.liste = ok(lancer(["remarques", "liste", "."], { cwd: copie }), "liste");
    etapes.sauvegarde = ok(lancer(["historique", "sauvegarder", ".", "--phrase", r.texte], { cwd: copie }), "sauvegarde");
    // Retouche scriptée : le premier texte de la deuxième scène (sinon sa durée).
    const fichier = path.join(copie, "deroule.json");
    const d = JSON.parse(fs.readFileSync(fichier, "utf8"));
    const scene = d.scenes[1];
    const cle = scene.textes && Object.keys(scene.textes)[0];
    if (cle) scene.textes[cle] = `${scene.textes[cle]} (retouché)`; else scene.duree += 0.5;
    fs.writeFileSync(fichier, JSON.stringify(d, null, 2));
    etapes.controle = ok(lancer(["controler", "."], { cwd: copie }), "contrôle");
    const instant = R.liste(copie).ouvertes[0].t;
    etapes.instant = ok(lancer(["planche", ".", "--instants", String(instant)], { cwd: copie }), "planche --instants");
    etapes.faite = ok(lancer(["remarques", "faite", r.id, "Le texte arrive plus tard.", "."], { cwd: copie }), "remarques faite");
    const total = arrondi(Object.values(etapes).reduce((a, b) => a + b, 0));
    const avantApres = ok(lancer(["planche", ".", "--avant", "precedente"], { cwd: copie }), "planche --avant");

    const historique = {};
    historique.annuler = ok(lancer(["historique", "annuler", "."], { cwd: copie }), "annuler");
    historique.retablir = ok(lancer(["historique", "retablir", "."], { cwd: copie }), "retablir");
    historique.nommer = ok(lancer(["historique", "nommer", "mesure", "."], { cwd: copie }), "nommer");
    historique.liste = ok(lancer(["historique", "liste", "."], { cwd: copie }), "liste");
    historique.revenir = ok(lancer(["historique", "revenir", "mesure", "."], { cwd: copie }), "revenir");
    const t0 = process.hrtime.bigint();
    const m = H.materialiser(copie, "mesure", path.join(copie, "..", `${path.basename(copie)}-version`));
    historique.materialiser = arrondi(Number(process.hrtime.bigint() - t0) / 1e9);
    fs.rmSync(m.dossier, { recursive: true, force: true });
    const octetsHistorique = (() => { let n = 0; const v = (a) => { for (const e of fs.readdirSync(a, { withFileTypes: true })) { const p = path.join(a, e.name); if (e.isDirectory()) v(p); else n += fs.statSync(p).size; } }; v(path.join(copie, ".historique")); return n; })();

    const t1 = process.hrtime.bigint();
    G.appliquer(copie, { cle: "allure", valeur: "1.2" });
    const reglage = { appliquer: arrondi(Number(process.hrtime.bigint() - t1) / 1e9) };
    reglage.controle = ok(lancer(["controler", "."], { cwd: copie }), "contrôle après le réglage");

    const { demarrerApercu } = require(path.join(plugin, "scripts", "apercu.js"));
    apercu = await demarrerApercu({ dossier: copie, port: 47990 });
    const premier = await obtenir(`${apercu.url}_pm/version/mesure`);
    const cache = await obtenir(`${apercu.url}_pm/version/mesure`);
    const version = { premier: premier.duree, cache: cache.duree, octets: premier.octets, statut: premier.statut };
    return { remarque: { etapes, total }, avantApres, historique, octetsHistorique, reglage, version, controleComplet: complet };
  } finally {
    if (apercu) await apercu.fermer().catch(() => {});
    fs.rmSync(copie, { recursive: true, force: true });
  }
}

function lireOptions(args) {
  const o = { plugin: PLUGIN_DEFAUT, temoins: ["chaine-du-froid", "trois-minutes"], passages: 3, sortie: null };
  for (let i = 0; i < args.length; i++) {
    const v = args[i + 1];
    if (args[i] === "--plugin") { o.plugin = path.resolve(v); i++; }
    else if (args[i] === "--temoins") { o.temoins = v.split(","); i++; }
    else if (args[i] === "--passages") { o.passages = parseInt(v, 10); i++; }
    else if (args[i] === "--sortie") { o.sortie = path.resolve(v); i++; }
  }
  return o;
}

async function principal(args) {
  const o = lireOptions(args);
  const lancer = lanceurPlugin(o.plugin);
  const resultat = { date: new Date().toISOString(), plugin: o.plugin, temoins: {} };
  for (const nom of o.temoins) {
    const passes = [];
    for (let k = 0; k < o.passages; k++) passes.push(await passe({ source: sourceTemoin(nom, o.plugin), plugin: o.plugin, lancer }));
    const med = (f) => statistiques(passes.map(f)).mediane;
    resultat.temoins[nom] = {
      passes,
      remarque: med((p) => p.remarque.total), controlePartiel: med((p) => p.remarque.etapes.controle), instant: med((p) => p.remarque.etapes.instant),
      controleComplet: med((p) => p.controleComplet), avantApres: med((p) => p.avantApres),
      annuler: med((p) => p.historique.annuler), retablir: med((p) => p.historique.retablir), materialiser: med((p) => p.historique.materialiser),
      reglage: med((p) => p.reglage.appliquer), versionPremier: med((p) => p.version.premier), versionCache: med((p) => p.version.cache),
    };
    const r = resultat.temoins[nom];
    console.error(`${nom} : remarque traitée ${r.remarque} s (contrôle partiel ${r.controlePartiel} s, contre ${r.controleComplet} s complet ; instant ${r.instant} s) ; avant / après ${r.avantApres} s ; annuler ${r.annuler} s, rétablir ${r.retablir} s, version reconstituée ${r.materialiser} s ; réglage rapide ${r.reglage} s ; version comparée ${r.versionPremier} s puis ${r.versionCache} s`);
  }
  const texte = JSON.stringify(resultat, null, 2);
  if (o.sortie) fs.writeFileSync(o.sortie, texte);
  console.log(texte);
}

if (require.main === module) principal(process.argv.slice(2)).catch((e) => { console.error(e.stack || e.message); process.exit(1); });

module.exports = { passe, lireOptions };
