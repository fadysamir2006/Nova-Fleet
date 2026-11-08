# Nova Fleet: project context for AI coding agents

## What this is
An ORIGINAL 3D space game for the browser (mobile-first), built with Three.js + TypeScript + Vite.
It must not copy any existing game or franchise (no names, ships, UI layouts, icons, models, sounds).
Mechanics inspired by classic space-MMO games are fine (fitting slots, power budget, resistances, mining, colony building).
Every external asset must be CC0/permissive and recorded in CREDITS.md with URL and license.

## Owner and workflow
- The owner (Fady, Cairo) is not a professional developer. Explain steps simply, in short answers.
- Work in small phases. Run `npm run build` and `npm run lint` and fix every error before replying.
- Do NOT run long automated browser tests. Use build, lint and a quick dev-server check.
- Reply with: files changed, how to run, known limitations.
- Never put secrets or keys in the repo or client code. Never use a Supabase service_role key in the client.
- Windows PC, cmd shell, project folder: C:\Users\fadys\Desktop\Nova Fleet. Git is initialized (branch main). Owner commits manually after each working phase.

## Current state (verify by reading the code and update this section)
- Phase 1 done: single-player game with ship selection (3 placeholder hulls), flight, lasers, shields/hull, AI enemies, asteroid mining with cargo, HUD, mobile controls, Arabic/English strings, auto quality scaler.
- A balance/usability pass was requested: central config file (src/game/config.ts), slower flight, Easy/Normal/Hard difficulty (default Easy), grace period, enemy markers/radar, damage direction indicator, tutorial. CHECK which parts exist and finish the missing ones.

## Roadmap (do ONE phase at a time, only when the owner asks)
2. Foundation: npm workspaces monorepo (packages/shared pure game logic, apps/client Three.js, apps/server Node authoritative server on port 2567 with Colyseus or ws). Start screen with mode choice: "Solo vs System" (offline) or "Multiplayer" (rooms, quick play, join by code). Local dev first.
3. Three starting ship roles: Warden (combat), Mender (support/repair), Delver (mining). Fitting system: High/Mid/Low/Rig slots, CPU and Power Grid budgets, capacitor, resistances (kinetic/thermal/energy/EM), trade-off bars, circular fitting screen around a rotating 3D ship, saved loadouts (max 5 per ship).
4. Solar-system-style sector "Helion Reach" with 8 planets, each with 1-2 unique resources, refining, trade, resource codex, original procedural resource shapes (crystals, ores, pods, gels, canisters), realistic procedural planets (atmosphere, clouds, rings).
5. Colony: Command Center, Ship Factory, Barracks/Training Academy, Weapons Research Lab, Refinery, Power Plant, Storage, Defense, Medical Bay, Trade Hub; research tree; crew skills; persistence (localStorage for guests, Supabase for signed-in users with RLS).
6. Full multiplayer on the authoritative server (co-op sector and arena), prediction/interpolation, anti-cheat validation, leaderboard.
7. Free deployment: client on Vercel or Cloudflare Pages, server on a free host (may sleep: show a "waking the server" screen), Supabase for accounts and data (free tier).
8. Packaging: PWA first, then Capacitor (mobile) and Tauri/Electron (desktop).

## Architecture rules
- Game logic (simulation, combat, mining, stats, config) must stay independent from rendering so it can run on a server later. No DOM or Three.js imports in game-logic modules.
- All balance numbers live in one typed config file.
- Models load from public/models as glTF/GLB (Draco/KTX2). Keep procedural placeholders as fallback. Never download models at runtime.
- Performance: cap devicePixelRatio, instancing for asteroids, object pooling for bullets/particles, dispose resources, quality scaler (Low/Medium/High), 30+ FPS on phones.
- UI strings: Arabic and English (RTL support).

## Commands
- `npm install`, `npm run dev` (Vite on port 5173; use `vite --host` to test on phones in the same Wi-Fi), `npm run build`, `npm run lint`.