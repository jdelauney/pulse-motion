# Style « clair-pedagogique »

## L'essentiel

- Clair, lisible et posé : pour expliquer (formation, présentation). Fond clair, titres en `--c-primaire`, accents en `--c-accent`.
- Polices fournies : **Figtree** (titres) et **Inter** (texte). Une autre police de la charte doit être fournie en fichier dans `assets/`.
- Partir d'une des **8 scènes toutes faites** : `pulse-motion scene clair-pedagogique <type>`, copier dans `scenes/NN-<id>.html`, remplacer `data-scene="<type>"` par l'id de la scène, puis adapter. Le `type` de la scène est noté dans le déroulé : c'est lui qui permet de changer de style sans réécrire la scène.
- Les éléments de décor portent `data-decor` (les `.rond`) et un `data-dur` égal à la durée conseillée : le mettre à la durée de la scène. Sur la **dernière scène** de la vidéo, le mettre à la durée − 1 s : la vidéo doit finir sur une image stable d'au moins 0,5 s.
- Respecter les longueurs maximales des textes : au-delà, le texte déborde ou la scène devient trop courte pour le lire.

## Scènes toutes faites

| Nom | Rôle | Durée conseillée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Ouvrir la vidéo ou un chapitre | 7 s | etiquette (25), titre (40), sous (50) |
| `liste` | 2 à 4 points révélés un par un | 12 s | titre (40), point1 … point4 (45) |
| `chiffre` | Un chiffre clé qui compte jusqu'à sa valeur | 7 s | titre (40), unite (3, peut être vide), legende (60) ; valeur dans `data-tween="nombre 0→…"` |
| `comparaison` | Deux colonnes : avant/après, à faire/à éviter | 12 s | titre (40), gauche-titre (20), gauche-texte (60), droite-titre (20), droite-texte (60) |
| `etape` | Une étape numérotée d'une procédure | 8 s | numero (2), titre (40), texte (80) |
| `alerte` | Un point de vigilance, une erreur à éviter | 8 s | titre (40), texte (80) |
| `schema` | Trois étapes reliées par des flèches | 8 s | titre (40), a, b, c (25) |
| `conclusion` | Le message à retenir et le logo | 6 s | titre (40), sous (50) |

Liste à moins de 4 points : supprimer les `<li>` en trop et leurs clés. Pas de logo : supprimer l'`<img data-logo>`.

## Classes du style

| Classe | Usage |
|---|---|
| `.centre` (sur la section) | Contenu centré |
| `.rangee` | Éléments côte à côte, largeurs égales |
| `.etiquette`, `.titre`, `.titre-moyen`, `.sous-titre`, `.texte`, `.grand-chiffre` | Typographie (tailles en cqh déjà réglées) |
| `.entre-bas`, `.entre-gauche`, `.entre-droite`, `.zoom`, `.fondu` | Entrées, calées sur le `data-start` de l'élément |
| `.trait` | Soulignement qui se trace (à minuter) |
| `.decor` + `.rond`, `.rond.accent` | Décor ; `data-tween` sur `--dx`, `--dy` ou `scale` pour le faire dériver |
| `.liste` | Liste à puces d'accent |
| `.colonne`, `.colonne.accent`, `.colonne-titre` | Comparaison |
| `.etape`, `.numero`, `.etape-texte` | Étape numérotée |
| `.alerte`, `.alerte-icone`, `.alerte-corps` | Point de vigilance |
| `.schema`, `.boite`, `.fleche` | Schéma fléché (la flèche se trace avec `--p`) |
| `.logo` | Logo de la charte |

## Composer une scène nouvelle

Quand aucune scène toute faite ne convient (schéma particulier, illustration SVG, photo), composer librement avec ces classes et un `<style>@scope { … }</style>`, en gardant : un décor qui dérive, une entrée par élément, des textes en `data-texte`.
