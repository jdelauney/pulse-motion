'use strict';
/* Spec S11 « Styles, seconde bibliothèque », jalon J1 « Socle » (5.1) : polices partagées à la racine du plugin, liste des
 * styles par genre pour 47 styles, extrait de l'animateur allégé, registre des habillages. Le rendu des personnages dans
 * la page (empreinte avant et après le registre) : socle-s11-page.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../scripts/styles.js');
const F = require('../scripts/lib/fiche-style.js');
const Police = require('../scripts/lib/police.js');
const { assembler } = require('../scripts/assembler.js');
const { projetBoucle } = require('../scripts/lib/temoin.js');
const { credits } = require('../scripts/lib/livrables.js');
const { CATEGORIES, SECTIONS_ANIMATEUR, SECTIONS_FICHE } = require('../scripts/lib/contrat.js');
const { preparerPersonnages } = require('../scripts/lib/personnages-scene.js');
const Pers = require('../scripts/lib/personnages.js');
const HAB = require('../moteur/personnages/habillages.js');
const { modifierJSON, dossierPersonnelEssai } = require('./aide/styles.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');
const LIVRES_DIR = path.join(RACINE, 'styles');
// Les 20 styles livrés au moment de la migration des polices (0.73.0).
const VINGT = ['carnet', 'chaleureux', 'clair-pedagogique', 'crayon', 'editorial', 'energique', 'info-sans-son', 'iso-album', 'iso-infographie', 'lancement', 'minimal', 'mode-d-emploi', 'papier-decoupe', 'pictogrammes', 'plan-technique', 'recit-donnees', 'riso', 'tableau-blanc', 'tableau-noir', 'tech-sombre'];
const octets = (t) => Buffer.byteLength(t, 'utf8');
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const fiche = (style) => fs.readFileSync(path.join(RACINE, 'references', 'styles', `${style}.md`), 'utf8');

function avecPersonnel(fn) {
  const avant = process.env.PULSE_MOTION_DOSSIER;
  process.env.PULSE_MOTION_DOSSIER = dossierPersonnelEssai();
  const fin = () => { if (avant === undefined) delete process.env.PULSE_MOTION_DOSSIER; else process.env.PULSE_MOTION_DOSSIER = avant; };
  try {
    const r = fn(process.env.PULSE_MOTION_DOSSIER);
    if (r && typeof r.then === 'function') return r.finally(fin);
    fin();
    return r;
  } catch (e) { fin(); throw e; }
}

/** Le style tel qu'avant la migration : ses polices partagées recopiées dans son dossier polices/, sans partagees.json. */
function styleAvantMigration(style) {
  const racine = dossierTemporaire('pm-avant-polices-');
  const d = path.join(racine, style);
  fs.cpSync(path.join(LIVRES_DIR, style), d, { recursive: true });
  const decl = Police.declarationPartagees(d) || {};
  for (const famille of Object.keys(decl)) {
    for (const f of Police.policesPartagees(famille, d)) fs.copyFileSync(f.fichier, path.join(d, 'polices', path.basename(f.fichier)));
  }
  fs.rmSync(path.join(d, 'polices', Police.PARTAGEES), { force: true });
  return { racine, dossier: d };
}

/** Boucle témoin d'un style assemblée : page et crédits. */
function boucle(dossierStyle, racine) {
  const projet = projetBoucle({ dossierStyle });
  try {
    const r = assembler({ dossier: projet, dossierStyles: [racine], ecrire: false });
    assert.deepEqual(r.erreurs.filter((e) => e.gravite === 'erreur'), [], path.basename(dossierStyle));
    const deroule = JSON.parse(fs.readFileSync(path.join(projet, 'deroule.json'), 'utf8'));
    return { html: r.html, credits: credits({ projet, deroule, assemblage: r, version: 'x' }).texte, fichiers: r.polices };
  } finally { fs.rmSync(projet, { recursive: true, force: true, maxRetries: 3 }); }
}

// ---------- 5.1 point 1 : polices partagées ----------

