'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { traduireConstats, controlerRendu } = require('../scripts/lib/rendu-controle.js');
const { controlerComplet } = require('../scripts/controler.js');
const { trouverNavigateur } = require('./aide/navigateur.js');
const { STYLES, copierProjet } = require('./aide/projet.js');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };

test('constats traduits en problèmes français (alertes)', () => {
  const p = traduireConstats([
    { regle: 'chevauchement', scene: 'intro', element: 'titre|logo', instant: 1.2, valeur: 0.4 },
    { regle: 'hors-cadre', scene: 'intro', element: 'photo', instant: 2, valeur: null },
    { regle: 'marge', scene: 'intro', element: 'titre', instant: 1, valeur: 1.5 },
    { regle: 'zone-sure', scene: 'fin', element: 'sous', instant: 3, valeur: 'bas' },
    { regle: 'logo-masque', scene: 'fin', element: 'logo', instant: 3, valeur: 'dehors' },
    { regle: 'texte-fugace', scene: 'fin', element: 'sous', instant: 1, valeur: { duree: 1.4, besoin: 1.6 } },
    { regle: 'mouvement-rapide', scene: 'fin', element: 'vite', instant: 1.2, valeur: 2 },
  ]);
  assert.deepEqual(p.map((x) => [x.regle, x.gravite, x.scene, x.element]), [
    ['chevauchement', 'alerte', 'intro', 'titre|logo'], ['hors-cadre', 'alerte', 'intro', 'photo'], ['marge', 'alerte', 'intro', 'titre'],
    ['zone-sure', 'alerte', 'fin', 'sous'], ['logo-masque', 'alerte', 'fin', 'logo'], ['texte-fugace', 'alerte', 'fin', 'sous'], ['mouvement-rapide', 'alerte', 'fin', 'vite'],
  ]);
  assert.equal(p[0].message, 'Scène « intro » : « titre » et « logo » se chevauchent (vers 1,2 s) ; les écarter, ou marquer celui qui passe volontairement par-dessus avec data-superpose. S\'il s\'agit d\'un décor : data-decor (ou alt="" pour une image, aria-hidden="true" pour un SVG).');
  assert.match(p[3].message, /en 9:16, le texte « sous » passe sous les boutons des réseaux sociaux \(en bas, vers 3 s\)/);
  assert.match(p[5].message, /ne reste lisible que 1,4 s ; il faut au moins 1,6 s/);
  assert.match(p[4].message, /le logo sort de l'image/);
});

test('sans navigateur : rendu non vérifié, une alerte qui dit quoi faire', async () => {
  const r = await controlerRendu({ html: '<html></html>', ratio: '16:9', duree: 4, navigateur: null });
  assert.equal(r.renduVerifie, false);
  assert.deepEqual(r.problemes.map((p) => [p.regle, p.gravite]), [['rendu-non-verifie', 'alerte']]);
  assert.match(r.problemes[0].message, /PM_NAVIGATEUR/);
});

test('navigateur introuvable à l\'adresse donnée : rendu impossible, sans exception', async () => {
  const r = await controlerRendu({ html: '<html></html>', ratio: '16:9', duree: 4, navigateur: path.join(__dirname, 'absent.exe') });
  assert.equal(r.renduVerifie, false);
  assert.equal(r.problemes[0].regle, 'rendu-impossible');
});

test('controlerComplet : projet sans défaut rendu dans Chrome, rien à signaler, controle.json complet', sans, async () => {
  const dir = copierProjet('projet-simple');
  for (const f of ['01-intro.html', '02-chiffre.html']) {
    const fichier = path.join(dir, 'scenes', f);
    fs.writeFileSync(fichier, fs.readFileSync(fichier, 'utf8').replace(/(<section[^>]*>)/, '$1\n  <style>@scope { :scope { padding: 12cqh 12cqw; } }</style>'));
  }
  const r = await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false });
  assert.equal(r.renduVerifie, true);
  assert.deepEqual(r.problemes, []);
  assert.deepEqual(JSON.parse(fs.readFileSync(r.fichier, 'utf8')), { problemes: [], corrections: [], renduVerifie: true });
});

