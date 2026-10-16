/* Pulse Motion – accès au GPU (WebGPU) pour les particules.
 *
 * P.obtenirGPU() -> Promise<{ device, adaptateur, format } | null>
 *   null : WebGPU absent, aucun adaptateur ou device refusé, ou window.__PM_SANS_GPU__ (tests).
 * P.copierImage(device, source, porteur, largeur, hauteur)   image du navigateur (canvas, ImageBitmap : sRGB, alpha droit ou
 *   prémultiplié) copiée dans porteur.texture (rgba8unorm-srgb, largeur × hauteur, usage RENDER_ATTACHMENT) en linéaire
 *   prémultiplié (rvb = linéaire(c)·a, c couleur droite), convention de toutes les textures d'images du moteur (photographies
 *   de scène et d'éléments, images de assets/, images WebGL2) ; par la texture brute porteur.brut (rgba8unorm, gardée pour
 *   les copies suivantes, recréée si sa taille change). P.oublierBrut(porteur) la libère.
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

  // Conversion d'une image du navigateur (P6, reliquats) : copyExternalImageToTexture prémultiplie dans l'espace encodé
  // (sRGB(c)·a), ce qui, lu en linéaire, assombrit les bords semi-transparents. L'image est donc copiée telle quelle (alpha
  // droit) dans une texture brute rgba8unorm, puis réécrite en linéaire prémultiplié (linéaire(c)·a) dans la texture sRGB.
  // Une image opaque garde exactement ses octets (décodage puis réencodage sRGB).
  const CONVERSION = /* wgsl */ `
@group(0) @binding(0) var brut: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}

fn versLineaire(c: vec3f) -> vec3f {
  return select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c <= vec3f(0.04045));
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let c = textureLoad(brut, vec2i(pos.xy), 0);
  return vec4f(versLineaire(c.rgb) * c.a, c.a);
}
`;

  const conversions = new WeakMap();

  P.copierImage = function (device, source, porteur, largeur, hauteur) {
    const T = GPUTextureUsage;
    let conversion = conversions.get(device);
    if (!conversion) {
      const module = device.createShaderModule({ label: 'pm-conversion', code: CONVERSION });
      conversion = device.createRenderPipeline({
        layout: 'auto', vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm-srgb' }] },
      });
      conversions.set(device, conversion);
    }
    let b = porteur.brut;
    if (!b || b.largeur !== largeur || b.hauteur !== hauteur) {
      if (b) b.texture.destroy();
      const texture = device.createTexture({ size: [largeur, hauteur], format: 'rgba8unorm', usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT });
      b = porteur.brut = { texture, largeur, hauteur };
      b.groupe = device.createBindGroup({ layout: conversion.getBindGroupLayout(0), entries: [{ binding: 0, resource: texture.createView() }] });
    }
    device.queue.copyExternalImageToTexture({ source }, { texture: b.texture, premultipliedAlpha: false }, [largeur, hauteur]);
    const enc = device.createCommandEncoder();
    const p = enc.beginRenderPass({ colorAttachments: [{ view: porteur.texture.createView(), loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
    p.setPipeline(conversion);
    p.setBindGroup(0, b.groupe);
    p.draw(3);
    p.end();
    device.queue.submit([enc.finish()]);
  };

  P.oublierBrut = function (porteur) {
    if (porteur && porteur.brut) { try { porteur.brut.texture.destroy(); } catch (e) { /* device déjà perdu */ } porteur.brut = null; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
