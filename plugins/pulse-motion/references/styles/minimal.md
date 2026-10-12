# Style « minimal »

## L'essentiel

- Net, sûr, essentiel : grille suisse, beaucoup d'espace, typographie démesurée, un seul accent. Pour présenter un produit, des résultats, une décision.
- Police fournie : **Schibsted Grotesk** (titres et texte, une seule famille).
- Signature : titres très grands en noir (ou blanc en ton sombre), un détail d'accent par scène (numéros, marqueur, barre), mouvements courts et nets (`expo-out`, 0,45 à 0,5 s).
- Partir d'une des **8 scènes toutes faites** : `pulse-motion scene minimal <type>`, copier dans `scenes/NN-<id>.html`, remplacer `data-scene="<type>"` par l'id de la scène.
- Décor : le marqueur d'accent (`.marqueur`, `data-decor`) avance sur la ligne fine pendant toute la scène : son `data-dur` = durée de la scène. Sur la **dernière scène** de la vidéo, durée − 1 s : la vidéo doit finir sur une image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16 (en vertical, la ligne du schéma devient verticale). Ton clair par défaut, ton sombre sur demande.
- Transitions : `coupe`, `fondu`.

## Scènes toutes faites

| Nom | Rôle | Durée conseillée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Ouvrir la vidéo, titre démesuré | 7 s | etiquette (25), titre (40), sous (50) |
| `liste` | 2 à 4 points numérotés, alignés | 12 s | titre (40), point1 … point4 (45) |
| `chiffre` | Un chiffre clé démesuré | 7 s | titre (40), unite (3), legende (60) ; valeur dans `nombre 0→…` |
| `comparaison` | Deux colonnes sur une grille | 12 s | titre (40), gauche-titre (20), gauche-texte (60), droite-titre (20), droite-texte (60) |
| `etape` | Une étape, numéro géant | 8 s | numero (2), titre (40), texte (80) |
| `alerte` | Un point de vigilance, barre d'accent | 8 s | titre (40), texte (80) |
| `schema` | Trois temps sur une ligne | 8 s | titre (40), a, b, c (25) |
| `conclusion` | Le message à retenir et le logo | 6 s | titre (40), sous (50) |

## Classes du style

| Classe | Usage |
|---|---|
| `.index`, `.titre`, `.titre-moyen`, `.sous-titre`, `.texte`, `.chiffre-geant` | Typographie |
| `.monte`, `.revele`, `.regle` | Entrées courtes, règle qui se trace (à minuter) |
| `.decor` + `.repere`, `.marqueur` (`--x` en cqw) | Décor |
| `.rangs`, `.colonnes` + `.colonne` (`.accent`), `.etape` + `.numero-geant`, `.vigilance`, `.ligne-temps` + `.temps` | Mises en page des scènes |

## À faire, à éviter

- À faire : des titres très courts ; aligner tout à gauche ; un seul accent de couleur par scène.
- À éviter : le décor ; plusieurs couleurs ; les rebonds.
