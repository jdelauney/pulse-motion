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
        "reprendre",
        "outils"
      ]
    },
    {
      "id": "retoucher",
      "numero": 2,
      "nom": "Retoucher",
      "couleur": 3,
      "commandes": [
        "retoucher",
        "voix"
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
        "style",
        "dessiner-personnage",
        "animer-personnage",
        "decouper-personnage",
        "atelier-personnages",
        "atelier-particules"
      ]
    }
  ],
  "navigation": [
    {
      "titre": "Accueil",
      "href": "index.html"
    },
    {
      "titre": "En 5 minutes",
      "href": "demarrage-rapide.html"
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
      "titre": "Personnages",
      "href": "personnages.html"
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
      "nom": "outils",
      "etape": "creer",
      "description": "Vérifier que l'ordinateur est prêt pour les vidéos et installer ce qui manque (ffmpeg, la transcription, Python), avec votre accord. Ne crée ni ne modifie aucune vidéo",
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
      "nom": "voix",
      "etape": "retoucher",
      "description": "Enregistrer, importer et caler la voix de la vidéo, ou faire écouter sa musique (« j'enregistre la scène 2 », « j'ai un fichier de ma voix », « recale les mots »)",
      "forme": "",
      "note": ""
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
    },
    {
      "nom": "dessiner-personnage",
      "etape": "personnaliser",
      "description": "Dessiner un personnage pour la vidéo, ou retoucher son dessin, et le montrer qui bouge (« dessine-moi un cuisinier rondouillard avec une toque », « change sa tenue en rouge »)",
      "forme": "[le personnage à dessiner, ou la retouche de son dessin]",
      "note": "facultatif : vous pouvez aussi le décrire ensuite, avec vos mots"
    },
    {
      "nom": "animer-personnage",
      "etape": "personnaliser",
      "description": "Créer ou modifier une pose ou un mouvement de personnage, et le montrer sous plusieurs angles (« fais une pose où il se gratte la tête », « il marche trop vite »)",
      "forme": "[la pose ou le mouvement voulu]",
      "note": "facultatif : vous pouvez aussi le décrire ensuite, avec vos mots"
    },
    {
      "nom": "decouper-personnage",
      "etape": "personnaliser",
      "description": "Animer l'illustration d'un personnage que vous fournissez (Illustrator, Inkscape, Figma…) en la découpant sur le squelette de Pulse Motion (« voici notre mascotte, fais-la marcher »)",
      "forme": "[le fichier SVG du personnage]",
      "note": "facultatif : vous pouvez aussi donner le fichier ensuite"
    },
    {
      "nom": "atelier-personnages",
      "etape": "personnaliser",
      "description": "Ouvrir l'atelier des personnages pour poser et animer un personnage à la souris (« je veux régler son salut moi-même », « laisse-moi placer ses bras »)",
      "forme": "[le mouvement ou la pose à ouvrir, et le personnage]",
      "note": "facultatif : vous pouvez aussi le dire ensuite, avec vos mots"
    },
    {
      "nom": "atelier-particules",
      "etape": "personnaliser",
      "description": "Ouvrir l'atelier des effets de particules pour régler un effet en le regardant (« laisse-moi régler les étincelles », « je veux voir ce que donne la neige »)",
      "forme": "[l'effet à régler]",
      "note": "facultatif : vous pouvez aussi le dire ensuite, avec vos mots"
    }
  ]
};
