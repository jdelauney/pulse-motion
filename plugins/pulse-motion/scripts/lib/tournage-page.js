'use strict';
/* Pulse Motion – script posé dans la page filmée (spec S6, 5.2 et 5.4), dans un monde isolé (worldName « pulse-motion » :
 * le site ne peut ni le lire ni le modifier ; il partage le DOM, pas les variables). Posé à chaque document par
 * Page.addScriptToEvaluateOnNewDocument. Il expose globalThis.__pm :
 *
 *   etat() -> { mutation (ms depuis le dernier changement du DOM), animations (finies en cours), polices, images, document }
 *   trouver(cible) -> { ok: true, id, libelle, boite, dansVue, sorte, motDePasse, natif } (boîte en px CSS de la vue)
 *                   | { ok: false, raison: 'introuvable' | 'ambigu', candidats: [{ libelle, position }], proches: [textes] }
 *   boite(id) · dansVue(id) · amener(id) (au centre, en défilement doux, filmé) · coche(id) -> booléen
 *   choisir(id, option) -> { ok, libelles, choisie } (liste déroulante native : valeur posée, input et change émis)
 *   proches(texte) -> les textes actionnables visibles les plus proches (message d'échec)
 *   texteVisible(texte) -> le texte est-il affiché ?
 *   pointA(x, y) -> id de l'élément à ce point de la vue (cible { point })
 * Les liens et formulaires target=_blank s'ouvrent dans le même onglet.
 * Règles de la recherche (5.2) : candidats visibles et actionnables, et tout élément dont le texte propre correspond ; textes
 * comparés sans accents ni casse, espaces réduits (texte visible, aria-label, aria-labelledby, placeholder, <label>, title,
 * alt, value d'un bouton) ; ordre : égalité, début, contenu ; un actionnable avant un texte ; dans la vue avant hors de la
 * vue. Écrit pour Pulse Motion.
 */

