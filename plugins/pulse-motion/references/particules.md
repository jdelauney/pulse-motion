# Effets de particules

## L'essentiel

- Un effet = une balise vide dans la scène : `<div data-effet="etincelles"></div>`. Aucun JavaScript.
- Elle se minute comme le reste (`data-start`, `data-dur`) : `data-dur` est la **durée d'émission** ; les particules déjà nées finissent leur vie après.
- `data-ancre="#id"` : les particules naissent sur la boîte de cet élément (et la suivent s'il bouge). Sans ancre : la boîte de la balise elle-même, c'est-à-dire toute la scène.
- `data-calque="arriere"` : derrière le contenu (ambiance) ; `avant` (par défaut) : devant (mise en valeur).
- `data-reglages="nombre: 300; couleur: accent"` : seulement les réglages de la table ci-dessous. Couleurs : `#rrggbb` ou `primaire`, `accent`, `texte`, `fond` (charte).
- Pour une ambiance (neige, pluie, poussière, fumée), régler `data-dur` sur la durée de la scène (ou presque) : l'effet n'émet que pendant `data-dur`, 1 s par défaut. `nombre` est un total émis pendant `data-dur` pour les effets continus (neige, pluie, poussière, fumée, feu, paillettes, énergie, étincelles, braises) : une durée plus longue étale le même nombre plus finement ; d'un coup pour confettis, explosion et feu d'artifice ; `etincelles` de `feu` est un débit par seconde.
- `data-graine="7"` : un autre tirage du hasard (« fais-les partir autrement »), même recette.
- Un effet **sert un propos** : mettre en valeur un chiffre, célébrer une conclusion, poser une ambiance. Jamais pour décorer.
- Après écriture : `pulse-motion assembler .` puis `pulse-motion controler .` ; les erreurs `effet-…`, `reglage-invalide`, `ancre-introuvable` se corrigent dans la scène.

## Poser un effet

```html
<h2 id="chiffre" class="grand-chiffre" data-texte="chiffre" data-start="0.3"></h2>
<div data-effet="etincelles" data-ancre="#chiffre" data-start="#chiffre:fin" data-dur="1.5"
     data-reglages="nombre: 300; couleur: accent"></div>
```

| Attribut | Valeurs |
|---|---|
| `data-effet` | nom d'un effet de la table, ou d'une recette du projet (`effets/<nom>.json`) |
| `data-ancre` | `#id` d'un élément de la même scène |
| `data-calque` | `avant` (défaut) ou `arriere` |
| `data-reglages` | `nom: valeur` séparés par `;` |
| `data-graine` | entier |
| `data-start`, `data-dur` | comme tout élément minuté ; `data-dur` = durée d'émission (1 s par défaut) |

Pour une zone précise sans élément à viser, donner une classe à la balise (`<div class="zone-feu" data-effet="feu">`) et une position et une taille dans le `@scope` de la scène : `.zone-feu { inset: 70% auto auto 30%; width: 40%; height: 10%; }`.

## Bibliothèque

| Effet | Réglages | Quand l'utiliser |
|---|---|---|
| `etincelles` | `nombre`, `vitesse`, `couleur`, `gravite`, `taille` | Mettre en valeur un chiffre ou un mot à son arrivée (ancre sur l'élément, 1 à 2 s). `couleur: bleu` n'existe pas : donner un `#rrggbb`, toute la gerbe prend cette teinte. |
| `braises` | `nombre`, `vitesse`, `couleur`, `gravite`, `taille` | Ambiance chaude et calme qui monte (calque arrière), sujets sur la chaleur, l'énergie, la passion. |
| `confettis` | `nombre`, `vitesse`, `couleur1`, `couleur2`, `couleur3` | Célébrer : conclusion, résultat obtenu, félicitations. Une seule fois par vidéo. |
| `feu-artifice` | `fusees`, `eclats`, `couleur`, `hauteur` | Grande célébration (lancement, fin de parcours) ; plutôt hors formation. |
| `fumee` | `nombre`, `couleur`, `opacite`, `vent`, `taille` | Ambiance, mystère, chaleur qui s'échappe ; calque arrière. |
| `feu` | `intensite`, `hauteur`, `couleur`, `etincelles` | Montrer une combustion, un danger, une urgence ; ancre sur une zone basse. |
| `poussiere` | `nombre`, `couleur`, `eclat`, `vitesse` | Fond vivant et discret qui évite les temps morts (calque arrière, toute la scène) ; sur un fond clair, `couleur: primaire` ou `#8fa6c4`. |
| `neige` | `nombre`, `vitesse`, `vent`, `taille`, `couleur` | Froid, hiver, calme ; toute la scène, calque arrière ; l'image est déjà garnie de flocons dès le début ; sur un fond clair, `couleur: primaire` ou `#8fa6c4`. |
| `pluie` | `nombre`, `vent`, `couleur`, `opacite` | Météo, humidité, ambiance triste ; toute la scène, calque arrière ; sur un fond clair, `couleur: primaire` ou `#8fa6c4`. |
| `paillettes` | `nombre`, `couleur`, `eclat`, `taille` | Révélation, nouveauté, « magie » d'une astuce ; ancre sur l'élément révélé. |
| `energie` | `nombre`, `couleur`, `rotation`, `eclat` | Puissance, technologie, idée qui s'allume ; ancre sur un pictogramme ou un mot. |
| `explosion` | `puissance`, `debris`, `couleur`, `fumee` | Transition choc, rupture, « boum » ; courte (salve unique). |

Voir une recette : `pulse-motion effet <nom>`.

## Dosage

- **Nombre** : c'est `/pulse-motion:creer` qui décide quelles scènes reçoivent un effet (au plus deux effets simultanés à l'écran ; en formation courte, un ou deux effets dans toute la vidéo) et le dit à l'animateur ; l'animateur n'en ajoute pas de lui-même. Un effet devant (`avant`) ne dure pas pendant la lecture d'un texte long (le contrôle `effet-sur-texte` le signale) ; préférer `arriere` pour une ambiance.
- **Fond clair** : la neige et la poussière, blanches par défaut, disparaissent sur un fond clair (style `clair-pedagogique`) : régler `couleur: primaire` ou un gris-bleu comme `#8fa6c4`.
- **Durées** : mise en valeur 1 à 2 s ; ambiance sur toute la scène ; célébration 2 à 3 s.
- **Quantité** : rester sous 300 000 particules par scène (contrôle `budget-particules`) ; les valeurs par défaut sont faites pour une image 16:9.
- **Couleurs** : laisser la charte (`primaire`, `accent`) pour les effets de mise en valeur ; une couleur de matière (feu, fumée, neige) reste réaliste.
- **Vidéo sobre** : un effet discret bien placé vaut mieux que trois effets spectaculaires.

## Retouches en une phrase

| Demande | Changement |
|---|---|
| « plus d'étincelles », « moins de confettis » | `nombre` dans `data-reglages` (× 2 ou ÷ 2), ou l'équivalent : `debris`, `eclats`, `etincelles` |
| « plus lent », « plus vif » | `vitesse` (0,6 ou 1,5) ou le réglage équivalent de l'effet (voir la table) |
| « en bleu », « aux couleurs de la marque » | `couleur: primaire` ou `#rrggbb` |
| « fais-les partir autrement » | `data-graine` (un autre entier) |
| « derrière le texte » | `data-calque="arriere"` |
| « plus tard », « plus longtemps » | `data-start`, `data-dur` |
| « enlève les confettis » | supprimer la balise |

## Créer un effet

Seulement si aucun effet de la table ne convient, dans le projet : `effets/<nom>.json`. **De préférence par héritage**, sous un **nouveau nom** : un fichier `etincelles.json` avec `etend: "etincelles"` serait un héritage circulaire, et sans `etend` il remplacerait la recette de la bibliothèque pour toute la vidéo :

```json
{
  "version": 1,
  "nom": "etincelles-bleues",
  "etend": "etincelles",
  "description": "Étincelles froides et plus lentes, pour un sujet sur le froid",
  "parametres": { "couleur": { "defaut": "#9fd3ff" }, "vitesse": { "defaut": 0.6 } },
  "emetteurs": [{ "nom": "gerbe", "forces": [{ "type": "gravite", "valeur": "30 * gravite" }, { "type": "trainee", "coef": 1.5 }] }]
}
```

`etend` fusionne les objets, remplace les tableaux et fusionne les émetteurs par `nom`. Une recette complète :

| Partie | Contenu |
|---|---|
| `parametres` | réglages exposés : `{ "defaut", "min", "max" }` (nombre) ou `{ "defaut", "type": "couleur" }` ; seuls eux se règlent dans la scène |
| `rendu_calque` | `bloom` (valeurs usuelles 0 à 4 ; 3 pour un éclat franc ; le moteur le normalise), `seuil_bloom` (1), `tons` (`douce`, ou `aces` pour un rendu cinéma) |
| `emetteurs[].naissance` | `debit` (par seconde) ou `salves` (`[{ "t", "nombre" }]`, 8 au plus), ou `nombre` pour un sous-émetteur ; `forme` (`point`, `cercle`, `anneau`, `rectangle`, `ligne`, `ancre` ; `zone`: `surface` ou `contour`) ; `vitesse` (`direction`, `cone` en degrés, `valeur`, `radiale`, `heritage`) ; `vie`, `taille`, `masse`, `z`, `rotation`, `vitesse_angulaire` |
| `emetteurs[].forces` | `gravite`, `trainee` (`quadratique`), `vent`, `turbulence`, `attracteur` (force négative : répulseur), `vortex`, `rappel` ; 8 au plus |
| `emetteurs[].vie` | au cours de la vie : `couleur` (`degrade` + `courbe`), `taille`, `intensite` (> 1 : brille), `opacite` (`{ "de", "a", "courbe" }`) |
| `emetteurs[].rendu` | `type` (`sprite`, `etincelle`, `trainee`, `planche`), `texture` (`disque-doux`, `etoile`, `fumee`, `flamme`, `eclat`, `confetti`, ou `assets/…`), `melange` (`additif` : lumière ; `alpha` : matière ; `premultiplie` : émission qui ne voile l'image qu'à hauteur de son alpha, comme un feu lumineux qui voile un peu), `flou` |
| `emetteurs[].a_la_mort` | `{ "emetteur": "<nom>" }` : sous-émetteur lancé à la mort (2 niveaux au plus) |

Valeurs : un nombre, un intervalle `[min, max]` tiré au hasard, ou une expression avec les réglages (`"30 * vitesse"`, `"nombre / dur"` ; `dur` = durée d'émission). Longueurs en cqh (1 % de la hauteur de l'image), temps en secondes, angles en degrés. Courbes : celles du moteur (`quad-out`, `sine-arch` pour monter puis redescendre, `wave` pour scintiller).

Ne pas recopier d'effets, de textures ni de shaders trouvés en ligne : leurs licences ne le permettent souvent pas ; écrire une recette originale.

## Régler à l'œil : l'atelier

Quand la personne veut régler un effet en le regardant (« laisse-moi régler les étincelles », « je veux voir ce que ça donne »), ou pour vérifier un effet de la bibliothèque :

- **Dans l'aperçu** : bouton **Effets** du lecteur. Choisir l'effet dans la liste (ou cliquer dessus dans l'image) ; les curseurs des réglages changent l'image tout de suite, sans recharger, et la lecture boucle sur l'effet. « Enregistrer » écrit `data-reglages` et `data-graine` dans la scène. « Recette complète » donne tous les champs de la recette ; « Enregistrer comme nouvel effet » écrit `effets/<nom>.json` (par `etend`) et fait pointer la balise dessus.
- **Hors de la vidéo** : `pulse-motion atelier [<effet>]` en arrière-plan, depuis le dossier de la vidéo, ouvre la page d'atelier : l'effet seul en boucle, fond clair (charte) ou sombre, zone d'émission à déplacer et redimensionner à la souris ; « Enregistrer » écrit dans `effets/` du projet (les réglages choisis deviennent les valeurs par défaut).
- Chaque enregistrement passe par l'historique : « annule » le défait. Si la scène a été modifiée entre-temps (une retouche), l'atelier refuse d'écrire et propose de recharger la page : rien n'est écrasé.
- Noms des nouveaux effets : minuscules, chiffres et tirets, différents de ceux de la bibliothèque (et de ceux du projet, sauf remplacement confirmé).
- Après un enregistrement, lire la scène ou la recette écrite pour savoir ce que la personne a choisi avant de retoucher autre chose.

## Signaux d'alerte

| Vous écrivez… | Problème | À la place |
|---|---|---|
| Trois effets devant un texte de 20 mots | Illisible, contrôle `effet-sur-texte` | Un seul, en `arriere`, ou après la lecture |
| `data-reglages="quantite: 300"` | Réglage inconnu (`reglage-invalide`) | Les réglages de la table |
| `data-ancre="titre"` | Il manque `#` | `data-ancre="#titre"` |
| Une recette recopiée et modifiée en entier | Difficile à retoucher | `etend` + les seuls changements |
| `nombre: 20000` sur une scène qui en a déjà | `budget-particules` | Baisser `nombre` ou la durée de vie |
