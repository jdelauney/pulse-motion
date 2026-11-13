'use strict';
/* Pulse Motion – typographie des styles (spec S11, 5.5) : references/styles/polices.json (polices de chaque style livré et
 * deux alternatives sous licence OFL, polices trop vues), avis police-trop-vue d'un style personnel, règles d'un style
 * nouveau (aucune police trop vue ; au moins une police que 2 autres styles livrés au plus utilisent).
 *
 *   lirePolices()                          -> contenu de polices.json
 *   policesDuStyle(dossier)                -> [familles] (identite.typographie et charte.polices, polices système exclues)
 *   policeTropVue(dossier)                 -> [problèmes] (avis police-trop-vue ; levé par un changement noté « charte »
 *                                             qui nomme la police)
 *   reglesStyleNouveau(nom, dossierStyles) -> [messages] (vide : le style nouveau respecte les deux règles)
 *   alternativesPolices(nom)               -> { style, titres, texte, alternatives, tropVues, base? } | null
 *
 * Idées de cinecode (MIT, © 2026 Sarp Yıldız) : references/type-library.json (look_map, kept_out.overused) ; liste et
 * alternatives choisies pour Pulse Motion. */
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.resolve(__dirname, '..', '..');
const FICHIER = path.join(RACINE, 'references', 'styles', 'polices.json');
const SYSTEME = new Set(['system-ui', 'sans-serif', 'serif', 'monospace']);

const lireJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; } };
const cle = (f) => String(f || '').trim().toLowerCase();

function lirePolices() {
  return lireJSON(FICHIER) || { styles: {}, familles: {}, 'trop-vues': [] };
}

/** Familles d'un style : celles de identite.typographie et de charte.polices (polices système exclues), sans doublon. */
function policesDuStyle(dossier) {
  const identite = lireJSON(path.join(dossier, 'identite.json')) || {};
  const charte = lireJSON(path.join(dossier, 'charte.json')) || {};
  const typo = identite.typographie || {};
  const liste = [typo.titres && typo.titres.famille, typo.texte && typo.texte.famille, ...Object.values(charte.polices || {})]
    .filter((f) => typeof f === 'string' && f.trim() && !SYSTEME.has(f.trim()));
  const vues = new Set();
  return liste.filter((f) => (vues.has(cle(f)) ? false : vues.add(cle(f))));
}

/** Police imposée par la charte de la personne : un changement du journal noté « charte » (style noter … --charte) qui la nomme. */
function imposeeParLaCharte(dossier, famille) {
  const journal = lireJSON(path.join(dossier, 'changements.json'));
  if (!Array.isArray(journal)) return false;
  return journal.some((c) => c && c.charte && [c.apres, c.pourquoi].some((x) => cle(x).includes(cle(famille))));
}

/** Avis police-trop-vue d'un style personnel (gravité info : rien n'est bloqué). */
function policeTropVue(dossier) {
  const trop = new Set((lirePolices()['trop-vues'] || []).map(cle));
  return policesDuStyle(dossier).filter((f) => trop.has(cle(f)) && !imposeeParLaCharte(dossier, f)).map((f) => ({
    regle: 'police-trop-vue', gravite: 'info',
    message: `La police « ${f} » se voit partout : elle donne au style l'air d'un modèle par défaut. Une alternative mieux accordée au style vaut mieux, sauf si votre charte l'impose.`,
    consigne: `Police « ${f} » dans la liste trop-vues de references/styles/polices.json : proposer une alternative (pulse-motion styles polices <style de base>) ; si la charte de la personne l'impose, noter le changement avec --charte en nommant la police (l'avis est levé).`,
  }));
}

/** Familles des styles livrés : { style: [familles] }. */
function policesDesLivres(dossierStyles = path.join(RACINE, 'styles')) {
  const r = {};
  for (const s of fs.readdirSync(dossierStyles).sort()) {
    const d = path.join(dossierStyles, s);
    if (fs.existsSync(path.join(d, 'identite.json'))) r[s] = policesDuStyle(d);
  }
  return r;
}

/**
 * Règles d'un style nouveau (5.5 points 2 et 3) : aucune police trop vue ; au moins une police qu'au plus 2 autres styles
 * livrés utilisent. -> [messages]
 */
function reglesStyleNouveau(nom, dossierStyles = path.join(RACINE, 'styles')) {
  const tous = policesDesLivres(dossierStyles);
  const siennes = tous[nom] || [];
  const r = [];
  const trop = new Set((lirePolices()['trop-vues'] || []).map(cle));
  for (const f of siennes) if (trop.has(cle(f))) r.push(`Style « ${nom} » : la police « ${f} » est dans la liste trop-vues de references/styles/polices.json.`);
  const autres = (f) => Object.entries(tous).filter(([s, l]) => s !== nom && l.some((x) => cle(x) === cle(f))).length;
  if (siennes.length && !siennes.some((f) => autres(f) <= 2)) {
    r.push(`Style « ${nom} » : chacune de ses polices (${siennes.map((f) => `${f}, ${autres(f)} autres styles`).join(' ; ')}) est déjà prise par plus de 2 autres styles livrés ; en choisir au moins une plus rare.`);
  }
  return r;
}

/** Polices d'un style et ses deux alternatives ; un style personnel reçoit celles de sa base. */
function alternativesPolices(nom) {
  const j = lirePolices();
  const tropVues = j['trop-vues'] || [];
  if (j.styles && j.styles[nom]) return { style: nom, ...j.styles[nom], tropVues };
  const { trouverStyle } = require('../styles.js');
  const st = trouverStyle(nom);
  if (!st) return null;
  const identite = lireJSON(path.join(st.dossier, 'identite.json')) || {};
  const base = identite.base && identite.base.style;
  const typo = identite.typographie || {};
  const titres = typo.titres && typo.titres.famille;
  const texte = typo.texte && typo.texte.famille;
  return { style: nom, titres: titres || null, texte: texte || null, alternatives: base && j.styles[base] ? j.styles[base].alternatives : [], ...(base ? { base } : {}), tropVues };
}

module.exports = { FICHIER, lirePolices, policesDuStyle, policeTropVue, imposeeParLaCharte, policesDesLivres, reglesStyleNouveau, alternativesPolices };
