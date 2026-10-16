/* Pulse Motion – page de découpe d'un personnage (servie par l'aperçu sur /_pm/personnages/decoupe?nom=…).
 *
 * L'illustration de la personne est affichée dans un cadre isolé (iframe sandbox sans scripts, aucune ressource
 * extérieure) ; cette page lit son DOM et y exécute M.decoupe. Les formes sont encadrées de la couleur de leur os,
 * les pivots se glissent ; « Découper » montre le personnage obtenu, « Enregistrer » range découpe et dessin.
 * Crochets de test : window.__decoupe (pret, etat(), choisir(sel), reattribuer(sel, cible), deplacer(os, champ, [x, y]),
 * decouper(), enregistrer()).
 */
const { squelette: S, clips: K, pieces: PI, decoupe: DC } = window.M;
const NS = 'http://www.w3.org/2000/svg';
const $ = (s) => document.querySelector(s);
const ORDRE = ['torse', 'bassin', 'tete', 'cuisseAvant', 'tibiaAvant', 'piedAvant', 'brasAvant', 'avantBrasAvant', 'mainAvant',
  'cuisseArriere', 'tibiaArriere', 'piedArriere', 'brasArriere', 'avantBrasArriere', 'mainArriere'];
const LIBELLES = { torse: 'Torse', bassin: 'Bassin', tete: 'Tête', cuisse: 'Cuisse', tibia: 'Tibia', pied: 'Pied', bras: 'Bras', avantBras: 'Avant-bras', main: 'Main' };
const TEINTES = ['#E6194B', '#3CB44B', '#4363D8', '#F58231', '#911EB4', '#42D4F4', '#F032E6', '#9A6324', '#800000', '#469990', '#BFEF45', '#000075', '#FABED4', '#DCBEFF', '#AAFFC3'];
const CENTRES = ['tete', 'bassin'];

const el = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
const message = (t, c = '') => { $('#message').textContent = t; $('#message').className = c; };
const libelle = (n) => {
  if (n === 'ignorer') return 'Ignorer (ne va nulle part)';
  const m = /^(.*?)(Avant|Arriere)?$/.exec(n);
  return LIBELLES[m[1]] + (m[2] === 'Avant' ? ' avant' : m[2] === 'Arriere' ? ' arrière' : '');
};
const teinte = (n) => (n === 'ignorer' ? '#999999' : TEINTES[ORDRE.indexOf(n) % TEINTES.length]);

let donnees;
let decoupe;
let passe = [];
let svg;
let choix = null;
let resultat = null;
let vue = 0;

function memoriser() { passe.push(JSON.stringify(decoupe)); if (passe.length > 100) passe.shift(); }

/* ---------- calque : formes et pivots ---------- */
function dessinerCalque() {
  const calque = $('#calque');
  calque.replaceChildren();
  calque.setAttribute('viewBox', svg.getAttribute('viewBox'));
  const vb = svg.viewBox.baseVal;
  const u = Math.max(vb.width, vb.height) / 600;
  for (const f of DC.analyser(svg).formes) {
    const e = DC.element(svg, f.selecteur);
    const p = DC.proprietaire(decoupe, svg, e);
    const coul = !p ? '#FF0000' : p.type === 'os' ? teinte(p.nom) : p.type === 'visage' ? '#FFFFFF' : '#999999';
    const b = f.boite;
    el('rect', { x: b[0], y: b[1], width: b[2], height: b[3], fill: 'none', stroke: coul, 'stroke-width': (f.selecteur === choix ? 3 : 1.2) * u,
      'stroke-dasharray': p ? 'none' : `${3 * u} ${2 * u}`, 'data-forme': f.selecteur }, calque);
  }
  for (const [n, def] of Object.entries(decoupe.os || {})) {
    const t = teinte(n);
    if (def.de && def.a) {
      el('line', { x1: def.de[0], y1: def.de[1], x2: def.a[0], y2: def.a[1], stroke: t, 'stroke-width': 2 * u, 'data-os': n }, calque);
      el('circle', { cx: def.de[0], cy: def.de[1], r: 5 * u, fill: t, stroke: '#FFFFFF', 'stroke-width': u, class: 'pivot', 'data-os': n, 'data-champ': 'de' }, calque);
      el('circle', { cx: def.a[0], cy: def.a[1], r: 5 * u, fill: '#FFFFFF', stroke: t, 'stroke-width': 2 * u, class: 'pivot', 'data-os': n, 'data-champ': 'a' }, calque);
    } else if (def.centre) {
      el('circle', { cx: def.centre[0], cy: def.centre[1], r: 6 * u, fill: t, stroke: '#FFFFFF', 'stroke-width': u, class: 'pivot', 'data-os': n, 'data-champ': 'centre' }, calque);
    }
  }
}

