'use strict';
/* Spec « Styles et réalisation » (S8), jalon J4 « Son » : 5.7 (le son propre à chaque style) et 5.8 (un son plus fin).
 * Critères sans navigateur (catalogue, cordes, ambiances, identités, ambiance proposée, changer-style, contrôle), puis dans
 * Chrome ou Edge sans fenêtre (pics mesurés, sons tenus, calage, bandes, moment fort, tracé par la matière). */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../moteur/synthe/catalogue.js');
const Corde = require('../moteur/synthe/corde.js');
const A = require('../moteur/synthe/ambiances.js');
const P = require('../moteur/synthe/partition.js');
const { assembler } = require('../scripts/assembler.js');
const { controler } = require('../scripts/controler.js');
const { changerStyle } = require('../scripts/changer-style.js');
const { ambianceProposee, ambianceDuStyle, verifierStyle } = require('../scripts/styles.js');
const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const navigateur = trouverNavigateur();
const SANS = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const LIVRES = ['carnet', 'chaleureux', 'clair-pedagogique', 'crayon', 'editorial', 'energique', 'info-sans-son', 'iso-album', 'iso-infographie', 'lancement', 'minimal', 'mode-d-emploi', 'papier-decoupe', 'pictogrammes', 'plan-technique', 'recit-donnees', 'riso', 'tableau-blanc', 'tableau-noir', 'tech-sombre'];
const identite = (style) => JSON.parse(lire('styles', style, 'identite.json'));
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex').slice(0, 16);

/* ---------- Sans navigateur ---------- */

test('bruitages : 23 sons, chacun avec son pic déclaré ; sons tenus, aucun nouveau son fort', () => {
  assert.equal(C.BRUITAGES.length, 23);
  assert.equal(new Set(C.BRUITAGES).size, 23);
  for (const n of ['frappe', 'succes', 'erreur', 'notification', 'aimant', 'feutre', 'craie', 'crayon', 'papier', 'chargement', 'crissement']) assert.ok(C.BRUITAGES.includes(n), n);
  for (const n of C.BRUITAGES) assert.ok(typeof C.PICS[n] === 'number' && C.PICS[n] >= 0 && C.PICS[n] < 1, `pic de ${n}`);
  assert.deepEqual(Object.keys(C.PICS).sort(), [...C.BRUITAGES].sort());
  assert.equal(C.PICS.whoosh, 0.25, 'whoosh : milieu de son enveloppe de 0,5 s');
  assert.deepEqual(C.TENUS, ['crissement', 'feutre', 'craie', 'crayon', 'papier', 'chargement']);
  assert.deepEqual(C.FORTS, ['impact', 'basse', 'montee']);
  // Le tableau des bruitages les connaît tous.
  const ref = lire('references', 'audio', 'bruitages.md');
  for (const n of C.BRUITAGES) assert.match(ref, new RegExp('`' + n + '`'), n);
});

test('corde : même graine, même AudioBuffer ; pluck inchangé', () => {
  for (const prereglage of C.PREREGLAGES_CORDE) {
    const o = { frequence: 196, duree: 0.5, prereglage, graine: 3, taux: 48000 };
    const a = Corde.calculer(o), b = Corde.calculer(o);
    assert.ok(a.length > 4800, prereglage);
    assert.equal(sha(Buffer.from(a.buffer)), sha(Buffer.from(b.buffer)), `${prereglage} : même graine, mêmes échantillons`);
    assert.notEqual(sha(Buffer.from(a.buffer)), sha(Buffer.from(Corde.calculer({ ...o, graine: 4 }).buffer)), `${prereglage} : une autre graine varie la note`);
    let crete = 0;
    for (const x of a) { assert.ok(Number.isFinite(x)); crete = Math.max(crete, Math.abs(x)); }
    assert.ok(crete > 0.1 && crete < 0.5, `${prereglage} : crête ${crete}`);
    assert.ok(Math.abs(a[a.length - 1]) < 1e-3, `${prereglage} : fin sans clic`);
  }
  assert.deepEqual(C.PREREGLAGES_CORDE, ['guitare', 'harpe', 'kalimba', 'pizzicato']);
  // Variante tour à tour : tirée de l'instant et de la hauteur de la note, jamais d'un compteur.
  assert.equal(Corde.variante(1.25, 196), Corde.variante(1.25, 196));
  assert.ok(new Set([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75].map((t) => Corde.variante(t, 196))).size >= 2);
  // pluck : la recette d'avant, au caractère près.
  assert.ok(lire('moteur', 'synthe', 'instruments.js').includes(`    pluck: function (c, sortie, e) {
      e.frequences.forEach(function (f) {
        var env = enveloppe(c, e.t, 0.005, 0, Math.max(0.25, Math.min(1.2, e.duree * 1.5)), 0.35 * e.velocite);
        oscillateur(c, 'triangle', f, e.t, e.t + 1.5).connect(filtre(c, 'lowpass', Math.min(8000, f * 6), e.t)).connect(env).connect(sortie);
      });
    },`));
});

