# Idée reportée – Éditeur nodal d'effets

> 2026-10-11 · Statut : reporté · Contexte : `docs/superpowers/specs/2026-10-11-particules-p1-noyau-design.md`

## L'idée

Un éditeur à graphe, dans l'esprit de Niagara (Unreal) ou du VFX Graph (Unity), pour composer visuellement des effets de particules et des shaders : nœuds d'émission, de forces, d'attributs au cours de la vie, de rendu, reliés entre eux, avec aperçu en direct.

## Pourquoi c'est reporté

- C'est un produit en soi (interface, édition de graphe, sérialisation, annulation), plus gros que le noyau de particules lui-même.
- Le besoin est couvert d'abord autrement : Claude compose des recettes JSON (P1) et l'atelier (P2) permet de régler les paramètres en direct.
- Le format des recettes est déjà modulaire (émetteurs → naissance, forces, vie, rendu) : un éditeur nodal pourra le produire sans changer le moteur.

## Quand y revenir

Si l'on constate, après P2, que des utilisateurs avancés veulent créer des effets sans passer par Claude, ou que les recettes deviennent trop complexes pour être lues et retouchées en JSON.
