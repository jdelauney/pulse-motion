// Wiki Pulse Motion – données communes : les étapes du parcours, la navigation et les commandes.
// Les descriptions reprennent celles des SKILL.md du plugin (plugins/pulse-motion/skills/) : les modifier ensemble.
window.PULSE_WIKI = {
  "prefixe": "/pulse-motion:",
  "etapes": [
    {
      "id": "creer",
      "numero": 1,
      "nom": "Créer",
      "couleur": 1,
      "commandes": [
        "creer",
        "reprendre"
      ]
    },
    {
      "id": "retoucher",
      "numero": 2,
      "nom": "Retoucher",
      "couleur": 3,
      "commandes": [
        "retoucher"
      ]
    },
    {
      "id": "exporter",
      "numero": 3,
      "nom": "Exporter",
      "couleur": 4,
      "commandes": [
        "exporter"
      ]
    },
    {
      "id": "personnaliser",
      "numero": 4,
      "nom": "Personnaliser",
      "couleur": 0,
      "commandes": [
        "style"
      ]
    }
  ],
  "navigation": [
    {
      "titre": "Accueil",
      "href": "index.html"
    },
    {
      "titre": "Prérequis",
      "href": "prerequis.html"
    },
    {
      "titre": "Tutoriels",
      "href": "tutoriels/index.html"
    },
    {
      "titre": "Commandes",
      "href": "commandes/index.html"
    },
    {
      "titre": "Concepts",
      "href": "concepts.html"
    },
    {
      "titre": "Le son",
      "href": "son.html"
    },
    {
      "titre": "Catalogue",
      "href": "catalogue.html"
    },
    {
      "titre": "Je suis bloqué",
      "href": "depannage.html"
    }
  ],
  "commandes": [
    {
      "nom": "creer",
      "etape": "creer",
      "description": "Créer une vidéo de motion design en quelques questions, valider son déroulé, puis la regarder dans le navigateur",
      "forme": "[le sujet de la vidéo en une phrase]",
      "note": "facultatif : sans sujet, Pulse Motion vous le demande"
    },
    {
      "nom": "reprendre",
      "etape": "creer",
      "description": "Reprendre la vidéo en cours là où elle s'était arrêtée",
      "forme": "",
      "note": ""
    },
    {
      "nom": "retoucher",
      "etape": "retoucher",
      "description": "Retoucher la vidéo en une phrase (« ralentis la scène 3 », « change le titre », « annule ») et la voir aussitôt",
      "forme": "[la retouche en une phrase]",
      "note": "facultatif : sans phrase, Pulse Motion vous demande ce qu'il faut changer"
    },
    {
      "nom": "exporter",
      "etape": "exporter",
      "description": "Exporter la vidéo en MP4 fidèle (vraies images du navigateur, son propre), fabriqué sur l'ordinateur, pour la publier ou l'envoyer",
      "forme": "",
      "note": ""
    },
    {
      "nom": "style",
      "etape": "personnaliser",
      "description": "Créer son propre style de vidéo (« un style papercraft aux couleurs pop-art ») : allure, couleurs, polices et mouvements, vérifiés avant usage",
      "forme": "[le style voulu en une phrase]",
      "note": "facultatif : sans description, Pulse Motion vous la demande"
    }
  ]
};
