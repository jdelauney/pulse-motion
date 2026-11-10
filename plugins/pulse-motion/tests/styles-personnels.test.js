'use strict';
// Critères de S8 J2 « Styles personnels guidés » (spec Styles et réalisation, 5.5) : base notée, journal des changements,
// planche avec la base, base modifiée signalée une fois, guide aux 11 sections, consignes du skill style.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const P = require('../scripts/style-perso.js');
const S = require('../scripts/styles.js');
const T = require('../scripts/lib/temoin.js');
const { decouper, verifierFiche } = require('../scripts/lib/fiche-style.js');
const { SECTIONS_FICHE } = require('../scripts/lib/contrat.js');
const { dossierPersonnelEssai } = require('./aide/styles.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const VERSION = JSON.parse(lire('.claude-plugin', 'plugin.json')).version;
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

async function avecPersonnel(fn) {
  const avant = process.env.PULSE_MOTION_DOSSIER;
  process.env.PULSE_MOTION_DOSSIER = dossierPersonnelEssai();
  try { return await fn(process.env.PULSE_MOTION_DOSSIER); } finally {
    if (avant === undefined) delete process.env.PULSE_MOTION_DOSSIER; else process.env.PULSE_MOTION_DOSSIER = avant;
  }
}

const styles = (perso, ...args) => spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'styles.js'), ...args], { encoding: 'utf8', env: { ...process.env, PULSE_MOTION_DOSSIER: perso } });

test('style nouveau : identite.base renseigné (style, empreinte, versionPlugin)', () => avecPersonnel(async (perso) => {
  const r = P.nouveauStyle({ nom: 'papercraft', depuis: 'energique', emprunts: ['minimal'] });
  assert.equal(r.ok, true, r.message);
  const id = JSON.parse(fs.readFileSync(path.join(r.dossier, 'identite.json'), 'utf8'));
  assert.deepEqual(id.base, { style: 'energique', empreinte: S.empreinteBase(S.trouverStyle('energique')), versionPlugin: VERSION, emprunts: ['minimal'] });
  assert.match(id.base.empreinte, /^[0-9a-f]{64}$/);
  assert.equal(S.verifierStyle(r.dossier).ok, true);
  // Une base personnelle : sa vérification, son journal et sa marque ne suivent pas la copie.
  fs.writeFileSync(path.join(r.dossier, S.CHANGEMENTS), '[]');
  fs.writeFileSync(path.join(r.dossier, S.MARQUE_BASE), '{}');
  const second = P.nouveauStyle({ nom: 'papier-2', depuis: 'papercraft' });
  assert.equal(second.ok, true, second.message);
  for (const f of ['.verifie.json', S.CHANGEMENTS, S.MARQUE_BASE]) assert.equal(fs.existsSync(path.join(second.dossier, f)), false, f);
  assert.equal(JSON.parse(fs.readFileSync(path.join(second.dossier, 'identite.json'), 'utf8')).base.style, 'papercraft');
  // Un emprunt inconnu est refusé, rien n'est créé ; une base mal formée est refusée par le contrat.
  assert.match(P.nouveauStyle({ nom: 'papier-3', emprunts: ['neon'] }).message, /Style « neon » introuvable/);
  assert.equal(fs.existsSync(path.join(perso, 'styles', 'papier-3')), false);
  const f = path.join(second.dossier, 'identite.json');
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  j.base = { style: 'papercraft' };
  fs.writeFileSync(f, JSON.stringify(j));
  assert.match(S.verifierStyle(second.dossier).erreurs.join(' '), /« base » : \{ "style", "empreinte", "versionPlugin" \}/);
  // La ligne de commande accepte --emprunts.
  const cli = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'pm.js'), 'style', 'nouveau', 'papier-4', '--depuis', 'minimal', '--emprunts', 'editorial'], { encoding: 'utf8', env: { ...process.env, PULSE_MOTION_DOSSIER: perso } });
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(perso, 'styles', 'papier-4', 'identite.json'), 'utf8')).base.emprunts, ['editorial']);
}));