test('polices partagées : page assemblée identique octet pour octet pour la vidéo témoin de chacun des 20 styles, avant et après', () => {
  const styles = fs.readdirSync(LIVRES_DIR).sort();
  for (const s of VINGT) assert.ok(styles.includes(s), s);
  const familles = fs.readdirSync(Police.POLICES_PARTAGEES).sort();
  assert.deepEqual(familles, ['Archivo', 'Barlow', 'Barlow Condensed', 'Fraunces', 'Instrument Sans', 'Kalam', 'Nunito Sans', 'Schibsted Grotesk']);
  const declares = new Map();
  for (const style of styles) {
    const avant = styleAvantMigration(style);
    const a = boucle(avant.dossier, avant.racine);
    const b = boucle(path.join(LIVRES_DIR, style), LIVRES_DIR);
    assert.ok(a.html === b.html, `${style} : page différente (${sha(a.html).slice(0, 12)} avant, ${sha(b.html).slice(0, 12)} après)`);
    assert.equal(b.credits, a.credits, `${style} : crédits`);
    assert.ok(a.fichiers.length >= 1, `${style} : des polices embarquées`);
    // L'empreinte de base (styles personnels « base modifiée ») ne change pas : aucun style personnel n'est signalé.
    assert.equal(S.empreinteBase(S.trouverStyle(style, [LIVRES_DIR])), S.empreinteBase(S.trouverStyle(style, [avant.racine])), `${style} : empreinte de base`);
    assert.deepEqual(S.verifierStyle(path.join(LIVRES_DIR, style)).erreurs, [], style);
    const decl = Police.declarationPartagees(path.join(LIVRES_DIR, style)) || {};
    for (const [famille, fichiers] of Object.entries(decl)) for (const f of fichiers) declares.set(`${famille}/${f}`, (declares.get(`${famille}/${f}`) || 0) + 1);
  }
  // Un seul exemplaire de chaque fichier de police : aucun nom de fichier dans deux dossiers de styles, ni dans un style et
  // dans les polices partagées ; chaque famille partagée sert au moins deux styles, chaque fichier partagé au moins un.
  const vus = new Map();
  for (const style of styles) {
    for (const f of fs.readdirSync(path.join(LIVRES_DIR, style, 'polices')).filter((x) => /\.(woff2?|ttf|otf)$/.test(x))) {
      assert.ok(!vus.has(f), `${f} : dans ${vus.get(f)} et ${style}`);
      vus.set(f, style);
    }
  }
  for (const famille of familles) {
    const dans = path.join(Police.POLICES_PARTAGEES, famille);
    const fichiers = fs.readdirSync(dans).filter((x) => x.endsWith('.woff2'));
    assert.match(fs.readFileSync(path.join(dans, 'LICENCES.md'), 'utf8'), new RegExp(`^## ${famille}\\n\\n- Source : .+\\n- Licence : .+`, 'm'), famille);
    for (const f of fichiers) {
      assert.ok(!vus.has(f), `${f} : partagé et copié dans ${vus.get(f)}`);
      assert.ok(declares.get(`${famille}/${f}`) >= 1, `${famille}/${f} : embarqué par aucun style`);
      assert.match(f, new RegExp(`^${famille}-\\d{3}(-italic)?\\.woff2$`), f);
    }
    assert.ok(styles.filter((s) => (Police.declarationPartagees(path.join(LIVRES_DIR, s)) || {})[famille]).length >= 2, `${famille} : un seul style`);
  }
});

