# Kickstart

Kickstart is a canvas for UX research and product design work. You add context to the canvas (briefs, documents, sticky notes), connect it, and Kickstart uses Gemini to generate design artefacts from it: interview scripts, personas, user flows, journey maps, wireframes, surveys and roadmaps. Artefacts can be sent to FigJam.

Only `@fluxon.com` Google accounts can sign in.

## Stack

- **Frontend:** React 19, Vite, Tailwind CSS 4, Motion
- **Server:** Express (`server.ts`), run with `tsx`. In development it also serves the Vite app.
- **AI:** Google Gemini via `@google/genai`
- **Data and auth:** Supabase (Postgres with row level security, Google sign-in)
- **Integrations:** Google Drive and Docs, FigJam (through a local Desktop Bridge)

## Getting started

**Prerequisites:** Node.js 20+ and npm.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy the example env file and fill in the values (see [Environment variables](#environment-variables)):

   ```sh
   cp .env.example .env
   ```

3. Start the app:

   ```sh
   npm run dev
   ```

4. Open http://localhost:3000 and sign in with a `@fluxon.com` Google account.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes | Gemini API key used by the server to generate artefacts. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. Used by the browser and the server. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable key. Safe in the browser; row level security protects the data. |
| `FIGMA_ACCESS_TOKEN` | No | Figma personal access token for the FigJam integration. |
| `APP_URL` | No | Public URL of the app, used for links and OAuth callbacks. |
| `PORT` | No | Server port. Defaults to `3000`. |

The `NEXT_PUBLIC_` prefix is kept so the names match the Supabase dashboard. Vite exposes both `VITE_` and `NEXT_PUBLIC_` variables to the browser.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Express server with Vite in development mode. |
| `npm run build` | Build the frontend into `dist/`. |
| `npm start` | Start the server. Set `NODE_ENV=production` to serve the built `dist/`. |
| `npm run preview` | Preview the built frontend with Vite (no API). |
| `npm run lint` | Type-check the project with `tsc`. |
| `npm run clean` | Delete build output. |

## Project structure

```
server.ts                 Express server: API routes, Gemini calls, Vite/static serving
server/
  artefactGenerator.ts    Prompts and generation for each artefact type
  figjamMcpServer.ts      FigJam MCP endpoint and Desktop Bridge (WebSocket)
  requireFluxonUser.ts    Middleware: only signed-in @fluxon.com users reach /api
  wireframeLayout.ts      Layout logic for generated wireframes
src/
  App.tsx                 App shell and auth gate
  ProjectWorkspace.tsx    Canvas for a single project
  components/             UI components (canvas, panels, artefact views)
  services/               Supabase, auth, Google Drive/Docs and FigJam clients
  data/                   UX research method data
  types/                  Shared types
supabase/migrations/      Database schema and access rules
```

## API

All `/api` routes need a signed-in `@fluxon.com` user.

| Route | Purpose |
| --- | --- |
| `POST /api/artefact/generate` | Generate a design artefact from canvas context. |
| `POST /api/roadmap/generate` | Generate a research and design roadmap. |
| `POST /api/roadmap/custom-step` | Generate one custom roadmap step. |
| `POST /api/mcp/figjam` | FigJam MCP endpoint. |
| `GET /api/mcp/figjam/status` | FigJam bridge connection status. |
| `GET /api/mcp/figjam/tools` | List the FigJam MCP tools. |

## Database

The schema lives in `supabase/migrations/`:

- `0001_projects.sql` creates `projects`, `project_nodes` (canvas blocks) and `project_edges` (connections).
- `0002_fluxon_only_auth.sql` limits sign-in and data access to `@fluxon.com` accounts.
- `0003_shared_figjam_files.sql` lets more than one project use the same FigJam file.

Access is enforced in three places: the browser (`src/services/allowedDomain.ts`), the API (`server/requireFluxonUser.ts`) and the database (row level security and a sign-up trigger).

To apply the migrations with the Supabase CLI:

```sh
supabase db push
```

## FigJam integration

When the server starts, it opens a Desktop Bridge on `ws://localhost:9223`. If that port is in use, it tries the next port up. The Figma desktop plugin connects to this bridge so Kickstart can draw artefacts in FigJam. Set `FIGMA_ACCESS_TOKEN` to enable it.

## Deployment

`wrangler.jsonc` deploys the built `dist/` folder to Cloudflare as static assets:

```sh
npm run build
npx wrangler deploy
```

Note: this deploys the frontend only. The Express API in `server.ts` (artefact generation, roadmap, FigJam) does not run on Cloudflare with this config. It must be hosted separately.
