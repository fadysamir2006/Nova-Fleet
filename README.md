# Nova Fleet

An original, mobile-first 3D space combat and mining game that runs in the browser. Built with Three.js, TypeScript, and Vite.

Nova Fleet is a self-contained prototype: every ship, texture, particle effect, environment, sound, UI element, and line of lore was created for this project. No third-party game art, music, or models are loaded at runtime.

## Requirements

- Node.js 20.19+ (or 22.12+)
- A WebGL 2 capable browser
- npm (on Windows PowerShell, use `npm.cmd` if the `npm` shim is blocked by execution policy)

## Run locally

```bash
npm install
npm run dev
```

Then open the URL printed by Vite, usually `http://localhost:5173`.

### Test on a phone

The dev server is already started with `--host`, so it listens on your LAN:

```bash
npm run dev -- --host
```

1. Put the phone and computer on the same Wi-Fi network.
2. Open the `Network:` URL printed by Vite (for example `http://192.168.1.20:5173`).
3. Turn the phone to landscape. A portrait device shows a rotate prompt.
4. Tap the screen once to unlock audio, choose a hull, and launch.

If the page does not load, allow Node/Vite through the local firewall for private networks.

## Production build

```bash
npm run build
npm run preview
```

`build` runs `tsc --noEmit` first, so type errors fail the build. The static output is written to `dist/`. Serve it from any static host; the app uses relative asset paths so it also works from a subdirectory.

Lint:

```bash
npm run lint
```

## How to play

### Desktop

| Input | Action |
| --- | --- |
| `W` / `S` | Throttle forward / reverse |
| `A` / `D` | Yaw left / right |
| `Z` / `X` | Strafe left / right |
| Arrow keys | Pitch and yaw |
| Mouse | Steer toward the cursor |
| Left click / `Space` | Fire pulse cannons |
| `E` | Hold to mine a locked asteroid |
| `Shift` | Boost (has a cooldown / recharge) |
| `1`–`8` | Toggle the matching system module in the capacitor rack |
| `Tab` | Cycle the nearest raider target; uses the lead indicator |
| `C` | Toggle the star map (warp / autopilot) |
| `Esc` or `P` | Pause / resume |
| `F3` | Toggle performance telemetry |
| `M` | Toggle audio |

### Touch

- **Left stick:** thrust and strafe.
- **Right stick:** pitch and yaw.
- **Fire:** pulse cannons (large primary button).
- **Target:** cycle raiders and show their lead marker.
- **Mine:** hold while an asteroid is locked.
- **Boost:** burst speed.
- **System modules 1–8:** tap a ring slot to toggle it; a sweep shows its cooldown.
- **Throttle:** drag the bottom-left lever to hold a cruise setting. Manual thrust temporarily overrides it.
- **Overview:** tap a row to select an object, then use the action buttons (Approach, Lock, Fire, Mine, Orbit, Warp). The panel starts collapsed on touch.
- Dual sticks use pointer capture, so a thumb can leave its ring without losing input.
- Speed and stick sensitivity can be adjusted from the pause menu; both persist.
- Buttons pulse haptically where the browser supports the Vibration API.

The HUD is safe-area aware for notched phones. The viewport prevents page scroll and pinch zoom.

## Start screen

The start screen is a cinematic hangar diorama rendered in the same WebGL canvas: the selected hull turns under a cold key light, a coloured rim light and a warm deck fill, with a faint procedural station bay and drifting dust motes behind it. Nothing is loaded from disk for the bay; it is generated in `src/render/HangarPreview.ts`.

- **Left rail (right in Arabic):** Play, Ship Hangar, Fitting, Colony, System Map, Market, Settings, Credits.
- **Play** is a mode step. *Solo vs System* launches the offline run; *Multiplayer* is visible but disabled until the server phase.
- **Ship carousel:** three original hulls labelled Combat, Support / Repair and Mining, each with a short description and six bars (Damage, Tank, Mobility, Capacitor, Cargo, Mining).
- **Hangar panel:** full lore and the same six bars as labelled telemetry.
- **Top bar:** language, audio and haptics icon buttons (same 34 px size, 44 px on touch).
- **Status bar:** version tag and the credits/licences link.
- **Keyboard:** `←`/`→` switch hulls, `Enter` launches, `Esc` returns to Play or closes a dialog. The carousel also scrolls and snaps by touch.
- Fitting, Colony, Market and System Map open their existing panels from the rail; Fitting shows a Phase 3 placeholder with the current slot counts.

