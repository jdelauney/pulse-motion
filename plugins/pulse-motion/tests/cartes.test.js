'use strict';
/* Spec « Lacunes créatives » (S9), 5.10 : cartes de pays et de régions. Outil du mainteneur (projection, topologie, fusion des
 * départements, encarts), moteur (projeter, arc), assemblage (cadre, pays, repères, liaisons), contrôles, crédits, commande.
 * Fonds d'essai inventés (tests/aide/fonds-essai.js) : les fonds de Natural Earth ne sont pas encore livrés. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const K = require('../moteur/cartes.js');
const { fondsEssai, OUTIL } = require('./aide/fonds-essai.js');
const { copierProjet, modifierDeroule } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');
const O = require(OUTIL);
const fonds = fondsEssai();
process.env.PM_CARTES_DOSSIER = fonds.dossier;
const C = require('../scripts/lib/cartes.js');
const lire = (nom) => JSON.parse(fs.readFileSync(path.join(fonds.dossier, nom), 'utf8'));

/** Points absolus d'un chemin de l'outil (M x y l dx dy … z). */
function points(d) {
  const r = [];
  for (const m of d.matchAll(/M([^l]+)l([^z]*)z/g)) {
    const n = (s) => (s.match(/-?(?:\d+\.?\d*|\.\d+)/g) || []).map(Number);
    const [x0, y0] = n(m[1]);
    let x = x0, y = y0;
    r.push([x, y]);
    const deltas = n(m[2]);
    for (let i = 0; i + 1 < deltas.length; i += 2) { x = Math.round((x + deltas[i]) * 10) / 10; y = Math.round((y + deltas[i + 1]) * 10) / 10; r.push([x, y]); }
  }
  return r;
}
const dedans = (b, p) => p.x >= b[0] && p.x <= b[2] && p.y >= b[1] && p.y <= b[3];

test('cartes : projeter Paris tombe dans la boîte de FR ; aller-retour outil/moteur identique au dixième d\'unité', () => {
  const monde = lire('monde.json');
  const fr = monde.pays.find((p) => p.code === 'FR');
  assert.ok(dedans(fr.boite, K.projeter(monde, 2.3522, 48.8566)), JSON.stringify(fr.boite));
  // Bornes d'Equal Earth : méridien d'origine au milieu, 180° au bord, pôle en haut.
  const centre = K.projeter(monde, 0, 0);
  assert.equal(centre.x, 500);
  assert.ok(Math.abs(centre.y - monde.hauteur / 2) <= 0.1, JSON.stringify(centre));
  assert.equal(K.projeter(monde, 180, 0).x, 1000);
  assert.equal(K.projeter(monde, 0, 90).y, 0);
  assert.ok(Math.abs(monde.hauteur - 486.7) < 0.2, `hauteur ${monde.hauteur}`);
  // Chaque sommet du tracé de DE est la projection, par le moteur, d'un sommet de la source (au dixième).
  const source = [[8, 47], [15, 47], [15, 55], [8, 55], [8, 51], [8, 49]].map(([lon, lat]) => K.projeter(monde, lon, lat));
  const de = monde.pays.find((p) => p.code === 'DE');
  for (const [x, y] of points(de.d)) assert.ok(source.some((s) => Math.abs(s.x - x) <= 0.1 && Math.abs(s.y - y) <= 0.1), `sommet ${x} ${y}`);
  // La frontière commune (8° E, de 47° à 51° N) est la même des deux côtés : simplifiée une fois, sans jour.
  const bord = [47, 49, 51].map((lat) => K.projeter(monde, 8, lat));
  const frontiere = (d) => points(d).filter(([x, y]) => bord.some((b) => Math.abs(b.x - x) <= 0.1 && Math.abs(b.y - y) <= 0.1)).map((p) => p.join(',')).sort();
  assert.ok(frontiere(fr.d).length >= 2);
  assert.deepEqual([...new Set(frontiere(fr.d))], [...new Set(frontiere(de.d))]);
  // Conique conforme de France : Paris au nord de Lyon, Guadeloupe dans son encart.
  const france = lire('france.json');
  const paris = K.projeter(france, 2.35, 48.85), lyon = K.projeter(france, 4.84, 45.76);
  assert.ok(paris.y < lyon.y && paris.x < lyon.x);
  const gua = france.encarts.find((e) => e.code === 'GUA');
  assert.ok(dedans(gua.cadre, K.projeter(france, -61.4, 16.2)), JSON.stringify(gua));
});