test('style verifier : avertit au-delà de 5 changements dans un même tour', () => avecPersonnel(async (perso) => {
  P.nouveauStyle({ nom: 'papercraft', depuis: 'clair-pedagogique' });
  const noter = (n, o = {}) => P.noterChangement({ nom: 'papercraft', section: '§ 3', avant: `bleu ${n}`, apres: `vert ${n}`, pourquoi: 'la marque', date: '2026-11-10', ...o });
  const premier = noter(1);
  assert.deepEqual(premier, { ok: true, tour: 1, changements: 1 });
  for (let n = 2; n <= 5; n++) assert.equal(noter(n).avertissement, undefined, n);
  // Un changement imposé par la charte ne compte pas.
  assert.deepEqual(noter(6, { charte: true, section: '4' }), { ok: true, tour: 1, changements: 5 });
  assert.equal((await P.verifierStylePerso({ nom: 'papercraft', navigateur: null })).avertissements.filter((a) => /changements\.json/.test(a)).length, 0);
  const sixieme = noter(7, { section: "L'essentiel" });
  assert.equal(sixieme.changements, 6);
  assert.match(sixieme.avertissement, /6 changements dans le tour 1 : 5 au plus/);
  const v = await P.verifierStylePerso({ nom: 'papercraft', navigateur: null });
  assert.equal(v.ok, true, 'un avertissement ne bloque pas le style');
  assert.ok(v.avertissements.some((a) => /changements\.json : le tour 1 compte 6 changements, 5 au plus par tour/.test(a)), v.avertissements.join('\n'));
  // Tour suivant : le compte repart.
  assert.deepEqual(P.noterChangement({ nom: 'papercraft', section: '5', avant: 'vif', apres: 'doux', pourquoi: 'plus calme', nouveauTour: true, date: '2026-11-10' }), { ok: true, tour: 2, changements: 1 });
  const journal = JSON.parse(fs.readFileSync(path.join(perso, 'styles', 'papercraft', 'changements.json'), 'utf8'));
  assert.deepEqual(journal[0], { tour: 1, section: '§ 3', avant: 'bleu 1', apres: 'vert 1', pourquoi: 'la marque', date: '2026-11-10' });
  assert.deepEqual(journal.map((c) => c.section), ['§ 3', '§ 3', '§ 3', '§ 3', '§ 3', '§ 4', "L'essentiel", '§ 5']);
  assert.equal(journal[5].charte, true);
  // Refus : section inconnue, changement incomplet, style livré.
  assert.match(noter(8, { section: '§ 12' }).message, /Section « § 12 » inconnue/);
  assert.match(noter(8, { apres: ' ' }).message, /avant, ce qu'il y a après et pourquoi/);
  assert.match(P.noterChangement({ nom: 'minimal', section: '3', avant: 'a', apres: 'b', pourquoi: 'c' }).message, /style livré/);
  // Le journal n'entre pas dans l'empreinte : le style vérifié le reste.
  assert.equal(S.listerStyles().find((f) => f.style === 'papercraft').verifie, true);
  // La ligne de commande.
  const pm = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'pm.js'), 'style', 'noter', 'papercraft', '§ 8', 'aucun geste', 'le tampon', 'signature de la marque'], { encoding: 'utf8', env: { ...process.env, PULSE_MOTION_DOSSIER: perso } });
  assert.equal(pm.status, 0, pm.stderr);
  assert.deepEqual(JSON.parse(pm.stdout), { ok: true, tour: 2, changements: 2 });
}));

/** imagesTemoin réel, sur une capture factice : note les textes et les instants de chaque style rendu. */
function capturesNotees(vus) {
  return (o) => T.imagesTemoin({ ...o, plancheInstants: async ({ dossier, instants }) => {
    const d = JSON.parse(fs.readFileSync(path.join(dossier, 'deroule.json'), 'utf8'));
    vus.push({ style: d.style, textes: d.scenes.map((s) => s.textes), instants });
    fs.mkdirSync(path.join(dossier, 'sortie', 'planche'), { recursive: true });
    return { ok: true, ips: 30, images: instants.map((t, i) => { fs.writeFileSync(path.join(dossier, 'sortie', 'planche', `i${i}.png`), PNG); return { t, fichier: `sortie/planche/i${i}.png` }; }) };
  } });
}

