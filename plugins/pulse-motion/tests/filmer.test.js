'use strict';
/* Spec S6 « Filmer une application et tutoriels logiciels », plan 2 (tournage local) : critères vérifiables sans navigateur
 * (parcours, film figé et prises, plan de lecture, déroulé, assemblage, contrôle, historique, état, compétence et consignes).
 * Les critères filmés ou rendus sont dans filmer-page.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Pa = require('../scripts/lib/parcours.js');
const F = require('../scripts/lib/film.js');
const Fm = require('../moteur/film.js');
const Pt = require('../moteur/pointeur.js');
const C = require('../scripts/lib/cdp.js');
const N = require('../scripts/lib/navigateur.js');
const GM = require('../scripts/lib/groupes-moteur.js');
const { assembler } = require('../scripts/assembler.js');
const { lireDeroule } = require('../scripts/lib/deroule.js');
const { controlerScene } = require('../scripts/lib/controle-scene.js');
const { etatProjet } = require('../scripts/etat.js');
const H = require('../scripts/historique.js');
const { tourner } = require('../scripts/lib/tournage.js');
const { sectionsConsignes } = require('../scripts/lib/consignes.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { ecrireFilm, filmSynthetique } = require('./aide/film.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const ecranFilm = (attrs = '', marques = '') => `<div class="pm-ecran" data-film="essai" data-start="0"${attrs}>${marques}</div>`;

// --- 5.1 CDP -------------------------------------------------------------------------------------------------------

test('cdp : ouvrirPage sans option garde --headless=new ; avec fenetre, lance sans --headless (profil donné gardé)', () => {
  const sans = C.argumentsLancement({ largeur: 1280, hauteur: 800, profil: 'p' });
  assert.ok(sans.includes('--headless=new') && sans.includes('--hide-scrollbars'));
  assert.ok(!sans.some((x) => x.startsWith('--force-device-scale-factor')));
  const avec = C.argumentsLancement({ largeur: 1280, hauteur: 800, profil: 'p', fenetre: true, echelle: 1.5, base: N.optionsTournage({}) });
  assert.ok(!avec.includes('--headless=new') && !avec.includes('--hide-scrollbars'));
  assert.ok(avec.includes('--force-device-scale-factor=1.5') && avec.includes('--user-data-dir=p'));
  for (const d of ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--lang=fr-FR']) assert.ok(N.optionsTournage({}).includes(d), d);
  assert.ok(!N.optionsTournage({ fenetre: true }).includes('--headless=new'));
});

// --- 5.2 Parcours --------------------------------------------------------------------------------------------------

test('parcours : chaque verbe du tableau est accepté avec ses champs', () => {
  const dir = dossierTemporaire('pm-parcours-');
  const p = { nom: 'factures', depart: 'appli-essai/factures.html', etapes: [
    { faire: 'aller', url: 'http://localhost:5173/factures', dit: 'Va sur les factures' },
    { faire: 'cliquer', cible: 'Nouvelle facture' }, { faire: 'double-cliquer', cible: { texte: 'Modifier', rang: 2 } },
    { faire: 'survoler', cible: 'Aide' }, { faire: 'taper', cible: 'Client', texte: 'Dupont SARL', puis: 'Entrée' },
    { faire: 'vider', cible: 'Remise' }, { faire: 'choisir', cible: 'Mode de paiement', option: 'Virement' },
    { faire: 'cocher', cible: "J'accepte les conditions" }, { faire: 'decocher', cible: { texte: 'Lettre', dans: 'fenêtre' } },
    { faire: 'defiler', vers: 'Total' }, { faire: 'defiler', ecrans: 1 }, { faire: 'touche', touches: 'Ctrl+S' },
    { faire: 'touche', touches: 'Échap' }, { faire: 'attendre', texte: 'Facture enregistrée' }, { faire: 'attendre', secondes: 2 },
    { faire: 'cliquer', cible: { selecteur: '#enregistrer' } }, { faire: 'cliquer', cible: { point: [50, 20] } },
  ] };
  const v = Pa.validerParcours(p, { projet: dir });
  assert.deepEqual(v.erreurs, []);
  assert.equal(v.etapes.length, p.etapes.length);
  assert.match(v.etapes[4].phrase, /Dans « Client », taper « Dupont SARL », puis Entrée/);
  assert.deepEqual(Pa.lireTouches('Ctrl+S'), { modificateurs: ['Control'], cle: { key: 's', code: 'KeyS', keyCode: 83, text: 's' } });
  assert.equal(Pa.lireTouches('Échap').cle.key, 'Escape');
});

test('parcours : « clique » est refusé avec la proposition « cliquer »', () => {
  const v = Pa.validerParcours({ nom: 'a', depart: 'appli-essai', etapes: [{ faire: 'clique', cible: 'OK' }] });
  assert.equal(v.ok, false);
  assert.match(v.erreurs[0], /verbe « clique » inconnu ; écrire « cliquer »/);
});

test('parcours : taper dans un champ de mot de passe est refusé', () => {
  const v = Pa.validerParcours({ nom: 'a', depart: 'appli-essai', etapes: [{ faire: 'taper', cible: 'Mot de passe', texte: 'secret123' }] });
  assert.equal(v.ok, false);
  assert.ok(v.erreurs.some((e) => e.includes('Je ne tape jamais de mot de passe : la personne se connecte elle-même (étape de connexion)')), v.erreurs.join(' '));
});

test('parcours : une adresse ftp ou un fichier hors du projet est refusé', () => {
  const dir = dossierTemporaire('pm-parcours-');
  const ftp = Pa.validerParcours({ nom: 'a', depart: 'ftp://exemple.fr/x', etapes: [{ faire: 'attendre', secondes: 1 }] }, { projet: dir });
  assert.match(ftp.erreurs.join(' '), /seules les adresses http, https et file se filment/);
  const dehors = Pa.validerParcours({ nom: 'a', depart: '../ailleurs/index.html', etapes: [{ faire: 'attendre', secondes: 1 }] }, { projet: dir });
  assert.match(dehors.erreurs.join(' '), /hors du dossier de la vidéo/);
  assert.deepEqual(Pa.validerParcours({ nom: 'a', depart: 'appli/index.html', etapes: [{ faire: 'attendre', secondes: 1 }] }, { projet: dir }).erreurs, []);
});

test('filmer : sans --accord, un site en ligne est refusé ; file:// et localhost passent', async () => {
  const dir = dossierTemporaire('pm-filmer-');
  const ecrire = (depart) => { fs.mkdirSync(path.join(dir, 'films', 'x'), { recursive: true }); fs.writeFileSync(path.join(dir, 'films', 'x', 'parcours.json'), JSON.stringify({ nom: 'x', depart, etapes: [{ faire: 'attendre', secondes: 1 }] })); };
  ecrire('https://app.exemple.fr/factures');
  assert.deepEqual(await tourner({ projet: dir, nom: 'x', navigateur: null }), { ok: false, besoin: 'accord', site: 'app.exemple.fr' });
  // Avec l'accord (plan 3) : noté dans le parcours ; les prises suivantes de ce site ne le redemandent pas.
  assert.equal((await tourner({ projet: dir, nom: 'x', accord: true, navigateur: null })).erreur, 'navigateur');
  const note = JSON.parse(fs.readFileSync(path.join(dir, 'films', 'x', 'parcours.json'), 'utf8')).accord;
  assert.equal(note.site, 'app.exemple.fr');
  assert.match(note.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await tourner({ projet: dir, nom: 'x', navigateur: null })).erreur, 'navigateur');
  for (const depart of ['http://localhost:5173/', 'http://127.0.0.1:8080/x', 'page.html', 'appli-essai']) {
    ecrire(depart);
    const r = await tourner({ projet: dir, nom: 'x', navigateur: null });
    assert.equal(r.erreur, 'navigateur', depart);
  }
  assert.equal(Pa.lireAdresse('http://localhost:5173/').sorte, 'local');
  assert.equal(Pa.lireAdresse('https://app.exemple.fr').sorte, 'en-ligne');
});

// --- 5.7 Film et prises --------------------------------------------------------------------------------------------

test('film : choisir écrit parcours.prise ; supprimer refuse la prise choisie', () => {
  const dir = dossierTemporaire('pm-prises-');
  ecrireFilm(dir, { choisie: false });
  fs.cpSync(path.join(dir, 'films', 'essai', 'prise-01'), path.join(dir, 'films', 'essai', 'prise-02'), { recursive: true });
  assert.equal(F.prochainePrise(dir, 'essai'), 'prise-03');
  assert.deepEqual(F.prises(dir, 'essai').map((p) => [p.prise, p.ok, p.choisie]), [['prise-01', true, false], ['prise-02', true, false]]);
  assert.equal(F.filmChoisi(dir, 'essai').regle, 'prise-non-choisie');
  F.choisirPrise(dir, 'essai', 'prise-02');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'films', 'essai', 'parcours.json'), 'utf8')).prise, 'prise-02');
  assert.throws(() => F.supprimerPrise(dir, 'essai', 'prise-02'), /prise choisie/);
  F.supprimerPrise(dir, 'essai', 'prise-01');
  assert.deepEqual(F.prises(dir, 'essai').map((p) => p.prise), ['prise-02']);
  assert.equal(F.filmChoisi(dir, 'inconnu').regle, 'film-introuvable');
});

test('film : une prise de version 1 reste lisible (validation de film.json v1)', () => {
  assert.deepEqual(F.validerFilm(filmSynthetique()), []);
  const autre = { ...filmSynthetique(), version: 2 };
  assert.match(F.validerFilm(autre).join(' '), /version 2 inconnue/);
  const avecParametres = filmSynthetique();
  avecParametres.etapes[0].url = 'https://x.fr/a?client=12';
  assert.match(F.validerFilm(avecParametres).join(' '), /sans paramètres ni fragment/);
  assert.deepEqual(F.lireEtapes('2-4'), [2, 3, 4]);
  assert.deepEqual(F.lireEtapes('1,3'), [1, 3]);
  assert.equal(F.lireEtapes('a-b'), null);
});

// --- 5.8 Lecture -----------------------------------------------------------------------------------------------------

test('film : imageA est une fonction pure de t (mêmes noms pour deux appels, aucune horloge lue)', () => {
  const film = filmSynthetique();
  const avant = Date.now;
  Date.now = () => { throw new Error('horloge lue'); };
  try {
    const plan = Fm.planifierFilm(film, { 1: 2 }, { duree: 8 });
    const instants = Array.from({ length: 160 }, (_, k) => k * 0.05);
    const a = instants.map((t) => Fm.imageA(plan, t));
    const b = instants.slice().reverse().map((t) => Fm.imageA(plan, t)).reverse();
    assert.deepEqual(a, b);
    assert.deepEqual(Fm.imageA(Fm.planifierFilm(film, { 1: 2 }, { duree: 8 }), 2.2), Fm.imageA(plan, 2.2));
  } finally { Date.now = avant; }
  assert.doesNotMatch(lire('moteur', 'film.js'), /Date\.now|performance\.now|M\.temps\(/);
});

test('film : avant l\'arrivée du pointeur l\'image est « avant », pendant le survol « survol », après la réaction « après »', () => {
  const plan = Fm.planifierFilm(filmSynthetique(), { 1: 2 }, { duree: 8 });
  const p = plan.etapes[0];
  assert.equal(p.action, 2);
  assert.equal(p.arrivee, 2 - Pt.PAUSE);
  assert.ok(Math.abs(p.depart - (p.arrivee - p.trajet)) < 1e-3 && p.trajet >= 0.3 && p.trajet <= 1.1);
  assert.equal(Fm.imageA(plan, 0.5), '0001.png');
  assert.equal(Fm.imageA(plan, p.arrivee + 0.1), '0002.png');
  assert.equal(Fm.imageA(plan, 2.2), 'r01-0001.png');
  assert.equal(Fm.imageA(plan, 2.51), 'r01-0002.png');
  assert.equal(Fm.imageA(plan, p.fin + 0.01), '0003.png');
  // aller : fondu de 0,25 s de « avant » vers « après ».
  const q = plan.etapes[1];
  assert.deepEqual(Fm.etatFilm(plan, q.action + 0.125).fondu, { image: '0004.png', opacite: 0.5 });
  assert.equal(Fm.imageA(plan, q.action + 0.3), '0004.png');
  // Le geste du pointeur est celui de l'étape : la pointe au point relevé à l'instant de l'action.
  const g = Pt.planGestes(Fm.gestesDuPlan(plan), { depart: [0.72 * 640, 0.78 * 400], diagonale: Math.hypot(640, 400) });
  const st = Pt.etatPointeur(g, 2);
  assert.deepEqual([st.x, st.y], [409.6, 289]);
  assert.ok(Math.abs(g.gestes[0].debut - p.depart) < 1e-3, 'même trajet que le plan du film');
});

test('film : étapes trop rapprochées donnent etapes-trop-rapprochees avec l\'écart minimal', () => {
  const film = filmSynthetique();
  const plan = Fm.planifierFilm(film, { 1: 2, 3: 3 }, { duree: 8 });
  assert.equal(plan.ecarts.length, 1);
  const [e] = plan.ecarts;
  assert.equal(e.a, 2);
  assert.equal(e.b, 3);
  // Écart minimal entre deux actions : R_k + 0,35 + T_k+1 + 0,2.
  const p = Fm.planifierFilm(film, {}, { duree: 20 });
  const [, b, c] = p.etapes;
  assert.ok(Math.abs(Fm.ecartMinimal(b, c) - (b.reaction + Pt.PAUSE + c.trajet + 0.2)) < 1e-3);
  assert.ok(c.action - b.action >= Fm.ecartMinimal(b, c) - 1e-3);
  // Sans marque, le temps libre se partage en parts égales entre les états calmes.
  const g1 = p.etapes[0].debut, g2 = p.etapes[1].debut - p.etapes[0].fin, g3 = p.etapes[2].debut - p.etapes[1].fin, g4 = 20 - p.etapes[2].fin;
  for (const g of [g2, g3, g4]) assert.ok(Math.abs(g - g1) < 1e-2, `${g} / ${g1}`);
});

test('deroule : film inconnu, étape absente ou scène trop courte sont refusés avec un message', () => {
  const dir = miniProjet({ scenes: [{ id: 's3', html: ecranFilm(), duree: 6, textes: {} }] });
  const d = (film, duree = 6) => { const f = path.join(dir, 'deroule.json'); const x = JSON.parse(fs.readFileSync(f, 'utf8')); x.scenes[0].film = film; x.scenes[0].duree = duree; fs.writeFileSync(f, JSON.stringify(x)); return lireDeroule(dir).erreurs; };
  assert.match(d({ nom: 'essai' }).join(' '), /le film « essai » n'existe pas/);
  ecrireFilm(dir);
  assert.match(d({ nom: 'essai', etapes: '2-5' }).join(' '), /n'a pas d'étape 4, 5 ; il en a 3/);
  assert.match(d({ nom: 'essai', etapes: '1-3' }, 1.5).join(' '), /La scène « s3 » dure 1,5 s ; ses 3 étapes demandent au moins \d+,\d s/);
  assert.deepEqual(d({ nom: 'essai', etapes: '1-3' }, 8), []);
  assert.match(d({ nom: 'Essai!' }).join(' '), /« film » doit être/);
});

test('assembler : seules les images des étapes visées par les scènes sont embarquées', () => {
  const dir = miniProjet({ scenes: [{ id: 'a', html: ecranFilm(), duree: 5, textes: {} }] });
  ecrireFilm(dir);
  const f = path.join(dir, 'deroule.json');
  const x = JSON.parse(fs.readFileSync(f, 'utf8'));
  x.scenes[0].film = { nom: 'essai', etapes: '1' };
  fs.writeFileSync(f, JSON.stringify(x));
  const a = assembler({ dossier: dir, ecrire: false });
  assert.equal(a.ok, true, JSON.stringify(a.erreurs));
  const bloc = JSON.parse(/<script type="application\/json" id="pm-film-essai">([\s\S]*?)<\/script>/.exec(a.html)[1]);
  assert.deepEqual(bloc.etapes.map((e) => e.n), [1]);
  assert.deepEqual(Object.keys(bloc.images).sort(), ['0001.png', '0002.png', '0003.png', 'r01-0001.png', 'r01-0002.png']);
  assert.ok(!('dit' in bloc.etapes[0]) && !('url' in bloc.etapes[0]), 'ni la phrase ni l\'adresse dans la page');
  assert.match(a.html, /data-film="fichier:pm-film-essai"/);
  assert.match(a.html, /data-etapes="1"/);
  assert.match(a.html, /--pm-page-l: 640; --pm-page-h: 400; --pm-ecran-bords-1: #102030; --pm-ecran-bords-2: #a0b0c0;/);
  assert.ok(a.groupes.includes('ecran') && GM.GROUPES.ecran.includes('film.js'));
  // Étape de clic sans marque : son bruitage à l'instant où le moteur la place.
  const plan = Fm.planifierFilm(filmSynthetique(), {}, { etapes: [1], duree: 5 });
  assert.match(a.html, new RegExp(`<i class="pm-son-clic" data-son="clic" data-start="${plan.etapes[0].action}"`));
});

test('controler : film-introuvable, prise-non-choisie, film-trop-lourd et pointeur-hors-ecran se déclenchent sur leurs cas', () => {
  const dir = miniProjet({ scenes: [{ id: 'a', html: ecranFilm(), duree: 6, textes: {} }] });
  const regles = () => assembler({ dossier: dir, ecrire: false }).erreurs.map((e) => e.regle);
  assert.ok(regles().includes('film-introuvable'));
  ecrireFilm(dir, { choisie: false });
  assert.ok(regles().includes('prise-non-choisie'));
  // Le crochet de la scène (contrôle dès qu'elle est écrite) voit la même chose.
  const { deroule } = lireDeroule(dir);
  assert.ok(controlerScene({ projet: dir, deroule, scene: deroule.scenes[0], html: fs.readFileSync(path.join(dir, deroule.scenes[0].fichier), 'utf8') }).some((p) => p.regle === 'prise-non-choisie'));
  F.choisirPrise(dir, 'essai', 'prise-01');
  assert.ok(!regles().some((r) => r === 'prise-non-choisie' || r === 'film-introuvable'));
  // Plus de 25 Mo d'images : alerte.
  const lourd = path.join(dir, 'films', 'essai', 'prise-01', 'images', '0001.png');
  fs.writeFileSync(lourd, Buffer.concat([fs.readFileSync(lourd), crypto.randomBytes(26 * 1024 * 1024)]));
  assert.ok(regles().includes('film-trop-lourd'));
  // Une cible x%,y% hors de l'image.
  fs.writeFileSync(path.join(dir, deroule.scenes[0].fichier), `<section data-scene="a">${ecranFilm('', '<i class="pm-zoom" data-cible="120%,40%" data-start="1"></i>')}</section>`);
  assert.ok(regles().includes('pointeur-hors-ecran'));
  // Alerte du tournage reprise.
  const fj = path.join(dir, 'films', 'essai', 'prise-01', 'film.json');
  const film = JSON.parse(fs.readFileSync(fj, 'utf8'));
  film.etapes[0].alertes = ['la page ne s\'est pas calmée à l\'étape 1'];
  fs.writeFileSync(fj, JSON.stringify(film));
  assert.ok(regles().includes('page-pas-calme'));
});

test('cadre : presentation prend les couleurs « bords » du film', () => {
  const css = lire('moteur', 'ecran.css');
  assert.match(css, /\[data-cadre="presentation"\][^}]*linear-gradient\(135deg, var\(--pm-ecran-bords-1, var\(--c-fond, #fff\)\), var\(--pm-ecran-bords-2, var\(--c-accent, #888\)\)\)/);
  const dir = miniProjet({ scenes: [{ id: 'a', html: ecranFilm(' data-cadre="presentation"'), duree: 6, textes: {} }] });
  ecrireFilm(dir);
  assert.match(assembler({ dossier: dir, ecrire: false }).html, /data-cadre="presentation"[^>]*--pm-ecran-bords-1: #102030; --pm-ecran-bords-2: #a0b0c0;/);
});

test('blocs : liste redessine les options relevées au tournage et met en valeur l\'option choisie', () => {
  const dir = miniProjet({ scenes: [{ id: 'a', html: ecranFilm('', '<div class="pm-bloc pm-bloc-liste" data-film-etape="1" data-choix="2.5" data-start="2"><p class="pm-bloc-champ"><span></span></p><ul class="pm-bloc-options"></ul></div>'), duree: 6, textes: {} }] });
  const film = filmSynthetique();
  film.etapes[0].faire = 'choisir';
  film.etapes[0].options = { libelles: ['Carte bancaire', 'Virement', 'Chèque'], choisie: 1, etiquette: 'Mode de paiement' };
  ecrireFilm(dir, { film });
  const a = assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  assert.match(a.html, /<ul class="pm-bloc-options"><li>Carte bancaire<\/li><li class="pm-bloc-choisie" data-start="2.5">Virement<\/li><li>Chèque<\/li><\/ul>/);
  assert.match(a.html, /<p class="pm-bloc-champ"><span>Virement<\/span><\/p>/);
});

// --- 5.15 Historique, état -------------------------------------------------------------------------------------------

test('historique : films/*/prise-* n\'est pas copié, parcours.json l\'est', () => {
  const dir = miniProjet({ scenes: [{ id: 'a', html: '<p data-texte="t"></p>', textes: { t: 'x' } }] });
  ecrireFilm(dir);
  const { numero } = H.sauvegarder(dir, { phrase: 'essai' });
  const m = JSON.parse(fs.readFileSync(path.join(dir, '.historique', `${numero}.json`), 'utf8'));
  const cles = Object.keys(m.fichiers);
  assert.ok(cles.includes('films/essai/parcours.json'), cles.join(' '));
  assert.ok(!cles.some((c) => c.includes('prise-01')), 'aucune image de prise');
  // Annuler ne touche pas aux prises.
  fs.writeFileSync(path.join(dir, 'films', 'essai', 'parcours.json'), '{"nom":"essai","depart":"appli-essai","etapes":[]}');
  H.annuler(dir);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'films', 'essai', 'parcours.json'), 'utf8')).prise, 'prise-01');
  assert.ok(fs.existsSync(path.join(dir, 'films', 'essai', 'prise-01', 'images', '0001.png')));
});

