'use strict';
/* Pulse Motion – flou ajouté après le tournage (spec S6, 5.6) : « flouter . <nom> --etapes 3-5 --zone x,y,l,h » (en % de
 * l'image). Le flou est appliqué dans Chrome par canvas (ctx.filter = 'blur(…)', même voile gris de 15 % qu'au tournage) à
 * toutes les images de ces étapes, réencodées dans leur format. Il est définitif : aucune copie nette n'est gardée (ni
 * sauvegarde, ni historique de la prise). Une image partagée avec une étape non visée (l'état calme qui suit la dernière
 * étape visée, par exemple) est copiée avant d'être floutée : les autres étapes ne changent pas. La planche de la prise
 * est refaite, et les pages assemblées qui montraient ce film sont réassemblées (sinon retirées).
 *
 * flouter({ projet, nom, prise?, etapes, zone, navigateur }) -> { ok, prise, etapes, images, pages, videos } | { ok: false, message }
 *   prise : défaut, la prise choisie (sinon la dernière) ; zone [x, y, l, h] en % ; videos : vidéos déjà exportées, qui
 *   gardent l'image nette (à refaire).
 * lireZone(texte) -> [x, y, l, h] ou null.
 */
const fs = require('node:fs');
const path = require('node:path');
const F = require('./film.js');
const Pa = require('./parcours.js');
const { ouvrirPage } = require('./cdp.js');

const OUTIL = `(function () {
  async function bitmap(b64, mime) { var r = await fetch('data:' + mime + ';base64,' + b64); return createImageBitmap(await r.blob()); }
  function en64(blob) { return new Promise(function (ok) { var f = new FileReader(); f.onload = function () { ok(String(f.result).split(',')[1]); }; f.readAsDataURL(blob); }); }
  window.__pmFlouter = async function (b64, mime, zone, rayon, qualite) {
    var b = await bitmap(b64, mime);
    var c = new OffscreenCanvas(b.width, b.height), x = c.getContext('2d');
    x.drawImage(b, 0, 0);
    var X = zone[0] / 100 * b.width, Y = zone[1] / 100 * b.height, L = zone[2] / 100 * b.width, H = zone[3] / 100 * b.height;
    x.save(); x.beginPath(); x.rect(X, Y, L, H); x.clip();
    x.filter = 'blur(' + rayon + 'px)';
    x.drawImage(b, 0, 0);
    x.filter = 'none'; x.fillStyle = 'rgba(128,128,128,0.15)'; x.fillRect(X, Y, L, H);
    x.restore();
    return en64(await c.convertToBlob(mime === 'image/png' ? { type: mime } : { type: mime, quality: qualite }));
  };
  return true;
})()`;

const MIMES = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

function lireZone(texte) {
  const v = String(texte || '').replace(/%/g, '').split(',').map((x) => Number(x.trim()));
  if (v.length !== 4 || !v.every((x) => isFinite(x))) return null;
  const [x, y, l, h] = v;
  if (x < 0 || y < 0 || l <= 0 || h <= 0 || x + l > 100.0001 || y + h > 100.0001) return null;
  return v;
}

/** Noms d'images d'une étape (états calmes, approche, réaction). */
function imagesEtape(e) {
  const r = new Set();
  for (const k of ['avant', 'vue', 'survol', 'apres']) if (e[k]) r.add(e[k]);
  for (const x of [...(e.approche || []), ...(e.reaction || [])]) r.add(x[1]);
  return r;
}

function remplacer(e, ancien, nouveau) {
  for (const k of ['avant', 'vue', 'survol', 'apres']) if (e[k] === ancien) e[k] = nouveau;
  for (const k of ['approche', 'reaction']) if (e[k]) e[k] = e[k].map(([ms, im]) => [ms, im === ancien ? nouveau : im]);
}

