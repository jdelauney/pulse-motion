'use strict';
/* Pulse Motion – écrans dans une scène (spec S6, 5.8 à 5.12) : préparation à l'assemblage et contrôle sans navigateur.
 *
 *   <div class="pm-ecran" data-cadre="navigateur" data-adresse="https://app.exemple.fr/factures?client=12">
 *     <img src="assets/factures.png" alt="Liste des factures">
 *     <i class="pm-clic" data-cible="12%,8%" data-start="mot:nouvelle"></i>
 *     <i class="pm-projecteur" data-cible="40%,30%,20%,8%" data-start="3"></i>
 *   </div>
 *
 * preparerEcrans(html, { scene }) -> { html, erreurs, ecrans }
 *   Chaque écran reçoit son cadre (barre du navigateur ou de la fenêtre), une surface et un plan (que zooment les marques
 *   pm-zoom) : <div class="pm-ecran-surface"><div class="pm-ecran-plan">…contenu et marques…</div></div>. L'adresse est
 *   réduite au nom de domaine à l'assemblage : l'adresse complète n'entre jamais dans la page. data-page (« 1280x800 »)
 *   devient --pm-page-l et --pm-page-h ; sans data-page, la taille de tournage par défaut du cadre. Les marques reçoivent
 *   data-decor et aria-hidden ; un clic reçoit le bruitage « clic » (data-son="aucun" : aucun) ; un double-clic, un second
 *   bruitage 0,15 s plus tard ; projecteur, anneau et assombrissement durent 3 s, un zoom 2,4 s, sans data-dur.
 *   Règles : ecran-invalide (erreur : cadre, pointeur, cible ou marque mal écrits, marque hors d'un écran, film absent),
 *   pointeur-hors-ecran (alerte : une cible x%,y% hors de l'image), suivre-desactive (alerte : data-camera sur un écran
 *   qui suit les gestes).
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
const MARQUES = [...GESTES, ...MISES];
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
  if (/^etape:\d+$/.test(t)) return { erreur: `« ${t} » vise une étape d'un film filmé ; sans film, viser un élément de l'écran (#id), un point (x%,y%) ou une zone (x%,y%,l%,h%) de l'image` };
  return { erreur: `cible « ${t} » illisible (#id d'un élément de l'écran, x%,y% ou x%,y%,l%,h% de l'image)` };
}

function usagesEcran(html) {
  const t = String(html);
  const moteur = /class\s*=\s*["'][^"']*\bpm-(?:ecran|clic|survol|double-clic|projecteur|anneau|assombrir|zoom)\b/.test(t);
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

function preparerEcrans(html, { scene = '' } = {}) {
  const texte = String(html);
  const erreurs = [];
  const ecrans = [];
  if (!usagesEcran(texte).moteur) return { html: texte, erreurs, ecrans };
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
    const cadre = attrs['data-cadre'] === undefined ? 'navigateur' : attrs['data-cadre'];
    if (!CADRES.includes(cadre)) err(`cadre « ${cadre} » inconnu (${CADRES.join(', ')}).`);
    const parDefaut = cadre === 'telephone' || cadre === 'tablette' ? 'doigt' : 'fleche';
    const pointeur = attrs['data-pointeur'] === undefined ? parDefaut : attrs['data-pointeur'];
    if (!POINTEURS.includes(pointeur)) err(`pointeur « ${pointeur} » inconnu (${POINTEURS.join(', ')}).`);
    if (attrs['data-film'] !== undefined) err('data-film : un film se tourne avec le tournage, qui n\'est pas encore disponible ; montrer une capture (<img src="assets/…">) dans l\'écran.');
    let page = PAGES[CADRES.includes(cadre) ? cadre : 'navigateur'];
    if (attrs['data-page'] !== undefined) {
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
      if (a['data-start'] === undefined) err(`${nom} : data-start manquant (l'instant ${GESTES.includes(marque) ? 'du geste' : 'où la mise en valeur commence'}).`);
      if (marque !== 'pm-assombrir') {
        if (a['data-cible'] === undefined) err(`${nom} : data-cible manquant (#id d'un élément de l'écran, x%,y% ou x%,y%,l%,h% de l'image).`);
        else {
          const c = lireCible(a['data-cible']);
          if (c.erreur) err(`${nom} : ${c.erreur}.`);
          else if (c.forme === 'id' && !ids.has(c.id)) err(`${nom} : la cible #${c.id} n'est pas un élément de l'écran.`);
          else if (c.forme === 'point' && GESTES.concat('pm-zoom').indexOf(marque) < 0) err(`${nom} : un ${marque.slice(3)} entoure une zone : écrire x%,y%,l%,h% ou #id.`);
          else if (c.forme !== 'id') {
            const [x, y, l = 0, h = 0] = c.valeurs;
            if (x < 0 || y < 0 || x + l > 100 || y + h > 100) signaler('pointeur-hors-ecran', `${nom} : la cible ${a['data-cible']} sort de l'image de l'écran (de 0 à 100 %).`);
          }
        }
      }
      if (marque === 'pm-zoom' && a['data-echelle'] !== undefined && !(Number(a['data-echelle']) >= 1)) err(`${nom} : data-echelle « ${a['data-echelle']} » : un nombre d'au moins 1 (1.8 : un peu moins du double).`);
      // Réécriture de la balise.
      const nouvelle = la.filter(([nm]) => !(nm === 'data-son' && a['data-son'] === 'aucun') && nm !== 'data-decor' && nm !== 'aria-hidden');
      if ((marque === 'pm-clic' || marque === 'pm-double-clic') && a['data-son'] === undefined) nouvelle.push(['data-son', 'clic']);
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

    const style = `--pm-page-l: ${page[0]}; --pm-page-h: ${page[1]};${attrs.style ? ` ${attrs.style}` : ''}`;
    const gardes = liste.filter(([nm]) => !['data-adresse', 'data-titre', 'data-page', 'style', 'data-pointeur', 'data-cadre', 'data-pm-ecran'].includes(nm));
    gardes.push(['data-cadre', cadre], ['data-pointeur', pointeur], ['data-pm-ecran', String(rangEcran + 1)], ['style', style]);
    sortie += texte.slice(depuis, z.debut)
      + `<${z.ouvrante.nom}${ecrireAttributs(gardes)}>`
      + barre(cadre, attrs)
      + `<div class="pm-ecran-surface"><div class="pm-ecran-plan">${interieur}</div></div>`
      + voiles.join('')
      + `</${z.ouvrante.nom}>`;
    depuis = z.fin;
    ecrans.push({ cadre, pointeur, page, marques: n });
  });
  sortie += texte.slice(depuis);
  return { html: sortie, erreurs, ecrans };
}

module.exports = { preparerEcrans, usagesEcran, domaine, lireCible, CADRES, POINTEURS, PAGES, MARQUES, GESTES };
