'use strict';
/* Spec S7 (explication narrée), 5.12 voix de synthèse locale facultative et 5.13 prononciation vérifiée. Aucun réseau :
 * moteur de synthèse remplacé par un faux (sons témoins), installation par un faux lanceur, transcription par un faux. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const W = require('../moteur/wav.js');
const A = require('../moteur/aligner.js');
const V = require('../scripts/lib/voix.js');
const VL = require('../scripts/lib/voix-locale.js');
const Wh = require('../scripts/lib/whisper.js');
const { voixSynthese } = require('../scripts/voix.js');
const { lireDeroule, validerDeroule } = require('../scripts/lib/deroule.js');
const { exporterVideo, completerDiffusion } = require('../scripts/exporter.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { wavSinus } = require('./aide/son.js');
const { trouverNavigateur } = require('./aide/navigateur.js');

const TAUX = 24000;
/** Faux moteur : un la de 0,05 s par lettre (0,3 s au moins) par phrase ; appels comptés. */
function fauxMoteur() {
  const appels = [];
  const moteur = async ({ phrases, voix, vitesse }) => {
    appels.push({ phrases: phrases.map((p) => p.texte), voix, vitesse });
    return { ok: true, sons: phrases.map((p) => {
      const n = Math.round(Math.max(0.3, 0.05 * p.texte.length) * TAUX);
      const canal = new Float32Array(n);
      for (let i = 0; i < n; i++) canal[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / TAUX);
      return { taux: TAUX, canal };
    }) };
  };
  return { voix: { pret: true, modele: 'faux.onnx', moteur }, appels };
}
const sansTranscription = { pret: false };

function projetSynthese(textes) {
  const dir = copierProjet('projet-simple');
  modifierDeroule(dir, (d) => { d.scenes.forEach((s, k) => { if (textes[k]) s.voix = { texte: textes[k] }; }); });
  return dir;
}
const lire = (dir) => lireDeroule(dir).deroule;

test('voix de synthèse : absente, voix synthese répond par un message en français et propose l\'installation', async () => {
  const dir = projetSynthese(['Bonjour à tous.']);
  const r = await voixSynthese({ dossier: dir, voix: { pret: false, moteur: null }, whisper: sansTranscription });
  assert.equal(r.ok, false);
  assert.equal(r.installer, true);
  assert.equal(r.repli, 'provisoire');
  assert.match(r.message, /n'est pas installée sur cet ordinateur : je peux l'installer \(environ 300 Mo, quelques minutes\), ou utiliser la voix de l'ordinateur en attendant\./);
  assert.equal(fs.existsSync(path.join(dir, 'assets', 'voix', 'synthese')), false, 'rien de fabriqué');
  // État de l'installation : rien dans le dossier, pas prête, même message.
  const e = VL.etatVoixLocale({ dossier: dossierTemporaire('pm-voix-locale-'), python: { commande: ['py'], version: '3.12.1' } });
  assert.equal(e.pret, false);
  assert.equal(e.message, VL.MESSAGE_ABSENTE);
});

test('voix de synthèse : seule la scène dont le texte a changé est refaite (empreinte)', async () => {
  const dir = projetSynthese(['Pourquoi quatre degrés ?', 'Mille deux cent cinquante bactéries en une heure.']);
  const f = fauxMoteur();
  const r1 = await voixSynthese({ dossier: dir, voix: f.voix, whisper: sansTranscription });
  assert.equal(r1.ok, true, r1.message);
  assert.deepEqual(r1.scenes.map((s) => s.id), ['intro', 'chiffre']);
  assert.equal(f.appels.length, 2);
  assert.ok(fs.existsSync(path.join(dir, 'assets', 'voix', 'synthese', 'intro.wav')));
  assert.deepEqual(lire(dir).voix.synthese, { voix: 'ff_siwis', vitesse: 1 });
  const r2 = await voixSynthese({ dossier: dir, voix: f.voix, whisper: sansTranscription });
  assert.deepEqual(r2.scenes, []);
  assert.deepEqual(r2.gardees, ['intro', 'chiffre']);
  modifierDeroule(dir, (d) => { d.scenes[1].voix.texte = 'Mille bactéries en une heure.'; });
  const r3 = await voixSynthese({ dossier: dir, voix: f.voix, whisper: sansTranscription });
  assert.deepEqual(r3.scenes.map((s) => s.id), ['chiffre']);
  assert.deepEqual(r3.gardees, ['intro']);
  assert.equal(f.appels.length, 3);
  // L'allure (5.14) multiplie la vitesse : la scène est refaite, plus vite.
  modifierDeroule(dir, (d) => { d.allure = 1.2; });
  const r4 = await voixSynthese({ dossier: dir, voix: f.voix, whisper: sansTranscription });
  assert.equal(r4.scenes.length, 2);
  assert.equal(f.appels[f.appels.length - 1].vitesse, 1.2);
});

test('voix de synthèse : l\'export l\'accepte sans --avec-provisoire et le dit dans son résultat', async () => {
  const dir = projetSynthese(['Pourquoi quatre degrés ?']);
  await voixSynthese({ dossier: dir, voix: fauxMoteur().voix, whisper: sansTranscription });
  const d = lire(dir);
  assert.deepEqual(V.scenesProvisoires(dir, d), [], 'la synthèse n\'est pas la voix provisoire');
  assert.equal(V.natureVoix(dir, d), 'synthese');
  const r = await completerDiffusion({ ok: true, usage: 'web', duree: 7 }, { dossier: dir });
  assert.equal(r.voix, 'synthese');
});

const navigateur = trouverNavigateur();
test('voix de synthèse : l\'export dans le navigateur passe sans accord', { skip: !navigateur && 'Chrome ou Edge introuvable', timeout: 240000 }, async () => {
  const dir = projetSynthese(['Pourquoi quatre degrés ?']);
  await voixSynthese({ dossier: dir, voix: fauxMoteur().voix, whisper: sansTranscription });
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES, navigateur, pour: 'brouillon' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.audio, true);
});

