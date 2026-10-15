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
const MODULES = ['courbes.js', 'squelette.js', 'clips.js', 'habillage-batonnets.js'];
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

function pagePlanche({ nom, type, objet, lu, gabarit, vues, images }) {
  const temps = instants(type, objet, images);
  const largeur = MARGE + temps.length * CELLULE;
  const hauteur = ENTETE + vues.length * CELLULE;
  const donnees = { nom, type, objet, bib: { poses: lu.poses, clips: lu.clips, gabarits: lu.gabarits }, gabarit, vues, temps, boucle: !!objet.boucle,
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
      if (D.type === 'pose') pose = Object.assign({}, D.objet.angles);
      else if (D.objet.additif) pose = K.ajouter({}, D.objet, t, D.bib);
      else pose = K.echantillonner(D.objet, t, D.bib, D.gabarit);
      var g = document.createElementNS(NS, 'g');
      svg.appendChild(g);
      var perso = M.batonnets.creer(g);
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

async function rendrePlanche(options) {
  const navigateur = options.navigateur === undefined ? require('./navigateur.js').trouverNavigateur() : options.navigateur;
  if (!navigateur) throw new Error(SANS_NAVIGATEUR);
  const { html, largeur, hauteur } = pagePlanche(options);
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

module.exports = { MODULES, CELLULE, MARGE, ENTETE, instants, pagePlanche, rendrePlanche, SANS_NAVIGATEUR };
