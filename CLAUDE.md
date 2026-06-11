# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

WorldBet2026 — a full-stack web app for the 2026 World Cup. Next.js 16 (App Router, Turbopack) with TypeScript, Tailwind CSS v4, and React 19. Source lives in `src/` with the `@/*` import alias.

## Commands

- `npm run dev` — dev server
- `npm run build` — production build (includes TypeScript check)
- `npm run lint` — ESLint (flat config, `eslint.config.mjs`)

## Conventions

- **Package manager**: npm only. Do not introduce pnpm, yarn, or bun lockfiles.
- **Database**: planned but not yet chosen. Ask before picking one; don't assume.
- **Formatting**: Prettier (default config) runs automatically via a PostToolUse hook on every file Claude edits.
- Tailwind is v4 — configured via CSS (`src/app/globals.css`), no `tailwind.config.js`.