test('voix de synthèse : la voix provisoire reste refusée sans accord', async () => {
  const dir = projetSynthese(['Pourquoi quatre degrés ?', 'Mille bactéries en une heure.']);
  await voixSynthese({ dossier: dir, scene: 'intro', voix: fauxMoteur().voix, whisper: sansTranscription });
  // La seconde scène a encore la voix de l'ordinateur.
  await V.ecrirePrise({ projet: dir, scene: 'chiffre', octets: new Uint8Array(wavSinus({ secondes: 1 })), texte: 'Mille bactéries en une heure.', provisoire: true });
  modifierDeroule(dir, (x) => { x.voix = { ...x.voix, provisoire: true }; });
  const d = lire(dir);
  assert.deepEqual(V.scenesProvisoires(dir, d), ['chiffre']);
  assert.equal(V.natureVoix(dir, d), 'mixte');
  const r = await exporterVideo({ dossier: dir, dossierStyles: STYLES });
  assert.equal(r.ok, false);
  assert.match(r.message, /voix provisoire \(scènes : chiffre\)/);
});

test('voix de synthèse : une prise de la personne passe avant la synthèse', async () => {
  const dir = projetSynthese(['Pourquoi quatre degrés ?']);
  await voixSynthese({ dossier: dir, voix: fauxMoteur().voix, whisper: sansTranscription });
  assert.equal(V.priseDeScene(dir, lire(dir), lire(dir).scenes[0]).synthese, true);
  await V.ecrirePrise({ projet: dir, scene: 'intro', octets: new Uint8Array(wavSinus({ secondes: 1 })), texte: 'Pourquoi quatre degrés ?' });
  modifierDeroule(dir, (d) => { d.scenes[0].voix.fichier = 'assets/voix/intro.wav'; });
  const p = V.priseDeScene(dir, lire(dir), lire(dir).scenes[0]);
  assert.equal(p.relatif, 'assets/voix/intro.wav');
  assert.equal(p.synthese, undefined);
  assert.equal(V.natureVoix(dir, lire(dir)), 'personne');
  // Sans --scene, une scène qui a la prise de la personne n'est pas synthétisée.
  const r = await voixSynthese({ dossier: dir, voix: fauxMoteur().voix, whisper: sansTranscription });
  assert.deepEqual(r.scenes, []);
});

/** Plus longue suite d'échantillons quasi nuls (secondes). */
function plusLongSilence(canal, taux, seuil = 1e-3) {
  let max = 0, n = 0;
  for (const x of canal) { if (Math.abs(x) < seuil) { n++; if (n > max) max = n; } else n = 0; }
  return max / taux;
}

