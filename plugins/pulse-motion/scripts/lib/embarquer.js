'use strict';
/* Pulse Motion – embarque les fichiers du projet dans la page (data:), pour une page autonome. */

const fs = require('node:fs');
const path = require('node:path');

const TYPES_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
};

/** Chemin relatif au projet -> chemin absolu, ou null s'il sort du projet. */
function cheminDansProjet(dossierProjet, relatif) {
  const racine = path.resolve(dossierProjet);
  const absolu = path.resolve(racine, relatif);
  return absolu === racine || absolu.startsWith(racine + path.sep) ? absolu : null;
}

/** Fichier -> URL data:. Lève une erreur en français si le type n'est pas pris en charge. */
function versDataURI(fichier) {
  const mime = TYPES_MIME[path.extname(fichier).toLowerCase()];
  if (!mime) throw new Error(`type de fichier non pris en charge : ${path.basename(fichier)}`);
  return `data:${mime};base64,${fs.readFileSync(fichier).toString('base64')}`;
}

// La valeur va jusqu'au même guillemet : « l'été.png » entre guillemets doubles, « photo (1).png » dans url('…').
const RESSOURCE_ATTR = /(\s(?:src|href|xlink:href)=)(["'])((?:(?!\2).)+)\2/g;
const RESSOURCE_CSS = /url\(\s*(?:(["'])((?:(?!\1).)+)\1|([^)"'\s]+))\s*\)/g;
const IGNOREES = /^(data:|#|about:|javascript:)/i;
const DISTANTES = /^(https?:)?\/\//i;

const problemeDistant = (chemin, ou) => ({ regle: 'ressource-distante', gravite: 'erreur', message: `« ${chemin} » est sur internet${ou} : copiez le fichier dans assets/ pour que la vidéo fonctionne hors ligne.` });

/** Ressources sur internet (src, href, url()) d'un HTML, sans rien lire sur le disque (contrôle d'une scène). -> erreurs */
function ressourcesDistantes(html, contexte) {
  const ou = contexte ? ` (${contexte})` : '';
  const erreurs = [];
  // Une fois par occurrence, comme embarquerRessources.
  const voir = (chemin) => { if (!IGNOREES.test(chemin) && DISTANTES.test(chemin)) erreurs.push(problemeDistant(chemin, ou)); };
  for (const m of String(html).matchAll(RESSOURCE_ATTR)) voir(m[3]);
  for (const m of String(html).matchAll(RESSOURCE_CSS)) voir(m[2] || m[3]);
  return erreurs;
}

/**
 * Remplace les chemins de fichiers (src, href, url()) par des URL data:.
 * -> { html, erreurs: [{ regle, gravite, message }], fichiers: [chemins absolus embarqués] } (crédits, spec Rendu et export 5.20)
 */
function embarquerRessources(html, dossierProjet, contexte) {
  const erreurs = [];
  const cache = new Map();
  const fichiers = new Set();
  const ou = contexte ? ` (${contexte})` : '';

  function remplacer(chemin) {
    if (IGNOREES.test(chemin)) return null;
    if (DISTANTES.test(chemin)) {
      erreurs.push(problemeDistant(chemin, ou));
      return null;
    }
    if (cache.has(chemin)) return cache.get(chemin);
    let decode = chemin;
    try { decode = decodeURI(chemin); } catch { /* « 100%.png » : nom pris tel quel */ }
    const absolu = cheminDansProjet(dossierProjet, decode);
    let resultat = null;
    if (!absolu) {
      erreurs.push({ regle: 'chemin-hors-projet', gravite: 'erreur', message: `« ${chemin} » sort du dossier du projet${ou}.` });
    } else if (!fs.existsSync(absolu)) {
      erreurs.push({ regle: 'fichier-introuvable', gravite: 'erreur', message: `Fichier introuvable : « ${chemin} »${ou}.` });
    } else {
      try { resultat = versDataURI(absolu); fichiers.add(absolu); } catch (e) {
        erreurs.push({ regle: 'fichier-non-pris-en-charge', gravite: 'erreur', message: `« ${chemin} »${ou} : ${e.message}.` });
      }
    }
    cache.set(chemin, resultat);
    return resultat;
  }

  let sortie = html.replace(RESSOURCE_ATTR, (tout, debut, guillemet, chemin) => {
    const uri = remplacer(chemin);
    return uri ? `${debut}${guillemet}${uri}${guillemet}` : tout;
  });
  // Dans un attribut style="…" (spec S9, 5.7 : --pm-texte-image: url(assets/photo.jpg)), l'URL data: prend des guillemets
  // simples : des guillemets doubles auraient refermé l'attribut. Ailleurs, rien ne change.
  sortie = sortie.replace(/(\sstyle\s*=\s*")([^"]*)"/gi, (tout, debut, valeur) => {
    if (!/url\(/i.test(valeur)) return tout;
    return `${debut}${valeur.replace(RESSOURCE_CSS, (u, guillemet, entreGuillemets, nu) => {
      const uri = remplacer(entreGuillemets || nu);
      return uri ? `url('${uri}')` : u;
    })}"`;
  });
  sortie = sortie.replace(RESSOURCE_CSS, (tout, guillemet, entreGuillemets, nu) => {
    const uri = remplacer(entreGuillemets || nu);
    return uri ? `url("${uri}")` : tout;
  });
  return { html: sortie, erreurs, fichiers: [...fichiers] };
}

module.exports = { TYPES_MIME, cheminDansProjet, versDataURI, embarquerRessources, ressourcesDistantes };
