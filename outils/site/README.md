# Outils du site

Le wiki (`docs/`) est publié par GitHub Pages depuis la branche **`gh-pages`** (racine `/`), pas depuis `main`. Les pages, les styles, les scripts et les petites captures sont versionnés dans `main/docs`. Les vidéos et aperçus fabriqués vont dans `docs/medias/`, ignoré par git : installer le plugin ne les télécharge pas.

| Outil | Rôle |
|---|---|
| `node outils/site/galerie.js [--verifier]` | Écrit dans `mouvements.html`, `catalogue.html`, `lexique.html`, `idees.html` et `exemples.html` les cartes de la galerie (mouvements, styles, effets, personnages), des idées de vidéos (modèles et exemples) et des exemples (demande, déroulé validé, vidéo ; retouches avant / après, définies avec les demandes hors plugin dans `outils/site/exemples.json`) à partir des sources du plugin, entre les marqueurs `<!-- galerie:<nom> -->`. `--verifier` n'écrit rien et échoue si une page ne suit plus les sources, ou si un style livré n'a pas sa boucle, ses images témoin A et B (`docs/medias/`) ou ses champs `categorie` et `usages`. Les cartes des styles sont regroupées par catégorie. |
| `node outils/site/medias.js [<id>…] [--forcer]` | Fabrique les médias du site à partir du plugin (vidéos d'exemple, captures, et les aperçus de la galerie décrits dans `galerie-medias.js` : `galerie-mouvements`, `galerie-styles`, `galerie-effets`, `galerie-personnages`, `exemples` : la vidéo de l'exemple de chaque modèle, et `retouches` : la scène avant et après chaque retouche de `exemples.json`, la retouche appliquée par le code comme le dit `/pulse-motion:retoucher`). Un média déjà à jour n'est pas refait. |
| `node outils/site/galerie.js --anglais` | Liste les textes des sources montrés sur les pages anglaises (`docs/en/`) qui n'ont pas encore de traduction dans `outils/site/anglais.json` (recueil « texte français exact » → anglais). Sans traduction, le texte reparaît en français (`lang="fr"`) ; `--verifier` le signale sans bloquer. |
| `node outils/site/langues.js [--verifier]` | Écrit dans l'en-tête de chaque page qui existe en deux langues (`docs/<chemin>` et `docs/en/<chemin>`) les liens `hreflang` (fr, en, x-default), que lit aussi le sélecteur de langue de l'en-tête. |
| `node outils/wiki/indexer.js` | Régénère les index de recherche du wiki après une modification de page : `js/index-recherche.js` (pages françaises) et `js/index-recherche-en.js` (pages anglaises). |
| `node outils/site/liens.js` | Vérifie que chaque lien, image et vidéo des pages pointe vers un fichier existant, et chaque lien `hreflang` vers une page du wiki. |
| `node outils/site/publier.js [--sec]` | Construit le site (fichiers suivis de `docs/` + `docs/medias/`) et le pousse en force sur `gh-pages`, en un seul commit. Refuse une page qui contient un chemin de cet ordinateur ou un secret (porte de publication, `outils/publication/porte.js`). `--sec` prépare sans pousser. |

Tests : `node --test outils/site/*.test.js`.

Ordre pour publier : écrire la galerie (`galerie.js`), fabriquer les médias, vérifier la galerie (`galerie.js --verifier`), les liens entre langues (`langues.js --verifier`), indexer le wiki, vérifier les liens, publier.

Les aperçus de la galerie sont exportés par le plugin lui-même (une vidéo par lot, puis découpée par ffmpeg en boucles de 480 px et en images fixes) : comptez plusieurs minutes par lot. Ils ne sont refaits que si leurs sources changent (dictionnaire, moteur, styles, effets, personnages, chaîne d'export, `galerie-medias.js`).

Il faut, chez la personne qui publie : Node.js 20 ou plus, Chrome ou Edge, et ffmpeg (pour les vidéos). `publier.js` refuse de publier tant qu'une page cite un média absent de `docs/medias/`.
