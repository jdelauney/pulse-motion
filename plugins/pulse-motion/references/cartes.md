# Cartes

## L'essentiel

- Cartes de **pays** et de **régions françaises** seulement (« nos 12 pays d'export », « nos agences en France ») : jamais de plan de ville, jamais de tuile ni de carte en ligne. Fonds de Natural Earth (domaine public), embarqués dans le plugin ; seuls les tracés qui touchent le cadre entrent dans la page.
- Deux cartes : `monde` (pays, codes ISO à deux lettres : `FR`, `DE`, `CA`…) et `france` (13 régions et 5 d'outre-mer en encarts : `ARA`, `BFC`, `BRE`, `CVL`, `COR`, `GES`, `HDF`, `IDF`, `NOR`, `NAQ`, `OCC`, `PDL`, `PAC`, `GUA`, `MTQ`, `GUF`, `REU`, `MYT`).
- **Trouver** un pays, une région ou une ville : `pulse-motion cartes chercher <nom>` (en français, sans souci d'accents). Un lieu absent se donne par ses coordonnées, « latitude,longitude ».
- **Montrer avant d'écrire** : `pulse-motion cartes planche monde --pays FR,DE,ES --ouvrir`, regarder l'image (`Read`), puis la décrire à la personne en mots.
- Si `pulse-motion cartes` répond qu'un fond manque (installation abîmée), le dire à la personne, proposer de mettre à jour Pulse Motion, ou une autre mise en forme (liste, icônes) : jamais de carte dessinée à la main.

## Poser une carte

```html
<section data-scene="export">
  <style>
    @scope {
      .carte { position: absolute; inset: 0; width: 100%; height: 100%; }
      .pm-liaison { stroke-dasharray: 100; stroke-dashoffset: calc(100 * (1 - var(--p))); }
    }
  </style>
  <svg class="carte" data-carte="monde" data-carte-pays="FR,DE" data-carte-cadre="europe">
    <path data-pays="ES" data-start="0.6" data-tween="--pm-surligne 0→1"></path>
    <g data-repere="Lyon" data-start="1"><text data-texte="ville"></text></g>
    <path data-liaison="Paris→Madrid" data-start="1.4" data-dur="1.2"></path>
  </svg>
</section>
```

- `data-carte` : `monde` ou `france`. `data-carte-pays` (ou `data-carte-regions`) : codes ou noms français, séparés par des virgules ; ils prennent la couleur de la marque (`pm-pays`), le reste est un aplat discret (`pm-pays-fond` ; `data-carte-fond="non"` le retire).
- `data-carte-cadre` : `auto` (défaut : pays listés, repères et liaisons, plus 10 %), `monde` (toute la carte, avec une marge), un code (`FR`), ou un continent de la carte du monde (`europe`, `afrique`, `ameriques`, `asie`, `oceanie`). **Préférer une vue régionale** à une carte du monde.
- **Vertical** (9:16, 4:5) : le cadre prend les proportions de l'image, la carte remplit l'écran et ce qu'elle montre reste vers le milieu (hors des boutons des réseaux) ; sur la carte de France, les encarts d'outre-mer passent sous la métropole. Rien à écrire de plus dans la scène.
- `<path data-pays="ES">` vide : le pays est posé à cette place, avec son tracé, pour l'animer (entrée, `data-tween`). Son `id` est `pays-ES` (`data-start="#pays-ES:fin+0.2"`).
- `<g data-repere="…">` : par nom de ville, code de pays (son centre) ou « latitude,longitude » ; un repère vide, ou qui ne contient que son nom (un seul `<text>`), reçoit un point (`pm-repere-point`). **Le nom se place tout seul** autour du point (au-dessus si la place est libre) : il ne touche ni un autre nom, ni une liaison, ni un point, ne chevauche pas le bord d'un encart et reste dans l'image ; ne pas lui donner de position (`x`, `y`, `dy`). Les repères passent par-dessus les liaisons, et les textes de la carte ont un halo de la couleur du fond.
- `<path data-liaison="Paris→New York">` : arc calculé, bombé vers le haut (`data-liaison-courbure`, 0.25 par défaut) ; `pathLength="100"` posé pour le tracé (#011).
- Tailles en unités de carte : `--pm-u` vaut 1 % de la largeur du cadre ; un texte de carte mesure `calc(var(--pm-u) * 3.5)` par défaut, un point 0,9 `--pm-u`.

## Animer

- Avec les mouvements existants : apparition en cascade (`data-start` décalés sur les `<path data-pays>`), surlignage (`data-tween="--pm-surligne 0→1"` : de la couleur de la marque à l'accent), tracé d'une liaison (#011), caméra sur un pays.
- **Caméra** : `pulse-motion cartes afficher monde FR --cadre europe` (`--ratio 9:16` pour une vidéo verticale) donne le centre du pays en % de l'image et le zoom conseillé, avec la clause à recopier dans `data-camera` du conteneur (pour une carte qui couvre toute l'image, comme ci-dessus).
- Un script de scène peut projeter un point : `M.cartes.projeter(carte, lon, lat)`, `M.cartes.arc(a, b, courbure)`.

## Frontières et noms

- Les fonds sont ceux de Natural Earth : des **frontières de fait**, pas un avis.
- Ne pas mettre une zone contestée au premier plan sans demande de la personne.
- Ne jamais nommer « pays » un territoire dont le statut est discuté, ni dans les textes ni dans la voix (dire « territoire », « région »). Les territoires sans code ISO restent en fond, sans nom.
- Une carte de Natural Earth est créditée dans les crédits de la vidéo (section « Cartes »).

## Ce que le contrôle signale

- `carte-inconnue` : carte autre que `monde` ou `france`, ou fond absent du plugin (installation abîmée).
- `pays-inconnu` : code ou nom absent de la carte ; le message donne les noms proches.
- `ville-inconnue` : ville absente ; noms proches, ou donner ses coordonnées.
- `carte-invalide` : cadre inconnu, continent sur la carte de France, liaison illisible, coordonnées hors de la Terre.
- Les textes posés sur la carte sont contrôlés comme les autres (taille, contraste, débordement).
