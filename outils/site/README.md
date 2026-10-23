# Outils du site

Le wiki (`docs/`) est publié par GitHub Pages depuis la branche **`gh-pages`** (racine `/`), pas depuis `main`. Les pages, les styles, les scripts et les petites captures sont versionnés dans `main/docs`. Les vidéos et aperçus fabriqués vont dans `docs/medias/`, ignoré par git : installer le plugin ne les télécharge pas.

| Outil | Rôle |
|---|---|
| `node outils/site/medias.js [<id>…] [--forcer]` | Fabrique les médias du site à partir du plugin (vidéos d'exemple, captures). Un média déjà à jour n'est pas refait. |
| `node outils/wiki/indexer.js` | Régénère l'index de recherche du wiki après une modification de page. |
| `node outils/site/liens.js` | Vérifie que chaque lien, image et vidéo des pages pointe vers un fichier existant. |
| `node outils/site/publier.js [--sec]` | Construit le site (fichiers suivis de `docs/` + `docs/medias/`) et le pousse en force sur `gh-pages`, en un seul commit. `--sec` prépare sans pousser. |

Ordre pour publier : fabriquer les médias, indexer le wiki, vérifier les liens, publier.

Il faut, chez la personne qui publie : Node.js 20 ou plus, Chrome ou Edge, et ffmpeg (pour les vidéos). `publier.js` refuse de publier tant qu'une page cite un média absent de `docs/medias/`.
