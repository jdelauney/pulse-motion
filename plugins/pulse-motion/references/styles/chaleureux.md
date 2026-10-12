# Style « chaleureux »

## L'essentiel

- Accueillant, doux, humain : tons chauds (terre cuite, sauge, pêche), formes rondes, cartes douces. Pour un service grand public, une association, la santé, l'accueil des nouveaux arrivants.
- Polices fournies : **Fredoka** (titres, arrondie) et **Nunito Sans** (texte).
- Signature : galets qui respirent (`.galet`, animation calée sur le temps), entrées douces qui s'arrêtent net (`quint-out`), rayons généreux.
- Partir d'une des **8 scènes toutes faites** : `pulse-motion scene chaleureux <type>`, copier dans `scenes/NN-<id>.html`, remplacer `data-scene="<type>"` par l'id de la scène.
- Décor : les galets (`data-decor`) dérivent pendant toute la scène : leur `data-dur` = durée de la scène. Sur la **dernière scène** de la vidéo, durée − 1 s : la vidéo doit finir sur une image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16. Ton clair seulement.
- Transitions : `fondu`, `glissement`.

## Scènes toutes faites

| Nom | Rôle | Durée conseillée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Accueillir et ouvrir la vidéo | 7 s | etiquette (25), titre (40), sous (50) |
| `liste` | 2 à 4 points sur des cartes douces | 12 s | titre (40), point1 … point4 (45) |
| `chiffre` | Un chiffre dans un galet | 7 s | titre (40), unite (3), legende (60) ; valeur dans `nombre 0→…` |
| `comparaison` | Deux cartes arrondies | 12 s | titre (40), gauche-titre (20), gauche-texte (60), droite-titre (20), droite-texte (60) |
| `etape` | Une étape, numéro dans une forme ronde | 8 s | numero (2), titre (40), texte (80) |
| `alerte` | Un conseil important, sur une carte | 8 s | titre (40), texte (80) |
| `schema` | Trois étapes reliées par des flèches courbes | 8 s | titre (40), a, b, c (25) |
| `conclusion` | Le message à retenir et le logo | 6 s | titre (40), sous (50) |

## Classes du style

| Classe | Usage |
|---|---|
| `.pastille-texte`, `.titre`, `.titre-moyen`, `.sous-titre`, `.texte`, `.chiffre-rond` | Typographie |
| `.pose`, `.eclot` | Entrées douces, calées sur le `data-start` de l'élément |
| `.decor` + `.galet`, `.galet.sauge` (`--dx`, `--dy`) | Décor qui respire |
| `.cartes`, `.galet-chiffre`, `.deux-cartes` + `.carte`, `.etape` + `.rond-numero`, `.conseil`, `.parcours` + `.etiquette-ronde` + `.courbe` | Mises en page des scènes |

## À faire, à éviter

- À faire : un ton direct et bienveillant ; des cartes aérées ; des photos de vraies personnes en scène libre.
- À éviter : les angles vifs ; les couleurs criardes ; les mouvements brusques.
