/* Pulse Motion – réglages rapides dans l'aperçu (spec Retouches et ergonomie, 5.11 ; references/reglages-rapides.md).
 *
 * Bouton « Réglages » de la barre : cinq réglages à valeurs fixes (couleur d'accent, allure, ton, musique, sous-titres).
 * La valeur marquée est toujours la valeur actuelle de la vidéo. Un clic l'écrit dans le déroulé par POST /_pm/reglages
 * (sauvegarde d'historique d'abord : « annule » le défait) ; l'aperçu se recharge alors seul, à la même position, et le
 * panneau se rouvre. Un réglage indisponible est grisé, avec sa raison. Aperçu seulement, hors de #pm-scene.
 */
const M = globalThis.M;
const CLE_OUVERT = 'pm-reglages-ouvert';
const CLE_DERNIER = 'pm-reglages-dernier';

let panneau = null;

function el(tag, attrs = {}, parent = null) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'texte') e.textContent = v;
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v);
  }
  if (parent) parent.appendChild(e);
  return e;
}

async function requete(corps) {
  const r = await fetch('/_pm/reglages', corps === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erreur || `Échec (${r.status}).`);
  return d;
}

function message(texte) {
  const m = panneau && panneau.querySelector('.pm-reglages-message');
  if (m) m.textContent = texte;
}

async function choisir(cle, valeur) {
  try {
    const r = await requete({ cle, valeur });
    if (r.inchange) { message(`${r.resume} : c'est déjà le cas.`); return; }
    try { sessionStorage.setItem(CLE_DERNIER, r.resume); } catch { /* ignoré */ }
    message(`${r.resume}. La vidéo se met à jour…`);
  } catch (e) {
    message(e.message);
  }
}

async function dessiner() {
  if (!panneau) return;
  let donnees;
  try { donnees = await requete(); } catch (e) { panneau.textContent = e.message; return; }
  panneau.textContent = '';
  const tete = el('div', { style: 'display:flex;align-items:center;justify-content:space-between' }, panneau);
  el('strong', { texte: 'Réglages', style: 'font-size:15px' }, tete);
  const fermer = el('button', { type: 'button', texte: 'Fermer', style: 'padding:4px 10px;border:0;border-radius:6px;background:#333;color:#eee;cursor:pointer;font:inherit' }, tete);
  fermer.addEventListener('click', (e) => { e.stopPropagation(); basculer(false); });
  for (const r of donnees.reglages) {
    const bloc = el('fieldset', { 'data-reglage': r.cle, style: 'margin:0;padding:6px 0;border:0;border-top:1px solid #333' }, panneau);
    el('legend', { texte: r.libelle, style: 'padding:0;font-weight:600' }, bloc);
    const choix = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin-top:4px' }, bloc);
    for (const v of r.valeurs) {
      const actuelle = v.valeur === r.actuelle;
      const b = el('button', { type: 'button', 'data-valeur': v.valeur, 'aria-pressed': String(actuelle), title: r.grise ? (r.raison || '') : v.libelle,
        style: `display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:14px;cursor:${r.grise ? 'not-allowed' : 'pointer'};font:inherit;`
          + `border:2px solid ${actuelle ? '#e8590c' : '#444'};background:${actuelle ? '#3a2416' : '#262626'};color:#eee;opacity:${r.grise ? 0.45 : 1}` }, choix);
      if (v.couleur) el('span', { 'aria-hidden': 'true', style: `width:14px;height:14px;border-radius:50%;background:${v.couleur};border:1px solid #fff` }, b);
      el('span', { texte: v.libelle }, b);
      if (r.grise) b.disabled = true;
      b.addEventListener('click', (e) => { e.stopPropagation(); if (!actuelle) choisir(r.cle, v.valeur); });
    }
    if (r.grise && r.raison) el('div', { texte: r.raison, style: 'margin-top:4px;color:#888;font-size:12px' }, bloc);
  }
  el('p', { texte: 'Chaque choix se défait en disant « annule » à Claude.', style: 'margin:4px 0 0;color:#aaa;font-size:12px' }, panneau);
  const m = el('p', { class: 'pm-reglages-message', role: 'status', style: 'margin:0;min-height:1.4em;color:#ffd8a8' }, panneau);
  try {
    const dernier = sessionStorage.getItem(CLE_DERNIER);
    if (dernier) { m.textContent = `${dernier} : c'est fait.`; sessionStorage.removeItem(CLE_DERNIER); }
  } catch { /* ignoré */ }
}

function basculer(ouvrir) {
  const voulu = typeof ouvrir === 'boolean' ? ouvrir : !(panneau && !panneau.hidden);
  if (!voulu) {
    if (panneau) panneau.hidden = true;
    try { sessionStorage.removeItem(CLE_OUVERT); } catch { /* ignoré */ }
    return;
  }
  if (!panneau) {
    panneau = el('aside', { id: 'pm-reglages', 'data-pm-clavier': '', 'aria-label': 'Réglages',
      style: 'position:fixed;left:12px;bottom:64px;z-index:22;width:340px;max-height:calc(100vh - 88px);overflow:auto;display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:10px;background:#1b1b1b;color:#eee;font:13px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgb(0 0 0/.45)' }, document.body);
    panneau.addEventListener('click', (e) => e.stopPropagation());
  }
  panneau.hidden = false;
  try { sessionStorage.setItem(CLE_OUVERT, '1'); } catch { /* ignoré */ }
  return dessiner();
}

function ajouterBouton() {
  const barre = document.getElementById('pm-lecteur');
  if (!barre || document.getElementById('pm-bouton-reglages')) return;
  const b = el('button', { id: 'pm-bouton-reglages', type: 'button', texte: 'Réglages', title: 'Réglages rapides de la vidéo',
    style: 'width:auto;padding:0 12px;border-radius:16px;font-weight:600' }, barre);
  b.addEventListener('click', (e) => { e.stopPropagation(); basculer(); });
}

/** Pour les essais : ouvre le panneau et rend la promesse de son dessin. */
M.reglagesApercu = { ouvrir: () => basculer(true), fermer: () => basculer(false) };

if (!globalThis.__PM_VERSION__ && window.top === window) {
  M.pret.then(() => {
    ajouterBouton();
    let ouvert = false;
    try { ouvert = sessionStorage.getItem(CLE_OUVERT) === '1'; } catch { /* ignoré */ }
    if (ouvert) basculer(true);
  });
}
