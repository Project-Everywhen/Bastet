# Project Everywhen

> **Working name is a placeholder.** The requirements brief names the product *CineMatch*
> (Movie Discovery & Recommendation, IMDb/Netflix-style). This repository uses the
> temporary folder name `Project Everywhen` — rename it (and every internal reference)
> once a final name is confirmed.

A full-stack OTT **movie discovery & recommendation platform**: browse and search a
movie catalogue, read detail pages with cast/crew, keep ratings and reviews, manage a
watchlist with watched-action tracking, and surface personalized rows backed by a
content-based recommendation engine. Ships with two roles — **Viewer** and
**Content Admin**.

- **Domain:** Movie Discovery & Recommendation
- **Inspired by:** Netflix / IMDb-style movie discovery
- **Roles:** Viewer, Content Admin
- **Project-level standout:** Personalized movie recommendation engine
- **Scale:** 130-hour professional full-stack project, syllabus-aligned

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Core Features](#core-features)
- [Pages & Routes](#pages--routes)
- [Important Business Rules](#important-business-rules)
- [Recommendation Engine (Extension Module)](#recommendation-engine-extension-module)
- [Optional Add-ons](#optional-add-ons)
- [Suggested Repo Structure](#suggested-repo-structure)
- [Data Model](#data-model)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [API Surface](#api-surface)
- [Roadmap](#roadmap)
- [Project Status](#project-status)

---

## Tech Stack

| Module | Requirement |
| --- | --- |
| **M1** | Project organization, Git/GitHub, client–server architecture |
| **M2** | Responsive content cards, navigation, forms, tables |
| **M3** | Arrays/objects, DOM, event handling, JSON, async/await, Fetch |
| **M4** | Catalogue review, watchlist APIs, query parameters, Pydantic, Swagger, Postman |
| **M5** | `movie` / `user` / `review` / `history` tables, parameterized SQL, JOIN, `.env` |

Recommended stack (any M1–M5 compliant equivalent is acceptable):

- **Backend:** Python 3.11+ · FastAPI · Pydantic v2 · SQLAlchemy 2.x · Alembic
- **Database:** PostgreSQL (SQLite acceptable for local dev)
- **Frontend:** React + Vite (or vanilla ES modules), Fetch API, CSS Grid/Flexbox
- **Auth:** JWT bearer tokens, password hashing (bcrypt/argon2)
- **Tooling:** Git/GitHub Actions · Swagger/OpenAPI · Postman collection

> All API routes are versioned under `/api/v1` and documented by Swagger at
> `/docs`. A Postman collection ships in `docs/postman/`.

---

## Core Features

- **Movie catalogue** — paginated listing of content cards with poster, title, year,
  rating, genres.
- **Search / filter / sort** — keyword search plus genre, language, year and rating
  filters; sorting by relevance/rating/year; server-driven pagination.
- **Movie detail pages** — poster, trailer/link, synopsis, cast, director, genres,
  rating, reviews, watchlist state and watched action.
- **Reviews / ratings** — authenticated users rate and review; ratings bounded 1–10.
- **Watchlist / history** — add/remove saved movies, mark watched, view viewing history.
- **Profile** — favorite genres/languages, ratings and activity summary.
- **Auth** — register, log in, profile creation.
- **Admin content management** — manage movies, genres, metadata, featured titles and
  moderation; add/edit/delete movies, posters/URLs, cast, director and metadata.
- **Admin dashboard** — featured titles, moderation queue, engagement totals.
- **Analytics** — most viewed, highest rated, popular genres, engagement metrics.
- **Personalized rows** — featured, trending and "because you watched X" shelves rendered
  after login.

---

## Pages & Routes

| Page | Route | What the page should contain |
| --- | --- | --- |
| **Home** | `/` | Featured movies, trending, genres, personalized rows after login |
| **Browse Movies** | `/browse` | Genre / language / year / rating filters, sorting, pagination |
| **Movie Details** | `/movies/:id` | Poster, trailer/link, synopsis, cast, director, genres, rating, reviews, watchlist and watched action |
| **Search Results** | `/search?q=` | Keyword search plus filters and sorting |
| **Watchlist** | `/watchlist` | Saved movies with view/remove actions |
| **History** | `/history` | Recently viewed / watched / rated titles |
| **Profile** | `/profile` | Favorite genres/languages, ratings and activity summary |
| **Login / Register** | `/login`, `/register` | Viewer authentication and profile creation |
| **Admin Login / Dashboard** | `/admin/login`, `/admin` | Manage movies, genres, metadata, featured titles, moderation |
| **Admin Movie Form** | `/admin/movies/new`, `/admin/movies/:id/edit` | Add/edit/delete movies, posters/URLs, cast, director, metadata |
| **Analytics** | `/admin/analytics` | Most viewed, highest rated, popular genres, engagement |

---

## Important Business Rules

- **Do not recommend already-watched items** when a suitable alternative exists.
- **Trending/popular shelves work for users with little or no history** (cold start
  falls back to global popularity, not an empty shelf).
- **Ratings are bounded** and **review inputs are validated** server-side before
  persistence.
- **View/rating history is stored** because the recommendation feature depends on it —
  it is not optional logging.

Enforcement notes:

- Ratings: integer `1..10`; reviews: trimmed, max length enforced; rejected with `422`.
- Recommendation queries filter out titles present in the user's watched history.
- Cold-start users receive popularity/featured shelves so the home page is never empty.
- Every watch, rating, and view event writes a history row used as recommendation input.

---

## Recommendation Engine (Extension Module)

**Beyond the core syllabus, worth ~10 of the 130 hours.**

- **Technique:** content-based recommendation using similarity scoring.
- **Inputs:** genres, language, actors/director, ratings, plus the user's watch/rating
  history.
- **Constraint:** the algorithm must stay **explainable** — no heavy ML stack.
- **Completion rule:** the extension must run on the project's real data and be wired
  into the main workflow. A visual mock-up with no working logic does **not** count.

Planned scoring model (`backend/app/services/recommender.py`):

1. Build a user profile vector from the genres/languages/people of positively rated
   and watched titles, weighted by rating.
2. Build the same feature vector for every candidate movie.
3. Score = weighted cosine/Jaccard similarity over genres + language + cast/director
   overlap, plus a small popularity prior for cold users.
4. Filter out watched titles and already-rated-with-low-score titles; return top-N with
   human-readable reason strings ("Because you watched *X*") for the UI.
5. Cache per-user results and invalidate on new rating/watch event.

Every recommendation carries its reason so the UI can explain the suggestion.

---

## Optional Add-ons

Everything above is the baseline, not a maximum. Optional extras:

- Notifications, exports, charts, richer search/filtering, additional reports, maps,
  file handling, audit logs, WebSockets, or any tech relevant to the product.

Extra work should improve the product rather than simply increase the number of screens.

---

## Suggested Repo Structure

```
Project Everywhen/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, router mounting
│   │   ├── config.py            # Settings loaded from .env
│   │   ├── database.py          # Engine/session (M5)
│   │   ├── models/              # movie, user, review, history, genre
│   │   ├── schemas/             # Pydantic request/response models
│   │   ├── api/v1/              # routers: auth, movies, reviews, watchlist, admin
│   │   └── services/            # recommender, analytics, trending
│   ├── migrations/              # Alembic
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/                 # fetch client + endpoints
│   │   ├── components/          # MovieCard, FilterBar, RatingWidget, ShelfRow
│   │   ├── pages/               # Home, Browse, MovieDetails, Watchlist, ...
│   │   ├── context/             # auth/session context
│   │   └── styles/
│   └── package.json
├── docs/
│   ├── api/                     # exported OpenAPI
│   └── postman/                 # CineMatch.postman_collection.json
├── .env.example
└── README.md
```

---

## Data Model

| Table | Key columns | Notes |
| --- | --- | --- |
| `movies` | `id`, `title`, `slug`, `synopsis`, `release_year`, `language`, `runtime`, `poster_url`, `trailer_url`, `director_id`, `featured`, `view_count` | Indexed on `title`, `release_year` |
| `genres` | `id`, `name` | Many-to-many via `movie_genres` |
| `people` | `id`, `name`, `role` (`actor`/`director`) | Cast + director rows |
| `users` | `id`, `email`, `password_hash`, `role` (`viewer`/`admin`), `favorite_genres`, `favorite_languages` | Profile preferences |
| `reviews` | `id`, `user_id`, `movie_id`, `rating` (1–10), `body`, `created_at` | Unique per `(user_id, movie_id)` |
| `watchlist` | `id`, `user_id`, `movie_id`, `added_at` | Unique per `(user_id, movie_id)` |
| `history` | `id`, `user_id`, `movie_id`, `event` (`view`/`watch`/`rating`), `rating`, `created_at` | Recommendation input |

All queries use **parameterized SQL**; multi-table reads use **JOINs**; connection
strings and secrets live in **`.env`** (never committed).

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+ (optional: SQLite for a zero-setup first run)

### 1. Clone

```bash
git clone <repo-url>
cd "Project Everywhen"
```

### 2. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate     macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # Windows: copy .env.example .env
alembic upgrade head         # create tables
uvicorn app.main:app --reload
```

API docs: <http://localhost:8000/docs>

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App: <http://localhost:5173>

### 4. Seed data

```bash
python -m app.seed        # genres, demo movies, admin + viewer accounts
```

---

## Environment Variables

| Variable | Purpose | Example |
| --- | --- | --- |
| `DATABASE_URL` | SQLAlchemy connection string | `postgresql+psycopg://user:pass@localhost:5432/cinematch` |
| `SECRET_KEY` | JWT signing key | `change-me-in-production` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token lifetime | `60` |
| `FRONTEND_ORIGIN` | CORS allow-list | `http://localhost:5173` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seeded admin login | `admin@example.com` |

---

## Scripts

| Command | Description |
| --- | --- |
| `uvicorn app.main:app --reload` | Run the API with hot reload |
| `alembic revision --autogenerate -m "..."` | Generate a migration |
| `pytest` | Backend test suite |
| `npm run dev` / `npm run build` | Frontend dev server / production build |
| `npm run lint` / `npm run typecheck` | Frontend lint and type checks |

---

## API Surface

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
GET    /api/v1/auth/me

GET    /api/v1/movies                 ?q, genre, language, year, min_rating, sort, page, page_size
GET    /api/v1/movies/{id}
GET    /api/v1/movies/trending
GET    /api/v1/movies/featured

POST   /api/v1/movies/{id}/reviews
GET    /api/v1/movies/{id}/reviews
PUT    /api/v1/reviews/{id}
DELETE /api/v1/reviews/{id}

GET    /api/v1/me/watchlist
POST   /api/v1/me/watchlist           { movie_id }
DELETE /api/v1/me/watchlist/{movie_id}
PATCH  /api/v1/me/watchlist/{movie_id} { watched }

GET    /api/v1/me/history
POST   /api/v1/me/history             { movie_id, event }

GET    /api/v1/me/recommendations     ?limit

POST   /api/v1/admin/movies
PUT    /api/v1/admin/movies/{id}
DELETE /api/v1/admin/movies/{id}
PATCH  /api/v1/admin/movies/{id}/featured
GET    /api/v1/admin/analytics
```

All viewer/admin routes except auth require `Authorization: Bearer <token>`.

---

## Roadmap

- [ ] M1 — repo, Git/GitHub, client–server skeleton, health endpoint
- [ ] M2 — layout shell, content cards, nav, forms, tables
- [ ] M3 — async/await + Fetch data layer, JSON contracts, DOM events
- [ ] M4 — catalogue, search, watchlist APIs, Pydantic schemas, Swagger, Postman
- [ ] M5 — schema + migrations, parameterized SQL, JOINs, `.env` config
- [ ] Reviews/ratings, watchlist & history tracking
- [ ] Profile page and preference capture
- [ ] Admin content management + moderation dashboard
- [ ] Analytics endpoints and charts
- [ ] **Recommendation engine** on real data, explainable, wired into Home

---

## Project Status

Under active development. This README is the source of truth for scope; update it as
pages land. The product name is **not finalized** — everything branded *CineMatch* here
is a placeholder pending confirmation.
