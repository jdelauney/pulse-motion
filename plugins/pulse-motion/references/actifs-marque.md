# Les visuels d'une marque ou d'un produit

## L'essentiel

- Quand la vidéo parle **d'une entreprise ou d'un produit précis**, demander en **une seule question** ce que la personne peut fournir : logo, photos du produit, captures du logiciel, couleurs, polices, visuels déjà publiés.
- **Ordre d'importance** : le logo, puis ce qui montre le produit (photo, capture d'écran), puis les couleurs, puis les polices. Un produit reconnaissable compte plus que la bonne teinte de bleu.
- **Ne jamais redessiner un produit réel** en formes CSS ou SVG quand une photo ou une capture peut être fournie. Sans visuel, poser une **zone réservée honnête** et le dire.
- **Annoncer le système retenu en une phrase** avant de fabriquer : couleurs, polices, allure (« Je pars sur votre bleu marine avec l'orange en accent, la police Montserrat pour les titres, un rythme posé. »).
- **Vérifier les faits** cités sur le produit (version, date, prix, chiffre) avant de les écrire dans le déroulé ; ce qui n'est pas vérifié ne s'affiche pas comme un fait.

## La question des visuels

Une question `AskUserQuestion` à choix multiple, posée à la première ronde de `/pulse-motion:creer` quand le sujet nomme une marque ou un produit :

> « Qu'avez-vous déjà sous la main pour montrer <le produit> ? »
> - Mon logo (Recommandé)
> - Des photos du produit
> - Des captures d'écran du logiciel
> - Mes couleurs et mes polices
> - Rien pour l'instant

Puis demander les fichiers (chemin ou glisser-déposer) et les **copier** : logo dans `charte/`, autres visuels dans `assets/`. Les noms de fichiers sont gardés lisibles (`assets/produit-face.png`, `assets/capture-accueil.png`).

## Juger un visuel avant de s'en servir

| Critère | Seuil | Sinon |
|---|---|---|
| Définition | Plein cadre en 1080p : 1920 px sur le grand côté ; vignette : 800 px | Le dire ; l'utiliser plus petit, ou demander un meilleur fichier |
| Droits | Fourni par la personne, qui en a l'usage | Ne pas aller chercher d'image sur internet |
| Fond | Logo : PNG transparent ou SVG ; photo produit : fond uni ou détouré | Logo en JPEG : demander un PNG ou un SVG (règle de `/pulse-motion:creer`) |
| Cohérence | Même lumière, même angle pour une série | Ne garder que la série la plus homogène |
| Information | L'image montre quelque chose que le texte ne dit pas | Une image décorative de plus n'apporte rien : s'en passer |

## Couleurs et polices

- Couleurs tirées du logo : `pulse-motion charte depuis-logo` (primaire et accent, rendues lisibles sur le fond du style).
- Couleurs tirées d'un site ou d'un document : retenir celles qui reviennent **sur le logo, les titres et les boutons principaux** ; ignorer celles des photos, des illustrations et des exemples de démonstration, qui changent d'une page à l'autre.
- Polices : `pulse-motion police "<famille>"` ou le fichier fourni ; si elle n'existe pas en libre, garder la plus proche du style et le dire.
- Police fournie en fichier : `pulse-motion police <fichier> --style <style> --role titres|texte` (le rôle qu'elle prend dans la charte) ; réponse `aConfirmer` : poser la question à la personne, puis relancer avec `--confirmer` ; `avertissements` (caractères absents, avec la police du style à utiliser à la place) : les dire. Puis l'indiquer dans `charte/charte.json` (`"polices": { "titres": "<famille>" }`).

## Zone réservée honnête

Quand un visuel manque, on ne le simule pas :

```html
<div class="reserve" data-start="0.4" data-dur="0.6">
  <p class="texte" data-texte="reserve"></p>
</div>
```

- Le texte vient du déroulé (`"reserve": "Photo du produit à fournir"`) ; le bloc est un aplat de `--c-primaire` à 12 % (`color-mix`), aux proportions du visuel attendu.
- Le dire dans le compte rendu de l'animateur et à la personne : « J'ai laissé une place pour la photo du produit ; envoyez-la quand vous l'avez. »
- Le visuel arrive : remplacer le bloc par l'image, retirer la clé `reserve` du déroulé.

## Vérifier les faits

- Un nom de version, une date de sortie, un prix, un chiffre de performance : le prendre dans ce que la personne a fourni (document, site, brochure).
- Rien de fourni et le fait est important : proposer, **avec son accord**, une recherche sur internet pendant la préparation ; la vidéo elle-même reste sans connexion.
- Noter pour chaque chiffre affiché d'où il vient, et le dire en une phrase au moment du déroulé (« Le chiffre de 40 % vient de votre brochure de mars. »).

## À venir

- Champ `visuels` de la charte, pour que les visuels voyagent avec elle (`pulse-motion charte enregistrer`, `appliquer`) : `[{ "fichier": "produit-face.png", "sorte": "produit", "usage": "plein cadre", "fond": "transparent" }]`, avec `sorte` parmi `logo-clair`, `logo-sombre`, `produit`, `interface`, `photo` (chantier H, bibliothèque personnelle).
- Alerte du contrôle quand une zone réservée reste dans une vidéo qu'on exporte (spec S2) ; mention de la source de chaque chiffre dans le déroulé et règles « Exemple » et « à date » (spec S2, vérité des chiffres).
- Tirer une charte d'un site, avec accord, pendant la préparation (décision commune D3 ; spec S4, charte depuis le site).
