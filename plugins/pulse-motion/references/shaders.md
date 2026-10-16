# Shaders : fonds, auras, transitions, post-traitements, modules

## L'essentiel

- Un **fond** animé : une balise vide dans la scène, `<div data-shader="nebuleuse"></div>` (plein cadre, derrière le contenu). Une **aura** autour d'un élément : `<div data-shader="halo" data-ancre="#chiffre"></div>`.
- Une **transition** de scène par shader : dans `deroule.json`, `"transition": { "shader": "dissolution", "duree": 0.8 }` sur la scène qui entre (les transitions `fondu`, `glissement`… restent valables).
- Un **post-traitement** (grain, vignettage…) : `"post": [{ "shader": "grain" }]` sur une scène, ou au niveau de la vidéo (appliqué après celui de la scène).
- Un **module** change le comportement d'un effet de particules sans toucher au moteur : `"modules": { "force": "spirale" }` dans un émetteur de recette (`effets/<nom>.json`).
- Réglages comme pour les effets : `data-reglages="vitesse: 0.5; couleur1: accent"` sur la balise, `"reglages": { "vitesse": 0.5 }` dans le déroulé ; couleurs `#rrggbb` ou `primaire`, `accent`, `texte`, `fond`.
- Comme les particules, les shaders demandent **WebGPU** (Chrome ou Edge récent) ; sans lui, une transition par shader devient un fondu et l'export est refusé.
- Après écriture : `pulse-motion assembler .` puis `pulse-motion controler .` ; `pulse-motion controler . --gpu` compile aussi chaque shader dans Chrome sans fenêtre.
- **Licence** : n'écrire que des shaders originaux. Ne jamais recopier un shader trouvé en ligne : ceux de Shadertoy sont sous CC BY-NC-SA par défaut, incompatible avec la licence MIT du plugin.
- Un shader **sert un propos** (ambiance, rupture, mise en valeur), jamais la décoration : un fond par scène au plus, un post-traitement discret.

## Poser un fond ou une aura

```html
<div data-shader="degrade-vivant" data-reglages="vitesse: 0.1"></div>
<h2 id="chiffre" class="grand-chiffre" data-texte="chiffre" data-start="0.3"></h2>
<div data-shader="halo" data-ancre="#chiffre" data-start="#chiffre" data-dur="2"></div>
```

| Attribut | Valeurs |
|---|---|
| `data-shader` | nom d'un shader d'usage `fond` (table ci-dessous, ou `shaders/<nom>` du projet) |
| `data-ancre` | `#id` d'un élément de la scène : l'aura suit sa boîte (déplacée, tournée, agrandie) ; sans ancre : la boîte de la balise (toute la scène par défaut) |
| `data-calque` | `arriere` (défaut, derrière le contenu) ou `avant` |
| `data-reglages` | `nom: valeur` séparés par `;` |
| `data-image` | une image de `assets/`, lue par le shader (`canal2`) |
| `data-start`, `data-dur` | minutage ; sans `data-dur`, le fond dure jusqu'à la fin de la scène |

Le fond est dessiné dans le calque de particules de la scène, avant les particules, avec le halo et la courbe de tons de ce calque.

## Transitions et post-traitements (déroulé)

```json
"scenes": [
  { "id": "intro", "fichier": "scenes/01-intro.html", "duree": 5, "textes": { … }, "post": [{ "shader": "vignettage", "reglages": { "force": 0.4 } }] },
  { "id": "suite", "fichier": "scenes/02-suite.html", "duree": 6, "textes": { … },
    "transition": { "shader": "dissolution", "duree": 0.8, "reglages": { "couleur_bord": "accent" } } }
],
"post": [{ "shader": "grain", "reglages": { "force": 0.05 } }]
```

- `duree` d'une transition : 0,1 à 5 s (0,8 par défaut), sans dépasser la durée de la scène qui entre ni celle de la scène qui sort (sinon `deroule-invalide`) ; pendant ce temps les deux scènes s'animent, le moteur les photographie et le shader les mélange.
- Au plus 4 post-traitements par scène et pour la vidéo, appliqués dans l'ordre de la liste. Les sous-titres restent nets (au-dessus).
- Dans l'aperçu, pendant la lecture, la photographie des scènes est rafraîchie 10 fois par seconde en demi-résolution (le shader, lui, tourne à chaque image) : un léger retard est normal ; l'export est exact.

## Bibliothèque

