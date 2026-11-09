'use strict';
/* Pulse Motion – preuve du déterminisme (spec S2, 5.13) : une scène dont le code (M.chaqueImage), les particules ou un
 * personnage pourraient ne pas se dessiner deux fois pareil est capturée dans deux pages et dans deux ordres.
 *
 * concernees(assemblage) -> [{ id, raisons: ['code' | 'particules' | 'personnage'], gpu }]
 * empreinteDeterminisme(assemblage, id) -> sha256 : section et code de la scène, recettes de ses effets et milieux,
 *   personnages de la vidéo (si la scène en a), moteur et code de la preuve.
 * instantsPreuve(minutage, ids, { n, ips }) -> [{ scene, t }] : à 10, 50 et 90 % de la partie de chaque scène hors
 *   transitions, n en tout (le milieu de chaque scène d'abord, puis 10 %, puis 90 %), triés par t.
 * prouver({ fichierHtml, instants, gpu, largeur, hauteur, psnrMin, ouvrir, pagesMax }) -> { problemes, nonFaites, pages }
 *   page A froide, instants dans l'ordre ; page B chauffée (rend l'instant du milieu et le dernier), instants dans l'ordre
 *   inverse ; empreintes SHA-256 des PNG ; une image qui diffère est décodée et son PSNR calculé (au-dessus de psnrMin :
 *   tremblement du rendu GPU, sans problème). Diagnostic de la première image fautive : deux pages froides (différentes →
 *   rendu-hasard), puis une page fraîche par autre instant, qui rend cet instant puis l'image fautive (la première qui la
 *   change → rendu-ordre) ; aucune → rendu-hasard (hasard tiré au chargement). pagesMax pages au plus.
 * verifierDeterminisme({ assemblage, precedent, minutage, seuils, navigateur, ouvrir, ratio, forcer })
 *   -> { determinisme: { empreintes, problemes }, problemes, lancee, scenes, duree } : la preuve ne porte que sur les
 *   scènes concernées dont l'empreinte a changé depuis le contrôle précédent (precedent : son champ determinisme) ;
 *   aucune : aucune page ouverte. Les problèmes des autres scènes concernées sont repris tels quels.
 * Principes de take-one (scripts/gate.mjs : comparaison froide dans l'ordre et chauffée à l'envers, PSNR, image fautive
 * nommée ; Apache-2.0, anidoodle) réécrits sans en reprendre de code ; video-director quality.md § 1 (MIT, idée).
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { psnr } = require('./images.js');

const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');
const virgule = (x) => String(Math.round(x * 100) / 100).replace('.', ',');
const CODE_PREUVE = [__filename, path.join(__dirname, 'capture-fidele.js'), path.join(__dirname, 'images.js')]
  .map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');

const MESSAGES = {
  'rendu-hasard': (p) => `Scène « ${p.scene} » : la même image ne se dessine pas deux fois pareil (vers ${virgule(p.instant)} s) ; la scène tire un hasard sans graine ou lit l'heure : l'aperçu et la vidéo exportée seront différents.`,
  'rendu-ordre': (p) => `Scène « ${p.scene} » : l'image à ${virgule(p.instant)} s change selon qu'on a d'abord montré l'image à ${virgule(p.avant)} s ; la scène garde un état d'une image à l'autre : retour en arrière, aperçu et export ne verront pas la même chose.`,
  'preuve-non-faite': (p) => `Scène « ${p.scene} » : ses particules n'ont pas pu être dessinées ici ; la preuve qu'elle se dessine toujours pareil n'a pas été faite.`,
};
const GRAVITES = { 'rendu-hasard': 'erreur', 'rendu-ordre': 'erreur', 'preuve-non-faite': 'info' };
const probleme = (regle, o) => ({ regle, gravite: GRAVITES[regle], scene: o.scene, instant: o.instant, message: MESSAGES[regle](o) });

function concernees(assemblage) {
  const r = [];
  for (const p of assemblage.parScene || []) {
    const raisons = [];
    if ((p.scripts || []).some((c) => /\bM\s*\.\s*chaqueImage\s*\(/.test(c))) raisons.push('code');
    const gpu = (assemblage.effets || []).some((e) => e.scene === p.id) || (assemblage.milieux || []).some((e) => e.scene === p.id);
    if (gpu) raisons.push('particules');
    if (/\sdata-personnage[\s=>]/.test(p.section || '')) raisons.push('personnage');
    if (raisons.length) r.push({ id: p.id, raisons, gpu });
  }
  return r;
}

function empreinteDeterminisme(assemblage, id) {
  const p = (assemblage.parScene || []).find((x) => x.id === id) || {};
  const d = assemblage.donnees || {};
  return sha(JSON.stringify({
    section: p.section || null,
    scripts: p.scripts || [],
    effets: (assemblage.effets || []).filter((e) => e.scene === id),
    milieux: (assemblage.milieux || []).filter((e) => e.scene === id),
    personnages: /\sdata-personnage[\s=>]/.test(p.section || '') ? d.personnages || null : null,
    format: d.format || null,
    moteur: sha(String(assemblage.moteur || '')),
    preuve: sha(CODE_PREUVE),
  }));
}

function instantsPreuve(minutage, ids, { n = 12, ips = 30 } = {}) {
  const scenes = minutage.scenes;
  const parts = [];
  for (const id of ids) {
    const i = scenes.findIndex((s) => s.id === id);
    if (i < 0) continue;
    const s = scenes[i];
    const suivante = scenes[i + 1];
    const a = s.debut + (s.entree || 0);
    const b = s.fin - (suivante ? suivante.entree || 0 : 0);
    if (b - a < 1 / ips) continue;
    parts.push({ id, a, b });
  }
  const choisis = [];
  const vus = new Set();
  for (const f of [0.5, 0.1, 0.9]) {
    for (const p of parts) {
      if (choisis.length >= n) break;
      let image = Math.round((p.a + f * (p.b - p.a)) * ips);
      image = Math.min(Math.max(image, Math.ceil(p.a * ips - 1e-6)), Math.floor(p.b * ips - 1e-6));
      if (vus.has(image)) continue;
      vus.add(image);
      choisis.push({ scene: p.id, t: image / ips });
    }
  }
  return choisis.sort((x, y) => x.t - y.t);
}

/** Deux captures égales : même empreinte, ou PSNR au-dessus du seuil (tremblement du rendu GPU). */
function egales(a, b, psnrMin) {
  if (sha(a) === sha(b)) return true;
  return psnr(a, b) > psnrMin;
}

