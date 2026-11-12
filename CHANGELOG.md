# Journal des versions de Pulse Motion

Produit par `outils/nouveautes.js` depuis l'historique du dépôt : ne pas le modifier à la main. Les nouveautés racontées simplement sont sur la page « Nouveautés » du wiki.

## 0.67.0 – 2026-11-12

Vos vidéos parlent anglais, espagnol, allemand, italien, portugais ou néerlandais, et une vidéo réussie se décline en vertical ou dans une autre langue sans la refaire.

### Nouveautés

- Langue de la vidéo (S9-1) : champ « langue » du déroulé (fr, en, es, de, it, pt, nl, avec une région), module unique moteur/langues.js chargé seulement quand la vidéo la déclare ; page (lang), nombres, lettres, lecteur de la page livrée, graphiques, lèvres et sous-titres dans la langue ; typographie par langue et ponctuation ouvrante de l'espagnol ; glossaire de même langue ; glyphe-absent par rôle de police ; voix provisoire et transcription dans la langue, jamais une voix française à sa place ; voix de synthèse française seulement ; piste son étiquetée
- Déclinaisons (S9-2) : pulse-motion decliner crée declinaisons/<nom>/ (autre format, autre langue, ou les deux) sans toucher l'original ; scènes toutes faites recopiées depuis le style, scènes à réécrire avec leur motif, textes à traduire et voix retirées listés ; champ « declinaison » validé ; l'état liste les déclinaisons et donne l'origine ; l'usage d'export de la déclinaison est pris par défaut

## 0.66.0 – 2026-11-12

Le guide de Pulse Motion existe aussi en anglais, pour le faire découvrir à ceux qui ne lisent pas le français.

### Nouveautés

- Pages anglaises outillées (chantier I) : blocs de la galerie, du catalogue, des idées et des exemples écrits aussi en anglais par galerie.js depuis le recueil outils/site/anglais.json (texte source exact → traduction, --anglais liste les manques), liens hreflang des pages en deux langues (outils/site/langues.js) vérifiés par liens.js, un index de recherche par langue ; gabarit : sélecteur de langue, navigation et pied anglais, pages restées en français marquées, avis « Pulse Motion parle français » ; scripts des pages en anglais sur une page anglaise

## 0.65.0 – 2026-11-12

Votre bibliothèque : gardez vos effets et vos personnages pour toutes vos vidéos, et emportez tout sur un autre ordinateur.

### Nouveautés

- Effets et personnages gardés pour toutes les vidéos et copiés dans la vidéo qui s'en sert (effet liste|enregistrer|utiliser, personnages enregistrer|utiliser, provenance video, personnel, plugin), bibliothèque emportée dans une archive ZIP écrite et lue sans dépendance (bibliotheque liste|exporter|importer, rien de déjà là remplacé sans accord, archive vérifiée avant toute écriture) ; l'assemblage ne lit jamais la bibliothèque, le contrôle dit de copier

### Corrections

- Écritures binaires de l'import depuis une variable « donnees », recette lue dans « octets » (règle des écritures) ; dessiner-personnage propose d'abord les personnages livrés, puis ceux de la bibliothèque

## 0.64.0 – 2026-11-12

Pulse Motion retient vos goûts, prend les couleurs de votre site, retrouve vos vidéos et peut livrer une page qui fait son MP4 toute seule.

### Nouveautés

