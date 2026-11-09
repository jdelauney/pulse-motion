'use strict';
/* Spec Rapidité (S1), plan S1-2 « Jetons » : références lues à la carte (§ 5.4), modèle de l'animateur choisi selon la
 * scène (§ 5.3), scènes témoins d'abord (§ 5.7). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { lireReference, partiesDe, REFERENCES } = require('./aide/references.js');
const { sectionsConsignes, nomSection } = require('../scripts/lib/consignes.js');

const RACINE = path.join(__dirname, '..');
const PM = path.join(RACINE, 'scripts', 'pm.js');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const octets = (...p) => fs.statSync(path.join(RACINE, ...p)).size;
const TRONCS = ['moteur', 'particules', 'audio'];

/** Tous les fichiers de consignes et de références (.md), récursivement. */
function fichiersMd(dossier) {
  const r = [];
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) r.push(...fichiersMd(p));
    else if (e.name.endsWith('.md')) r.push(p);
  }
  return r;
}

function enTete(texte) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(texte.replace(/\r\n/g, '\n'));
  assert.ok(m, 'en-tête --- absent');
  const champs = {};
  for (const ligne of m[1].split('\n')) {
    const i = ligne.indexOf(':');
    if (i > 0) champs[ligne.slice(0, i).trim()] = ligne.slice(i + 1).trim();
  }
  return champs;
}

// --- § 5.4 Références et consignes à la carte ---------------------------------------------------------------------

test('reference-moteur-tronc-sous-12-ko : le tronc du moteur tient en 12 000 octets', () => {
  assert.ok(octets('references', 'moteur.md') <= 12000, `${octets('references', 'moteur.md')} o`);
});

test('reference-particules-tronc-sous-13-ko : le tronc des particules tient en 13 000 octets', () => {
  assert.ok(octets('references', 'particules.md') <= 13000, `${octets('references', 'particules.md')} o`);
});

