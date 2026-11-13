'use strict';
/* Spec Styles et réalisation, jalon J1 (5.1 à 5.4) : fiches de style en 11 sections, identité complète,
 * migration des 6 styles sans changer leur rendu, liste et recherche des styles. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const S = require('../scripts/styles.js');
const F = require('../scripts/lib/fiche-style.js');
const { SECTIONS_FICHE, SECTIONS_ANIMATEUR, TYPES_ENTREE, CATEGORIES } = require('../scripts/lib/contrat.js');
const { controler } = require('../scripts/controler.js');
const { projetCatalogue } = require('./aide/catalogue.js');
const { CLAIR, modifierJSON, stylesEssai, dossierPersonnelEssai } = require('./aide/styles.js');

const RACINE = path.join(__dirname, '..');
// Les six styles migrés (J1) ; les styles livrés : les six, la vague A (S8 J6), la vague B (S8 J7), la vague C (S8 J8), la vague D (S8 J9)
// et mode-d-emploi (S8 J10).
const ESSENTIELS = ['chaleureux', 'clair-pedagogique', 'editorial', 'energique', 'minimal', 'tech-sombre'];
const LIVRES = ['carnet', 'chaleureux', 'clair-pedagogique', 'crayon', 'editorial', 'energique', 'info-sans-son', 'iso-album', 'iso-infographie', 'lancement', 'minimal', 'mode-d-emploi', 'papier-decoupe', 'pictogrammes', 'plan-technique', 'recit-donnees', 'riso', 'tableau-blanc', 'tableau-noir', 'tech-sombre'];
const CATEGORIE = { 'info-sans-son': 'ecrans-annonces', lancement: 'ecrans-annonces', 'plan-technique': 'schemas-donnees',
  'tableau-blanc': 'dessine', 'tableau-noir': 'dessine', carnet: 'dessine', 'recit-donnees': 'schemas-donnees', 'iso-infographie': 'schemas-donnees', 'iso-album': 'schemas-donnees',
  crayon: 'dessine', 'papier-decoupe': 'papier-imprime', riso: 'papier-imprime', pictogrammes: 'schemas-donnees', 'mode-d-emploi': 'anime' };
const fiche = (style) => fs.readFileSync(path.join(RACINE, 'references', 'styles', `${style}.md`), 'utf8');
const identite = (style) => JSON.parse(fs.readFileSync(path.join(RACINE, 'styles', style, 'identite.json'), 'utf8'));
const octets = (t) => Buffer.byteLength(t, 'utf8');
const pm = (args, env = {}) => spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'pm.js'), ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
const titres = (t) => [...t.matchAll(/^## (.+)$/gm)].map((m) => m[1]);

function avecPersonnel(fn) {
  const avant = process.env.PULSE_MOTION_DOSSIER;
  process.env.PULSE_MOTION_DOSSIER = dossierPersonnelEssai();
  try { return fn(process.env.PULSE_MOTION_DOSSIER); } finally {
    if (avant === undefined) delete process.env.PULSE_MOTION_DOSSIER; else process.env.PULSE_MOTION_DOSSIER = avant;
  }
}

/** Copie d'un style livré sous un autre nom, dans <racine>/<nom>. */
function copier(racine, depuis, nom, modifier = () => {}) {
  const d = path.join(racine, nom);
  fs.cpSync(path.join(RACINE, 'styles', depuis), d, { recursive: true });
  modifierJSON(path.join(d, 'catalogue.json'), (j) => { j.style = nom; });
  modifierJSON(path.join(d, 'identite.json'), (j) => { j.style = nom; modifier(j); });
  return d;
}

// ---------- 5.1 La fiche de style en 11 sections ----------

test('fiche de style : les 11 sections dans l\'ordre, avec leurs titres exacts', () => {
  for (const style of LIVRES) {
    const t = fiche(style);
    assert.match(t, new RegExp(`^# Style « ${style} »\\n\\n> .+\\n> Sources : .+\\n\\n## L'essentiel\\n`), style);
    assert.deepEqual(titres(t), SECTIONS_FICHE, style);
  }
  assert.equal(SECTIONS_FICHE.length, 12, 'L\'essentiel et les 11 sections');
});

