# Bilan de l'enquête – projets de référence et état de l'art (2026-10-11)

Lu à la demande. Synthèse des analyses faites pendant `/pulse:brainstorm`.

## Les 5 projets de référence (`E:\IA-PULSE\ressources\RD\`)

| Projet | Nature | Licence | À reprendre | À éviter |
|---|---|---|---|---|
| `dev-design/showtime-main` | Studio vidéo local pour agent ; runtime `skills/showtime/runtime/stage.js` (global `ST`) | MIT (sauf `assets/brand/`) | Contrat « frame = f(t) », horloge virtuelle (Date, rAF, Math.random remplacés), pause + `currentTime` des animations CSS/WAAPI, grammaire `data-start="#id+0.3"`, variables `--t`/`--p`, tailles en `cqh` (16:9, 9:16, 1:1 d'un seul fichier), `synth.js` (musique Web Audio), `check.mjs` (~55 règles, seuils dans `thresholds.json`), références avec bloc « Essentials » + index, table « Red flags » | Node + Python + ffmpeg + Chrome (0,6 à 5,7 Go), ~12 300 lignes de références, périmètre trop large |
| `dev-design/hyperframes-main` | HTML vers vidéo pour agents (HeyGen) | Apache 2.0 | Clips en `data-*`, timeline en pause dans un global, adaptateurs déterministes (`packages/core/src/runtime/adapters/`), linter ~60 règles orienté erreurs d'IA, `animation-map` (temps morts, collisions), contraste mesuré sur pixels, identité visuelle imposée avant le code, `house-style.md`, `motion-principles.md` | Télémétrie active par défaut, GSAP chargé par CDN, pas de SMIL, Chrome + ffmpeg (beginFrame Linux seulement) |
| `dev-020/motion-graphics-main` | Skill B-roll ; `skills/motion-broll/engine/motion.js` (146 lignes) | MIT (polices Geist OFL, icônes Lucide ISC) | `seek(t)` pur, springs en forme close (`M.track`), HTML autonome avec polices en base64, boucle plan validé → planche de stills relue → correction, flou de mouvement par sous-frames, alpha ProRes 4444 | Rendu lent (4 captures PNG par frame), bash/`/tmp` (pas Windows), une seule forme et une seule esthétique, pixels absolus |
| `dev-design/mortiflix-oss-main` | Orchestrateur de sessions Claude, rendu Remotion | AGPL-3.0 (idées seulement) | Règles appliquées par le code (`src/gates.mjs`), QC ffprobe (images noires/figées, -14 LUFS, durée), planche-contact relue, style avant mouvement (LOOK.md + 3 images clés), transition justifiée (porteur, raison, 2 à 4 familles) | Remotion (lourd, licence), pas de Windows, validation humaine à chaque étape |
| `dev-design/motion-design-main` | Prompts pour une IA vidéo cloud (Higgsfield) | Aucune (inspiration seulement) | Règles de timing (décalage 30 ms, pause finale ≥ 0,5 s, typo ~7 % de la hauteur), « meaning test », revue par horodatage pass/fail, validateur de timeline contiguë | Tout le modèle cloud |

## État de l'art (recherche web)

- **Moteurs** : GSAP gratuit mais licence Webflow interdisant les outils d'animation sans code ; anime.js v4 et Motion (motion.dev) sous MIT, seekables ; WAAPI natif (`document.getAnimations()` + `currentTime`) ; SMIL piloté à part (`svg.pauseAnimations()` + `setCurrentTime`) ; Remotion payant pour les entreprises.
- **Export fidèle** : Chrome sans fenêtre + capture par image + ffmpeg (voie de hyperframes, showtime). `HeadlessExperimental.beginFrame` seulement dans `chrome-headless-shell`.
- **Export sans installation** : WebCodecs + Mediabunny (MPL-2.0, ~17 ko) ; la rastérisation DOM/SVG vers canvas est le maillon faible (filtres SVG `url()`, `mix-blend-mode`, `backdrop-filter` mal gérés). HTML-in-Canvas (`drawElementImage`) en origin trial Chrome jusqu'à la version 160. MediaRecorder écarté (non déterministe).
- **Pièges** : attendre `document.fonts.ready`, polices embarquées, `<video>` à repositionner en attendant `seeked`, filtres SVG coûteux en aperçu temps réel.
- **Voix locale** : Kokoro (Apache 2.0, navigateur) mais une seule voix française (note B-, CC BY) ; Piper archivé, suite en GPL.
- **Détourage** : MODNet (Apache 2.0, `Xenova/modnet`, ~25 Mo) ou BEN2 (MIT) dans le navigateur par défaut ; BiRefNet-lite (MIT) en option qualité, lent et scintillant ; fond vert WebGL en secours. Exclus : RVM (GPL), MatAnyone, VideoMaMa, BRIA RMBG (non commerciaux). SAM 2.1/3 : Python + GPU. Sortie alpha sûre : ffmpeg `libvpx-vp9 -pix_fmt yuva420p` ou ProRes 4444.
- **Concurrents en plugins** : hyperframes (21 skills), Remotion (12 skills), showtime (10 agents) ; aucun en français, guidé, sans installation lourde.

## Guidage de pulse-vibe à transposer (`E:\IA-PULSE\pulse-vibe`)

Script qui décide de l'étape suivante (`scripts/etat.js`), rondes de 4 questions avec « (Recommandé) », mode découverte, bloc de fin ✅/📄/➡️, reprise par `in-progress.md` rappelée au démarrage, variantes comparées dans `comparer.html`, Node sans dépendance avec relais Windows. À alléger : 33 commandes, 30 000 à 60 000 caractères de contexte par commande.