async function flouter({ projet, nom, prise, etapes, zone, navigateur }) {
  projet = path.resolve(projet);
  const z = Array.isArray(zone) ? zone : lireZone(zone);
  if (!z) return { ok: false, message: 'Zone illisible : « x,y,l,h » en % de l\'image (0 à 100).' };
  const numeros = F.lireEtapes(etapes);
  if (!numeros) return { ok: false, message: 'Étapes illisibles : « 3 », « 3-5 » ou « 1,4 ».' };
  const parcours = F.lireParcoursBrut(projet, nom) || {};
  const liste = F.prises(projet, nom);
  const choisie = prise || parcours.prise || (liste.length ? liste[liste.length - 1].prise : null);
  if (!choisie) return { ok: false, message: `Film « ${nom} » : aucune prise.` };
  const { film, dossier, erreurs } = F.lireFilm(projet, nom, choisie);
  if (!film || erreurs.length) return { ok: false, message: erreurs[0] || `Film « ${nom} » : ${choisie} illisible.` };
  const absentes = numeros.filter((n) => !film.etapes.some((e) => e.n === n));
  if (absentes.length) return { ok: false, message: `Film « ${nom} », ${choisie} : étape${absentes.length > 1 ? 's' : ''} ${absentes.join(', ')} absente${absentes.length > 1 ? 's' : ''} (1 à ${film.etapes.length}).` };
  if (!navigateur) return { ok: false, message: 'Chrome ou Edge est introuvable : il en faut un pour flouter.' };

  const visees = film.etapes.filter((e) => numeros.includes(e.n));
  const autres = film.etapes.filter((e) => !numeros.includes(e.n));
  const aFlouter = new Set();
  visees.forEach((e) => imagesEtape(e).forEach((n) => aFlouter.add(n)));
  const partagees = new Set();
  autres.forEach((e) => imagesEtape(e).forEach((n) => { if (aFlouter.has(n)) partagees.add(n); }));
  const rayon = Math.max(10 * (film.echelle || 1), 0.008 * (film.largeur || 1280) * (film.echelle || 1));

  const page = await ouvrirPage({ navigateur, largeur: 400, hauteur: 300, delai: 60000 });
  const ecrites = [];
  try {
    await page.evaluer(OUTIL);
    const { OUTILS_IMAGES, ecrirePlanche } = require('./tournage.js');
    await page.evaluer(OUTILS_IMAGES);
    let k = 0;
    for (const n of [...aFlouter].sort()) {
      const source = path.join(dossier, 'images', n);
      const ext = path.extname(n).toLowerCase();
      const qualite = ext === '.webp' ? (/^r|^a/.test(n) ? 0.8 : 0.9) : 0.9;
      const octets = Buffer.from(await page.evaluer(`window.__pmFlouter(${JSON.stringify(fs.readFileSync(source).toString('base64'))}, '${MIMES[ext]}', ${JSON.stringify(z)}, ${rayon}, ${qualite})`), 'base64');
      let cible = n;
      if (partagees.has(n)) {
        // Partagée avec une étape non visée : une copie floutée pour les étapes visées.
        do { k++; cible = `${path.basename(n, ext)}-f${k}${ext}`; } while (fs.existsSync(path.join(dossier, 'images', cible)));
        visees.forEach((e) => remplacer(e, n, cible));
      }
      fs.writeFileSync(path.join(dossier, 'images', cible), octets);
      ecrites.push(cible);
    }
    visees.forEach((e) => { e.flous = { auto: 0, cible: 0, apres: 0, ...(e.flous || {}) }; e.flous.apres += 1; });
    film.poids = F.poidsPrise(dossier);
    fs.writeFileSync(path.join(dossier, 'film.json'), `${JSON.stringify(film, null, 2)}\n`, 'utf8');
    // Planche refaite à partir des images floutées (l'ancienne montrait l'image nette).
    if (film.source === 'tournage') {
      const phrases = Array.isArray(parcours.etapes) ? parcours.etapes.map((e) => { try { return Pa.phraseEtape(e); } catch { return ''; } }) : [];
      await ecrirePlanche(page, { projet, nom, prise: choisie, film, dossier, phrases });
    } else {
      fs.rmSync(path.join(projet, 'sortie', 'planche-film', `${nom}-${choisie}`), { recursive: true, force: true });
      const { ecrirePlancheImport } = require('./import.js');
      await ecrirePlancheImport(page, { projet, nom, prise: choisie, film, dossier });
    }
  } finally { await page.fermer(); }

  // Pages assemblées qui embarquaient ce film : réassemblées (sinon retirées) ; vidéos déjà exportées : à refaire.
  const sortie = path.join(projet, 'sortie');
  let fichiers = [];
  try { fichiers = fs.readdirSync(sortie); } catch { fichiers = []; }
  const pages = fichiers.filter((f) => f.endsWith('.html') && fs.readFileSync(path.join(sortie, f), 'utf8').includes(`id="pm-film-${nom}"`));
  if (pages.length && parcours.prise === choisie) {
    let ok = false;
    try { ok = require('../assembler.js').assembler({ dossier: projet }).ok; } catch { ok = false; }
    for (const f of pages) {
      const reste = fs.existsSync(path.join(sortie, f)) && !ok;
      if (reste) fs.rmSync(path.join(sortie, f), { force: true });
    }
  }
  const videos = fichiers.filter((f) => /\.(mp4|webm|gif|mov)$/i.test(f));
  return { ok: true, nom, prise: choisie, etapes: numeros, images: ecrites.length, pages, videos };
}

module.exports = { flouter, lireZone, imagesEtape };
