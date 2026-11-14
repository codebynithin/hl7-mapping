# HL7 Mapping Configurator

A MEAN monorepo for browsing HL7 mapping configurations against sample HL7 messages.

| App         | Stack                                        | Port                         |
| ----------- | -------------------------------------------- | ---------------------------- |
| `backend/`  | Node 20+, Express 5, MongoDB driver 7        | `PORT` in `.env` (3000)      |
| `frontend/` | Angular 17 (standalone, signals), PrimeNG 17 | `FRONTEND_PORT` in `.env` (4200) |

## Prerequisites

- Node.js **20.9+**. `.nvmrc` pins 20, the only major supported by both the MongoDB 7 driver (20+) and Angular 17 (18.13+ or 20.9+). Node 22 also works, but the Angular CLI prints an "Unsupported" warning.
- MongoDB reachable at `mongodb://localhost:27017` with a `config-service` database. Use the seed script below if it's empty.

## Quick start (both apps)

From the repository root:

```bash
nvm use                         # or any Node 20.9+
cp .env.example .env            # one file for both apps: ports, Mongo, CORS
npm install                     # also installs backend/ and frontend/ (postinstall)
npm run start:dev               # API on PORT + UI on FRONTEND_PORT, one terminal
```

`.env` is gitignored. Both apps load the root file through `scripts/load-env.js`:

| Variable        | Used by                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `MONGO_URI`     | Backend connection                                                      |
| `DB_NAME`       | Backend database (`config-service`)                                     |
| `PORT`          | Express listen port, and the Angular dev proxy target                  |
| `FRONTEND_PORT` | `ng serve` port (`npm start` in `frontend/` reads it)                   |
| `CORS_ORIGIN`   | Origins allowed to call the API directly. Keep it aligned with `FRONTEND_PORT`. |

A variable already set in the shell overrides the file, so `DB_NAME=scratch npm run seed` still works.

Output is prefixed `[api]` / `[web]`. If either app fails to start, the other is stopped too.

| Root script             | What it does                                                    |
| ----------------------- | --------------------------------------------------------------- |
| `npm run start:dev`     | Backend with `node --watch` and `ng serve`, side by side        |
| `npm start`             | Same, but the backend runs without watch mode                   |
| `npm run dev:backend`   | Backend only (`backend` → `npm run start:dev`)                  |
| `npm run dev:frontend`  | Frontend only; extra args go to `ng serve`, e.g. `npm run dev:frontend -- --port 4300` |
| `npm run seed`          | Seed sample data (see below)                                    |
| `npm test`              | Frontend unit tests, single run in headless Chrome              |
| `npm run build`         | Production build of the frontend into `frontend/dist/`          |

The sections below run each app on its own.

## Backend

```bash
cd backend
npm install                 # the root .env must already exist
npm run start:dev           # node --watch; use `npm start` without watch
```

All endpoints are read-only:

| Method | Path                    | Returns                                                                  |
| ------ | ----------------------- | ------------------------------------------------------------------------ |
| GET    | `/api/hl7-mapping`      | Mapping summaries (`_id`, `displayName`, `type`, `direction`, `fieldCount`, …) |
| GET    | `/api/hl7-mapping/:id`  | Full mapping document, including `hl7Mappings`                           |
| GET    | `/api/hl7-message`      | Message summaries, without the `message` body                            |
| GET    | `/api/hl7-message/:id`  | Full message document                                                    |
| GET    | `/api/health`           | `{ status: 'ok' }`                                                       |

An id that isn't a valid ObjectId returns `400`, and an unknown id returns `404`. Errors use the JSON shape `{ status, error }`, and 5xx details are logged on the server but not returned to the client.

### Seed data

```bash
npm run seed                      # from the root, or `npm run seed` inside backend/
DB_NAME=scratch npm run seed      # shell variables override .env
```

The seed upserts one mapping ("EMR Orders - ORM") and two sample messages by `name`. It's idempotent: re-running it never duplicates or modifies other documents.

## Frontend

```bash
cd frontend
npm install
npm start                   # http://localhost:$FRONTEND_PORT, from the root .env
```

`frontend/proxy.conf.js` reads `PORT` from the same file and forwards `/api` to the backend, so start the backend first. To use another UI port for one run, pass it after the script: `npm start -- --port 4300`. Update `CORS_ORIGIN` if a browser will call the API directly; the dev proxy does not need CORS.

Unit tests (HL7 parser and mapping adapter):

```bash
cd frontend
npx ng test --watch=false --browsers=ChromeHeadless
```

## How the UI maps the data

The stored mapping is a flat list of `{ segment, field, variable, value?, description? }` entries. The client turns it into an editable, sectioned view model in `core/utils/mapping-adapter.ts`:

- Entries that share a `variable` and `value` become one field with several HL7 paths. For example, `PAT.FULL_NAME` → `PID.5.1, PID.5.2`.
- `value` is shown and edited as the field's **default value**.
- Fields are grouped into sections (Message Header, Patient, Insurance › Guarantor, Visit, Order, Tests › AOEs, Diagnoses, Notes, Other). Grouping is by variable prefix, with the HL7 segment as a fallback. The rules are in `core/models/mapping-sections.ts`.

The selected sample message is parsed in the browser (`core/services/hl7-parser.service.ts`) into a value map and a segment → field → component → subcomponent tree:

- Repeating segments are labelled `OBX [1]`, `OBX [2]`, … and keyed `OBX[2].5.1`. A plain `OBX.5.1` resolves to the first occurrence.
- Field repetitions (`~`) use the first repetition.
- Paths that are mapped but missing from the sample are added as "not in sample" nodes so existing selections stay visible.

Switching the sample message keeps all mapping edits; only the displayed sample values change.

## Deploy on Render

`render.yaml` defines one free web service in the Oregon region. Express serves both `/api` and the Angular build, so the browser keeps calling `/api` on the same origin.

Render builds with `npm install && npm run build` and starts with `npm run start:prod`. Node 20 comes from `NODE_VERSION`. Leave `PORT` unset so Render can assign it. `npm start` does the same thing when `RENDER=true`, and locally it still runs the API plus `ng serve`.

Before the service can start, set `MONGO_URI` in the Render dashboard to a database Render can reach, such as MongoDB Atlas. `mongodb://localhost` only works on your machine. `DB_NAME` defaults to `config-service`. `CORS_ORIGIN` is optional because the UI and API share one host.

The Blueprint is read from GitHub, so commit and push `render.yaml` to `master` first, then create the Blueprint in the Render dashboard (or ask for it to be created here). The first sync stays planned until you approve it, and you supply `MONGO_URI` at approval time.

## Not implemented yet

Everything is read-only on the server. Edits made in the UI (HL7 paths, default values, adding or removing fields) live in `MappingStateService` signals and are lost on reload. These features are marked with `TODO`s in the code:

- Persisting mapping edits needs `PUT /api/hl7-mapping/:id`.
- Deleting a sample message needs `DELETE /api/hl7-message/:id`. The trash button is disabled.
- Uploading a sample message is UI only and shows an info toast.
