'use strict';
/* Spec « Lacunes créatives » (S9), 5.13 : bibliothèque personnelle de musiques. Licences, mesure à l'ajout (dans Chrome ou
 * Edge sans fenêtre, sans ffmpeg), copie dans la vidéo, crédits, archive de la bibliothèque. Jamais le vrai dossier de la
 * personne : PULSE_MOTION_DOSSIER pointe sur un dossier temporaire, changé test par test. Musique d'essai fabriquée ici
 * (tests/aide/musique-essai.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { musiqueEssai } = require('./aide/musique-essai.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const M = require('../scripts/lib/musiques.js');
const B = require('../scripts/lib/bibliotheque.js');
const L = require('../scripts/lib/livrables.js');
const { lireDeroule, validerDeroule } = require('../scripts/lib/deroule.js');

const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };

function personnelNeuf() {
  const d = dossierTemporaire('pm-perso-');
  process.env.PULSE_MOTION_DOSSIER = d;
  return d;
}

/** Fichier de musique d'essai dans un dossier à part (comme un fichier donné par la personne). */
function fichierMusique(nom = 'matin-clair.wav', options = {}) {
  const f = path.join(dossierTemporaire('pm-musique-'), nom);
  fs.writeFileSync(f, musiqueEssai(options));
  return f;
}

// Mesure remplacée hors navigateur : la mesure réelle a son propre test.
const mesurer = async () => ({ duree: 12, tempo: 120, sonie: -20.5 });

test('musique : ajout refusé sans licence, cc-by refusé sans attribution', async () => {
  const personnel = personnelNeuf();
  const f = fichierMusique();
  const sans = await M.ajouterMusique({ fichier: f, ambiances: 'calme', personnel, mesurer });
  assert.equal(sans.ok, false);
  assert.equal(sans.raison, 'licence');
  assert.match(sans.message, /licence/);
  const ccby = await M.ajouterMusique({ fichier: f, ambiances: 'calme', licence: 'cc-by', personnel, mesurer });
  assert.equal(ccby.ok, false);
  assert.equal(ccby.raison, 'attribution');
  const autre = await M.ajouterMusique({ fichier: f, ambiances: 'calme', licence: 'autre', personnel, mesurer });
  assert.equal(autre.ok, false, 'licence « autre » sans son texte');
  assert.equal((await M.ajouterMusique({ fichier: f, ambiances: 'joyeux', licence: 'cc0', personnel, mesurer })).ok, false, 'ambiance inconnue');
  assert.equal((await M.ajouterMusique({ fichier: f, licence: 'cc0', personnel, mesurer })).ok, false, 'sans ambiance');
  assert.deepEqual(M.listerMusiques({ personnel }).musiques, [], 'rien n\'est gardé après un refus');
  const ok = await M.ajouterMusique({ fichier: f, ambiances: 'calme,inspirant', licence: 'cc-by', attribution: '« Matin clair » de Jeanne Martin, CC BY 4.0', titre: 'Matin clair', personnel, mesurer });
  assert.equal(ok.ok, true, ok.message);
  assert.equal(ok.id, 'matin-clair');
  assert.deepEqual(M.validerFiche(ok.fiche), []);
  assert.deepEqual(ok.fiche.ambiances, ['calme', 'inspirant']);
  assert.ok(fs.existsSync(path.join(personnel, 'musiques', 'matin-clair', 'musique.wav')));
  // Le même fichier une seconde fois : rien n'est copié de nouveau.
  const deja = await M.ajouterMusique({ fichier: f, ambiances: 'calme', licence: 'cc0', personnel, mesurer });
  assert.equal(deja.deja, true);
  assert.deepEqual(M.listerMusiques({ personnel }).musiques.map((m) => m.id), ['matin-clair']);
  assert.deepEqual(M.listerMusiques({ ambiance: 'suspense', personnel }).musiques, []);
  assert.equal(M.listerMusiques({ ambiance: 'inspirant', personnel }).musiques[0].titre, 'Matin clair');
  const autreTexte = await M.ajouterMusique({ fichier: fichierMusique('studio.wav', { duree: 6 }), ambiances: 'tech', licence: 'autre:usage commercial permis, sans revente', personnel, mesurer });
  assert.equal(autreTexte.ok, true, autreTexte.message);
  assert.equal(autreTexte.fiche.licenceTexte, 'usage commercial permis, sans revente');
});