test('polices partagées : un style personnel avec ses polices/ reste valide', () => avecPersonnel((perso) => {
  const dossierPerso = path.join(perso, 'styles');
  // Style personnel d'avant (0.72.0) : une copie d'editorial avec ses propres fichiers de polices et leur licence.
  const ancien = path.join(dossierPerso, 'ma-marque');
  fs.cpSync(path.join(LIVRES_DIR, 'editorial'), ancien, { recursive: true });
  for (const f of Police.policesPartagees('Fraunces', ancien).concat(Police.policesPartagees('Instrument Sans', ancien))) fs.copyFileSync(f.fichier, path.join(ancien, 'polices', path.basename(f.fichier)));
  fs.rmSync(path.join(ancien, 'polices', Police.PARTAGEES));
  for (const f of ['catalogue.json', 'identite.json']) modifierJSON(path.join(ancien, f), (j) => { j.style = 'ma-marque'; });
  const v = S.verifierStyle(ancien);
  assert.deepEqual(v.erreurs, []);
  // Ses fichiers à lui sont embarqués, pas ceux du plugin.
  const a = boucle(ancien, dossierPerso);
  assert.ok(a.fichiers.length && a.fichiers.every((f) => path.resolve(f).startsWith(path.resolve(ancien))), a.fichiers.join(', '));
  // Une police à lui d'une famille partagée passe avant celle du plugin ; sans le fichier ni la licence, une erreur.
  assert.deepEqual(Police.fichiersPoliceStyle('Fraunces', ancien).map((f) => path.dirname(f.fichier)), [path.join(ancien, 'polices'), path.join(ancien, 'polices'), path.join(ancien, 'polices')]);
  fs.writeFileSync(path.join(ancien, 'polices', 'LICENCES.md'), '# Licences\n');
  assert.match(S.verifierStyle(ancien).erreurs.join('\n'), /Police « Fraunces » : licence absente de polices\/LICENCES\.md/);
  // Style personnel créé aujourd'hui depuis un style livré : il reprend la déclaration et trouve les polices partagées.
  const r = require('../scripts/style-perso.js').nouveauStyle({ nom: 'mon-album', depuis: 'iso-album' });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(S.verifierStyle(r.dossier).erreurs, []);
  const b = boucle(r.dossier, dossierPerso);
  assert.ok(b.fichiers.every((f) => path.resolve(f).startsWith(path.resolve(Police.POLICES_PARTAGEES))), b.fichiers.join(', '));
  const faces = (html) => html.match(/@font-face \{[^}]*\}/g);
  assert.deepEqual(faces(b.html), faces(boucle(path.join(LIVRES_DIR, 'iso-album'), LIVRES_DIR).html));
  // Une déclaration fausse est dite (famille ou fichier absents des polices partagées).
  fs.writeFileSync(path.join(r.dossier, 'polices', Police.PARTAGEES), JSON.stringify({ Fraunces: ['Fraunces-900.woff2'], Inconnue: ['Inconnue-400.woff2'], 'Nunito Sans': ['Nunito Sans-400.woff2'] }));
  const e = S.verifierStyle(r.dossier).erreurs.join('\n');
  assert.match(e, /« Fraunces » : fichier « Fraunces-900\.woff2 » absent \(fichiers : Fraunces-400\.woff2, Fraunces-400-italic\.woff2, Fraunces-600\.woff2\)/);
  assert.match(e, /famille « Inconnue » absente des polices partagées du plugin/);
  assert.match(e, /Police « Fraunces » \(charte\.polices\.titres\) : aucun fichier/);
  // Sans déclaration, toutes les graisses de la famille.
  fs.rmSync(path.join(r.dossier, 'polices', Police.PARTAGEES));
  assert.equal(Police.fichiersPoliceStyle('Fraunces', r.dossier).length, 3);
  assert.deepEqual(Police.policesPartagees('../styles', r.dossier), []);
}));

// ---------- 5.1 point 2 : styles --genre ----------

