// Wiki Pulse Motion – recherche sur tout le site. Le bouton « Rechercher » de l'en-tête (ou la touche / ou Ctrl+K) ouvre une
// fenêtre ; l'index (js/index-recherche.js) se charge au premier usage. La recherche ne tient compte ni des accents ni des
// majuscules ; chaque mot tapé doit se trouver dans le résultat.
(function () {
  "use strict";

  var racine = document.documentElement.getAttribute("data-racine") || "";
  var entrees = null;
  var dialogue, champ, liste, etat, dernierFocus;

  var simplifier = function (t) { return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); };
  var echapper = function (t) { return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };

  function charger(suite) {
    if (entrees) return suite();
    if (window.PULSE_RECHERCHE) { preparer(); return suite(); }
    etat.textContent = "Chargement de l'index…";
    var s = document.createElement("script");
    s.src = racine + "js/index-recherche.js";
    s.onload = function () { preparer(); suite(); };
    s.onerror = function () { etat.textContent = "L'index de recherche n'a pas pu être chargé."; };
    document.head.appendChild(s);
  }

  function preparer() {
    entrees = (window.PULSE_RECHERCHE || []).map(function (e) {
      return { e: e, t: simplifier(e.t), s: simplifier(e.s), x: simplifier(e.x) };
    });
  }

  // Extrait d'environ 160 caractères autour du premier mot trouvé, mots surlignés.
  function extrait(e, mots) {
    var brut = e.e.x;
    var simple = e.x;
    var pos = -1;
    mots.forEach(function (m) { var p = simple.indexOf(m); if (p >= 0 && (pos < 0 || p < pos)) pos = p; });
    var debut = Math.max(0, pos - 60);
    var morceau = brut.slice(debut, debut + 160);
    var html = echapper(morceau);
    mots.forEach(function (m) {
      if (m.length < 2) return;
      var simpleMorceau = simplifier(morceau);
      var i = simpleMorceau.indexOf(m);
      if (i < 0) return;
      var original = echapper(morceau.slice(i, i + m.length));
      html = html.replace(original, "<mark>" + original + "</mark>");
    });
    return (debut > 0 ? "… " : "") + html + (debut + 160 < brut.length ? " …" : "");
  }

  function chercher() {
    var mots = simplifier(champ.value).split(/\s+/).filter(Boolean);
    liste.textContent = "";
    if (!mots.length) { etat.textContent = "Tapez un ou plusieurs mots : voix, MP4, sous-titres, style…"; return; }
    var resultats = [];
    entrees.forEach(function (e) {
      var score = 0;
      for (var i = 0; i < mots.length; i++) {
        var m = mots[i];
        var dansTitre = e.t.indexOf(m) >= 0, dansSection = e.s.indexOf(m) >= 0, dansTexte = e.x.indexOf(m) >= 0;
        if (!dansTitre && !dansSection && !dansTexte) return;
        score += (dansTitre ? 6 : 0) + (dansSection ? 4 : 0) + (dansTexte ? Math.min(5, e.x.split(m).length - 1) : 0);
      }
      // L'en-tête d'une page (son chapeau) résume la page : il passe devant une section qui cite le mot en passant.
      if (!e.e.a) score += 3;
      resultats.push({ e: e, score: score });
    });
    resultats.sort(function (a, b) { return b.score - a.score; });
    resultats.slice(0, 20).forEach(function (r) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = racine + r.e.e.u + (r.e.e.a ? "#" + r.e.e.a : "");
      a.innerHTML = '<span class="resultat-titre">' + echapper(r.e.e.t) + (r.e.e.s ? ' <span class="resultat-section">› ' + echapper(r.e.e.s) + "</span>" : "") + "</span>"
        + '<span class="resultat-extrait">' + extrait(r.e, mots) + "</span>";
      a.addEventListener("click", fermer);
      li.appendChild(a);
      liste.appendChild(li);
    });
    etat.textContent = resultats.length
      ? resultats.length + (resultats.length > 1 ? " résultats" : " résultat") + (resultats.length > 20 ? ", les 20 plus proches affichés" : "")
      : "Aucun résultat. Essayez un autre mot, ou la page « Je suis bloqué ».";
  }

  function ouvrir() {
    dernierFocus = document.activeElement;
    dialogue.hidden = false;
    document.body.classList.add("recherche-ouverte");
    champ.focus();
    charger(chercher);
  }

  function fermer() {
    dialogue.hidden = true;
    document.body.classList.remove("recherche-ouverte");
    if (dernierFocus && dernierFocus.focus) dernierFocus.focus();
  }

  function construire() {
    dialogue = document.createElement("div");
    dialogue.className = "recherche";
    dialogue.hidden = true;
    dialogue.setAttribute("role", "dialog");
    dialogue.setAttribute("aria-modal", "true");
    dialogue.setAttribute("aria-label", "Rechercher dans le wiki");
    dialogue.innerHTML = '<div class="recherche-fond" data-fermer></div>'
      + '<div class="recherche-boite">'
      + '<div class="recherche-entete"><label class="visuellement-cache" for="recherche-champ">Rechercher dans le wiki</label>'
      + '<input class="champ recherche-champ" id="recherche-champ" type="search" autocomplete="off" placeholder="Rechercher : voix, MP4, sous-titres, style…">'
      + '<button class="bouton" type="button" data-fermer>Fermer</button></div>'
      + '<p class="recherche-etat" aria-live="polite"></p>'
      + '<ul class="recherche-resultats"></ul></div>';
    document.body.appendChild(dialogue);
    champ = dialogue.querySelector("input");
    liste = dialogue.querySelector("ul");
    etat = dialogue.querySelector(".recherche-etat");
    champ.addEventListener("input", function () { if (entrees) chercher(); });
    dialogue.querySelectorAll("[data-fermer]").forEach(function (b) { b.addEventListener("click", fermer); });
    dialogue.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); fermer(); }
      // Le focus reste dans la fenêtre.
      if (e.key === "Tab") {
        var focusables = dialogue.querySelectorAll("input, button, a[href]");
        var premier = focusables[0], dernier = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
        else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
      }
    });

    // Bouton dans l'en-tête (ajouté par gabarit.js).
    var barre = document.querySelector(".entete-site .barre");
    if (barre) {
      var bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "bouton-recherche";
      bouton.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6"/><path d="M14 14l4 4"/></svg><span>Rechercher</span><kbd>/</kbd>';
      bouton.setAttribute("aria-label", "Rechercher dans le wiki (touche /)");
      bouton.addEventListener("click", ouvrir);
      barre.insertBefore(bouton, barre.querySelector(".bouton-menu"));
    }

    document.addEventListener("keydown", function (e) {
      var cible = e.target;
      var saisie = cible && (cible.tagName === "INPUT" || cible.tagName === "TEXTAREA" || cible.isContentEditable);
      if (!dialogue.hidden) return;
      if ((e.key === "/" && !saisie) || (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        ouvrir();
      }
    });
  }

  construire();
})();