test('musique : tempo et durée estimés à l\'ajout', { ...SANS, timeout: 120000 }, async () => {
  const personnel = personnelNeuf();
  const r = await M.ajouterMusique({ fichier: fichierMusique('pulsation.wav', { duree: 12, tempo: 120 }), ambiances: 'entrainant', licence: 'personnelle', personnel, navigateur });
  assert.equal(r.ok, true, r.message);
  assert.ok(Math.abs(r.fiche.duree - 12) < 0.05, `durée ${r.fiche.duree}`);
  assert.equal(r.fiche.tempo, 120);
  assert.ok(Number.isFinite(r.fiche.sonie) && r.fiche.sonie < 0, `sonie ${r.fiche.sonie}`);
  // Le calcul du tempo seul : pulsations connues, et un bruit sans pulsation.
  const flux = (periode) => Array.from({ length: 60 * 12 }, (_, i) => (i % periode === 0 ? 10 : 0.1 * ((i * 7919) % 13) / 13));
  assert.equal(M.tempoDuFlux(flux(36), 60), 100);
  assert.equal(M.tempoDuFlux(flux(50), 60), 72);
  assert.equal(M.tempoDuFlux(Array.from({ length: 60 * 12 }, (_, i) => ((i * 7919) % 101) / 101), 60), null);
});

test('musique : utiliser copie le fichier dans assets et note l\'origine ; modifier la bibliothèque ne change pas la vidéo', async () => {
  const personnel = personnelNeuf();
  const ajout = await M.ajouterMusique({ fichier: fichierMusique(), ambiances: 'calme', licence: 'achetee', titre: 'Matin clair', auteur: 'Jeanne Martin', source: 'banque de musique', personnel, mesurer });
  assert.equal(ajout.ok, true);
  const video = miniProjet({ scenes: [{ id: 'titre', html: '<h1>Bonjour</h1>' }], deroule: { musique: { generee: 'calme', volume: 0.5 } } });
  const r = M.utiliserMusique({ id: ajout.id, projet: video, personnel });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.fichier, 'assets/musique/matin-clair.wav');
  const { deroule, erreurs } = lireDeroule(video);
  assert.deepEqual(erreurs, []);
  assert.deepEqual(deroule.musique, { fichier: 'assets/musique/matin-clair.wav', origine: 'bibliotheque:matin-clair', volume: 0.5 });
  const copie = fs.readFileSync(path.join(video, 'assets', 'musique', 'matin-clair.wav'));
  // La bibliothèque change (fichier remplacé, puis musique retirée) : la vidéo garde sa copie.
  fs.writeFileSync(path.join(personnel, 'musiques', 'matin-clair', 'musique.wav'), musiqueEssai({ duree: 3, tempo: 90 }));
  assert.equal(M.retirerMusique({ id: 'matin-clair', personnel }).ok, true);
  assert.ok(fs.readFileSync(path.join(video, 'assets', 'musique', 'matin-clair.wav')).equals(copie));
  assert.equal(require('../scripts/assembler.js').assembler({ dossier: video, ecrire: false }).html.includes('id="pm-son-musique"'), true);
  // Un autre fichier du même nom dans la vidéo : jamais remplacé sans accord.
  const deux = await M.ajouterMusique({ fichier: fichierMusique('matin-clair.wav', { duree: 5 }), ambiances: 'calme', licence: 'cc0', titre: 'Matin clair', personnel, mesurer });
  assert.equal(M.utiliserMusique({ id: deux.id, projet: video, personnel }).raison, 'pris');
  assert.equal(M.utiliserMusique({ id: deux.id, projet: video, personnel, remplacer: true }).ok, true);
  assert.equal(M.utiliserMusique({ id: 'absente', projet: video, personnel }).ok, false);
  // origine : seulement « bibliotheque:<id> », avec un fichier.
  const base = { version: 1, titre: 'x', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9', ips: 30 }, style: 'clair-pedagogique', scenes: [{ id: 'a', fichier: 'scenes/a.html', duree: 3 }] };
  assert.ok(validerDeroule({ ...base, musique: { generee: 'calme', origine: 'bibliotheque:x' } }).some((e) => /musique\.origine/.test(e)));
  assert.ok(validerDeroule({ ...base, musique: { fichier: 'assets/m.mp3', origine: 'internet' } }).some((e) => /musique\.origine/.test(e)));
});