test('voix de synthèse : [pause 0.6] ajoute 0,6 s de silence à 0,02 s près', async () => {
  const dir = projetSynthese(['Bonjour à tous [pause 0.6] voici la facture']);
  const f = fauxMoteur();
  const r = await voixSynthese({ dossier: dir, voix: f.voix, whisper: sansTranscription });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(f.appels[0].phrases, ['Bonjour à tous', 'voici la facture'], 'la pause coupe la phrase');
  const son = W.lire(new Uint8Array(fs.readFileSync(path.join(dir, 'assets', 'voix', 'synthese', 'intro.wav'))));
  const silence = plusLongSilence(W.mono(son.canaux), son.taux);
  assert.ok(Math.abs(silence - 0.6) <= 0.02, `${silence} s`);
  // Entre deux phrases : 0,25 s, plus la pause posée là.
  const phrases = VL.decouperPhrases(A.lireTexteDit('Un. Deux [pause 0.5] trois. Quatre.'));
  assert.deepEqual(phrases.phrases.map((p) => [p.texte, p.ecart]), [['Un.', 0.25], ['Deux', 0.5], ['trois.', 0.25], ['Quatre.', 0]]);
  const a = VL.assemblerPhrases([{ taux: 1000, canal: new Float32Array(100).fill(0.5) }, { taux: 1000, canal: new Float32Array(50).fill(0.5) }], [0.6, 0], { taux: 1000 });
  assert.deepEqual(a.bornes, [{ debut: 0, fin: 0.1 }, { debut: 0.7, fin: 0.75 }]);
});

test('voix de synthèse : la mention de licence apparaît dans les crédits livrés', async () => {
  const dir = projetSynthese(['Pourquoi quatre degrés ?']);
  await voixSynthese({ dossier: dir, voix: fauxMoteur().voix, whisper: sansTranscription });
  const { assembler } = require('../scripts/assembler.js');
  const assemblage = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  assert.equal(assemblage.ok, true);
  assert.equal(assemblage.donnees.scenes[0].voix.synthese, true);
  const r = require('../scripts/lib/livrables.js').credits({ projet: dir, deroule: lire(dir), assemblage });
  assert.ok(r.texte.includes('Voix de synthèse Kokoro-82M (Apache-2.0), voix ff_siwis (corpus SIWIS, CC BY)'), r.texte);
  assert.doesNotMatch(r.texte, /- aucune voix/);
});

