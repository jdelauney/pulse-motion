# Style « editorial »

## L'essentiel

- Élégant, exigeant, calme : la typographie porte la vidéo, comme un magazine. Pour raconter (récit, témoignage, institutionnel) ou une formation posée.
- Polices fournies : **Fraunces** (titres, à empattements) et **Instrument Sans** (texte).
- Signature : filets fins qui se tracent, titres très grands, textes qui montent derrière un masque. Mouvements lents (`expo-out`), aucune couleur en aplat.
- Partir d'une des **8 scènes toutes faites** : `pulse-motion scene editorial <type>`, copier dans `scenes/NN-<id>.html`, remplacer `data-scene="<type>"` par l'id de la scène.
- Décor : la ligne fine (`.ligne`, `data-decor`) se trace pendant toute la scène : son `data-dur` = durée de la scène. Sur la **dernière scène** de la vidéo, durée − 1 s : la vidéo doit finir sur une image stable d'au moins 0,5 s.
- Formats 16:9, 1:1 et 9:16 (en vertical, volets et schéma s'empilent). Ton clair par défaut (fond crème), ton sombre sur demande.
- Transitions : `fondu`, `rideau`.

## Scènes toutes faites

| Nom | Rôle | Durée conseillée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Ouvrir la vidéo ou un chapitre | 7 s | etiquette (25), titre (40), sous (50) |
| `liste` | 2 à 4 points, comme un sommaire | 12 s | titre (40), point1 … point4 (45) |
| `chiffre` | Un chiffre clé en très grand | 7 s | titre (40), unite (3), legende (60) ; valeur dans `nombre 0→…` |
| `comparaison` | Deux volets séparés par un filet | 12 s | titre (40), gauche-titre (20), gauche-texte (60), droite-titre (20), droite-texte (60) |
| `etape` | Une étape, numéro à empattements | 8 s | numero (2), titre (40), texte (80) |
| `alerte` | Un point de vigilance entre deux filets | 8 s | titre (40), texte (80) |
| `schema` | Trois temps reliés par des flèches fines | 8 s | titre (40), a, b, c (25) |
| `conclusion` | Le message à retenir et le logo | 6 s | titre (40), sous (50) |

## Classes du style

| Classe | Usage |
|---|---|
| `.surtitre`, `.titre`, `.titre-moyen`, `.chapo`, `.texte`, `.chiffre-geant` | Typographie (tailles en cqh déjà réglées pour les trois formats) |
| `.masque`, `.fondu` | Entrées lentes, calées sur le `data-start` de l'élément |
| `.filet`, `.filet.court`, `.filet.accent` | Filet qui se trace (à minuter) |
| `.decor` + `.ligne` (`--l` de 0 à 1), `.guillemet` | Décor |
| `.sommaire`, `.duo` + `.volet`, `.etape` + `.numeral`, `.encadre`, `.chaine` + `.maillon` + `.lien` | Mises en page des scènes |

## À faire, à éviter

- À faire : laisser respirer ; une seule couleur vive par scène ; des titres courts qui tiennent en deux lignes.
- À éviter : rebonds, mouvements rapides, aplats de couleur, plus de 4 points dans une liste.
