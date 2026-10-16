'use strict';
/* Pulse Motion – personnages dans les scènes, côté assemblage.
 *
 *   preparerPersonnages(html, { scene, lu, voix }) -> { html, utilises: { dessins: Set, gabarits: Set }, erreurs, parle }
 *     voix : la scène a un texte dit (sinon « parler » est une erreur)
 *   donneesPersonnages(utilises, lu)         -> M.donnees.personnages (ce que la page doit connaître)
 *
 * Repère les conteneurs <… data-personnage> et leurs actions <… data-action> ; valide (personnage, action, pose,
 * mouvement, expression connus, nombres, durée d'une marche) ; écrit la durée d'un geste sans data-dur (sa durée
 * propre), pour que les éléments calés sur sa fin (#id:fin) tombent juste. Erreurs : règle « personnage-invalide ».
 */
const { lireAttributs } = require('./extraire.js');
const P = require('./personnages.js');
const K = require('../../moteur/clips.js');
const C = require('../../moteur/courbes.js');

const BALISE = /<(\/?)([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
// Éléments sans fermeture : ils ne changent pas la profondeur.
const VIDES = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ACTIONS = {
  marcher: ['vers'], courir: ['vers'], glisser: [], bondir: [], pose: ['pose'], jouer: ['clip'], tourner: ['vue'], expression: ['expression'], bouche: ['bouche'], parler: [],
};
const NOMBRES = ['data-x', 'data-sol', 'data-taille', 'data-vue', 'data-vers', 'data-hauteur'];
const TRAJETS = ['marcher', 'courir', 'glisser', 'bondir'];
const VISEMES = ['A', 'E', 'I', 'O', 'U', 'MBP', 'FV', 'L'];

function erreur(scene, message) { return { regle: 'personnage-invalide', gravite: 'erreur', scene, message: `Scène « ${scene} » : ${message}` }; }

function preparerPersonnages(html, { scene, lu, voix = false }) {
  const erreurs = [];
  const utilises = { dessins: new Set(), gabarits: new Set() };
  if (!/data-personnage|data-action/.test(html)) return { html, utilises, erreurs, parle: false };
  let parle = false;
  let courant = null;
  // Tracés de la scène (sols courbes) et sols cités, vérifiés à la fin.
  const chemins = new Set(), autresIds = new Set(), solsCites = [];
  // Pile des balises ouvertes : une action n'est lue que si elle est enfant direct d'un conteneur data-personnage.
  const pile = [];
  const sortie = html.replace(BALISE, (tout, fermeture, tag, texte) => {
    const nomTag = tag.toLowerCase();
    if (fermeture) {
      const i = pile.map((x) => x.tag).lastIndexOf(nomTag);
      if (i >= 0) pile.splice(i);
      return tout;
    }
    const autoFermee = /\/\s*$/.test(texte) || VIDES.has(nomTag);
    const parent = pile[pile.length - 1];
    const a = lireAttributs(texte);
    if (!autoFermee) pile.push({ tag: nomTag, personnage: a['data-personnage'] !== undefined ? a['data-personnage'].trim() : null });
    if (a.id) (nomTag === 'path' ? chemins : autresIds).add(a.id.trim());
    if (a['data-sol'] !== undefined && /^\s*#/.test(a['data-sol'])) solsCites.push({ id: a['data-sol'].trim().slice(1), ou: a['data-action'] !== undefined ? `action « ${a['data-action'].trim()} »` : `personnage « ${(a['data-personnage'] || '?').trim()} »` });
    for (const n of NOMBRES) {
      if (n === 'data-sol' && a[n] !== undefined && /^\s*#/.test(a[n])) continue;
      if (a[n] !== undefined && !Number.isFinite(Number(a[n]))) erreurs.push(erreur(scene, `${n}="${a[n]}" doit être un nombre (ex. ${n === 'data-vue' ? '90' : '40'}).`));
    }
    if (a['data-personnage'] !== undefined) {
      const nom = a['data-personnage'].trim();
      courant = nom;
      if (nom === 'batonnets') {
        const g = (a['data-gabarit'] || 'standard').trim();
        if (!Object.hasOwn(lu.gabarits, g)) erreurs.push(erreur(scene, `personnage en bâtonnets : gabarit « ${g} » introuvable (gabarits : ${Object.keys(lu.gabarits).join(', ')}).`));
        else utilises.gabarits.add(g);
      } else if (!Object.hasOwn(lu.dessins, nom)) {
        erreurs.push(erreur(scene, `personnage « ${nom} » introuvable (dessins : ${Object.keys(lu.dessins).join(', ') || 'aucun'} ; ou « batonnets »).`));
      } else utilises.dessins.add(nom);
      return tout;
    }
    if (a['data-action'] === undefined) return tout;
    const type = a['data-action'].trim();
    const dans = parent && parent.personnage !== null ? parent.personnage : null;
    const qui = `personnage « ${dans || courant || '?'} », action « ${type} »${a.id ? ` (#${a.id})` : ''}`;
    if (dans === null) erreurs.push(erreur(scene, `action « ${type} » hors d'un personnage : la placer directement dans l'élément data-personnage.`));
    if (!ACTIONS[type]) { erreurs.push(erreur(scene, `${qui} : action inconnue (${Object.keys(ACTIONS).join(', ')}).`)); return tout; }
    for (const champ of ACTIONS[type]) if (a[`data-${champ}`] === undefined) erreurs.push(erreur(scene, `${qui} : il manque data-${champ}.`));
    if ((type === 'glisser' || type === 'bondir') && a['data-vers'] === undefined && a['data-sol'] === undefined) erreurs.push(erreur(scene, `${qui} : il faut data-vers (où aller) ou data-sol (à quelle hauteur), ou les deux.`));
    if (a['data-courbe'] !== undefined) { try { C.courbeNommee(a['data-courbe'].trim()); } catch (e) { erreurs.push(erreur(scene, `${qui} : ${e.message}`)); } }
    if (type === 'bondir' && a['data-clip'] !== undefined && !Object.hasOwn(lu.clips, a['data-clip'].trim())) erreurs.push(erreur(scene, `${qui} : mouvement « ${a['data-clip'].trim()} » introuvable pour le bond (par défaut : saut).`));
    if (TRAJETS.includes(type) && type !== 'marcher' && type !== 'courir' && a['data-dur'] === undefined) erreurs.push(erreur(scene, `${qui} : data-dur obligatoire (durée du déplacement, ex. data-dur="1").`));
    if ((type === 'marcher' || type === 'courir' || type === 'tourner') && a['data-dur'] === undefined) erreurs.push(erreur(scene, `${qui} : data-dur obligatoire (durée du trajet ou de la rotation, ex. data-dur="2").`));
    if (type === 'parler') {
      parle = true;
      const d = dans && Object.hasOwn(lu.dessins, dans) ? lu.dessins[dans] : null;
      const bouches = d && d.visage && d.visage.bouches ? Object.keys(d.visage.bouches) : [];
      if (d && !VISEMES.some((v) => bouches.includes(v))) erreurs.push({ ...erreur(scene, `${qui} : le dessin « ${dans} » n'a aucune bouche de parole (${VISEMES.join(', ')}) : la bouche ne bougera pas ; dessiner au moins A, O et MBP.`), gravite: 'alerte' });
    }
    if (type === 'parler' && !voix) erreurs.push(erreur(scene, `${qui} : la scène n'a pas de voix ; ajouter son texte dit (voix.texte) au déroulé, ou retirer l'action.`));
    if ((type === 'marcher' || type === 'courir') && a['data-clip'] !== undefined) {
      const nomClip = a['data-clip'].trim();
      const c = Object.hasOwn(lu.clips, nomClip) ? lu.clips[nomClip] : null;
      const modele = type === 'courir' ? 'course' : 'marche';
      if (!c) erreurs.push(erreur(scene, `${qui} : démarche « ${nomClip} » introuvable ; la créer d'abord dans personnages/clips/ de la vidéo (un mouvement en boucle, copié de « ${modele} » : pulse-motion personnages afficher ${modele}).`));
      else if (!c.boucle || c.additif) erreurs.push(erreur(scene, `${qui} : « ${nomClip} » ne peut pas servir de démarche : il faut un mouvement en boucle, comme « ${modele} ».`));
    }
    if (type === 'pose' && a['data-pose'] !== undefined && !Object.hasOwn(lu.poses, a['data-pose'])) erreurs.push(erreur(scene, `${qui} : pose « ${a['data-pose']} » introuvable (poses : ${Object.keys(lu.poses).join(', ')}).`));
    if (type === 'expression' && a['data-expression'] !== undefined && !Object.hasOwn(lu.expressions, a['data-expression'])) erreurs.push(erreur(scene, `${qui} : expression « ${a['data-expression']} » introuvable (expressions : ${Object.keys(lu.expressions).join(', ')}).`));
    if (type === 'jouer' && a['data-clip'] !== undefined) {
      const clip = Object.hasOwn(lu.clips, a['data-clip']) ? lu.clips[a['data-clip']] : null;
      if (!clip) erreurs.push(erreur(scene, `${qui} : mouvement « ${a['data-clip']} » introuvable (mouvements : ${Object.keys(lu.clips).filter((n) => !lu.clips[n].additif).join(', ')}).`));
      else if (clip.additif) erreurs.push(erreur(scene, `${qui} : « ${a['data-clip']} » est un calque (respiration, clignement), il s'ajoute tout seul.`));
      else if (a['data-dur'] === undefined) {
        // Durée propre du geste (un cycle : 1 tour), écrite pour que les éléments calés sur sa fin tombent juste.
        const duree = Math.round(K.duree(clip) * 1000) / 1000;
        const sansDebut = a['data-start'] === undefined ? ' data-start="0"' : '';
        return tout.replace(/\s*\/?>$/, (fin) => `${sansDebut} data-dur="${duree}"${fin}`);
      }
    }
    // Une action sans minutage part du début de la scène (sinon le moteur ne lui donne pas de temps).
    if (a['data-start'] === undefined && a['data-dur'] === undefined && ACTIONS[type]) return tout.replace(/\s*\/?>$/, (fin) => ` data-start="0"${fin}`);
    return tout;
  });
  for (const s of solsCites) {
    if (chemins.has(s.id)) continue;
    erreurs.push(erreur(scene, autresIds.has(s.id)
      ? `${s.ou} : le sol « #${s.id} » doit être un tracé (un élément path d'un SVG de la scène).`
      : `${s.ou} : sol « #${s.id} » introuvable : dessiner le tracé du sol (un path avec id="${s.id}" dans un SVG de la scène).`));
  }
  return { html: sortie, utilises, erreurs, parle };
}

function donneesPersonnages(utilises, lu) {
  const dessins = {}, gabaritsDessins = {}, gabarits = {};
  for (const n of utilises.dessins) { dessins[n] = lu.dessins[n]; gabaritsDessins[n] = P.gabaritDe(lu.dessins[n], lu); }
  for (const g of utilises.gabarits) gabarits[g] = lu.gabarits[g];
  return { bib: { poses: lu.poses, clips: lu.clips, expressions: lu.expressions }, dessins, gabaritsDessins, gabarits };
}

module.exports = { preparerPersonnages, donneesPersonnages, ACTIONS };
