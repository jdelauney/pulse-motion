/* Pulse Motion – page de l'atelier des personnages (servie par l'aperçu sur /_pm/personnages[?nom=…]).
 *
 * Affichage et gestes seulement : toutes les règles d'édition sont dans edition.mjs. Les modules du moteur
 * (M.squelette, M.clips, M.batonnets) sont chargés avant ce module par atelier.html.
 * Crochets de test : window.__atelier (ed, rendre, enregistrer, poignee, pret) ; window.__atelierConfirmer remplace confirm().
 */
import { creerEdition, nouvelObjet, PAS_IMAGE } from './edition.mjs';

const { squelette: S, clips: K, batonnets: B, pieces: PI } = window.M;
const NS = 'http://www.w3.org/2000/svg';
const DEG = Math.PI / 180;
const X = 450, SOL = 500, ECHELLE = 1.1;
const $ = (s) => document.querySelector(s);

const GROUPES = [
  ['Torse et tête', ['bassinY', 'bassinRot', 'torse', 'torseRot', 'torseIncl', 'tete', 'teteTourne', 'tetePenche']],
  ['Bras Avant', ['brasAvant', 'avantBrasAvant', 'ecartBrasAvant', 'torsionBrasAvant']],
  ['Bras Arrière', ['brasArriere', 'avantBrasArriere', 'ecartBrasArriere', 'torsionBrasArriere']],
  ['Jambe Avant', ['cuisseAvant', 'tibiaAvant', 'piedAvant', 'ecartJambeAvant', 'torsionJambeAvant']],
  ['Jambe Arrière', ['cuisseArriere', 'tibiaArriere', 'piedArriere', 'ecartJambeArriere', 'torsionJambeArriere']],
  ['Expression', S.NOMS.expression],
];
const LIBELLES = {
  bassinY: 'Bassin ↕', bassinRot: 'Bassin ↻', torse: 'Torse (flexion)', torseRot: 'Torse (rotation)', torseIncl: 'Torse (inclinaison)',
  tete: 'Tête ↻', teteTourne: 'Tête tourne', tetePenche: 'Tête penche', bras: 'Bras', avantBras: 'Avant-bras', ecartBras: 'Écart',
  torsionBras: 'Torsion', cuisse: 'Cuisse', tibia: 'Genou (tibia)', pied: 'Pied', ecartJambe: 'Écart', torsionJambe: 'Torsion',
  yeuxY: 'Yeux ↕', tailleYeux: 'Taille des yeux', paupieres: 'Paupières', regardX: 'Regard ↔', regardY: 'Regard ↕',
  taillePupilles: 'Pupilles', sourcilsY: 'Sourcils ↕', sourcilsAngle: 'Sourcils (angle)', touffeRot: 'Touffe ↻', touffeEtire: 'Touffe étirée', touffeEventail: 'Touffe en éventail', touffeOnde: 'Touffe ondule',
};
const AUTRES = {
  bassinY: [-200, 100, 1], yeuxY: [-10, 10, 0.5], tailleYeux: [0.6, 1.5, 0.01], paupieres: [0.05, 1, 0.01], regardX: [-6, 6, 0.1],
  regardY: [-7, 7, 0.1], taillePupilles: [0.4, 1.4, 0.01], touffeRot: [-40, 40, 1], touffeEtire: [0.5, 1.6, 0.01],
  touffeEventail: [0.3, 2, 0.01], touffeOnde: [-25, 25, 0.5], sourcilsY: [-10, 12, 0.5], sourcilsAngle: [-30, 30, 1],
};
const BOUCHES = ['neutre', 'sourire', 'rire', 'triste', 'surprise', 'colere', 'repos', 'A', 'E', 'I', 'O', 'U', 'MBP', 'FV', 'L'];
const POIGNEES = {
  bassin: { glisse: 'bassinY' }, cou: { os: 'torse', pivot: 'bassin' }, centreTete: { os: 'tete', pivot: 'cou' },
  genouAvant: { os: 'cuisseAvant', pivot: 'hancheAvant' }, chevilleAvant: { os: 'tibiaAvant', pivot: 'genouAvant', ik: 'chevilleAvant' },
  orteilAvant: { os: 'piedAvant', pivot: 'chevilleAvant' },
  genouArriere: { os: 'cuisseArriere', pivot: 'hancheArriere' }, chevilleArriere: { os: 'tibiaArriere', pivot: 'genouArriere', ik: 'chevilleArriere' },
  orteilArriere: { os: 'piedArriere', pivot: 'chevilleArriere' },
  coudeAvant: { os: 'brasAvant', pivot: 'epauleAvant' }, mainAvant: { os: 'avantBrasAvant', pivot: 'coudeAvant', ik: 'mainAvant' },
  coudeArriere: { os: 'brasArriere', pivot: 'epauleArriere' }, mainArriere: { os: 'avantBrasArriere', pivot: 'coudeArriere', ik: 'mainArriere' },
};

