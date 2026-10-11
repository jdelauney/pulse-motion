'use strict';
/* Pulse Motion – calculs de couleur (contraste WCAG). */

/** Luminance relative WCAG d'une couleur #rrggbb. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG entre deux couleurs #rrggbb (1 à 21). */
function contraste(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const versRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lineaire = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** #rrggbb -> [L, a, b] (OKLab). */
function hexVersOklab(hex) {
  const [r, g, b] = versRgb(hex).map(lineaire);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/** [L, a, b] (OKLab) -> #rrggbb (hors gamut : ramené dans sRGB). */
function oklabVersHex([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  return `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, gamma(c))) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function versOklch(hex) {
  const [L, a, b] = hexVersOklab(hex);
  return { L, C: Math.hypot(a, b), h: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 };
}

function depuisOklch({ L, C, h }) {
  const r = h * Math.PI / 180;
  return oklabVersHex([L, C * Math.cos(r), C * Math.sin(r)]);
}

/** Ajuste la luminosité (OKLCH) jusqu'au contraste demandé, teinte et chroma gardées. -> { hex, ecart, ok } */
function ajusterContraste(hex, fond, minimum) {
  if (contraste(hex, fond) >= minimum) return { hex, ecart: 0, ok: true };
  const depart = versOklch(hex);
  const sens = luminance(fond) > 0.18 ? -1 : 1;
  for (let pas = 1; pas <= 100; pas++) {
    const L = depart.L + sens * pas * 0.01;
    if (L < 0 || L > 1) break;
    const essai = depuisOklch({ ...depart, L });
    if (contraste(essai, fond) >= minimum) return { hex: essai, ecart: L - depart.L, ok: true };
  }
  return { hex, ecart: 0, ok: false };
}

/** Couleur du texte posé sur un fond : noir ou blanc, le plus contrasté. */
function meilleurSur(fond) {
  return contraste('#000000', fond) >= contraste('#ffffff', fond) ? '#000000' : '#ffffff';
}

module.exports = { luminance, contraste, hexVersOklab, oklabVersHex, versOklch, depuisOklch, ajusterContraste, meilleurSur };
