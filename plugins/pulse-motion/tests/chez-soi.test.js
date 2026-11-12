'use strict';
/* Spec Retouches et ergonomie, plans R5 (5.18 page qui sait faire son MP4, 5.19 nouveautés, 5.20 signaler un problème) et R4
 * (5.13 mémoire des goûts, 5.14 charte depuis le site, sans navigateur ; 5.21 tableau de bord des vidéos). Les tests qui
 * ouvrent Chrome sont dans page-mp4.test.js et charte-site.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { jargon } = require('./aide/jargon.js');

const RACINE = path.join(__dirname, '..');
const DEPOT = path.join(RACINE, '..', '..');
const PM = path.join(RACINE, 'scripts', 'pm.js');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const { assembler } = require('../scripts/assembler.js');
const { lireDeroule } = require('../scripts/lib/deroule.js');

function personnel() {
  const d = dossierTemporaire('pm-perso-');
  process.env.PULSE_MOTION_DOSSIER = d;
  return d;
}

// ——— 5.18 Page qui sait faire son MP4 ———

function pageAvec(boutonMp4) {
  const dir = copierProjet('projet-simple');
  if (boutonMp4 !== undefined) modifierDeroule(dir, (d) => { d.page = { boutonMp4 }; });
  return { dir, a: assembler({ dossier: dir, dossierStyles: STYLES }) };
}

test('assembler : par défaut, aucun bloc d\'export ni rien de Mediabunny dans la page livrée', () => {
  const { a } = pageAvec();
  assert.ok(a.ok, JSON.stringify(a.erreurs));
  assert.doesNotMatch(a.html, /pm-module-export|pm-export-reglages|mediabunny/i);
  assert.equal(fs.readFileSync(a.fichier, 'utf8'), a.html);
});

test('assembler : page.boutonMp4 true ajoute le bloc d\'export, 260 Ko au plus, avis de licence inclus', () => {
  const { a } = pageAvec(true);
  assert.ok(a.ok, JSON.stringify(a.erreurs));
  const debut = a.html.indexOf('<!-- Pulse Motion : page qui sait faire son MP4');
  const fin = a.html.indexOf('</body>');
  assert.ok(debut > 0 && fin > debut);
  const bloc = a.html.slice(debut, fin);
  assert.ok(Buffer.byteLength(bloc, 'utf8') <= 260 * 1024, `${Buffer.byteLength(bloc, 'utf8')} o`);
  assert.match(bloc, /Mozilla Public License 2\.0/);
  assert.match(bloc, /https:\/\/mozilla\.org\/MPL\/2\.0\//);
  // La charge utile : Mediabunny sans modification, et les modules d'export de l'aperçu.
  const b64 = /<script type="application\/octet-stream" id="pm-module-export">([^<]+)<\/script>/.exec(bloc)[1];
  const modules = JSON.parse(zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'));
  assert.equal(modules['/_pm/vendor/mediabunny.min.mjs'], lire('vendor', 'mediabunny', 'mediabunny.min.mjs'));
  for (const m of ['/_pm/export.mjs', '/_pm/capture.js', '/_pm/export-page.mjs']) assert.ok(modules[m], m);
  const reglages = JSON.parse(/id="pm-export-reglages">([^<]+)</.exec(bloc)[1]);
  assert.equal(reglages.usage, 'web');
  assert.match(reglages.nomFichier, /\.mp4$/);
});

test('assembler : page.boutonMp4 false retire le bloc', () => {
  const { dir, a } = pageAvec(true);
  assert.match(a.html, /pm-module-export/);
  modifierDeroule(dir, (d) => { d.page.boutonMp4 = false; });
  const b = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.doesNotMatch(b.html, /pm-module-export|mediabunny/i);
});

test('deroule : page.boutonMp4 doit valoir true ou false, et page n\'a pas d\'autre champ', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.page = { boutonMp4: 'oui', autre: 1 }; });
  const { erreurs } = lireDeroule(dir);
  assert.ok(erreurs.some((e) => /page\.boutonMp4/.test(e)), erreurs.join(' '));
  assert.ok(erreurs.some((e) => /champ « autre » inconnu/.test(e)), erreurs.join(' '));
});

test('page : --bouton-mp4 oui puis non, avec une sauvegarde d\'historique à chaque changement', () => {
  personnel();
  const dir = copierProjet('projet-simple');
  const { reglerPage } = require('../scripts/page.js');
  const H = require('../scripts/historique.js');
  const oui = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'page.js'), dir, '--bouton-mp4', 'peut-etre'], { encoding: 'utf8' });
  assert.equal(oui.status, 2);
  const deroule = () => JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
  const r = reglerPage({ dossier: dir, boutonMp4: true, dossierStyles: STYLES });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(deroule().page.boutonMp4, true);
  assert.match(fs.readFileSync(path.join(dir, r.fichier), 'utf8'), /pm-module-export/);
  const non = reglerPage({ dossier: dir, boutonMp4: false, dossierStyles: STYLES });
  assert.equal(deroule().page.boutonMp4, false);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, non.fichier), 'utf8'), /pm-module-export/);
  const phrases = JSON.stringify(H.liste(dir));
  assert.match(phrases, /une page qui sait faire son MP4/);
  assert.match(phrases, /une page plus légère, sans le bouton MP4/);
});

test('plugin : exporter propose la page qui sait faire son MP4 en fin d\'export, « Non merci » recommandé', () => {
  const e = lire('skills', 'exporter', 'SKILL.md');
  assert.match(e, /`pulse-motion reference chez-soi`, section « Page qui sait faire son MP4 » \(« Non merci » recommandé/);
  const ref = lire('references', 'chez-soi.md');
  const section = ref.slice(ref.indexOf('## Page qui sait faire son MP4'));
  assert.match(section, /« Oui, aussi cette page » · « Non merci \(Recommandé\) »/);
  assert.match(section, /environ 250 Ko de plus/);
  assert.match(section, /`pulse-motion page \. --bouton-mp4 oui`/);
  assert.match(section, /ouvrez la page dans Chrome ou Edge et cliquez sur « MP4 »/);
  assert.match(lire('skills', 'creer', 'SKILL.md'), /Proposer la page qui sait faire son MP4 \(`chez-soi`\), sauf Faites pour moi/);
  assert.match(lire('vendor', 'mediabunny', 'PROVENANCE.md'), /sauf dans la page facultative qui sait faire son MP4, demandée par la personne, qui porte l'avis MPL-2\.0/);
  for (const f of [path.join(DEPOT, 'THIRD-PARTY-NOTICES.md'), path.join(RACINE, 'THIRD-PARTY-NOTICES.md')]) assert.match(fs.readFileSync(f, 'utf8'), /page facultative « qui sait faire son MP4 »/);
});

// ——— 5.19 Nouveautés ———

const ENTREES = JSON.parse(lire('nouveautes.json'));
const VERSION = JSON.parse(lire('.claude-plugin', 'plugin.json')).version;
const comparer = (a, b) => { const x = a.split('.').map(Number); const y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

test('nouveautes : chaque version de plugin.json a son entrée', () => {
  assert.ok(ENTREES.some((e) => e.version === VERSION), `${VERSION} sans entrée dans nouveautes.json`);
  const changelog = fs.readFileSync(path.join(DEPOT, 'CHANGELOG.md'), 'utf8');
  for (const e of ENTREES) {
    assert.match(e.version, /^\d+\.\d+\.\d+$/);
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Array.isArray(e.points) && e.points.length <= 5, `${e.version} : 5 points au plus`);
    assert.ok(changelog.includes(`## ${e.version} – `), `${e.version} absente du CHANGELOG`);
  }
  for (let i = 1; i < ENTREES.length; i++) assert.ok(comparer(ENTREES[i - 1].version, ENTREES[i].version) > 0, 'la plus récente d\'abord, sans doublon');
});

test('nouveautes : résumés sans jargon', () => {
  for (const e of ENTREES) {
    for (const t of [e.resume, ...e.points]) {
      assert.ok(typeof t === 'string' && t.trim(), e.version);
      assert.equal(jargon(t), null, `${e.version} : « ${t} »`);
      assert.doesNotMatch(t, /`|pulse-motion |#\d{3}|\b[A-Za-z]:[\\/]|\/[a-z]+\/|\.(js|json|md|html|css)\b/, `${e.version} : « ${t} »`);
    }
  }
});

test('changelog : versions dans l\'ordre, sans doublon', () => {
  const t = fs.readFileSync(path.join(DEPOT, 'CHANGELOG.md'), 'utf8');
  const versions = [...t.matchAll(/^## (\d+\.\d+\.\d+) – \d{4}-\d{2}-\d{2}$/gm)].map((m) => m[1]);
  assert.ok(versions.length >= 10, `${versions.length} versions`);
  assert.equal(versions[0], VERSION, 'la version de plugin.json en tête');
  for (let i = 1; i < versions.length; i++) assert.ok(comparer(versions[i - 1], versions[i]) > 0, `${versions[i - 1]} puis ${versions[i]}`);
  assert.doesNotMatch(t, /\b[A-Za-z]:\\|\/e\/tmp|e:\/tmp|\/Users\/|\/home\//i, 'aucun chemin de l\'ordinateur');
  // La page du wiki suit nouveautes.json, et le pied de page y mène.
  const page = fs.readFileSync(path.join(DEPOT, 'docs', 'nouveautes.html'), 'utf8');
  for (const e of ENTREES) assert.ok(page.includes(`Version ${e.version} `), e.version);
  assert.match(fs.readFileSync(path.join(DEPOT, 'docs', 'js', 'gabarit.js'), 'utf8'), /href: racine \+ "nouveautes\.html"/);
});

test('rappel : nouveautés annoncées une seule fois, pas à la première installation', () => {
  const { annoncerNouveautes } = require('../scripts/rappel.js');
  const dossier = dossierTemporaire('pm-vue-');
  const entrees = [{ version: '9.1.0', resume: 'Une nouveauté dite simplement.', points: [] }];
  assert.equal(annoncerNouveautes({ dossier, version: '9.0.0', entrees }), '', 'première installation : rien');
  assert.equal(fs.readFileSync(path.join(dossier, 'version-vue'), 'utf8').trim(), '9.0.0');
  const m = annoncerNouveautes({ dossier, version: '9.1.0', entrees });
  assert.match(m, /vient d'être mis à jour \(9\.1\.0\) : Une nouveauté dite simplement\. Le dire en une phrase au début de votre première réponse, une seule fois\./);
  assert.equal(annoncerNouveautes({ dossier, version: '9.1.0', entrees }), '', 'une seule fois');
  assert.equal(annoncerNouveautes({ dossier: null, version: '9.2.0', entrees }), '', 'sans dossier écrivable : rien');
});

// ——— 5.20 Signaler un problème ———

test('pm : une erreur ajoutée au journal, sans les arguments', () => {
  const dossier = dossierTemporaire('pm-journal-');
  const env = { ...process.env, PULSE_MOTION_DOSSIER: dossier };
  const r = spawnSync(process.execPath, [PM, 'charte', 'appliquer', 'charte-secrete-xyz', '.'], { encoding: 'utf8', env, cwd: dossier });
  assert.notEqual(r.status, 0);
  const lignes = fs.readFileSync(path.join(dossier, 'erreurs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lignes.length, 1);
  assert.equal(lignes[0].commande, 'charte');
  assert.match(lignes[0].empreinte, /^[0-9a-f]{8}$/);
  assert.ok(lignes[0].message.length > 0 && lignes[0].message.length <= 400);
  assert.doesNotMatch(JSON.stringify(lignes[0]), /charte-secrete-xyz|appliquer/);
  // 20 lignes au plus.
  const E = require('../scripts/lib/erreurs.js');
  for (let i = 0; i < 25; i++) E.noterErreur({ commande: 'exporter', code: 1, message: `échec ${i}`, dossier });
  assert.equal(E.lireErreurs({ dossier }).length, 20);
  // Une commande lancée sans erreur n'écrit rien.
  const vide = dossierTemporaire('pm-journal-');
  spawnSync(process.execPath, [PM, 'bloc'], { encoding: 'utf8', env: { ...process.env, PULSE_MOTION_DOSSIER: vide } });
  assert.equal(fs.existsSync(path.join(vide, 'erreurs.jsonl')), false);
});

test('rapport : chemins anonymisés, aucun texte de la vidéo', () => {
  const dossier = personnel();
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.titre = 'Titre Confidentiel Zorglub'; d.scenes[0].textes.titre = 'Texte confidentiel Bzzt'; });
  const maison = os.homedir();
  const { rapport } = require('../scripts/rapport.js');
  const erreurs = [{ date: '2026-11-12T10:00:00.000Z', commande: 'exporter', code: 1, message: `Fichier ${path.join(dir, 'sortie', 'x.mp4')} et ${path.join(maison, 'Bureau', 'logo.png')} illisibles.`, empreinte: 'abcd1234' }];
  const r = rapport({ dossier: dir, outils: null, erreurs, personnel: dossier });
  assert.equal(r.ok, true);
  for (const t of [r.corps, r.titre, decodeURIComponent(r.url)]) {
    assert.doesNotMatch(t, /Zorglub|Bzzt/);
    assert.ok(!t.includes(dir) && !t.includes(dir.replace(/\\/g, '/')), 'dossier du projet anonymisé');
    assert.ok(!t.includes(maison), 'dossier personnel anonymisé');
  }
  assert.match(r.corps, /<dossier>/);
  assert.match(r.corps, /~[\\/]Bureau/);
  assert.match(r.corps, /Pulse Motion : \d+\.\d+\.\d+/);
  assert.match(r.corps, /Étape de la vidéo : /);
  assert.equal(r.fichier, 'sortie/rapport-probleme.md');
  const fichier = fs.readFileSync(path.join(dir, 'sortie', 'rapport-probleme.md'), 'utf8');
  assert.doesNotMatch(fichier, /Zorglub|Bzzt/);
  assert.match(r.url, /^https:\/\/github\.com\/jdelauney\/pulse-motion\/issues\/new\?title=/);
});

test('rapport : adresse de 7 000 caractères au plus', () => {
  const { rapport, MAX_ADRESSE } = require('../scripts/rapport.js');
  assert.equal(MAX_ADRESSE, 7000);
  const longues = Array.from({ length: 20 }, (_, i) => ({ date: '2026-11-12T10:00:00.000Z', commande: 'controler', code: 1, message: `« é » ${'x'.repeat(390)} ${i}`, empreinte: '00000000' }));
  const r = rapport({ dossier: dossierTemporaire('pm-vide-'), outils: null, erreurs: longues, personnel: null });
  assert.ok(r.url.length <= 7000, `${r.url.length} caractères`);
  assert.equal(r.fichier, null, 'sans vidéo ni dossier personnel écrivable : aucun fichier');
});

test('plugin : outils demande l\'accord avant d\'ouvrir la page', () => {
  const o = lire('skills', 'outils', 'SKILL.md');
  assert.match(o, /signale un problème/);
  assert.match(o, /`pulse-motion reference chez-soi`, section « Signaler un problème »/);
  const ref = lire('references', 'chez-soi.md');
  const s = ref.slice(ref.indexOf('## Signaler un problème'), ref.indexOf('## Page qui sait faire son MP4'));
  const accord = s.indexOf('« Ouvrir la page de signalement (Recommandé) » · « Seulement le fichier, je l\'enverrai moi-même »');
  const ouvrir = s.indexOf('`pulse-motion rapport . --ouvrir`');
  assert.ok(accord > 0 && ouvrir > accord, 'accord demandé avant l\'ouverture');
  assert.match(s, /Rien n'est jamais envoyé par Pulse Motion/);
  assert.match(lire('scripts', 'rapport.js'), /PM_SANS_OUVRIR/);
});

// ——— 5.13 Mémoire des goûts ———

test('preferences : noter, lister par portée, retirer', () => {
  const dossier = dossierTemporaire('pm-gouts-');
  const P = require('../scripts/preferences.js');
  const a = P.noterPreference({ citation: 'jamais de rebond', regle: 'pas d\'entrée rebondie (#001, #007)', domaine: 'mouvement', dossier });
  const b = P.noterPreference({ citation: 'pour mes formations, toujours le logo à la fin', regle: 'logo dans la conclusion', domaine: 'structure', genre: 'formation', dossier });
  const c = P.noterPreference({ citation: 'en style éditorial, accent discret', regle: 'accent sur un mot par scène', domaine: 'couleur', style: 'editorial', dossier });
  assert.ok(a.ok && b.ok && c.ok);
  assert.deepEqual([a, b, c].map((x) => x.preference.id), ['p-001', 'p-002', 'p-003']);
  const ids = (r) => r.preferences.map((p) => p.id);
  assert.deepEqual(ids(P.listerPreferences({ genre: 'formation', style: 'chaleureux', dossier })), ['p-001', 'p-002']);
  assert.deepEqual(ids(P.listerPreferences({ genre: 'produit', style: 'editorial', dossier })), ['p-001', 'p-003']);
  assert.deepEqual(ids(P.listerPreferences({ dossier })), ['p-001', 'p-002', 'p-003']);
  assert.equal(P.retirerPreference({ id: 'p-002', dossier }).ok, true);
  assert.deepEqual(ids(P.listerPreferences({ dossier })), ['p-001', 'p-003']);
  assert.equal(P.retirerPreference({ id: 'p-999', dossier }).ok, false);
  assert.equal(P.noterPreference({ citation: 'x', regle: 'y', domaine: 'inconnu', dossier }).ok, false);
  // Par la commande.
  const env = { ...process.env, PULSE_MOTION_DOSSIER: dossier };
  const l = spawnSync(process.execPath, [PM, 'preferences', 'liste', '--style', 'editorial'], { encoding: 'utf8', env });
  assert.equal(l.status, 0);
  assert.deepEqual(ids(JSON.parse(l.stdout)), ['p-001', 'p-003']);
});

test('preferences : citation gardée telle quelle et datée', () => {
  const dossier = dossierTemporaire('pm-gouts-');
  const P = require('../scripts/preferences.js');
  const citation = '  Jamais de « rebond », JAMAIS !  ';
  const r = P.noterPreference({ citation, regle: 'sans rebond', domaine: 'mouvement', video: 'La chaîne du froid', dossier, date: new Date('2026-11-12T09:00:00Z') });
  assert.equal(r.preference.citation, citation);
  assert.equal(r.preference.date, '2026-11-12');
  assert.equal(r.preference.video, 'La chaîne du froid');
  const brut = JSON.parse(fs.readFileSync(path.join(dossier, 'preferences.json'), 'utf8'));
  assert.equal(brut.version, 1);
  assert.equal(brut.preferences[0].citation, citation);
});

test('preferences : la 31e refusée avec un message en français', () => {
  const dossier = dossierTemporaire('pm-gouts-');
  const P = require('../scripts/preferences.js');
  for (let i = 0; i < P.MAX; i++) assert.ok(P.noterPreference({ citation: `goût ${i}`, regle: `règle ${i}`, dossier }).ok);
  const r = P.noterPreference({ citation: 'un de trop', regle: 'règle', dossier });
  assert.equal(r.ok, false);
  assert.match(r.message, /déjà 30 préférences retenues, le maximum : retirez-en une/);
  assert.equal(P.listerPreferences({ dossier }).preferences.length, 30);
});

test('plugin : creer, retoucher, style et animateur citent pulse-motion preferences et l\'ordre de priorité', () => {
  const textes = { creer: lire('skills', 'creer', 'SKILL.md'), retoucher: lire('skills', 'retoucher', 'SKILL.md'), style: lire('skills', 'style', 'SKILL.md'), animateur: lire('agents', 'animateur.md') };
  for (const [nom, t] of Object.entries(textes)) {
    const ligne = t.split('\n').find((l) => l.includes('pulse-motion preferences'));
    assert.ok(ligne, `${nom} : pulse-motion preferences`);
    assert.match(ligne, /demande du moment/, `${nom} : la demande du moment d'abord`);
    assert.match(ligne, /style/, `${nom} : puis le style`);
    assert.ok(ligne.indexOf('demande du moment') < ligne.lastIndexOf('style'), `${nom} : ordre`);
  }
  const ref = lire('references', 'chez-soi.md');
  assert.match(ref, /\*\*Ordre de priorité\*\* : la demande du moment, puis les préférences, puis le style, puis les valeurs par défaut/);
  assert.match(ref, /« Je le retiens pour vos prochaines vidéos \? » : « Le retenir \(Recommandé\) » · « Seulement cette vidéo »/);
  // Reliquat de R3 : une remarque qui vaut pour toutes les vidéos se propose à la mémoire des goûts.
  const remarques = lire('references', 'remarques.md');
  assert.match(remarques, /proposer de la retenir \(`pulse-motion reference chez-soi`, section « Mémoire des goûts »\)/);
  assert.doesNotMatch(remarques, /## À venir/);
});

// ——— 5.14 Charte depuis le site (sans navigateur) ———

test('charte depuis-site : adresse non http refusée', async () => {
  const { verifierAdresse, analyserSite } = require('../scripts/lib/charte-site.js');
  for (const a of ['ftp://exemple.fr', 'file:///C:/secret.html', 'javascript:alert(1)', 'exemple.fr', '']) {
    const r = await analyserSite({ adresse: a, navigateur: 'jamais-lance' });
    assert.equal(r.ok, false, a);
    assert.match(r.message, /Adresse (refusée|illisible)/, a);
  }
  assert.ok(verifierAdresse('https://exemple.fr/').href);
});

function siteFactice(mesures, logo = null) {
  return async () => ({ ok: true, adresse: 'https://exemple.fr/', mesures, logo, messageLogo: logo ? null : 'Aucun logo trouvé sur le site : les couleurs sont gardées, demandez le fichier du logo à la personne.' });
}

test('charte depuis-site : rien d\'écrit dans charte.json avant l\'accord', async () => {
  personnel();
  const dir = copierProjet('projet-simple');
  const charte = path.join(dir, 'charte', 'charte.json');
  const avant = fs.existsSync(charte) ? fs.readFileSync(charte, 'utf8') : null;
  const { depuisSite, appliquerSite } = require('../scripts/charte.js');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#0055aa"/></svg>', 'utf8');
  const r = await depuisSite({ adresse: 'https://exemple.fr/', style: 'clair-pedagogique', dossier: dir, analyser: siteFactice({ fond: '#ffffff', texte: '#222222', titre: '#003366', accent: '#e4572e', polices: { titres: 'Montserrat', texte: 'Inter' } }, { extension: 'svg', donnees: svg }) });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(fs.existsSync(charte) ? fs.readFileSync(charte, 'utf8') : null, avant, 'charte.json intact');
  assert.equal(fs.existsSync(path.join(dir, 'charte', 'logo.svg')), false, 'logo pas encore dans charte/');
  assert.ok(fs.existsSync(path.join(dir, r.proposition)), 'proposition rangée à part');
  assert.deepEqual(r.polices, { titres: 'Montserrat', texte: 'Inter' });
  assert.equal(r.ton, 'clair');
  // Après l'accord : logo, couleurs et source dans charte/.
  const a = appliquerSite({ dossier: dir });
  assert.equal(a.ok, true, JSON.stringify(a));
  const c = JSON.parse(fs.readFileSync(charte, 'utf8'));
  assert.equal(c.logo, 'logo.svg');
  assert.equal(c.source.adresse, 'https://exemple.fr/');
  assert.ok(fs.existsSync(path.join(dir, 'charte', 'logo.svg')));
  assert.equal(c.couleurs.accent, r.couleurs.accent);
  assert.equal(lireDeroule(dir).erreurs.length, 0);
});

test('charte depuis-site : accent rendu lisible sur le fond du style', async () => {
  const dir = copierProjet('projet-simple');
  const { depuisSite } = require('../scripts/charte.js');
  const { contraste } = require('../scripts/lib/couleurs.js');
  const SEUILS = require('../scripts/seuils.json');
  const r = await depuisSite({ adresse: 'https://exemple.fr/', style: 'clair-pedagogique', dossier: dir, analyser: siteFactice({ fond: '#ffffff', texte: '#111111', titre: '#ffd400', accent: '#ffee00', polices: {} }) });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(contraste(r.couleurs.accent, r.fond) >= SEUILS.contrasteTexte, `${r.couleurs.accent} sur ${r.fond}`);
  assert.ok(contraste(r.couleurs.primaire, r.fond) >= SEUILS.contrasteTitres, `${r.couleurs.primaire} sur ${r.fond}`);
  assert.ok(r.ajustements.length >= 1, 'ajustement dit');
  assert.ok(r.messages.some((m) => /Aucun logo trouvé/.test(m)));
});

test('charte depuis-site : logo SVG du site réduit à ses formes simples, sinon refusé', () => {
  const { logoSur } = require('../scripts/lib/charte-site.js');
  const sur = logoSur('<svg class="logo" viewBox="0 0 20 10" aria-label="Logo"><title>ACME</title><path class="a" d="M0 0h20v10z" fill="#123456"/></svg>');
  assert.equal(sur, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><path d="M0 0h20v10z" fill="#123456"/></svg>');
  assert.equal(logoSur('<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>'), null);
  assert.equal(logoSur('<svg viewBox="0 0 1 1"><image href="https://x/y.png"/></svg>'), null);
});

// ——— 5.21 Tableau de bord des vidéos ———

test('videos : registre alimenté au début d\'une création et à l\'assemblage', () => {
  const dossier = personnel();
  process.env.PM_VIDEOS_TEMP = '1';
  try {
    const dir = copierProjet('projet-simple');
    const { choisirParcours } = require('../scripts/etat.js');
    const { lireRegistre } = require('../scripts/lib/videos.js');
    choisirParcours(dir, 'rapide');
    let reg = lireRegistre(dossier);
    assert.equal(reg.length, 1);
    assert.equal(path.resolve(reg[0].dossier), path.resolve(dir));
    assert.ok(reg[0].creee);
    const a = assembler({ dossier: dir, dossierStyles: STYLES });
    assert.ok(a.ok);
    reg = lireRegistre(dossier);
    assert.equal(reg.length, 1, 'même vidéo, une seule entrée');
    assert.equal(reg[0].titre, JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8')).titre);
  } finally { delete process.env.PM_VIDEOS_TEMP; }
  // Un dossier temporaire (exemple ouvert pour voir) n'entre pas au registre.
  const autre = personnel();
  assembler({ dossier: copierProjet('projet-simple'), dossierStyles: STYLES });
  assert.equal(require('../scripts/lib/videos.js').lireRegistre(autre).length, 0);
});

test('videos : dossier disparu marqué introuvable, gardé', () => {
  const dossier = personnel();
  const disparu = path.join(dossierTemporaire('pm-parti-'), 'video');
  fs.writeFileSync(path.join(dossier, 'videos.json'), JSON.stringify([{ dossier: disparu, titre: 'Partie', creee: '2026-11-01T00:00:00.000Z', vue: '2026-11-01T00:00:00.000Z' }]), 'utf8');
  const { listerVideos, lireRegistre } = require('../scripts/lib/videos.js');
  const r = listerVideos({ personnel: dossier });
  assert.equal(r.videos.length, 1);
  assert.equal(r.videos[0].introuvable, true);
  assert.equal(r.videos[0].titre, 'Partie');
  assert.equal(lireRegistre(dossier).length, 1, 'gardé');
});

test('videos : poids et date du MP4', () => {
  const dossier = personnel();
  const dir = copierProjet('projet-simple');
  const titre = JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8')).titre;
  const { slug } = require('../scripts/assembler.js');
  fs.mkdirSync(path.join(dir, 'sortie'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sortie', `${slug(titre)}.mp4`), Buffer.alloc(12345));
  fs.writeFileSync(path.join(dossier, 'videos.json'), JSON.stringify([{ dossier: dir, titre, creee: '2026-11-01T00:00:00.000Z', vue: '2026-11-02T00:00:00.000Z' }]), 'utf8');
  const env = { ...process.env, PULSE_MOTION_DOSSIER: dossier };
  const s = spawnSync(process.execPath, [PM, 'videos'], { encoding: 'utf8', env });
  assert.equal(s.status, 0, s.stderr);
  const v = JSON.parse(s.stdout).videos[0];
  assert.equal(v.introuvable, false);
  assert.equal(v.mp4.fichier, `sortie/${slug(titre)}.mp4`);
  assert.equal(v.mp4.octets, 12345);
  assert.match(v.mp4.date, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(v.format, '16:9');
  assert.ok(v.etape && v.modifiee);
});

test('plugin : reprendre couvre « quelles sont mes vidéos ? »', () => {
  const r = lire('skills', 'reprendre', 'SKILL.md');
  assert.match(r, /« quelles sont mes vidéos \? »/);
  assert.match(r, /`pulse-motion reference chez-soi`, section « Mes vidéos »/);
  const ref = lire('references', 'chez-soi.md');
  const s = ref.slice(ref.indexOf('## Mes vidéos'), ref.indexOf('## Signaler un problème'));
  assert.match(s, /`pulse-motion videos`/);
  assert.match(s, /jamais retirée sans accord/);
  assert.match(s, /il faut ouvrir Claude Code dans son dossier/);
});
