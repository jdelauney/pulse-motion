'use strict';
/* Spec Retouches et ergonomie (S4) 5.8 et 5.7 : remarques épinglées (stockage, routes, ré-ancrage, attente, image d'après,
 * état, page livrée, consignes) et table « remarque floue → réglages » (references/remarques.md). Les essais dans Chrome
 * (mode remarque, élément sous le clic, repères) sont dans remarques-page.test.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const R = require('../scripts/lib/remarques.js');
const { lireArguments } = require('../scripts/remarques.js');
const { demarrerApercu, injecterApercu } = require('../scripts/apercu.js');
const { assembler } = require('../scripts/assembler.js');
const { etatProjet } = require('../scripts/etat.js');
const { messageRappel } = require('../scripts/rappel.js');
const { minutageVideo } = require('../scripts/lib/voix.js');
const { lireDeroule, TRANSITIONS } = require('../scripts/lib/deroule.js');
const H = require('../scripts/historique.js');
const { jargon } = require('./aide/jargon.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const dataJpeg = (octets = JPEG) => `data:image/jpeg;base64,${octets.toString('base64')}`;
const stocke = (dir) => JSON.parse(fs.readFileSync(R.fichierRemarques(dir), 'utf8'));

function requete(url, { methode = 'GET', type = 'application/json', origine = true, corps, entetes = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const donnees = corps === undefined ? null : Buffer.from(typeof corps === 'string' ? corps : JSON.stringify(corps));
    const req = http.request(u, { method: methode, headers: { ...(donnees ? { 'Content-Type': type, 'Content-Length': donnees.length } : {}), ...(origine && methode !== 'GET' ? { Origin: u.origin } : {}), ...entetes } }, (res) => {
      const morceaux = [];
      res.on('data', (m) => morceaux.push(m));
      res.on('end', () => {
        const brut = Buffer.concat(morceaux);
        let json = null;
        try { json = JSON.parse(brut.toString('utf8')); } catch { /* pas du JSON */ }
        resolve({ statut: res.statusCode, type: res.headers['content-type'], brut, json });
      });
    });
    req.on('error', reject);
    if (donnees) req.write(donnees);
    req.end();
  });
}

// --- 5.8 : stockage et routes ---------------------------------------------------------------------------------------

