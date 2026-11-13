'use strict';
/* Cartes, défauts vus sur les images de contrôle de la 0.71.0 (demande de l'auteur du 2026-11-13, 0.72.0) : noms des repères
 * placés sans se chevaucher ni toucher une liaison, repères au-dessus des liaisons ; France entière (Corse comprise) dans le
 * cadre avec une marge ; en vertical, cadre aux proportions de l'image et encarts d'outre-mer sous la métropole ; 16:9 inchangé.
 * Sur les vrais fonds (cartes/ du plugin). */
const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.PM_CARTES_DOSSIER;
const K = require('../moteur/cartes.js');
const C = require('../scripts/lib/cartes.js');

const preparer = (html, ratio) => {
  const r = C.preparerCartes(html, { scene: 's', ...(ratio ? { ratio } : {}) });
  assert.deepEqual(r.erreurs, []);
  return r.html;
};
const viewBox = (svg) => /viewBox="([^"]+)"/.exec(svg)[1].split(' ').map(Number);
const dedans = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const aire = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

/** Noms posés : boîte de chacun (même mesure que l'assemblage), à partir du point, de x, y et de l'ancre. */
function noms(svg) {
  const u = viewBox(svg)[2] / 100;
  const t = u * 3.5;
  return [...svg.matchAll(/<g\b[^>]*class="[^"]*pm-repere[^"]*"[^>]*transform="translate\(([-\d.]+) ([-\d.]+)\)"[^>]*>(?:<circle[^>]*\/>)?<text\b[^>]*class="([^"]*)"[^>]*x="([-\d.]+)" y="([-\d.]+)" data-place="([^"]+)">([^<]*)<\/text>/g)].map((m) => {
    const [px, py, x, y] = [m[1], m[2], m[4], m[5]].map(Number);
    const l = C.largeurTexte(m[7]) * t;
    const ancre = /pm-nom-debut/.test(m[3]) ? 'debut' : /pm-nom-fin/.test(m[3]) ? 'fin' : 'milieu';
    const g = ancre === 'debut' ? x : ancre === 'fin' ? x - l : x - l / 2;
    return { nom: m[7], place: m[6], point: [px, py], boite: [px + g, py + y - 0.74 * t, px + g + l, py + y + 0.24 * t] };
  });
}

