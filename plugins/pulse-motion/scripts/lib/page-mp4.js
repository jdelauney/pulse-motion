'use strict';
/* Pulse Motion – page qui sait faire son MP4 (spec Retouches et ergonomie, 5.18 ; revue, conflit 8).
 *
 * Facultative : seulement avec « page.boutonMp4: true » dans le déroulé (absent ou false : rien, la page livrée n'embarque ni
 * Mediabunny ni les modules d'export, vendor/mediabunny/PROVENANCE.md reste vrai). Module facultatif du moteur à la carte
 * (spec Rapidité 5.19), exclu par défaut : il ne vit pas dans un groupe de lib/groupes-moteur.js, parce qu'il n'est pas
 * inclus en clair mais compressé.
 *
 * blocExport({ deroule, dossierStyle, duree, titre, base }) (base : nom de fichier de la vidéo, slug du titre) -> HTML à poser avant </body> :
 *   - un commentaire qui reprend l'avis de licence MPL-2.0 de Mediabunny et l'adresse de sa source ;
 *   - <script type="application/octet-stream" id="pm-module-export"> : base64 du gzip d'un JSON { adresse: code } des modules
 *     de l'aperçu (Mediabunny, cadre de téléphone, estimation, capture, export) et de moteur/export-page.mjs (interface sans
 *     serveur) ;
 *   - <script type="application/json" id="pm-export-reglages"> : réglages de l'usage web, résolus comme dans l'aperçu ;
 *   - moteur/export-page-chargeur.js : bouton « MP4 » si le navigateur encode le H.264, sinon un conseil ; au clic,
 *     décompression (DecompressionStream), modules chargés par des URL blob: (marche aussi en file://).
 * poidsBloc(...) -> octets du bloc (≤ 260 Ko, test).
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const RACINE = path.resolve(__dirname, '..', '..');
/** Modules du bloc, dans l'ordre où la page les charge ; les adresses sont celles que l'aperçu sert (imports réécrits). */
const MODULES_EXPORT = [
  ['/_pm/vendor/mediabunny.min.mjs', path.join('vendor', 'mediabunny', 'mediabunny.min.mjs')],
  ['/_pm/cadres/telephone.js', path.join('moteur', 'cadres', 'telephone.js')],
  ['/_pm/estimation.js', path.join('moteur', 'estimation.js')],
  ['/_pm/capture.js', path.join('moteur', 'capture.js')],
  ['/_pm/export.mjs', path.join('moteur', 'export.mjs')],
  ['/_pm/export-page.mjs', path.join('moteur', 'export-page.mjs')],
];
const PLAFOND = 260 * 1024;

const AVIS = `<!-- Pulse Motion : page qui sait faire son MP4 (demandée par la personne).
Le bloc « pm-module-export » contient Mediabunny 1.61.3 (https://mediabunny.dev), compressé et sans modification :
Mozilla Public License 2.0 (https://mozilla.org/MPL/2.0/). Source : https://github.com/Vanilagy/mediabunny
(fichier repris : https://cdn.jsdelivr.net/npm/mediabunny@1.61.3/dist/bundles/mediabunny.min.mjs).
Les autres modules du bloc sont ceux de Pulse Motion (MIT). -->`;

// Charge utile compressée, gardée en mémoire par contenu des modules (un processus assemble souvent plusieurs fois).
let memo = null;
function chargeUtile() {
  // Modules de Pulse Motion minifiés comme le moteur (commentaires et indentation retirés) ; Mediabunny tel quel.
  const { minifier } = require('./minifier.js');
  const codes = MODULES_EXPORT.map(([adresse, f]) => {
    const code = fs.readFileSync(path.join(RACINE, f), 'utf8');
    return [adresse, f.startsWith('vendor') ? code : minifier(code)];
  });
  const cle = codes.map(([, c]) => c.length).join(',') + codes.map(([, c]) => c.slice(-64)).join('');
  if (memo && memo.cle === cle) return memo.base64;
  const donnees = zlib.gzipSync(Buffer.from(JSON.stringify(Object.fromEntries(codes)), 'utf8'), { level: 9 });
  memo = { cle, base64: donnees.toString('base64') };
  return memo.base64;
}

/** Réglages de l'usage web, comme /_pm/usage de l'aperçu (lib/routes-export.js) : même module, même déroulé. */
function reglagesWeb({ deroule, dossierStyle, duree, titre, base }) {
  const U = require('./usages.js');
  const u = U.resoudreUsage({ pour: 'web', deroule, duree });
  if (u.erreur) return null;
  const flou = Boolean(u.flou) && u.usage !== 'brouillon' && Boolean(dossierStyle) && U.flouDuStyle(dossierStyle);
  const couverture = !u.tailleMax && (u.fichiers || []).includes('couverture');
  return { ...u, flou, couverture, nomFichier: U.nomFichier(base || 'video', u.usage), titre, sortie: {} };
}

const jsonDansHTML = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

function blocExport(options) {
  const reglages = reglagesWeb(options);
  const chargeur = fs.readFileSync(path.join(RACINE, 'moteur', 'export-page-chargeur.js'), 'utf8');
  return `${AVIS}
<script type="application/octet-stream" id="pm-module-export">${chargeUtile()}</script>
<script type="application/json" id="pm-export-reglages">${jsonDansHTML(reglages)}</script>
<script>
${chargeur}
</script>`;
}

function poidsBloc(options) {
  return Buffer.byteLength(blocExport(options), 'utf8');
}

/** La page demandée sait-elle faire son MP4 ? */
function avecBoutonMp4(deroule) {
  return Boolean(deroule && deroule.page && deroule.page.boutonMp4 === true);
}

module.exports = { blocExport, poidsBloc, avecBoutonMp4, MODULES_EXPORT, PLAFOND, AVIS };
