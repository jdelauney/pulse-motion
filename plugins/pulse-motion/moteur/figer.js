/* Pulse Motion – figement d'éléments : copie d'un sous-arbre avec ses styles calculés figés en ligne.
 *
 * M.figer.styleFige(cs) -> texte              propriétés calculées (sans variables, transitions ni animations)
 * M.figer.reglesPolices() -> texte            règles @font-face de la page (polices embarquées), lues une fois
 * M.figer.figerArbre(el) -> copie             styles figés (animations comprises), pseudo-éléments ::before/::after
 *                                             recréés, valeurs SMIL figées, canvas remplacés par leur image
 * M.figer.masque(el, { cote }) -> Promise<{ largeur, hauteur, alpha, largeurPx, hauteurPx }>
 *   masque alpha de l'élément seul (sans ses transformations ni ses ancêtres), dans l'état où il est à l'appel
 *   (figement synchrone, rastérisation asynchrone) ; grand côté de « cote » px (256 par défaut), rapport d'aspect gardé.
 * Utilisé par capture.js (export rapide) et par les formes exactes des collisions de particules (calques.js).
 * Navigateur seulement ; chargé dans la page livrée.
 */
(function (racine) {
  'use strict';
  var M = racine.M = racine.M || {};
  var XHTML = 'http://www.w3.org/1999/xhtml';
  var SMIL = /^(animate|animateTransform|animateMotion|animateColor|set)$/;
  var proprietes = null;
  var polices = null;

  function listeProprietes() {
    if (!proprietes) {
      proprietes = Array.prototype.filter.call(getComputedStyle(document.documentElement), function (p) {
        return p.indexOf('--') !== 0 && p.indexOf('transition') !== 0 && p.indexOf('animation') !== 0;
      });
    }
    return proprietes;
  }

  function styleFige(cs) {
    var texte = '';
    var liste = listeProprietes();
    for (var i = 0; i < liste.length; i++) {
      var v = cs.getPropertyValue(liste[i]);
      if (v !== '') texte += liste[i] + ':' + v + ';';
    }
    return texte + 'animation:none;transition:none;';
  }

  /** Règles @font-face de la page (polices embarquées en data:), lues une fois. */
  function reglesPolices() {
    if (polices === null) {
      polices = '';
      Array.prototype.forEach.call(document.styleSheets, function (feuille) {
        var regles;
        try { regles = feuille.cssRules; } catch (e) { return; }
        Array.prototype.forEach.call(regles || [], function (r) {
          if (r.type === CSSRule.FONT_FACE_RULE) polices += r.cssText + '\n';
        });
      });
    }
    return polices;
  }

  /** Valeur animée courante d'un attribut SVG (SVGAnimatedLength, Number, String…). */
  function valeurSmil(cible, attribut) {
    var anime = cible[attribut];
    if (!anime || typeof anime !== 'object' || !('animVal' in anime)) return null;
    var v = anime.animVal;
    if (v === null || v === undefined) return null;
    if (typeof v !== 'object') return String(v);
    if ('valueAsString' in v) return v.valueAsString;
    if ('value' in v) return String(v.value);
    return null;
  }

  /** Paires [original, copie] dans l'ordre du document (arbres identiques). */
  function paires(source, copie, liste) {
    liste.push([source, copie]);
    for (var i = 0; i < source.children.length; i++) paires(source.children[i], copie.children[i], liste);
    return liste;
  }

  function pseudo(source, nom) {
    var ps = getComputedStyle(source, nom);
    var contenu = ps.getPropertyValue('content');
    if (!contenu || contenu === 'none' || contenu === 'normal') return null;
    var span = document.createElementNS(XHTML, 'span');
    span.setAttribute('style', styleFige(ps));
    span.textContent = contenu.replace(/^["']|["']$/g, '');
    return span;
  }

  /** Copie d'un élément affiché, styles et valeurs animées figés. */
  function figerArbre(racineSource) {
    var copie = racineSource.cloneNode(true);
    var liste = paires(racineSource, copie, []);
    var correspondance = new Map(liste);
    var aRetirer = [];
    var ajouts = [];
    var remplacements = [];
    liste.forEach(function (p) {
      var s = p[0], c = p[1];
      var nom = s.localName;
      if (nom === 'script') { aRetirer.push(c); return; }
      // Canvas (calques de particules) : remplacé par son image, au même endroit et avec le même style.
      if (nom === 'canvas') {
        var img = document.createElementNS(XHTML, 'img');
        img.setAttribute('style', styleFige(getComputedStyle(s)));
        var src = s.__pmImage;
        if (!src) { try { src = s.toDataURL(); } catch (e) { src = ''; } }
        if (src) img.setAttribute('src', src);
        remplacements.push([c, img]);
        return;
      }
      if (SMIL.test(nom)) {
        var attribut = s.getAttribute('attributeName');
        var cible = s.targetElement || s.parentElement;
        var valeur = attribut && cible ? valeurSmil(cible, attribut) : null;
        if (valeur !== null && correspondance.get(cible)) correspondance.get(cible).setAttribute(attribut, valeur);
        aRetirer.push(c);
        return;
      }
      c.setAttribute('style', styleFige(getComputedStyle(s)));
      ajouts.push([c, pseudo(s, '::before'), pseudo(s, '::after')]);
    });
    ajouts.forEach(function (a) {
      if (a[1]) a[0].insertBefore(a[1], a[0].firstChild);
      if (a[2]) a[0].appendChild(a[2]);
    });
    remplacements.forEach(function (r) { r[0].parentNode.replaceChild(r[1], r[0]); });
    aRetirer.forEach(function (c) { c.remove(); });
    return copie;
  }

  var TRANSFORMATIONS = ['transform', 'translate', 'rotate', 'scale'];

  /** Boîte de mise en page (px CSS, non arrondie) : getBoundingClientRect, transformations de l'élément et de ses ancêtres
   *  neutralisées le temps de la lecture (styles en ligne rétablis). Vaut aussi pour un élément en ligne (cs.width = auto,
   *  offsetWidth arrondi et limité à la première ligne) : même boîte que celle du repère de l'obstacle. */
  function boiteMiseEnPage(el) {
    var chaine = [];
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) chaine.push(n);
    var sauves = chaine.map(function (e) {
      return TRANSFORMATIONS.map(function (p) { return [p, e.style.getPropertyValue(p), e.style.getPropertyPriority(p)]; });
    });
    chaine.forEach(function (e) { TRANSFORMATIONS.forEach(function (p) { e.style.setProperty(p, 'none', 'important'); }); });
    var r = el.getBoundingClientRect();
    chaine.forEach(function (e, k) {
      sauves[k].forEach(function (s) { if (s[1]) e.style.setProperty(s[0], s[1], s[2]); else e.style.removeProperty(s[0]); });
    });
    return { largeur: r.width, hauteur: r.height };
  }

  /** Masque alpha de l'élément seul, à sa taille de mise en page, sans ses transformations. */
  function masque(el, o) {
    var cote = (o && o.cote) || 256;
    var boite = boiteMiseEnPage(el);
    var largeurPx = boite.largeur;
    var hauteurPx = boite.hauteur;
    if (!(largeurPx > 0 && hauteurPx > 0)) {
      return Promise.resolve({ largeur: 0, hauteur: 0, alpha: new Uint8ClampedArray(0), largeurPx: largeurPx, hauteurPx: hauteurPx });
    }
    var k = cote / Math.max(largeurPx, hauteurPx);
    var L = Math.max(1, Math.round(largeurPx * k));
    var H = Math.max(1, Math.round(hauteurPx * k));
    var copie = figerArbre(el);
    copie.setAttribute('style', copie.getAttribute('style') + 'position:absolute;left:0;top:0;right:auto;bottom:auto;margin:0;' +
      'transform:none;translate:none;rotate:none;scale:none;width:' + largeurPx + 'px;height:' + hauteurPx + 'px;');
    copie.setAttribute('xmlns', XHTML);
    var xml = new XMLSerializer().serializeToString(copie);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + L + '" height="' + H + '" viewBox="0 0 ' + largeurPx + ' ' + hauteurPx + '">' +
      '<foreignObject x="0" y="0" width="' + largeurPx + '" height="' + hauteurPx + '">' +
      '<style xmlns="' + XHTML + '">' + reglesPolices() + '</style>' + xml + '</foreignObject></svg>';
    var img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return img.decode().then(function () {
      var c = document.createElement('canvas');
      c.width = L;
      c.height = H;
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, L, H);
      var d = ctx.getImageData(0, 0, L, H).data;
      var alpha = new Uint8ClampedArray(L * H);
      for (var i = 0; i < alpha.length; i++) alpha[i] = d[i * 4 + 3];
      return { largeur: L, hauteur: H, alpha: alpha, largeurPx: largeurPx, hauteurPx: hauteurPx };
    });
  }

  M.figer = { styleFige: styleFige, reglesPolices: reglesPolices, figerArbre: figerArbre, masque: masque };
})(typeof globalThis !== 'undefined' ? globalThis : this);