| Shader | Usage | Réglages | Quand l'utiliser |
|---|---|---|---|
| `nebuleuse` | fond | `vitesse`, `echelle`, `densite`, `couleur1`, `couleur2` | Ambiance calme, espace, rêverie |
| `plasma` | fond | `vitesse`, `echelle`, `contraste`, `couleur` | Énergie, technologie, créativité |
| `degrade-vivant` | fond | `vitesse`, `angle`, `couleur1`, `couleur2` | Fond sobre qui évite l'image figée |
| `grille-neon` | fond | `pas`, `vitesse`, `eclat`, `couleur` | Rétro, numérique, vitesse |
| `rayons` | fond | `nombre`, `vitesse`, `intensite`, `centre_x`, `centre_y`, `couleur` | Révélation, élément central |
| `halo` | aura (`data-ancre`) | `rayon`, `intensite`, `pulsation`, `couleur` | Mettre en valeur un chiffre, un titre |
| `energie-contour` | aura (`data-ancre`) | `vitesse`, `epaisseur`, `eclat`, `couleur` | Puissance, élément actif |
| `dissolution` | transition | `grain`, `bord`, `couleur_bord` | Transition douce et organique |
| `ondulation` | transition | `amplitude`, `frequence`, `vitesse` | Souvenir, rêve, changement d'époque |
| `pixels` | transition | `taille_max` | Univers numérique, jeu |
| `glitch` | transition | `force`, `bandes` | Rupture, bug |
| `balayage-organique` | transition | `angle`, `douceur`, `echelle` | Balayage vivant, encre |
| `grain` | post | `force`, `taille`, `vitesse` | Cinéma, archive |
| `vignettage` | post | `force`, `rayon`, `douceur`, `couleur` | Focalisation, intimité |
| `aberration` | post | `ecart` | Tension, image numérique |
| `chaleur` | post | `force`, `echelle`, `vitesse`, `haut` | Chaleur, désert, mirage |
| `reaction-diffusion` | fond multipasse | `alimentation`, `destruction`, `couleur1`, `couleur2`, `opacite` | Vivant, organique, science |
| `trainees-lumineuses` | fond multipasse | `nombre`, `vitesse`, `persistance`, `epaisseur`, `couleur1`, `couleur2` | Énergie, technologie, nuit |
| `peinture` | fond multipasse | `pinceau`, `courant`, `echelle`, `couleur1`, `couleur2`, `couleur3` | Création, art, douceur |
| `automate` | fond multipasse | `densite`, `graine`, `couleur`, `opacite` | Numérique, émergence |
| `ondes-glsl` | fond multipasse (GLSL) | `intervalle`, `force`, `amortissement`, `profondeur`, `teinte`, `melange`, `reflet`, `opacite` | Calme, réflexion, nature |
| `spirale` | module de force | `tours`, `attraction` | Tourbillon, aspiration |
| `couleur-vitesse` | module de couleur | `vitesse_max`, `lent`, `rapide` | Étincelles qui refroidissent |
| `etoile` | module de forme | `branches`, `creux`, `douceur` | Célébration, magie |

Régler à l'œil un fond : bouton **Effets** de l'aperçu (les fonds de la scène sont listés avec les effets).

## Écrire un shader

Seulement si aucun shader de la table ne convient, dans le projet : `shaders/<nom>.wgsl` (le code) et `shaders/<nom>.json` :

```json
{ "version": 1, "nom": "vagues-douces", "usage": "fond", "description": "Vagues lentes aux couleurs de la marque",
  "parametres": { "vitesse": { "defaut": 0.3, "min": 0, "max": 2 }, "couleur": { "defaut": "primaire", "type": "couleur" } } }
```

`usage` : `fond`, `transition`, `post`, `module-force`, `module-couleur`, `module-forme` ; `debord` (cqh, fond) : marge dessinée autour de la boîte (aura). Un fichier du projet porte un nom différent de ceux de la bibliothèque.

