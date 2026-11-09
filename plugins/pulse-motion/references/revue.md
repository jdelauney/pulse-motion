# Revue notée d'une vidéo Pulse Motion

## L'essentiel

- Déclencheurs : « qu'en penses-tu ? », « note ma vidéo », « est-ce que c'est bien ? », « qu'est-ce que tu changerais ? ».
- On juge **ce que voit le spectateur** : les planches de regard (ouverture, temps forts, téléphone), puis le déroulé (textes, durées, voix). Le code des scènes ne se lit qu'ensuite, pour trouver la cause d'un défaut.
- **Cinq axes notés sur 10**, chacun avec une preuve située (« scène 3, deuxième image »). Une note sans preuve ne compte pas.
- La revue finit par **trois retouches rapides**, écrites comme des phrases que la personne pourrait dire à `/pulse-motion:retoucher`, qu'elle accepte une à une.
- On ne retouche pas un axe noté 9 ou plus. Un seul tour de corrections après une revue ; on ne refait pas la revue pour se donner raison.

## Préparer

1. `pulse-motion controler .` : les erreurs et alertes du contrôle sont des faits, pas des opinions ; la revue ne les répète pas, elle les cite en une ligne.
2. `pulse-motion planche . --regard` (toute la vidéo), puis regarder chaque planche avec `Read` : `ouverture.png`, `temps-forts-*.png`, `telephone-*.png` et, pour le mouvement, `bandes.png` ; lire aussi `sortie/regard/fiche.md` (scènes, instants, index des images).
3. Lire `deroule.json` : genre, public, format, textes, durées, voix.
4. La relecture : le résumé de la planche donne `relecture` ; si elle n'est pas à jour (`aJour` faux ou `null`), lancer l'agent `critique` comme le dit `pulse-motion reference realisation`, section « 13. La relecture indépendante », puis lire `sortie/regard/critique.json`. Une relecture à jour se relit, sans se relancer.

## Les cinq axes

| Axe | La question | 4 / 10 | 7 / 10 | 9 / 10 |
|---|---|---|---|---|
| **Message** | Sans le son, comprend-on l'idée de chaque scène en une lecture ? | Deux scènes sur cinq disent deux choses à la fois | Une idée par scène, mais la conclusion répète au lieu de conclure | Chaque scène tient en une phrase ; la dernière donne quoi faire |
| **Lisibilité** | L'œil sait-il où aller, et a-t-il le temps de lire ? | Plusieurs éléments de même poids se disputent l'image | Un point d'entrée par image, quelques textes serrés | Le titre se lit en premier partout ; rien n'est lu en courant |
| **Rythme** | L'énergie change-t-elle, et la vidéo accroche-t-elle tout de suite ? | Même durée, même entrée, même transition partout | Une montée visible, une fin nette, accroche après 4 s | Accroche dans les 3 premières secondes, une respiration avant le moment fort, fin stable |
| **Cohérence** | Est-ce la même vidéo du début à la fin ? | Couleurs ou polices qui changent, mouvements de familles opposées | Unité générale, une ou deux scènes à part | Un seul langage : mêmes marges, même famille de mouvements, accent toujours au même rôle |
| **Singularité** | Y a-t-il un moment qui n'appartient qu'à ce sujet ? | Gabarit générique, clichés (voir `pulse-motion reference anti-cliches`) | Une bonne idée, peu exploitée | Une image dont on se souvient, tirée du sujet lui-même |

Barème commun : 1 à 3, cassé (illisible, faux, inregardable) ; 4 et 5, un défaut se voit au premier visionnage ; 6 et 7, correct ; 8, bon ; 9 et 10, rien à retirer.

### Ce qui compte le plus selon le genre

| Genre | Axes doublés dans la note d'ensemble |
|---|---|
| Formation | Message, Lisibilité |
| Présentation de produit | Singularité, Rythme |
| Storytelling | Message, Cohérence |
| Publication sociale | Rythme (accroche), Lisibilité (petit écran) |

### Repères mesurables

Ils aident à justifier une note ; ce ne sont pas des règles absolues.

| Repère | Valeur |
|---|---|
| Titre ÷ texte courant | 2,5 au moins ; en dessous, la hiérarchie se perd |
| Couleurs visibles hors fond et texte | 3 au plus dans une même image |
| Familles de polices | 2 au plus dans la vidéo |
| Vide | 35 % de l'image au moins (50 % pour un style sobre) |
| Marges | Les mêmes d'une scène à l'autre, à 1 cqh près |
| Mouvement simultané | Un seul élément en mouvement rapide à la fois au moment de lire |
| Familles de transitions | 3 au plus |
| Types de scène | Pas trois fois de suite le même type (liste, liste, liste) |

## Depuis la relecture du critique

`critique.json` note huit axes ; la personne en reçoit cinq. La note d'un axe de la revue est la moyenne des axes du critique notés (un axe `null` ne compte pas), et ses preuves sont celles du critique. Cette table fait foi :

| Axe de la revue | Axes de `critique.json` |
|---|---|
| Message | `message`, `verite` |
| Lisibilité | `lisibilite`, `composition` |
| Rythme | `ouverture`, `rythme` |
| Cohérence | `continuite`, `mouvement` |
| Singularité | aucun : Claude la note lui-même d'après les planches et les clichés de `realisation` § 10, avec une preuve située |

Les défauts `a-corriger` deviennent « à corriger » (« Gênant »), `souhaitable` « À améliorer », `detail` « Détail » ; les trois retouches rapides viennent des défauts les plus graves, une scène ou un réglage chacune. La pondération par genre reste celle du tableau ci-dessus. Le critique n'entend pas la vidéo : le son se juge d'après le contrôle, qui le mesure.

## Rendre la revue

Écrire en français simple, sans jargon, dans cet ordre :

```
Note d'ensemble : 7,2 sur 10 (formation : le message et la lisibilité comptent double)

| Axe | Note | Ce qui la justifie |
| Message | 8 | Une idée par scène ; la scène 5 hésite entre deux consignes (images 2 et 3) |
| …

Ce qui marche, à garder : (2 ou 3 points)
- Le chiffre de la scène 3 arrive au bon moment et reste lisible.

Ce qui gêne, à corriger :
- Gênant : le titre de la scène 2 passe sous la photo (deuxième image).
- À améliorer : les trois listes se suivent avec la même entrée.
- Détail : la conclusion arrive 0,3 s trop tôt après la voix.

Trois retouches rapides :
1. « Remonte le titre de la scène 2 au-dessus de la photo »
2. « Fais entrer la liste de la scène 4 en cascade, point par point »
3. « Laisse une demi-seconde de silence avant le chiffre de la scène 3 »
```

- Chaque retouche rapide tient en une phrase, ne touche qu'une scène ou un réglage, et correspond à une catégorie de `/pulse-motion:retoucher` (texte, rythme, mouvement nommé, visuel d'une scène).
- Les proposer par `AskUserQuestion` à choix multiple ; appliquer seulement celles qui sont cochées, chacune comme une retouche (sauvegarde, contrôle, aperçu).
- Ne jamais juger le métier de la personne (le contenu de sa formation). Un chiffre à l'écran sans source se signale comme un risque, pas comme une faute de goût.

## À venir

- Règles de vérité des chiffres (« Exemple », « à date », source) : spec S2.