test('remarques : créer, modifier, retirer, envoyer (routes)', async () => {
  const dir = copierProjet('projet-simple');
  const apercu = await demarrerApercu({ dossier: dir, port: 47851, dossierStyles: STYLES });
  const u = (p) => `${apercu.url}${p.replace(/^\//, '')}`;
  try {
    const cree = await requete(u('/_pm/remarques'), { methode: 'POST', corps: { portee: 'epingle', t: 1, x: 0.5, y: 0.4, element: 'titre', texte: ' le titre arrive trop tôt ', image: dataJpeg() } });
    assert.equal(cree.statut, 201, JSON.stringify(cree.json));
    const r = cree.json;
    assert.equal(r.id, 'r-0001');
    assert.deepEqual([r.scene, r.tScene, r.t, r.x, r.y, r.element, r.texte, r.etat, r.image], ['intro', 1, 1, 0.5, 0.4, 'titre', 'le titre arrive trop tôt', 'ouverte', 'r-0001.jpg']);
    assert.ok(fs.readFileSync(path.join(R.dossierRemarques(dir), 'r-0001.jpg')).equals(JPEG));
    // Sur cette image, sans épingle ; sur toute la vidéo.
    const image = (await requete(u('/_pm/remarques'), { methode: 'POST', corps: { portee: 'image', t: 4.5, texte: 'trop chargé' } })).json;
    assert.deepEqual([image.scene, image.x, image.element], ['chiffre', null, null]);
    const video = (await requete(u('/_pm/remarques'), { methode: 'POST', corps: { portee: 'video', texte: 'plus chaleureux' } })).json;
    assert.deepEqual([video.t, video.scene], [null, null]);
    // Liste, image servie, texte modifié.
    const liste = await requete(u('/_pm/remarques'));
    assert.equal(liste.statut, 200);
    assert.deepEqual(liste.json.remarques.map((x) => x.id), ['r-0001', 'r-0002', 'r-0003']);
    const img = await requete(u('/_pm/remarques/r-0001.jpg'));
    assert.equal(img.statut, 200);
    assert.match(img.type, /image\/jpeg/);
    assert.ok(img.brut.equals(JPEG));
    assert.equal((await requete(u('/_pm/remarques/r-0009.jpg'))).statut, 404);
    const modifiee = await requete(u('/_pm/remarques/r-0001'), { methode: 'POST', corps: { texte: 'le chiffre arrive trop tôt' } });
    assert.equal(modifiee.json.texte, 'le chiffre arrive trop tôt');
    // Envoyer à Claude : les ouvertes sont marquées envoyées, l'envoi est noté.
    const envoi = await requete(u('/_pm/remarques/envoyer'), { methode: 'POST', corps: {} });
    assert.equal(envoi.json.ouvertes, 3);
    assert.equal(stocke(dir).envois.length, 1);
    assert.ok(stocke(dir).remarques.every((x) => x.envoyee));
    // Retrait par la personne : la remarque et son image partent.
    const retrait = await requete(u('/_pm/remarques/r-0001'), { methode: 'POST', corps: { retirer: true } });
    assert.deepEqual(retrait.json, { id: 'r-0001', retiree: true });
    assert.equal(fs.existsSync(path.join(R.dossierRemarques(dir), 'r-0001.jpg')), false);
    assert.deepEqual(stocke(dir).remarques.map((x) => x.id), ['r-0002', 'r-0003']);
    assert.equal((await requete(u('/_pm/remarques/r-0042'), { methode: 'POST', corps: { texte: 'x' } })).statut, 404);
    // Garde commune : pas d'origine, ou un type qu'un autre site peut envoyer, ou une lecture depuis un autre site.
    assert.equal((await requete(u('/_pm/remarques'), { methode: 'POST', origine: false, corps: { texte: 'x', portee: 'video' } })).statut, 403);
    assert.equal((await requete(u('/_pm/remarques'), { methode: 'POST', type: 'text/plain', corps: { texte: 'x', portee: 'video' } })).statut, 415);
    assert.equal((await requete(u('/_pm/remarques'), { entetes: { 'Sec-Fetch-Site': 'cross-site' } })).statut, 403);
    assert.equal(stocke(dir).remarques.length, 2, 'rien d\'écrit par les envois refusés');
  } finally { await apercu.fermer(); }
});