/** Points des liaisons posées (courbes quadratiques), serrés. */
function pointsLiaisons(svg) {
  const r = [];
  for (const m of svg.matchAll(/class="[^"]*pm-liaison[^"]*" d="M([-\d.]+) ([-\d.]+)Q([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/g)) {
    const [ax, ay, cx, cy, bx, by] = m.slice(1).map(Number);
    for (let i = 0; i <= 400; i++) {
      const s = i / 400, v = 1 - s;
      r.push([v * v * ax + 2 * v * s * cx + s * s * bx, v * v * ay + 2 * v * s * cy + s * s * by]);
    }
  }
  return r;
}

const SCENE_MONDE = `<svg data-carte="monde" data-carte-pays="FR,DE,ES,CA" data-carte-cadre="auto">
  <path data-pays="IT"></path>
  <g data-repere="Paris"><text dy="-0.8em">Paris</text></g>
  <g data-repere="Berlin"><text dy="-0.8em">Berlin</text></g>
  <g data-repere="45.5017,-73.5673"><text dy="-0.8em">Montréal</text></g>
  <path data-liaison="Paris→Berlin"></path>
  <path data-liaison="Paris→Madrid"></path>
  <path data-liaison="Paris→45.5017,-73.5673"></path>
</svg>`;
const SCENE_SERREE = `<svg data-carte="monde" data-carte-pays="FR,BE,NL,GB,DE" data-carte-cadre="auto">
  <g data-repere="Paris"><text>Paris</text></g><g data-repere="Bruxelles"><text>Bruxelles</text></g>
  <g data-repere="Amsterdam"><text>Amsterdam</text></g><g data-repere="Londres"><text>Londres</text></g>
  <g data-repere="Berlin"><text>Berlin</text></g>
  <path data-liaison="Paris→Bruxelles"></path><path data-liaison="Paris→Londres"></path><path data-liaison="Bruxelles→Amsterdam"></path>
</svg>`;

test('cartes : noms placés sans se chevaucher ni être barrés par une liaison, repères au-dessus des liaisons', () => {
  for (const [scene, ratio] of [[SCENE_MONDE, '16:9'], [SCENE_MONDE, '9:16'], [SCENE_SERREE, '16:9'], [SCENE_SERREE, '9:16']]) {
    const svg = preparer(scene, ratio);
    const n = noms(svg);
    assert.equal(n.length, (scene.match(/<text/g) || []).length, `${ratio} : chaque nom est placé`);
    for (let i = 0; i < n.length; i++) for (let j = i + 1; j < n.length; j++) assert.equal(aire(n[i].boite, n[j].boite), 0, `${ratio} : ${n[i].nom} et ${n[j].nom} se chevauchent`);
    const liaisons = pointsLiaisons(svg);
    for (const x of n) {
      const b = x.boite;
      const traversants = liaisons.filter(([px, py]) => dedans(b, px, py));
      assert.equal(traversants.length, 0, `${ratio} : ${x.nom} (${x.place}) barré par une liaison`);
    }
    // Les repères viennent après la dernière liaison (dessinés par-dessus), chacun avec son point.
    assert.ok(svg.lastIndexOf('pm-liaison') < svg.indexOf('pm-repere'), 'repères après les liaisons');
    assert.equal((svg.match(/<circle class="pm-repere-point"/g) || []).length, n.length);
    assert.doesNotMatch(svg, /\sdy="/, 'la position écrite à la main est remplacée');
  }
});

test('cartes : « Montréal » ne coupe plus la côte, Paris et Berlin ne se touchent plus (scène de contrôle de la 0.71.0)', () => {
  const svg = preparer(SCENE_MONDE, '16:9');
  const n = Object.fromEntries(noms(svg).map((x) => [x.nom, x]));
  const marge = viewBox(svg)[2] / 100 * 3.5 * 0.2;
  const large = (b) => [b[0] - marge, b[1] - marge, b[2] + marge, b[3] + marge];
  assert.equal(aire(large(n.Paris.boite), n.Berlin.boite), 0);
  // Montréal : nom tout entier sur le Canada coloré ou tout entier hors de lui (jamais à cheval sur la côte), mesuré aux mêmes
  // points que l'assemblage.
  const ca = /id="pays-CA"[^>]*d="([^"]+)"/.exec(svg)[1];
  const anneaux = [];
  for (const m of ca.matchAll(/M([-\d.]+)[ ,]?([-\d.]+)l([^z]*)z/g)) {
    let x = Number(m[1]), y = Number(m[2]);
    const a = [[x, y]];
    const n2 = (m[3].match(/-?(?:\d+\.?\d*|\.\d+)/g) || []).map(Number);
    for (let i = 0; i + 1 < n2.length; i += 2) { x += n2[i]; y += n2[i + 1]; a.push([x, y]); }
    anneaux.push(a);
  }
  const surCa = (px, py) => {
    let d = false;
    for (const a of anneaux) for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      if ((a[i][1] > py) !== (a[j][1] > py) && px < (a[j][0] - a[i][0]) * (py - a[i][1]) / (a[j][1] - a[i][1]) + a[i][0]) d = !d;
    }
    return d;
  };
  const b = n['Montréal'].boite;
  const etats = [];
  for (const fx of [0.02, 0.5, 0.98]) for (const fy of [0.15, 0.85]) etats.push(surCa(b[0] + (b[2] - b[0]) * fx, b[1] + (b[3] - b[1]) * fy));
  assert.ok(etats.every(Boolean) || !etats.some(Boolean), `Montréal à cheval sur la côte (${n['Montréal'].place})`);
});

test('placerNoms : la place libre gagne ; deux noms voisins ne se chevauchent pas', () => {
  // Deux points proches, côte à côte : au-dessus pour l'un, ailleurs pour l'autre ; une liaison verticale au-dessus du premier.
  const noms2 = [{ x: 50, y: 50, largeur: 20, taille: 4 }, { x: 62, y: 50, largeur: 20, taille: 4 }];
  const liaison = [];
  for (let y = 0; y <= 48; y += 0.5) liaison.push([50, y]);
  const places = C.placerNoms(noms2, { points: noms2.map((p) => ({ x: p.x, y: p.y, r: 1 })), liaisons: liaison, image: [0, 0, 200, 100], ecart: 2 });
  assert.notEqual(places[0].place, 'n', 'la liaison barre la place au-dessus');
  assert.equal(aire(places[0].boite, places[1].boite), 0);
  for (const p of places) for (const [x, y] of liaison) assert.ok(!dedans(p.boite, x, y));
  // Sans obstacle : au-dessus, centré.
  const seul = C.placerNoms([{ x: 50, y: 50, largeur: 20, taille: 4 }], { image: [0, 0, 200, 100], ecart: 2 });
  assert.equal(seul[0].place, 'n');
  assert.equal(seul[0].ancre, 'milieu');
  // Au bord de l'image : le nom rentre dedans.
  const bord = C.placerNoms([{ x: 195, y: 50, largeur: 20, taille: 4 }], { image: [0, 0, 200, 100], ecart: 2 });
  assert.ok(bord[0].boite[2] <= 200, bord[0].place);
});