const nonRendu = (e) => /WebGPU|particules? non rendu|Effet de particules/i.test(String(e && e.message));

async function prouver({ fichierHtml, instants, gpu = false, largeur = 640, hauteur = 360, psnrMin = 45, ouvrir, navigateur, pagesMax = 12, scenesGpu = new Set() }) {
  let pages = 0;
  const nonFaites = new Set();
  const ouvertes = [];
  async function page() {
    pages++;
    const c = await ouvrir({ fichierHtml, largeur, hauteur, navigateur, gpu });
    ouvertes.push(c);
    return c;
  }
  async function fermer(c) {
    const i = ouvertes.indexOf(c);
    if (i >= 0) ouvertes.splice(i, 1);
    await c.fermer();
  }
  let liste = [...instants];
  try {
    // Passe A (froide, dans l'ordre) et B (chauffée, à l'envers). Une scène à particules que la page ne sait pas dessiner
    // (WebGPU absent) est retirée et la passe reprend sans elle.
    for (;;) {
      if (!liste.length) return { problemes: [], nonFaites: [...nonFaites], fautives: [], pages };
      let echec = null;
      const A = new Map();
      const B = new Map();
      const a = await page();
      for (const x of liste) {
        try { A.set(x.t, await a.capturer(x.t)); } catch (e) { if (nonRendu(e) && scenesGpu.has(x.scene)) { echec = x.scene; break; } throw e; }
      }
      await fermer(a);
      if (echec === null) {
        const b = await page();
        const milieu = liste[Math.floor(liste.length / 2)];
        await b.capturer(milieu.t);
        await b.capturer(liste[liste.length - 1].t);
        for (const x of [...liste].reverse()) B.set(x.t, await b.capturer(x.t));
        await fermer(b);
        const fautives = liste.filter((x) => !egales(A.get(x.t), B.get(x.t), psnrMin));
        if (!fautives.length) return { problemes: [], nonFaites: [...nonFaites], fautives: [], pages };
        return { problemes: [await diagnostiquer(fautives[0])], nonFaites: [...nonFaites], fautives: [...new Set(fautives.map((x) => x.scene))], pages };
      }
      nonFaites.add(echec);
      liste = liste.filter((x) => x.scene !== echec);
      if (pages >= pagesMax) return { problemes: [], nonFaites: [...nonFaites, ...new Set(liste.map((x) => x.scene))], fautives: [], pages };
    }
  } finally {
    for (const c of ouvertes) await c.fermer().catch(() => {});
  }

  async function diagnostiquer(f) {
    const p1 = await page();
    const c1 = await p1.capturer(f.t);
    await fermer(p1);
    const p2 = await page();
    const c2 = await p2.capturer(f.t);
    await fermer(p2);
    if (!egales(c1, c2, psnrMin)) return probleme('rendu-hasard', { scene: f.scene, instant: f.t });
    // Les instants de la même scène d'abord (un état gardé d'une image à l'autre s'y voit le plus souvent).
    const autres = liste.filter((x) => x.t !== f.t).sort((x, y) => (x.scene === f.scene ? 0 : 1) - (y.scene === f.scene ? 0 : 1) || Math.abs(x.t - f.t) - Math.abs(y.t - f.t));
    for (const u of autres) {
      if (pages >= pagesMax) break;
      const pu = await page();
      await pu.capturer(u.t);
      const cu = await pu.capturer(f.t);
      await fermer(pu);
      if (!egales(cu, c1, psnrMin)) return probleme('rendu-ordre', { scene: f.scene, instant: f.t, avant: u.t });
    }
    return probleme('rendu-hasard', { scene: f.scene, instant: f.t });
  }
}

