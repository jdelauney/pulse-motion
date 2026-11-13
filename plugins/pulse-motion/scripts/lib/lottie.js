'use strict';
/* Pulse Motion – animations Lottie côté Node (spec S9, 5.11) : lecture d'un fichier .json ou d'une archive .lottie (sans
 * dépendance : lib/zip.js), import dans assets/lottie/, recoloration à l'assemblage et contrôles. Le lecteur de la page est
 * moteur/lottie.js (groupe « lottie » du moteur à la carte).
 *
 * lireLottie(fichier) -> { ok, anim, octets } | { ok: false, message } : une archive .lottie est ouverte (manifest.json, première
 *   animation de animations/) et ses images de images/ sont embarquées en data: dans l'animation.
 * importer({ projet, fichier, nom?, source?, licence?, auteur? }) -> rapport : copie dans assets/lottie/<nom>.json (le JSON
 *   d'origine tel quel ; celui d'une archive, extrait), source et licence dans assets/lottie/<nom>.licence.json et dans
 *   assets/sources.json (crédits) ; durée, cadence, taille, couleurs, avertissements.
 * recolorer(anim, correspondances) -> copie recolorée : chaque couleur de remplissage, de contour, de dégradé ou de solide égale
 *   à ± 8 sur 255 par composante (TOLERANCE) à une couleur source prend la couleur cible.
 * preparerLotties(html, { scene, projet, couleurs, blocs, dureeScene? }) -> { html, erreurs, fichiers } : data-lottie
 *   désigne le bloc JSON de la page (blocs : Map partagée par les scènes, un bloc par fichier et par recoloration) ; règles
 *   lottie-invalide, lottie-image-externe, lottie-lourd (erreurs), lottie-expressions, lottie-texte, lottie-non-pris,
 *   lottie-lourd, lottie-trop-court (alertes), fichier-introuvable, chemin-hors-projet, fichier-non-pris-en-charge.
 */
const fs = require('node:fs');
const path = require('node:path');
const { cheminDansProjet } = require('./embarquer.js');
const { lireZip } = require('./zip.js');
const { ecrireAtomique } = require('./fichiers.js');
const L = require('../../moteur/lottie.js');
const { normaliser } = require('../../moteur/proches.js');
const SEUILS = require('../seuils.json');

const TOLERANCE = 8;
const NOM = /^[a-z0-9][a-z0-9-]{0,63}$/;
const IMAGES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif' };
const virgule = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
const rel = (projet, f) => path.relative(projet, f).split(path.sep).join('/');
// JSON dans un <script> : « < » écrit en échappement Unicode (jamais de fin de bloc dans les données).
const ECHAPPE_INF = String.fromCharCode(92) + 'u003c';
const jsonDansHTML = (o) => JSON.stringify(o).replace(/</g, ECHAPPE_INF);

function estLottie(a) {
  return !!(a && typeof a === 'object' && Array.isArray(a.layers) && typeof a.fr === 'number' && typeof a.op === 'number' && typeof a.w === 'number' && typeof a.h === 'number');
}

