'use strict';
/* Pulse Motion – écrans dans une scène (spec S6, 5.8 à 5.12) : préparation à l'assemblage et contrôle sans navigateur.
 *
 *   <div class="pm-ecran" data-cadre="navigateur" data-adresse="https://app.exemple.fr/factures?client=12">
 *     <img src="assets/factures.png" alt="Liste des factures">
 *     <i class="pm-clic" data-cible="12%,8%" data-start="mot:nouvelle"></i>
 *     <i class="pm-projecteur" data-cible="40%,30%,20%,8%" data-start="3"></i>
 *   </div>
 *
 * preparerEcrans(html, { scene, projet, film, duree }) -> { html, erreurs, ecrans, films }
 *   Chaque écran reçoit son cadre (barre du navigateur ou de la fenêtre), une surface et un plan (que zooment les marques
 *   pm-zoom) : <div class="pm-ecran-surface"><div class="pm-ecran-plan">…contenu et marques…</div></div>. L'adresse est
 *   réduite au nom de domaine à l'assemblage : l'adresse complète n'entre jamais dans la page. data-page (« 1280x800 »)
 *   devient --pm-page-l et --pm-page-h ; sans data-page, la taille de tournage par défaut du cadre. Les marques reçoivent
 *   data-decor et aria-hidden ; un clic reçoit le bruitage « clic » (data-son="aucun" : aucun) ; un double-clic, un second
 *   bruitage 0,15 s plus tard ; projecteur, anneau et assombrissement durent 3 s, un zoom 2,4 s, sans data-dur.
 *   Règles : ecran-invalide (erreur : cadre, pointeur, cible ou marque mal écrits, marque hors d'un écran),
 *   pointeur-hors-ecran (alerte : une cible x%,y% hors de l'image), suivre-desactive (alerte : data-camera sur un écran
 *   qui suit les gestes).
 *   Film (plan 2 de S6, 5.8) : data-film="<nom>" (films/<nom>/, prise choisie) devient data-film="fichier:pm-film-<nom>" ;
 *   data-etapes (sinon scenes[].film.etapes du déroulé, sinon toutes) dit les étapes montrées, data-page la taille de la
 *   page filmée, --pm-ecran-bords-1 et -2 les couleurs des bords (cadre « présentation ») ; une marque pm-etape
 *   (data-etape, data-start) reçoit le bruitage « clic » si son étape est un clic ; une étape de clic sans marque le reçoit
 *   à l'instant où le moteur la place (marques chiffrées seulement). Règles : film-introuvable et prise-non-choisie
 *   (erreurs), page-pas-calme (alerte reprise du tournage). projet absent : le film n'est pas lu (contrôle sans projet).
 *   films : [{ nom, etapes }] à embarquer.
 * usagesEcran(html) -> { moteur, css } : la scène a un écran ou une marque (groupe « ecran » du moteur) ; elle a besoin de
 *   moteur/ecran.css (écran, bloc, saisie, pm-3d).
 * domaine(adresse) -> nom de domaine seul ('' pour un fichier local).
 */

const CADRES = ['navigateur', 'fenetre', 'telephone', 'tablette', 'presentation', 'aucun'];
const POINTEURS = ['fleche', 'main', 'doigt', 'aucun'];
// Taille de tournage par défaut de chaque cadre (px CSS de la page montrée), spec S6 5.12.
const PAGES = { navigateur: [1280, 800], fenetre: [1280, 800], telephone: [390, 844], tablette: [820, 1180], presentation: [1280, 800], aucun: [1280, 800] };
const GESTES = ['pm-clic', 'pm-survol', 'pm-double-clic'];
const MISES = ['pm-projecteur', 'pm-anneau', 'pm-assombrir', 'pm-zoom'];
const MARQUES = [...GESTES, ...MISES, 'pm-etape'];
const CLICS = ['cliquer', 'double-cliquer', 'cocher', 'decocher', 'taper', 'vider', 'choisir'];
const DUREES = { 'pm-projecteur': '3', 'pm-anneau': '3', 'pm-assombrir': '3', 'pm-zoom': '2.4' };
const BALISE = /<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const ATTRIBUT = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const VIDES = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const NOMBRE = '-?\\d+(?:\\.\\d+)?';
const POINT = new RegExp(`^(${NOMBRE})%\\s*,\\s*(${NOMBRE})%$`);
const BOITE = new RegExp(`^(${NOMBRE})%\\s*,\\s*(${NOMBRE})%\\s*,\\s*(${NOMBRE})%\\s*,\\s*(${NOMBRE})%$`);

