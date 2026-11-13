# Fonds de carte : provenance

Les cartes de Pulse Motion (`<svg data-carte="monde">`, `<svg data-carte="france">`, `pulse-motion reference cartes`) se dessinent à partir de trois fichiers de ce dossier, préparés par le mainteneur. Rien n'est jamais téléchargé par le plugin ni par la page : ni tuile, ni service en ligne.

## État

**Livrés le 2026-11-13 (Pulse Motion 0.71.0)**, préparés depuis Natural Earth **5.1.2**. Si l'un d'eux manque ou est illisible (installation abîmée), une scène qui pose une carte reçoit l'erreur `carte-inconnue` (« le fond de carte manque dans Pulse Motion : mettre à jour ou réinstaller Pulse Motion »), et `pulse-motion cartes` le dit.

| Fichier | Contenu | Poids visé | Poids livré |
|---|---|---|---|
| `monde.json` | 175 pays au 1:110 000 000, projection Equal Earth, boîte de 1 000 unités de large ; code ISO alpha-2, nom français, tracé, centre, boîte ; 2 territoires sans code en fond | 150 Ko au plus | 78 921 o |
| `france.json` | 13 régions métropolitaines (conique conforme de Lambert, parallèles 44° et 49° N, comme Lambert-93) et 5 régions d'outre-mer en encarts | 60 Ko au plus | 38 446 o |
| `villes.json` | 260 lieux : ceux du 1:110 000 000 (243) et les 18 chefs-lieux de région (Paris en fait partie) ; nom français, latitude, longitude, pays, population | 30 Ko au plus | 21 194 o |

## Source

Natural Earth (https://www.naturalearthdata.com), version 5.1.2 (étiquette `v5.1.2` du dépôt officiel `nvkelso/natural-earth-vector`, commit `f1890d9f152c896d250a77557a5751a93d494776`), fichiers GeoJSON du dossier `geojson/`, téléchargés le 2026-11-13 :

| Fichier | Adresse | sha256 |
|---|---|---|
| `ne_110m_admin_0_countries.geojson` (pays ; champs `ISO_A2_EH`, `ISO_A2`, `NAME_FR`, `CONTINENT`, `ADM0_A3`) | https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson | `6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f` |
| `ne_10m_admin_1_states_provinces.geojson` (départements français, fusionnés par région ; champ `iso_3166_2` : `FR-01`, `FR-2A`, et `FR-GP`, `FR-MQ`, `FR-GF`, `FR-RE`, `FR-YT` pour l'outre-mer) | https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson | `22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5` |
| `ne_110m_populated_places.geojson` (villes ; champs `NAME_FR`, `LATITUDE`, `LONGITUDE`, `ISO_A2`, `ADM0_A3`, `POP_MAX`) | https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_populated_places.geojson | `a86028b083182b68c7620fc6e1a8a47ee547cb9cd2fb62ccbb78bea786440899` |
| `ne_10m_populated_places.geojson` (seulement pour les chefs-lieux de région absents du 1:110 M) | https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_populated_places.geojson | `9b8e3de09048ef00dfc70357dbb9fa324493f214b5e0ae4daf1aa79a8d10116b` |

Ce qu'on a vu sur ces données (et que l'outil sait faire) :
- La France et la Norvège ont `ISO_A2` à `-99` : l'outil lit d'abord `ISO_A2_EH` (`FR`, `NO`) ; le Kosovo y est `XK`.
- Les lieux peuplés d'outre-mer portent le code de leur territoire (`GP`, `MQ`, `GF`, `RE`, `YT`) : ce sont des villes de France.
- Un lieu sans code (`-99`) prend celui de son pays par `ADM0_A3` (Pristina : `XK`) ; Hargeisa (Somaliland) reste sans pays.
- **Mamoudzou**, chef-lieu de Mayotte, n'est pas dans Natural Earth 5.1.2, même au 1:10 M (seule Dzaoudzi y est) : l'outil l'ajoute (12,78° S, 45,23° E, 71 437 habitants) et le dit dans son bilan.

## Licence

Natural Earth est dans le **domaine public** (« All versions of Natural Earth raster + vector map data found on this website are in the public domain », page Terms of Use). Aucune mention n'est obligatoire ; Pulse Motion la fait quand même : ligne « Natural Earth » des `THIRD-PARTY-NOTICES.md` et section « Cartes » des crédits de chaque vidéo qui pose une carte.

## Préparer à nouveau

Depuis la racine du dépôt, les quatre fichiers téléchargés à la main dans un dossier hors du dépôt (`D:\Atelier\natural-earth` dans l'exemple ; jamais dans le dépôt) :

```
node outils/cartes/preparer.js --pays D:\Atelier\natural-earth\ne_110m_admin_0_countries.geojson --departements D:\Atelier\natural-earth\ne_10m_admin_1_states_provinces.geojson --villes D:\Atelier\natural-earth\ne_110m_populated_places.geojson --villes-detail D:\Atelier\natural-earth\ne_10m_populated_places.geojson --version-ne 5.1.2
```

L'outil projette, simplifie (Visvalingam sur les frontières partagées, `--tolerance 0.5` unité², îles sous `--aire-min 1` unité² retirées), arrondit au dixième et écrit les trois fichiers ici, avec leur poids et ses avertissements. Avec les fichiers de la 5.1.2, la tolérance par défaut suffit et les avertissements sont : CYN (partie nord de Chypre) et SOL (Somaliland) sans code ISO, dessinés en fond seulement ; Mamoudzou ajouté. Si un fichier dépasse son poids visé, relancer avec une tolérance plus grande (1, puis 2) et regarder la planche (`pulse-motion cartes planche monde --pays FR,DE`, `pulse-motion cartes planche france`). Vérifier le sha256 de chaque fichier avant de le préparer ; une autre version de Natural Earth se note ici, avec ses empreintes.

## Ce que l'auteur accepte en livrant ces fichiers

1. **Les frontières de Natural Earth sont des frontières de fait** (« de facto »), pas un avis sur les territoires discutés. `references/cartes.md` dit de préférer une vue régionale, de ne pas mettre une zone contestée au premier plan sans demande, et de ne jamais nommer « pays » un territoire au statut discuté.
2. **Les territoires sans code ISO alpha-2** (la partie nord de Chypre, le Somaliland) sont dessinés en fond seulement : ils ne peuvent pas être listés ni nommés par leur code.
3. **Les régions françaises sont celles de 2016**, refaites par l'outil à partir des départements (table dans `outils/cartes/preparer.js`).
4. **Le poids** : environ 140 Ko dans le plugin installé ; une page n'embarque que les tracés qui touchent le cadre de ses cartes, et rien sans carte.
