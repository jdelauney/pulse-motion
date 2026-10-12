'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { trouverNavigateur, rendreDOM } = require('./aide/navigateur.js');
const { STYLES, copierProjet, modifierDeroule } = require('./aide/projet.js');
const SEUILS = require('../scripts/seuils.json');

const navigateur = trouverNavigateur();
const sans = { skip: !navigateur && 'Chrome ou Edge introuvable' };
const MARGE = '<style>@scope { :scope { padding: 12cqh 12cqw; } }</style>';

/** Projet d'essai : marge intérieure aux deux scènes, puis modification de la scène d'ouverture. */
function projet(modifier = (h) => h) {
  const dir = copierProjet('projet-simple');
  for (const f of ['01-intro.html', '02-chiffre.html']) {
    const fichier = path.join(dir, 'scenes', f);
    let html = fs.readFileSync(fichier, 'utf8').replace(/(<section[^>]*>)/, `$1\n  ${MARGE}`);
    if (f === '01-intro.html') html = modifier(html);
    fs.writeFileSync(fichier, html);
  }
  return dir;
}

async function mesurer(dir, ratio = '16:9') {
  modifierDeroule(dir, (d) => { d.format.ratio = ratio; });
  const { html } = assembler({ dossier: dir, dossierStyles: STYLES, ecrire: false });
  const fichier = path.join(dir, 'mesure.html');
  const appel = `<script>M.pret.then(function () { return document.fonts.ready; }).then(function () {
    var pre = document.createElement('pre'); pre.id = 'm';
    pre.textContent = JSON.stringify(M.mesurer({ ratio: ${JSON.stringify(ratio)}, seuils: ${JSON.stringify(SEUILS)} }));
    document.body.appendChild(pre); });</script>`;
  fs.writeFileSync(fichier, html.replace('</body>', `${appel}\n</body>`));
  const dom = await rendreDOM(navigateur, fichier);
  const m = /<pre id="m">([^<]*)<\/pre>/.exec(dom);
  assert.ok(m, 'la page n\'a pas rendu ses mesures');
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
}
const regles = (constats) => constats.map((c) => c.regle);
const boite = (id, style, extra = '') => `<svg id="${id}" ${extra} style="position:absolute; ${style}" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>`;

test('mesures : projet sans défaut, aucun constat', sans, async () => {
  assert.deepEqual(await mesurer(projet()), []);
});

test('mesures : chevauchement de deux éléments, sauf data-superpose', sans, async () => {
  const a = boite('a', 'left:20cqw; top:55cqh; width:30cqw; height:25cqh');
  const b = (extra) => boite('b', 'left:35cqw; top:62cqh; width:30cqw; height:25cqh', extra);
  const c = (await mesurer(projet((h) => h.replace('</section>', `${a}${b('')}</section>`)))).find((x) => x.regle === 'chevauchement');
  assert.equal(c.scene, 'intro');
  assert.equal(c.element, 'a|b');
  assert.ok(c.valeur > 0.3 && c.valeur < 0.5, String(c.valeur));
  assert.equal(regles(await mesurer(projet((h) => h.replace('</section>', `${a}${b('data-superpose')}</section>`)))).includes('chevauchement'), false);
});

test('mesures : élément hors de l\'image, texte collé au bord', sans, async () => {
  const dehors = boite('dehors', 'left:-10cqw; top:30cqh; width:20cqw; height:20cqh');
  const r = await mesurer(projet((h) => h.replace('</section>', `${dehors}</section>`)
    .replace('<h1 id="titre"', '<h1 id="titre" style="position:absolute; left:1cqw; top:40cqh"')));
  assert.ok(r.some((c) => c.regle === 'hors-cadre' && c.element === 'dehors'));
  const marge = r.find((c) => c.regle === 'marge');
  assert.equal(marge.element, 'titre');
  assert.ok(marge.valeur < 4, String(marge.valeur));
});

test('mesures : zone des boutons en 9:16 seulement', sans, async () => {
  const bas = (h) => h.replace('<p data-texte="sous"', '<p data-texte="sous" style="position:absolute; left:20cqw; top:85cqh; margin:0"');
  const c = (await mesurer(projet(bas), '9:16')).find((x) => x.regle === 'zone-sure');
  assert.equal(c.element, 'sous');
  assert.equal(c.valeur, 'bas');
  assert.equal(regles(await mesurer(projet(bas), '4:5')).includes('zone-sure'), false);
});

test('mesures : logo recouvert', sans, async () => {
  const r = await mesurer(projet((h) => h
    .replace('<img data-logo', '<img data-logo style="position:absolute; left:70cqw; top:20cqh; width:10cqw; height:10cqh"')
    .replace('</section>', `${boite('cache', 'left:68cqw; top:18cqh; width:14cqw; height:14cqh')}</section>`)));
  const c = r.find((x) => x.regle === 'logo-masque');
  assert.ok(c && c.valeur > 0.9, JSON.stringify(r));
});

