/* Pulse Motion – accès au GPU (WebGPU) pour les particules.
 *
 * P.obtenirGPU() -> Promise<{ device, format } | null>
 *   null : WebGPU absent, aucun adaptateur ou device refusé, ou window.__PM_SANS_GPU__ (tests).
 * Navigateur seulement (Chrome, Edge).
 */
(function (racine) {
  'use strict';
  const M = racine.M = racine.M || {};
  const P = M.particulesInterne = M.particulesInterne || {};

  P.obtenirGPU = async function () {
    if (racine.__PM_SANS_GPU__ || !racine.navigator || !navigator.gpu) return null;
    let device = null;
    try {
      const adaptateur = await navigator.gpu.requestAdapter();
      if (adaptateur) device = await adaptateur.requestDevice();
    } catch (e) { device = null; }
    if (!device) return null;
    return { device, format: navigator.gpu.getPreferredCanvasFormat() };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
