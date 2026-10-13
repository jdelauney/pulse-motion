/* Pulse Motion – éditeur de recette de l'atelier (servi par /_pm/atelier/editeur.mjs, jamais dans la page livrée).
 *
 * Formulaire généré depuis le schéma du format (M.recette.SCHEMA) : un champ par nœud, groupes repliables, listes
 * (ajout, retrait), champs propres au type de chaque force, champs du bon contexte (émetteur racine ou sous-émetteur).
 * Une force ou une option ajoutée au schéma apparaît ici sans autre travail. Commun au panneau de l'aperçu et à la
 * page d'atelier.
 *
 * Fonctions pures (importables sous Node) :
 *   decouperChemin(chemin), lireChemin(objet, chemin), ecrireChemin(objet, chemin, valeur)   notation du compilateur :
 *     emetteurs[gerbe].forces[0].valeur ; valeur undefined : champ retiré
 *   champPourErreur(chemins, cheminErreur) -> chemin | null   champ le plus proche d'une erreur du compilateur
 *   valeurSaisie(texte) -> nombre | expression | undefined ; reglagesEnTexte({ nom: valeur }) -> 'nom: valeur; …'
 *   valeurNeuve(nœud) -> élément ajouté à une liste ; nouvelleRecette() -> recette de départ (un émetteur)
 *   limiter(fn, ms) -> fonction appelée au plus une fois par période, le dernier appel n'étant jamais perdu
 *   compilerPourPage(R, recette, options, textures) -> Promise<{ ok, effet, erreurs }>   textures de assets/ en data:
 *   TYPES : types de nœuds pris en charge
 * Navigateur :
 *   construireFormulaire(conteneur, { schema, recette, surChangement(recette) }) -> { recette(), remplacer(r), marquer(erreurs), detruire() }
 *   construireReglages(conteneur, { parametres, valeurs, charte, surChangement(valeurs) }) -> { valeurs(), marquer(erreurs), detruire() }
 *   el(tag, attributs, parent)
 */

export const TYPES = ['nombre', 'intervalle', 'paire', 'couleur', 'choix', 'courbe', 'booleen', 'texte', 'valeur', 'liste', 'objet', 'dictionnaire'];
const NOMBRE = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
const HEX6 = /^#[0-9a-f]{6}$/i;
const CHARTE = ['primaire', 'accent', 'texte', 'fond'];
const copie = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

// ---- Fonctions pures ----

/** 'emetteurs[gerbe].forces[0].valeur' -> ['emetteurs', { nom: 'gerbe' }, 'forces', 0, 'valeur'] */
export function decouperChemin(chemin) {
  const etapes = [];
  const re = /([^.[\]]+)|\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(String(chemin)))) {
    if (m[1] !== undefined) etapes.push(m[1]);
    else etapes.push(/^\d+$/.test(m[2]) ? Number(m[2]) : { nom: m[2] });
  }
  return etapes;
}

function suivre(objet, etape) {
  if (objet === null || typeof objet !== 'object') return undefined;
  if (typeof etape === 'object') return Array.isArray(objet) ? objet.find((e) => e && e.nom === etape.nom) : undefined;
  return objet[etape];
}

export function lireChemin(objet, chemin) {
  return decouperChemin(chemin).reduce(suivre, objet);
}

/** Pose la valeur au chemin (undefined : champ retiré), crée les objets et listes manquants. -> objet */
export function ecrireChemin(objet, chemin, valeur) {
  const etapes = decouperChemin(chemin);
  let o = objet;
  for (let i = 0; i < etapes.length - 1; i++) {
    let s = suivre(o, etapes[i]);
    if (s === null || typeof s !== 'object') {
      if (typeof etapes[i] === 'object') throw new Error(`émetteur « ${etapes[i].nom} » introuvable`);
      s = typeof etapes[i + 1] === 'number' ? [] : {};
      o[etapes[i]] = s;
    }
    o = s;
  }
  const der = etapes[etapes.length - 1];
  if (typeof der === 'object') throw new Error('un chemin ne peut pas finir sur un émetteur');
  if (valeur === undefined) { if (!Array.isArray(o)) delete o[der]; } else o[der] = valeur;
  return objet;
}