test('styles --genre : au plus 6 Ko avec 47 styles et 5 styles personnels', () => avecPersonnel((perso) => {
  // Les 20 styles livrés et 27 styles nouveaux fabriqués, répartis dans les catégories comme à la fin de la spec (5.1 point 5) ;
  // chacun copie l'identité d'un style livré de sa catégorie (personnalité et usages de longueur réelle).
  const racine = dossierTemporaire('pm-47-styles-');
  const fabriquer = (nom, depuis, categorie) => {
    const d = path.join(racine, nom);
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'style.css'), '');
    fs.copyFileSync(path.join(LIVRES_DIR, depuis, 'catalogue.json'), path.join(d, 'catalogue.json'));
    fs.copyFileSync(path.join(LIVRES_DIR, depuis, 'identite.json'), path.join(d, 'identite.json'));
    for (const f of ['catalogue.json', 'identite.json']) modifierJSON(path.join(d, f), (j) => { j.style = nom; if (f === 'identite.json') j.categorie = categorie; });
  };
  for (const s of VINGT) fabriquer(s, s, JSON.parse(fs.readFileSync(path.join(LIVRES_DIR, s, 'identite.json'), 'utf8')).categorie);
  const NOUVEAUX = { dessine: [4, 'carnet'], 'schemas-donnees': [5, 'iso-infographie'], 'papier-imprime': [5, 'papier-decoupe'], 'ecrans-annonces': [8, 'info-sans-son'], anime: [5, 'mode-d-emploi'] };
  const nouveaux = [];
  for (const [categorie, [n, depuis]] of Object.entries(NOUVEAUX)) {
    for (let i = 1; i <= n; i++) { const nom = `${categorie.split('-')[0]}-nouveau-${i}`; fabriquer(nom, depuis, categorie); nouveaux.push(nom); }
  }
  assert.equal(fs.readdirSync(racine).length, 47);
  assert.equal(nouveaux.length, 27);
  // Chaque style nouveau entre dans le « aussi » d'un genre (5.1 point 6), à tour de rôle.
  const table = JSON.parse(fs.readFileSync(path.join(RACINE, 'references', 'styles', 'recommandation.json'), 'utf8'));
  const genres = Object.keys(table);
  nouveaux.forEach((nom, i) => table[genres[i % genres.length]].aussi.push(nom));
  // 5 styles personnels vérifiés du genre « formation », copies complètes de styles livrés.
  const persos = path.join(perso, 'styles');
  ['iso-infographie', 'papier-decoupe', 'pictogrammes', 'mode-d-emploi', 'plan-technique'].forEach((depuis, i) => {
    const d = path.join(persos, `perso-${i + 1}`);
    fs.cpSync(path.join(LIVRES_DIR, depuis), d, { recursive: true });
    for (const f of ['catalogue.json', 'identite.json']) modifierJSON(path.join(d, f), (j) => { j.style = `perso-${i + 1}`; if (f === 'identite.json') j.genres = ['formation']; });
    assert.deepEqual(S.verifierStyle(d).erreurs, [], depuis);
    S.marquerVerifie(d);
  });
  for (const genre of genres) {
    const classement = S.classerPourGenre(genre, [racine, persos], table);
    assert.equal(classement.enAvant.length + classement.reste.length, 52, genre);
    const liste = S.listePourGenre(classement);
    const sortie = JSON.stringify(liste);
    assert.ok(octets(sortie) <= 6000, `${genre} : ${octets(sortie)} o`);
    // Forme courte (une ligne) de chaque style mis en avant, dans l'ordre : recommandés, personnels du genre, contraste, aussi.
    const nommes = S.nommesPourGenre(classement);
    assert.deepEqual(liste.slice(0, nommes.length), nommes.map(S.ligneCourte), genre);
    assert.deepEqual(nommes.slice(0, 2).map((f) => f.style), table[genre].recommandes, genre);
    for (const l of liste.slice(0, nommes.length)) assert.match(l, /^[a-z0-9-]+ · [a-z-]+ · [^·]+, [^·]+, [^·]+ · [^·]+ ; [^·]+ ; [^·]+( · personnel)?$/, l);
    // Le reste : une ligne par catégorie, dans l'ordre des catégories, qui compte ses styles.
    const lignes = liste.slice(nommes.length);
    const ordre = lignes.map((l) => /^\d+ autres? styles? ([a-z-]+) : styles chercher <mots> ou styles choisir --categorie \1$/.exec(l)[1]);
    assert.deepEqual(ordre, CATEGORIES.map((c) => c.id).filter((c) => ordre.includes(c)), genre);
    assert.equal(lignes.reduce((n, l) => n + Number(/^\d+/.exec(l)[0]), 0) + nommes.length, 52, genre);
  }
  const formation = S.listePourGenre(S.classerPourGenre('formation', [racine, persos], table));
  assert.deepEqual(formation.slice(2, 7).map((l) => l.split(' · ')[0]), ['perso-1', 'perso-2', 'perso-3', 'perso-4', 'perso-5']);
  assert.ok(formation.slice(2, 7).every((l) => l.endsWith(' · personnel')));
  // Les six catégories restent (5.1 point 5).
  assert.deepEqual(CATEGORIES.map((c) => c.id), ['essentiels', 'dessine', 'schemas-donnees', 'papier-imprime', 'ecrans-annonces', 'anime']);
}));

// ---------- 5.1 point 3 : extrait animateur ----------

