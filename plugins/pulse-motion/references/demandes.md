# Demandes particulières

Lu à la demande par `/pulse-motion:creer` (ce que sait faire Pulse Motion, les modèles de vidéo, les mouvements nommés) et par `/pulse-motion:retoucher` (les mouvements nommés). Rien de ce qui suit n'écrit dans le dossier, sauf l'exemple d'un modèle, sur demande expresse.

## Que sait faire Pulse Motion ?

Répondre en quelques lignes, en mots simples, sans rien écrire dans le dossier :
- une vidéo de motion design (formation, présentation d'un produit, histoire, publication pour les réseaux), fabriquée sur l'ordinateur, sans compte en ligne ;
- quelques questions (durée, public, son), puis un déroulé à valider, puis la vidéo dans le navigateur ;
- la voix de la personne, une musique composée pour la vidéo, des sous-titres, son logo et ses couleurs ;
- ensuite, des retouches en une phrase et un MP4 pour le web, les réseaux, une présentation ;
- des modèles de départ (`pulse-motion modeles liste`, présentés par leur nom et leur description).

Puis demander le sujet de la vidéo (« Sur quoi porte votre vidéo ? »).

## Modèles

- « Quels modèles ? » : `pulse-motion modeles liste`, présentés en mots simples (nom et description), sans identifiant technique.
- « Montre-moi un exemple de pitch » : `pulse-motion modeles exemple <id> .` copie l'exemple fini du modèle dans le dossier, s'il n'y a pas encore de vidéo ici (refus : proposer un autre dossier, rien n'est écrasé) ; puis `pulse-motion apercu . --ouvrir` en arrière-plan, et proposer de le modifier avec `/pulse-motion:retoucher` ou de repartir de zéro dans un autre dossier.

## Mouvements nommés

Quand la personne cite un mouvement ou un numéro du dictionnaire (« avec un pop-in sur les titres », « #006 pour le titre »), l'écrire dans `scenes[].mouvements` des scènes concernées (`"mouvements": ["#001"]`, ou `{ "mouvement": "#001", "element": "logo" }` s'il ne vise pas le titre) ; une transition nommée (« whip pan entre les scènes ») va dans `transition` de la scène qui entre (`pulse-motion mouvements afficher <nom>` donne la valeur). Ne jamais proposer de liste de mouvements sans qu'on la demande ; « quels mouvements existent ? » : `pulse-motion mouvements liste`, résumé par catégorie en mots simples, avec deux ou trois exemples par catégorie. La personne ne sait pas nommer le mouvement (« un truc qui claque pour le titre », « montre-moi les mouvements ») : lancer `pulse-motion mouvements choisir --ouvrir` **en arrière-plan** (avec `--categorie entrees`, `texte`, `valeur`, `transitions`, `camera`… si la demande le dit), dire en une phrase « Une page s'ouvre : cochez les mouvements qui vous plaisent, puis cliquez sur « Envoyer à Claude ». », attendre la fin de la commande, puis appliquer les `choix` (leur `note` dit à quoi chacun sert). `ok` faux : le dire en une phrase et proposer de décrire le mouvement avec ses mots.