/** Champ du formulaire le plus proche d'une erreur : le plus long chemin dont part celui de l'erreur. */
export function champPourErreur(chemins, cheminErreur) {
  let meilleur = null;
  for (const c of chemins) {
    const dessous = cheminErreur === c || cheminErreur.startsWith(`${c}.`) || cheminErreur.startsWith(`${c}[`);
    if (dessous && (meilleur === null || c.length > meilleur.length)) meilleur = c;
  }
  return meilleur;
}

/** Texte saisi -> nombre, expression (texte) ou undefined (vide). */
export function valeurSaisie(texte) {
  const t = String(texte).trim();
  if (!t) return undefined;
  return NOMBRE.test(t) ? Number(t) : t;
}

/** { nombre: '3000', couleur: 'accent' } -> 'nombre: 3000; couleur: accent' (valeurs vides omises). */
export function reglagesEnTexte(valeurs) {
  return Object.keys(valeurs)
    .filter((k) => valeurs[k] !== undefined && valeurs[k] !== null && String(valeurs[k]).trim() !== '')
    .map((k) => `${k}: ${String(valeurs[k]).trim()}`).join('; ');
}

/** Élément neuf d'une liste : exemple, sinon défaut, sinon objet de ses champs requis. */
export function valeurNeuve(noeud) {
  if (noeud.exemple !== undefined && noeud.exemple !== null) return copie(noeud.exemple);
  if (noeud.defaut !== undefined && noeud.defaut !== null) return copie(noeud.defaut);
  if (noeud.type === 'objet') {
    const o = {};
    for (const [k, n] of Object.entries(noeud.champs)) if (n.requis) o[k] = valeurNeuve(n);
    return o;
  }
  if (noeud.type === 'liste') return [];
  if (noeud.type === 'dictionnaire') return {};
  return undefined;
}

function nomLibre(noms) {
  let i = noms.length + 1;
  while (noms.includes(`emetteur-${i}`)) i++;
  return `emetteur-${i}`;
}

/** Recette de départ de la page d'atelier : un émetteur sur la zone d'ancre, deux réglages exposés. */
export function nouvelleRecette() {
  return {
    version: 1,
    nom: 'nouvel-effet',
    description: 'Créé dans l\'atelier',
    parametres: { nombre: { defaut: 200, min: 10, max: 5000 }, couleur: { defaut: 'accent', type: 'couleur' } },
    rendu_calque: { bloom: 1.5 },
    emetteurs: [{
      nom: 'emetteur',
      naissance: { debit: 'nombre / dur', forme: { type: 'ancre' }, vitesse: { cone: 360, valeur: [10, 30] }, vie: [0.8, 1.6], taille: [0.4, 0.8] },
      forces: [{ type: 'trainee', coef: 1 }],
      vie: { couleur: { degrade: ['#ffffff', 'couleur', '#00000000'] }, intensite: { de: 3, a: 0 } },
      rendu: { type: 'sprite', melange: 'additif' },
    }],
  };
}

/** Au plus un appel de fn toutes les ms millisecondes ; le dernier appel (ses arguments) n'est jamais perdu. */
export function limiter(fn, ms) {
  let dernier = -Infinity;
  let minuteur = null;
  let args = null;
  const lancer = () => {
    minuteur = null;
    dernier = Date.now();
    const a = args;
    args = null;
    fn(...a);
  };
  return (...a) => {
    args = a;
    if (minuteur) return;
    const attente = dernier + ms - Date.now();
    if (attente <= 0) lancer();
    else minuteur = setTimeout(lancer, attente);
  };
}