test('controlerComplet : un défaut de mise en page et un débordement rendus remontent ; le rapport de l\'aperçu est remplacé', sans, async () => {
  const dir = copierProjet('projet-simple');
  const fichier = path.join(dir, 'scenes', '01-intro.html');
  fs.writeFileSync(fichier, fs.readFileSync(fichier, 'utf8')
    .replace(/(<section[^>]*>)/, '$1\n  <style>@scope { :scope { padding: 12cqh 12cqw; } }</style>')
    .replace('<h1 id="titre"', '<h1 id="titre" style="position:absolute; left:1cqw; top:40cqh; width:3cqw; white-space:nowrap; overflow:hidden"'));
  fs.mkdirSync(path.join(dir, 'sortie'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sortie', 'controle-page.json'), JSON.stringify({ debordements: [{ scene: 'chiffre', element: 'legende', message: 'ancien rapport' }] }));
  const r = await controlerComplet({ dossier: dir, dossierStyles: STYLES, corriger: false });
  const regles = r.problemes.map((p) => p.regle);
  assert.ok(regles.includes('marge'), JSON.stringify(r.problemes));
  assert.ok(r.problemes.some((p) => p.regle === 'debordement' && p.scene === 'intro'), JSON.stringify(r.problemes));
  assert.equal(r.problemes.some((p) => p.message === 'ancien rapport'), false);
});

test('revue : messages qui disent comment marquer un décor, et raccourcir plutôt que déplacer en 9:16', () => {
  const [chev, dehors, zone] = traduireConstats([
    { regle: 'chevauchement', scene: 'a', element: 'x|y', instant: 1, valeur: 0.5 },
    { regle: 'hors-cadre', scene: 'a', element: 'ciel', instant: 1, valeur: null },
    { regle: 'zone-sure', scene: 'a', element: 'point4', instant: 1, valeur: 'bas' },
  ]);
  assert.match(chev.message, /décor.*data-decor/);
  assert.match(dehors.message, /décor.*data-decor/);
  assert.match(zone.message, /raccourcir/);
});

test('revue : navigateur introuvable à l\'adresse donnée, le message nomme le chemin et PM_NAVIGATEUR', async () => {
  const chemin = path.join(__dirname, 'absent.exe');
  const r = await controlerRendu({ html: '<html></html>', ratio: '16:9', duree: 4, navigateur: chemin });
  assert.ok(r.problemes[0].message.includes(chemin), r.problemes[0].message);
  assert.match(r.problemes[0].message, /PM_NAVIGATEUR/);
});

test('contraste réel traduit en alerte française', () => {
  const [p] = traduireConstats([{ regle: 'contraste-reel', scene: 'fin', element: 'titre', instant: 2, valeur: 2.1 }]);
  assert.equal(p.gravite, 'alerte');
  assert.equal(p.message, 'Scène « fin » : le texte « titre » ne se détache pas assez de ce qu\'il y a derrière lui (contraste 2,1:1 vers 2 s) ; assombrir ou éclaircir le fond sous le texte, ajouter un aplat, ou changer la couleur du texte.');
});

test('flash traduit en erreur française', () => {
  const [p] = traduireConstats([{ regle: 'flash', scene: 'intro', element: null, instant: 1.5, valeur: 5 }]);
  assert.equal(p.gravite, 'erreur');
  assert.equal(p.message, 'Scène « intro » : l\'image clignote 5 fois par seconde vers 1,5 s ; au-delà de 3 flashs par seconde sur une grande partie de l\'image, la vidéo peut déclencher une crise chez une personne épileptique. Ralentir ou adoucir ce clignotement.');
});
