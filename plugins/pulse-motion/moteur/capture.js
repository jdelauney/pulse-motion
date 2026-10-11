/* Pulse Motion – capture de l'image courante dans un canvas (export rapide).
 *
 * M.capturer(ctx, largeur, hauteur) dessine #pm-scene, tel qu'il est rendu à l'instant
 * courant, dans le contexte 2D donné. Voie SVG foreignObject : copie des scènes visibles,
 * styles calculés figés en ligne (animations comprises), pseudo-éléments ::before/::after
 * recréés, valeurs SMIL figées, polices @font-face embarquées dans l'image.
 * Calques de particules : M.particules.preparerCapture() pose l'image de chaque calque sur son canvas, remplacé ici par un <img>.
 * Limites (export rapide) : filter: url(), mix-blend-mode, backdrop-filter mal rendus.
 * Navigateur seulement ; servi par l'aperçu, absent de la page livrée.
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

  /** Copie une section affichée, styles et valeurs animées figés. */
  function figerSection(section) {
    var copie = section.cloneNode(true);
    var liste = paires(section, copie, []);
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

  /** Copie de #pm-scene réduite aux scènes affichées. */
  function copierScene() {
    var scene = document.getElementById('pm-scene');
    var copie = scene.cloneNode(false);
    copie.setAttribute('style', styleFige(getComputedStyle(scene)) + 'margin:0;left:0;top:0;');
    Array.prototype.forEach.call(scene.children, function (sec) {
      if (getComputedStyle(sec).display !== 'none') copie.appendChild(figerSection(sec));
    });
    return copie;
  }

  /** Dessine l'image courante de #pm-scene dans ctx. -> Promise */
  M.capturer = function (ctx, largeur, hauteur) {
    var avant = M.particules && M.particules.preparerCapture ? M.particules.preparerCapture() : Promise.resolve();
    return avant.then(function () { return dessiner(ctx, largeur, hauteur); });
  };

  function dessiner(ctx, largeur, hauteur) {
    var copie = copierScene();
    copie.setAttribute('xmlns', XHTML);
    var xml = new XMLSerializer().serializeToString(copie);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + largeur + '" height="' + hauteur + '">' +
      '<foreignObject x="0" y="0" width="' + largeur + '" height="' + hauteur + '">' +
      '<style xmlns="' + XHTML + '">' + reglesPolices() + '</style>' + xml +
      '</foreignObject></svg>';
    var img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return img.decode().then(function () {
      ctx.clearRect(0, 0, largeur, hauteur);
      ctx.drawImage(img, 0, 0, largeur, hauteur);
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
