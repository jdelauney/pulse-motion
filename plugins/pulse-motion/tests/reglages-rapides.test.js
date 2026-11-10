'use strict';
/* Spec Retouches et ergonomie (S4) 5.11 et spec S10 5.9 (plan S10-B) : réglages rapides de l'aperçu (liste fermée,
 * historique, déroulé réécrit, état, panneau, page livrée) et leur référence. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const G = require('../scripts/lib/reglages-rapides.js');
const H = require('../scripts/historique.js');
const { demarrerApercu, injecterApercu } = require('../scripts/apercu.js');
const { assembler } = require('../scripts/assembler.js');
const { controler } = require('../scripts/controler.js');
const { etatProjet } = require('../scripts/etat.js');
const { lireDeroule } = require('../scripts/lib/deroule.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');

const RACINE = path.join(__dirname, '..');
const navigateur = trouverNavigateur();
const lireD = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
const opts = { dossierStyles: STYLES };
const reglage = (dir, cle) => G.reglagesActuels(dir, opts).reglages.find((r) => r.cle === cle);
const avecMusique = (dir) => modifierDeroule(dir, (d) => { d.musique = { generee: 'calme', volume: 0.5 }; });

function poster(url, corps, { origine = true } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const donnees = Buffer.from(JSON.stringify(corps));
    const req = http.request(u, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': donnees.length, ...(origine ? { Origin: u.origin } : {}) } }, (res) => {
      let t = '';
      res.setEncoding('utf8');
      res.on('data', (m) => { t += m; });
      res.on('end', () => { let json = null; try { json = JSON.parse(t); } catch { /* texte */ } resolve({ statut: res.statusCode, json }); });
    });
    req.on('error', reject);
    req.end(donnees);
  });
}

