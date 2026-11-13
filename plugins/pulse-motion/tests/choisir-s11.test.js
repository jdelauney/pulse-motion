'use strict';
/* Spec S11 « Styles, seconde bibliothèque », jalon J2 « Choisir » : références connues → styles (5.2), propositions variées et
 * habitudes retrouvées (5.3). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const S = require('../scripts/styles.js');
const A = require('../scripts/lib/alias.js');
const SP = require('../scripts/lib/styles-proposes.js');
const { noterPreference } = require('../scripts/preferences.js');
const { controler } = require('../scripts/controler.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { dossierPersonnelEssai } = require('./aide/styles.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');
const LIVRES_DIR = path.join(RACINE, 'styles');
const RECO = JSON.parse(fs.readFileSync(path.join(RACINE, 'references', 'styles', 'recommandation.json'), 'utf8'));
const ALIAS = JSON.parse(fs.readFileSync(path.join(RACINE, 'references', 'styles', 'alias.json'), 'utf8'));
const LIVRES = fs.readdirSync(LIVRES_DIR).filter((n) => fs.existsSync(path.join(LIVRES_DIR, n, 'identite.json'))).sort();
const famille = (n) => JSON.parse(fs.readFileSync(path.join(LIVRES_DIR, n, 'identite.json'), 'utf8')).famille;
const noms = (fiches) => fiches.map((f) => f.style);
const node = (script, args, env = {}) => spawnSync(process.execPath, [path.join(RACINE, 'scripts', script), ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

/** Projet minimal d'un genre et d'un style (déroulé seul). */
function projet(genre, style, nom = 'pm-projet-') {
  const dir = dossierTemporaire(nom);
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify({ version: 1, titre: 'Essai', genre, parcours: 'rapide', format: { ratio: '16:9', ips: 30 }, style, scenes: [] }));
  return dir;
}

// ---------- 5.2 Références connues → styles ----------

test('styles chercher : « façon kurzgesagt » rend echelles en premier, avec alias.reprend', () => {
  // Jalon J2 : echelles n'existe pas encore (vague H, J12) ; la référence mène à iso-infographie. À J12, echelles passe en
  // premier dans alias.json et ce test se resserre sur lui.
  const attendu = fs.existsSync(path.join(LIVRES_DIR, 'echelles')) ? 'echelles' : 'iso-infographie';
  const r = S.chercherStyles('façon kurzgesagt', LIVRES_DIR);
  assert.ok(Array.isArray(r));
  assert.equal(r[0].style, attendu);
  assert.equal(r[0].alias.reference, 'kurzgesagt');
  assert.ok(r[0].alias.reprend.length > 10);
  // Sans accents ni casse ni ponctuation, et dans une demande plus longue : la référence vaut le nom exact.
  assert.equal(S.chercherStyles('Façon « Kurzgesagt » !', LIVRES_DIR)[0].style, attendu);
  const long = S.chercherStyles('façon kurzgesagt pour une formation', LIVRES_DIR);
  assert.equal(long[0].style, attendu);
  assert.ok(long.length > 1 && !long.slice(1).some((f) => f.alias), 'les autres mots passent par la recherche habituelle');
  // La plus longue référence l'emporte ; l'ordre des mots est libre.
  assert.equal(S.chercherStyles('apple keynote', LIVRES_DIR)[0].alias.reference, 'keynote apple');
  assert.equal(S.chercherStyles('une vidéo scribing', LIVRES_DIR)[0].style, 'tableau-blanc');
  // Une recherche par médium garde sa forme habituelle (sans alias).
  assert.equal(S.chercherStyles('une keynote de lancement', LIVRES_DIR)[0].alias, undefined);
  // Ligne de commande.
  const c = node('styles.js', ['chercher', 'façon', 'kurzgesagt'], { PULSE_MOTION_DOSSIER: dossierPersonnelEssai() });
  assert.equal(c.status, 0, c.stderr);
  const cli = JSON.parse(c.stdout);
  assert.equal(cli[0].style, attendu);
  assert.equal(cli[0].alias.reprend, ALIAS.kurzgesagt.reprend);
});

