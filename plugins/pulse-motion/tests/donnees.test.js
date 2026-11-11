'use strict';
/* Spec « Explication narrée » (S7), plan J2 « Données, code, formules » : critères sans navigateur. Graphiques (5.6), moyeu
 * et mises en page (5.7), code (5.9), formules (5.10), cartes « graphique » et « organigramme » de S6 (5.13, conflit 11),
 * dictionnaire, référence « explication » (5.16), consignes et notices. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const G = require('../moteur/dessin/graphiques.js');
const C = require('../moteur/dessin/code.js');
const F = require('../scripts/lib/formules.js');
const DS = require('../scripts/lib/donnees-scene.js');
const GM = require('../scripts/lib/groupes-moteur.js');
const DT = require('../scripts/lib/determinisme.js');
const A = require('../scripts/lib/adapter.js');
const { TYPES, TYPES_RECENTS, OPTIONNELLES } = require('../scripts/lib/contrat.js');
const { verifierStyle } = require('../scripts/styles.js');
const { assembler } = require('../scripts/assembler.js');
const { controlerScene } = require('../scripts/lib/controle-scene.js');
const { lireDeroule, validerDeroule } = require('../scripts/lib/deroule.js');
const { miniProjet } = require('./aide/mini-projet.js');
const { dossierTemporaire } = require('./aide/temporaire.js');

const RACINE = path.join(__dirname, '..');
const DEPOT = path.join(RACINE, '..', '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const PM = path.join(RACINE, 'scripts', 'pm.js');
const FINE = '\u202f', INS = '\u00a0';
const STYLES = fs.readdirSync(path.join(RACINE, 'styles')).filter((s) => fs.existsSync(path.join(RACINE, 'styles', s, 'catalogue.json'))).sort();

const VENTES = { type: 'barres', unite: '%', source: 'Insee, 2025', valeurs: [{ etiquette: '2023', valeur: 12 }, { etiquette: '2024', valeur: 19, debut: 'mot:2024' }, { etiquette: '2025', valeur: 1250.5, accent: true }] };
const FORMULE = { langage: 'tableur', titre: 'Ventes.xlsx', etapes: [{ code: '=SOMME(B2:B13)' }, { code: '=MOYENNE(B2:B13)', debut: 2, surligner: [1] }] };
const assembler1 = (scenes, deroule) => assembler({ dossier: miniProjet({ scenes, deroule }), ecrire: false });

// --- 5.6 Graphiques ------------------------------------------------------------------------------------------------------

test('graphique : 1250,5 s\'affiche « 1 250,5 » avec des espaces insécables', () => {
  assert.equal(G.nombreFr(1250.5, 1), `1${FINE}250,5`);
  assert.equal(G.nombreFr(1234567, 0), `1${FINE}234${FINE}567`);
  assert.equal(G.nombreFr(-3.25, 2), '\u22123,25');
  assert.equal(G.nombreFr(-0.001, 1), '0,0');
  assert.equal(G.texteValeur(12, { unite: '%' }), `12${INS}%`);
  assert.equal(G.texteValeur(1250, { unite: '€' }), `1${FINE}250${INS}€`);
  assert.equal(G.texteValeur(4, { prefixe: '+' }), '+4');
  assert.equal(G.decimalesDe(VENTES), 1);
  assert.deepEqual(G.textes(VENTES).valeurs, [`12${INS}%`, `19${INS}%`, `1${FINE}250,5${INS}%`]);
  assert.equal(G.decimalesDe(VENTES, 0), 0);
  assert.deepEqual(G.textes({ ...VENTES, decimales: 1 }).valeurs[0], `12,0${INS}%`);
  assert.deepEqual(G.textes({ type: 'anneau', valeurs: [{ etiquette: 'Images', valeur: 55 }, { etiquette: 'Textes', valeur: 30 }, { valeur: 15 }] }).etiquettes,
    [`Images 55${INS}%`, `Textes 30${INS}%`, `15${INS}%`]);
  assert.deepEqual(G.pourcentages({ valeurs: [{ valeur: 1 }, { valeur: 1 }, { valeur: 1 }] }), [34, 33, 33]);
  // Dans la page assemblée : les valeurs finales, déjà typographiées.
  const a = assembler1([{ id: 's', html: '<figure data-graphique="ventes" data-start="0.5"></figure>', graphiques: { ventes: VENTES } }]);
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  assert.ok(a.html.includes(`data-pm-role="valeur" data-pm-rang="2">1${FINE}250,5${INS}%</span>`), 'valeur finale');
  assert.ok(a.html.includes(`>Source${INS}: Insee, 2025</span>`), 'source');
});

test('graphique : les barres partent de zéro même avec max donné', () => {
  const boite = { x: 80, y: 50, l: 90, h: 50 };
  for (const max of [undefined, 10, 40, 5000]) {
    const g = { type: 'barres', valeurs: [{ valeur: 12 }, { valeur: 19 }, { valeur: 27 }], ...(max ? { max } : {}) };
    const p = G.disposer(g, boite, {});
    const bas = p.axe.a[1];
    for (const b of p.barres) assert.equal(b.base, bas, `max ${max}`);
    // La hauteur est proportionnelle à la valeur, depuis zéro : 27 / 12 = h3 / h1.
    assert.ok(Math.abs(p.barres[2].h / p.barres[0].h - 27 / 12) < 0.01, `max ${max} : ${p.barres.map((b) => b.h)}`);
    assert.ok(p.echelle >= 27, 'l\'échelle couvre la plus grande valeur');
  }
  const h = G.disposer({ type: 'barres-horizontales', valeurs: [{ valeur: 4 }, { valeur: 8 }], max: 2 }, boite, { etiquettes: [{ l: 10, h: 4 }, { l: 12, h: 4 }] });
  assert.ok(h.barres.every((b) => b.base === h.axe.a[0]) && Math.abs(h.barres[1].l / h.barres[0].l - 2) < 0.01);
  // Temps : axe 0,5 s ; barres de 0,9 s, la première 0,3 s après l'axe, puis toutes les 0,22 s ; allure 1,25.
  const T = G.temps({ type: 'barres', valeurs: [{ valeur: 1 }, { valeur: 2 }, { valeur: 3, debut: 'mot:2025' }] }, 1, 1, (v) => (v === 'mot:2025' ? 4 : Number(v)));
  assert.deepEqual(T.barres.map((b) => +b.debut.toFixed(3)), [1.3, 1.52, 4]);
  assert.deepEqual([T.axe.duree, T.barres[0].duree], [0.5, 0.9]);
  assert.equal(+G.temps({ type: 'barres', valeurs: [{ valeur: 1 }] }, 0, 1.25, Number).barres[0].duree.toFixed(3), 0.72);
});

test('graphique : données invalides → graphique-donnees-invalides, message en français', () => {
  const cas = [
    [{ type: 'barres', valeurs: [{ etiquette: '2024', valeur: '19 %' }] }, /la valeur n° 1 \(« 2024 »\) n'est pas un nombre : « 19 % »/],
    [{ type: 'barres', valeurs: [] }, /« valeurs » est vide/],
    [{ type: 'secteurs', valeurs: Array.from({ length: 7 }, (_, i) => ({ valeur: i + 1 })) }, /7 secteurs : au plus 6/],
    [{ type: 'barres', valeurs: Array.from({ length: 13 }, (_, i) => ({ valeur: i + 1 })) }, /13 barres : au plus 12/],
    [{ type: 'camembert', valeurs: [{ valeur: 1 }] }, /« type » doit être l'un de : barres, barres-horizontales, courbe, secteurs, anneau \(et non « camembert »\)/],
    [{ type: 'barres', valeurs: [{ valeur: -2 }] }, /négative/],
  ];
  for (const [g, motif] of cas) {
    const a = assembler1([{ id: 's', html: '<figure data-graphique="g" data-start="0.5"></figure>', graphiques: { g } }]);
    const e = a.erreurs.filter((x) => x.regle === 'graphique-donnees-invalides');
    assert.equal(e.length, 1, JSON.stringify(a.erreurs));
    assert.equal(e[0].gravite, 'erreur');
    assert.match(e[0].message, /^Scène « s », graphique « g » : /);
    assert.match(e[0].message, motif);
  }
  // Données absentes : donnees-manquantes, au crochet de scène comme à l'assemblage.
  const dir = miniProjet({ scenes: [{ id: 's', html: '<figure data-graphique="ventes" data-start="0.5"></figure><figure data-code="f"></figure><span data-formule="aire"></span>' }] });
  const a = assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.regle === 'donnees-manquantes').map((e) => e.message), [
    'Scène « s » : data-graphique="ventes" n\'a pas de données dans le déroulé (scenes[].graphiques.ventes).',
    'Scène « s » : data-code="f" n\'a pas de données dans le déroulé (scenes[].code.f).',
    'Scène « s » : data-formule="aire" n\'a pas de données dans le déroulé (scenes[].formules.aire).']);
  const { deroule } = lireDeroule(dir);
  const crochet = controlerScene({ projet: dir, deroule, scene: deroule.scenes[0], html: fs.readFileSync(path.join(dir, deroule.scenes[0].fichier), 'utf8') });
  assert.equal(crochet.filter((e) => e.regle === 'donnees-manquantes').length, 3);
  // Le déroulé lui-même : la forme seulement.
  const err = validerDeroule({ version: 1, titre: 't', genre: 'formation', parcours: 'rapide', format: { ratio: '16:9' }, style: 'clair-pedagogique',
    scenes: [{ id: 's', fichier: 'scenes/s.html', duree: 5, textes: {}, graphiques: [], code: { f: 'x' }, formules: { a: 2 } }] });
  assert.ok(err.some((m) => /« graphiques » doit être un objet/.test(m)) && err.some((m) => /« code\.f » doit être un objet/.test(m)) && err.some((m) => /« formules\.a » doit être un texte TeX/.test(m)), err.join('\n'));
});

test('graphique : étiquettes et valeurs sont des textes jugés par le contrôle (data-texte, déroulé, jamais des clés corrigées)', () => {
  const a = assembler1([{ id: 's', html: '<figure data-graphique="ventes" data-start="0.5"></figure>', graphiques: { ventes: { ...VENTES, valeurs: VENTES.valeurs.map((v, i) => ({ ...v, etiquette: i ? v.etiquette : 'Ventes "nettes"' })) } } }]);
  const spans = [...a.html.matchAll(/<span class="pm-calque-texte (pm-graphique-[a-z]+)" data-texte="([^"]+)"[^>]*>([^<]*)<\/span>/g)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(spans.map((s) => s[1]), ['graphique:ventes:etiquette:0', 'graphique:ventes:etiquette:1', 'graphique:ventes:etiquette:2', 'graphique:ventes:valeur:0', 'graphique:ventes:valeur:1', 'graphique:ventes:valeur:2', 'graphique:ventes:source']);
  // Typographie française appliquée aux étiquettes.
  assert.equal(spans[0][2], `Ventes «${INS}nettes${INS}»`);
  assert.ok(spans.every((s) => DS.CLE_GENEREE.test(s[1])));
  assert.match(lire('scripts', 'controler.js'), /!CLE_GENEREE\.test\(a\.cle \|\| ''\)/);
  // Le moteur les adopte comme étiquettes du calque (moteur/mesures.js les juge comme tout data-texte).
  assert.match(lire('moteur', 'dessin', 'composants.js'), /O\.adopterEtiquette\(sc, s\)/);
  assert.ok(a.groupes.includes('dessin'));
  assert.deepEqual(DT.concernees(a).map((c) => [c.id, c.raisons]), [['s', ['dessin']]]);
});

// --- 5.9 Code ------------------------------------------------------------------------------------------------------------

test('code : =SOMME(B2:B13) colore la fonction, la plage et les parenthèses', () => {
  assert.deepEqual(C.colorer('=SOMME(B2:B13)', 'tableur'), [
    { texte: '=', classe: 'operateur' }, { texte: 'SOMME', classe: 'fonction' }, { texte: '(', classe: 'ponctuation' },
    { texte: 'B2:B13', classe: 'reference' }, { texte: ')', classe: 'ponctuation' }]);
  const si = C.colorer('=SI($A$1>3,5;"oui";Feuil1!C4)', 'tableur');
  assert.deepEqual(si.filter((x) => x.classe !== 'ponctuation' && x.classe !== 'operateur').map((x) => [x.texte, x.classe]),
    [['SI', 'fonction'], ['$A$1', 'reference'], ['3,5', 'nombre'], ['"oui"', 'chaine'], ['Feuil1!C4', 'reference']]);
  assert.ok(si.some((x) => x.texte.includes(';') && x.classe === 'ponctuation'));
  assert.deepEqual(C.colorer('const x = f(2); // fin', 'js').map((x) => x.classe), ['motcle', 'texte', 'ponctuation', 'texte', 'fonction', 'ponctuation', 'nombre', 'ponctuation', 'texte', 'commentaire']);
  assert.deepEqual(C.colorer('<a href="#">lien</a>', 'html').map((x) => x.classe), ['balise', 'texte', 'attribut', 'ponctuation', 'chaine', 'balise', 'texte', 'balise', 'balise']);
  assert.ok(C.colorer('color: #fff;', 'css').some((x) => x.classe === 'propriete' && x.texte === 'color'));
  assert.deepEqual(C.colorer('SELECT nom FROM clients', 'sql').filter((x) => x.classe === 'motcle').map((x) => x.texte), ['SELECT', 'FROM']);
  assert.deepEqual(C.LANGAGES, ['tableur', 'js', 'python', 'html', 'css', 'sql', 'json', 'sh', 'texte']);
  // Dans la page : chaque jeton porte sa classe et sa place (grille à chasse fixe, sans mesure).
  const a = assembler1([{ id: 's', html: '<figure data-code="formule" data-start="0.5"></figure>', code: { formule: FORMULE } }]);
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  assert.match(a.html, /<span class="pm-code-jeton pm-code-fonction" data-pm-piste="1" style="--col: 1; --ligne: 0">SOMME<\/span>/);
  assert.match(a.html, /<span class="pm-code-jeton pm-code-reference" data-pm-piste="3" style="--col: 7; --ligne: 0">B2:B13<\/span>/);
  assert.match(a.html, /<div class="pm-code-corps" data-texte="code:formule">/);
  assert.match(a.html, /<span class="pm-code-titre" data-texte="code:formule:titre">Ventes\.xlsx<\/span>/);
});

test('code : un jeton commun glisse, un jeton retiré s\'efface, un nouveau apparaît', () => {
  const r = C.pistes([{ code: '=SOMME(B2:B13)' }, { code: '=MOYENNE(B2:B13)' }, { code: '=MOYENNE(B2:B13)*2' }], 'tableur');
  const de = (t) => r.pistes.find((p) => p.t === t);
  // « = », « ( », « B2:B13 », « ) » : communs, suivis d'une étape à l'autre ; la plage glisse de la colonne 7 à 9.
  assert.deepEqual(de('B2:B13').p, [[7, 0], [9, 0], [9, 0]]);
  assert.deepEqual(de('SOMME').p, [[1, 0], null, null]);
  assert.deepEqual(de('MOYENNE').p, [null, [1, 0], [1, 0]]);
  assert.deepEqual(de('2').p, [null, null, [17, 0]]);
  assert.equal(r.pistes.filter((p) => p.t === '=').length, 1);
  assert.deepEqual(r.lignes, [1, 1, 1]);
  assert.equal(r.largeur, 18);
  // État au temps t : passage en 0,8 s ; retirés sur la première moitié, nouveaux sur la seconde.
  const e = (t) => C.etat([0, 2, 5], t, 0.8);
  assert.deepEqual([e(1).vers, e(1).p], [0, 1]);
  assert.equal(e(2.2).vers, 1);
  assert.ok(e(2.2).retires > 0 && e(2.2).retires < 1 && e(2.2).ajoutes === 0);
  assert.ok(e(2.4).retires === 0 && e(2.4).ajoutes === 0 && e(2.4).p > 0.4 && e(2.4).p < 0.6);
  assert.ok(e(2.6).ajoutes > 0 && e(2.6).ajoutes < 1);
  assert.deepEqual([e(2.8).p, e(2.8).ajoutes, e(2.8).retires], [1, 1, 0]);
  assert.equal(e(6).de, 1);
  // Validation : code-invalide.
  const v = C.valider({ langage: 'cobol', etapes: [{ code: 'x' }, { code: 'y' }, { code: 'z', debut: 3, surligner: [4] }] });
  assert.ok(v.some((m) => /langage « cobol » inconnu/.test(m)) && v.some((m) => /l'étape n° 2 : « debut » manque/.test(m)) && v.some((m) => /« surligner » doit être une liste de numéros de ligne, de 1 à 1/.test(m)), v.join('\n'));
  const a = assembler1([{ id: 's', html: '<figure data-code="f" data-start="0.5"></figure>', code: { f: { etapes: [] } } }]);
  assert.ok(a.erreurs.some((x) => x.regle === 'code-invalide' && /« etapes » est vide/.test(x.message)));
});

test('code : la police à chasse fixe n\'est embarquée que si la vidéo a du code', () => {
  const sans = assembler1([{ id: 's', html: '<h2 data-texte="titre"></h2>', textes: { titre: 'Titre' } }]);
  const avec = assembler1([{ id: 's', html: '<figure data-code="formule" data-start="0.5"></figure>', code: { formule: FORMULE } }]);
  const face = /@font-face \{ font-family: 'JetBrains Mono'; src: url\("data:font\/woff2;base64,/;
  assert.doesNotMatch(sans.html, face);
  assert.match(avec.html, face);
  assert.doesNotMatch(avec.html, /font-family: 'Libertinus Math'/);
  assert.ok(avec.detailPolices.some((p) => p.famille === 'JetBrains Mono' && p.roles.includes('code')));
  assert.ok(avec.html.length - sans.html.length < 400000, `${avec.html.length - sans.html.length} o de plus`);
  // Crédits : la police du code, avec sa licence.
  const { credits } = require('../scripts/lib/livrables.js');
  const dir = miniProjet({ scenes: [{ id: 's', html: '<figure data-code="formule" data-start="0.5"></figure>', code: { formule: FORMULE } }] });
  const { deroule } = lireDeroule(dir);
  assert.match(credits({ projet: dir, deroule, assemblage: assembler({ dossier: dir, ecrire: false }) }).texte, /- JetBrains Mono \(code\) : SIL Open Font License 1\.1/);
});

// --- 5.10 Formules ---------------------------------------------------------------------------------------------------------

test('formule : \\frac{a}{b} devient une fraction MathML', () => {
  assert.equal(F.convertir('\\frac{a}{b}').mathml, '<math display="inline" alttext="\\frac{a}{b}"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>');
  assert.equal(F.convertir('\\pi r^2').mathml, '<math display="inline" alttext="\\pi r^2"><mrow><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup></mrow></math>');
  const interets = F.convertir('C_n = C_0 \\times (1 + 3,5\\%)^{n}');
  assert.deepEqual(interets.erreurs, []);
  assert.match(interets.mathml, /<msub><mi>C<\/mi><mi>n<\/mi><\/msub><mo>=<\/mo><msub><mi>C<\/mi><mn>0<\/mn><\/msub><mo>×<\/mo><mo>\(<\/mo><mn>1<\/mn><mo>\+<\/mo><mn>3,5<\/mn><mo>%<\/mo><msup><mo>\)<\/mo><mi>n<\/mi><\/msup>/);
  for (const [tex, motif] of [['\\sqrt[3]{x}', /<mroot><mi>x<\/mi><mn>3<\/mn><\/mroot>/], ['\\sum_{i=1}^{n} i', /<munderover><mo largeop="true">∑<\/mo><mrow><mi>i<\/mi><mo>=<\/mo><mn>1<\/mn><\/mrow><mi>n<\/mi><\/munderover>/],
    ['\\int_0^1 x', /<msubsup><mo largeop="true">∫<\/mo><mn>0<\/mn><mn>1<\/mn><\/msubsup>/], ['\\lim_{x \\to \\infty}', /<munder><mo movablelimits="true">lim<\/mo><mrow><mi>x<\/mi><mo>→<\/mo><mo>∞<\/mo><\/mrow><\/munder>/],
    ['\\left( a \\right)', /<mo stretchy="true">\(<\/mo><mi>a<\/mi><mo stretchy="true">\)<\/mo>/], ['\\text{par an}', /<mtext>par an<\/mtext>/], ['\\vec{u} \\cdot \\overline{x}', /<mover><mi>u<\/mi><mo>→<\/mo><\/mover><mo>·<\/mo><mover><mi>x<\/mi><mo>‾<\/mo><\/mover>/],
    ['a \\leq b \\neq c \\approx d \\pm e \\div f', /<mo>≤<\/mo><mi>b<\/mi><mo>≠<\/mo><mi>c<\/mi><mo>≈<\/mo><mi>d<\/mi><mo>±<\/mo><mi>e<\/mi><mo>÷<\/mo>/], ['x - 3.5', /<mo>−<\/mo><mn>3,5<\/mn>/]]) {
    const r = F.convertir(tex);
    assert.deepEqual(r.erreurs, [], tex);
    assert.match(r.mathml, motif, tex);
  }
  // Dans la page : le MathML dans l'élément, jugé comme un texte.
  const a = assembler1([{ id: 's', html: '<p><span data-formule="aire" class="pm-m-pop" data-start="1"></span></p>', formules: { aire: '\\pi r^2' } }]);
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  assert.match(a.html, /<span data-formule="aire" class="pm-m-pop pm-formule" data-start="1" data-texte="formule:aire"><math display="inline" alttext="\\pi r\^2">/);
  assert.ok(!a.groupes.includes('dessin'), 'une formule n\'a pas besoin du calque');
});

test('formule : commande inconnue → formule-non-prise-en-charge en français', () => {
  const r = F.convertir('\\fracc{a}{b}');
  assert.match(r.erreurs[0], /^la commande « \\fracc » n'est pas prise en charge ; vouliez-vous dire « \\frac »/);
  assert.match(F.convertir('\\begin{matrix}').erreurs[0], /« \\begin » n'est pas prise en charge ; pour un mot, écrire \\text\{…\}/);
  assert.match(F.convertir('\\frac{a}{b').erreurs.join(' '), /accolade « \{ » non fermée/);
  assert.match(F.convertir('a @ b').erreurs[0], /le signe « @ » n'est pas pris en charge/);
  const a = assembler1([{ id: 's', html: '<span data-formule="f" data-start="1"></span>', formules: { f: '\\sqr{2}' } }]);
  const e = a.erreurs.find((x) => x.regle === 'formule-non-prise-en-charge');
  assert.equal(e.gravite, 'erreur');
  assert.match(e.message, /^Scène « s », formule « f » : la commande « \\sqr » n'est pas prise en charge ; vouliez-vous dire « \\sqrt »[^.]*\?$/);
});

test('formule : la police mathématique n\'est embarquée que si la vidéo a une formule', () => {
  const sans = assembler1([{ id: 's', html: '<figure data-code="formule" data-start="0.5"></figure>', code: { formule: FORMULE } }]);
  const avec = assembler1([{ id: 's', html: '<span data-formule="aire" data-start="1"></span>', formules: { aire: '\\pi r^2' } }]);
  const face = /@font-face \{ font-family: 'Libertinus Math'; src: url\("data:font\/woff2;base64,/;
  assert.doesNotMatch(sans.html, face);
  assert.match(avec.html, face);
  assert.doesNotMatch(avec.html, /font-family: 'JetBrains Mono'; src/);
  assert.ok(avec.detailPolices.some((p) => p.famille === 'Libertinus Math' && p.roles.includes('formules')));
  // Choix sur le poids (spec 5.10) : Libertinus Math, plus légère que STIX Two Math (403 344 o).
  assert.ok(fs.statSync(path.join(RACINE, 'vendor', 'polices', 'LibertinusMath-Regular.woff2')).size < 403344);
  assert.match(lire('vendor', 'polices', 'LICENCES.md'), /## Libertinus Math\n[\s\S]*- Licence : SIL Open Font License 1\.1/);
});

// --- 5.7 Moyeu et mises en page --------------------------------------------------------------------------------------------

test('moyeu : présent dans les styles livrés, passe la vérification des styles', () => {
  assert.equal(STYLES.length, 13, 'six essentiels, la vague A et la vague B');
  assert.deepEqual(TYPES.moyeu, ['titre', 'centre', 'partie1', 'partie2', 'partie3', 'partie4', 'partie5']);
  assert.deepEqual(OPTIONNELLES.moyeu, ['partie4', 'partie5']);
  assert.deepEqual(TYPES_RECENTS, ['moyeu']);
  for (const s of STYLES) {
    const v = verifierStyle(path.join(RACINE, 'styles', s));
    assert.equal(v.ok, true, `${s} : ${v.erreurs.join(' ')}`);
    const html = lire('styles', s, 'scenes', 'moyeu.html');
    assert.equal((html.match(/data-fleche="#centre → #partie\d"/g) || []).length, 5, s);
    assert.match(lire('references', 'styles', `${s}.md`), /\| `moyeu` \|/);
    const r = spawnSync(process.execPath, [PM, 'scene', s, 'moyeu'], { encoding: 'utf8' });
    assert.equal(r.status, 0, s);
  }
  // Un style personnel d'avant le moyeu reste valide (un avertissement).
  const perso = dossierTemporaire('pm-perso-moyeu-');
  const copie = path.join(perso, 'ancien');
  fs.cpSync(path.join(RACINE, 'styles', 'minimal'), copie, { recursive: true });
  fs.rmSync(path.join(copie, 'scenes', 'moyeu.html'));
  const cat = JSON.parse(fs.readFileSync(path.join(copie, 'catalogue.json'), 'utf8'));
  cat.style = 'ancien';
  cat.scenes = cat.scenes.filter((x) => x.nom !== 'moyeu');
  fs.writeFileSync(path.join(copie, 'catalogue.json'), JSON.stringify(cat));
  const v = verifierStyle(copie, { livre: false });
  assert.ok(!v.erreurs.some((e) => /moyeu/.test(e)), v.erreurs.join(' '));
  assert.ok(v.avertissements.some((e) => /« moyeu » absente/.test(e)));
  assert.ok(verifierStyle(copie, { livre: true }).erreurs.some((e) => /scène « moyeu » absente/.test(e)));
  // Parties facultatives : la partie retirée part avec sa flèche.
  const h = A.adapterScene(lire('styles', 'clair-pedagogique', 'scenes', 'moyeu.html'), { type: 'moyeu', id: 'hub', duree: 10, textes: { titre: 't', centre: 'c', partie1: '1', partie2: '2', partie3: '3' } });
  assert.doesNotMatch(h.replace(/<!--[\s\S]*?-->/, ''), /partie4|partie5/);
  assert.equal((h.match(/data-fleche=/g) || []).length, 3);
  assert.equal(A.choisirType({ textes: { titre: 'x', centre: 'c', partie1: '1', partie2: '2', partie3: '3' } }), 'moyeu');
});

test('schema : les flèches visent les boîtes dans les styles livrés (sans navigateur)', () => {
  for (const s of STYLES) {
    const html = lire('styles', s, 'scenes', 'schema.html').replace(/^<!--[\s\S]*?-->\s*/, '');
    assert.doesNotMatch(html, /<svg/, `${s} : plus de flèche dessinée à la place supposée des boîtes`);
    assert.deepEqual([...html.matchAll(/data-fleche="([^"]+)"/g)].map((m) => m[1]), ['#a → #b', '#b → #c'], s);
    const dir = miniProjet({ style: s, scenes: [{ id: 'schema', html, duree: 8, textes: { titre: 'Le trajet', a: 'Devis', b: 'Facture', c: 'Paiement' } }] });
    const a = assembler({ dossier: dir, ecrire: false });
    assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), [], s);
    assert.ok(a.groupes.includes('dessin'), s);
  }
});

