/* Pulse Motion – interface d'export dans l'aperçu.
 *
 * Ajoute le bouton « MP4 » au lecteur : il ouvre un petit menu de quatre usages (Web, Réseaux, Présentation, Courriel ;
 * spec Rendu et export 5.4 point 6), puis affiche la progression (image n / total, temps restant estimé sur les 20
 * dernières secondes : moteur/estimation.js, bouton Annuler) et le résultat. Paramètres d'adresse utilisés par
 * « pulse-motion exporter » : ?export=1 lance l'export, avec &pour=, &qualite=, &ips=, &taille= (réglages résolus par
 * l'aperçu, /_pm/usage), &scene=, &plage=, &cadre=, &cadreFormat= (extrait, passage seul, cadre de téléphone : spec Rendu et
 * export 5.12 et 5.15) ; ?planche=id1,id2 capture la planche. La couverture (5.10) est envoyée avant la vidéo ; crédits et
 * chapitres sont écrits par l'aperçu à la réception de la vidéo.
 */
import { exporter, relire, envoyer, envoyerStats, envoyerCouverture, signaler, capturerPlanche } from '/_pm/export.mjs';
import '/_pm/estimation.js';

const M = globalThis.M;
/** Horloge réelle, prise au chargement : en mode capture, performance.now suit le temps de la vidéo. */
const horloge = performance.now.bind(performance);

/** Usages du menu de l'aperçu (les deux autres, master et brouillon, se demandent en mots). */
export const MENU = [['web', 'Web'], ['reseaux', 'Réseaux'], ['presentation', 'Présentation'], ['courriel', 'Courriel']];

/** Réglages effectifs d'un export, résolus par l'aperçu comme dans la voie fidèle. -> réglages | throw Error(message) */
async function reglagesDe(choix = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(choix)) if (v !== undefined && v !== null && v !== '') q.set(k, v);
  const r = await fetch(`/_pm/usage?${q}`);
  const corps = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corps.erreur || `Réglages d'export illisibles (${r.status}).`);
  return corps;
}

/** La page a-t-elle un grain dont la cadence dépend de l'usage (courriel) ? */
function grainALaCarte() {
  return (M.donnees.shaders || []).some((sh) => sh && sh.usage === 'post' && sh.nom === 'grain');
}

function creerPanneau() {
  const panneau = document.createElement('div');
  panneau.id = 'pm-export';
  panneau.innerHTML = '<p class="pm-export-titre"></p><progress max="1" value="0"></progress><p class="pm-export-detail"></p><button type="button">Annuler</button>';
  panneau.style.cssText = 'position:fixed;inset:auto 16px 64px auto;z-index:20;width:320px;padding:14px 16px;border-radius:10px;' +
    'background:#1b1b1b;color:#eee;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgb(0 0 0/.4)';
  panneau.querySelector('progress').style.cssText = 'width:100%';
  document.body.appendChild(panneau);
  return {
    titre: (t) => { panneau.querySelector('.pm-export-titre').textContent = t; },
    detail: (t) => { panneau.querySelector('.pm-export-detail').textContent = t; },
    progression: (v) => { panneau.querySelector('progress').value = v; },
    bouton: panneau.querySelector('button'),
    fermerDans: (ms) => setTimeout(() => panneau.remove(), ms),
  };
}

let enCours = false;

/** Scènes qui jouent encore la voix provisoire du système. */
function scenesProvisoires() {
  return (M.donnees.scenes || []).filter((s) => s.voix && s.voix.provisoire).map((s) => s.id);
}

