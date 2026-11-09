'use strict';
/* Petit projet écrit à la main pour les règles de réalisation et de vérité (spec S2, 5.7 et 5.8). */
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./temporaire.js');

/**
 * miniProjet({ scenes: [{ id, html, duree?, textes?, type?, intention?, voix?, transition?, musique? }], deroule?, glossaire? })
 * -> dossier. html : contenu de la <section> (la balise est ajoutée), ou une section complète. Style clair-pedagogique.
 */
function miniProjet({ scenes, deroule = {}, glossaire = null, style = 'clair-pedagogique', assets = {} }) {
  const dir = dossierTemporaire('pm-mini-');
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.mkdirSync(path.join(dir, 'assets'));
  for (const [nom, contenu] of Object.entries(assets)) fs.writeFileSync(path.join(dir, 'assets', nom), contenu);
  const liste = scenes.map((s, i) => {
    const fichier = `scenes/${String(i + 1).padStart(2, '0')}-${s.id}.html`;
    const html = /^\s*<section/.test(s.html) ? s.html : `<section data-scene="${s.id}">\n${s.html}\n</section>`;
    fs.writeFileSync(path.join(dir, fichier), html);
    const sc = { id: s.id, fichier, duree: s.duree || 6, textes: s.textes || {}, transition: s.transition || 'fondu' };
    for (const k of ['type', 'intention', 'voix', 'musique']) if (s[k] !== undefined) sc[k] = s[k];
    return sc;
  });
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify({
    version: 1, titre: 'Essai', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9', ips: 30 }, style, scenes: liste, ...deroule,
  }, null, 2));
  if (glossaire) {
    fs.mkdirSync(path.join(dir, 'charte'));
    fs.writeFileSync(path.join(dir, 'charte', 'glossaire.md'), glossaire);
  }
  return dir;
}

/** Prise de voix posée sur une scène (comme « pulse-motion voix importer ») : fichier écrit, déroulé à jour. */
async function poserVoix(dir, scene, octets, texte) {
  const V = require('../../scripts/lib/voix.js');
  const r = await V.ecrirePrise({ projet: dir, scene, octets, texte });
  const fichier = path.join(dir, 'deroule.json');
  const d = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  const s = d.scenes.find((x) => x.id === scene);
  s.voix = { ...(s.voix || {}), texte, fichier: r.relatif };
  fs.writeFileSync(fichier, JSON.stringify(d, null, 2));
  return r;
}

module.exports = { miniProjet, poserVoix };