test('reglages : clé ou valeur hors liste refusée', async () => {
  const dir = copierProjet('projet-simple');
  avecMusique(dir);
  const avant = fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8');
  const refus = (entree, statut, motif) => assert.throws(() => G.appliquer(dir, entree, opts), (e) => e.statut === statut && motif.test(e.message));
  refus({ cle: 'police', valeur: 'Inter' }, 400, /Réglage inconnu/);
  refus({ cle: '__proto__', valeur: 'x' }, 400, /Réglage inconnu/);
  refus({ cle: 'allure', valeur: '1.5' }, 400, /hors de la liste/);
  refus({ cle: 'accent', valeur: '#123456' }, 400, /hors de la liste/);
  refus({ cle: 'musique', valeur: 0.9 }, 400, /hors de la liste/);
  refus({ cle: 'ton', valeur: 'sombre' }, 400, /hors de la liste/);
  // Réglage grisé : sous-titres sans voix.
  refus({ cle: 'sousTitres', valeur: 'mot' }, 409, /n'a pas de voix/);
  assert.equal(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'), avant, 'déroulé inchangé');
  assert.deepEqual(H.listerSauvegardes(dir), [], 'aucune sauvegarde');
  // Par la route : refus, et garde commune (pas d'origine).
  const apercu = await demarrerApercu({ dossier: dir, port: 47861, dossierStyles: STYLES });
  try {
    assert.equal((await poster(`${apercu.url}_pm/reglages`, { cle: 'allure', valeur: '2' })).statut, 400);
    assert.equal((await poster(`${apercu.url}_pm/reglages`, { cle: 'allure', valeur: '1.2' }, { origine: false })).statut, 403);
    assert.equal(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'), avant);
  } finally { await apercu.fermer(); }
});

test('reglages : sauvegarde d\'historique avant l\'écriture', () => {
  const dir = copierProjet('projet-simple');
  const avant = fs.readFileSync(path.join(dir, 'deroule.json'));
  const r = G.appliquer(dir, { cle: 'allure', valeur: '1.2' }, opts);
  assert.deepEqual([r.ok, r.cle, r.valeur, r.resume, r.sauvegarde], [true, 'allure', '1.2', 'Allure : plus vif', '001']);
  assert.ok(H.lireSauvegarde(dir, '001', 'deroule.json').equals(avant), 'la sauvegarde porte le déroulé d\'avant');
  assert.equal(H.liste(dir).versions[0].phrase, 'réglage rapide : Allure : plus vif');
  // « annule » le défait comme une retouche.
  H.annuler(dir);
  assert.ok(fs.readFileSync(path.join(dir, 'deroule.json')).equals(avant));
  // Même valeur qu'actuellement : rien n'est écrit, aucune sauvegarde.
  assert.equal(G.appliquer(dir, { cle: 'ton', valeur: 'auto' }, opts).inchange, true);
  assert.deepEqual(H.listerSauvegardes(dir), []);
});

test('reglages : déroulé réécrit de façon atomique et valide', () => {
  const dir = copierProjet('projet-simple');
  avecMusique(dir);
  modifierDeroule(dir, (d) => { d.scenes[0].voix = { texte: 'Pourquoi garder le froid' }; d.sousTitres = { position: 'haut' }; });
  const valide = () => assert.deepEqual(lireDeroule(dir).erreurs, []);
  G.appliquer(dir, { cle: 'allure', valeur: '0.8' }, opts);
  assert.deepEqual(lireD(dir).scenes.map((s) => s.rythme), [0.8, 0.8]);
  G.appliquer(dir, { cle: 'allure', valeur: '1' }, opts);
  assert.deepEqual(lireD(dir).scenes.map((s) => s.rythme), [undefined, undefined], 'normal : rythme retiré');
  const accent = reglage(dir, 'accent');
  const autre = accent.valeurs.find((v) => v.valeur !== accent.actuelle);
  G.appliquer(dir, { cle: 'accent', valeur: autre.valeur }, opts);
  assert.equal(lireD(dir).charte.couleurs.accent, autre.valeur);
  assert.equal(lireD(dir).charte.couleurs.primaire, '#0a6cff', 'le reste de la charte est gardé');
  G.appliquer(dir, { cle: 'musique', valeur: 'forte' }, opts);
  assert.deepEqual(lireD(dir).musique, { generee: 'calme', volume: 0.7 });
  // « Sans » retire la musique, mise de côté : le choix suivant la remet.
  G.appliquer(dir, { cle: 'musique', valeur: 'sans' }, opts);
  assert.equal(lireD(dir).musique, undefined);
  assert.equal(reglage(dir, 'musique').grise, false);
  G.appliquer(dir, { cle: 'musique', valeur: 'basse' }, opts);
  assert.deepEqual(lireD(dir).musique, { generee: 'calme', volume: 0.35 });
  G.appliquer(dir, { cle: 'sousTitres', valeur: 'mot' }, opts);
  assert.deepEqual(lireD(dir).sousTitres, { position: 'haut', mode: 'mot' });
  G.appliquer(dir, { cle: 'sousTitres', valeur: 'non' }, opts);
  assert.equal(lireD(dir).sousTitres, undefined);
  G.appliquer(dir, { cle: 'sousTitres', valeur: 'oui' }, opts);
  assert.deepEqual(lireD(dir).sousTitres, { position: 'haut', mode: 'ligne' }, 'la position d\'avant revient');
  valide();
  // Écriture atomique : aucun fichier temporaire laissé, le déroulé reste lisible d'un bout à l'autre.
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.part')), []);
  assert.match(fs.readFileSync(path.join(RACINE, 'scripts', 'lib', 'reglages-rapides.js'), 'utf8'), /ecrireAtomique\(path\.join\(path\.resolve\(projet\), 'deroule\.json'\)/);
  const memo = JSON.parse(fs.readFileSync(G.fichierReglages(dir), 'utf8'));
  assert.equal(memo.nonControles, true);
  assert.equal(memo.changements.at(-1).resume, 'Sous-titres : oui');
  // Un déroulé déjà en erreur : rien n'est écrit.
  modifierDeroule(dir, (d) => { d.genre = 'inconnu'; });
  assert.throws(() => G.appliquer(dir, { cle: 'allure', valeur: '1.2' }, opts), (e) => e.statut === 409);
});

test('etat : réglages non contrôlés signalés jusqu\'au prochain contrôle', () => {
  const dir = copierProjet('projet-simple');
  assert.equal(etatProjet(dir).reglagesNonControles, false);
  G.appliquer(dir, { cle: 'allure', valeur: '1.2' }, opts);
  G.appliquer(dir, { cle: 'allure', valeur: '0.8' }, opts);
  const e = etatProjet(dir);
  assert.equal(e.reglagesNonControles, true);
  assert.deepEqual(e.reglagesChanges, ['Allure : plus vif', 'Allure : plus posé']);
  controler({ dossier: dir, dossierStyles: STYLES });
  const apres = etatProjet(dir);
  assert.equal(apres.reglagesNonControles, false);
  assert.equal(apres.reglagesChanges, undefined);
  // Consignes : retoucher et exporter disent ce que la personne a changé.
  for (const s of ['retoucher', 'exporter']) {
    assert.match(fs.readFileSync(path.join(RACINE, 'skills', s, 'SKILL.md'), 'utf8'), /`reglagesNonControles`[^\n]*ce que la personne a changé, `reglagesChanges`/, s);
  }
});

test('reglages_rapides_cinq_au_plus_valeurs_discretes : cinq réglages, de deux à cinq valeurs fixes chacun', () => {
  const dir = copierProjet('projet-simple');
  avecMusique(dir);
  const { reglages } = G.reglagesActuels(dir, opts);
  assert.deepEqual(reglages.map((r) => r.cle), ['accent', 'allure', 'ton', 'musique', 'sousTitres']);
  for (const r of reglages) {
    assert.ok(r.valeurs.length >= 2 && r.valeurs.length <= 5, `${r.cle} : ${r.valeurs.length} valeurs`);
    for (const v of r.valeurs) assert.equal(typeof v.valeur, 'string');
    assert.equal(new Set(r.valeurs.map((v) => v.valeur)).size, r.valeurs.length, `${r.cle} : valeurs distinctes`);
  }
  assert.deepEqual(reglages.find((r) => r.cle === 'allure').valeurs.map((v) => [v.valeur, v.libelle]), [['0.8', 'Plus posé'], ['1', 'Normal'], ['1.2', 'Plus vif']]);
  assert.deepEqual(G.VOLUMES, { basse: 0.35, normale: 0.5, forte: 0.7 });
  // La valeur actuelle : rythme d'une seule scène changé → aucune valeur commune.
  modifierDeroule(dir, (d) => { d.scenes[1].rythme = 0.8; d.musique.volume = 0.8; });
  assert.equal(reglage(dir, 'allure').actuelle, null);
  const m = reglage(dir, 'musique');
  assert.equal(m.actuelle, 'actuelle');
  assert.match(m.valeurs.find((v) => v.valeur === 'actuelle').libelle, /Comme maintenant \(80 %\)/);
  // La référence décrit les cinq mêmes réglages.
  const ref = fs.readFileSync(path.join(RACINE, 'references', 'reglages-rapides.md'), 'utf8');
  const tableau = ref.slice(ref.indexOf('## Les cinq réglages'), ref.indexOf('\n## Comportement')).split('\n').filter((l) => /^\| [A-Z]/.test(l) && !l.startsWith('| Réglage'));
  assert.deepEqual(tableau.map((l) => l.split('|')[1].trim()), ['Couleur d\'accent', 'Allure', 'Ton', 'Musique', 'Sous-titres']);
  for (const v of ['0,8', '1,2', '0,35', '0,5', '0,7', 'Mot par mot']) assert.ok(ref.includes(v), v);
  assert.match(fs.readFileSync(path.join(RACINE, 'skills', 'retoucher', 'SKILL.md'), 'utf8'), /\| Réglages rapides \|[^\n]*`pulse-motion reference reglages-rapides`/);
});

test('reglage_rapide_ecrit_deroule_et_historique : par la route de l\'aperçu, déroulé écrit et sauvegarde avant', async () => {
  const dir = copierProjet('projet-simple');
  const apercu = await demarrerApercu({ dossier: dir, port: 47862, dossierStyles: STYLES });
  try {
    const lu = await new Promise((resolve) => http.get(`${apercu.url}_pm/reglages`, (res) => { let t = ''; res.on('data', (m) => { t += m; }); res.on('end', () => resolve(JSON.parse(t))); }));
    assert.equal(lu.reglages.length, 5);
    const r = await poster(`${apercu.url}_pm/reglages`, { cle: 'allure', valeur: '0.8' });
    assert.equal(r.statut, 200);
    assert.equal(r.json.resume, 'Allure : plus posé');
    assert.deepEqual(lireD(dir).scenes.map((s) => s.rythme), [0.8, 0.8]);
    assert.equal(H.liste(dir).versions[0].phrase, 'réglage rapide : Allure : plus posé');
  } finally { await apercu.fermer(); }
});

test('reglage_rapide_absent_page_livree_et_export : ni panneau ni module dans la page livrée ni dans l\'export', () => {
  const dir = copierProjet('projet-simple');
  G.appliquer(dir, { cle: 'allure', valeur: '1.2' }, opts);
  const a = assembler({ dossier: dir, dossierStyles: STYLES });
  const livree = fs.readFileSync(a.fichier, 'utf8');
  for (const motif of [/_pm\/reglages/, /reglages\.mjs/, /pm-reglages/, /reglagesApercu/, /Plus posé/]) assert.doesNotMatch(livree, motif, String(motif));
  // L'export fidèle capture la page assemblée (sans l'aperçu) ; l'export de l'aperçu (?export=1) n'ouvre pas le panneau.
  assert.match(injecterApercu(a.html, []), /\/_pm\/apercu\/reglages\.mjs/);
  const module = fs.readFileSync(path.join(RACINE, 'moteur', 'apercu', 'reglages.mjs'), 'utf8');
  assert.match(module, /!\/\[\?&\]\(export\|planche\|capture\|studio\)=\/\.test\(location\.search\)/);
});

test('lecteur : panneau des réglages montre les valeurs actuelles', { skip: !navigateur && 'Chrome ou Edge introuvable', timeout: 90000 }, async () => {
  const dir = copierProjet('projet-simple');
  avecMusique(dir);
  modifierDeroule(dir, (d) => { for (const s of d.scenes) s.rythme = 0.8; d.musique.volume = 0.7; });
  const apercu = await demarrerApercu({ dossier: dir, port: 47863, dossierStyles: STYLES, delai: 50 });
  const page = await ouvrirPage({ navigateur, largeur: 1280, hauteur: 800 });
  const attendre = async (cond, delai = 30000) => {
    const fin = Date.now() + delai;
    for (;;) {
      try { if (await page.evaluer(`!!(${cond})`)) return; } catch { /* rechargement */ }
      if (Date.now() > fin) throw new Error(`condition non remplie : ${cond}`);
      await new Promise((r) => setTimeout(r, 150));
    }
  };
  const marquees = () => page.evaluer(`Object.fromEntries([...document.querySelectorAll('#pm-reglages fieldset')].map((f) => [f.dataset.reglage, (f.querySelector('button[aria-pressed="true"]') || {}).dataset?.valeur || null]))`);
  try {
    await page.aller(apercu.url);
    await page.evaluer('M.pret.then(() => true)');
    await attendre("document.getElementById('pm-bouton-reglages')");
    await page.evaluer("document.getElementById('pm-bouton-reglages').click(), true");
    await attendre("document.querySelectorAll('#pm-reglages fieldset').length === 5");
    const m = await marquees();
    assert.equal(m.allure, '0.8');
    assert.equal(m.musique, 'forte');
    assert.equal(m.sousTitres, 'non');
    assert.equal(await page.evaluer("document.querySelector('#pm-reglages [data-reglage=\"sousTitres\"] button').disabled"), true, 'grisé sans voix');
    assert.equal(await page.evaluer("!!document.getElementById('pm-reglages').closest('#pm-scene')"), false, 'hors de l\'image');
    // Un clic écrit le déroulé ; l'aperçu se recharge et rouvre le panneau, sur la nouvelle valeur.
    await page.evaluer("document.querySelector('#pm-reglages [data-reglage=\"allure\"] [data-valeur=\"1.2\"]').click(), true");
    const fin = Date.now() + 15000;
    while (lireD(dir).scenes[0].rythme !== 1.2 && Date.now() < fin) await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(lireD(dir).scenes.map((s) => s.rythme), [1.2, 1.2]);
    await attendre("document.querySelector('#pm-reglages [data-reglage=\"allure\"] button[aria-pressed=\"true\"]') && document.querySelector('#pm-reglages [data-reglage=\"allure\"] button[aria-pressed=\"true\"]').dataset.valeur === '1.2'");
  } finally {
    await page.fermer();
    await apercu.fermer();
  }
});
