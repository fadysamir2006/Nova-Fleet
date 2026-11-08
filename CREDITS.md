# Nova Fleet — Credits & Licenses

Nova Fleet is an original prototype. All game art, models, textures, effects, music, sound, lore, names, and interface artwork were created specifically for this project. No third-party game assets are used, and no external asset host is contacted at runtime.

## Original project assets

| Asset | Location | Author / origin | License |
| --- | --- | --- | --- |
| Playable and enemy hull geometry (placeholder prototypes) | `public/models/*.glb` | Generated for Nova Fleet by `scripts/generate-placeholder-models.mjs` | Original project asset |
| Hull generator script | `scripts/generate-placeholder-models.mjs` | Nova Fleet project | Original project asset |
| Deep-space cubemap, galaxy band, nebula, stars | generated at runtime in `src/render/SpaceEnvironment.ts` | Nova Fleet project | Original project asset |
| Ringed planet, atmosphere, and planetary shaders | generated at runtime in `src/render/Planet.ts` | Nova Fleet project | Original project asset |
| Asteroid geometry, field distribution, detail LOD | generated at runtime in `src/render/AsteroidField.ts` | Nova Fleet project | Original project asset |
| Particle sprites, engine trails, speed dust, muzzle flashes, shockwaves, mining beam | `src/render/ParticlePool.ts`, `src/render/SpeedDust.ts`, `src/render/VFX.ts`, `src/render/ShipVisual.ts`, `src/render/textures.ts` | Nova Fleet project | Original project asset |
| Music, engine loop, lasers, impacts, explosions, mining and UI cues | synthesized at runtime by `src/audio/AudioManager.ts` | Nova Fleet project | Original project asset |
| UI, favicon, menu, HUD, overlays | `src/style.css`, `src/theme.css`, `src/menu.css`, `src/hud.css`, `src/ui/*`, `public/favicon.svg` | Nova Fleet project | Original project asset |
| Shared UI kit: buttons, panels, bars, rings, tabs and tooltips | `src/ui/kit/index.ts`, `src/ui/kit/kit.css` | Nova Fleet project | Original project asset |
| Inline interface icons | `src/ui/dom.ts` (`ICONS`) | Original SVG line paths drawn for Nova Fleet; no third-party icon set or icon font | Original project asset |
| Start-screen hangar bay, dust motes and light rig | generated at runtime in `src/render/HangarPreview.ts` | Nova Fleet project | Original project asset |
| Ship names, faction names, roles, and lore | `src/assets-config/ships.ts`, `src/ui/i18n.ts` | Nova Fleet project | Original project asset |
| Phase 1 Fix & Complete: pilot name display, profile save feedback/persistence, star map on 'C'/autopilot, expanded boundaries, EVE fitting, colonies, market, resources | `src/game/types.ts`, `src/game/config.ts`, `src/game/resources.ts`, `src/game/solarSystem.ts`, `src/assets-config/*`, `src/ui/*`, `src/render/Planet.ts`, `src/render/ShipVisual.ts` | Nova Fleet project | Original project asset |
| English and Arabic interface copy | `src/ui/i18n.ts` | Nova Fleet project | Original project asset |
| Arabic/RTL layout, theme tokens and component styles | `src/theme.css` | Nova Fleet project | Original project asset |

No third-party fonts are loaded from a CDN at runtime. The interface uses locally bundled open-license font files (see the Fonts section) with the operating system font stack as fallback.

All interface icons are original inline SVG paths defined in `src/ui/dom.ts`. No icon font, icon pack, or external icon library is used. The UI kit is plain DOM and CSS code written for this project; it does not depend on a component library.

## Runtime dependencies

| Project | Version | Use | License | URL |
| --- | --- | --- | --- | --- |
| Three.js | 0.186.1 | WebGL renderer, scene graph, loaders, post-processing | MIT | https://github.com/mrdoob/three.js |
| Vite | 8.3.5 | Development server and production bundler | MIT | https://github.com/vitejs/vite |
| TypeScript | 5.9.3 | Language and type checking | Apache-2.0 | https://github.com/microsoft/TypeScript |

Development-only tooling:

| Project | Version | Use | License | URL |
| --- | --- | --- | --- | --- |
| ESLint | 10.13.0 | Linting | MIT | https://github.com/eslint/eslint |
| typescript-eslint | 8.72.0 | TypeScript lint rules | MIT | https://github.com/typescript-eslint/typescript-eslint |
| @eslint/js | 10.0.1 | ESLint base configuration | MIT | https://github.com/eslint/eslint |
| globals | 17.13.0 | Browser/Node global definitions | MIT | https://github.com/sindresorhus/globals |
| @types/three | 0.186.0 | Three.js typings | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |

Exact resolved versions are recorded in `package-lock.json`.

## Bundled decoders

The following decoder builds are copied into `public/` so compressed models and textures work offline and without a CDN. They are runtime assets distributed under their upstream licenses.

| Component | Files | Upstream | License | URL |
| --- | --- | --- | --- | --- |
| Draco 3D compression decoder | `public/draco/**` | Google Draco | Apache-2.0 | https://github.com/google/draco |
| Basis Universal transcoder | `public/basis/basis_transcoder.js`, `public/basis/basis_transcoder.wasm` | Binomial LLC, Basis Universal | Apache-2.0 | https://github.com/BinomialLLC/basis_universal |

The decoder folders include their upstream `README.md` files, which link to the full license texts. No modifications were made to the decoder binaries.

## Fonts

The interface fonts are bundled locally in `public/fonts/` and recorded in `public/fonts/fonts.css`. They are downloaded once at development time with `node scripts/fetch-fonts.mjs`; the game never contacts Google Fonts or any other font host at runtime.

| Family | Files | Use | License | URL |
| --- | --- | --- | --- | --- |
| Rajdhani | `public/fonts/rajdhani-*.woff2` | English display and body text | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Rajdhani |
| Share Tech Mono | `public/fonts/share-tech-mono-*.woff2` | English telemetry, labels and numbers | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Share+Tech+Mono |
| Noto Kufi Arabic | `public/fonts/noto-kufi-arabic-*.woff2` | Arabic interface text | SIL Open Font License 1.1 | https://fonts.google.com/noto/specimen/Noto+Kufi+Arabic |

Full OFL texts: https://openfontlicense.org/open-font-license-official-text/

No additional fonts or third-party icon assets were added for the shared UI kit.

## Audio

All audio is generated with the Web Audio API from oscillators, filtered noise, and envelopes created in `src/audio/AudioManager.ts`. There are no sampled recordings, music files, or third-party sound libraries.

## Attribution notes

- Three.js is used under the MIT License. Its copyright notice remains with the installed package and is reproduced in `node_modules/three/LICENSE`.
- Vite, ESLint, and the development packages retain their own license files under `node_modules/`.
- Draco and Basis Universal remain subject to the Apache License 2.0. Their local README files identify the upstream repositories and license links.
- If you replace a placeholder hull with an external model, record that model's author, source URL, and license in this file before shipping. Keep the license compatible with your distribution.