test('cartes : chaque pays a un code ISO et un nom français ; poids des fichiers sous les plafonds', () => {
  const monde = lire('monde.json');
  assert.ok(monde.pays.length >= 5);
  for (const p of monde.pays) {
    assert.match(p.code, /^[A-Z]{2}$/);
    assert.ok(p.nom && p.d && p.centre.length === 2 && p.boite.length === 4, p.code);
  }
  assert.equal(monde.pays.find((p) => p.code === 'DE').nom, 'Allemagne');
  // Sans code ISO (-99) : en fond seulement, jamais dans la liste des pays.
  assert.ok(!monde.pays.some((p) => /XSW|-99/.test(p.code)));
  assert.equal(monde.autres.length, 1);
  assert.match(fonds.bilan['monde.json'].avertissements.join(' '), /sans code ISO/);
  // La Guyane ne tire pas le cadre de la France vers l'Amérique du Sud ; elle reste dans le tracé.
  const fr = monde.pays.find((p) => p.code === 'FR');
  assert.ok(fr.boite[0] > K.projeter(monde, -10, 45).x, JSON.stringify(fr.boite));
  assert.ok(points(fr.d).some(([x]) => x < K.projeter(monde, -50, 4).x));
  assert.equal(monde.licence, 'domaine public (Natural Earth)');
  const PLAFONDS = { 'monde.json': 150, 'france.json': 60, 'villes.json': 30 };
  for (const [nom, ko] of Object.entries(PLAFONDS)) {
    assert.ok(fonds.bilan[nom].octets <= ko * 1024, `${nom} : ${fonds.bilan[nom].octets} o`);
    // Fonds livrés dans le plugin (quand ils le seront) : mêmes plafonds, et la même forme.
    const livre = path.join(RACINE, 'cartes', nom);
    if (fs.existsSync(livre)) {
      assert.ok(fs.statSync(livre).size <= ko * 1024, `${livre} : ${fs.statSync(livre).size} o`);
      const c = JSON.parse(fs.readFileSync(livre, 'utf8'));
      if (c.pays) for (const p of c.pays) assert.ok(p.code && p.nom && p.d, `${nom} : ${p.code}`);
    }
  }
});

test('cartes : régions fusionnées depuis les départements, encarts d\'outre-mer, chefs-lieux', () => {
  const france = lire('france.json');
  const idf = france.pays.find((p) => p.code === 'IDF');
  assert.equal(idf.nom, 'Île-de-France');
  // Paris et les Hauts-de-Seine ne font plus qu'un anneau : le bord commun a disparu.
  assert.equal((idf.d.match(/M/g) || []).length, 1);
  assert.ok(france.pays.find((p) => p.code === 'GUA').outreMer);
  assert.equal(france.encarts.length, 1);
  assert.ok(france.encarts[0].cadre[2] <= 200, 'encart à gauche de la métropole');
  assert.match(fonds.bilan['france.json'].avertissements.join(' '), /BRE/);
  const villes = lire('villes.json').villes;
  assert.equal(villes.find((v) => v.nom === 'Paris').chefLieu, 'IDF');
  assert.equal(villes.find((v) => v.nom === 'Lyon').chefLieu, 'ARA');
  assert.equal(villes[0].nom, 'Paris', 'triées par population');
  // Visvalingam : extrémités gardées, points alignés retirés, résultat stable.
  const ligne = [0, 1, 2, 3, 4].map((x) => ({ x, y: 0, cle: String(x) }));
  assert.deepEqual(O.visvalingam(ligne, 0.5).map((p) => p.x), [0, 4]);
  assert.deepEqual(O.visvalingam(ligne, 0.5), O.visvalingam(ligne, 0.5));
});

test('cartes : arc bombé vers le haut, versCamera dans l\'image', () => {
  const d = K.arc({ x: 0, y: 100 }, { x: 200, y: 100 }, 0.25);
  assert.equal(d, 'M0 100Q100 50 200 100');
  assert.equal(K.arc({ x: 200, y: 100 }, { x: 0, y: 100 }), 'M200 100Q100 50 0 100');
  const cam = K.versCamera([450, 200, 550, 250], [0, 0, 1000, 500], '16:9');
  assert.ok(cam.x > 45 && cam.x < 55 && cam.zoom > 1, JSON.stringify(cam));
});

