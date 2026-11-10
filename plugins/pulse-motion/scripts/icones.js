#!/usr/bin/env node
'use strict';
/* Pulse Motion – icônes Lucide embarquées (spec S9, 5.3) : chercher par un mot français, afficher le SVG, faire choisir sur
 * une planche.
 *
 *   node scripts/icones.js chercher <mots…> [--json]     nom exact, puis mot-clé français, puis étiquette anglaise ; 12 au plus
 *   node scripts/icones.js afficher <nom> [--json]        le SVG tel que l'assemblage l'écrit dans la page
 *   node scripts/icones.js planche <nom1,nom2…> [--dossier <d>] [--sortie <fichier.png>] [--ouvrir]
 *                                     image PNG en grille, chaque icône avec son nom (Chrome ou Edge sans fenêtre) ; dans
 *                                     un projet : sortie/icones/planche.png
 *
 * Dans une scène : <svg data-icone="truck" class="…"></svg> (references/icones.md). Code 1 si rien n'est trouvé.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const I = require('./lib/icones.js');

const CELLULE = 168, ICONE = 72, MARGE = 24;
const SANS_NAVIGATEUR = 'Chrome ou Edge introuvable : la planche se dessine dans un navigateur. Lancez « pulse-motion outils » pour voir quoi installer.';
const USAGE = 'Usage : pulse-motion icones chercher <mots…> | afficher <nom> | planche <nom1,nom2…> [--dossier <d>] [--sortie <fichier.png>] [--ouvrir]  [--json]';

const echapper = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Page de la planche : une cellule par icône (dessin, nom, premier mot-clé français). -> { html, largeur, hauteur } */
function pagePlanche(noms) {
  const colonnes = Math.min(6, noms.length);
  const lignes = Math.ceil(noms.length / colonnes);
  const largeur = MARGE * 2 + colonnes * CELLULE;
  const hauteur = MARGE * 2 + lignes * CELLULE;
  const cellules = noms.map((nom) => {
    const mot = I.motsFrancais(nom)[0];
    return `<div class="c">${I.svgIcone(nom)}<b>${echapper(nom)}</b><i>${mot ? echapper(mot) : '&nbsp;'}</i></div>`;
  }).join('');
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Icônes</title>
<style>html,body{margin:0;background:#1C1923}
main{display:grid;grid-template-columns:repeat(${colonnes},${CELLULE}px);padding:${MARGE}px;width:max-content}
.c{height:${CELLULE}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#F2EFF7}
.c svg{width:${ICONE}px;height:${ICONE}px}
b,i{font:500 14px system-ui,sans-serif;color:#C9C3D6;font-style:normal;max-width:${CELLULE - 12}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
i{font-size:12px;color:#A19BAF}</style></head>
<body><main>${cellules}</main><script>window.__planche = ${noms.length};</script></body></html>
`;
  return { html, largeur, hauteur };
}

async function rendrePlanche({ noms, sortie, navigateur }) {
  const nav = navigateur === undefined ? require('./lib/navigateur.js').trouverNavigateur() : navigateur;
  if (!nav) throw new Error(SANS_NAVIGATEUR);
  const { html, largeur, hauteur } = pagePlanche(noms);
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-planche-icones-'));
  let page = null;
  try {
    const fichierPage = path.join(dossier, 'planche.html');
    fs.writeFileSync(fichierPage, html, 'utf8');
    const { ouvrirPage } = require('./lib/cdp.js');
    page = await ouvrirPage({ navigateur: nav, largeur, hauteur });
    await page.aller(pathToFileURL(fichierPage).href);
    if (!(await page.evaluer('window.__planche || 0'))) throw new Error('Planche des icônes : la page ne s\'est pas dessinée.');
    const png = await page.capturer();
    fs.mkdirSync(path.dirname(sortie), { recursive: true });
    fs.writeFileSync(sortie, png);
    return { fichier: sortie, largeur, hauteur, icones: noms.length };
  } finally {
    if (page) await page.fermer();
    fs.rmSync(dossier, { recursive: true, force: true });
  }
}

const inconnue = (nom) => {
  const p = I.nomsProches(nom);
  return `Icône « ${nom} » inconnue${p.length ? ` ; noms proches : ${p.join(', ')}` : ''}. Essayez : pulse-motion icones chercher <mot>`;
};

async function principal(args) {
  const json = args.includes('--json');
  const AVEC_VALEUR = ['--dossier', '--sortie'];
  const valeur = (o) => { const k = args.indexOf(o); return k >= 0 ? args[k + 1] : undefined; };
  const libres = args.filter((a, k) => a !== '--json' && !a.startsWith('--') && !AVEC_VALEUR.includes(args[k - 1]));
  const [commande, ...mots] = libres;
  const ecrire = (v, texte) => console.log(json ? JSON.stringify(v, null, 2) : texte);
  if (commande === 'chercher' && mots.length) {
    const r = I.chercher(mots);
    if (!r.length) { console.error(`Aucune icône pour « ${mots.join(' ')} ». Essayez un autre mot, en français ou en anglais.`); return 1; }
    ecrire(r.map((x) => ({ ...x, motsCles: I.motsFrancais(x.nom) })),
      r.map((x) => { const fr = I.motsFrancais(x.nom).slice(0, 4); return `${x.nom} (${x.raison})${fr.length ? ` : ${fr.join(', ')}` : ''}`; }).join('\n'));
    return 0;
  }
  if (commande === 'afficher' && mots.length === 1) {
    const svg = I.svgIcone(mots[0]);
    if (!svg) { console.error(inconnue(mots[0])); return 1; }
    ecrire({ nom: I.resoudre(mots[0]), demande: mots[0], svg, motsCles: I.motsFrancais(mots[0]) }, svg);
    return 0;
  }
  if (commande === 'planche' && mots.length) {
    const noms = [...new Set(mots.join(',').split(',').map((n) => n.trim()).filter(Boolean))];
    const inconnues = noms.filter((n) => !I.existe(n));
    if (inconnues.length) { console.error(inconnues.map(inconnue).join('\n')); return 1; }
    if (noms.length > 48) { console.error('Planche des icônes : 48 icônes au plus.'); return 2; }
    const dossier = valeur('--dossier') || '.';
    const defaut = fs.existsSync(path.join(dossier, 'deroule.json')) ? path.join(dossier, 'sortie', 'icones', 'planche.png') : path.join(os.tmpdir(), 'pm-icones', 'planche.png');
    try {
      const r = await rendrePlanche({ noms, sortie: path.resolve(valeur('--sortie') || defaut) });
      if (args.includes('--ouvrir')) require('./apercu.js').ouvrirNavigateur(r.fichier);
      ecrire(r, `Planche : ${r.fichier}`);
      return 0;
    } catch (e) {
      console.error(e.message);
      return 1;
    }
  }
  console.error(USAGE);
  return 2;
}

if (require.main === module) principal(process.argv.slice(2)).then((code) => { process.exitCode = code; });

module.exports = { principal, pagePlanche, rendrePlanche };
