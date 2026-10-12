# Les contrôles de `pulse-motion controler`

## L'essentiel

- `pulse-motion controler <dossier>` fait d'abord les **contrôles rapides** (déroulé, minutage, textes, CSS), puis contrôle la **vidéo rendue** dans Chrome ou Edge sans fenêtre (mise en page, pixels).
- Les cas sûrs sont **corrigés seuls** dans `deroule.json`, après une copie d'historique ; chaque correction est listée dans `corrections` de `sortie/controle.json` : les dire à la personne en une phrase. « annule » défait toutes les corrections d'un passage.
- Ce qui reste est dans `problemes` : corriger les erreurs, traiter les alertes (deux tours au plus), dire le reste à la personne.
- `--sans-correction` : signaler seulement (chaque problème corrigeable porte sa `correction` proposée). `--sans-rendu` : contrôles rapides seulement.
- `renduVerifie: false` avec `rendu-non-verifie` ou `rendu-impossible` : la vidéo rendue n'a pas été contrôlée ; le dire à la personne.

## Minutage et lecture

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `temps-mort` | Rien ne bouge pendant plus de 2,5 s | alerte | oui, en fin de scène (durée raccourcie, sans passer sous le temps de lecture) | Au milieu d'une scène : décor qui dérive, entrée échelonnée |
| `pause-finale` | Moins de 0,5 s d'image stable à la fin | alerte | oui (dernière scène allongée, +1 s au plus) | — |
| `lecture` | Scène plus courte que 1,5 s + 0,3 s par mot | alerte | oui (durée allongée, +50 % au plus) | Au-delà : raccourcir le texte ou couper la scène |
| `trop-d-animations` | Plus de 4 éléments qui bougent vite au même instant | alerte | non | Décaler les départs (`data-start`) |
| `texte-fugace` | Texte visible moins de 0,8 s + 0,2 s par mot | alerte | non | Le laisser plus longtemps à l'écran |
| `mouvement-rapide` | Grand élément qui traverse plus d'une largeur d'image par seconde | alerte | non | Ralentir le mouvement |

Avec un `tempo` dans le déroulé, aucune durée n'est corrigée seule (la musique se décalerait).

## Texte en français

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `typographie` | Espace fine avant ; ! ?, insécable avant : et dans « », guillemets « », apostrophe ’, points de suspension …, espace entre un nombre et son unité | alerte | oui (textes du déroulé) | Texte écrit dans une scène : le corriger dans le fichier |
| `majuscule-accentuee` | « Etape », « Equipe », « Ecole »… en début de phrase | alerte | oui | — |
| `mot-double` | Le même mot deux fois de suite (« le le ») | alerte | non | Appliquer la proposition du message |
| `terme-variable` | Un mot écrit de deux façons (« e-mail » / « email ») | alerte | non | Choisir une graphie ; la noter au glossaire si c'est un mot du métier |
| `texte-petit` | Texte de moins de 3,5 cqh | alerte | non | Agrandir |
| `contraste` | Couleur de la charte sur le fond de la charte : moins de 4,5:1 (titres 3:1) | alerte | non | Changer la couleur de la charte |

## Mise en page rendue

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `debordement` | Texte qui déborde de son cadre ou sort de l'image | erreur | oui : taille réduite de 5 % en 5 %, jusqu'à 80 %, jamais sous 3,5 cqh (`ajustements` du déroulé) | Au-delà : raccourcir le texte |
| `chevauchement` | Deux éléments de contenu qui se recouvrent sur plus de 10 % | alerte | non | Les écarter, ou `data-superpose` sur celui qui passe par-dessus |
| `hors-cadre` | Image, logo ou SVG qui sort de l'image | alerte | non | Le recadrer, ou le marquer comme décor |
| `marge` | Texte à moins de 4 % du bord | alerte | non | L'éloigner du bord |
| `zone-sure` | En 9:16 : texte dans les 7 % du haut, les 20 % du bas, ou les 11 % de droite entre 40 % et 85 % de la hauteur (boutons des réseaux) | alerte | non | Raccourcir les textes ou retirer un point, sinon rapprocher du centre |
| `logo-masque` | Logo recouvert à plus de 20 %, ou hors de l'image | alerte | non | Le dégager |

## Pixels

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `contraste-reel` | Texte qui ne se détache pas de ce qu'il y a derrière ses lettres : moins de 4,5:1, ou 3:1 à partir de 4,5 cqh | alerte | non | Aplat ou voile sous le texte, autre couleur, fond déplacé |
| `flash` | Plus de 3 flashs par seconde sur un quart de l'image | **erreur** | non | Ralentir ou adoucir le clignotement (risque de crise d'épilepsie) |

## Rendu

| Règle | Ce qui la déclenche | Gravité | Corrigé seul ? | Que faire |
|---|---|---|---|---|
| `rendu-non-verifie` | Ni Chrome ni Edge | alerte | non | Installer l'un des deux, ou indiquer son chemin avec `PM_NAVIGATEUR` |
| `rendu-impossible` | Page en erreur, délai dépassé, navigateur introuvable à l'adresse donnée | alerte | non | Lire la cause dans le message |

## Dire ce qui est voulu

| Cas | Marqueur |
|---|---|
| Forme, image ou calque de pur décor | `data-decor`, ou dans `<div class="decor">` |
| Image décorative | `alt=""` |
| Icône SVG décorative | `aria-hidden="true"` |
| Élément posé volontairement sur un autre | `data-superpose` sur celui qui passe par-dessus |

Les seuils sont dans `scripts/seuils.json`.