test('crédits : l\'attribution cc-by figure dans le fichier de crédits', async () => {
  const personnel = personnelNeuf();
  const attribution = '« Matin clair » de Jeanne Martin, CC BY 4.0';
  const a = await M.ajouterMusique({ fichier: fichierMusique(), ambiances: 'calme', licence: 'cc-by', attribution, titre: 'Matin clair', personnel, mesurer });
  const video = miniProjet({ scenes: [{ id: 'titre', html: '<h1>Bonjour</h1>' }] });
  assert.equal(M.utiliserMusique({ id: a.id, projet: video, personnel }).ok, true);
  const { assembler } = require('../scripts/assembler.js');
  const deroule = lireDeroule(video).deroule;
  const liv = L.ecrireLivrables({ projet: video, deroule, assemblage: assembler({ dossier: video, ecrire: false }), usage: { fichiers: ['credits'] } });
  const texte = fs.readFileSync(path.join(video, liv.fichiers.credits), 'utf8');
  assert.ok(texte.includes(`attribution : ${attribution}`), texte);
  assert.match(texte, /CC BY/);
  assert.deepEqual(liv.creditsAPreciser.filter((f) => /musique/.test(f)), []);
  assert.deepEqual(liv.alertes, []);
  // Licence « autre » : l'export rappelle de vérifier les droits.
  const b = await M.ajouterMusique({ fichier: fichierMusique('studio.wav', { duree: 4 }), ambiances: 'calme', licence: 'autre:usage interne seulement', personnel, mesurer });
  assert.equal(M.utiliserMusique({ id: b.id, projet: video, personnel }).ok, true);
  const c = L.credits({ projet: video, deroule: lireDeroule(video).deroule, assemblage: null });
  assert.equal(c.alertes.length, 1);
  assert.match(c.alertes[0], /vérifiez que vous avez le droit/);
});

test('bibliothèque : les musiques partent dans l\'archive et reviennent vérifiées', async () => {
  const personnel = personnelNeuf();
  await M.ajouterMusique({ fichier: fichierMusique(), ambiances: 'calme', licence: 'cc0', titre: 'Matin clair', personnel, mesurer });
  assert.deepEqual(B.listerBibliotheque({ personnel }).musiques, ['matin-clair']);
  const zip = path.join(dossierTemporaire('pm-zip-'), 'b.zip');
  const ex = B.exporterBibliotheque({ fichier: zip, selection: { musiques: 'tout' }, personnel });
  assert.equal(ex.ok, true, ex.message);
  assert.deepEqual(ex.contenu.musiques, ['matin-clair']);
  const ailleurs = personnelNeuf();
  const voir = B.importerBibliotheque({ fichier: zip, voir: true, personnel: ailleurs });
  assert.deepEqual(voir.importes, [{ sorte: 'musique', nom: 'matin-clair' }]);
  assert.equal(B.importerBibliotheque({ fichier: zip, personnel: ailleurs }).ok, true);
  assert.deepEqual(M.listerMusiques({ personnel: ailleurs }).musiques.map((m) => m.id), ['matin-clair']);
  assert.deepEqual(B.importerBibliotheque({ fichier: zip, voir: true, personnel: ailleurs }).identiques, [{ sorte: 'musique', nom: 'matin-clair' }]);
  // Une fiche sans licence valide est refusée à l'import.
  const Z = require('../scripts/lib/zip.js');
  const entrees = Z.lireZip(fs.readFileSync(zip)).map((e) => (e.nom === 'musiques/matin-clair/fiche.json'
    ? { nom: e.nom, donnees: Buffer.from(JSON.stringify({ ...JSON.parse(e.donnees.toString('utf8')), licence: 'cc-by', attribution: '' })) } : e));
  const fausse = path.join(dossierTemporaire('pm-zip-'), 'f.zip');
  fs.writeFileSync(fausse, Z.ecrireZip(entrees));
  const r = B.importerBibliotheque({ fichier: fausse, voir: true, personnel: personnelNeuf() });
  assert.equal(r.refuses.length, 1);
  assert.match(r.refuses[0].raison, /attribution/);
});
