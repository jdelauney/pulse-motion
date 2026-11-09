# Scènes témoins et conduite d'une fabrication

## L'essentiel

- **Toutes les questions en une ronde**, réponses recommandées en premier (règle de `/pulse-motion:creer`). On ne revient pas poser une question oubliée au milieu de la fabrication.
- Vidéo de **6 scènes ou plus** : écrire d'abord **deux scènes témoins**, l'ouverture et la scène la plus différente ou la plus risquée ; les regarder en planche ; fixer la **grammaire** de la vidéo ; puis lancer les autres animateurs, et donner la grammaire aux scènes composées.
- **Montrer tôt** une chose incomplète vaut mieux que montrer tard une chose finie : une zone réservée honnête plutôt qu'un visuel inventé.
- Quand la personne hésite, proposer **trois variantes graduées** sur un seul axe nommé : sage, affirmée, audacieuse.
- Le message de fin dit **ce qui reste à faire et les réserves**, pas le récit de tout ce qui a été fait.

## Choisir les deux témoins

| Critère | Pourquoi |
|---|---|
| La scène d'ouverture (`titre`) | Elle fixe la typographie, l'accent et le premier mouvement |
| La scène la plus **différente** de l'ouverture : la plus dense (liste, comparaison, schéma) | Elle montre si la grammaire tient quand il y a beaucoup à dire |
| Si la vidéo a un personnage, un effet de particules ou une caméra : la scène qui en a | C'est la plus risquée ; mieux vaut le savoir tôt |

Jamais deux scènes du même type comme témoins.

C'est ce que fait `/pulse-motion:creer` (étape « Fabrication ») : les deux témoins d'abord, au modèle de la session, puis la seconde vague. Le second témoin y est la scène composée la plus différente de l'ouverture, sans personnage (écrire un personnage est long et retarderait la seconde vague) ; sans scène composée, la plus risquée hors personnage.

## La grammaire de la vidéo

Une note courte, écrite après l'accord sur les témoins et donnée **telle quelle**, avec les chemins des deux scènes témoins, à l'animateur de chaque scène **composée**. Une scène toute faite (à `type`) ne la reçoit pas : elle porte déjà la grammaire du style.

```
Grammaire de la vidéo
- Titres : entrée pm-m-monte, 0,6 s, à 0,3 s ; sous-titre 0,3 s après.
- Listes : un point toutes les 1 s, entrée pm-m-glisse-gauche, son pop à 0,5.
- Chiffre clé : compteur (#021), son ding, demi-seconde de calme avant.
- Accent : seulement sur le mot clé ou le chiffre ; un par scène.
- Marges : texte calé à gauche, 8 cqh du bord.
- Transitions : glissement entre étapes, fondu ailleurs.
```

La grammaire ne remplace pas le style : elle dit les **choix de cette vidéo** dans le style.

## Selon le parcours

| Parcours | Témoins |
|---|---|
| Rapide | Claude regarde lui-même la planche des deux témoins (`pulse-motion planche . <id1>,<id2>`, puis `Read`), corrige si besoin, et continue sans poser de question |
| Accompagné | Comme le parcours rapide : Claude regarde la planche ; la personne valide la vidéo entière à l'aperçu |
| Moins de 6 scènes | Pas de témoins : tous les animateurs en même temps |

## Variantes graduées

- Un seul axe à la fois, nommé : le mouvement, la couleur, la mise en page, la densité.
- Trois niveaux : **sage** (proche de ce qui existe), **affirmée** (un cran plus loin), **audacieuse** (ce qu'on n'aurait pas osé).
- Pour le style de toute la vidéo : `pulse-motion comparer` (voir `pulse-motion reference directions`).

## Les imprévus

| Situation | Conduite |
|---|---|
| Demande floue (« fais quelque chose de bien ») | Trois directions contrastées (`pulse-motion reference directions`) |
| La personne ne répond pas aux questions | Prendre les réponses recommandées, et le dire en une phrase |
| Demandes qui se contredisent (« très court mais tout dire ») | Proposer de choisir : deux vidéos, ou une vidéo qui garde l'essentiel (liste de ce qui saute) |
| Urgence (« vite ») | Parcours rapide ; les témoins sont regardés par Claude seul |
| Tout mettre (« il faut tous les chiffres ») | Une idée par scène : plus de scènes, pas des scènes plus chargées |
| Un visuel manque | Zone réservée honnête (`pulse-motion reference actifs-marque`), et on continue |

## Comportements attendus

Des phrases réelles et ce qu'elles doivent produire. Elles servent à vérifier les compétences après chaque modification de leurs consignes.

| Phrase | Comportement attendu |
|---|---|
| « Fais-moi quelque chose de beau sur notre nouvelle offre » | Trois directions contrastées montrées en images, la sûre recommandée |
| « Une formation de 3 minutes sur le tri des déchets » (12 scènes) | Deux scènes témoins d'abord, puis les autres ; les scènes composées reçoivent la grammaire |
| « Présente notre logiciel Plania » | Une question sur les visuels disponibles (logo, captures), en une fois |
| « Note ma vidéo » | Planches regardées, cinq axes notés avec preuves, trois retouches rapides proposées |
| « C'est trop lourd pour l'envoyer » | Réponse du tableau de `pulse-motion reference sorties` |
| « Mets un compteur 1/5 en haut de chaque étape » | Fait, car demandé (exception aux clichés) |
| « Ajoute des statistiques pour faire sérieux » | Demande des vrais chiffres ; aucun chiffre inventé |
| « Une vidéo de 4 scènes pour LinkedIn » | Pas de témoins ; format 4:5 ou 1:1 proposé |

## À venir

- Première image montrée plus tôt dans la création, et planche des témoins ouverte chez la personne en parcours accompagné, avec une question « La suite dans cet esprit (Recommandé) » · « Je veux changer quelque chose » (spec S4).
- Phrases de ce tableau ajoutées aux évaluations de déclenchement et de comportement, lancées en fin de plan (spec S2).
