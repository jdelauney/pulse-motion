'use strict';
/* Spec S11, jalon J4 : habillage « plume » (5.6) et planche qui suit un élément (5.11 point 1), sans navigateur : tracés purs
 * (moteur/habillage-plume.js, dessiner), registre, format des dessins de la manière plume, galerie, « une figure d'abord »,
 * assemblage (groupes du moteur), recadrage et agrandissement de la planche qui suit. Navigateur : plume-page.test.js,
 * planche-suivre-page.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PL = require('../moteur/habillage-plume.js');
const S = require('../moteur/squelette.js');
const HAB = require('../moteur/personnages/habillages.js');
const GM = require('../scripts/lib/groupes-moteur.js');
const P = require('../scripts/lib/personnages.js');
const SU = require('../scripts/planche-suivre.js');
const { assembler } = require('../scripts/assembler.js');
const { preparerPersonnages } = require('../scripts/lib/personnages-scene.js');
const { STYLES, copierProjet } = require('./aide/projet.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const lu = P.lire(null);
const PLUME = ['enfant', 'ouvrier', 'passant'];
const VUES = [0, 45, 90, -90, 180];
const MEMBRES = ['jambeAvant', 'jambeArriere', 'brasAvant', 'brasArriere', 'cou'];
const gab = (n) => S.completerGabarit(P.gabaritDe(lu.dessins[n], lu));
const tracer = (n, pose = {}, options = {}) => PL.dessiner(S.calculer(pose, gab(n)), lu.dessins[n], gab(n), options);

test('plume : chaque membre fait de chemins ouverts, sans fermeture (Z), et sans filtre', () => {
  const poses = [{}, { cuisseAvant: -35, tibiaAvant: 40, cuisseArriere: 25, brasAvant: -40, avantBrasAvant: -70 }, { cuisseAvant: -90, tibiaAvant: 90, cuisseArriere: -90, tibiaArriere: 90 }];
  for (const n of PLUME) for (const vue of VUES) for (const pose of poses) for (const traits of [1, 2]) {
    const r = tracer(n, { ...pose, vue }, { traits });
    const membres = r.traces.filter((t) => t.membre);
    assert.ok(membres.length >= MEMBRES.length, `${n}, ${vue}°`);
    for (const t of membres) {
      assert.doesNotMatch(t.d, /[Zz]/, `${n}, ${vue}°, ${t.cle} : fermé`);
      assert.match(t.d, /^M[-\d. ]+(L[-\d. ]+)+$/, `${n}, ${vue}°, ${t.cle} : une ligne ouverte (M puis L)`);
    }
    // Deux traits : le papier entre eux est un chemin rempli, sans trait ; chaque trait s'arrête avant le bout.
    if (traits === 2) for (const m of MEMBRES) {
      const [papier, a, b] = ['papier', 'a', 'b'].map((k) => r.traces.find((t) => t.cle === `${m}/${k}`));
      assert.ok(papier && a && b, `${n}, ${m}`);
      assert.equal(papier.contour, 0);
      assert.ok(a.contour > 0 && b.contour > 0);
      // Chaque trait s'arrête avant le bout, à 0,4 et 0,9 fois la largeur du membre (le papier va jusqu'au bout).
      const pts = (d) => d.slice(1).split('L').map((q) => q.split(' ').map(Number));
      const long = (P) => P.slice(1).reduce((x, q, i) => x + Math.hypot(q[0] - P[i][0], q[1] - P[i][1]), 0);
      const P = pts(papier.d), H = PL.hauteur(gab(n)), largeur = (/^jambe/.test(m) ? 0.044 : /^bras/.test(m) ? 0.038 : 0.03) * H;
      assert.ok(Math.abs(long(P.slice(0, 17)) - long(pts(a.d)) - 0.4 * largeur) < 0.1, `${n}, ${m} : premier trait arrêté à 0,4 fois la largeur`);
      assert.ok(Math.abs(long(P.slice(17).reverse()) - long(pts(b.d)) - 0.9 * largeur) < 0.1, `${n}, ${m} : second trait arrêté à 0,9 fois la largeur`);
    }
  }
  // Aucun filtre : ni dans le module, ni dans ses tracés (le tremblé est tiré au tracé par main-levee.js).
  const code = lire('moteur', 'habillage-plume.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // (Array.prototype.filter n'est pas un filtre : seuls comptent l'attribut, la propriété CSS et les primitives SVG.)
  assert.doesNotMatch(code, /fe[A-Z][a-zA-Z]+|['"]filter['"]|filter\s*:|url\(#|mix-blend|backdrop/);
  assert.match(code, /\.graine\(/);
  assert.match(code, /\.alea\(/);
  assert.match(code, /pasEbullition/);
  // Trait : 1,4 % de la hauteur de la figure ; encre et papier par variables, jamais du noir pur.
  const r = tracer('passant');
  assert.equal(r.traces.find((t) => t.cle === 'jambeAvant/a').contour, Math.round(0.014 * PL.hauteur(gab('passant')) * 100) / 100);
  assert.match(PL.CSS, /var\(--pm-encre,#1c1c1c\)/);
  assert.match(PL.CSS, /var\(--pm-papier,#fdfcf8\)/);
  assert.doesNotMatch(PL.CSS, /#000\b|#000000|black/);
  assert.ok(Buffer.byteLength(lire('moteur', 'habillage-plume.js')) <= 20000, 'module ≤ 20 Ko');
});

test('plume : 5 vues rendues sans erreur ; traits: 1 rend un trait par membre', () => {
  for (const n of PLUME) for (const vue of VUES) {
    for (const traits of [1, 2]) {
      const r = tracer(n, { vue }, { traits });
      for (const t of r.traces) assert.doesNotMatch(t.d, /NaN|Infinity|undefined/, `${n}, ${vue}°, ${t.cle}`);
      for (const m of MEMBRES) assert.equal(r.traces.filter((t) => t.membre === m).length, traits === 1 ? 1 : 3, `${n}, ${vue}°, ${m}, traits ${traits}`);
      // traits: 1 : tête en disque cerclé (rayon rx dans les deux sens).
      if (traits === 1) assert.equal(r.traces.filter((t) => t.membre === 'torse').length, lu.dessins[n].vetements && lu.dessins[n].vetements.some((v) => ['manteau', 'robe'].includes(v.forme)) ? 0 : 1);
    }
  }
  // Le réglage du dessin : plume.traits vaut 1.
  const un = { ...lu.dessins.ouvrier, plume: { ...lu.dessins.ouvrier.plume, traits: 1 } };
  const r = PL.dessiner(S.calculer({}, gab('ouvrier')), un, gab('ouvrier'), {});
  for (const m of MEMBRES) assert.equal(r.traces.filter((t) => t.membre === m).length, 1, m);
  // De face et de dos, les jambes sont deux traits droits : les points de chaque trait sont alignés.
  for (const vue of [90, -90]) {
    const t = tracer('passant', { vue, cuisseAvant: -30, tibiaAvant: 50 }, { traits: 1 }).traces.find((x) => x.cle === 'jambeAvant');
    const pts = t.d.slice(1).split('L').map((p) => p.split(' ').map(Number));
    const [a, b] = [pts[0], pts[pts.length - 1]];
    const ecart = Math.max(...pts.map((p) => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1])));
    assert.ok(ecart < 0.25 * 0.014 * PL.hauteur(gab('passant')) + 0.05, `vue ${vue} : jambe droite (écart ${ecart})`);
  }
});

test('plume : l\'ourlet du manteau suit l\'écart des genoux', () => {
  // De profil, la foulée ouvre l'ourlet ; de face, l'écart des jambes aussi. L'ourlet est recalculé à chaque image.
  for (const [vue, cle] of [[0, (a) => ({ cuisseAvant: -a, tibiaAvant: a / 2, cuisseArriere: a, tibiaArriere: a / 3 })], [90, (a) => ({ ecartJambeAvant: a, ecartJambeArriere: a })]]) {
    const largeurs = [0, 8, 16, 24, 32].map((a) => {
      const r = tracer('passant', { vue, ...cle(a) });
      const genoux = S.calculer({ vue, ...cle(a) }, gab('passant')).articulations;
      return { a, largeur: r.ourlet.avant - r.ourlet.arriere, genoux: Math.abs(genoux.genouAvant[0] - genoux.genouArriere[0]) };
    });
    for (let i = 1; i < largeurs.length; i++) {
      assert.ok(largeurs[i].genoux > largeurs[i - 1].genoux, `vue ${vue} : les genoux s'écartent`);
      assert.ok(largeurs[i].largeur > largeurs[i - 1].largeur + 0.5, `vue ${vue} : ${JSON.stringify(largeurs)}`);
    }
  }
  // Le tracé du manteau change avec la pose (rien n'est figé d'une image à l'autre) ; la robe et la jupe suivent de même.
  const manteau = (pose) => tracer('passant', pose).traces.find((t) => t.cle === 'manteau').d;
  assert.notEqual(manteau({ cuisseAvant: -30, cuisseArriere: 25 }), manteau({}));
  const robe = (a) => tracer('enfant', { cuisseAvant: -a, cuisseArriere: a }).ourlet;
  assert.ok(robe(30).avant - robe(30).arriere > robe(0).avant - robe(0).arriere);
  const jupe = { ...lu.dessins.enfant, vetements: [{ forme: 'jupe' }] };
  const r = PL.dessiner(S.calculer({ cuisseAvant: -30, cuisseArriere: 30 }, gab('enfant')), jupe, gab('enfant'), {});
  assert.ok(r.traces.some((t) => t.cle === 'jupe') && r.traces.some((t) => t.cle === 'torse'));
});

test('plume : tracés purs, déterministes ; frémissement 0 par défaut ; pendants préparés, droits', () => {
  const pose = { vue: 45, cuisseAvant: -20, brasAvant: -30 };
  assert.deepEqual(tracer('passant', pose), tracer('passant', pose));
  // Une graine par personnage : deux personnages ne tremblent pas pareil ; frémissement 0 : le même tracé à chaque instant.
  assert.notDeepEqual(tracer('passant', pose, { graine: 'a' }).traces, tracer('passant', pose, { graine: 'b' }).traces);
  assert.deepEqual(tracer('passant', pose, { graine: 'a', pas: 0 }), tracer('passant', pose, { graine: 'a' }));
  assert.notDeepEqual(tracer('passant', pose, { graine: 'a', pas: 3 }).traces, tracer('passant', pose, { graine: 'a', pas: 4 }).traces);
  // Écharpe et objets : un pivot (point d'accroche) et un angle ; 0 par défaut, ils pendent droit sous leur pivot.
  const r = tracer('passant', { brasAvant: -25, avantBrasAvant: -40 });
  const A = S.calculer({ brasAvant: -25, avantBrasAvant: -40 }, gab('passant')).articulations;
  assert.deepEqual(r.accroches.objetAvant, [Math.round(A.mainAvant[0] * 100) / 100, Math.round(A.mainAvant[1] * 100) / 100]);
  assert.ok(r.accroches.echarpe);
  const xs = (d) => d.replace(/[MQLZ]/g, ' ').trim().split(/\s+/).map(Number).filter((_, i) => i % 2 === 0);
  const milieu = (d) => { const x = xs(d); return (Math.min(...x) + Math.max(...x)) / 2; };
  assert.ok(Math.abs(milieu(r.traces.find((t) => t.cle === 'objetAvant').d) - r.accroches.objetAvant[0]) < 0.05, 'la mallette pend droit sous la main');
  assert.ok(Math.abs(milieu(r.traces.find((t) => t.cle === 'echarpe/pan').d) - r.accroches.echarpe[0]) < 0.05, 'le pan de l\'écharpe pend droit');
  const penche = PL.dessiner(S.calculer({}, gab('passant')), lu.dessins.passant, gab('passant'), { angles: { objetAvant: 20, echarpe: -15 } });
  assert.notEqual(penche.traces.find((t) => t.cle === 'objetAvant').d, tracer('passant').traces.find((t) => t.cle === 'objetAvant').d);
  // Mêmes clés de tracé quelle que soit la pose (les chemins sont créés une fois, puis mis à jour).
  const cles = (pose2) => tracer('passant', pose2).traces.map((t) => t.cle);
  for (const vue of VUES) assert.deepEqual(cles({ vue }), cles({}), `vue ${vue}`);
});

test('galerie : 3 dessins plume, aucun visage', () => {
  const plume = Object.keys(lu.dessins).filter((n) => lu.dessins[n].maniere === 'plume').sort();
  assert.deepEqual(plume, PLUME);
  assert.deepEqual(lu.erreurs.map((e) => e.message), []);
  for (const n of PLUME) {
    const d = lu.dessins[n];
    for (const k of ['visage', 'pieces', 'accessoires', 'batonnets']) assert.equal(d[k], undefined, `${n} : ${k}`);
    assert.deepEqual(P.valider('dessin', d, Object.assign({ nom: n }, P.contexteDe(lu))), [], n);
    assert.equal(P.serialiser('dessin', d), lire('personnages', 'dessins', `${n}.json`), `${n} : au format d'écriture`);
    assert.match(d.description, /au trait de plume, sans visage$/, n);
    assert.doesNotMatch(d.description, /[A-ZÀ-Ý]/, n);
    // Aucun œil, aucune bouche dans ses tracés, dans aucune vue.
    for (const vue of VUES) for (const t of tracer(n, { vue }).traces) assert.doesNotMatch(t.cle, /oeil|bouche|sourcil|pupille|visage/, `${n} : ${t.cle}`);
    assert.equal(HAB.habillageDe(d), 'plume', n);
  }
  // Une personne en manteau avec une mallette ; un enfant ; une personne au travail avec une casquette.
  const v = (n) => lu.dessins[n].vetements || [];
  assert.ok(v('passant').some((x) => x.forme === 'manteau') && lu.dessins.passant.plume.objets.some((o) => o.forme === 'mallette'));
  assert.match(lu.dessins.enfant.description, /^un enfant/);
  assert.ok(2 * gab('enfant').tete.ry / PL.hauteur(gab('enfant')) > 1.4 * (2 * gab('passant').tete.ry / PL.hauteur(gab('passant'))), 'enfant : tête plus grande');
  assert.equal(lu.dessins.ouvrier.plume.chapeau.forme, 'casquette');
  assert.match(lu.dessins.ouvrier.description, /au travail/);
  // Adultes : tête d'environ 1/9,5 de la hauteur, bras d'environ 0,44 fois la hauteur, jambes du gabarit standard.
  for (const n of ['passant', 'ouvrier']) {
    const g = gab(n), H = PL.hauteur(g);
    assert.ok(Math.abs(H / (2 * g.tete.ry) - 9.5) < 0.6, `${n} : tête`);
    assert.ok(Math.abs((g.bras + g.avantBras) / H - 0.44) < 0.02, `${n} : bras`);
    assert.deepEqual([g.cuisse, g.tibia], [68, 68], n);
  }
  // Le format refuse un visage, des pièces, un réglage plume hors de la manière plume, une couleur inconnue, deux vêtements longs.
  const e = (d) => P.valider('dessin', d, Object.assign({ nom: d.nom }, P.contexteDe(lu))).join('\n');
  assert.match(e({ ...lu.dessins.passant, visage: lu.dessins.ecoliere.visage }), /« visage » : un dessin de la manière « plume » n'en a pas \(figures sans visage/);
  assert.match(e({ ...lu.dessins.passant, pieces: lu.dessins.ecoliere.pieces }), /« pieces » : un dessin de la manière « plume » n'en a pas/);
  assert.match(e({ ...lu.dessins.technicien, vetements: [{ forme: 'manteau' }] }), /réservés à la manière « plume »/);
  assert.match(e({ ...lu.dessins.passant, vetements: [{ forme: 'manteau', remplissage: 'violet' }] }), /remplissage « violet » : papier, encre ou une couleur du dessin/);
  assert.match(e({ ...lu.dessins.passant, vetements: [{ forme: 'manteau' }, { forme: 'robe' }] }), /un seul vêtement long/);
  assert.match(e({ ...lu.dessins.passant, plume: { chapeau: { forme: 'haut-de-forme' } } }), /forme « haut-de-forme » inconnue \(melon, casquette\)/);
  assert.match(e({ ...lu.dessins.passant, plume: { traits: 3 } }), /« traits » vaut 1/);
  assert.match(e({ ...lu.dessins.technicien, maniere: 'aquarelle' }), /inconnue \(traits, pieces ou plume\)/);
  // personnages liste : la manière plume.
  assert.match(lire('references', 'dessin-personnages.md'), /\*\*« plume »\*\*[^\n]*\*\*sans visage\*\*[^\n]*`passant`, `enfant`, `ouvrier`/);
  assert.match(lire('references', 'personnages.md'), /`passant`, `enfant`, `ouvrier` \(« plume »/);
});

test('dessiner-personnage : en manière plume, une seule figure avant l\'accord', () => {
  const skill = lire('skills', 'dessiner-personnage', 'SKILL.md');
  assert.match(skill, /\*\*Manière « plume »\*\*[^\n]*\*\*Une figure d'abord\*\* : en dessiner une seule, la montrer sur sa planche[^\n]*attendre l'accord de la personne avant d'en dessiner d'autres/);
  assert.match(skill, /--vues 0,45,90,-90,180/);
  assert.match(lire('references', 'dessin-personnages.md'), /\*\*Une figure d'abord\*\* : en manière plume, dessiner \*\*une seule\*\* figure, la montrer sur sa planche[^\n]*attendre l'accord de la personne avant d'en dessiner d'autres/);
  // Même règle dans style : un style personnel dérivé de plume montre un coin de décor d'abord.
  assert.match(lire('skills', 'style', 'SKILL.md'), /Base `plume` : un coin de décor d'abord \(la scène `titre` seule\), regardé et accepté avant toute autre scène\./);
});

test('plume : registre, refus dans la scène, groupes du moteur (main-levee sans le calque)', () => {
  assert.equal(HAB.habillages.plume.fichier, 'habillage-plume.js');
  assert.equal(HAB.habillageDe(lu.dessins.touffu), 'pieces');
  assert.deepEqual(HAB.besoins('modules', ['plume']), ['dessin/main-levee.js']);
  assert.deepEqual(GM.GROUPES['habillage-plume'], ['habillage-plume.js']);
  const essai = (html) => preparerPersonnages(`<section data-scene="s">${html}</section>`, { scene: 's', lu });
  const p = essai('<div data-personnage="passant"></div>');
  assert.deepEqual([p.erreurs, [...p.utilises.habillages]], [[], ['plume']]);
  const refus = essai('<div data-personnage="passant" data-habillage="pieces"></div>');
  assert.match(refus.erreurs[0].message, /data-habillage="pieces" refusé : un dessin de la manière « plume » se dessine seulement en plume/);
  assert.deepEqual([...refus.utilises.habillages], ['plume']);
  const autre = essai('<div data-personnage="touffu" data-habillage="plume"></div>');
  assert.match(autre.erreurs[0].message, /refusé : l'habillage plume ne dessine que les dessins de la manière « plume »/);
  assert.deepEqual([...autre.utilises.habillages], ['pieces']);
  // Assemblée : le module plume et main-levee, sans le calque de dessin ni le relevé.
  const dir = copierProjet('projet-simple');
  fs.writeFileSync(path.join(dir, 'scenes', '02-chiffre.html'), '<section data-scene="chiffre"><div data-personnage="passant" data-x="40"><i data-action="marcher" data-vers="60" data-start="0" data-dur="2"></i></div></section>');
  const a = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.deepEqual(a.erreurs.filter((x) => x.gravite === 'erreur'), []);
  assert.deepEqual(a.groupes.filter((g) => /habillage|main-levee|dessin|releve/.test(g)), ['habillage-plume', 'main-levee']);
  assert.match(a.moteur, /pm-plume/);
  assert.doesNotMatch(a.moteur, /data-piece|pm-perso-touffe-trait/);
  // Une vidéo à calque de dessin garde ses modules : main-levee vient avec le dessin, dans le même ordre.
  assert.deepEqual(GM.modulesDesGroupes(['tronc', 'dessin', 'main-levee', 'releve']).filter((m) => /dessin\//.test(m)),
    ['dessin/main-levee.js', 'dessin/geometrie.js', 'dessin/calque.js', 'dessin/graphiques.js', 'dessin/code.js', 'dessin/composants.js']);
});

test('planche --suivre : fenêtre à images exactes, cadre centré, agrandi quatre fois au plus proche voisin', () => {
  // Images exactes de l'horloge : k / ips, k entier, même quand la scène ne commence pas sur une image.
  assert.deepEqual(SU.imagesFenetre({ debut: 1.01, de: 0, duree: 0.2, pas: 2, ips: 30 }), [31, 33, 35]);
  // Cadre de taille fixe centré sur la boîte (à un demi-pixel près : coin entier).
  for (const b of [[10, 20, 30, 41], [10.3, 20.7, 30, 40], [-5, -5, 10, 10]]) {
    const c = SU.cadreAutour(b, 50, 60);
    assert.ok(Math.abs(c.centre[0] - (b[0] + b[2] / 2)) <= 0.5 && Math.abs(c.centre[1] - (b[1] + b[3] / 2)) <= 0.5, JSON.stringify(c));
    assert.ok(Number.isInteger(c.x) && Number.isInteger(c.y));
  }
  // Agrandi quatre fois, sans lissage : chaque pixel devient un carré de 4 × 4 identique ; hors de l'image, du gris.
  const image = { largeur: 3, hauteur: 2, canaux: 3, donnees: Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30, 40, 50, 60, 70, 80, 90]) };
  const g = SU.recadrerAgrandir(image, { x: 1, y: 0, l: 3, h: 2 });
  assert.deepEqual([g.largeur, g.hauteur], [12, 8]);
  const px = (x, y) => Array.from(g.donnees.slice((y * 12 + x) * 4, (y * 12 + x) * 4 + 4));
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { assert.deepEqual(px(x, y), [0, 255, 0, 255]); assert.deepEqual(px(4 + x, 4 + y), [70, 80, 90, 255]); }
  assert.deepEqual(px(8, 0), [128, 128, 128, 255], 'hors de l\'image : gris');
  assert.equal(SU.AGRANDISSEMENT, 4);
  assert.equal(SU.nomCible('#a > .Élan'), 'a-elan');
  assert.match(SU.verifierSuivre({ cible: 'passant', de: 0, duree: 4, pas: null }), /3 s au plus/);
  assert.match(SU.verifierSuivre({ cible: '', de: 0, duree: null, pas: null }), /donner l'élément à suivre/);
  assert.equal(SU.verifierSuivre({ cible: 'passant', de: 0.5, duree: 1, pas: 2 }), null);
  // La commande : pulse-motion planche <dossier> --suivre … passe par planche-suivre.js ; décrite pour l'animateur et le critique.
  assert.match(lire('scripts', 'pm.js'), /if \(reste\.includes\('--suivre'\)\) return executer\(\[path\.join\(RACINE, 'scripts', 'planche-suivre\.js'\)/);
  assert.match(lire('references', 'controles.md'), /pulse-motion planche \. --suivre <personnage\|sélecteur>/);
  assert.match(lire('references', 'mouvement-vivant.md'), /pulse-motion planche \. --suivre <personnage ou #id>/);
});

test('notices : line-art-animation cité pour l\'habillage plume et la planche qui suit ; les deux notices identiques', () => {
  const racine = fs.readFileSync(path.join(RACINE, '..', '..', 'THIRD-PARTY-NOTICES.md'), 'utf8');
  assert.equal(racine, lire('THIRD-PARTY-NOTICES.md'));
  const entree = racine.slice(racine.indexOf('## line-art-animation'));
  assert.ok(racine.includes('## line-art-animation'));
  assert.match(entree, /Copyright \(c\) 2026 JDhruv14/);
  assert.match(entree, /habillage-plume\.js/);
  assert.match(entree, /planche-suivre\.js/);
});