/** Compile comme l'assembleur, puis pose les textures de assets/ (connues, ou demandées à l'aperçu). */
export async function compilerPourPage(R, recette, options, textures) {
  const r = R.compiler(recette, options);
  if (!r.ok) return r;
  for (const em of r.effet.emetteurs) {
    if (!em.rendu.textureFichier) continue;
    let uri = textures.get(em.rendu.textureFichier);
    if (!uri) {
      let reponse = null;
      let corps = {};
      try {
        reponse = await fetch(`/_pm/atelier/texture?chemin=${encodeURIComponent(em.rendu.textureFichier)}`, { cache: 'no-store' });
        corps = await reponse.json().catch(() => ({}));
      } catch (e) { reponse = null; }
      if (!reponse || !reponse.ok) {
        return { ok: false, effet: null, erreurs: [{ regle: 'fichier-introuvable', chemin: `emetteurs[${em.nom}].rendu.texture`, message: corps.message || `Texture « ${em.rendu.textureFichier} » introuvable.` }] };
      }
      uri = corps.uri;
      textures.set(em.rendu.textureFichier, uri);
    }
    em.rendu.textureImage = uri;
  }
  return r;
}

// ---- Navigateur ----

const STYLE = `
.pm-ed { font: 13px/1.4 system-ui, sans-serif; color: #eee; }
.pm-ed details { margin: 4px 0 4px 6px; padding-left: 8px; border-left: 1px solid #444; }
.pm-ed summary { cursor: pointer; font-weight: 600; margin: 4px 0; }
.pm-ed-ligne { display: grid; grid-template-columns: 9em minmax(0, 1fr); gap: 2px 8px; align-items: center; margin: 3px 0; }
.pm-ed-ligne > span:first-child { color: #bbb; overflow-wrap: anywhere; }
.pm-ed-valeurs { display: flex; gap: 4px; align-items: center; min-width: 0; }
.pm-ed input[type=text], .pm-ed input[type=number], .pm-ed select { flex: 1; min-width: 0; background: #262626; color: #eee; border: 1px solid #444; border-radius: 4px; padding: 2px 4px; font: inherit; }
.pm-ed input[type=range] { flex: 2; min-width: 0; }
.pm-ed input[type=color] { width: 2.2em; height: 1.6em; padding: 0; border: 0; background: none; }
.pm-ed button { background: #333; color: #eee; border: 1px solid #555; border-radius: 4px; padding: 1px 6px; font: inherit; cursor: pointer; }
.pm-ed button:disabled { opacity: .5; cursor: default; }
.pm-ed-element { margin: 4px 0; }
.pm-ed-erreur > span:first-child, details.pm-ed-erreur > summary { color: #ff8a80; }
.pm-ed-message { grid-column: 1 / -1; color: #ff8a80; font-size: 12px; }
.pm-ed-general { color: #ff8a80; margin: 4px 0; }
`;

function poserStyle() {
  if (document.getElementById('pm-ed-style')) return;
  const s = document.createElement('style');
  s.id = 'pm-ed-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

/** el('input', { type: 'text', texte: '…' }, parent) : élément créé, attributs posés (texte : contenu), ajouté au parent. */
export function el(tag, attrs = {}, parent) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'texte') e.textContent = v; else e.setAttribute(k, v);
  }
  if (parent) parent.appendChild(e);
  return e;
}

let numero = 0;
function suggestions(parent, valeurs) {
  const id = `pm-ed-suggestions-${++numero}`;
  const liste = el('datalist', { id }, parent);
  valeurs.forEach((v) => el('option', { value: v }, liste));
  return id;
}

function nomsCourbes() {
  const C = globalThis.M || {};
  if (!Array.isArray(C.TYPES) || !Array.isArray(C.MODES)) return [];
  const r = [];
  C.TYPES.forEach((t) => C.MODES.forEach((m) => r.push(`${t}-${m}`)));
  return r;
}

const texteDe = (v) => (v === undefined || v === null ? '' : String(v));
const indice = (noeud) => texteDe(noeud.defaut !== null && noeud.defaut !== undefined ? noeud.defaut : noeud.exemple);