test('remarques : image JPEG vérifiée et bornée, texte borné', async () => {
  const dir = copierProjet('projet-simple');
  const refus = (entree, motif) => assert.throws(() => R.creer(dir, { portee: 'video', texte: 'ok', ...entree }), motif);
  refus({ image: `data:image/png;base64,${JPEG.toString('base64')}` }, /une image JPEG est attendue/);
  refus({ image: dataJpeg(Buffer.from('GIF89a et pas un JPEG')) }, /ce n'est pas une image JPEG/);
  refus({ image: dataJpeg(Buffer.concat([JPEG, Buffer.alloc(R.IMAGE_MAX)])) }, /3 Mo au plus/);
  refus({ texte: '   ' }, /Écrivez la remarque/);
  refus({ texte: 'x'.repeat(R.TEXTE_MAX + 1) }, /2000 caractères au plus/);
  assert.equal(R.creer(dir, { portee: 'video', texte: 'x'.repeat(R.TEXTE_MAX) }).texte.length, R.TEXTE_MAX);
  assert.throws(() => R.creer(dir, { portee: 'epingle', t: 1, x: 1.4, y: 0.2, texte: 'hors de l\'image' }), /Endroit de la remarque illisible/);
  // Un élément au nom douteux n'est pas gardé.
  assert.equal(R.creer(dir, { portee: 'epingle', t: 1, x: 0.1, y: 0.2, element: '"><script>', texte: 'ok' }).element, null);
  // Par la route : un envoi plus gros que la limite est refusé (413), sans rien écrire.
  const apercu = await demarrerApercu({ dossier: dir, port: 47852, dossierStyles: STYLES });
  try {
    const avant = stocke(dir).remarques.length;
    const gros = await requete(`${apercu.url}_pm/remarques`, { methode: 'POST', corps: { portee: 'video', texte: 'gros', image: dataJpeg(Buffer.concat([JPEG, Buffer.alloc(4 * 1024 * 1024)])) } });
    assert.equal(gros.statut, 413);
    const illisible = await requete(`${apercu.url}_pm/remarques`, { methode: 'POST', corps: '{ pas du json' });
    assert.equal(illisible.statut, 400);
    assert.equal(stocke(dir).remarques.length, avant);
  } finally { await apercu.fermer(); }
});

test('remarques : ré-ancrage après un changement de durée', () => {
  const dir = copierProjet('projet-simple');
  const { deroule } = lireDeroule(dir);
  const debut = (d) => minutageVideo(dir, d).scenes.find((s) => s.id === 'chiffre').debut;
  const t0 = debut(deroule) + 1;
  const r = R.creer(dir, { portee: 'epingle', t: t0, x: 0.5, y: 0.5, texte: 'le chiffre arrive trop tôt' });
  assert.equal(r.scene, 'chiffre');
  assert.equal(r.tScene, 1);
  modifierDeroule(dir, (d) => { d.scenes[0].duree = 6; });
  const nouveau = lireDeroule(dir).deroule;
  const apres = R.liste(dir).remarques[0];
  assert.equal(apres.t, R.instantImage(debut(nouveau) + 1, 30), 'même instant dans sa scène');
  assert.ok(Math.abs(apres.t - t0 - 2) < 0.05, `${apres.t} : décalé de 2 s`);
  assert.equal(stocke(dir).remarques[0].t, apres.t, 'écrit');
  // Borné à la scène : une scène raccourcie ramène l'instant dans la scène.
  modifierDeroule(dir, (d) => { d.scenes[1].duree = 0.5; d.scenes[1].rythme = 1; });
  const borne = R.liste(dir).remarques[0];
  const s = minutageVideo(dir, lireDeroule(dir).deroule).scenes.find((x) => x.id === 'chiffre');
  assert.ok(borne.t >= s.debut && borne.t < s.fin, `${borne.t} dans [${s.debut}, ${s.fin}[`);
  // Scène supprimée : « scene-disparue », à discuter ; elle revient : la remarque redevient ouverte.
  const complet = fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8');
  modifierDeroule(dir, (d) => { d.scenes = d.scenes.filter((x) => x.id !== 'chiffre'); });
  assert.equal(R.liste(dir).remarques[0].etat, 'scene-disparue');
  assert.equal(R.compte(dir).ouvertes, 1, 'toujours à traiter');
  fs.writeFileSync(path.join(dir, 'deroule.json'), complet);
  assert.equal(R.liste(dir).remarques[0].etat, 'ouverte');
});

test('remarques attendre : rend la main au prochain envoi avec les remarques ouvertes', async () => {
  const dir = copierProjet('projet-simple');
  R.creer(dir, { portee: 'video', texte: 'déjà envoyée' });
  R.envoyer(dir);
  const attente = R.attendre(dir, { intervalle: 30 });
  let fini = false;
  attente.then(() => { fini = true; });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(fini, false, 'un envoi d\'avant ne compte pas');
  R.creer(dir, { portee: 'epingle', t: 1, x: 0.2, y: 0.3, texte: 'le titre arrive trop tôt' });
  R.envoyer(dir);
  const r = await attente;
  assert.equal(r.envoi, true);
  assert.deepEqual(r.ouvertes.map((x) => x.texte), ['déjà envoyée', 'le titre arrive trop tôt']);
  // Sans envoi : rend la main à la fin du délai, sans erreur.
  const vide = await R.attendre(dir, { delai: 80, intervalle: 20 });
  assert.equal(vide.envoi, false);
  assert.match(vide.message, /Aucune remarque envoyée/);
  assert.equal(R.ATTENTE_MAX, 2 * 3600 * 1000);
  // Ligne de commande.
  assert.deepEqual(lireArguments(['attendre', '.', '--delai', '5']), { action: 'attendre', dossier: '.', delai: 5 });
  assert.deepEqual(lireArguments(['faite', 'r-0002', 'Le chiffre arrive après le titre.', 'video']), { action: 'faite', id: 'r-0002', texte: 'Le chiffre arrive après le titre.', dossier: 'video', delai: null });
  assert.deepEqual(lireArguments([]), { action: 'liste', dossier: '.', delai: null });
});

test('remarques faite : refusée sans image après', () => {
  const dir = copierProjet('projet-simple');
  const r = R.creer(dir, { portee: 'epingle', t: 1, x: 0.5, y: 0.4, texte: 'le titre arrive trop tôt', image: dataJpeg() });
  assert.throws(() => R.faite(dir, r.id, 'Le titre arrive maintenant à 1 s.'), (e) => e.statut === 409 && /pas d'image d'après[^]*--instants 1/.test(e.message));
  // Une capture de l'instant prise avant la retouche ne compte pas.
  H.sauvegarder(dir, { phrase: 'le titre arrive trop tôt' });
  const planche = path.join(dir, 'sortie', 'planche');
  fs.mkdirSync(planche, { recursive: true });
  const capture = path.join(planche, R.nomInstant(1));
  fs.writeFileSync(capture, Buffer.from('png d\'avant'));
  const passe = new Date(Date.now() - 60000);
  fs.utimesSync(capture, passe, passe);
  modifierDeroule(dir, (d) => { d.scenes[0].textes.titre = 'Pourquoi 4 °C ?'; });
  assert.throws(() => R.faite(dir, r.id, 'fait'), /pas d'image d'après/);
  // Une capture d'un autre instant non plus.
  fs.writeFileSync(path.join(planche, R.nomInstant(3)), 'autre instant');
  assert.throws(() => R.faite(dir, r.id, 'fait'), /pas d'image d'après/);
  assert.throws(() => R.faite(dir, r.id, '  '), /en une phrase/);
  // La capture de l'instant, prise après la retouche : faite, avec l'image d'après.
  fs.writeFileSync(capture, Buffer.from('png d\'après'));
  const faite = R.faite(dir, r.id, 'Le titre arrive maintenant à 1 s.');
  assert.deepEqual([faite.etat, faite.reponse, faite.imageApres, faite.faiteDans], ['faite', 'Le titre arrive maintenant à 1 s.', 'r-0001-apres.png', '001']);
  assert.equal(fs.readFileSync(path.join(R.dossierRemarques(dir), 'r-0001-apres.png'), 'utf8'), 'png d\'après');
  assert.equal(faite.fichierImageApres, 'sortie/remarques/r-0001-apres.png');
  // Une remarque de goût : à discuter, avec la question.
  const gout = R.creer(dir, { portee: 'video', texte: 'je ne sais pas, c\'est bizarre' });
  const d = R.discuter(dir, gout.id, 'Qu\'est-ce qui vous gêne : les couleurs ou le rythme ?');
  assert.deepEqual([d.etat, d.question], ['a-discuter', 'Qu\'est-ce qui vous gêne : les couleurs ou le rythme ?']);
  assert.deepEqual(R.liste(dir).aDiscuter.map((x) => x.id), [gout.id]);
});

test('etat : nombre de remarques ouvertes', () => {
  const dir = copierProjet('projet-simple');
  assert.deepEqual(etatProjet(dir).remarques, { ouvertes: 0, envoyees: 0 });
  assert.doesNotMatch(messageRappel(dir), /remarque/);
  const a = R.creer(dir, { portee: 'video', texte: 'un' });
  R.creer(dir, { portee: 'video', texte: 'deux' });
  assert.deepEqual(etatProjet(dir).remarques, { ouvertes: 2, envoyees: 0 });
  R.envoyer(dir);
  assert.deepEqual(etatProjet(dir).remarques, { ouvertes: 2, envoyees: 2 });
  R.discuter(dir, a.id, 'Laquelle ?');
  assert.deepEqual(etatProjet(dir).remarques, { ouvertes: 1, envoyees: 1 });
  // Le rappel de démarrage les cite.
  assert.match(messageRappel(dir), /Une remarque laissée sur l'image dans l'aperçu attend d'être traitée/);
});

test('assembler : la page livrée ne contient rien des remarques', () => {
  const dir = copierProjet('projet-simple');
  R.creer(dir, { portee: 'epingle', t: 1, x: 0.5, y: 0.4, texte: 'remarque très visible', image: dataJpeg() });
  const a = assembler({ dossier: dir, dossierStyles: STYLES });
  assert.equal(a.ok, true);
  const livree = fs.readFileSync(a.fichier, 'utf8');
  for (const motif of [/_pm\/apercu/, /_pm\/remarques/, /remarques\.mjs/, /pm-remarques/, /pm-epingle/, /remarquesApercu/, /remarque très visible/, /Envoyer à Claude/]) {
    assert.doesNotMatch(livree, motif, String(motif));
  }
  // L'aperçu, lui, charge les modules.
  assert.match(injecterApercu(a.html, []), /<script type="module" src="\/_pm\/apercu\/remarques\.mjs"><\/script>/);
  // Le réassemblage de l'aperçu ignore sortie/ (les remarques n'y déclenchent rien).
  assert.match(lire('scripts', 'apercu.js'), /const IGNORES = \/\^\(sortie\|/);
});

test('plugin : retoucher lit l\'image de chaque remarque et ne la marque faite qu\'après une capture regardée', () => {
  const r = lire('skills', 'retoucher', 'SKILL.md');
  const ligne = r.split('\n').find((l) => l.startsWith('| Remarques de l\'aperçu |'));
  assert.ok(ligne, 'ligne « Remarques de l\'aperçu »');
  assert.match(ligne, /« j'ai laissé des remarques »/);
  assert.match(ligne, /`remarques\.ouvertes` > 0/);
  assert.match(ligne, /lire chaque remarque \*\*et son image\*\* \(`Read`\), recopier sa phrase, une sauvegarde par remarque/);
  assert.match(ligne, /`pulse-motion remarques faite <id> "<réponse>"` seulement après avoir regardé `pulse-motion planche \. --instants <t>`/);
  assert.match(r, /`pulse-motion remarques attendre \.` en arrière-plan/);
  assert.match(r, /laissez vos remarques sur l'image, puis cliquez sur « Envoyer à Claude »/);
  assert.match(lire('skills', 'creer', 'SKILL.md'), /Lancer `pulse-motion remarques attendre \.` en arrière-plan[^\n]*« Remarques de l'aperçu »/);
  const boucle = lire('references', 'remarques.md').split('## Remarques épinglées')[1];
  for (const motif of [/lire \*\*son texte et son image\*\* \(`Read` sur `fichierImage`\)/, /recopier sa phrase/, /une sauvegarde d'historique par remarque/i,
    /`pulse-motion planche \. --instants <t>`[^\n]*regarder l'image avec `Read`/, /Seulement alors : `pulse-motion remarques faite <id>/, /`pulse-motion remarques discuter <id>/]) {
    assert.match(boucle, motif);
  }
});

// --- 5.7 : remarque floue → réglages ---------------------------------------------------------------------------------

/** Lignes du tableau « La personne dit → options » : [{ dit, options: [{ reglages, ecran }] }]. */
function lignesRemarques() {
  const t = lire('references', 'remarques.md');
  const section = t.slice(t.indexOf('## La personne dit → options'), t.indexOf('\n## Règles'));
  return section.split('\n').filter((l) => l.startsWith('| « ')).map((l) => {
    const c = l.replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
    return { dit: c[0], veut: c[1], options: c[2].split('<br>').map((o) => { const [reglages, ecran] = o.split(' → '); return { brut: o, reglages, ecran }; }), vaAvec: c[3] };
  });
}

test('remarques : au moins 14 lignes et 2 options par ligne', () => {
  const lignes = lignesRemarques();
  assert.ok(lignes.length >= 14, `${lignes.length} lignes`);
  for (const l of lignes) {
    assert.ok(l.options.length >= 2 && l.options.length <= 4, `${l.dit} : ${l.options.length} options`);
    for (const o of l.options) assert.ok(o.reglages && o.ecran, `${l.dit} : « ${o.brut} » sans « → à l'écran »`);
    assert.ok(l.veut && l.vaAvec, `${l.dit} : colonnes « ce que ça veut dire » et « va avec »`);
  }
  // Les 14 impressions de la spec (5.7, point 2).
  for (const dit of ['ça fait cheap', 'trop rapide', 'trop lent', 'plus premium', 'plus calme', 'plus vivant', 'ça fait diaporama', 'trop chargé', 'comme notre marque', 'ça manque de punch', 'trop enfantin', 'trop froid', 'fade', 'on ne lit pas']) {
    assert.ok(lignes.some((l) => l.dit.includes(`« ${dit}`)), dit);
  }
});

test('remarques : chaque numéro cité existe dans le dictionnaire', () => {
  const numeros = new Set(JSON.parse(lire('references', 'mouvements', 'mouvements.json')).mouvements.map((m) => `#${m.no}`));
  const cites = [...lire('references', 'remarques.md').matchAll(/#\d{3}\b/g)].map((m) => m[0]);
  assert.ok(cites.length >= 15, `${cites.length} numéros cités`);
  for (const n of cites) assert.ok(numeros.has(n), `${n} absent du dictionnaire`);
});

test('remarques : chaque champ, valeur, ambiance et style cité existe dans le code', () => {
  const { AMBIANCES } = require('../moteur/synthe/catalogue.js');
  const { HUMEURS } = require('../moteur/synthe/ambiances.js');
  const styles = fs.readdirSync(path.join(RACINE, 'styles'));
  const shaders = fs.readdirSync(path.join(RACINE, 'shaders')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  const { TONS } = require('../scripts/lib/deroule.js');
  // Champs du déroulé que le tableau cite, vérifiés par le validateur (lib/deroule.js) ; commandes du plugin.
  // allure et --pm-ampleur-scene : spec S7, 5.14 (plan J4).
  const CHAMPS = ['rythme', 'duree', 'ton', 'intensite', 'tempo', 'scenes[].musique', 'data-start', 'mot:', 'allure', '--pm-ampleur-scene'];
  const COMMANDES = ['comparer', 'charte depuis-logo', 'charte depuis-site'];
  const connus = new Set([...CHAMPS, ...COMMANDES, ...Object.keys(AMBIANCES), ...HUMEURS, ...styles, ...shaders, ...TONS, ...TRANSITIONS]);
  const code = lire('scripts', 'lib', 'deroule.js');
  for (const champ of ['rythme', 'duree', 'intensite', 'tempo', '"ton"|\\.ton\\b|TONS']) assert.match(code, new RegExp(champ), champ);
  for (const l of lignesRemarques()) {
    for (const o of l.options) {
      for (const m of o.reglages.matchAll(/`([^`]+)`/g)) assert.ok(connus.has(m[1]), `${l.dit} : « ${m[1]} » inconnu du code`);
    }
  }
  // Les styles, ambiances et transitions de la spec sont bien cités.
  const t = lire('references', 'remarques.md');
  for (const nom of ['editorial', 'minimal', 'tech-sombre', 'energique', 'chaleureux', 'corporate', 'calme', 'entrainant', 'inspirant', 'coupe', 'poussee', 'whip', 'fondu', 'degrade-vivant', 'silence']) {
    assert.match(t, new RegExp(`\`${nom}\``), nom);
  }
  // Le mécanisme renvoie à la doctrine de S2, sans la répéter.
  assert.match(t, /`pulse-motion reference realisation`, § 11/);
});

test('plugin : sans jargon dans les options rédigées pour la personne', () => {
  for (const l of lignesRemarques()) {
    assert.equal(jargon(l.dit), null, l.dit);
    for (const o of l.options) {
      assert.equal(jargon(o.ecran), null, `${l.dit} : « ${o.ecran} »`);
      assert.doesNotMatch(o.ecran, /`|#\d{3}|\b(cqh|duree|data-|var\()/, `${l.dit} : « ${o.ecran} »`);
    }
  }
});

test('plugin : retoucher et style citent pulse-motion reference remarques et la règle « jamais en silence »', () => {
  const r = lire('skills', 'retoucher', 'SKILL.md');
  const ligne = r.split('\n').find((l) => l.startsWith('| Remarque floue |'));
  assert.match(ligne, /« ça fait cheap », « plus premium »/);
  assert.match(ligne, /`pulse-motion reference remarques` : ses options par `AskUserQuestion`, la première « \(Recommandé\) » ; jamais appliquée en silence ; 5 changements au plus par tour ; la scène demandée si la phrase ne la dit pas/);
  const s = lire('skills', 'style', 'SKILL.md');
  assert.match(s, /Remarque floue \(« ça fait cheap », « plus premium »\) : `pulse-motion reference remarques`, ses options proposées, jamais appliquées en silence\./);
  const ref = lire('references', 'remarques.md');
  assert.match(ref, /\*\*Jamais appliqué en silence\*\* : les options passent par `AskUserQuestion`, la première « \(Recommandé\) »/);
  assert.match(ref, /\*\*5 changements au plus par tour\*\*/);
});