test('cartes : texte du nom avec halo de la couleur du fond, ancres posées par classe', () => {
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'moteur', 'cartes.css'), 'utf8');
  assert.match(css, /\.pm-carte text \{[^}]*paint-order: stroke fill;[^}]*stroke: var\(--c-fond\)/);
  assert.match(css, /text\.pm-nom-debut \{ text-anchor: start; \}/);
  assert.match(css, /text\.pm-nom-fin \{ text-anchor: end; \}/);
});

test('cartes : la France entière tient dans le cadre avec une marge, Corse comprise (16:9 et 9:16)', () => {
  const carte = C.chargerCarte('france');
  const cor = carte.pays.find((p) => p.code === 'COR').boite;
  for (const ratio of ['16:9', '9:16']) {
    const vb = viewBox(preparer('<svg data-carte="france" data-carte-cadre="monde"></svg>', ratio));
    const marge = 0.03 * vb[2], margeH = 0.03 * vb[3];
    assert.ok(cor[2] <= vb[0] + vb[2] - marge && cor[3] <= vb[1] + vb[3] - margeH, `${ratio} : Corse à moins de 3 % du bord (${vb.join(' ')})`);
    for (const p of C.disposer(carte, ratio).pays) {
      const b = p.boite;
      assert.ok(b[0] >= vb[0] + marge && b[1] >= vb[1] + margeH && b[2] <= vb[0] + vb[2] - marge && b[3] <= vb[1] + vb[3] - margeH, `${ratio} : ${p.code} hors du cadre`);
    }
  }
  // Carte du monde entière : rien ne touche plus le bord.
  const vb = viewBox(preparer('<svg data-carte="monde" data-carte-cadre="monde"></svg>', '16:9'));
  const contenu = K.contenu(C.chargerCarte('monde'));
  assert.ok(vb[0] < contenu[0] && vb[1] < contenu[1] && vb[0] + vb[2] > contenu[2] && vb[1] + vb[3] > contenu[3], vb.join(' '));
});

test('cartes : en 9:16, cadre aux proportions de l\'image, encarts sous la métropole, Mamoudzou dans l\'encart de Mayotte', () => {
  const svg = preparer('<svg data-carte="france" data-carte-regions="MYT" data-carte-cadre="monde"><g data-repere="Mamoudzou"><text>Mamoudzou</text></g></svg>', '9:16');
  const vb = viewBox(svg);
  assert.ok(Math.abs(vb[2] / vb[3] - 9 / 16) < 0.01, `proportions ${vb[2] / vb[3]}`);
  const carte = C.disposer(C.chargerCarte('france'), '9:16');
  assert.equal(carte.disposition, 'verticale');
  const metro = K.unir(carte.pays.filter((p) => !p.outreMer).map((p) => p.boite));
  const rects = [...svg.matchAll(/<rect class="pm-encart" x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g)].map((m) => m.slice(1).map(Number));
  assert.equal(rects.length, 5);
  for (const [, y] of rects) assert.ok(y > metro[3], `encart sous la métropole (${y} > ${metro[3]})`);
  // Deux rangées, centrées sous la métropole.
  assert.deepEqual([...new Set(rects.map((r) => r[1]))].length, 2);
  const myt = carte.encarts.find((e) => e.code === 'MYT').cadre;
  const [, x, y] = /data-repere="Mamoudzou"[^>]*transform="translate\(([-\d.]+) ([-\d.]+)\)"/.exec(svg).map(Number);
  assert.ok(dedans(myt, x, y), `Mamoudzou (${x}, ${y}) dans l'encart ${myt.join(' ')}`);
  // Le nom ne coupe pas le bord de son encart : dedans, ou tout entier dehors.
  const nom = noms(svg)[0];
  const a = aire(nom.boite, myt), total = (nom.boite[2] - nom.boite[0]) * (nom.boite[3] - nom.boite[1]);
  assert.ok(a === 0 || Math.abs(a - total) < 1e-6, `${nom.place} à cheval sur l'encart`);
  // Pareil en 16:9 (encarts à gauche, livrés ainsi).
  const svg169 = preparer('<svg data-carte="france" data-carte-regions="MYT" data-carte-cadre="monde"><g data-repere="Mamoudzou"><text>Mamoudzou</text></g></svg>', '16:9');
  const nom169 = noms(svg169)[0];
  const myt169 = C.chargerCarte('france').encarts.find((e) => e.code === 'MYT').cadre;
  const a169 = aire(nom169.boite, myt169), total169 = (nom169.boite[2] - nom169.boite[0]) * (nom169.boite[3] - nom169.boite[1]);
  assert.ok(a169 === 0 || Math.abs(a169 - total169) < 1e-6, `${nom169.place} à cheval sur l'encart (16:9)`);
});