/** Projet d'essai à une scène (clair-pedagogique), avec le HTML donné. */
function projet(html, textes = {}) {
  const dir = copierProjet('projet-simple');
  fs.rmSync(path.join(dir, 'scenes'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.writeFileSync(path.join(dir, 'scenes', '01-carte.html'), `<section data-scene="carte">\n${html}\n</section>\n`);
  modifierDeroule(dir, (d) => {
    d.style = 'clair-pedagogique';
    delete d.charte;
    d.scenes = [{ id: 'carte', fichier: 'scenes/01-carte.html', duree: 4, transition: 'coupe', textes: { ville: 'Lyon', ...textes } }];
  });
  return dir;
}
const assembler = (dir) => require('../scripts/assembler.js').assembler({ dossier: dir, ecrire: false });

test('assembler : cadre auto ne garde que les chemins qui touchent le cadre', () => {
  const r = assembler(projet('<svg data-carte="monde" data-carte-pays="FR" style="width: 80%"></svg>'));
  assert.equal(r.ok, true);
  assert.deepEqual(r.erreurs.filter((e) => /carte|pays|ville/.test(e.regle)), []);
  const svg = /<svg[^>]*data-carte="monde"[\s\S]*?<\/svg>/.exec(r.html)[0];
  const vb = /viewBox="([^"]+)"/.exec(svg)[1].split(' ').map(Number);
  const monde = lire('monde.json');
  const fr = monde.pays.find((p) => p.code === 'FR');
  // Cadre : la boîte de la France (sans la Guyane), plus 10 %.
  assert.ok(vb[0] < fr.boite[0] && vb[0] + vb[2] > fr.boite[2] && vb[2] < 200, vb.join(' '));
  assert.match(svg, /<path id="pays-FR" class="pm-pays" data-pays="FR" d="M/);
  assert.match(svg, /data-pays-fond="DE"/, 'l\'Allemagne touche le cadre');
  assert.match(svg, /data-pays-fond="ES"/);
  assert.doesNotMatch(svg, /data-pays-fond="BR"|data-pays-fond="CA"/, 'Brésil et Canada hors du cadre');
  assert.match(svg, /class="[^"]*pm-carte/);
  assert.match(svg, /--pm-u: [\d.]+px/);
  // Cadre nommé : l'Europe ; un continent sur la carte de France est refusé.
  const europe = assembler(projet('<svg data-carte="monde" data-carte-cadre="europe"></svg>'));
  assert.equal(europe.ok, true);
  assert.match(europe.html, /data-pays-fond="FR"/);
  const refus = assembler(projet('<svg data-carte="france" data-carte-cadre="europe"></svg>'));
  assert.deepEqual(refus.erreurs.filter((e) => e.regle === 'carte-invalide').length, 1);
});

