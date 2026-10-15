'use strict';
/* Pulse Motion – planche d'un clip ou d'une pose de personnage : vignettes sous plusieurs angles, en PNG.
 *
 * Page HTML autonome (modules du moteur et données en ligne), ouverte dans Chrome ou Edge sans fenêtre, capturée.
 * Lignes : une par angle de vue ; colonnes : instants (clip bouclé : un cycle ; ponctuel : début → fin ; pose : un seul).
 * Un clip additif est montré appliqué sur la pose de repos.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MOTEUR = path.resolve(__dirname, '..', '..', 'moteur');
const MODULES = ['courbes.js', 'squelette.js', 'clips.js', 'habillage-batonnets.js', 'habillage-pieces.js'];
const CELLULE = 200, MARGE = 110, ENTETE = 40, ECHELLE = 0.42;
const SANS_NAVIGATEUR = 'Chrome ou Edge introuvable : la planche se dessine dans un navigateur. Lancez « pulse-motion outils » pour voir quoi installer.';

const arrondi = (v) => Math.round(v * 1000) / 1000;

function instants(type, objet, images) {
  if (type === 'pose') return [0];
  if (objet.boucle) return Array.from({ length: images }, (_, i) => arrondi(objet.duree * i / images));
  const fin = objet.cles[objet.cles.length - 1].t;
  if (images === 1) return [0];
  return Array.from({ length: images }, (_, i) => arrondi(fin * i / (images - 1)));
}

const enLigne = (texte) => texte.replace(/<\/script/gi, '<\\/script');

function pagePlanche({ nom, type, objet, lu, gabarit, vues, images, dessin = null }) {
  const temps = instants(type, objet, images);
  const largeur = MARGE + temps.length * CELLULE;
  const hauteur = ENTETE + vues.length * CELLULE;
  const donnees = { nom, type, objet, dessin, bib: { poses: lu.poses, clips: lu.clips, gabarits: lu.gabarits, expressions: lu.expressions }, gabarit, vues, temps, boucle: !!objet.boucle,
    CELLULE, MARGE, ENTETE, ECHELLE };
  const modules = MODULES.map((m) => `<script>\n${enLigne(fs.readFileSync(path.join(MOTEUR, m), 'utf8'))}\n</script>`).join('\n');
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Planche : ${nom}</title>
<style>html,body{margin:0;background:#1C1923}svg{display:block}text{font:500 15px system-ui,sans-serif;fill:#A19BAF}</style></head>
<body><svg id="planche" xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}"></svg>
<script type="application/json" id="pm-planche-donnees">${JSON.stringify(donnees).replace(/</g, '\\u003c')}</script>
${modules}
<script>
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var D = JSON.parse(document.getElementById('pm-planche-donnees').textContent);
  var S = M.squelette, K = M.clips;
  var svg = document.getElementById('planche');
  function texte(x, y, t, ancre) { var e = document.createElementNS(NS, 'text'); e.setAttribute('x', x); e.setAttribute('y', y); e.setAttribute('text-anchor', ancre || 'middle'); e.textContent = t; svg.appendChild(e); }
  function virgule(v) { return String(Math.round(v * 100) / 100).replace('.', ','); }
  D.temps.forEach(function (t, j) {
    var etiquette = D.type === 'pose' ? D.nom : D.boucle ? 'phase ' + virgule(t / D.objet.duree) : virgule(t) + ' s';
    texte(D.MARGE + j * D.CELLULE + D.CELLULE / 2, D.ENTETE - 14, etiquette);
  });
  var compte = 0;
  D.vues.forEach(function (vue, i) {
    var sol = D.ENTETE + (i + 1) * D.CELLULE - 24;
    texte(12, sol - D.CELLULE / 2 + 20, 'vue ' + vue + '°', 'start');
    var ligne = document.createElementNS(NS, 'rect');
    ligne.setAttribute('x', D.MARGE); ligne.setAttribute('y', sol); ligne.setAttribute('width', D.temps.length * D.CELLULE); ligne.setAttribute('height', 3);
    ligne.setAttribute('fill', '#5B3862'); svg.appendChild(ligne);
    D.temps.forEach(function (t, j) {
      var pose;
      if (D.type === 'pose') pose = K.resoudrePose(D.objet, D.bib);
      else if (D.objet.additif) pose = K.ajouter({}, D.objet, t, D.bib);
      else pose = K.echantillonner(D.objet, t, D.bib, D.gabarit);
      var g = document.createElementNS(NS, 'g');
      svg.appendChild(g);
      var perso = D.dessin ? M.pieces.creer(g, D.dessin, D.gabarit) : M.batonnets.creer(g);
      Object.assign(pose, { x: D.MARGE + j * D.CELLULE + D.CELLULE / 2, y: sol - (S.sol(D.gabarit) + 7) * D.ECHELLE, echelle: D.ECHELLE, vue: vue });
      perso.rendre(S.calculer(pose, D.gabarit));
      compte++;
    });
  });
  window.__planche = { personnages: compte };
})();
</script></body></html>
`;
  return { html, largeur, hauteur };
}

const COLONNES_MAX = 8;
const ORDRE_EXPRESSIONS = ['neutre', 'joie', 'tristesse', 'peur', 'colere', 'surprise'];

/** Colonnes de la planche du visage : les expressions, puis les bouches du dessin. */
function colonnesVisage(dessin, lu) {
  const { BOUCHES } = require('./personnages.js');
  const ex = Object.keys(lu.expressions || {});
  const expressions = [...ORDRE_EXPRESSIONS.filter((n) => ex.includes(n)), ...ex.filter((n) => !ORDRE_EXPRESSIONS.includes(n)).sort()];
  const b = Object.keys((dessin.visage && dessin.visage.bouches) || {});
  const bouches = [...BOUCHES.filter((n) => b.includes(n)), ...b.filter((n) => !BOUCHES.includes(n)).sort()];
  return [...expressions.map((n) => ({ etiquette: n, objet: { expression: n } })), ...bouches.map((n) => ({ etiquette: `bouche ${n}`, objet: { bouche: n } }))];
}

