# Demandes particulières

Lu à la demande par `/pulse-motion:creer` (ce que sait faire Pulse Motion, les modèles de vidéo, les mouvements nommés, les personnages) et par `/pulse-motion:retoucher` (les mouvements nommés). Rien de ce qui suit n'écrit dans le dossier, sauf l'exemple d'un modèle, sur demande expresse.

## Que sait faire Pulse Motion ?

Répondre en quelques lignes, en mots simples, sans rien écrire dans le dossier :
- une vidéo de motion design (formation, présentation d'un produit, histoire, publication pour les réseaux), fabriquée sur l'ordinateur, sans compte en ligne ;
- quelques questions (durée, public, son), puis un déroulé à valider, puis la vidéo dans le navigateur ;
- la voix de la personne, une musique composée pour la vidéo, des sous-titres, son logo et ses couleurs ;
- ensuite, des retouches en une phrase et un MP4 pour le web, les réseaux, une présentation ;
- des modèles de départ (`pulse-motion modeles liste`, présentés par leur nom et leur description).

Puis le menu d'entrée.

## Menu d'entrée

Sans sujet (« fais-moi une vidéo », « que sait faire Pulse Motion ? »), **une seule question**, sans rien écrire dans le dossier : « Que voulez-vous faire ? »
- « Une vidéo à partir de mon idée (Recommandé) » : demander le sujet en une phrase (« Sur quoi porte votre vidéo ? »), puis la première ronde ;
- « Partir d'un modèle de vidéo » : `pulse-motion modeles liste`, présentés par leur nom et leur description, en une question ; le modèle choisi sert comme un modèle trouvé (`pulse-motion modeles afficher <id>`), puis demander le sujet ;
- « Voir un exemple d'abord » : le modèle à montrer, en une question, puis `pulse-motion modeles apercu <id>` en arrière-plan (l'exemple s'ouvre dans le navigateur depuis un dossier temporaire ; rien n'est écrit ici) ; ensuite, demander le sujet ;
- « Une vidéo dans un de mes styles » si `pulse-motion styles` liste un style `personnel` (choisi en une question, il devient le style recommandé ; puis demander le sujet), sinon « Créer mon propre style » (`/pulse-motion:style`).

La réponse libre reste possible : une phrase qui dit un sujet (« une vidéo sur la chaîne du froid ») est le sujet, et la création continue.

## Modèles

- « Quels modèles ? » : `pulse-motion modeles liste`, présentés en mots simples (nom et description), sans identifiant technique.
- « Montre-moi un exemple de pitch » : pour seulement le regarder, `pulse-motion modeles apercu <id>` en arrière-plan (rien n'est écrit ici) ; pour le garder et le modifier, `pulse-motion modeles exemple <id> .` copie l'exemple fini du modèle dans le dossier, s'il n'y a pas encore de vidéo ici (refus : proposer un autre dossier, rien n'est écrasé) ; puis `pulse-motion apercu . --ouvrir` en arrière-plan, et proposer de le modifier avec `/pulse-motion:retoucher` ou de repartir de zéro dans un autre dossier.

## Mouvements nommés

Quand la personne cite un mouvement ou un numéro du dictionnaire (« avec un pop-in sur les titres », « #006 pour le titre »), l'écrire dans `scenes[].mouvements` des scènes concernées (`"mouvements": ["#001"]`, ou `{ "mouvement": "#001", "element": "logo" }` s'il ne vise pas le titre) ; une transition nommée (« whip pan entre les scènes ») va dans `transition` de la scène qui entre (`pulse-motion mouvements afficher <nom>` donne la valeur). Retouche d'une scène écrite : appliquer la recette du mouvement dans le fichier de la scène, sur l'élément visé, en retirant sa classe d'entrée du style (`entre-bas`, `tombe`…), puis l'ajouter à `scenes[].mouvements`. Faire vivre le décor (« fais vivre la plante », « une flamme qui danse », « des engrenages qui tournent ») : catégorie `vie` (#069 à #080), sur l'élément du décor visé. Une composition (« un bandeau de logos clients », « montre l'avant/après », « un mur de vignettes ») : catégorie `compositions` (#087 à #093) ; un bouton qui s'enfonce, un graphique qui se trace, un logo qui bat sur la musique, un zoom qui plonge : #081 à #086. Ne jamais proposer de liste de mouvements sans qu'on la demande ; « quels mouvements existent ? » : `pulse-motion mouvements liste`, résumé par catégorie en mots simples, avec deux ou trois exemples par catégorie. La personne ne sait pas nommer le mouvement (« un truc qui claque pour le titre », « montre-moi les mouvements ») : lancer `pulse-motion mouvements choisir --ouvrir` **en arrière-plan** (avec `--categorie entrees`, `texte`, `valeur`, `transitions`, `camera`, `vie`, `compositions`… si la demande le dit), dire en une phrase « Une page s'ouvre : cochez les mouvements qui vous plaisent, puis cliquez sur « Envoyer à Claude ». », attendre la fin de la commande, puis appliquer les `choix` (leur `note` dit à quoi chacun sert). `ok` faux : le dire en une phrase et proposer de décrire le mouvement avec ses mots.

## Graphiques, code et formules

Une scène qui montre des chiffres (une évolution, une comparaison, des parts), du code, une formule de tableur ou de mathématiques : écrire ses données dans la scène du déroulé, comme ses textes (`graphiques`, `code`, `formules` ; formats et table « donnée → graphique » : `pulse-motion reference explication`), puis donner leur clé à l'animateur (« graphique `ventes` en barres, chaque barre à son année dite »). Les chiffres viennent de la personne ou d'une source citée (`source`), jamais inventés. Une idée au centre et 3 à 5 parties autour : `type` `moyeu`.

## Caméra, allure et petits sons

« Laisse la caméra bouger toute seule », « plus rythmé pour les réseaux », « ajoute des petits sons » : au déroulé, `"camera": "auto"` (puis chaque scène reçoit son conteneur `data-camera="auto"`), `"allure"` de 0,7 à 1,6, `"bruitages": { "auto": true }` ; détail et pièges : `pulse-motion reference explication`. Ces trois réglages restent éteints tant que la personne ne les demande pas. Le texte dit peut porter des repères et une forme dite (`[#serveur]`, `{HACCP|hache a cé cé pé}`) : `pulse-motion reference audio/voix`. « Mets une voix de synthèse », « fais-la parler plus lentement », « il prononce mal HACCP » : `/pulse-motion:voix` (`pulse-motion reference audio/synthese`). « Marque le moment fort sur le chiffre » : `data-moment-fort` sur l'élément ; « sépare mieux la musique et les sons » : `"bandes": true` dans `bruitages` ; un son de feutre, de craie ou de papier : `pulse-motion reference audio/bruitages`.

## Personnages

Une vidéo qui demande un personnage (« un cuisinier qui explique », « une infirmière qui accueille », « un enfant qui découvre ») : proposer d'abord les personnages livrés, en une question, par leur description en mots simples (`pulse-motion personnages liste`, rubrique `dessins` : le Touffu, une écolière, un soignant, une grand-mère, un technicien, une cuisinière, un guide des années 50), le plus proche de la demande « (Recommandé) », plus « Un nouveau personnage » (`pulse-motion consignes dessiner-personnage`). Le choisi va dans la consigne des animateurs (`data-personnage="<nom>"`).