## Game loop

1. Pick **Solo vs System**, choose a hull in the hangar carousel and a threat level, then launch. Easy is selected by default.
2. Every run starts at full shield and hull. The first wave has exactly two slow raiders, and hostile weapons stay offline for a 15-second grace period.
3. Follow the start-of-run tutorial: find the red raider marker and score a hit, then lock an asteroid and hold `E` (or **Mine**) to extract ore. The tutorial can be skipped.
4. Raiders always warp in ahead of the player, at least 650 m away, with a visible warp effect. Red edge markers and the radar show threats outside the camera view.
5. Shields regenerate after a damage-free delay; hull damage repairs slowly after a longer delay, least on Hard. Destroying raiders raises the wave count and score. Ore adds score too.
6. Leaving the soft boundary triggers a warning. The hard boundary pulls you back.
7. If the hull reaches zero, the run ends with a score, kill, ore, and flight-time summary.

Cargo has a hard capacity. When it is full, mining stops and the HUD warns you. The run is score-attack style; there is no shop or save between runs.

## Difficulty, settings and tutorial

The start screen and pause menu both offer **Easy**, **Normal**, and **Hard**. The choice is saved in `localStorage` and applies immediately to living raiders, including their health, speed, turn rate, damage, and fire cadence.

| | Easy (default) | Normal | Hard |
| --- | --- | --- | --- |
| Enemy damage | 40% | 70% | 100% |
| Enemy accuracy | Wide spread | Moderate spread | Tight spread |
| Enemy fire interval | 1.85× slower | 1.35× slower | Base |
| Shield regen delay | 3 s | 4.5 s | 6 s |
| Max raiders alive | 6 | 7 | 8 |

Every raider shot is telegraphed for 0.7 s before it fires. The aiming line shows the direction, the shot is visible in flight, and its aim is locked when the warning begins, so moving after the warning is a reliable dodge.

The pause menu also contains mobile speed and sensitivity sliders, HUD scale and opacity sliders, aim-assist and assisted-flight toggles, quality selection, audio, and haptics. Mobile defaults to 78% speed, 80% sensitivity, aim assist on, and assisted flight on. Desktop defaults to 100% speed, 100% sensitivity, and both assists off. Preferences persist across runs.

The HUD includes a 1.2 km radar, red off-screen raider markers with range, and a lead indicator for the selected target. `Tab` (desktop) or **Target** (touch) cycles the nearest-to-farthest living raider.

## Flight HUD

The in-flight layout is built from edge-anchored clusters, so the centre of the screen stays clear for flying and aiming:

- **Top left:** up to three locked-raider cards with shield/hull bars, followed by the mission/objective tracker and run telemetry (wave, hostiles, score, pilot).
- **Top right:** the 1.2 km radar and animated warning chips for incoming fire, low capacitor, and a full cargo hold.
- **Right:** a collapsible **Overview** panel with All / Hostiles / Mining / Structures filters. Rows show the object name, type, and distance; selecting one opens its actions (Approach, Lock, Fire, Mine, Orbit, Warp). It is draggable by its header on desktop and starts collapsed on touch.
- **Left rail:** Map, Fitting, Cargo, Colony, Market, Settings. Cargo shows the hold percentage; Settings opens the pause/settings panel.
- **Bottom centre:** the capacitor ring with shield, armor, and hull arcs and percentages. Eight system slots orbit above it (keys `1`–`8`, tap on touch) with active glow and a cooldown sweep.
- **Bottom left:** speed readout and a persistent throttle lever.
- **Bottom right:** compact cargo with per-resource amounts and a fill bar.
- **Settings:** pause menu adds **HUD scale** (80–130%) and **HUD opacity** (40–100%). Both persist. Alerts and the damage direction indicator stay fully opaque.

