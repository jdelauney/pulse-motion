'use strict';
/* Spec Retouches et ergonomie (S4) 5.15 (messages du contrôle sans jargon, consigne pour Claude) et 5.16 (noms proches). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TECHNIQUE, separerMessage, avecConsignes } = require('../scripts/lib/messages.js');
const { traduireConstats } = require('../scripts/lib/rendu-controle.js');
const { controlerComplet } = require('../scripts/controler.js');
const { calculerMinutage } = require('../moteur/minutage.js');
const { validerDeroule } = require('../scripts/lib/deroule.js');
const { ouvrirStudio } = require('../scripts/voix.js');
const P = require('../moteur/proches.js');
const { STYLES, EFFETS, FIXTURES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const ecrireScene = (dir, nom, html) => fs.writeFileSync(path.join(dir, 'scenes', nom), html);
const sansRendu = { corriger: false, rendu: false, mesurer: async () => ({ renduVerifie: false, problemes: [], ajustements: [] }) };
// Ni « data- », ni « --pm- », ni « --c- », ni « cqh », ni « aria- », ni « alt= », ni accolade, ni JSON, CSS, HTML, ni pulse-motion.
const INTERDITS = /data-|--pm-|--c-|cqh|aria-|alt=|[{}]|JSON|CSS|HTML|pulse-motion/;

/** Constat factice : toute valeur lue vaut 1 (nombre) ou « 1 » (texte). */
const valeur = new Proxy({}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 1 : k === 'toString' ? () => '1' : 1) });
function reglesDuRendu() {
  const t = lire('scripts', 'lib', 'rendu-controle.js');
  const bloc = /const MESSAGES = \{([\s\S]*?)\n\};/.exec(t)[1];
  return [...bloc.matchAll(/^\s*'?([a-z][a-z0-9-]*)'?: \(c\)/gm)].map((m) => m[1]);
}

/** Projet aux défauts nombreux : texte trop petit, effets non exportables, lettres et caméra fautives, ancre et référence inconnues. */
function projetFautif() {
  const dir = copierProjet('projet-simple');
  ecrireScene(dir, '02-chiffre.html', `<section data-scene="chiffre">
  <style>@scope { .note { font-size: 2cqh; mix-blend-mode: multiply; } }</style>
  <div data-camera="travelling 0→1 0+1"><p class="note" data-texte="legende" data-dur="2.5" data-lettres="danse"></p></div>
  <p data-texte="detail" data-start="#legnde+0.2"></p>
</section>`);
  return dir;
}

