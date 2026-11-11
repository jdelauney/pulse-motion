'use strict';
/* Spec « huashu réécrit » (S10), plan S10-A : les onze références de réalisation déplacées dans references/, leurs
 * garde-fous (§ 5.14), les critères de chaque référence (§ 5.1 à 5.12) et leurs branchements (§ 5.13).
 * Les évaluations de comportement (« creer_demande_floue… », « retoucher_note_ma_video… », « creer_produit_nomme… »,
 * « animateur_ne_redessine_pas… ») appartiennent au jeu d'évaluations de S2 (plan S2-8) ; les critères des réglages
 * rapides, au plan R3 de S4 (tests/reglages-rapides.test.js), qui déplace aussi la douzième référence. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { lireReference, sectionReference } = require('./aide/references.js');
const { dossierTemporaire } = require('./aide/temporaire.js');
const { trouverNavigateur } = require('./aide/navigateur.js');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8');
const S10 = ['directions', 'revue', 'anti-cliches', 'mixage-fin', 'compositions', 'actifs-marque', 'cadres-pointeur', 'sorties',
  'scenes-temoins', 'recettes-rythme', 'pieges', 'reglages-rapides'];

/** Termes interdits de la spec S10 (§ 7, étape 2) : noms de studios, de marques d'appareils, fichiers, couleurs et jargon
 *  de la source. La liste peut grandir, jamais rétrécir. */
const TERMES_INTERDITS = /huashu|alchain|pentagram|stamen|fathom|locomotive|active theory|field\.io|resn|jetset|brockmann|sagmeister|lieberman|raven kwok|ash thorp|territory studio|takram|kenya hara|irma boom|neo shen|iphone|ipad|pixel 8|android|macos|apple|anthropic|claude design|dynamic island|îlot|slop|tweak|junior|keep|quick win|hero|showcase|cinematic|deck|boum|5-10-2-8|#f5f5f7|#d97757|#e63946|#d4a574|#1783ff|wechat|xiaohongshu|elevenlabs|feturbulence|expoout|editmode|brand-spec|product-facts/i;