The layout mirrors in Arabic/RTL. Updates are batched: the main HUD refreshes at 20 Hz, the Overview at 4 Hz with keyed row diffing, and arc/bar widths are only written when they change.

## UI kit

Shared interface primitives live in [`src/ui/kit/`](./src/ui/kit/) and are imported from `src/ui/kit/index.ts`. The kit is framework-free DOM code, so the same controls can be reused by the hangar, colony, market, and later roadmap screens without pulling in a UI dependency.

| Primitive | Exports | Used by |
| --- | --- | --- |
| Buttons | `createButton`, `createIconButton` | HUD rail, module rack, object actions, collapse toggles, panel close buttons |
| Panels | `createPanel` | HUD mission tracker, Overview, cargo |
| Bars | `createBar` | Target shield/hull bars, selected-object bar, cargo fill |
| Rings | `createRing` | Capacitor ring with shield/armor/hull/capacitor arcs |
| Tabs | `createTabs` | Overview filters, with arrow/Home/End keyboard support |
| Tooltips | `attachTooltip` | HUD rail and module labels, with RTL-aware placement |

`src/ui/kit/kit.css` is imported first in `src/main.ts`, before `style.css`, `theme.css`, `menu.css`, and `hud.css`. That keeps the kit as a reusable baseline while letting each screen override sizing, colour, and layout. Existing screens can pass their own classes to the primitives; no duplicate component CSS is required to adopt them.

Tooltips read their text through a getter, so a language change updates them without rebuilding the button. Bars and rings cache their last value and only write the DOM when the ratio changes. Tabs use roving `tabIndex`, `aria-selected`, and automatic activation; ring SVGs are decorative unless an `ariaLabel` is supplied.

## Balance tuning

All gameplay balance lives in [`src/game/config.ts`](./src/game/config.ts). The simulation never reads tuning from render or UI files, so a number can be changed once and takes effect across the player, AI, HUD, and event presentation.

| Export | What it controls |
| --- | --- |
| `PLAYER_TUNING` | Base hull/shield, regeneration delays, max speed, turn rate, acceleration/damping, boost, cannon damage/fire rate/projectile speed, mining, aim assist, camera shake, 15 s opening grace |
| `SHIP_TUNING` | Per-hull multipliers for health, shield, speed, turn, damage, fire rate, mining, cargo, radius, and boost |
| `ENEMY_TUNING` | Raider health/shield, regen, speed, turn, accuracy/aim gain, burst timing, fire range/interval, projectile speed, respawn delay, spawn distance/cone, warp and telegraph timings |
| `DIFFICULTIES` | Per-difficulty enemy damage, accuracy spread, fire interval, speed, turn, health, regen delays, alive cap, and wave growth |
| `WAVE_TUNING` | Kills per wave, new raiders per wave, global cap, per-wave health/speed/damage/fire-rate scaling, first-wave speed scale |
| `WORLD_TUNING` | Seed, asteroid field size/count/yield, boundaries, respawn delay, scores, and projectile pool size |
| `SETTINGS_LIMITS` | Valid ranges and mobile/desktop defaults for speed, sensitivity, HUD scale, and HUD opacity |

Useful starting points:

- **Make Easy gentler:** lower `DIFFICULTIES.easy.enemyDamageMultiplier`, increase `enemyAccuracySpread`, or increase `enemyFireIntervalMultiplier`.
- **Slow the opening:** raise `PLAYER_TUNING.gracePeriod` or lower `WAVE_TUNING.firstWaveSpeedScale`.
- **Change spawn safety:** adjust `ENEMY_TUNING.spawnMinDistance`, `spawnPreferredMinDistance`, `spawnMaxDistance`, or `spawnConeDegrees`. Spawns are rejected if they are behind the player, too close, or inside an asteroid.
- **Change targeting feel:** tune `PLAYER_TUNING.aimAssist.coneDegrees`, `strength`, and `range`; the toggle only changes player aim, not enemy accuracy.
- **Reset saved preferences:** run `localStorage.removeItem('nova-fleet-settings')` in the browser console, or clear site data.