test('style planche --avec-base : deux colonnes, base à gauche, mêmes textes', () => avecPersonnel(async (perso) => {
  P.nouveauStyle({ nom: 'papercraft', depuis: 'editorial' });
  const vus = [];
  const ouverts = [];
  const r = await P.plancheStyle({ nom: 'papercraft', avecBase: true, ouvrir: true, imagesTemoin: capturesNotees(vus), ouvrirFichier: (f) => ouverts.push(f) });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.base, 'editorial');
  const sortie = path.join(perso, 'essais', 'papercraft');
  assert.equal(r.fichier, path.join(sortie, 'planche.html'));
  assert.deepEqual(ouverts, [r.fichier]);
  assert.deepEqual(r.images.map((f) => path.basename(f)), ['base-temoin-a.png', 'base-temoin-b.png', 'temoin-a.png', 'temoin-b.png']);
  for (const f of r.images) assert.ok(fs.existsSync(f), f);
  // La base d'abord (à gauche), le style ensuite, avec les mêmes textes et les mêmes instants.
  assert.deepEqual(vus.map((v) => v.style), ['editorial', 'papercraft']);
  assert.deepEqual(vus[0].textes, vus[1].textes);
  assert.deepEqual(vus[0].instants, vus[1].instants);
  const html = fs.readFileSync(r.fichier, 'utf8');
  const colonnes = [...html.matchAll(/<th class="colonne">([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(colonnes, ['Base : editorial', 'Votre style : papercraft']);
  for (const ligne of html.split('\n').filter((l) => l.startsWith('<tr><th>'))) {
    const imgs = [...ligne.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(imgs.length, 2, ligne);
    assert.match(imgs[0], /^base-temoin-[ab]\.png$/);
    assert.match(imgs[1], /^temoin-[ab]\.png$/);
  }
  // Sans base notée (style d'avant) : un message, pas d'image.
  const f = path.join(perso, 'styles', 'papercraft', 'identite.json');
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  delete j.base;
  fs.writeFileSync(f, JSON.stringify(j));
  const sans = await P.plancheStyle({ nom: 'papercraft', avecBase: true, imagesTemoin: async () => { throw new Error('ne doit pas être appelé'); } });
  assert.match(sans.message, /n'a pas de base notée/);
}));

test('style personnel : base modifiée signalée une seule fois', () => avecPersonnel(async (perso) => {
  // Une base personnelle tient lieu de style livré mis à jour : on la modifie après coup.
  P.nouveauStyle({ nom: 'maison', depuis: 'clair-pedagogique' });
  P.nouveauStyle({ nom: 'papercraft', depuis: 'maison' });
  assert.equal((await P.verifierStylePerso({ nom: 'papercraft', navigateur: null })).ok, true);
  const fiche = () => S.listerStyles().find((x) => x.style === 'papercraft');
  assert.equal(fiche().baseModifiee, undefined, 'base inchangée');
  assert.deepEqual(P.baseDuStyle({ nom: 'papercraft' }), { ok: true, base: 'maison', versionPlugin: VERSION, versionActuelle: VERSION, modifiee: false });
  // Une fin de ligne changée n'est pas une modification.
  const css = path.join(perso, 'styles', 'maison', 'style.css');
  fs.writeFileSync(css, fs.readFileSync(css, 'utf8').replace(/\r?\n/g, '\r\n'));
  assert.equal(fiche().baseModifiee, undefined, 'fins de ligne seules');
  fs.appendFileSync(css, '\n.titre { letter-spacing: -0.01em; }\n');
  assert.equal(fiche().baseModifiee, true);
  assert.equal(fiche().base, 'maison');
  // La liste le dit une fois, puis plus jamais pour cette version de la base ; le style reste vérifié.
  const un = styles(perso);
  assert.equal(un.status, 0, un.stderr);
  assert.equal(JSON.parse(un.stdout).find((x) => x.style === 'papercraft').baseModifiee, true);
  assert.ok(fs.existsSync(path.join(perso, 'styles', 'papercraft', S.MARQUE_BASE)));
  const deux = styles(perso);
  assert.equal(JSON.parse(deux.stdout).find((x) => x.style === 'papercraft').baseModifiee, undefined);
  assert.equal(fiche().verifie, true, 'la marque n\'entre pas dans l\'empreinte du style');
  // Une nouvelle modification de la base est dite à son tour, aussi dans la liste par genre (forme courte).
  fs.appendFileSync(css, '\n.sous-titre { letter-spacing: 0; }\n');
  const genre = styles(perso, '--genre', 'formation');
  assert.equal(genre.status, 0, genre.stderr);
  const sortie = JSON.parse(genre.stdout);
  const papier = sortie.find((x) => (typeof x === 'string' ? x.startsWith('papercraft ·') : x.style === 'papercraft'));
  assert.ok(typeof papier === 'string' ? /base « maison » modifiée/.test(papier) : papier.baseModifiee === true, JSON.stringify(papier));
  assert.equal(JSON.parse(styles(perso, '--genre', 'formation').stdout).some((x) => (typeof x === 'string' ? /modifiée/.test(x) : x.baseModifiee)), false);
  // Reprendre la base : elle est notée à jour, la marque retirée.
  assert.equal(P.baseDuStyle({ nom: 'papercraft' }).modifiee, true);
  const aJour = P.baseDuStyle({ nom: 'papercraft', aJour: true });
  assert.deepEqual([aJour.ok, aJour.modifiee, aJour.aJour], [true, false, true]);
  assert.equal(P.baseDuStyle({ nom: 'papercraft' }).modifiee, false);
  assert.equal(fs.existsSync(path.join(perso, 'styles', 'papercraft', S.MARQUE_BASE)), false);
  assert.match(P.baseDuStyle({ nom: 'minimal' }).message, /style livré/);
}));

test('style personnel : guide.md aux 11 sections, avec la ligne « Adapté du style »', () => avecPersonnel(async (perso) => {
  for (const base of ['clair-pedagogique', 'minimal', 'tech-sombre']) {
    const nom = `perso-${base}`;
    const r = P.nouveauStyle({ nom, depuis: base });
    const guide = fs.readFileSync(path.join(r.dossier, 'guide.md'), 'utf8');
    assert.match(guide, new RegExp(`^# Style « ${nom} »\\n\\nAdapté du style « ${base} »\\.\\n\\n> `), base);
    assert.deepEqual(decouper(guide).sections.map((s) => s.titre), SECTIONS_FICHE, base);
    const identite = JSON.parse(fs.readFileSync(path.join(r.dossier, 'identite.json'), 'utf8'));
    assert.deepEqual(verifierFiche(guide, { dossierStyle: r.dossier, identite }), [], base);
    assert.deepEqual(P.verifierGuide(r.dossier), [], base);
    // La fiche de la base, entière, en dessous.
    assert.equal(guide.split('\n').slice(4).join('\n'), lire('references', 'styles', `${base}.md`).replace(/\r\n/g, '\n').split('\n').slice(2).join('\n'), base);
  }
  // Un guide d'avant (ancien format) : des avertissements, jamais des erreurs.
  const dossier = path.join(perso, 'styles', 'perso-minimal');
  fs.writeFileSync(path.join(dossier, 'guide.md'), '# Style « perso-minimal »\n\n## L\'essentiel\n\n- Repris.\n');
  const v = await P.verifierStylePerso({ nom: 'perso-minimal', navigateur: null });
  assert.deepEqual(v.erreurs, []);
  assert.ok(v.avertissements.some((a) => /^guide\.md : Sections/.test(a)), v.avertissements.join('\n'));
  assert.ok(v.avertissements.some((a) => /« Adapté du style « minimal » » manque/.test(a)));
  assert.equal(v.ok, true);
}));

test('skill style : cite les trois groupes et la limite de 5 changements', () => {
  const s = lire('skills', 'style', 'SKILL.md');
  for (const motif of [/sans risque, change son caractère, impossible/, /\*\*5 changements au plus par tour\*\* \(hors charte\)/, /résumé avant \/ après \/ ce que ça coûte, puis l'accord/,
    /« Adapter un style \(Recommandé\) »/, /« Partir d'une page blanche »/, /`pulse-motion style planche <nom> --avec-base --ouvrir`/, /`pulse-motion style noter <nom> <section>/,
    /`pulse-motion reference style-personnel`/, /--emprunts <style>/, /`baseModifiee`/]) assert.match(s, motif);
  const ref = lire('references', 'style-personnel.md');
  assert.match(ref, /^# Style personnel guidé\n\n## L'essentiel\n/);
  assert.match(ref, /\| Sans risque \| § 3 .*§ 4 .*§ 5 .*§ 7 .*§ 8 /);
  assert.match(ref, /\| Change son caractère \| § 2 .*§ 3.*§ 6 /);
  assert.match(ref, /\| Impossible \| § 1 /);
  assert.match(ref, /\*\*5 changements au plus par tour\.\*\* Un changement imposé par la charte/);
  assert.match(ref, /## Base modifiée[\s\S]*\*\*une seule fois\*\*[\s\S]*`pulse-motion style base <nom> --a-jour`/);
  // creer : la fiche entière du style recommandé, la base modifiée ; le critique lit la section du style de sa fiche.
  const c = lire('skills', 'creer', 'SKILL.md');
  assert.match(c, /lire sa fiche entière \(`pulse-motion reference styles\/<style>`\)/);
  assert.match(c, /Style `baseModifiee` : `pulse-motion reference style-personnel`, « Base modifiée »/);
  assert.match(lire('agents', 'critique.md'), /Lire `fiche\.md` \(intentions, textes, style,/);
});