/** Nombre ou expression, avec un curseur si le nœud en a la course. */
function widgetNombre(parent, noeud, valeur, changer) {
  const boite = el('span', { class: 'pm-ed-valeurs' }, parent);
  const texte = el('input', { type: 'text', inputmode: 'decimal', value: texteDe(valeur), placeholder: indice(noeud), 'aria-label': noeud.libelle }, boite);
  let curseur = null;
  if (Array.isArray(noeud.curseur)) {
    const [a, b] = noeud.curseur;
    const depart = typeof valeur === 'number' ? valeur : typeof noeud.defaut === 'number' ? noeud.defaut : a;
    curseur = el('input', { type: 'range', min: String(a), max: String(b), step: String(noeud.pas || (b - a) / 200), value: String(depart), 'aria-label': `${noeud.libelle} (curseur)` }, boite);
    curseur.disabled = typeof valeur === 'string';
    curseur.addEventListener('input', () => { texte.value = curseur.value; changer(Number(curseur.value)); });
  }
  texte.addEventListener('input', () => {
    const v = valeurSaisie(texte.value);
    if (curseur) {
      curseur.disabled = typeof v === 'string';
      if (typeof v === 'number') curseur.value = String(v);
    }
    changer(v);
  });
  return boite;
}

/** Intervalle [min, max] ou paire [x, y] ; une valeur seule est montrée dans les deux champs. */
function widgetDeux(parent, noeud, valeur, changer, noms) {
  const boite = el('span', { class: 'pm-ed-valeurs' }, parent);
  const v = Array.isArray(valeur) ? valeur : valeur === undefined || valeur === null ? [undefined, undefined] : [valeur, valeur];
  const d = Array.isArray(noeud.defaut) ? noeud.defaut : ['', ''];
  const champs = [0, 1].map((i) => el('input', { type: 'text', inputmode: 'decimal', value: texteDe(v[i]), placeholder: texteDe(d[i]), 'aria-label': `${noeud.libelle} (${noms[i]})` }, boite));
  const lire = () => {
    const x = champs.map((c) => valeurSaisie(c.value));
    if (x[0] === undefined && x[1] === undefined) return undefined;
    return [x[0] === undefined ? d[0] : x[0], x[1] === undefined ? d[1] : x[1]];
  };
  champs.forEach((c) => c.addEventListener('input', () => changer(lire())));
  return boite;
}

/** Couleur : texte (#rrggbb, #rrggbbaa, nom de la charte ou d'un réglage) et pastille. */
function widgetCouleur(parent, valeur, noms, changer) {
  const boite = el('span', { class: 'pm-ed-valeurs' }, parent);
  const texte = el('input', { type: 'text', value: texteDe(valeur), list: suggestions(boite, noms), placeholder: '#rrggbb, accent…', 'aria-label': 'Couleur' }, boite);
  const pastille = el('input', { type: 'color', value: HEX6.test(texteDe(valeur)) ? valeur : '#ffffff', 'aria-label': 'Choisir la couleur' }, boite);
  pastille.addEventListener('input', () => { texte.value = pastille.value; changer(pastille.value); });
  texte.addEventListener('input', () => {
    const t = texte.value.trim();
    if (HEX6.test(t)) pastille.value = t;
    changer(t || undefined);
  });
  return boite;
}