- Page qui sait faire son MP4, facultative (page.boutonMp4 : bloc d'export compressé de 260 Ko au plus, avis MPL-2.0, bouton seulement si le navigateur encode le H.264, sinon un conseil ; pulse-motion page --bouton-mp4)
- Journal des erreurs sans arguments et rapport de problème local (chemins anonymisés, rien de la vidéo, adresse de signalement préremplie de 7 000 caractères au plus, ouverte seulement après accord)
- Mémoire des goûts (preferences noter, liste par portée, retirer ; 30 au plus) et registre des vidéos (alimenté au début d'une création et à chaque assemblage, dossier disparu gardé)
- Charte proposée depuis le site de l'entreprise après accord (couleurs lisibles sur le fond du style, ton, polices proposées sans aucun fichier téléchargé, logo filtré), appliquée seulement après l'accord sur la proposition
- Outil des nouveautés (CHANGELOG par version depuis la première lignée de main, page Nouveautés du wiki depuis nouveautes.json) et mise à jour annoncée une seule fois au démarrage, jamais à la première installation

### Corrections

- Logo du site écrit depuis une variable « donnees » (règle des écritures binaires)
- Creer et retoucher ramenés sous leurs plafonds (23 400 et 13 850 o) : renvois d'une ligne à chez-soi, phrases resserrées
- Un argument de la commande répété dans le message d'erreur est masqué au journal
- Délai du site tenu à part de celui des commandes du navigateur (démarrage lent sous charge)
- Commits d'une version dans l'ordre où ils ont été faits, et commits faits après le commit de version comptés avec elle : même journal avant et après la fusion

## 0.63.1 – 2026-11-12

Correction d'un test de la page de choix des styles ; rien ne change pour vous.

## 0.63.0 – 2026-11-12

Vingt styles : le film pédagogique des années 50 arrive, avec son guide qui montre le geste.

### Nouveautés

- Vie « mains » (corps immobile, bras qui travaillent), cadence image par image et place réglées par la feuille du style ; dessin guide des années 50, aplats décalés de leur trait cassé (tirets permis dans le SVG des personnages)
- Mode-d-emploi, le film pédagogique des années 50 (aplats décalés de leur trait cassé, module aplats, guide qui montre, image par image), vingtième style, rangé dans « aussi »
- Polices manuscrites accordées par l'auteur (Patrick Hand pour crayon, Kalam pour tableau-blanc et les notes de recit-donnees, Caveat pour carnet, Cabin Sketch pour les titres de tableau-noir) ; l'écriture lettre à lettre laisse dépasser les écritures penchées
- Rose vif #F0508C rendu aux encres, par l'accent « encre seulement » de la charte (accent-encre, hors du contrôle de contraste ; règle accent-encre-texte s'il colore un texte)

### Corrections

- Titres de tableau-blanc en Kalam plus petits, interligne de 1,28 (débordements) ; mode-d-emploi : titres posés sur un aplat teinté dans l'encre du texte (contraste mesuré)
- Capture de tableau-noir et tableau-blanc sous leur délai : Kalam 400 seule (tableau-noir au lieu de Cabin Sketch, qui faisait échouer la capture, et de Caveat, trop lente à découper) ; marges de l'écriture lettre à lettre inchangées par défaut, élargies par variable dans carnet (Caveat)

## 0.62.0 – 2026-11-11

Quatre styles de plus : crayon, papier découpé, risographie et pictogrammes.

### Nouveautés

- Encres « cire » (crayon gras masqué par le grain du papier) et « riso » (une couche par encre, calage constant dans le plan), module riso (aplats du décor surimprimés dans un canevas, repli en aplats HTML)
- Vague D, papier et imprimé : crayon, papier-decoupe, riso et pictogrammes (fiches, identités, neuf scènes, polices déjà livrées), textures tirées d'une graine (outils/styles/textures.js)

### Corrections

- Lavis plus légers, textes posés dessus dans l'encre du texte (contraste mesuré)

## 0.61.2 – 2026-11-11

PM_MEDIAS_MANQUANTS=1 ne fabrique que les styles de la galerie dont un média manque (les médias publiés restent tels quels) ; médias des neuf styles nouveaux faits (0.61.2)

### Nouveautés

- PM_MEDIAS_MANQUANTS=1 ne fabrique que les styles de la galerie dont un média manque (les médias publiés restent tels quels) ; médias des neuf styles nouveaux faits (0.61.2)

## 0.61.1 – 2026-11-11

Correction interne de la vérification automatique ; rien ne change pour vous.

## 0.61.0 – 2026-11-11

Deux styles en perspective : l'infographie en petits blocs et l'album de petits personnages.

### Nouveautés

- Module isométrique moteur/medium/iso.js (projection, file triée par séparation des boîtes puis profondeur, boîte, prisme, cylindre, contour extrudé, silhouettes au pas de 12 i/s, Isotype, coupe, focus et contexte, étiquettes posées sur le plan), sa feuille iso.css embarquée avec lui ; un module ne tire le calque de dessin que s'il en a besoin
- Vague C, iso-infographie (le système en diorama isométrique, blocs plats à trois tons, Isotype, coupe) et iso-album (la règle du quotidien jouée dans l'ordre par de petits personnages, texte posé au sol), fiches en 11 sections, recommandés « aussi »

### Corrections

- L'export rapide sur un canevas plus petit que la page prend toute l'image, mise à l'échelle, et plus seulement le coin haut gauche
- Étiquettes ancrées à leur largeur naturelle, texte au sol d'iso-album écrit lettre à lettre (effet écrit), plus grand et centré sur le sol ; accents des chartes à 4,5:1 sur le fond ; comparaison en 9:16 au-dessus des boutons des réseaux ; usages et caméra des fiches

## 0.60.0 – 2026-11-11

Quatre styles dessinés en direct : tableau blanc, tableau noir, carnet de croquis et graphique qui raconte.

### Nouveautés

- Texte écrit à la main (data-lettres="ecrit", fini à son échéance, son de l'écriture), modules d'un style inclus seulement s'il les déclare (moteur/medium : encre des tableaux dans un canevas, au feutre ou à la craie ; une seule ligne), repli de l'encre au SVG si le canevas échoue
- Vague B, quatre styles livrés : tableau-blanc, tableau-noir, carnet, recit-donnees (fiches, identités, palettes sonores, polices OFL du dépôt)

### Corrections

- Feuille de Bunny Fonts qui pointe vers jsdelivr traduite en adresses directes de fonts.bunny.net (forme stricte, même famille), toute autre adresse refusée avec le conseil de fournir le fichier, seul le WOFF2 installé ; test hors réseau
- Apostrophe échappée dans le message de data-mots « ecrit »
- Une seule ligne en super-ellipse (au large des coins d'un texte long), place du chiffre entouré, pointe du crayon de recit-donnees, d'après les images témoins regardées à 360 px
- Textes écrits gardés en blocs (points, numéros : plus de grille où chaque mot ferait une case), parties du moyeu écrites d'un trait, hachures plus légères sous le titre qui compte, entrée de recit-donnees par transform (le moyeu garde sa place) ; d'après le rendu dans les quatre formats
- Rangée du moyeu alignée en vertical, flèches du schéma moins rugueuses (elles partent du bord des idées)
- Ligne des effets de lettres de moteur.md rendue telle quelle (reprise mot pour mot depuis la 0.28.0) ; écriture à la main citée plus court

## 0.59.0 – 2026-11-11

Trois styles de plus : l'info qui se lit son coupé, le dessin technique et le film de lancement.

### Nouveautés

- Légende en morceaux (data-morceaux) et mot-clé sur un bloc d'accent (data-mot-cle)
- Vague A, trois styles livrés : info-sans-son, plan-technique, lancement (fiches, identités, palettes sonores, polices)

### Corrections

- Images témoins vérifiées (structure, sommes de contrôle, décodage) et relues ou recapturées avant de conclure ; capture incomplète refaite ; cause d'un décodage impossible gardée hors du logo
- Variables du bloc de mot-clé renommées (--pm-cle-fond, --pm-cle-texte), sans rien de commun avec les blocs d'écran

## 0.58.1 – 2026-11-11

Correction interne du numéro de version ; rien ne change pour vous.

## 0.58.0 – 2026-11-11

Chaque style a maintenant son propre son, et le son est plus fin.

### Nouveautés

- Vingt-trois bruitages (sons tenus de feutre, craie, crayon, papier et chargement), calage par le pic, mixage par bandes, moment fort, cordes pincées par modèle physique, ambiances acoustique et mecanique, ambiance proposée par le style, tracé à main levée par la matière ; tech-sombre tape en frappe

### Corrections

- Moyeu et scènes toutes faites dans une caméra automatique (le conteneur reprend la mise en page de la scène, chevauchements jugés dans le repère de la caméra) ; corps de code jamais compté comme débordement (code-trop-large le mesure) ; étapes d'un code comptées comme du nouveau
- Après un saut dans le temps sous une caméra, deux images d'attente avant la capture : la scène finale du témoin explication-facture se dessine à l'octet près dans tout ordre
- Une carte (texte sur un fond ou dans un cadre) compte pour toute sa boîte dans les chevauchements : le cadre d'une partie du moyeu posé sur le titre est vu ; tests de S8 J4 (son) et des correctifs

## 0.57.1 – 2026-11-11

Nettoyage de l'historique du projet ; rien ne change pour vous.

### Corrections

- Add exclusion for all JSON files in Claude's settings directory

## 0.57.0 – 2026-11-11

Une voix de synthèse française, fabriquée sur votre ordinateur, et un modèle de vidéo explicative.

### Nouveautés

- Voix de synthèse locale facultative (Kokoro-82M, voix ff_siwis) installée avec accord, fabriquée par scène et figée comme une prise, refaite seulement quand la scène change, exportable sans accord et créditée ; prononciation vérifiée par la transcription (mots à vérifier, voix-mal-lue sous 85 %), enregistrement découpé signalé sous 85 % (voix-ecart-texte)
- Modèle « Vidéo explicative » (caméra et bruitages automatiques allumés d'office par ses réglages) et son exemple « Du devis au paiement : le trajet d'une facture », fabriqué par une séance creer (moyeu, flèches, annotation, formule de tableur, graphique en barres)

### Corrections

- Consignes de la voix de synthèse dans une partie lue à la demande (reference audio/synthese) pour tenir les plafonds de voix, outils et exporter ; creer garde ses relances de transcription ; tests mis à jour (neuf modèles, ronde 2, sous-commande synthese, outils)

## 0.56.1 – 2026-11-11

Correction interne des fichiers publiés ; rien ne change pour vous.

### Corrections

- Réglages de Claude Code du mainteneur retirés du suivi (chemins de son ordinateur), porte qui examine tout le dépôt et reconnaît l'écriture Git Bash des chemins, plus aucun nom proche du sien dans ses tests

## 0.56.0 – 2026-11-11

Le wiki montre de vrais exemples, de la demande à la vidéo.

### Nouveautés

- Page Exemples (demande d'origine, déroulé validé et vidéo de chaque exemple, Vibe Connection, deux retouches avant / après rendues par le moteur, trois scénarios d'usage annoncés comme tels)
- Section « Pourquoi Pulse Motion » sur l'accueil (le problème, trois façons de faire et leur défaut, ce qui change), huit modèles comptés
- Porte de publication (aucun chemin de cet ordinateur ni secret dans les fichiers suivis), passée par publier.js ; chemins de l'auteur retirés des protocoles d'essai et d'une spec suivie

### Corrections

- Les faux secrets du test de la porte sont écrits en morceaux, pour que la porte passe sur ses propres tests
- Crissement (S7 J4) dans le tableau des décalages de mixage-fin, et treize sons comptés par le test des références

## 0.55.0 – 2026-11-11

Caméra automatique qui trouve seule ses plans, texte dit balisé avec repères et forme dite, alignement des nombres et sigles, allure globale, ampleur de scène, bruitages automatiques ; #126 à #128 au dictionnaire

### Nouveautés

- Caméra automatique (plans calculés depuis le relevé, gros plans data-cadrer, continuité, zones des sous-titres et des réseaux), texte dit balisé (repères, forme affichée et dite, pauses), alignement des nombres, années, décimales et sigles, allure globale, ampleur de scène, bruitages automatiques par type d'entrée (crissement), accents de musique

## 0.54.1 – 2026-11-11

Aucun fichier d'avancement hors d'une vidéo, même après un échec

### Corrections

- Aucun fichier d'avancement dans un dossier sans deroule.json, même quand une commande échoue faute de déroulé (contrôle, export, comparaison, voix lancés hors d'une vidéo)

## 0.54.0 – 2026-11-11

Modèle « tutoriel logiciel » avec sa variante « astuce en 30 s », exemple filmé sur l'appli d'essai, fiche filmer, tutoriel « Filmer un logiciel » et confidentialité dans le wiki

### Nouveautés

- Modèle « tutoriel logiciel » (scènes d'écran, variante « astuce en 30 s » sur téléphone) ; un sujet de tutoriel de logiciel le trouve
- « Créer une facture dans Facturo », tutoriel de 30 s filmé sur l'appli d'essai (4 étapes, 1,6 Mo) ; écran compté comme sujet (sujet-petit) ; champs lisibles en mode sombre dans l'appli d'essai
- Creer part du modèle tutoriel-logiciel (scène d'écran, déclinaison 9:16) ; README

## 0.53.0 – 2026-11-11

Graphiques de données, code qui se transforme, formules en MathML, moyeu dans les six styles, schema relié par data-fleche, cartes graphique et organigramme ; #122 à #125 au dictionnaire

### Nouveautés

- Graphiques de données, code qui se transforme, formules en MathML, moyeu dans les six styles, schema relié par data-fleche (S7 J2)

### Corrections

- Moyeu en carré et en vertical (rangée sous 9/10, parties energique), fiches sous 4 000 o, chiffre de la carte graphique ; tests des styles et du changement de style à neuf scènes

## 0.52.0 – 2026-11-11

Sites en ligne après accord, connexion par la personne, flou des données personnelles dans les images, import d'une vidéo de l'écran ou d'une animation

### Nouveautés

- Import d'une vidéo de l'écran ou d'une animation en prise (ffmpeg ou Chrome et Mediabunny), repères cibles etape:N
- Sites en ligne après accord, connexion par la personne (profil hors du projet), flou des données personnelles dans les images, flouter après coup ; appli d'essai (Mon compte, Clients) ; compétence filmer (accord, connexion, confidentialité, import) ; tests

### Corrections

- Mesures de mise au point retirées du figement
- Images du figement décodées sans fetch (data: refusé sous charge)

## 0.51.1 – 2026-11-10

Vérification en ligne rétablie : dictionnaire ouvert, écritures du tournage déclarées

### Corrections

- Dictionnaire des shaders ouvert aux numéros suivants (#112 et au-delà) ; écritures du tournage déclarées (film.json en utf8, images en octets)

## 0.51.0 – 2026-11-10

Tournage local d'une application web : parcours en phrases, prises figées, appli d'essai, lecture image par image dans l'écran, compétence filmer ; marge automatique de l'export rapide

### Nouveautés

- Tournage local d'une application web (CDP étendu : fenêtre, profil, échelle, mobile, sur, attendre, capturer webp ; parcours en phrases ; monde isolé ; page calme ; même onglet ; dialogues relevés ; réseau hors de l'ordinateur bloqué), prises figées dans films/ (cadence, doublons, WebP, bords, planche), appli d'essai Facturo, lecture image par image dans pm-ecran (moteur/film.js, pm-etape, etape:N, blocs liste et dialogue relevés), pointeur dans un calque non zoomé ; règles film-introuvable, prise-non-choisie, film-trop-lourd, page-pas-calme ; étape tournage, historique sans les prises

### Corrections

- En export rapide, une marge automatique reste « auto » dans la copie figée (getComputedStyle rendait « 0px » pour un élément flex centré par margin: auto, décalé hors de la première scène)

## 0.50.0 – 2026-11-10

Diagrammes : relevé de mise en page, calque de dessin SVG et M.dessin, tracé à main levée, flèches entre éléments, sept annotations au mot, encre des styles ; #112 à #121 au dictionnaire

### Nouveautés

- Relevé de mise en page, calque de dessin SVG et M.dessin, tracé à main levée à graine, flèches entre éléments, annotations au mot, M.dessin.traces et data-encre="style"
- Assemblage (étiquettes et icônes des dessins libres, durées par défaut), règles fleche-cible-introuvable, dessin-invalide et dessin-erreur, relevés dans controle.json, preuve du déterminisme
- Tracé à main levée, ébullition, flèche qui relie et sept annotations au dictionnaire (#112 à #121)

### Corrections

- Calque du dessous créé dès le relevé, pointe de flèche déplacée par transformation (même image quel que soit l'ordre des seek), étiquette éloignée du tracé, police des étiquettes à 3,6 cqh, script de page sans balise de fin, data-main-levee sur une balise sans attribut suivant
- Consigne de l'animateur (« nombre incertain » gardé), liste des groupes du moteur entier avec « dessin »

## 0.49.1 – 2026-11-10

Export d'un son fait de bruitages seuls, aperçus de la galerie #094 à #111 et des styles

### Corrections

- Sonie intégrée non vérifiée quand le son n'a que des bruitages (clics d'un tutoriel : l'AAC adoucit leurs transitoires, 1,4 LU mesurés), qui bloquait l'export et la galerie des mouvements

## 0.49.0 – 2026-11-10

Passe cathodique et cinq transitions aux couleurs de la marque : fuite de lumière, brûlure, lentille, iris, déformation ; #107 à #111 au dictionnaire

### Nouveautés

- Passe cathodique et cinq transitions aux couleurs de la marque (fuite de lumière, brûlure, lentille, iris, déformation)
- Cinq transitions par shader au dictionnaire (#107 à #111, après la réserve de S6)

### Corrections

- #107 à #111 repris après la catégorie logiciel de S6 (fusion de main)

## 0.48.0 – 2026-11-10

Écran des tutoriels de logiciel : cadres, pointeur à graine, projecteur, zooms enchaînés, texte tapé, blocs interface, catégorie logiciel du dictionnaire

### Nouveautés

- Écran des tutoriels (pm-ecran, six cadres), pointeur à graine (clic, survol, double-clic, doigt), projecteur, anneau, assombrissement, zooms enchaînés (enchainerZooms), suivi des gestes, saisie par paquets, dix blocs « interface », pulse-motion bloc, catégorie logiciel #094 à #106 ; règles ecran-invalide, pointeur-hors-ecran, suivre-desactive, etapes-trop-rapprochees

## 0.47.0 – 2026-11-10

Styles personnels guidés, contenu témoin des styles, galerie par catégorie, choisir un style en le regardant

### Nouveautés

- Contenu témoin unique (chaîne du froid), images A et B, boucle des huit scènes
- Base notée, guide adapté de la fiche de base, changements par tour, planche du témoin et planche avec la base, base modifiée signalée une fois
- Choisir un style en le regardant jouer (page locale, garde commune partagée avec le choix des mouvements)
- Styles regroupés par catégorie, images témoin A et B, vérification des médias de chaque style livré

### Corrections

- Extrait de l'animateur sans la ligne « Adapté du style » ; consignes du critique et de creer dans leurs plafonds ; tests de la galerie (sorties du lot des styles, cartes)

## 0.46.0 – 2026-11-10

Fiches de style en 11 sections, extrait pour l'animateur, identités complètes, recherche des styles par médium

### Nouveautés

- Fiche de style en 11 sections et extrait pour l'animateur
- Identité complète, recherche par médium, liste courte au-delà de 3 styles

## 0.45.0 – 2026-11-10

Icônes Lucide embarquées, cherchées en français, posées par data-icone

### Nouveautés

- Bibliothèque Lucide embarquée (2 046 icônes, alias), mots-clés français, pulse-motion icones chercher|afficher|planche, <svg data-icone> remplacé à l'assemblage et contrôlé par le crochet (icone-inconnue, icone-mal-placee) ; outil du mainteneur outils/icones/preparer.js

## 0.44.0 – 2026-11-10

Motifs #081 à #093 et zoom en log ; galerie de cinq personnages livrés, habillage bâtonnets équivalent

### Nouveautés

- Motifs #081 à #093 (appui, graphique, pulsation, échos, défilement, avant/après, pastille, inondation, roue, mur, hélice) et zoom en log
- Motifs au dictionnaire (#081 à #093, catégorie compositions)
- Manière de dessin et habillage bâtonnets équivalent (data-habillage)
- Galerie de cinq personnages livrés (écolière, soignant, grand-mère en traits ; technicien, cuisinière en pièces pleines)

## 0.43.0 – 2026-11-10

Retouches directes : remarques sur l'image, rétablir et versions nommées, avant / après, réglages rapides, forme d'onde et vignettes

### Nouveautés

- Rétablir, versions nommées, liste et versions reconstituées
- Remarques épinglées gardées, ré-ancrées et traitées une à une ; réglages rapides écrits dans le déroulé avec l'historique
- Remarques sur l'image, réglages rapides, forme d'onde, vignettes et comparaison de versions ; planches des instants et avant / après
- Remarques floues, remarques de l'aperçu, historique et réglages rapides ; références remarques et reglages-rapides

### Corrections

- Curseur du journal relu, réglage déjà en place sans écriture, panneaux absents des pages d'export, phrase des changements de style et de charte

## 0.42.0 – 2026-11-10

Première vidéo plus tôt : ébauche animée, menu d'entrée, Faites pour moi

### Nouveautés

- Ébauche animée des scènes absentes
- L'ébauche garde l'étape fabrication, se signale et bloque l'export
- Exemple d'un modèle ouvert depuis un dossier temporaire
- Parcours « Faites pour moi » et journal des choix
- Menu d'entrée, ronde du son en deux questions, Faites pour moi, ébauche dès l'accord

### Corrections

- Le décor de la carte neutre court jusqu'à la fin de la scène (data-dur="scene", voix comprise)

## 0.41.0 – 2026-11-10

Vie du décor : boucles de vie bornées et déphasées, #069 à #080

### Nouveautés

- Boucles de vie pm-v-* bornées et déphasées, data-dur="scene"
- Vie du décor au dictionnaire (#069 à #080)
- Vie sans durée et mouvement écrasé (boucles de vie)
- Preuve du déterminisme aussi sur les scènes à décor vivant

## 0.40.2 – 2026-11-10

Relais de l'invite de commandes fiable sous Windows

### Corrections

- Relais de l'invite de commandes en fins de ligne CRLF et commentaires ASCII (cmd relisait le fichier au mauvais endroit sur la CI Windows)

## 0.40.1 – 2026-11-10

Aucun fichier d'avancement hors d'une vidéo

### Corrections

- Une installation lancée hors d'une vidéo n'écrit aucun fichier d'avancement (état laissé par les tests dans le dossier du plugin, retiré)

## 0.40.0 – 2026-11-10

Flou de mouvement du master, vidéo à fond transparent, boucle parfaite ; creer et style appelables en phrase, installation en un accord, avancement visible, messages sans jargon avec noms proches, voix provisoire acceptée une fois par version

### Nouveautés

- Flou de mouvement (sous-images, N adaptatif, master), PNG rapides et combinaisons refusées
- Flou de mouvement par sous-images dans les deux voies (--flou oui|non), voie du navigateur prête pour le fond transparent
- Vidéo à fond transparent (MOV ProRes 4444 pour le montage, WebM VP9 à couche alpha pour le web), règle fond-opaque
- Champ boucle du déroulé, transmis à la page
- Creer et style appelables en phrase, avec garde-fous (rien écrit avant la première ronde, nouvelle vidéo rappelée, dossier occupé renvoyé à reprendre) ; évaluations : pas-creer et pas-style sur chaque contre-exemple, jetons de la critique lus avant d'écrire (décision 9)
- Node et Python trouvés hors du PATH (relais, rappel par le relais sh, code 3), plan d'installation en un accord (pulse-motion outils --plan), Node.js installé avec l'accord ; relancer Claude Code en dernier recours seulement
- Avancement des travaux longs (fichier .pulse-motion/avancement.json, pulse-motion avancement --suivre, paliers du contrôle par scène, de l'export, de la comparaison, de l'installation et de la voix, événement de l'aperçu et bandeau) ; compétences qui annoncent et suivent par Monitor ; référence demandes partagée par creer et retoucher
- Messages du contrôle sans jargon, avec leur consigne pour Claude (sortie/controle.json) ; noms proches proposés (moteur/proches.js, au tronc) pour un mot dit, un identifiant, un mouvement, une transition, un style, un effet, un personnage, une scène
- Un accord par version pour la voix provisoire (etat --accord voix-provisoire, lié à l'empreinte des prises), version de travail nommée à part (<titre>-version-de-travail.mp4, définitif intact) dans les deux voies, choix proposé dans l'aperçu au lieu d'un refus
- Vidéo en boucle parfaite (lecteur qui reprend, musique sans fondus et queue repliée au début, contrôles boucle-mesure et boucle-jointure, consigne de l'animateur)

### Corrections

- Version de travail nommée à part aussi pour le fond transparent
- Conseil de raccourcir un titre gardé dans le message (détail en consigne) ; tests alignés sur la voix provisoire proposée et l'image dessinée par sous-images ; options du flou et du fond transparent gardées après le choix de la voix

## 0.39.0 – 2026-11-10

Livrables de diffusion : couverture et vignette, chapitres, crédits, page sur sa couverture, zones des plateformes, textes d'accompagnement ; extrait d'une scène, passage seul, GIF, PDF des planches, cadre de téléphone

### Nouveautés

- Socle des livrables (couverture, chapitres, crédits, zones des plateformes)
- Page livrée sur sa couverture, zones sûres des plateformes (contrôle, sous-titres, touche Z)
- Couverture, vignette intégrée, chapitres, crédits, extraits, GIF et cadre de téléphone dans la voie fidèle
- Livrables, extraits et cadre dans la voie du navigateur ; options de la commande (scène, passage, GIF, cadre), conseils après l'export
- PDF des planches par l'impression du navigateur (A4 paysage, deux scènes par page, sans ffmpeg)

### Corrections

- Consigne du studio rétablie dans exporter, écriture binaire explicite des planches du PDF ; outil de mesure des livrables
- Pas d'affiche dans un navigateur piloté (tests, mesures), sauf ?affiche=1 ; test des statistiques : vignette vérifiée
- Ni vignette ni chapitres pour une taille visée (deux voies) ; affiche absente d'un navigateur sans fenêtre

## 0.38.0 – 2026-11-10

Export par usage : web, réseaux, présentation, master, courriel sous la taille visée, brouillon ; couleurs BT.709 justes dans les deux voies ; temps restant ; noms par usage ; erreurs de script et heure du verrou

### Nouveautés

- Usages d'export (usages.json, résolution, taille visée)
- Encodage par usage, couleurs BT.709, sortie double, deux passes, encodeurs matériels, contrôles du fichier
- Voie fidèle par usage, intermédiaire commun, courriel sous la taille visée, erreurs de script, heure du verrou
- Temps restant, estimation sans navigateur, résultat par usage
- Voie navigateur par usage, menu de l'aperçu, noms des fichiers, couverture reçue, erreurs de script
- Grain plafonné à 12 images par seconde pour le courriel et le brouillon
- Voie navigateur en I420 BT.709 plage limitée (conversion maison, mesurée sur la mire) ; mire des couleurs et sa mesure

### Corrections

- Skill et sorties.md conformes aux tests existants (vérification, essentiel sans spec), cas de tests corrigés
- Deux intermédiaires gardés par sorte (pas par version), taille visée lue après chaque essai, brouillon sans encodeur de la carte graphique dans le navigateur, chemin du fichier inchangé en ligne de commande ; wiki : usages d'export
- Brouillon par l'encodeur de la carte graphique étiqueté BT.709 complet (h264_metadata), trouvé par la mesure

## 0.37.0 – 2026-11-10

Contrôles du mouvement, planche image par image, regard qui suit un mobile, flotter, lancer

### Nouveautés

- Contrôles du mouvement (geste bref, pose figée, raccord de boucle, tout en phase, à-coups de caméra) et planche image par image (spec Mouvement vivant, plan V2)
- Regard qui suit un personnage ou un objet avec retard, data-attention (spec Mouvement vivant 5.5, plan V3)
- Flotter, pieds pendants, ombre au sol et contact écrasé (spec Mouvement vivant 5.7, plan V3)
- Lancer vers un élément, un point ou un personnage qui le rattrape, objet qui roule (spec Mouvement vivant 5.8, plan V3)

### Corrections

- Raccord-boucle ne signale pas un saut invisible (opacité nulle aux deux bouts, gouttes du témoin de 3 min)

## 0.36.0 – 2026-11-09

Fins de transition sans saut, preuve du déterminisme, non-régression visuelle, évaluations de déclenchement, plugin installé, CI, carte graphique ; package.json suit plugin.json

### Nouveautés

- Preuve du déterminisme au contrôle complet, non-régression visuelle du moteur (spec S2, plan S2-7)
- Évaluations de déclenchement, plugin installé, CI sur trois systèmes, carte graphique (spec S2, plan S2-8)

### Corrections

- La scène qui sort ne se dessine plus au-dessus de celle qui entre
- Règles de preuve repérées par documentation.test.js, témoin de courbe franc, copie hors du dépôt sur un autre disque ; pitch : titre de « solution » un temps plus tôt (image unie 1,1 s depuis que la scène qui sort ne transparaît plus)
- CI réduite à la phase unitaire (Windows requis, macOS et Linux suivis), recherche de ffmpeg dans les chemins du système visé

## 0.35.0 – 2026-11-09

Règles de réalisation et de vérité, images figées et vides, son mesuré, vérification de l'export dans verification.json ; tour de corrections après la critique borné

### Nouveautés

- Règles de réalisation et de vérité, images figées et vides, son mesuré, vérification de l'export (specs S2 plans S2-5 et S2-6)

## 0.34.0 – 2026-11-09

Doctrine de réalisation lue avant le déroulé, règles de scène et faits dans le déroulé ; relecture par un agent à contexte vierge dès 3 scènes, verdict dans les blocs de fin ; anti-clichés et pièges lus par les deux témoins seulement ; planches de regard identiques à l'octet

### Nouveautés

- Doctrine de réalisation lue par Claude avant d'écrire le déroulé (15 sections chiffrées, erreurs et clichés pour la fiche du relecteur, symptômes numérotés), règles de scène en partie lue à la demande (rythme/scene), accroche à 3 s, animateur sans scène vide ni nombre inventé, faits et cadrans dans le déroulé
- Relecture par un agent à contexte vierge dès 3 scènes (8 axes, barre de 8, un seul tour), critique.json gardé et daté par l'empreinte de la page, verdict dans les lignes 🔎 de creer, retoucher et exporter, correspondance des 5 axes de la revue

### Corrections

- Planches de regard identiques à l'octet d'un passage à l'autre : vignettes réduites dans Node (moyenne des surfaces) et affichées sans mise à l'échelle, chaque instant capturé deux fois (la réduction par le navigateur et la première capture variaient, défaut de la 0.33.0 vu par la suite complète)

## 0.33.0 – 2026-11-09

Onze références de réalisation lues par l'animateur et les compétences ; documentation des contrôles vérifiée contre le code ; Claude regarde la vidéo avant de la montrer et dit ce qui a été vérifié ; aperçu qui contourne les ports réservés par Windows

### Nouveautés

- Onze références de réalisation (directions, revue, anti-clichés, pièges, mixage fin, compositions, actifs de marque, cadres et pointeur, sorties, scènes témoins, recettes de rythme), branchées sur l'animateur et les compétences
- La documentation des contrôles dit vrai : chaque seuil écrit « valeur unité (clé) », 28 règles rattrapées, sousTitreMin dans seuils.json
- Claude regarde la vidéo avant de la montrer (pulse-motion planche --regard) et dit honnêtement ce qui a été vérifié

### Corrections

- Un port réservé par le système (EACCES, plages exclues de Windows) fait passer au port suivant, comme un port pris ; rien ne reste ouvert si l'aperçu ne démarre pas
- Toute la plage de 20 ports réservée (une plage exclue de Windows en compte 100) : le système choisit un port libre

## 0.32.0 – 2026-11-09

Pages qui n'embarquent que le moteur utile, minifié ; rendu des seules scènes visibles ; polices chargées avant toute capture ; second témoin composé ; personnages vivants : poses enchaînées, clignement juste, repos vivant, retard, yeux d'abord, ombre, atterrissage

### Nouveautés

- Pages qui n'embarquent que les groupes de modules dont la vidéo se sert
- Moteur minifié dans la page, sans dépendance
- Second témoin composé, hors personnage ; transition par shader en Sonnet
- Poses enchaînées sans arrêt (flow, lissage continu)
- Clignement juste et à graine, repos vivant, retard des membres, yeux en avance, ombre au sol, atterrissage écrasé

### Corrections

- Une image pas encore chargée d'une scène visible n'est attendue qu'une fois
- Groupe GPU aussi pour les obstacles ; tests adaptés au moteur à la carte et au rendu paresseux

## 0.31.0 – 2026-11-09

Export : cache par scène avec empreintes des pixels et du fichier dérivé séparées, réexport limité aux scènes changées, verrou, profil par phase, capture PNG rapide, navigateurs selon la machine, vérifications par paquets

### Corrections

- Pas de --disable-frame-rate-limit sur les pages de capture (une capture pouvait précéder la présentation de l'image) ; voie navigateur : recouvrement abandonné (gain mesuré −1 %)
- File dans l'ordre du temps, son rendu avant les captures, aucun drapeau d'arrière-plan sur les pages de capture (exports déterministes du témoin de 3 min)

## 0.30.0 – 2026-11-08

Contrôle limité aux scènes changées, un seul assemblage et la page écrite par le contrôle, flashs mesurés sur des captures réduites, crochet de contrôle des scènes, historique par contenu, comparaison des styles en parallèle

### Nouveautés

- Chaque scène écrite contrôlée aussitôt par un crochet PostToolUse du plugin (règles statiques partagées avec le contrôle)
- Un assemblage par contrôle, page écrite par le contrôle, rendu remesuré seulement pour les scènes changées (--complet avant l'export)
- Page de contrôle pilotée par le CDP, flashs mesurés depuis Node sur des captures réduites (repli dans la page)
- Sauvegardes par contenu (objets et manifestes), sans recopier les médias ; anciennes copies restaurables
- Styles rendus en même temps, un style en échec n'arrête pas les autres

### Corrections

- Une animation finie reste suivie, revenir en arrière dans une scène affichée la retrouve (l'image ne dépend que de t)

## 0.29.0 – 2026-11-08

Références lues à la carte, consignes de l'animateur en 6 000 o, modèle léger pour les scènes simples, deux scènes témoins avant les autres, consignes de creer par section

### Nouveautés

- Moteur, particules et audio en un tronc et des parties lues à la carte, renvois vers les parties
- Consignes en 6 000 o, parties lues selon la consigne, mouvements par leur fiche ; modèle choisi selon la scène dans retoucher
- Consignes de creer par section, reprendre ne lit que celle de l'étape
- Modèle de l'animateur choisi selon la scène, deux scènes témoins et une note de grammaire avant les autres au-delà de cinq scènes
- Jetons, modèle et octets de consignes lus par agent

### Corrections

- Motif des commandes de lecture (espaces et fin de mot)
- La séance lance le pulse-motion du plugin mesuré (bin en tête du PATH), et non celui du plugin installé
- Les scènes témoins s'écrivent toujours au modèle de la session, même toutes faites

## 0.28.0 – 2026-11-08

Protocole de mesure et témoin de 3 min, descriptions des compétences en 250 caractères, état de la vidéo lu au lancement, transcription sans silences ni phrases fantômes

### Nouveautés

- Outils du protocole de mesure S1 (temps des commandes, poids de la page, jetons d'une séance, séance non interactive), PM_SANS_OUVRIR pour n'ouvrir aucune fenêtre
- Vidéo témoin de 3 min (15 scènes, chaleureux, tous les groupes du moteur), fabriquée par une séance de création puis figée
- Descriptions en 250 caractères au plus (renvois gardés), effort faible sur outils, ateliers et exporter
- État de la vidéo lu au lancement de reprendre, retoucher et exporter (blocs injectés qui n'annulent jamais la compétence, phrase de repli), enveloppes qui signalent Node absent en français ; tests des descriptions, du budget des consignes, de l'injection et de l'effort
- Transcription sans silences (VAD 500 ms, passages indépendants), phrases fantômes et répétitions retirées sauf si le texte attendu les contient

### Corrections

- Option vide acceptée (--temoins ""), version de Claude Code lue sans interpréteur
- Description de reprendre sous 250 caractères (allongée par le chantier C), test des renvois corrigé
- Séance arrêtée dès la fin de son tour (un aperçu en arrière-plan la tenait ouverte), bilan borné dans le temps, fiche du témoin jamais copiée dans la vidéo mesurée
- Séance arrêtée seulement après le compte rendu du dernier agent
- Séance arrêtée seulement quand ses commandes de fond (hors serveurs) ont fini
- Effort faible retiré après mesure (lexique sauté sur outils et ateliers, export lancé au premier plan) ; test aligné sur la règle de la spec

## 0.27.0 – 2026-11-08

Serveurs locaux durcis : envois venus de la page seulement, fichiers servis filtrés, écritures atomiques

### Nouveautés

- Garde commune des serveurs locaux (hôte, origine obligatoire des envois, types déclarés par route, en-têtes défensifs, OPTIONS refusé), fichiers servis filtrés (caché, JSON, Markdown, lien sortant), écriture atomique partagée, aperçu retiré de l'état à l'arrêt, mentions Mediabunny et explainroo

## 0.26.0 – 2026-11-08

Sept modèles de vidéo, un exemple fini par modèle, page Idées de vidéos

### Nouveautés

- Sept modèles de vidéo, pulse-motion modeles (liste, afficher, trouver) et copie de l'exemple d'un modèle
- Partir d'un modèle de vidéo (trouvé d'après le sujet ou nommé), montrer l'exemple d'un modèle
- Un exemple fini par modèle de vidéo, chacun sorti d'une séance creer (récit dans exemple.json)
- Idées de vidéos, avec un exemple par modèle (page, cartes générées, vidéos des exemples, porte d'entrée)

### Corrections

- Test des exemples (import), commentaire de la barre à douze entrées
- Modèle choisi au score (mots forts et faibles), copie d'exemple sans rien écraser et accords donnés, trouver sans modèle en code 0, clés obligatoires, noms fictifs Plannette et Potagine, commande « montre-moi un exemple » écrite en entier, tests du rendu des exemples

## 0.25.0 – 2026-11-08

Galerie animée des mouvements, effets et personnages, page de choix des mouvements

### Nouveautés

- Aperçus de la galerie rendus par le plugin
- Générateur des cartes de la galerie, du catalogue et du lexique
- Galerie des mouvements
- Choisir des mouvements en les regardant, puis les envoyer à Claude
- Retoucher et creer proposent la page de choix quand le mouvement n'a pas de nom

### Corrections

- Démonstrations lisibles en vignette (contenu centré, titre et texte grands)
- Effets et personnages montrés sur un fond sombre
- Mise en page des démonstrations dans un conteneur, la section garde l'affichage réglé par le moteur
- Textes des démonstrations plus grands
- Galerie en pleine largeur, cartes resserrées, barre de navigation à onze entrées
- Page de choix — envoi refusé hors de la page (origine, JSON exigé), réponse finie avant l'arrêt, message d'échec, Ctrl+C nettoie, accessibilité ; démos d'effets sur fond sombre
- Catalogue animé (galerie.js chargé), aperçus au clavier, cadre sans médias, image fixe pendant l'effet, empreintes complètes, README des outils et page creer à jour, tests sans dossiers temporaires laissés
- L'éclat (#014) jaillit du chiffre (data-ancre) au lieu des bords de l'image

## 0.24.0 – 2026-10-23

Dictionnaire de 68 mouvements nommés, 6 transitions, texte brouillé

### Nouveautés

- Classes communes de mouvements pm-m-*
- Transitions whip, poussée, traversée, cercle, volets, retournement
- Texte brouillé lettre par lettre
- Dictionnaire de 68 mouvements numérotés et commande pulse-motion mouvements
- Mouvements nommés dans le déroulé, l'animateur, creer et retoucher

### Corrections

- Recettes caméra mises en page, classes pm-m-* prioritaires sur les entrées des styles, texte brouillé et masque comptés justes au temps de lecture, brouillage caché sous dégradé, contour et halo, recherche tolérante, mouvement visant un élément, mouvements ré-appliqués au changement de style

## 0.23.0 – 2026-10-23

Prise en main : page « En 5 minutes », vidéo d'exemple, site publié sur gh-pages

### Nouveautés

- Nouveaux médias du wiki hors de main, publication sur gh-pages
- Fabrication des médias de la prise en main depuis le plugin

### Corrections

- Lecture du résumé de l'export, capture de l'aperçu avec le GPU, vidéos du wiki à leurs proportions ; captures du tutoriel 1
- Textes fidèles à la vidéo d'exemple, lien de téléchargement dans les légendes, publication refusée hors de main ou avec des liens cassés, ancres et empreintes des médias exactes

## 0.22.2 – 2026-10-17

Visage du touffu et yeux des bâtonnets plus petits, toujours dans la tête à tous les angles ; tutoriel 3 réécrit pour le film de 1 min 40 (trappe, fumée, chute et explosion, drapeau et confettis, pause café, feux d'artifice, sons originaux) avec la vidéo finale

### Nouveautés

- Visage du touffu et yeux des bâtonnets plus petits, toujours dans la tête à tous les angles ; tutoriel 3 réécrit pour le film de 1 min 40 (trappe, fumée, chute et explosion, drapeau et confettis, pause café, feux d'artifice, sons originaux) avec la vidéo finale

## 0.22.1 – 2026-10-16

Bords semi-transparents des particules, début relatif des cordes et tissus

### Nouveautés

- Groupes et files (data-groupe déplié à l'assemblage : écart, décalage, départ commun, variation, actions d'un seul membre) ; tutoriel 3 et scénario : groupes, titre dans la fumée, chute du Touffu sur le pont et explosion (séquence 3 à 17 s, film de 1 min 32), drapeau suisse et confettis à la porte, feux d'artifice à la tape dans la main

### Corrections

- Bords semi-transparents des copies d'images du rendu et de la simulation
- Un effet de structures au data-start relatif dure de son début réel à la fin de la scène
- Groupes dépliés au début de la scène (effets et obstacles voient les membres), groupe imbriqué ou invalide refusé une fois et rendu ordinaire, #groupe vers sa tête, référence à l'enfant d'un seul membre, attributs réécrits sûrement, formes de départ du moteur et tempo absent ; scénario et tutoriel : 4 Touffus jusqu'au pont, tableau de fabrication, drisse du drapeau, exception des confettis

## 0.22.0 – 2026-10-16

Personnages : atteindre, regarder, relais

### Nouveautés

- Atteindre (la main va sur une cible par l'IK, rencontre entre deux personnages), regarder (yeux et tête vers une cible ou la caméra), relais d'un objet tenu ; guidage, page Personnages, tutoriel 3 (gestes attraper, tape-main, lever-les-yeux remplacés)

### Corrections

- Regard caméra selon la vue, pupilles selon l'habillage, cible cachée ignorée, objets tenus rendus avant les personnages, cibles mesurées une fois par instant et avant toute écriture, os en plus sur la pose de base, rencontre symétrique et progressive, IK estompée près de la face, alertes (cible soi-même ou dans un autre conteneur, relais inutile ou trop tard, réglages sans effet) ; consignes et tutoriel

## 0.21.0 – 2026-10-16

Personnages : objets tenus

### Nouveautés

- Objets tenus (un élément de la scène suit la main de son porteur, une ou deux mains, droit ou avec l'avant-bras, puis lâché : reste, cache, tombe) ; guidage, page Personnages, tutoriel 3 et scénario

### Corrections

- Objets tenus au temps de leur conteneur (fenêtre, chute), prise prioritaire sur une animation CSS, styles de placement neutralisés et rendus, data-derriere, deux mains confondues, conteneur au format de l'image, porteur en double et commentaires HTML, mains mémorisées par image ; consignes et tutoriel (enfants animés)

## 0.20.1 – 2026-10-16

Reliquats des particules

### Corrections

- Bords semi-transparents justes (images du navigateur converties en linéaire prémultiplié, pont en sRGB prémultiplié)
- Alerte « fond GLSL entièrement transparent » vérifiée au milieu de la fenêtre du fond, multipasses compris
- Un effet fait uniquement de structures, avec data-start et sans data-dur, dure de son début à la fin de la scène

## 0.20.0 – 2026-10-16

Personnages : hauteur et temps

### Nouveautés

- Hauteur et temps (sol par trajet, sol courbe sur un tracé du décor, glisser, bondir, personnages au temps de leurs conteneurs : arrêt sur image et accéléré)

### Corrections

- Mesure du tracé sans toucher aux transformations du décor (seules caméra et parallaxe neutralisées), remesure au redimensionnement, foulée le long du chemin (colline qui redescend), trajet coupé qui repart du point atteint et vise l'arrivée du coupé, alertes (tracé non mesuré, action pendant un arrêt sur image), attributs inutiles et id en double signalés

## 0.19.1 – 2026-10-16

Documentation : personnages, commandes, tutoriel Vibe Connection

## 0.19.0 – 2026-10-16

Shaders avancés et son réactif

### Nouveautés

- Analyse hors temps réel d'une piste (spectre, onde, bandes, battements, enveloppe et syllabes de la voix), lecture à t
- Pistes brutes et son réactif dans la page (analyse une fois après M.pret, lecture à t, variables CSS, seek qui attend l'analyse)
- Pistes lues par les effets, les shaders et le CSS recensées à l'assemblage (M.donnees.son), contrôles son-sans-piste et piste-inconnue, référence du son réactif
- Modulation par le son et salves au battement ou à la syllabe dans les recettes (capacité réservée, pistes lues), miroir des naissances
- Coefficients du son sur le GPU (naissances éclaircies, salves au son, forces, couleur et taille à τ)
- Tables du son posées sur les effets dans la page (porte de l'analyse, alerte sans battement, piste illisible), référence et tests de page
- Entrées du son (iSon, iFrame, iTimeDelta), texture du son (sonSpectre, sonOnde), piste d'un shader et pistes lues
- Texture et valeurs du son dans les fonds, auras, transitions et post-traitements WGSL
- Shaders GLSL façon Shadertoy : contrôle, assemblage avec les entrées Shadertoy, erreurs du compilateur ramenées au fichier, chargeur .glsl
- Contexte WebGL2 partagé, compilation des shaders GLSL, fonds et auras GLSL copiés dans le calque par un relais
- Transitions et post-traitements GLSL dans la composition (images d'entrée par un canvas pont, sortie recopiée dans la chaîne)
- Déclaration des shaders multipasses (tampons A à D, image, pas par seconde) et moteur d'état sur le planificateur de P1
- Fonds multipasses WGSL (tampons rgba16float en ping-pong, pas fixes de τ, instantanés, taille fixée sur la sortie 1080p)
- Fonds multipasses GLSL (framebuffers RGBA16F, instantanés par blitFramebuffer)
- Bibliothèque multipasse (réaction-diffusion, traînées lumineuses, peinture, automate, ondes en GLSL) et référence des multipasses
- Alerte dans l'aperçu pour un fond GLSL entièrement transparent à sa première image (alpha laissé à 0 d'un shader Shadertoy) ; référence plus visible

### Corrections

- La porte de disponibilité n'attend l'analyse du son que si la vidéo lit le son (l'atelier ne la démarre pas : effets jamais prêts)
- Tampons et instantanés des multipasses libérés quand la scène est masquée ou le fond hors de sa fenêtre, et à la perte du GPU (faces et programmes WebGL2) ; recréés au besoin, même image
- Piste illisible suivie par un shader (fond, transition, post-traitement) ou par des variables CSS : panneau et export refusé (spec P7 §6)
- Transitions et post-traitements GLSL : images d'entrée dé-prémultipliées et pont codé à l'inverse du retour, l'alpha n'est appliqué qu'une fois
- Ondes-glsl sur une eau sombre par défaut (fond de la charte teinté de primaire), réglages teinte, melange et opacite ; dosage du contraste sous un texte

## 0.18.0 – 2026-10-16

Musique calée sur l'image, démarches à soi

### Nouveautés

- La musique se cale sur les scènes (une section par scène, pile au vrai début, humeur par scène, pistes de partition calées sur une scène), tempo de la partition repris par la vidéo, plus de contrainte hors-tempo ni d'arrondi de la voix ; démarches à soi (data-clip sur marcher et courir), mouvement manquant créé par l'animateur

### Corrections

- Grille fixe gardée quand la musique ne suit pas les scènes (fichier, partition continue : hors-tempo, voix arrondie au temps, corrections bloquées), pas de note de durée nulle aux jointures, pistes calées sans « a » valides, tempo de la page toujours renseigné, data-clip sans espaces dans la page, tempo gardé dans la comparaison des styles

## 0.17.0 – 2026-10-16

Milieu sur grille

### Nouveautés

- Bloc « milieu » des recettes (grille, sources, rendu fumée, feu, encre, table du corps noir, milieu-invalide)
- Couplages au milieu (force « milieu », « injecte », structure.milieu, effet.couplage) dans le schéma et le compilateur
- Balise data-milieu (donnees.milieux), deux-milieux, milieu-invalide, couplage-sans-milieu
- Alerte budget-milieu au-delà de 512 cellules sur le grand côté
- Grille du milieu (géométrie, disposition de l'état, uniforme, noyaux WGSL du solveur)
- Milieu sur le GPU (pas de la grille, textures publiées, instantanés) et groupe couplé
- Vent du milieu dans les noyaux (force « milieu », texture de la grille, variantes des pipelines, milieu vide)
- Simulation membre du groupe couplé, dépôts des particules dans le milieu (entiers de 1/65536)
- Cordes et tissus poussés par le milieu selon leur surface exposée (structure.milieu)
- Rendu du milieu (fumée ombrée, feu du corps noir en HDR, encre par absorption, bicubique)
- Milieu dans la page (groupe couplé par scène, dessin dans son calque, libérations, panneaux)
- Milieux air, brasier, eau-encre et effets couplés braises-portees, fusee-panache
- Un effet fait uniquement de cordes et de tissus, sans data-dur, dure jusqu'à la fin de sa scène (allongement par la voix compris, aperçu et panneau Effets) ; référence et tests

### Corrections

- Absorbance d'une encre blanche à 0 et non -0
- Air plus chaud et plus porteur (température 1, flottaison 1,6) : la fumée quitte le bas de la scène en 2 s au lieu de s'y tasser
- Règle de position de data-milieu à part dans base.css (règle des effets et shaders inchangée)
- Un milieu (data-milieu) demande aussi WebGPU à l'export fidèle
- Réglage resolution de air jusqu'à 1024 (borne de la recette) : l'alerte budget-milieu au-delà de 512 devient atteignable
- Les effets ne déposent dans la grille qu'aux pas où le milieu avance (débuts décalés : plus de bouffée au premier pas du milieu, même image par deux chemins) ; test à débuts décalés
- Après la fin d'un milieu (data-dur), les effets couplés qui continuent ne lisent plus de vent (vent nul, même après un retour en arrière) au lieu d'un vent figé ; test et référence
- Eau-encre conforme à sa description : les deux encres, versées l'une au-dessus de l'autre, se rencontrent et se mêlent en 2 à 3 s ; contrôle du mélange dans le test de bibliothèque
- Vérification finale : titre du test de grille sans apostrophe droite, bibliothèque et charte du test des structures sans data-dur, durScene seulement quand la règle s'applique

## 0.16.0 – 2026-10-16

Personnages qui parlent

### Nouveautés

- Synchronisation labiale (action parler : la bouche suit les mots de la voix de la scène, visèmes tirés des lettres, silences gardés ou au repos), guidage et smoke test

### Corrections

- Parler calé sur un mot garde ce mot, finales muettes plus justes (les, une, parlent, bien), le parler actif le plus récent, alertes voix non enregistrée et dessin sans bouche de parole, pas de temps mort pendant que le personnage parle

## 0.15.0 – 2026-10-16

Personnages dans les scènes

### Nouveautés

- Un personnage dans une scène (partition d'actions minutées, marche sans glissement, poses, gestes, rotation, expressions, rendu à chaque image, assemblage et validation)

### Corrections

- Fondus enchaînés sans saut, trajets et rotations qui se chevauchent partent de l'état atteint, marche sur place sans demi-tour, actions sans minutage calées au début, actions hors du conteneur signalées ; trajets, bornes et vues calculés une fois par partition

## 0.14.0 – 2026-10-16

Skills des personnages, découpe d'une illustration

### Nouveautés

- Un skill par action pour les personnages et les ateliers (dessiner-personnage, animer-personnage, atelier-personnages, atelier-particules), cohérence des vues dans la référence de dessin, version affichée par les outils, mise à jour du plugin dans les smoke tests
- Découper un SVG existant (analyse, découpe en pièces « os debout », couleurs en variables, visage vivant, commandes analyser, decouper, renommer-couleur)
- Page de découpe dans l'atelier (formes par os, pivots à glisser, aperçu qui marche, enregistrer), skill decouper-personnage, référence de la découpe

### Corrections

- Découpe sûre (politique de sécurité de la page, attributs on… collés), calques cachés, opacité des groupes, dégradés empruntés, couleurs transparentes, viewBox absent, styles par entités refusés, noms de couleurs et profils copiés gardés d'une découpe à l'autre
- Page de découpe : enregistrement toujours sur la découpe courante, glisser des articulations robuste, liens de l'illustration neutralisés, visage retiré forme par forme, articulations gardées, calque recalé ; smoke test de la découpe

## 0.13.0 – 2026-10-15

Cordes et tissus

### Nouveautés

- Maillage des cordes et tissus (liens, coloration en 12 couleurs sans sommet partagé)
- Bloc « structure » des recettes (cordes et tissus : attaches, réglages, apparence, structure-invalide)
- Perles des cordes et structures liées aux groupes d'interactions (avec), schéma de l'atelier
- Attache-introuvable, ancre-vide des tissus photographiés, alerte budget-structures
- Structures sur le GPU (bloc de paramètres, noyau XPBD par sous-pas et couleurs, attaches)
- Cordes et tissus dans la simulation (pas, instantanés, éléments d'attache), chargés dans la page
- Déchirure des cordes et tissus en fin de sous-pas, indépendante de l'ordre, dans les instantanés
- Contacts des cordes et tissus avec les obstacles de P3 (sommets, centres des cellules)
- Perles des cordes posées sur leurs sommets (guirlandes, fanions), dans les instantanés
- Cordes et tissus liés aux particules de P5a (avec) : corps du groupe, réaction sommée dans l'ordre trié
- Rendu des cordes et tissus (maillage éclairé à deux faces, ruban, dégradé, image, photographie, déchirures)
- Cordes et tissus dans la page (éléments d'attache mesurés, tissu fait de son ancre, raccord)
- Bibliothèque des cordes et tissus (drapeau, bannière, rideau, guirlande, filet, corde)

### Corrections

- Perles d'un tissu refusées par leur message propre (des perles se posent sur une corde) plutôt que « champ inconnu »
- Structures à pleine accélération (Euler symplectique au lieu de la position balistique, qui ne donnait que la moitié de la gravité) ; lien comprimé à la souplesse de flexion (le tissu plan se plie, le drapeau retombe et ondule) ; COMPLIANCE 1e-4 -> 1e-3
- Noyau des structures sous 4 ms pour 16 tissus de 64 × 64 (positions du sous-pas dans un tableau compact, sommet tenu marqué dans ses liens rompus, réglages lus une fois, groupes de travail jusqu'à 1024 fils si l'adaptateur le permet)
- Rideau qui s'ouvre par un trou en son centre (répulseur resserré, tirage vers les côtés) ; l'ancien répulseur le froissait vers le haut puis le déchirait en lanières
- Pose initiale des cordes et tissus, attaches #id sans étirement, compression résistée, repli à 256 fils
- Rideau ouvert par ses attaches (deux moitiés du bord haut qui s'écartent), gravité seule : ses morceaux pendent ou tombent, sans être projetés ni remonter
- Rideau fendu en son milieu (structure.fente) : liens qui traversent la couture rompus dès le pas 0, il s'ouvre jusqu'en bas sans nœud papillon

## 0.12.0 – 2026-10-15

Atelier des personnages dessinés

### Nouveautés

- Édition des bouches et expressions (pose et clés)
- Atelier avec les personnages dessinés (habillage, sourcils, expression et bouche)

### Corrections

- Retirer un choix hors d'une clé est refusé sans perdre « Rétablir », clé seule jamais vide, bouches propres au dessin proposées

## 0.11.0 – 2026-10-15

Personnages dessinés : habillage en pièces et visage

### Nouveautés

- Habillage en pièces (vues, miroir, raccourcissement, accessoires) et visage complet
- Touffu, le LemStick en pièces avec visage complet
- Planche d'un personnage dessiné et planche de son visage

### Corrections

- Pied visible de face et de dos, mains toujours présentes, habillage recréable sur le même groupe, yeuxY, os en plus qui suivent leur parent, blanc de l'œil sans groupe, référence des demi-axes de la tête

## 0.10.0 – 2026-10-15

Format des personnages dessinés

### Nouveautés

- Filtrage du SVG des personnages dessinés (liste blanche)
- Types dessin et expression, bouche et expression dans les poses et les clés
- Pistes discrètes bouche et expression, expressions résolues dans la pose
- Six expressions livrées, liste et affichage des dessins et expressions

### Corrections

- Messages des vues sans espace en trop, tests alignés sur l'ordre du squelette et le nouveau message des clés
- Filtre SVG sans entités ni échappements (url( encodé refusé), dessins de l'œil obligatoirement en texte

## 0.9.0 – 2026-10-15

Atelier des personnages

### Nouveautés

- Modèle d'édition de l'atelier (clés, gestes, annulation)
- Routes de l'atelier dans l'aperçu (contexte, enregistrement, historique)
- Page de l'atelier (poser à la souris, IK, curseurs, frise, bibliothèque, enregistrer)
- Commande de l'atelier, référence, guidage de retoucher et smoke test

### Corrections

- Frise qui garde la capture pendant un glissement, geste d'un curseur fermé au relâchement, pas d'annulation seulement si une propriété change, miroir retiré signalé

## 0.8.0 – 2026-10-15

Habillage et planche des personnages

### Nouveautés

- Habillage bâtonnets (traits, tête, yeux, touffe, os en plus, profondeur)
- Planche PNG d'un clip ou d'une pose sous plusieurs angles

### Corrections

- Mains sur les hanches (avant-bras repliés vers le bassin)
- Yeux réordonnés seulement quand leur place change, dossier de planche toujours nettoyé, noms hérités refusés, option sans valeur refusée

## 0.7.0 – 2026-10-15

Clips et bibliothèque des personnages

### Nouveautés

- Lecture des clips (pistes par angle, boucle, miroir, pieds au sol, additif)
- Lecture, validation et écriture stable des poses, clips et gabarits
- Bibliothèque de base (poses, clips de marche, course, saut, accroupi, coucou, peur, repos, calques additifs, gabarits)
- Commande pulse-motion personnages (liste, afficher, verifier)

### Corrections

- Coucou au bras levé tout le salut, clip additif sans pose citée, clip ponctuel de durée non nulle, validation des nombres tels qu'écrits

## 0.6.0 – 2026-10-15

Noyau du squelette des personnages

### Nouveautés

- Noyau du squelette 2.5D (pose, gabarit, contraintes, projection, profondeur, sol)
- IK à deux os (bras et jambes) dans le plan sagittal
- Os en plus et balancement déterministe

### Corrections

- IK sur la géométrie complète (Newton, angles bornés), balancement sans saut ni dépendance à l'échelle ou à la vue, pose au sol exacte, noms d'os réservés

## 0.5.0 – 2026-10-15

Voisinage des particules

### Nouveautés

- Bloc « interactions » des recettes (essaim, fluide, grains), règle interactions-invalides
- Groupes d'émetteurs liés par « avec », règles croisées des interactions
- Rendu « fluide » dans les recettes (teinte, opacité, absorption, réfraction, lissage)
- Alerte budget-interactions par émetteur (essaim, fluide, grains)
- Module de voisinage (grille, comptage entier, somme préfixe, tri stable par cellule)
- Groupes de voisinage exécutés à chaque pas de la simulation
- Essaims de Reynolds, rendu aux particules avec arrêt aux obstacles et fuite
- Fluides PBF (incompressibilité, tension, viscosité XSPH) sur le voisinage trié
- Grains PBD (contacts, frottement, cohésion, rebond) et mise au repos des tas
- Rendu « fluide » (sphères, flou bilatéral, nappe ombrée dans la cible HDR)
- Photographies de scène dans le rendu, réfraction des fluides
- Photographie de réfraction des fluides (aperçu, seek exact à l'export, alerte)
- Bibliothèque des interactions (nuée, banc, lucioles, eau, miel, sable, neige lourde)

### Corrections

- Collisions, reste du pas après un rebond arrêté au second obstacle (coin d'une cuve : plus de fuite à travers le sol)
- Solveurs du voisinage réglés sur les critères physiques
- Collisions, second contact cherché sur les obstacles à τ1 (barre en rotation qui se rattrapait elle-même)
- Solveurs du voisinage parcourus dans l'ordre des cellules (fluide 60 000 : 10,7 -> 4,7 ms par image)
- Interactions, largeur du format déclaré et mesures arrondies (même simulation dans l'export rapide et l'export fidèle)
- Formes exactes, contact compté seulement si le segment s'enfonce (glissement rétabli après un rebond, dans les collisions et la correction du voisinage)
- Cellules de voisinage pleines signalées (grains trop petits pour leur rayon refusés, alerte budget-interactions au-delà de 48 par cellule)
- Photographies de réfraction libérées quand la scène n'en a plus besoin (masquée, en échec, effet libéré)
- Grains mis au repos sous 2 cqh/s (tas moins raide), dépression du fluide seulement entourée de 3 voisines ; tas sur deux graines, amas qui s'étale à l'impact
- Formes exactes, distance hors de la boîte √(b² + champ²) (grains posés sur le haut de la boîte), grains sans frottement statique jamais mis au repos ; test de glissement sur un disque tramé à 256 px

## 0.4.0 – 2026-10-14

Shaders

### Nouveautés

- Contrôle d'un shader et valeurs de ses réglages (module pur)
- Uniformes, prélude, assemblage du code et erreurs situées dans le fichier
- Modules WGSL des recettes (noms préfixés, réglages hérités, voie rapide quittée)
- Fichiers de shaders (projet puis bibliothèque) et balises data-shader à l'assemblage
- Transition par shader et post-traitements dans le déroulé
- Durée d'une transition par shader, repli en fondu, data-shader minuté
- Fonds, transitions et post-traitements embarqués dans la page assemblée
- Modules WGSL des recettes attachés à l'assemblage (sources gardées pour l'atelier)
- Compilation des shaders sur le GPU, erreurs situées dans le fichier, prélude partagé avec les particules
- Fonds par shader dans la passe HDR d'un calque, avant les particules
- Fonds et auras dessinés dans les calques (fenêtre minutée, repère de l'ancre mesuré à t)
- Shader qui ne compile pas : panneau situé et export refusé ; réglages d'un fond depuis l'atelier
- Plan de composition en fonction de t (transition par shader, post-traitements)
- Photographie d'une scène pour la composition, état de lecture, canvas de composition
- Chaîne de composition sur le GPU (post-traitements, transition ou empilement, sRGB)
- Transitions et post-traitements composés au-dessus des scènes (photographies, cadence, seek exact, capture, repli)
- Module de force WGSL dans le pas de la simulation (variantes mises en cache par empreinte)
- Modules de couleur et de forme dans le rendu des particules ; vérification des modules
- Modules vérifiés au démarrage et dans l'atelier (effet désactivé, export refusé)
- Bibliothèque, fonds et auras (nébuleuse, plasma, dégradé vivant, grille néon, rayons, halo, énergie)
- Bibliothèque, transitions (dissolution, ondulation, pixels, glitch, balayage organique) et post-traitements (grain, vignettage, aberration, chaleur)
- Bibliothèque, modules de particules (spirale, couleur selon la vitesse, étoile)
- Routes de l'atelier pour les fonds par shader (description, réglages écrits, sources)
- Fonds par shader réglés dans le panneau de l'atelier (sans rechargement, enregistrés dans la scène)
- Recettes à modules WGSL recompilées dans l'atelier (sources de la page ou de l'aperçu)
- Pulse-motion controler --gpu compile chaque shader et module dans Chrome sans fenêtre

### Corrections

- Photographies des scènes de la composition renommées (masquaient celles des fragments)
- Export rapide : le canvas de composition, enfant direct de la scène, figé en image
- Export : Chrome garde le GPU aussi pour un fond, une transition ou un post-traitement par shader
- Export fidèle : images comparées par moyennes de blocs (le grain lissé par l'encodage ne fait plus échouer la vérification)
- Grain ajouté en sRGB, pondéré sur la luminance perceptuelle, sans éclaircir les noirs (force 0,06 par défaut)
- Aperçu : fondu CSS d'attente au début d'une transition par shader tant que la composition n'est pas affichée (plus de coupe sèche)
- Bruitages : un son pour les transitions par shader (propre à chaque shader de la bibliothèque, souffle sinon), dans la page et au contrôle
- Entrée de la première scène : la durée de sa transition (shader compris), comme dans la vidéo, pour les temps morts et les mesures
- Durée d'une transition par shader plafonnée par celles de la scène qui entre et de la scène qui sort (deroule-invalide)
- Trop-d-animations : les fonds et auras par shader (data-shader) ne comptent plus comme des éléments qui bougent
- Entrée de la première scène sans transition alignée sur les mesures (durée nulle)

## 0.3.0 – 2026-10-14

Fragmentation des particules

### Nouveautés

- Recettes de fragmentation (forme pixels, couleur source, éclats, cible, tons neutres)
- Fragments.js (pixels opaques, pas premier, Hilbert, appariement, capacités, raccords)
- Pavage de Voronoï par demi-plans et éclats (fragments.js)
- Data-cible et contrôles de fragmentation à l'assemblage (cible-introuvable, metamorphose-sans-cible, ancre-vide)
- Simulation des fragments : naissance sur les pixels de l'élément, tenue et libération étalée
- Éclats en corps rigides (impulsion depuis l'impact, rotation au contact, photographie en texture)
- Arrivée guidée sur une cible (rattrapage critique, pose exacte, extinction au pas de l'arrivée)
- Arrivée chorégraphiée (trajet fonction de τ, voie rapide sans état)
- Rendu des fragments (couleur des pixels, de A vers B, fondus, texture pixel, tons neutres)
- Éclats dessinés en polygones texturés par la photographie de l'ancre
- Photographie RVBA d'un élément seul et boîte de mise en page
- Photographies des éléments et données des fragments dans la page (pixels, Hilbert, éclats, repères)
- Raccords des éléments selon t et contrôle des photographies (ancre-vide, photographie-trop-grande)
- Briser, desintegrer, assembler, metamorphose dans la bibliothèque

### Corrections

- Arrivée au premier pas acceptée avec un sous-émetteur (vie minimale comparée à l'arrondi près)
- Voie rapide des fragments : repères de l'ancre envoyés de 0 à τ (grains libérés entre les deux posés à leur place)
- Fragmentation sur la boîte opaque de l'élément (contenu visible), pas sur sa boîte de mise en page
- Raccords des fragments posés dans la page de contrôle, même sans GPU
- Pause finale négative : message qui nomme l'effet coupé par la fin de la vidéo

## 0.2.0 – 2026-10-14

Atelier et collisions des particules

### Nouveautés

- Lecture des scènes sans navigateur
- Contrôles automatiques sans navigateur
- Débordements relevés dans la page d'aperçu
- Historique des retouches et annulation
- État du projet et étape suivante
- Rappel de la vidéo en cours au démarrage de session
- Style clair-pedagogique et ses 8 scènes toutes faites
- Références pour Claude et outil pulse-motion
- Skills creer, retoucher, reprendre et agent animateur
- Projet de référence « La chaîne du froid »
- Update .gitignore to refine directory exclusions
- Capture de l'image courante dans un canvas
- Export MP4 dans le navigateur et routes de l'aperçu
- Export MP4 et planche en ligne de commande
- Commandes pulse-motion exporter et planche
- Skill exporter, planche du parcours accompagné
- Contrat commun des styles et identité de clair-pedagogique
- Styles personnels et recommandation de styles par genre
- Type des scènes et adaptation d'une scène toute faite
- Changer le style d'une vidéo, annulable
- Planche comparative des styles sur le déroulé
- Lexique de la personne (mots de l'outil expliqués une fois)
- Style choisi avec le déroulé, changement de style, lexique
- Couleurs OKLab/OKLCH et ajustement du contraste
- Couleurs dominantes d'un logo SVG ou PNG
- Lecture des polices TTF, OTF, WOFF, WOFF2 (licence, caractères)
- Charte finale en quatre étages, ton clair ou sombre, couleurs lisibles
- Chartes enregistrées, appliquées et couleurs depuis le logo
- Pulse-motion police, depuis Bunny Fonts ou un fichier fourni
- Glossaire du métier et alertes du contrôle
- Charte, polices et glossaire dans le parcours
- Transitions rideau, zoom, coupe ; identité à deux tons complète
- Banc d'essai des styles ; clair-pedagogique en ton sombre, carré et vertical
- Style editorial
- Style energique
- Style tech-sombre
- Style chaleureux
- Style minimal
- Expressions des recettes sans eval
- Recettes, héritage, réglages et couleurs
- Compilation des recettes et capacités
- Effets posés dans les scènes et compilés dans la page
- Contrôles des effets et historique de effets/
- Rendu d'une scène seule et attente des calques au seek
- Instantanés, naissances calculées et forme close
- Simulation WebGPU reproductible et voie rapide
- Calques dans la page, rendu minimal, reprise après perte du GPU
- Courbe de tons douce ou ACES par calque
- Historique des traînées, inclus dans les instantanés
- Rendu AAA – types, textures, tri, flou, bloom, tons
- Calques dans l'export MP4, refus clair sans WebGPU
- Bibliothèque de 12 effets
- Étincelles sur le chiffre clé de « La chaîne du froid »
- Projet d'essai et vérification du rendu d'un style dans le plugin
- Pulse-motion style nouveau, verifier et planche
- /pulse-motion:style, création guidée d'un style personnel
- Tempo du déroulé et unité t (temps musical)
- Texte lettre par lettre ou mot par mot (data-lettres, data-mots), dégradé et contour de texte (pm-degrade, pm-contour)
- Caméra (zoom, cadrage, rotation, secousse, saturation, flou), parallaxe, temps figé et accéléré (data-gel, data-vitesse)
- 4:5 (1080 × 1350)
- Typographie française d'un texte (corrections sûres, mots doublés, termes variables)
- Typographie, majuscules accentuées, mots doublés et termes variables contrôlés
- Animations simultanées ; corrections de durée proposées (lecture, pause finale, temps mort de fin)
- Corrections sûres appliquées par le contrôle (copie d'historique, liste des corrections, --sans-correction)
- Mesures de la vidéo rendue (chevauchements, cadre, marges, zone des boutons, logo, textes fugaces, mouvements rapides)
- La vidéo rendue est contrôlée à chaque controler (Chrome sans fenêtre, --sans-rendu, renduVerifie)
- Banc d'essai des styles étendu aux mesures du rendu ; styles livrés sans alerte (9:16 compacté, marges élargies)
- Page de contrôle ouverte en temps réel (serveur local, résultats par POST) pour les mesures asynchrones
- Contraste réel des textes sur leur fond, lu aux pixels des lettres ; couleurs lisibles avec une marge
- Flashs dangereux (plus de 3 par seconde sur un quart de l'image) signalés en erreur
- Ajustements de taille d'un texte (déroulé, assemblage, moteur, retirés au changement de style)
- Un texte qui déborde est réduit seul (jusqu'à 80 %), sinon conseil de le raccourcir
- Client DevTools par tuyau (page à taille exacte, évaluation, capture PNG)
- Ffmpeg trouvé (variable, PATH, winget, scoop, Homebrew, apt), version vérifiée, commande pulse-motion ffmpeg
- Capture fidèle d'un instant (vraie capture d'écran à la taille exacte)
- Ffmpeg encode un segment depuis des PNG, assemble sans réencodage, sonde et compare les images
- Export fidèle en segments repris, assemblé et vérifié (vidéo sans son)
- Piste son normalisée (−16 LUFS), volume, fondus, durée exacte, ajoutée sans réencodage
- Son de la musique dans l'export fidèle, deux navigateurs en parallèle
- Pulse-motion exporter passe par l'export fidèle quand ffmpeg est là (--rapide, --qualite, --ips)
- Add permissions configuration for export processes
- WAV PCM lu et écrit par le moteur (16 bits, flottant 32 bits, base64)
- Sonie BS.1770 et normalisation à −16 LUFS avec limiteur, dans le moteur
- Courbes du mixage (groupes de parole, ducking, fondus)
- Mixage unique dans la page (M.rendreSon) : musique, voix, ducking, −16 LUFS ; sources embarquées en blocs
- Le lecteur joue le son mixé (AudioContext calé sur t, son en préparation)
- L'export dans le navigateur encode le mixage de la page
- Export fidèle avec le mixage de la page (WAV par CDP, AAC sans retouche, sonie vérifiée), images reprises quand seul le son change
- Traitement d'une prise (mono, passe-haut 80 Hz, silences rognés, crête −3 dBFS)
- Mots du texte dit (formes normalisées) et calage approché sur la prise
- La voix allonge sa scène ; ancres data-start « mot: » calées sur les mots dits
- Champs voix du déroulé validés (texte, prise, début, voix provisoire, volume)
- Prises du projet (traitées, mots calés à côté, Opus), voix provisoire rangée à part
- La voix des scènes embarquée dans la page (Opus ou WAV), mots dans les données ; alertes voix provisoire, calage approché, page lourde
- Le contrôle minute avec la voix (scène allongée signalée, ancres vérifiées, durée jamais corrigée sous la voix)
- Pulse-motion voix importer (WAV, ou tout format avec ffmpeg) et voix provisoire du système
- Les exports refusent la voix provisoire (--avec-provisoire pour passer outre)
- Mots du script calés sur une transcription (distance d'édition, nombres, interpolation), découpe d'un enregistrement en scènes
- Décalage du rognage connu ; une prise peut être écrite avec ses mots transcrits
- Whisper par un petit script Python (faster-whisper), état de l'installation, transcription avec délai
- Pulse-motion whisper (état) et whisper installer (environnement isolé, faster-whisper, modèle) ; son lu sans PyAV
- Prises transcrites à l'import et par pulse-motion voix transcrire (calage approché si la transcription échoue)
- Un enregistrement de toute la vidéo découpé en une prise par scène (coupe dans les silences, scènes douteuses signalées)
- Découpage en cartons lisibles (lignes, ponctuation, articles, débit) et fichiers SRT/VTT
- Champ sousTitres, cartons transmis à la page, fichiers SRT et VTT écrits à l'assemblage
- Dessinés dans la vidéo (modes ligne et mot, en bas ou en haut, habillage par variables)
- Contrôlés comme les textes (texte de scène caché, zones des réseaux, contraste aux pixels)
- Routes de l'aperçu pour les prises (liste des scènes, réception d'une prise, transcription en fond)
- La lecture sait couper son son (enregistrement au micro sans la musique)
- Enregistrer sa voix dans l'aperçu (prompteur, compte à rebours, vumètre, réécoute, garder ou refaire)
- Pulse-motion voix studio <scène> ouvre l'aperçu sur le studio
- Catalogue et partition (notes, accords, silences, frappes, validation, évènements)
- Six ambiances qui écrivent une partition (structure calée sur les scènes, variantes par la graine)
- Musique générée ou partition dans le déroulé, partition validée transmise à la page, tempo de l'ambiance
- Instruments Web Audio ; la musique générée ou la partition jouée dans le mixage (fondus, ducking, sonie)
- Douze bruitages (data-son sur les éléments, transitions, fichiers importés) dans le mixage
- Sons contrôlés (inconnu, trop serrés, son fort sous la voix)
- Pulse-motion musique ecouter ; documentation de la musique générée, des partitions et des bruitages
- Référence audio
- Creer pose la question du son
- Animateur, retoucher et exporter guident le son
- La chaîne du froid avec voix, sous-titres, musique et bruitages
- État de l'ordinateur en une commande, musique ouverte après fabrication
- Skills outils et voix
- Skills du quotidien en langage courant, retoucher et reprendre élargis
- Schéma déclaratif du format des recettes (types, bornes, défauts, libellés)
- Champs hors du schéma refusés, chemin du champ sur chaque erreur de recette
- Differences entre deux recettes (inverse de fusionner, émetteurs par nom)
- Repérage et réécriture des balises data-effet sans toucher au reste de la scène
- Routes de lecture (contexte, recettes, effets des scènes, textures) branchées dans l'aperçu
- Enregistrer les réglages d'un effet dans la scène (historique, conflit, écriture atomique)
- Enregistrer une recette dérivée par etend et y faire pointer l'effet, sans rien laisser à moitié
- RemplacerEffet, decrire et raison pour le réglage en direct d'un effet
- Boucle posée par l'atelier, clavier laissé au panneau, rechargement retenu pendant un réglage
- Éditeur de recette généré depuis le schéma, réglages exposés en curseurs
- Panneau « Effets » de l'aperçu – réglage en direct, enregistrements, réouverture après rechargement
- Page d'atelier servie par l'aperçu, avec le moteur des vidéos
- Page d'atelier – un effet seul en boucle, fond, ancre à la souris, enregistrement dans le projet
- Commande pulse-motion atelier [<recette>]
- Collisions dans le schéma des recettes et leur compilation
- Sous-émetteur a_la_collision, un seul parent, capacité selon les impacts
- Lecture des déclarations d'obstacles (scène et déroulé)
- Obstacles des scènes et du déroulé dans la page, contrôles des collisions
- Repères et table des obstacles d'un effet
- Noyau de collisions (test balayé, rebond, pose, mort, impacts) dans la simulation
- Fondu des particules posées dans le rendu
- Repères des obstacles mesurés dans la page (transformations composées)
- Obstacles de la page branchés sur la simulation (table, repères sur la grille, scènes voisines)
- Champs de distance des formes exactes par Jump Flooding sur le GPU
- Collisions avec les formes exactes (marche dans le champ de distance)
- Formes exactes dans la page (masques à l'état final, alerte de masque vide)
- Profils d'empilement dans la table des obstacles
- Empilement (couche, sommes entières atomiques, relaxation au talus)
- Couche commune des obstacles de la vidéo (contributions des effets terminés)
- Collisions des confettis, de la pluie (éclaboussures), de la neige et des étincelles
- Sol et boîte d'essai pour régler les collisions
- Alerte obstacle-forme-vide (forme exacte effacée à la fin de son minutage) dans le contrôle de la vidéo rendue ; panneau d'alerte des effets masqué en capture

### Corrections

- Corrections de la revue finale du plan 2
- Corrections de la revue finale du plan 3
- Corrections de la revue finale du plan 1 du catalogue
- Corrections de la revue finale du plan 2 du catalogue
- Corrections de la revue finale du plan 3 du catalogue
- Générations d'enfants, réglages protégés, plafond de capacité, validations de forme
- Aléa propre à chaque scène rendue, dépend de t et de la scène
- Développements limités de balistique au seuil 0,1, ordre 5
- Banc WebGPU, échappement de DONNEES, lancement et nettoyage robustes
- Erreur de rendu isolée par scène, tests de régression du hasard et des pages sans effet
- Rendu après page prête, libération GPU, seek pendant perte du GPU, tests de déterminisme dans la fenêtre de l'effet
- Libération des tampons de rendu, courbe de tons sans bloom, ressources de la cible, images illisibles
- Bloom à portée fixe et normalisé, flou opaque, mélange prémultiplié, export sans dégradation silencieuse
- Neige traverse l'image et part remplie, effectifs par défaut d'énergie et de pluie, tests de la bibliothèque
- Melange rangé dans le rendu des émetteurs, plage usuelle du bloom, gravité de l'exemple restée réglable
- Zone d'effet placable, etincelles teintees, poussiere continue, temps morts des effets, consignes de dosage alignees
- Corrections de la revue finale du plan 4 du catalogue
- Rangées corrigées à la main gardées ; titres en capitales sans alerte de casse
- Point de liste retiré sans casser le minutage ; textes restants recasés ; coupe sans entrée
- Logos et polices abîmés en français, PNG 1-4 bits, téléchargements Bunny vérifiés, italiques, remplacement nommé
- Charte de projet invalide refusée, ancienne charte gardée en cas d'échec, alerte ton-indisponible, police et glossaire annulables
- Italique de Fraunces livré (URL Bunny en 400i), chapeau lisible en ton sombre, grand guillemet visible dans tous les formats
- Planche en vraies phrases (--textes maximum pour le pire cas), format et ton validés, dossier des essais en erreur expliqué, modèle repris noté une fois, --genre sans valeur
- Type d'une scène ajoutée précisé dans retoucher ; dossiers temporaires des tests supprimés en fin de processus ; aucun style partiel après un échec
- Charte enregistrée malgré une ancienne version verrouillée, décalages des débuts gardés, police déjà installée préservée, historique sans copie vide, polices variables, barres échappées lues, aide des options de police
- Retours à la ligne gardés en lettres, point visé négatif de la caméra, débordements sans faux signalements, effets en temps musicaux, tempo sans juger la première scène, gel sur la section et caméra refusée sur la section
- Ponctuation enchaînée stable, entités HTML décodées, temps mort ramené sous le seuil, guillemets et « L » laissés, répétitions de l'oral, messages de correction lisibles, copie d'historique sûre
- Entrée de la première scène, logo jugé selon l'empilement et data-superpose, marqueurs de décor documentés et rappelés, zone des boutons : raccourcir, marge basse en 9:16 seulement, noms et messages plus clairs
- Flashs examinés image par image (6 et 10 Hz vus), forme des lettres indépendante de leur couleur, fond uni jugé hors charte, ombre et contour, transparence, serveur local à jeton, marques déjà lisibles gardées, styles : couleur sur teinte
- Taille écrite dans la scène gardée, texte à taille animée jamais ajusté, taille suivie au redimensionnement, ajustement seulement sur un débordement signalé, clés propres, messages et référence complétés
- Aller() jamais suspendu, lecteur du tuyau linéaire et sûr, erreurs texte, fermeture bornée ; ffmpeg : versions git, le plus récent gagne, commande sûre séparée, PATH relatif ignoré
- Segments vérifiés sur une image (repris ou produits), segment fautif retiré, ffmpeg attendu avant rejet, vidéo verrouillée expliquée, annulation pendant l'assemblage, CLI sans exception
- Toutes les images gardées avec la musique (sans -shortest), Ctrl+C range l'export fidèle, installations limitées aux commandes exactes (sudo laissé à la personne), fondus des vidéos courtes, musique introuvable
- Le volume de la musique compte (référence de sonie à plein volume), « son en préparation » effacé sans son, sonie non vérifiée sous 0,4 s, musique non embarquable signalée, musique muette testée
- WAV 24 bits importé par ffmpeg (sans copie d'historique sur un échec), voix hors du projet signalée, informations hors du bandeau, bouton MP4 qui refuse la voix provisoire (accord transmis par la ligne de commande)
- Un mot à trait d'union entendu en morceaux est calé du premier au dernier
- Une prise qui ne dit plus son texte n'est pas déclarée transcrite ; un enregistrement presque pas reconnu est refusé, et une scène absente de l'enregistrement garde sa prise
- Sous-titres en 9:16 contenus et à l'écart des boutons (contrôlés : marge, zone droite), phrases courtes regroupées, pas de ligne orpheline, guillemets et tirets gardés, écart entre scènes, fichiers SRT/VTT réécrits à l'export fidèle
- Une prise non gardée bloque le rechargement de l'aperçu (studio et export distincts), boutons du studio selon la phase (double enregistrement, prise d'une autre scène, double « Garder » refusés)
- Musique générée dans le contrôle et l'export fidèle, rendu linéaire, accord final audible, montée calée sur la frontière
- Pas de rendu du son dans la page du contrôle, sous-titres masqués pendant la détection des flashs
- Consignes du son exactes (import relancé après la transcription, repli, place du tempo), test de bout en bout avec une vraie prise
- Limiteur sans copie inutile, page de capture sans son préparé d'avance, son bloqué signalé et repris au clic, geste CDP sur demande, empreinte des images sans les volumes
- Texte de la voix système par fichier, voix macOS de repli, vraies prises gardées, allongement calé sur le tempo décalé, délais sur la durée réelle, texte changé signalé, transcription plus sûre (modèle en argument, Python ancien, venv, WAV flottant, progression), nombres en plusieurs mots
- Espaces insécables gardées, VTT échappé, logo caché par un carton signalé, carton trop court signalé, message de contraste des sous-titres
- Échec de transcription signalé, ancienne prise jamais écrite sur la nouvelle, transcriptions en file, Whisper et ffmpeg redétectés, prise vide refusée, messages du micro en français, adresse et clavier
- Partitions mal formées signalées, « x » réservé aux percussions, basse sur la fondamentale, sub en tech et entraînant, son importé fort sous la voix, sons importés avec apostrophe embarqués une fois, fondu des bruitages
- Sous-titres sans voix, arrêt avant export, retouches du son, crête et largeur des sous-titres documentées, sous-commandes vérifiées, exemple d'une minute
- Clic de déblocage du son sans pause, prise de souffle refusée, retouche de typographie sans conseil de réenregistrer, insécable après le guillemet ouvrant
- Aperçu rouvert sans second serveur, musique écoutable sans voix, import de la voix sans copie, renvois et en-têtes corrigés, smoke tests sans attente fausse
- Les réglages refusés par le compilateur ne sont plus écrits dans la scène (422)
- Dossier temporaire fixe hors projet ; lireEtat et lireOrdre cherchent par ordre
- Bornes d'intervalle, booléen explicite, génération des compilations, panneau sans Nom/Hérite de, Enregistrer refusé sur erreur
- Hors de la boîte d'une forme exacte, la distance tient compte du champ (les particules se posaient sur la boîte)
- Pas de décalage de perspective (z) pour les émetteurs à collisions : la neige posée s'affichait à côté du titre et du sol
- Masque d'un élément en ligne mesuré par sa boîte de mise en page (getBoundingClientRect, transformations neutralisées) au lieu de offsetWidth arrondi
- Jamais d'interpolation vers un repère inactif ; effets antérieurs = commencés avant (transitions) ; places réservées aux obstacles de la vidéo dans la table et les profils, abandons comptés
- Mesures des scènes masquées (hauteur des formes, largeur de l'image), repère inactif qui libère les particules posées, couche héritée prise au début de l'effet suivant et dessinée, enfant de collision inerte sans obstacle, alertes de limites et de masque vide, échec après changement de polices rattrapé

## 0.1.0 – 2026-10-11

Plan 1 du socle (moteur, page autonome, aperçu)

### Nouveautés

- Courbes d'animation (portage de BZAnimationTool)
- Interpolation data-tween et nombres en français
- Minutage des scènes et transitions d'entrée
- Validation de deroule.json
- Préparation des scènes et embarquement des fichiers
- Horloge déterministe, lecteur et mise en page
- Assemblage de la page autonome
- Aperçu local avec rechargement à la même position

### Corrections

- Corrections de la revue finale du plan 1
