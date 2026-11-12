'use strict';
/* Spec Styles et réalisation, jalon J7 « Vague B » (5.10, 5.13) : quatre styles livrés (tableau-blanc, tableau-noir, carnet,
 * recit-donnees), le contrat d'encre avec le calque de S7 (M.dessin.traces, M.dessin.encreStyle, data-encre="style", repli),
 * les modules d'un style (moteur/medium/, inclus seulement s'il les déclare), le texte écrit à la main (data-lettres="ecrit")
 * et le geste « une seule ligne » du carnet. Le rendu de chaque style dans les quatre formats est vérifié dans le navigateur
 * par styles-livres.test.js, comme pour les neuf autres. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../scripts/styles.js');
const F = require('../scripts/lib/fiche-style.js');
const T = require('../scripts/lib/temoin.js');
const L = require('../moteur/lettres.js');
const PNG = require('../scripts/lib/png.js');
const { partChangee, vignetteGrise } = require('../scripts/lib/flashs.js');
const { TYPES } = require('../scripts/lib/contrat.js');
const { controlerLettres } = require('../scripts/lib/controle-scene.js');
const { extraireScene } = require('../scripts/lib/extraire.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { assembler } = require('../scripts/assembler.js');
const { projetEssai } = require('../scripts/lib/projet-essai.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { trouverNavigateur } = require('./aide/navigateur.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const identite = (s) => JSON.parse(lire('styles', s, 'identite.json'));
const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const VAGUE_B = { 'tableau-blanc': 'dessine', 'tableau-noir': 'dessine', carnet: 'dessine', 'recit-donnees': 'schemas-donnees' };
const CAPTURE = lire('moteur', 'capture.js');
const LG = 640, HT = 360;
const json = async (c, code) => JSON.parse(await c.evaluer(`Promise.resolve(${code}).then(function (r) { return JSON.stringify(r); })`));
const scene = (style, type) => lire('styles', style, 'scenes', `${type}.html`).replace(/^<!--[\s\S]*?-->\s*/, '');

