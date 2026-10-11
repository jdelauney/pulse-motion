# 0001 – Seules les briques compatibles avec la licence MIT

> 2026-10-11 · Statut : acceptée

Pulse Motion est diffusé gratuitement, en code ouvert sous licence MIT. Seules les briques sous MIT, Apache 2.0, ISC, MPL 2.0 ou SIL OFL (polices) sont admises, avec leurs mentions de licence conservées. Cela permet de reprendre du code de showtime (MIT) et de hyperframes (Apache 2.0).

## Options écartées

- GSAP : gratuit mais sous licence propriétaire Webflow, qui interdit son usage dans des outils permettant de créer des animations sans code.
- Remotion : licence payante pour les entreprises de plus de 3 salariés.
- Code de mortiflix-oss (AGPL-3.0) et de vendor/nova-fx (GPL-3.0) : idées seulement.
- Robust Video Matting (GPL-3.0) : contaminerait le plugin.
- MatAnyone, VideoMaMa, BRIA RMBG : modèles réservés à un usage non commercial.
- Textes de motion-design-main : aucune licence, inspiration seulement.
- Assets de marque de showtime (`assets/brand/`) : hors licence MIT.

## Conséquences

- Chaque nouvelle dépendance ou modèle d'IA voit sa licence vérifiée avant d'être ajouté.
- Animation : animations natives du navigateur (CSS, Web Animations, SMIL) ; anime.js ou Motion (MIT) seulement en option.