const el = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
const message = (texte, classe = '') => { const m = $('#message'); m.textContent = texte; m.className = classe; };
const confirmer = (texte) => (window.__atelierConfirmer ? window.__atelierConfirmer(texte) : window.confirm(texte));
const virgule = (v, n = 2) => String(Math.round(v * 10 ** n) / 10 ** n).replace('.', ',');

let contexte;
let lu;
let ed;
let vue = 0;
let tourne = false;
let lecture = false;
let dernier = null;
let habillage = 'batonnets';
let sale = true;

function gabaritDessin(d) {
  if (d && d.gabarit && typeof d.gabarit === 'object') return d.gabarit;
  return lu.gabarits[(d && d.gabarit) || 'standard'] || lu.gabarits.standard || null;
}
function gabaritCourant() {
  if (habillage !== 'batonnets') return gabaritDessin(lu.dessins[habillage]);
  return lu.gabarits[$('#gabarit').value] || lu.gabarits.standard || null;
}
function placement() { return { x: X, y: SOL - (S.sol(ed.gabarit) + 7) * ECHELLE, echelle: ECHELLE, vue }; }
const additif = () => ed.type === 'clip' && !!ed.objet.additif;
const auSol = () => ed.type === 'clip' && ed.objet.pieds === 'au-sol' && !ed.objet.additif;

function libelle(n) {
  if (LIBELLES[n]) return LIBELLES[n] + (n === 'bassinY' && auSol() ? ' (décalage)' : '');
  return LIBELLES[S.generique(n)] || n;
}

function bornes(n) {
  const g = S.completerGabarit(ed.gabarit);
  if (additif()) { const a = AUTRES[n]; return a ? [-(a[1] - a[0]) / 2, (a[1] - a[0]) / 2, a[2]] : [-90, 90, 1]; }
  if (n === 'bassinY' && auSol()) return [-100, 100, 1];
  const lim = S.limite(n, g);
  if (lim) return [lim[0], lim[1], 1];
  return AUTRES[n] || [-90, 90, 1];
}

function borner(n, v) {
  if (additif()) return v;
  const [min, max] = bornes(n);
  return Math.min(max, Math.max(min, v));
}

/* ---------- scène ---------- */
const svg = $('#scene');
let perso;
let fantomes;
function creerUn(g) { return habillage === 'batonnets' ? B.creer(g) : PI.creer(g, lu.dessins[habillage], gabaritDessin(lu.dessins[habillage])); }
function creerPersos() {
  $('#perso').replaceChildren();
  $('#fantomes').replaceChildren();
  perso = creerUn($('#perso'));
  fantomes = [0, 1].map(() => creerUn(el('g', { opacity: 0.22 }, $('#fantomes'))));
}
const poignees = {};
for (const n of Object.keys(POIGNEES)) poignees[n] = el('circle', { r: 8, class: 'poignee', 'data-poignee': n }, $('#poignees'));

