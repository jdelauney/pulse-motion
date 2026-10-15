/* Pulse Motion – accès au GPU (WebGPU) pour les particules.
 *
 * P.obtenirGPU() -> Promise<{ device, adaptateur, format } | null>
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
    let adaptateur = null;
    try {
      adaptateur = await navigator.gpu.requestAdapter();
      if (adaptateur) {
        // Groupes de travail jusqu'à 1024 fils si l'adaptateur le permet (noyau des cordes et tissus, P5b).
        const l = adaptateur.limits || {};
        const fils = Math.min(1024, l.maxComputeInvocationsPerWorkgroup || 256, l.maxComputeWorkgroupSizeX || 256);
        const requiredLimits = fils > 256 ? { maxComputeInvocationsPerWorkgroup: fils, maxComputeWorkgroupSizeX: fils } : undefined;
        device = await adaptateur.requestDevice(requiredLimits ? { requiredLimits } : undefined);
      }
    } catch (e) { device = null; }
    if (!device) return null;
    return { device, adaptateur, format: navigator.gpu.getPreferredCanvasFormat() };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
