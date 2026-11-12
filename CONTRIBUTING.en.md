# Contributing to Pulse Motion

*Version française : [CONTRIBUTING.md](CONTRIBUTING.md). The French guide is the reference; this one follows it.*

Thank you for your interest. Pulse Motion is a Claude Code plugin that builds motion design videos on the user's own computer, with no cloud service. This guide explains how to set up the repository, run the tests, which rules to follow, and how to add a style, a particle effect, a move to the dictionary or a video template. To understand how a video is built, read [ARCHITECTURE.md](ARCHITECTURE.md) (in French, with an English summary at the top).

**The plugin, its skills and everything the user sees are in French**, and are meant for people with no coding background. Code, comments, commit messages and file names are in French too. You can open issues and pull requests in English.

## The repository

| Folder | Contents |
|---|---|
| `.claude-plugin/marketplace.json` | The `pulse-motion` marketplace, which holds a single plugin |
| `plugins/pulse-motion/` | The plugin, exactly as installed by users (see its [README](plugins/pulse-motion/README.md)) |
| `docs/` | The wiki published on GitHub Pages (HTML pages, styles, scripts, small screenshots); `docs/medias/` is generated and ignored by git |
| `outils/` | Maintainer tools, never shipped: wiki (`wiki/`), site and its media (`site/`), speed measurements (`mesures/`), icons (`icones/`), publication gate (`publication/`) |
| `.github/workflows/tests.yml` | Unit tests on Windows, macOS and Linux on every push |

Inside the plugin:

| Folder | Contents |
|---|---|
| `skills/` | The 13 skills (`creer`, `retoucher`, `exporter`…): what Claude does when the user asks for something |
| `agents/` | `animateur` (writes one scene) and `critique` (reviews the video from its contact sheets) |
| `scripts/` | The `pulse-motion` command (`scripts/pm.js`, run through `bin/`): assembly, preview, checks, export, history, voice, screen recording…; shared modules in `scripts/lib/` |
| `moteur/` | The JavaScript engine embedded in every page: clock, timing, camera, sound, particles, characters, transitions |
| `styles/` | Built-in styles |
| `effets/` | Particle effect recipes |
| `personnages/` | Character poses, moves, expressions, templates and drawings |
| `references/` | Instructions read by Claude (engine, rhythm, checks, direction, style sheets, move dictionary…) |
| `modeles/videos/` | Video templates; `exemples/`: one finished example per template |
| `shaders/`, `vendor/` | Shader backgrounds and transitions; embedded third-party libraries with their `PROVENANCE.md` |
| `tests/` | Tests (`node:test`), helpers (`tests/aide/`) and fixtures (`tests/fixtures/`) |

## Setting up

You need:

- **Node.js 20 or later** (Node 22 for the `--sauter` test option, as in CI). **No `npm install`**: the plugin has no dependencies.
- **Chrome or Edge**: preview, checks, export and half of the tests drive a headless browser.
- **ffmpeg**, optional: high-fidelity export, the tests that check it, and the site's media. Without it, those tests are skipped.
- **Python 3**, optional: voice transcription (whisper).
- **Claude Code**, to try the plugin for real.

```bash
git clone https://github.com/jdelauney/pulse-motion.git
cd pulse-motion
node plugins/pulse-motion/scripts/pm.js outils     # what is ready on this computer
```

To try your copy in Claude Code, add the local repository as a marketplace, then install the plugin:

```
/plugin marketplace add <path to your clone>
/plugin install pulse-motion@pulse-motion
```

Restart Claude Code after each change to the plugin. Manual test protocols are in `docs/essais/` (in French).

## Running the tests

```bash
cd plugins/pulse-motion
npm test                                        # everything: about 10 minutes
node scripts/lancer-tests.js --unitaires        # the browser-free phase, in parallel (a few minutes)
node scripts/lancer-tests.js --navigateur       # the phase that opens Chrome or Edge, two files at a time
node --test tests/deroule.test.js               # a single file
```

- `npm test` runs two phases: unit tests, then browser tests. A file that times out under load is retried once, alone, and the retry is reported.
- **Visual non-regression of the engine**: two reference videos (`tests/fixtures/etalon/`) are compared with reference frames recorded per operating system. When a rendering change is intended, `node scripts/lancer-tests.js --etalon` re-records them; say so in the commit message.
- **Determinism proof**: risky scenes (scene code, particles, characters) are rendered in two orders and compared (`tests/determinisme.test.js`).
- **Installed plugin**: one test copies the plugin out of the repository, then builds and exports the example as an installed plugin would.
- **Tested documentation**: rules, thresholds, commands and cross-references quoted by the references and skills are checked against the code (`tests/documentation.test.js`); the wiki is checked against the plugin (`tests/docs.test.js`, `tests/contribuer.test.js`…).
- **Skill evaluations** (does the right skill trigger?): `tests/evaluations/`, run separately with `claude plugin eval`; usage is at the top of `tests/evaluations/evaluer.js`.
- **Tools**: `node --test outils/site/*.test.js outils/mesures/*.test.js outils/publication/*.test.js`.
- **CI**: the unit phase runs on Windows, macOS and Linux on every push (`.github/workflows/tests.yml`); the browser phase runs on the development machine.