function rendre() {
  const pl = placement();
  const pose = Object.assign(ed.pose(), pl);
  dernier = S.calculer(pose, ed.gabarit, { temps: ed.temps, poseA: (t) => Object.assign(ed.poseEn(t), pl) });
  perso.rendre(dernier);
  const voisines = ed.voisines();
  fantomes.forEach((f, i) => {
    const u = voisines[i];
    f.groupe.style.display = u === null ? 'none' : '';
    if (u !== null) f.rendre(S.calculer(Object.assign(ed.poseA(u), pl), ed.gabarit));
  });
  const g = S.completerGabarit(ed.gabarit);
  for (const [n, c] of Object.entries(poignees)) {
    const p = S.pointDe(dernier, n);
    c.setAttribute('cx', Math.round(p.x * 100) / 100);
    c.setAttribute('cy', Math.round(p.y * 100) / 100);
    const k = POIGNEES[n].os || POIGNEES[n].glisse;
    const lim = S.limite(k, g);
    c.classList.toggle('bute', !!lim && (Math.abs(dernier.efficace[k] - lim[0]) < 0.5 || Math.abs(dernier.efficace[k] - lim[1]) < 0.5));
  }
  document.querySelectorAll('[data-vue]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.vue) === Math.round(vue))));
  $('#vue').value = Math.round(vue);
  majCurseurs();
  majFrise();
  majProprietes();
  majChoix();
  sale = false;
}

function pointSVG(ev) {
  const p = svg.createSVGPoint();
  p.x = ev.clientX; p.y = ev.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
function versPerso(pt) { const pl = placement(); return [(pt.x - pl.x) / pl.echelle, (pt.y - pl.y) / pl.echelle]; }
function angleVers(pivot, c) { const p = dernier.articulations[pivot]; return Math.atan2(c[1] - p[1], c[0] - p[0]) / DEG; }

let glisse = null;
$('#poignees').addEventListener('pointerdown', (ev) => {
  const n = ev.target.dataset && ev.target.dataset.poignee;
  if (!n) return;
  ev.preventDefault();
  ev.target.setPointerCapture(ev.pointerId);
  const def = POIGNEES[n];
  const depart = versPerso(pointSVG(ev));
  glisse = { def, depart, valeur: ed.valeurs()[def.os || def.glisse] || 0, angle: def.pivot ? angleVers(def.pivot, depart) : 0 };
  ed.debutGeste();
});
$('#poignees').addEventListener('pointermove', (ev) => {
  if (!glisse) return;
  const c = versPerso(pointSVG(ev));
  const d = glisse.def;
  if (ev.shiftKey && d.ik && !additif()) {
    const a = S.atteindre(Object.assign(ed.pose(), { vue }), ed.gabarit, d.ik, c);
    if (a) { delete a.atteint; for (const k of Object.keys(a)) a[k] = borner(k, a[k]); ed.reglerPlusieurs(a); }
  } else if (d.glisse) {
    ed.regler(d.glisse, borner(d.glisse, glisse.valeur + (c[1] - glisse.depart[1])));
  } else {
    const sens = Math.cos(vue * DEG) < 0 ? -1 : 1;
    const delta = ((angleVers(d.pivot, c) - glisse.angle) % 360 + 540) % 360 - 180;
    ed.regler(d.os, borner(d.os, glisse.valeur + sens * delta));
  }
  rendre();
});
const finGlisse = () => { if (glisse) { glisse = null; ed.finGeste(); rendre(); } };
$('#poignees').addEventListener('pointerup', finGlisse);
$('#poignees').addEventListener('pointercancel', finGlisse);

/* ---------- curseurs ---------- */
function construireCurseurs() {
  const zone = $('#curseurs');
  zone.innerHTML = '';
  const os = S.completerGabarit(ed.gabarit).osEnPlus.map((o) => o.nom);
  for (const [titre, noms] of GROUPES.concat(os.length ? [['Os en plus', os]] : [])) {
    const f = document.createElement('fieldset');
    f.innerHTML = `<legend>${titre}</legend>`;
    for (const n of noms) {
      const [min, max, pas] = bornes(n);
      const l = document.createElement('label');
      l.className = 'curseur';
      l.dataset.angle = n;
      l.innerHTML = `<span>${libelle(n)}</span><input type="number" step="${pas}" data-valeur="${n}" aria-label="${libelle(n)} (valeur)"><input type="range" min="${min}" max="${max}" step="${pas}" data-curseur="${n}" aria-label="${libelle(n)}">`;
      f.appendChild(l);
    }
    zone.appendChild(f);
  }
}
function majCurseurs() {
  const v = ed.valeurs();
  const animes = ed.type === 'clip' ? K.pistes(ed.objet, lu) : ed.objet.angles;
  document.querySelectorAll('#curseurs .curseur').forEach((l) => {
    const n = l.dataset.angle;
    const val = typeof v[n] === 'number' ? v[n] : (additif() ? 0 : (S.REPOS[n] || 0));
    const r = l.querySelector('[data-curseur]');
    const c = l.querySelector('[data-valeur]');
    if (document.activeElement !== r) r.value = val;
    if (document.activeElement !== c) c.value = Math.round(val * 100) / 100;
    l.classList.toggle('anime', n in animes);
  });
}
let gesteCurseur = false;
$('#curseurs').addEventListener('pointerdown', (ev) => { if (ev.target.dataset.curseur) { gesteCurseur = true; ed.debutGeste(); } });
const finCurseur = () => { if (gesteCurseur) { gesteCurseur = false; ed.finGeste(); } };
document.addEventListener('pointerup', finCurseur);
document.addEventListener('pointercancel', finCurseur);
$('#curseurs').addEventListener('input', (ev) => {
  const n = ev.target.dataset.curseur;
  if (!n) return;
  ed.regler(n, borner(n, Number(ev.target.value)));
  rendre();
});
$('#curseurs').addEventListener('change', (ev) => {
  const n = ev.target.dataset.valeur;
  if (n && ev.target.value !== '') { ed.regler(n, borner(n, Number(ev.target.value))); }
  finCurseur();
  rendre();
});

/* ---------- frise ---------- */
function versU(ev) {
  const b = $('#piste').getBoundingClientRect();
  return Math.min(1, Math.max(0, (ev.clientX - b.left) / b.width)) * ed.longueurFrise();
}
function majFrise() {
  const visible = ed.type === 'clip';
  $('#frise').hidden = !visible;
  $('#proprietes').hidden = !visible;
  if (!visible) return;
  const L = ed.longueurFrise();
  const piste = $('#piste');
  // Marqueurs réutilisés (pas recréés) : un marqueur tenu par la souris garde la capture du pointeur.
  const marqueurs = [...piste.querySelectorAll('.cle')];
  while (marqueurs.length > ed.objet.cles.length) marqueurs.pop().remove();
  while (marqueurs.length < ed.objet.cles.length) { const b = document.createElement('button'); piste.appendChild(b); marqueurs.push(b); }
  ed.objet.cles.forEach((c, i) => {
    const b = marqueurs[i];
    b.className = 'cle' + (c.pose ? ' pose' : '') + (i === ed.selection ? ' choisie' : '');
    b.style.left = `${c.t / L * 100}%`;
    b.dataset.indice = i;
    b.title = `${c.pose ? `pose « ${c.pose} » · ` : ''}${ed.unite() === 'phase' ? 'phase ' : ''}${virgule(c.t, 3)}${ed.unite() === 's' ? ' s' : ''}`;
    b.setAttribute('aria-label', `Clé ${i + 1} : ${b.title}`);
  });
  $('#tete-lecture').style.left = `${ed.position() / L * 100}%`;
  $('#temps').textContent = ed.unite() === 'phase' ? `phase ${virgule(ed.position())}` : `${virgule(ed.temps)} s / ${virgule(ed.duree())} s`;
  const choisie = ed.selection !== null ? ed.objet.cles[ed.selection] : null;
  $('#courbe').value = (choisie && choisie.courbe) || 'sine-inout';
  $('#supprimer').disabled = $('#dupliquer').disabled = $('#courbe').disabled = !choisie;
}
let cleGlissee = null;
$('#piste').addEventListener('pointerdown', (ev) => {
  const cle = ev.target.closest('.cle');
  if (cle) {
    ev.preventDefault();
    cle.setPointerCapture(ev.pointerId);
    cleGlissee = { indice: Number(cle.dataset.indice), bouge: false };
    ed.selectionner(cleGlissee.indice);
    ed.allerA(ed.objet.cles[cleGlissee.indice].t);
    ed.debutGeste();
  } else {
    ed.selectionner(null);
    ed.allerA(versU(ev));
  }
  rendre();
});
$('#piste').addEventListener('pointermove', (ev) => {
  if (!cleGlissee) return;
  if (ev.buttons === 0) { finCle(); return; }
  const u = versU(ev);
  if (ed.deplacerCle(ed.selection, u)) { cleGlissee.bouge = true; ed.allerA(ed.objet.cles[ed.selection].t); rendre(); }
});
function finCle() { if (cleGlissee) { cleGlissee = null; ed.finGeste(); rendre(); } }
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#piste').addEventListener(type, finCle);
$('#piste').addEventListener('dragover', (ev) => ev.preventDefault());
$('#piste').addEventListener('drop', (ev) => {
  ev.preventDefault();
  const nom = (ev.dataTransfer.getData('text/plain') || '').replace(/^pose:/, '');
  if (!lu.poses[nom]) return;
  ed.allerA(versU(ev));
  try { ed.poserPose(nom); } catch (e) { message(e.message, 'erreur'); return; }
  rendre();
});

/* ---------- propriétés du clip ---------- */
function majProprietes() {
  if (ed.type !== 'clip') return;
  const o = ed.objet;
  const actif = document.activeElement;
  $('#boucle').checked = !!o.boucle;
  $('#additif').checked = !!o.additif;
  $('#pieds').value = o.pieds || 'libres';
  for (const k of ['duree', 'foulee', 'miroir']) if (actif !== $(`#${k}`)) $(`#${k}`).value = o[k] === undefined ? '' : o[k];
  $('#duree').disabled = $('#miroir').disabled = !o.boucle;
}
$('#proprietes').addEventListener('change', (ev) => {
  const id = ev.target.id;
  const v = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
  if (id === 'boucle') {
    const miroir = ed.objet.miroir;
    ed.proprietes({ boucle: v });
    if (!v && miroir) message('Le miroir ne sert qu\'aux cycles : il a été retiré, les membres Arrière ne suivent plus les membres Avant (Annuler pour revenir).', '');
  }
  else if (id === 'additif') ed.proprietes({ additif: v ? true : null, ...(v ? { pieds: null } : {}) });
  else if (id === 'pieds') ed.proprietes({ pieds: v === 'libres' ? null : v });
  else if (['duree', 'foulee', 'miroir'].includes(id)) ed.proprietes({ [id]: v === '' || Number(v) === 0 && id === 'miroir' ? null : Number(v) });
  construireCurseurs();
  rendre();
});

/* ---------- bibliothèque, fichier ---------- */
function construireBibliotheque() {
  const liste = (ul, noms, faire) => {
    ul.innerHTML = '';
    for (const nom of noms.sort()) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.textContent = nom;
      b.draggable = true;
      b.addEventListener('dragstart', (ev) => ev.dataTransfer.setData('text/plain', `pose:${nom}`));
      b.addEventListener('click', () => faire(nom));
      li.appendChild(b);
      ul.appendChild(li);
    }
  };
  liste($('#poses'), Object.keys(lu.poses), (nom) => {
    try { ed.poserPose(nom); } catch (e) { message(e.message, 'erreur'); return; }
    rendre();
  });
  liste($('#clips'), Object.keys(lu.clips), (nom) => {
    if (ed.modifie() && !confirmer('Les modifications non enregistrées seront perdues. Ouvrir ce mouvement ?')) return;
    ouvrir('clip', nom, lu.clips[nom]);
  });
  $('#clips').querySelectorAll('button').forEach((b) => { b.draggable = false; });
}

function ouvrir(type, nom, objet) {
  ed = creerEdition({ type, nom, objet: objet || nouvelObjet(type), lu, gabarit: gabaritCourant() }, { clips: K, squelette: S });
  $('#type').value = type;
  $('#nom').value = nom || '';
  $('#description').value = (objet && objet.description) || '';
  construireCurseurs();
  rendre();
}

$('#type').addEventListener('change', (ev) => {
  if (ed.modifie() && !confirmer('Les modifications non enregistrées seront perdues. Commencer une nouvelle ' + (ev.target.value === 'pose' ? 'pose' : 'animation') + ' ?')) { ev.target.value = ed.type; return; }
  ouvrir(ev.target.value, '', null);
});
$('#description').addEventListener('change', (ev) => { ed.proprietes({ description: ev.target.value.trim() || null }); });
$('#gabarit').addEventListener('change', () => { ed.changerGabarit(gabaritCourant()); construireCurseurs(); rendre(); });

async function enregistrer(remplacer = false) {
  const nom = $('#nom').value.trim();
  const corps = { type: ed.type, nom, objet: ed.versObjet(), remplacer };
  const r = await fetch('/_pm/personnages/enregistrer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  const d = await r.json();
  if (r.status === 409 && !remplacer) {
    if (confirmer(d.message)) return enregistrer(true);
    message('Rien n\'a été enregistré.', '');
    return d;
  }
  if (!r.ok) { message((d.erreurs || [d.message]).join('\n'), 'erreur'); return d; }
  ed.marquerEnregistre();
  ed.nom = nom;
  lu[ed.type === 'clip' ? 'clips' : 'poses'][nom] = Object.assign({ nom }, corps.objet);
  construireBibliotheque();
  message(`Enregistré : ${d.fichier}`, 'ok');
  return d;
}
$('#enregistrer').addEventListener('click', () => { enregistrer().catch((e) => message(e.message, 'erreur')); });
$('#annuler').addEventListener('click', () => { if (ed.annuler()) rendre(); });
$('#retablir').addEventListener('click', () => { if (ed.retablir()) rendre(); });

/* ---------- visage et habillage ---------- */
function majChoix() {
  const visible = !(ed.type === 'clip' && ed.objet.additif);
  $('#visage').hidden = !visible;
  if (!visible) return;
  const c = ed.choix();
  if (document.activeElement !== $('#expression')) $('#expression').value = c.expression || '';
  if (document.activeElement !== $('#bouche')) $('#bouche').value = c.bouche || '';
}
for (const champ of ['expression', 'bouche']) {
  $(`#${champ}`).addEventListener('change', (ev) => {
    try { ed.reglerChoix(champ, ev.target.value || null); } catch (e) { message(e.message, 'erreur'); }
    rendre();
  });
}

function choisirHabillage(nom) {
  habillage = nom === 'batonnets' || lu.dessins[nom] ? nom : 'batonnets';
  $('#habillage').value = habillage;
  $('#gabarit').disabled = habillage !== 'batonnets';
  ed.changerGabarit(gabaritCourant());
  creerPersos();
  construireCurseurs();
  rendre();
}
$('#habillage').addEventListener('change', (ev) => choisirHabillage(ev.target.value));

/* ---------- vue, lecture, clavier ---------- */
document.querySelectorAll('[data-vue]').forEach((b) => b.addEventListener('click', () => { $('#tourner').checked = tourne = false; vue = Number(b.dataset.vue); rendre(); }));
$('#vue').addEventListener('input', (ev) => { $('#tourner').checked = tourne = false; vue = Number(ev.target.value); rendre(); });
$('#tourner').addEventListener('change', (ev) => { tourne = ev.target.checked; });
function basculerLecture() { lecture = !lecture; $('#lecture').textContent = lecture ? '❚❚' : '▶'; $('#lecture').setAttribute('aria-label', lecture ? 'Pause' : 'Lecture'); }
$('#lecture').addEventListener('click', basculerLecture);
const image = (sens) => { if (lecture) basculerLecture(); ed.avancer(sens * PAS_IMAGE); rendre(); };
$('#image-avant').addEventListener('click', () => image(-1));
$('#image-apres').addEventListener('click', () => image(1));
$('#ajouter').addEventListener('click', () => { ed.ajouterCle(); rendre(); });
$('#dupliquer').addEventListener('click', () => {
  const L = ed.longueurFrise();
  const t = ed.objet.cles[ed.selection].t;
  for (const pas of [0.1, 0.05, 0.02, -0.05, -0.1]) { const i = ed.dupliquerCle(ed.selection, t + pas * L); if (i >= 0) { ed.allerA(ed.objet.cles[i].t); break; } }
  rendre();
});
$('#supprimer').addEventListener('click', () => { if (!ed.supprimerCle(ed.selection)) message('Un mouvement garde au moins une clé.', ''); rendre(); });
$('#courbe').addEventListener('change', (ev) => { if (ed.selection !== null) ed.courbe(ed.selection, ev.target.value); rendre(); });
document.addEventListener('keydown', (ev) => {
  if (ev.target.matches('input, select, textarea')) return;
  if (ev.code === 'Space') { ev.preventDefault(); basculerLecture(); }
  else if (ev.key === ',') image(-1);
  else if (ev.key === '.') image(1);
  else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); if (ev.shiftKey ? ed.retablir() : ed.annuler()) rendre(); }
  else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); if (ed.retablir()) rendre(); }
  else if ((ev.key === 'Delete' || ev.key === 'Backspace') && ed.selection !== null) { ed.supprimerCle(ed.selection); rendre(); }
});
window.addEventListener('beforeunload', (ev) => { if (ed && ed.modifie()) { ev.preventDefault(); ev.returnValue = ''; } });