function lireArchive(octets) {
  const entrees = lireZip(octets, { maxEntrees: 2000, maxOctets: 64 * 1024 * 1024 });
  const parNom = new Map(entrees.map((e) => [e.nom.replace(/^\.?\//, ''), e.donnees]));
  let cible = null;
  const manifeste = parNom.get('manifest.json');
  if (manifeste) {
    try {
      const m = JSON.parse(manifeste.toString('utf8'));
      const premiere = Array.isArray(m.animations) && m.animations[0];
      if (premiere && premiere.id) cible = [`animations/${premiere.id}.json`, `a/${premiere.id}.json`].find((n) => parNom.has(n)) || null;
    } catch { /* manifeste illisible : première animation trouvée */ }
  }
  if (!cible) cible = [...parNom.keys()].filter((n) => /^(animations|a)\/[^/]+\.json$/.test(n)).sort()[0] || null;
  if (!cible) throw new Error('archive .lottie sans animation (dossier animations/)');
  const anim = JSON.parse(parNom.get(cible).toString('utf8'));
  // Images de l'archive (images/ ou i/) : embarquées en data: dans l'animation.
  for (const a of anim.assets || []) {
    if (!a || a.p === undefined || /^data:/.test(String(a.p))) continue;
    const nomImage = String(a.p).split('/').pop();
    const fichier = ['images/', 'i/'].map((d) => d + nomImage).find((n) => parNom.has(n));
    const mime = IMAGES[path.extname(nomImage).toLowerCase()];
    if (!fichier || !mime) continue;
    a.p = `data:${mime};base64,${parNom.get(fichier).toString('base64')}`;
    a.u = '';
    a.e = 1;
  }
  return { anim, octets: Buffer.from(JSON.stringify(anim), 'utf8') };
}

function lireLottie(fichier) {
  const ext = path.extname(fichier).toLowerCase();
  if (ext !== '.json' && ext !== '.lottie') return { ok: false, message: `« ${path.basename(fichier)} » : une animation Lottie est un fichier .json ou .lottie.` };
  let octets;
  try { octets = fs.readFileSync(fichier); } catch { return { ok: false, message: `Fichier introuvable : « ${fichier} ».` }; }
  try {
    if (ext === '.lottie') {
      const r = lireArchive(octets);
      if (!estLottie(r.anim)) return { ok: false, message: `« ${path.basename(fichier)} » : l'archive ne contient pas d'animation Lottie lisible.` };
      return { ok: true, anim: r.anim, octets: r.octets, archive: true };
    }
    const texte = octets.toString('utf8');
    const anim = JSON.parse(texte.charCodeAt(0) === 0xfeff ? texte.slice(1) : texte);
    if (!estLottie(anim)) return { ok: false, message: `« ${path.basename(fichier)} » : ce JSON n'est pas une animation Lottie (calques, cadence, durée et taille attendus).` };
    return { ok: true, anim, octets };
  } catch (e) {
    return { ok: false, message: `« ${path.basename(fichier)} » illisible (${e.zip ? e.message : 'JSON invalide'}).` };
  }
}

/** Avertissements en français d'une analyse (moteur/lottie.js, analyserLottie) et d'un poids en octets. */
function avertissements(a, octets) {
  const liste = [];
  const ko = octets / 1024;
  if (a.imagesExternes.length) liste.push({ regle: 'lottie-image-externe', gravite: 'erreur', message: `${a.imagesExternes.length} image${a.imagesExternes.length > 1 ? 's' : ''} de l'animation ne ${a.imagesExternes.length > 1 ? 'sont' : 'est'} pas dans le fichier (${a.imagesExternes.slice(0, 3).join(', ')}) : il faut un fichier Lottie aux images incluses, ou l'archive .lottie.` });
  if (a.expressions) liste.push({ regle: 'lottie-expressions', gravite: 'alerte', message: 'Certaines parties de cette animation ne bougeront pas : elles dépendent d\'expressions, que le lecteur ne calcule pas.' });
  if (a.textes) liste.push({ regle: 'lottie-texte', gravite: 'alerte', message: `L'animation contient ${a.textes} calque${a.textes > 1 ? 's' : ''} de texte, qui ne s'afficheront pas : écrire ces textes dans la scène, avec les polices de la vidéo.` });
  if (a.nonPris.length) liste.push({ regle: 'lottie-non-pris', gravite: 'alerte', message: `Certaines parties de cette animation ne seront pas dessinées (${a.nonPris.join(', ')}) : vérifier sur les planches.` });
  if (ko > SEUILS.lottieLourdErreurMo * 1024) liste.push({ regle: 'lottie-lourd', gravite: 'erreur', message: `L'animation pèse ${virgule(ko / 1024)} Mo (plus de ${SEUILS.lottieLourdErreurMo} Mo) : la page serait trop lente ; choisir une animation plus simple.` });
  else if (ko > SEUILS.lottieLourdAlerteKo) liste.push({ regle: 'lottie-lourd', gravite: 'alerte', message: `L'animation pèse ${Math.round(ko)} Ko (plus de ${SEUILS.lottieLourdAlerteKo} Ko) : la page sera plus longue à ouvrir.` });
  return liste;
}

function importer({ projet, fichier, nom, source, licence, auteur }) {
  const dossier = path.resolve(projet || '.');
  if (!fichier) return { ok: false, message: 'Usage : pulse-motion lottie importer <fichier.json|.lottie> [--nom fusee] [--source "<d\'où il vient>"] [--licence "<licence>"] [--auteur "<auteur>"] [dossier]' };
  const absolu = path.resolve(dossier, fichier);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(String(fichier)) || /^www\./i.test(String(fichier))) {
    return { ok: false, message: 'Je ne télécharge pas d\'animation : enregistrez le fichier Lottie dans le dossier de la vidéo, si vous en avez le droit.' };
  }
  const lu = lireLottie(absolu);
  if (!lu.ok) return lu;
  const n = nom || normaliser(path.basename(absolu, path.extname(absolu))).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'animation';
  if (!NOM.test(n)) return { ok: false, message: `« ${n} » : un nom en a-z, 0-9 et tirets.` };
  const cible = path.join(dossier, 'assets', 'lottie', `${n}.json`);
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  if (path.resolve(cible) !== absolu) fs.writeFileSync(cible, lu.octets);
  const s = String(source || '').trim(), l = String(licence || '').trim(), a = String(auteur || '').trim();
  const fiche = { fichier: path.basename(absolu), source: s || 'à préciser', licence: l || 'à préciser', ...(a ? { auteur: a } : {}) };
  ecrireAtomique(path.join(dossier, 'assets', 'lottie', `${n}.licence.json`), `${JSON.stringify(fiche, null, 2)}\n`);
  const relatif = rel(dossier, cible);
  if (s && l) require('./livrables.js').noterSource({ projet: dossier, fichier: relatif, source: s, licence: l, auteur: a });
  const analyse = L.analyserLottie(lu.anim);
  return {
    ok: true, fichier: relatif, nom: n, duree: analyse.duree, ips: analyse.ips, images: analyse.images, largeur: analyse.largeur, hauteur: analyse.hauteur,
    couleurs: analyse.couleurs.slice(0, 8), poidsKo: Math.round(lu.octets.length / 1024), avertissements: avertissements(analyse, lu.octets.length),
    ...(s && l ? {} : { aPreciser: 'Demander à la personne d\'où vient l\'animation et sa licence (LottieFiles : « Lottie Simple License » ou autre), puis : pulse-motion credits <dossier> noter ' + relatif + ' "<source>" "<licence>"' }),
    exemple: `<div data-lottie="${relatif}" data-start="0.5" style="width: 40cqh; height: 40cqh"></div>`,
  };
}

// --- Recoloration ------------------------------------------------------------------------------------------------------------
function hexVersRvb(h) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(h || '').trim());
  if (!m) return null;
  const x = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
}

function recolorer(anim, correspondances) {
  const copie = JSON.parse(JSON.stringify(anim));
  if (!correspondances.length) return copie;
  const trouver = (rvb) => correspondances.find((c) => c.source.every((v, i) => Math.abs(v - rvb[i]) <= TOLERANCE));
  const tableau = (arr, debut = 0) => {
    if (!Array.isArray(arr) || arr.length < debut + 3) return;
    const echelle = arr.slice(debut, debut + 3).some((v) => v > 1) ? 1 : 255;
    const c = trouver(arr.slice(debut, debut + 3).map((v) => Math.round(v * echelle)));
    if (c) for (let i = 0; i < 3; i++) arr[debut + i] = Math.round(c.cible[i] / echelle * 10000) / 10000;
  };
  const propriete = (p, appliquer) => {
    if (!p || p.k === undefined) return;
    if (Array.isArray(p.k) && p.k.length && typeof p.k[0] === 'object' && p.k[0] !== null && p.k[0].t !== undefined) p.k.forEach((k) => { if (k.s) appliquer(k.s); if (k.e) appliquer(k.e); });
    else appliquer(p.k);
  };
  const visiter = (x) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(visiter); return; }
    if ((x.ty === 'fl' || x.ty === 'st') && x.c) propriete(x.c, (v) => tableau(v));
    if ((x.ty === 'gf' || x.ty === 'gs') && x.g && x.g.k) {
      const nb = x.g.p || 0;
      propriete(x.g.k, (v) => { for (let k = 0; k < nb; k++) tableau(v, k * 4 + 1); });
    }
    if (x.ty === 1 && typeof x.sc === 'string') {
      const rvb = hexVersRvb(x.sc);
      const c = rvb && trouver(rvb);
      if (c) x.sc = `#${c.cible.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    }
    for (const k of Object.keys(x)) if (x[k] && typeof x[k] === 'object') visiter(x[k]);
  };
  visiter(copie.layers);
  visiter(copie.assets);
  return copie;
}

/** « #ff5a00=primaire,#222222=texte » -> { correspondances: [{ source, cible }] } | { erreur } ; cible : nom de la charte ou #hex. */
function lireCouleurs(texte, couleurs) {
  const correspondances = [];
  for (const morceau of String(texte || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [de, vers] = morceau.split('=').map((s) => (s || '').trim());
    const source = hexVersRvb(de);
    const brute = /^#/.test(vers || '') ? vers : couleurs && Object.hasOwn(couleurs, vers || '') ? couleurs[vers] : null;
    const cible = hexVersRvb(brute);
    if (!source || !cible) return { erreur: `data-lottie-couleurs « ${morceau} » : « #rrggbb=nom » (une couleur de l'animation, puis une couleur de la charte par son nom, ou #rrggbb).` };
    correspondances.push({ source, cible });
  }
  return { correspondances };
}

