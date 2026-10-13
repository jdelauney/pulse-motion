/* Pulse Motion – repères des obstacles mesurés dans la page (collisions de particules).
 *
 * P.mesurerReperes(elements, section) -> [{ centre, angle, demi, echelle, actif }]
 *   Repère de la boîte locale de chaque élément (sans ses transformations) dans le repère de la section de l'émetteur,
 *   en cqh : composition des transformations CSS calculées (translate, rotate, scale, transform, transform-origin) de
 *   l'élément et de ses ancêtres jusqu'à sa propre section (comprise), puis inverse de celles de la section de
 *   l'émetteur. Cisaillement ignoré ; partie 2D seulement. actif : élément affiché, de taille non nulle.
 *   Boîtes de mise en page lues transformations neutralisées (none !important, le temps d'une lecture), puis styles en
 *   ligne rétablis à l'identique. Synchrone ; une mise en page forcée par appel.
 * Navigateur seulement.
 */
(function (racine) {
  'use strict';
  const M = racine.M = racine.M || {};
  const P = M.particulesInterne = M.particulesInterne || {};
  const PROPRIETES = ['transform', 'translate', 'rotate', 'scale'];

  function angleCSS(texte) {
    const m = /(-?[\d.]+(?:e[-+]?\d+)?)(deg|rad|turn|grad)?\s*$/.exec(texte);
    if (!m) return 0;
    const v = parseFloat(m[1]);
    if (m[2] === 'rad') return v * 180 / Math.PI;
    if (m[2] === 'turn') return v * 360;
    if (m[2] === 'grad') return v * 0.9;
    return v;
  }

  function longueur(texte, reference) {
    return /%$/.test(texte) ? parseFloat(texte) * reference / 100 : parseFloat(texte) || 0;
  }

  /** Transformation 2D d'un élément, ordre CSS : translate, rotate, scale, puis transform. */
  function matrice(s, l, h) {
    let m = new DOMMatrix();
    if (s.translate && s.translate !== 'none') {
      const v = s.translate.split(/\s+/);
      m = m.translate(longueur(v[0], l), v.length > 1 ? longueur(v[1], h) : 0);
    }
    if (s.rotate && s.rotate !== 'none') m = m.rotate(angleCSS(s.rotate));
    if (s.scale && s.scale !== 'none') {
      const v = s.scale.split(/\s+/).map(parseFloat);
      m = m.scale(v[0], v.length > 1 ? v[1] : v[0]);
    }
    if (s.transform && s.transform !== 'none') m = m.multiply(new DOMMatrix(s.transform));
    return m;
  }

  /** Élément, puis ses ancêtres jusqu'à sa section (comprise). */
  function chaine(el) {
    const l = [];
    for (let e = el; e; e = e.parentElement) {
      l.push(e);
      if (e.parentElement && e.parentElement.id === 'pm-scene') break;
    }
    return l;
  }

  P.mesurerReperes = function (elements, section) {
    const chaines = elements.map(chaine);
    const liste = [];
    const vus = new Set();
    const ajouter = (e) => { if (!vus.has(e)) { vus.add(e); liste.push(e); } };
    ajouter(section);
    chaines.forEach((c) => c.forEach(ajouter));
    const infos = new Map();
    liste.forEach((e) => {
      const cs = getComputedStyle(e);
      const o = cs.transformOrigin.split(/\s+/).map(parseFloat);
      infos.set(e, {
        styles: { translate: cs.translate, rotate: cs.rotate, scale: cs.scale, transform: cs.transform },
        ox: o[0] || 0, oy: o[1] || 0, affiche: cs.display !== 'none',
      });
    });
    // Boîtes de mise en page, sans aucune transformation de la chaîne.
    const sauves = liste.map((e) => PROPRIETES.map((p) => [p, e.style.getPropertyValue(p), e.style.getPropertyPriority(p)]));
    liste.forEach((e) => PROPRIETES.forEach((p) => e.style.setProperty(p, 'none', 'important')));
    liste.forEach((e) => {
      const r = e.getBoundingClientRect();
      const i = infos.get(e);
      i.x = r.left; i.y = r.top; i.l = r.width; i.h = r.height;
    });
    liste.forEach((e, k) => sauves[k].forEach(([p, v, prio]) => {
      if (v) e.style.setProperty(p, v, prio); else e.style.removeProperty(p);
    }));
    infos.forEach((i) => { i.m = matrice(i.styles, i.l, i.h); });

    // Point de la page sans transformations -> page avec les transformations de la chaîne (de l'intérieur vers l'extérieur).
    function appliquer(c, x, y) {
      let px = x;
      let py = y;
      for (const e of c) {
        const i = infos.get(e);
        const cx = i.x + i.ox;
        const cy = i.y + i.oy;
        const p = i.m.transformPoint(new DOMPoint(px - cx, py - cy));
        px = cx + p.x;
        py = cy + p.y;
      }
      return [px, py];
    }

    // Section de l'émetteur : page -> pixels locaux de la section -> cqh.
    const s = infos.get(section);
    const S0 = appliquer([section], s.x, s.y);
    const Sx = appliquer([section], s.x + 1, s.y);
    const Sy = appliquer([section], s.x, s.y + 1);
    const a = Sx[0] - S0[0], b = Sy[0] - S0[0], c = Sx[1] - S0[1], d = Sy[1] - S0[1];
    const det = a * d - b * c || 1;
    const k = 100 / Math.max(1e-6, s.h);
    const versSection = (p) => {
      const x = p[0] - S0[0];
      const y = p[1] - S0[1];
      return [(d * x - b * y) / det * k, (-c * x + a * y) / det * k];
    };

    return elements.map((el, n) => {
      const i = infos.get(el);
      const c = chaines[n];
      const p0 = versSection(appliquer(c, i.x, i.y));
      const px = versSection(appliquer(c, i.x + i.l, i.y));
      const py = versSection(appliquer(c, i.x, i.y + i.h));
      const ux = [px[0] - p0[0], px[1] - p0[1]];
      const uy = [py[0] - p0[0], py[1] - p0[1]];
      const lx = Math.hypot(ux[0], ux[1]);
      const ly = Math.hypot(uy[0], uy[1]);
      const l0 = i.l * k;
      const h0 = i.h * k;
      return {
        centre: [p0[0] + (ux[0] + uy[0]) / 2, p0[1] + (ux[1] + uy[1]) / 2],
        angle: Math.atan2(ux[1], ux[0]),
        demi: [lx / 2, ly / 2],
        echelle: [l0 > 0 ? lx / l0 : 1, h0 > 0 ? ly / h0 : 1],
        actif: i.affiche && i.l > 0 && i.h > 0,
      };
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
