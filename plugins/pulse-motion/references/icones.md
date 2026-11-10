# Icônes

## L'essentiel

- Le plugin embarque les **2 046 icônes Lucide** (dessin au trait, boîte 24 × 24, licence ISC). Jamais d'icône dessinée à la main, recopiée d'ailleurs ou prise sur internet.
- **Trouver** : `pulse-motion icones chercher <mot>`, en français ou en anglais, sans souci d'accents ni de majuscules (« camion », « hôpital », « chaîne du froid ») : 12 noms au plus, le plus proche d'abord. `pulse-motion icones afficher <nom>` montre le SVG.
- **Faire choisir** quand plusieurs conviennent : `pulse-motion icones planche truck,package,box --ouvrir`, regarder l'image (`Read`), puis proposer deux ou trois icônes à la personne, en mots (« le camion », « le colis »), jamais par leur nom anglais.
- **Poser** dans la scène : `<svg data-icone="truck" class="…"></svg>`. L'assemblage écrit le dessin en ligne ; seules les icônes utilisées entrent dans la page.

## Taille, couleur, trait

- Taille en `cqh`, par une classe dans `@scope` (`.icone { width: 9cqh; height: 9cqh; }`) ou `style="width: 9cqh; height: 9cqh"`.
- Couleur : celle du texte (`color`), donc de la charte : `color: var(--c-accent-lisible)` sur le fond, `color: var(--c-sur-primaire)` sur un aplat de `--c-primaire`. Jamais `stroke` ni `fill` en dur.
- Épaisseur du trait : `--pm-icone-trait` (2 par défaut ; 1,5 plus fin, 2,5 plus appuyé), jamais `stroke-width`.
- Une icône accompagne un texte, elle ne le remplace pas : le sens se dit aussi en mots (`data-texte`).

## Animer

- Entrée : comme tout élément (`data-start`, `data-dur`, classes d'entrée du style, mouvements nommés : `pulse-motion mouvements afficher <n° ou nom>`).
- Tracé (#011 « Tracé de ligne ») : chaque chemin porte déjà `pathLength="100"` ; la recette s'applique telle quelle à ses chemins.

```html
<section data-scene="livraison">
  <style>
    @scope {
      .icone { width: 12cqh; height: 12cqh; color: var(--c-accent-lisible); --pm-icone-trait: 1.75; }
      .icone path { stroke-dasharray: 100; stroke-dashoffset: calc(100 * (1 - var(--p))); }
    }
  </style>
  <svg id="camion" class="icone" data-icone="truck" data-start="0.3" data-dur="1.2"></svg>
  <h2 class="titre-moyen entre-bas" data-texte="titre" data-start="#camion:fin+0.2"></h2>
</section>
```

## Ce que le contrôle signale

- `icone-inconnue` : nom absent de la bibliothèque ; le message donne les noms proches (« triangle-alerte » → `triangle-alert`, `alert-triangle`…). Les anciens noms de Lucide restent acceptés.
- `icone-mal-placee` : `data-icone` posé sur une autre balise que `<svg>`.
