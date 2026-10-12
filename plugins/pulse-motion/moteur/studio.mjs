/* Pulse Motion – studio de voix de l'aperçu (servi par /_pm/studio.mjs, jamais dans la page livrée).
 *
 * Bouton « Voix » dans le lecteur : choix de la scène, prompteur, compte à rebours de 3 s, enregistrement au micro
 * (son de la vidéo coupé), vumètre, réécoute (scène sans son + prise), « Garder » (envoi à l'aperçu) ou « Refaire ».
 * ?studio=<id> ouvre le studio sur cette scène. Pendant une prise, un rechargement de l'aperçu attend (M.exportEnCours).
 * Pour les tests : M.studio = { ouvrir, enregistrer, arreter, reecouter, garder, refaire, etat }.
 */
const M = globalThis.M;
const COMPTE = 3;
const MAX_SECONDES = 120;
const MESSAGES = {
  choix: 'Choisissez une scène.',
  pret: 'Prêt : lisez le texte quand l\'enregistrement commence.',
  compte: 'Attention…',
  enregistre: 'Enregistrement…',
  ecoute: 'Écoutez la prise : la garder, ou refaire.',
  envoi: 'Enregistrement de la prise…',
};

let panneau = null;
let scenes = [];
const etat = { scene: null, phase: 'choix', message: '' };
let prise = null;          // { octets: Uint8Array, url, duree }
let enregistreur = null;

function el(tag, attrs = {}, parent) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'texte') e.textContent = v; else e.setAttribute(k, v); }
  if (parent) parent.appendChild(e);
  return e;
}

function poser(phase, message = '') {
  etat.phase = phase;
  etat.message = message;
  if (!panneau) return;
  panneau.querySelector('.pm-studio-etat').textContent = message || MESSAGES[phase] || '';
  panneau.dataset.phase = phase;
}

function debutScene(id) {
  const s = M.minutage.scenes.find((x) => x.id === id);
  return s ? s.debut : 0;
}

async function chargerScenes() {
  const r = await fetch('/_pm/voix/scenes', { cache: 'no-store' });
  scenes = r.ok ? await r.json() : [];
}

function construire() {
  if (panneau) return;
  panneau = el('div', { id: 'pm-studio' }, document.body);
  panneau.style.cssText = 'position:fixed;inset:16px 16px auto auto;z-index:30;width:360px;max-height:80vh;overflow:auto;padding:14px 16px;border-radius:10px;'
    + 'background:#1b1b1b;color:#eee;font:14px/1.45 system-ui,sans-serif;box-shadow:0 6px 24px rgb(0 0 0/.45)';
  el('p', { class: 'pm-studio-titre', texte: 'Voix' }, panneau).style.cssText = 'margin:0 0 8px;font-weight:700';
  el('select', { class: 'pm-studio-scene', 'aria-label': 'Scène' }, panneau);
  el('p', { class: 'pm-studio-prompteur' }, panneau).style.cssText = 'font-size:20px;line-height:1.35;margin:12px 0;color:#fff';
  const vumetre = el('div', { class: 'pm-studio-vumetre' }, panneau);
  vumetre.style.cssText = 'height:6px;background:#333;border-radius:3px;overflow:hidden';
  el('div', {}, vumetre).style.cssText = 'height:100%;width:0;background:#4caf50';
  el('p', { class: 'pm-studio-etat' }, panneau).style.cssText = 'margin:10px 0;color:#bbb';
  const boutons = el('div', { class: 'pm-studio-boutons' }, panneau);
  const bouton = (nom, texte, action) => { const b = el('button', { type: 'button', 'data-action': nom, texte }, boutons); b.addEventListener('click', action); return b; };
  bouton('enregistrer', '● Enregistrer', () => M.studio.enregistrer().catch(() => {}));
  bouton('arreter', '■ Arrêter', () => M.studio.arreter());
  bouton('reecouter', '▶ Réécouter', () => M.studio.reecouter());
  bouton('garder', 'Garder', () => M.studio.garder().catch(() => {}));
  bouton('refaire', 'Refaire', () => M.studio.refaire());
  bouton('fermer', 'Fermer', () => { panneau.remove(); panneau = null; });
  panneau.querySelector('.pm-studio-scene').addEventListener('change', (e) => M.studio.ouvrir(e.target.value));
}

function remplir() {
  const choix = panneau.querySelector('.pm-studio-scene');
  choix.textContent = '';
  for (const s of scenes) {
    const etiquette = s.etat === 'enregistree' ? 'enregistrée' : s.etat === 'provisoire' ? 'voix provisoire' : 'à enregistrer';
    el('option', { value: s.id, texte: `${s.id} (${etiquette})` }, choix);
  }
}

/** Ouvre le studio sur une scène (ou la première qui a un texte). */
async function ouvrir(id) {
  await chargerScenes();
  construire();
  remplir();
  const s = scenes.find((x) => x.id === id) || scenes[0];
  if (!s) { poser('erreur', 'Aucune scène n\'a de texte à dire : écrire d\'abord « voix.texte » dans le déroulé.'); return; }
  etat.scene = s.id;
  panneau.querySelector('.pm-studio-scene').value = s.id;
  panneau.querySelector('.pm-studio-prompteur').textContent = s.texte;
  M.rendre(debutScene(s.id));
  poser('pret');
}