// --- S6 5.13 : cartes « graphique » et « organigramme » ----------------------------------------------------------------

test('blocs : carte-graphique et carte-organigramme sont livrées avec S7 J2, avec leur dessin (graphique, flèches)', () => {
  const g = lire('moteur', 'blocs', 'carte-graphique.html');
  const o = lire('moteur', 'blocs', 'carte-organigramme.html');
  assert.match(g, /<figure class="pm-bloc-graphique" data-graphique="graphique" data-start="[\d.]+"><\/figure>/);
  assert.equal((o.match(/data-fleche="#org-chef → #org-equipe\d"/g) || []).length, 3);
  const textes = { titre: 'Ventes du trimestre', chiffre: '+12 %', chef: 'Direction', equipe1: 'Ventes', equipe2: 'Achats', equipe3: 'Logistique' };
  const a = assembler1([
    { id: 'g', html: g, textes, graphiques: { graphique: { type: 'barres', valeurs: [{ etiquette: 'Janv.', valeur: 4 }, { etiquette: 'Févr.', valeur: 7 }] } } },
    { id: 'o', html: o, textes }]);
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  assert.ok(a.groupes.includes('dessin') && a.groupes.includes('tronc'));
  assert.match(a.cssPage, /\.pm-bloc-carte-graphique/);
  const liste = JSON.parse(spawnSync(process.execPath, [PM, 'bloc'], { encoding: 'utf8' }).stdout).blocs;
  assert.ok(liste.includes('carte-graphique') && liste.includes('carte-organigramme'));
  assert.match(lire('references', 'ecran.md'), /\| `carte-graphique` \|[^\n]*data-graphique/);
});

