#!/usr/bin/env node
'use strict';
/* Pulse Motion – cartes géographiques (spec S9, 5.10) : chercher un lieu, préparer la caméra sur un pays, faire choisir sur une
 * planche. Fonds de carte : cartes/ du plugin (Natural Earth, domaine public), jamais de tuile ni de service en ligne.
 *
 *   node scripts/cartes.js chercher <mots…> [--json]        pays, régions françaises et villes, sans accents ni casse
 *   node scripts/cartes.js afficher <carte> <lieu> [--cadre auto|monde|<code>|europe|afrique|ameriques|asie|oceanie]
 *                          [--pays FR,DE] [--ratio 16:9] [--json]
 *        centre du lieu en % de l'image et zoom conseillé, pour une carte qui couvre toute l'image, avec la clause data-camera
 *        à recopier ; lieu : code ou nom d'un pays (d'une région), nom d'une ville, ou « latitude,longitude ».
 *   node scripts/cartes.js planche <carte> [--pays FR,DE] [--cadre …] [--dossier <d>] [--sortie <fichier.png>] [--ouvrir]
 *        image PNG de la carte (Chrome ou Edge sans fenêtre), pays listés en couleur, codes écrits ; dans un projet :
 *        sortie/cartes/planche.png
 *
 * Dans une scène : <svg data-carte="monde" data-carte-pays="FR,DE" data-carte-cadre="auto"> (references/cartes.md).
 * Code 1 si rien n'est trouvé ou si un fond manque (installation incomplète).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const C = require('./lib/cartes.js');
const K = require('../moteur/cartes.js');

const USAGE = 'Usage : pulse-motion cartes chercher <mots…> | afficher <carte> <lieu> [--cadre c] [--pays FR,DE] [--ratio 16:9] | planche <carte> [--pays FR,DE] [--cadre c] [--dossier <d>] [--sortie <fichier.png>] [--ouvrir]  [--json]';
const SANS_NAVIGATEUR = 'Chrome ou Edge introuvable : la planche se dessine dans un navigateur. Lancez « pulse-motion outils » pour voir quoi installer.';
const LARGEUR = 1280;

const pasDeDonnees = () => `Les cartes ne sont pas utilisables : ${C.SANS_DONNEES}.`;

function carteOuErreur(nom) {
  if (!C.cartesConnues().includes(nom)) return { erreur: `Carte « ${nom} » inconnue : ${C.cartesConnues().join(' ou ')}.` };
  const carte = C.chargerCarte(nom);
  if (!carte) return { erreur: pasDeDonnees() };
  return { carte };
}

/** Cadre de la scène, comme l'assemblage le calcule : zones listées et lieux ajoutés. */
function cadreScene(carte, { cadre, pays, lieux = [] }) {
  const zones = String(pays || '').split(',').map((s) => s.trim()).filter(Boolean).map((v) => {
    const z = C.resoudreLieu(carte, v, null);
    return z.ok && z.boite ? { boite: z.boite } : null;
  }).filter(Boolean);
  return C.cadreDe({ carte, cadre: cadre || 'auto', zones, points: lieux });
}

function afficher(nom, lieu, { cadre, pays, ratio = '16:9' }) {
  const { carte, erreur } = carteOuErreur(nom);
  if (erreur) return { ok: false, message: erreur };
  const r = C.resoudreLieu(carte, lieu, C.chargerVilles());
  if (!r.ok) return { ok: false, message: `Carte « ${nom} » : ${r.message}` };
  const c = cadreScene(carte, { cadre, pays, lieux: [r] });
  if (c.erreur) return { ok: false, message: c.erreur };
  const vb = C.viewBoxDe(c.boite);
  const autour = carte.largeur * 0.02;
  const boite = r.boite || [r.x - autour, r.y - autour, r.x + autour, r.y + autour];
  const cam = K.versCamera(boite, vb, ratio);
  return { ok: true, carte: nom, lieu: r.nom, point: { x: r.x, y: r.y }, viewBox: vb.join(' '), centre: { x: cam.x, y: cam.y }, zoom: cam.zoom,
    camera: `zoom 1→${cam.zoom} 0+1.5; x 50→${cam.x} 0+1.5; y 50→${cam.y} 0+1.5`,
    note: 'Pour une carte qui couvre toute l\'image (position absolute, inset 0, 100 % × 100 %) ; recopier la clause dans data-camera du conteneur.' };
}

