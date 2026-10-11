'use strict';
/* Pulse Motion – embarque les fichiers du projet dans la page (data:), pour une page autonome. */

const fs = require('node:fs');
const path = require('node:path');

const TYPES_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
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

/**
 * Remplace les chemins de fichiers (src, href, url()) par des URL data:.
 * -> { html, erreurs: [{ regle, gravite, message }] }
 */
function embarquerRessources(html, dossierProjet, contexte) {
  const erreurs = [];
  const cache = new Map();
  const ou = contexte ? ` (${contexte})` : '';

  function remplacer(chemin) {
    if (IGNOREES.test(chemin)) return null;
    if (DISTANTES.test(chemin)) {
      erreurs.push({ regle: 'ressource-distante', gravite: 'erreur', message: `« ${chemin} » est sur internet${ou} : copiez le fichier dans assets/ pour que la vidéo fonctionne hors ligne.` });
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
      try { resultat = versDataURI(absolu); } catch (e) {
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
  sortie = sortie.replace(RESSOURCE_CSS, (tout, guillemet, entreGuillemets, nu) => {
    const uri = remplacer(entreGuillemets || nu);
    return uri ? `url("${uri}")` : tout;
  });
  return { html: sortie, erreurs };
}

module.exports = { TYPES_MIME, cheminDansProjet, versDataURI, embarquerRessources };