test('mesures : texte qui disparaît trop vite', sans, async () => {
  const r = await mesurer(projet((h) => h.replace('<p data-texte="sous" data-start="#titre:fin+0.2">', '<p data-texte="sous" data-start="1" data-dur="0.3" data-tween="opacity 1→0 linear">')));
  const c = r.find((x) => x.regle === 'texte-fugace');
  assert.equal(c.element, 'sous');
  assert.ok(c.valeur.duree < c.valeur.besoin, JSON.stringify(c));
});

test('mesures : grand élément qui traverse l\'image trop vite', sans, async () => {
  const vite = boite('vite', 'left:0; top:20cqh; width:60cqw; height:60cqh; translate:var(--dx, 0) 0', 'data-start="1" data-dur="0.5" data-tween="--dx 0cqw→100cqw linear"');
  const c = (await mesurer(projet((h) => h.replace('</section>', `${vite}</section>`)))).find((x) => x.regle === 'mouvement-rapide');
  assert.equal(c.element, 'vite');
  assert.ok(c.valeur > 1, String(c.valeur));
});

test('mesures : une scène qui réapparaît n\'est pas un mouvement rapide (relevés consécutifs seulement)', sans, async () => {
  // Grand élément immobile dans la seconde scène : masquée pendant la première, puis visible.
  const dir = projet();
  const fichier = path.join(dir, 'scenes', '02-chiffre.html');
  fs.writeFileSync(fichier, fs.readFileSync(fichier, 'utf8').replace('</section>', `${boite('grand', 'left:10cqw; top:10cqh; width:60cqw; height:60cqh', 'data-superpose')}</section>`));
  assert.equal(regles(await mesurer(dir)).includes('mouvement-rapide'), false);
});

test('mesures : zone des boutons en 9:16 calée sur les réseaux (haut 7 %, bas 20 %, droite 11 % entre 40 % et 85 % de la hauteur)', sans, async () => {
  const enHautADroite = (h) => h.replace('<h1 id="titre"', '<h1 id="titre" style="position:absolute; left:20cqw; right:2cqw; top:12cqh; margin:0; font-size:3cqh; text-align:right"');
  assert.equal((await mesurer(projet(enHautADroite), '9:16')).some((x) => x.regle === 'zone-sure' && x.element === 'titre'), false, 'à droite mais au-dessus des boutons');
  const milieuADroite = (h) => h.replace('<h1 id="titre"', '<h1 id="titre" style="position:absolute; left:20cqw; right:2cqw; top:60cqh; margin:0; font-size:3cqh; text-align:right"');
  const c = (await mesurer(projet(milieuADroite), '9:16')).find((x) => x.regle === 'zone-sure' && x.element === 'titre');
  assert.equal(c && c.valeur, 'droite');
});

test('mesures : deux textes serrés dont les lettres ne se touchent pas ne se chevauchent pas', sans, async () => {
  const dir = projet((h) => h.replace('<h1 id="titre" data-texte="titre" data-start="0.3">', '<p id="numero" data-texte="numero" style="font-size:30cqh; line-height:0.75; margin:0">2</p><h1 id="titre" data-texte="titre" data-start="0.3" style="margin:0">'));
  modifierDeroule(dir, (d) => { d.scenes[0].textes.numero = '2'; });
  assert.equal(regles(await mesurer(dir)).includes('chevauchement'), false);
});

test('revue : la première scène qui entre en glissant n\'est pas un mouvement rapide', sans, async () => {
  const dir = projet((h) => h.replace('</section>', `${boite('grand', 'left:10cqw; top:50cqh; width:60cqw; height:45cqh', 'data-decor data-start="0" data-dur="4"')}</section>`));
  modifierDeroule(dir, (d) => { d.scenes[0].transition = 'glissement'; });
  assert.equal(regles(await mesurer(dir)).includes('mouvement-rapide'), false);
});

test('revue : logo peint au-dessus d\'une image data-superpose, pas masqué ; recouvert par-dessus, masqué', sans, async () => {
  const logo = (h) => h.replace('<img data-logo', '<img data-logo style="position:absolute; left:70cqw; top:20cqh; width:10cqw; height:10cqh; z-index:2"');
  const dessous = boite('photo', 'left:60cqw; top:15cqh; width:30cqw; height:30cqh; z-index:1', 'data-superpose');
  assert.equal(regles(await mesurer(projet((h) => logo(h).replace('</section>', `${dessous}</section>`)))).includes('logo-masque'), false);
  const dessus = boite('cache', 'left:68cqw; top:18cqh; width:14cqw; height:14cqh; z-index:3');
  assert.ok(regles(await mesurer(projet((h) => logo(h).replace('</section>', `${dessus}</section>`)))).includes('logo-masque'));
});

test('revue : un élément sans identifiant est nommé par son texte alternatif ou sa classe', sans, async () => {
  const sansId = '<svg class="carte" style="position:absolute; left:-10cqw; top:60cqh; width:20cqw; height:20cqh" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
  const c = (await mesurer(projet((h) => h.replace('</section>', `${sansId}</section>`)))).find((x) => x.regle === 'hors-cadre');
  assert.equal(c.element, 'carte');
});