test('extrait animateur : § 8 réduit aux noms et recettes ; les 20 extraits diminuent', () => {
  for (const style of VINGT) {
    const t = fiche(style);
    const extrait = F.extraitAnimateur(t);
    // L'extrait d'avant : les mêmes sections, entières.
    const { entete, sections } = F.decouper(t);
    const avant = entete + SECTIONS_ANIMATEUR.map((x) => sections.find((s) => s.titre === x).texte.replace(/\n*$/, '\n')).join('\n');
    assert.ok(octets(extrait) < octets(avant), `${style} : ${octets(extrait)} o, ${octets(avant)} avant`);
    assert.ok(octets(extrait) <= F.EXTRAIT_MAX, style);
    const huit = F.section(extrait, SECTIONS_FICHE[8]).split('\n').filter((l) => l.trim());
    const gestes = F.gestes(t);
    assert.equal(huit.length, gestes.length, style);
    huit.forEach((l, i) => {
      assert.doesNotMatch(l, /Convient à/, `${style} : ${l}`);
      assert.match(l, /^- \*\*[^*]+\*\* \*Recette :\* \S/, `${style} : ${l}`);
      assert.ok(l.startsWith(`- **${gestes[i].nom}`) && l.endsWith(`*Recette :* ${gestes[i].recette}`), `${style} : ${l}`);
    });
    // Les autres sections lues par l'animateur sont entières ; la fiche entière garde « Convient à ».
    for (const titre of SECTIONS_ANIMATEUR.filter((x) => x !== SECTIONS_FICHE[8])) assert.equal(F.section(extrait, titre).trim(), F.section(t, titre).trim(), `${style} : ${titre}`);
    assert.match(F.section(t, SECTIONS_FICHE[8]), /\*Convient à :\*/);
  }
  // Un geste sans recette (guide d'un style personnel) reste entier.
  const premier = F.section(fiche('minimal'), SECTIONS_FICHE[8]).split('\n').find((l) => /^- \*\*/.test(l));
  const guide = fiche('minimal').replace(premier, premier.replace(/^(- \*\*[^*]+\*\*).*$/, '$1 Un geste décrit sans recette.'));
  assert.match(F.section(F.extraitAnimateur(guide), SECTIONS_FICHE[8]), /^- \*\*[^*]+\*\* Un geste décrit sans recette\.$/m);
});

// ---------- 5.1 point 4 : registre des habillages ----------

test('habillages : un habillage inconnu est refusé avec la liste du registre', () => {
  const lu = Pers.lire(null);
  const scene = (corps) => `<section data-scene="s">${corps}</section>`;
  const essai = (corps) => preparerPersonnages(scene(corps), { scene: 's', lu });
  const liste = `habillages : ${HAB.NOMS.join(', ')} ; ${HAB.DEFAUT} par défaut`;
  // 0.76.0 (S11 J4) : l'habillage plume rejoint le registre.
  assert.equal(liste, 'habillages : pieces, batonnets, plume ; pieces par défaut');
  // 0.76.0 : « plume » est maintenant connu (refusé sur un dessin d'une autre manière : plume.test.js) ; « pixel » ne l'est pas.
  for (const inconnu of ['pixel', 'constructor', '']) {
    const r = essai(`<div data-personnage="touffu" data-habillage="${inconnu}"></div>`);
    assert.deepEqual(r.erreurs.map((e) => e.message), [`Scène « s » : personnage « touffu » : data-habillage="${inconnu}" inconnu (${liste}).`], inconnu);
    // La page assemblée malgré l'erreur le dessine dans l'habillage par défaut : celui-ci est embarqué.
    assert.deepEqual([...r.utilises.habillages], [HAB.DEFAUT]);
  }
  // Les habillages connus passent ; chacun est noté pour l'assemblage (seulement ceux d'une scène).
  assert.deepEqual([...essai('<div data-personnage="touffu"></div>').utilises.habillages], ['pieces']);
  assert.deepEqual([...essai('<div data-personnage="touffu" data-habillage="pieces"></div>').utilises.habillages], ['pieces']);
  const b = essai('<div data-personnage="touffu" data-habillage="batonnets"></div><div data-personnage="batonnets"></div>');
  assert.deepEqual([b.erreurs, [...b.utilises.habillages], [...b.utilises.batonnets]], [[], ['batonnets'], ['touffu']]);
  // Un habillage qui demande un réglage absent du dessin est refusé.
  assert.match(essai('<div data-personnage="technicien" data-habillage="batonnets"></div>').erreurs[0].message, /ce dessin n'a pas de réglage bâtonnets/);
  // Un personnage inconnu : la liste des dessins et des habillages sans dessin.
  assert.match(essai('<div data-personnage="zzz"></div>').erreurs[0].message, /ou « batonnets »\)\.$/);
});
