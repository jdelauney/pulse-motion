'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assembler } = require('../scripts/assembler.js');
const { controler } = require('../scripts/controler.js');
const { verifierStyle } = require('../scripts/styles.js');
const { trouverNavigateur, rendreDOM } = require('./aide/navigateur.js');
const { projetCatalogue } = require('./aide/catalogue.js');

const RACINE = path.join(__dirname, '..');
const LIVRES = ['chaleureux', 'clair-pedagogique', 'editorial', 'energique', 'minimal', 'tech-sombre'];
const FORMATS = ['16:9', '1:1', '9:16'];
const lireJSON = (...p) => JSON.parse(fs.readFileSync(path.join(RACINE, ...p), 'utf8'));
const navigateur = trouverNavigateur();

test('catalogue livré : exactement les 6 styles, chacun recommandé pour au moins un genre', () => {
  assert.deepEqual(fs.readdirSync(path.join(RACINE, 'styles')).sort(), LIVRES);
  const recommandation = lireJSON('references', 'styles', 'recommandation.json');
  const cites = new Set(Object.values(recommandation).flatMap((r) => [...r.recommandes, r.contraste]));
  for (const nom of LIVRES) assert.ok(cites.has(nom), `${nom} n'est proposé pour aucun genre`);
  for (const nom of cites) assert.ok(LIVRES.includes(nom), `${nom} recommandé mais absent`);
});

async function verifierDansLeNavigateur(style, ratio, ton) {
  const dir = projetCatalogue(style, ratio, { ton });
  const { html, erreurs } = assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(erreurs, [], `${style} ${ratio}`);
  const familles = [...new Set(Object.values(lireJSON('styles', style, 'charte.json').polices))];
  const verification = `<script>M.pret.then(function () { return document.fonts.ready; }).then(function () {
    var chargees = []; document.fonts.forEach(function (f) { if (f.status === 'loaded') chargees.push(f.family.replace(/["']/g, '')); });
    var r = { debordements: M.detecterDebordements(), erreurs: M.erreurs, polices: ${JSON.stringify(familles)}.filter(function (f) { return chargees.indexOf(f) < 0; }) };
    var pre = document.createElement('pre'); pre.id = 'verification'; pre.textContent = JSON.stringify(r); document.body.appendChild(pre);
  });</script>`;
  const fichier = path.join(dir, 'verification.html');
  fs.writeFileSync(fichier, html.replace('</body>', `${verification}\n</body>`));
  const dom = await rendreDOM(navigateur, fichier);
  const m = /<pre id="verification">([^<]*)<\/pre>/.exec(dom);
  assert.ok(m, `${style} ${ratio} : vérification absente`);
  const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  assert.deepEqual(r.erreurs, [], `${style} ${ratio} : erreurs du moteur`);
  assert.deepEqual(r.polices, [], `${style} ${ratio} : polices non chargées`);
  assert.deepEqual(r.debordements.map((d) => `${d.scene}:${d.element}`), [], `${style} ${ratio}${ton ? ` (${ton})` : ''} : débordements`);
}

for (const style of LIVRES) {
  test(`${style} : contrat, guide, contrôles sans aucun problème au maximum de texte`, () => {
    const v = verifierStyle(path.join(RACINE, 'styles', style));
    assert.deepEqual(v.erreurs, [], style);
    assert.deepEqual(v.avertissements, [], style);
    const guide = fs.readFileSync(path.join(RACINE, 'references', 'styles', `${style}.md`), 'utf8');
    assert.match(guide, /^# .+\n\n## L'essentiel\n/);
    for (const s of lireJSON('styles', style, 'catalogue.json').scenes) {
      const ligne = new RegExp(`\\| \`${s.nom}\` \\|.*\\| ${String(s.duree).replace('.', ',')} s \\|`);
      assert.doesNotMatch('aucun tableau', ligne, 'expression de contrôle invalide');
      assert.match(guide, ligne, `${style} : scène ${s.nom} documentée avec sa durée`);
    }
    assert.match(guide, /dernière scène.*0,5 s/);
    assert.deepEqual(controler({ dossier: projetCatalogue(style), ecrire: false }).problemes, [], style);
  });

  test(`${style} dans le navigateur : polices chargées, aucun débordement, en 16:9, 1:1 et 9:16`, { skip: !navigateur && 'Chrome ou Edge introuvable' }, async () => {
    const tons = lireJSON('styles', style, 'identite.json').couleur.tons;
    await Promise.all(FORMATS.map((ratio) => verifierDansLeNavigateur(style, ratio)));
    if (tons.length > 1) await Promise.all(tons.map((ton) => verifierDansLeNavigateur(style, '16:9', ton)));
  });
}

test('energique : charte à l\'accent jaune sur le fond jaune, titres et aplats encore lisibles', () => {
  const dir = projetCatalogue('energique');
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'deroule.json'), 'utf8'));
  d.charte.couleurs = { accent: '#fde047' };
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify(d));
  const { html } = assembler({ dossier: dir, ecrire: false });
  const lisible = /--c-accent-lisible: (#[0-9a-f]{6});/.exec(html)[1];
  assert.notEqual(lisible, '#fde047');
  assert.ok(require('../scripts/lib/couleurs.js').contraste(lisible, '#facc15') >= 4.5);
  assert.doesNotMatch(fs.readFileSync(path.join(RACINE, 'styles', 'energique', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''), /color:\s*var\(--c-accent\)\s*;/, 'texte en accent brut');
});

// Sélecteurs du décor (formes très transparentes) : seuls endroits où la couleur brute de la marque est permise.
const DECOR = /\.(rond|galet|bandes|grille|balayage|guillemet|ligne|repere|marqueur)(?![\w-])/;

/** Règles CSS (sélecteur, déclarations), y compris celles des requêtes de conteneur. */
function regles(css) {
  const sans = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...sans.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selecteur: m[1].trim(), corps: m[2] }));
}

test('styles livrés : texte et formes posés sur le fond en couleur lisible, jamais en couleur de marque brute', () => {
  const fautes = [];
  for (const style of LIVRES) {
    for (const { selecteur, corps } of regles(fs.readFileSync(path.join(RACINE, 'styles', style, 'style.css'), 'utf8'))) {
      if (DECOR.test(selecteur) || selecteur.startsWith('@') || selecteur.includes('keyframes')) continue;
      const sansMelange = corps.replace(/color-mix\([^;]*\)/g, '');
      if (/var\(--c-(primaire|accent)\)/.test(sansMelange)) fautes.push(`${style} : ${selecteur.replace(/\s+/g, ' ')}`);
    }
  }
  assert.deepEqual(fautes, []);
});

test('styles livrés : aucune animation sans fin (la vidéo doit finir sur une image stable)', () => {
  for (const style of LIVRES) {
    assert.doesNotMatch(fs.readFileSync(path.join(RACINE, 'styles', style, 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''), /\binfinite\b/, style);
  }
});
