/* Pulse Motion – interface d'export dans l'aperçu.
 *
 * Ajoute le bouton « Exporter en MP4 » au lecteur, affiche la progression (image n / total,
 * temps restant, bouton Annuler) et le résultat. Paramètres d'adresse utilisés par
 * « pulse-motion exporter » : ?export=1 lance l'export ; ?planche=id1,id2 capture la planche.
 */
import { exporter, relire, envoyer, signaler, capturerPlanche } from '/_pm/export.mjs';

const M = globalThis.M;

function minutes(secondes) {
  const s = Math.max(0, Math.round(secondes));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
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

export async function lancerExport() {
  if (enCours) return null;
  enCours = true;
  const panneau = creerPanneau();
  const controle = new AbortController();
  panneau.bouton.onclick = () => controle.abort();
  panneau.titre('Export de la vidéo en MP4…');
  const debut = performance.now();
  try {
    await signaler({ etat: 'en-cours', images: 0, total: Math.round(M.duree * M.ips) });
    const resultat = await exporter({
      signal: controle.signal,
      surProgression: (n, total) => {
        panneau.progression(n / total);
        const restant = (performance.now() - debut) / 1000 / n * (total - n);
        panneau.detail(`Image ${n} / ${total} – encore environ ${minutes(restant)}`);
        if (n % 30 === 0 || n === total) signaler({ etat: 'en-cours', images: n, total });
      },
    });
    panneau.titre('Vérification de la vidéo…');
    panneau.bouton.disabled = true;
    const relecture = await relire(resultat.buffer, { images: resultat.images, ips: M.ips });
    const { fichier } = await envoyer(resultat.buffer, { ...relecture, audio: resultat.audio, largeur: resultat.largeur, hauteur: resultat.hauteur });
    panneau.titre('✅ Vidéo enregistrée');
    panneau.detail(`${fichier}${resultat.audio || !document.getElementById('pm-musique') ? '' : ' (sans son : ce navigateur ne sait pas encoder l\'audio AAC)'}`);
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
  }
}

export async function lancerPlanche(scenes) {
  try {
    const images = await capturerPlanche(scenes);
    for (const { nom, blob } of images) {
      const r = await fetch(`/_pm/planche/${encodeURIComponent(nom)}.png`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
      if (!r.ok) throw new Error(`Image « ${nom} » refusée (${r.status}).`);
    }
    await fetch('/_pm/planche-fin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images: images.map((i) => `${i.nom}.png`) }) });
  } catch (e) {
    await signaler({ etat: 'erreur', message: String(e.message || e) });
  }
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
  bouton.style.cssText = 'width:auto;padding:0 12px;border-radius:16px;font-weight:600';
  bouton.addEventListener('click', (e) => { e.stopPropagation(); lancerExport(); });
  barre.appendChild(bouton);
}

M.pret.then(() => (document.fonts ? document.fonts.ready : null)).then(() => {
  ajouterBouton();
  const parametres = new URLSearchParams(location.search);
  if (parametres.get('export') === '1') lancerExport();
  else if (parametres.get('planche')) lancerPlanche(parametres.get('planche').split(',').filter(Boolean));
});