// --- Moteur à la carte, dictionnaire, référence, consignes, notices ---------------------------------------------------------

test('donnees : moteur à la carte (graphiques et code dans le groupe dessin), page sans données inchangée', () => {
  for (const m of ['dessin/graphiques.js', 'dessin/code.js', 'dessin/composants.js']) {
    assert.ok(GM.GROUPES.dessin.includes(m) && GM.MODULES.includes(m) && fs.existsSync(path.join(RACINE, 'moteur', m)), m);
    assert.equal(Object.values(GM.GROUPES).filter((g) => g.includes(m)).length, 1, m);
  }
  assert.ok(GM.groupesDuDeroule({}, ['<section><figure data-graphique="v"></figure></section>']).includes('dessin'));
  assert.ok(GM.groupesDuDeroule({}, ['<section><figure data-code="v"></figure></section>']).includes('dessin'));
  assert.ok(!GM.groupesDuDeroule({}, ['<section><span data-formule="v"></span></section>']).includes('dessin'));
  const sans = assembler1([{ id: 's', html: '<h2 data-texte="titre" data-start="0.2"></h2>', textes: { titre: 'Titre' } }]);
  assert.doesNotMatch(sans.html, /pm-code-|pm-graphique|Libertinus|M\.graphiques|M\.code\b/);
  // Interdits de l'export rapide.
  for (const f of [['moteur', 'dessin', 'composants.js'], ['moteur', 'dessin', 'dessin.css'], ['scripts', 'lib', 'donnees-scene.js']]) {
    assert.doesNotMatch(lire(...f).replace(/\/\*[\s\S]*?\*\//g, ''), /filter:\s*url|mix-blend-mode|backdrop-filter/, f.join('/'));
  }
  // Aucune dépendance : modules purs chargés par Node, sans require hors du plugin.
  for (const f of ['graphiques.js', 'code.js']) assert.doesNotMatch(lire('moteur', 'dessin', f), /require\(/, f);
  assert.deepEqual(JSON.parse(lire('package.json')).dependencies || {}, {});
});

test('dictionnaire : quatre entrées nouvelles (barres, courbe, anneau, code), les anciens numéros inchangés', () => {
  const dico = JSON.parse(lire('references', 'mouvements', 'mouvements.json'));
  const numeros = JSON.parse(lire('references', 'mouvements', 'numeros.json'));
  const slugs = ['barres-poussent', 'courbe-trace', 'anneau-remplit', 'code-transforme'];
  const nouvelles = dico.mouvements.filter((e) => slugs.includes(e.slug));
  assert.deepEqual(nouvelles.map((e) => e.slug), slugs);
  const premier = Number(nouvelles[0].no);
  assert.ok(premier >= 122, `#${premier}`);
  nouvelles.forEach((e, i) => { assert.equal(Number(e.no), premier + i); assert.equal(numeros[e.no], e.slug); assert.ok(e.recette.donnees, e.slug); });
  assert.equal(numeros['114'], 'fleche-relie');
  assert.equal(numeros['021'], 'compteur');
  assert.deepEqual(nouvelles.find((e) => e.slug === 'code-transforme').nom, { fr: 'Code qui se transforme', metier: 'Code morph' });
  // Leur démonstration (galerie, page de choix) porte les données dans le déroulé.
  const { projetDeMouvements } = require('../scripts/lib/choisir-mouvements.js');
  const dir = dossierTemporaire('pm-demos-donnees-');
  projetDeMouvements(dir, nouvelles);
  const a = assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
});

test('référence : chaque exemple de graphique, de code et de formule passe le contrôle ; attributs et réglages cités existent', () => {
  const r = spawnSync(process.execPath, [PM, 'reference', 'explication'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  const t = r.stdout;
  for (const s of ['## Graphiques de données', '## Code qui se transforme', '## Formules', '## Cinq squelettes']) assert.ok(t.includes(s), s);
  // Les blocs json suivis d'un bloc html : données de la scène, puis la scène.
  const blocs = [...t.matchAll(/```json\n([\s\S]*?)```\s*\n+```html\n([\s\S]*?)```/g)].map((m) => ({ donnees: JSON.parse(`{${m[1]}}`), html: m[2] }));
  assert.equal(blocs.length, 3);
  const scenes = blocs.map((b, i) => ({ id: `d${i}`, html: b.html.replace(/mot:[a-zé0-9]+/g, '1'), textes: { legende: 'L\'aire du disque' }, ...JSON.parse(JSON.stringify(b.donnees).replace(/mot:[a-zé0-9]+/g, '1.5')) }));
  for (const s of scenes) for (const g of Object.values(s.graphiques || {})) for (const v of g.valeurs) if (v.debut === '1.5') v.debut = 1.5;
  for (const s of scenes) for (const c of Object.values(s.code || {})) for (const e of c.etapes) if (e.debut === '1.5') e.debut = 1.5;
  const dir = miniProjet({ scenes });
  const a = assembler({ dossier: dir, ecrire: false });
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const { deroule } = lireDeroule(dir);
  for (const sc of deroule.scenes) {
    const p = controlerScene({ projet: dir, deroule, scene: sc, html: fs.readFileSync(path.join(dir, sc.fichier), 'utf8') });
    assert.deepEqual(p.filter((x) => x.gravite === 'erreur'), [], sc.id);
  }
  const code = [lire('moteur', 'dessin', 'calque.js'), lire('moteur', 'dessin', 'composants.js'), lire('moteur', 'releve.js'), lire('scripts', 'lib', 'dessin.js'),
    lire('scripts', 'lib', 'donnees-scene.js'), lire('moteur', 'dessin', 'dessin.css')].join('\n');
  for (const x of ['data-graphique', 'data-code', 'data-formule', 'data-code-entree', '--pm-code-taille', '--pm-fleche-courbe']) assert.ok(code.includes(x), x);
  for (const f of ['barres', 'courbe', 'secteurs']) { assert.match(t, new RegExp(`d\\.${f}\\(`)); assert.match(code, new RegExp(`d\\.${f} = libre`)); }
  for (const n of ['#122', '#124', '#125']) assert.ok(t.includes(n), n);
  for (const regle of ['graphique-donnees-invalides', 'formule-non-prise-en-charge', 'code-trop-large', 'donnees-manquantes']) {
    assert.ok(t.includes(regle) || lire('references', 'controles.md').includes(`| \`${regle}\` |`), regle);
  }
  for (const p of ['« fais un graphique avec ces chiffres »', '« la barre 2024 quand je dis 2024 »']) assert.ok(t.includes(p), p);
});

test('consignes : animateur, creer et retoucher renvoient à explication pour un graphique, du code ou une formule ; plafonds tenus ; aucune commande montrée', () => {
  const a = lire('agents', 'animateur.md');
  assert.ok(Buffer.byteLength(a) <= 6000, `${Buffer.byteLength(a)} o`);
  assert.ok(a.split('\n').some((l) => /un graphique, du code, une formule \(`explication`\)/.test(l)));
  const r = lire('skills', 'retoucher', 'SKILL.md');
  assert.ok(Buffer.byteLength(r) <= 13850, `${Buffer.byteLength(r)} o`);
  assert.match(r, /flèche, annotation, graphique, code, formule : `pulse-motion reference explication`/);
  const c = lire('skills', 'creer', 'SKILL.md');
  assert.ok(Buffer.byteLength(c) <= 23400, `${Buffer.byteLength(c)} o`);
  assert.match(c, /`schema`, `moyeu` ou `conclusion`/);
  assert.match(c, /`pulse-motion reference demandes` \(graphique, code, formule aussi\)/);
  assert.ok(Buffer.byteLength(lire('references', 'moteur.md')) <= 12000);
  const d = lire('references', 'demandes.md');
  assert.match(d, /## Graphiques, code et formules\n\n[^\n]*`graphiques`, `code`, `formules`[^\n]*jamais inventés/);
  // Phrases pour la personne : aucune commande.
  assert.doesNotMatch(d.slice(d.indexOf('## Graphiques, code et formules'), d.indexOf('## Personnages')), /pulse-motion (?!reference)/);
});

test('notices : explainroo (graphiques, code), lemo (dataviz) et polices OFL, identiques à la racine et dans le plugin', () => {
  const racine = fs.readFileSync(path.join(DEPOT, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  assert.equal(racine, lire('THIRD-PARTY-NOTICES.md'));
  const explainroo = racine.slice(racine.indexOf('## explainroo'), racine.indexOf('\n## ', racine.indexOf('## explainroo') + 5));
  for (const m of [/`bars`, `lineChart`, `pie` et `number`/, /`engine\/code\.js`/, /`src\/math\.js` \(MathJax écarté\)/, /moteur\/dessin\/graphiques\.js/]) assert.match(explainroo, m);
  assert.match(racine, /`styles\/dataviz\/STYLE\.md`/);
  assert.match(racine, /## JetBrains Mono et Libertinus Math\n[\s\S]*SIL Open Font License 1\.1/);
  assert.match(lire('vendor', 'polices', 'PROVENANCE.md'), /Aucune n'est lue sur internet/);
});