/** Liste de valeurs ; « autre » : valeur libre (image de assets/). */
function widgetChoix(parent, noeud, valeur, changer) {
  const boite = el('span', { class: 'pm-ed-valeurs' }, parent);
  const s = el('select', { 'aria-label': noeud.libelle }, boite);
  el('option', { value: '', texte: noeud.defaut === null || noeud.defaut === undefined ? '—' : `(défaut : ${noeud.defaut})` }, s);
  noeud.valeurs.forEach((v) => el('option', { value: String(v), texte: String(v) }, s));
  let libre = null;
  if (noeud.autre) {
    el('option', { value: '__autre', texte: noeud.autre.libelle }, s);
    libre = el('input', { type: 'text', placeholder: 'assets/…', 'aria-label': noeud.autre.libelle }, boite);
  }
  const connue = valeur === undefined || noeud.valeurs.map(String).includes(String(valeur));
  s.value = valeur === undefined ? '' : connue ? String(valeur) : libre ? '__autre' : '';
  if (libre) {
    libre.hidden = s.value !== '__autre';
    libre.value = connue ? '' : texteDe(valeur);
    libre.addEventListener('input', () => changer(libre.value.trim() || undefined));
  }
  s.addEventListener('change', () => {
    if (libre) libre.hidden = s.value !== '__autre';
    if (s.value === '__autre') { changer(libre.value.trim() || undefined); return; }
    changer(s.value === '' ? undefined : noeud.valeurs.find((x) => String(x) === s.value));
  });
  return boite;
}

/**
 * Formulaire de toute la recette, généré depuis le schéma. surChangement(copie de la recette) à chaque saisie ;
 * marquer(erreurs) rattache chaque erreur du compilateur au champ le plus proche (les autres : en tête).
 */