test('cartes : en 9:16, une carte large remplit l\'écran, son sujet reste vers le milieu ; un territoire d\'outre-mer non demandé ne vient pas', () => {
  const svg = preparer('<svg data-carte="monde" data-carte-pays="FR,DE,ES,CA"></svg>', '9:16');
  const vb = viewBox(svg);
  assert.ok(Math.abs(vb[2] / vb[3] - 9 / 16) < 0.01);
  // Plus de pays dessinés qu'en 16:9 (l'Afrique, l'Amérique du Sud remplissent le bas).
  const fonds = (s) => (s.match(/pm-pays-fond/g) || []).length;
  assert.ok(fonds(svg) > fonds(preparer('<svg data-carte="monde" data-carte-pays="FR,DE,ES,CA"></svg>', '16:9')));
  const carte = C.chargerCarte('monde');
  const sujet = K.unir(['FR', 'DE', 'ES', 'CA'].map((c) => carte.pays.find((p) => p.code === c).boite));
  const milieu = ((sujet[1] + sujet[3]) / 2 - vb[1]) / vb[3];
  assert.ok(milieu >= 0.3 - 1e-6 && milieu <= 0.6 + 1e-6, `sujet à ${milieu}`);
  // France, régions de métropole seules : pas d'encart (ni d'outre-mer) amené par l'extension verticale.
  const metro = preparer('<svg data-carte="france" data-carte-regions="ARA,BRE"></svg>', '9:16');
  assert.doesNotMatch(metro, /pm-encart|data-pays-fond="(GUA|MTQ|GUF|REU|MYT)"/);
});

test('cartes : en 16:9, cadre auto et repères inchangés par le format', () => {
  for (const scene of [SCENE_MONDE, '<svg data-carte="france" data-carte-regions="ARA,BRE,GUA,REU"><g data-repere="Lyon"></g></svg>', '<svg data-carte="monde" data-carte-cadre="europe"></svg>']) {
    const sans = preparer(scene);
    const avec = preparer(scene, '16:9');
    assert.deepEqual(viewBox(avec), viewBox(sans));
    const reperes = (s) => [...s.matchAll(/transform="translate\(([^)]+)\)"/g)].map((m) => m[1]);
    assert.deepEqual(reperes(avec), reperes(sans));
  }
  // Le cadre auto d'une scène 16:9 reste la boîte des zones + 10 %.
  const carte = C.chargerCarte('monde');
  const fr = carte.pays.find((p) => p.code === 'FR');
  const vb = viewBox(preparer('<svg data-carte="monde" data-carte-pays="FR"></svg>', '16:9'));
  const attendu = C.cadreDe({ carte, cadre: 'auto', zones: [fr] }).boite;
  assert.deepEqual(vb, C.viewBoxDe(attendu));
});

test('cartes afficher : en 9:16, même disposition et même cadre que l\'assemblage', () => {
  const { afficher } = require('../scripts/cartes.js');
  const a = afficher('france', 'Mamoudzou', { cadre: 'monde', ratio: '9:16' });
  assert.equal(a.ok, true);
  const svg = preparer('<svg data-carte="france" data-carte-cadre="monde"><g data-repere="Mamoudzou"></g></svg>', '9:16');
  assert.equal(a.viewBox, viewBox(svg).join(' '));
  const [, x, y] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(svg).map(Number);
  assert.deepEqual(a.point, { x, y });
  const h = afficher('france', 'Mamoudzou', { cadre: 'monde', ratio: '16:9' });
  assert.notEqual(h.viewBox, a.viewBox);
});