const echapper = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const classes = (attrs) => String(attrs.class || '').split(/\s+/).filter(Boolean);

/** Attributs d'une balise, dans l'ordre : [[nom, valeur | null]]. */
function lireAttributs(texte) {
  const r = [];
  let m;
  ATTRIBUT.lastIndex = 0;
  while ((m = ATTRIBUT.exec(texte))) {
    if (m[1] === '/') continue;
    r.push([m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? null]);
  }
  return r;
}
const enObjet = (liste) => Object.fromEntries(liste.filter(([n], i) => liste.findIndex(([x]) => x === n) === i));
const ecrireAttributs = (liste) => liste.map(([n, v]) => (v === null ? ` ${n}` : ` ${n}="${echapper(v)}"`)).join('');

/** Commentaires, styles et scripts remplacés par des espaces de même longueur (positions gardées). */
function masquer(html) {
  return html.replace(/<!--[\s\S]*?-->|<(style|script)\b[\s\S]*?<\/\1\s*>/gi, (t) => ' '.repeat(t.length));
}

/** Balises ouvrantes et fermantes du texte masqué : [{ debut, fin, nom, ferme, attributs, auto }]. */
function balises(masque) {
  const r = [];
  let m;
  BALISE.lastIndex = 0;
  while ((m = BALISE.exec(masque))) {
    if (m[1]) r.push({ debut: m.index, fin: m.index + m[0].length, nom: m[1].toLowerCase(), ferme: true });
    else r.push({ debut: m.index, fin: m.index + m[0].length, nom: m[2].toLowerCase(), ferme: false, attributs: m[3], auto: /\/\s*$/.test(m[3]) || VIDES.has(m[2].toLowerCase()) });
  }
  return r;
}

function domaine(adresse) {
  const a = String(adresse || '').trim();
  if (!a) return '';
  if (/^file:/i.test(a)) return '';
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(a) ? a : `https://${a}`);
    return u.hostname;
  } catch {
    return a.replace(/^[a-z]+:\/\//i, '').split(/[/?#:]/)[0];
  }
}

