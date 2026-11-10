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

const HEX = /^#[0-9a-f]{6}$/i;
const ecartTeinte = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/**
 * Couleur lisible proposée à la place de hex sur fond (spec S2, 5.9 ; idée de suggestColor d'explainroo, MIT,
 * © 2026 Vincent Schmalbach, adaptée à OKLCH). D'abord la couleur de la charte la plus proche en teinte qui passe le
 * minimum sur ce fond ; sinon la même teinte, luminosité ajustée (ajusterContraste), vérifiée sur la valeur arrondie ;
 * sinon noir ou blanc. -> { hex, depuis: 'charte' | 'teinte', nom?, plus?: 'plus sombre' | 'plus claire' }
 * charte : { nom: '#rrggbb' } ; jamais appliquée seule (la charte est celle de la personne).
 */
function suggererCouleur(hex, fond, minimum, charte = {}) {
  const depart = versOklch(hex);
  const candidates = Object.entries(charte || {})
    .filter(([, c]) => typeof c === 'string' && HEX.test(c) && c.toLowerCase() !== String(fond).toLowerCase() && c.toLowerCase() !== String(hex).toLowerCase())
    .filter(([, c]) => contraste(c, fond) >= minimum)
    .map(([nom, c]) => { const o = versOklch(c); return { nom, hex: c.toLowerCase(), teinte: o.C < 0.02 || depart.C < 0.02 ? 180 : ecartTeinte(o.h, depart.h), L: Math.abs(o.L - depart.L) }; })
    .sort((a, b) => a.teinte - b.teinte || a.L - b.L || (a.nom < b.nom ? -1 : 1));
  if (candidates.length) return { hex: candidates[0].hex, depuis: 'charte', nom: candidates[0].nom };
  const ajuste = ajusterContraste(hex, fond, minimum);
  const choisie = ajuste.ok && contraste(ajuste.hex, fond) >= minimum ? ajuste.hex : meilleurSur(fond);
  return { hex: choisie, depuis: 'teinte', plus: luminance(choisie) < luminance(hex) ? 'plus sombre' : 'plus claire' };
}

/** Fin de message : la couleur proposée, en mots. */
function phraseProposition(s) {
  return `couleur lisible proposée : ${s.hex} (${s.depuis === 'charte' ? `la couleur « ${s.nom} » de la charte` : `la même teinte, ${s.plus}`})`;
}

/** « rgb(…) » ou { r, g, b } -> #rrggbb */
function versHex(c) {
  return `#${[c.r, c.g, c.b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** [r, v, b] sRGB (0–255) -> [L, a, b] CIELAB (D65). */
function rvbVersLab([r, v, b]) {
  const lin = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [lin(r), lin(v), lin(b)];
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/** Écart de couleur CIEDE2000 entre deux couleurs sRGB [r, v, b] (0–255) : sous 1, invisible ; sous 2, à peine (spec Rendu et
 *  export, 5.2 : mire des couleurs). Formule de Sharma, Wu et Dalal (2005). */
function deltaE00(c1, c2) {
  return deltaE00Lab(rvbVersLab(c1), rvbVersLab(c2));
}

/** CIEDE2000 entre deux couleurs CIELAB [L, a, b]. */
function deltaE00Lab([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h = (b, a) => { if (a === 0 && b === 0) return 0; const x = Math.atan2(b, a) / rad; return x < 0 ? x + 360 : x; };
  const h1p = h(b1, a1p);
  const h2p = h(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lm = (L1 + L2) / 2;
  const Cmp = (C1p + C2p) / 2;
  let hm = h1p + h2p;
  if (C1p * C2p !== 0) { if (Math.abs(h1p - h2p) > 180) hm += h1p + h2p < 360 ? 360 : -360; hm /= 2; }
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const Sc = 1 + 0.045 * Cmp;
  const Sh = 1 + 0.015 * Cmp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

module.exports = { luminance, contraste, hexVersOklab, oklabVersHex, versOklch, depuisOklch, ajusterContraste, meilleurSur, suggererCouleur, phraseProposition, versHex, rvbVersLab, deltaE00, deltaE00Lab };
