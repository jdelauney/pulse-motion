'use strict';
/* Spec Retouches et ergonomie (S4), plan R2 « Première vidéo plus tôt » : ébauche animée dès l'accord sur le déroulé (5.3),
 * menu d'entrée, ronde du son en deux questions, parcours « Faites pour moi » et journal des choix (5.4). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const E = require('../scripts/lib/ebauche.js');
const { copierExemple, apercuExemple, dossierApercu } = require('../scripts/modeles.js');
const { etatProjet, donnerAccord, choisirParcours } = require('../scripts/etat.js');
const { controler } = require('../scripts/controler.js');
const { assembler } = require('../scripts/assembler.js');
const { exporterFidele } = require('../scripts/export-fidele.js');
const { demarrerApercu } = require('../scripts/apercu.js');
const { validerDeroule } = require('../scripts/lib/deroule.js');
const { textesEnDur } = require('../scripts/lib/extraire.js');
const { estTechnique } = require('../scripts/lib/messages.js');
const { lireDecisions, noterDecision, resumer, fichierDecisions } = require('../scripts/decisions.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');
const PM = path.join(RACINE, 'scripts', 'pm.js');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');

/**
 * L'exemple de la chaîne du froid (6 scènes composées, clair-pedagogique) sans ses scènes, sauf la dernière ; l'ouverture
 * devient une scène toute faite « titre » et le seuil une scène « chiffre » (nombre dit en lettres : « quatre degrés »).
 */
function projetEbauche({ garder = ['06-fin.html'] } = {}) {
  const dir = dossierTemporaire('pm-ebauche-');
  assert.equal(copierExemple('formation-courte', dir).ok, true);
  for (const f of fs.readdirSync(path.join(dir, 'scenes'))) if (!garder.includes(f)) fs.rmSync(path.join(dir, 'scenes', f));
  const fichier = path.join(dir, 'deroule.json');
  const d = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  d.scenes[0].type = 'titre';
  d.scenes[1].type = 'chiffre';
  fs.writeFileSync(fichier, JSON.stringify(d, null, 2));
  return dir;
}
const lireScene = (dir, nom) => fs.readFileSync(path.join(dir, 'scenes', nom), 'utf8');

// --- 5.3 Ébauche ------------------------------------------------------------------------------------------------------