test('voix de synthèse : installation testée avec un faux Python (aucun réseau dans les tests)', async () => {
  const dossier = dossierTemporaire('pm-voix-locale-');
  const lancees = [];
  // Faux lanceur : crée l'environnement et les fichiers « téléchargés » (dernier argument : la cible), sans rien lancer.
  const lancer = async (commande) => {
    lancees.push(commande);
    if (commande.includes('venv') && commande[commande.length - 1].endsWith('venv')) {
      fs.mkdirSync(path.dirname(VL.pythonDuVenv(dossier)), { recursive: true });
      fs.writeFileSync(VL.pythonDuVenv(dossier), '');
    }
    const cible = commande[commande.length - 1];
    if (/\.(onnx|bin)$/.test(cible)) { fs.mkdirSync(path.dirname(cible), { recursive: true }); fs.writeFileSync(cible, Buffer.from(`faux ${path.basename(cible)}`)); }
    return { code: 0, erreurs: '' };
  };
  const etapes = [];
  const r = await VL.installerVoixLocale({ dossier, python: { commande: ['py', '-3.12'], version: '3.12.1' }, lancer, surEtape: (i, n, nom) => etapes.push(`${i + 1}/${n} ${nom}`) });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.variante, 'legere');
  assert.deepEqual(r.aConfirmer, ['kokoro-v1.0.int8.onnx', 'voices-v1.0.bin'], 'empreintes notées, à reporter dans EMPREINTES');
  assert.equal(lancees.length, 4);
  assert.match(lancees[1].join(' '), /pip install --upgrade kokoro-onnx/);
  assert.ok(lancees[2].includes(`${VL.VARIANTES.legere.modele}`) || lancees[2].some((a) => a.endsWith('kokoro-v1.0.int8.onnx')));
  assert.ok(lancees.slice(2).every((c) => c[2].startsWith('import os, sys, urllib.request') && /^https:\/\//.test(c[3])), 'adresse passée en argument');
  assert.equal(etapes.length, 4);
  assert.equal(VL.etatVoixLocale({ dossier, python: null }).pret, true);
  // Empreinte connue et différente : fichier retiré, installation refusée.
  const autre = dossierTemporaire('pm-voix-locale-');
  const faux = async (c) => { const x = await lancer(c.map((a) => (typeof a === 'string' ? a.replace(dossier, autre) : a))); return x; };
  const refus = await VL.installerVoixLocale({ dossier: autre, python: { commande: ['py'], version: '3.12.1' }, lancer: faux, empreintes: { ...VL.EMPREINTES, 'voices-v1.0.bin': '0'.repeat(64) } });
  assert.equal(refus.ok, false);
  assert.match(refus.message, /ne correspond pas à celui attendu/);
  assert.equal(fs.existsSync(path.join(autre, 'modeles', 'voices-v1.0.bin')), false);
  // Étape en échec : message en français ; Python absent : message et commande du système.
  const echec = await VL.installerVoixLocale({ dossier: dossierTemporaire('pm-voix-locale-'), python: { commande: ['py'], version: '3.12.1' }, lancer: async () => ({ code: 1, erreurs: 'pas de réseau' }) });
  assert.match(echec.message, /L'installation de la voix de synthèse a échoué \(environnement Python : pas de réseau\)/);
  const sans = VL.etatVoixLocale({ dossier: dossierTemporaire('pm-voix-locale-'), python: null, horsPlage: '3.9.7' });
  assert.match(sans.message, /Python 3\.9\.7 ne convient pas/);
  assert.ok(sans.commandeSysteme);
});

const python = Wh.trouverPython();
test('voix de synthèse : le script Python (sons témoins, sans modèle) rend une phrase par fichier', { skip: !python && 'Python absent' }, async () => {
  const moteur = VL.moteurPython({ dossier: dossierTemporaire('pm-voix-locale-'), python: python.commande, env: { PM_VOIX_LOCALE_FAUX: '1' } });
  const r = await moteur({ phrases: [{ texte: 'Bonjour à tous.' }, { texte: 'Voici la facture, réglée à l\'heure.' }], voix: 'ff_siwis', vitesse: 1 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.sons.length, 2);
  assert.equal(r.sons[0].taux, 24000);
  assert.ok(Math.abs(r.sons[1].canal.length / 24000 - 0.06 * 'Voici la facture, réglée à l\'heure.'.length) < 0.01);
});

test('voix de synthèse : réglages validés par le déroulé', () => {
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'projet-simple', 'deroule.json'), 'utf8'));
  assert.deepEqual(validerDeroule({ ...base, voix: { synthese: { voix: 'ff_siwis', vitesse: 1.1 } } }), []);
  assert.ok(validerDeroule({ ...base, voix: { synthese: { vitesse: 2 } } }).some((e) => /voix\.synthese\.vitesse/.test(e)));
  assert.ok(validerDeroule({ ...base, voix: { synthese: { voix: 'am_adam' } } }).some((e) => /seule voix française/.test(e)));
  assert.equal(VL.vitesseEffective(1.3, 1.6), 2);
  assert.equal(VL.vitesseEffective(0.7, 0.7), 0.5);
});

test('voix de synthèse : outils dit si elle est installée', () => {
  const { etatOutils } = require('../scripts/outils.js');
  const e = etatOutils({ trouverNavigateur: () => null, trouverFfmpeg: () => ({ present: false }), etatWhisper: () => ({ python: null, venv: false, pret: false, message: '' }), pythonAncien: () => null,
    voixSysteme: () => ({ ok: true, message: '' }), etatVoixLocale: () => ({ pret: false, variante: null, message: VL.MESSAGE_ABSENTE }) });
  assert.deepEqual(e.voixSynthese, { ok: false, variante: null, message: VL.MESSAGE_ABSENTE });
});

// --- 5.13 : prononciation vérifiée ---------------------------------------------------------------------------------------

/** Fausse transcription : les mots donnés, répartis sur la prise. */
const fausseTranscription = (mots) => ({ pret: true, transcrire: async ({ duree }) => ({ ok: true, mots: mots.map((w, k) => ({ w, t0: k * duree / mots.length, t1: (k + 0.9) * duree / mots.length })) }) });