test('etat : étape « tournage » quand une scène vise un film sans prise choisie', () => {
  const dir = miniProjet({ scenes: [{ id: 'a', html: ecranFilm(), textes: {} }] });
  ecrireFilm(dir, { choisie: false });
  const f = path.join(dir, 'deroule.json');
  const x = JSON.parse(fs.readFileSync(f, 'utf8'));
  x.scenes[0].film = { nom: 'essai' };
  fs.writeFileSync(f, JSON.stringify(x));
  const e = etatProjet(dir);
  assert.equal(e.etape, 'tournage');
  assert.deepEqual(e.tournage, [{ nom: 'essai', prises: ['prise-01'], choisie: null }]);
  assert.match(e.prochaine, /Un tournage est en cours : relire pulse-motion filmer prises, montrer la planche et faire choisir une prise, ou refilmer/);
  // Avant le déroulé : un parcours sans prise suffit.
  const vide = dossierTemporaire('pm-etat-');
  ecrireFilm(vide, { choisie: false });
  assert.equal(etatProjet(vide).etape, 'tournage');
  F.choisirPrise(dir, 'essai', 'prise-01');
  assert.notEqual(etatProjet(dir).etape, 'tournage');
});

// --- 5.16 Compétence et consignes --------------------------------------------------------------------------------------