function majOs() {
  const zone = $('#os');
  zone.replaceChildren();
  const actuel = choix ? DC.proprietaire(decoupe, svg, DC.element(svg, choix)) : null;
  for (const n of [...ORDRE, 'ignorer']) {
    const b = document.createElement('button');
    b.innerHTML = `<span class="pastille" style="background:${teinte(n)}"></span>${libelle(n)}${n !== 'ignorer' && !(decoupe.os || {})[n] ? ' <span class="aide">(vide)</span>' : ''}`;
    b.dataset.os = n;
    b.disabled = !choix;
    b.setAttribute('aria-pressed', String(!!actuel && ((actuel.type === 'os' && actuel.nom === n) || (actuel.type === 'ignorer' && n === 'ignorer'))));
    zone.appendChild(b);
  }
  $('#choix').textContent = choix ? `${choix}${actuel ? ` — ${actuel.type === 'os' ? libelle(actuel.nom) : actuel.type === 'visage' ? 'visage' : 'ignorée'}` : ' — rangée nulle part'}` : 'aucune (cliquer une forme)';
}

function rendre() { dessinerCalque(); majOs(); }

/* ---------- actions ---------- */
function choisir(sel) { choix = sel; rendre(); }
const pivotsOublies = {};
function reattribuer(sel, cible) {
  memoriser();
  for (const [n, def] of Object.entries(decoupe.os || {})) pivotsOublies[n] = def;
  const existait = !!(decoupe.os || {})[cible];
  decoupe = DC.reattribuer(decoupe, svg, DC.element(svg, sel), cible);
  // Un os vidé puis rempli de nouveau retrouve ses articulations.
  const ancien = pivotsOublies[cible];
  if (!existait && ancien && decoupe.os[cible]) for (const k of ['de', 'a', 'centre']) if (ancien[k]) decoupe.os[cible][k] = ancien[k];
  choix = sel;
  rendre();
}
function deplacer(os, champ, pos) {
  if (!decoupe.os[os]) return;
  decoupe.os[os][champ] = pos.map((v) => Math.round(v * 10) / 10);
  rendre();
}

/* ---------- aperçu ---------- */
let perso = null;
function decouper() {
  resultat = DC.decouper(svg, decoupe, donnees.gabarit);
  $('#signalees').textContent = resultat.signalees.length ? `Formes rangées nulle part (en pointillé rouge) : ${resultat.signalees.join(', ')}.` : '';
  if (resultat.erreurs.length) { message(resultat.erreurs.join('\n'), 'erreur'); return resultat; }
  const p = resultat.partiel, v = decoupe.vue;
  const dessin = { couleurs: p.couleurs, pieces: {} };
  for (const [k, s] of Object.entries(p.pieces)) dessin.pieces[k] = { profil: s, [v]: s };
  if (p.visage) dessin.visage = { oeil: p.visage.oeil, bouches: { neutre: { profil: p.visage.bouche } }, vues: { profil: p.visage.vue, ...(v !== 'dos' ? { [v]: p.visage.vue } : {}) } };
  perso = PI.creer($('#perso'), dessin, p.gabarit);
  perso.gabarit = p.gabarit;
  message('Découpé : le personnage marche à droite. « Enregistrer » le range avec la vidéo.', 'ok');
  return resultat;
}

let t0 = performance.now();
function boucle(t) {
  if (perso) {
    const g = perso.gabarit;
    const temps = $('#lecture').checked ? (t - t0) / 1000 : 0;
    const pose = Object.assign({}, S.REPOS, $('#lecture').checked ? K.echantillonner(donnees.lu.clips.marche, temps, donnees.lu, g) : {},
      { x: 250, y: 500 - (S.sol(g) + 7) * 1.4, echelle: 1.4, vue });
    perso.rendre(S.calculer(pose, g));
  }
  requestAnimationFrame(boucle);
}

