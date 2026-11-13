# Fonds de carte : provenance

Les cartes de Pulse Motion (`<svg data-carte="monde">`, `<svg data-carte="france">`, `pulse-motion reference cartes`) se dessinent à partir de trois fichiers de ce dossier, préparés par le mainteneur. Rien n'est jamais téléchargé par le plugin ni par la page : ni tuile, ni service en ligne.

## État

**Les trois fichiers ne sont pas encore livrés.** Tant qu'ils manquent, une scène qui pose une carte reçoit l'erreur `carte-inconnue` (« les fonds de carte ne sont pas encore livrés »), et `pulse-motion cartes` le dit. Le reste est livré : projections (`moteur/cartes.js`), assemblage (`scripts/lib/cartes.js`), commande, contrôles, référence, et l'outil de préparation.

| Fichier | Contenu | Poids visé |
|---|---|---|
| `monde.json` | Pays au 1:110 000 000, projection Equal Earth, boîte de 1 000 unités de large ; code ISO alpha-2, nom français, tracé, centre, boîte | 150 Ko au plus |
| `france.json` | 13 régions métropolitaines (conique conforme de Lambert, parallèles 44° et 49° N, comme Lambert-93) et 5 régions d'outre-mer en encarts | 60 Ko au plus |
| `villes.json` | Lieux peuplés au 1:110 000 000, plus les 18 chefs-lieux de région ; nom français, latitude, longitude, pays, population | 30 Ko au plus |

## Source

Natural Earth (https://www.naturalearthdata.com), version 5.1.1 ou plus récente, fichiers GeoJSON du dépôt officiel `nvkelso/natural-earth-vector` (dossier `geojson/`) :

- `ne_110m_admin_0_countries.geojson` (pays ; champs `ISO_A2_EH`, `ISO_A2`, `NAME_FR`, `CONTINENT`) ;
- `ne_10m_admin_1_states_provinces.geojson` (départements français, fusionnés par région ; champ `iso_3166_2` : `FR-01`, `FR-2A`, `FR-971`…) ;
- `ne_110m_populated_places.geojson` (villes ; champs `NAME_FR`, `LATITUDE`, `LONGITUDE`, `ISO_A2`, `POP_MAX`) ;
- `ne_10m_populated_places.geojson` (seulement pour les chefs-lieux de région absents du fichier au 1:110 M).

## Licence

Natural Earth est dans le **domaine public** (« All versions of Natural Earth raster + vector map data found on this website are in the public domain », page Terms of Use). Aucune mention n'est obligatoire ; Pulse Motion la fait quand même : ligne « Natural Earth » des `THIRD-PARTY-NOTICES.md` et section « Cartes » des crédits de chaque vidéo qui pose une carte.

## Préparer

Depuis la racine du dépôt, les fichiers téléchargés à la main dans un dossier hors du dépôt (`D:\Atelier\natural-earth` dans l'exemple) :

```
node outils/cartes/preparer.js --pays D:\Atelier\natural-earth\ne_110m_admin_0_countries.geojson --departements D:\Atelier\natural-earth\ne_10m_admin_1_states_provinces.geojson --villes D:\Atelier\natural-earth\ne_110m_populated_places.geojson --villes-detail D:\Atelier\natural-earth\ne_10m_populated_places.geojson --version-ne 5.1.1
```

L'outil projette, simplifie (Visvalingam sur les frontières partagées, `--tolerance 0.5` unité², îles sous `--aire-min 1` unité² retirées), arrondit au dixième et écrit les trois fichiers ici, avec leur poids et ses avertissements (pays sans code ISO dessinés en fond seulement, chefs-lieux introuvables). Si un fichier dépasse son poids visé, relancer avec une tolérance plus grande (1, puis 2) et regarder la planche (`pulse-motion cartes planche monde --pays FR,DE`).

## Ce que l'auteur accepte en livrant ces fichiers

1. **Les frontières de Natural Earth sont des frontières de fait** (« de facto »), pas un avis sur les territoires discutés. `references/cartes.md` dit de préférer une vue régionale, de ne pas mettre une zone contestée au premier plan sans demande, et de ne jamais nommer « pays » un territoire au statut discuté.
2. **Les territoires sans code ISO alpha-2** (par exemple la partie nord de Chypre, le Somaliland) sont dessinés en fond seulement : ils ne peuvent pas être listés ni nommés par leur code.
3. **Les régions françaises sont celles de 2016**, refaites par l'outil à partir des départements (table dans `outils/cartes/preparer.js`).
4. **Le poids** : environ 240 Ko dans le plugin installé ; une page n'embarque que les tracés qui touchent le cadre de ses cartes, et rien sans carte.