`npm run build` type-checks the config and catches mismatched tuning fields. `src/assets-config/world.ts` re-exports `WORLD_TUNING` as `WORLD_CONFIG` for compatibility, but new work should import from `src/game/config.ts`.

## Ships

| Hull | Role | Strength |
| --- | --- | --- |
| Skylance | Interceptor | Fast, agile, rapid cannons; thin armor |
| Ironwake | Bulwark | Heavy hull and shields, hard-hitting slow cannons |
| Deepmaw | Prospector | Large cargo hold and fast mining; weak weapons |

Every player hull and the raider currently use **clearly labeled placeholder geometry** generated by `scripts/generate-placeholder-models.mjs`. The menu marks them as prototypes.

## Phase 1 (Roadmap): User Profiles, Persistent Storage, Interactive Star Map

Nova Fleet now includes:

- **Player Name Display:** The saved callsign appears in a compact chip under the hangar title, and as a pilot cell in the top-left mission tracker.
- **User Profiles & Persistence:** Start screen allows entering/saving pilot name. Clicking **Save** stores profile data (name, ship choice, difficulty) to `localStorage` with visible confirmation **"Profile Saved Successfully!"**. Clean reset/new profile option available.
- **Interactive Star Map (C):** Press **C** or HUD Map icon to open the Solar System Star Map. Shows central sun and planets (**Terran, Volcanic, Ice, Barren**) with unique rare resource icons and distance. **Warp / Autopilot** instantly repositions the ship to orbit the selected planet.
- **Expanded Space Boundaries:** World borders expanded/relaxed so players can freely fly toward planets without premature "return to playfield" warnings.
- **Fitting, Colonies, Market:** EVE-style fitting, colony management, refinery, and station market remain integrated.
- **Tactical Interface:** MMO-style HUD/reticles with bilingual support (English/Arabic). All systems original, recorded in `CREDITS.md`.

### Swapping in a real glTF/GLB

Put your model under `public/models/` and change the single `modelPath` line for that ship in `src/assets-config/ships.ts`:

```ts
modelPath: '/models/my-ship.glb',
```

Enemy geometry is set by `ENEMY_SHIP.modelPath` in the same file. Set a path to `null` to use the procedural fallback.

The loader supports Draco-compressed meshes and KTX2/Basis textures. Decoders are bundled locally in `public/draco/` and `public/basis/`; nothing is fetched from a CDN. Models should:

