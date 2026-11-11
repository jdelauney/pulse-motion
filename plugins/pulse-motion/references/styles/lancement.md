# Style « lancement »

> Le film de lancement où l'interface est la vedette : presque noir, lumière douce, cartes qui s'aimantent, reflet sur le titre, nombre géant, un seul accent.
> Sources : lemo-opuscar, `dark-keynote` (MIT, © 2026 LemoLab) ; take-one, `monochrome-launch`, `dark-premium` (MIT) ; adaptés.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene lancement <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.grille`, `.lumiere`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16. Ton sombre seulement.
- Une action par temps ; longueurs maximales du § 10.

## 1. Essence, et ce qu'il n'est pas

- Presque noir, grille au trait fin, une lumière douce qui glisse ; des cartes d'interface sobres qui viennent se ranger ; un reflet qui passe sur le titre ; un nombre géant au trait fin ; un seul élément coloré.
- Pas `tech-sombre` : ni terminal, ni invite de commande, ni curseur. Pas `minimal` : sombre, avec de la lumière et de la profondeur. Pas de 3D CSS : la profondeur vient des ombres.

## 2. Matières et rendu

- HTML et CSS : `radial-gradient` pour la lumière (`.lumiere`, sur `--lx`) et le `.voile` des bords ; `.grille` à 5 % qui monte.
- `.carte-ui` en HTML : fond à peine plus clair, bord fin, ombre, `.barre-ui` grise. Un bloc « interface » du moteur se pose tel quel.

## 3. Logique de couleur

- Fond quasi noir, texte gris clair ; `--c-accent` de la charte est le seul élément coloré de la scène (carte `.active`, numéro, point actif, unité) ; `--c-primaire` teinte la lumière et le reflet.
- Jamais deux accents à la fois ; jamais de gris trop sombre pour le texte.
- Palette d'exemple (celle du style) : violet `#a78bfa`, bleu clair `#93c5fd`, noir `#09090b`.

## 4. Typographie et sous-titres

- **Sora** 600 : titres (9 cqh, moyen 6) ; Sora 300 : nombre géant (26 cqh, `tabular-nums`), numéros ; **Manrope** 400 et 600 : texte (3,8 cqh), étiquettes.
- Sous-titres du moteur ; lisibilité : `controles.md`.

## 5. Qualité du mouvement

- `.monte` : `expo-out`, 0,5 s ; `.aimante` : `back-out`, 0,25 s depuis une place fixe (`--dx`, `--dy`) ; reflet 0,5 s après l'arrivée, en 1,2 s.
- Une action par temps, 0,3 à 1 s entre deux.
- Conseillés : #035, #021, #020. Déconseillés : #036, #028, #049.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Zoom avant lent (#056) | entrer dans le produit | une carte, un tableau de bord |
| Parallaxe (#063) | la profondeur | la lumière derrière les cartes |
| Zoom sur un détail (#037) | montrer la fonction | un bouton, un chiffre |
| Plan fixe | laisser lire | les scènes à texte |

- Mouvements lents et amortis ; ni plan incliné, ni caméra à l'épaule.
- Transitions : `fondu`, `zoom`, `coupe`. À éviter : `volets`, `rideau`, `whip`.
- Shaders conseillés, jamais imposés (WebGPU) : `vignettage`, `grain` léger.

## 7. Palette sonore

- Ambiance `tech` par défaut, `corporate` en alternative.
- Bruitages : forme → `clic` (une carte qui s'aimante) ; texte → `frappe` ; transition → `souffle` ; les autres entrées sans son propre.
- Matière : aucune. Moment fort : `basse`, sur le nombre qui se fige.
- Des sons rares et précis ; le silence fait partie du luxe.

## 8. Gestes natifs

- **Cent fenêtres qui se rangent.** *Recette :* `.carte-ui.aimante` en série, `--dx`, `--dy` fixes. *Convient à :* des fonctions ; une gamme ; des avis.
- **La lumière révèle.** *Recette :* `.reflet` sur un titre (#035), `.lumiere` qui glisse. *Convient à :* le nom du produit ; la promesse ; le prix.
- **Le nombre se fige.** *Recette :* `.nombre`, `nombre 0→…` (#021), `data-moment-fort`. *Convient à :* des utilisateurs ; un gain de temps ; une date.
- **La carte qui s'allume.** *Recette :* `.carte-ui.active`. *Convient à :* la bonne offre ; la nouveauté ; la fonction phare.

## 9. Pièges

- Gris sur noir : ne pas assombrir `.texte`. Trop de mouvements : une action par temps. Deux accents : aucun ne compte.
- Lumière en disque net : des bandes apparaissent ; la garder douce et large.
- Export : ni `backdrop-filter`, ni `mix-blend-mode`.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Titre que la lumière balaie | 7 s | etiquette 24, titre 36, sous 50 |
| `liste` | 2 à 4 fenêtres qui s'aimantent | 12 s | titre 36, point1 … point4 42 |
| `chiffre` | Un nombre géant qui se fige | 7 s | titre 36, unite 3, legende 56 ; `nombre 0→…` |
| `comparaison` | Deux cartes, la seconde allumée | 12 s | titre 36, gauche-titre et droite-titre 20, gauche-texte et droite-texte 60 |
| `etape` | Une étape, numéro au trait fin | 8 s | numero 2, titre 36, texte 76 |
| `alerte` | Un point d'attention en notification | 8 s | titre 36, texte 76 |
| `schema` | Trois cartes reliées | 8 s | titre 36, a, b, c 22 |
| `moyeu` | Centre et parties | 10 s | titre 36, centre 20, parties 18 |
| `conclusion` | Le message et le logo | 6 s | titre 36, sous 50 |

Point ou logo absent : retirer son élément et sa clé.
- Texte : `.surtitre`, `.titre`, `.titre-moyen`, `.texte`, `.nombre`, `.unite`, `.accent`.
- Entrées : `.monte`, `.aimante` (`--dx`, `--dy`), `.reflet`. Décor : `.decor` + `.grille`, `.lumiere`, `.voile`.
- Scènes : `.carte-ui` (`.active`), `.carte-titre`, `.barre-ui`, `.pile-ui`, `.duo`, `.numero-fin`, `.notification`, `.chaine-ui`.

Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : la carte allumée, le chemin de la lumière, le nombre qui se fige, le rythme des aimantations.
- Structures : le problème → le produit → le chiffre ; trois fonctions → la nouveauté ; avant → après → la date de sortie.
- Ouvertures : le nom du produit dans la lumière ; des fenêtres qui se rangent ; un nombre seul.
- Fins : la promesse et le logo ; la date de sortie ; la carte allumée.
- Usages : lancer un produit ou une offre ; présenter un logiciel ; annoncer une nouveauté.
