'use strict';
/* Spec « Lacunes créatives » (S9), plan S9-0 « Icônes » (5.3) : bibliothèque Lucide embarquée, mots-clés français, recherche,
 * <svg data-icone> remplacé à l'assemblage, erreurs du contrôle et du crochet, planche, export rapide = capture fidèle. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const I = require('../scripts/lib/icones.js');
const { assembler } = require('../scripts/assembler.js');
const { controlerScene } = require('../scripts/lib/controle-scene.js');
const { lireDeroule } = require('../scripts/lib/deroule.js');
const { decoder } = require('../scripts/lib/png.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { plafond } = require('./aide/plafonds.js');

const RACINE = path.join(__dirname, '..');
const DEPOT = path.join(RACINE, '..', '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const FR = JSON.parse(lire('references', 'icones-fr.json'));

function projet(scenes) {
  const dir = copierProjet('projet-simple');
  fs.rmSync(path.join(dir, 'scenes'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'scenes'));
  scenes.forEach(([id, html], i) => fs.writeFileSync(path.join(dir, 'scenes', `0${i + 1}-${id}.html`), html));
  modifierDeroule(dir, (d) => {
    d.scenes = scenes.map(([id, , duree = 4], i) => ({ id, fichier: `scenes/0${i + 1}-${id}.html`, duree, textes: { titre: 'Un titre' }, transition: 'coupe' }));
  });
  return dir;
}
const assembler1 = (dir) => assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });

// --- Données -----------------------------------------------------------------------------------------------------------

test('icônes : chaque mot-clé français pointe vers une icône existante', () => {
  const cles = Object.keys(FR);
  assert.ok(cles.length >= 300, `${cles.length} mots-clés`);
  const icones = new Set();
  for (const [mot, liste] of Object.entries(FR)) {
    assert.ok(Array.isArray(liste) && liste.length >= 1, mot);
    for (const nom of liste) {
      assert.ok(I.existe(nom), `« ${mot} » → ${nom} : icône absente de vendor/lucide/icones.json`);
      icones.add(I.resoudre(nom));
    }
  }
  assert.ok(icones.size >= 300, `${icones.size} icônes couvertes par les mots-clés français`);
  // Deux mots-clés qui ne diffèrent que par les accents ou la casse se confondraient à la recherche.
  const normaux = cles.map(I.normaliser);
  assert.equal(new Set(normaux).size, normaux.length, 'mots-clés en double une fois sans accents');
  // L'exemple de la spec : maison → house (et son ancien nom home), alerte → triangle-alert.
  assert.deepEqual(FR.maison, ['house', 'home']);
  assert.equal(I.resoudre('home'), 'house');
  assert.ok(I.existe(FR.alerte[0]));
});

test('icônes : vendor/lucide livré avec sa licence ISC, la partie MIT de Feather et sa provenance', () => {
  const d = I.charger();
  assert.ok(Object.keys(d.icones).length > 1800, `${Object.keys(d.icones).length} icônes`);
  assert.match(d.version, /^\d+\.\d+\.\d+$/);
  const licence = lire('vendor', 'lucide', 'LICENSE');
  assert.match(licence, /ISC License/);
  assert.match(licence, /Feather/);
  assert.match(licence, /The MIT License/);
  const provenance = lire('vendor', 'lucide', 'PROVENANCE.md');
  assert.ok(provenance.includes(`lucide-static\` ${d.version}`), 'version dans PROVENANCE.md');
  assert.match(provenance, /outils\/icones\/preparer\.js/);
  // Chaque chemin est une chaîne d, ou un point plein ; chaque alias mène à une icône.
  for (const [nom, liste] of Object.entries(d.icones)) {
    assert.ok(liste.length > 0, nom);
    for (const c of liste) assert.ok(typeof c === 'string' ? /^[Mm]/.test(c) : (c.plein === true && /^[Mm]/.test(c.d)), nom);
  }
  for (const [ancien, nom] of Object.entries(d.alias)) assert.ok(d.icones[nom], `${ancien} → ${nom}`);
  const etiquettes = JSON.parse(lire('vendor', 'lucide', 'etiquettes.json'));
  assert.deepEqual(Object.keys(etiquettes).sort(), Object.keys(d.icones).sort());
});

test('icônes : l\'outil du mainteneur convertit cercles, rectangles, lignes et polylignes en chemins équivalents', () => {
  const { enChemin } = require(path.join(DEPOT, 'outils', 'icones', 'preparer.js'));
  assert.equal(enChemin(['path', { d: 'M1 2h3' }]), 'M1 2h3');
  assert.equal(enChemin(['circle', { cx: '12', cy: '12', r: '10' }]), 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0');
  assert.equal(enChemin(['line', { x1: '1', y1: '2', x2: '3', y2: '4' }]), 'M1 2L3 4');
  assert.equal(enChemin(['polyline', { points: '1 2 3 4 5 6' }]), 'M1 2L3 4L5 6');
  assert.equal(enChemin(['polygon', { points: '1,2 3,4' }]), 'M1 2L3 4Z');
  assert.equal(enChemin(['rect', { x: '2', y: '3', width: '4', height: '5' }]), 'M2 3h4v5h-4Z');
  assert.match(enChemin(['rect', { x: '2', y: '3', width: '20', height: '14', rx: '2' }]), /^M4 3h16a2 2 0 0 1 2 2v10/);
  assert.deepEqual(enChemin(['circle', { cx: '1', cy: '1', r: '0.5', fill: 'currentColor' }]), { d: 'M0.5 1a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0', plein: true });
  assert.throws(() => enChemin(['text', {}]), /forme de Lucide inconnue/);
});

// --- Recherche ---------------------------------------------------------------------------------------------------------

test('icônes : chercher « camion » trouve truck ; sans accents ni casse', () => {
  assert.equal(I.chercher('camion')[0].nom, 'truck');
  assert.equal(I.chercher('CAMION')[0].nom, 'truck');
  assert.equal(I.chercher('camions')[0].nom, 'truck');
  assert.match(I.chercher('camion')[0].raison, /mot-clé « camion »/);
  for (const [mot, nom] of [['hôpital', 'hospital'], ['hopital', 'hospital'], ['HÔPITAL', 'hospital'], ['ecole', 'school'], ['Chaîne du froid', 'thermometer-snowflake'], ['chaine du froid', 'thermometer-snowflake']]) {
    assert.equal(I.chercher(mot)[0].nom, nom, mot);
  }
  // Nom exact d'abord (ou un ancien nom), puis mot-clé français, puis étiquette anglaise ; 12 résultats au plus.
  assert.equal(I.chercher('truck')[0].nom, 'truck');
  assert.equal(I.chercher('triangle-alert')[0].nom, I.resoudre('triangle-alert'));
  assert.equal(I.chercher('lorry')[0].nom, 'truck');
  assert.match(I.chercher('lorry')[0].raison, /étiquette « lorry »/);
  assert.ok(I.chercher('fleche').length <= 12);
  assert.equal(I.chercher('xqzwv').length, 0);
  assert.deepEqual(I.chercher(''), []);
});

test('icônes : un nom inconnu reçoit des noms proches, avec les autres noms de la même icône', () => {
  const p = I.nomsProches('triangle-alerte');
  assert.equal(p[0], 'triangle-alert');
  assert.ok(p.includes('alert-triangle'), p.join(', '));
  assert.deepEqual(I.nomsProches('zzzzzzzzzzzzzzzzzz'), []);
});

test('icônes : cheminsPour rend la table des seules icônes demandées (calque de dessin de S7)', () => {
  const t = I.cheminsPour(['truck', 'home', 'inconnue-xyz']);
  assert.deepEqual(Object.keys(t), ['truck', 'home']);
  assert.deepEqual(t.home, I.charger().icones.house);
});

// --- Assemblage --------------------------------------------------------------------------------------------------------

test('assembler : data-icone remplacé par le SVG en ligne avec pathLength=100 et currentColor', () => {
  const dir = projet([['livraison', `<section data-scene="livraison">
  <svg id="camion" class="icone" data-icone="truck" data-start="0.3" data-dur="1" style="width: 9cqh"></svg>
  <svg data-icone='triangle-alert' aria-label="Attention"/>
  <svg data-icone="brain-circuit"></svg>
  <h2 data-texte="titre" data-start="0.2"></h2>
</section>`]]);
  const r = assembler1(dir);
  assert.equal(r.ok, true);
  assert.deepEqual(r.erreurs.filter((e) => /icone/.test(e.regle)), []);
  const section = r.parScene[0].section;
  const camion = /<svg id="camion"[^>]*>([\s\S]*?)<\/svg>/.exec(section);
  assert.ok(camion, section);
  const ouverture = camion[0].slice(0, camion[0].indexOf('>') + 1);
  for (const a of ['viewBox="0 0 24 24"', 'fill="none"', 'stroke="currentColor"', 'stroke-linecap="round"', 'stroke-linejoin="round"', 'aria-hidden="true"',
    'class="icone"', 'data-icone="truck"', 'data-start="0.3"']) assert.ok(ouverture.includes(a), `${a} dans ${ouverture}`);
  assert.match(ouverture, /style="stroke-width: var\(--pm-icone-trait, 2\); width: 9cqh;"/);
  const chemins = camion[1].match(/<path [^>]*\/>/g);
  assert.equal(chemins.length, I.chemins('truck').length);
  for (const c of chemins) assert.match(c, /pathLength="100"/);
  // Ancien nom accepté, balise auto-fermée, libellé de l'auteur gardé (pas d'aria-hidden) ; points pleins gardés pleins.
  const alerte = /<svg data-icone='triangle-alert'[^>]*>/.exec(section)[0];
  assert.match(alerte, /aria-label="Attention"/);
  assert.doesNotMatch(alerte, /aria-hidden/);
  assert.ok(section.includes(I.chemins('triangle-alert').map((d) => `<path d="${d}" pathLength="100"/>`).join('')));
  assert.match(section, /<path d="M15\.5 13a0\.5[^"]*" pathLength="100" fill="currentColor"\/>/);
  // Rien d'autre de Lucide : ni les autres icônes, ni de quoi les retrouver.
  assert.doesNotMatch(r.html, /lucide/i);
  assert.equal(r.html.split(/ pathLength="100"(?: fill="currentColor")?\/>/).length - 1,I.chemins('truck').length + I.chemins('triangle-alert').length + I.chemins('brain-circuit').length);
});

test('assembler : icône inconnue refusée avec des noms proches', () => {
  const dir = projet([['alerte', '<section data-scene="alerte"><svg data-icone="triangle-alerte"></svg><span data-icone="truck"></span><h2 data-texte="titre"></h2></section>']]);
  const r = assembler1(dir);
  const inconnue = r.erreurs.find((e) => e.regle === 'icone-inconnue');
  assert.ok(inconnue, JSON.stringify(r.erreurs));
  assert.equal(inconnue.gravite, 'erreur');
  assert.equal(inconnue.scene, 'alerte');
  assert.match(inconnue.message, /icône « triangle-alerte » inconnue ; noms proches : triangle-alert, [^.]*alert-triangle/);
  const mal = r.erreurs.find((e) => e.regle === 'icone-mal-placee');
  assert.ok(mal);
  assert.match(mal.message, /<span>/);
  // Le crochet qui contrôle chaque scène écrite donne les mêmes erreurs, avec les mêmes messages.
  const { deroule } = lireDeroule(dir);
  const crochet = controlerScene({ projet: dir, deroule, scene: deroule.scenes[0], html: fs.readFileSync(path.join(dir, 'scenes', '01-alerte.html'), 'utf8') });
  assert.deepEqual(crochet.filter((e) => /icone/.test(e.regle)), r.erreurs.filter((e) => /icone/.test(e.regle)));
  // Et le contrôle de la documentation les connaît.
  assert.match(lire('references', 'controles.md'), /`icone-inconnue`, `icone-mal-placee`/);
});

test('assembler : une page sans icône n\'embarque rien de Lucide', () => {
  const dir = copierProjet('projet-simple');
  const code = `const { assembler } = require(${JSON.stringify(path.join(RACINE, 'scripts', 'assembler.js'))});
    const r = assembler({ dossier: ${JSON.stringify(dir)}, dossierStyles: ${JSON.stringify(STYLES)}, ecrire: false });
    const icones = require.resolve(${JSON.stringify(path.join(RACINE, 'scripts', 'lib', 'icones.js'))});
    process.stdout.write(JSON.stringify({ ok: r.ok, lu: !!require.cache[icones], lucide: /lucide|data-icone|--pm-icone-trait/i.test(r.html) || r.html.includes('pathLength="100"/>') }));`;
  const s = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8' });
  assert.equal(s.status, 0, s.stderr);
  assert.deepEqual(JSON.parse(s.stdout), { ok: true, lu: false, lucide: false });
});

// --- Commande ----------------------------------------------------------------------------------------------------------

test('pulse-motion icones : chercher, afficher, erreurs en français', () => {
  const pm = (...a) => spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'pm.js'), 'icones', ...a], { encoding: 'utf8' });
  const c = pm('chercher', 'camion');
  assert.equal(c.status, 0, c.stderr);
  assert.match(c.stdout.split('\n')[0], /^truck \(mot-clé « camion »\) : [^\n]*camion/);
  const j = JSON.parse(pm('chercher', 'Livraison', '--json').stdout);
  assert.ok(j.length >= 1 && j.length <= 12);
  assert.ok(j.some((x) => x.nom === 'truck'));
  const a = pm('afficher', 'truck');
  assert.equal(a.status, 0);
  assert.match(a.stdout, /^<svg data-icone="truck" viewBox="0 0 24 24"[^>]*><path d="M14 18V6/);
  const inconnue = pm('afficher', 'camionnette-xyz');
  assert.equal(inconnue.status, 1);
  assert.match(inconnue.stderr, /Icône « camionnette-xyz » inconnue/);
  assert.equal(pm('chercher', 'xqzwv').status, 1);
  assert.equal(pm().status, 2);
  assert.match(pm().stderr, /Usage : pulse-motion icones chercher/);
});

test('pulse-motion icones planche : une image PNG en grille, une cellule par icône', { ...SANS, timeout: 60000 }, async () => {
  const sortie = path.join(dossierTemporaire('pm-icones-'), 'planche.png');
  const s = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'icones.js'), 'planche', 'truck,package,box,house,triangle-alert,snowflake,heart', '--sortie', sortie],
    { encoding: 'utf8', env: { ...process.env, PM_NAVIGATEUR: navigateur } });
  assert.equal(s.status, 0, s.stderr);
  assert.match(s.stdout, /^Planche : /);
  const png = decoder(fs.readFileSync(sortie));
  // 7 icônes : 6 colonnes, 2 lignes de 168 px, marges de 24 px.
  assert.deepEqual([png.largeur, png.hauteur], [24 * 2 + 6 * 168, 24 * 2 + 2 * 168]);
  // Le trait clair d'une icône se voit au centre de la première cellule.
  let clairs = 0;
  for (let y = 24 + 30; y < 24 + 110; y++) for (let x = 24 + 48; x < 24 + 120; x++) if (png.donnees[(y * png.largeur + x) * png.canaux] > 180) clairs++;
  assert.ok(clairs > 50, `${clairs} pixels du trait`);
  const refus = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'icones.js'), 'planche', 'truck,camionx'], { encoding: 'utf8' });
  assert.equal(refus.status, 1);
  assert.match(refus.stderr, /« camionx » inconnue/);
});

// --- Page ----------------------------------------------------------------------------------------------------------------

test('export rapide : icône tracée identique à l\'export fidèle', { ...SANS, timeout: 120000 }, async () => {
  const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
  const CAPTURE = lire('moteur', 'capture.js');
  const L = 640, H = 360;
  const dir = projet([['trace', `<section data-scene="trace">
  <style>@scope {
    .icone { width: 30cqh; height: 30cqh; color: var(--c-primaire); --pm-icone-trait: 2.5; }
    .icone path { stroke-dasharray: 100; stroke-dashoffset: calc(100 * (1 - var(--p))); }
  }</style>
  <svg id="camion" class="icone" data-icone="truck" data-start="0.2" data-dur="1.6"></svg>
  <svg class="icone" data-icone="brain-circuit" data-start="#camion:fin" data-dur="1"></svg>
</section>`, 4]]);
  const r = assembler1(dir);
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  const fichier = path.join(dir, 'page.html');
  fs.writeFileSync(fichier, r.html);
  const c = await ouvrirCapture({ fichierHtml: fichier, largeur: L, hauteur: H, navigateur, delai: 60000 });
  try {
    await c.evaluer(`${CAPTURE}; true`);
    for (const t of [0.5, 1, 1.5, 2.2, 3.5]) {
      const fidele = decoder(await c.capturer(t));
      const rapide = decoder(Buffer.from(await c.evaluer(`(async () => {
        const canvas = document.createElement('canvas'); canvas.width = ${L}; canvas.height = ${H};
        await M.capturer(canvas.getContext('2d'), ${L}, ${H});
        return canvas.toDataURL('image/png').split(',')[1];
      })()`), 'base64'));
      assert.deepEqual([rapide.largeur, rapide.hauteur], [fidele.largeur, fidele.hauteur]);
      let somme = 0;
      const n = fidele.largeur * fidele.hauteur;
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) somme += Math.abs(fidele.donnees[i * fidele.canaux + k] - rapide.donnees[i * rapide.canaux + k]);
      const ecart = somme / (n * 3 * 255);
      assert.ok(ecart <= 0.01, `t = ${t} s : écart moyen ${(100 * ecart).toFixed(3)} %`);
    }
    // Le tracé avance : à mi-course l'icône est partiellement dessinée, à la fin entièrement.
    const encre = async (t) => { const p = decoder(await c.capturer(t)); let k = 0; for (let i = 0; i < p.largeur * p.hauteur; i++) if (p.donnees[i * p.canaux + 2] > 200 && p.donnees[i * p.canaux] < 120) k++; return k; };
    const mi = await encre(1), fin = await encre(3.5);
    assert.ok(mi > 0 && mi < fin, `encre : ${mi} à 1 s, ${fin} à 3,5 s`);
  } finally {
    await c.fermer();
  }
});

// --- Consignes et notices ------------------------------------------------------------------------------------------------

test('consignes : icônes guidées dans l\'animateur et retoucher, sans dépasser les plafonds', () => {
  const a = lire('agents', 'animateur.md');
  assert.ok(Buffer.byteLength(a) <= 6000, `${Buffer.byteLength(a)} o`);
  const table = a.slice(a.indexOf('| La consigne demande… | Lire aussi |'), a.indexOf('\n2. '));
  assert.ok(table.split('\n').some((l) => /une icône/.test(l) && l.includes('`pulse-motion reference icones`')));
  const t = lire('skills', 'retoucher', 'SKILL.md');
  assert.ok(Buffer.byteLength(t) <= plafond('retoucher'), `${Buffer.byteLength(t)} o`);
  assert.match(t, /« une icône de camion à côté du titre »/);
  assert.match(t, /une icône : `pulse-motion reference icones`/);
  const ref = lire('references', 'icones.md');
  for (const x of ['pulse-motion icones chercher <mot>', 'pulse-motion icones planche', '<svg data-icone="truck"', '--pm-icone-trait', 'pathLength="100"', 'stroke-dasharray: 100']) assert.ok(ref.includes(x), x);
  assert.match(lire('scripts', 'pm.js'), /icones: 'icones\.js'/);
});

test('THIRD-PARTY-NOTICES : Lucide (ISC), Feather (MIT) et l\'outil adapté d\'explainroo, à la racine et dans le plugin', () => {
  const plugin = lire('THIRD-PARTY-NOTICES.md');
  assert.equal(fs.readFileSync(path.join(DEPOT, 'THIRD-PARTY-NOTICES.md'), 'utf8'), plugin);
  const i = plugin.indexOf('\n## Lucide\n');
  assert.ok(i >= 0);
  const section = plugin.slice(i, plugin.indexOf('\n## ', i + 4));
  assert.match(section, /ISC License/);
  assert.match(section, /Copyright \(c\) 2013-present Cole Bemis/);
  assert.match(section, new RegExp(`lucide-static\` ${I.charger().version.replace(/\./g, '\\.')}`));
  assert.match(plugin, /`outils\/icones\/preparer\.js`[^\n]*`scripts\/build-icons\.mjs`/);
});
