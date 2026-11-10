#!/usr/bin/env node
// Mesures Pulse Motion – temps entre l'accord sur le déroulé et la première image animée (spec Retouches et ergonomie, 5.3,
// mesure D8 ; plan R2 « Première vidéo plus tôt »).
//
// Lancer : node outils/mesures/ebauche.js [--plugin <dossier du plugin>] [--temoins chaine-du-froid,trois-minutes]
//            [--passages 3] [--avant <mesure de séance.json>[,<…>]] [--sortie <fichier.json>]
//
// Après (commandes) : sur une copie neuve de chaque témoin, scènes retirées, déroulé et style validés, les deux commandes
// que creer lance aussitôt après l'accord (ebauche, puis l'aperçu, qui assemble la page), puis la page de l'aperçu dans Chrome sans
// fenêtre jusqu'à M.pret, et deux images à 0,5 s et 1,5 s qui doivent différer (l'image bouge). Le temps de réponse de
// Claude entre l'accord et la première commande n'est pas compté : seance.js le mesure sur une vraie séance.
// Avant (--avant) : dans une mesure de séance de création (seance.js --sans-scenes, déroulé déjà validé), l'instant du
// premier « pulse-motion apercu . » depuis le début de la séance : la première image animée de l'ancien parcours.
"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { copierTemoin, sourceTemoin, lanceurPlugin, statistiques } = require("./mesurer.js");

const DEPOT = path.join(__dirname, "..", "..");
const PLUGIN_DEFAUT = path.join(DEPOT, "plugins", "pulse-motion");

/** Une passe sur un témoin : -> { ebauche, apercu, page, total, anime, ecrites } (secondes) */
async function passe({ source, plugin, lancer }) {
  const copie = copierTemoin(source);
  let apercu = null;
  let page = null;
  try {
    fs.rmSync(path.join(copie, "scenes"), { recursive: true, force: true });
    for (const accord of ["deroule", "style"]) lancer(["etat", ".", "--accord", accord], { cwd: copie });
    const t0 = process.hrtime.bigint();
    const e = lancer(["ebauche", "."], { cwd: copie });
    if (e.code !== 0) throw new Error(`ebauche : ${e.sortie || e.erreurs}`);
    const t1 = process.hrtime.bigint();
    const { demarrerApercu } = require(path.join(plugin, "scripts", "apercu.js"));
    apercu = await demarrerApercu({ dossier: copie });
    const t2 = process.hrtime.bigint();
    const { trouverNavigateur } = require(path.join(plugin, "scripts", "lib", "navigateur.js"));
    const { ouvrirPage } = require(path.join(plugin, "scripts", "lib", "cdp.js"));
    const navigateur = trouverNavigateur();
    if (!navigateur) throw new Error("Chrome ou Edge introuvable");
    page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 800, delai: 120000 });
    await page.aller(apercu.url);
    await page.evaluer("M.pret.then(() => true)");
    const t3 = process.hrtime.bigint();
    await page.evaluer("M.rendre(0.5), true");
    const i1 = await page.capturer();
    await page.evaluer("M.rendre(1.5), true");
    const i2 = await page.capturer();
    const anime = Buffer.compare(Buffer.from(i1), Buffer.from(i2)) !== 0;
    return {
      ebauche: Math.round(e.duree * 1000) / 1000,
      apercu: Math.round(Number(t2 - t1) / 1e6) / 1000, page: Math.round(Number(t3 - t2) / 1e6) / 1000,
      total: Math.round(Number(t3 - t0) / 1e6) / 1000,
      anime, ecrites: (e.resultat && e.resultat.ecrites || []).length,
    };
  } finally {
    if (page) await page.fermer().catch(() => {});
    if (apercu) await apercu.fermer().catch(() => {});
    fs.rmSync(copie, { recursive: true, force: true });
  }
}

/** Plus longue attente sans phrase de Claude dans la conversation (séance principale), en secondes, du début de la séance
 *  à sa dernière phrase. */
function attenteMax(lignes) {
  const instants = lignes.filter((l) => l.timestamp).map((l) => Date.parse(l.timestamp));
  const phrases = lignes.filter((l) => l.type === "assistant" && !l.isSidechain && Array.isArray(l.message && l.message.content)
    && l.message.content.some((c) => c.type === "text" && String(c.text || "").trim())).map((l) => Date.parse(l.timestamp));
  let precedent = Math.min(...instants);
  let max = 0;
  for (const t of phrases) { max = Math.max(max, t - precedent); precedent = t; }
  return Math.round(max / 100) / 10;
}

/** Avant : secondes entre le début d'une séance mesurée et son premier « pulse-motion apercu . ». -> { temoin, secondes, attenteMax, dureeMur } */
function instantApercu(mesure) {
  const j = JSON.parse(fs.readFileSync(mesure, "utf8"));
  const lignes = fs.readFileSync(j.transcription, "utf8").split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const debut = Math.min(...lignes.filter((l) => l.timestamp).map((l) => Date.parse(l.timestamp)));
  const appel = lignes.find((l) => l.type === "assistant" && !l.isSidechain && Array.isArray(l.message && l.message.content)
    && l.message.content.some((c) => c.type === "tool_use" && /pulse-motion apercu \./.test(String(c.input && c.input.command || ""))));
  return { mesure: path.basename(mesure), temoin: j.temoin, plugin: j.plugin, secondes: appel ? Math.round((Date.parse(appel.timestamp) - debut) / 100) / 10 : null, attenteMax: attenteMax(lignes), dureeMur: j.dureeMur };
}

function lireOptions(args) {
  const o = { plugin: PLUGIN_DEFAUT, temoins: ["chaine-du-froid", "trois-minutes"], passages: 3, avant: [], sortie: null };
  for (let i = 0; i < args.length; i++) {
    const v = args[i + 1];
    if (args[i] === "--plugin") { o.plugin = path.resolve(v); i++; }
    else if (args[i] === "--temoins") { o.temoins = v.split(","); i++; }
    else if (args[i] === "--passages") { o.passages = parseInt(v, 10); i++; }
    else if (args[i] === "--avant") { o.avant = v.split(","); i++; }
    else if (args[i] === "--sortie") { o.sortie = path.resolve(v); i++; }
  }
  return o;
}

async function principal(args) {
  const o = lireOptions(args);
  const lancer = lanceurPlugin(o.plugin);
  const resultat = { date: new Date().toISOString(), plugin: o.plugin, avant: o.avant.map(instantApercu), apres: {} };
  for (const nom of o.temoins) {
    const passes = [];
    for (let k = 0; k < o.passages; k++) passes.push(await passe({ source: sourceTemoin(nom, o.plugin), plugin: o.plugin, lancer }));
    resultat.apres[nom] = { passes, total: statistiques(passes.map((p) => p.total)), anime: passes.every((p) => p.anime) };
    console.error(`${nom} : ${resultat.apres[nom].total.mediane} s jusqu'à la première image animée (${passes.map((p) => p.total).join(", ")}), image animée : ${resultat.apres[nom].anime ? "oui" : "non"}`);
  }
  for (const a of resultat.avant) console.error(`avant (${a.mesure}) : premier aperçu ${a.secondes} s après le début de la séance, plus longue attente sans phrase ${a.attenteMax} s (${a.temoin})`);
  const texte = JSON.stringify(resultat, null, 2);
  if (o.sortie) fs.writeFileSync(o.sortie, texte);
  console.log(texte);
}

if (require.main === module) principal(process.argv.slice(2)).catch((e) => { console.error(e.stack || e.message); process.exit(1); });

module.exports = { passe, instantApercu, attenteMax };
