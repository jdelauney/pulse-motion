/* Pulse Motion – accès au GPU (WebGPU) pour les particules.
 *
 * P.obtenirGPU() -> Promise<{ device, format } | null>
 *   null : WebGPU absent, aucun adaptateur, ou window.__PM_SANS_GPU__ (tests).
 * Navigateur seulement (Chrome, Edge).
 */
(function (racine) {
  'use strict';
  const M = racine.M = racine.M || {};
  const P = M.particulesInterne = M.particulesInterne || {};

  P.obtenirGPU = async function () {
    if (racine.__PM_SANS_GPU__ || !racine.navigator || !navigator.gpu) return null;
    let adaptateur = null;
    try { adaptateur = await navigator.gpu.requestAdapter(); } catch (e) { adaptateur = null; }
    if (!adaptateur) return null;
    const device = await adaptateur.requestDevice();
    return { device, format: navigator.gpu.getPreferredCanvasFormat() };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