test('styles chercher : « pixar » ne rend aucun style, avec sansRecette et deux styles proches', () => {
  const r = S.chercherStyles('façon Pixar', LIVRES_DIR);
  assert.deepEqual(r.styles, []);
  assert.equal(r.alias.reference, 'pixar');
  assert.match(r.alias.sansRecette, /3D/);
  assert.equal(r.proche.length, 2);
  for (const f of r.proche) assert.ok(LIVRES.includes(f.style), f.style);
  const c = node('styles.js', ['chercher', 'comme', 'pixar'], { PULSE_MOTION_DOSSIER: dossierPersonnelEssai() });
  assert.equal(c.status, 0, c.stderr);
  const cli = JSON.parse(c.stdout);
  assert.deepEqual(cli.styles, []);
  assert.equal(cli.proche.length, 2);
  assert.ok(cli.alias.sansRecette);
});

test('alias : chaque style cité existe ; aucune clé n\'apparaît dans une fiche (hors de sa ligne « Sources ») ni dans une scène toute faite', () => {
  const entrees = Object.entries(ALIAS).filter(([k]) => !k.startsWith('_'));
  assert.ok(entrees.length >= 20, `${entrees.length} références`);
  for (const [reference, v] of entrees) {
    assert.ok(Array.isArray(v.styles) && v.styles.length <= 2, reference);
    if (v.styles.length) {
      assert.ok(typeof v.reprend === 'string' && v.reprend.length > 10, `${reference} : reprend`);
      assert.equal(v.sansRecette, undefined, reference);
    } else {
      assert.ok(typeof v.sansRecette === 'string' && v.sansRecette.length > 10, `${reference} : sansRecette`);
      assert.ok(Array.isArray(v.proche) && v.proche.length >= 1 && v.proche.length <= 2, `${reference} : proche`);
    }
    for (const s of [...v.styles, ...(v.proche || [])]) assert.ok(LIVRES.includes(s), `${reference} : style « ${s} » inconnu`);
    // On reprend le médium, jamais l'œuvre : aucun texte d'alias ne nomme une référence.
    for (const texte of [v.reprend, v.sansRecette].filter(Boolean)) assert.deepEqual(A.referencesDansTexte(texte), [], `${reference} : ${texte}`);
  }
  const trouvees = [];
  for (const style of LIVRES) {
    const fiche = fs.readFileSync(path.join(RACINE, 'references', 'styles', `${style}.md`), 'utf8').split('\n').filter((l) => !/^> Sources :/.test(l)).join('\n');
    for (const r of A.referencesDansTexte(fiche)) trouvees.push(`fiche ${style} : ${r}`);
    const d = path.join(LIVRES_DIR, style);
    for (const f of [...fs.readdirSync(path.join(d, 'scenes')).map((x) => path.join('scenes', x)), 'catalogue.json']) {
      for (const r of A.referencesDansTexte(fs.readFileSync(path.join(d, f), 'utf8'))) trouvees.push(`${style}/${f} : ${r}`);
    }
  }
  assert.deepEqual(trouvees, []);
  // La lecture compte bien les références (contre-épreuve).
  assert.deepEqual(A.referencesDansTexte('Une vidéo façon Kurzgesagt, ou TED-Ed'), ['kurzgesagt', 'ted-ed']);
});