function scriptPage() {
  if (globalThis.__pm) return;
  var derniere = performance.now();
  var sale = true;
  var suivi = new MutationObserver(function () { derniere = performance.now(); sale = true; });
  suivi.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  // Un défilement (même doux, sans changement du DOM) compte comme un changement : la page n'est pas calme.
  addEventListener('scroll', function () { derniere = performance.now(); }, { capture: true, passive: true });

  // Même onglet : un lien ou un formulaire qui ouvrirait un nouvel onglet reste dans celui-ci.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[target], area[target]') : null;
    if (a && a.target && a.target !== '_self') a.removeAttribute('target');
  }, true);
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f && f.target && f.target !== '_self') f.removeAttribute('target');
  }, true);

  var ACTIONNABLES = 'a[href], button, input:not([type=hidden]), select, textarea, summary, label, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=radio], [role=option], [role=switch], [onclick], [tabindex]';
  var FENETRES = 'dialog[open], [role=dialog], [role=alertdialog]';
  var elements = new Map();
  var suivant = 1;

  function norme(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim(); }
  function idDe(el) {
    for (var entree of elements) if (entree[1] === el) return entree[0];
    var id = 'e' + (suivant++);
    elements.set(id, el);
    return id;
  }
  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    if (el.closest('[inert], [aria-hidden="true"]') && !el.closest(FENETRES)) return false;
    return true;
  }
  function dansVue(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  }
  function boite(el) {
    var r = el.getBoundingClientRect();
    return [Math.round(r.left * 100) / 100, Math.round(r.top * 100) / 100, Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100];
  }
  function textesDe(el) {
    var t = [];
    var visibleTexte = (el.innerText || el.textContent || '').trim();
    if (visibleTexte) t.push(visibleTexte);
    ['aria-label', 'placeholder', 'title', 'alt'].forEach(function (a) { var v = el.getAttribute(a); if (v) t.push(v); });
    var lb = el.getAttribute('aria-labelledby');
    if (lb) lb.split(/\s+/).forEach(function (id) { var x = document.getElementById(id); if (x) t.push(x.textContent || ''); });
    if (el.labels) Array.prototype.forEach.call(el.labels, function (l) { t.push(l.innerText || l.textContent || ''); });
    if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) && el.value) t.push(el.value);
    return t.map(norme).filter(Boolean);
  }
  function niveau(textes, voulu) {
    var n = 0;
    textes.forEach(function (t) {
      if (t === voulu) n = Math.max(n, 3);
      else if (t.indexOf(voulu) === 0) n = Math.max(n, 2);
      else if (t.indexOf(voulu) >= 0) n = Math.max(n, 1);
    });
    return n;
  }
  function libelle(el) {
    var t = (el.innerText || '').trim() || el.getAttribute('aria-label') || el.getAttribute('placeholder') || (el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('title') || el.value || el.tagName.toLowerCase();
    return String(t).replace(/\s+/g, ' ').trim().slice(0, 80);
  }
  function position(el) {
    var r = el.getBoundingClientRect();
    var cx = (r.left + r.width / 2) / innerWidth, cy = (r.top + r.height / 2) / innerHeight;
    var v = cy < 0 ? 'plus haut dans la page' : cy > 1 ? 'plus bas dans la page' : cy < 0.34 ? 'en haut' : cy > 0.66 ? 'en bas' : 'au milieu';
    var h = cx < 0.34 ? 'à gauche' : cx > 0.66 ? 'à droite' : 'au centre';
    return v + ' ' + h + (el.closest(FENETRES) ? ', dans la fenêtre' : '');
  }
  function conteneurs(dans) {
    var d = norme(dans);
    if (/^(la |une )?(fenetre|boite de dialogue|dialogue|popup|pop-up|modale)$/.test(d)) return Array.prototype.filter.call(document.querySelectorAll(FENETRES), visible);
    var liste = [];
    document.querySelectorAll('dialog, [role=dialog], [role=alertdialog], section, form, fieldset, aside, nav, header, footer, main, article, [role=region], [aria-label], [aria-labelledby], table').forEach(function (c) {
      if (!visible(c)) return;
      var titres = [];
      ['aria-label', 'title'].forEach(function (a) { var v = c.getAttribute(a); if (v) titres.push(v); });
      var lb = c.getAttribute('aria-labelledby');
      if (lb) lb.split(/\s+/).forEach(function (id) { var x = document.getElementById(id); if (x) titres.push(x.textContent || ''); });
      var h = c.querySelector('h1, h2, h3, h4, legend, caption');
      if (h) titres.push(h.textContent || '');
      if (titres.some(function (t) { return norme(t).indexOf(d) >= 0; })) liste.push(c);
    });
    return liste;
  }
  function candidats(voulu, dans) {
    var zones = dans ? conteneurs(dans) : null;
    if (zones && !zones.length) return [];
    var dedans = function (el) { return !zones || zones.some(function (z) { return z.contains(el); }); };
    var vus = new Set();
    var liste = [];
    document.querySelectorAll(ACTIONNABLES).forEach(function (el) {
      if (!visible(el) || !dedans(el)) return;
      var n = niveau(textesDe(el), voulu);
      if (n) { liste.push({ el: el, niveau: n, actionnable: 1 }); vus.add(el); }
    });
    // Textes propres : l'élément le plus profond dont le texte correspond.
    var marcheur = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = marcheur.nextNode())) {
      if (norme(n.nodeValue).indexOf(voulu) < 0) continue;
      var el = n.parentElement;
      if (!el || vus.has(el) || !visible(el) || !dedans(el)) continue;
      if (el.closest(ACTIONNABLES) && vus.has(el.closest(ACTIONNABLES))) continue;
      var niv = niveau([norme(el.innerText || el.textContent)], voulu);
      if (niv) { liste.push({ el: el, niveau: niv, actionnable: 0 }); vus.add(el); }
    }
    // Un <label> et son champ : le champ seul.
    liste = liste.filter(function (c) { return !(c.el.tagName === 'LABEL' && c.el.control && vus.has(c.el.control) && c.el.control.type !== 'checkbox' && c.el.control.type !== 'radio'); });
    liste.forEach(function (c) { c.vue = dansVue(c.el) ? 1 : 0; });
    // Un candidat contenu dans un autre de même rang : l'extérieur seul.
    liste = liste.filter(function (c) {
      return !liste.some(function (d) { return d !== c && d.el.contains(c.el) && d.niveau === c.niveau && d.actionnable >= c.actionnable && d.vue === c.vue; });
    });
    liste.sort(function (a, b) {
      return (b.niveau - a.niveau) || (b.actionnable - a.actionnable) || (b.vue - a.vue)
        || (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    });
    return liste;
  }
  function decrire(el) {
    var natif = el.tagName === 'SELECT' ? { options: Array.prototype.map.call(el.options, function (o) { return o.label || o.text; }), choisie: el.selectedIndex } : null;
    var cible = el.tagName === 'LABEL' && el.control ? el.control : el;
    var ac = (cible.getAttribute('autocomplete') || '').toLowerCase();
    var r = el.getBoundingClientRect();
    var entier = r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
    return { ok: true, id: idDe(el), libelle: libelle(el), boite: boite(el), dansVue: dansVue(el), entier: entier, sorte: el.tagName.toLowerCase(), type: (cible.type || '').toLowerCase(),
      motDePasse: cible.type === 'password' || /(^|\s)(current|new)-password(\s|$)/.test(ac), natif: natif };
  }
  function proches(texte) {
    var voulu = norme(texte);
    var bi = function (t) { var s = new Set(); for (var i = 0; i < t.length - 1; i++) s.add(t.slice(i, i + 2)); return s; };
    var b = bi(voulu);
    var vus = new Set();
    var liste = [];
    document.querySelectorAll(ACTIONNABLES).forEach(function (el) {
      if (!visible(el) || !dansVue(el)) return;
      var l = libelle(el);
      var k = norme(l);
      if (!k || vus.has(k) || k.length > 60) return;
      vus.add(k);
      var c = bi(k);
      var commun = 0;
      c.forEach(function (x) { if (b.has(x)) commun++; });
      liste.push({ texte: l, score: (2 * commun) / Math.max(1, b.size + c.size) });
    });
    liste.sort(function (x, y) { return y.score - x.score; });
    return liste.slice(0, 5).map(function (x) { return x.texte; });
  }

  // --- Flou des données personnelles (spec S6, 5.6), dans la page filmée : Chrome le dessine, il est donc dans les pixels
  // des images figées. Un hôte à racine fantôme fermée (le site ne voit pas dedans), sans pointeur ; des voiles en
  // backdrop-filter recalés avant chaque peinture sur les plages et les champs à couvrir.
  var FL = globalThis.__pmFlou;
  var reglage = FL ? FL.lireFlou((globalThis.__pmConfig || {}).flou) : null;
  var hote = null, ombre = null, sentinelle = null, voiles = [], plages = [];
  var IGNORES = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, TEXTAREA: 1 };

  function monter() {
    if (!reglage || !document.documentElement) return false;
    if (hote && hote.isConnected) return true;
    if (!hote) {
      hote = document.createElement('pm-voiles');
      ['all:initial', 'position:absolute', 'left:0', 'top:0', 'width:0', 'height:0', 'overflow:visible', 'z-index:2147483647', 'pointer-events:none', 'display:block'].forEach(function (d) {
        var k = d.split(':');
        hote.style.setProperty(k[0], k[1], 'important');
      });
      ombre = hote.attachShadow({ mode: 'closed' });
      var st = document.createElement('style');
      st.textContent = '.v{position:absolute;box-sizing:border-box;border-radius:.3em;-webkit-backdrop-filter:blur(max(10px,.6em));backdrop-filter:blur(max(10px,.6em));background:rgb(128 128 128 / .15);pointer-events:none}'
        + '.v.m{-webkit-backdrop-filter:none;backdrop-filter:none;background:#9aa0a6;border-radius:.4em}'
        + '.s{position:absolute;left:0;top:0;height:1px;visibility:hidden}';
      ombre.appendChild(st);
      sentinelle = document.createElement('div');
      sentinelle.className = 's';
      sentinelle.style.width = '1px';
      ombre.appendChild(sentinelle);
      // Après les rappels d'animation du site et la mise en page, avant la peinture : le voile suit l'image même.
      new ResizeObserver(function () { if (sale) relever(); poser(); }).observe(sentinelle);
    }
    document.documentElement.appendChild(hote);
    return true;
  }
  function tailleDe(el) { try { return getComputedStyle(el).fontSize; } catch (e) { return '16px'; } }
  function elementsCible(c) {
    if (c && c.colonne !== undefined) {
      var voulu = norme(c.colonne), r = [];
      document.querySelectorAll('th, [role=columnheader]').forEach(function (th) {
        if (norme(th.innerText || th.textContent).indexOf(voulu) < 0 || !th.parentElement) return;
        var k = Array.prototype.indexOf.call(th.parentElement.children, th);
        var table = th.closest('table, [role=table], [role=grid]');
        if (!table || k < 0) return;
        table.querySelectorAll('tr, [role=row]').forEach(function (tr) {
          if (tr === th.parentElement) return;
          var cellule = tr.children[k];
          if (cellule) r.push(cellule);
        });
      });
      return r;
    }
    if (c && c.point) { var p = document.elementFromPoint(c.point[0] / 100 * innerWidth, c.point[1] / 100 * innerHeight); return p ? [p] : []; }
    if (c && c.selecteur) { try { return Array.prototype.filter.call(document.querySelectorAll(c.selecteur), visible); } catch (e) { return []; } }
    var texte = typeof c === 'string' ? c : c && c.texte;
    var liste = texte ? candidats(norme(texte), c && c.dans) : [];
    if (c && c.rang) {
      liste = liste.slice().sort(function (a, b) { return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
      return liste[c.rang - 1] ? [liste[c.rang - 1].el] : [];
    }
    return liste.map(function (x) { return x.el; });
  }
  /** Plages et champs à couvrir, relevés de nouveau après un changement du DOM. */
  function relever() {
    sale = false;
    plages = [];
    if (!reglage || !document.body) return;
    var a = reglage.actives;
    var marcheur = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = marcheur.nextNode())) {
      var parent = n.parentElement;
      if (!parent || IGNORES[parent.tagName]) continue;
      FL.trouverTextes(n.nodeValue, a).forEach(function (p) {
        var r = document.createRange();
        r.setStart(n, p.debut);
        r.setEnd(n, p.fin);
        plages.push({ range: r, el: parent, origine: 'auto', taille: tailleDe(parent) });
      });
    }
    document.querySelectorAll('input, textarea').forEach(function (el) {
      if (el.type === 'hidden') return;
      var cat = FL.categorieChamp({ type: el.type, autocomplete: el.getAttribute('autocomplete') });
      var par = cat ? a[cat] : FL.trouverTextes(el.value, a).length > 0;
      if (par) plages.push({ el: el, origine: 'auto', taille: tailleDe(el) });
    });
    reglage.cibles.forEach(function (c) {
      elementsCible(c).forEach(function (el) { plages.push({ el: el, origine: 'cible', taille: tailleDe(el) }); });
    });
  }
  function rectsDe(p) {
    if (!p.el.isConnected) return [];
    if (p.el.checkVisibility && !p.el.checkVisibility({ visibilityProperty: true })) return [];
    var liste = p.range ? Array.prototype.slice.call(p.range.getClientRects()) : [p.el.getBoundingClientRect()];
    return liste.filter(function (r) { return r.width > 0 && r.height > 0 && r.bottom > -40 && r.right > -40 && r.top < innerHeight + 40 && r.left < innerWidth + 40; });
  }
  /** Voiles posés sur les plages visibles ; -> { auto, cible } (plages et champs couverts). */
  function poser() {
    if (!monter()) return { auto: 0, cible: 0 };
    var base = hote.getBoundingClientRect();
    var k = 0, compte = { auto: 0, cible: 0 };
    plages.forEach(function (p) {
      var rs = rectsDe(p);
      if (rs.length) compte[p.origine]++;
      rs.forEach(function (r) {
        var v = voiles[k];
        if (!v) { v = document.createElement('div'); ombre.appendChild(v); voiles.push(v); }
        v.className = reglage.mode === 'masque' ? 'v m' : 'v';
        v.style.display = 'block';
        v.style.fontSize = p.taille;
        v.style.left = (r.left - base.left - 3) + 'px';
        v.style.top = (r.top - base.top - 2) + 'px';
        v.style.width = (r.width + 6) + 'px';
        v.style.height = (r.height + 4) + 'px';
        k++;
      });
    });
    for (var i = k; i < voiles.length; i++) voiles[i].style.display = 'none';
    return compte;
  }
  if (reglage) {
    (function image() {
      requestAnimationFrame(image);
      if (!monter()) return;
      sentinelle.style.width = sentinelle.style.width === '1px' ? '2px' : '1px';
    })();
  }

  globalThis.__pm = {
    etat: function () {
      var anim = 0;
      try {
        document.getAnimations().forEach(function (a) {
          var t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : {};
          if (a.playState === 'running' && isFinite(t.endTime) && t.iterations !== Infinity) anim++;
        });
      } catch (e) { /* page sans animations */ }
      var images = Array.prototype.every.call(document.images || [], function (i) { return i.complete; });
      return { mutation: performance.now() - derniere, animations: anim, polices: document.fonts ? document.fonts.status : 'loaded', images: images, document: document.readyState };
    },
    trouver: function (cible) {
      if (cible && cible.point) {
        var el = document.elementFromPoint(cible.point[0] / 100 * innerWidth, cible.point[1] / 100 * innerHeight);
        if (!el) return { ok: false, raison: 'introuvable', candidats: [], proches: [] };
        var d = decrire(el);
        d.boite = [cible.point[0] / 100 * innerWidth - 2, cible.point[1] / 100 * innerHeight - 2, 4, 4];
        d.point = true;
        return d;
      }
      if (cible && cible.selecteur) {
        var trouves;
        try { trouves = Array.prototype.filter.call(document.querySelectorAll(cible.selecteur), visible); } catch (e) { return { ok: false, raison: 'introuvable', candidats: [], proches: [] }; }
        if (trouves.length === 1) return decrire(trouves[0]);
        if (!trouves.length) return { ok: false, raison: 'introuvable', candidats: [], proches: proches(cible.selecteur) };
        return { ok: false, raison: 'ambigu', candidats: trouves.slice(0, 6).map(function (x) { return { libelle: libelle(x), position: position(x) }; }), proches: [] };
      }
      var texte = typeof cible === 'string' ? cible : cible && cible.texte;
      var voulu = norme(texte);
      var liste = voulu ? candidats(voulu, cible && cible.dans) : [];
      if (!liste.length) return { ok: false, raison: 'introuvable', candidats: [], proches: proches(texte) };
      var premier = liste[0];
      var memes = liste.filter(function (c) { return c.niveau === premier.niveau && c.actionnable === premier.actionnable && c.vue === premier.vue; });
      var rang = cible && cible.rang;
      if (rang) {
        // « Le 2ᵉ Modifier » : dans l'ordre de la page, qu'il soit dans la vue ou plus loin.
        memes = liste.filter(function (c) { return c.niveau === premier.niveau && c.actionnable === premier.actionnable; })
          .sort(function (a, b) { return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
        if (rang > memes.length) return { ok: false, raison: 'introuvable', candidats: memes.map(function (c) { return { libelle: libelle(c.el), position: position(c.el) }; }), proches: [] };
        return decrire(memes[rang - 1].el);
      }
      if (memes.length > 1) return { ok: false, raison: 'ambigu', candidats: memes.slice(0, 6).map(function (c) { return { libelle: libelle(c.el), position: position(c.el) }; }), proches: [] };
      return decrire(premier.el);
    },
    boite: function (id) { var el = elements.get(id); return el && el.isConnected ? boite(el) : null; },
    dansVue: function (id) { var el = elements.get(id); return !!(el && dansVue(el)); },
    // Défilement doux jusqu'au centre ; la promesse attend que la cible ne bouge plus (10 images de suite, 3 s au plus).
    amener: function (id) {
      var el = elements.get(id);
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      return new Promise(function (ok) {
        var avant = null, stables = 0, debut = performance.now();
        (function suivre() {
          var r = el.getBoundingClientRect();
          var ici = Math.round(r.top) + ',' + Math.round(r.left);
          stables = ici === avant ? stables + 1 : 0;
          avant = ici;
          if (stables >= 10 || performance.now() - debut > 3000) ok(true); else requestAnimationFrame(suivre);
        })();
      });
    },
    coche: function (id) { var el = elements.get(id); if (!el) return null; var c = el.tagName === 'LABEL' && el.control ? el.control : el; return c.checked === undefined ? c.getAttribute('aria-checked') === 'true' : !!c.checked; },
    choisir: function (id, option) {
      var el = elements.get(id);
      if (!el || el.tagName !== 'SELECT') return { ok: false };
      var voulu = norme(option);
      var libelles = Array.prototype.map.call(el.options, function (o) { return o.label || o.text; });
      var k = libelles.findIndex(function (l) { return norme(l) === voulu; });
      if (k < 0) k = libelles.findIndex(function (l) { return norme(l).indexOf(voulu) === 0; });
      if (k < 0) return { ok: false, libelles: libelles };
      el.focus();
      el.selectedIndex = k;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      var etiquette = el.labels && el.labels[0] ? String(el.labels[0].innerText || el.labels[0].textContent || '').replace(/\s+/g, ' ').trim() : '';
      return { ok: true, libelles: libelles, choisie: k, etiquette: etiquette };
    },
    proches: proches,
    texteVisible: function (texte) {
      var voulu = norme(texte);
      var marcheur = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
      var n;
      while ((n = marcheur.nextNode())) if (norme(n.nodeValue).indexOf(voulu) >= 0 && visible(n.parentElement)) return true;
      return false;
    },
    pointA: function (x, y) { var el = document.elementFromPoint(x, y); return el ? idDe(el) : null; },
    // Flou : voiles à jour et peints (deux images) avant une capture ; -> { auto, cible } (zones couvertes).
    flouPret: function () {
      if (!monter()) return { auto: 0, cible: 0 };
      relever();
      poser();
      return new Promise(function (ok) { requestAnimationFrame(function () { requestAnimationFrame(function () { ok(poser()); }); }); });
    },
    // Voiles posés, en px CSS de la vue (tests) : [{ boite, origine }].
    zonesFlou: function () {
      var r = [];
      plages.forEach(function (p) { rectsDe(p).forEach(function (b) { r.push({ boite: [b.left, b.top, b.width, b.height], origine: p.origine }); }); });
      return r;
    },
    motDePasseVisible: function () {
      return Array.prototype.some.call(document.querySelectorAll('input[type=password], input[autocomplete~=current-password]'), visible);
    },
  };
}

// Motifs des données personnelles (lib/flou.js), posés tels quels avant le script : la page et film.json reconnaissent les
// mêmes choses.
const SOURCE_FLOU = require('node:fs').readFileSync(require('node:path').join(__dirname, 'flou.js'), 'utf8');
const SCRIPT = `(function () {\n${SOURCE_FLOU}\n})();\n(${scriptPage.toString()})();`;

/** Script du monde isolé avec son réglage (flou du parcours : { auto, mode, cibles, categories }). */
function scriptAvec({ flou } = {}) {
  return `globalThis.__pmConfig = ${JSON.stringify({ flou: flou || {} }).replace(/</g, '\\u003c')};\n${SCRIPT}`;
}

module.exports = { SCRIPT, scriptPage, scriptAvec };
