# Topical

**All you need is a topic.**

Topical is a web application for writing long, structured documents: course
notes, lesson plans, research summaries and technical documentation, with
numbered sections, equations, tables and references. You name a subject.
Topical proposes an outline, then writes it section by section, each under its
own heading and grounded in sources you choose. Everything happens in an
editor you control.

The AI drafts; you decide what stays. Every job is visible in a queue, every
rewrite is shown as a diff before it is applied, and every large change is
kept in a version history that you can restore, branch and merge.

Documents are written in **MDX** (Markdown with KaTeX maths) or **LaTeX**, and
render as you type.

---

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Getting started](#getting-started)
- [Development](#development)
- [API reference](#api-reference)
- [Deployment](#deployment)
- [License](#license)

---

## Features

### Outline first

A document starts as a tree of sections, not a blank page. The **outline rail**
on the left of the editor shows that tree, with each section's word count.
Rows can be dragged, nested, renamed, added and deleted with the mouse or the
keyboard.

The **AI panel** on the right (`⌘J`, or the toolbar's AI button) has five tabs:

| Tab | Purpose |
|---|---|
| **Outline** | Propose an outline for a subject, recover the one an existing draft is reaching for, or restructure the current outline. Each change comes with a reason, and a proposal lists what it keeps, adds and removes before you apply it. |
| **Write** | Write every empty section in document order, rewrite all of them, or write a single one. An optional instruction ("lead with a worked example", "for experts") applies to the whole run. |
| **Refine** | Improve, expand, shorten, simplify, fix grammar, make academic, turn into bullets or a table, set the maths, continue, or explain the selected passage. The result is shown as a word-level diff, and nothing changes until you apply it. |
| **Review** | Suggestions from AI collaborators on the document (see [Collaboration](#collaboration)). |
| **Context** | The web pages the model reads while writing. Paste links, or search for the top pages on the subject. |

### Section writing

Each section is written in its own request. That request carries the context
needed to fit into the rest of the document, without sending the whole
document:

- the outline, numbered, with each row marked written or not written yet;
- the headings the section sits under, and the sub-sections a parent must leave
  to its children;
- a few words of what neighbouring sections already say, and the terms the
  written sections already define, so that two sections do not open with the
  same table;
- the end of the text before the section, and a sample of the document's voice;
- the most relevant passages from the context pages.

Sections are written through the **AI queue**, one at a time. A rate limit or a
dropped connection pauses the queue and retries using the provider's own
`Retry-After`; an invalid key stops it. The queue dock at the bottom of the AI
panel shows every waiting job and lets you cancel, retry or remove any of them.

A job finds its section by its place in the outline, not by its position in the
text. A run of forty sections lands each one under the right heading however
much the text above it grows.

### Writing quality

Generated text goes through two layers before it reaches the page.

**A house style**, sent as the system message. It is written for a motivated
newcomer by default; any instruction asking for a different audience
overrides it. It asks for:

- the intuition and a concrete example before formal definitions;
- every symbol defined, in the document's existing notation;
- short paragraphs, lists and tables only where the content calls for them;
- no closing summaries, no "in this section we will", and no stock phrasing;
- every sentence finished.

**A check on every answer** (`backend/services/ai/shape.py` and `quality.py`).
Problems that can be repaired are repaired:

- a heading at or above the section's level is demoted;
- headings the model numbered itself are stripped of their numbers;
- a closing "Summary" or "Key takeaways" block is removed;
- non-breaking hyphens and invisible characters are normalised;
- unbalanced maths and environments are closed;
- a `|` inside maths in a table row is rewritten so the table keeps its columns.

Problems that cannot be repaired send the request back to the model once, with
the problems named:

- an answer cut off at the token limit;
- an answer that stops mid-sentence;
- a refusal;
- a section far shorter than asked;
- a sub-section that opens with a heading instead of prose;
- an introduction that covers its children's material.

Sections may add their own sub-headings, but only below their own level and
only after an opening paragraph. The outline you planned stays the outline.

### The editor

The editor is CodeMirror 6 in a live mode. Headings, emphasis, lists, tables,
KaTeX maths, and `\cite` / `\ref` pills render in place. A construct's markup
appears, greyed, only while the caret is inside it. The header switches
between **Read**, **Live** and **Source**.

| Shortcut | Action |
|---|---|
| `/` | Insert any construct (headings, lists, tables, code, callouts, figures, theorems, equations) or run an AI command |
| `⌘J` | Open the AI panel on the selection |
| `⌘B` `⌘I` `⌘E` `⌘K` | Bold, italic, inline code, link |
| `⌘1`–`⌘3` | Heading level |
| `⌘F`, `⌘G` | Find and replace; next match |
| `⌘\` | Show or hide the outline rail |
| `⌘/` | Every shortcut |
| `Tab` / `⇧Tab` | Indent and outdent; move between table cells |

Pasting or dropping an image uploads it. Each document has its own page style:
paper, sepia, slate or night, with a choice of accent colour and typeface.

The LaTeX renderer is a parser, preamble and renderer pipeline for the
article-shaped subset people actually write: numbered sections, `\ref` and
`\cite`, `\newcommand` macros, theorem environments, floats, tables, footnotes
and bibliographies. An unknown command still renders its argument, so text is
never silently dropped.

### Version history

Versions are stored in the database. Anyone who can write the document sees
the same history from any account or browser; readers of a published document
do not, because history keeps text that was deleted on purpose.

A version is kept:

- on the first edit of each visit;
- every ten minutes while you write;
- before and after every batch of AI sections;
- before an outline is applied, a version is restored, or branches are switched or merged;
- whenever you save one by name.

The history opens from the save state in the status bar. It is drawn as a
graph, with one lane per branch and the newest versions at the top.

- **Restore** brings any version back as a new step on the current branch, so
  nothing is overwritten and the restore can itself be undone.
- **Branch from here** starts a separate line of the document from any version,
  for trying an alternative. The page you leave is kept on its own branch.
- **Switch** moves the document between branches. Switching is document-wide:
  there is one live page, so collaborators see the switch.
- **Merge** brings another branch in one section at a time. For each section
  that differs, you choose which version to keep.

Each version shows what it changed, against the version before it or against
the page now: first the sections touched, then the lines, with changed words
marked inside edited lines. It can also be read rendered, or as source.

### Collaboration

- **Real-time editing** over the Yjs CRDT, with live cursors. The server is a
  full participant and holds the merged document, so anyone joining a
  document mid-edit sees its current state.
- **Co-authors.** Invite other accounts to write with you.
- **AI collaborators.** Add your saved models to a document as reviewers. Each
  one reads only the section someone last edited, at an interval you set. It
  suggests a change only where something is wrong: a factual error, a broken
  sentence, broken markup. Suggestions appear in the Review tab to accept or
  dismiss.
- **One address per document.** `/projects/mdx/12201` names the document; the
  server decides whether the visitor gets the editor, the reader or a locked
  notice, so a link is safe to share.

### Publishing and export

- Download the source (`.mdx` or `.tex`) or a PDF.
- Publish to the community library, with a forum for posts, comments and votes,
  and public author profiles.
- The **Sources** panel lists every link, citation and footnote in the document.

### Models and keys

Topical works with Gemini, Groq, OpenRouter, Cerebras, Mistral, DeepSeek,
Together AI, OpenAI, Anthropic, xAI, or a local Ollama, routed through
LiteLLM. The model picker reads each provider's live model list.

Keys belong to each user. They are kept in the browser and sent as a header
only on the request that needs them, never stored on the server or written to
logs. Starting an AI action without a key opens a prompt for one, and the
action carries on once it is added.

---

## How it works

One backend process serves the REST API under `/api`, the collaboration
socket at `/ws/doc/{id}`, all AI requests and, in production, the built
frontend. In development, Vite serves the frontend and proxies `/api` and
`/ws` to the backend.

```
                    ┌────────────────────────────────┐
 browser ── /api ──▶│ FastAPI (:3000)                │──▶ model providers (LiteLLM)
    │               │ routes → services → database   │──▶ web pages (Crawl4AI)
    └────── /ws ───▶│ realtime: one Yjs room per doc │
                    └───────────────┬────────────────┘
                                    ▼
                               PostgreSQL
```

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite 5, TanStack Router and Query, CodeMirror 6, KaTeX, Yjs, Tailwind CSS |
| Backend | Python 3.10+, FastAPI, SQLAlchemy 2 (async, asyncpg), Alembic, pycrdt |
| AI | LiteLLM for provider routing; Crawl4AI for reading web pages, with a plain HTTP fallback |
| Data | PostgreSQL |

### Data model

| Table | Holds |
|---|---|
| `users`, `auth_sessions` | Accounts (Argon2id password hashes) and server-side sessions |
| `lesson_plans` | Documents: the text, co-authors, AI collaborators, the public flag, and the history branch the document is on |
| `document_versions` | Whole-text snapshots, each with its parent, branch, and any merge or restore link |
| `document_branches` | Branches of a document's history and their newest versions |
| `community_posts`, `community_post_comments`, `community_post_votes` | The community forum |

> The storage layer calls a document a **lesson plan**. That is the table name,
> the model name and the API prefix (`/api/lessonPlans`); the table predates the
> editor. Everywhere a user can see, it is a document.

### Writing a section, end to end

1. The editor builds the request when the job starts, from the document as it
   is at that moment: outline digest, placement, defined terms, lead-in, voice
   sample, and context pages.
2. `services/ai/generation.py` reads the context pages
   (`crawl.py`, cached and cut down to the relevant passages), builds the
   prompt (`prompts.py`) and calls the provider (`providers.py`).
3. `shape.py` repairs the answer and `quality.py` checks it. If the answer is
   unusable, the model is asked again once with the problems listed, and the
   better of the two answers is kept.
4. The editor finds the section again by its place in the outline, fits the
   text under its heading (`lib/sections.ts`), and applies it as one undoable
   change that collaborators receive like any other edit.

### Live collaboration

Rooms live in the backend's memory, and the durable copy is saved through the
REST API. Each room has an epoch, and the room itself decides who supplies its
initial text, exactly once. A client reconnecting to a recreated room (after
a server restart) starts a fresh copy instead of merging in its old history,
because merging two independently started texts puts the document in twice.
A room is discarded 30 seconds after its last connection leaves.

---

## Getting started

### Prerequisites

- Python 3.10 or newer (Crawl4AI does not import on 3.9)
- Node.js and npm
- A PostgreSQL database, local or hosted

### Install and run

```bash
git clone https://github.com/aryankad1an/topical.git
```

```bash
cd topical/frontend && npm install && cd ..
```

```bash
cp .env.example .env
```

Set `DATABASE_URL` in `.env`, then start everything:

```bash
./run.sh
```

`run.sh` frees ports 3000 and 5173, creates `.venv` and installs the Python
dependencies on first run (including Crawl4AI's headless browser), applies
the database migrations, and starts the backend and the frontend. Open
**http://localhost:5173** and create an account.

To use a specific Python, create `.venv` yourself before the first run.
Otherwise `run.sh` uses the first Python 3.10+ it finds.

### Configuration

Only `DATABASE_URL` is required. Authentication is built in, so there is no
identity provider to configure.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string, in ordinary `postgresql://` form |
| `HOST`, `PORT` | `0.0.0.0`, `3000` | Where the backend listens; Vite's dev proxy expects 3000 |
| `ENVIRONMENT` | `development` | `production` marks session cookies Secure, which requires HTTPS |
| `SESSION_TTL_DAYS` | `14` | How long an unused session stays valid |
| `UPLOADS_DIR` | `./uploads` | Where uploaded images are written |
| `STATIC_DIR` | `./frontend/dist` | The built frontend the backend serves |
| `OLLAMA_API_BASE` | `http://localhost:11434` | Where a local Ollama is reached |
| `LOG_LEVEL` | `INFO` | Log verbosity |

Provider keys are deliberately not environment variables: each user adds their
own in the app.

### Add a model

Open **Settings → AI models**, choose a provider and a model, and paste a key.
The key is verified with the provider before it is saved, so a bad key fails
immediately rather than halfway through a run.

### Write your first document

1. **Start a document** from Projects with a topic. In the empty document,
   **Build with AI** (or the Outline tab) proposes an outline.
2. **Shape the outline** in the rail, or ask the Outline tab to restructure it.
3. **Add context** (optional): pages for the model to read, in the Context tab.
4. **Write.** The Write tab writes every empty section; the ✦ on a rail row
   opens it for just that section.
5. **Edit.** Type `/` for constructs, select text and press `⌘J` to refine it.
6. **Keep versions.** The page is kept before and after every AI run. Branch to
   try an alternative, and merge back what works.
7. **Share.** Invite a co-author, add an AI collaborator, export, or publish.

---

## Development

```bash
source .venv/bin/activate
```

| Command | What it does |
|---|---|
| `python -m backend` | Run the backend alone, with reload |
| `cd frontend && npm run dev` | Run the frontend alone |
| `cd frontend && npx tsc --noEmit` | Typecheck |
| `cd frontend && npm run lint` | Lint (no warnings allowed) |
| `cd frontend && npm run build` | Production bundle into `frontend/dist` |
| `alembic revision --autogenerate -m "…"` | Create a migration from model changes |
| `alembic upgrade head` / `alembic downgrade -1` | Apply or undo migrations |
| `python -m backend.cli writing-check FILE.md` | Score a document's prose: sentence length, reading ease, maths density, stock phrases, wording repeated between sections |
| `TOPICAL_AI_KEY=… python -m backend.cli writing-check --topic "…" --sections "A,B,C" --provider groq --model …` | Write those sections with a real model through the full pipeline, print them, and score them |

With the backend running, **http://localhost:3000/docs** lists every route with
its request and response schemas, and `/health` reports whether the database is
configured.

There is no automated test suite yet. Changes to authentication, the
collaboration rooms, the LaTeX renderer, or the history graph should be
verified by hand, and tests added alongside them are welcome. Use
`writing-check` to measure a prompt change on real output.

### Project layout

```
backend/
  main.py               app factory: middleware, routers, static files
  api/routes/           HTTP only, one module per resource, mounted under /api
  services/             application logic, independent of the web framework
    ai/                 prompts, providers, web reading, generation;
                        shape.py repairs answers, quality.py checks them
    versions.py         the history graph: snapshots, restore, fork, switch
  db/models/            SQLAlchemy models
  auth/                 passwords, sessions, the current-user dependency
  realtime/             collaboration rooms and the y-protocols wire format
  core/                 settings, errors, rate limits, logging
  cli.py                administrative and diagnostic commands
alembic/versions/       migrations

frontend/src/
  features/editor/      the document screen
    ai/                 the AI panel's tabs, the job queue, AI collaborators
    live/               the CodeMirror live surface and its widgets
    components/history/ the version graph, changes view and merge pane
    hooks/, lib/        state and pure document operations
  features/preview/     rendering for readers, print and PDF (latex/ is the LaTeX pipeline)
  features/settings/    profile, AI models, writing, appearance, account
  features/home/        the landing page
  components/ui/        shared interface primitives
  routes/               TanStack Router file routes
  lib/                  API client, auth, document URLs, table parsing
  styles/               stylesheets; index.css sets the cascade order
```

### Conventions

- **Layers depend downward only.** A service never imports FastAPI, and a route
  never writes SQL. Services can be called from a script, a worker or a test.
- **Document operations are pure functions** over text and selection
  (`features/editor/lib/`). The toolbar, shortcuts, `/` menu and AI panels all
  call the same functions.
- **The outline is read from the document's headings.** A proposed outline is a
  flat list with explicit levels until it is applied.
- **One address per document.** `lib/documentUrl.ts` is the only place a
  document URL is built; the server's access verdict (`owner`, `co-author` or
  `reader`) decides what the visitor can do.
- **Interfaces are built from the shared primitives** in `components/ui` and the
  design tokens in `styles/tokens.css`, and must work in both light and dark
  themes. `.claude/skills/uiux/` holds the catalogue and the audit rules.

### Notes before changing things

- **Authentication.** Passwords are hashed with Argon2id. Sessions are opaque
  tokens stored only as SHA-256 hashes and sent in an httpOnly, `SameSite=Lax`
  cookie, which is also the CSRF defence. Sign-in failures take the same time
  and shape whether or not the account exists. Sign-in, registration and
  password changes are rate limited.
- **Request limits.** Bodies over 8 MB are refused. Uploads must be images
  (JPEG, PNG, GIF, WebP or SVG), and their bytes must match the format they
  claim. Context-page fetches refuse private and loopback addresses.
- **Latency.** The database is often in a different region from the server.
  The connection pool is warmed at start-up, `pool_pre_ping` is off in favour
  of `pool_recycle`, and session activity is written at most hourly.
- **Rate limits are not retried on the server.** A provider's per-minute token
  limit is not lifted by retrying a second later. The backend returns `429`
  with the provider's `Retry-After`, and the editor's queue waits that long.
  Capacity errors and timeouts are retried with backoff.
- **Tables with maths.** GFM splits a table row on every `|` before it reads
  maths, so `$|V|$` in a cell used to add columns. `lib/markdownTables.ts`
  splits rows treating a `|` inside maths, code or `\|` as content. The reading
  view rewrites those bars to `\vert` before rendering, and the AI pipeline
  writes them that way to begin with.

### Administration

```bash
python -m backend.cli list-users
```

```bash
python -m backend.cli set-password <email>
```

```bash
python -m backend.cli prune-sessions
```

`set-password` takes `--create` to make the account if it does not exist.

---

## API reference

All routes are under `/api` and return JSON unless noted. The full schema is
served at `/docs`.

### Documents and history

| Route | Purpose |
|---|---|
| `GET` / `POST /lessonPlans` | Your documents; create one |
| `PUT` / `DELETE /lessonPlans/{id}` | Save; delete |
| `GET /lessonPlans/{id}/shared` | A document and the visitor's access to it |
| `GET /lessonPlans/public` | The community library |
| `GET` / `POST /lessonPlans/{id}/versions` | The history graph; take a snapshot on the current branch |
| `GET` / `PATCH` / `DELETE /lessonPlans/{id}/versions/{v}` | A version with its text; name it; delete it (neighbouring versions are re-linked; a version a branch starts from is kept) |
| `POST /lessonPlans/{id}/versions/{v}/restore` | Bring a version back as a new step |
| `POST /lessonPlans/{id}/branches` | Start a branch from a version, optionally moving the document onto it |
| `POST /lessonPlans/{id}/branches/{b}/checkout` | Move the document onto a branch |
| `PATCH` / `DELETE /lessonPlans/{id}/branches/{b}` | Rename; delete (not the current branch, nor one another branch grew from) |

History routes are available to the owner and co-authors only.

### AI

`POST` routes under `/api/ai/`, for signed-in users. Each reads the provider,
model and key from the `X-AI-Provider`, `X-AI-Model` and `X-AI-Api-Key`
headers.

| Route | Purpose |
|---|---|
| `search-topics` | An outline for a subject |
| `outline-from-document` | The outline a draft is reaching for (long drafts are sent as a digest of every heading) |
| `refine-outline` | A restructured outline, with a reason for each change |
| `generate-section` | One section, repaired and checked (plain text) |
| `transform` | A rewrite, continuation or explanation of a passage, repaired and checked (plain text) |
| `review` | An AI collaborator's suggestions for one section, each quoting the exact text it changes |
| `sources` | Pages worth adding to the context |
| `models`, `verify-key` | A key's live model list; a check before a key is saved |

Provider failures are returned with meaningful statuses (`401` rejected key,
`404` unknown model, `429` rate limit with `Retry-After`, `502` malformed
answer, `504` timeout) and messages that are safe to show to a user.

### Accounts, files and community

| Route | Purpose |
|---|---|
| `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/password` | Accounts and sessions |
| `GET /me`, `PATCH /profile` | The signed-in user |
| `POST /files/upload`, `GET /files/{name}` | Image uploads |
| `GET /people`, `GET /people/{username}`, `GET /search/username` | Public profiles and author search |
| `GET` / `POST /posts`, `GET` / `DELETE /posts/{id}` | Forum posts |
| `POST /posts/{id}/comments`, `DELETE /posts/{id}/comments/{c}`, `POST /posts/{id}/vote` | Comments and votes |

The collaboration socket is `/ws/doc/{id}`, open to the owner and co-authors.

---

## Deployment

The `Dockerfile` builds the frontend into the Python image, so one container
serves everything. Migrations run at start-up and are safe to repeat.

```bash
docker build -t topical .
```

```bash
docker run -p 3000:3000 -e DATABASE_URL=postgresql://... -v topical_uploads:/app/uploads topical
```

`fly.toml` deploys the same image to Fly.io. Set the database as a secret:

```bash
fly secrets set DATABASE_URL=postgresql://...
```

Two things to plan for:

- **Uploaded images are on disk.** Mount a volume at `/app/uploads`, or they
  are lost on the next deploy.
- **Collaboration rooms are in memory.** Each machine has its own rooms, and a
  stopped machine loses open sessions' unsaved state. `fly.toml` keeps one
  machine running for this reason.

---

## License

MIT
