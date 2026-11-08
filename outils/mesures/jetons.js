#!/usr/bin/env node
// Mesures Pulse Motion – jetons et temps d'une séance de Claude Code, lus dans sa transcription.
//
// Lancer : node outils/mesures/jetons.js <session.jsonl> [--json]
//
// La séance principale est <session>.jsonl ; ses agents sont dans <session>/subagents/agent-*.jsonl, leur type dans
// agent-*.meta.json (« pulse-motion:animateur »…). Une réponse du modèle s'écrit parfois sur plusieurs lignes (un bloc
// par ligne, même message.id) : elle est comptée une fois. Somme, par modèle et par agent, de input_tokens,
// cache_creation_input_tokens, cache_read_input_tokens et output_tokens ; nombre d'appels d'outils ; temps jusqu'à la
// première phrase (premier texte de la séance principale après la demande) et appels d'outils faits avant elle ;
// commandes pulse-motion lancées ; bloc de fin (dernier texte qui commence par ✅). Aucun coût en euros : les tarifs
// changent, il se calcule au moment du bilan.
"use strict";

const fs = require("fs");
const path = require("path");

const CHAMPS = ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"];
const zero = () => Object.fromEntries([...CHAMPS.map((c) => [c, 0]), ["reponses", 0], ["appelsOutils", 0]]);

function lireLignes(fichier) {
  const lignes = [];
  for (const brut of fs.readFileSync(fichier, "utf8").split(/\r?\n/)) {
    if (!brut.trim()) continue;
    try { lignes.push(JSON.parse(brut)); } catch { /* ligne coupée : ignorée */ }
  }
  return lignes;
}

/** Une transcription -> { reponses: Map(id -> { model, usage }), outils: [{ id, name, input, t, ordre }], textes: [{ texte, t, ordre }], debut, fin, demande } */
function analyserTranscription(fichier) {
  const reponses = new Map();
  const outils = new Map();
  const textes = [];
  let debut = null;
  let fin = null;
  let demande = null;
  let ordre = 0;
  for (const l of lireLignes(fichier)) {
    const t = l.timestamp ? Date.parse(l.timestamp) : null;
    if (t !== null && !Number.isNaN(t)) { if (debut === null || t < debut) debut = t; if (fin === null || t > fin) fin = t; }
    if (l.type === "user" && !l.isMeta && demande === null && l.message && t !== null) {
      const c = l.message.content;
      const estResultat = Array.isArray(c) && c.some((b) => b && b.type === "tool_result");
      if (!estResultat) demande = t;
    }
    if (l.type !== "assistant" || !l.message) continue;
    const m = l.message;
    const id = m.id || l.uuid;
    if (m.usage) reponses.set(id, { model: m.model || "inconnu", usage: m.usage });
    for (const b of Array.isArray(m.content) ? m.content : []) {
      if (b.type === "tool_use" && !outils.has(b.id)) outils.set(b.id, { id: b.id, name: b.name, input: b.input || {}, t, ordre: ordre++ });
      if (b.type === "text" && String(b.text || "").trim()) textes.push({ texte: b.text, t, ordre: ordre++ });
    }
  }
  return { reponses, outils: [...outils.values()], textes, debut, fin, demande };
}

function ajouter(cumul, model, usage) {
  for (const c of CHAMPS) cumul[c] += Number(usage[c] || 0);
  cumul.reponses += 1;
}

/** Agents d'une séance : [{ fichier, type, description }] */
function agentsDe(session) {
  const dossier = path.join(session.replace(/\.jsonl$/, ""), "subagents");
  if (!fs.existsSync(dossier)) return [];
  return fs.readdirSync(dossier).filter((f) => /^agent-.*\.jsonl$/.test(f)).sort().map((f) => {
    const meta = path.join(dossier, f.replace(/\.jsonl$/, ".meta.json"));
    let m = {};
    try { m = JSON.parse(fs.readFileSync(meta, "utf8")); } catch { m = {}; }
    return { fichier: path.join(dossier, f), type: m.agentType || "inconnu", description: m.description || null };
  });
}

const commandesPulse = (outils) => outils.filter((o) => o.name === "Bash" && /pulse-motion|pm\.js/.test(String(o.input.command || ""))).map((o) => String(o.input.command));