/** Page de la planche : la carte assemblée comme dans une vidéo, codes des pays listés à leur centre. */
function pagePlanche(nom, { pays, cadre }) {
  const { carte, erreur } = carteOuErreur(nom);
  if (erreur) return { erreur };
  const codes = String(pays || '').split(',').map((s) => s.trim()).filter(Boolean);
  const attrs = `data-carte="${nom}"${codes.length ? ` data-carte-pays="${codes.join(',')}"` : ''}${cadre ? ` data-carte-cadre="${cadre}"` : ''}`;
  const etiquettes = codes.map((v) => {
    const r = C.resoudreLieu(carte, v, null);
    return r.ok ? `<text x="${r.x}" y="${r.y}" dominant-baseline="middle">${String(v).toUpperCase()}</text>` : '';
  }).join('');
  const r = C.preparerCartes(`<svg ${attrs} style="width: 100%; height: 100%">${etiquettes}</svg>`, { scene: 'planche' });
  if (r.erreurs.length) return { erreur: r.erreurs.map((e) => e.message).join('\n') };
  const vb = /viewBox="([^"]+)"/.exec(r.html)[1].split(' ').map(Number);
  const hauteur = Math.max(200, Math.min(1600, Math.round(LARGEUR * vb[3] / vb[2])));
  const css = fs.readFileSync(path.join(__dirname, '..', 'moteur', 'cartes.css'), 'utf8');
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Carte</title>
<style>html,body{margin:0;background:#ffffff}
#pm-scene{--c-fond:#ffffff;--c-texte:#1c1923;--c-primaire-lisible:#1f6feb;--c-accent-lisible:#c2410c;--f-texte:system-ui,sans-serif;width:${LARGEUR}px;height:${hauteur}px;color:#1c1923}
${css}
#pm-scene .pm-carte text{fill:#ffffff;font-weight:700;paint-order:stroke;stroke:#1c1923;stroke-width:calc(var(--pm-u) * 0.3)}</style></head>
<body><div id="pm-scene">${r.html}</div><script>window.__planche = 1;</script></body></html>
`;
  return { html, largeur: LARGEUR, hauteur };
}

async function rendrePlanche({ nom, pays, cadre, sortie, navigateur }) {
  const p = pagePlanche(nom, { pays, cadre });
  if (p.erreur) throw new Error(p.erreur);
  const nav = navigateur === undefined ? require('./lib/navigateur.js').trouverNavigateur() : navigateur;
  if (!nav) throw new Error(SANS_NAVIGATEUR);
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-planche-carte-'));
  let page = null;
  try {
    const fichierPage = path.join(dossier, 'planche.html');
    fs.writeFileSync(fichierPage, p.html, 'utf8');
    const { ouvrirPage } = require('./lib/cdp.js');
    page = await ouvrirPage({ navigateur: nav, largeur: p.largeur, hauteur: p.hauteur });
    await page.aller(pathToFileURL(fichierPage).href);
    if (!(await page.evaluer('window.__planche || 0'))) throw new Error('Planche de la carte : la page ne s\'est pas dessinée.');
    const png = await page.capturer();
    fs.mkdirSync(path.dirname(sortie), { recursive: true });
    fs.writeFileSync(sortie, png);
    return { fichier: sortie, largeur: p.largeur, hauteur: p.hauteur };
  } finally {
    if (page) await page.fermer();
    fs.rmSync(dossier, { recursive: true, force: true });
  }
}

async function principal(args) {
  const json = args.includes('--json');
  const AVEC_VALEUR = ['--dossier', '--sortie', '--cadre', '--pays', '--ratio'];
  const valeur = (o) => { const k = args.indexOf(o); return k >= 0 ? args[k + 1] : undefined; };
  const libres = args.filter((a, k) => a !== '--json' && !a.startsWith('--') && !AVEC_VALEUR.includes(args[k - 1]));
  const [commande, ...mots] = libres;
  const ecrire = (v, texte) => console.log(json ? JSON.stringify(v, null, 2) : texte);
  if (commande === 'chercher' && mots.length) {
    if (!C.donneesPresentes()) { console.error(pasDeDonnees()); return 1; }
    const r = C.chercher(mots.join(' '));
    if (!r.resultats.length) {
      console.error(`Aucun lieu pour « ${mots.join(' ')} »${r.proches.length ? ` ; vouliez-vous dire ${r.proches.map((p) => `« ${p} »`).join(', ')} ?` : ''}. Un lieu absent se donne par ses coordonnées (latitude,longitude).`);
      return 1;
    }
    ecrire(r.resultats, r.resultats.map((x) => (x.sorte === 'ville' ? `ville : ${x.nom} (${x.pays}, ${x.lat}, ${x.lon})${x.chefLieu ? `, chef-lieu de ${x.chefLieu}` : ''}` : `${x.sorte === 'region' ? 'région' : 'pays'} : ${x.code} ${x.nom} (carte ${x.carte})`)).join('\n'));
    return 0;
  }
  if (commande === 'afficher' && mots.length >= 2) {
    const r = afficher(mots[0], mots.slice(1).join(' '), { cadre: valeur('--cadre'), pays: valeur('--pays'), ratio: valeur('--ratio') || '16:9' });
    if (!r.ok) { console.error(r.message); return 1; }
    ecrire(r, `${r.lieu} : centre à ${r.centre.x} % × ${r.centre.y} % de l'image, zoom ${r.zoom}\ndata-camera="${r.camera}"`);
    return 0;
  }
  if (commande === 'planche' && mots.length === 1) {
    const dossier = valeur('--dossier') || '.';
    const defaut = fs.existsSync(path.join(dossier, 'deroule.json')) ? path.join(dossier, 'sortie', 'cartes', 'planche.png') : path.join(os.tmpdir(), 'pm-cartes', 'planche.png');
    try {
      const r = await rendrePlanche({ nom: mots[0], pays: valeur('--pays'), cadre: valeur('--cadre'), sortie: path.resolve(valeur('--sortie') || defaut) });
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

module.exports = { principal, afficher, pagePlanche, rendrePlanche };
