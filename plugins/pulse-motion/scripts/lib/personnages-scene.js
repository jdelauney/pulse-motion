'use strict';
/* Pulse Motion – personnages dans les scènes, côté assemblage.
 *
 *   preparerPersonnages(html, { scene, lu, voix }) -> { html, utilises: { dessins: Set, gabarits: Set, batonnets: Set, habillages: Set },
 *     erreurs, parle }   batonnets : dessins habillés avec leur réglage ; habillages : ceux dont la scène se sert (registre)
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
const HAB = require('../../moteur/personnages/habillages.js');
// Noms proches d'une saisie (spec Retouches et ergonomie, 5.16).
const PR = require('../../moteur/proches.js');
const procheDe = (saisie, candidats) => { const l = PR.proches(saisie, candidats); return l.length ? ' ; ' + PR.phrase(l) : ''; };
// Gardé dans la bibliothèque personnelle, que l'assemblage ne lit pas (par copie, chantier H) : le dire, pour le copier.
const avecBibliotheque = (message, sorte, nom) => {
  const s = require('./bibliotheque.js').suggestionBibliotheque(sorte, nom);
  return s ? `${message.replace(/.$/, '')}${s}.` : message;
};

// Les commentaires HTML sont reconnus d'abord, et laissés tels quels (une balise commentée ne compte pas).
const BALISE = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
// Éléments sans fermeture : ils ne changent pas la profondeur.
const VIDES = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ACTIONS = {
  marcher: ['vers'], courir: ['vers'], glisser: [], bondir: [], flotter: [], atteindre: ['cible'], regarder: ['cible'], pose: ['pose'], jouer: ['clip'], tourner: ['vue'], expression: ['expression'], bouche: ['bouche'], parler: [],
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
  const utilises = { dessins: new Set(), gabarits: new Set(), batonnets: new Set(), habillages: new Set(), demarche: false };
  if (!/data-personnage|data-action|data-tenu-par/.test(html)) return { html, utilises, erreurs, parle: false };
  let parle = false;
  const verifierEcrase = (v, qui) => {
    const n = Number(v);
    if (String(v).trim() === '' || !Number.isFinite(n) || n < 0 || n > 0.25) erreurs.push(erreur(scene, `${qui} : data-ecrase="${v}" : écrasement à l'atterrissage, de 0 (aucun) à 0,25 (ex. 0.12).`));
  };
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
    if (!autoFermee) pile.push({ tag: nomTag, personnage: a['data-personnage'] !== undefined ? a['data-personnage'].trim() : null, id: a.id ? a.id.trim() : null,
      calculee: a['data-demarche'] !== undefined && a['data-demarche'].trim() === 'calculee' });
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
      if (a['data-vie'] !== undefined && !['pleine', 'sobre', 'mains', 'aucune'].includes(a['data-vie'].trim())) erreurs.push(erreur(scene, `data-vie="${a['data-vie']}" : valeur inconnue (pleine, sobre, mains ou aucune).`));
      if (a['data-ombre'] !== undefined && !['oui', 'non'].includes(a['data-ombre'].trim())) erreurs.push(erreur(scene, `data-ombre="${a['data-ombre']}" : oui ou non.`));
      if (a['data-ecrase'] !== undefined) verifierEcrase(a['data-ecrase'], `personnage « ${nom} »`);
      // Marche calculée (spec S11, 5.7) : vue de profil ; ailleurs, le mouvement marche ou course.
      if (a['data-demarche'] !== undefined) {
        if (a['data-demarche'].trim() !== 'calculee') erreurs.push(erreur(scene, `personnage « ${nom} » : data-demarche="${a['data-demarche']}" : seule valeur, « calculee » (marche calculée de profil).`));
        else utilises.demarche = true;
      }
      // Habillages : registre unique (moteur/personnages/habillages.js, spec S11 5.1 point 4).
      const seuls = HAB.sansDessin();
      if (seuls.includes(nom)) {
        const g = (a['data-gabarit'] || 'standard').trim();
        if (!Object.hasOwn(lu.gabarits, g)) erreurs.push(erreur(scene, `personnage en ${HAB.habillages[nom].libelle} : gabarit « ${g} » introuvable (gabarits : ${Object.keys(lu.gabarits).join(', ')}).`));
        else utilises.gabarits.add(g);
        utilises.habillages.add(nom);
      } else if (!Object.hasOwn(lu.dessins, nom)) {
        erreurs.push(erreur(scene, avecBibliotheque(`personnage « ${nom} » introuvable${procheDe(nom, [...Object.keys(lu.dessins), ...seuls]) || ` (dessins : ${Object.keys(lu.dessins).join(', ') || 'aucun'} ; ou ${seuls.map((n) => `« ${n} »`).join(', ')}).`}`, 'dessin', nom)));
      } else {
        utilises.dessins.add(nom);
        const hab = a['data-habillage'] === undefined ? null : a['data-habillage'].trim();
        // Sans data-habillage : celui de la manière du dessin (plume), sinon l'habillage par défaut (registre).
        const propre = HAB.habillageDe(lu.dessins[nom]);
        const choisi = hab === null ? propre : hab;
        const h = HAB.connu(choisi) ? HAB.habillages[choisi] : null;
        const refus = h ? HAB.refus(choisi, lu.dessins[nom]) : null;
        const reglage = h && h.reglage ? lu.dessins[nom][h.reglage] : null;
        // Habillage refusé : la page assemblée malgré l'erreur dessine le personnage dans son habillage propre (scene.js).
        if (!h) {
          erreurs.push(erreur(scene, `personnage « ${nom} » : data-habillage="${hab}" inconnu (habillages : ${HAB.NOMS.join(', ')} ; ${propre} par défaut).`));
          utilises.habillages.add(propre);
        } else if (refus) {
          erreurs.push(erreur(scene, `personnage « ${nom} » : data-habillage="${hab}" refusé : ${refus} ; retirer data-habillage.`));
          utilises.habillages.add(propre);
        } else if (h.reglage && !(reglage && typeof reglage === 'object' && !Array.isArray(reglage))) {
          erreurs.push(erreur(scene, `personnage « ${nom} » : ce dessin n'a pas de réglage ${h.libelle} (« ${h.reglage} » du dessin) ; retirer data-habillage, ou choisir un dessin qui l'a.`));
          utilises.habillages.add(propre);
        } else {
          utilises.habillages.add(choisi);
          // Dessins dont l'habillage demande un réglage : leur apparence va dans les données de la page.
          if (h.reglage) utilises.batonnets.add(nom);
        }
      }
      if (seuls.includes(nom) && a['data-habillage'] !== undefined) erreurs.push(erreur(scene, 'data-habillage se pose sur un personnage dessiné (data-personnage="<dessin>") : il le dessine en bâtonnets, à ses couleurs.'));
      return tout;
    }
    if (a['data-membre'] !== undefined) erreurs.push(erreur(scene, `data-membre="${a['data-membre']}" hors d'un groupe : il sert dans un conteneur data-groupe.`));
    if (a['data-demarche'] !== undefined) erreurs.push(erreur(scene, `data-demarche se pose sur le personnage (l'élément data-personnage), pas sur ${a['data-action'] !== undefined ? 'une action' : 'un autre élément'}.`));
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
      if (type === 'regarder' && a['data-attention'] !== undefined) {
        const n = Number(a['data-attention']);
        if (String(a['data-attention']).trim() === '' || !Number.isFinite(n) || n < 0 || n > 1) erreurs.push(erreur(scene, `${qui} : data-attention="${a['data-attention']}" : de 0 à 1 (1 = il regarde franchement, 0,5 = à moitié ; ex. 0.5).`));
      }
      if (a['data-point'] !== undefined && !/^\s*-?\d*\.?\d+%\s+-?\d*\.?\d+%\s*$/.test(a['data-point'])) erreurs.push(erreur(scene, `${qui} : data-point="${a['data-point']}" doit être un point en % de l'élément, ex. « 50% 0% ».`));
      if (type === 'atteindre' && a['data-dur'] === undefined) erreurs.push(erreur(scene, `${qui} : data-dur obligatoire (combien de temps la main reste sur la cible).`));
      if (type === 'atteindre' && a['data-main'] !== undefined && !['avant', 'arriere', 'deux'].includes(a['data-main'].trim())) erreurs.push(erreur(scene, `${qui} : data-main="${a['data-main']}" doit être avant, arriere ou deux.`));
      if (a['data-niveau'] !== undefined && !['haut', 'epaule', 'bas'].includes(a['data-niveau'].trim())) erreurs.push(erreur(scene, `${qui} : data-niveau="${a['data-niveau']}" doit être haut, epaule ou bas.`));
    }
    if (a['data-attention'] !== undefined && type !== 'regarder') erreurs.push(erreur(scene, `${qui} : data-attention ne sert qu'à « regarder ».`));
    if (a['data-sol'] !== undefined && !TRAJETS.includes(type)) erreurs.push(erreur(scene, `${qui} : data-sol ne sert qu'aux déplacements (marcher, courir, glisser, bondir) ou au personnage lui-même.`));
    if (a['data-ecrase'] !== undefined) {
      if (type !== 'bondir' && type !== 'flotter') erreurs.push(erreur(scene, `${qui} : data-ecrase ne sert qu'à « bondir », « flotter » ou au personnage lui-même (écrasement à l'atterrissage).`));
      else verifierEcrase(a['data-ecrase'], qui);
    }
    if (a['data-hauteur'] !== undefined && type !== 'bondir' && type !== 'flotter') erreurs.push(erreur(scene, `${qui} : data-hauteur ne sert qu'à « bondir » (hauteur de l'arc) et à « flotter » (hauteur du vol).`));
    if (type === 'flotter' && a['data-hauteur'] !== undefined && Number.isFinite(Number(a['data-hauteur'])) && (Number(a['data-hauteur']) < 2 || Number(a['data-hauteur']) > 40)) erreurs.push(erreur(scene, `${qui} : data-hauteur="${a['data-hauteur']}" : hauteur du vol en % de la hauteur de l'image, de 2 à 40 (ex. 12).`));
    if (type === 'flotter' && a['data-dur'] === undefined) erreurs.push(erreur(scene, `${qui} : data-dur obligatoire (durée du vol, ex. data-dur="3").`));
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
      // Démarche calculée (réglages de personnages/clips/demarches/) : seulement pour un personnage en data-demarche="calculee".
      const reglee = !c && Object.hasOwn(lu.demarches || {}, nomClip);
      if (reglee && !(parent && parent.calculee)) erreurs.push(erreur(scene, `${qui} : « ${nomClip} » est une démarche calculée : poser data-demarche="calculee" sur le personnage.`));
      else if (reglee) { /* réglages lus par partition.js */ } else if (!c) erreurs.push(erreur(scene, avecBibliotheque(`${qui} : démarche « ${nomClip} » introuvable ; la créer d'abord dans personnages/clips/ de la vidéo (un mouvement en boucle, copié de « ${modele} » : pulse-motion personnages afficher ${modele}).`, 'clip', nomClip)));
      else if (!c.boucle || c.additif) erreurs.push(erreur(scene, `${qui} : « ${nomClip} » ne peut pas servir de démarche : il faut un mouvement en boucle, comme « ${modele} ».`));
    }
    if (type === 'pose' && a['data-pose'] !== undefined && !Object.hasOwn(lu.poses, a['data-pose'])) erreurs.push(erreur(scene, avecBibliotheque(`${qui} : pose « ${a['data-pose']} » introuvable${procheDe(a['data-pose'], Object.keys(lu.poses)) || ` (poses : ${Object.keys(lu.poses).join(', ')}).`}`, 'pose', a['data-pose'])));
    if (type === 'expression' && a['data-expression'] !== undefined && !Object.hasOwn(lu.expressions, a['data-expression'])) erreurs.push(erreur(scene, avecBibliotheque(`${qui} : expression « ${a['data-expression']} » introuvable${procheDe(a['data-expression'], Object.keys(lu.expressions)) || ` (expressions : ${Object.keys(lu.expressions).join(', ')}).`}`, 'expression', a['data-expression'])));
    if (type === 'jouer' && a['data-clip'] !== undefined) {
      const clip = Object.hasOwn(lu.clips, a['data-clip']) ? lu.clips[a['data-clip']] : null;
      if (!clip) erreurs.push(erreur(scene, avecBibliotheque(`${qui} : mouvement « ${a['data-clip']} » introuvable${procheDe(a['data-clip'], Object.keys(lu.clips).filter((n) => !lu.clips[n].additif)) || ` (mouvements : ${Object.keys(lu.clips).filter((n) => !lu.clips[n].additif).join(', ')}).`}`, 'clip', a['data-clip'])));
      else if (clip.additif) erreurs.push(erreur(scene, `${qui} : « ${a['data-clip']} » est un calque (respiration, clignement, repos vivant), il s'ajoute tout seul.`));
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
    const liste = { 'data-main': ['avant', 'arriere', 'deux'], 'data-orientation': ['droit', 'main'], 'data-lacher': ['reste', 'cache', 'tombe', 'lance'] };
    for (const [k, valeurs] of Object.entries(liste)) if (a[k] !== undefined && !valeurs.includes(a[k].trim())) erreurs.push(erreur(scene, `${qui} : ${k}="${a[k]}" doit être ${valeurs.join(', ')}.`));
    // Lancer (spec Mouvement vivant 5.8) : une cible obligatoire, dans la scène ; un personnage visé, dans le même conteneur.
    const lance = (a['data-lacher'] || '').trim() === 'lance';
    if (lance) {
      const c = (a['data-cible'] || '').trim();
      if (!c) erreurs.push(erreur(scene, `l'objet « ${a.id || '?'} » est lancé (data-lacher="lance") sans data-cible : donner l'élément, le personnage ou le point visé (ex. data-cible="#panier").`));
      else if (/^#[\w-]+$/.test(c)) {
        const vise = c.slice(1);
        if (!chemins.has(vise) && !autresIds.has(vise)) erreurs.push(erreur(scene, `${qui} : la cible « ${c} » n'existe pas dans la scène.`));
        else if (porteurs.has(vise) && porteurs.get(vise) !== parent) erreurs.push(erreur(scene, `${qui} : le personnage visé « ${c} » doit être dans le même conteneur que l'objet (même parent), pour le recevoir dans sa main.`));
      } else if (!/^-?\d*\.?\d+%\s+-?\d*\.?\d+%$/.test(c)) erreurs.push(erreur(scene, `${qui} : data-cible="${c}" doit être « #id » (un élément ou un personnage de la scène) ou un point « x% y% » de l'image.`));
      const bornes = { 'data-hauteur': [0, 100, 'sommet du vol en % de la hauteur de l\'image au-dessus du plus haut des deux points, ex. 15'], 'data-tours': [-20, 20, 'tours sur lui-même en vol, ex. 1 ; négatif : dans l\'autre sens'], 'data-roule': [0, 100, '% de la largeur parcourus en roulant à l\'arrivée, ex. 10'] };
      for (const [k, [min, max, sens]] of Object.entries(bornes)) {
        if (a[k] === undefined) continue;
        const n = Number(a[k]);
        if (String(a[k]).trim() === '' || !Number.isFinite(n) || n < min || n > max) erreurs.push(erreur(scene, `${qui} : ${k}="${a[k]}" : de ${min} à ${max} (${sens}).`));
      }
    } else {
      for (const k of ['data-cible', 'data-tours', 'data-roule']) if (a[k] !== undefined) erreurs.push({ ...erreur(scene, `${qui} : ${k} ne sert qu'à un objet lancé (data-lacher="lance").`), gravite: 'alerte' });
    }
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
  const apparences = {};
  for (const n of utilises.dessins) { dessins[n] = lu.dessins[n]; gabaritsDessins[n] = P.gabaritDe(lu.dessins[n], lu); }
  // Réglage bâtonnets des seuls dessins montrés en bâtonnets (data-habillage="batonnets").
  for (const n of utilises.batonnets || []) apparences[n] = P.apparenceBatonnets(lu.dessins[n]);
  for (const g of utilises.gabarits) gabarits[g] = lu.gabarits[g];
  // Réglages des démarches calculées : seulement si un personnage marche en data-demarche="calculee" (spec S11, 5.7).
  const bib = { poses: lu.poses, clips: lu.clips, expressions: lu.expressions, ...(utilises.demarche ? { demarches: lu.demarches || {} } : {}) };
  return { bib, dessins, gabaritsDessins, gabarits, ...(Object.keys(apparences).length ? { apparences } : {}) };
}

module.exports = { preparerPersonnages, donneesPersonnages, ACTIONS };
