# Directions artistiques d'une vidéo Pulse Motion

## L'essentiel

- Une **direction** est une allure décrite par six réglages chiffrés (vide, couleurs, contraste des textes, caractère du mouvement, matière, densité) et un style de départ. Elle se dit en trois mots, jamais par un nom technique.
- La personne ne sait pas quoi choisir (« fais quelque chose de beau », « je ne sais pas, surprends-moi », « propose-moi des styles ») : proposer **trois directions contrastées**, une par famille, qui diffèrent sur au moins trois des six réglages.
- **Montrer avant de décrire** : les trois directions se voient sur les deux premières scènes de la personne (`pulse-motion comparer`), pas en paragraphes.
- Une direction choisie devient un **style** (livré, ou personnel par `/pulse-motion:style`), complété par la charte et par des mouvements du dictionnaire ; jamais par du CSS ajouté au cas par cas dans chaque scène.
- On décrit des **traits**, pas une signature : ne jamais nommer un studio, un graphiste ou un artiste vivant comme modèle à imiter.

## Situer la vidéo avant de proposer

Quatre repères se déduisent du déroulé (genre, public, format, durée). Ne poser une question que si deux réponses restent possibles.

| Repère | Ce qu'il décide | Exemple |
|---|---|---|
| Où elle sera vue | Taille des textes, densité | Téléphone dans le métro → peu d'éléments, textes énormes ; salle de formation → schémas permis |
| Combien de temps d'attention | Énergie, vitesse | Fil d'un réseau → accroche immédiate ; formation obligatoire → calme, régulier |
| Quelle chaleur | Couleurs, courbes, matière | Institutionnel → aplats, mouvement net ; complice → couleurs chaudes, rebonds |
| Ce qu'on doit retenir | L'élément qui reçoit l'accent | Un chiffre, un geste, un nom de marque, une règle de sécurité |

## Les six réglages d'une direction

| Réglage | Mesure | Bas | Haut |
|---|---|---|---|
| Vide | Part de l'image sans contenu (fond seul) | 25 % (dense) | 70 % (aéré) |
| Couleurs | Couleurs visibles hors neutres (fond, texte) | 1 accent | 4 couleurs franches |
| Contraste des textes | Hauteur du titre ÷ hauteur du texte ; écart de graisse | × 2, écart 200 | × 5, écart 500 et plus |
| Caractère du mouvement | Durée type d'une entrée ; courbe | 0,35 s, `expo-out` (net) | 1,1 s, `sine-inout` (lent) ; ou `back-out` (rebondi) |
| Matière | Ce qui recouvre les formes | Aplat | Papier, trait dessiné, lumière, photo |
| Densité | Éléments de contenu par scène | 1 à 2 | 5 à 6 |

Deux directions sont **contrastées** quand trois réglages au moins s'écartent : 20 points de vide, 2 couleurs, un caractère de mouvement différent (net, lent, rebondi, mécanique), une autre matière, un rapport de titres ou une densité qui change du simple au double.

## Douze directions nommées

Quatre familles de trois. Le style de départ est un style livré ; les chiffres disent comment le régler (charte, mouvements, durées).

| Famille | Direction (en mots) | Pour | Vide | Couleurs | Titres ÷ texte | Mouvement | Matière | Départ | Mouvements |
|---|---|---|---|---|---|---|---|---|---|
| Rigueur | **Grille nette** : net, sûr, essentiel | Résultats, décision, produit | 55 % | 1 accent | × 4, graisse 900 / 400 | 0,45 s `expo-out`, aucun rebond | Aplat | `minimal` | #002, #006, #011 |
| Rigueur | **Note de synthèse** : clair, chiffré, fiable | Bilan, rapport, chiffres clés | 40 % | 2 | × 3 | 0,6 s `quart-out` | Aplat, filets | `minimal` | #021, #010, #025 |
| Rigueur | **Salle de contrôle** : précis, technique, calme | Logiciel, données, sécurité | 45 % | 1 lumineuse sur sombre | × 3, chasse fixe pour les chiffres | 0,6 s `linear` ou `expo-out`, tracés | Lumière | `tech-sombre` | #011, #020, #035 |
| Calme | **Papier et silence** : posé, rare, juste | Valeurs, manifeste, deuil, luxe | 70 % | 1 sourde | × 2,5 | 1,1 s `sine-inout` | Papier (image embarquée) | `editorial` | #002, #005, #039 |
| Calme | **Magazine** : élégant, exigeant, éditorial | Histoire, portrait, culture | 45 % | 2 | × 4, titres à empattements | 0,8 s `expo-out`, coupes | Photo pleine image | `editorial` | #006, #056, #050 |
| Calme | **Atelier** : fait main, humain, chaleureux | Artisanat, accueil, enfance | 40 % | 3 crayonnées | × 2,5 | 0,9 s `back-out` doux | Trait dessiné | `chaleureux` | #011, #013, #016 |
| Énergie | **Affiche** : audacieux, franc, joyeux | Annonce, événement, promotion | 30 % | 3 à 4 saturées | × 5, graisse 900 | 0,5 s `back-out`, rebonds | Aplat | `energique` | #001, #009, #046 |
| Énergie | **Fil social** : rapide, direct, vertical | Publication 9:16 | 35 % | 2 | × 5, texte énorme | 0,35 s, coupes sur les temps | Aplat, photo | `energique` | #050, #037, #017 |
| Énergie | **Lancement** : sombre, rare, spectaculaire | Nouveau produit, révélation | 60 % | 1 lumière sur fond teinté | × 4 | lent puis rapide, `expo-out` | Lumière | `tech-sombre` | #056, #035, #036 |
| Récit | **Tableau de classe** : clair, rassurant, méthodique | Formation, procédure | 40 % | 2 franches | × 2,5 | 0,7 s `cubic-out`, entrées échelonnées | Aplat, pictogrammes | `clair-pedagogique` | #010, #024, #025 |
| Récit | **Carnet de route** : vivant, proche, raconté | Témoignage, parcours client | 45 % | 3 chaudes | × 2,5 | 0,9 s, caméra qui suit | Trait, personnages | `chaleureux` | #057, #063, #016 |
| Récit | **Documentaire** : sobre, vrai, incarné | Reportage, terrain, réalisations | 35 % | 1 | × 3 | 1 s, zooms lents sur photos | Photo | `editorial` | #056, #057, #039 |

