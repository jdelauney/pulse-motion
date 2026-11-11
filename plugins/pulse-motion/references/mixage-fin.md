# Mixage fin : bruitages, musique et voix

## L'essentiel

- **Prévoir les sons avant d'écrire les scènes** : sur le déroulé, marquer les moments forts (un par scène au plus), puis les gestes qui méritent un son. Les autres restent muets.
- **Densité selon le caractère** de la vidéo : sobre (0 à 2 sons par 10 s), courante (3 à 5), spectaculaire (6 à 9). Puis retirer un tiers à la moitié des sons prévus : ceux qui restent comptent davantage.
- **Le son tombe sur l'instant visible**, pas sur le début de l'animation : un clic au contact, un souffle juste avant le passage, un choc juste après l'arrivée.
- **Deux sons en même temps au plus**, jamais un son fort pendant un mot de la voix (contrôle `son-sous-voix`), jamais plus de 3 par seconde (contrôle `trop-de-sons`).
- **Accorder le timbre à l'image** : un style net appelle des sons courts et secs, un style doux des sons ronds.

## Ce que fait déjà le mixage

Rappel (détail dans `pulse-motion reference audio`) : un seul mixage dans la page, ramené à −16 LUFS ; la musique baisse de 10 dB sous la voix et se creuse un peu autour de 2,5 kHz pour laisser passer les consonnes ; les bruitages ne baissent pas sous la voix. Les volumes du déroulé (`musique.volume`, `voix.volume`, `bruitages.volume`, `data-son-volume`) s'appliquent ensuite.

## Densité selon le caractère

| Caractère | Vidéos | Sons par 10 s | Sons à préférer | Transitions sonores (`bruitages.transitions`) |
|---|---|---|---|---|
| Sobre | Formation réglementaire, procédure, message grave | 0 à 2 | `tic`, `clic`, `pop` à faible volume (0,5) | Non |
| Courant | Formation, présentation de produit | 3 à 5 | `pop`, `ding`, `whoosh`, `carillon` en conclusion | Oui si les transitions sont marquées |
| Spectaculaire | Lancement, annonce, publication sociale | 6 à 9 | `whoosh`, `impact`, `montee`, `basse` sur le moment fort | Oui |

## Ce qu'on garde quand on retire

1. **Essentiel** : le son du moment fort (chiffre clé, révélation, logo final) et, dans un tutoriel, chaque clic.
2. **Utile** : l'entrée des éléments principaux (le titre, le premier point d'une liste).
3. **Décor** : tout le reste. On retire d'abord le décor.

## Caler un son sur l'instant visible

`data-son` part au début de l'élément qui le porte ; avec `"bruitages": { "calage": "pic" }` (vidéos créées depuis 0.58.0), il part assez tôt pour que son pic tombe sur l'élément : les décalages ci-dessous sont alors déjà faits pour `whoosh`, `swoosh-inverse`, `souffle` et `montee`. Pour décaler encore, porter le son par un repère vide minuté, placé avant ou après l'élément :

```html
<div id="carte" class="pm-m-glisse-gauche" data-start="1.2" data-dur="0.5"></div>
<i data-son="whoosh" data-start="#carte-0.05" aria-hidden="true"></i>
```

| Son | Où le placer par rapport au moment visible | Décalage à 30 images par seconde |
|---|---|---|
| `clic`, `tic`, `pop`, `blip`, `ding`, `carillon` | À l'image du contact ou de l'apparition | 0 |
| `whoosh`, `swoosh-inverse` | Juste avant le passage : on entend venir | 1 à 2 images avant (−0,03 à −0,07 s) |
| `impact`, `basse` | Juste après le contact : la cause d'abord, le choc ensuite | 1 à 2 images après (+0,03 à +0,07 s) |
| `montee` | Elle finit sur le moment fort : la commencer avant | Départ 0,8 s avant le moment |
| `souffle` | Il enveloppe une apparition lente | Départ 0,3 s avant |
| `crissement` | Il dure tout le tracé à main levée : il part avec le trait | 0 (posé seul par le moteur sur un tracé) |
| `feutre`, `craie`, `crayon`, `papier`, `chargement` | Sons tenus : ils durent l'entrée de l'élément | 0 |

Pour un élément animé par une entrée qui ralentit (`expo-out`, `back-out`), le moment visible est proche de son début : pas de décalage. Pour une chute (`pm-m-chute`), le contact est au premier rebond, vers 40 % de la durée.

## Musique et bruitages ensemble

- La musique tient le fond ; les bruitages ponctuent. Sous une voix, musique à 0,4 ou 0,5 ; sans voix, 0,7 à 0,8.
- Les bruitages doivent dépasser la musique de 6 à 8 dB à leur crête : s'ils se perdent, baisser la musique plutôt que de monter les bruitages (le mélange est ramené à −16 LUFS, monter un son baisse les autres).
- Le moment fort : `data-moment-fort` sur son élément ; la musique se tait 0,6 s avant, puis le son fort du style tombe dessus (un par scène, trois par vidéo au plus).
- Fin : la musique finit avec la dernière image stable ; pas de son qui démarre dans la dernière seconde.

## Timbre et style

| Style | Sons qui lui vont | À éviter |
|---|---|---|
| `minimal`, `tech-sombre` | `tic`, `clic`, `blip`, `montee` | `carillon` trop chantant |
| `editorial` | `souffle`, `pop` doux, `ding` | `impact`, `basse` |
| `chaleureux`, `clair-pedagogique` | `pop`, `carillon`, `ding` | `basse`, `impact` |
| `energique` | `whoosh`, `impact`, `pop`, `basse` | Silence total |

## Tempo de la musique selon le caractère

| Caractère | Tempo | Ambiance générée |
|---|---|---|
| Sobre | 80 à 95 | `calme` |
| Courant | 96 à 110 | `inspirant`, `corporate` |
| Spectaculaire | 118 à 128 | `tech`, `entrainant` |

Les gestes forts se posent sur les temps (`data-start="4t"`).

## À venir

- Partage des fréquences quand musique et bruitages coexistent : filtre passe-haut vers 800 Hz sur le bus des bruitages, passe-bas vers 4 kHz sur la musique, puis mesure de l'écart de crête (spec S8, son plus fin).
- Calage automatique d'un bruitage sur le pic de son geste plutôt que sur son début, sans repère vide (spec S8) ; bruitages posés seuls selon le type d'entrée (spec S7).
- Sons nouveaux, tous synthétisés sur l'ordinateur, rangés par famille (noms à fixer par la spec S8) : clavier (frappe, frappe rapide, effacement, touche Entrée) ; interface (survol, bascule, notification) ; cartes (pose, retournement, pile qui s'effondre) ; retours (succès, erreur, trophée) ; progression (chargement, terminé) ; chocs (tampon, chute sourde) ; magie (étincelle, transformation) ; terminal (commande, réponse).
