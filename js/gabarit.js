// Wiki Pulse Motion – gabarit commun : en-tête, navigation latérale des commandes, sommaire, boutons Copier, pied de page.
// La page indique sa racine relative dans <html data-racine="../"> et, pour une commande, data-commande="creer".
// Le contenu reste lisible sans JavaScript : seuls la navigation et les boutons manquent alors.
(function () {
  "use strict";

  var donnees = window.PULSE_WIKI || { etapes: [], navigation: [], commandes: [] };
  var html = document.documentElement;
  var racine = html.getAttribute("data-racine") || "";
  var commande = html.getAttribute("data-commande");
  var ici = location.pathname.replace(/\\/g, "/");
  var prefixe = donnees.prefixe || "/pulse-motion:";

  function el(balise, attributs, enfants) {
    var n = document.createElement(balise);
    Object.keys(attributs || {}).forEach(function (k) {
      if (k === "texte") n.textContent = attributs[k];
      else n.setAttribute(k, attributs[k]);
    });
    (enfants || []).forEach(function (e) { if (e) n.appendChild(e); });
    return n;
  }

  // Une page est « la page actuelle » quand l'adresse se termine par son chemin depuis la racine du wiki.
  function estIci(href) {
    var cible = href.replace(/^\.\//, "");
    // Le chemin (vu depuis la racine du wiki) se termine par la cible, à une frontière de dossier :
    // l'accueil (index.html) n'est pas marqué sur commandes/index.html.
    var depuisRacine = ici.split("/").slice(-(racine.split("../").length)).join("/");
    return depuisRacine === cible || (cible === "index.html" && racine === "" && /\/$/.test(ici));
  }

  // Logo : une onde de pouls qui sort d'un triangle de lecture, aux couleurs de la traînée.
  function logo() {
    var svg = '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="logo-trainee" x1="0" x2="1">'
      + '<stop offset="0" stop-color="#FF6B35"/><stop offset=".5" stop-color="#C56CF0"/><stop offset="1" stop-color="#8E44AD"/></linearGradient></defs>'
      + '<circle cx="16" cy="16" r="15" fill="none" stroke="url(#logo-trainee)" stroke-width="1.5" opacity=".6"/>'
      + '<path d="M11 9.5v13l9.5-6.5z" fill="none" stroke="url(#logo-trainee)" stroke-width="2" stroke-linejoin="round"/>'
      + '<path d="M3 16h5M21.5 16h2l1.5-3 1.5 6 1.5-3H29" fill="none" stroke="url(#logo-trainee)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var s = document.createElement("span");
    s.innerHTML = svg;
    return s.firstChild;
  }

  function entete() {
    var liste = el("ul", { id: "menu-principal" });
    donnees.navigation.forEach(function (p) {
      var a = el("a", { href: racine + p.href, texte: p.titre });
      // Une rubrique (commandes/, tutoriels/) reste active sur toutes ses pages.
      var rubrique = /\/index\.html$/.test(p.href) && ici.indexOf("/" + p.href.split("/")[0] + "/") >= 0;
      if (estIci(p.href) || rubrique) a.setAttribute("aria-current", "page");
      liste.appendChild(el("li", {}, [a]));
    });
    var nav = el("nav", { class: "navigation", "aria-label": "Navigation principale" }, [liste]);
    var bouton = el("button", { class: "bouton bouton-fantome bouton-menu", type: "button", "aria-expanded": "false", "aria-controls": "menu-principal", texte: "Menu" });
    bouton.addEventListener("click", function () {
      var ouvert = nav.classList.toggle("ouverte");
      bouton.setAttribute("aria-expanded", ouvert ? "true" : "false");
    });
    var marque = el("a", { class: "marque", href: racine + "index.html" }, [logo(), el("span", { texte: "Pulse Motion" }), el("span", { class: "visuellement-cache", texte: " – accueil du wiki" })]);
    var barre = el("div", { class: "barre" }, [marque, bouton, nav]);
    var header = el("header", { class: "entete-site" }, [barre]);
    var evitement = el("a", { class: "lien-evitement", href: "#contenu", texte: "Aller au contenu" });
    document.body.insertBefore(header, document.body.firstChild);
    document.body.insertBefore(evitement, header);
  }

  // Navigation latérale des pages de commandes : les commandes groupées par étape.
  function laterale() {
    var cible = document.querySelector("[data-laterale=\"\"]");
    if (!cible) return;
    donnees.etapes.forEach(function (etape) {
      cible.appendChild(el("h2", { texte: etape.numero + ". " + etape.nom }));
      var ul = el("ul");
      etape.commandes.forEach(function (nom) {
        var a = el("a", { href: racine + "commandes/" + nom + ".html", texte: prefixe + nom });
        if (nom === commande) a.setAttribute("aria-current", "page");
        ul.appendChild(el("li", {}, [a]));
      });
      cible.appendChild(ul);
    });
  }

  // Navigation latérale d'une page longue (tutoriel, prérequis) : ses titres h2, dans l'ordre.
  function lateraleSommaire() {
    var cible = document.querySelector('[data-laterale="sommaire"]');
    if (!cible) return;
    cible.appendChild(el("h2", { texte: "Sur cette page" }));
    var ul = el("ul");
    document.querySelectorAll(".typographie h2").forEach(function (h) {
      var section = h.closest("section[id]");
      var id = h.id || (section && section.id);
      // Le titre seul : sans la durée (.duree) ni le numéro d'étape répété en double.
      var copie = h.cloneNode(true);
      copie.querySelectorAll(".duree").forEach(function (d) { d.remove(); });
      if (id) ul.appendChild(el("li", {}, [el("a", { href: "#" + id, texte: copie.textContent.replace(/\s+/g, " ").trim() })]));
    });
    cible.appendChild(ul);
  }

  // Onglets : <div class="onglets"><section data-onglet="Windows"><h3 class="onglet-titre">Windows</h3>…</section>…</div>
  function onglets() {
    document.querySelectorAll(".onglets").forEach(function (bloc, n) {
      var panneaux = Array.prototype.slice.call(bloc.querySelectorAll(":scope > [data-onglet]"));
      if (panneaux.length < 2) return;
      var liste = el("div", { class: "onglets-liste", role: "tablist" });
      var choisir = function (i) {
        panneaux.forEach(function (p, j) {
          p.hidden = i !== j;
          liste.children[j].setAttribute("aria-selected", i === j ? "true" : "false");
          liste.children[j].tabIndex = i === j ? 0 : -1;
        });
      };
      panneaux.forEach(function (p, i) {
        var id = "onglet-" + n + "-" + i;
        p.id = p.id || id + "-panneau";
        p.setAttribute("role", "tabpanel");
        var b = el("button", { type: "button", role: "tab", id: id, "aria-controls": p.id, texte: p.getAttribute("data-onglet") });
        p.setAttribute("aria-labelledby", id);
        b.addEventListener("click", function () { choisir(i); });
        b.addEventListener("keydown", function (e) {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            var k = (i + (e.key === "ArrowRight" ? 1 : panneaux.length - 1)) % panneaux.length;
            choisir(k);
            liste.children[k].focus();
          }
        });
        liste.appendChild(b);
      });
      bloc.insertBefore(liste, bloc.firstChild);
      bloc.classList.add("onglets-pret");
      // macOS par défaut sur un Mac, Windows sinon.
      var mac = /Mac/i.test(navigator.platform || navigator.userAgent);
      var defaut = panneaux.findIndex(function (p) { return /mac/i.test(p.getAttribute("data-onglet")) === mac; });
      choisir(defaut < 0 ? 0 : defaut);
    });
  }

  // Sommaire : les titres h2 portant un id dans le contenu.
  function sommaire() {
    var cible = document.querySelector("[data-sommaire]");
    if (!cible) return;
    document.querySelectorAll(".typographie h2").forEach(function (h) {
      var section = h.closest("section[id]");
      var id = h.id || (section && section.id);
      if (!id) return;
      cible.appendChild(el("li", {}, [el("a", { href: "#" + id, texte: h.textContent })]));
    });
  }

  // Commande précédente et suivante dans l'ordre du parcours.
  function suite() {
    var cible = document.querySelector("[data-suite]");
    if (!cible || !commande) return;
    var ordre = [];
    donnees.etapes.forEach(function (e) { ordre = ordre.concat(e.commandes); });
    var i = ordre.indexOf(commande);
    if (i > 0) cible.appendChild(el("a", { class: "bouton bouton-grand", href: ordre[i - 1] + ".html", texte: "← " + prefixe + ordre[i - 1] }));
    if (i >= 0 && i < ordre.length - 1) cible.appendChild(el("a", { class: "bouton bouton-grand", href: ordre[i + 1] + ".html", texte: prefixe + ordre[i + 1] + " →" }));
  }

  function boutonsCopier() {
    document.querySelectorAll("pre.commande").forEach(function (pre) {
      var code = pre.querySelector("code");
      if (!code || !navigator.clipboard) return;
      var b = el("button", { class: "bouton bouton-copier", type: "button", texte: "Copier" });
      b.addEventListener("click", function () {
        navigator.clipboard.writeText(code.textContent.trim()).then(function () {
          b.textContent = "Copié";
          setTimeout(function () { b.textContent = "Copier"; }, 1600);
        });
      });
      pre.appendChild(b);
    });
  }

  // CTA à flamme : chaque lettre du libellé reçoit son rang, pour l'onde au survol.
  function lettresCta() {
    document.querySelectorAll(".cta[data-onde]").forEach(function (cta) {
      var texte = cta.textContent;
      cta.setAttribute("aria-label", texte.trim());
      cta.textContent = "";
      Array.prototype.forEach.call(texte, function (c, i) {
        var s = el("span", { class: "lettre", "aria-hidden": "true", texte: c });
        s.style.setProperty("--i", i);
        cta.appendChild(s);
      });
    });
  }

  function pied() {
    var liens = el("p", { class: "pied-liens" }, [
      el("a", { href: racine + "commandes/index.html", texte: "Toutes les commandes" }),
      el("a", { href: racine + "quelle-commande.html", texte: "Quelle commande pour… ?" }),
      el("a", { href: racine + "depannage.html", texte: "Je suis bloqué" }),
      el("a", { href: racine + "lexique.html", texte: "Lexique" }),
      el("a", { href: "https://github.com/jdelauney/pulse-motion", texte: "Le dépôt sur GitHub" }),
    ]);
    var texte = el("p", { texte: "Wiki de Pulse Motion, le plugin de motion design pour Claude Code. Les commandes se tapent dans Claude Code, puis on se laisse guider." });
    document.body.appendChild(el("footer", { class: "pied-site" }, [el("div", { class: "conteneur" }, [texte, liens])]));
  }

  entete();
  laterale();
  lateraleSommaire();
  onglets();
  sommaire();
  suite();
  boutonsCopier();
  lettresCta();
  pied();

  // La recherche (js/recherche.js) s'ajoute à chaque page sans la déclarer page par page.
  var recherche = document.createElement("script");
  recherche.src = racine + "js/recherche.js";
  document.body.appendChild(recherche);
})();