test('prononciation : un mot mal lu apparaît dans aVerifier avec ce qui a été entendu', async () => {
  const dir = projetSynthese(['Le plan de maîtrise sanitaire protège tous les clients du restaurant.']);
  const r = await voixSynthese({ dossier: dir, voix: fauxMoteur().voix, whisper: fausseTranscription(['le', 'plan', 'de', 'maîtrise', 'sanitaire', 'protège', 'tous', 'les', 'glands', 'du', 'restaurant']) });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.verification, true);
  assert.deepEqual(r.aVerifier, [{ scene: 'intro', mot: 'clients', entendu: 'glands' }]);
  assert.ok(r.taux.intro > 0.85 && r.taux.intro < 1);
  // Aucun mot écrit sans paire dans l'alignement seul : écarts vides.
  assert.deepEqual(A.aligner('un deux trois', [{ w: 'un', t0: 0, t1: 0.2 }, { w: 'deux', t0: 0.3, t1: 0.5 }, { w: 'trois', t0: 0.6, t1: 0.8 }], 1).ecarts, []);
});

test('prononciation : moins de 85 % de mots reconnus → voix-mal-lue', async () => {
  const dir = projetSynthese(['Le plan de maîtrise sanitaire protège tous les clients.']);
  const r = await voixSynthese({ dossier: dir, voix: fauxMoteur().voix, whisper: fausseTranscription(['le', 'plan', 'de', 'métrisse', 'sanitaire', 'protège', 'tout', 'les', 'glands']) });
  assert.ok(r.taux.intro < 0.85, String(r.taux.intro));
  assert.match(r.avertissement, /lit mal une partie du texte/);
  const v = V.lireVoixScene(dir, lire(dir), lire(dir).scenes[0]);
  const alerte = v.alertes.find((a) => a.regle === 'voix-mal-lue');
  assert.ok(alerte, JSON.stringify(v.alertes));
  assert.equal(alerte.gravite, 'alerte');
  assert.match(alerte.message, /« clients » \(entendu « glands »\)/);
  // Une prise de la personne découpée sous le seuil : voix-ecart-texte.
  const a = V.alerteVerification({ id: 'scene-3' }, { taux: 0.6, aVerifier: [] }, false);
  assert.equal(a.regle, 'voix-ecart-texte');
  assert.match(a.message, /l'enregistrement ne correspond pas au texte de la scène/);
  assert.equal(V.alerteVerification({ id: 'x' }, { taux: 0.9 }, true), null);
});

test('prononciation : sans transcription, la synthèse marche et le dit', async () => {
  const dir = projetSynthese(['Pourquoi quatre degrés ?']);
  const r = await voixSynthese({ dossier: dir, voix: fauxMoteur().voix, whisper: sansTranscription });
  assert.equal(r.ok, true);
  assert.equal(r.verification, false);
  assert.deepEqual(r.aVerifier, []);
  assert.match(r.avertissement, /Sans la transcription, la voix de synthèse marche, mais sa prononciation n'est pas vérifiée/);
  // Mots calés par phrase (bornes exactes) : approche « synthese », sans alerte de calage approché.
  const v = V.lireVoixScene(dir, lire(dir), lire(dir).scenes[0]);
  assert.equal(v.approche, 'synthese');
  assert.equal(v.mots.length, 3);
  assert.deepEqual(v.alertes, []);
});

test('prononciation : la prononciation du glossaire s\'applique à la voix de synthèse', async () => {
  const dir = projetSynthese(['Le plan HACCP protège les clients.']);
  fs.mkdirSync(path.join(dir, 'charte'), { recursive: true });
  require('../scripts/vocabulaire.js').noterGlossaire({ dossier: dir, terme: 'HACCP', sens: 'méthode de sécurité des aliments', prononciation: 'hache a cé cé pé', sauvegarde: false });
  const f = fauxMoteur();
  await voixSynthese({ dossier: dir, voix: f.voix, whisper: sansTranscription });
  assert.deepEqual(f.appels[0].phrases, ['Le plan hache a cé cé pé protège les clients.']);
  // Les mots gardés restent dans la forme affichée.
  const v = V.lireVoixScene(dir, lire(dir), lire(dir).scenes[0]);
  assert.deepEqual(v.mots.map((m) => m.w), ['Le', 'plan', 'HACCP', 'protège', 'les', 'clients.']);
});
