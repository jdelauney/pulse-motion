'use strict';
/* « La chaîne du froid » avec le son : textes dits, voix provisoire, sous-titres, musique générée, bruitages. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { assembler } = require('../scripts/assembler.js');
const { controler } = require('../scripts/controler.js');
const { voixProvisoire } = require('../scripts/voix.js');
const { calculerMinutage } = require('../moteur/minutage.js');
const C = require('../moteur/synthe/catalogue.js');
const W = require('../moteur/wav.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { ouvrirPage } = require('../scripts/lib/cdp.js');
const { pathToFileURL } = require('node:url');

const EXEMPLE = path.join(__dirname, '..', 'exemples', 'chaine-du-froid');
const lireDeroule = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
const mots = (t) => t.split(/\s+/).filter((m) => /[\p{L}\p{N}]/u.test(m)).length;

function copierExemple() {
  const dir = dossierTemporaire('pm-exemple-son-');
  fs.cpSync(EXEMPLE, dir, { recursive: true });
  return dir;
}

// Voix du système remplacée par une « parole » de 0,3 s par mot (sinus haché : le calage approché y trouve de l'énergie).
function synthese(parMot = 0.3) {
  return (texte, sortie) => {
    const taux = 48000, n = Math.round((mots(texte) * parMot + 0.4) * taux);
    const x = new Float32Array(n);
    for (let i = Math.round(0.2 * taux); i < n - Math.round(0.2 * taux); i++) x[i] = 0.3 * Math.sin(i / 6) * (Math.floor(i / (taux * 0.15)) % 2 ? 1 : 0.4);
    fs.writeFileSync(sortie, W.ecrire({ taux, canaux: [x] }));
    return { ok: true };
  };
}

test('déroulé : un texte dit par scène, au plus 3,5 mots par seconde ; sous-titres, ambiance générée, bruitages', () => {
  const d = lireDeroule(EXEMPLE);
  for (const s of d.scenes) {
    assert.ok(s.voix && s.voix.texte, `${s.id} : texte dit`);
    // Règle du guidage : la scène dure au moins mots / 3,5 + 0,7 s.
    assert.ok(s.duree >= mots(s.voix.texte) / 3.5 + 0.7, `${s.id} : ${mots(s.voix.texte)} mots en ${s.duree} s`);
  }
  assert.ok(d.sousTitres);
  assert.ok(Object.keys(C.AMBIANCES).includes(d.musique.generee));
  assert.equal(d.bruitages.transitions, true);
  const sons = fs.readdirSync(path.join(EXEMPLE, 'scenes')).flatMap((f) => [...fs.readFileSync(path.join(EXEMPLE, 'scenes', f), 'utf8').matchAll(/data-son="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(sons.length >= 3, sons.join(','));
  for (const s of sons) assert.ok(C.BRUITAGES.includes(s), s);
});

test('voix provisoire puis contrôle : aucune erreur, seules les alertes de voix provisoire restent', async () => {
  const dir = copierExemple();
  const r = await voixProvisoire({ dossier: dir, synthetiser: synthese(), outil: { present: false } });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.scenes.length, 6);
  const a = assembler({ dossier: dir });
  assert.equal(a.ok, true);
  assert.equal(a.donnees.sousTitres.cartons.length > 6, true);
  assert.ok(fs.existsSync(path.join(dir, 'sortie', 'la-chaine-du-froid.srt')));
  assert.ok(fs.existsSync(path.join(dir, 'sortie', 'la-chaine-du-froid.vtt')));
  const c = controler({ dossier: dir, ecrire: false });
  const restes = c.problemes.filter((p) => p.gravite !== 'info');
  assert.deepEqual([...new Set(restes.map((p) => p.regle))], ['voix-provisoire'], JSON.stringify(restes));
});

test('une ancre mot: se recale quand la prise change', async () => {
  const instant = async (parMot) => {
    const dir = copierExemple();
    await voixProvisoire({ dossier: dir, synthetiser: synthese(parMot), outil: { present: false } });
    const { donnees } = assembler({ dossier: dir, ecrire: false });
    const m = calculerMinutage(donnees.scenes, { seuil: [{ cle: 'x', start: 'mot:degres' }] });
    assert.deepEqual(m.erreurs, []);
    return m.elements.seuil.x.debut - m.scenes[1].debut;
  };
  const lent = await instant(0.45), rapide = await instant(0.25);
  assert.ok(lent > rapide + 0.5, `${lent} contre ${rapide}`);
});

const navigateur = trouverNavigateur();
test('dans la page : voix, musique générée et bruitages mixés, sonie mesurée, sous-titre affiché', { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
  const dir = copierExemple();
  await voixProvisoire({ dossier: dir, synthetiser: synthese(), outil: { present: false } });
  const { html } = assembler({ dossier: dir, ecrire: false });
  const fichier = path.join(dir, 'page-son.html');
  fs.writeFileSync(fichier, html);
  const page = await ouvrirPage({ navigateur, largeur: 640, hauteur: 360 });
  try {
    await page.aller(pathToFileURL(fichier).href);
    await page.evaluer('M.pret.then(function () { return true; })');
    const r = await page.evaluer(`M.rendreSon().then(function (r) {
      M.rendre(M.minutage.scenes[1].debut + 2);
      var st = document.getElementById('pm-sous-titres');
      return { tampon: !!r.buffer, sonie: r.sonie, avertissements: r.avertissements, sousTitre: st ? st.textContent.trim() : '' };
    })`);
    assert.equal(r.tampon, true);
    assert.ok(Number.isFinite(r.sonie) && r.sonie < -15, String(r.sonie));
    assert.deepEqual(r.avertissements, []);
    assert.ok(r.sousTitre.length > 3, r.sousTitre);
    // La musique seule a sa sonie, et le mélange (voix et bruitages en plus) en diffère : la voix seule ne passerait pas.
    const b = await page.evaluer(`Promise.all([M.rendreSon(), M.rendreSon({ seulement: 'musique' })]).then(function (rs) {
      return { musique: rs[1].sonie, tout: rs[0].sonie, sons: document.querySelectorAll('#pm-scene [data-son]').length };
    })`);
    assert.ok(Number.isFinite(b.musique), JSON.stringify(b));
    assert.ok(Math.abs(b.tout - b.musique) > 0.5, JSON.stringify(b));
    assert.ok(b.sons >= 3, JSON.stringify(b));
  } finally { await page.fermer(); }
});

test('exemple : la vidéo dure une minute, et le dit (à l\'écran et dans la voix)', () => {
  const d = lireDeroule(EXEMPLE);
  assert.match(d.scenes[0].voix.texte, /en une minute/);
  assert.match(d.scenes[0].textes.sous, /^1 minute/);
});

test('revue : une vraie prise remplace la voix provisoire (scène seuil) : ancre et cartons recalés, plus d\'alerte pour elle ; mode mot', async () => {
  const { enregistrerPrise } = require('../scripts/voix.js');
  const dir = copierExemple();
  await voixProvisoire({ dossier: dir, synthetiser: synthese(0.3), outil: { present: false } });
  const etat = () => {
    const { donnees } = assembler({ dossier: dir, ecrire: false });
    const m = calculerMinutage(donnees.scenes, { seuil: [{ cle: 'x', start: 'mot:degres' }] });
    const s = m.scenes[1];
    return { ancre: m.elements.seuil.x.debut - s.debut, cartons: donnees.sousTitres.cartons.filter((c) => c.debut >= s.debut && c.debut < s.fin).map((c) => [c.debut, c.fin]), mode: donnees.sousTitres.mode };
  };
  const avant = etat();
  const fichier = path.join(dir, 'prise.wav');
  synthese(0.55)('x '.repeat(11), fichier);
  const r = await enregistrerPrise({ projet: dir, scene: 'seuil', octets: fs.readFileSync(fichier), whisper: null });
  assert.equal(r.ok, true, r.message);
  assert.equal(lireDeroule(dir).scenes[1].voix.fichier, 'assets/voix/seuil.wav');
  const apres = etat();
  assert.ok(apres.ancre > avant.ancre + 1, `${avant.ancre} → ${apres.ancre}`);
  assert.notDeepEqual(apres.cartons, avant.cartons);
  const c = controler({ dossier: dir, ecrire: false });
  assert.deepEqual(c.problemes.filter((p) => p.regle === 'voix-provisoire').map((p) => p.scene).sort(), ['fin', 'intro', 'maillons', 'recongeler', 'reflexes']);
  assert.deepEqual(c.problemes.filter((p) => p.gravite === 'erreur'), []);
  const d = lireDeroule(dir);
  d.sousTitres = { mode: 'mot' };
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify(d, null, 2));
  assert.equal(etat().mode, 'mot');
});