/** Cible d'une marque -> { forme: 'id' | 'point' | 'boite', valeurs } ou { erreur }. */
function lireCible(texte) {
  const t = String(texte || '').trim();
  let m;
  if ((m = /^#([A-Za-z][\w-]*)$/.exec(t))) return { forme: 'id', id: m[1] };
  if ((m = POINT.exec(t))) return { forme: 'point', valeurs: [Number(m[1]), Number(m[2])] };
  if ((m = BOITE.exec(t))) return { forme: 'boite', valeurs: [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] };
  if ((m = /^etape:(\d+)$/.exec(t))) return { forme: 'etape', etape: Number(m[1]) };
  return { erreur: `cible « ${t} » illisible (#id d'un élément de l'écran, x%,y% ou x%,y%,l%,h% de l'image)` };
}

function usagesEcran(html) {
  const t = String(html);
  const moteur = /class\s*=\s*["'][^"']*\bpm-(?:ecran|clic|survol|double-clic|projecteur|anneau|assombrir|zoom|etape)\b/.test(t);
  const css = moteur || /class\s*=\s*["'][^"']*\bpm-(?:bloc|3d)\b/.test(t) || /data-lettres\s*=\s*["']saisie["']/.test(t);
  return { moteur, css };
}

/** Barre du cadre (navigateur, fenêtre) : décor, aucun texte du déroulé. */
function barre(cadre, attrs) {
  if (cadre === 'navigateur') {
    const d = domaine(attrs['data-adresse']);
    return `<div class="pm-ecran-barre" data-decor aria-hidden="true"><span class="pm-ecran-pastilles"><i></i><i></i><i></i></span><span class="pm-ecran-adresse">${echapper(d)}</span></div>`;
  }
  if (cadre === 'fenetre') {
    return `<div class="pm-ecran-barre" data-decor aria-hidden="true"><span class="pm-ecran-pastilles"><i></i><i></i><i></i></span><span class="pm-ecran-titre">${echapper(attrs['data-titre'] || '')}</span></div>`;
  }
  return '';
}

/** Blocs « liste » et « dialogue » d'un écran filmé (data-film-etape="N") : redessinés depuis ce que le tournage a relevé
 *  (spec S6, 5.13) : les options de la liste déroulante native et l'option choisie (mise en valeur à data-choix, 1 s par
 *  défaut), le message d'une boîte de dialogue et ses boutons. */
function remplirBlocs(interieur, film, etapes, err) {
  const tags = balises(masquer(interieur));
  const morceaux = [];
  let depuis = 0;
  for (let i = 0; i < tags.length; i++) {
    const b = tags[i];
    if (b.ferme || b.debut < depuis) continue;
    const a = enObjet(lireAttributs(b.attributs));
    if (a['data-film-etape'] === undefined) continue;
    const c = classes(a);
    const n = Number(a['data-film-etape']);
    const e = film.etapes.find((x) => x.n === n);
    const quoi = c.includes('pm-bloc-liste') ? 'liste' : c.includes('pm-bloc-dialogue') ? 'dialogue' : null;
    if (!quoi) { err(`data-film-etape se pose sur un bloc « liste » ou « dialogue ».`); continue; }
    if (!e || !etapes.includes(n)) { err(`bloc « ${quoi} » : l'étape ${a['data-film-etape']} n'est pas montrée par cet écran.`); continue; }
    if (quoi === 'liste' && !e.options) { err(`bloc « liste » : l'étape ${n} n'a pas de liste déroulante relevée au tournage.`); continue; }
    if (quoi === 'dialogue' && !e.dialogue) { err(`bloc « dialogue » : l'étape ${n} n'a pas ouvert de boîte de dialogue au tournage.`); continue; }
    let profondeur = 0;
    let j = i + 1;
    for (; j < tags.length; j++) {
      if (tags[j].nom !== b.nom) continue;
      if (tags[j].ferme) { if (profondeur === 0) break; profondeur--; } else if (!tags[j].auto) profondeur++;
    }
    if (j >= tags.length) continue;
    const debut = b.fin, fin = tags[j].debut;
    const choix = /^-?\d+(\.\d+)?$/.test(String(a['data-choix'] || '')) ? a['data-choix'] : '1';
    let corps;
    if (quoi === 'liste') {
      const champ = e.options.etiquette || (e.cible && e.cible.libelle) || '';
      corps = `<p class="pm-bloc-champ"><span>${echapper(e.options.libelles[e.options.choisie] || champ)}</span></p><ul class="pm-bloc-options">`
        + e.options.libelles.map((l, k) => (k === e.options.choisie ? `<li class="pm-bloc-choisie" data-start="${choix}">${echapper(l)}</li>` : `<li>${echapper(l)}</li>`)).join('') + '</ul>';
    } else {
      const ok = e.dialogue.type === 'alert' ? '' : '<span class="pm-bloc-bouton pm-bloc-second">Annuler</span>';
      corps = `<p class="pm-bloc-texte">${echapper(e.dialogue.message)}</p><p class="pm-bloc-boutons">${ok}<span class="pm-bloc-bouton pm-bloc-choisie" data-start="${choix}">OK</span></p>`;
    }
    morceaux.push(interieur.slice(depuis, debut), corps);
    depuis = fin;
  }
  morceaux.push(interieur.slice(depuis));
  return morceaux.join('');
}

function preparerEcrans(html, { scene = '', projet = null, film: filmScene = null, duree = 0 } = {}) {
  const texte = String(html);
  const erreurs = [];
  const ecrans = [];
  const films = [];
  if (!usagesEcran(texte).moteur) return { html: texte, erreurs, ecrans, films };
  const ou = scene ? `Scène « ${scene} » : ` : '';
  const err = (message) => erreurs.push({ regle: 'ecran-invalide', gravite: 'erreur', ...(scene ? { scene } : {}), message: ou + message });
  const signaler = (regle, message) => erreurs.push({ regle, gravite: 'alerte', ...(scene ? { scene } : {}), message: ou + message });
  const tags = balises(masquer(texte));

  // Écrans : balise ouvrante et fermante qui lui répond.
  const zones = [];
  for (let i = 0; i < tags.length; i++) {
    const b = tags[i];
    if (b.ferme || !classes(enObjet(lireAttributs(b.attributs))).includes('pm-ecran')) continue;
    let profondeur = 0;
    let j = i + 1;
    if (!b.auto) {
      for (; j < tags.length; j++) {
        const c = tags[j];
        if (c.nom !== b.nom) continue;
        if (c.ferme) { if (profondeur === 0) break; profondeur--; } else if (!c.auto) profondeur++;
      }
    }
    if (b.auto || j >= tags.length) { err('un écran (class="pm-ecran") n\'est pas refermé.'); continue; }
    if (zones.some((z) => b.debut < z.fin)) { err('un écran ne se pose pas dans un autre écran.'); continue; }
    zones.push({ ouvrante: b, fermante: tags[j], debut: b.debut, fin: tags[j].fin, indices: [i, j] });
  }

  // Marques hors d'un écran.
  for (const b of tags) {
    if (b.ferme) continue;
    const c = classes(enObjet(lireAttributs(b.attributs)));
    const marque = c.find((x) => MARQUES.includes(x));
    if (marque && !zones.some((z) => b.debut > z.debut && b.fin < z.fermante.debut)) err(`la marque « ${marque} » se pose dans un écran (<div class="pm-ecran">…</div>).`);
  }

  let sortie = '';
  let depuis = 0;
  zones.forEach((z, rangEcran) => {
    const liste = lireAttributs(z.ouvrante.attributs);
    const attrs = enObjet(liste);
    let cadre = attrs['data-cadre'] === undefined ? 'navigateur' : attrs['data-cadre'];
    if (!CADRES.includes(cadre)) err(`cadre « ${cadre} » inconnu (${CADRES.join(', ')}).`);
    const parDefaut = cadre === 'telephone' || cadre === 'tablette' ? 'doigt' : 'fleche';
    let pointeur = attrs['data-pointeur'] === undefined ? parDefaut : attrs['data-pointeur'];
    if (!POINTEURS.includes(pointeur)) err(`pointeur « ${pointeur} » inconnu (${POINTEURS.join(', ')}).`);
    // Film : prise choisie, étapes montrées, taille de la page filmée, couleurs des bords.
    let film = null;
    let etapesFilm = [];
    const nomFilm = attrs['data-film'] !== undefined ? String(attrs['data-film']).replace(/^fichier:pm-film-/, '') : null;
    if (nomFilm !== null && projet) {
      const F = require('./film.js');
      const r = F.filmChoisi(projet, nomFilm);
      if (!r.film) erreurs.push({ regle: r.regle, gravite: 'erreur', ...(scene ? { scene } : {}), message: ou + r.message });
      else {
        film = r.film;
        const demande = attrs['data-etapes'] !== undefined ? attrs['data-etapes'] : filmScene && filmScene.nom === nomFilm ? filmScene.etapes : null;
        const numeros = demande === null || demande === undefined ? film.etapes.map((e) => e.n) : F.lireEtapes(demande);
        if (!numeros) err(`data-etapes « ${demande} » : des numéros d'étapes du film (« 2-4 », « 1,3 »).`);
        else {
          const absentes = numeros.filter((n) => !film.etapes.some((e) => e.n === n));
          if (absentes.length) err(`le film « ${nomFilm} » n'a pas d'étape ${absentes.join(', ')} (${film.etapes.length} étape${film.etapes.length > 1 ? 's' : ''}, prise ${r.prise}).`);
          etapesFilm = numeros.filter((n) => film.etapes.some((e) => e.n === n));
        }
        films.push({ nom: nomFilm, etapes: etapesFilm });
        for (const e of film.etapes.filter((x) => etapesFilm.includes(x.n))) {
          for (const a of e.alertes || []) signaler('page-pas-calme', `film « ${nomFilm} », ${a} au tournage : l'image de cette étape peut montrer un chargement ; refilmer si elle est fausse.`);
        }
      }
    } else if (nomFilm !== null && !/^[a-z0-9-]+$/.test(nomFilm)) err(`data-film « ${attrs['data-film']} » : le nom d'un film (a-z, 0-9, tirets).`);
    let page = PAGES[CADRES.includes(cadre) ? cadre : 'navigateur'];
    if (film) {
      page = [film.largeur, film.hauteur];
      // Film tourné sur téléphone ou tablette : son cadre par défaut, et le doigt.
      if (attrs['data-cadre'] === undefined && (film.appareil === 'telephone' || film.appareil === 'tablette')) cadre = film.appareil;
      if (attrs['data-pointeur'] === undefined && (cadre === 'telephone' || cadre === 'tablette')) pointeur = 'doigt';
    }
    if (attrs['data-page'] !== undefined && !film) {
      const m = /^\s*(\d{2,5})\s*[x×]\s*(\d{2,5})\s*$/.exec(attrs['data-page']);
      if (m) page = [Number(m[1]), Number(m[2])];
      else err(`data-page « ${attrs['data-page']} » : écrire la taille de la page montrée en pixels, par exemple « 1280x800 ».`);
    }
    if (attrs['data-pointeur-depart'] !== undefined && !POINT.test(attrs['data-pointeur-depart'].trim())) err(`data-pointeur-depart « ${attrs['data-pointeur-depart']} » : écrire x%,y% (par exemple 70%,80%).`);
    if (attrs['data-pointeur-vitesse'] !== undefined && !(Number(attrs['data-pointeur-vitesse']) > 0)) err(`data-pointeur-vitesse « ${attrs['data-pointeur-vitesse']} » : un facteur de la durée des trajets (1.4 : plus lent).`);
    const suivre = attrs['data-film-camera'];
    if (suivre !== undefined && suivre !== 'suivre') err(`data-film-camera « ${suivre} » : seule la valeur « suivre » existe.`);
    if (suivre === 'suivre' && attrs['data-camera'] !== undefined) signaler('suivre-desactive', 'l\'écran a sa propre caméra (data-camera) : elle passe avant le suivi des gestes (data-film-camera="suivre"), qui est ignoré.');

    // Contenu : marques réécrites, cibles vérifiées.
    const contenu = texte.slice(z.ouvrante.fin, z.fermante.debut);
    const masqueContenu = masquer(contenu);
    const ids = new Set([...masqueContenu.matchAll(/\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => m[1] ?? m[2]));
    const voiles = [];
    const marquees = new Set();
    let interieur = '';
    let k = 0;
    let n = 0;
    for (const b of balises(masqueContenu)) {
      if (b.ferme) continue;
      const la = lireAttributs(b.attributs);
      const a = enObjet(la);
      const marque = classes(a).find((x) => MARQUES.includes(x));
      if (!marque) continue;
      n++;
      const nom = a.id ? `« ${marque} » #${a.id}` : `« ${marque} » n° ${n}`;
      if (a['data-start'] === undefined) err(`${nom} : data-start manquant (l'instant ${marque === 'pm-etape' ? 'de l\'action de l\'étape' : GESTES.includes(marque) ? 'du geste' : 'où la mise en valeur commence'}).`);
      let etapeMarque = null;
      if (marque === 'pm-etape') {
        const k = Number(a['data-etape']);
        if (nomFilm === null) err(`${nom} : une marque pm-etape se pose dans l'écran d'un film (data-film).`);
        else if (!(Number.isInteger(k) && k > 0)) err(`${nom} : data-etape, le numéro de l'étape du film.`);
        else if (film && !etapesFilm.includes(k)) err(`${nom} : l'étape ${k} n'est pas montrée par cet écran (étapes ${etapesFilm.join(', ') || 'aucune'}).`);
        else if (film) {
          etapeMarque = film.etapes.find((e) => e.n === k);
          marquees.add(k);
        }
      } else if (marque !== 'pm-assombrir') {
        if (a['data-cible'] === undefined) err(`${nom} : data-cible manquant (#id d'un élément de l'écran, x%,y% ou x%,y%,l%,h% de l'image).`);
        else {
          const c = lireCible(a['data-cible']);
          if (c.erreur) err(`${nom} : ${c.erreur}.`);
          else if (c.forme === 'etape' && nomFilm === null) err(`${nom} : « etape:${c.etape} » vise une étape d'un film ; sans film, viser un élément de l'écran (#id), un point (x%,y%) ou une zone (x%,y%,l%,h%) de l'image.`);
          else if (c.forme === 'etape' && film && !etapesFilm.includes(c.etape)) err(`${nom} : l'étape ${c.etape} n'est pas montrée par cet écran (étapes ${etapesFilm.join(', ') || 'aucune'}).`);
          else if (c.forme === 'id' && !ids.has(c.id)) err(`${nom} : la cible #${c.id} n'est pas un élément de l'écran.`);
          else if (c.forme === 'point' && GESTES.concat('pm-zoom').indexOf(marque) < 0) err(`${nom} : un ${marque.slice(3)} entoure une zone : écrire x%,y%,l%,h% ou #id.`);
          else if (c.forme === 'point' || c.forme === 'boite') {
            const [x, y, l = 0, h = 0] = c.valeurs;
            if (x < 0 || y < 0 || x + l > 100 || y + h > 100) signaler('pointeur-hors-ecran', `${nom} : la cible ${a['data-cible']} sort de l'image de l'écran (de 0 à 100 %).`);
          }
        }
      }
      if (marque === 'pm-zoom' && a['data-echelle'] !== undefined && !(Number(a['data-echelle']) >= 1)) err(`${nom} : data-echelle « ${a['data-echelle']} » : un nombre d'au moins 1 (1.8 : un peu moins du double).`);
      // Réécriture de la balise.
      const nouvelle = la.filter(([nm]) => !(nm === 'data-son' && a['data-son'] === 'aucun') && nm !== 'data-decor' && nm !== 'aria-hidden');
      if ((marque === 'pm-clic' || marque === 'pm-double-clic' || (etapeMarque && CLICS.includes(etapeMarque.faire))) && a['data-son'] === undefined) nouvelle.push(['data-son', 'clic']);
      if (DUREES[marque] && a['data-dur'] === undefined) nouvelle.push(['data-dur', DUREES[marque]]);
      let id = a.id;
      let second = '';
      if (marque === 'pm-double-clic' && a['data-son'] !== 'aucun') {
        if (!id) { id = `pm-double-${scene || 's'}-${rangEcran + 1}-${n}`.replace(/[^\w-]/g, '-'); nouvelle.push(['id', id]); }
        second = `<i class="pm-son-clic" data-son="${echapper(a['data-son'] || 'clic')}" data-start="#${id}+0.15" data-decor aria-hidden="true"></i>`;
      }
      nouvelle.push(['data-decor', null], ['aria-hidden', 'true']);
      const balise = `<${b.nom}${ecrireAttributs(nouvelle)}${b.auto && !VIDES.has(b.nom) ? ' /' : ''}>`;
      // Fin de l'élément (une marque est vide : sa balise fermante suit).
      let fin = b.fin;
      if (!b.auto) { const f = masqueContenu.indexOf(`</${b.nom}`, b.fin); if (f >= 0) fin = masqueContenu.indexOf('>', f) + 1; }
      const element = balise + contenu.slice(b.fin, fin);
      interieur += contenu.slice(k, b.debut);
      k = fin;
      // L'assombrissement couvre la scène autour de l'écran : il quitte le plan zoomé.
      if (marque === 'pm-assombrir') voiles.push(element);
      else interieur += element + second;
    }
    interieur += contenu.slice(k);
    if (film) interieur = remplirBlocs(interieur, film, etapesFilm, (m) => err(m));
    // Étapes de clic sans marque : leur bruitage à l'instant où le moteur les place (marques chiffrées seulement).
    if (film && duree > 0) {
      const marques = {};
      let chiffrees = true;
      for (const b of balises(masqueContenu)) {
        if (b.ferme) continue;
        const a = enObjet(lireAttributs(b.attributs));
        if (!classes(a).includes('pm-etape')) continue;
        if (/^-?\d+(\.\d+)?$/.test(String(a['data-start'] || '').trim())) marques[Number(a['data-etape'])] = Number(a['data-start']);
        else chiffrees = false;
      }
      if (chiffrees) {
        const plan = require('../../moteur/film.js').planifierFilm(film, marques, { etapes: etapesFilm, duree });
        for (const pe of plan.etapes) {
          if (marquees.has(pe.n) || !CLICS.includes(pe.faire) || !pe.geste) continue;
          interieur += `<i class="pm-son-clic" data-son="clic" data-start="${pe.action}" data-decor aria-hidden="true"></i>`;
          if (pe.geste === 'double-clic') interieur += `<i class="pm-son-clic" data-son="clic" data-start="${Math.round((pe.action + 0.15) * 1000) / 1000}" data-decor aria-hidden="true"></i>`;
        }
      }
    }

    const bords = film && film.bords ? ` --pm-ecran-bords-1: ${film.bords[0]}; --pm-ecran-bords-2: ${film.bords[1]};` : '';
    const style = `--pm-page-l: ${page[0]}; --pm-page-h: ${page[1]};${bords}${attrs.style ? ` ${attrs.style}` : ''}`;
    const gardes = liste.filter(([nm]) => !['data-adresse', 'data-titre', 'data-page', 'style', 'data-pointeur', 'data-cadre', 'data-pm-ecran', 'data-film', 'data-etapes'].includes(nm));
    gardes.push(['data-cadre', cadre], ['data-pointeur', pointeur], ['data-pm-ecran', String(rangEcran + 1)], ['style', style]);
    if (film) gardes.push(['data-film', `fichier:pm-film-${nomFilm}`], ['data-etapes', etapesFilm.join(',')]);
    else if (nomFilm !== null) gardes.push(['data-film', String(attrs['data-film'])]);
    sortie += texte.slice(depuis, z.debut)
      + `<${z.ouvrante.nom}${ecrireAttributs(gardes)}>`
      + barre(cadre, film && attrs['data-adresse'] === undefined ? { ...attrs, 'data-adresse': (film.etapes[0] && film.etapes[0].url) || '' } : attrs)
      + `<div class="pm-ecran-surface"><div class="pm-ecran-plan">${interieur}</div></div>`
      + voiles.join('')
      + `</${z.ouvrante.nom}>`;
    depuis = z.fin;
    ecrans.push({ cadre, pointeur, page, marques: n, ...(film ? { film: nomFilm, etapes: etapesFilm } : {}) });
  });
  sortie += texte.slice(depuis);
  return { html: sortie, erreurs, ecrans, films };
}

module.exports = { preparerEcrans, usagesEcran, domaine, lireCible, CADRES, POINTEURS, PAGES, MARQUES, GESTES };