/**
 * Bilan d'une séance. -> { session, duree, premierePhraseS, appelsAvantPremierePhrase, parModele, parAgent, total,
 *   appelsOutils, agents, commandes, blocDeFin }
 */
function bilanSession(session) {
  const principale = analyserTranscription(session);
  const parModele = {};
  const parAgent = {};
  const total = zero();
  const compter = (agent, analyse) => {
    parAgent[agent] = parAgent[agent] || zero();
    for (const { model, usage } of analyse.reponses.values()) {
      parModele[model] = parModele[model] || zero();
      ajouter(parModele[model], model, usage);
      ajouter(parAgent[agent], model, usage);
      ajouter(total, model, usage);
    }
    parAgent[agent].appelsOutils += analyse.outils.length;
    total.appelsOutils += analyse.outils.length;
  };
  compter("principal", principale);
  const agents = [];
  let commandes = commandesPulse(principale.outils);
  let fin = principale.fin;
  for (const a of agentsDe(session)) {
    const analyse = analyserTranscription(a.fichier);
    compter(a.type, analyse);
    for (const r of analyse.reponses.values()) {
      const m = r.model;
      parModele[m].agents = parModele[m].agents || {};
      parModele[m].agents[a.type] = (parModele[m].agents[a.type] || 0) + 1;
    }
    agents.push({ type: a.type, description: a.description, reponses: analyse.reponses.size, appelsOutils: analyse.outils.length, modeles: [...new Set([...analyse.reponses.values()].map((r) => r.model))] });
    commandes = commandes.concat(commandesPulse(analyse.outils));
    if (analyse.fin !== null && (fin === null || analyse.fin > fin)) fin = analyse.fin;
  }
  const depart = principale.demande !== null ? principale.demande : principale.debut;
  const premiere = principale.textes.find((x) => x.t !== null && depart !== null && x.t >= depart);
  const appelsAvant = premiere ? principale.outils.filter((o) => o.ordre < premiere.ordre).length : principale.outils.length;
  const fins = principale.textes.filter((x) => /^\s*✅/m.test(x.texte));
  return {
    session: path.basename(session),
    duree: depart !== null && fin !== null ? (fin - depart) / 1000 : null,
    premierePhraseS: premiere ? (premiere.t - depart) / 1000 : null,
    appelsAvantPremierePhrase: appelsAvant,
    parModele, parAgent, total,
    appelsOutils: total.appelsOutils,
    agents,
    commandes,
    blocDeFin: fins.length ? fins[fins.length - 1].texte.slice(fins[fins.length - 1].texte.indexOf("✅")).trim() : null,
  };
}

/** Jetons lus (entrée + cache créé + cache relu) : la mesure « jetons lus » du protocole. */
const lus = (c) => c.input_tokens + c.cache_creation_input_tokens + c.cache_read_input_tokens;

if (require.main === module) {
  const args = process.argv.slice(2);
  const fichier = args.find((a) => !a.startsWith("--"));
  if (!fichier) { console.error("Usage : node outils/mesures/jetons.js <session.jsonl> [--json]"); process.exit(2); }
  const b = bilanSession(path.resolve(fichier));
  if (args.includes("--json")) console.log(JSON.stringify(b, null, 2));
  else {
    console.log(`Séance ${b.session} : ${b.duree} s, première phrase à ${b.premierePhraseS} s après ${b.appelsAvantPremierePhrase} appel(s) d'outil`);
    for (const [m, c] of Object.entries(b.parModele)) console.log(`  modèle ${m.padEnd(22)} lus ${lus(c)} (cache relu ${c.cache_read_input_tokens}), écrits ${c.output_tokens}, ${c.reponses} réponses`);
    for (const [a, c] of Object.entries(b.parAgent)) console.log(`  agent  ${a.padEnd(22)} lus ${lus(c)}, écrits ${c.output_tokens}, ${c.appelsOutils} appels d'outils`);
    console.log(`  total lus ${lus(b.total)}, écrits ${b.total.output_tokens}, ${b.appelsOutils} appels d'outils, ${b.agents.length} agents`);
  }
}

module.exports = { bilanSession, analyserTranscription, agentsDe, lus, CHAMPS };
