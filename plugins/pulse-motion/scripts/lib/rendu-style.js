'use strict';
/* Pulse Motion – rendu d'un style dans le navigateur (Chrome ou Edge sans fenêtre), au maximum de texte :
 * polices chargées, aucun débordement, aucune erreur du moteur, en 16:9, 1:1 et 9:16, et dans chaque ton. */
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../assembler.js');
const { rendreDOM, trouverNavigateur } = require('./navigateur.js');
const { projetEssai } = require('./projet-essai.js');

const FORMATS = ['16:9', '1:1', '9:16'];
const SYSTEME = new Set(['system-ui', 'sans-serif', 'serif', 'monospace']);
const lireJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };

async function rendreUnEssai({ dossierStyle, ratio, ton, navigateur, dossierStyles }) {
  const dir = projetEssai({ dossierStyle, ratio, ton });
  try {
    const { html, erreurs } = assembler({ dossier: dir, dossierStyles, ecrire: false });
    if (!html) return erreurs.map((e) => e.message);
    const familles = [...new Set(Object.values(lireJSON(path.join(dossierStyle, 'charte.json')).polices || {}).filter((f) => typeof f === 'string' && !SYSTEME.has(f)))];
    const verification = `<script>M.pret.then(function () { return document.fonts.ready; }).then(function () {
      var chargees = []; document.fonts.forEach(function (f) { if (f.status === 'loaded') chargees.push(f.family.replace(/["']/g, '')); });
      var r = { debordements: M.detecterDebordements().map(function (d) { return d.message; }), erreurs: M.erreurs.map(function (e) { return e.message || String(e); }),
        polices: ${JSON.stringify(familles)}.filter(function (f) { return chargees.indexOf(f) < 0; }) };
      var pre = document.createElement('pre'); pre.id = 'verification'; pre.textContent = JSON.stringify(r); document.body.appendChild(pre);
    });</script>`;
    const fichier = path.join(dir, 'verification.html');
    fs.writeFileSync(fichier, html.replace('</body>', `${verification}\n</body>`));
    let dom;
    try { dom = await rendreDOM(navigateur, fichier); } catch (e) { return [`le navigateur n'a pas pu afficher la page (${e.message})`]; }
    const m = /<pre id="verification">([^<]*)<\/pre>/.exec(dom);
    if (!m) return ['la page ne s\'est pas affichée dans le navigateur'];
    const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    return [...erreurs.map((e) => e.message), ...r.erreurs, ...r.debordements, ...r.polices.map((f) => `police « ${f} » non chargée`)];
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** -> { ok: true | false | null, problemes, message? } ; ok null : navigateur absent, rendu non vérifié. */
async function verifierRendu({ dossierStyle, navigateur = trouverNavigateur(), dossierStyles }) {
  if (!navigateur) return { ok: null, problemes: [], message: 'Chrome ou Edge introuvable : le rendu (débordements, polices) n\'a pas été vérifié. Installez l\'un des deux, ou indiquez son chemin avec la variable PM_NAVIGATEUR.' };
  const tons = ((lireJSON(path.join(dossierStyle, 'identite.json')).couleur || {}).tons) || ['clair'];
  const essais = [...FORMATS.map((ratio) => ({ ratio })), ...(tons.length > 1 ? tons.map((ton) => ({ ratio: '16:9', ton })) : [])];
  const resultats = await Promise.all(essais.map((e) => rendreUnEssai({ dossierStyle, navigateur, dossierStyles, ...e })));
  const problemes = resultats.flatMap((liste, i) => liste.map((m) => `${essais[i].ratio}${essais[i].ton ? ` (ton ${essais[i].ton})` : ''} : ${m}`));
  return { ok: problemes.length === 0, problemes };
}

module.exports = { verifierRendu, FORMATS };
