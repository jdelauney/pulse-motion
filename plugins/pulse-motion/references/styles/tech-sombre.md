# Style « tech-sombre »

> Un écran de développeur, propre : fond sombre, grille qui glisse, texte qui s'écrit au clavier avec son curseur, chiffres à chasse fixe, un accent lumineux.
> Sources : Style d'origine Pulse Motion.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene tech-sombre <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.grille`, `.balayage`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16. Ton sombre par défaut ; clair sur demande, ou choisi seul (`auto`) quand la marque est foncée.
- Phrases courtes et factuelles ; longueurs maximales du § 10.

## 1. Essence, et ce qu'il n'est pas

- Fond bleu nuit ; grille fine qui glisse ; invite « > », lignes de journal « [1] », console à trois pastilles ; texte révélé de gauche à droite comme tapé ; un seul accent lumineux par scène.
- Pas `minimal` : fond sombre, chasse fixe, décor qui bouge. Pas une science-fiction : ni néon partout, ni hologramme, ni glitch à chaque scène. Pas `chaleureux` : aucune forme ronde, aucune couleur chaude vive.

## 2. Matières et rendu

- HTML et CSS : fond uni, grille en dégradés de 0,15 cqh, bordures fines, lueur douce de l'accent ; ni canevas, ni texture, ni module.
- `.grille` glisse sur `--x`, `--y` en linéaire ; `.balayage` descend sur `--y` ; toute la scène.

## 3. Logique de couleur

- Fond sombre neutre, texte clair ; `--c-primaire` de la charte pour le cadre des nœuds et les titres en couleur ; `--c-accent` pour l'invite, le curseur, les jauges, le panneau actif et la lueur, en version lisible.
- Un seul élément lumineux (`.lumineux`) par scène ; jamais de couleur chaude vive.
- Ton clair : fond `#f8fafc`, texte `#0f172a`, sans lueur. Palette d'exemple (celle du style) : bleu ciel `#38bdf8`, cyan `#22d3ee`, nuit `#0b1020`.

## 4. Typographie et sous-titres

- Polices fournies : **Space Grotesk** 700, titres (9 cqh, moyen 6,2) ; **JetBrains Mono**, texte (3,9 cqh) et chiffres (22 cqh), chasse fixe. Une autre police : son fichier dans `assets/`.
- Sous-titres : habillage du moteur ; lisibilité : `controles.md`.

## 5. Qualité du mouvement

- `.ecrit` révèle le texte avec `--p` : sa `data-dur` fixe la vitesse de frappe (0,8 à 1,4 s) ; `.glisse` : 3 cqh en `expo-out` (0,6 s) ; décor linéaire.
- Net et régulier : 0,1 à 0,6 s entre deux entrées ; le curseur clignote trois fois puis s'arrête.
- Conseillés : #015, #020, #021, #011. Déconseillés : #001, #007, #028.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Zoom sur un détail (#037) | inspecter | une ligne de code, une mesure |
| Panoramique (#057) | parcourir une interface | un tableau de bord, un graphe |
| Zoom continu (#086) | plonger dans le système | une architecture, des données |
| Plan fixe | la console | la plupart des scènes |

- Cadrage aligné sur la grille ; caméra linéaire ou amortie, jamais de rebond.
- Transitions : `fondu`, `glissement`. À éviter : `rideau`, `retournement`.
- Shaders conseillés, jamais imposés (WebGPU) : `aberration` légère ; `glitch` seulement pour une vraie rupture.

## 7. Palette sonore

- Ambiance `tech` par défaut, `corporate` en alternative.
- Bruitages : texte → `clic` ; chiffre → `tic` ; les autres entrées sans son propre ; transition : son de la transition (`glissement` → `whoosh`).
- Matière : aucune. Moment fort : `basse`.
- Sons brefs et réguliers ; pas de son à chaque lettre.

## 8. Gestes natifs

- **Texte tapé.** *Recette :* `.ecrit.curseur`, `data-dur` = vitesse ; #015 pour un titre lettre par lettre. *Convient à :* une commande ; une réponse d'un outil ; une phrase clé.
- **Jauge.** La mesure se remplit avec le compteur. *Recette :* `.jauge` (`--p`) et `nombre 0→…` (#021). *Convient à :* un taux ; une performance ; une capacité.
- **Panneau actif.** L'un des deux s'allume. *Recette :* `.panneau.actif`, puis `.lumineux` sur son titre. *Convient à :* avant et après ; deux versions ; le bon choix.

## 9. Pièges

- Plus de trois panneaux à l'écran : illisible.
- Frappe trop rapide pour un texte long : allonger `data-dur` de l'élément `.ecrit`.
- Lueur sur fond clair : elle bave ; le ton clair l'enlève déjà.
- Export : ni `mix-blend-mode`, ni filtre SVG, ni `transition` CSS ; numéros « [1] » en clair.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Ouvrir, invite de commande | 7 s | etiquette 25, titre 40, sous 50 |
| `liste` | 2 à 4 lignes de journal | 12 s | titre 40, point1 … point4 45 |
| `chiffre` | Une mesure, jauge | 7 s | titre 40, unite 3, legende 60 ; `nombre 0→…` |
| `comparaison` | Deux panneaux, l'un actif | 12 s | titre 40, gauche-titre et droite-titre 20, gauche-texte et droite-texte 60 |
| `etape` | Une étape numérotée | 8 s | numero 2, titre 40, texte 80 |
| `alerte` | Un avertissement en console | 8 s | titre 40, texte 80 |
| `schema` | Trois nœuds reliés | 8 s | titre 40, a, b, c 25 |
| `moyeu` | Un centre, 3 à 5 parties reliées | 10 s | titre 40, centre 24, partie1 … partie5 22 |
| `conclusion` | Le message et le logo | 6 s | titre 40, sous 50 |

Point ou logo absent : retirer son élément et sa clé.
- Texte : `.invite`, `.titre`, `.titre-moyen`, `.texte`, `.chiffre-mono`, `.lumineux`.
- Entrées : `.ecrit` (`data-start`, `data-dur`), `.curseur`, `.glisse`. Décor : `.decor` + `.grille`, `.balayage`.
- Scènes : `.journal` ; `.jauge` ; `.diff`, `.panneau` (`.actif`), `.panneau-titre` ; `.etape`, `.index` ; `.console`, `.console-barre`, `.console-corps` ; `.graphe`, `.noeud`, `.connecteur` ; `.logo`.

Modules du moteur : aucun. Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : ce qui s'écrit et ce qui glisse, l'élément lumineux de chaque scène, la vitesse de la grille, le ton.
- Structures : problème → commande → résultat ; avant → après → chiffre ; trois étapes d'une installation.
- Ouvertures : une invite qui s'écrit ; une mesure qui monte ; une erreur en console.
- Fins : le résultat et le logo ; la commande à retenir ; un « prêt » qui s'écrit.
- Usages : démontrer un logiciel ; présenter des données ; faire un tutoriel technique.