- Face **-Z** (the game's forward axis).
- Use meters approximately matching the configured `scale`.
- Optionally name engine glow nodes `engine_glow*`; the renderer attaches engine sprites to them.

The current placeholder GLBs are regenerated with:

```bash
npm run generate:models
```

## Rendering and performance

- Physically based materials, ACES Filmic tone mapping, sRGB output.
- Procedural cubemap deep-space skybox, galaxy band, nebula tints, and a shader-based ringed planet with atmosphere.
- Directional sunlight, soft ambient/fill light, bloom post-processing on Medium/High.
- Instanced asteroid field with distance-based detail, pooled projectiles and particles.
- Engine trails, speed dust, muzzle flashes, impact sparks, shockwaves, and mining beams.
- Automatic quality scaler with hysteresis: Low / Medium / High, selectable from the pause menu.
  - Low: DPR capped at 1, bloom off, 260 particles, closer asteroid LOD.
  - Medium: DPR capped at 1.4, soft bloom, 620 particles.
  - High: DPR capped at 1.9, stronger bloom, 980 particles.
- Mobile starts at Medium, desktop at High; low-core/low-memory devices start at Low.
- `F3` shows FPS, draw calls, triangles, particle count, DPR, asteroid count, and position.
- Pause and game-over screens present a static frame instead of rendering continuously.

## Project structure

```
src/
  assets-config/   Ship stats, resources, world constants
  ai/              Renderer-free enemy control logic
  audio/           Runtime-synthesized audio graph
  game/            Simulation, central balance config, math, and shared types (no Three.js imports)
  render/          Three.js scene, loading, effects, quality, camera
  ui/              DOM HUD, menu, overlays, input, i18n, haptics
  ui/kit/          Shared UI kit: buttons, panels, bars, rings, tooltips, tabs
  main.ts          App state machine and wiring
  style.css        Base layout, tokens and original component styles
  theme.css        Newer components, bundled fonts, RTL and touch sizing
  menu.css         Cinematic start screen: rail, panels, ship carousel
  hud.css          In-flight HUD: clusters, capacitor rack, overview, cargo
public/
  models/          Local GLB hulls
  fonts/           Bundled open-license UI fonts (OFL)
  draco/           Local Draco decoder
  basis/           Local KTX2/Basis transcoder
  favicon.svg      Original mark
scripts/
  generate-placeholder-models.mjs
  check-i18n.mjs        Fails the build if EN/AR strings drift
  fetch-fonts.mjs       One-time font download (development only)
```

Game rules never import the renderer. `GameSimulation` owns movement, weapons, mining, cargo, AI intents, boundaries, and events; `GameRenderer` consumes snapshots and drains presentation events.

## Languages

The UI ships in English and Arabic with full RTL layout switching. The language choice persists in `localStorage`. Technical identifiers, ship class names, and the HUD's monospace telemetry remain readable in both directions.

Arabic switches `<html dir="rtl" lang="ar">`, uses the bundled **Noto Kufi Arabic** face and drops letter tracking so the script stays connected. Panel edges, form fields and lists use logical properties, and directional icons (such as the launch arrow) mirror automatically. The flight HUD mirrors its edge clusters in Arabic: mission/targets and radar swap sides, the icon rail moves to the right, and the Overview opens on the left. Text alignment and reading order flip with them.

English uses the bundled **Rajdhani** (display/body) and **Share Tech Mono** (telemetry) faces. Both are SIL OFL 1.1 and are served locally from `public/fonts/`; see `CREDITS.md`.

### Missing-string guard

`npm run check:i18n` scans every `t('…')`, `localized(…)` and `data-i18n` reference in `src/`, then compares it with both dictionaries in `src/ui/i18n.ts`. It fails when a key is absent from English, absent from Arabic, or exists in only one language. The script runs automatically before `npm run dev` and `npm run build`. At runtime an unknown key falls back to English, then to a readable version of the key, and logs a warning in development — it never renders a raw `profile.title` string.

## Credits

See [CREDITS.md](./CREDITS.md) for the complete asset and dependency inventory.

## Known limitations

- Placeholder hulls are intentionally simple low-poly prototypes.
- The audio is synthesized at runtime. Some browsers require a tap or key press before sound starts.
- Haptic feedback depends on the Vibration API; iOS Safari does not expose it.
- Auto quality reacts to measured frame rate; the first few seconds of a run may render above the eventual level.
- No gamepad, multiplayer, save progression, or persistent leaderboard yet.
- The game-over and pause screens are intentionally static to save battery/GPU.
- Portrait play is blocked by design; the game is tuned for landscape.
- The Overview currently lists raiders, asteroids, and planets. There are no stations or gates in the world data yet.
- The eight systems in the capacitor rack are a HUD-level preview. They glow, sweep, and toggle, but real fitting and module activation arrive with the Phase 3 fitting system.
- **Orbit** and **Warp** both move the ship to the planet's orbital coordinate. There is no persistent orbital motion yet.
- The star map warp target is correct, but the rendered background planet is still a single decorative body rather than one mesh per orbital coordinate.
- At 130% HUD scale on a very small window, the Overview and the top-left stack can crowd each other; collapse or drag the Overview.
- The UI kit is internal to the client and has no visual regression tests yet; new screens should reuse its primitives and check both English and Arabic layouts.
- The project targets modern evergreen browsers with WebGL 2 and ES2022.