Common mistakes and their fixes are often already written down: `plugins/pulse-motion/references/pieges.md` (scene pitfalls, each with its symptom and fix) and the “Signaux d'alerte” table of `references/moteur.md`.

## Rules

1. **No npm dependency**, no cloud service, no online resource. A small permissively licensed library may be embedded in `vendor/<name>/`, with its `PROVENANCE.md` and notice; a short rewrite is preferred. Python, ffmpeg and whisper stay optional.
2. **Everything is built on the computer.** A video never loads anything from the internet, neither in preview nor at export. The network is only used while preparing, with the user's explicit consent (recording a website, taking brand colours from a website).
3. **Determinism.** A frame depends only on time: same project, same frames. No `setTimeout`, CSS transitions or unseeded randomness in a scene; a real-time source (recorded app, imported video) is frozen into frames inside the project.
4. **Additive changes.** Adding to the engine, the styles or the checks never changes how an existing video looks. Check thresholds (`scripts/seuils.json`) do not move without a written reason.
5. **French, no jargon, no commands.** Skills, messages and the wiki: users speak French and never see a terminal command, nor words like “JSON”, “CSS” or “preset” (`tests/jargon.test.js`). A skill description fits in 250 characters.
6. **French typography.** « » quotation marks, non-breaking space before `: ; ? !`, typographic apostrophe in video texts (the `typographie` check fixes them), French number format (“1 250”, “3,5”).
7. **Licences.** Code taken or adapted from an MIT or ISC project names its origin at the top of the file and in both `THIRD-PARTY-NOTICES.md` files (root and plugin), which stay identical. A mere idea is credited there too. Nothing under a copyleft or non-commercial licence.
8. **Version.** Every release bumps the version in `plugins/pulse-motion/.claude-plugin/plugin.json` **and** `plugins/pulse-motion/package.json` (`tests/versions.test.js`), in a separate commit: `chore: version X.Y.Z (résumé en français)`.
9. **Commits** in French, conventional format: `feat(…)`, `fix(…)`, `docs(…)`, `test(…)`, `chore: …`.
10. **Publication gate.** Before every push: `node outils/publication/porte.js`. It rejects a path of your computer (your home folder, the folder holding the repository) or a secret (private key, token) in any file tracked by git.

## Adding a style

A style is a folder `plugins/pulse-motion/styles/<id>/`:

| File | Role |
|---|---|
| `style.css` | The look: layout, entrance classes (`.entre-bas`…), decoration; sizes in `cqh`, colours and fonts **only** through the brand variables (`--c-*`, `--f-*`) |
| `charte.json` | Default colours and fonts of the style |
| `identite.json` | Category, uses, personality, signature, do's and don'ts, keywords, sound palette, provenance; `modules`: the `moteur/medium/` modules the style needs (ink in a canvas, single line, isometry, overprinted riso flats, flats offset from their broken line), included in the page only for that style, with their stylesheet `moteur/medium/<name>.css` if they have one |
| `catalogue.json` | The nine ready-made scenes and the texts they expect |
| `scenes/*.html` | The nine ready-made scenes (`titre`, `chiffre`, `liste`, `etape`, `comparaison`, `schema`, `alerte`, `moyeu`, `conclusion`) |
| `polices/` | Embedded fonts and their `LICENCES.md` |
| Textures (optional) | PNG tiles drawn from a seed by `outils/styles/textures.js` (40 KB at most, `--verifier` to check them), embedded through `url()` in `style.css` |

Then:

1. its 11-section style sheet, `references/styles/<id>.md` (template and validation: `scripts/lib/fiche-style.js`);
2. its place in `references/styles/recommandation.json` (recommended styles per genre);
3. `npm test`: `styles-livres`, `fiches-style`, `styles`, `contrat` and `temoin` check the files, the style sheet, the ready-made scenes filled with their sample texts, and the reference content;
4. the wiki: `node outils/site/medias.js galerie-styles`, then `node outils/site/galerie.js`.

A user's own style is created through `/pulse-motion:style` and lives in `~/.pulse-motion/styles/`: nothing to add to the repository.