test('ambiances : acoustique et mecanique déterministes ; les 6 anciennes inchangées', () => {
  // Empreintes relevées avec le code de 0.57.0, avant l'ajout des deux ambiances.
  const AVANT = { calme: '126684281bc1be05', entrainant: '15ed3a6bee5c4915', inspirant: 'ec0652dedcce8127', corporate: '6088a73373eb2e2f', suspense: '11af62e27cff8aa1', tech: 'b50be6e1be6358bb' };
  const cas = (a) => [{ ambiance: a, duree: 60, scenes: [{ debut: 0, fin: 8 }, { debut: 8, fin: 20, humeur: 'intense' }, { debut: 20, fin: 40, humeur: 'calme' }, { debut: 40, fin: 60 }] },
    { ambiance: a, duree: 23.4, graine: 7, intensite: 0.9 },
    { ambiance: a, duree: 31, accents: true, tempo: 96, tonalite: 'sol', scenes: [{ debut: 0, fin: 10 }, { debut: 10, fin: 31, humeur: 'silence' }] }];
  for (const [a, e] of Object.entries(AVANT)) assert.equal(sha(JSON.stringify(cas(a).map((o) => A.generer(o)))), e, a);
  assert.equal(Object.keys(C.AMBIANCES).length, 8);
  for (const a of ['acoustique', 'mecanique']) {
    const un = JSON.stringify(cas(a).map((o) => A.generer(o)));
    assert.equal(un, JSON.stringify(cas(a).map((o) => A.generer(o))), `${a} : même graine, même musique`);
    const p = A.generer(cas(a)[0]);
    assert.deepEqual(P.validerPartition(p), [], a);
    const ev = P.evenements(p, { duree: 60 });
    assert.ok(ev.some((x) => x.instrument === 'corde' && C.PREREGLAGES_CORDE.includes(x.prereglage)), `${a} : cordes pincées`);
    if (a === 'mecanique') assert.ok(ev.some((x) => x.instrument === 'tic') && ev.some((x) => x.instrument === 'cloche'), 'horlogerie');
  }
  // Tempos de la spec (autour de 92 et 108 bpm).
  assert.equal(C.AMBIANCES.acoustique.tempo, 92);
  assert.equal(C.AMBIANCES.mecanique.tempo, 108);
  // Coupures d'un moment fort : aucune note n'y part ; sans coupure, la partition ne change pas.
  const avec = A.generer({ ...cas('calme')[0], coupures: [{ debut: 9.4, fin: 10 }] });
  assert.deepEqual(avec.coupures, [{ debut: 9.4, fin: 10 }]);
  assert.ok(!P.evenements(avec, { duree: 60 }).some((x) => x.t >= 9.4 && x.t < 10));
  assert.ok(P.evenements(A.generer(cas('calme')[0]), { duree: 60 }).some((x) => x.t >= 9.4 && x.t < 10));
  // Préréglage : seulement pour corde, parmi les quatre.
  assert.ok(P.validerPartition({ tempo: 90, mesures: 1, pistes: [{ instrument: 'pad', prereglage: 'harpe', motif: ['do4 1'] }] }).length);
  assert.ok(P.validerPartition({ tempo: 90, mesures: 1, pistes: [{ instrument: 'corde', prereglage: 'banjo', motif: ['do4 1'] }] }).length);
  assert.deepEqual(P.validerPartition({ tempo: 90, mesures: 1, pistes: [{ instrument: 'corde', prereglage: 'harpe', motif: ['do4 1'] }] }), []);
});