const FILMER = lire('skills', 'filmer', 'SKILL.md');
const description = () => /description: "([^"]+)"/.exec(FILMER)[1];

test('skills : la description de filmer fait au plus 250 caractères et ne contient aucun jargon', () => {
  const d = description();
  assert.ok(d.length <= 250, `${d.length} caractères`);
  assert.doesNotMatch(d, /\b(JSON|HTML|CDP|CSS|parcours\.json|film\.json|localhost|screencast|Chrome)\b/i);
  assert.match(FILMER, /^allowed-tools: Bash\(pulse-motion \*\) Read Write Edit AskUserQuestion$/m);
});

test('skills : filmer ne montre aucune commande ni aucun nom de fichier à la personne', () => {
  // Ce qui se dit à la personne est entre guillemets français : ni commande, ni fichier, ni format.
  for (const [, phrase] of FILMER.matchAll(/«([^»]*)»/g)) {
    assert.doesNotMatch(phrase, /pulse-motion|\.json|\.webp|\.html|films\/|prise-\d/, phrase);
  }
  assert.match(FILMER, /ne jamais montrer de commande, ni de nom de fichier ou de format/);
});

test('skills : creer propose « Que montre-t-on ? » pour un sujet de tutoriel, sans dépasser 4 questions par ronde', () => {
  const creer = lire('skills', 'creer', 'SKILL.md');
  assert.match(creer, /Tutoriel de logiciel : `pulse-motion consignes filmer creer`\./);
  const r = sectionsConsignes(FILMER, ['creer']);
  assert.equal(r.ok, true);
  assert.match(r.texte, /la question 2 de la première ronde devient \*\*Que montre-t-on \?\*\* : « L'application : je donne son adresse et les étapes \(Recommandé\) » · « Une vidéo de mon écran » · « Des captures d'écran » · « Un logiciel installé »/);
  // La question remplace la deuxième (Public) : la première ronde garde 4 questions.
  const ronde = creer.slice(creer.indexOf('**Première ronde**'), creer.indexOf('**Faites pour moi**'));
  assert.equal((ronde.match(/^\d\. \*\*/gm) || []).length, 4);
  assert.match(r.texte, /\*\*avant\*\* d'écrire le déroulé/);
});

test('skills : retoucher cite chaque phrase du tableau de 5.16 (par la section « retouches » de filmer)', () => {
  assert.match(lire('skills', 'retoucher', 'SKILL.md'), /\| Écran filmé \|[^\n]*`pulse-motion consignes filmer retouches`/);
  const r = sectionsConsignes(FILMER, ['retouches']);
  assert.equal(r.ok, true);
  for (const p of ['Le pointeur va trop vite', 'Clique quand je dis enregistrez', 'Zoome sur le bouton', 'Suis les clics', 'Mets un projecteur sur le total', 'Floute les noms',
    'Accélère la saisie', 'Mets-le dans un téléphone', 'Reprends la première prise', 'Refilme', 'On ne voit pas le chargement']) assert.ok(r.texte.includes(`« ${p} »`), p);
  assert.match(lire('skills', 'reprendre', 'SKILL.md'), /\| `tournage` \| aucune \| Suivre `pulse-motion consignes filmer prises` \|/);
  assert.match(lire('agents', 'animateur.md'), /`cadres-pointeur`, `ecran`, `mixage-fin`/);
});

test('references : ecran.md décrit le film (data-film, data-etapes, pm-etape, etape:N)', () => {
  const ref = lire('references', 'ecran.md');
  for (const x of ['data-film', 'data-etapes', 'pm-etape', 'etape:N', 'data-film-etape']) assert.ok(ref.includes(x), x);
  assert.match(ref, /## Un film/);
});

test('notices : argo pour le tournage (cdp-screencast, record, probeEdgeColors), dans les deux THIRD-PARTY-NOTICES.md', () => {
  const plugin = lire('THIRD-PARTY-NOTICES.md');
  assert.equal(fs.readFileSync(path.join(RACINE, '..', '..', 'THIRD-PARTY-NOTICES.md'), 'utf8'), plugin);
  for (const x of ['src/cdp-screencast.ts', 'src/record.ts', 'probeEdgeColors', 'scripts/lib/tournage.js']) assert.ok(plugin.includes(x), x);
});