| Usage | Fonction attendue |
|---|---|
| fond, aura | `fn image(coord: vec2f) -> vec4f` |
| transition | `fn transition(coord: vec2f, progres: f32) -> vec4f` |
| post | `fn post(coord: vec2f) -> vec4f` |
| module-force | `fn force(p: Particule, t: f32, zone: vec4f) -> vec2f` (ajoutée à l'accélération, cqh/s²) |
| module-couleur | `fn couleur(p: Particule, u: f32, base: vec4f) -> vec4f` (`u` : part de la vie écoulée) |
| module-forme | `fn forme(uv: vec2f, p: Particule) -> f32` (alpha du motif, `uv` de −1 à 1) |

- `coord` : en cqh, depuis le coin haut gauche de la zone (la boîte de l'élément pour une aura, négatif dans le débord ; l'image entière pour une transition ou un post-traitement).
- Entrées : `iTime` (secondes depuis le début du fond, de la transition, de la scène ou de la vidéo), `iProgres` (0 → 1 sur la fenêtre), `iResolution` (`xy` : taille de la zone en cqh, `zw` : en pixels), `R.<réglage>` (nombre `f32`, couleur `vec4f` en RVB linéaire).
- Son (voir `pulse-motion reference audio`, « Son réactif ») : `iSon.volume`, `iSon.basses`, `iSon.mediums`, `iSon.aigus`, `iSon.battement`, `iSon.phase`, `iSon.enveloppe`, `iSon.syllabe` (0 à 1, à l'instant de la vidéo) ; `sonSpectre(x)` et `sonOnde(x)` (x de 0 à 1 : des graves aux aigus, ou le long de l'onde) ; `"piste": "voix"` dans le `.json` pour suivre la voix (musique par défaut). `iFrame` (numéro d'image depuis le début du fond) et `iTimeDelta` (durée d'une image). Sans la piste : contrôle `son-sans-piste`.
- Images : `canal0(uv)` … `canal3(uv)` (uv de 0 à 1, y vers le bas). Transition : `canal0` = scène qui sort, `canal1` = scène qui entre ; post : `canal0` = image de la scène (particules comprises) ; `canal2` = image de `data-image` ou `"image"` ; `canal3` = texture de bruit fixe (répétée).
- Retour : RVBA **linéaire prémultiplié** (`vec4f(couleur * a, a)`) ; des valeurs au-dessus de 1 brillent si le calque a du halo.
- Prélude disponible : `bruit(vec3f)` et `fbm(vec3f)` (dans [−1, 1]), `curl(vec2f, f32)`, `alea2(vec2f)`, `pcg(u32)`, `alea(…)`, `palette(t, a, b, c, d)`, `rot2(angle)`, `sdCercle`, `sdBoite`, `sdSegment`, `sdEtoile`.
- Le WGSL réserve des mots courants comme noms de variables (`trait`, `type`, `filter`, `set`, `target`, `module`, `match`…) : en choisir d'autres (`lueur`, `genre`…), sinon `shader-ne-compile-pas`.
- Interdits : `@group` et `@binding` (réservés au moteur), les noms commençant par `pm`, `iTime`, `iProgres`, `iResolution`, `iChannel0` à `iChannel3`, `iSon`, `iSonTexture`, `iFrame`, `iTimeDelta`, `sonSpectre`, `sonOnde`, `R`, `canal0` à `canal3` ; plus de 64 Ko de code. Rien d'aléatoire hors de ce qui dépend de `iTime` et de `coord` (l'image ne dépend que de t).
- Un module : la recette qui l'utilise peut exposer un réglage de même nom (ex. `tours`) : sa valeur remplace celle du module. Dans un module, un champ de structure ne porte pas le nom d'une constante ou d'une structure du module.

## Shaders GLSL (Shadertoy)

Un shader écrit en GLSL pour Shadertoy s'utilise tel quel comme fond, aura, transition ou post-traitement : `shaders/<nom>.glsl` (le code) et `shaders/<nom>.json` avec `"langage": "glsl"`.

```json
{ "version": 1, "nom": "vagues-st", "usage": "fond", "langage": "glsl", "description": "Vagues écrites en GLSL",
  "parametres": { "vitesse": { "defaut": 1, "min": 0, "max": 3 }, "teinte": { "defaut": "primaire", "type": "couleur" } } }
```

```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float v = 0.5 + 0.5 * sin(uv.x * 12.0 + iTime * R_vitesse);
  fragColor = vec4(R_teinte.rgb * v, 1.0);
}
```

