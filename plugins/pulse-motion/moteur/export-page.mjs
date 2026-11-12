/* Pulse Motion – export MP4 depuis la page livrée, sans serveur (spec Retouches et ergonomie, 5.18).
 *
 * Variante de moteur/export-ui.mjs pour la page qui sait faire son MP4 : chargée par moteur/export-page-chargeur.js depuis le
 * bloc compressé de la page (imports « /_pm/… » réécrits en URL blob:). Mêmes modules que l'aperçu (export.mjs, relire), mêmes
 * réglages (usage web, résolus à l'assemblage : #pm-export-reglages), donc les mêmes images. Le fichier s'enregistre par
 * showSaveFilePicker quand il existe (demandé au clic, geste de la personne), sinon par un téléchargement.
 * Voix provisoire (5.17) : le même choix qu'à l'aperçu ; « Exporter une version de travail » nomme le fichier à part.
 * Dernier export : M.dernierExportPage = { nom, octets, images, relecture } (lu par les tests).
 */
import { exporter, relire } from '/_pm/export.mjs';
import '/_pm/estimation.js';

const M = globalThis.M;
const horloge = performance.now.bind(performance);
const QUALITE = 'Pour la meilleure qualité, demandez à Claude « exporte ma vidéo ».';

function reglagesPage() {
  const bloc = document.getElementById('pm-export-reglages');
  const r = bloc ? JSON.parse(bloc.textContent || 'null') : null;
  if (!r) throw new Error('Les réglages de l\'export manquent dans cette page.');
  return r;
}

function creerPanneau() {
  const panneau = document.createElement('div');
  panneau.id = 'pm-export';
  panneau.innerHTML = '<p class="pm-export-titre"></p><progress max="1" value="0"></progress><p class="pm-export-detail"></p><button type="button">Annuler</button><p class="pm-export-note"></p>';
  panneau.style.cssText = 'position:fixed;inset:auto 16px 64px auto;z-index:20;width:320px;padding:14px 16px;border-radius:10px;' +
    'background:#1b1b1b;color:#eee;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgb(0 0 0/.4)';
  panneau.querySelector('progress').style.cssText = 'width:100%';
  const note = panneau.querySelector('.pm-export-note');
  note.textContent = QUALITE;
  note.style.cssText = 'margin:10px 0 0;font-size:12px;opacity:.7';
  document.body.appendChild(panneau);
  return {
    titre: (t) => { panneau.querySelector('.pm-export-titre').textContent = t; },
    detail: (t) => { panneau.querySelector('.pm-export-detail').textContent = t; },
    progression: (v) => { panneau.querySelector('progress').value = v; },
    bouton: panneau.querySelector('button'),
    fermerDans: (ms) => setTimeout(() => panneau.remove(), ms),
  };
}

function scenesProvisoires() {
  return (M.donnees.scenes || []).filter((s) => s.voix && s.voix.provisoire).map((s) => s.id);
}

const nomDeTravail = (nom) => String(nom).replace(/(\.[a-z0-9]+)$/i, '-version-de-travail$1');

/** Emplacement choisi par la personne (au clic), ou null : le fichier se téléchargera. AbortError si elle annule. */
async function choisirEmplacement(nom) {
  if (typeof globalThis.showSaveFilePicker !== 'function') return null;
  try {
    return await globalThis.showSaveFilePicker({ suggestedName: nom, types: [{ description: 'Vidéo MP4', accept: { 'video/mp4': ['.mp4'] } }] });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    return null; // geste expiré ou refusé : téléchargement
  }
}

