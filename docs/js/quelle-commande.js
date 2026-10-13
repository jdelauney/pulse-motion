// Wiki Pulse Motion – assistant « Quelle commande pour… ? » : quelques questions à choix mènent à une commande conseillée.
// L'arbre est déclaré plus bas (QUESTIONS, CONSEILS). Une feuille dont la commande est absente de window.PULSE_WIKI est
// ignorée. Sans JavaScript, la page garde son tableau statique (bloc [data-statique]).
(function () {
  "use strict";

  var zone = document.querySelector("[data-assistant]");
  var donnees = window.PULSE_WIKI;
  if (!zone || !donnees || !donnees.commandes) return;
  var prefixe = donnees.prefixe || "/pulse-motion:";

  // --- L'arbre ----------------------------------------------------------------------------------------------
  // Une question : { question, choix: [[texte du bouton, id de la cible], …] }. La cible est une question ou un conseil.
  var DEPART = "ou";
  var QUESTIONS = {
    "ou": {
      question: "Où en êtes-vous ?",
      choix: [
        ["Je n'ai pas encore de vidéo", "nouvelle"],
        ["J'ai une vidéo en cours", "en-cours"],
        ["Ma vidéo est prête, je veux la partager", "partager"],
        ["Je veux une allure à moi", "allure"],
        ["J'ai un problème", "probleme"]
      ]
    },
    "nouvelle": {
      question: "Quelle vidéo voulez-vous ?",
      choix: [
        ["Une vidéo à partir d'une idée, vite", "creer"],
        ["Une vidéo aux couleurs de ma marque", "creer-charte"],
        ["Une vidéo avec ma voix et des sous-titres", "creer-voix"],
        ["Une vidéo verticale pour les réseaux", "creer-social"]
      ]
    },
    "en-cours": {
      question: "Que voulez-vous faire ?",
      choix: [
        ["Continuer là où je m'étais arrêté", "reprendre"],
        ["Changer un texte, une durée, une animation", "retoucher"],
        ["Changer le son : musique, voix, bruitages", "retoucher-son"],
        ["Changer de style", "retoucher-style"],
        ["Revenir en arrière", "retoucher-annuler"]
      ]
    },
    "partager": {
      question: "Pour quoi faire ?",
      choix: [
        ["La publier ou l'envoyer en MP4", "exporter"],
        ["Une version légère, pour un courriel", "exporter-leger"],
        ["Joindre les sous-titres sur une plateforme", "exporter-sous-titres"],
        ["La mettre sur mon site, sans MP4", "page-html"]
      ]
    },
    "allure": {
      question: "Qu'avez-vous en tête ?",
      choix: [
        ["Un style complet à moi : allure, polices, mouvements", "style"],
        ["Seulement mon logo et mes couleurs sur ma vidéo", "retoucher-charte"]
      ]
    },
    "probleme": {
      question: "Que se passe-t-il ?",
      choix: [
        ["Un texte déborde ou se lit mal", "retoucher-texte"],
        ["La vidéo parle avec la voix de l'ordinateur", "retoucher-voix"],
        ["L'export MP4 refuse ou échoue", "exporter-probleme"],
        ["Je ne sais plus où j'en suis", "reprendre"]
      ]
    }
  };

  // Un conseil : { commande, arguments, pourquoi, note (facultative), autre: { commande, arguments, pourquoi } }.
  var CONSEILS = {
    "creer": {
      commande: "creer", arguments: "la chaîne du froid en une minute",
      pourquoi: "Pulse Motion vous pose une ronde de questions (durée, public, son), écrit le déroulé, vous le fait valider, puis fabrique la vidéo et l'ouvre dans votre navigateur.",
      note: "Remplacez le sujet par le vôtre, ou tapez la commande seule : Pulse Motion vous le demandera.",
      autre: { commande: "retoucher", arguments: "ralentis la scène 3", pourquoi: "Une fois la vidéo à l'écran, chaque retouche se demande en une phrase." }
    },
    "creer-charte": {
      commande: "creer", arguments: "présenter notre nouvelle offre en 30 secondes",
      pourquoi: "À la question « À ajouter », choisissez « mon logo et mes couleurs » : Pulse Motion tire les couleurs de votre logo, les rend lisibles sur le fond du style, et récupère votre police.",
      note: "À la fin de la vidéo, Pulse Motion propose d'enregistrer la charte : elle vous sera proposée pour toutes les suivantes."
    },
    "creer-voix": {
      commande: "creer", arguments: "les gestes d'hygiène en cuisine",
      pourquoi: "À la ronde « Le son », choisissez « Je l'enregistre » et « Sous-titres : Oui ». Pulse Motion écrit le texte dit de chaque scène, cale l'animation avec une voix provisoire, puis vous enregistrez la vraie dans le studio de l'aperçu.",
      autre: { commande: "retoucher", arguments: "je réenregistre la scène 3", pourquoi: "Pour refaire une prise plus tard, scène par scène." }
    },
    "creer-social": {
      commande: "creer", arguments: "une astuce de rangement pour Instagram",
      pourquoi: "Un sujet pour les réseaux donne le genre « social » : format vertical 9:16, style énergique proposé en premier, sous-titres mot par mot conseillés.",
      note: "Pour le fil LinkedIn ou Instagram, demandez le format 4:5."
    },
    "reprendre": {
      commande: "reprendre", arguments: "",
      pourquoi: "Pulse Motion lit l'état de la vidéo du dossier, vous dit où elle en est en une phrase, puis continue à la bonne étape : déroulé à valider, scènes à écrire, aperçu à ouvrir.",
      note: "Ouvrez Claude Code dans le dossier de la vidéo. Au démarrage, Pulse Motion vous rappelle déjà la vidéo en cours."
    },
    "retoucher": {
      commande: "retoucher", arguments: "change le titre de l'intro",
      pourquoi: "Une phrase, une retouche : Pulse Motion fait le plus petit changement qui y répond, contrôle la vidéo, et l'aperçu se recharge à la même position.",
      autre: { commande: "retoucher", arguments: "annule", pourquoi: "Si le résultat ne vous plaît pas : la vidéo revient à l'état d'avant la retouche." }
    },
    "retoucher-son": {
      commande: "retoucher", arguments: "baisse la musique",
      pourquoi: "Musique plus calme ou plus entraînante, autre variante, voix plus forte, bruitage sur un titre, sous-titres en haut : tout se demande en une phrase.",
      note: "Pour écouter la musique seule, demandez « fais-moi écouter la musique »."
    },
    "retoucher-style": {
      commande: "retoucher", arguments: "passe en style éditorial",
      pourquoi: "Les scènes toutes faites sont recopiées dans le nouveau style ; les scènes composées librement sont réécrites. En cas de doute, Pulse Motion vous montre deux styles côte à côte.",
      autre: { commande: "style", arguments: "un style papercraft aux couleurs pop-art", pourquoi: "Si aucun des six styles livrés ne vous convient : créez le vôtre." }
    },
    "retoucher-annuler": {
      commande: "retoucher", arguments: "annule",
      pourquoi: "Chaque retouche est sauvegardée avant d'être faite. « annule » revient à l'état précédent, retouche après retouche.",
      note: "Les corrections faites seules par le contrôle s'annulent de la même façon."
    },
    "retoucher-charte": {
      commande: "retoucher", arguments: "prends les couleurs de mon logo",
      pourquoi: "Pulse Motion copie votre logo, en tire une couleur primaire et une couleur d'accent lisibles sur le fond du style, puis met la vidéo à jour.",
      autre: { commande: "retoucher", arguments: "applique la charte client-dupont", pourquoi: "Si vous avez déjà enregistré une charte avec une autre vidéo." }
    },
    "style": {
      commande: "style", arguments: "un style papercraft aux couleurs pop-art",
      pourquoi: "Un entretien en cinq questions (personnalité, références, couleur, polices, mouvement), puis Pulse Motion écrit le style, vous montre des scènes témoins et vérifie tout avant usage.",
      note: "Le style est rangé sur votre ordinateur et proposé ensuite pour toutes vos vidéos."
    },
    "exporter": {
      commande: "exporter", arguments: "",
      pourquoi: "Pulse Motion contrôle la vidéo, puis fabrique le MP4 sur votre ordinateur : en export fidèle avec ffmpeg (installé une fois, avec votre accord), sinon directement dans le navigateur."
    },
    "exporter-leger": {
      commande: "exporter", arguments: "",
      pourquoi: "Dites-le en lançant l'export (« une version légère pour un courriel ») : Pulse Motion exporte en 720p au lieu de 1080p.",
      note: "Pour une vidéo plus fluide, demandez au contraire 60 images par seconde (export deux fois plus long)."
    },
    "exporter-sous-titres": {
      commande: "exporter", arguments: "",
      pourquoi: "Avec des sous-titres, l'export écrit aussi un fichier .srt et un fichier .vtt à côté de la vidéo, à joindre sur YouTube, LinkedIn ou une plateforme de formation.",
      autre: { commande: "retoucher", arguments: "enlève les sous-titres de l'image", pourquoi: "Si la plateforme affiche ses propres sous-titres : ils quittent l'image, les fichiers restent." }
    },
    "page-html": {
      commande: "exporter", arguments: "",
      pourquoi: "Inutile, en fait : la page animée (sortie/<titre>.html) existe déjà et s'ouvre sans connexion. Déposez-la sur votre site. L'export MP4 sert pour les réseaux, le courriel ou une plateforme de formation.",
      note: "La page animée est mise à jour à chaque retouche."
    },
    "retoucher-texte": {
      commande: "retoucher", arguments: "raccourcis le texte de la scène 4",
      pourquoi: "Le contrôle réduit déjà seul un texte qui déborde, jusqu'à 80 % de sa taille. Au-delà, il faut le raccourcir : dites-le en une phrase.",
      note: "Un texte peu lisible sur son fond se règle aussi en une phrase : « mets un voile sous le titre »."
    },
    "retoucher-voix": {
      commande: "retoucher", arguments: "je réenregistre la scène 1",
      pourquoi: "La voix de l'ordinateur sert seulement à caler l'animation. Le studio s'ouvre dans l'aperçu : le texte défile, vous parlez, vous réécoutez, vous gardez ou refaites.",
      note: "Vous pouvez aussi cliquer sur « Voix » dans la barre de l'aperçu."
    },
    "exporter-probleme": {
      commande: "exporter", arguments: "",
      pourquoi: "Relancez l'export : les parties déjà faites sont reprises. L'export refuse une vidéo qui a encore des erreurs ou une voix provisoire ; Pulse Motion vous dit lesquelles et comment les régler.",
      note: "La page « Je suis bloqué » détaille chaque message."
    }
  };

  // --- Vérification : chaque feuille cite une commande qui existe -------------------------------------------
  var connues = {};
  donnees.commandes.forEach(function (c) { connues[c.nom] = true; });

  var valides = {};
  function estValide(id) {
    if (id in valides) return valides[id];
    valides[id] = false; // protège d'une boucle dans l'arbre
    if (CONSEILS[id]) {
      var c = CONSEILS[id];
      if (c.autre && !connues[c.autre.commande]) c.autre = null;
      valides[id] = !!connues[c.commande];
    } else if (QUESTIONS[id]) {
      var q = QUESTIONS[id];
      q.choix = q.choix.filter(function (ch) { return estValide(ch[1]); });
      valides[id] = q.choix.length > 0;
    }
    return valides[id];
  }
  if (!estValide(DEPART)) return;

  // --- Affichage --------------------------------------------------------------------------------------------
  var fil = zone.querySelector("[data-fil]");
  var zoneQuestion = zone.querySelector("[data-question]");
  var resultat = zone.querySelector("[data-resultat]");
  var actions = zone.querySelector("[data-actions]");
  var boutonRetour = zone.querySelector("[data-retour]");
  var parcours = []; // [{ question: id, choix: index }]
  var compteur = 0;

  function el(balise, classe, texte) {
    var n = document.createElement(balise);
    if (classe) n.className = classe;
    if (texte) n.textContent = texte;
    return n;
  }

  function vider(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function ligneCommande(nom, args) { return prefixe + nom + (args ? " " + args : ""); }

  function blocCommande(texte) {
    var pre = el("pre", "commande");
    var code = el("code", "", texte);
    pre.appendChild(code);
    if (navigator.clipboard) {
      var b = el("button", "bouton bouton-copier", "Copier");
      b.type = "button";
      b.setAttribute("aria-label", "Copier la commande " + texte);
      b.addEventListener("click", function () {
        navigator.clipboard.writeText(texte).then(function () {
          b.textContent = "Copié";
          setTimeout(function () { b.textContent = "Copier"; }, 1600);
        });
      });
      pre.appendChild(b);
    }
    return pre;
  }

  function lienPage(nom, classe, texte) {
    var a = el("a", classe, texte);
    a.href = "commandes/" + nom + ".html";
    return a;
  }

  // Le fil des réponses déjà données.
  function afficherFil() {
    vider(fil);
    parcours.forEach(function (p) {
      var q = QUESTIONS[p.question];
      var li = el("li");
      li.appendChild(el("span", "assistant-fil-question", q.question + " "));
      li.appendChild(el("strong", "", q.choix[p.choix][0]));
      fil.appendChild(li);
    });
    fil.hidden = parcours.length === 0;
  }

  // Flèches du clavier : passer d'un choix à l'autre dans le groupe.
  function clavier(evenement) {
    var boutons = Array.prototype.slice.call(evenement.currentTarget.querySelectorAll("button"));
    var i = boutons.indexOf(document.activeElement);
    if (i < 0) return;
    var suivant = null;
    if (evenement.key === "ArrowRight" || evenement.key === "ArrowDown") suivant = (i + 1) % boutons.length;
    else if (evenement.key === "ArrowLeft" || evenement.key === "ArrowUp") suivant = (i - 1 + boutons.length) % boutons.length;
    else if (evenement.key === "Home") suivant = 0;
    else if (evenement.key === "End") suivant = boutons.length - 1;
    if (suivant === null) return;
    evenement.preventDefault();
    boutons[suivant].focus();
  }

  function afficherQuestion(id, sansFocus) {
    var q = QUESTIONS[id];
    compteur++;
    vider(resultat);
    vider(zoneQuestion);
    afficherFil();

    var titre = el("h2", "", q.question);
    titre.id = "assistant-question-" + compteur;
    titre.tabIndex = -1;
    zoneQuestion.appendChild(el("p", "legende", "Question " + (parcours.length + 1)));
    zoneQuestion.appendChild(titre);

    var groupe = el("div", "filtres-etapes assistant-choix");
    groupe.setAttribute("role", "group");
    groupe.setAttribute("aria-labelledby", titre.id);
    q.choix.forEach(function (ch, n) {
      var b = el("button", "filtre", ch[0]);
      b.type = "button";
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () {
        b.setAttribute("aria-pressed", "true");
        parcours.push({ question: id, choix: n });
        aller(ch[1]);
      });
      groupe.appendChild(b);
    });
    groupe.addEventListener("keydown", clavier);
    zoneQuestion.appendChild(groupe);
    zoneQuestion.hidden = false;

    actions.hidden = parcours.length === 0;
    boutonRetour.hidden = parcours.length === 0;
    if (!sansFocus) titre.focus();
  }

  function afficherConseil(id) {
    var c = CONSEILS[id];
    vider(zoneQuestion);
    zoneQuestion.hidden = true;
    afficherFil();
    vider(resultat);

    var carte = el("div", "carte assistant-conseil");
    carte.appendChild(el("p", "pastille", "Notre conseil"));
    var titre = el("h2", "");
    titre.tabIndex = -1;
    titre.appendChild(document.createTextNode("Lancez "));
    titre.appendChild(el("code", "", prefixe + c.commande));
    carte.appendChild(titre);
    carte.appendChild(blocCommande(ligneCommande(c.commande, c.arguments)));
    carte.appendChild(el("p", "", c.pourquoi));
    if (c.note) carte.appendChild(el("p", "legende", c.note));
    var lien = el("p");
    lien.appendChild(lienPage(c.commande, "bouton bouton-plein", "Lire la page de " + prefixe + c.commande));
    carte.appendChild(lien);

    if (c.autre) {
      carte.appendChild(el("h3", "", "Possible aussi"));
      carte.appendChild(blocCommande(ligneCommande(c.autre.commande, c.autre.arguments)));
      carte.appendChild(el("p", "", c.autre.pourquoi));
      var lienAutre = el("p");
      lienAutre.appendChild(lienPage(c.autre.commande, "", "La page de " + prefixe + c.autre.commande));
      carte.appendChild(lienAutre);
    }
    resultat.appendChild(carte);

    actions.hidden = false;
    boutonRetour.hidden = false;
    titre.focus();
  }

  function aller(id) {
    if (CONSEILS[id]) afficherConseil(id);
    else afficherQuestion(id);
  }

  boutonRetour.addEventListener("click", function () {
    var precedent = parcours.pop();
    afficherQuestion(precedent ? precedent.question : DEPART);
  });
  zone.querySelector("[data-recommencer]").addEventListener("click", function () {
    parcours = [];
    afficherQuestion(DEPART);
  });

  // Le script prend la main : l'assistant remplace le tableau statique.
  var statique = document.querySelector("[data-statique]");
  if (statique) statique.hidden = true;
  zone.hidden = false;

  // Premier affichage, sans voler le focus au chargement de la page.
  afficherQuestion(DEPART, true);
})();