- Entrées : `iResolution` (pixels de la zone), `iTime`, `iTimeDelta`, `iFrame`, `iFrameRate`, `iDate` (figée sur l'instant de la vidéo), `iMouse` (toujours 0), `iChannelResolution`, `iProgres` (transition), `iSon` (`iSon.basses`…), réglages `R_<nom>` (`float` ; couleur : `vec4` sRGB).
- Canaux : fond : `iChannel2` = `data-image`, `iChannel3` = son (spectre en `y = 0.25`, onde en `y = 0.75`) ; transition : `iChannel0` = scène qui sort, `iChannel1` = scène qui entre ; post-traitement : `iChannel0` = image de la scène. Les images des canaux sont en couleurs non prémultipliées (alpha à part), comme sur Shadertoy.
- Comme sur Shadertoy : `fragCoord` en pixels depuis le coin **bas** gauche, couleurs sRGB, `fragColor.a` = opacité (1 pour un fond plein).
- Interdits : `uniform`, `#version`, `main` (posés par le moteur), redéclarer une entrée. Un module de particules s'écrit en WGSL.
- Erreurs : ligne et message du compilateur GLSL (panneau dans l'aperçu, `pulse-motion controler . --gpu`) ; l'export est refusé tant qu'un shader ne compile pas.
- **Licence** : un shader de Shadertoy appartient à son auteur (CC BY-NC-SA par défaut) : ne l'utiliser que si sa licence le permet ; ne jamais l'ajouter à la bibliothèque du plugin.

## Shaders multipasses

Un fond peut garder un état d'une image à l'autre (taches qui poussent, sillages, peinture, ondes) : des **tampons** `A` à `D` que des passes mettent à jour par pas fixes, puis une passe `image` qui dessine.

```json
{ "version": 1, "nom": "sillage", "usage": "fond",
  "passes": [{ "nom": "A", "lit": ["A"], "echelle": 0.5 }, { "nom": "image", "lit": ["A"] }],
  "pas_par_seconde": 60 }
```

```wgsl
// Sillage : le tampon A garde l'image précédente, assombrie, plus un point qui tourne.
fn passeA(coord: vec2f) -> vec4f {
  let uv = coord / iResolution.xy;
  let p = vec2f(0.5) + 0.3 * vec2f(cos(iTime), sin(iTime));
  return canal0(uv) * 0.95 + vec4f(1.0) * smoothstep(0.03, 0.0, length(uv - p));
}
fn image(coord: vec2f) -> vec4f { return canal0(coord / iResolution.xy); }
```

- `passes` : les tampons (`A`, `B`, `C`, `D`), puis `image` ; `lit` : les tampons que la passe lit (le premier en `canal0` / `iChannel0`, le deuxième en `canal1`…), dans leur état du pas précédent ; `echelle` : taille du tampon par rapport à la vidéo (0,5 par défaut, au plus 1).
- Une fonction par tampon : `fn passeA(coord: vec2f) -> vec4f` (WGSL) ou `void passeA(out vec4 c, in vec2 p)` (GLSL), et `image` / `mainImage` pour la sortie. Au premier pas (`iFrame == 0`), les tampons valent 0 : y poser l'état de départ.
- `pas_par_seconde` (1 à 240, 60 par défaut) : les tampons avancent à ce rythme, quel que soit l'affichage ; l'aperçu, un retour en arrière et l'export donnent la même image.
- Un shader multipasse est un fond (`data-shader`, aura comprise). Les tampons coûtent de la mémoire et du calcul : un seul fond multipasse par scène, `echelle` basse pour un motif lent.
- Texte posé sur un fond multipasse : vérifier le contraste (planche ou aperçu) ; sinon baisser `opacite`, ou prendre des couleurs plus sombres (la couleur « fond » de la charte) sous un titre clair.

## Modules de particules

```json
{ "version": 1, "nom": "tourbillon", "etend": "poussiere", "parametres": { "tours": { "defaut": 1.5, "min": 0, "max": 5 } },
  "emetteurs": [{ "nom": "grain", "modules": { "force": "spirale", "forme": "etoile" } }] }
```

Un émetteur avec un module de force est simulé pas à pas (plus coûteux qu'un effet balistique) : garder des nombres raisonnables.

## Erreurs et contrôles

| Règle | Cause | Correction |
|---|---|---|
| `shader-inconnu` | aucun `shaders/<nom>` dans le projet ni dans la bibliothèque | nom de la table, ou créer le shader |
| `usage-incompatible` | ex. une transition posée en `data-shader` | `data-shader` : un fond ; transition et post : dans le déroulé |
| `fonction-absente` | la fonction attendue manque ou n'a pas la bonne signature | voir la table « Fonction attendue » |
| `liaison-reservee` | `@group` ou `@binding` dans le code | lire les images avec `canal0(uv)`… |
| `shader-trop-gros` | plus de 64 Ko de code | simplifier |
| `shader-invalide` | `.json` illisible ou mal formé, `.wgsl` absent | corriger le fichier |
| `nom-reserve`, `reglage-inconnu` | nom du moteur redéfini ; `R.x` sans réglage `x` | renommer ; déclarer le réglage dans `parametres` |
| `reglage-invalide` | réglage hors bornes ou inconnu | voir les réglages du shader |
| `shader-ne-compile-pas` | erreur WGSL (avec `--gpu`, et dans l'aperçu : panneau avec ligne, colonne, message) | corriger la ligne indiquée ; l'export est refusé tant qu'un shader ne compile pas |
| `shaders-non-compiles` | `--gpu` sans Chrome ou sans WebGPU | information : la compilation se fera dans l'aperçu |

## Retouches en une phrase

| Demande | Changement |
|---|---|
| « un fond plus calme » | `vitesse` plus bas, ou `degrade-vivant` |
| « aux couleurs de la marque » | `couleur: primaire` (ou `couleur1`, `couleur2`) |
| « une transition plus douce » | `duree` plus longue, `dissolution` ou `balayage-organique` |
| « moins de grain » | `force` du grain divisée par 2 |
| « enlève l'effet de chaleur » | retirer l'entrée de `post` |
