# Ce qui fait « vidéo générée » et comment l'éviter

## L'essentiel

- Certains motifs trahissent une vidéo faite sans regard : ils sont partout, ne disent rien du sujet et vieillissent mal. Ne pas les employer **par défaut**.
- Chaque interdit a une **exception légitime** : la charte de la personne l'utilise, ou la personne l'a demandé. Dans ce cas, on le fait bien.
- **Rien d'inventé à l'écran** : pas de chiffre, de citation, de logo client ou de témoignage qui ne soit pas dans le déroulé validé. Un manque se montre par une zone réservée honnête (`pulse-motion reference actifs-marque`).
- **Rien qui imite le lecteur** : pas de barre de progression, de minuteur, de « 3/6 », de bouton lecture dessinés dans l'image, sauf demande ou tutoriel où l'interface est le sujet.
- **Jamais de signature de l'outil** : ni filigrane, ni « fait avec », ni crédit ajouté. La vidéo appartient à la personne.

## Les motifs à éviter

| Motif | Pourquoi il gêne | À la place | Exception |
|---|---|---|---|
| Dégradé violet-bleu passe-partout en fond | N'appartient à aucune marque ; signe de gabarit | Le fond de la charte (`--c-fond`), ou `pm-degrade` entre les couleurs de la charte | La charte est violette |
| Emoji en guise d'icônes | Rendu différent selon la police, ton enfantin, carré vide si la police ne l'a pas | Une icône SVG simple aux couleurs de la charte (`aria-hidden="true"`), ou rien | Publication sociale au ton familier, à la demande |
| Une icône devant chaque titre | Tout se ressemble ; l'icône ne porte plus d'information | Une icône seulement quand elle dit quelque chose que le texte ne dit pas | Une liste de pictogrammes voulue par le style ou par la charte |
| Carte arrondie avec un liseré de couleur sur le côté gauche | Gabarit de tableau de bord vu partout | Carte sans liseré ; l'accent porté par le chiffre ou le mot clé | Le style l'a dans ses scènes toutes faites |
| « Grand titre + trois colonnes d'icônes » à chaque scène | Monotone ; la vidéo devient un diaporama | Varier les types de scène (chiffre, comparaison, schéma, étape) | Une seule scène de synthèse, à la fin |
| Produit réel redessiné en formes (téléphone, flacon, machine en CSS) | Faux, souvent maladroit, parfois trompeur | La photo fournie par la personne ; à défaut, un cadre générique (`pulse-motion reference cadres-pointeur`) ou une zone réservée | Objet générique sans marque (un carton, une tasse), qu'aucune photo ne montrerait mieux |
| Personnage ou objet complexe tracé en SVG approximatif | Raideur, proportions fausses | Le système de personnages (`/pulse-motion:dessiner-personnage`) ou une photo | Pictogramme simple, qui ne prétend pas ressembler |
| Lueur ou ombre colorée sur tout | Effet daté ; plus rien ne ressort | Un seul halo, sur le moment fort | Style lumineux choisi (`tech-sombre`) |
| Tout rebondit | Le rebond n'attire plus l'œil | Un rebond par scène au plus, sur l'élément principal | Style `energique` |
| Mots creux à l'écran (« Révolutionnez », « Boostez », « Découvrez la puissance de ») | Rien à retenir | Le fait concret du déroulé (« 3 minutes au lieu de 20 ») | Slogan officiel de la marque |
| Chiffre décoratif (« 98 % », « ×10 ») ou citation sans auteur | Mensonge par défaut | Seulement les chiffres et citations du déroulé, validés par la personne | Exemple fictif annoncé comme tel à l'écran (« Exemple : ») |
| Logos de « clients » inventés | Faux, et risque juridique | Logos fournis, avec accord | Exemple pédagogique aux noms visiblement fictifs, annoncé comme tel |
| Barre de progression, minuteur, numéro de diapositive, bouton lecture dans l'image | Le lecteur existe déjà ; doublon qui ment quand la vidéo est coupée | Rien ; les numéros d'étape écrits dans le déroulé restent permis | Tutoriel logiciel, demande explicite |
| Changer les polices du style pour une police système | La vidéo perd son caractère et les contrôles de police | Les polices du style ou de la charte (`var(--f-titres)`, `var(--f-texte)`) | La charte impose une autre police |

## Éléments présents dans toutes les scènes

Logo de coin, mention légale, numéro d'étape répété : ils traversent des fonds différents.

- Couleur : jamais une couleur écrite en dur ; `var(--c-texte)`, ou les variantes lisibles (`--c-primaire-lisible`, `--c-accent-lisible`) qui s'adaptent au fond.
- Logo : vérifier qu'il se voit sur **chaque** fond de la vidéo, clair comme sombre ; sinon, poser une pastille de `--c-fond` derrière lui, ou demander la version claire du logo.
- Place : toujours le même coin, à 4 % du bord au moins (contrôle `marge`), hors de la zone des boutons en 9:16 (contrôle `zone-sure`).

## Caractères sûrs

Les symboles de clavier (⌘, ⏎, ⌥, ␣), certaines flèches, les coches et les emoji manquent souvent dans les polices des styles : ils s'affichent en carré vide ou dans une autre police.

- Écrire en mots : « touche Entrée », « Ctrl + C », « Valider ».
- Ou dessiner une icône SVG, marquée `aria-hidden="true"`.
- Une police fournie par la personne : `pulse-motion police` signale déjà les caractères absents (`avertissements`) ; les dire et remplacer le texte.

## À venir

- Alertes du contrôle (spec S2) : emoji dans un texte affiché ; caractère absent de la police de son élément ; chiffre affiché qui n'est pas dans le déroulé ; motif « n/n » ou barre de progression non demandés ; logo de coin peu visible sur un des fonds.