test('reference-parties-citees-existent : chaque partie citée existe, chaque partie est listée par son tronc', () => {
  const fichiers = [...fichiersMd(path.join(RACINE, 'skills')), ...fichiersMd(path.join(RACINE, 'agents')), ...fichiersMd(REFERENCES)];
  let citees = 0;
  for (const f of fichiers) {
    const texte = fs.readFileSync(f, 'utf8');
    for (const m of texte.matchAll(/pulse-motion reference ([a-z0-9-]+\/[a-z0-9-]+)/g)) {
      citees++;
      assert.ok(fs.existsSync(path.join(REFERENCES, `${m[1]}.md`)) || /^styles\//.test(m[1]), `${path.relative(RACINE, f)} : partie « ${m[1]} » absente`);
    }
    // Les parties nommées seules (`moteur/camera`) dans les tables.
    for (const m of texte.matchAll(/`((?:moteur|particules|audio)\/[a-z0-9-]+)`/g)) {
      citees++;
      assert.ok(fs.existsSync(path.join(REFERENCES, `${m[1]}.md`)), `${path.relative(RACINE, f)} : partie « ${m[1]} » absente`);
    }
  }
  assert.ok(citees > 20, 'des parties sont citées');
  for (const nom of TRONCS) {
    const tronc = lireReference(nom);
    assert.match(tronc, /\n## Les parties\n/, `${nom} : liste des parties en fin de tronc`);
    const liste = tronc.slice(tronc.indexOf('\n## Les parties\n'));
    const parties = partiesDe(nom);
    assert.ok(parties.length >= 3, `${nom} : parties`);
    for (const p of parties) {
      assert.ok(liste.includes('`' + p.nom + '`'), `${nom} : la partie « ${p.nom} » est listée par le tronc`);
      assert.match(p.texte, /^# .+\n/, `${p.nom} : un titre en tête`);
    }
  }
});

test('reference-tronc-et-parties-sans-perte : chaque titre et chaque ligne chiffrée de la 0.28.0 se retrouve, une fois', () => {
  const avant = JSON.parse(lire('tests', 'fixtures', 'references-0.28.0.json'));
  for (const nom of TRONCS) {
    const lignes = lireReference(nom, { parties: true }).replace(/\r\n/g, '\n').split('\n').map((l) => l.trim());
    const titres = lignes.filter((l) => /^#{1,6} /.test(l)).map((l) => l.replace(/^#+ /, ''));
    for (const titre of avant[nom].titres) {
      assert.equal(titres.filter((x) => x === titre).length, 1, `${nom} : titre « ${titre} »`);
    }
    const compte = (liste) => liste.reduce((m, l) => m.set(l, (m.get(l) || 0) + 1), new Map());
    const apres = compte(lignes);
    for (const [ligne, n] of compte(avant[nom].lignes)) {
      assert.equal(apres.get(ligne) || 0, n, `${nom} : ligne chiffrée perdue ou en double : « ${ligne.slice(0, 120)} »`);
    }
  }
});

test('reference-parties-par-la-commande : « pulse-motion reference <tronc>/<partie> » imprime la partie', () => {
  for (const nom of TRONCS) {
    for (const p of partiesDe(nom)) {
      const r = spawnSync(process.execPath, [PM, 'reference', p.nom], { encoding: 'utf8' });
      assert.equal(r.status, 0, p.nom);
      assert.equal(r.stdout, p.texte, p.nom);
    }
  }
  const r = spawnSync(process.execPath, [PM, 'reference', 'moteur/inconnue'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
});

test('animateur-consignes-sous-6000-octets : les consignes de l\'animateur tiennent en 6 000 octets', () => {
  assert.ok(octets('agents', 'animateur.md') <= 6000, `${octets('agents', 'animateur.md')} o`);
});

test('animateur-lit-les-parties-selon-la-consigne : le tronc, puis seulement les parties qu\'exige la consigne', () => {
  const a = lire('agents', 'animateur.md');
  assert.match(a, /Lire `pulse-motion reference moteur` \(le tronc\)/);
  assert.match(a, /\*\*seulement\*\* les parties qu'exige votre consigne/);
  const table = a.slice(a.indexOf('| La consigne demande… | Lire aussi |'), a.indexOf('\n2. '));
  for (const [condition, partie] of [[/caméra/, 'moteur/camera'], [/tempo/, 'moteur/tempo'], [/personnage/, 'moteur/personnages'],
    [/prise de voix/, 'audio/ancres'], [/bruitages/, 'audio/bruitages']]) {
    const ligne = table.split('\n').find((l) => l.includes('`pulse-motion reference ' + partie + '`'));
    assert.ok(ligne, `partie ${partie} dans la table`);
    assert.match(ligne, condition, partie);
  }
  assert.match(table, /un effet de particules \| `pulse-motion reference particules`, puis la partie de sa famille/);
  // Plus de lecture d'une référence entière à la place d'une partie.
  assert.doesNotMatch(a, /pulse-motion reference audio`/, 'audio entier');
  assert.doesNotMatch(a, /section « Personnages » de `pulse-motion reference moteur`/);
  // Le détail des personnages et le mode « style » vivent dans les parties.
  assert.match(a, /suivre `moteur\/personnages`, section « Dans une scène écrite par l'animateur »/);
  assert.match(lireReference('moteur/personnages'), /\n## Dans une scène écrite par l'animateur\n/);
  assert.match(a, /## Mode « style »\n\n[^\n]*`pulse-motion reference moteur\/mode-style`/);
  const style = lireReference('moteur/mode-style');
  for (const r of [/data-decor/, /counter\(\)/, /scenes\/<type>\.html/]) assert.match(style, r);
});

test('animateur-mouvements-par-afficher : une fiche par mouvement reçu, plus le dictionnaire entier', () => {
  const a = lire('agents', 'animateur.md');
  assert.match(a, /`pulse-motion mouvements afficher <n° ou nom>`/);
  assert.doesNotMatch(a, /pulse-motion reference mouvements/);
});

test('consignes-creer-par-section : les règles et une seule section, la plus utile à reprendre sous 7 000 octets', () => {
  const creer = lire('skills', 'creer', 'SKILL.md');
  const titres = [...creer.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  const attendues = { verifier: '0. Vérifier', questions: '1. Questions (une ronde)', deroule: '2. Déroulé et style', fabrication: '3. Fabrication', apercu: '4. Aperçu', fin: '5. Fin' };
  for (const [nom, titre] of Object.entries(attendues)) {
    assert.equal(nomSection(titre), nom, titre);
    assert.ok(titres.includes(titre), titre);
    const r = spawnSync(process.execPath, [PM, 'consignes', 'creer', nom], { encoding: 'utf8' });
    assert.equal(r.status, 0, nom);
    const sortie = r.stdout;
    assert.match(sortie, /^# \/pulse-motion:creer/, `${nom} : titre`);
    assert.doesNotMatch(sortie, /^---\n|disable-model-invocation/, `${nom} : sans l'en-tête`);
    assert.match(sortie, /\n## Règles\n/, `${nom} : règles`);
    const sections = [...sortie.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.deepEqual(sections, ['Règles', titre], nom);
    // Le texte de la section est celui du SKILL.md, sans perte.
    const debut = creer.indexOf(`## ${titre}`);
    const fin = creer.indexOf('\n## ', debut + 3);
    assert.ok(sortie.includes(creer.slice(debut, fin < 0 ? undefined : fin).trimEnd()), `${nom} : section entière`);
  }
  // À l'étape « fabrication », reprendre lit la section fabrication : objectif 6 Ko, plafond 7 000 o.
  const fabrication = spawnSync(process.execPath, [PM, 'consignes', 'creer', 'fabrication'], { encoding: 'utf8' }).stdout;
  assert.ok(Buffer.byteLength(fabrication) <= 7000, `${Buffer.byteLength(fabrication)} o`);
  assert.ok(Buffer.byteLength(fabrication) < Buffer.byteLength(creer) / 2);
  // Plusieurs sections d'un coup ; une section inconnue est refusée en nommant les sections ; sans section : tout.
  const deux = spawnSync(process.execPath, [PM, 'consignes', 'creer', 'apercu,fin'], { encoding: 'utf8' });
  assert.deepEqual([...deux.stdout.matchAll(/^## (.+)$/gm)].map((m) => m[1]), ['Règles', '4. Aperçu', '5. Fin']);
  const inconnue = spawnSync(process.execPath, [PM, 'consignes', 'creer', 'livraison'], { encoding: 'utf8' });
  assert.equal(inconnue.status, 2);
  assert.match(inconnue.stderr, /Section inconnue : livraison\. Sections : verifier, questions, deroule, fabrication, apercu, fin\./);
  assert.equal(spawnSync(process.execPath, [PM, 'consignes', 'creer', '../x'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [PM, 'consignes', 'creer'], { encoding: 'utf8' }).stdout, creer);
  // Fonction pure : une compétence sans « Règles » donne sa tête et la section.
  const r = sectionsConsignes('---\nx: 1\n---\n\n# Titre\n\nIntro.\n\n## 1. Un\n\nA\n\n## 2. Deux\n\nB\n', ['deux']);
  assert.equal(r.texte, '# Titre\n\nIntro.\n\n## 2. Deux\n\nB\n');
});

test('reprendre-lit-la-section-de-l-etape : chaque étape renvoie à sa section de creer, jamais à tout creer', () => {
  const s = lire('skills', 'reprendre', 'SKILL.md');
  assert.doesNotMatch(s, /`pulse-motion consignes creer`/);
  assert.match(s, /`pulse-motion consignes creer <section>`/);
  const sections = ['verifier', 'questions', 'deroule', 'fabrication', 'apercu', 'fin'];
  for (const [etape, attendue] of [['deroule-a-corriger', 'deroule'], ['deroule-a-valider', 'deroule'], ['fabrication', 'fabrication'], ['style-a-valider', 'deroule'], ['video-a-valider', 'apercu,fin']]) {
    const ligne = s.split('\n').find((l) => l.startsWith(`| \`${etape}\` |`));
    assert.ok(ligne, etape);
    assert.equal(ligne.split('|')[2].trim(), `\`${attendue}\``, etape);
    for (const n of attendue.split(',')) assert.ok(sections.includes(n), n);
  }
  assert.match(s.split('\n').find((l) => l.startsWith('| `fabrication` |')), /puis lire `apercu,fin`/);
});

// --- § 5.3 Modèle de l'animateur choisi selon la scène --------------------------------------------------------------

test('animateur-sans-model-fige : le modèle de la session reste la valeur par défaut', () => {
  const e = enTete(lire('agents', 'animateur.md'));
  assert.equal(e.model, undefined);
  assert.equal(e.effort, undefined);
});

/** Table de routage d'une compétence : [{ scene, modele }]. */
function tableDeRoutage(texte) {
  const i = texte.indexOf('| La scène | Modèle passé à l\'appel |');
  assert.ok(i >= 0, 'table de routage');
  const lignes = [];
  for (const l of texte.slice(i).split('\n').slice(2)) {
    const m = /^\s*\| (.+) \| (.+) \|$/.exec(l);
    if (!m) break;
    lignes.push({ scene: m[1], modele: m[2] });
  }
  return lignes;
}

function verifierRoutage(texte, nom) {
  const table = tableDeRoutage(texte);
  const legeres = table.filter((l) => l.modele === '`sonnet`');
  assert.equal(legeres.length, 1, `${nom} : une seule ligne au modèle léger`);
  const leger = legeres[0].scene;
  assert.match(leger, /^Un `type`/, `${nom} : scène toute faite`);
  for (const exclu of [/effet de particules/, /personnage/, /shader/, /caméra narrative/, /au plus 3 mouvements nommés/]) assert.match(leger, exclu, `${nom} : ${exclu}`);
  assert.match(leger, /sans effet de particules, personnage, fond par shader ni caméra narrative/, `${nom} : exclusions`);
  // Décision de l'auteur (S1-5, b) : une transition par shader est posée par le déroulé ; la scène reste au modèle léger.
  assert.match(leger, /sa transition peut être un shader \(c'est le déroulé qui la pose\)/, `${nom} : transition par shader`);
  const autres = table.filter((l) => l !== legeres[0]);
  for (const l of autres) assert.match(l.modele, /^aucun paramètre/, `${nom} : ${l.scene}`);
  const creatives = autres.map((l) => l.scene).join(' ; ');
  for (const r of [/Composée \(sans `type`\)/, /effet/, /personnage/, /shader/, /caméra/, /partition calée sur la scène/, /Seconde écriture d'une scène qui garde une erreur|seconde écriture d'une scène qui garde une erreur/]) {
    assert.match(creatives, r, `${nom} : ${r} au modèle de la session`);
  }
  assert.match(texte, /paramètre `model`/, `${nom} : paramètre de l'appel`);
  // Pas de Haiku tant que les évaluations de S2 ne l'ont pas validé.
  assert.doesNotMatch(texte.replace(/Jamais `haiku`\./g, ''), /`haiku`/, `${nom} : haiku`);
}

test('creer-table-de-routage-du-modele : scènes simples en Sonnet, scènes créatives et témoins au modèle de la session', () => {
  const fabrication = sectionsConsignes(lire('skills', 'creer', 'SKILL.md'), ['fabrication']).texte;
  verifierRoutage(fabrication, 'creer');
  assert.match(fabrication, /Scène témoin, même toute faite ; seconde écriture/);
  assert.match(fabrication, /\*\*Scènes témoins\*\* : deux agents sans paramètre de modèle/);
  assert.match(fabrication, /Une scène écrite en `sonnet` qui garde une erreur après ce premier tour : la faire réécrire par un agent sans paramètre de modèle\./);
});

test('retoucher-table-de-routage-du-modele : refonte, scènes à réécrire et nouvelles scènes routées de même', () => {
  const r = lire('skills', 'retoucher', 'SKILL.md');
  verifierRoutage(r, 'retoucher');
  assert.match(r, /Agent `animateur` \(refonte, scènes de `aReecrire`, nouvelle scène\)/);
});

test('routage-jamais-plus-cher-que-la-session : phrase présente dans les deux compétences', () => {
  for (const s of ['creer', 'retoucher']) {
    const t = lire('skills', s, 'SKILL.md');
    assert.match(t, /Jamais un modèle plus cher que celui de la session : si la session tourne déjà en Sonnet ou en Haiku, aucun paramètre\. Jamais `haiku`\./, s);
  }
});

// --- § 5.7 Scènes témoins d'abord ---------------------------------------------------------------------------------

const fabricationCreer = () => sectionsConsignes(lire('skills', 'creer', 'SKILL.md'), ['fabrication']).texte;

test('creer-deux-vagues-au-dela-de-cinq-scenes : une seule vague jusqu\'à 5 scènes, deux à partir de 6', () => {
  const f = fabricationCreer();
  assert.match(f, /Moins de 6 scènes : un agent par scène, tous dans le même message \(en parallèle\)\. 6 scènes ou plus, en deux vagues :/);
  const temoins = f.indexOf('**Scènes témoins**');
  const planche = f.indexOf('`pulse-motion planche . <id1>,<id2>`');
  const grammaire = f.indexOf('**Grammaire**');
  const seconde = f.indexOf('**Seconde vague** : toutes les autres scènes, dans le même message');
  assert.ok(temoins > 0 && planche > temoins && grammaire > planche && seconde > grammaire, 'témoins, planche, grammaire, puis seconde vague');
  // La planche est regardée par Claude, pas montrée (montrer les témoins à la personne : S4).
  assert.match(f, /regarder soi-même `sortie\/planche\/` \(avec `Read`\)/);
});

test('creer-temoins-ouverture-et-plus-risquee-jamais-meme-type : l\'ouverture et la plus différente ou la plus risquée', () => {
  const f = fabricationCreer();
  const ligne = f.split('\n').find((l) => l.includes('**Scènes témoins**'));
  assert.match(ligne, /l'ouverture \(la première scène\)/);
  // Décision de l'auteur (S1-5, a) : le second témoin est une scène composée, jamais la scène à personnage.
  assert.match(ligne, /la scène \*\*composée\*\* la plus différente d'elle, sans personnage/);
  assert.match(ligne, /sans scène composée, la plus risquée hors personnage \(à effet, au texte le plus long\)/);
  assert.doesNotMatch(ligne, /à personnage, au texte/);
  assert.match(ligne, /jamais deux scènes du même `type`/);
  // Les témoins s'écrivent au modèle de la session (table de routage).
  assert.ok(tableDeRoutage(f).some((l) => /Scène témoin/.test(l.scene) && /^aucun paramètre/.test(l.modele)));
});

test('creer-temoins-et-note-grammaire-pour-les-scenes-composees-seulement : chemins et note aux seules scènes composées', () => {
  const f = fabricationCreer();
  assert.match(f, /« Grammaire de la vidéo »/);
  const ligne = f.split('\n').find((l) => l.includes('**Seconde vague**'));
  assert.match(ligne, /aux seules scènes \*\*composées\*\*, les chemins des deux témoins/);
  assert.match(ligne, /la note, telle quelle/);
  const a = lire('agents', 'animateur.md');
  assert.match(a, /scène composée de la seconde vague : chemins des scènes témoins et note « grammaire »/);
  assert.match(a, /de suivre les scènes témoins \| leurs fichiers, et la note « grammaire » telle quelle/);
});