test('ebauche : écrit les scènes absentes depuis les scènes toutes faites, sans écraser', () => {
  const dir = projetEbauche();
  const fin = lireScene(dir, '06-fin.html');
  const r = E.ecrireEbauche({ dossier: dir });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.ecrites, ['intro', 'seuil', 'maillons', 'reflexes', 'recongeler']);
  assert.deepEqual(r.gardees, ['fin']);
  assert.equal(lireScene(dir, '06-fin.html'), fin, 'une scène écrite n\'est jamais écrasée');
  // Scène toute faite du style, adaptée : id, décor sur la durée, marquée data-ebauche.
  const intro = lireScene(dir, '01-intro.html');
  assert.match(intro, /<section data-ebauche data-scene="intro"/);
  assert.match(intro, /class="etiquette[^"]*" data-texte="etiquette"/, 'la scène « titre » de clair-pedagogique');
  assert.match(intro, /data-decor[^>]*data-dur="8"/);
  // Compteur : le nombre dit (« quatre degrés »), jamais la valeur d'exemple du style.
  const seuil = lireScene(dir, '02-seuil.html');
  assert.match(seuil, /nombre 0→4 /);
  assert.doesNotMatch(seuil, /1250/);
  // Sans nombre écrit pour la scène : pas de compteur inventé.
  assert.equal(E.nombreDeScene({ textes: { titre: 'La température' }, intention: 'chiffre – la température' }), null);
  assert.doesNotMatch(E.sansCompteur(lire('styles', 'clair-pedagogique', 'scenes', 'chiffre.html')).split('<section')[1], /nombre|1250/);
  assert.equal(E.nombreDeScene({ textes: { titre: '1 250 bactéries en 3,5 h' } }), '1250');
  // Une seconde fois : rien de neuf, rien d'écrasé.
  const encore = E.ecrireEbauche({ dossier: dir });
  assert.deepEqual(encore.ecrites, []);
  assert.equal(encore.gardees.length, 6);
  assert.deepEqual(E.scenesEbauche(dir, JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'))), ['intro', 'seuil', 'maillons', 'reflexes', 'recongeler']);
});

test('ebauche : scène composée en carte neutre avec ses textes', () => {
  const dir = projetEbauche();
  E.ecrireEbauche({ dossier: dir });
  const html = lireScene(dir, '03-maillons.html');
  assert.match(html, /<section data-scene="maillons" data-ebauche class="pm-ebauche">/);
  const cles = [...html.matchAll(/data-texte="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(cles, ['titre', 'point1', 'point2', 'point3', 'point4'], 'toutes ses clés, le titre d\'abord');
  assert.match(html, /<h2 class="pm-ebauche-titre" data-texte="titre"/);
  assert.deepEqual(textesEnDur(html), [], '« Scène en préparation » vient du style de base, pas de la scène');
  assert.match(html, /data-decor[^>]*data-dur="scene"[^>]*data-tween="--dx/, 'le décor dérive toute la scène, voix comprise');
  assert.match(lire('moteur', 'base.css'), /\.pm-ebauche-note::after \{ content: "Scène en préparation"; \}/);
  // La page s'assemble avec les textes du déroulé et sait quelles scènes sont des ébauches.
  const a = assembler({ dossier: dir, ecrire: false });
  assert.equal(a.ok, true);
  assert.match(a.html, />Les 4 maillons de la chaîne</);
  assert.deepEqual(a.donnees.scenes.filter((s) => s.ebauche).map((s) => s.id), ['intro', 'seuil', 'maillons', 'reflexes', 'recongeler']);
  // Rien de marqué dans une page sans ébauche.
  assert.equal(assembler({ dossier: path.join(RACINE, 'exemples', 'chaine-du-froid'), ecrire: false }).donnees.scenes.some((s) => 'ebauche' in s), false);
});

test('ebauche : commande pulse-motion ebauche, avancement annoncé ; refus sans déroulé', () => {
  const dir = projetEbauche();
  const r = spawnSync(process.execPath, [PM, 'ebauche', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).ecrites.length, 5);
  assert.match(r.stderr, /Ébauche animée des scènes/);
  const av = JSON.parse(fs.readFileSync(path.join(dir, '.pulse-motion', 'avancement.json'), 'utf8'));
  assert.equal(av.travail, 'ebauche');
  assert.equal(av.fini, true);
  const vide = dossierTemporaire('pm-ebauche-vide-');
  const v = spawnSync(process.execPath, [PM, 'ebauche', vide], { encoding: 'utf8' });
  assert.equal(v.status, 1);
  assert.match(JSON.parse(v.stdout).message, /déroulé n'est pas encore écrit/);
  assert.deepEqual(fs.readdirSync(vide), [], 'rien d\'écrit hors d\'une vidéo');
});

test('etat : une scène data-ebauche garde l\'étape fabrication', () => {
  const dir = projetEbauche({ garder: ['01-intro.html', '02-seuil.html', '03-maillons.html', '04-reflexes.html', '05-recongeler.html', '06-fin.html'] });
  // L'exemple est fini (accords donnés) : toutes les scènes écrites, étape « apercu ».
  assert.equal(etatProjet(dir).etape, 'apercu');
  fs.rmSync(path.join(dir, 'scenes', '03-maillons.html'));
  E.ecrireEbauche({ dossier: dir });
  const e = etatProjet(dir);
  assert.equal(e.etape, 'fabrication');
  assert.deepEqual(e.scenesManquantes, ['maillons']);
  assert.deepEqual(e.ebauches, ['maillons']);
  // L'animateur réécrit la scène sans data-ebauche : la vidéo est prête.
  fs.writeFileSync(path.join(dir, 'scenes', '03-maillons.html'), lireScene(dir, '03-maillons.html').replace(' data-ebauche', ''));
  assert.equal(etatProjet(dir).etape, 'apercu');
});

test('controler : ebauche-restante est une erreur', () => {
  const dir = projetEbauche();
  E.ecrireEbauche({ dossier: dir });
  const { problemes } = controler({ dossier: dir, ecrire: false });
  const restantes = problemes.filter((p) => p.regle === 'ebauche-restante');
  assert.deepEqual(restantes.map((p) => p.scene), ['intro', 'seuil', 'maillons', 'reflexes', 'recongeler']);
  for (const p of restantes) {
    assert.equal(p.gravite, 'erreur');
    assert.equal(estTechnique(p.message), false, p.message);
    assert.match(p.consigne, /data-ebauche/);
  }
  // L'ébauche s'assemble sans autre erreur de structure (textes, sections).
  assert.deepEqual(problemes.filter((p) => ['texte-manquant', 'scene-invalide'].includes(p.regle)), []);
  assert.match(lire('references', 'controles.md'), /\| `ebauche-restante` \|[^\n]*\*\*erreur\*\*/);
});

test('exporter : refusé tant qu\'il reste une ébauche (voie fidèle et bouton de l\'aperçu)', async () => {
  const dir = projetEbauche();
  E.ecrireEbauche({ dossier: dir });
  const r = await exporterFidele({ dossier: dir, outil: { present: true, versionOk: true }, navigateur: 'navigateur-factice' });
  assert.equal(r.ok, false);
  assert.match(r.message, /La vidéo n'est pas encore finie : les scènes « intro », « seuil », « maillons », « reflexes », « recongeler » ne sont encore que des ébauches/);
  assert.equal(estTechnique(r.message), false);
  assert.equal(fs.existsSync(path.join(dir, 'sortie', 'export.json')), false, 'rien de capturé');
  // Bouton MP4 de l'aperçu : les réglages de l'export sont refusés.
  const apercu = await demarrerApercu({ dossier: dir, port: 47391 });
  try {
    const reponse = await new Promise((resoudre, rejeter) => {
      http.get(`${apercu.url}_pm/usage?pour=web`, (res) => {
        let corps = '';
        res.on('data', (d) => { corps += d; });
        res.on('end', () => resoudre({ statut: res.statusCode, json: JSON.parse(corps) }));
      }).on('error', rejeter);
    });
    assert.equal(reponse.statut, 400);
    assert.match(reponse.json.erreur, /n'est encore qu'une ébauche|ne sont encore que des ébauches/);
  } finally { await apercu.fermer(); }
});

// --- 5.3, point 5 : exemple d'un modèle -------------------------------------------------------------------------------

test('modeles apercu : page autonome de l\'exemple dans un dossier temporaire', () => {
  const ouverts = [];
  const r = apercuExemple('pitch', { ouvrirFichier: (f) => ouverts.push(f) });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.dossier, dossierApercu('pitch'));
  assert.ok(r.dossier.startsWith(os.tmpdir()), 'dans le dossier temporaire du système');
  assert.ok(fs.existsSync(r.fichier) && r.fichier.startsWith(path.join(r.dossier, 'sortie')) && r.fichier.endsWith('.html'));
  assert.deepEqual(ouverts, [r.fichier], 'la page autonome est ouverte');
  // Rien n'est écrit dans le dossier courant de la personne (commande sans dossier), même lancée deux fois.
  const courant = dossierTemporaire('pm-modeles-apercu-');
  for (let k = 0; k < 2; k++) {
    const c = spawnSync(process.execPath, [PM, 'modeles', 'apercu', 'pitch'], { cwd: courant, encoding: 'utf8', env: { ...process.env, PM_SANS_OUVRIR: '1' } });
    assert.equal(c.status, 0, c.stderr);
    assert.equal(JSON.parse(c.stdout).ok, true);
  }
  assert.deepEqual(fs.readdirSync(courant), []);
  const inconnu = apercuExemple('inexistant', { ouvrir: false });
  assert.equal(inconnu.ok, false);
  assert.match(inconnu.message, /Modèle inconnu « inexistant »/);
});

// --- 5.4 Parcours « Faites pour moi » et journal des choix ------------------------------------------------------------

test('etat : parcours autonome accepté et relu', () => {
  const dir = dossierTemporaire('pm-autonome-');
  assert.equal(choisirParcours(dir, 'autonome').parcours, 'autonome');
  assert.equal(etatProjet(dir).parcours, 'autonome');
  assert.throws(() => choisirParcours(dir, 'libre'), /Parcours : rapide, accompagne, autonome/);
  // Aucune question après la première ronde : un déroulé valide mène droit à la fabrication, sans accord.
  const projet = projetEbauche();
  fs.rmSync(path.join(projet, '.pulse-motion'), { recursive: true, force: true });
  const f = path.join(projet, 'deroule.json');
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  d.parcours = 'autonome';
  fs.writeFileSync(f, JSON.stringify(d, null, 2));
  const e = etatProjet(projet);
  assert.equal(e.accords.deroule, false);
  assert.equal(e.etape, 'fabrication');
  d.parcours = 'rapide';
  fs.writeFileSync(f, JSON.stringify(d, null, 2));
  assert.equal(etatProjet(projet).etape, 'deroule-a-valider', 'les autres parcours attendent toujours l\'accord');
});

test('deroule : parcours autonome valide', () => {
  const d = JSON.parse(lire('exemples', 'chaine-du-froid', 'deroule.json'));
  d.parcours = 'autonome';
  assert.deepEqual(validerDeroule(d), []);
  d.parcours = 'libre';
  assert.match(validerDeroule(d).join(' '), /« parcours » doit être l'un de : rapide, accompagne, autonome/);
});

test('decisions : écriture et lecture du journal des choix', () => {
  const dir = dossierTemporaire('pm-decisions-');
  assert.deepEqual(lireDecisions(dir), []);
  noterDecision(dir, { sujet: 'style', choix: 'minimal', raison: 'premier essai', pourChanger: '« passe en style chaleureux »' });
  noterDecision(dir, { sujet: 'musique', choix: 'composée, inspirante', raison: 'genre formation', pourChanger: '« change la musique »' });
  // Un sujet repris remplace l'ancien choix.
  const j = noterDecision(dir, { sujet: 'style', choix: 'chaleureux', raison: 'formation pour des stagiaires', pourChanger: '« passe en style éditorial »' });
  assert.deepEqual(j.map((x) => x.sujet), ['musique', 'style']);
  assert.deepEqual(lireDecisions(dir), j);
  assert.deepEqual(JSON.parse(fs.readFileSync(fichierDecisions(dir), 'utf8')), j);
  assert.equal(resumer(j)[1], 'style : chaleureux (formation pour des stagiaires ; pour changer : « passe en style éditorial »)');
  assert.throws(() => noterDecision(dir, { sujet: 'voix', choix: 'aucune' }), /Choix incomplet : « raison » manque/);
  // Par la commande, comme le fait creer.
  const c = spawnSync(process.execPath, [PM, 'decisions', dir, 'noter', 'voix', 'pas de voix', 'une voix provisoire bloquerait l\'export', '« ajoute ma voix »'], { encoding: 'utf8' });
  assert.equal(c.status, 0, c.stderr);
  const l = spawnSync(process.execPath, [PM, 'decisions', dir], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(l.stdout).map((x) => x.sujet), ['musique', 'style', 'voix']);
});

// --- Consignes de creer, reprendre et de l'animateur --------------------------------------------------------------------

const creer = () => lire('skills', 'creer', 'SKILL.md');
const { sectionsConsignes } = require('../scripts/lib/consignes.js');

test('plugin : creer lance ebauche et l\'aperçu juste après l\'accord sur le déroulé', () => {
  const c = creer();
  const deroule = sectionsConsignes(c, ['deroule']).texte;
  const accord = deroule.indexOf('`pulse-motion etat . --accord deroule`');
  const ebauche = deroule.indexOf('`pulse-motion ebauche .`');
  const ouvrir = deroule.indexOf('`pulse-motion apercu . --ouvrir` en arrière-plan (il assemble la page)', ebauche);
  assert.ok(accord > 0 && ebauche > accord && ouvrir > ebauche, 'accord, ébauche, aperçu en arrière-plan (qui assemble la page : jamais pulse-motion assembler dans creer)');
  const ligne = deroule.split('\n').find((l) => l.includes('`pulse-motion ebauche .`'));
  assert.match(ligne, /^7\. \*\*Ébauche\*\*, aussitôt \(avant la voix\)/);
  assert.match(ligne, /« Voici une première ébauche animée ; je la remplace scène par scène\. »/);
  // Avant la voix : l'étape 3 (voix, puis animateurs) vient après.
  assert.ok(c.indexOf('`pulse-motion ebauche .`') < c.indexOf('## 3. Fabrication'));
  // L'aperçu n'est pas rouvert à l'étape 4 s'il est déjà là.
  assert.match(sectionsConsignes(c, ['apercu']).texte, /L'aperçu est ouvert depuis l'ébauche ; `apercu\.actif` faux/);
  // Reprendre une fabrication interrompue : l'ébauche et l'aperçu d'abord.
  const ligneReprendre = lire('skills', 'reprendre', 'SKILL.md').split('\n').find((l) => l.startsWith('| `fabrication` |'));
  assert.match(ligneReprendre, /`pulse-motion ebauche \.`, puis, aperçu inactif, `pulse-motion apercu \. --ouvrir` en arrière-plan ; écrire les scènes/);
  // L'animateur réécrit l'ébauche en entier.
  assert.match(lire('agents', 'animateur.md'), /`data-ebauche` : point de départ, jamais un résultat ; le réécrire en entier, sans cet attribut/);
  // Un modèle trouvé : son exemple ouvert pendant les questions, avant la première ronde (rien d'écrit ici).
  const avantRonde = c.slice(0, c.indexOf('**Première ronde**'));
  assert.match(avantRonde, /lancer `pulse-motion modeles apercu <id>` en arrière-plan \(dossier temporaire\) : « Je vous ouvre un exemple de ce genre de vidéo\. »/);
});

test('plugin : creer sans sujet pose le menu d\'entrée en une question', () => {
  const c = creer();
  const verifier = sectionsConsignes(c, ['verifier']).texte;
  assert.match(verifier, /demande sans sujet : le menu d'entrée, en une seule question et sans rien écrire \(`pulse-motion reference demandes`, section « Menu d'entrée »\)/);
  assert.match(sectionsConsignes(c, ['questions']).texte, /Le sujet vient de l'argument, sinon du menu d'entrée\./);
  const ref = lire('references', 'demandes.md');
  const menu = ref.slice(ref.indexOf('## Menu d\'entrée'), ref.indexOf('\n## ', ref.indexOf('## Menu d\'entrée') + 5));
  assert.match(menu, /\*\*une seule question\*\*, sans rien écrire dans le dossier : « Que voulez-vous faire \? »/);
  const options = menu.split('\n').filter((l) => l.startsWith('- « ')).map((l) => /^- « ([^»]+) »/.exec(l)[1]);
  assert.deepEqual(options, ['Une vidéo à partir de mon idée (Recommandé)', 'Partir d\'un modèle de vidéo', 'Voir un exemple d\'abord', 'Une vidéo dans un de mes styles']);
  for (const r of [/`pulse-motion modeles liste`/, /`pulse-motion modeles apercu <id>` en arrière-plan/, /`pulse-motion styles` liste un style `personnel`/, /« Créer mon propre style » \(`\/pulse-motion:style`\)/, /La réponse libre reste possible/]) assert.match(menu, r);
  assert.match(ref, /## Que sait faire Pulse Motion \?[\s\S]*Puis le menu d'entrée\./);
});

test('plugin : ronde 2 en deux questions, voix et sous-titres ensemble', () => {
  const c = creer();
  const son = c.slice(c.indexOf('**Le son**'), c.indexOf('## 2.'));
  const questions = son.split('\n').filter((l) => /^\d\. \*\*/.test(l)).map((l) => /^\d\. \*\*([^*]+)\*\*/.exec(l)[1]);
  assert.deepEqual(questions, ['Musique', 'Voix et sous-titres', 'L\'ordinateur']);
  assert.match(son, /3\. \*\*L'ordinateur\*\*, seulement si `pulse-motion outils --plan` liste un outil utile/);
  assert.match(son, /\*\*Voix et sous-titres\*\* : « Ma voix, avec sous-titres \(Recommandé\) » · « Ma voix, sans sous-titres » · « J'ai un fichier de ma voix » · « Pas de voix »/);
  assert.doesNotMatch(c, /\*\*Sous-titres\*\* :/);
  // Le public n'est pas demandé quand le sujet ou le modèle le donne.
  assert.match(c, /2\. \*\*Public\*\*[^\n]*omis si le sujet ou le modèle le donne/);
});

test('plugin : creer en parcours autonome ne pose aucune question après la ronde 1', () => {
  const c = creer();
  assert.match(c, /3\. \*\*Parcours\*\* : Rapide \(Recommandé\)[^\n]*· Faites pour moi – « aucune autre question, je regarde le résultat »/);
  const faites = c.split('\n').find((l) => l.startsWith('**Faites pour moi** : '));
  assert.ok(faites, 'paragraphe « Faites pour moi »');
  for (const r of [/aucune autre question \(sauf le fichier du logo s'il est demandé\)/, /musique composée selon le genre/, /ni voix \(une voix provisoire bloquerait l'export\) ni sous-titres/,
    /style recommandé/, /glossaire noté d'office/, /aucune installation/, /`pulse-motion decisions \. noter "<sujet>" "<choix>" "<raison>" "<pour changer>"`/]) assert.match(faites, r);
  // Il vient avant la ronde du son, qui ne s'ouvre que « sinon ».
  assert.ok(c.indexOf(faites) < c.indexOf('**Le son**'));
  assert.match(c, /Sinon, une deuxième ronde, \*\*Le son\*\*/);
  assert.match(c, /`pulse-motion etat \. --parcours rapide\|accompagne\|autonome`/);
  const deroule = sectionsConsignes(c, ['deroule']).texte;
  assert.match(deroule, /4\. Au moins 2 styles, hors Faites pour moi : `pulse-motion comparer/);
  assert.match(deroule, /\*\*Faites pour moi\*\* : rien à demander/);
  assert.match(deroule, /proposer en une question \(Faites pour moi : d'office\) de les noter au glossaire/);
  // Bloc de fin : « Mes choix », chacun se change en une phrase.
  const fin = c.slice(c.lastIndexOf('\n## '));
  assert.match(fin, /^🧭 \*\*Mes choix\*\* \(Faites pour moi seulement, d'après `pulse-motion decisions \.`\) : chacun se change en une phrase/m);
  assert.ok(fin.indexOf('🧭') > fin.indexOf('🔎') && fin.indexOf('🧭') < fin.indexOf('➡️'));
});