async function enregistrer() {
  decouper(); // toujours sur la découpe telle qu'elle est : dessin et découpe enregistrés vont ensemble
  if (resultat.erreurs.length) return { ok: false, erreurs: resultat.erreurs };
  const r = await fetch('/_pm/personnages/decoupe/enregistrer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom: donnees.nom, decoupe, partiel: resultat.partiel }) });
  const d = await r.json();
  if (!r.ok) { message((d.erreurs || [d.message]).join('\n'), 'erreur'); return d; }
  message(`Enregistré : ${d.fichiers.join(', ')}.`, 'ok');
  return d;
}

/* ---------- gestes ---------- */
function pointDoc(ev) {
  const c = $('#calque');
  const p = c.createSVGPoint();
  p.x = ev.clientX; p.y = ev.clientY;
  return p.matrixTransform(c.getScreenCTM().inverse());
}
let glisse = null;
$('#calque').addEventListener('pointerdown', (ev) => {
  const t = ev.target;
  if (!t.classList.contains('pivot')) return;
  ev.preventDefault();
  memoriser();
  glisse = { os: t.dataset.os, champ: t.dataset.champ, cercle: t, ligne: $(`#calque line[data-os="${t.dataset.os}"]`) };
  $('#source').style.pointerEvents = 'none'; // le geste reste sur cette page même s'il passe au-dessus de l'illustration
});
window.addEventListener('pointermove', (ev) => {
  if (!glisse) return;
  const p = pointDoc(ev), pos = [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
  decoupe.os[glisse.os][glisse.champ] = pos;
  glisse.cercle.setAttribute('cx', pos[0]); glisse.cercle.setAttribute('cy', pos[1]);
  if (glisse.ligne && glisse.champ !== 'centre') { const i = glisse.champ === 'de' ? 1 : 2; glisse.ligne.setAttribute(`x${i}`, pos[0]); glisse.ligne.setAttribute(`y${i}`, pos[1]); }
});
const fin = () => { if (!glisse) return; glisse = null; $('#source').style.pointerEvents = ''; rendre(); };
window.addEventListener('pointerup', fin);
window.addEventListener('pointercancel', fin);
$('#os').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b && choix) reattribuer(choix, b.dataset.os); });
$('#annuler').addEventListener('click', () => { if (passe.length) { decoupe = JSON.parse(passe.pop()); rendre(); } });
$('#decouper').addEventListener('click', decouper);
$('#enregistrer').addEventListener('click', () => { enregistrer().catch((e) => message(e.message, 'erreur')); });
document.querySelectorAll('[data-vue]').forEach((b) => b.addEventListener('click', () => { vue = Number(b.dataset.vue); }));

/* ---------- démarrage ---------- */
(async () => {
  const nom = new URLSearchParams(location.search).get('nom') || '';
  const r = await fetch(`/_pm/personnages/decoupe/donnees?nom=${encodeURIComponent(nom)}`);
  const d = await r.json();
  if (!r.ok) { message(d.message, 'erreur'); window.__decoupe = { pret: true, erreur: d.message }; return; }
  donnees = Object.assign(d, { nom });
  decoupe = JSON.parse(JSON.stringify(d.decoupe));
  $('#cible').textContent = d.cible === 'video' ? 'Les enregistrements vont dans les personnages de cette vidéo (« annule » les défait).' : 'Aucune vidéo ouverte : la découpe se règle mais ne s\'enregistre pas.';
  $('#enregistrer').disabled = d.cible !== 'video';
  const cadre = $('#source');
  await new Promise((ok) => {
    cadre.addEventListener('load', ok, { once: true });
    cadre.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"><style>html,body{margin:0}svg{display:block;width:100%;height:auto}</style></head><body>${d.source}</body></html>`;
  });
  svg = cadre.contentDocument.querySelector('svg');
  DC.normaliser(svg);
  const vb = svg.viewBox.baseVal;
  cadre.style.height = `${cadre.clientWidth * vb.height / vb.width}px`;
  cadre.contentDocument.addEventListener('click', (ev) => {
    ev.preventDefault(); // un lien de l'illustration ne doit pas faire naviguer le cadre
    const f = ev.target.closest(DC.FORMES.join(','));
    if (f) choisir(DC.selecteur(svg, f));
  }, true);
  new ResizeObserver(() => { cadre.style.height = `${cadre.clientWidth * vb.height / vb.width}px`; }).observe(cadre);
  rendre();
  decouper();
  requestAnimationFrame(boucle);
  window.__decoupe = {
    pret: true, etat: () => JSON.parse(JSON.stringify(decoupe)), choisir, reattribuer, deplacer, decouper, enregistrer,
    script: () => cadre.contentWindow.__piege || null,
  };
})();
