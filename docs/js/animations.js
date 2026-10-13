// Wiki Pulse Motion – lecteur des animations de flux.
// <figure class="anim" data-etapes="5" data-duree="1400"> … <svg> avec des éléments .e1 … .e5 </svg> <figcaption>…</figcaption></figure>
// L'animation démarre quand la figure entre dans la vue, joue une fois, puis s'arrête. La personne peut la
// mettre en pause, avancer d'une étape ou la rejouer. Sous prefers-reduced-motion : état final, sans commandes.
// Un élément [data-etape="3"] reçoit la classe .en-cours pendant l'étape 3.
(function () {
  "use strict";

  var reduit = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function bouton(texte, etiquette) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "bouton";
    b.textContent = texte;
    if (etiquette) b.setAttribute("aria-label", etiquette);
    return b;
  }

  function preparer(figure) {
    var total = parseInt(figure.getAttribute("data-etapes"), 10) || 1;
    var duree = parseInt(figure.getAttribute("data-duree"), 10) || 1400;
    var etape = 0;
    var minuterie = null;
    var enPause = false;

    function montrer(n) {
      etape = Math.max(0, Math.min(total, n));
      for (var i = 1; i <= total; i++) figure.classList.toggle("vu-" + i, i <= etape);
      figure.querySelectorAll("[data-etape]").forEach(function (e) {
        e.classList.toggle("en-cours", parseInt(e.getAttribute("data-etape"), 10) === etape);
      });
      if (etat) etat.textContent = "Étape " + etape + " sur " + total;
      if (etape >= total) arreter();
    }

    function arreter() {
      clearInterval(minuterie);
      minuterie = null;
      if (pause) pause.textContent = etape >= total ? "Rejouer" : "Lecture";
    }

    function lire() {
      if (etape >= total) montrer(0);
      enPause = false;
      if (pause) pause.textContent = "Pause";
      clearInterval(minuterie);
      montrer(etape + 1);
      minuterie = setInterval(function () { montrer(etape + 1); }, duree);
    }

    figure.classList.add("anim-pret");

    if (reduit) {
      montrer(total);
      return;
    }

    var barre = document.createElement("div");
    barre.className = "anim-commandes";
    var pause = bouton("Lecture");
    var suivante = bouton("Étape suivante");
    var etat = document.createElement("span");
    etat.className = "anim-etat";
    etat.setAttribute("aria-live", "polite");
    barre.appendChild(pause);
    barre.appendChild(suivante);
    barre.appendChild(etat);
    figure.appendChild(barre);

    pause.addEventListener("click", function () {
      if (minuterie) { enPause = true; arreter(); pause.textContent = "Lecture"; }
      else lire();
    });
    suivante.addEventListener("click", function () {
      enPause = true;
      arreter();
      montrer(etape >= total ? 1 : etape + 1);
      pause.textContent = etape >= total ? "Rejouer" : "Lecture";
    });

    montrer(0);

    // Lancement à l'entrée dans la vue, une seule fois.
    if ("IntersectionObserver" in window) {
      var observateur = new IntersectionObserver(function (entrees) {
        entrees.forEach(function (entree) {
          if (entree.isIntersecting && !enPause) {
            observateur.disconnect();
            lire();
          }
        });
      }, { threshold: 0.35 });
      observateur.observe(figure);
    } else {
      montrer(total);
    }
  }

  document.querySelectorAll("figure.anim").forEach(preparer);
})();
