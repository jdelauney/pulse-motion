# Recettes de rythme

## L'essentiel

- Une vidéo courte a une **courbe d'énergie**, pas un débit égal. Recette par défaut : **pose, montée, éclat, tenue, sortie**, qui prennent 15, 15, 40, 20 et 10 % de la durée.
- **Une demi-seconde de calme avant le résultat clé** (chiffre, révélation, logo) : rien n'entre, la musique peut se taire. C'est ce silence qui fait le poids du moment.
- **Finir net** : une image stable, pas de fondu au noir, pas de retour au début.
- **Montrer comment, pas seulement le résultat** : la jauge se remplit, le texte s'écrit, la ligne se trace. Une apparition sans geste est oubliée.
- Choisir un **caractère** (grand écran, démonstration en un plan, bureau) avant d'écrire les scènes : il fixe à la fois les mouvements, les transitions, les sons et le tempo.

## La courbe en cinq temps

| Temps | Part | Ce qui se passe | Mouvements | Son |
|---|---|---|---|---|
| Pose | 15 % | Le décor, le contexte, une question | Zoom avant lent (#056), fondu montant (#002) | Musique seule, basse |
| Montée | 15 % | Les éléments arrivent plus serrés | Entrée en cascade (#010), glissé (#003) | `whoosh` sur les entrées principales |
| Éclat | 40 % | Le contenu principal, à plein régime | Coupe franche (#050), zoom sur un détail (#037), mots qui montent (#017) | Bruitages sur les temps de la musique |
| Tenue | 20 % | Le résultat, après la demi-seconde de calme | Compteur (#021), apparition rebondie (#001), secousse d'impact (#036) | Le son le plus fort de la vidéo |
| Sortie | 10 % | Logo, appel à l'action, image stable | Signature de fin (`pulse-motion reference compositions`) | `carillon` ou dernier accord |

Exemple pour 30 s en 6 scènes : pose 4,5 s (1 scène) ; montée 4,5 s (1 scène) ; éclat 12 s (2 scènes de 6 s) ; tenue 6 s (1 scène) ; sortie 3 s (1 scène). Les durées restent au-dessus du temps de lecture (contrôle `lecture`).

Cette courbe vaut pour une présentation, une annonce, une publication. Une formation longue répète plutôt des **cycles courts** (une notion = pose, éclat, tenue) avec une vraie respiration entre deux notions.

## Trois caractères

| | Grand écran | Démonstration en un plan | Bureau |
|---|---|---|---|
| Pour | Lancement, keynote, annonce | Montrer un logiciel ou un geste, de bout en bout | Formation, procédure, réunion |
| Image | Fond sombre teinté, une lumière, grands vides | Un seul cadre qui reste (`pulse-motion reference cadres-pointeur`) | Clair, aplats, pictogrammes |
| Montage | Lent puis rapide ; transitions `whip`, `traversee` | Pas de transition : la caméra suit (#057), zoome (#037), revient | `coupe` et `fondu`, `glissement` entre étapes |
| Mouvements | #056, #035, #037, #036 | #030 (pointeur), #015 ou mots tapés, #037 | #002, #010, #024 |
| Sons par 10 s | 6 à 9 | Les clics seulement | 2 à 4 |
| Musique | 118 à 128, `tech` ou `entrainant`, intensité 0,7 | 90 à 100, `calme`, intensité 0,3 | 80 à 95, `calme` ou `inspirant` |
| Durée type | 20 à 45 s | 30 s à 2 min | 1 à 5 min |

## Durées repères

À ajouter aux durées de `pulse-motion reference rythme`.

| Geste | Durée |
|---|---|
| Réaction immédiate (bouton qui s'enfonce, coche, clic) | 0,1 à 0,3 s |
| Entrée d'un élément d'interface (carte, panneau, notification) | 0,3 à 0,8 s |
| Geste qui raconte (tracé d'un schéma, trajet d'un personnage, caméra) | 2 à 10 s |
| Mouvement continu sans information nouvelle | 10 s au plus, puis il faut une coupe ou un changement |
| Phrase affichée | 3 s au moins à l'écran (le contrôle `lecture` est plus précis : il compte les mots) |

## Gestes de finition

| Geste | Recette |
|---|---|
| Courbe principale | Sortie exponentielle (`expo-out`) pour les entrées ; un seul dépassement (`back-out`) par scène, sur l'élément principal ; le ressort pour ce qui a un poids |
| Cascade de petits éléments | 0,03 s entre deux éléments identiques nombreux (vignettes, pictogrammes, cases) ; entre deux textes à lire, garder 0,2 à 1,2 s (`rythme`) |
| Ouverture en deux temps | Un panneau s'ouvre d'abord en largeur (40 % du temps), puis en hauteur (60 %) |
| Attirer l'œil | La cible reste nette ; le reste passe à opacité 0,5 et à un flou de 0,4 à 0,7 cqh ; un bref éclat de 0,15 s sur la cible (#035) |
| Anticipation, action, suite | Un petit recul avant (#008), le geste, un léger dépassement après (#027) |
| Relief léger | Une carte inclinée de 8° vers l'arrière et 4° de côté (`rotateX(8deg) rotateY(-4deg)`), perspective sur le parent |
| Dérive vivante | Caméra : `x` et `y` à des vitesses et des courbes différentes ; jamais un trajet parfaitement droit pour un décor qui flotte |
| Personnage vivant | Déjà fait par le moteur : clignement, repos vivant, retard des membres, ombre (`pulse-motion reference mouvement-vivant`) |
| Deux familles de lettres | Titres à empattements et texte sans empattements donnent une allure éditoriale ; c'est un choix de style (`editorial`), pas une règle |

## À venir

- Doctrine de réalisation (accroche, silences, variété de caméra, erreurs les plus vues) : elle prime sur ces recettes en cas d'écart (spec S2).
- Catégorie « vie » du dictionnaire (balancement, flottement, flamme…) : spec S3.
- Recettes reprises dans les modèles de vidéo et les idées de départ, avec la courbe en cinq temps comme structure proposée (chantier C).
