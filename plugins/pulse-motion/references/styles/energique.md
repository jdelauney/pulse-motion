# Style « energique »

## L'essentiel

- Audacieux, rapide, percutant : la couleur partout, des aplats, des titres géants en capitales. Pour les réseaux sociaux, un lancement, une annonce ; pensé aussi pour le format vertical.
- Polices fournies : **Anton** (titres, capitales étroites) et **Archivo** (texte).
- Signature : titres qui tombent et rebondissent (`bounce-out`), bandeaux en aplat, bandes qui défilent. Entrées courtes (0,45 à 0,7 s).
- Textes plus courts que dans les autres styles (titre ≤ 28 caractères) : la longueur maximale de chaque texte est dans le tableau.
- Partir d'une des **8 scènes toutes faites** : `pulse-motion scene energique <type>`, copier dans `scenes/NN-<id>.html`, remplacer `data-scene="<type>"` par l'id de la scène.
- Décor : les bandes (`.bandes`, `data-decor`) défilent pendant toute la scène : leur `data-dur` = durée de la scène. Sur la **dernière scène** de la vidéo, durée − 1 s : la vidéo doit finir sur une image stable d'au moins 0,5 s.
- Formats 16:9, 1:1 et 9:16. Ton clair par défaut (fond jaune), ton sombre sur demande (fond noir, aplats à l'accent).
- Transitions : `coupe`, `balayage`, `zoom`.

## Scènes toutes faites

| Nom | Rôle | Durée conseillée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Ouvrir fort | 6 s | etiquette (20), titre (28), sous (40) |
| `liste` | 2 à 4 points qui tombent un par un | 10 s | titre (28), point1 … point4 (32) |
| `chiffre` | Un chiffre choc | 6 s | titre (28), unite (3), legende (45) ; valeur dans `nombre 0→…` |
| `comparaison` | Avant / après en face à face | 10 s | titre (28), gauche-titre (16), gauche-texte (50), droite-titre (16), droite-texte (50) |
| `etape` | Une étape, numéro en pastille | 7 s | numero (2), titre (28), texte (70) |
| `alerte` | Un point d'attention, bande de chantier | 7 s | titre (28), texte (70) |
| `schema` | Trois blocs enchaînés | 7 s | titre (28), a, b, c (20) |
| `conclusion` | L'appel à l'action et le logo | 5 s | titre (28), sous (40) |

## Classes du style

| Classe | Usage |
|---|---|
| `.cri`, `.cri-moyen`, `.texte`, `.bandeau`, `.chiffre-choc` | Typographie |
| `.tombe`, `.claque`, `.volet` | Entrées vives, calées sur le `data-start` de l'élément |
| `.decor` + `.bandes` (`--x`) | Décor |
| `.pile`, `.face-a-face` + `.carte.creuse` / `.carte.pleine`, `.etape` + `.pastille`, `.danger`, `.enchainement` + `.maillon` + `.chevron` | Mises en page des scènes |

## À faire, à éviter

- À faire : une idée par écran ; des verbes d'action ; la couleur de la marque en aplat.
- À éviter : les longs paragraphes ; plus de trois couleurs ; un texte en couleur de marque sans la variable lisible.