test('fiche de style : au plus 8 Ko, extrait « animateur » au plus 4 Ko', () => {
  for (const style of LIVRES) {
    const t = fiche(style);
    assert.ok(octets(t) <= 8000, `${style} : ${octets(t)} o`);
    assert.ok(octets(F.extraitAnimateur(t)) <= 4000, `${style} : extrait de ${octets(F.extraitAnimateur(t))} o`);
  }
});

test('fiche de style : chaque numéro, classe, son, transition et shader cité existe', () => {
  for (const style of LIVRES) {
    assert.deepEqual(F.verifierFiche(fiche(style), { dossierStyle: path.join(RACINE, 'styles', style), identite: identite(style) }), [], style);
  }
  // La vérification attrape bien un nom inventé.
  const faux = fiche('clair-pedagogique')
    .replace('#025', '#999').replace('`.trait`', '`.trait-imaginaire`').replace('`carillon`', '`fanfare`')
    .replace('- Transitions : `fondu`', '- Transitions : `tourbillon`').replace('`grain` léger', '`brume` léger');
  const erreurs = F.verifierFiche(faux, { dossierStyle: path.join(RACINE, 'styles', 'clair-pedagogique'), identite: identite('clair-pedagogique') }).join('\n');
  for (const nom of ['#999', '.trait-imaginaire', 'fanfare', 'tourbillon', 'brume']) assert.ok(erreurs.includes(nom), `${nom} non signalé`);
});

test('fiches : chaque bruitage cité au § 7 est dans son.bruitages et dans le catalogue', () => {
  const { BRUITAGES } = require('../moteur/synthe/catalogue.js');
  for (const style of LIVRES) {
    const cites = [...F.section(fiche(style), SECTIONS_FICHE[7]).matchAll(/`([a-z-]+)`/g)].map((m) => m[1]).filter((n) => BRUITAGES.includes(n));
    assert.ok(cites.length >= 2, style);
  }
  const avec = fiche('clair-pedagogique').replace('point → `pop`', 'point → `blip`');
  assert.match(F.verifierFiche(avec, { dossierStyle: path.join(RACINE, 'styles', 'clair-pedagogique'), identite: identite('clair-pedagogique') }).join('\n'), /bruitage « blip » absent de son\.bruitages/);
});