export function construireFormulaire(conteneur, { schema, recette, surChangement }) {
  poserStyle();
  let donnees = copie(recette);
  const champs = new Map();
  const ouverts = new Set();
  let erreursCourantes = [];
  const racine = el('div', { class: 'pm-ed pm-ed-formulaire' }, conteneur);
  const general = el('div', { class: 'pm-ed-general', hidden: '' }, racine);
  const corps = el('div', {}, racine);
  const changer = () => surChangement(copie(donnees));
  const poser = (chemin, v) => { ecrireChemin(donnees, chemin, v); changer(); };
  const joindre = (chemin, k) => (chemin ? `${chemin}.${k}` : k);
  const nomsCouleurs = () => CHARTE.concat(Object.keys(donnees.parametres || {}).filter((k) => donnees.parametres[k] && donnees.parametres[k].type === 'couleur'));
  const sousEmetteurs = () => new Set((donnees.emetteurs || []).map((e) => e && e.a_la_mort && e.a_la_mort.emetteur).filter(Boolean));

  function ligne(parent, noeud, chemin) {
    const l = el('div', { class: 'pm-ed-ligne', 'data-chemin': chemin }, parent);
    el('span', { texte: noeud.libelle + (noeud.unite ? ` (${noeud.unite})` : ''), title: chemin }, l);
    champs.set(chemin, l);
    return l;
  }

  function groupe(parent, libelle, chemin) {
    const d = el('details', { 'data-chemin': chemin }, parent);
    if (ouverts.has(chemin)) d.open = true;
    d.addEventListener('toggle', () => { if (d.open) ouverts.add(chemin); else ouverts.delete(chemin); });
    el('summary', { texte: libelle }, d);
    champs.set(chemin, d);
    return d;
  }

  function champ(parent, noeud, chemin, contexte) {
    if (noeud.contexte && contexte && noeud.contexte !== contexte) return;
    const v = lireChemin(donnees, chemin);
    const changer1 = (x) => poser(chemin, x);
    switch (noeud.type) {
      case 'objet': objet(parent, noeud, chemin, contexte); break;
      case 'liste': liste(parent, noeud, chemin); break;
      case 'dictionnaire': dictionnaire(parent, noeud, chemin); break;
      case 'nombre': widgetNombre(ligne(parent, noeud, chemin), noeud, v, changer1); break;
      case 'intervalle': widgetDeux(ligne(parent, noeud, chemin), noeud, v, changer1, ['minimum', 'maximum']); break;
      case 'paire': widgetDeux(ligne(parent, noeud, chemin), noeud, v, changer1, ['x', 'y']); break;
      case 'couleur': widgetCouleur(ligne(parent, noeud, chemin), v, nomsCouleurs(), changer1); break;
      case 'choix': widgetChoix(ligne(parent, noeud, chemin), noeud, v, changer1); break;
      case 'courbe': {
        const boite = el('span', { class: 'pm-ed-valeurs' }, ligne(parent, noeud, chemin));
        const t = el('input', { type: 'text', value: texteDe(v), placeholder: 'linéaire', list: suggestions(boite, nomsCourbes()), 'aria-label': noeud.libelle }, boite);
        t.addEventListener('input', () => changer1(t.value.trim() || undefined));
        break;
      }
      case 'booleen': {
        const boite = el('span', { class: 'pm-ed-valeurs' }, ligne(parent, noeud, chemin));
        const c = el('input', { type: 'checkbox', 'aria-label': noeud.libelle }, boite);
        c.checked = v === true;
        c.addEventListener('change', () => changer1(c.checked ? true : noeud.defaut === false ? undefined : false));
        break;
      }
      case 'texte': {
        const boite = el('span', { class: 'pm-ed-valeurs' }, ligne(parent, noeud, chemin));
        const noms = noeud.parmi === 'emetteurs' ? (donnees.emetteurs || []).map((e) => e && e.nom).filter(Boolean) : null;
        const t = el('input', { type: 'text', value: texteDe(v), placeholder: indice(noeud), list: noms ? suggestions(boite, noms) : undefined, 'aria-label': noeud.libelle }, boite);
        // Nom d'émetteur ou lien « à la mort » : chemins ou contexte changent, formulaire refait à la sortie du champ.
        const structure = noeud.parmi === 'emetteurs' || /^emetteurs\[[^\]]*\]\.nom$/.test(chemin);
        t.addEventListener(structure ? 'change' : 'input', () => {
          poser(chemin, t.value.trim() === '' ? undefined : t.value.trim());
          if (structure) rendre();
        });
        break;
      }
      case 'valeur': {
        const l = ligne(parent, noeud, chemin);
        const parentChemin = chemin.slice(0, chemin.lastIndexOf('.'));
        if (lireChemin(donnees, joindre(parentChemin, noeud.selon)) === 'couleur') widgetCouleur(l, v, CHARTE, changer1);
        else widgetNombre(l, { ...noeud, type: 'nombre' }, v, changer1);
        break;
      }
      default: break;
    }
  }

  function objet(parent, noeud, chemin, contexte) {
    const v = chemin ? lireChemin(donnees, chemin) : donnees;
    const boite = chemin ? groupe(parent, noeud.libelle, chemin) : parent;
    if (noeud.raccourci && v !== undefined && v !== null && typeof v !== 'object') {
      // Valeur seule (« taille: 0.5 », « couleur: "#fff" ») : un champ, et de quoi la détailler.
      const l = ligne(boite, { libelle: 'Valeur' }, chemin);
      if (noeud.raccourci === 'couleur') widgetCouleur(l, v, nomsCouleurs(), (x) => poser(chemin, x));
      else widgetNombre(l, { libelle: 'Valeur', defaut: null }, v, (x) => poser(chemin, x));
      const b = el('button', { type: 'button', texte: 'Détailler' }, boite);
      b.addEventListener('click', () => {
        poser(chemin, noeud.raccourci === 'couleur' ? { degrade: [v] } : { de: v });
        ouverts.add(chemin);
        rendre();
      });
      return;
    }
    let champsNoeud = noeud.champs;
    if (noeud.variantes) {
      const variante = v && noeud.variantes.types[v[noeud.variantes.cle]];
      if (variante) {
        champsNoeud = { ...noeud.champs, ...variante.champs };
        boite.querySelector('summary').textContent = `${noeud.libelle} : ${variante.libelle}`;
      }
    }
    for (const [k, n] of Object.entries(champsNoeud)) {
      const c = joindre(chemin, k);
      const structure = (noeud.variantes && k === noeud.variantes.cle) || Object.values(champsNoeud).some((x) => x.selon === k);
      if (structure && n.type === 'choix') {
        widgetChoix(ligne(boite, n, c), n, lireChemin(donnees, c), (x) => {
          if (noeud.variantes && k === noeud.variantes.cle) ecrireChemin(donnees, chemin, x === undefined ? {} : { [k]: x });
          else ecrireChemin(donnees, c, x);
          changer();
          rendre();
        });
      } else champ(boite, n, c, contexte);
    }
  }

  function liste(parent, noeud, chemin) {
    const boite = groupe(parent, noeud.libelle, chemin);
    const elements = Array.isArray(lireChemin(donnees, chemin)) ? lireChemin(donnees, chemin) : [];
    const sous = chemin === 'emetteurs' ? sousEmetteurs() : null;
    elements.forEach((x, i) => {
      const nom = x && typeof x === 'object' && typeof x.nom === 'string' && /^[a-z0-9-]+$/.test(x.nom) ? x.nom : null;
      const c = `${chemin}[${nom !== null ? nom : i}]`;
      const zone = el('div', { class: 'pm-ed-element' }, boite);
      const retirer = el('button', { type: 'button', texte: 'Retirer', title: 'Retirer cet élément', 'data-action': 'retirer' }, zone);
      retirer.addEventListener('click', () => { lireChemin(donnees, chemin).splice(i, 1); changer(); rendre(); });
      const contexte = sous ? (sous.has(nom) ? 'sous-emetteur' : 'racine') : undefined;
      const libelle = nom !== null ? `${noeud.element.libelle} « ${nom} »` : `${noeud.element.libelle} ${i + 1}`;
      if (noeud.element.type === 'objet') objet(zone, { ...noeud.element, libelle }, c, contexte);
      else champ(zone, { ...noeud.element, libelle }, c, contexte);
    });
    const ajouter = el('button', { type: 'button', texte: `Ajouter : ${noeud.element.libelle.toLowerCase()}`, 'data-action': 'ajouter' }, boite);
    ajouter.disabled = noeud.maximum !== undefined && elements.length >= noeud.maximum;
    ajouter.addEventListener('click', () => {
      const neuf = valeurNeuve(noeud.element);
      if (chemin === 'emetteurs' && neuf && typeof neuf === 'object') neuf.nom = nomLibre(elements.map((e) => e && e.nom));
      if (!Array.isArray(lireChemin(donnees, chemin))) ecrireChemin(donnees, chemin, []);
      lireChemin(donnees, chemin).push(neuf);
      ouverts.add(chemin);
      changer();
      rendre();
    });
  }

  function dictionnaire(parent, noeud, chemin) {
    const boite = groupe(parent, noeud.libelle, chemin);
    const v = lireChemin(donnees, chemin);
    const cles = v && typeof v === 'object' ? Object.keys(v) : [];
    cles.forEach((k) => {
      const zone = el('div', { class: 'pm-ed-element' }, boite);
      const retirer = el('button', { type: 'button', texte: 'Retirer', 'data-action': 'retirer' }, zone);
      retirer.addEventListener('click', () => { delete lireChemin(donnees, chemin)[k]; changer(); rendre(); });
      objet(zone, { ...noeud.element, libelle: `« ${k} »` }, `${chemin}.${k}`);
    });
    const ajout = el('div', { class: 'pm-ed-valeurs' }, boite);
    const nom = el('input', { type: 'text', placeholder: 'nom du réglage', 'aria-label': 'Nom du nouveau réglage' }, ajout);
    const bouton = el('button', { type: 'button', texte: 'Ajouter', 'data-action': 'ajouter' }, ajout);
    nom.addEventListener('input', () => nom.setCustomValidity(''));
    bouton.addEventListener('click', () => {
      const k = nom.value.trim();
      if (!new RegExp(noeud.cle).test(k) || cles.includes(k)) {
        nom.setCustomValidity('Nom : minuscules, chiffres et _, pas déjà pris.');
        nom.reportValidity();
        return;
      }
      if (!v || typeof v !== 'object') ecrireChemin(donnees, chemin, {});
      lireChemin(donnees, chemin)[k] = { defaut: 1, min: 0, max: 10 };
      ouverts.add(chemin);
      ouverts.add(`${chemin}.${k}`);
      changer();
      rendre();
    });
  }

  function marquer(erreurs) {
    erreursCourantes = erreurs || [];
    racine.querySelectorAll('.pm-ed-erreur').forEach((x) => x.classList.remove('pm-ed-erreur'));
    racine.querySelectorAll('.pm-ed-message').forEach((x) => x.remove());
    const restes = [];
    for (const e of erreursCourantes) {
      const c = e.chemin ? champPourErreur([...champs.keys()], e.chemin) : null;
      const cible = c !== null ? champs.get(c) : null;
      if (!cible) { restes.push(e.message); continue; }
      cible.classList.add('pm-ed-erreur');
      el('div', { class: 'pm-ed-message', texte: e.message }, cible);
      if (cible.tagName === 'DETAILS') cible.open = true;
      for (let p = cible.parentElement; p && p !== racine; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
    }
    general.hidden = !restes.length;
    general.textContent = restes.join(' ');
  }

  function rendre() {
    corps.textContent = '';
    champs.clear();
    objet(corps, schema, '');
    marquer(erreursCourantes);
  }

  rendre();
  return {
    recette: () => copie(donnees),
    remplacer(r) { donnees = copie(r); rendre(); },
    marquer,
    detruire() { racine.remove(); },
  };
}