// --- Assemblage --------------------------------------------------------------------------------------------------------------
const BALISE = /<([a-z][a-z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*?\sdata-lottie\s*=\s*(["'])([^"']*)\3(?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/gi;
const lire = (attrs, nom) => { const m = new RegExp(`\\s${nom}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attrs); return m ? (m[1] !== undefined ? m[1] : m[2]) : null; };

function preparerLotties(html, { scene, projet, couleurs = {}, blocs = new Map(), dureeScene = null } = {}) {
  const erreurs = [];
  const fichiers = new Set();
  const sortie = String(html).replace(BALISE, (tout, balise, attributs, g, valeur, ferme) => {
    const signaler = (regle, gravite, message) => erreurs.push({ regle, gravite, scene, element: valeur, message: `Scène « ${scene} », animation « ${valeur} » : ${message}` });
    if (/^pm-lottie-\d+$/.test(valeur)) return tout;
    const absolu = cheminDansProjet(projet, valeur);
    if (!absolu) { signaler('chemin-hors-projet', 'erreur', 'le fichier sort du dossier de la vidéo : le copier dans assets/lottie/ (pulse-motion lottie importer).'); return tout; }
    if (!fs.existsSync(absolu)) { signaler('fichier-introuvable', 'erreur', `fichier introuvable : l'importer d'abord (pulse-motion lottie importer <fichier>).`); return tout; }
    const vitesse = lire(attributs, 'data-lottie-vitesse');
    const boucle = lire(attributs, 'data-lottie-boucle');
    if (vitesse !== null && !(Number(vitesse) > 0 && Number(vitesse) <= 10)) { signaler('lottie-invalide', 'erreur', `data-lottie-vitesse « ${vitesse} » : un nombre de 0,1 à 10 (1 : vitesse d'origine).`); return tout; }
    if (boucle !== null && !['oui', 'non'].includes(boucle)) { signaler('lottie-invalide', 'erreur', `data-lottie-boucle « ${boucle} » : oui ou non.`); return tout; }
    // couleurs null (contrôle d'une scène seule, sans la charte) : les noms de couleurs ne sont pas jugés.
    const lus = couleurs === null ? { correspondances: [] } : lireCouleurs(lire(attributs, 'data-lottie-couleurs'), couleurs);
    if (lus.erreur) { signaler('lottie-invalide', 'erreur', lus.erreur); return tout; }
    const lu = lireLottie(absolu);
    if (!lu.ok) { signaler(/\.(json|lottie)$/i.test(absolu) ? 'lottie-invalide' : 'fichier-non-pris-en-charge', 'erreur', lu.message); return tout; }
    const analyse = L.analyserLottie(lu.anim);
    let bloquant = false;
    for (const a of avertissements(analyse, lu.octets.length)) {
      signaler(a.regle, a.gravite, a.message.charAt(0).toLowerCase() + a.message.slice(1));
      if (a.gravite === 'erreur') bloquant = true;
    }
    // Fin de l'animation, en secondes de la scène : départ chiffré (data-start), durée divisée par la vitesse.
    const depart = Number(lire(attributs, 'data-start') || 0);
    const fin = (Number.isFinite(depart) ? depart : 0) + analyse.duree / (Number(vitesse) || 1);
    if (boucle !== 'oui' && dureeScene && /^\s*\d*\.?\d+\s*$/.test(lire(attributs, 'data-start') || '0') && dureeScene - fin > SEUILS.lottieFinAvant) {
      signaler('lottie-trop-court', 'alerte', `l'animation finit à ${virgule(fin)} s, ${virgule(dureeScene - fin)} s avant la fin de la scène, et reste figée sur sa dernière image : la faire boucler (data-lottie-boucle="oui"), la ralentir, ou raccourcir la scène.`);
    }
    if (bloquant) return tout;
    fichiers.add(absolu);
    const cle = `${absolu}|${JSON.stringify(lus.correspondances)}`;
    if (!blocs.has(cle)) {
      const id = `pm-lottie-${blocs.size}`;
      const anim = recolorer(lu.anim, lus.correspondances);
      blocs.set(cle, { id, html: `<script type="application/json" id="${id}">${jsonDansHTML(anim)}</script>`, fichier: absolu });
    }
    const id = blocs.get(cle).id;
    const attrs = attributs.replace(/(\sdata-lottie\s*=\s*)(["'])[^"']*\2/i, `$1"${id}"`);
    return `<${balise}${attrs} data-lottie-source="${rel(projet, absolu)}"${lire(attrs, 'role') === null ? ' role="img"' : ''}${ferme ? '/' : ''}>`;
  });
  return { html: sortie, erreurs, fichiers: [...fichiers] };
}

module.exports = { lireLottie, importer, recolorer, lireCouleurs, preparerLotties, avertissements, TOLERANCE };
