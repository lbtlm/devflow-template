# Repository Guidelines
Use this guide to keep contributions to the devflow template predictable and easy to review.

## Project Structure & Module Organization
- Keep the tree lean: start from `README.md`, add `src/agents/` for orchestrators, and `src/shared/` for reusable helpers.
- Store prompts or fixtures in `assets/`, docs in `docs/`, and add matching tests in `tests/agents/<name>.spec.ts`.
- Example: `src/agents/order-sync/index.ts` pairs with `tests/agents/order-sync.spec.ts`, while automation scripts live in `scripts/`.

## Build, Test, and Development Commands
- `corepack enable pnpm` — make pnpm available before installing.
- `pnpm install` — install dependencies once a `package.json` is present.
- `pnpm run dev` — start the local orchestrator; keep it fast and self-contained.
- `pnpm run build` — emit production artifacts into `dist/`.
- Use `pnpm run test` for the automated suite (CI uses this command) and `pnpm run lint` before asking for review.

## Coding Style & Naming Conventions
- Default to TypeScript ES modules; avoid mixing in CommonJS.
- Use 2-space indentation, trailing commas, and Prettier defaults; add `.prettierrc` overrides sparingly.
- Name directories `kebab-case` (`src/agents/order-sync/`), functions `camelCase`, and classes `PascalCase`.
- Keep experimental files prefixed `_` and out of exports; document config keys in `docs/config.md` plus `.env.example`.

## Testing Guidelines
- Adopt Vitest for fast feedback (`pnpm add -D vitest`).
- Place specs in `tests/`, mirroring source with `*.spec.ts`; keep fixtures in `tests/fixtures/`.
- Use `pnpm run test -- --coverage` and fail the build under 80% statement coverage.
- `pnpm run test -- --watch` is expected locally before pushing.

## Commit & Pull Request Guidelines
- Write short, imperative commits as seen in history (`Update README.md`); group logical changes.
- Reference issues with `Refs #123` in the body and call out breaking changes explicitly.
- Each PR must include a summary, test evidence (`pnpm run test` output), and UI screenshots when relevant.
- Wait for CI to pass, request at least one review, and update docs when the developer experience shifts.
