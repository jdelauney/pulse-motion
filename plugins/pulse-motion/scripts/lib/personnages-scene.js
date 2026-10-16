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
const { deplierGroupes } = require('./groupes-personnages.js');

// Les commentaires HTML sont reconnus d'abord, et laissés tels quels (une balise commentée ne compte pas).
const BALISE = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
// Éléments sans fermeture : ils ne changent pas la profondeur.
const VIDES = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ACTIONS = {
  marcher: ['vers'], courir: ['vers'], glisser: [], bondir: [], atteindre: ['cible'], regarder: ['cible'], pose: ['pose'], jouer: ['clip'], tourner: ['vue'], expression: ['expression'], bouche: ['bouche'], parler: [],
};
const NOMBRES = ['data-x', 'data-sol', 'data-taille', 'data-vue', 'data-vers', 'data-hauteur'];
const TRAJETS = ['marcher', 'courir', 'glisser', 'bondir'];
const VISEMES = ['A', 'E', 'I', 'O', 'U', 'MBP', 'FV', 'L'];

function erreur(scene, message) { return { regle: 'personnage-invalide', gravite: 'erreur', scene, message: `Scène « ${scene} » : ${message}` }; }

function preparerPersonnages(html0, { scene, lu, voix = false, dureeTemps = null }) {
  // Groupes dépliés d'abord en personnages ordinaires (validés ensuite comme les autres).
  const deplie = deplierGroupes(html0, { scene, dureeTemps });
  const html = deplie.html;
  const erreurs = deplie.erreurs.slice();
  const utilises = { dessins: new Set(), gabarits: new Set() };
  if (!/data-personnage|data-action|data-tenu-par/.test(html)) return { html, utilises, erreurs, parle: false };
  let parle = false;
  let courant = null;
  // Tracés de la scène (sols courbes) et sols cités, vérifiés à la fin.
  const chemins = new Set(), autresIds = new Set(), idsDoubles = new Set(), solsCites = [];
  // Personnages (id -> conteneur parent) et objets tenus, vérifiés à la fin.
  const porteurs = new Map(), objetsTenus = [], ciblesCitees = [];
  // Pile des balises ouvertes : une action n'est lue que si elle est enfant direct d'un conteneur data-personnage.
  const pile = [];
  const sortie = html.replace(BALISE, (tout, fermeture, tag, texte) => {
    if (tout.startsWith('<!--')) return tout;
    const nomTag = tag.toLowerCase();
    if (fermeture) {
      const i = pile.map((x) => x.tag).lastIndexOf(nomTag);
      if (i >= 0) pile.splice(i);
      return tout;
    }
    const autoFermee = /\/\s*$/.test(texte) || VIDES.has(nomTag);
    const parent = pile[pile.length - 1];
    const a = lireAttributs(texte);
    if (a['data-personnage'] !== undefined && a.id) porteurs.set(a.id.trim(), parent || null);
    if (a['data-tenu-par'] !== undefined) objetsTenus.push({ a, parent: parent || null });
    if (!autoFermee) pile.push({ tag: nomTag, personnage: a['data-personnage'] !== undefined ? a['data-personnage'].trim() : null, id: a.id ? a.id.trim() : null });
    if (a.id) {
      const id = a.id.trim();
      if (chemins.has(id) || autresIds.has(id)) idsDoubles.add(id);
      (nomTag === 'path' ? chemins : autresIds).add(id);
    }
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
    if (a['data-membre'] !== undefined) erreurs.push(erreur(scene, `data-membre="${a['data-membre']}" hors d'un groupe : il sert dans un conteneur data-groupe.`));
    if (a['data-action'] === undefined) return tout;
    const type = a['data-action'].trim();
    const dans = parent && parent.personnage !== null ? parent.personnage : null;
    const qui = `personnage « ${dans || courant || '?'} », action « ${type} »${a.id ? ` (#${a.id})` : ''}`;
    if (dans === null) erreurs.push(erreur(scene, `action « ${type} » hors d'un personnage : la placer directement dans l'élément data-personnage.`));
    if (!ACTIONS[type]) { erreurs.push(erreur(scene, `${qui} : action inconnue (${Object.keys(ACTIONS).join(', ')}).`)); return tout; }
    for (const champ of ACTIONS[type]) if (a[`data-${champ}`] === undefined) erreurs.push(erreur(scene, `${qui} : il manque data-${champ}.`));
    if ((type === 'glisser' || type === 'bondir') && a['data-vers'] === undefined && a['data-sol'] === undefined) erreurs.push(erreur(scene, `${qui} : il faut data-vers (où aller) ou data-sol (à quelle hauteur), ou les deux.`));
    if (type === 'atteindre' || type === 'regarder') {
      const c = (a['data-cible'] || '').trim();
      if (c && !/^#[\w-]+$/.test(c) && !/^-?\d*\.?\d+%\s+-?\d*\.?\d+%$/.test(c) && !(type === 'regarder' && (c === 'camera' || c === 'aucune'))) {
        erreurs.push(erreur(scene, `${qui} : data-cible="${c}" doit être « #id » (un élément ou un personnage de la scène), un point « x% y% »${type === 'regarder' ? ', « camera » ou « aucune »' : ''}.`));
      } else if (/^#/.test(c)) {
        ciblesCitees.push({ id: c.slice(1), ou: qui });
        if (parent && parent.id === c.slice(1)) erreurs.push({ ...erreur(scene, `${qui} : la cible « ${c} » est le personnage lui-même.`), gravite: 'alerte' });
      }
      if (type === 'regarder') for (const k of ['data-niveau', 'data-main']) if (a[k] !== undefined) erreurs.push({ ...erreur(scene, `${qui} : ${k} ne sert qu'à « atteindre ».`), gravite: 'alerte' });
      if (a['data-point'] !== undefined && !/^\s*-?\d*\.?\d+%\s+-?\d*\.?\d+%\s*$/.test(a['data-point'])) erreurs.push(erreur(scene, `${qui} : data-point="${a['data-point']}" doit être un point en % de l'élément, ex. « 50% 0% ».`));
      if (type === 'atteindre' && a['data-dur'] === undefined) erreurs.push(erreur(scene, `${qui} : data-dur obligatoire (combien de temps la main reste sur la cible).`));
      if (type === 'atteindre' && a['data-main'] !== undefined && !['avant', 'arriere', 'deux'].includes(a['data-main'].trim())) erreurs.push(erreur(scene, `${qui} : data-main="${a['data-main']}" doit être avant, arriere ou deux.`));
      if (a['data-niveau'] !== undefined && !['haut', 'epaule', 'bas'].includes(a['data-niveau'].trim())) erreurs.push(erreur(scene, `${qui} : data-niveau="${a['data-niveau']}" doit être haut, epaule ou bas.`));
    }
    if (a['data-sol'] !== undefined && !TRAJETS.includes(type)) erreurs.push(erreur(scene, `${qui} : data-sol ne sert qu'aux déplacements (marcher, courir, glisser, bondir) ou au personnage lui-même.`));
    if (a['data-hauteur'] !== undefined && type !== 'bondir') erreurs.push(erreur(scene, `${qui} : data-hauteur ne sert qu'à « bondir » (hauteur de l'arc).`));
    if (a['data-courbe'] !== undefined && type !== 'glisser') erreurs.push(erreur(scene, `${qui} : data-courbe ne sert qu'à « glisser ».`));
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
  for (const { a, parent } of objetsTenus) {
    const id = a['data-tenu-par'].trim().replace(/^#/, '');
    const qui = `objet tenu${a.id ? ` « ${a.id} »` : ''}`;
    if (idsDoubles.has(id)) erreurs.push(erreur(scene, `${qui} : plusieurs éléments portent l'id « ${id} » ; le porteur doit être unique.`));
    if (!porteurs.has(id)) erreurs.push(erreur(scene, `${qui} : porteur « #${id} » introuvable (data-tenu-par = l'id d'un conteneur data-personnage de la scène).`));
    else if (porteurs.get(id) !== parent) erreurs.push(erreur(scene, `${qui} : il doit être dans le même conteneur que son porteur « #${id} » (même parent), pour suivre sa main.`));
    if (a['data-devant'] !== undefined && a['data-derriere'] !== undefined) erreurs.push(erreur(scene, `${qui} : data-devant et data-derriere ensemble ; n'en garder qu'un.`));
    const liste = { 'data-main': ['avant', 'arriere', 'deux'], 'data-orientation': ['droit', 'main'], 'data-lacher': ['reste', 'cache', 'tombe'] };
    for (const [k, valeurs] of Object.entries(liste)) if (a[k] !== undefined && !valeurs.includes(a[k].trim())) erreurs.push(erreur(scene, `${qui} : ${k}="${a[k]}" doit être ${valeurs.join(', ')}.`));
    if (a['data-prise'] !== undefined && !/^\s*-?\d*\.?\d+%\s+-?\d*\.?\d+%\s*$/.test(a['data-prise'])) erreurs.push(erreur(scene, `${qui} : data-prise="${a['data-prise']}" doit être un point en % de l'objet, ex. « 50% 100% » (milieu du bas).`));
    if (a['data-dur'] === undefined) erreurs.push(erreur(scene, `${qui} : data-dur obligatoire (combien de temps il est tenu).`));
    if (a['data-relais'] !== undefined) {
      const mr = /^\s*#?([\w-]+)\s+à\s+(\d*\.?\d+)\s*$/.exec(a['data-relais']);
      if (!mr) erreurs.push(erreur(scene, `${qui} : data-relais="${a['data-relais']}" doit être « #id à secondes », ex. « #n2 à 1.5 ».`));
      else if (!porteurs.has(mr[1])) erreurs.push(erreur(scene, `${qui} : relais « #${mr[1]} » introuvable (un conteneur data-personnage de la scène).`));
      else if (porteurs.get(mr[1]) !== parent) erreurs.push(erreur(scene, `${qui} : le relais « #${mr[1]} » doit être dans le même conteneur que l'objet.`));
      if (mr && mr[1] === id) erreurs.push({ ...erreur(scene, `${qui} : le relais « #${mr[1]} » est déjà son porteur.`), gravite: 'alerte' });
      if (mr && a['data-dur'] !== undefined && Number.isFinite(Number(a['data-dur'])) && Number(mr[2]) >= Number(a['data-dur'])) erreurs.push({ ...erreur(scene, `${qui} : le relais à ${mr[2]} s tombe après la fin de la prise (${a['data-dur']} s) : il ne se fera pas.`), gravite: 'alerte' });
    }
  }
  for (const c of ciblesCitees) {
    if (!chemins.has(c.id) && !autresIds.has(c.id)) erreurs.push(erreur(scene, `${c.ou} : cible « #${c.id} » introuvable dans la scène.`));
  }
  for (const s of solsCites) {
    if (idsDoubles.has(s.id)) erreurs.push({ ...erreur(scene, `${s.ou} : plusieurs éléments portent l'id « ${s.id} » ; le sol doit être un seul tracé.`), gravite: 'alerte' });
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