/** Taille de capture : largeur donnée, hauteur selon le format (paire). */
function tailleCapture(ratio, largeur) {
  const [l, h] = String(ratio || '16:9').split(':').map(Number);
  const hauteur = Math.round((largeur * (h || 9)) / (l || 16) / 2) * 2;
  return { largeur, hauteur };
}

async function verifierDeterminisme({ assemblage, precedent = null, minutage, seuils = {}, navigateur, ouvrir, ratio, forcer = false }) {
  const debut = Date.now();
  const liste = concernees(assemblage);
  const empreintes = {};
  for (const s of liste) empreintes[s.id] = empreinteDeterminisme(assemblage, s.id);
  const avant = precedent && precedent.empreintes && Array.isArray(precedent.problemes) ? precedent : { empreintes: {}, problemes: [] };
  const aProuver = liste.filter((s) => forcer || avant.empreintes[s.id] !== empreintes[s.id]);
  const repris = avant.problemes.filter((p) => empreintes[p.scene] && !aProuver.some((s) => s.id === p.scene));
  const nav = navigateur === undefined ? require('./navigateur.js').trouverNavigateur() : navigateur;
  if (aProuver.length && !nav) {
    // Sans navigateur, rien n'est prouvé (le rendu dit déjà qu'il n'a pas été vérifié) : rien n'est marqué prouvé.
    for (const s of aProuver) delete empreintes[s.id];
    return { determinisme: { empreintes, problemes: repris }, problemes: repris, lancee: false, scenes: [], duree: 0 };
  }
  if (!aProuver.length) {
    return { determinisme: { empreintes, problemes: repris }, problemes: repris, lancee: false, scenes: [], duree: 0 };
  }
  const ips = (assemblage.donnees && assemblage.donnees.format && assemblage.donnees.format.ips) || 30;
  const instants = instantsPreuve(minutage, aProuver.map((s) => s.id), { n: seuils.determinismeInstants || 12, ips });
  const prouvees = new Set(instants.map((x) => x.scene));
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-preuve-'));
  const fichierHtml = path.join(dossier, 'page.html');
  fs.writeFileSync(fichierHtml, assemblage.html, 'utf8');
  let r;
  try {
    const scenesGpu = new Set(aProuver.filter((s) => s.gpu).map((s) => s.id));
    r = await prouver({
      fichierHtml, instants, gpu: scenesGpu.size > 0, scenesGpu, navigateur: nav, ouvrir: ouvrir || require('./capture-fidele.js').ouvrirCapture,
      ...tailleCapture(ratio, seuils.determinismeLargeur || 640), psnrMin: seuils.determinismePsnr || 45,
    });
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
  const nouveaux = [...r.problemes, ...r.nonFaites.map((id) => probleme('preuve-non-faite', { scene: id }))];
  // Une scène restée sans instant (plus de scènes concernées que d'instants), ou fautive sans avoir été diagnostiquée (seule
  // la première image fautive l'est), n'est pas marquée prouvée : elle le sera au contrôle suivant.
  const diagnostiquees = new Set(r.problemes.map((p) => p.scene));
  for (const s of aProuver) {
    if ((!prouvees.has(s.id) && !r.nonFaites.includes(s.id)) || (r.fautives.includes(s.id) && !diagnostiquees.has(s.id))) delete empreintes[s.id];
  }
  const problemes = [...repris, ...nouveaux];
  return { determinisme: { empreintes, problemes }, problemes, lancee: true, scenes: aProuver.map((s) => s.id), pages: r.pages, duree: (Date.now() - debut) / 1000 };
}

module.exports = { concernees, empreinteDeterminisme, instantsPreuve, prouver, verifierDeterminisme, tailleCapture, MESSAGES };