/**
 * Réglages exposés d'une recette (niveau simple) : curseur entre min et max, ou couleur. valeurs : celles de
 * data-reglages (texte) ; seules les valeurs touchées ou déjà écrites sont rendues par valeurs().
 */
export function construireReglages(conteneur, { parametres, valeurs, charte = CHARTE, surChangement }) {
  poserStyle();
  const actuelles = { ...valeurs };
  const racine = el('div', { class: 'pm-ed pm-ed-reglages' }, conteneur);
  const general = el('div', { class: 'pm-ed-general', hidden: '' }, racine);
  const lignes = new Map();
  const noms = Object.keys(parametres || {});
  if (!noms.length) el('p', { texte: 'Cet effet n\'expose aucun réglage : passez à la recette complète.' }, racine);
  for (const nom of noms) {
    const p = parametres[nom] || {};
    const l = el('div', { class: 'pm-ed-ligne', 'data-chemin': `reglages.${nom}` }, racine);
    el('span', { texte: nom }, l);
    lignes.set(`reglages.${nom}`, l);
    const changer = (x) => {
      if (x === undefined) delete actuelles[nom]; else actuelles[nom] = String(x);
      surChangement({ ...actuelles });
    };
    if (p.type === 'couleur') widgetCouleur(l, actuelles[nom] !== undefined ? actuelles[nom] : p.defaut, charte, changer);
    else {
      const bornes = typeof p.min === 'number' && typeof p.max === 'number';
      const entier = bornes && [p.min, p.max, p.defaut].every(Number.isInteger) && p.max - p.min >= 20;
      widgetNombre(l, { libelle: nom, defaut: p.defaut, curseur: bornes ? [p.min, p.max] : null, pas: entier ? 1 : undefined },
        actuelles[nom] !== undefined ? valeurSaisie(actuelles[nom]) : p.defaut, changer);
    }
  }
  return {
    valeurs: () => ({ ...actuelles }),
    marquer(erreurs) {
      racine.querySelectorAll('.pm-ed-erreur').forEach((x) => x.classList.remove('pm-ed-erreur'));
      racine.querySelectorAll('.pm-ed-message').forEach((x) => x.remove());
      const restes = [];
      for (const e of erreurs || []) {
        const l = lignes.get(e.chemin);
        if (!l) { restes.push(e.message); continue; }
        l.classList.add('pm-ed-erreur');
        el('div', { class: 'pm-ed-message', texte: e.message }, l);
      }
      general.hidden = !restes.length;
      general.textContent = restes.join(' ');
    },
    detruire() { racine.remove(); },
  };
}