function vumetre(flux) {
  const contexte = new AudioContext();
  const analyse = contexte.createAnalyser();
  contexte.createMediaStreamSource(flux).connect(analyse);
  const donnees = new Float32Array(analyse.fftSize);
  const barre = panneau && panneau.querySelector('.pm-studio-vumetre > div');
  let actif = true;
  (function boucle() {
    if (!actif) return;
    analyse.getFloatTimeDomainData(donnees);
    let s = 0;
    for (const v of donnees) s += v * v;
    if (barre) barre.style.width = `${Math.min(100, Math.sqrt(s / donnees.length) * 400)}%`;
    requestAnimationFrame(boucle);
  })();
  return () => { actif = false; contexte.close(); };
}

const boutonLecture = () => document.querySelector('#pm-lecteur button');
/** La scène se joue depuis son début (son coupé) : la personne cale sa lecture sur l'animation. */
function lireScene() {
  M.rendre(debutScene(etat.scene));
  const b = boutonLecture();
  if (b && b.getAttribute('aria-label') === 'Lecture') b.click();
}
function arreterScene() {
  const b = boutonLecture();
  if (b && b.getAttribute('aria-label') === 'Pause') b.click();
}

/** Enregistre une prise (secondes : durée fixe, sinon jusqu'à « Arrêter »). -> { duree } */
async function enregistrer(secondes) {
  if (!etat.scene) throw new Error('aucune scène');
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices) {
    poser('erreur', 'Ce navigateur ne sait pas enregistrer : ouvrez l\'aperçu dans Chrome ou Edge, ou importez un fichier (pulse-motion voix importer).');
    throw new Error('MediaRecorder absent');
  }
  let flux;
  try {
    flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    poser('erreur', 'Le micro est refusé ou introuvable : autorisez le micro pour cette page (icône à gauche de l\'adresse), ou importez un fichier (pulse-motion voix importer).');
    throw e;
  }
  M.exportEnCours = true;   // un rechargement de l'aperçu attend la fin de la prise
  M.couperSon(true);
  try {
    for (let n = COMPTE; n > 0; n--) { poser('compte', `${n}…`); await new Promise((r) => setTimeout(r, 1000)); }
    const morceaux = [];
    enregistreur = new MediaRecorder(flux);
    enregistreur.ondataavailable = (e) => { if (e.data && e.data.size) morceaux.push(e.data); };
    const fini = new Promise((r) => { enregistreur.onstop = r; });
    const couperVumetre = vumetre(flux);
    enregistreur.start();
    poser('enregistre');
    lireScene();
    const limite = setTimeout(() => arreter(), (secondes || MAX_SECONDES) * 1000);
    await fini;
    clearTimeout(limite);
    couperVumetre();
    arreterScene();
    const brut = await new Blob(morceaux, { type: enregistreur.mimeType }).arrayBuffer();
    const decode = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(brut);
    const canaux = [];
    for (let c = 0; c < decode.numberOfChannels; c++) canaux.push(decode.getChannelData(c));
    const pret = M.wav.preparerPrise({ taux: decode.sampleRate, canaux });
    const octets = M.wav.ecrire(pret);
    if (prise && prise.url) URL.revokeObjectURL(prise.url);
    prise = { octets, url: URL.createObjectURL(new Blob([octets], { type: 'audio/wav' })), duree: pret.canaux[0].length / pret.taux };
    poser('ecoute');
    return { duree: prise.duree };
  } catch (e) {
    if (etat.phase !== 'erreur') poser('erreur', `La prise n'a pas pu être enregistrée (${e.message}).`);
    throw e;
  } finally {
    flux.getTracks().forEach((p) => p.stop());
    M.couperSon(false);
    if (M.finExport) M.finExport(); else M.exportEnCours = false;
  }
}

function arreter() { if (enregistreur && enregistreur.state === 'recording') enregistreur.stop(); }

/** Réécoute : la scène se joue sans son, la nouvelle prise par-dessus (la musique revient une fois la prise gardée). */
function reecouter() {
  if (!prise) return;
  M.couperSon(true);
  const audio = new Audio(prise.url);
  audio.onended = () => { arreterScene(); M.couperSon(false); };
  lireScene();
  audio.play();
}

/** Envoie la prise à l'aperçu, qui l'écrit dans le projet. -> { fichier, duree, transcription } */
async function garder() {
  if (!prise) throw new Error('aucune prise');
  poser('envoi');
  const r = await fetch(`/_pm/voix?scene=${encodeURIComponent(etat.scene)}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: prise.octets });
  const corps = await r.json().catch(() => ({}));
  if (!r.ok) {
    poser('erreur', corps.message || `La prise n'a pas pu être enregistrée (${r.status}).`);
    throw new Error(corps.message || String(r.status));
  }
  poser('pret', corps.transcription === 'en-cours' ? 'Prise gardée ; transcription en cours, l\'aperçu se mettra à jour.' : 'Prise gardée.');
  return corps;
}

function refaire() {
  prise = null;
  poser('pret');
}

M.studio = { ouvrir, enregistrer, arreter, reecouter, garder, refaire, etat: () => ({ ...etat }) };

function ajouterBouton() {
  const barre = document.getElementById('pm-lecteur');
  if (!barre || document.getElementById('pm-bouton-voix')) return;
  const b = el('button', { id: 'pm-bouton-voix', type: 'button', texte: 'Voix', title: 'Enregistrer la voix', 'aria-label': 'Enregistrer la voix' }, barre);
  b.style.cssText = 'width:auto;padding:0 12px;border-radius:16px;font-weight:600';
  b.addEventListener('click', (e) => { e.stopPropagation(); ouvrir(etat.scene); });
}

M.pret.then(() => {
  ajouterBouton();
  const id = new URLSearchParams(location.search).get('studio');
  if (id) ouvrir(id);
});