Le « fond teinté » de la direction Lancement : un très sombre coloré par la charte (bleu nuit, brun), jamais un noir uniforme qui écrase les ombres.

## Proposer trois directions contrastées

1. Lire `pulse-motion styles --genre <genre>` : le premier style recommandé donne la direction **sûre**. Le champ `contraste` de la recommandation du genre donne la direction **pas de côté**. Choisir la troisième, **affirmée**, dans une troisième famille.
2. Vérifier le contraste : au moins trois des six réglages s'écartent deux à deux. Deux directions trop proches : remplacer la plus faible.
3. Montrer : `pulse-motion comparer . <s1>,<s2>,<s3> --ouvrir` en arrière-plan, puis regarder soi-même les images de `sortie/comparaison/`.
4. Présenter chaque direction en trois mots et une phrase sur ce que ressent le spectateur (« on a l'impression d'un rapport sérieux, qu'on lit vite »). Puis une question `AskUserQuestion` : les trois directions, la sûre en premier « (Recommandé) », et « Autre chose ».
5. Choix fait :
   - la direction correspond à un style livré tel quel : changer `style` dans `deroule.json` ;
   - elle demande d'autres couleurs : les écrire dans la charte de la vidéo ;
   - elle demande une autre matière, d'autres polices ou un autre caractère de mouvement : proposer `/pulse-motion:style`, avec les réglages de la direction déjà remplis.

## Écrire une direction dans un style personnel

| Réglage | Champ de `identite.json` |
|---|---|
| Trois mots | `personnalite` |
| Couleurs | `couleur.strategie` (`sobre-avec-une-touche`, `plusieurs-couleurs`, `la-couleur-partout`) et `couleur.roles` |
| Contraste des textes | `typographie.titres.graisse`, `typographie.texte.graisse` ; tailles dans `style.css` (en `cqh`) |
| Caractère du mouvement | `mouvement.caractere`, `mouvement.courbes`, `mouvement.dureeType`, `mouvement.transitions` |
| Matière | `signature` ; texture par une image embarquée dans le dossier du style |
| Vide et densité | `aFaire`, `aEviter` (« une idée par scène, deux éléments au plus ») |

## Pièges

| Piège | Pourquoi | À la place |
|---|---|---|
| Trois directions voisines (trois styles clairs et sobres) | La personne ne voit pas de vrai choix | Une direction par famille |
| Une direction décrite par un nom d'artiste ou d'agence | Imitation d'une signature ; la personne ne sait pas ce que ça donne | Les traits chiffrés et l'image |
| Une matière que l'export ne rend pas (grain animé par filtre SVG, fusion de calques) | Interdit par le moteur | Image de texture embarquée, aplats, ombres décalées |
| Changer de direction scène par scène | La vidéo perd son unité | Une direction pour toute la vidéo ; l'accent change, pas l'allure |

## À venir

- Galerie à contenu témoin (même petite histoire dans chaque style, livré ou personnel) : on montrera les trois directions sans attendre la comparaison sur le projet (spec S8, galerie ; chantier B).
- Nouveaux styles livrés : la colonne « Départ » prendra le style le plus proche parmi eux (spec S8).