test('controle : aucun message pour la personne ne contient de terme technique', async () => {
  // Les règles de la vidéo rendue : chaque message, avec une valeur factice.
  const constats = reglesDuRendu().map((regle) => ({ regle, scene: 'intro', element: regle === 'chevauchement' ? 'titre|logo' : 'titre', instant: 1.2, valeur }));
  const rendus = avecConsignes(traduireConstats(constats));
  assert.ok(rendus.length > 20, `${rendus.length} règles du rendu`);
  for (const p of rendus) assert.doesNotMatch(p.message, INTERDITS, `${p.regle} : « ${p.message} »`);
  // Les contrôles sans navigateur sur les fixtures de contrôle et sur un projet aux défauts nombreux.
  const projets = ['projet-simple', 'projet-effets', 'projet-particules'].filter((n) => fs.existsSync(path.join(FIXTURES, n, 'deroule.json'))).map(copierProjet);
  projets.push(projetFautif());
  let vus = 0;
  for (const dir of projets) {
    const r = await controlerComplet({ dossier: dir, dossierStyles: STYLES, dossierEffets: EFFETS, ...sansRendu });
    for (const p of r.problemes) { vus++; assert.doesNotMatch(p.message, INTERDITS, `${path.basename(dir)} ${p.regle} : « ${p.message} »`); }
    // sortie/controle.json dit la même chose que le résultat.
    const ecrit = JSON.parse(fs.readFileSync(path.join(dir, 'sortie', 'controle.json'), 'utf8'));
    assert.deepEqual(ecrit.problemes.map((p) => p.message), r.problemes.map((p) => p.message));
  }
  assert.ok(vus >= 5, `${vus} problèmes jugés`);
  // Le texte trop petit est dit sans « cqh ».
  const fautif = await controlerComplet({ dossier: projetFautif(), dossierStyles: STYLES, ...sansRendu });
  const petit = fautif.problemes.find((p) => p.regle === 'texte-petit');
  assert.match(petit.message, /trop petit pour être lu/);
  assert.match(petit.message, /% de la hauteur de l'image/);
  assert.match(petit.consigne, /2 cqh/);
});

test('controle : chaque alerte corrigeable porte une consigne', async () => {
  const r = await controlerComplet({ dossier: projetFautif(), dossierStyles: STYLES, ...sansRendu });
  const corrigeables = r.problemes.filter((p) => p.gravite === 'erreur' || p.gravite === 'alerte');
  assert.ok(corrigeables.length >= 3);
  // La consigne est le texte complet de la règle : le message, ou ce qu'il a dû retirer (termes techniques).
  for (const p of corrigeables) assert.ok(typeof p.consigne === 'string' && p.consigne.length > 0 && (p.consigne === p.message || TECHNIQUE.test(p.consigne)), `${p.regle} : consigne`);
  // La consigne garde la correction technique que le message a retirée.
  const lettres = r.problemes.find((p) => p.regle === 'lettres-invalide');
  assert.match(lettres.consigne, /data-lettres « danse » inconnu/);
  assert.doesNotMatch(lettres.message, TECHNIQUE);
  // Fonction pure : le constat d'abord, la consigne technique à part.
  const s = separerMessage('Scène « intro » : « titre » et « logo » se chevauchent (vers 3,2 s) ; les écarter, ou marquer celui qui passe volontairement par-dessus avec data-superpose. S\'il s\'agit d\'un décor : data-decor (ou alt="" pour une image, aria-hidden="true" pour un SVG).');
  assert.equal(s.message, 'Scène « intro » : « titre » et « logo » se chevauchent (vers 3,2 s).');
  assert.match(s.consigne, /data-superpose/);
  assert.deepEqual(separerMessage('Scène « a » : tout va bien.'), { message: 'Scène « a » : tout va bien.', consigne: 'Scène « a » : tout va bien.' });
  // Le champ machine « correction » reste.
  assert.deepEqual(avecConsignes([{ regle: 'x', message: 'm.', correction: { scene: 'a' } }])[0].correction, { scene: 'a' });
});

test('plugin : les compétences disent message et corrigent avec consigne', () => {
  for (const s of ['creer', 'retoucher']) assert.match(lire('skills', s, 'SKILL.md'), /dire son `message`, corriger avec sa `consigne`/, s);
  assert.match(lire('skills', 'exporter', 'SKILL.md'), /dire leur `message`/);
  assert.match(lire('references', 'controles.md'), /`message`, pour la personne[^\n]*`consigne`, pour Claude/);
});

test('proches : sans accents ni casse, les plus proches d\'abord', () => {
  assert.deepEqual(P.proches('FROID', ['chaud', 'froids', 'froid', 'Le']), ['froid', 'froids']);
  assert.deepEqual(P.proches('securite', ['Sécurité', 'sécurités', 'santé']), ['Sécurité', 'sécurités']);
  // Une transposition compte pour une seule faute.
  assert.equal(P.distance('fiord', 'froid'), 2);
  assert.equal(P.distance('frodi', 'froid'), 1);
  // Préfixe commun de 4 lettres : proposé même loin en distance.
  // « recon » partage aussi 5 lettres de préfixe : proposé, après le plus proche.
  assert.deepEqual(P.proches('recongélation', ['recon', 'recongeler', 'intro']), ['recongeler', 'recon']);
  assert.equal(P.proches('a', ['b', 'c', 'd', 'e'], { max: 3 }).length, 3);
  assert.equal(P.phrase(['froid', 'froids']), 'vouliez-vous dire « froid » ou « froids » ?');
  assert.equal(P.phrase(['a', 'b', 'c']), 'vouliez-vous dire « a », « b » ou « c » ?');
  assert.equal(P.phrase([]), '');
});

test('proches : rien de proposé au-delà du seuil', () => {
  assert.deepEqual(P.proches('neon', ['chaleureux', 'clair-pedagogique', 'editorial', 'energique', 'minimal', 'tech-sombre']), []);
  // Seuil : max(2, 40 % de la longueur) ; 3 fautes sur 6 lettres : rien.
  assert.deepEqual(P.proches('abcdef', ['abcxyz']), []);
  assert.deepEqual(P.proches('abcdef', ['abcdxy']), ['abcdxy']);
  assert.deepEqual(P.proches('', ['a']), []);
});

test('minutage : mot introuvable propose les mots proches dits dans la scène', () => {
  const voix = { debut: 0.3, duree: 2, mots: [{ w: 'Pourquoi', t0: 0, t1: 0.4 }, { w: 'le', t0: 0.5, t1: 0.6 }, { w: 'froids,', t0: 0.7, t1: 1.2 }, { w: 'froid', t0: 1.7, t1: 2 }] };
  const m = calculerMinutage([{ id: 'a', duree: 4, voix }], { a: [{ cle: 'x', start: 'mot:froit' }] });
  const e = m.erreurs.find((x) => x.regle === 'ancre-mot-introuvable');
  assert.match(e.message, /le mot « froit » n'est pas dit par la voix ; vouliez-vous dire « froid » ou « froids » \?/);
  // La liste complète ne reste que dans la consigne.
  assert.doesNotMatch(e.message, /pourquoi/i);
  assert.match(e.consigne, /mots dits dans la scène : pourquoi, le, froids, froid/);
  // Référence inconnue : les identifiants proches de la scène.
  const r = calculerMinutage([{ id: 'a', duree: 4 }], { a: [{ cle: 'titre', start: '0' }, { cle: 'y', start: '#titr+0.2' }] });
  assert.match(r.erreurs.find((x) => x.regle === 'reference-inconnue').message, /« #titr » n'existe pas dans cette scène[^;]*; vouliez-vous dire « titre » \?/);
});

test('deroule : mouvement inconnu propose les noms proches, sans commande', () => {
  const d = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'projet-simple', 'deroule.json'), 'utf8'));
  d.scenes[0].mouvements = ['pop-inn'];
  const message = validerDeroule(d).join('\n');
  assert.match(message, /mouvement « pop-inn » inconnu ; vouliez-vous dire « [^»]+ »/);
  assert.doesNotMatch(message, /pulse-motion/);
  d.scenes[0].mouvements = ['999'];
  assert.match(validerDeroule(d).join('\n'), /mouvement « 999 » inconnu ; le décrire avec des mots/);
  assert.doesNotMatch(validerDeroule(d).join('\n'), /pulse-motion/);
  // Transition inconnue : la plus proche.
  d.scenes[0].mouvements = undefined;
  d.scenes[1].transition = 'fondue';
  assert.match(validerDeroule(d).join('\n'), /transition « fondue » inconnue ; vouliez-vous dire « fondu »/);
});

test('voix studio : scène inconnue propose les scènes proches', () => {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { for (const s of d.scenes) s.voix = { texte: 'Bonjour.' }; });
  assert.match(ouvrirStudio({ dossier: dir, scene: 'chiffres', ouvrir: () => {} }).message, /Scène inconnue : « chiffres » ; vouliez-vous dire « chiffre » \?/);
  // Aucune ressemblance : la liste des scènes, comme avant.
  assert.match(ouvrirStudio({ dossier: dir, scene: 'rien', ouvrir: () => {} }).message, /Scène inconnue : « rien » \(scènes : intro, chiffre\)/);
  assert.ok(dossierTemporaire);
});
