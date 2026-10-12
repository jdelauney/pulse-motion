# Écrire une scène pour le moteur Pulse Motion

## L'essentiel

- Une scène = un fichier `scenes/NN-nom.html` qui contient **une seule** `<section data-scene="<id>">`, avec l'`id` de la scène dans `deroule.json`.
- Les textes ne s'écrivent **jamais** dans le HTML : `<h1 data-texte="titre"></h1>` est rempli avec `scenes[].textes.titre` du déroulé. Chaque clé `data-texte` doit exister dans le déroulé.
- Les temps sont **relatifs au début de la scène**, en secondes : `data-start="0.4"`, `data-start="#titre+0.3"` (début de `#titre` + 0,3 s), `data-start="#titre:fin+0.2"` (fin de `#titre` + 0,2 s). `data-dur` vaut 1 s par défaut.
- Tout ce qui bouge est **calé sur le temps** : animations CSS (`@keyframes`), `--p` (progression 0→1 de l'élément), `data-tween`. Jamais de `transition:` CSS (neutralisée), jamais de `setTimeout`.
- Tailles en `cqh` (1 cqh = 1 % de la hauteur de l'image), couleurs et polices **uniquement** par les variables de la charte : `--c-primaire`, `--c-accent`, `--c-fond`, `--c-texte`, `--f-titres`, `--f-texte`.
- Couleurs **prêtes à lire**, calculées par l'assemblage : `--c-primaire-lisible` et `--c-accent-lisible` (la couleur de la marque, foncée ou éclaircie juste assez pour se lire sur `--c-fond`), `--c-sur-primaire` et `--c-sur-accent` (noir ou blanc, pour un texte posé sur un aplat de cette couleur). Le ton (`clair` ou `sombre`) est posé sur `#pm-scene` : `#pm-scene[data-ton="sombre"]`.
- Interdits (export rapide) : `filter: url(…)`, `mix-blend-mode`, `backdrop-filter`. Interdites aussi : les ressources sur internet (images, polices, CDN).
- Après écriture : `pulse-motion assembler <dossier>` puis `pulse-motion controler <dossier>`, et corriger chaque erreur.
- Effets de particules (étincelles, confettis, fumée…) : une balise `<div data-effet="…">` minutée ; tout est dans `pulse-motion reference particules`.

## Structure d'une scène

```html
<section data-scene="chaine">
  <style>
    @scope {
      .carte { padding: 4cqh; border-radius: 2cqh; background: var(--c-fond); }
    }
  </style>
  <h2 id="titre" class="titre-moyen entre-bas" data-texte="titre" data-start="0.2" data-dur="0.7"></h2>
  <p id="detail" class="texte entre-bas" data-texte="detail" data-start="#titre:fin+0.3" data-dur="0.7"></p>
</section>
```

- Le CSS propre à la scène va dans un `<style>` avec `@scope { … }` : il ne touche pas les autres scènes.
- La section occupe toute l'image (16:9, 9:16 ou 1:1 selon le déroulé) ; le style fournit la mise en page de base.
- Images : fichiers copiés dans `assets/` et référencés en relatif (`<img src="assets/photo.jpg" alt="…">`, `url('assets/fond.svg')`). Elles sont embarquées dans la page.
- Logo de la charte : `<img data-logo alt="">` (le moteur pose la source).

## Minutage

| Attribut | Valeur | Effet |
|---|---|---|
| `data-start` | `0.4`, `#id+0.3`, `#id-0.2`, `#id:fin+0.2` | Début de l'élément, relatif à la scène ou à un autre élément **de la même scène** (minuté, avec un `id`) |
| `data-dur` | `1.2` | Durée en secondes (1 par défaut) |
| `data-tween` | `opacity 0→1 back-out; --x -10cqh→0cqh` | Interpole des valeurs pendant `[début, fin]` |

Le moteur pose sur chaque élément minuté :
- `--p` : progression de 0 (avant le début) à 1 (après la fin) ;
- `data-etat` : `avant`, `pendant` ou `apres`.

Le `rythme` du déroulé étire tous les temps d'une scène : « ralentis la scène 3 » se règle dans le déroulé, pas dans le HTML.

## Faire bouger

1. **Animation CSS** (le plus courant) : une classe avec `animation: nom durée courbe both;`. Le moteur cale l'animation sur le `data-start` de l'élément (ou de son ancêtre minuté le plus proche). Avec `both`, l'élément montre l'état de départ avant de commencer.
2. **`--p` dans le CSS** : `transform: translateX(calc((1 - var(--p)) * 20cqh));`, `stroke-dashoffset: calc(100 * (1 - var(--p)));` (tracé d'un chemin SVG avec `pathLength="100"`).
3. **`data-tween`** : `propriété départ→arrivée [courbe]`, clauses séparées par `;`. Unités identiques des deux côtés (un `0` sans unité prend celle de l'autre borne). Propriété spéciale `nombre` : affiche la valeur en français (`nombre 0→1250` → « 1 250 » ; `nombre 0→3.5` → « 3,5 »).
4. **`M.chaqueImage`** (rare) : `<script>M.chaqueImage('id-scene', function (p, t) { … });</script>` reçoit la progression `p` de la scène et son temps `t`. Seul JavaScript permis ; `Math.random()` y donne la même valeur pour la même image.

## Courbes

Nom = `<type>-<mode>` (ex. `cubic-out`, `back-inout`, `bounce-out`, `quad-spike`).

- Types : `linear`, `quad`, `cubic`, `quart`, `quint`, `expo`, `sine`, `circle`, `elastic`, `back`, `bounce`, `bell`, `power`, `step`, `swing`, `jitter`, `wave`, `tardis`, `cubic-bezier`, `ressort`.
- Modes : `in`, `out`, `inout`, `outin` ; aller-retour : `spike` (monte puis redescend, pour mettre en valeur), `arch`, `spike-arch`, `arch-spike` ; inverses : `in-inv`, `out-inv`, `spike-inv`, `arch-inv`, `spike-arch-inv`.
- Dans le CSS : `animation-timing-function: var(--ease-<type>-<mode>)` pour les types `quad` à `bounce` et les modes `in`, `out`, `inout` (ex. `var(--ease-back-out)`).

## Signaux d'alerte

| Vous écrivez… | Problème | À la place |
|---|---|---|
| Du texte dans le HTML | La retouche « change le titre » ne marche plus | `data-texte="clé"` + texte dans le déroulé |
| `transition: opacity .5s` | Neutralisé : l'image dépendrait du chemin | `@keyframes` + classe, ou `--p` |
| `font-size: 24px` | Ne suit pas le format de l'image | `cqh` (texte ≥ 3,5 cqh) |
| `color: #1d4ed8` | Ignore la charte de la personne | `var(--c-primaire)` |
| `data-start="#titre+1"` sur un `#titre` sans `data-start` ni `data-dur` | Référence inconnue | Minuter `#titre`, ou partir de `0` |
| `<img src="https://…">` | La vidéo ne marche plus hors ligne | Copier le fichier dans `assets/` |
| Une scène où rien ne bouge pendant 3 s | Temps mort signalé | Décor qui dérive (`.decor .rond`) ou entrée échelonnée |