## Adding a particle effect

1. A recipe `plugins/pulse-motion/effets/<name>.json`: name, description, tunable parameters, render layer and emitters. The format and its validation live in `moteur/particules/recette.js`; start from a similar recipe.
2. Document it in `references/particules.md` (or the relevant part of `references/particules/`).
3. `npm test` (`particules-recette`, `effets`, `particules-*`), then tune it by eye: `/pulse-motion:atelier-particules`.
4. The wiki: `node outils/site/medias.js galerie-effets`, then `node outils/site/galerie.js`.

## Adding a move to the dictionary

The dictionary, `plugins/pulse-motion/references/mouvements/mouvements.json`, gives each motion design move a stable number, its names (French and industry term), its meaning, a sentence to ask for it, when to use it, and its exact **recipe**.

1. Take the next free number; **a published number is never renumbered, a published name never renamed**. Add it to the frozen list `references/mouvements/numeros.json`.
2. The recipe only uses what the engine really does: a shared `pm-m-*` class from `moteur/mouvements.css` (tunable through `--pm-dur`, `--pm-courbe`, `--pm-ampleur`, `--pm-fois`), an attribute (`data-lettres`, `data-camera`, `data-gel`, `data-vitesse`, `data-tween`), a timeline transition, or a combination. Its numbers come from the code, never from a guess.
3. If the entry comes from Motion Prompt, its `motionPrompt` field holds the original number.
4. `npm test` (`mouvements`, `mouvements-css`); then `node outils/site/medias.js galerie-mouvements` and `node outils/site/galerie.js`: the gallery preview is rendered from the recipe, never drawn separately.

## Adding a video template

1. `plugins/pulse-motion/modeles/videos/<id>.json`: genre, format, duration, audience, scenes (ready-made scene type, intent, texts to fill, duration, transition, recommended moves), recommended styles, music mood, sentences to copy and audience variants. Validation is in `scripts/modeles.js` (`validerModele`); `trouverModele` must recognise the matching topics.
2. Its example, `plugins/pulse-motion/exemples/<id>/` (`deroule.json`, `scenes/`, `exemple.json`), **made by a real `/pulse-motion:creer` session** started with the published sentence, taking the recommended answers. `exemple.json` keeps the sentence, the answers and the edits: the wiki publishes them as they are. No voice in a published example.
3. `npm test` (`modeles`, `exemple`).
4. The wiki: `node outils/site/medias.js exemples`, then `node outils/site/galerie.js` (Ideas and Examples pages).

## The wiki

- Pages in `docs/` must read without JavaScript and over `file://`; header, navigation and footer come from `docs/js/gabarit.js` and `docs/js/donnees.js`.
- Command descriptions in `docs/js/donnees.js` follow those of the `SKILL.md` files: change them together.
- Blocks between `<!-- galerie:<name> -->` and `<!-- /galerie:<name> -->` are written by `node outils/site/galerie.js`: do not edit them by hand.
- After changing a page: `node outils/wiki/indexer.js` (search index) and `node outils/site/liens.js` (links).
- **English pages** (`docs/en/`, same path as the French page): only the documentation is translated, the plugin stays in French. A French page that has an English version is changed together with it (same outline: headings, blocks, links, `id`s, checked by `tests/documentation.test.js`). Gallery blocks are written in English too: a new or changed source text is translated in `outils/site/anglais.json` (`node outils/site/galerie.js --anglais` lists the missing ones). A new English page: `node outils/site/langues.js` (`hreflang` links of both pages).
- Publishing, by the maintainer, from `main`: `node outils/site/medias.js` (affected batches), `node outils/site/galerie.js --verifier`, then `node outils/site/publier.js`, which builds the `gh-pages` branch. Details: `outils/site/README.md`.
- The user-facing wiki only shows Claude Code `/pulse-motion:…` commands, never a terminal command.

## Reporting a problem, proposing a change

- A problem: open an [issue](https://github.com/jdelauney/pulse-motion/issues) with the Pulse Motion version, your system, what you asked for and what happened. Do not attach any text or file from a video you do not want to make public.
- A change: a branch, commits in the format above, `npm test` passing, the publication gate passed, then a pull request that says what changes for the user.

## Provenance

Pulse Motion takes or adapts ideas and code from open projects: Motion Prompt, Mediabunny, Lucide, argo, explainroo, rossark-motion-skill, take-one, reanimate, video-director, Lemo-Opuscar… Each borrowing is described in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). The step-by-step “adding a…” structure of this guide follows the contributor guides of reanimate (Niaz Morshed, MIT).

Repository licence: MIT ([LICENSE](LICENSE)).
