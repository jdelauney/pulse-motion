// Wiki Pulse Motion – conversations simulées.
// <div class="conversation" data-titre="Exemple : démarrer un projet">
//   <p data-role="vous">/pulse-motion:creer la chaîne du froid</p> <p data-role="claude">…</p> <p data-role="outil">…</p>
// </div>
// À l'entrée dans la vue, les messages apparaissent un à un ; ceux de la personne se « tapent ». Bouton Rejouer.
// Sans JavaScript ou sous prefers-reduced-motion : la conversation complète, immobile.
(function () {
  "use strict";

  var reduit = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function preparer(bloc) {
    var messages = Array.prototype.slice.call(bloc.querySelectorAll("p[data-role]"));
    var fil = document.createElement("div");
    fil.className = "conversation-fil";
    messages.forEach(function (m) { fil.appendChild(m); });

    var barre = document.createElement("div");
    barre.className = "conversation-barre";
    var titre = document.createElement("span");
    titre.textContent = bloc.getAttribute("data-titre") || "Exemple de conversation dans Claude Code";
    barre.appendChild(titre);
    bloc.textContent = "";
    bloc.appendChild(barre);
    bloc.appendChild(fil);
    if (reduit) return;

    var textes = messages.map(function (m) { return m.innerHTML; });
    var minuteries = [];
    var rejouer = document.createElement("button");
    rejouer.type = "button";
    rejouer.className = "bouton";
    rejouer.textContent = "Rejouer";
    barre.appendChild(rejouer);
    bloc.classList.add("conversation-prete");

    function vider() {
      minuteries.forEach(clearTimeout);
      minuteries = [];
      messages.forEach(function (m, i) { m.innerHTML = textes[i]; m.classList.add("cache"); m.classList.remove("frappe"); });
    }

    // Frappe caractère par caractère, seulement pour un message sans balise (texte simple).
    function taper(m, i, fin) {
      var texte = m.textContent;
      if (/<[a-z]/i.test(textes[i]) || texte.length > 140) { fin(); return; }
      m.textContent = "";
      m.classList.add("frappe");
      var n = 0;
      (function suite() {
        m.textContent = texte.slice(0, ++n);
        if (n < texte.length) minuteries.push(setTimeout(suite, 28));
        else { m.classList.remove("frappe"); m.innerHTML = textes[i]; fin(); }
      })();
    }

    function jouer() {
      vider();
      var i = 0;
      (function suivant() {
        if (i >= messages.length) return;
        var m = messages[i];
        m.classList.remove("cache");
        var rang = i++;
        if (m.getAttribute("data-role") === "vous") taper(m, rang, function () { minuteries.push(setTimeout(suivant, 500)); });
        else minuteries.push(setTimeout(suivant, Math.min(2200, 600 + m.textContent.length * 12)));
      })();
    }

    rejouer.addEventListener("click", jouer);

    if ("IntersectionObserver" in window) {
      vider();
      var observateur = new IntersectionObserver(function (entrees) {
        if (entrees.some(function (e) { return e.isIntersecting; })) {
          observateur.disconnect();
          jouer();
        }
      }, { threshold: 0.3 });
      observateur.observe(bloc);
    }
  }

  document.querySelectorAll(".conversation").forEach(preparer);
})();