function pageVisage({ nom, dessin, lu, gabarit, vues }) {
  const colonnes = colonnesVisage(dessin, lu);
  const bandes = [];
  for (let i = 0; i < colonnes.length; i += COLONNES_MAX) bandes.push(colonnes.slice(i, i + COLONNES_MAX));
  const lignes = bandes.flatMap((bande) => vues.map((vue) => ({ vue, bande })));
  const largeur = MARGE + Math.min(COLONNES_MAX, colonnes.length) * CELLULE;
  const hauteur = lignes.length * (CELLULE + ENTETE);
  const donnees = { dessin, gabarit, lignes, bib: { poses: lu.poses, clips: lu.clips, gabarits: lu.gabarits, expressions: lu.expressions }, CELLULE, MARGE, ENTETE };
  const modules = MODULES.map((m) => `<script>\n${enLigne(fs.readFileSync(path.join(MOTEUR, m), 'utf8'))}\n</script>`).join('\n');
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Visage : ${nom}</title>
<style>html,body{margin:0;background:#1C1923}svg{display:block}text{font:500 14px system-ui,sans-serif;fill:#A19BAF}</style></head>
<body><svg id="planche" xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}"></svg>
<script type="application/json" id="pm-planche-donnees">${JSON.stringify(donnees).replace(/</g, '\\u003c')}</script>
${modules}
<script>
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var D = JSON.parse(document.getElementById('pm-planche-donnees').textContent);
  var S = M.squelette, K = M.clips;
  var svg = document.getElementById('planche');
  function el(tag, a, parent) { var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); parent.appendChild(e); return e; }
  var compte = 0;
  D.lignes.forEach(function (ligne, i) {
    var y0 = i * (D.CELLULE + D.ENTETE);
    el('text', { x: 12, y: y0 + D.ENTETE + D.CELLULE / 2, 'text-anchor': 'start' }, svg).textContent = 'vue ' + ligne.vue + '°';
    ligne.bande.forEach(function (col, j) {
      var x0 = D.MARGE + j * D.CELLULE;
      el('text', { x: x0 + D.CELLULE / 2, y: y0 + D.ENTETE - 12, 'text-anchor': 'middle' }, svg).textContent = col.etiquette;
      var cellule = el('svg', { x: x0, y: y0 + D.ENTETE, width: D.CELLULE, height: D.CELLULE }, svg);
      var g = el('g', {}, cellule);
      var perso = M.pieces.creer(g, D.dessin, D.gabarit);
      var pose = Object.assign(K.resoudrePose(col.objet, D.bib), { x: 0, y: 0, echelle: 1.2, vue: ligne.vue });
      var res = S.calculer(pose, D.gabarit);
      perso.rendre(res);
      var c = S.pointDe(res, 'centreTete');
      cellule.setAttribute('viewBox', (c.x - 100) + ' ' + (c.y - 105) + ' 200 200');
      compte++;
    });
  });
  window.__planche = { personnages: compte };
})();
</script></body></html>
`;
  return { html, largeur, hauteur };
}

async function rendrePlanche(options) {
  const navigateur = options.navigateur === undefined ? require('./navigateur.js').trouverNavigateur() : options.navigateur;
  if (!navigateur) throw new Error(SANS_NAVIGATEUR);
  const { html, largeur, hauteur } = options.visage ? pageVisage(options) : pagePlanche(options);
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-planche-perso-'));
  let page = null;
  try {
    const fichierPage = path.join(dossier, 'planche.html');
    fs.writeFileSync(fichierPage, html);
    const { ouvrirPage } = require('./cdp.js');
    page = await ouvrirPage({ navigateur, largeur, hauteur });
    await page.aller(pathToFileURL(fichierPage).href);
    const etat = await page.evaluer('window.__planche || null');
    if (!etat) throw new Error('Planche : la page n\'a pas fini de dessiner (erreur dans le moteur des personnages).');
    const png = await page.capturer();
    fs.mkdirSync(path.dirname(options.sortie), { recursive: true });
    fs.writeFileSync(options.sortie, png);
    return { fichier: options.sortie, largeur, hauteur, personnages: etat.personnages };
  } finally {
    if (page) await page.fermer();
    fs.rmSync(dossier, { recursive: true, force: true });
  }
}

module.exports = { MODULES, pageVisage, colonnesVisage, CELLULE, MARGE, ENTETE, instants, pagePlanche, rendrePlanche, SANS_NAVIGATEUR };
