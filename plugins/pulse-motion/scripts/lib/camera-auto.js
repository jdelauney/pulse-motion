'use strict';
/* Pulse Motion – caméra automatique (spec S7, 5.8) : contrôle sans navigateur d'une scène.
 *
 * cameraVoulue(deroule, scene) -> 'auto' | 'fixe' | null : scenes[].camera, sinon deroule.camera.
 * controlerCameraAuto(html, { deroule, scene }) -> problèmes :
 *   camera-auto-absente (alerte) : le déroulé demande la caméra automatique, la scène n'a pas de data-camera="auto" ;
 *   cadrage-cible-introuvable (erreur) : <i data-cadrer="#id"> vise un id absent de la scène (ids proches proposés).
 * camera-auto-melangee (zoom, x ou y avec auto) vient de l'analyse de data-camera (moteur/camera.js) ; camera-auto-cadre
 * (conteneur qui ne remplit pas la scène) se mesure dans la page (moteur/camera-auto-page.js).
 */
const P = require('../../moteur/proches.js');
const { analyserCamera } = require('../../moteur/camera.js');

const masquer = (html) => String(html).replace(/<!--[\s\S]*?-->|<(style|script)\b[\s\S]*?<\/\1\s*>/gi, (t) => ' '.repeat(t.length));
const valeurs = (html, attribut) => [...masquer(html).matchAll(new RegExp(`\\s${attribut}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'g'))].map((m) => m[1] ?? m[2]);

function cameraVoulue(deroule, scene) {
  const v = scene && scene.camera !== undefined ? scene.camera : deroule && deroule.camera;
  return v === 'auto' || v === 'fixe' ? v : null;
}

/** La scène a-t-elle un conteneur data-camera="auto…" (lisible) ? */
function aCameraAuto(html) {
  return valeurs(html, 'data-camera').some((v) => { try { return !!analyserCamera(v, null).auto; } catch { return /(^|;)\s*auto\s*(;|$)/.test(v); } });
}

function controlerCameraAuto(html, { deroule, scene }) {
  const problemes = [];
  const id = scene && scene.id;
  if (cameraVoulue(deroule, scene) === 'auto' && !aCameraAuto(html)) {
    problemes.push({ regle: 'camera-auto-absente', gravite: 'alerte', scene: id,
      message: `Scène « ${id} » : le déroulé demande la caméra automatique, mais rien autour de son contenu ne la porte (data-camera="auto" sur un conteneur qui remplit la scène) ; l'ajouter, ou garder la caméra fixe pour cette scène.` });
  }
  const ids = [...masquer(html).matchAll(/\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => m[1] ?? m[2]);
  for (const v of valeurs(html, 'data-cadrer')) {
    const cible = String(v).trim();
    if (!cible) continue;
    if (!/^#[A-Za-z0-9_-]+$/.test(cible) || !ids.includes(cible.slice(1))) {
      const p = /^#/.test(cible) ? P.phrase(P.proches(cible.slice(1), ids).map((x) => `#${x}`)) : '';
      problemes.push({ regle: 'cadrage-cible-introuvable', gravite: 'erreur', scene: id,
        message: `Scène « ${id} » : le gros plan data-cadrer="${cible}" vise un élément qui n'est pas dans la scène${p ? ` ; ${p}` : ' (écrire data-cadrer="#id")'}.` });
    }
  }
  return problemes;
}

module.exports = { cameraVoulue, aCameraAuto, controlerCameraAuto };
