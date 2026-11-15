# CLAUDE.md

Guidance for coding agents working in this repository.
Sections 1–4 adapt the Karpathy-inspired guidelines from
[multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills);
the rest is specific to this project.

**Tradeoff:** these rules favour caution over speed. For trivial changes, use judgment.

## 1. Think before coding

- State assumptions explicitly. If a request has more than one reading, say so and ask; don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- Never invent Home Assistant frontend APIs (selectors, `getConfigForm` options, `hass` fields, MDI icons). Check the frontend source first (selector shapes: `src/data/selector.ts`).
- A "missing" icon may be a design choice (generic icons by category): ask what is expected before treating it as a bug.

## 2. Simplicity first

- Minimum code that solves the request. No speculative features, options or abstractions.
- One file, no build step, until that stops being enough.
- If it could be half the length, rewrite it.

## 3. Surgical changes

- Touch only what the request needs. Don't reformat or "improve" adjacent code; match the existing style.
- Remove only what your own change made unused. Mention unrelated dead code, don't delete it.
- Every changed line should trace back to the request.

## 4. Goal-driven execution

- Turn the task into checks before coding: what the user must see, in which theme (HA light, HA dark, Orbit light, Orbit dark) and in which state (active, expiring, paused, empty).
- Verify layout and logic in Chromium with a simulated `hass`, then on a real Home Assistant. Measure contrast on computed styles, don't eyeball it.
- Report what was verified (Chromium checks, real HA) separately from what was only read. Never say "works" for something not run.

## Project

Lovelace card `custom:subscription-tracker-card` for the `subscription_tracker` integration (separate repo `ha-subscription-tracker`). Distributed through the Home Assistant Marketplace as a Dashboard plugin, served from `/local/community/`.

### Architecture

- Single source file: `dist/subscription-tracker-card.js`. `dist/` is the source, there is no build.
- Lit is taken from Home Assistant (`Object.getPrototypeOf(customElements.get("ha-panel-lovelace"))`); no bundled dependencies.
- The card computes nothing: every value comes from the integration's attributes, documented in the integration repo (`docs/attributes-contract.md`, `contract_version`). A new value starts as a new attribute there.
- `CARD_VERSION` must match the release tag; it is logged in the browser console, which is the first thing to check when a layout looks old (browser cache).

### Rules

- Accessibility: controls are `<button>`; expandable rows use `aria-expanded`/`aria-controls`; targets ≥ 44 px; visible `:focus-visible`; text contrast ≥ 4.5:1, graphics ≥ 3:1.
- No brand logos (generic icons by category); no external fonts or resources.
- Colours only through CSS variables: public tokens `--stc-*`, which by default point to the HA theme variables. Status colours used for text are derived by mixing with the theme text colour (HA's default amber alone is ~2:1 on white).
- Theme: inherits the HA theme by default; `theme: orbit` is an optional preset with fixed light and dark palettes; `mode` forces the scheme. Light or dark comes from `hass.themes.darkMode`, not `prefers-color-scheme`.
- "Off" states (paused) use the secondary text colour, never `opacity`.
- SVG: build it in one template (nested `html` templates inside `<svg>` create HTML-namespace elements that don't render).
- Visual editor via `static getConfigForm()`. `default` in the schema shows for booleans but not for selects (add a helper text); an emptied array field arrives as `[]` and means "not set".
- UI text is Italian; code comments, README and docs are English.
- Screenshots for the README live in `docs/`; the Marketplace shows the README of the installed tag.

### Tests

- No unit tests in this repo. Check in Chromium (Playwright) with a harness that mimics HA (`LitElement.prototype.html/css`), then on a real Home Assistant (card in `www/`, resource `/local/<file>.js`).
- CI: `.github/workflows/hacs.yaml` (category `plugin`). Workflow files are edited by the maintainer.

### Commits

Conventional title only, in English (`feat:`, `fix:`, `docs:`, `chore:`): no body, no trailers. The maintainer commits and pushes.