test('assembler : repère par nom et par coordonnées ; ville inconnue refusée avec des noms proches', () => {
  const r = assembler(projet(`<svg data-carte="monde" data-carte-pays="FR,CA">
  <g id="lyon" data-repere="Lyon" data-start="0.5"><text data-texte="ville" dy="-0.8em"></text></g>
  <g data-repere="48.8566,2.3522"></g>
  <g data-repere="DE"></g>
  <path data-pays="ES" data-start="0.6" data-tween="--pm-surligne 0→1"></path>
  <path id="vol" data-liaison="Paris→Montréal" data-start="1" data-dur="1.2"></path>
</svg>`));
  assert.deepEqual(r.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const monde = lire('monde.json');
  const lyon = K.projeter(monde, 4.8357, 45.764);
  assert.match(r.html, new RegExp(`<g id="lyon"[^>]*class="pm-repere"[^>]*transform="translate\\(${lyon.x} ${lyon.y}\\)">`));
  assert.match(r.html, />Lyon<\/text>/);
  const paris = K.projeter(monde, 2.3522, 48.8566);
  assert.match(r.html, new RegExp(`transform="translate\\(${paris.x} ${paris.y}\\)"><circle class="pm-repere-point"`));
  const de = monde.pays.find((p) => p.code === 'DE');
  assert.match(r.html, new RegExp(`translate\\(${de.centre[0]} ${de.centre[1]}\\)`));
  // Pays déclaré : son tracé sur sa propre balise, minutée.
  assert.match(r.html, /<path id="pays-ES"[^>]*data-tween="--pm-surligne 0→1"[^>]*class="pm-pays" data-pays="ES" d="M/);
  // Liaison : arc calculé, longueur 100.
  const mtl = K.projeter(monde, -73.5673, 45.5017);
  assert.ok(r.html.includes(`d="${K.arc(paris, mtl, 0.25)}" pathLength="100"`));
  assert.match(r.html, /<path id="vol"[^>]*class="pm-liaison"/);
  // Ville inconnue : erreur, noms proches ; pays inconnu aussi.
  const faute = assembler(projet('<svg data-carte="monde"><g data-repere="Pari"></g></svg>'));
  const v = faute.erreurs.find((e) => e.regle === 'ville-inconnue');
  assert.ok(v && v.gravite === 'erreur' && /« Paris »/.test(v.message), JSON.stringify(faute.erreurs));
  const p = assembler(projet('<svg data-carte="monde" data-carte-pays="Allemagn"></svg>')).erreurs.find((e) => e.regle === 'pays-inconnu');
  assert.ok(p && /Allemagne/.test(p.message), JSON.stringify(p));
  const l = assembler(projet('<svg data-carte="monde"><path data-liaison="Paris"></path></svg>')).erreurs.find((e) => e.regle === 'carte-invalide');
  assert.ok(l && /départ→arrivée/.test(l.message));
  // Le contrôle d'une scène seule (crochet après écriture) voit les mêmes fautes.
  const { controlerScene } = require('../scripts/lib/controle-scene.js');
  const dir = projet('<svg data-carte="mond"></svg>');
  const { lireDeroule } = require('../scripts/lib/deroule.js');
  const deroule = lireDeroule(dir).deroule;
  const c = controlerScene({ projet: dir, deroule, scene: deroule.scenes[0], html: fs.readFileSync(path.join(dir, 'scenes', '01-carte.html'), 'utf8') });
  assert.ok(c.some((x) => x.regle === 'carte-inconnue' && /monde/.test(x.message)), JSON.stringify(c));
});

test('assembler : une page sans carte n\'embarque rien de cartes/', () => {
  const avec = assembler(projet('<svg data-carte="monde" data-carte-pays="FR"></svg>'));
  assert.ok(avec.groupes.includes('cartes'));
  assert.match(avec.html, /\.pm-pays-fond/);
  assert.deepEqual(avec.cartes, ['monde']);
  const sans = assembler(projet('<h2 data-texte="ville"></h2>'));
  assert.equal(sans.ok, true);
  assert.ok(!sans.groupes.includes('cartes'));
  assert.doesNotMatch(sans.html, /pm-pays|pm-repere|boiteLonLat|Natural Earth/);
  assert.equal(sans.cartes, undefined);
  // Crédits : Natural Earth seulement avec une carte.
  const L = require('../scripts/lib/livrables.js');
  const { lireDeroule } = require('../scripts/lib/deroule.js');
  const dir = projet('<svg data-carte="monde" data-carte-pays="FR"></svg>');
  const credits = L.credits({ projet: dir, deroule: lireDeroule(dir).deroule, assemblage: assembler(dir) }).texte;
  assert.match(credits, /Cartes\n- fonds de carte : Natural Earth/);
  const dir2 = projet('<h2 data-texte="ville"></h2>');
  assert.doesNotMatch(L.credits({ projet: dir2, deroule: lireDeroule(dir2).deroule, assemblage: assembler(dir2) }).texte, /Natural Earth/);
});

test('cartes : sans fonds livrés, carte-inconnue le dit ; commande chercher et afficher', async () => {
  const vide = dossierTemporaire('pm-cartes-vides-');
  process.env.PM_CARTES_DOSSIER = vide;
  try {
    const r = assembler(projet('<svg data-carte="monde"></svg>'));
    const e = r.erreurs.find((x) => x.regle === 'carte-inconnue');
    assert.ok(e && /pas encore livrés/.test(e.message), JSON.stringify(r.erreurs));
    assert.equal(C.donneesPresentes(), false);
  } finally {
    process.env.PM_CARTES_DOSSIER = fonds.dossier;
  }
  const inconnue = assembler(projet('<svg data-carte="europe"></svg>')).erreurs.find((x) => x.regle === 'carte-inconnue');
  assert.match(inconnue.message, /monde, france/);
  assert.deepEqual(C.chercher('allemagne').resultats[0], { sorte: 'pays', carte: 'monde', code: 'DE', nom: 'Allemagne' });
  assert.equal(C.chercher('ile de france').resultats[0].code, 'IDF');
  assert.equal(C.chercher('montreal').resultats[0].nom, 'Montréal');
  assert.deepEqual(C.chercher('Berln').resultats, []);
  assert.ok(C.chercher('Berln').proches.includes('Berlin'));
  const { afficher } = require('../scripts/cartes.js');
  const a = afficher('monde', 'FR', { cadre: 'europe' });
  assert.equal(a.ok, true);
  assert.match(a.camera, /^zoom 1→[\d.]+ 0\+1\.5; x 50→[\d.]+ 0\+1\.5; y 50→[\d.]+ 0\+1\.5$/);
  assert.ok(a.zoom > 1 && a.centre.x > 0 && a.centre.x < 100);
  assert.equal(afficher('monde', 'Atlantide', {}).ok, false);
  // La commande est connue de pulse-motion.
  assert.ok(require('../scripts/pm.js').COMMANDES.includes('cartes'));
});
