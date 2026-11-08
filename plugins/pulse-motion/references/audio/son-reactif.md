# Son réactif

La musique et la voix peuvent faire bouger la vidéo. Chaque piste lue est analysée une fois, à l'ouverture de la page (60 instants par seconde, sans le volume ni les fondus du mixage) : l'aperçu et l'export donnent exactement la même chose.

- **Variables CSS** posées sur la vidéo à chaque image, entre 0 et 1 : `--son-volume`, `--son-basses`, `--son-mediums`, `--son-aigus`, `--son-battement` (1 sur un battement, puis retombe en 0,15 s), `--son-phase` (de 0 à 1 entre deux battements), `--voix-enveloppe` (force de la voix).

```html
<h1 id="titre" data-texte="titre" style="transform: scale(calc(1 + 0.08 * var(--son-battement, 0)))"></h1>
<div class="halo" style="opacity: calc(0.3 + 0.7 * var(--voix-enveloppe, 0))"></div>
```

- **Effets de particules** : `modulation` et salves `au: battement` (voir `pulse-motion reference particules/son`). **Shaders** : `iSon` et la texture audio (voir `pulse-motion reference shaders`).
- Une animation qui suit la voix passe par `var(--voix-enveloppe)` (`data-son` reste l'attribut des bruitages). Pour allumer un mot quand il est dit : sous-titres en mode `mot`, ou une ancre `mot:` (`pulse-motion reference audio/ancres`).
- Sans la piste suivie : contrôle `son-sans-piste` (alerte pour des variables CSS, qui restent à 0) ; une piste qui n'existe pas : `piste-inconnue`.
- Piste présente mais illisible (fichier abîmé) : ce qui la suit (effet, shader, variables CSS d'une scène ou du style) affiche un panneau dans l'aperçu et l'export est refusé ; remplacer le fichier de la musique ou de la voix.
- Dosage : un battement qui fait pulser un titre de 5 à 10 % suffit ; jamais un flash sur chaque battement (3 flashs par seconde au plus).

