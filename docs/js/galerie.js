// Wiki Pulse Motion – aperçus de la galerie et du catalogue : chaque boucle (video.apercu) joue seulement quand elle est à
// l'écran ; un bouton met tout en pause. Sur la page des mouvements : recherche (nom, numéro, mot-clé, sans accents ni
// casse), filtres par catégorie et nombre de mouvements affichés. Sous prefers-reduced-motion : rien ne joue tout seul, un
// clic sur un aperçu le lance ou l'arrête. Sans JavaScript, les cartes restent lisibles avec leur image fixe.
(function () {
  "use strict";

  var reduit = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var enPause = reduit;
  var videos = Array.prototype.slice.call(document.querySelectorAll("video.apercu"));
  var visibles = new Set();

  function lire(v) {
    if (enPause) return;
    var p = v.play();
    if (p && p.catch) p.catch(function () { /* lecture refusée ou média absent : l'image fixe reste */ });
  }

  if ("IntersectionObserver" in window) {
    var observateur = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) {
        if (e.isIntersecting) { visibles.add(e.target); lire(e.target); }
        else { visibles.delete(e.target); e.target.pause(); }
      });
    }, { rootMargin: "100px" });
    videos.forEach(function (v) { observateur.observe(v); });
  }

  videos.forEach(function (v) {
    v.addEventListener("click", function () {
      if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause();
    });
  });

  // ---- Page des mouvements : outils
  var outils = document.querySelector("[data-galerie-outils]");
  if (!outils) return;
  outils.hidden = false;
  var cartes = Array.prototype.slice.call(document.querySelectorAll(".carte-mouvement"));
  var sections = Array.prototype.slice.call(document.querySelectorAll(".categorie-mouvements"));
  var recherche = outils.querySelector("[data-galerie-recherche]");
  var filtres = outils.querySelector("[data-galerie-filtres]");
  var compte = outils.querySelector("[data-galerie-compte]");
  var bouton = outils.querySelector("[data-galerie-pause]");
  var categorie = "";

  function normaliser(t) {
    return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-_'’&/]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function filtrer() {
    var mots = normaliser(recherche.value).split(" ").filter(Boolean);
    var n = 0;
    cartes.forEach(function (c) {
      var texte = c.getAttribute("data-mots") || "";
      var ok = (!categorie || c.getAttribute("data-categorie") === categorie) && mots.every(function (m) { return texte.indexOf(m.replace(/^#/, "")) >= 0; });
      c.hidden = !ok;
      if (ok) n++;
    });
    sections.forEach(function (s) { s.hidden = !s.querySelector(".carte-mouvement:not([hidden])"); });
    compte.textContent = n + (n > 1 ? " mouvements affichés" : " mouvement affiché");
  }

  function boutonFiltre(id, nom) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "bouton bouton-filtre";
    b.textContent = nom;
    b.setAttribute("aria-pressed", id === categorie ? "true" : "false");
    b.addEventListener("click", function () {
      categorie = id;
      filtres.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      filtrer();
    });
    filtres.appendChild(b);
  }

  boutonFiltre("", "Toutes");
  sections.forEach(function (s) { boutonFiltre(s.getAttribute("data-categorie"), s.querySelector("h2").textContent); });
  recherche.addEventListener("input", filtrer);

  function majBouton() { bouton.textContent = enPause ? "Lire les aperçus" : "Tout mettre en pause"; }
  bouton.addEventListener("click", function () {
    enPause = !enPause;
    if (enPause) videos.forEach(function (v) { v.pause(); });
    else visibles.forEach(lire);
    majBouton();
  });
  majBouton();

  // Lien vers un mouvement (mouvements.html#m042) : ouvrir sa fiche.
  if (/^#m\d{3}$/.test(location.hash)) {
    var cible = document.querySelector(location.hash + " details");
    if (cible) cible.open = true;
  }
  filtrer();
})();