export async function lancerExport({ avecProvisoire = false, pour, qualite, ips, taille, scene, plage, cadre, cadreFormat } = {}) {
  if (enCours) return null;
  const provisoires = scenesProvisoires();
  if (provisoires.length && !avecProvisoire) {
    // Voix de l'ordinateur encore là (spec Retouches et ergonomie, 5.17) : un choix plutôt qu'un refus. « Enregistrer ma voix
    // d'abord » ouvre le studio ; « Exporter une version de travail » fait un fichier à part (le MP4 définitif n'est pas touché).
    const panneau = creerPanneau();
    panneau.titre('La vidéo parle encore avec la voix de l\'ordinateur');
    panneau.detail(`Scènes : ${provisoires.join(', ')}.`);
    panneau.bouton.textContent = 'Enregistrer ma voix d\'abord (Recommandé)';
    panneau.bouton.dataset.choix = 'voix';
    const travail = document.createElement('button');
    travail.type = 'button';
    travail.dataset.choix = 'version-de-travail';
    travail.textContent = 'Exporter une version de travail';
    travail.style.cssText = 'margin-left:8px';
    panneau.bouton.after(travail);
    const options = { pour, qualite, ips, taille, scene, plage, cadre, cadreFormat };
    return new Promise((resoudre) => {
      panneau.bouton.onclick = () => {
        panneau.fermerDans(0);
        if (M.studio && M.studio.ouvrir) M.studio.ouvrir(provisoires[0]);
        signaler({ etat: 'erreur', message: 'Export arrêté : enregistrer la voix d\'abord.' });
        resoudre(null);
      };
      travail.onclick = () => {
        panneau.fermerDans(0);
        resoudre(lancerExport({ ...options, avecProvisoire: true }));
      };
    });
  }
  enCours = true;
  M.exportEnCours = true;
  const panneau = creerPanneau();
  const controle = new AbortController();
  panneau.bouton.onclick = () => controle.abort();
  panneau.titre('Export de la vidéo en MP4…');
  try {
    const reglages = await reglagesDe({ pour, qualite, ips, taille, scene, plage, cadre, cadreFormat });
    panneau.titre(`Export de la vidéo en MP4 (${reglages.nom.toLowerCase()})…`);
    const ipsExport = reglages.ips || M.ips;
    const total = reglages.sortie && reglages.sortie.extrait ? reglages.sortie.f1 - reglages.sortie.f0 : Math.round(M.duree * ipsExport);
    const estimation = M.estimation.creerEstimation({ total });
    await signaler({ etat: 'en-cours', images: 0, total });
    const resultat = await exporter({
      signal: controle.signal,
      reglages,
      surProgression: (n, tot) => {
        panneau.progression(n / tot);
        const t = horloge() / 1000;
        estimation.noter(n, t, 0);
        const restant = estimation.restant(t);
        panneau.detail(`Image ${n} / ${tot}${restant === null ? '' : ` – encore environ ${M.estimation.texteDuree(restant)}`}`);
        if (n % 30 === 0 || n === tot) signaler({ etat: 'en-cours', images: n, total: tot });
      },
    });
    panneau.titre('Vérification de la vidéo…');
    panneau.bouton.disabled = true;
    const relecture = await relire(resultat.buffer, { images: resultat.images, ips: resultat.ips, fondSombre: resultat.fondSombre, vignette: resultat.vignette });
    // Statistiques image par image (spec S2, 5.12) : analysées par l'aperçu à la réception de la vidéo (verification.json) ;
    // un extrait ne remplace pas la vérification de la vidéo entière.
    if (!resultat.extrait) await envoyerStats(resultat.stats);
    // Couverture (5.10) : envoyée avant la vidéo, pour que le suivi de l'export la compte parmi les fichiers joints.
    if (resultat.couverture && relecture.ok) await envoyerCouverture(resultat.couverture);
    const { fichier } = await envoyer(resultat.buffer, {
      ...relecture, audio: resultat.audio, largeur: resultat.largeur, hauteur: resultat.hauteur, avertissement: resultat.avertissement,
      usage: resultat.usage, definition: resultat.definition, ips: resultat.ips, imagesParSeconde: resultat.imagesParSeconde, finalesParSeconde: resultat.finalesParSeconde,
      couverture: Boolean(resultat.couverture), vignette: relecture.vignette, extrait: resultat.extrait,
    }, reglages.nomFichier, { extrait: resultat.extrait });
    panneau.titre('✅ Vidéo enregistrée');
    panneau.detail(resultat.avertissement ? `${fichier} – ${resultat.avertissement}` : fichier);
    panneau.bouton.textContent = 'Fermer';
    panneau.bouton.disabled = false;
    panneau.bouton.onclick = () => panneau.fermerDans(0);
    return fichier;
  } catch (e) {
    const annule = e && e.name === 'AbortError';
    panneau.titre(annule ? 'Export annulé' : 'L\'export a échoué');
    panneau.detail(annule ? 'Aucun fichier n\'a été écrit.' : String(e.message || e));
    panneau.bouton.textContent = 'Fermer';
    panneau.bouton.disabled = false;
    panneau.bouton.onclick = () => panneau.fermerDans(0);
    await signaler({ etat: annule ? 'annule' : 'erreur', message: annule ? 'Export annulé.' : String(e.message || e) });
    return null;
  } finally {
    enCours = false;
    if (M.finExport) M.finExport(); else M.exportEnCours = false;
  }
}

