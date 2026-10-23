// Wiki Pulse Motion – index des commandes : filtre par mot (sans tenir compte des accents) et par étape.
(function () {
  "use strict";

  var zone = document.querySelector("[data-filtres]");
  if (!zone) return;
  var champ = zone.querySelector("input");
  var groupes = Array.prototype.slice.call(document.querySelectorAll(".groupe-etape"));
  var aucun = document.querySelector("[data-aucun]");
  var etapes = (window.PULSE_WIKI && window.PULSE_WIKI.etapes) || [];
  var choisie = null;

  var simplifier = function (t) { return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); };

  function filtrer() {
    var mots = simplifier(champ.value).split(/\s+/).filter(Boolean);
    var visibles = 0;
    groupes.forEach(function (g) {
      var dansEtape = !choisie || g.getAttribute("data-etape") === choisie;
      var cartes = 0;
      g.querySelectorAll(".grille-cartes > li").forEach(function (li) {
        var texte = simplifier(li.textContent);
        var montre = dansEtape && mots.every(function (m) { return texte.indexOf(m) >= 0; });
        li.hidden = !montre;
        if (montre) cartes++;
      });
      g.hidden = cartes === 0;
      visibles += cartes;
    });
    aucun.hidden = visibles > 0;
  }

  var boutons = zone.querySelector(".filtres-etapes");
  function bouton(texte, id) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "filtre";
    b.textContent = texte;
    b.setAttribute("aria-pressed", id === choisie ? "true" : "false");
    b.addEventListener("click", function () {
      choisie = id;
      boutons.querySelectorAll(".filtre").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      filtrer();
    });
    boutons.appendChild(b);
  }
  bouton("Toutes", null);
  etapes.forEach(function (e) { bouton(e.numero + ". " + e.nom, e.id); });

  champ.addEventListener("input", filtrer);
  zone.hidden = false;
})();
