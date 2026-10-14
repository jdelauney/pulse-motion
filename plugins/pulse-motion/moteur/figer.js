/* Pulse Motion – figement d'éléments : copie d'un sous-arbre avec ses styles calculés figés en ligne.
 *
 * M.figer.styleFige(cs) -> texte              propriétés calculées (sans variables, transitions ni animations)
 * M.figer.reglesPolices() -> texte            règles @font-face de la page (polices embarquées), lues une fois
 * M.figer.figerArbre(el) -> copie             styles figés (animations comprises), pseudo-éléments ::before/::after
 *                                             recréés, valeurs SMIL figées, canvas remplacés par leur image
 * M.figer.masque(el, { cote }) -> Promise<{ largeur, hauteur, alpha, largeurPx, hauteurPx }>
 *   masque alpha de l'élément seul (sans ses transformations ni ses ancêtres), dans l'état où il est à l'appel
 *   (figement synchrone, rastérisation asynchrone) ; grand côté de « cote » px (256 par défaut), rapport d'aspect gardé.
 * M.figer.photo(el, { largeur, hauteur, zone? }) -> Promise<{ largeur, hauteur, rgba, largeurPx, hauteurPx }>
 *   image RVBA (non prémultipliée) de l'élément seul, sans ses transformations, en largeur × hauteur pixels (fragmentation
 *   des particules, P4) ; même figement que le masque. zone { x, y, largeur, hauteur } (px CSS dans la boîte) : seule
 *   cette partie de la boîte est rastérisée.
 *   o.scene { opacite } (composition, P6) : photographie d'une scène entière, sa transformation et son découpage de
 *   transition gardés, son opacité imposée (la classe pm-compose la masque dans la page).
 * M.figer.boite(el) -> { largeur, hauteur }   boîte de mise en page (px CSS), transformations neutralisées
 * Utilisé par capture.js (export rapide), par les formes exactes des collisions et par la fragmentation (calques.js).
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
    // Racine elle-même remplacée (canvas de composition, enfant direct de #pm-scene) : l'image devient la copie.
    remplacements.forEach(function (r) { if (r[0] === copie) copie = r[1]; else r[0].parentNode.replaceChild(r[1], r[0]); });
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

  /** Image RVBA (non prémultipliée) de l'élément seul, à sa boîte de mise en page, sans ses transformations, rastérisée
   *  en L × H pixels : figement synchrone (état à l'appel), rastérisation asynchrone. */
  function rasteriser(el, boite, L, H, zone, scene) {
    var largeurPx = boite.largeur;
    var hauteurPx = boite.hauteur;
    var copie = figerArbre(el);
    var place = 'position:absolute;left:0;top:0;right:auto;bottom:auto;margin:0;width:' + largeurPx + 'px;height:' + hauteurPx + 'px;';
    copie.setAttribute('style', copie.getAttribute('style') + place + (scene
      ? 'opacity:' + scene.opacite + ';'
      : 'transform:none;translate:none;rotate:none;scale:none;'));
    copie.setAttribute('xmlns', XHTML);
    var xml = new XMLSerializer().serializeToString(copie);
    var z = zone || { x: 0, y: 0, largeur: largeurPx, hauteur: hauteurPx };
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + L + '" height="' + H + '" viewBox="' + z.x + ' ' + z.y + ' ' + z.largeur + ' ' + z.hauteur + '" preserveAspectRatio="none">' +
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
      return ctx.getImageData(0, 0, L, H).data;
    });
  }

  /** Masque alpha de l'élément seul, à sa taille de mise en page, sans ses transformations. */
  function masque(el, o) {
    var cote = (o && o.cote) || 256;
    var boite = boiteMiseEnPage(el);
    if (!(boite.largeur > 0 && boite.hauteur > 0)) {
      return Promise.resolve({ largeur: 0, hauteur: 0, alpha: new Uint8ClampedArray(0), largeurPx: boite.largeur, hauteurPx: boite.hauteur });
    }
    var k = cote / Math.max(boite.largeur, boite.hauteur);
    var L = Math.max(1, Math.round(boite.largeur * k));
    var H = Math.max(1, Math.round(boite.hauteur * k));
    return rasteriser(el, boite, L, H).then(function (d) {
      var alpha = new Uint8ClampedArray(L * H);
      for (var i = 0; i < alpha.length; i++) alpha[i] = d[i * 4 + 3];
      return { largeur: L, hauteur: H, alpha: alpha, largeurPx: boite.largeur, hauteurPx: boite.hauteur };
    });
  }

  /** Photographie RVBA de l'élément seul en o.largeur × o.hauteur pixels (fragmentation des particules). */
  function photo(el, o) {
    var boite = boiteMiseEnPage(el);
    if (!(boite.largeur > 0 && boite.hauteur > 0)) {
      return Promise.resolve({ largeur: 0, hauteur: 0, rgba: new Uint8ClampedArray(0), largeurPx: boite.largeur, hauteurPx: boite.hauteur });
    }
    var L = Math.max(1, Math.round(o.largeur));
    var H = Math.max(1, Math.round(o.hauteur));
    return rasteriser(el, boite, L, H, o.zone, o.scene).then(function (d) {
      return { largeur: L, hauteur: H, rgba: new Uint8ClampedArray(d), largeurPx: boite.largeur, hauteurPx: boite.hauteur };
    });
  }

  M.figer = { styleFige: styleFige, reglesPolices: reglesPolices, figerArbre: figerArbre, masque: masque, photo: photo, boite: boiteMiseEnPage };
})(typeof globalThis !== 'undefined' ? globalThis : this);
