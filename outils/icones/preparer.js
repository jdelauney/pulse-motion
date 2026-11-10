#!/usr/bin/env node
'use strict';
/* Pulse Motion – outil du mainteneur (hors du plugin installé) : prépare les icônes Lucide embarquées dans
 * plugins/pulse-motion/vendor/lucide/ à partir d'un paquet lucide-static téléchargé à la main (spec S9, 5.3).
 *
 *   npm pack lucide-static@<version>     (dans un dossier vide, hors du dépôt), puis tar -xzf du paquet
 *   node outils/icones/preparer.js <dossier du paquet lucide-static> [--sortie <dossier>]
 *
 * Écrit icones.json ({ version, icones: { nom: [chemin] }, alias: { ancien: nom } } ; chaque forme devient un chemin `d`
 * dans la boîte 24 × 24 ; un point plein de Lucide (fill="currentColor") devient { d, plein: true }), etiquettes.json
 * (étiquettes anglaises de Lucide) et LICENSE (ISC de Lucide, avec la partie MIT de Feather). PROVENANCE.md s'écrit à la main.
 * Adapté de scripts/build-icons.mjs d'explainroo (MIT, © 2026 Vincent Schmalbach) : mêmes conversions des formes, alias
 * trouvés par le même dessin. Node pur, aucun réseau.
 */
const fs = require('node:fs');
const path = require('node:path');

const n = (v) => Number(v ?? 0);
const r3 = (v) => Math.round(v * 1000) / 1000;

function ellipse(cx, cy, rx, ry) {
  return `M${r3(cx - rx)} ${r3(cy)}a${r3(rx)} ${r3(ry)} 0 1 0 ${r3(2 * rx)} 0a${r3(rx)} ${r3(ry)} 0 1 0 ${r3(-2 * rx)} 0`;
}

function rectangle(x, y, w, h, rx, ry) {
  if (!rx && !ry) return `M${x} ${y}h${w}v${h}h${-w}Z`;
  rx = Math.min(rx || ry, w / 2);
  ry = Math.min(ry || rx, h / 2);
  return `M${r3(x + rx)} ${y}h${r3(w - 2 * rx)}a${rx} ${ry} 0 0 1 ${rx} ${ry}v${r3(h - 2 * ry)}a${rx} ${ry} 0 0 1 ${-rx} ${ry}`
    + `h${r3(-(w - 2 * rx))}a${rx} ${ry} 0 0 1 ${-rx} ${-ry}v${r3(-(h - 2 * ry))}a${rx} ${ry} 0 0 1 ${rx} ${-ry}Z`;
}

function points(liste, fermer) {
  const p = String(liste).trim().split(/[\s,]+/).map(Number);
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
  return fermer ? `${d}Z` : d;
}

/** Forme de Lucide ([balise, attributs]) -> chemin `d`, ou { d, plein: true } pour un point plein. */
function enChemin([balise, a]) {
  let d;
  switch (balise) {
    case 'path': d = a.d; break;
    case 'circle': d = ellipse(n(a.cx), n(a.cy), n(a.r), n(a.r)); break;
    case 'ellipse': d = ellipse(n(a.cx), n(a.cy), n(a.rx), n(a.ry)); break;
    case 'rect': d = rectangle(n(a.x), n(a.y), n(a.width), n(a.height), n(a.rx), n(a.ry)); break;
    case 'line': d = `M${n(a.x1)} ${n(a.y1)}L${n(a.x2)} ${n(a.y2)}`; break;
    case 'polyline': d = points(a.points, false); break;
    case 'polygon': d = points(a.points, true); break;
    default: throw new Error(`forme de Lucide inconnue : <${balise}>`);
  }
  if (a.fill && a.fill !== 'none') {
    if (a.fill !== 'currentColor') throw new Error(`remplissage inattendu « ${a.fill} » (<${balise}>)`);
    return { d, plein: true };
  }
  return d;
}

/** Paquet lucide-static décompressé -> { version, icones, alias, etiquettes, licence } */
function preparer(dossier) {
  const lire = (f) => fs.readFileSync(path.join(dossier, f), 'utf8');
  const noeuds = JSON.parse(lire('icon-nodes.json'));
  const tags = JSON.parse(lire('tags.json'));
  const version = JSON.parse(lire('package.json')).version;
  const icones = {};
  for (const nom of Object.keys(noeuds).sort()) icones[nom] = noeuds[nom].map(enChemin);
  // Les noms anciens ou de rechange sont livrés en fichiers SVG au même dessin.
  const corps = (svg) => svg.replace(/<!--[\s\S]*?-->/g, '').replace(/<svg[^>]*>/, '').replace('</svg>', '').replace(/\s+/g, ' ').trim();
  const parCorps = new Map();
  const dossierIcones = path.join(dossier, 'icons');
  for (const nom of Object.keys(icones)) {
    const f = path.join(dossierIcones, `${nom}.svg`);
    if (fs.existsSync(f)) parCorps.set(corps(fs.readFileSync(f, 'utf8')), nom);
  }
  const alias = {};
  for (const f of fs.readdirSync(dossierIcones).sort()) {
    const nom = f.replace(/\.svg$/, '');
    if (icones[nom]) continue;
    const cible = parCorps.get(corps(fs.readFileSync(path.join(dossierIcones, f), 'utf8')));
    if (cible) alias[nom] = cible;
  }
  const etiquettes = {};
  for (const nom of Object.keys(icones)) etiquettes[nom] = tags[nom] || [];
  return { version, icones, alias, etiquettes, licence: lire('LICENSE') };
}

function principal(args) {
  const k = args.indexOf('--sortie');
  const sortie = k >= 0 ? args[k + 1] : path.join(__dirname, '..', '..', 'plugins', 'pulse-motion', 'vendor', 'lucide');
  const source = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--sortie');
  if (!source || !sortie) {
    console.error('Usage : node outils/icones/preparer.js <dossier du paquet lucide-static> [--sortie <dossier>]');
    return 2;
  }
  const r = preparer(source);
  fs.mkdirSync(sortie, { recursive: true });
  fs.writeFileSync(path.join(sortie, 'icones.json'), `${JSON.stringify({ version: r.version, icones: r.icones, alias: r.alias })}\n`);
  fs.writeFileSync(path.join(sortie, 'etiquettes.json'), `${JSON.stringify(r.etiquettes)}\n`);
  fs.writeFileSync(path.join(sortie, 'LICENSE'), r.licence);
  console.log(`${Object.keys(r.icones).length} icônes et ${Object.keys(r.alias).length} alias (lucide-static ${r.version}) dans ${sortie}`);
  return 0;
}

if (require.main === module) process.exit(principal(process.argv.slice(2)));

module.exports = { enChemin, preparer };
