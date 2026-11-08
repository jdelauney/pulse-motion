# Écrire une scène pour le moteur Pulse Motion

## L'essentiel

- Une scène = un fichier `scenes/NN-nom.html` qui contient **une seule** `<section data-scene="<id>">`, avec l'`id` de la scène dans `deroule.json`.
- Les textes ne s'écrivent **jamais** dans le HTML : `<h1 data-texte="titre"></h1>` est rempli avec `scenes[].textes.titre` du déroulé. Chaque clé `data-texte` doit exister dans le déroulé.
- Les temps sont **relatifs au début de la scène**, en secondes : `data-start="0.4"`, `data-start="#titre+0.3"` (début de `#titre` + 0,3 s), `data-start="#titre:fin+0.2"` (fin de `#titre` + 0,2 s). `data-dur` vaut 1 s par défaut.
- Tout ce qui bouge est **calé sur le temps** : animations CSS (`@keyframes`), `--p` (progression 0→1 de l'élément), `data-tween`. Jamais de `transition:` CSS (neutralisée), jamais de `setTimeout`.
- Tailles en `cqh` (1 cqh = 1 % de la hauteur de l'image), couleurs et polices **uniquement** par les variables de la charte : `--c-primaire`, `--c-accent`, `--c-fond`, `--c-texte`, `--f-titres`, `--f-texte`.
- Couleurs **prêtes à lire**, calculées par l'assemblage : `--c-primaire-lisible` et `--c-accent-lisible` (la couleur de la marque, foncée ou éclaircie juste assez pour se lire sur `--c-fond`), `--c-sur-primaire` et `--c-sur-accent` (noir ou blanc, pour un texte posé sur un aplat de cette couleur). Le ton (`clair` ou `sombre`) est posé sur `#pm-scene` : `#pm-scene[data-ton="sombre"]`.
- Interdits (export rapide) : `filter: url(…)`, `mix-blend-mode`, `backdrop-filter`. Interdites aussi : les ressources sur internet (images, polices, CDN).
- Après écriture : `pulse-motion controler <dossier>` (il assemble la page), et corriger chaque erreur.
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
- La section occupe toute l'image (16:9, 9:16, 1:1 ou 4:5 selon le déroulé) ; le style fournit la mise en page de base.
- Images : fichiers copiés dans `assets/` et référencés en relatif (`<img src="assets/photo.jpg" alt="…">`, `url('assets/fond.svg')`). Elles sont embarquées dans la page.
- Logo de la charte : `<img data-logo alt="">` (le moteur pose la source).

## Minutage

| Attribut | Valeur | Effet |
|---|---|---|
| `data-start` | `0.4`, `#id+0.3`, `#id-0.2`, `#id:fin+0.2` | Début de l'élément, relatif à la scène ou à un autre élément **de la même scène** (minuté, avec un `id`) |
| `data-start` | `mot:froid`, `mot:froid#2`, `mot:froid:fin`, `mot:froid+0.2` | Quand la voix de la scène dit « froid » (accents, majuscules et ponctuation ignorés ; `#2` deuxième fois, `:fin` fin du mot). Une nouvelle prise recale tout seul |
| `data-dur` | `1.2` | Durée en secondes (1 par défaut) |
| `data-tween` | `opacity 0→1 back-out; --x -10cqh→0cqh` | Interpole des valeurs pendant `[début, fin]` |

Le moteur pose sur chaque élément minuté :
- `--p` : progression de 0 (avant le début) à 1 (après la fin) ;
- `data-etat` : `avant`, `pendant` ou `apres`.

Le `rythme` du déroulé étire tous les temps d'une scène : « ralentis la scène 3 » se règle dans le déroulé, pas dans le HTML.

Une voix (`scenes[].voix`) allonge sa scène jusqu'à sa fin + 0,4 s (elle commence 0,3 s après le début de la scène, `voix.debut` pour changer) ; elle joue toujours en temps réel, même avec un `rythme`.

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

## Mise en scène

### Mouvements nommés

Le dictionnaire de mouvements (`pulse-motion reference mouvements`, fiche : `pulse-motion mouvements afficher <n° ou nom>`) donne pour chaque nom du métier (pop-in, mask reveal, whip pan…) un numéro stable et la recette exacte. Classes communes à tous les styles, sur un élément minuté : `pm-m-pop`, `pm-m-monte`, `pm-m-glisse-gauche`, `pm-m-glisse-droite`, `pm-m-zoom-entree`, `pm-m-net`, `pm-m-masque`, `pm-m-chute`, `pm-m-anticipe`, `pm-m-ecrase`, `pm-m-saccade`, `pm-m-sortie`, `pm-m-pulse`, `pm-m-tremblote`, `pm-m-va-vient`, `pm-m-surligne`, `pm-m-souligne`, `pm-m-reflet`, `pm-m-epaule` ; réglages par variables : `--pm-dur`, `--pm-courbe`, `--pm-ampleur`, `--pm-fois` (répétitions, jamais sans fin). Une scène qui a des `mouvements` dans le déroulé applique leurs recettes telles quelles.

### Texte lettre par lettre

```html
<h1 class="titre" data-texte="titre" data-start="0.3" data-lettres="onde"></h1>
<p class="texte" data-texte="detail" data-start="#titre:fin+0.2" data-mots="monte"></p>
```

- `data-lettres` (par lettre) ou `data-mots` (par mot) : `monte` (monte de 0,5 em), `flou` (net en 0,5 s), `frappe` (machine à écrire), `onde` (saut puis petit rebond), `chute` (tombe du haut et rebondit) ; par lettre seulement : `brouille` (signes au hasard puis la vraie lettre, `--pm-lettre-dur` 0,3 s).
- `data-pas` : écart entre deux lettres ou deux mots (par défaut `frappe` 0,04 s, `onde` 0,02 s, autres 0,05 s ; mots 0,12 s). Durée d'une lettre : `--pm-lettre-dur` (ex. `style="--pm-lettre-dur: 0.3s"`).
- Le départ est le `data-start` de l'élément (ou de son ancêtre minuté). Fin de l'animation ≈ `data-start` + nombre de lettres × pas + durée d'une lettre : en tenir compte pour le temps de lecture.
- Les mots ne sont jamais coupés, les retours à la ligne du texte sont gardés ; les lecteurs d'écran lisent le texte entier. Une balise à l'intérieur du texte (`<em>`) est aplatie.

### Dégradé et contour

- `class="pm-degrade"` : texte rempli d'un dégradé, `--pm-degrade` (par défaut primaire → accent de la charte). Ex. `style="--pm-degrade: linear-gradient(90deg, var(--c-primaire), var(--c-accent))"`. Se combine avec `data-lettres`.
- `class="pm-contour"` : contour du texte, `--pm-contour` (épaisseur, 0,2 cqh) et `--pm-contour-couleur` (`var(--c-texte)`).

### Figer et accélérer le temps

- `data-gel="1.2+1.5"` sur un conteneur : à 1,2 s, tout son contenu s'arrête 1,5 s (image figée), puis reprend où il en était. Les éléments après le gel arrivent donc 1,5 s plus tard.
- `data-vitesse="3+2 x2"` : de 3 s à 5 s, le contenu va deux fois plus vite (`x0.5` : ralenti).
- Plusieurs plages séparées par `;`, sans chevauchement, en secondes de la scène. Sur la `<section>` elle-même, elles s'appliquent à toute la scène. S'applique aux éléments minutés, animations CSS et SVG animés du conteneur ; pas à `M.chaqueImage` ni aux effets de particules.
- Une caméra posée **sur le même élément** n'est pas figée : on gèle le décor, la caméra continue (zoom sur l'image figée). Pour désaturer pendant le gel : `saturation 1→0.4 1.2+0.3` dans la caméra.

## Ce que le contrôle regarde dans la vidéo rendue

`pulse-motion controler` rend la vidéo dans Chrome sans fenêtre et juge les **éléments de contenu** : textes (`data-texte`), images, logo (`data-logo`), SVG. Ils ne doivent pas se chevaucher, sortir de l'image, coller au bord (4 %), passer sous les boutons des réseaux en 9:16, ni masquer le logo. Pour dire ce qui est voulu :

| Cas | Marqueur |
|---|---|
| Forme, image ou calque de pur décor (fond, parallaxe, motif) | `data-decor` sur l'élément, ou dans `<div class="decor">` |
| Image décorative | `alt=""` |
| Icône SVG décorative | `aria-hidden="true"` |
| Élément posé volontairement sur un autre (texte sur une carte image, badge) | `data-superpose` sur celui qui passe par-dessus |

Il mesure aussi les pixels : le **contraste réel** de chaque texte avec ce qu'il y a derrière ses lettres (image, dégradé, décor ; au moins 4,5:1, 3:1 pour un texte de 4,5 cqh et plus) et les **flashs** : plus de 3 flashs par seconde sur un quart de l'image est une erreur (risque de crise d'épilepsie). Un texte posé sur une image a besoin d'un aplat ou d'un voile.

## Signaux d'alerte

| Vous écrivez… | Problème | À la place |
|---|---|---|
| Du texte dans le HTML | La retouche « change le titre » ne marche plus | `data-texte="clé"` + texte dans le déroulé |
| `transition: opacity .5s` | Neutralisé : l'image dépendrait du chemin | `@keyframes` + classe, ou `--p` |
| `font-size: 24px` | Ne suit pas le format de l'image | `cqh` (texte ≥ 3,5 cqh) |
| `color: #1d4ed8` | Ignore la charte de la personne | `var(--c-primaire)` |
| `data-start="#titre+1"` sur un `#titre` sans `data-start` ni `data-dur` | Référence inconnue | Minuter `#titre`, ou partir de `0` |
| `<img src="https://…">` | La vidéo ne marche plus hors ligne | Copier le fichier dans `assets/` |
| `transform: translateX(…)` animé sur toute une scène pour la parcourir | Pas de parallaxe, pas de cadrage | `data-camera="x 20→80 0+6"` |
| `data-start` calculés à la main sur la musique (1,875 s…) | Décalage dès que le tempo change | `tempo` dans le déroulé et `data-start="4t"` |
| Une scène où rien ne bouge pendant 3 s | Temps mort signalé | Décor qui dérive (`.decor .rond`) ou entrée échelonnée |

## Les parties

Lire ce tronc, puis seulement les parties dont la scène a besoin : `pulse-motion reference moteur/<partie>`.

| Partie | Contenu | À lire quand |
|---|---|---|
| `moteur/camera` | Caméra (`data-camera`) et parallaxe (`data-profondeur`) | caméra, travelling, gros plan, scène narrative |
| `moteur/tempo` | Unité `t`, `--pm-temps`, calage sur la musique | le déroulé a un tempo et la scène s'y cale |
| `moteur/son` | Mixage, voix, musique générée, partition, bruitages, sous-titres | le son de la vidéo ; pour une scène : `audio/ancres` et `audio/bruitages` |
| `moteur/personnages` | Conteneur, actions, hauteur, groupes, atteindre, regarder, objets tenus, temps | un personnage dans la scène |
| `moteur/mode-style` | Écrire une scène toute faite d'un style | création d'un style personnel |