export async function lancerPlanche(scenes) {
  M.exportEnCours = true;
  try {
    const images = await capturerPlanche(scenes);
    for (const { nom, blob } of images) {
      const r = await fetch(`/_pm/planche/${encodeURIComponent(nom)}.png`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
      if (!r.ok) throw new Error(`Image « ${nom} » refusée (${r.status}).`);
    }
    await fetch('/_pm/planche-fin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images: images.map((i) => `${i.nom}.png`) }) });
  } catch (e) {
    await signaler({ etat: 'erreur', message: String(e.message || e) });
  } finally {
    if (M.finExport) M.finExport(); else M.exportEnCours = false;
  }
}

/** Un usage choisi dans le menu : un grain qui change avec l'usage (courriel) demande de recharger la page à ce réglage. */
function choisirUsage(pour) {
  const plafond = (window.__PM_GRAIN__ || {})[pour] || null;
  if (grainALaCarte() && (plafond || null) !== (M.grainMax || null)) {
    location.search = `?export=1&pour=${encodeURIComponent(pour)}`;
    return;
  }
  lancerExport({ pour });
}

/** Petit menu des quatre usages, au-dessus du bouton MP4. */
function ouvrirMenu(bouton) {
  const existant = document.getElementById('pm-menu-export');
  if (existant) { existant.remove(); bouton.setAttribute('aria-expanded', 'false'); return; }
  const menu = document.createElement('div');
  menu.id = 'pm-menu-export';
  menu.setAttribute('role', 'menu');
  menu.style.cssText = 'position:fixed;inset:auto 16px 64px auto;z-index:21;display:flex;flex-direction:column;gap:4px;padding:8px;border-radius:10px;'
    + 'background:#1b1b1b;color:#eee;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgb(0 0 0/.4)';
  for (const [pour, libelle] of MENU) {
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.dataset.pour = pour;
    item.textContent = libelle;
    item.style.cssText = 'all:unset;cursor:pointer;padding:6px 12px;border-radius:6px';
    item.addEventListener('click', (e) => { e.stopPropagation(); menu.remove(); bouton.setAttribute('aria-expanded', 'false'); choisirUsage(pour); });
    menu.appendChild(item);
  }
  document.body.appendChild(menu);
  bouton.setAttribute('aria-expanded', 'true');
  const fermer = (e) => { if (!menu.contains(e.target) && e.target !== bouton) { menu.remove(); bouton.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', fermer); } };
  setTimeout(() => document.addEventListener('click', fermer), 0);
}

function ajouterBouton() {
  const barre = document.getElementById('pm-lecteur');
  if (!barre || document.getElementById('pm-bouton-export')) return;
  const bouton = document.createElement('button');
  bouton.id = 'pm-bouton-export';
  bouton.type = 'button';
  bouton.textContent = 'MP4';
  bouton.title = 'Exporter en MP4';
  bouton.setAttribute('aria-label', 'Exporter en MP4');
  bouton.setAttribute('aria-haspopup', 'menu');
  bouton.setAttribute('aria-expanded', 'false');
  bouton.style.cssText = 'width:auto;padding:0 12px;border-radius:16px;font-weight:600';
  bouton.addEventListener('click', (e) => { e.stopPropagation(); ouvrirMenu(bouton); });
  barre.appendChild(bouton);
}

M.pret.then(() => (document.fonts ? document.fonts.ready : null)).then(() => {
  ajouterBouton();
  const parametres = new URLSearchParams(location.search);
  const choix = (k) => parametres.get(k) || undefined;
  if (parametres.get('export') === '1') {
    lancerExport({ avecProvisoire: parametres.get('provisoire') === '1', pour: choix('pour'), qualite: choix('qualite'), ips: choix('ips'), taille: choix('taille'),
      scene: choix('scene'), plage: choix('plage'), cadre: choix('cadre'), cadreFormat: choix('cadreFormat') });
  }
  else if (parametres.get('planche')) lancerPlanche(parametres.get('planche').split(',').filter(Boolean));
});