/** Page assemblée d'un projet, écrite dans son dossier. -> fichier */
function ecrirePage(dir) {
  const a = assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const fichier = path.join(dir, `page-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(fichier, a.html, 'utf8');
  return fichier;
}
const ouvrir = (fichier) => ouvrirCapture({ fichierHtml: fichier, largeur: LG, hauteur: HT, navigateur, delai: 60000 });
function ecart(a, b) {
  let s = 0;
  const n = a.largeur * a.hauteur;
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) s += Math.abs(a.donnees[i * a.canaux + k] - b.donnees[i * b.canaux + k]);
  return s / (n * 3 * 255);
}
const rapide = async (c, l = LG, h = HT) => PNG.decoder(Buffer.from(await c.evaluer(`(async () => {
  const canvas = document.createElement('canvas'); canvas.width = ${l}; canvas.height = ${h};
  await M.capturer(canvas.getContext('2d'), ${l}, ${h});
  return canvas.toDataURL('image/png').split(',')[1];
})()`), 'base64'));

// ---------- Les quatre styles ----------

test('vague B : tableau-blanc, tableau-noir, carnet, recit-donnees passent contrat, quatre formats et témoin', () => {
  for (const [style, categorie] of Object.entries(VAGUE_B)) {
    const dossier = path.join(RACINE, 'styles', style);
    // Contrat : les neuf scènes toutes faites et leurs clés, identité complète, polices et licences, sans avertissement.
    const v = S.verifierStyle(dossier);
    assert.deepEqual([v.erreurs, v.avertissements], [[], []], style);
    const catalogue = JSON.parse(lire('styles', style, 'catalogue.json'));
    assert.deepEqual(catalogue.scenes.map((s) => s.nom).sort(), Object.keys(TYPES).sort(), style);
    const id = identite(style);
    assert.equal(id.categorie, categorie, style);
    assert.ok(id.provenance.length >= 1 && id.provenance.every((p) => p.licence === 'MIT'), style);
    assert.deepEqual(F.verifierFiche(lire('references', 'styles', `${style}.md`), { dossierStyle: dossier, identite: id }), [], style);
    // Polices OFL : copiées d'un style déjà livré, ou manuscrites téléchargées avec l'accord de l'auteur (S8 J10 : Kalam, Caveat ;
    // vérifiées par mode-d-emploi.test.js).
    const licences = lire('styles', style, 'polices', 'LICENCES.md');
    assert.match(licences, /SIL OPEN FONT LICENSE Version 1\.1/, style);
    assert.match(licences, /aucune police téléchargée pour ce style|avec l'accord de l'auteur du plugin/, style);
    // Quatre formats : les requêtes de conteneur du carré, du vertical et de la marge des réseaux en 9:16.
    const css = lire('styles', style, 'style.css');
    for (const q of ['@container (max-aspect-ratio: 5/4)', '@container (orientation: portrait)', '@container (max-aspect-ratio: 2/3)', '@container (max-aspect-ratio: 9/10)']) assert.ok(css.includes(q), `${style} : ${q}`);
    // Témoin : les scènes titre et chiffre aux durées du catalogue, compteur à 1 250.
    const projet = T.projetTemoin({ dossierStyle: dossier });
    const d = JSON.parse(fs.readFileSync(path.join(projet, 'deroule.json'), 'utf8'));
    assert.deepEqual(d.scenes.map((s) => s.id), ['titre', 'chiffre'], style);
    assert.match(fs.readFileSync(path.join(projet, 'scenes', 'chiffre.html'), 'utf8'), /nombre 0→1250\b/, style);
    fs.rmSync(projet, { recursive: true, force: true });
  }
  // Recommandation : les nouveaux styles dans « aussi », jamais parmi les recommandés (décision S8-9).
  const reco = JSON.parse(lire('references', 'styles', 'recommandation.json'));
  for (const style of Object.keys(VAGUE_B)) {
    assert.ok(Object.values(reco).some((r) => r.aussi.includes(style)), style);
    assert.ok(!Object.values(reco).some((r) => r.recommandes.includes(style) || r.contraste === style), style);
  }
  // Recherche par les mots de la personne.
  assert.equal(S.chercherStyles('façon tableau blanc')[0].style, 'tableau-blanc');
  assert.equal(S.chercherStyles('à la craie')[0].style, 'tableau-noir');
  assert.equal(S.chercherStyles('un carnet de croquis')[0].style, 'carnet');
  assert.equal(S.chercherStyles('des chiffres')[0].style, 'recit-donnees');
  // Les tableaux redessinent l'encre, le carnet a sa seule ligne ; recit-donnees n'a besoin d'aucun module.
  assert.deepEqual(['tableau-blanc', 'tableau-noir', 'carnet', 'recit-donnees'].map((s) => identite(s).modules || []), [['encre'], ['encre'], ['une-ligne'], []]);
  // Schéma relié par data-fleche, et texte écrit à la main dans les styles dessinés.
  for (const style of ['tableau-blanc', 'tableau-noir', 'carnet']) assert.match(scene(style, 'titre'), /data-lettres="ecrit"/, style);
  for (const style of ['tableau-blanc', 'tableau-noir']) for (const type of Object.keys(TYPES)) assert.match(scene(style, type), /<section data-scene="[a-z]+" data-encre="style">/, `${style}/${type}`);
});

test('vague B : images A et B du témoin rendues par le plugin', { ...SANS, timeout: 600000 }, async () => {
  const sortie = dossierTemporaire('pm-vague-b-');
  for (const style of Object.keys(VAGUE_B)) {
    const r = await T.imagesTemoin({ dossierStyle: path.join(RACINE, 'styles', style), sortie, prefixe: `${style}-`, navigateur });
    assert.equal(r.ok, true, `${style} : ${r.message}`);
    const [a, b] = ['A', 'B'].map((k) => fs.readFileSync(r.images[k]));
    for (const png of [a, b]) {
      assert.equal(PNG.verifierPNG(png), null, style);
      const img = PNG.decoder(png);
      let min = 255, max = 0;
      for (let i = 0; i < img.donnees.length; i += img.canaux * 97) { const l = img.donnees[i]; min = Math.min(min, l); max = Math.max(max, l); }
      assert.ok(max - min > 80, `${style} : image presque unie`);
    }
    assert.ok(!a.equals(b), `${style} : A et B identiques`);
  }
});

test('poids : vidéo témoin de 60 s au plus 250 Ko au-dessus de clair-pedagogique', () => {
  const poids = (style) => {
    const dossierStyle = path.join(RACINE, 'styles', style);
    const n = JSON.parse(fs.readFileSync(path.join(dossierStyle, 'catalogue.json'), 'utf8')).scenes.length;
    const dir = projetEssai({ dossierStyle, textes: 'exemple', dureeScene: Math.round((60 / n) * 100) / 100 });
    try {
      const { html, erreurs } = assembler({ dossier: dir, ecrire: false });
      assert.deepEqual(erreurs.filter((e) => e.gravite === 'erreur'), [], style);
      return Buffer.byteLength(html);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  const reference = poids('clair-pedagogique');
  for (const style of Object.keys(VAGUE_B)) {
    const p = poids(style);
    assert.ok(p - reference <= 250 * 1024, `${style} : ${Math.round((p - reference) / 1024)} Ko de plus`);
  }
});

// ---------- Modules d'un style ----------

test('assembler : module d\'un style inclus seulement si le style le déclare', () => {
  const assemble = (style) => {
    const dir = projetEssai({ dossierStyle: path.join(RACINE, 'styles', style), textes: 'exemple', types: ['titre', 'liste'] });
    try { return assembler({ dossier: dir, ecrire: false }); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  const encre = /M\.encre\s*=/, uneLigne = /M\.uneLigne\s*=/;
  const blanc = assemble('tableau-blanc'), noir = assemble('tableau-noir'), carnet = assemble('carnet'), clair = assemble('clair-pedagogique'), recit = assemble('recit-donnees');
  for (const a of [blanc, noir]) { assert.match(a.moteur, encre); assert.doesNotMatch(a.moteur, uneLigne); }
  assert.match(carnet.moteur, uneLigne);
  assert.doesNotMatch(carnet.moteur, encre);
  for (const a of [clair, recit]) { assert.doesNotMatch(a.moteur, encre); assert.doesNotMatch(a.moteur, uneLigne); }
  // Un module s'appuie sur le calque de dessin : ses groupes sont inclus avec lui ; le moteur à la carte reste à la carte sinon.
  for (const a of [blanc, noir, carnet]) for (const g of ['dessin', 'releve']) assert.ok(a.groupes.includes(g), g);
  assert.ok(!clair.groupes.includes('dessin'), 'clair-pedagogique sans dessin dans ces scènes');
  // Un module inconnu est refusé par la vérification avec la liste des modules connus, et n'est jamais inclus.
  const copie = path.join(dossierTemporaire('pm-module-'), 'tableau-blanc');
  fs.cpSync(path.join(RACINE, 'styles', 'tableau-blanc'), copie, { recursive: true });
  fs.writeFileSync(path.join(copie, 'identite.json'), JSON.stringify({ ...identite('tableau-blanc'), modules: ['encre', 'inconnu'] }), 'utf8');
  const v = S.verifierStyle(copie, { livre: true });
  assert.ok(v.erreurs.some((e) => /module « inconnu » inconnu\. Modules : aplats, encre, iso, riso, une-ligne\./.test(e)), v.erreurs.join('\n'));
  // Chaque module : 20 Ko au plus, sans Math.random.
  for (const f of fs.readdirSync(path.join(RACINE, 'moteur', 'medium'))) {
    const code = lire('moteur', 'medium', f);
    assert.ok(Buffer.byteLength(code) <= 20 * 1024, `${f} : ${Buffer.byteLength(code)} o`);
    assert.doesNotMatch(code.replace(/\/\*[\s\S]*?\*\//g, ''), /Math\.random\(/, f);
  }
});

// ---------- Texte écrit à la main ----------

test('lettres : data-lettres="ecrit" s\'écrit lettre par lettre, et le contrôle le connaît', () => {
  assert.equal(L.EFFETS.ecrit, 0.06);
  assert.equal(L.LETTRE_ECRIT, 2);
  const probs = (html) => { const p = []; controlerLettres(extraireScene(html).decoupes, 's', p); return p; };
  assert.deepEqual(probs('<h1 data-texte="titre" data-lettres="ecrit" data-start="0" data-dur="1.2"></h1>'), []);
  assert.match(probs('<h1 data-texte="titre" data-mots="ecrit" data-start="0"></h1>')[0].message, /s'écrit lettre par lettre, écrire data-lettres="ecrit"/);
});

// ---------- Dans le navigateur ----------

test('carnet : aucun frémissement sur un élément data-texte ; « une seule ligne » fait le tour du titre ; l\'écriture finit à son échéance', { ...SANS, timeout: 240000 }, async () => {
  const dir = miniProjet({ style: 'carnet', scenes: [
    { id: 'titre', duree: 7, html: scene('carnet', 'titre'), textes: { etiquette: 'Hygiène', titre: 'Garder la chaîne du froid', sous: 'Les bons gestes, de bout en bout' } },
    { id: 'schema', duree: 8, html: scene('carnet', 'schema'), textes: { titre: 'Le trajet', a: 'Réception', b: 'Stockage', c: 'Préparation' } },
  ] });
  const c = await ouvrir(ecrirePage(dir));
  try {
    const debut = c.minutage.scenes.find((s) => s.id === 'schema').debut;
    const etat = (t) => json(c, `M.seek(${t}).then(function () {
      var sec = document.querySelector('section[data-scene="schema"]');
      return { textes: Array.prototype.map.call(sec.querySelectorAll('[data-texte]'), function (e) { var r = e.getBoundingClientRect(); return [e.getAttribute('data-texte'), Math.round(r.left * 100), Math.round(r.top * 100), Math.round(r.width * 100), getComputedStyle(e).transform]; }),
        enCours: Array.prototype.filter.call(sec.querySelectorAll('[data-texte]'), function (e) { return e.getAnimations({ subtree: true }).some(function (a) { var f = a.effect.getComputedTiming(); return a.currentTime < f.endTime; }); }).length,
        traits: M.dessin.traces('schema').filter(function (x) { return x.genre === 'fleche' && !/pointe/.test(x.cle); }).map(function (x) { return x.d; }) };
    })`);
    // Tout est arrivé : les textes ne bougent plus d'un pixel ; les flèches, elles, frémissent (10 retracés par seconde).
    const a = await etat(debut + 7.0), b = await etat(debut + 7.05), d = await etat(debut + 7.15);
    assert.equal(a.enCours, 0);
    assert.deepEqual(b.textes, a.textes, 'texte immobile');
    assert.deepEqual(d.textes, a.textes, 'texte immobile');
    assert.equal(a.traits.length, 2);
    assert.notDeepEqual(d.traits, a.traits, 'les traits frémissent');
    // Le frémissement du style reste entre 8 et 12 Hz, et aucune animation du style ne vise un texte en boucle.
    const ebullition = Number(/--pm-ebullition:\s*([\d.]+)/.exec(lire('styles', 'carnet', 'style.css'))[1]);
    assert.ok(ebullition >= 8 && ebullition <= 12, String(ebullition));
    // Une seule ligne : un seul trait continu, tracé en entier à la fin, qui fait le tour du titre.
    const l = await json(c, `M.seek(6.5).then(function () {
      var r = M.relever('titre'); var t = r.elements.filter(function (e) { return e.id === 'titre'; })[0].boite;
      var lignes = M.dessin.traces('titre').filter(function (x) { return /^une-ligne:/.test(x.cle); });
      var n = lignes.length ? lignes[0].d.match(/-?\\d+(?:\\.\\d+)?/g).map(Number) : [];
      var xs = n.filter(function (v, i) { return i % 2 === 0; }), ys = n.filter(function (v, i) { return i % 2 === 1; });
      return { n: lignes.length, part: lignes.length && lignes[0].part, genre: lignes.length && lignes[0].genre, M: lignes.length ? (lignes[0].d.match(/M/g) || []).length : 0,
        boite: t, minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs), minY: Math.min.apply(null, ys), maxY: Math.max.apply(null, ys) };
    })`);
    assert.deepEqual([l.n, l.part, l.genre], [1, 1, 'trait']);
    assert.ok(l.minX < l.boite.x - l.boite.l / 2 && l.maxX > l.boite.x + l.boite.l / 2, JSON.stringify(l));
    assert.ok(l.minY < l.boite.y - l.boite.h / 2 && l.maxY > l.boite.y + l.boite.h / 2, JSON.stringify(l));
    // Écrit à la main : la dernière lettre du titre finit à data-dur (1,8 s) après son début.
    const e = await json(c, `M.seek(3).then(function () {
      var el = document.getElementById('titre'); var lettres = el.querySelectorAll('.pm-lettre:not(.pm-blanc)');
      var der = lettres[lettres.length - 1].getAnimations()[0].effect.getComputedTiming();
      return { n: lettres.length, pas: el.style.getPropertyValue('--pm-pas'), dur: el.style.getPropertyValue('--pm-lettre-dur'), fin: der.endTime, texte: el.textContent };
    })`);
    assert.equal(e.texte, 'Garder la chaîne du froid', 'texte du déroulé inchangé');
    assert.ok(Math.abs(e.fin - 1800) < 2, JSON.stringify(e));
    assert.ok(Math.abs(parseFloat(e.pas) - 1.8 / (e.n + 1)) < 1e-3, JSON.stringify(e));
  } finally { await c.fermer(); }
});

test('tableau-noir : décor vivant, jamais immobile 2,5 s', { ...SANS, timeout: 300000 }, async () => {
  for (const type of Object.keys(TYPES)) assert.match(scene('tableau-noir', type), /class="marbrure" data-decor[\s\S]*class="fenetre" data-decor/, type);
  const dir = projetEssai({ dossierStyle: path.join(RACINE, 'styles', 'tableau-noir'), textes: 'exemple', valeurChiffre: 1250 });
  try {
    const c = await ouvrir(ecrirePage(dir));
    try {
      // Images de l'export fidèle, en vignettes de 128 × 72 (comme la passe des images figées du contrôle).
      const pas = 0.5, l = 128, h = 72;
      const vignettes = [];
      for (let t = 0; t <= c.duree + 1e-9; t += pas) {
        const img = PNG.decoder(await c.capturer(t));
        const kx = img.largeur / l, ky = img.hauteur / h;
        vignettes.push({ t, gris: vignetteGrise((x, y) => { const i = (Math.floor(y * ky) * img.largeur + Math.floor(x * kx)) * img.canaux; return [img.donnees[i], img.donnees[i + 1], img.donnees[i + 2]]; }, l, h) });
      }
      // Sur toute la vidéo (sauf la pause finale), l'image change en 2,5 s au moins autant que le seuil de l'image figée.
      const k = Math.round(2.5 / pas);
      const figees = [];
      for (let i = 0; i + k < vignettes.length; i++) {
        if (vignettes[i + k].t > c.duree - 0.5) break;
        if (partChangee(vignettes[i].gris, vignettes[i + k].gris, 2) < 0.005) figees.push(vignettes[i].t);
      }
      assert.deepEqual(figees, [], `immobile 2,5 s à partir de ${figees.join(', ')} s`);
    } finally { await c.fermer(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('tableau-blanc : l\'encre suit M.dessin.traces et l\'export rapide égale l\'export fidèle à 2 % près', { ...SANS, timeout: 240000 }, async () => {
  const dir = projetEssai({ dossierStyle: path.join(RACINE, 'styles', 'tableau-blanc'), textes: 'exemple', valeurChiffre: 1250, types: ['titre', 'chiffre', 'schema'] });
  try {
    const c = await ouvrir(ecrirePage(dir));
    try {
      await c.evaluer(`${CAPTURE}; true`);
      const debut = (id) => c.minutage.scenes.find((s) => s.id === id).debut;
      for (const [id, t] of [['titre', debut('titre') + 5.6], ['chiffre', debut('chiffre') + 5.6], ['schema', debut('schema') + 7.5]]) {
        const r = await json(c, `M.seek(${t}).then(function () {
          var sec = document.querySelector('section[data-scene="${id}"]');
          var traces = M.dessin.traces('${id}');
          var cv = sec.querySelector('canvas.pm-encre[data-calque="dessus"]');
          var svg = sec.querySelector('svg.pm-calque[data-calque="dessus"]');
          var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); svg.appendChild(p);
          var ctx = cv.getContext('2d'), k = cv.width / parseFloat(svg.getAttribute('viewBox').split(' ')[2]);
          var encre = traces.filter(function (x) { return !x.remplissage && !x.transform && x.part >= 1 && (x.calque || 'dessus') === 'dessus'; }).map(function (x) {
            p.setAttribute('d', x.d); var q = p.getPointAtLength(p.getTotalLength() / 2);
            var d = ctx.getImageData(Math.round(q.x * k) - 2, Math.round(q.y * k) - 2, 5, 5).data, a = 0;
            for (var i = 3; i < d.length; i += 4) a = Math.max(a, d[i]);
            return [x.cle, a];
          });
          p.remove();
          var vides = 0, img = ctx.getImageData(0, 0, cv.width, cv.height).data;
          for (var i = 3; i < img.length; i += 4) if (img[i]) vides++;
          return { encre: encre, peints: vides, cachees: Array.prototype.every.call(sec.querySelectorAll('.pm-calque path[stroke-width]'), function (x) { return getComputedStyle(x).visibility === 'hidden'; }),
            encreAttr: sec.getAttribute('data-encre'), fusionCss: Array.prototype.some.call(sec.querySelectorAll('*'), function (x) { return getComputedStyle(x).mixBlendMode !== 'normal'; }) };
        })`);
        assert.equal(r.encreAttr, 'style', id);
        assert.ok(r.encre.length >= 1, `${id} : aucun tracé fini`);
        for (const [cle, a] of r.encre) assert.ok(a > 100, `${id}, ${cle} : encre absente du canevas au milieu du tracé (${a})`);
        assert.ok(r.peints > 50, id);
        assert.equal(r.cachees, true, `${id} : le SVG peint encore l'encre`);
        assert.equal(r.fusionCss, false, `${id} : une fusion CSS`);
        // Deux voies d'export : même image à 2 % près.
        const f = PNG.decoder(await c.capturer(t));
        await c.evaluer(`M.seek(${t})`);
        const e = ecart(f, await rapide(c));
        assert.ok(e <= 0.02, `${id}, t = ${t} : ${(100 * e).toFixed(2)} %`);
      }
    } finally { await c.fermer(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('repli : sans canevas de style, encre SVG opaque à 0,94, sans fusion', { ...SANS, timeout: 240000 }, async () => {
  const textes = { titre: 'Le trajet', a: 'Réception', b: 'Stockage', c: 'Préparation' };
  const lireEncre = (c, t) => json(c, `M.seek(${t}).then(function () { return { traits: Array.prototype.map.call(document.querySelectorAll('.pm-calque path[stroke-width]'), function (p) {
    var cs = getComputedStyle(p); return { vis: cs.visibility, op: p.getAttribute('opacity'), fusion: cs.mixBlendMode }; }), canevas: document.querySelectorAll('canvas.pm-encre').length,
    erreurs: M.erreurs.filter(function (e) { return e.regle === 'dessin-erreur'; }).map(function (e) { return e.message; }) }; })`);
  // 1. Le canevas du style manque (navigateur sans canevas 2D) : le module le dit, efface ses canevas, l'encre revient au SVG.
  const sansCanevas = scene('tableau-blanc', 'schema').replace('</section>', '<script>HTMLCanvasElement.prototype.getContext = function () { return null; };</script>\n</section>');
  // 2. Aucun module d'encre (style qui n'en déclare pas) et data-encre="style" posé sur la scène.
  const sansModule = scene('tableau-blanc', 'schema');
  for (const [style, html, motif] of [['tableau-blanc', sansCanevas, /encre du style : canevas indisponible/], ['clair-pedagogique', sansModule, null]]) {
    const dir = miniProjet({ style, scenes: [{ id: 'schema', duree: 8, html, textes }] });
    const c = await ouvrir(ecrirePage(dir));
    try {
      const r = await lireEncre(c, 7.5);
      assert.ok(r.traits.length >= 3, style);
      assert.ok(r.traits.every((x) => x.vis === 'visible' && x.op === '0.94' && x.fusion === 'normal'), `${style} : ${JSON.stringify(r.traits)}`);
      assert.equal(r.canevas, 0, style);
      if (motif) assert.ok(r.erreurs.some((m) => motif.test(m)), r.erreurs.join('\n'));
      else assert.deepEqual(r.erreurs, []);
    } finally { await c.fermer(); }
  }
});
