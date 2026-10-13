# Bastet — Phase 1.5: TMDB artwork

This version keeps the project in plain HTML, CSS and JavaScript modules. It loads featured movie details, transparent title logos, backdrops, a sample Continue Watching card, and trending posters from TMDB.

## Run it

1. Open this folder in VS Code.
2. Copy `config.example.js` to `config.js` if `config.js` does not already exist.
3. Open `config.js` and enter a TMDB API Read Access Token in `TMDB_ACCESS_TOKEN`. Alternatively, enter a TMDB v3 API key in `TMDB_API_KEY`.
4. Start VS Code Live Server and open the served `index.html`. Don't open the HTML using a `file://` URL because JavaScript modules need to be served over HTTP.
5. Refresh the page. The featured carousel should load the first movie's backdrop and use a transparent logo when TMDB has one. If there is no logo, the title is shown as styled text.

## Choosing the featured movies

Edit `FEATURED_MOVIES` in `config.js`. Each entry has a title search and an optional year to help choose the right movie:

```js
export const FEATURED_MOVIES = [
  { query: "Obsession", year: 2025 },
  { query: "The Substance", year: 2024 },
  { query: "Carrie", year: 1976 },
  { query: "X2", year: 2003 }
];
```

The `CONTINUE_WATCHING` object is demo data. Its progress is not real playback progress yet; it will later come from Bastet's API/database.

## How the image loading works

- `/search/movie` finds a TMDB movie ID for each configured title.
- `/movie/{id}?append_to_response=images&include_image_language=en,null` returns title metadata together with its image arrays.
- The hero uses `backdrop_path` for the background and the best English/neutral `images.logos` result for the transparent title art. If a logo is absent or fails to load, it falls back to the movie's title text.
- `https://image.tmdb.org/t/p/w1280{backdrop_path}` and `.../w500{logo_path}` turn TMDB image paths into usable URLs.
- `/trending/movie/week` provides the posters in the Trending Now shelf.

## Important credential note

A token used by browser JavaScript is visible to anyone who can inspect the page or its network requests. This is acceptable for a local learning prototype, but **do not deploy this version publicly with the token in the browser**. In the Rust phase, move TMDB requests to the backend and keep the credential in a server-side environment variable; have the browser call your own `/api/...` endpoints instead.

`config.js` is listed in `.gitignore`; `config.example.js` contains only blank placeholders and can be committed. If your existing project uses Git, make sure the real token is never committed.

## TMDB attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. See TMDB's [API FAQ](https://developer.themoviedb.org/docs/faq) and [image basics](https://developer.themoviedb.org/docs/image-basics).