test('creer : ambiance proposée = première ambiance du style', () => {
  for (const style of LIVRES) {
    const son = identite(style).son;
    assert.equal(ambianceProposee(son, null), son.ambiances[0], style);
    assert.equal(ambianceDuStyle(style, null).ambiance, son.ambiances[0], style);
    // Le genre ne départage que si le style a plusieurs ambiances ; un genre qui n'en préfère aucune : la première.
    assert.equal(ambianceProposee({ ambiances: [son.ambiances[0]] }, 'social'), son.ambiances[0], style);
  }
  assert.equal(ambianceProposee({ ambiances: ['calme', 'inspirant'] }, 'storytelling'), 'inspirant', 'le genre départage');
  assert.equal(ambianceProposee({ ambiances: ['calme', 'inspirant'] }, 'formation'), 'calme');
  assert.equal(ambianceProposee(null, 'produit'), 'corporate', 'style personnel sans palette sonore : ambiance du genre');
  const creer = lire('skills', 'creer', 'SKILL.md');
  assert.ok(Buffer.byteLength(creer) <= 23400);
  assert.match(creer, /L'ambiance est celle du style \(`pulse-motion styles ambiance <style> --genre <genre>`/);
  assert.match(creer, /Toujours `"bruitages": \{ "calage": "pic" \}`/);
});

test('changer-style : propose l\'ambiance du nouveau style si l\'ancienne était celle par défaut', () => {
  const scenes = [{ id: 'a', type: 'titre', html: '<h1 data-texte="titre" data-start="0.2"></h1>', textes: { titre: 'Bonjour', sous: 'Essai' } }];
  // clair-pedagogique (calme par défaut) vers tech-sombre (tech) : proposée, jamais changée.
  const dir = miniProjet({ scenes, deroule: { musique: { generee: 'calme', volume: 0.8 } } });
  const r = changerStyle({ dossier: dir, style: 'tech-sombre' });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.ambiance, { actuelle: 'calme', proposee: 'tech' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8')).musique.generee, 'calme', 'jamais changée seule');
  // Ambiance choisie par la personne (pas celle par défaut de l'ancien style) : rien à proposer.
  const choisie = miniProjet({ scenes, deroule: { musique: { generee: 'suspense', volume: 0.8 } } });
  assert.equal(changerStyle({ dossier: choisie, style: 'tech-sombre' }).ambiance, undefined);
  // Le genre départage : chaleureux (inspirant, calme) vers clair-pedagogique (calme, inspirant), en formation.
  const genre = miniProjet({ scenes, deroule: { musique: { generee: 'inspirant', volume: 0.8 } }, style: 'chaleureux' });
  assert.deepEqual(changerStyle({ dossier: genre, style: 'clair-pedagogique' }).ambiance, { actuelle: 'inspirant', proposee: 'calme' });
  assert.match(lire('skills', 'retoucher', 'SKILL.md'), /`pulse-motion changer-style \. <style>` \(son `ambiance` : la proposer\)/);
});

test('fiches : chaque bruitage cité au § 7 est dans son.bruitages et dans le catalogue', () => {
  for (const style of LIVRES) {
    const son = identite(style).son;
    for (const b of Object.values(son.bruitages)) if (b !== null) assert.ok(C.BRUITAGES.includes(b), `${style} : ${b}`);
    const fiche = lire('references', 'styles', `${style}.md`);
    const s7 = fiche.split(/^## 7\. /m)[1].split(/^## 8\. /m)[0];
    const ligne = (s7.match(/^- Bruitages : .*$/m) || [''])[0];
    for (const [, nom] of ligne.matchAll(/→ `([a-z-]+)`/g)) {
      const transition = Object.values(C.SONS_TRANSITION).includes(nom);
      assert.ok(Object.values(son.bruitages).includes(nom) || son.fort === nom || transition, `${style} : « ${nom} » cité au § 7`);
      assert.ok(C.BRUITAGES.includes(nom), `${style} : « ${nom} » au catalogue`);
    }
  }
  // tech-sombre tape en frappe (J1 l'avait laissé à clic, faute de frappe).
  assert.equal(identite('tech-sombre').son.bruitages.texte, 'frappe');
  assert.match(lire('references', 'styles', 'tech-sombre.md'), /texte → `frappe`/);
});

test('identite : la matière est un son tenu, et le son du tracé', () => {
  const base = path.join(RACINE, 'styles', 'clair-pedagogique');
  const copie = (son) => {
    const d = path.join(dossierTemporaire('pm-matiere-'), 'clair-pedagogique');
    fs.cpSync(base, d, { recursive: true });
    const id = JSON.parse(fs.readFileSync(path.join(d, 'identite.json'), 'utf8'));
    id.son = { ...id.son, ...son, bruitages: { ...id.son.bruitages, ...(son.bruitages || {}) } };
    fs.writeFileSync(path.join(d, 'identite.json'), JSON.stringify(id, null, 2));
    return verifierStyle(d, { livre: true }).erreurs.filter((e) => /matière|son\./.test(e));
  };
  assert.deepEqual(copie({ matiere: 'craie', bruitages: { trace: 'craie' } }), []);
  assert.ok(copie({ matiere: 'craie', bruitages: { trace: 'whoosh' } }).some((e) => /doit aussi être le son du tracé/.test(e)));
  assert.ok(copie({ matiere: 'pierre' }).some((e) => /matière « pierre » inconnue.*feutre, craie, crayon, papier, chargement/.test(e)));
  assert.ok(copie({ matiere: 'crissement' }).some((e) => /matière « crissement » inconnue/.test(e)), 'crissement reste le son générique');
});

test('moment fort : règle moment-fort-en-trop (un par scène, trois par vidéo) ; son fort du style compté fort', () => {
  const un = (id) => ({ id, html: `<p id="a" data-texte="t" data-start="1" data-moment-fort></p><p id="b" data-texte="u" data-start="3" data-moment-fort></p>`, textes: { t: 'Un', u: 'Deux' } });
  const dir = miniProjet({ scenes: ['s1', 's2', 's3', 's4'].map(un) });
  const a = assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(a.donnees.momentFort, { son: identite('clair-pedagogique').son.fort });
  const regles = controler({ dossier: dir }).problemes.filter((p) => p.regle === 'moment-fort-en-trop');
  assert.equal(regles.filter((p) => /un seul par scène/.test(p.message)).length, 4, JSON.stringify(regles));
  assert.ok(regles.some((p) => /4 moments forts ; trois au plus/.test(p.message) && p.scene === 's4'));
  const { separerMessage } = require('../scripts/lib/messages.js');
  assert.ok(regles.every((p) => p.gravite === 'alerte' && !/data-/.test(separerMessage(p.message).message)), 'message sans jargon pour la personne');
  // Un seul moment fort : aucune règle ; la musique générée reçoit sa coupure de 0,6 s.
  const seul = miniProjet({ scenes: [{ id: 's', html: '<p id="a" data-texte="t" data-start="2" data-moment-fort></p>', textes: { t: 'Un' } }], deroule: { musique: { generee: 'calme', volume: 0.8 } } });
  assert.deepEqual(controler({ dossier: seul }).problemes.filter((p) => p.regle === 'moment-fort-en-trop'), []);
  const p = assembler({ dossier: seul, ecrire: false }).donnees.musique.partition;
  assert.equal(p.coupures.length, 1);
  assert.ok(Math.abs(p.coupures[0].fin - p.coupures[0].debut - 0.6) < 1e-6, JSON.stringify(p.coupures));
  // Son fort sous un mot de la voix : son-sous-voix (le son du moment fort compte comme fort, même un carillon).
  assert.match(lire('scripts', 'controler.js'), /if \(x\.momentFort\) return true;/);
  // Sans moment fort : rien de nouveau dans les données de la page.
  assert.equal(assembler({ dossier: miniProjet({ scenes: [{ id: 's', html: '<p data-texte="t" data-start="1"></p>', textes: { t: 'Un' } }] }), ecrire: false }).donnees.momentFort, undefined);
  assert.ok(lire('references', 'controles.md').includes('| `moment-fort-en-trop` |'));
});

test('son tenu : compte pour un dans trop-de-sons', () => {
  const sons = (n) => [`<p id="f" data-texte="t" data-start="1" data-dur="2" data-son="feutre"></p>`,
    ...Array.from({ length: n }, (_, k) => `<p id="p${k}" data-texte="u" data-start="${1.2 + k * 0.2}" data-son="pop"></p>`)].join('');
  const trop = (n) => controler({ dossier: miniProjet({ scenes: [{ id: 's', html: sons(n), textes: { t: 'Un', u: 'Deux' } }] }) }).problemes.some((p) => p.regle === 'trop-de-sons');
  assert.equal(trop(2), false, 'un son tenu de 2 s et deux pops : trois sons');
  assert.equal(trop(3), true, 'quatre sons dans la même seconde');
});

test('déroulé : calage et bandes validés ; correctif (c) : les étapes d\'un code comptent comme du nouveau', () => {
  const { validerDeroule } = require('../scripts/lib/deroule.js');
  const base = JSON.parse(fs.readFileSync(path.join(miniProjet({ scenes: [{ id: 's', html: '<p data-texte="t" data-start="1"></p>', textes: { t: 'Un' } }] }), 'deroule.json'), 'utf8'));
  assert.deepEqual(validerDeroule({ ...base, bruitages: { calage: 'pic', bandes: true } }), []);
  assert.ok(validerDeroule({ ...base, bruitages: { calage: 'milieu' } }).some((e) => /bruitages\.calage/.test(e)));
  assert.ok(validerDeroule({ ...base, bruitages: { bandes: 'oui' } }).some((e) => /bruitages\.bandes/.test(e)));
  // (c) Une formule qui change à 4,5 s et 8 s : plus de « rien de nouveau » entre 2 s et 12 s.
  const R = require('../scripts/lib/realisation-regles.js');
  const code = { ttc: { langage: 'tableur', etapes: [{ code: '=B2' }, { code: '=B2*(1+C2)', debut: 4.5 }, { code: '=ARRONDI(B2*(1+C2);2)', debut: 8 }] } };
  const html = '<h2 data-texte="titre" data-start="0.2"></h2><figure id="f" class="code" data-code="ttc" data-start="2"></figure>';
  const scene = (c) => ({ id: 's', duree: 12, html, textes: { titre: 'Formule' }, ...(c ? { code: c } : {}) });
  const regle = (c) => controler({ dossier: miniProjet({ scenes: [scene(c), { id: 'fin', html: '<p data-texte="t" data-start="0.2"></p>', textes: { t: 'Fin' } }] }) })
    .problemes.filter((p) => p.regle === 'rien-de-nouveau' && p.scene === 's');
  assert.deepEqual(regle(code), [], 'étapes à 4,5 s et 8 s : du nouveau toutes les 4 s au plus');
  const sansEtapes = { ttc: { langage: 'tableur', etapes: [{ code: '=ARRONDI(B2*(1+C2);2)' }] } };
  assert.equal(regle(sansEtapes).length, 1, 'une seule étape : 10 s sans rien de nouveau');
  const { deroule } = require('../scripts/lib/deroule.js').lireDeroule(path.join(RACINE, 'exemples', 'explication-facture'));
  const sc = deroule.scenes.find((s) => s.id === 'detail');
  const elements = require('../scripts/lib/extraire.js').extraireScene(lire('exemples', 'explication-facture', sc.fichier)).elements;
  assert.deepEqual(R.instantsEtapesCode({ deroule, s: { id: 'detail', debut: 30 }, elements, scenesMinutees: deroule.scenes, html: lire('exemples', 'explication-facture', sc.fichier) }), [34.5, 38]);
});

/* ---------- Dans le navigateur ---------- */

async function ouvrir(scenes, deroule = {}, options = {}) {
  const dir = miniProjet({ scenes: scenes.map((s) => ({ duree: 6, transition: 'coupe', ...s })), deroule, style: options.style || 'clair-pedagogique' });
  const a = assembler({ dossier: dir, ecrire: false, ...(options.dossierStyles ? { dossierStyles: options.dossierStyles } : {}), ...(options.groupes ? { groupes: options.groupes } : {}) });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const fichier = path.join(dir, `page-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(fichier, a.html);
  return { a, dir, c: await ouvrirCapture({ fichierHtml: fichier, largeur: 640, hauteur: 360, navigateur, delai: 60000 }) };
}
const json = async (c, code) => JSON.parse(await c.evaluer(`Promise.resolve(${code}).then(function (r) { return JSON.stringify(r); })`));
// Un échantillon sur 5 des deux canaux du mixage. Le moteur audio du navigateur arrondit ses calculs de flottants un peu
// différemment d'une page à l'autre (écarts de 1e-8 à 1e-6 relevés sur la musique générée, déjà en 0.57.0) : deux rendus
// « identiques » le sont au-dessous du dernier pas d'un son en 16 bits (3e-5).
const ECHANTILLONS = `M.rendreSon().then(function (r) {
  var x = r.buffer.getChannelData(0), y = r.buffer.getChannelData(1), o = [];
  for (var k = 0; k < x.length; k += 5) o.push(x[k], y[k]);
  return o;
})`;
const ecart = (a, b) => { assert.equal(a.length, b.length); let m = 0; for (let k = 0; k < a.length; k++) m = Math.max(m, Math.abs(a[k] - b[k])); return m; };
const PAS_16_BITS = 1 / 32768;
const MOT = { t: 'Un', u: 'Deux', titre: 'Titre' };

test('bruitages : 23 sons, pic mesuré à ±10 ms du pic déclaré', { ...SANS, timeout: 180000 }, async () => {
  const { c } = await ouvrir([{ id: 's', html: '<p data-texte="t" data-start="1" data-son="pop"></p>', textes: MOT }]);
  try {
    for (const nom of C.BRUITAGES) {
      const r = await json(c, `M.synthe.essayerBruitage(${JSON.stringify(nom)}, { duree: 0.6 })`);
      assert.ok(r.rms > 0.001 && r.fini, `${nom} : ${r.rms}`);
      // Son lent de bruit filtré (balayages, souffle) : enveloppe lissée (±10 ms, ±25 ms pour le souffle sous 900 Hz), le grain
      // du bruit ne fait pas le pic.
      const lisse = { whoosh: 10, 'swoosh-inverse': 10, souffle: 25 }[nom] || 0;
      const e = r.enveloppe.map((_, k, x) => { let s = 0, n = 0; for (let j = Math.max(0, k - lisse); j <= Math.min(x.length - 1, k + lisse); j++) { s += x[j]; n++; } return s / n; });
      const max = Math.max(...e);
      // Son court : instant de l'enveloppe la plus forte ; son tenu : fin de l'attaque (premier instant à la moitié du maximum).
      const ms = C.TENUS.includes(nom) ? e.findIndex((v) => v >= max / 2) : e.indexOf(max);
      assert.ok(Math.abs(ms - C.PICS[nom] * 1000) <= 10, `${nom} : pic mesuré à ${ms} ms, déclaré à ${C.PICS[nom] * 1000} ms`);
    }
  } finally { await c.fermer(); }
});

test('son tenu : dure le data-dur de l\'élément ; calage pic : avancé du pic quand déclaré, inchangé sans le champ', { ...SANS, timeout: 180000 }, async () => {
  const html = '<p id="f" data-texte="t" data-start="1" data-dur="1.6" data-son="feutre"></p><p id="w" data-texte="u" data-start="4" data-son="whoosh"></p>';
  const sans = await ouvrir([{ id: 's', html, textes: MOT }]);
  const pic = await ouvrir([{ id: 's', html, textes: MOT }], { bruitages: { calage: 'pic' } });
  try {
    const a = await json(sans.c, 'M.seek(0).then(function () { return M.evenementsSons(); })');
    const feutre = a.find((x) => x.nom === 'feutre'), whoosh = a.find((x) => x.nom === 'whoosh');
    assert.ok(Math.abs(feutre.duree - 1.6) < 1e-9 && Math.abs(feutre.t - 1) < 1e-9, JSON.stringify(a));
    assert.ok(Math.abs(whoosh.t - 4) < 1e-9, 'sans le champ : au début de l\'élément');
    const b = await json(pic.c, 'M.seek(0).then(function () { return M.evenementsSons(); })');
    assert.ok(Math.abs(b.find((x) => x.nom === 'whoosh').t - (4 - C.PICS.whoosh)) < 1e-9, JSON.stringify(b));
    assert.ok(Math.abs(b.find((x) => x.nom === 'feutre').t - (1 - C.PICS.feutre)) < 1e-9);
    // Le feutre sonne encore vers la fin de son entrée (1,4 s après son départ), et plus après.
    const niveaux = await json(sans.c, `M.rendreSon({ detail: true }).then(function (r) { var x = r.detail.autres;
      function rms(a, z) { var s = 0; for (var k = Math.round(a * 48000); k < Math.round(z * 48000); k++) s += x[k] * x[k]; return Math.sqrt(s / ((z - a) * 48000)); }
      return [rms(2.3, 2.5), rms(2.9, 3.3)]; })`);
    assert.ok(niveaux[0] > 10 * niveaux[1] && niveaux[0] > 1e-3, JSON.stringify(niveaux));
  } finally { await sans.c.fermer(); await pic.c.fermer(); }
});

test('bandes : sans le champ, mixage identique octet pour octet à celui d\'avant', { ...SANS, timeout: 240000 }, async () => {
  const html = '<p data-texte="t" data-start="1" data-son="pop"></p><p data-texte="u" data-start="2.5" data-son="impact"></p>';
  const musique = { musique: { generee: 'calme', volume: 0.8 } };
  const empreintes = [];
  for (const bruitages of [undefined, { bandes: false }, { bandes: true }]) {
    const p = await ouvrir([{ id: 's', html, textes: MOT }], { ...musique, ...(bruitages ? { bruitages } : {}) });
    try { empreintes.push(await json(p.c, ECHANTILLONS)); } finally { await p.c.fermer(); }
  }
  assert.ok(ecart(empreintes[0], empreintes[1]) < PAS_16_BITS, `bandes: false : rien ne change (${ecart(empreintes[0], empreintes[1])})`);
  assert.ok(ecart(empreintes[0], empreintes[2]) > 1e-3, 'bandes: true : musique et bruitages séparés');
  // Plages du passe-bas : 0,3 s autour du pic du pop seul (impact : fort, jamais filtré).
  const p = await ouvrir([{ id: 's', html, textes: MOT }], { ...musique, bruitages: { bandes: true } });
  try {
    const plages = await json(p.c, 'M.seek(0).then(function () { return M.plagesBandes(); })');
    assert.equal(plages.length, 1, JSON.stringify(plages));
    assert.ok(Math.abs(plages[0].debut - (1 + C.PICS.pop - 0.15)) < 1e-6 && Math.abs(plages[0].fin - (1 + C.PICS.pop + 0.15)) < 1e-6);
    assert.ok(ecart(await json(p.c, ECHANTILLONS), empreintes[2]) < PAS_16_BITS);
  } finally { await p.c.fermer(); }
});

test('moment fort : musique muette 0,6 s avant, son fort du style dessus', { ...SANS, timeout: 180000 }, async () => {
  const p = await ouvrir([{ id: 's', html: '<p id="f" data-texte="t" data-start="3" data-moment-fort></p>', textes: MOT }], { musique: { generee: 'calme', volume: 1, intensite: 0.9 } });
  try {
    const sons = await json(p.c, 'M.seek(0).then(function () { return M.evenementsSons(); })');
    assert.deepEqual(sons.map((x) => [x.nom, Math.round(x.t * 1000)]), [[identite('clair-pedagogique').son.fort, 3000]]);
    assert.deepEqual(await json(p.c, 'M.momentsForts()'), [{ t: 3, id: 'f' }]);
    const r = await json(p.c, `M.rendreSon({ detail: true }).then(function (r) { var x = r.detail.autres;
      function rms(a, z) { var s = 0; for (var k = Math.round(a * 48000); k < Math.round(z * 48000); k++) s += x[k] * x[k]; return Math.sqrt(s / ((z - a) * 48000)); }
      return { avant: rms(1.6, 2.3), silence: rms(2.42, 2.98), coup: rms(3.0, 3.4) }; })`);
    assert.ok(r.avant > 1e-3, JSON.stringify(r));
    assert.ok(r.silence < r.avant / 100, `musique muette 0,6 s avant : ${JSON.stringify(r)}`);
    assert.ok(r.coup > 1e-3, `le son fort tombe sur l'élément : ${JSON.stringify(r)}`);
  } finally { await p.c.fermer(); }
});

test('bruitages : le tracé sonne crissement sans matière déclarée, et le son tenu de la matière du style sinon', { ...SANS, timeout: 180000 }, async () => {
  const boites = '<div id="x" style="position: absolute; left: 10cqh; top: 40cqh; width: 20cqh; height: 10cqh; background: #fff" data-texte="t" data-start="0.2"></div><div id="y" style="position: absolute; left: 120cqh; top: 40cqh; width: 20cqh; height: 10cqh; background: #fff" data-texte="u" data-start="0.2"></div>';
  const fleche = '<i data-fleche="#x → #y" data-start="1" data-dur="1.4"></i>';
  // Tracé à main levée (--pm-trait: main), et une flèche nette dans une autre scène (son du tracé de la table du style).
  const scenes = [{ id: 's', html: `<section data-scene="s" style="--pm-trait: main">${boites}${fleche}</section>`, textes: MOT }, { id: 'n', html: boites + fleche, textes: MOT }];
  // Style livré sans matière (clair-pedagogique : son tracé générique est whoosh pour les flèches) : crissement.
  const sans = await ouvrir(scenes, { bruitages: { auto: true } });
  // Le même style avec une matière : craie.
  const dossier = dossierTemporaire('pm-matiere-page-');
  fs.cpSync(path.join(RACINE, 'styles', 'clair-pedagogique'), path.join(dossier, 'clair-pedagogique'), { recursive: true });
  const fichier = path.join(dossier, 'clair-pedagogique', 'identite.json');
  const id = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  id.son.matiere = 'craie';
  id.son.bruitages.trace = 'craie';
  fs.writeFileSync(fichier, JSON.stringify(id, null, 2));
  const avec = await ouvrir(scenes, { bruitages: { auto: true } }, { dossierStyles: [dossier] });
  try {
    const a = await json(sans.c, 'M.seek(0).then(function () { return M.evenementsSons(); })');
    const b = await json(avec.c, 'M.seek(0).then(function () { return M.evenementsSons(); })');
    const trace = (l) => l.find((x) => Math.abs(x.t - 1) < 1e-6 && C.TENUS.includes(x.nom));
    assert.ok(a.some((x) => x.nom === 'whoosh' && Math.abs(x.t - 7) < 1e-6), 'flèche nette de clair-pedagogique : whoosh, comme avant');
    assert.equal(trace(a) && trace(a).nom, 'crissement', JSON.stringify(a));
    assert.equal(trace(b) && trace(b).nom, 'craie', JSON.stringify(b));
    assert.ok(Math.abs(trace(b).duree - 1.4) < 1e-6, 'la matière dure tout le tracé');
  } finally { await sans.c.fermer(); await avec.c.fermer(); }
});

test('corde dans la page : les ambiances acoustique et mecanique embarquent les cordes et sonnent pareil deux fois', { ...SANS, timeout: 240000 }, async () => {
  const scenes = [{ id: 's', html: '<p data-texte="t" data-start="1"></p>', textes: MOT }];
  const pages = [];
  try {
    for (const generee of ['acoustique', 'acoustique', 'mecanique']) {
      const p = await ouvrir(scenes, { musique: { generee, volume: 0.8 } });
      pages.push(p);
      assert.ok(p.a.groupes.includes('corde'), p.a.groupes.join(','));
    }
    const [a, b, m] = [await json(pages[0].c, ECHANTILLONS), await json(pages[1].c, ECHANTILLONS), await json(pages[2].c, ECHANTILLONS)];
    assert.ok(ecart(a, b) < PAS_16_BITS, `même musique : ${ecart(a, b)}`);
    assert.ok(ecart(a, m) > 1e-3);
    for (const pre of C.PREREGLAGES_CORDE) {
      const r = await json(pages[0].c, `M.synthe.essayerInstrument('corde', ${JSON.stringify(pre)})`);
      assert.ok(r.rms > 0.001 && r.fini && r.crete < 1, `${pre} : ${JSON.stringify(r)}`);
    }
  } finally { for (const p of pages) await p.c.fermer(); }
  // Une musique sans corde n'embarque pas le module.
  const sansCorde = assembler({ dossier: miniProjet({ scenes, deroule: { musique: { generee: 'calme', volume: 0.8 } } }), ecrire: false });
  assert.ok(!sansCorde.groupes.includes('corde'));
});