test('fiche de style : § 6 contient un tableau mouvement / exprime / peut servir', () => {
  for (const style of LIVRES) {
    const six = F.section(fiche(style), SECTIONS_FICHE[6]);
    assert.match(six, /^\| Mouvement \| Ce qu'il exprime \| Peut servir \|\n\|---\|---\|---\|\n(\| .+ \|\n){2,}/m, style);
    assert.match(six, /#0(36|37|56|57|59|60|61|86)/, `${style} : un numéro de caméra du dictionnaire`);
  }
});

test('fiche de style : § 8 a au moins trois gestes, chacun avec une recette et trois « convient à »', () => {
  for (const style of LIVRES) {
    const g = F.gestes(fiche(style));
    assert.ok(g.length >= 3, style);
    for (const x of g) {
      assert.ok(x.nom && x.recette, `${style} : ${x.nom}`);
      assert.ok(x.convient.length >= 3, `${style} : ${x.nom} (${x.convient.join(' ; ')})`);
    }
  }
});

test('reference styles/<style> --pour animateur : seulement les sections prévues', () => {
  for (const style of LIVRES) {
    const r = pm(['reference', `styles/${style}`, '--pour', 'animateur']);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(titres(r.stdout), SECTIONS_ANIMATEUR, style);
    assert.match(r.stdout, new RegExp(`^# Style « ${style} »\\n\\n> `), 'en-tête gardé');
    assert.equal(r.stdout, F.extraitAnimateur(fiche(style)));
    assert.ok(octets(r.stdout) <= 4000, style);
  }
  assert.equal(pm(['reference', 'styles/minimal', '--pour', 'critique']).status, 2);
  assert.equal(pm(['reference', 'moteur', '--pour', 'animateur']).status, 2);
  // L'agent animateur lit l'extrait.
  assert.match(fs.readFileSync(path.join(RACINE, 'agents', 'animateur.md'), 'utf8'), /pulse-motion reference styles\/<style> --pour animateur/);
});

test('reference styles/<style> sans option : la fiche entière (comportement actuel)', () => avecPersonnel((perso) => {
  for (const style of LIVRES) assert.equal(pm(['reference', `styles/${style}`]).stdout, fiche(style), style);
  // Style personnel : guide.md, entier sans option ; extrait avec --pour ; guide à l'ancien format rendu entier.
  const r = pm(['style', 'nouveau', 'papercraft', '--depuis', 'editorial'], { PULSE_MOTION_DOSSIER: perso });
  assert.equal(r.status, 0, r.stderr);
  const guide = fs.readFileSync(path.join(perso, 'styles', 'papercraft', 'guide.md'), 'utf8');
  assert.equal(pm(['reference', 'styles/papercraft'], { PULSE_MOTION_DOSSIER: perso }).stdout, guide);
  assert.deepEqual(titres(pm(['reference', 'styles/papercraft', '--pour', 'animateur'], { PULSE_MOTION_DOSSIER: perso }).stdout), SECTIONS_ANIMATEUR);
  const ancien = '# Style « papercraft »\n\n## L\'essentiel\n\n- Repris.\n\n## Scènes toutes faites\n\n| a |\n';
  fs.writeFileSync(path.join(perso, 'styles', 'papercraft', 'guide.md'), ancien);
  assert.equal(pm(['reference', 'styles/papercraft', '--pour', 'animateur'], { PULSE_MOTION_DOSSIER: perso }).stdout, ancien);
}));

// ---------- 5.2 Les données de la fiche dans identite.json ----------

test('identite : un style livré sans categorie, usages, nonPas, motsCles ou son est refusé', () => {
  const racine = stylesEssai(['essai']);
  const d = path.join(racine, 'essai');
  assert.deepEqual(S.verifierStyle(d, { livre: true }).erreurs, [], 'copie complète d\'un style livré');
  for (const champ of ['categorie', 'usages', 'nonPas', 'motsCles', 'son']) {
    const avant = fs.readFileSync(path.join(d, 'identite.json'), 'utf8');
    modifierJSON(path.join(d, 'identite.json'), (j) => { delete j[champ]; });
    const v = S.verifierStyle(d, { livre: true });
    assert.equal(v.ok, false, champ);
    assert.ok(v.erreurs.some((e) => e.includes(`« ${champ} » est obligatoire pour un style livré`)), champ);
    fs.writeFileSync(path.join(d, 'identite.json'), avant);
  }
  assert.ok(S.estLivre(path.join(RACINE, 'styles', 'minimal')));
  assert.ok(!S.estLivre(d));
});

test('identite : un style personnel sans ces champs reste valide', () => avecPersonnel((perso) => {
  const d = path.join(perso, 'styles', 'ancien');
  fs.cpSync(CLAIR, d, { recursive: true });
  modifierJSON(path.join(d, 'catalogue.json'), (j) => { j.style = 'ancien'; });
  // Identité d'un style personnel d'avant cette version : les 11 clés d'origine seulement.
  modifierJSON(path.join(d, 'identite.json'), (j) => {
    j.style = 'ancien';
    for (const k of ['categorie', 'nonPas', 'usages', 'motsCles', 'son', 'shaders', 'modules', 'provenance', 'base']) delete j[k];
  });
  const v = S.verifierStyle(d);
  assert.deepEqual(v.erreurs, []);
  assert.equal(v.ok, true);
  S.marquerVerifie(d);
  const f = S.listerStyles().find((x) => x.style === 'ancien');
  assert.deepEqual([f.verifie, f.categorie, f.usages], [true, null, []]);
}));

test('identite : ambiance, bruitage, matière et son fort inconnus sont refusés avec la liste des noms connus', () => {
  const racine = stylesEssai(['sons']);
  const d = path.join(racine, 'sons');
  modifierJSON(path.join(d, 'identite.json'), (j) => {
    j.son = { ambiances: ['jazz'], bruitages: { point: 'tambour' }, matiere: 'velours', fort: 'gong' };
  });
  const e = S.verifierStyle(d).erreurs.join('\n');
  assert.match(e, /ambiance « jazz » inconnue.*Ambiances : calme, entrainant, inspirant, corporate, suspense, tech/);
  assert.match(e, /bruitage « tambour » inconnu.*Bruitages : whoosh, swoosh-inverse, pop/);
  assert.match(e, /matière « velours » inconnue.*Sons tenus : /);
  assert.match(e, /son fort « gong » inconnu.*Bruitages : whoosh/);
  modifierJSON(path.join(d, 'identite.json'), (j) => { j.son = { ambiances: ['calme'] }; });
  assert.match(S.verifierStyle(d).erreurs.join('\n'), /« son\.bruitages » manquant[\s\S]*« son\.fort » manquant/);
});

test('identite : un type d\'entrée hors TYPES_ENTREE est refusé', () => {
  assert.deepEqual(TYPES_ENTREE, ['titre', 'texte', 'point', 'chiffre', 'trace', 'forme', 'image', 'ecriture', 'transition']);
  const racine = stylesEssai(['types']);
  const d = path.join(racine, 'types');
  modifierJSON(path.join(d, 'identite.json'), (j) => { j.son.bruitages.explosion = 'impact'; });
  assert.match(S.verifierStyle(d).erreurs.join('\n'), /type d'entrée « explosion » inconnu \(son\.bruitages\)\. Types : titre, texte, point/);
});

test('identite : un module ou un shader conseillé inconnu est refusé', () => {
  const racine = stylesEssai(['modules']);
  const d = path.join(racine, 'modules');
  modifierJSON(path.join(d, 'identite.json'), (j) => { j.modules = ['aquarelle']; j.shaders = { conseilles: ['grain', 'arc-en-ciel'] }; });
  const e = S.verifierStyle(d).erreurs.join('\n');
  assert.match(e, /module « aquarelle » inconnu/);
  assert.match(e, /shader conseillé « arc-en-ciel » inconnu\. Shaders : .*grain/);
  assert.doesNotMatch(e, /« grain » inconnu/);
  modifierJSON(path.join(d, 'identite.json'), (j) => { j.categorie = 'peinture'; j.usages = ['un', 'deux']; j.provenance = [{ depot: 'x' }]; });
  const e2 = S.verifierStyle(d).erreurs.join('\n');
  assert.match(e2, /« categorie » doit être l'une de : essentiels, dessine, schemas-donnees, papier-imprime, ecrans-annonces, anime/);
  assert.match(e2, /« usages » : exactement 3 phrases courtes/);
  assert.match(e2, /« provenance »/);
});

// ---------- 5.3 Migration des 6 styles ----------

// Empreinte des fichiers de chaque style hors identite.json, relevée sur main en 0.44.0 avant la migration, puis en 0.52.0
// (S7 J2, voulu : scène toute faite « moyeu », « schema » relié par data-fleche, CSS du moyeu ajouté sans toucher aux règles
// existantes ; les projets gardent leur copie des scènes).
const EMPREINTES = {
  'chaleureux': 'e816b59dda26c971d33e956cb49c326e6e4792d3737e09cc5f4a7b1fe91834d8',
  'clair-pedagogique': '8d9eb9c9f1f92754f3f3ae47a7b8467c6d2446e5af28a0272f65f2cadf810eea',
  'editorial': 'c9a800149594df3fca38b419a3aae927eedff1e4602778d5e6b131633ad6193e',
  'energique': 'f048d60b1ba06c21aa1b792ac0650af2123f11a64c6a04e48d1a755bd2408b30',
  'minimal': '35a41283154fc1bfe76f72224dc12a8c6d4ff9bb7885e4fe53fb4ca5b135a1e7',
  'tech-sombre': 'bfa3cb0d8d9f3608189dcbe5d370d98f6594cb64582390dc0f3ff3bc6ea34f83',
};

/** Fichiers du style hors identite.json ; les polices partagées (spec S11, 5.1) comptent à leur ancienne place, polices/<fichier>. */
function empreinteSansIdentite(dossier) {
  const h = crypto.createHash('sha256');
  for (const { r, chemin } of S.fichiersStyle(dossier)) if (r !== 'identite.json') h.update(r).update('\0').update(fs.readFileSync(chemin)).update('\0');
  return h.digest('hex');
}

test('migration : style.css et scènes des 6 styles inchangés (empreinte avant et après)', () => {
  for (const style of ESSENTIELS) assert.equal(empreinteSansIdentite(path.join(RACINE, 'styles', style)), EMPREINTES[style], `${style} : style.css, scènes, catalogue, charte ou polices modifiés`);
});

test('styles livrés : chaque fiche au nouveau format et chaque identite complète', () => {
  const { BRUITAGES } = require('../moteur/synthe/catalogue.js');
  for (const style of LIVRES) {
    assert.deepEqual(titres(fiche(style)), SECTIONS_FICHE, style);
    const id = identite(style);
    assert.equal(id.categorie, CATEGORIE[style] || 'essentiels', style);
    for (const champ of S.CHAMPS_LIVRE) assert.ok(id[champ] !== undefined, `${style} : ${champ}`);
    assert.equal(id.usages.length, 3, style);
    assert.ok(id.motsCles.length >= 3, style);
    assert.deepEqual(Object.keys(id.son.bruitages), TYPES_ENTREE, `${style} : table complète des types d'entrée`);
    assert.ok(BRUITAGES.includes(id.son.fort), style);
    // Les usages de l'identité sont ceux du § 11 de la fiche.
    const onze = F.section(fiche(style), SECTIONS_FICHE[11]);
    for (const u of id.usages) assert.ok(onze.toLowerCase().includes(u.toLowerCase()), `${style} : usage « ${u} » absent du § 11`);
  }
  // Palettes sonores de départ (spec 5.3, point 2) ; tech-sombre : « frappe » pour le texte (J4).
  const sons = Object.fromEntries(LIVRES.map((s) => [s, identite(s).son]));
  assert.deepEqual(sons['clair-pedagogique'].ambiances, ['calme', 'inspirant']);
  assert.deepEqual([sons.energique.bruitages.titre, sons.energique.bruitages.point, sons.energique.fort], ['impact', 'clic', 'impact']);
  assert.deepEqual([sons['tech-sombre'].bruitages.texte, sons['tech-sombre'].bruitages.chiffre], ['frappe', 'tic']);
  assert.deepEqual(identite('minimal').provenance, [{ depot: 'lemo-opuscar', style: 'swiss-motion', licence: 'MIT' }]);
});

test('minimal : § 8 contient les gestes « masque », « couteau » et « exception »', () => {
  const noms = F.gestes(fiche('minimal')).map((g) => g.nom.toLowerCase());
  for (const n of ['masque', 'couteau', 'exception']) assert.ok(noms.includes(n), n);
  assert.match(F.section(fiche('minimal'), SECTIONS_FICHE[5]), /cubic-bezier\(\.7, 0, \.2, 1\)/);
  assert.match(fiche('minimal'), /> Sources : .*swiss-motion.*lemo-opuscar/);
});

test('styles livrés : tests existants (contrat, guide, contrôles, quatre formats) toujours verts', () => {
  // Le rendu dans les quatre formats est vérifié dans le navigateur par styles-livres.test.js.
  for (const style of LIVRES) {
    const v = S.verifierStyle(path.join(RACINE, 'styles', style));
    assert.deepEqual([v.erreurs, v.avertissements], [[], []], style);
    const guide = fiche(style);
    assert.match(guide, /dernière scène.*0,5 s/, style);
    assert.deepEqual(controler({ dossier: projetCatalogue(style), ecrire: false }).problemes, [], style);
  }
});

// ---------- 5.4 Trouver et proposer parmi 20 styles ----------

test('styles --genre : forme courte des styles mis en avant, une ligne par catégorie pour le reste, au plus 6 Ko', () => avecPersonnel((perso) => {
  // 20 styles livrés (les 6, et 14 copies) et 5 styles personnels vérifiés. Spec S11, 5.1 point 2 : plus de fiche complète,
  // une ligne par style mis en avant (recommandés, personnels du genre, contraste, aussi), une par catégorie pour le reste.
  const racine = stylesEssai([]);
  for (const s of ESSENTIELS) copier(racine, s, s);
  for (let i = 0; i < 14; i++) copier(racine, ESSENTIELS[i % 6], `copie-${String(i + 1).padStart(2, '0')}`);
  const persos = path.join(perso, 'styles');
  for (let i = 0; i < 5; i++) S.marquerVerifie(copier(persos, ESSENTIELS[i], `perso-${i + 1}`, (j) => { j.genres = ['formation']; }));
  assert.equal(S.recommander('formation', [racine, persos]).length, 25);
  const classement = S.classerPourGenre('formation', [racine, persos]);
  assert.equal(classement.enAvant.length, 8);
  const liste = S.listePourGenre(classement);
  const sortie = JSON.stringify(liste);
  assert.ok(octets(sortie) <= 6000, `${octets(sortie)} o`);
  assert.deepEqual(liste.slice(0, 3).map((f) => f.split(' · ')[0]), ['clair-pedagogique', 'chaleureux', 'perso-1']);
  // Forme courte : style, catégorie, personnalité, usages, et « personnel » pour un style personnel, en une ligne.
  for (const f of liste.slice(0, 8)) assert.match(f, /^[a-z0-9-]+ · [a-z-]+ · [^·]+, [^·]+, [^·]+ · [^·]+ ; [^·]+ ; [^·]+( · personnel)?$/, f);
  assert.equal(liste.filter((f) => f.endsWith(' · personnel')).length, 5);
  assert.equal(liste[3], 'perso-2 · essentiels · accueillant, doux, humain · Former une équipe ; Expliquer une procédure ; Présenter un produit · personnel'.replace('accueillant, doux, humain', identite('clair-pedagogique').personnalite.join(', ')));
  assert.deepEqual(liste.slice(8), ['17 autres styles essentiels : styles chercher <mots> ou styles choisir --categorie essentiels']);
  // Ligne de commande : même forme, en JSON compact.
  const r = pm(['styles', '--genre', 'formation'], { PULSE_MOTION_DOSSIER: dossierPersonnelEssai() });
  assert.equal(r.status, 0, r.stderr);
  const cli = JSON.parse(r.stdout);
  assert.ok(cli.every((l) => typeof l === 'string'));
  assert.match(cli[0], /^clair-pedagogique · essentiels · /);
  // Les styles des vagues A, B, C et D et mode-d-emploi viennent après le contraste (« aussi »), jamais parmi les recommandés.
  assert.match(cli[3], /^plan-technique · schemas-donnees · /);
  assert.match(cli[4], /^info-sans-son · ecrans-annonces · /);
  assert.match(cli[5], /^tableau-blanc · dessine · /);
  assert.match(cli[6], /^tableau-noir · dessine · /);
  assert.match(cli[7], /^iso-album · schemas-donnees · /);
  assert.match(cli[8], /^iso-infographie · schemas-donnees · /);
  assert.match(cli[9], /^pictogrammes · schemas-donnees · /);
  assert.match(cli[10], /^crayon · dessine · /);
  assert.match(cli[11], /^mode-d-emploi · anime · /);
  // Puis le reste, une ligne par catégorie, dans l'ordre des catégories.
  assert.deepEqual(cli.slice(12).map((l) => l.split(' : ')[0]), ['3 autres styles essentiels', '1 autre style dessine', '1 autre style schemas-donnees', '2 autres styles papier-imprime', '1 autre style ecrans-annonces']);
  assert.equal(cli.length, 17);
}));

test('styles chercher : « tableau blanc », « craie », « plan technique », « chiffres » trouvent le bon style', () => {
  const racine = stylesEssai([]);
  // Les vrais styles livrés : tableau-blanc, tableau-noir et recit-donnees depuis S8 J7, plan-technique depuis J6.
  for (const s of LIVRES) copier(racine, s, s);
  const premier = (q) => (S.chercherStyles(q, racine)[0] || {}).style;
  assert.equal(premier('façon tableau blanc'), 'tableau-blanc');
  assert.equal(premier('quelque chose à la craie'), 'tableau-noir');
  assert.equal(premier('comme un plan technique'), 'plan-technique');
  assert.equal(premier('comme un plan d\'ingénieur'), 'plan-technique');
  assert.equal(premier('des chiffres'), 'recit-donnees');
  assert.equal(premier('Tableau Blanc'), 'tableau-blanc', 'sans casse');
  // Les styles livrés se trouvent aussi par leurs mots.
  assert.equal(premier('façon magazine'), 'editorial');
  assert.equal(premier('grille suisse'), 'minimal');
  assert.equal(premier('un terminal'), 'tech-sombre');
  assert.equal(premier('pour les réseaux sociaux'), 'energique');
  assert.equal(premier('lisible son coupé'), 'info-sans-son');
  assert.equal(premier('une keynote de lancement'), 'lancement');
  assert.equal(premier('un blueprint'), 'plan-technique');
  assert.equal(premier('un carnet de croquis'), 'carnet');
  assert.equal(premier('une seule ligne'), 'carnet');
  assert.equal(premier('un tableau noir'), 'tableau-noir');
  assert.equal(premier('avec des graphiques'), 'recit-donnees');
  assert.equal(premier('pedagogique'), 'clair-pedagogique', 'sans accents');
  assert.deepEqual(S.chercherStyles('aquarelle', racine), []);
  assert.deepEqual(Object.keys(S.chercherStyles('craie', racine)[0]), ['style', 'categorie', 'personnalite', 'usages', 'personnel']);
  // Ligne de commande.
  const r = pm(['styles', 'chercher', 'façon', 'magazine'], { PULSE_MOTION_DOSSIER: dossierPersonnelEssai() });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout)[0].style, 'editorial');
  assert.equal(pm(['styles', 'chercher']).status, 1);
  assert.match(fs.readFileSync(path.join(RACINE, 'skills', 'creer', 'SKILL.md'), 'utf8'), /pulse-motion styles chercher <mots>/);
});

test('recommandation : chaque style livré cité pour au moins un genre (recommandes, contraste ou aussi)', () => {
  const reco = JSON.parse(fs.readFileSync(path.join(RACINE, 'references', 'styles', 'recommandation.json'), 'utf8'));
  const cites = new Set();
  for (const [genre, r] of Object.entries(reco)) {
    assert.equal(r.recommandes.length, 2, genre);
    assert.ok(Array.isArray(r.aussi), `${genre} : champ aussi`);
    [...r.recommandes, r.contraste, ...r.aussi].forEach((s) => cites.add(s));
  }
  for (const s of LIVRES) assert.ok(cites.has(s), s);
  for (const s of cites) assert.ok(LIVRES.includes(s), `${s} cité mais pas livré`);
  // Les recommandés d'avant ne changent pas (spec 5.4, point 3).
  assert.deepEqual(Object.fromEntries(Object.entries(reco).map(([g, r]) => [g, [...r.recommandes, r.contraste]])), {
    formation: ['clair-pedagogique', 'chaleureux', 'minimal'],
    produit: ['minimal', 'tech-sombre', 'energique'],
    storytelling: ['editorial', 'chaleureux', 'tech-sombre'],
    social: ['energique', 'minimal', 'editorial'],
  });
});

test('recommander : ordre recommandés, personnels du genre, contraste, aussi, reste', () => avecPersonnel((perso) => {
  const racine = stylesEssai([]);
  for (const s of ESSENTIELS) copier(racine, s, s);
  for (const n of ['craie', 'riso']) copier(racine, 'clair-pedagogique', n);
  const persos = path.join(perso, 'styles');
  S.marquerVerifie(copier(persos, 'chaleureux', 'maison', (j) => { j.genres = ['formation']; }));
  const table = { formation: { recommandes: ['clair-pedagogique', 'chaleureux'], contraste: 'minimal', aussi: ['riso', 'craie', 'absent'] } };
  assert.deepEqual(S.recommander('formation', [racine, persos], table).map((f) => f.style),
    ['clair-pedagogique', 'chaleureux', 'maison', 'minimal', 'riso', 'craie', 'editorial', 'energique', 'tech-sombre']);
  // Sans « aussi » : comme avant.
  delete table.formation.aussi;
  assert.deepEqual(S.recommander('formation', [racine, persos], table).map((f) => f.style).slice(0, 5), ['clair-pedagogique', 'chaleureux', 'maison', 'minimal', 'craie']);
}));

test('contrat : six catégories dans l\'ordre de la galerie', () => {
  assert.deepEqual(CATEGORIES.map((c) => c.id), ['essentiels', 'dessine', 'schemas-donnees', 'papier-imprime', 'ecrans-annonces', 'anime']);
  assert.equal(CATEGORIES[0].nom, 'Les essentiels');
});

test('notices : le gabarit des fiches de lemo-opuscar cité, dans les deux fichiers identiques', () => {
  const racine = fs.readFileSync(path.join(RACINE, '..', '..', 'THIRD-PARTY-NOTICES.md'), 'utf8');
  const plugin = fs.readFileSync(path.join(RACINE, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  assert.equal(racine, plugin);
  assert.match(plugin, /styles\/_template\/STYLE\.md/);
  assert.match(plugin, /swiss-motion/);
  assert.doesNotMatch(plugin.toLowerCase(), /huashu/);
});