async function enregistrer(buffer, nom, poignee) {
  if (poignee) {
    const flux = await poignee.createWritable();
    await flux.write(buffer);
    await flux.close();
    return poignee.name || nom;
  }
  const url = URL.createObjectURL(new Blob([buffer], { type: 'video/mp4' }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return nom;
}

let enCours = false;

export async function lancerExportPage({ avecProvisoire = false } = {}) {
  if (enCours) return null;
  const provisoires = scenesProvisoires();
  if (provisoires.length && !avecProvisoire) {
    const panneau = creerPanneau();
    panneau.titre('La vidéo parle encore avec la voix de l\'ordinateur');
    panneau.detail(`Scènes : ${provisoires.join(', ')}. Pour enregistrer votre voix, demandez-le à Claude.`);
    panneau.bouton.textContent = 'Enregistrer ma voix d\'abord (Recommandé)';
    panneau.bouton.dataset.choix = 'voix';
    const travail = document.createElement('button');
    travail.type = 'button';
    travail.dataset.choix = 'version-de-travail';
    travail.textContent = 'Exporter une version de travail';
    travail.style.cssText = 'margin-left:8px';
    panneau.bouton.after(travail);
    return new Promise((resoudre) => {
      panneau.bouton.onclick = () => { panneau.fermerDans(0); resoudre(null); };
      travail.onclick = () => { panneau.fermerDans(0); resoudre(lancerExportPage({ avecProvisoire: true })); };
    });
  }
  const reglages = reglagesPage();
  const nom = provisoires.length ? nomDeTravail(reglages.nomFichier) : reglages.nomFichier;
  let poignee = null;
  try { poignee = await choisirEmplacement(nom); } catch { return null; }
  enCours = true;
  M.exportEnCours = true;
  const panneau = creerPanneau();
  const controle = new AbortController();
  panneau.bouton.onclick = () => controle.abort();
  panneau.titre('Export de la vidéo en MP4…');
  try {
    const ips = reglages.ips || M.ips;
    const total = Math.round(M.duree * ips);
    const estimation = M.estimation.creerEstimation({ total });
    const resultat = await exporter({
      signal: controle.signal,
      reglages,
      surProgression: (n, tot) => {
        panneau.progression(n / tot);
        const t = horloge() / 1000;
        estimation.noter(n, t, 0);
        const restant = estimation.restant(t);
        panneau.detail(`Image ${n} / ${tot}${restant === null ? '' : ` – encore environ ${M.estimation.texteDuree(restant)}`}`);
      },
    });
    panneau.titre('Vérification de la vidéo…');
    panneau.bouton.disabled = true;
    const relecture = await relire(resultat.buffer, { images: resultat.images, ips: resultat.ips, fondSombre: resultat.fondSombre, vignette: resultat.vignette });
    if (!relecture.ok) throw new Error(`La vidéo produite a un défaut (${relecture.erreurs.join(' ')}) : rien n'a été enregistré. Demandez à Claude « exporte ma vidéo ».`);
    const fichier = await enregistrer(resultat.buffer, nom, poignee);
    M.dernierExportPage = { nom: fichier, octets: resultat.buffer.byteLength, images: resultat.images, relecture: { ok: relecture.ok, images: relecture.images, duree: relecture.duree } };
    panneau.titre('✅ Vidéo enregistrée');
    panneau.detail(resultat.avertissement ? `${fichier} – ${resultat.avertissement}` : fichier);
    panneau.bouton.textContent = 'Fermer';
    panneau.bouton.disabled = false;
    panneau.bouton.onclick = () => panneau.fermerDans(0);
    return fichier;
  } catch (e) {
    const annule = e && e.name === 'AbortError';
    panneau.titre(annule ? 'Export annulé' : 'L\'export a échoué');
    panneau.detail(annule ? 'Aucun fichier n\'a été écrit.' : String((e && e.message) || e));
    panneau.bouton.textContent = 'Fermer';
    panneau.bouton.disabled = false;
    panneau.bouton.onclick = () => panneau.fermerDans(0);
    M.dernierExportPage = { erreur: annule ? 'annule' : String((e && e.message) || e) };
    return null;
  } finally {
    enCours = false;
    if (M.finExport) M.finExport(); else M.exportEnCours = false;
  }
}
