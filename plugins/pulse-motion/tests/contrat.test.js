'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { TYPES, OPTIONNELLES } = require('../scripts/lib/contrat.js');
const { contraste } = require('../scripts/lib/couleurs.js');
const { verifierStyle } = require('../scripts/styles.js');

const LIVRES = path.join(__dirname, '..', 'styles');
const STYLE = path.join(LIVRES, 'clair-pedagogique');

function copieDuStyle() {
  const d = path.join(dossierTemporaire('pm-contrat-'), 'clair-pedagogique');
  fs.cpSync(STYLE, d, { recursive: true });
  // Base de départ en ton clair seul : variante sombre retirée de l'identité et de la feuille de style.
  const css = path.join(d, 'style.css');
  fs.writeFileSync(css, fs.readFileSync(css, 'utf8').replace(/#pm-scene\[data-ton="sombre"\][^{]*\{[^}]*\}/g, ''));
  const identite = JSON.parse(fs.readFileSync(path.join(d, 'identite.json'), 'utf8'));
  identite.couleur.tons = ['clair'];
  delete identite.couleur.sombre;
  fs.writeFileSync(path.join(d, 'identite.json'), JSON.stringify(identite));
  return d;
}

test('contrat : 8 types, clés de clair-pedagogique, clés facultatives de la liste', () => {
  assert.deepEqual(Object.keys(TYPES), ['titre', 'liste', 'chiffre', 'comparaison', 'etape', 'alerte', 'schema', 'conclusion']);
  assert.deepEqual(TYPES.liste, ['titre', 'point1', 'point2', 'point3', 'point4']);
  assert.deepEqual(OPTIONNELLES, { liste: ['point3', 'point4'] });
});

test('contraste WCAG : noir sur blanc 21:1, même couleur 1:1', () => {
  assert.equal(Math.round(contraste('#000000', '#ffffff')), 21);
  assert.equal(contraste('#b45309', '#b45309'), 1);
});

test('chaque style livré respecte le contrat', () => {
  for (const nom of fs.readdirSync(LIVRES)) {
    const r = verifierStyle(path.join(LIVRES, nom));
    assert.deepEqual(r.erreurs, [], nom);
    assert.deepEqual(r.avertissements, [], nom);
  }
});

test('contrat rompu : scène absente, clé de texte en trop, identité incomplète, police sans licence', () => {
  const d = copieDuStyle();
  fs.rmSync(path.join(d, 'scenes', 'schema.html'));
  const alerte = path.join(d, 'scenes', 'alerte.html');
  fs.writeFileSync(alerte, fs.readFileSync(alerte, 'utf8').replace('</section>', '<p data-texte="bonus"></p></section>'));
  const identite = JSON.parse(fs.readFileSync(path.join(d, 'identite.json'), 'utf8'));
  delete identite.signature;
  identite.genres = ['cuisine'];
  identite.mouvement.transitions = ['fondu', 'tourbillon'];
  fs.writeFileSync(path.join(d, 'identite.json'), JSON.stringify(identite));
  fs.writeFileSync(path.join(d, 'polices', 'LICENCES.md'), 'rien');
  const r = verifierStyle(d);
  assert.equal(r.ok, false);
  const tout = r.erreurs.join('\n');
  assert.match(tout, /scenes\/schema\.html manquant/);
  assert.match(tout, /scenes\/alerte\.html : data-texte .*bonus/);
  assert.match(tout, /« signature » est obligatoire/);
  assert.match(tout, /« genres »/);
  assert.match(tout, /transition inconnue du moteur « tourbillon »/);
  assert.match(tout, /Police « Figtree » : licence absente/);
});

test('ton sombre déclaré sans variante dans style.css : erreur ; effets mal exportés : avertissement', () => {
  const d = copieDuStyle();
  const identite = JSON.parse(fs.readFileSync(path.join(d, 'identite.json'), 'utf8'));
  identite.couleur.tons = ['clair', 'sombre'];
  fs.writeFileSync(path.join(d, 'identite.json'), JSON.stringify(identite));
  fs.appendFileSync(path.join(d, 'style.css'), '\n.papier { mix-blend-mode: multiply; }\n');
  const titre = path.join(d, 'scenes', 'titre.html');
  fs.writeFileSync(titre, fs.readFileSync(titre, 'utf8').replace('</section>', '<svg><filter id="f"><feTurbulence/></filter></svg></section>'));
  const r = verifierStyle(d);
  assert.match(r.erreurs.join('\n'), /\[data-ton="sombre"\] absente/);
  assert.match(r.avertissements.join('\n'), /style\.css : mix-blend-mode .*export rapide/);
  assert.match(r.avertissements.join('\n'), /scenes\/titre\.html : filtre SVG .*image embarquée/);
});

test('charte du style illisible : contraste du texte insuffisant', () => {
  const d = copieDuStyle();
  fs.writeFileSync(path.join(d, 'charte.json'), JSON.stringify({ couleurs: { primaire: '#1d4ed8', accent: '#b45309', fond: '#f8fafc', texte: '#cbd5e1' }, polices: { titres: 'Figtree', texte: 'Inter' } }));
  assert.match(verifierStyle(d).erreurs.join('\n'), /contraste texte\/fond de 1,\d:1/);
});

test('ton sombre déclaré : couleur.sombre (fond, texte lisible) obligatoire ; polices nom-graisse acceptées', () => {
  const d = copieDuStyle();
  const identite = JSON.parse(fs.readFileSync(path.join(d, 'identite.json'), 'utf8'));
  identite.couleur.tons = ['clair', 'sombre'];
  fs.writeFileSync(path.join(d, 'identite.json'), JSON.stringify(identite));
  fs.appendFileSync(path.join(d, 'style.css'), '\n#pm-scene[data-ton="sombre"] { color: var(--c-texte); }\n');
  assert.match(verifierStyle(d).erreurs.join('\n'), /« couleur\.sombre »/);
  identite.couleur.sombre = { fond: '#0b1020', texte: '#1e293b' };
  fs.writeFileSync(path.join(d, 'identite.json'), JSON.stringify(identite));
  assert.match(verifierStyle(d).erreurs.join('\n'), /contraste texte\/fond du ton sombre/);
  identite.couleur.sombre.texte = '#f1f5f9';
  fs.writeFileSync(path.join(d, 'identite.json'), JSON.stringify(identite));
  fs.renameSync(path.join(d, 'polices', 'Inter.woff2'), path.join(d, 'polices', 'Inter-400.woff2'));
  assert.deepEqual(verifierStyle(d).erreurs, []);
});

test('ton clair au fond sombre (ou l\'inverse) : couleur.<ton> exigée', () => {
  const d = copieDuStyle();
  const identite = JSON.parse(fs.readFileSync(path.join(d, 'identite.json'), 'utf8'));
  fs.writeFileSync(path.join(d, 'charte.json'), JSON.stringify({ couleurs: { primaire: '#38bdf8', accent: '#22d3ee', fond: '#0b1020', texte: '#e2e8f0' }, polices: { titres: 'Figtree', texte: 'Inter' } }));
  identite.couleur = { ...identite.couleur, tons: ['sombre', 'clair'], tonDefaut: 'sombre', sombre: { fond: '#0b1020', texte: '#e2e8f0' } };
  fs.writeFileSync(path.join(d, 'identite.json'), JSON.stringify(identite));
  fs.appendFileSync(path.join(d, 'style.css'), '\n#pm-scene[data-ton="sombre"] .rond { opacity: 0.2; }\n');
  assert.match(verifierStyle(d).erreurs.join('\n'), /le ton clair a un fond sombre : indiquez « couleur\.clair »/);
  identite.couleur.clair = { fond: '#f8fafc', texte: '#0f172a' };
  fs.writeFileSync(path.join(d, 'identite.json'), JSON.stringify(identite));
  assert.deepEqual(verifierStyle(d).erreurs, []);
});

test('animation sans fin ou compteur CSS : erreur (image finale stable, capture de l\'export) ; transition CSS : avertissement', () => {
  const d = copieDuStyle();
  fs.appendFileSync(path.join(d, 'style.css'), '\n.rond { animation: tourne 3s linear infinite; }\n.titre { transition: color 1s; }\n');
  const liste = path.join(d, 'scenes', 'liste.html');
  fs.writeFileSync(liste, fs.readFileSync(liste, 'utf8').replace('</section>', '<style>li::before { content: counter(n); }</style></section>'));
  const r = verifierStyle(d);
  assert.match(r.erreurs.join('\n'), /style\.css : animation sans fin/);
  assert.match(r.erreurs.join('\n'), /scenes\/liste\.html : compteur CSS/);
  assert.match(r.avertissements.join('\n'), /style\.css : transition CSS/);
});
