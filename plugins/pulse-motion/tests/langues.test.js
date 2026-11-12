'use strict';
/* Spec S9 (lacunes créatives), 5.1 : langue de la vidéo. Le plugin reste en français ; seule la vidéo change de langue. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../moteur/langues.js');
const { validerDeroule } = require('../scripts/lib/deroule.js');
const { assembler } = require('../scripts/assembler.js');
const T = require('../moteur/tween.js');
const Ty = require('../scripts/lib/typographie.js');
const ST = require('../moteur/sous-titres.js');
const A = require('../moteur/aligner.js');
const Lv = require('../moteur/personnages/levres.js');
const F = require('../scripts/lib/ffmpeg.js');
const { controler } = require('../scripts/controler.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');
const INSECABLE = String.fromCharCode(0xa0);
const base = (plus = {}) => ({ version: 1, titre: 'Essai', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9' }, style: 'minimal',
  scenes: [{ id: 'a', fichier: 'scenes/01-a.html', duree: 4, textes: {} }], ...plus });
const titre = '<h2 data-texte="titre" data-start="0.3" data-dur="0.6"></h2>';

test('déroulé : langue absente vaut fr, langue inconnue refusée avec la liste en français', () => {
  assert.deepEqual(validerDeroule(base()), []);
  assert.equal(L.etiquetteDe(base()), 'fr');
  for (const l of ['en', 'en-US', 'pt-BR', 'fr-CA', 'de-CH', 'nl', 'es-MX', 'it']) assert.deepEqual(validerDeroule(base({ langue: l })), [], l);
  const err = validerDeroule(base({ langue: 'pl' }));
  assert.equal(err.length, 1);
  assert.equal(err[0], L.MESSAGE);
  assert.match(err[0], /^« langue » doit être l'une de : français \(fr\), anglais \(en\), espagnol \(es\), allemand \(de\), italien \(it\), portugais \(pt\), néerlandais \(nl\), avec une région facultative \(ex\. en-US\)\.$/);
  assert.match(validerDeroule(base({ langue: 'en-FR' }))[0], /région « FR » n'est pas prévue en anglais/);
  // Région absente : en -> en-GB, pt -> pt-PT, les autres la langue seule.
  assert.equal(L.lire('en').etiquette, 'en-GB');
  assert.equal(L.lire('pt').etiquette, 'pt-PT');
  assert.equal(L.lire('de').etiquette, 'de');
  assert.equal(L.lire('en-us').etiquette, 'en-US');
});

test('langues : chaque langue a ses champs, et un message en français pour la nommer', () => {
  for (const code of L.CODES) {
    const l = L.de(code);
    for (const champ of ['nom', 'adjectif', 'articles', 'liaisons', 'caracteres', 'typographie', 'repetitions', 'lecteur', 'voixMac', 'iso6392', 'kokoro', 'source']) {
      assert.ok(l[champ] !== undefined, `${code}.${champ}`);
    }
    assert.ok(l.articles.length <= 40 && l.liaisons.length <= 40, code);
    assert.match(l.iso6392, /^[a-z]{3}$/, code);
    for (const id of l.typographie) assert.ok(Ty.REGLES[id], `${code} : règle de typographie « ${id} » inconnue`);
    // Les nombres en lettres (sauf le français, celui de l'aligneur) sont normalisés comme les mots entendus.
    if (l.nombres) for (const n of [0, 7, 21, 45, 99, 100]) assert.equal(A.normaliserMot(l.nombres(n)), l.nombres(n), `${code} ${n}`);
  }
  // La voix de synthèse ne parle que français tant que l'auteur n'a pas validé d'autres voix.
  assert.deepEqual(L.CODES.filter((c) => L.de(c).kokoro.length), ['fr']);
});

test('assembler : la page porte lang="en-GB" pour une vidéo en anglais, lang="fr" sans langue', () => {
  const avec = miniProjet({ scenes: [{ id: 'a', textes: { titre: 'Why keep food cold?' }, html: titre }], deroule: { langue: 'en' } });
  const r = assembler({ dossier: avec, ecrire: false });
  assert.equal(r.ok, true, JSON.stringify(r.erreurs));
  assert.match(r.html, /<html lang="en-GB">/);
  assert.equal(r.donnees.langue, 'en-GB');
  assert.ok(r.groupes.includes('langues'), 'le module des langues est embarqué');
  const sans = assembler({ dossier: miniProjet({ scenes: [{ id: 'a', textes: { titre: 'Pourquoi le froid ?' }, html: titre }] }), ecrire: false });
  assert.match(sans.html, /<html lang="fr">/);
  assert.equal(sans.donnees.langue, undefined);
  assert.ok(!sans.groupes.includes('langues'), 'sans langue, le module des langues n\'est pas embarqué');
});

test('assembler : page de chaine-du-froid identique octet pour octet avant et après le plan (hors moteur : aucune trace de langue)', () => {
  // La comparaison avant/après le plan est faite à la mesure D8 (page hors moteur identique) ; ici, ce qui la garantit :
  // sans « langue », ni donnée, ni module, ni attribut nouveau, et « fr » explicite ne change que ce qu'il déclare.
  const dir = path.join(RACINE, 'exemples', 'chaine-du-froid');
  const r = assembler({ dossier: dir, ecrire: false });
  assert.equal(r.ok, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8')).langue, undefined);
  assert.match(r.html, /<html lang="fr">/);
  assert.ok(!('langue' in r.donnees));
  assert.ok(!r.groupes.includes('langues'));
  assert.ok(!/M\.langues = api/.test(r.moteur), 'moteur/langues.js absent de la page');
});

test('tween : nombre 0→1250.5 donne « 1,250.5 » en en-US, « 1.250,5 » en de, « 1 250,5 » en fr', () => {
  const c = T.analyserTween('nombre 0→1250.5')[0];
  assert.equal(T.nombre(T.valeurTween(c, 1), c.decimales, 'en-US'), '1,250.5');
  assert.equal(T.nombre(1250.5, 1, 'de'), '1.250,5');
  assert.equal(T.nombre(1250.5, 1), `1${INSECABLE}250,5`);
  assert.equal(T.nombre(1250.5, 1, 'fr'), `1${INSECABLE}250,5`);
});

test('lecteur : textes de la barre dans la langue de la vidéo, bandeau d\'erreur en français', () => {
  const src = fs.readFileSync(path.join(RACINE, 'moteur', 'lecteur.js'), 'utf8');
  // Repli de la page sans langue déclarée : les mêmes textes que le français du module des langues.
  const repli = /var FRANCAIS = (\{[\s\S]*?\});/.exec(src)[1];
  // eslint-disable-next-line no-new-func
  assert.deepEqual(new Function(`return ${repli};`)(), L.de('fr').lecteur);
  assert.deepEqual(Object.keys(L.de('en').lecteur).sort(), Object.keys(L.de('fr').lecteur).sort());
  assert.equal(L.lecteur('en').lecture, 'Play');
  assert.equal(L.lecteur('de').scene, 'Szene');
  // Le bandeau d'erreur d'assemblage (aperçu seulement) reste en français, hors du module des langues.
  assert.match(src, /var message = 'Erreur d\\'assemblage'/);
  assert.ok(!JSON.stringify(L.LANGUES).includes('Erreur d\'assemblage'));
});

test('typographie : règles françaises inchangées (tous les cas existants passent)', () => {
  for (const t of ['Il dit "bonjour" ? Oui ! 4 °C : 12 €...', 'Pourquoi 4 °C ?', '« déjà » ; et l\'eau', '16:9 et 12:30']) {
    assert.deepEqual(Ty.corrigerTypographie(t), Ty.corrigerTypographie(t, 'fr'), t);
    assert.deepEqual(Ty.corrigerTypographie(t, 'fr-CA'), Ty.corrigerTypographie(t), t);
  }
  assert.equal(Ty.corrigerMajuscules('Etape 1').texte, 'Étape 1');
  assert.equal(Ty.corrigerMajuscules('Etape 1', 'en').texte, 'Etape 1');
});

test('typographie : en « Why ? » devient « Why? », guillemets droits deviennent “ ”', () => {
  assert.equal(Ty.corrigerTypographie('Why ?', 'en').texte, 'Why?');
  assert.equal(Ty.corrigerTypographie('Say "hello" now', 'en').texte, 'Say “hello” now');
  assert.equal(Ty.corrigerTypographie('It\'s 12:30 : time', 'en').texte, 'It’s 12:30: time');
  // Le pourcentage ne prend pas d'espace en anglais.
  assert.equal(Ty.corrigerTypographie('50%', 'en').texte, '50%');
  assert.deepEqual(Ty.motsDoubles('that that is true', 'en'), []);
  assert.equal(Ty.motsDoubles('the the cat', 'en').length, 1);
});

test('typographie : de guillemets „ “ ; es constat du ¿ manquant sans correction', () => {
  assert.equal(Ty.corrigerTypographie('Er sagt "Hallo" !', 'de').texte, 'Er sagt „Hallo“!');
  assert.equal(Ty.corrigerTypographie('Dijo « hola »', 'es').texte, 'Dijo «hola»');
  assert.equal(Ty.corrigerTypographie('Disse "olá"', 'pt-BR').texte, 'Disse “olá”');
  const texte = 'Hola. Qué tal?';
  assert.equal(Ty.corrigerTypographie(texte, 'es').texte, texte, 'pas de correction du signe ouvrant');
  assert.deepEqual(Ty.ponctuationOuvrante(texte, 'es').map((x) => x.ouvrant), ['¿']);
  assert.deepEqual(Ty.ponctuationOuvrante('¿Qué tal? ¡Hola!', 'es'), []);
  assert.deepEqual(Ty.ponctuationOuvrante(texte, 'fr'), []);
  // Au contrôle : règle ponctuation-ouvrante (alerte), sans correction.
  const dir = miniProjet({ scenes: [{ id: 'a', textes: { titre: 'Qué tal?' }, html: titre }], deroule: { langue: 'es' } });
  const p = controler({ dossier: dir, ecrire: false }).problemes;
  const o = p.filter((x) => x.regle === 'ponctuation-ouvrante');
  assert.equal(o.length, 1);
  assert.equal(o[0].correction, undefined);
  assert.match(o[0].message, /n'a pas de « ¿ » ouvrant ; en espagnol/);
  // La typographie d'une autre langue est nommée par sa langue.
  const en = controler({ dossier: miniProjet({ scenes: [{ id: 'a', textes: { titre: 'Why ?' }, html: titre }], deroule: { langue: 'en' } }), ecrire: false });
  assert.match(en.problemes.find((x) => x.regle === 'typographie').message, /typographie anglaise/);
});

test('sous-titres : jamais de coupe après « the » en anglais ni après « der » en allemand', () => {
  const coupes = (texte, langue) => {
    const mots = ST.motsDeScene({ debut: 0, fin: 8, texte, voix: null });
    return ST.cartons([{ id: 'a', debut: 0, fin: 8, mots }], { ratio: '9:16', langue })
      .flatMap((c) => c.lignes.map((l) => l[l.length - 1].w));
  };
  const en = coupes('We always keep the refrigerated products in the cold room of the kitchen.', 'en');
  assert.ok(!en.includes('the'), en.join(' | '));
  const de = coupes('Wir lagern die gekühlten Produkte immer in der großen Kühlkammer der Küche.', 'de');
  assert.ok(!de.includes('der') && !de.includes('die'), de.join(' | '));
  assert.match(ST.versVTT([], { langue: 'en-GB' }), /^WEBVTT\nLanguage: en-GB\n\n/);
  assert.equal(ST.versVTT([]), 'WEBVTT\n\n');
});

test('aligner : « Straße » et « strasse » sont le même mot ; nombres en lettres anglais reconnus', () => {
  assert.equal(A.normaliserMot('Straße'), 'strasse');
  assert.ok(A.memeMot(A.normaliserMot('Straße'), 'strasse'));
  assert.equal(A.normaliserMot('Øresund'), 'oresund');
  assert.equal(A.normaliserMot('Łódź'), 'lodz');
  const entendus = [{ w: 'We', t0: 0, t1: 0.2 }, { w: 'have', t0: 0.2, t1: 0.4 }, { w: 'twenty-one', t0: 0.4, t1: 0.9 }, { w: 'sites', t0: 0.9, t1: 1.2 }];
  const r = A.aligner('We have 21 sites', entendus, 1.2, 'en');
  assert.equal(r.reconnus, 4);
  assert.deepEqual(r.mots[2], { w: '21', t0: 0.4, t1: 0.9 });
  // En français, « 21 » se dit « vingt et un », jamais « twenty-one ».
  const fr = A.aligner('Nous avons 21 sites', [{ w: 'nous', t0: 0, t1: 0.2 }, { w: 'avons', t0: 0.2, t1: 0.4 }, { w: 'twenty-one', t0: 0.4, t1: 0.9 }, { w: 'sites', t0: 0.9, t1: 1.2 }], 1.2);
  assert.equal(fr.reconnus, 3);
  // Cas français existants : inchangés (tests/aligner.test.js), ex. « 1 250 » dit en lettres.
  assert.equal(A.aligner('1 250 euros', [{ w: 'mille', t0: 0, t1: 0.3 }, { w: 'deux', t0: 0.3, t1: 0.5 }, { w: 'cent', t0: 0.5, t1: 0.7 }, { w: 'cinquante', t0: 0.7, t1: 1 }, { w: 'euros', t0: 1, t1: 1.3 }], 1.3).reconnus, 3);
});

test('lèvres : visèmes français inchangés ; « see » donne I en anglais', () => {
  assert.deepEqual(Lv.visemesDuMot('bonjour'), [{ v: 'MBP', poids: 1 }, { v: 'O', poids: 2 }, { v: 'U', poids: 2 }]);
  assert.deepEqual(Lv.visemesDuMot('bonjour', 'fr-CA'), Lv.visemesDuMot('bonjour'));
  assert.deepEqual(Lv.visemesDuMot('see', 'en').map((x) => x.v), ['I']);
  assert.deepEqual(Lv.visemesDuMot('food', 'en').map((x) => x.v), ['FV', 'U', 'L']);
  assert.deepEqual(Lv.visemesDuMot('Mama', 'es').map((x) => x.v), ['MBP', 'A', 'MBP', 'A']);
  const p = Lv.piste([{ w: 'see', t0: 0, t1: 0.4 }], 0, 0, 1, 'en');
  assert.deepEqual(p.map((x) => x.v), ['I']);
});

test('voix provisoire : Windows filtre sur en*, message en français sans voix anglaise', () => {
  const { synthetiserSysteme } = require('../scripts/voix.js');
  const sortie = path.join(dossierTemporaire('pm-langue-'), 'v.wav');
  const scripts = [];
  const sansVoix = (cmd, args) => { scripts.push(args[args.length - 1]); return { status: 3 }; };
  const r = synthetiserSysteme('Hello', sortie, { plateforme: 'win32', lancer: sansVoix, langue: 'en' });
  assert.match(scripts[0], /Culture\.Name -like "en\*"/);
  assert.match(scripts[0], /if \(-not \$v\) \{ exit 3 \}/, 'jamais la voix par défaut (française) à la place');
  assert.equal(r.ok, false);
  assert.equal(r.message, 'Aucune voix anglaise sur l\'ordinateur : en ajouter une dans Paramètres → Heure et langue → Voix → Ajouter des voix, ou enregistrer la voix.');
  // En français : le script d'avant, inchangé.
  synthetiserSysteme('Bonjour', sortie, { plateforme: 'win32', lancer: (c, a) => { scripts.push(a[a.length - 1]); return { status: 1 }; } });
  assert.match(scripts[1], /Culture\.Name -like "fr\*"/);
  assert.ok(!/exit 3/.test(scripts[1]));
  // macOS : voix de la langue seulement, jamais la voix par défaut ; Linux : espeak-ng dans la langue.
  const voix = [];
  const mac = synthetiserSysteme('Hello', sortie, { plateforme: 'darwin', langue: 'en', lancer: (c, a) => { voix.push(a.includes('-v') ? a[a.indexOf('-v') + 1] : null); return { status: 1 }; } });
  assert.deepEqual(voix, ['Daniel', 'Samantha']);
  assert.match(mac.message, /^Aucune voix anglaise sur l'ordinateur/);
  const lin = [];
  synthetiserSysteme('Hallo', sortie, { plateforme: 'linux', langue: 'de', lancer: (c, a) => { lin.push(a[a.indexOf('-v') + 1]); return { status: 1 }; } });
  assert.deepEqual(lin, ['de']);
  // outils : dit si une voix de la langue existe.
  const { voixSysteme } = require('../scripts/outils.js');
  assert.equal(voixSysteme({ plateforme: 'win32', langue: 'en', lancer: () => ({ status: 0, stdout: '0' }) }).ok, false);
  assert.equal(voixSysteme({ plateforme: 'win32', langue: 'en', lancer: () => ({ status: 0, stdout: '2' }) }).ok, true);
});

test('voix provisoire : une vidéo en anglais n\'est jamais lue par une voix française ; la voix de synthèse est refusée', async () => {
  const { voixProvisoire, voixSynthese } = require('../scripts/voix.js');
  const dir = miniProjet({ scenes: [{ id: 'a', textes: { titre: 'Hello' }, html: titre, voix: { texte: 'Hello everyone.' } }], deroule: { langue: 'en' } });
  const langues = [];
  const r = await voixProvisoire({ dossier: dir, outil: null, synthetiser: (texte, brut, o) => { langues.push(o && o.langue); return { ok: false, sansVoixDeLaLangue: true, message: 'Aucune voix anglaise sur l\'ordinateur : …' }; } });
  assert.deepEqual(langues, ['en-GB']);
  assert.equal(r.ok, false);
  assert.match(r.message, /^Aucune voix anglaise/);
  const s = await voixSynthese({ dossier: dir, voix: { pret: true, moteur: async () => { throw new Error('jamais appelée'); }, modele: 'x' } });
  assert.equal(s.ok, false);
  assert.match(s.message, /ne parle que français : pour cette vidéo en anglais/);
  assert.match(validerDeroule(base({ langue: 'en', voix: { synthese: { voix: 'ff_siwis' } } }))[0], /la voix de synthèse ne parle que français/);
});

test('whisper : la langue du déroulé est transmise à transcrire.py', async () => {
  const Wh = require('../scripts/lib/whisper.js');
  // Faux Python : rend la langue reçue (--langue) comme seul mot entendu.
  const dir = dossierTemporaire('pm-langue-');
  const faux = path.join(dir, 'faux.js');
  fs.writeFileSync(faux, "const a = process.argv; console.log(JSON.stringify([{ w: a[a.indexOf('--langue') + 1], t0: 0, t1: 0.5 }]));\n", 'utf8');
  const r = await Wh.transcrire({ wav: 'x.wav', duree: 1, langue: 'de', python: [process.execPath, faux], dossier: dir });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.mots[0].w, 'de');
  // Prise d'une vidéo en espagnol : la transcription reçoit « es ».
  const { poserVoix } = require('./aide/mini-projet.js');
  const { wavSinus } = require('./aide/son.js');
  const projet = miniProjet({ scenes: [{ id: 'a', textes: { titre: 'Hola' }, html: titre, voix: { texte: 'Hola a todos.' } }], deroule: { langue: 'es' } });
  await poserVoix(projet, 'a', wavSinus({ secondes: 1 }), 'Hola a todos.');
  const recues = [];
  const { transcrirePrise } = require('../scripts/lib/voix.js');
  const d = JSON.parse(fs.readFileSync(path.join(projet, 'deroule.json'), 'utf8'));
  await transcrirePrise({ projet, relatif: d.scenes[0].voix.fichier, texte: 'Hola a todos.', whisper: { transcrire: async (o) => { recues.push(o.langue); return { ok: true, mots: [{ w: 'Hola', t0: 0, t1: 0.3 }, { w: 'a', t0: 0.3, t1: 0.4 }, { w: 'todos', t0: 0.4, t1: 0.8 }] }; } } });
  assert.deepEqual(recues, ['es']);
});

test('contrôle : glyphe-absent signale, par rôle, la police et les caractères absents', () => {
  const html = '<h1 class="titre" data-texte="titre" data-start="0.3" data-dur="0.7"></h1>';
  const dir = miniProjet({ scenes: [{ id: 'intro', textes: { titre: 'Łódź et Gdańsk' }, html }], deroule: { langue: 'fr' } });
  const p = controler({ dossier: dir, ecrire: false }).problemes.filter((x) => x.regle === 'glyphe-absent');
  assert.equal(p.length, 1, JSON.stringify(p));
  assert.equal(p[0].role, 'titres');
  assert.equal(p[0].police, 'Figtree');
  assert.ok(p[0].caracteres.includes('Ł') && p[0].caracteres.includes('ń'), p[0].caracteres.join(' '));
  assert.ok(!p[0].caracteres.includes('ó'), 'ó est dans la police');
  assert.match(p[0].message, /^Scène « intro », texte « titre » : les caractères « [^»]+ » n'existent pas dans la police « Figtree » ; ils s'afficheraient dans une autre police\. Choisir une police de charte qui les contient\.$/);
  // Les lettres de la langue sont vérifiées par « pulse-motion police » : analyserPolice reçoit celles de la langue.
  const { analyserPolice } = require('../scripts/lib/police.js');
  const figtree = fs.readFileSync(path.join(RACINE, 'styles', 'clair-pedagogique', 'polices', 'Figtree.woff2'));
  assert.deepEqual(analyserPolice(figtree, 'abcł').manquants, ['ł']);
});

test('glossaire : un glossaire français ne s\'applique pas à une vidéo en anglais', () => {
  const glossaire = '# Glossaire\n\n| Terme | Sens | À éviter | Prononciation | Clé |\n|---|---|---|---|---|\n| HACCP | méthode d\'hygiène | haccp | | |\n';
  const scenes = [{ id: 'a', textes: { titre: 'La méthode haccp' }, html: titre }];
  const regles = (dir) => controler({ dossier: dir, ecrire: false }).problemes.filter((x) => /glossaire|terme/.test(x.regle)).map((x) => x.regle);
  assert.ok(regles(miniProjet({ scenes, glossaire })).length > 0, 'vidéo française : le glossaire s\'applique');
  assert.deepEqual(regles(miniProjet({ scenes: [{ id: 'a', textes: { titre: 'The haccp method' }, html: titre }], glossaire, deroule: { langue: 'en' } })), []);
  // Un glossaire anglais (ligne « Langue : anglais ») s'applique à la vidéo anglaise.
  const anglais = glossaire.replace('# Glossaire\n', '# Glossaire\n\nLangue : anglais\n');
  assert.ok(regles(miniProjet({ scenes: [{ id: 'a', textes: { titre: 'The haccp method' }, html: titre }], glossaire: anglais, deroule: { langue: 'en' } })).length > 0);
  const V = require('../scripts/vocabulaire.js');
  assert.equal(V.langueDuGlossaire(anglais), 'en-GB');
  assert.equal(V.langueDuGlossaire(glossaire), 'fr');
});

test('export : piste son étiquetée eng ; WEBVTT porte Language: en', () => {
  assert.deepEqual(F.etiquetteSon('son.m4a', L.de('en').iso6392), ['-metadata:s:a:0', 'language=eng']);
  assert.deepEqual(F.etiquetteSon(null, 'eng'), [], 'sans son, rien');
  assert.deepEqual(F.etiquetteSon('son.m4a', null), [], 'sans langue déclarée, rien (vidéo d\'avant)');
  // Export rapide : la piste son de Mediabunny reçoit languageCode (ISO 639-2/T).
  assert.match(fs.readFileSync(path.join(RACINE, 'moteur', 'export.mjs'), 'utf8'), /addAudioTrack\(pisteAudio, langue \? \{ languageCode: langue \}/);
  // Fichiers de sous-titres : « Language: » seulement quand le déroulé déclare la langue.
  const { ecrireSousTitres } = require('../scripts/assembler.js');
  const sortie = dossierTemporaire('pm-langue-');
  const cartons = [{ debut: 0, fin: 1.5, lignes: [[{ w: 'Hello' }]] }];
  ecrireSousTitres(sortie, 'Essai', cartons, 'en-GB');
  assert.match(fs.readFileSync(path.join(sortie, 'essai.vtt'), 'utf8'), /^WEBVTT\nLanguage: en-GB\n\n00:00:00\.000 --> 00:00:01\.500\nHello\n/);
  ecrireSousTitres(sortie, 'Essai', cartons);
  assert.match(fs.readFileSync(path.join(sortie, 'essai.vtt'), 'utf8'), /^WEBVTT\n\n00:00/);
});

test('graphiques et nombres : séparateurs de la langue, « Source » traduit', () => {
  const G = require('../moteur/dessin/graphiques.js');
  assert.equal(G.texteValeur(1250.5, { unite: '%' }, 1, 'en'), '1,250.5%');
  assert.equal(G.texteValeur(12, { unite: '€' }, 0, 'de'), `12${INSECABLE}€`);
  assert.equal(G.nombreFr(1250.5, 1), `1${String.fromCharCode(0x202f)}250,5`, 'le français est inchangé');
  assert.equal(L.de('en').source, 'Source: ');
  // Le module des graphiques (pur, il ne charge rien) colle le « % » dans les mêmes langues que la typographie.
  for (const c of L.CODES) assert.equal(G.POURCENT_COLLE.test(c), L.de(c).typographie.includes('unite-insecable-sauf-pourcent'), c);
});
