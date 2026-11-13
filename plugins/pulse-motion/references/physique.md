# Mouvement physique : marche calculée, vent, pendules

## L'essentiel

- Tout est calculé depuis le temps de la vidéo, sans mémoire d'une image à l'autre : l'aperçu, l'export rapide et l'export fidèle montrent la même chose au même instant, dans n'importe quel ordre.
- Rien n'est imposé : sans `data-demarche`, sans vent et sans `data-pendule`, une vidéo reste exactement la même.
- Un style s'en sert par ses gestes (fiche § 8) : marche calculée, vent qui traverse la scène, enseigne ou lampe qui se balance.

## Marche calculée

```html
<div id="passant" data-personnage="passant" data-demarche="calculee" data-x="-8" data-taille="45">
  <i id="aller" data-action="marcher" data-vers="60" data-start="0.3" data-dur="3"></i>
  <i data-action="courir" data-vers="110" data-start="#aller:fin" data-dur="1.2"></i>
</div>
```

- `data-demarche="calculee"` sur le personnage : de **profil** (vues 0 et 180), ses marches et ses courses sont calculées pas à pas : le pied posé reste immobile au sol, le talon décolle avant le pas, la hanche descend quand les deux pieds sont posés, la course a une phase de vol. Dans les autres vues (3/4, face, dos), le mouvement `marche` ou `course` s'applique ; un demi-tour passe de l'un à l'autre en douceur.
- Le rythme des pas suit la distance parcourue : une marche plus lente (`data-dur` plus long) fait des pas plus lents, jamais de glissement.
- Démarches livrées (`personnages/clips/demarches/`) : `marche` (pour `marcher`), `course` (pour `courir`), `pas-traines` (petits pas au ras du sol : fatigue, jupe étroite, sabots). Une autre : `data-clip="pas-traines"` sur l'action `marcher`.
- Une démarche à soi : `personnages/clips/demarches/<nom>.json` dans la vidéo, `{ "nom", "description", "genre": "marche" | "pas-traines" | "course", "foulee", "periode", "appui" }` ; `foulee` : distance que parcourt le pied posé sous le corps, en longueurs de jambe (0,2 à 1,2 ; marche 0,7) ; `periode` : durée de deux pas (0,3 à 2 s) ; `appui` : part du cycle où un pied est posé (marche : plus de 0,5, double appui ; course : moins de 0,5, vol).
- « Il marche à petits pas » : `pas-traines`, ou une démarche à soi à `foulee` plus courte. « Il court en bondissant » : `appui` plus court (0,3).
- Vérifier de près : `pulse-motion planche . --suivre <id du personnage>` (le pied posé ne doit pas bouger d'une vignette à l'autre).

## Vent

- Par scène, sur la `<section data-scene>` : `data-vent="calme|brise|rafales|tempete"` et `data-vent-dir` (degrés, vers où souffle le vent : 0 vers la droite, 180 vers la gauche, 90 vers le bas ; 0 par défaut).
- Dans le déroulé, pour toute la vidéo : `"vent": [{ "de": 0, "force": 0.3, "dir": 0 }, { "de": 12, "force": 0.8, "dir": 180 }]` (`de` en secondes depuis le début de la vidéo, `force` de 0 à 1).
- Chaque changement se fait en 1 s, sans saut d'une scène à l'autre ; une scène sans `data-vent` garde le vent qui souffle. Avant la première clé : calme. Les rafales sont des coups de vent irréguliers, toujours les mêmes d'un rendu à l'autre.
- Il pousse : les pendules (`data-pendule`), les os en plus (queue, oreilles, cape), l'écharpe et les objets portés des personnages au trait de plume, et le milieu des particules (`data-milieu`), dont la fumée part dans le sens du vent.
- Personnages au trait de plume : avec une piste de vent (même `calme`) ou une marche calculée, l'écharpe flotte derrière qui marche et la mallette se balance au poignet ; sinon, elles pendent droit.

## Pendules

```html
<svg viewBox="0 0 100 100" style="position: absolute; right: 10cqh; top: 0; width: 30cqh; height: 30cqh">
  <g data-pendule="14 0.15"><line x1="50" y1="0" x2="50" y2="40" /><rect x="30" y="40" width="40" height="22" /></g>
</svg>
```

- `data-pendule="<longueur> <amorti>"` sur un groupe SVG (`<g>`), dans tout style : il pend du milieu de son bord haut (enseigne, lampe, carillon, étiquette suspendue). `longueur` en cqh (plus elle est grande, plus il balance lentement : 14 cqh, une seconde environ), `amorti` de 0 (il balance longtemps) à 1 (il s'arrête tout de suite).
- Sans vent, il reste droit ; il penche sous le vent et bouge avec les rafales.

## Règles

`physique-invalide` (erreur) : `data-vent`, `data-vent-dir` ou `data-pendule` mal écrits ou mal placés ; `personnage-invalide` : `data-demarche` autre que `calculee`, ou une démarche calculée choisie par `data-clip` sans `data-demarche` sur le personnage.