let avant = performance.now();
function boucle(maintenant) {
  const dt = Math.min(0.1, (maintenant - avant) / 1000);
  avant = maintenant;
  if (lecture && ed.type === 'clip') {
    ed.avancer(dt);
    if (!ed.objet.boucle && ed.temps > ed.duree()) {
      if ($('#boucle-lecture').checked) ed.aller(0);
      else { ed.aller(ed.duree()); basculerLecture(); }
    }
    sale = true;
  }
  if (tourne) { vue = ((vue + 60 * dt + 180) % 360 + 360) % 360 - 180; sale = true; }
  if (sale) rendre();
  requestAnimationFrame(boucle);
}

/* ---------- démarrage ---------- */
(async () => {
  try {
    contexte = await (await fetch('/_pm/personnages/contexte')).json();
  } catch (e) {
    message(`Atelier indisponible : ${e.message}`, 'erreur');
    return;
  }
  lu = contexte.lu;
  $('#cible').textContent = contexte.message;
  $('#enregistrer').disabled = !contexte.cible;
  if (contexte.erreurs.length) message(`Fichiers ignorés :\n${contexte.erreurs.join('\n')}`, 'erreur');
  const gabarits = Object.keys(lu.gabarits).sort();
  $('#gabarit').innerHTML = gabarits.map((g) => `<option value="${g}"${g === 'standard' ? ' selected' : ''}>${g}</option>`).join('');
  $('#habillage').innerHTML = ['<option value="batonnets">bâtonnets</option>', ...Object.keys(lu.dessins).sort().map((d) => `<option value="${d}">${d}</option>`)].join('');
  $('#expression').innerHTML = ['<option value="">aucune</option>', ...Object.keys(lu.expressions).map((e) => `<option value="${e}">${e}</option>`)].join('');
  $('#bouche').innerHTML = ['<option value="">aucune (selon l\'expression)</option>', ...BOUCHES.map((b) => `<option value="${b}">${b}</option>`)].join('');
  const voulu = new URLSearchParams(location.search).get('dessin');
  if (voulu && lu.dessins[voulu]) habillage = voulu;
  $('#habillage').value = habillage;
  $('#gabarit').disabled = habillage !== 'batonnets';
  creerPersos();
  construireBibliotheque();
  const nom = new URLSearchParams(location.search).get('nom');
  if (nom && lu.clips[nom]) ouvrir('clip', nom, lu.clips[nom]);
  else if (nom && lu.poses[nom]) ouvrir('pose', nom, lu.poses[nom]);
  else ouvrir('clip', nom || '', null);
  if (voulu && !lu.dessins[voulu]) message(`Dessin « ${voulu} » introuvable : l'atelier montre les bâtonnets.`, 'erreur');
  window.__atelier = {
    pret: true,
    ed: () => ed,
    rendre,
    enregistrer,
    habillage: () => habillage,
    poignee(n) {
      const c = poignees[n];
      if (!c) return null;
      const b = c.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    },
  };
  requestAnimationFrame(boucle);
})();
