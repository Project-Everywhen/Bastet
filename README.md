# Bastet — Phase 1.5: TMDB artwork

This version keeps the project in plain HTML, CSS and JavaScript modules. It loads featured movie/TV details, transparent title logos, backdrops, Continue Watching cards, and trending posters from TMDB.

## Run it

1. Open this folder in VS Code.
2. Copy `config.example.js` to `config.js` if `config.js` does not already exist.
3. Open `config.js` and enter a TMDB API Read Access Token in `TMDB_ACCESS_TOKEN`. Alternatively, enter a TMDB v3 API key in `TMDB_API_KEY`.
4. Start VS Code Live Server and open the served `index.html`. Don't open the HTML using a `file://` URL because JavaScript modules need to be served over HTTP.
5. Refresh the page. The featured carousel should load the first movie's backdrop and use a transparent logo when TMDB has one. If there is no logo, the title is shown as styled text.

## Choosing the featured movies

Edit `FEATURED_MOVIES` in `config.js`. Each entry is a direct TMDB ID plus its media type. `query`/`year` are human-readable labels/fallbacks only — no search is performed:

```js
export const FEATURED_MOVIES = [
  { id: 213375, mediaType: "tv", query: "VisionQuest", year: 2026 },
  { id: 1339713, mediaType: "movie", query: "Obsession", year: 2025 }
];
```

The `CONTINUE_WATCHING` array is demo data. Its progress is not real playback progress yet; it will later come from Bastet's API/database.

## How the image loading works

- `/{mediaType}/{id}?append_to_response=images&include_image_language=en,null` (i.e. `/movie/{id}` or `/tv/{id}`) returns title metadata together with its image arrays.
- The hero uses `backdrop_path` for the background and the best English/neutral `images.logos` result for the transparent title art. If a logo is absent or fails to load, it falls back to the movie's title text.
- `https://image.tmdb.org/t/p/w1280{backdrop_path}` and `.../w500{logo_path}` turn TMDB image paths into usable URLs.
- `/trending/all/week` provides combined movie + TV posters in the Trending Now shelf (filtered to entries with `media_type` of `movie`/`tv` and a `poster_path`).
- `/discover/movie?sort_by=primary_release_date.desc&watch_region={WATCH_REGION}&with_watch_monetization_types=flatrate` powers the New on Streaming shelf — the API behind the website's `discover_preset=new-on-streaming` view, limited to already-released titles. Change `WATCH_REGION` in `config.js` to retarget it.

## Important credential note

A token used by browser JavaScript is visible to anyone who can inspect the page or its network requests. This is acceptable for a local learning prototype, but **do not deploy this version publicly with the token in the browser**. In the Rust phase, move TMDB requests to the backend and keep the credential in a server-side environment variable; have the browser call your own `/api/...` endpoints instead.

`config.js` is listed in `.gitignore`; `config.example.js` contains only blank placeholders and can be committed. If your existing project uses Git, make sure the real token is never committed.

## How to open a pull request

1. Sync your local `main`: `git checkout main; git pull origin main`.
2. Create a feature branch: `git checkout -b feat/short-description` (this repo uses `feat/...`, `chore/...` prefixes).
3. Make your changes, keeping commits small and focused with clear messages (e.g. `Fix hero carousel dot behavior`).
4. Verify before pushing:
   - `node --check app.js` passes (and `config.js` / `config.example.js` if touched).
   - Test via Live Server over HTTP, not `file://`.
   - `git status --short` shows only intended files — never `config.js`.
5. Push and open the PR: `git push -u origin feat/short-description`, then open a PR on GitHub against `main`.
6. In the PR description, state what changed, how you tested it, and any follow-ups. Keep the PR small enough to review in one sitting.
7. After review approval, merge (or let the maintainer merge) and delete the feature branch.

## Do's and Don'ts

Do:

- Copy `config.example.js` to `config.js` for local credentials; keep real tokens only in the ignored local file.
- Run the app through Live Server (or any static HTTP server) since ES modules don't work over `file://`.
- Match the existing plain HTML/CSS/JS style — no build step, no new dependencies without discussion.
- Test the hero carousel (all dots, prev/next, autoplay), both shelves, and the `prefers-reduced-motion` path after UI changes.
- Update this README when you change endpoints, config shape, or setup steps.

Don't:

- Never commit `config.js` or any real TMDB token/key. If a secret is pushed, rotate it on TMDB immediately — removing the commit alone doesn't purge history.
- Don't add backend keys or deploy the browser-held token publicly; TMDB calls move server-side in the Rust phase.
- Don't open HTML directly via `file://` and report module/import errors — that's expected, serve over HTTP instead.
- Don't push directly to `main`; always go through a feature branch + PR.
- Don't bundle unrelated changes into one PR; split them so each can be reviewed and reverted independently.

## TMDB attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. See TMDB's [API FAQ](https://developer.themoviedb.org/docs/faq) and [image basics](https://developer.themoviedb.org/docs/image-basics).