test('controler : alias-a-l-ecran signale « façon Vox » écrit dans une scène', () => {
  const html = '<h2 data-texte="titre" data-start="0.3" data-dur="0.6"></h2><p data-start="1" data-dur="0.6">Un reportage façon Vox</p>';
  const dir = miniProjet({ scenes: [{ id: 'a', textes: { titre: 'Le froid, expliqué' }, html }, { id: 'b', textes: { titre: 'Comme Kurzgesagt' }, html: '<h2 data-texte="titre" data-start="0.3" data-dur="0.6"></h2>' }] });
  const p = controler({ dossier: dir, ecrire: false }).problemes.filter((x) => x.regle === 'alias-a-l-ecran');
  assert.equal(p.length, 2);
  assert.equal(p[0].scene, 'a');
  assert.equal(p[0].gravite, 'info');
  assert.match(p[0].message, /Scène « a », texte écrit dans la scène : « vox » est le nom d'une référence de style/);
  assert.equal(p[1].scene, 'b');
  assert.equal(p[1].element, 'titre');
  // « voix » n'est pas « vox » ; une scène sans référence n'a rien.
  const sain = miniProjet({ scenes: [{ id: 'a', textes: { titre: 'La voix du client' }, html: '<h2 data-texte="titre" data-start="0.3" data-dur="0.6"></h2>' }] });
  assert.deepEqual(controler({ dossier: sain, ecrire: false }).problemes.filter((x) => x.regle === 'alias-a-l-ecran'), []);
});

// ---------- 5.3 Propositions variées, habitudes retrouvées ----------

test('recommander : le style choisi la dernière fois pour ce genre vient en premier', () => {
  const perso = dossierPersonnelEssai();
  SP.noterProposition({ genre: 'formation', proposes: ['clair-pedagogique', 'chaleureux', 'minimal'], choisi: 'crayon', personnel: perso });
  SP.noterProposition({ genre: 'formation', proposes: ['clair-pedagogique', 'chaleureux', 'minimal'], choisi: 'tableau-noir', personnel: perso });
  SP.noterProposition({ genre: 'produit', proposes: ['minimal', 'tech-sombre', 'energique'], choisi: 'lancement', personnel: perso });
  const ctx = SP.contexteGenre('formation', { personnel: perso });
  assert.equal(ctx.habitude, 'tableau-noir');
  const c = S.classerPourGenre('formation', LIVRES_DIR, RECO, ctx);
  assert.equal(c.enAvant[0].style, 'tableau-noir');
  assert.equal(c.enAvant[0].marque, 'habitude');
  assert.deepEqual(noms(c.enAvant).slice(1, 3), ['clair-pedagogique', 'chaleureux']);
  assert.match(S.ligneCourte(c.enAvant[0]), / · habitude$/);
  assert.equal(S.classerPourGenre('produit', LIVRES_DIR, RECO, SP.contexteGenre('produit', { personnel: perso })).enAvant[0].style, 'lancement');
  // Un style qui n'existe plus n'est pas proposé.
  assert.equal(S.classerPourGenre('formation', LIVRES_DIR, RECO, { habitude: 'disparu' }).enAvant[0].style, 'clair-pedagogique');
  // Sans mémoire : la vidéo de ce genre la plus récemment vue (videos.json), le projet en cours exclu.
  const perso2 = dossierPersonnelEssai();
  const ancien = projet('formation', 'carnet');
  const recent = projet('formation', 'iso-album');
  const autreGenre = projet('social', 'riso');
  const ici = projet('formation', 'editorial');
  fs.writeFileSync(path.join(perso2, 'videos.json'), JSON.stringify([
    { dossier: ancien, titre: 'a', creee: '2026-01-01T00:00:00Z', vue: '2026-01-01T00:00:00Z' },
    { dossier: recent, titre: 'b', creee: '2026-02-01T00:00:00Z', vue: '2026-02-01T00:00:00Z' },
    { dossier: autreGenre, titre: 'c', creee: '2026-03-01T00:00:00Z', vue: '2026-03-01T00:00:00Z' },
    { dossier: ici, titre: 'd', creee: '2026-04-01T00:00:00Z', vue: '2026-04-01T00:00:00Z' },
  ]));
  assert.equal(SP.contexteGenre('formation', { personnel: perso2, projet: ici }).habitude, 'iso-album');
  // Ligne de commande : la ligne du premier style porte « habitude ».
  const r = node('styles.js', ['--genre', 'formation'], { PULSE_MOTION_DOSSIER: perso });
  assert.equal(r.status, 0, r.stderr);
  assert.match(JSON.parse(r.stdout)[0], /^tableau-noir · .* · habitude$/);
});

test('recommander : jamais 3 styles de la même famille parmi les 3 premiers', () => {
  // Préférence et habitude de la même famille que le premier recommandé : le 3ᵉ est remplacé par un style d'une autre famille.
  const c = S.classerPourGenre('formation', LIVRES_DIR, RECO, { preference: 'tableau-blanc', habitude: 'pictogrammes' });
  assert.deepEqual(noms(c.enAvant).slice(0, 2), ['tableau-blanc', 'pictogrammes']);
  assert.equal(famille('clair-pedagogique'), 'moderne');
  assert.notEqual(famille(c.enAvant[2].style), 'moderne');
  assert.equal(c.enAvant[2].style, 'chaleureux');
  assert.equal(c.enAvant[3].style, 'clair-pedagogique', 'l\'ancien 3ᵉ passe 4ᵉ');
  // Toutes les familles, tous les genres : préférence et habitude prises dans la même famille.
  const parFamille = new Map();
  for (const n of LIVRES) parFamille.set(famille(n), [...(parFamille.get(famille(n)) || []), n]);
  for (const genre of Object.keys(RECO)) {
    assert.deepEqual(new Set(S.classerPourGenre(genre, LIVRES_DIR, RECO).enAvant.slice(0, 3).map((f) => f.famille)).size > 1, true, genre);
    for (const [fam, liste] of parFamille) {
      if (liste.length < 2) continue;
      const trois = S.classerPourGenre(genre, LIVRES_DIR, RECO, { preference: liste[0], habitude: liste[1] }).enAvant.slice(0, 3);
      assert.ok(new Set(trois.map((f) => f.famille)).size > 1, `${genre}, ${fam} : ${noms(trois).join(', ')}`);
    }
  }
});

test('recommander : un style d\'« aussi » proposé 2 fois sur 5 sans être choisi passe à la fin de « aussi »', () => {
  const aussi = RECO.formation.aussi;
  const entree = (proposes, choisi = 'clair-pedagogique') => ({ date: '2026-11-13T00:00:00.000Z', genre: 'formation', proposes, choisi });
  const base = ['clair-pedagogique', 'chaleureux', 'minimal'];
  const avant = noms(S.classerPourGenre('formation', LIVRES_DIR, RECO, {}).enAvant).slice(3);
  assert.deepEqual(avant, aussi);
  const propositions = [entree(base), entree(['tableau-noir', 'clair-pedagogique', 'chaleureux']), entree(base), entree(['tableau-noir', 'chaleureux', 'minimal']), entree(base)];
  const apres = noms(S.classerPourGenre('formation', LIVRES_DIR, RECO, { propositions }).enAvant).slice(3);
  assert.deepEqual(apres, [...aussi.filter((s) => s !== 'tableau-noir'), 'tableau-noir']);
  // Choisi une fois dans ces 5 : il reste à sa place ; proposé 2 fois avant les 5 dernières : aussi.
  const choisi = [...propositions.slice(0, 4), entree(base, 'tableau-noir')];
  assert.deepEqual(noms(S.classerPourGenre('formation', LIVRES_DIR, RECO, { propositions: choisi }).enAvant).slice(3), aussi);
  const anciennes = [entree(['tableau-noir', 'a', 'b']), entree(['tableau-noir', 'a', 'b']), entree(base), entree(base), entree(base), entree(base), entree(base)];
  assert.deepEqual(noms(S.classerPourGenre('formation', LIVRES_DIR, RECO, { propositions: anciennes }).enAvant).slice(3), aussi);
  assert.deepEqual([...SP.stylesRecules(propositions)], ['tableau-noir']);
});

test('recommander : même projet, même ordre ; projets différents, « aussi » dans un autre ordre', () => {
  const aussiDe = (projetNom) => noms(S.classerPourGenre('formation', LIVRES_DIR, RECO, { projet: projetNom }).enAvant).slice(3);
  const a1 = aussiDe('formation-haccp');
  const a2 = aussiDe('formation-haccp');
  const b = aussiDe('accueil-nouveaux');
  assert.deepEqual(a1, a2);
  assert.notDeepEqual(a1, b);
  assert.deepEqual([...a1].sort(), [...RECO.formation.aussi].sort());
  assert.deepEqual([...b].sort(), [...RECO.formation.aussi].sort());
  // Les 3 premiers ne bougent pas d'un projet à l'autre.
  const trois = (p) => noms(S.classerPourGenre('formation', LIVRES_DIR, RECO, { projet: p }).enAvant).slice(0, 3);
  assert.deepEqual(trois('formation-haccp'), trois('accueil-nouveaux'));
  // Le nom du projet est celui de son dossier (--noter) : ligne de commande, deux fois le même ordre.
  const dir = projet('formation', 'clair-pedagogique', 'pm-haccp-');
  const env = { PULSE_MOTION_DOSSIER: dossierPersonnelEssai() };
  const l1 = node('styles.js', ['--genre', 'formation', '--noter', dir], env);
  const l2 = node('styles.js', ['--genre', 'formation', '--noter', dir], env);
  assert.equal(l1.status, 0, l1.stderr);
  assert.equal(l1.stdout, l2.stdout);
  assert.deepEqual(JSON.parse(l1.stdout).slice(3, 12).map((l) => l.split(' · ')[0]), aussiDe(path.basename(dir)));
});

test('styles-proposes : 30 entrées au plus ; écrit seulement à l\'accord du style', () => {
  const perso = dossierPersonnelEssai();
  const env = { PULSE_MOTION_DOSSIER: perso };
  const memoire = path.join(perso, 'styles-proposes.json');
  const dir = projet('formation', 'chaleureux');
  // Les 3 proposés sont notés dans l'état du projet, pas dans la mémoire de la personne.
  const r = node('styles.js', ['--genre', 'formation', '--noter', dir], env);
  assert.equal(r.status, 0, r.stderr);
  const etat = JSON.parse(fs.readFileSync(path.join(dir, '.pulse-motion', 'etat.json'), 'utf8'));
  assert.deepEqual(etat.stylesProposes.proposes, ['clair-pedagogique', 'chaleureux', 'minimal']);
  assert.equal(etat.stylesProposes.genre, 'formation');
  assert.equal(fs.existsSync(memoire), false);
  assert.equal(node('etat.js', [dir, '--accord', 'deroule'], env).status, 0);
  assert.equal(fs.existsSync(memoire), false, 'pas à l\'accord sur le déroulé');
  // Accord sur le style : une entrée, avec le style du déroulé ; un second accord n'écrit rien.
  const a = node('etat.js', [dir, '--accord', 'style'], env);
  assert.equal(a.status, 0, a.stderr);
  const liste = JSON.parse(fs.readFileSync(memoire, 'utf8'));
  assert.equal(liste.length, 1);
  assert.deepEqual({ ...liste[0], date: undefined }, { date: undefined, genre: 'formation', proposes: ['clair-pedagogique', 'chaleureux', 'minimal'], choisi: 'chaleureux' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.pulse-motion', 'etat.json'), 'utf8')).stylesProposes, undefined);
  assert.equal(node('etat.js', [dir, '--accord', 'style'], env).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(memoire, 'utf8')).length, 1);
  // 30 au plus : les plus anciennes partent.
  for (let i = 0; i < 34; i++) SP.noterProposition({ genre: 'social', proposes: ['energique', 'minimal', 'editorial'], choisi: i % 2 ? 'riso' : 'energique', personnel: perso });
  const pleine = JSON.parse(fs.readFileSync(memoire, 'utf8'));
  assert.equal(pleine.length, SP.MAX);
  assert.equal(SP.MAX, 30);
  assert.ok(pleine.every((p) => p.genre === 'social'));
  assert.equal(pleine[29].choisi, 'riso');
  // Sans dossier de la personne (tests sans PULSE_MOTION_DOSSIER) : rien n'est lu ni écrit.
  assert.equal(SP.noterProposition({ genre: 'social', proposes: ['riso'], personnel: null }), null);
  assert.deepEqual(SP.lirePropositions(null), []);
});

test('recommander : une préférence de portée style l\'emporte', () => {
  const perso = dossierPersonnelEssai();
  SP.noterProposition({ genre: 'formation', proposes: ['clair-pedagogique', 'chaleureux', 'minimal'], choisi: 'crayon', personnel: perso });
  // Une préférence d'un autre domaine dont la portée nomme un style ne change pas l'ordre.
  assert.equal(noterPreference({ citation: 'Moins de grain sur le riso', regle: 'Trame à 50 %', domaine: 'couleur', style: 'riso', dossier: perso }).ok, true);
  assert.equal(SP.contexteGenre('formation', { personnel: perso }).preference, null);
  assert.equal(noterPreference({ citation: 'Toujours le tableau noir pour mes formations', regle: 'Style tableau-noir', domaine: 'style', genre: 'formation', style: 'tableau-noir', dossier: perso }).ok, true);
  assert.equal(noterPreference({ citation: 'Pour mes produits, le minimal', regle: 'Style minimal', domaine: 'style', genre: 'produit', style: 'minimal', dossier: perso }).ok, true);
  const ctx = SP.contexteGenre('formation', { personnel: perso });
  assert.equal(ctx.preference, 'tableau-noir');
  assert.equal(ctx.habitude, 'crayon');
  const c = S.classerPourGenre('formation', LIVRES_DIR, RECO, ctx);
  assert.deepEqual(noms(c.enAvant).slice(0, 2), ['tableau-noir', 'crayon']);
  assert.equal(c.enAvant[0].marque, 'préférence');
  assert.equal(S.classerPourGenre('produit', LIVRES_DIR, RECO, SP.contexteGenre('produit', { personnel: perso })).enAvant[0].style, 'minimal');
  // Préférence et habitude sur le même style : une seule fois, marqué « préférence ».
  const meme = S.classerPourGenre('formation', LIVRES_DIR, RECO, { preference: 'crayon', habitude: 'crayon' });
  assert.equal(noms(meme.enAvant).filter((n) => n === 'crayon').length, 1);
  assert.equal(meme.enAvant[0].marque, 'préférence');
  // Ligne de commande.
  const r = node('styles.js', ['--genre', 'formation'], { PULSE_MOTION_DOSSIER: perso });
  assert.equal(r.status, 0, r.stderr);
  assert.match(JSON.parse(r.stdout)[0], /^tableau-noir · .* · préférence$/);
});
