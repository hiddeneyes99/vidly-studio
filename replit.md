# Workspace

## Overview

pnpm workspace monorepo using TypeScript. The main artifact is "Creator OS" — an AI-powered personal dashboard for YouTube creators.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: `@workspace/creator-os` — React + Vite + TypeScript + TailwindCSS + shadcn/ui + Framer Motion + Recharts (port 5000 in dev)
- **Backend**: `@workspace/api-server` — Express on Node 24 (port 8000 in dev). Bundles via esbuild to `dist/handler.mjs` for Vercel serverless deploy.
- **Database**: Supabase (single `creator_data` table, JSONB blob, browser-side calls)
- **AI**: Gemini (`@google/genai`, `gemini-2.5-flash`) — server-side via `@workspace/integrations-gemini-ai` reading `GEMINI_API_KEY` (or fallback `VITE_GEMINI_API_KEY`)
- **Auth**: JWT (7-day expiry) over username/password stored as `APP_USERNAME` / `APP_PASSWORD` env vars. `JWT_SECRET` signs tokens. See `artifacts/api-server/src/middlewares/auth.ts` and `routes/auth.ts`. Frontend gate: `src/components/auth-context.tsx` + `src/pages/login.tsx`.
- **PWA**: `public/manifest.webmanifest` + `public/sw.js` (network-first nav, never cache `/api/`). SW registered only in PROD. Install prompt component: `src/components/install-prompt.tsx`.

## Deploy

Deployed on **Vercel**. Frontend = static files from `artifacts/creator-os/dist/public`. Backend = single Vercel Node serverless function at `api/[[...path]].mjs` re-exporting the bundled Express app. See `vercel.json` at repo root and the `Vercel deployment` section below.

## Artifacts

### Creator OS (`/`)
A personal dashboard web app for Technical White Hat (Hindi cybersecurity YouTube channel).
- **Frontend**: `artifacts/creator-os/` — React + Vite, dark mode default
- **Storage**: Supabase (`creator_data` table with one JSON row, key `default`)
- **AI**: Gemini called directly from the browser via `src/lib/gemini.ts`

### Required Secrets (Vite env vars)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GEMINI_API_KEY`
- (Optional) `VITE_YOUTUBE_API_KEY`

## Key Features
- Dashboard (Mission Control) — channel stats, goals progress, recent videos
- Video Tracker — track videos through Idea→Scripted→Recorded→Edited→Published
- Idea Bank — AI-powered idea generation + manual ideas
- Goals — subscriber/views/revenue/videos goal tracking with progress bars
- Schedule — monthly calendar view for content planning
- Script Writer — AI scriptwriting trained on the creator's "Content Creation R1.03" Hinglish framework. Sectioned editor (parses `## HEADING (mm:ss)` chunks), per-section regenerate (shorter/funnier/dramatic/add B-roll/example/simplify/more Hinglish), polish-with-AI, 5-variation hook generator (shock/question/story/statistic/promise), word + read-time counter, debounced auto-save, copy/export, full-screen teleprompter (variable speed + font + auto-scroll). Mobile-first list/editor swap, desktop split. Hooks live in `useGenerateScript`, `useGenerateScriptHooks`, `useRegenerateScriptSection`, `usePolishScript` — all share the `SCRIPT_SENSEI_SYSTEM` system instruction in `gemini.ts`.
- AI Studio — Title Generator, Description Generator, Tag Generator, Weekly Plan Generator
- Analytics — Recharts charts for manually entered data
- Settings — light/dark mode toggle, export/import JSON

## Data Storage
All user data lives in Supabase, in one `creator_data` row keyed by `id = 'default'`. The frontend loads it once on mount and writes a debounced upsert on every change. See `src/hooks/use-creator-data.ts`.

## AI (Gemini, browser-side)
All generators live in `src/lib/gemini.ts` and are exposed via React Query hooks in `src/lib/ai-hooks.ts`:
- `useGenerateContent` — general Gemini prompt (chat)
- `useGenerateVideoIdeas` — video idea generation (structured JSON)
- `useGenerateScript` — full video script
- `useGenerateTitles` — title optimization with clickbait + SEO scores
- `useGenerateDescription` — description + tags + hashtags
- `useGenerateWeeklyPlan` — weekly content plan
- `useGenerateThumbnail` — AI thumbnail (Nano Banana = `gemini-2.5-flash-image`, HD toggle = `gemini-3-pro-image-preview` with auto-fallback). Supports `useStrategy` mode: backend runs a 2-stage strategist pipeline (gemini-2.5-flash JSON plan → image) using an 8-pillar MrBeast-style framework + style presets (`money | tech | tutorial | drama | before_after`).
- `useGenerateThumbnailStrategy` — strategist-only call, returns the JSON plan (emotion, hookWord, expression, focalPoint, textOverlay, color palette, curiosityGap score, imagePrompt) without generating the image.

## Idea Bank
- Lives in `src/pages/ideas.tsx`. Mobile + desktop responsive.
- AI Brainstorm dialog has a **Source** tab: `niche` (default), `trending` (broad YT trends outside the channel niche, for audience expansion), `mixed` (half/half).
- Each idea card has an inline AI thumbnail studio (preview, prompt edit, HD toggle, download, save). Saved thumbnails live on `Idea.thumbnailUrl` and carry over when an idea is converted to a Video.
- Ideas can be pinned and filtered by source/format. Search across title/hook/tags.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
