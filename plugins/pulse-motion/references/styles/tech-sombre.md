# Style « tech-sombre »

## L'essentiel

- Précis, moderne, technique : fond sombre par défaut, grille qui glisse, texte qui s'écrit au clavier. Pour une démo de logiciel, des données, un tutoriel technique.
- Polices fournies : **Space Grotesk** (titres) et **JetBrains Mono** (texte et chiffres, chasse fixe).
- Signature : `.ecrit` révèle le texte avec `--p` (durée de l'élément = vitesse de frappe), `.curseur` ajoute le curseur qui clignote, `.lumineux` donne l'accent lumineux.
- Partir d'une des **8 scènes toutes faites** : `pulse-motion scene tech-sombre <type>`, copier dans `scenes/NN-<id>.html`, remplacer `data-scene="<type>"` par l'id de la scène.
- Décor : la grille (`.grille`, `data-decor`) glisse pendant toute la scène : son `data-dur` = durée de la scène. Sur la **dernière scène** de la vidéo, durée − 1 s : la vidéo doit finir sur une image stable d'au moins 0,5 s.
- Formats 16:9, 1:1 et 9:16. Ton sombre par défaut ; ton clair sur demande, ou choisi seul (`auto`) quand les couleurs de la marque sont foncées.
- Transitions : `fondu`, `glissement`.

## Scènes toutes faites

| Nom | Rôle | Durée conseillée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Ouvrir la vidéo, invite de commande | 7 s | etiquette (25), titre (40), sous (50) |
| `liste` | 2 à 4 lignes de journal | 12 s | titre (40), point1 … point4 (45) |
| `chiffre` | Une mesure qui monte, jauge | 7 s | titre (40), unite (3), legende (60) ; valeur dans `nombre 0→…` |
| `comparaison` | Deux panneaux, l'un actif | 12 s | titre (40), gauche-titre (20), gauche-texte (60), droite-titre (20), droite-texte (60) |
| `etape` | Une étape numérotée | 8 s | numero (2), titre (40), texte (80) |
| `alerte` | Un avertissement dans une console | 8 s | titre (40), texte (80) |
| `schema` | Trois nœuds reliés | 8 s | titre (40), a, b, c (25) |
| `conclusion` | Le message à retenir et le logo | 6 s | titre (40), sous (50) |

## Classes du style

| Classe | Usage |
|---|---|
| `.invite`, `.titre`, `.titre-moyen`, `.texte`, `.chiffre-mono`, `.lumineux` | Typographie |
| `.ecrit` (avec `data-start` et `data-dur`), `.curseur`, `.glisse` | Texte qui s'écrit, curseur, entrée nette |
| `.decor` + `.grille` (`--x`, `--y`), `.balayage` (`--y`) | Décor |
| `.journal`, `.jauge`, `.diff` + `.panneau` (`.actif`), `.etape` + `.index`, `.console`, `.graphe` + `.noeud` + `.connecteur` | Mises en page des scènes |

## À faire, à éviter

- À faire : des phrases courtes et factuelles ; des chiffres précis ; un seul accent lumineux par scène.
- À éviter : les rebonds ; les couleurs chaudes vives ; plus de trois panneaux à l'écran.