/** Sections de niveau 2 d'une référence : [{ titre, texte }]. */
function sections(texte) {
  const r = [];
  for (const bloc of texte.split(/\n(?=## )/)) {
    const m = /^## (.+)\n/.exec(bloc);
    if (m) r.push({ titre: m[1], texte: bloc });
  }
  return r;
}

/** Tableaux Markdown d'un texte : [{ entetes: [..], lignes: [[..]] }]. */
function tableaux(texte) {
  const r = [];
  const lignes = texte.split('\n');
  for (let i = 0; i < lignes.length; i++) {
    if (!/^\s*\|/.test(lignes[i]) || !/^\s*\|[-| :]+\|\s*$/.test(lignes[i + 1] || '')) continue;
    const cellules = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const t = { entetes: cellules(lignes[i]), lignes: [] };
    let j = i + 2;
    while (j < lignes.length && /^\s*\|/.test(lignes[j])) t.lignes.push(cellules(lignes[j++]));
    r.push(t);
    i = j;
  }
  return r;
}

/** Hors de la section « À venir » (qui décrit ce qui n'est pas livré). */
const sansAVenir = (texte) => texte.slice(0, texte.indexOf('\n## À venir'));
const aVenir = (texte) => texte.slice(texte.indexOf('\n## À venir'));

const NUMEROS = new Set(JSON.parse(lire('references', 'mouvements', 'mouvements.json')).mouvements.map((m) => `#${m.no}`));
const CLASSES = new Set(lire('moteur', 'mouvements.css').match(/\.pm-m-[a-z0-9-]+/g).map((c) => c.slice(1)));
const SONS = new Set([.../var SONS = \{([\s\S]*?)\n {2}\};/.exec(lire('moteur', 'synthe', 'bruitages.js'))[1].matchAll(/^ {4}([a-z-]+|'[a-z-]+'): function/gm)].map((m) => m[1].replace(/'/g, '')));
const STYLES = fs.readdirSync(path.join(RACINE, 'styles'));

// --- § 5.14 Garde-fous automatiques -------------------------------------------------------------------------------

test('references_s10_essentiel_puis_a_venir : titre, « L\'essentiel » en tête, « À venir » en dernier, aucune spec dans l\'essentiel', () => {
  for (const nom of S10) {
    const t = lire('references', `${nom}.md`);
    assert.doesNotMatch(t, /^<!--/, `${nom} : en-tête de brouillon retiré`);
    assert.match(t, /^# .+\n\n## L'essentiel\n/, `${nom} : titre puis « L'essentiel »`);
    const titres = sections(t).map((s) => s.titre);
    assert.equal(titres[titres.length - 1], 'À venir', `${nom} : « À venir » en dernier`);
    assert.equal(titres.filter((x) => x === 'À venir').length, 1, nom);
    const essentiel = sections(t)[0].texte;
    assert.doesNotMatch(essentiel, /\(spec S/, `${nom} : « L'essentiel » ne décrit que ce qui existe`);
    // Chaque ligne « À venir » nomme la spec ou le chantier qui la livrera.
    for (const ligne of aVenir(t).split('\n').filter((l) => l.startsWith('- '))) {
      assert.match(ligne, /spec S[1-9]\b|chantier [A-I]\b/, `${nom} : « ${ligne.slice(0, 80)} » ne cite pas sa spec`);
    }
    for (const m of aVenir(t).matchAll(/spec (S\d+)/g)) assert.match(m[1], /^S[1-9]$/, `${nom} : ${m[1]}`);
  }
  // reglages-rapides est déplacé avec le panneau (plan R3 de S4, avec S10-B) : les douze références sont là.
  assert.equal(S10.length, 12);
});

test('references_s10_mouvements_classes_sons_existent : numéros, classes pm-m-* et sons cités existent (hors « À venir »)', () => {
  let numeros = 0;
  for (const nom of S10) {
    const t = lire('references', `${nom}.md`);
    for (const m of t.matchAll(/#(\d{3})\b/g)) {
      numeros++;
      assert.ok(NUMEROS.has(`#${m[1]}`), `${nom} : #${m[1]} absent du dictionnaire`);
    }
    for (const m of t.matchAll(/\bpm-m-[a-z0-9-]+/g)) assert.ok(CLASSES.has(m[0]), `${nom} : classe ${m[0]} absente de mouvements.css`);
    for (const m of sansAVenir(t).matchAll(/data-son="([a-z-]+)"/g)) assert.ok(SONS.has(m[1]), `${nom} : son « ${m[1]} » absent`);
  }
  assert.ok(numeros > 30, 'des numéros sont cités');
  assert.ok(SONS.size === 13, `${SONS.size} sons (les douze de S10 et crissement, S7 J4)`);
});

test('references_s10_et_realisation_sans_termes_interdits : aucun terme de la source dans les références (et la doctrine de S2)', () => {
  const fichiers = [...S10, 'realisation'].filter((n) => fs.existsSync(path.join(RACINE, 'references', `${n}.md`)));
  assert.ok(fichiers.length >= S10.length);
  for (const nom of fichiers) {
    lire('references', `${nom}.md`).split('\n').forEach((l, i) => assert.doesNotMatch(l, TERMES_INTERDITS, `${nom}.md:${i + 1}`));
  }
});

// --- § 5.1 Directions --------------------------------------------------------------------------------------------

const directions = () => tableaux(sectionReference('directions', 'Douze directions nommées'))[0];

test('directions_douze_entrees_six_reglages_chacune : 12 directions en 4 familles, chacune avec ses six réglages', () => {
  const t = directions();
  assert.equal(t.lignes.length, 12);
  for (const r of ['Vide', 'Couleurs', 'Titres ÷ texte', 'Mouvement', 'Matière']) assert.ok(t.entetes.includes(r), r);
  // La densité se déduit du vide et de la famille ; les cinq colonnes chiffrées et la matière sont remplies partout.
  const i = (h) => t.entetes.indexOf(h);
  const familles = new Map();
  for (const l of t.lignes) {
    for (const h of ['Vide', 'Couleurs', 'Titres ÷ texte', 'Mouvement', 'Matière', 'Départ', 'Mouvements']) assert.ok(l[i(h)] && l[i(h)] !== '—', `${l[1]} : ${h}`);
    assert.match(l[i('Vide')], /^\d+ %$/, l[1]);
    familles.set(l[0], (familles.get(l[0]) || 0) + 1);
  }
  assert.deepEqual([...familles.entries()], [['Rigueur', 3], ['Calme', 3], ['Énergie', 3], ['Récit', 3]]);
  assert.equal(tableaux(sectionReference('directions', 'Les six réglages d\'une direction'))[0].lignes.length, 6);
  assert.match(lire('references', 'directions.md'), /trois réglages au moins s'écartent/);
});

test('directions_styles_de_depart_existent : chaque style de départ est un style livré', () => {
  const t = directions();
  for (const l of t.lignes) {
    const style = /`([a-z-]+)`/.exec(l[t.entetes.indexOf('Départ')])[1];
    assert.ok(STYLES.includes(style), `${l[1]} : ${style}`);
  }
  // La procédure s'appuie sur la recommandation par genre et son style de contraste.
  const reco = JSON.parse(lire('references', 'styles', 'recommandation.json'));
  for (const g of Object.values(reco)) assert.ok(STYLES.includes(g.contraste));
  assert.match(lire('references', 'directions.md'), /champ `contraste`/);
});

test('directions_numeros_cites_existent : trois numéros du dictionnaire par direction, tous existants', () => {
  const t = directions();
  for (const l of t.lignes) {
    const n = [...l[t.entetes.indexOf('Mouvements')].matchAll(/#\d{3}/g)].map((m) => m[0]);
    assert.equal(n.length, 3, l[1]);
    for (const x of n) assert.ok(NUMEROS.has(x), `${l[1]} : ${x}`);
  }
});

test('directions_aucun_nom_de_studio : des traits, jamais une signature', () => {
  const t = lire('references', 'directions.md');
  assert.doesNotMatch(t, TERMES_INTERDITS);
  assert.match(t, /ne jamais nommer un studio, un graphiste ou un artiste vivant/);
  // Les noms des directions sont des mots du français courant (aucune majuscule hors de l'initiale).
  for (const l of directions().lignes) assert.match(l[1], /^\*\*[A-ZÉ][a-zàâçéèêëîïôûùüÿœ ]+\*\* : /, l[1]);
});

// --- § 5.2 Revue -------------------------------------------------------------------------------------------------

test('revue_cinq_axes_ancrages_4_7_9 : cinq axes, ancrés à 4, 7 et 9', () => {
  const t = tableaux(sectionReference('revue', 'Les cinq axes'))[0];
  assert.deepEqual(t.entetes, ['Axe', 'La question', '4 / 10', '7 / 10', '9 / 10']);
  assert.deepEqual(t.lignes.map((l) => l[0]), ['**Message**', '**Lisibilité**', '**Rythme**', '**Cohérence**', '**Singularité**']);
  for (const l of t.lignes) for (const c of l.slice(1)) assert.ok(c.length > 10, `${l[0]} : ancrage vide`);
  const r = lire('references', 'revue.md');
  assert.match(r, /On ne retouche pas un axe noté 9 ou plus/);
  assert.match(r, /Un seul tour de corrections/);
});

test('revue_retouches_rapides_dans_categories_retoucher : trois retouches en une phrase, chacune d\'une catégorie de retoucher', () => {
  const r = lire('references', 'revue.md');
  const exemple = /Trois retouches rapides :\n((?:\d\. .+\n){3})/.exec(r);
  assert.ok(exemple, 'trois retouches dans le modèle de rapport');
  const categories = /correspond à une catégorie de `\/pulse-motion:retoucher` \(([^)]+)\)/.exec(r)[1].split(/, /);
  const table = lire('skills', 'retoucher', 'SKILL.md');
  for (const c of categories) {
    const nom = { texte: 'Texte', rythme: 'Rythme, durée', 'mouvement nommé': 'Mouvement nommé', "visuel d'une scène": "Visuel d'une scène" }[c];
    assert.ok(nom, `catégorie « ${c} »`);
    assert.ok(table.includes(`| ${nom} |`), `catégorie « ${nom} » absente de retoucher`);
  }
  assert.match(r, /`AskUserQuestion` à choix multiple/);
});

test('retoucher_table_contient_categorie_revue : « note ma vidéo » a sa ligne, qui suit la référence revue', () => {
  const ligne = lire('skills', 'retoucher', 'SKILL.md').split('\n').find((l) => l.startsWith('| Revue |'));
  assert.ok(ligne, 'ligne « Revue »');
  assert.match(ligne, /« note ma vidéo »/);
  assert.match(ligne, /« qu'en penses-tu \? »/);
  assert.match(ligne, /`pulse-motion reference revue`/);
  assert.match(ligne, /trois retouches rapides/);
  assert.match(ligne, /un seul tour/);
});

// --- § 5.3 Anti-clichés ------------------------------------------------------------------------------------------

test('anti_cliches_chaque_motif_a_une_exception : 14 motifs, chacun avec pourquoi, quoi faire et une exception', () => {
  const t = tableaux(sectionReference('anti-cliches', 'Les motifs à éviter'))[0];
  assert.deepEqual(t.entetes, ['Motif', 'Pourquoi il gêne', 'À la place', 'Exception']);
  assert.equal(t.lignes.length, 14);
  for (const l of t.lignes) for (const c of l) assert.ok(c && c !== '—', `« ${l[0]} » : colonne vide`);
});

test('anti_cliches_aucune_police_interdite : aucune famille de police n\'est bannie, ni celles des styles livrés', () => {
  const t = lire('references', 'anti-cliches.md');
  assert.doesNotMatch(t, /polices? (interdite|bannie|à bannir|à proscrire)/i);
  const familles = new Set();
  for (const st of STYLES) for (const f of Object.values(JSON.parse(lire('styles', st, 'charte.json')).polices || {})) familles.add(f);
  assert.ok(familles.size >= 4);
  for (const f of familles) assert.ok(!t.includes(f), `police « ${f} » nommée`);
});

test('animateur_lit_anti_cliches : une scène témoin lit la référence (les autres scènes composées : la note « grammaire » ; décision de l’auteur, S10-5)', () => {
  assert.match(ligneAnimateur('anti-cliches'), /une scène témoin/);
  assert.doesNotMatch(ligneAnimateur('anti-cliches'), /composée/);
});

// --- § 5.4 Mixage fin --------------------------------------------------------------------------------------------

test('mixage_fin_sons_cites_existent_ou_a_venir : chaque son des tableaux existe ; les nouveaux sont dans « À venir »', () => {
  const t = sansAVenir(lire('references', 'mixage-fin.md'));
  let n = 0;
  for (const tab of tableaux(t)) {
    tab.entetes.forEach((h, k) => {
      if (!/^Sons?\b|^Son\b|^À éviter$/.test(h)) return;
      for (const l of tab.lignes) {
        for (const m of (l[k] || '').matchAll(/`([a-z-]+)`/g)) { n++; assert.ok(SONS.has(m[1]), `son « ${m[1]} » (${h})`); }
      }
    });
  }
  assert.ok(n >= 20, `${n} sons cités`);
  // Le décalage par son couvre tous les sons existants.
  const cale = tableaux(sectionReference('mixage-fin', 'Caler un son sur l\'instant visible'))[0];
  const cites = new Set(cale.lignes.flatMap((l) => [...l[0].matchAll(/`([a-z-]+)`/g)].map((m) => m[1])));
  for (const s of SONS) assert.ok(cites.has(s), `décalage du son « ${s} »`);
  assert.match(aVenir(lire('references', 'mixage-fin.md')), /Sons nouveaux/);
});

test('mixage_fin_repere_vide_porte_un_son : un <i> minuté avec data-son produit un son à son data-start', () => {
  const { extraireScene } = require('../scripts/lib/extraire.js');
  const { calculerMinutage } = require('../moteur/minutage.js');
  const bloc = /```html\n([\s\S]*?)```/.exec(sectionReference('mixage-fin', 'Caler un son sur l\'instant visible'))[1];
  const html = `<section data-scene="essai">\n${bloc}</section>`;
  const { elements } = extraireScene(html);
  const min = calculerMinutage([{ id: 'essai', duree: 4 }], { essai: elements });
  assert.deepEqual(min.erreurs, []);
  const son = elements.find((e) => e.son === 'whoosh');
  assert.ok(son, 'le repère vide porte le son');
  assert.ok(Math.abs(min.elements.essai[son.cle].debut - 1.15) < 1e-9, `départ ${min.elements.essai[son.cle].debut}`);
});

test('mixage_fin_densites_compatibles_trop_de_sons : aucune densité conseillée n\'atteint le seuil de « trop-de-sons »', () => {
  const t = tableaux(sectionReference('mixage-fin', 'Densité selon le caractère'))[0];
  const k = t.entetes.indexOf('Sons par 10 s');
  const maxi = Math.max(...t.lignes.map((l) => Math.max(...l[k].match(/\d+/g).map(Number))));
  assert.equal(maxi, 9);
  // trop-de-sons : plus de 3 sons dans la même seconde (scripts/controler.js) ; 9 sons par 10 s, répartis, en restent loin.
  assert.match(lire('scripts', 'controler.js'), /sonsJoues\[i \+ 3\]\.t - sonsJoues\[i\]\.t < 1/);
  assert.ok(maxi / 10 < 3);
  assert.match(lire('references', 'mixage-fin.md'), /jamais plus de 3 par seconde \(contrôle `trop-de-sons`\)/);
});

// --- § 5.5 Compositions et § 5.7 Cadres et pointeur : scènes d'essai ----------------------------------------------

/** PNG uni de 8 × 6 px (images d'essai fabriquées pour l'occasion). */
function png(r, g, b) {
  const zlib = require('node:zlib');
  const crc = (buf) => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const bloc = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(6, 4); ihdr[8] = 8; ihdr[9] = 2;
  const lignes = Buffer.concat(Array.from({ length: 6 }, () => Buffer.from([0, ...Array.from({ length: 8 }, () => [r, g, b]).flat()])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', zlib.deflateSync(lignes)), bloc('IEND', Buffer.alloc(0))]);
}

/** Projet d'essai d'une scène composée, dans le style clair-pedagogique. */
function projetEssai({ id, html, textes = {}, images = [], duree = 14 }) {
  const dir = dossierTemporaire(`pm-s10-${id}-`);
  fs.mkdirSync(path.join(dir, 'scenes'));
  fs.mkdirSync(path.join(dir, 'assets'));
  for (const [i, f] of images.entries()) fs.writeFileSync(path.join(dir, 'assets', f), png(40 + i * 8, 120, 200 - i * 6));
  fs.writeFileSync(path.join(dir, 'scenes', `01-${id}.html`), html);
  fs.writeFileSync(path.join(dir, 'deroule.json'), JSON.stringify({
    version: 1, titre: `Essai ${id}`, genre: 'produit', parcours: 'rapide', format: { ratio: '16:9', ips: 30 }, style: 'clair-pedagogique',
    scenes: [{ id, fichier: `scenes/01-${id}.html`, duree, intention: 'essai', textes }],
  }, null, 2));
  return dir;
}

/** Scène du mur de vignettes de la référence, complétée pour 24 visuels (délais et niveaux calculés d'avance). */
function sceneMur() {
  const bloc = /```html\n([\s\S]*?)```/.exec(sectionReference('compositions', '1. Mur de vignettes en onde, puis gros plans'))[1];
  const vignettes = [];
  for (let n = 0; n < 24; n++) {
    const rang = Math.floor(n / 6);
    const colonne = n % 6;
    const delai = Math.round((0.2 + (rang + colonne) * 0.06) * 100) / 100;
    vignettes.push(`      <img class="vignette" src="assets/r${String(n + 1).padStart(2, '0')}.png" alt="" data-start="${delai}" data-niveau="${(n * 7) % 3}">`);
  }
  return bloc
    .replace(/ {6}<img class="vignette" src="assets\/r01\.jpg"[\s\S]*?<!-- … une ligne par visuel[^>]*-->\n/, `${vignettes.join('\n')}\n`)
    .replace('assets/r08.jpg', 'assets/r08.png')
    .replace(/ {2}<!-- gros plans suivants[^>]*-->\n/, '');
}

test('compositions_scene_mur_assemble_et_controle_sans_erreur : la scène d\'exemple, avec 24 images, s\'assemble et passe le contrôle', async () => {
  const { assembler } = require('../scripts/assembler.js');
  const { controler } = require('../scripts/controler.js');
  const html = sceneMur();
  assert.equal((html.match(/class="vignette"/g) || []).length, 24);
  const dir = projetEssai({ id: 'realisations', html, images: Array.from({ length: 24 }, (_, i) => `r${String(i + 1).padStart(2, '0')}.png`) });
  const a = assembler({ dossier: dir, ecrire: false });
  assert.equal(a.ok, true, JSON.stringify(a.erreurs));
  assert.deepEqual(a.erreurs.filter((e) => e.gravite === 'erreur'), []);
  const c = controler({ dossier: dir, ecrire: false, corriger: false });
  assert.deepEqual(c.problemes.filter((p) => p.gravite === 'erreur'), [], JSON.stringify(c.problemes));
});

test('compositions_delais_onde_formule_documentee : la formule de l\'onde et des niveaux est écrite, alignée sur #092 de S3', () => {
  const t = lire('references', 'compositions.md');
  assert.match(t, /délai = 0,2 \+ \(rang \+ colonne\) × 0,06 s/);
  assert.match(t, /Arrondir à 0,01 s/);
  assert.match(t, /niveau = \(numéro de la vignette × 7\) modulo 3/);
  assert.match(t, /rotateX\(18deg\) rotateZ\(-6deg\)/);
  assert.match(t, /entrée de 0,5 s/);
  // Les délais de l'exemple suivent la formule.
  for (const m of sceneMur().matchAll(/data-start="([\d.]+)" data-niveau/g)) assert.ok(Number(m[1]) >= 0.2 && Number(m[1]) <= 0.2 + 8 * 0.06 + 1e-9);
});

test('compositions_signature_fin_pause_finale_respectee : la signature de fin finit sur une image stable d\'au moins 0,5 s', () => {
  const t = sectionReference('compositions', '3. Signature de fin');
  assert.match(t, /stable au moins 0,5 s, sans fondu au noir/);
  const tenue = tableaux(t)[0].lignes.find((l) => l[0] === 'Tenue');
  assert.ok(tenue, 'étape « Tenue »');
  assert.match(tenue[2], /≥ 0,5 s/);
  assert.match(tenue[1], /le décor de la dernière scène s'arrête 1 s avant la fin/);
  // Seuil du contrôle pause-finale.
  assert.equal(JSON.parse(lire('scripts', 'seuils.json')).pauseFinale, 0.5);
});

test('compositions_aucun_numero_nouveau : pas de numéro du dictionnaire attribué ici (la numérotation est à S3)', () => {
  const t = lire('references', 'compositions.md');
  for (const m of t.matchAll(/#(\d{3})\b/g)) assert.ok(NUMEROS.has(`#${m[1]}`), `#${m[1]}`);
  assert.match(aVenir(t), /numéros attribués par S3/);
});

// --- § 5.6 Actifs de marque --------------------------------------------------------------------------------------

test('actifs_marque_zone_reservee_texte_du_deroule : la zone réservée ne porte aucun texte en dur', () => {
  const t = sectionReference('actifs-marque', 'Zone réservée honnête');
  const bloc = /```html\n([\s\S]*?)```/.exec(t)[1];
  assert.match(bloc, /data-texte="reserve"/);
  assert.equal(bloc.replace(/<[^>]+>/g, '').trim(), '', 'aucun texte hors des balises');
  assert.match(t, /Le texte vient du déroulé \(`"reserve": "Photo du produit à fournir"`\)/);
});

// --- § 5.7 Cadres et pointeur ------------------------------------------------------------------------------------

/** Scène « démonstration » : le navigateur de la référence et le pointeur, avec son tremblement. */
function sceneDemo() {
  const t = lire('references', 'cadres-pointeur.md');
  const blocs = [...t.matchAll(/```html\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.equal(blocs.length, 2);
  return `<section data-scene="demo">\n<style>@scope { .navigateur { position: absolute; left: 10cqh; top: 8cqh; width: 120cqh; } .ecran { width: 100%; }`
    + ' .pointeur { position: absolute; left: 0; top: 0; height: 3.2cqh; fill: var(--c-texte); } }</style>\n'
    + `${blocs[0]}${blocs[1]}</section>\n`;
}

test('cadres_pointeur_aucun_nom_de_marque : cadres génériques, sans marque ni système nommé', () => {
  const t = lire('references', 'cadres-pointeur.md');
  assert.doesNotMatch(t, TERMES_INTERDITS);
  assert.doesNotMatch(t, /windows|samsung|google|microsoft|chrome|safari|firefox|edge\b/i);
  assert.match(t, /Quatre cadres \*\*génériques, sans marque\*\*/);
});

test('cadres_pointeur_scene_assemble_sans_erreur : la recette du pointeur dans un navigateur s\'assemble et passe le contrôle', async () => {
  const { assembler } = require('../scripts/assembler.js');
  const { controler } = require('../scripts/controler.js');
  const dir = projetEssai({ id: 'demo', html: sceneDemo(), textes: { onglet: 'Accueil', adresse: 'exemple.fr' }, images: ['capture-accueil.png'], duree: 4 });
  const a = assembler({ dossier: dir, ecrire: false });
  assert.equal(a.ok, true, JSON.stringify(a.erreurs));
  const c = controler({ dossier: dir, ecrire: false, corriger: false });
  assert.deepEqual(c.problemes.filter((p) => p.gravite === 'erreur'), [], JSON.stringify(c.problemes));
  assert.doesNotMatch(sceneDemo(), /Math\.random/);
});

const navigateur = trouverNavigateur();

test('cadres_pointeur_recette_deterministe : deux rendus du même instant donnent les mêmes pixels', { skip: !navigateur && 'Chrome ou Edge introuvable', timeout: 90000 }, async () => {
  const { assembler } = require('../scripts/assembler.js');
  const { ouvrirCapture } = require('../scripts/lib/capture-fidele.js');
  const dir = projetEssai({ id: 'demo', html: sceneDemo(), textes: { onglet: 'Accueil', adresse: 'exemple.fr' }, images: ['capture-accueil.png'], duree: 4 });
  const a = assembler({ dossier: dir, ecrire: false });
  const page = path.join(dir, 'page.html');
  fs.writeFileSync(page, a.html);
  const c = await ouvrirCapture({ fichierHtml: page, largeur: 640, hauteur: 360, navigateur });
  try {
    const premier = await c.capturer(1.6);
    await c.capturer(0.3);
    await c.capturer(2.5);
    const second = await c.capturer(1.6);
    assert.ok(premier.equals(second), 'même instant, mêmes pixels');
    // Le tremblement bouge bien le pointeur pendant le trajet (la recette fait quelque chose).
    const tx = await c.evaluer('M.seek(1.6).then(function () { return document.getElementById("pointeur").style.getPropertyValue("--tx"); })');
    assert.match(tx, /^-?\d+\.\d{3}cqh$/);
    assert.notEqual(tx, '0.000cqh');
  } finally { await c.fermer(); }
});

// --- § 5.8 Sorties -----------------------------------------------------------------------------------------------

test('sorties_chaque_reponse_a_venir_cite_une_spec : chaque « quand ce sera possible » nomme sa spec (ou rien)', () => {
  const t = tableaux(sectionReference('sorties', 'La personne dit… on fait…'))[0];
  assert.equal(t.lignes.length, 14);
  for (const l of t.lignes) assert.match(l[2], /^—$|^Idem$|spec S[1-9]\b/, `« ${l[0]} » : ${l[2]}`);
});

test('sorties_aucune_option_inexistante_dans_aujourd_hui : chaque option citée pour aujourd\'hui existe dans pulse-motion', () => {
  const pm = lire('scripts', 'pm.js');
  const t = tableaux(sectionReference('sorties', 'La personne dit… on fait…'))[0];
  const aujourdHui = [lire('references', 'sorties.md').split('\n## À venir')[0], ...t.lignes.map((l) => l[1])].join('\n');
  for (const m of aujourdHui.matchAll(/--[a-z][a-z-]+/g)) assert.ok(pm.includes(m[0]), `option ${m[0]}`);
  for (const m of aujourdHui.matchAll(/`pulse-motion ([a-z-]+)/g)) assert.ok(new RegExp(`pulse-motion ${m[1]}\\b`).test(pm), `commande ${m[1]}`);
  // Les réglages d'export du jour : 720p, 60 images par seconde, export fidèle, planches.
  assert.match(aujourdHui, /720p/);
  assert.match(pm, /--qualite 1080p\|720p/);
});

test('exporter_lit_sorties_apres_export et exporter_cite_sorties : une demande d\'usage ou une remarque après l\'export', () => {
  const e = lire('skills', 'exporter', 'SKILL.md');
  const ligne = e.split('\n').find((l) => l.includes('`pulse-motion reference sorties`'));
  assert.ok(ligne);
  assert.match(ligne, /demande d'usage/);
  assert.match(ligne, /après l'export/);
  assert.match(ligne, /« pas encore possible », dit franchement/);
});

// --- § 5.10 Scènes témoins ---------------------------------------------------------------------------------------

test('scenes_temoins_seuil_six_scenes : témoins à partir de 6 scènes, comme dans creer', () => {
  const t = lire('references', 'scenes-temoins.md');
  assert.match(t, /Vidéo de \*\*6 scènes ou plus\*\*/);
  assert.match(t, /\| Moins de 6 scènes \| Pas de témoins/);
  assert.match(lire('skills', 'creer', 'SKILL.md'), /Moins de 6 scènes : un agent par scène/);
});

test('scenes_temoins_jamais_deux_du_meme_type : la règle est écrite, et suivie par creer', () => {
  assert.match(lire('references', 'scenes-temoins.md'), /Jamais deux scènes du même type comme témoins/);
  assert.match(lire('skills', 'creer', 'SKILL.md'), /jamais deux scènes du même `type`/);
});

// --- § 5.11 Recettes de rythme -----------------------------------------------------------------------------------

test('recettes_rythme_parts_somment_100 : les cinq temps font 100 %', () => {
  const t = tableaux(sectionReference('recettes-rythme', 'La courbe en cinq temps'))[0];
  const parts = t.lignes.map((l) => Number(/(\d+) %/.exec(l[1])[1]));
  assert.deepEqual(parts, [15, 15, 40, 20, 10]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 100);
});

test('recettes_rythme_exemple_respecte_lecture : l\'exemple de 30 s tient ses parts et ses scènes restent lisibles', () => {
  const t = sectionReference('recettes-rythme', 'La courbe en cinq temps');
  const ex = /Exemple pour 30 s en 6 scènes : (.+)\n/.exec(t)[1];
  const durees = [...ex.matchAll(/(\d+(?:,\d+)?) s\b/g)].map((m) => Number(m[1].replace(',', '.')));
  // pose 4,5 ; montée 4,5 ; éclat 12 (2 scènes de 6) ; tenue 6 ; sortie 3.
  assert.deepEqual(durees, [4.5, 4.5, 12, 6, 6, 3]);
  assert.equal(4.5 + 4.5 + 12 + 6 + 3, 30);
  const seuils = JSON.parse(lire('scripts', 'seuils.json'));
  // La scène la plus courte (3 s) laisse lire 5 mots : 1,5 s + 0,3 s par mot.
  assert.ok(seuils.lectureBase + 5 * seuils.lectureParMot <= 3 + 1e-9);
});

test('recettes_rythme_ne_repete_pas_rythme_md : aucune ligne de rythme.md recopiée', () => {
  const rythme = new Set(lire('references', 'rythme.md').split('\n').map((l) => l.trim()).filter((l) => l.length > 20));
  for (const l of lire('references', 'recettes-rythme.md').split('\n').map((x) => x.trim())) assert.ok(!rythme.has(l), l);
});

// --- § 5.12 Pièges -----------------------------------------------------------------------------------------------

test('pieges_ecartes_ont_une_raison_verifiee : chaque piège écarté a sa raison, et ce qu\'elle cite existe', () => {
  const t = tableaux(sectionReference('pieges', 'Ce que le moteur rend impossible'))[0];
  assert.equal(t.lignes.length, 9);
  for (const l of t.lignes) assert.ok(l[1].length > 25, l[0]);
  const tout = t.lignes.map((l) => l[1]).join('\n');
  // Ce que les raisons citent : la règle ressource-distante, M.pret, les interdits du moteur, la vérification des styles.
  assert.match(lire('scripts', 'controler.js') + lire('scripts', 'lib', 'embarquer.js'), /ressource-distante/);
  assert.match(tout, /`ressource-distante`/);
  assert.match(lire('moteur', 'horloge.js'), /M\.pret/);
  assert.match(lire('references', 'moteur.md'), /filter: url\(\)|mix-blend-mode/);
  assert.match(lire('scripts', 'style-perso.js') + lire('scripts', 'styles.js'), /verifier/);
  // La capture ne prend que la scène (#pm-scene) : pas le lecteur.
  assert.match(lire('moteur', 'capture.js'), /pm-scene/);
});

test('pieges_aucun_doublon_avec_signaux_moteur : aucune ligne des signaux d\'alerte du moteur n\'est reprise', () => {
  const signaux = sectionReference('moteur', 'Signaux d\'alerte').split('\n').map((l) => l.trim()).filter((l) => l.length > 20 && !l.startsWith('#'));
  const pieges = lire('references', 'pieges.md');
  for (const l of signaux) assert.ok(!pieges.includes(l), l.slice(0, 80));
  assert.equal(tableaux(sectionReference('pieges', 'Les pièges qui restent'))[0].lignes.length, 12);
});

test('animateur_lit_pieges : une scène témoin lit la référence (décision de l’auteur, S10-5)', () => {
  assert.match(ligneAnimateur('pieges'), /une scène témoin/);
  assert.doesNotMatch(ligneAnimateur('pieges'), /composée/);
  // Le témoin le sait par sa consigne ; les autres scènes composées reçoivent la note « grammaire ».
  assert.match(lire('skills', 'creer', 'SKILL.md'), /\*\*Scènes témoins\*\* : deux agents sans paramètre de modèle, dans le même message, chacun prévenu qu'il écrit une scène témoin/);
});

// --- § 5.13 Branchements -----------------------------------------------------------------------------------------

/** Ligne de la table de lecture de l'animateur qui cite la référence. */
function ligneAnimateur(nom) {
  const a = lire('agents', 'animateur.md');
  const table = a.slice(a.indexOf('| La consigne demande… | Lire aussi |'), a.indexOf('\n2. '));
  const ligne = table.split('\n').find((l) => l.includes('`pulse-motion reference ' + nom + '`'));
  assert.ok(ligne, `${nom} dans la table de l'animateur`);
  return ligne;
}

test('animateur_lit_anti_cliches_et_pieges : en partie lue à la demande, jamais dans le tronc ; les autres sur consigne', () => {
  const a = lire('agents', 'animateur.md');
  assert.equal(ligneAnimateur('anti-cliches'), ligneAnimateur('pieges'));
  // Pas dans la phrase des lectures de toutes les scènes.
  const tronc = a.split('\n').find((l) => l.startsWith('1. Lire `pulse-motion reference moteur` (le tronc)'));
  assert.doesNotMatch(tronc, /anti-cliches|pieges/);
  const autres = a.split('\n').find((l) => l.includes('`pulse-motion reference <nom>`'));
  for (const n of ['compositions', 'cadres-pointeur', 'mixage-fin', 'actifs-marque']) assert.match(autres, new RegExp('`' + n + '`'));
  assert.ok(Buffer.byteLength(a) <= 6000, `${Buffer.byteLength(a)} o`);
  // Ni la référence du moteur ni son tronc ne reçoivent ces textes.
  assert.doesNotMatch(lire('references', 'moteur.md'), /Ce qui fait « vidéo générée »|Les pièges qui restent/);
});

test('creer_cite_directions_actifs_temoins_recettes : visuels à la première ronde, directions, recettes, témoins, références des animateurs', () => {
  const c = lire('skills', 'creer', 'SKILL.md');
  const { sectionsConsignes } = require('../scripts/lib/consignes.js');
  const sec = (n) => sectionsConsignes(c, [n]).texte;
  assert.match(sec('questions'), /nomme une entreprise ou un produit précis : la question 4 devient celle des visuels, une seule fois \(`pulse-motion reference actifs-marque`/);
  assert.match(sec('questions'), /ne jamais redessiner le produit/);
  assert.match(sec('deroule'), /Demande floue[^\n]*trois directions contrastées[^\n]*`pulse-motion reference directions`/);
  assert.match(sec('deroule'), /`pulse-motion reference recettes-rythme` : choisir le caractère de la vidéo et sa courbe d'énergie/);
  assert.match(sec('fabrication'), /\*\*Grammaire\*\*[^\n]*`pulse-motion reference scenes-temoins`/);
  assert.match(sec('fabrication'), /Selon la scène, à lire : `compositions`[^\n]*`cadres-pointeur`[^\n]*`mixage-fin`[^\n]*`actifs-marque`/);
});

test('retoucher_cite_revue_et_sorties : revue, directions pour un style flou, sorties pour un format', () => {
  const r = lire('skills', 'retoucher', 'SKILL.md');
  assert.match(r.split('\n').find((l) => l.startsWith('| Style |')), /demande floue : la direction la plus proche \(`pulse-motion reference directions`\)/);
  assert.match(r.split('\n').find((l) => l.startsWith('| Format |')), /`pulse-motion reference sorties`/);
  assert.match(r.split('\n').find((l) => l.startsWith('| Revue |')), /`pulse-motion reference revue`/);
});

test('style_entretien_propose_les_directions : l\'entretien part des directions de la même famille et de leurs chiffres', () => {
  const s = lire('skills', 'style', 'SKILL.md');
  assert.match(s, /partir de `pulse-motion reference directions` : les trois directions de la famille la plus proche/);
  assert.match(s, /avec leurs chiffres/);
});

test('descriptions : S10 n\'en change aucune ; seule S4 R1 change celle de creer, garde-fou en tête (S10 5.13 point 7, S4 5.5)', () => {
  // S10 n'ajoute ni compétence ni commande ; la description de creer change avec S4 R1 (disable-model-invocation retiré).
  assert.match(lire('skills', 'creer', 'SKILL.md'), /^description: "Créer une NOUVELLE vidéo Pulse Motion, seulement quand la personne le demande/m);
});
