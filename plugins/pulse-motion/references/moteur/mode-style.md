# Mode « style »

Quand on vous demande d'écrire une **scène toute faite d'un style** (création d'un style personnel), et non une scène de vidéo :

- Écrire seulement `<dossier du style>/scenes/<type>.html` ; ne pas toucher aux autres fichiers du style.
- La section porte `data-scene="<type>"` ; les textes sont toutes les clés du type (`pulse-motion styles` donne les clés et longueurs maximales du catalogue), en `data-texte`.
- Un élément de décor au moins, marqué `data-decor`, qui bouge pendant toute la scène (`data-start="0"`, `data-dur` = durée conseillée ; conclusion : durée − 1 s).
- Commentaire d'en-tête : rôle, durée conseillée, textes et longueurs, sans la chaîne `<section` ni `data-texte="…"`.
- Mêmes règles que pour une scène de vidéo (minutage, `cqh`, variables de la charte et couleurs lisibles, aucune animation sans fin, aucun compteur CSS `counter()`, effets interdits).
