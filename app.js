import {
    TMDB_ACCESS_TOKEN,
    TMDB_API_KEY,
    TMDB_LANGUAGE,
    WATCH_REGION,
    FEATURED_MOVIES,
    CONTINUE_WATCHING
} from "./config.js";

const API_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/";

// TMDB artwork size presets. Backdrops render wider than TMDB's
// largest fixed size (w1280) on most screens, so desktop uses the
// stored original; phones get a ~1080p-class file instead. Logos do
// the same at a smaller scale. Smaller artwork stays near 2-3x its
// display size.
const BACKDROP_SIZE = "original";
const MOBILE_BACKDROP_SIZE = "w1280";
const LOGO_SIZE = "original";
const MOBILE_LOGO_SIZE = "w500";
const CONTINUE_BANNER_SIZE = "w780";
const CARD_POSTER_SIZE = "w342";
const DISCOVER_POSTER_SIZE = "w500";

// Mirrors the stylesheet's mobile breakpoint. Sizes are read through
// backdropSize()/logoSize() at fetch time, so crossing the breakpoint
// swaps classes without a reload; the listener at the bottom of the
// file re-renders on-screen artwork to match.
const mobileMedia = window.matchMedia("(max-width: 640px)");

function backdropSize() {
    return mobileMedia.matches ? MOBILE_BACKDROP_SIZE : BACKDROP_SIZE;
}

function logoSize() {
    return mobileMedia.matches ? MOBILE_LOGO_SIZE : LOGO_SIZE;
}

let currentFeaturedIndex = 0;
let isFeaturedLoading = false;
let currentFeaturedRef = null;

// Send an authenticated request to TMDB using either a bearer token or API key.
async function tmdb(path, params = {}) {
    const url = new URL(`${API_BASE}${path}`);

    // Add only values that TMDB can use as query parameters.
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
            url.searchParams.append(key, value);
        }
    }

    const token = (TMDB_ACCESS_TOKEN || "").trim();
    const apiKey = (TMDB_API_KEY || "").trim();

    if (!token && !apiKey) {
        throw new Error("TMDB credentials are missing.");
    }

    const headers = { accept: "application/json" };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    } else {
        url.searchParams.set("api_key", apiKey);
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
        const details = await response.json().catch(() => null);

        console.error("TMDB request failed:", {
            url: url.pathname,
            status: response.status,
            details
        });

        throw new Error(
            details?.status_message ||
            `TMDB request failed: ${response.status}`
        );
    }

    return response.json();
}

// Session caches: details JSON stays in memory, while images are warmed
// into the browser HTTP cache (TMDB's CDN already serves long-lived cache
// headers, so warmed assets are instant on revisit and across reloads).
const featuredCache = new Map();
const preloadedImages = new Set();

function preloadImage(url) {
    if (!url || preloadedImages.has(url)) {
        return;
    }

    preloadedImages.add(url);

    const image = new Image();
    image.decoding = "async";
    image.src = url;
}

function featuredImageUrls(movie) {
    const urls = [];

    if (movie.backdrop_path) {
        urls.push(imageUrl(movie.backdrop_path, backdropSize()));
    }

    const logos = movie.images?.logos || [];
    const selectedLogo =
        logos.find(item => item.iso_639_1 === "en") ||
        logos.find(item => item.iso_639_1 === null) ||
        logos[0];

    if (selectedLogo?.file_path) {
        urls.push(imageUrl(selectedLogo.file_path, logoSize()));
    }

    return urls;
}

async function getFeaturedDetails(index) {
    if (featuredCache.has(index)) {
        return featuredCache.get(index);
    }

    const featuredConfig = FEATURED_MOVIES[index];
    const mediaType = featuredConfig.mediaType || "movie";

    const movie = await tmdb(`/${mediaType}/${featuredConfig.id}`, {
        language: TMDB_LANGUAGE,
        append_to_response: "images",
        include_image_language: "en,null"
    });

    featuredCache.set(index, movie);

    return movie;
}

// Warm only the next slide's details and artwork in the background
// so forward turns never wait on the network. The previous slide is
// already in the browser cache from when it was active, and any
// never-warmed slide fetches its original at render time (on swipe).
function warmFeaturedNeighbors(activeIndex) {
    const total = FEATURED_MOVIES.length;

    [activeIndex + 1].forEach(offset => {
        const index = (offset + total) % total;

        if (featuredCache.has(index)) {
            featuredImageUrls(featuredCache.get(index)).forEach(preloadImage);
            return;
        }

        getFeaturedDetails(index)
            .then(movie => {
                featuredImageUrls(movie).forEach(preloadImage);
            })
            .catch(() => {
                // Warming is best-effort; the carousel turn itself
                // surfaces any real error.
            });
    });
}

// Find the configured featured movie, then request its full details and images.
async function loadFeaturedMovie(index) {
    const featuredConfig = FEATURED_MOVIES[index];
    const movie = await getFeaturedDetails(index);

    currentFeaturedRef = {
        id: featuredConfig.id,
        mediaType: featuredConfig.mediaType || "movie"
    };

    renderFeaturedMovie(movie, featuredConfig);
    warmFeaturedNeighbors(index);
}

// Build a TMDB image URL from a path returned by the API.
function imageUrl(path, size) {
    return path
        ? `${IMAGE_BASE}${size}${path}`
        : "";
}

// Filled rating star with standard grade, weight and optical size.
function createStarIcon(extraClass = "") {
    const icon = document.createElement("span");
    icon.className = `material-symbols-rounded rating-star${extraClass ? ` ${extraClass}` : ""}`;
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "star";
    return icon;
}

function createMediaCard(media, options = {}) {
    const { progress, bannerPath } = options;
    const isContinue = Number.isFinite(progress);

    const title = media.title || media.name || "Untitled";
    const releaseDate = media.release_date || media.first_air_date || "";

    const card = document.createElement("article");
    card.className = `media-card ${
        isContinue ? "media-card--continue" : "media-card--poster"
    }`;

    const artwork = document.createElement("div");
    artwork.className = "media-art";

    const posterPath = isContinue
        ? bannerPath || media.backdrop_path || media.poster_path
        : media.poster_path || media.backdrop_path;

    if (posterPath) {
        const image = document.createElement("img");

        image.className = "media-image";
        image.src = imageUrl(
            posterPath,
            isContinue ? CONTINUE_BANNER_SIZE : CARD_POSTER_SIZE
        );
        image.alt = `${title} ${isContinue ? "backdrop" : "poster"}`;
        image.loading = "lazy";
        image.decoding = "async";

        artwork.append(image);
    } else {
        artwork.textContent = "Artwork unavailable";
    }

    const year = releaseDate.slice(0, 4) || "—";

    if (isContinue) {
        // Text stack lives on the artwork, above the progress bar. The
        // overlay goes in first so its dark gradient never dims the
        // white progress fill painted after it.
        const overlay = document.createElement("div");
        overlay.className = "media-overlay";

        // TV shows expose the latest episode; movies show just the
        // title, so no extra lines are added for them.
        const episode = currentEpisodeOf(media);

        if (
            Number.isFinite(episode?.season_number) &&
            Number.isFinite(episode?.episode_number)
        ) {
            const episodeTag = document.createElement("p");
            episodeTag.className = "media-overlay-episode";
            episodeTag.textContent =
                `S${episode.season_number} E${episode.episode_number}`;
            overlay.append(episodeTag);
        }

        const heading = document.createElement("h3");
        heading.className = "media-overlay-title";

        const label = document.createElement("span");
        label.textContent = title;
        heading.append(label);

        overlay.append(heading);

        const subtitleText = episode?.name;

        if (subtitleText) {
            const subtitle = document.createElement("p");
            subtitle.className = "media-overlay-sub";
            subtitle.textContent = subtitleText;
            overlay.append(subtitle);
        }

        artwork.append(overlay);

        // Movies expose `runtime`; TV exposes the runtime of the
        // episode being continued, falling back to the average
        // episode length.
        const runtimeMinutes = Number.isFinite(media.runtime)
            ? media.runtime
            : episode?.runtime || media.episode_run_time?.[0];
        const timeLeft = formatTimeLeft(runtimeMinutes, progress);

        if (timeLeft) {
            const badge = document.createElement("div");
            badge.className = "media-time-left";
            badge.textContent = timeLeft;
            artwork.append(badge);
        }

        const track = document.createElement("div");
        track.className = "media-progress";

        const fill = document.createElement("div");
        fill.className = "media-progress-fill";
        fill.style.width = `${Math.min(100, Math.max(0, progress))}%`;

        track.append(fill);
        artwork.append(track);

        card.append(artwork);

        return card;
    }

    const details = document.createElement("div");
    details.className = "media-card-details";

    const heading = document.createElement("h3");
    const label = document.createElement("span");
    label.textContent = title;
    heading.append(label);

    const metadata = document.createElement("p");
    metadata.append(
        `${year} · `,
        createStarIcon(),
        ` ${Number(media.vote_average || 0).toFixed(1)}`
    );

    details.append(heading, metadata);
    card.append(artwork, details);

    return card;
}

// Condense an overflowing card title with a horizontal squeeze so it
// fits on its single line at full font size. Squeezes down to 72%;
// anything still too long falls back to ellipsis.
// Must run after the card is in the DOM so measurements are valid.
function fitCardTitle(card) {
    const heading = card.querySelector(
        ".media-card-details h3, .media-overlay-title"
    );
    const label = heading?.querySelector("span");

    if (!heading || !label) {
        return;
    }

    // Reset before measuring so a re-run (e.g. after fonts load)
    // measures the natural width, not the squeezed one.
    label.style.transform = "";

    const naturalWidth = label.offsetWidth;
    const availableWidth = heading.clientWidth;

    if (naturalWidth > availableWidth + 1) {
        const scale = Math.max(0.72, availableWidth / naturalWidth);

        if (scale < 1) {
            label.style.transform = `scaleX(${scale})`;
        }
    }
}

// Condense an overflowing pill label with the same horizontal squeeze,
// so every highlight box stays a uniform width. Skips hidden labels
// (desktop rail, compact pill) which report no width.
function fitNavLabels() {
    document.querySelectorAll(".nav-label").forEach(label => {
        label.style.transform = "";

        if (label.clientWidth === 0 || label.clientHeight === 0) {
            return;
        }

        if (label.scrollWidth > label.clientWidth + 1) {
            const scale = Math.max(
                0.8,
                label.clientWidth / label.scrollWidth
            );

            if (scale < 1) {
                label.style.transform = `scaleX(${scale})`;
            }
        }
    });
}

// Format a runtime in minutes as "2h 5m" or "45m".
function formatRuntime(minutes) {
    if (!Number.isFinite(minutes) || minutes <= 0) {
        return "";
    }

    const total = Math.round(minutes);
    const hours = Math.floor(total / 60);
    const mins = total % 60;

    if (hours <= 0) {
        return `${mins}m`;
    }

    return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

// Remaining watch time for a partially watched title (progress is a
// percentage: 0-100) as "12m left" or "1h 12m left".
function formatTimeLeft(runtimeMinutes, progressPercent) {
    if (
        !Number.isFinite(runtimeMinutes) ||
        runtimeMinutes <= 0 ||
        !Number.isFinite(progressPercent)
    ) {
        return "";
    }

    const watched = Math.min(100, Math.max(0, progressPercent));
    const remaining = Math.round(runtimeMinutes * (1 - watched / 100));
    const formatted = formatRuntime(remaining);

    return formatted ? `${formatted} left` : "";
}

// ── Episode banners ──────────────────────────────────────────────
// The episode a TV title is currently on: the latest aired episode,
// or the next one when nothing has aired yet. Shared by Continue
// Watching cards and (future) detail pages.
function currentEpisodeOf(media) {
    return media?.last_episode_to_air || media?.next_episode_to_air || null;
}

// Fetch the 16:9 banner (`still_path`) for a single episode. TV
// detail responses usually embed the still already; pass it as
// `knownStill` to skip the extra request. Returns "" when TMDB has
// no artwork for the episode.
async function fetchEpisodeBanner(
    tvId,
    seasonNumber,
    episodeNumber,
    knownStill = ""
) {
    if (knownStill) {
        return knownStill;
    }

    if (
        !Number.isFinite(tvId) ||
        !Number.isFinite(seasonNumber) ||
        !Number.isFinite(episodeNumber)
    ) {
        return "";
    }

    try {
        const episode = await tmdb(
            `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`,
            { language: TMDB_LANGUAGE }
        );

        return episode.still_path || "";
    } catch (error) {
        console.warn(
            `Could not fetch banner for TV ${tvId} ` +
                `S${seasonNumber}E${episodeNumber}:`,
            error
        );

        return "";
    }
}

// Banner path for a TV title's current episode, falling back to the
// show backdrop so a card always has artwork.
async function resolveEpisodeBanner(media) {
    const episode = currentEpisodeOf(media);

    if (!episode) {
        return "";
    }

    const still = await fetchEpisodeBanner(
        media.id,
        episode.season_number,
        episode.episode_number,
        episode.still_path
    );

    return still || media.backdrop_path || "";
}

// Populate the hero section with the movie's title, artwork, and metadata.
function renderFeaturedMovie(movie, featuredConfig) {
    const hero = document.querySelector("#featured-hero");
    const title = document.querySelector("#featured-title");
    const logo = document.querySelector("#featured-logo");

    // Show the text title first in case no usable logo is available.
    const displayTitle =
        movie.title ||
        movie.name ||
        featuredConfig?.title ||
        featuredConfig?.query ||
        "Untitled";
    title.textContent = displayTitle;
    title.hidden = false;

    // Clear any previous logo so a missing logo never shows stale artwork.
    logo.hidden = true;
    logo.removeAttribute("src");
    logo.alt = "";
    logo.onerror = null;

    const backdrop = movie.backdrop_path;

    if (backdrop) {
        hero.style.setProperty(
            "--hero-backdrop",
            `url("${imageUrl(backdrop, backdropSize())}")`
        );
    } else {
        hero.style.removeProperty("--hero-backdrop");
    }

    // Prefer an English logo, then a language-neutral logo, then any logo.
    const logos = movie.images?.logos || [];

    const selectedLogo =
        logos.find(item => item.iso_639_1 === "en") ||
        logos.find(item => item.iso_639_1 === null) ||
        logos[0];

    if (selectedLogo?.file_path) {
        logo.src = imageUrl(selectedLogo.file_path, logoSize());
        logo.alt = `${displayTitle} logo`;
        logo.hidden = false;
        title.hidden = true;

        logo.onerror = () => {
            logo.hidden = true;
            title.hidden = false;
        };
    }

    // Movies show release year; TV shows show a release period range.
    const mediaType = featuredConfig?.mediaType || "movie";
    const yearElement = document.querySelector("#featured-year");

    if (mediaType === "tv") {
        const startYear = (movie.first_air_date || "").slice(0, 4);
        const isOngoing = movie.in_production ||
            movie.status === "Returning Series";
        const endYear = (movie.last_air_date || "").slice(0, 4);

        if (startYear) {
            yearElement.textContent = isOngoing
                ? `${startYear}–Present`
                : endYear && endYear !== startYear
                    ? `${startYear}–${endYear}`
                    : startYear;
        } else {
            yearElement.textContent = "—";
        }
    } else {
        yearElement.textContent =
            (movie.release_date || "").slice(0, 4) || "—";
    }

    document.querySelector("#featured-rating").textContent =
        Number(movie.vote_average || 0).toFixed(1);

    const genresElement = document.querySelector("#featured-genres");
    const genreNames = (movie.genres || []).slice(0, 2).map(g => g.name);

    genresElement.textContent = "";

    const displayGenres = genreNames.length > 0
        ? genreNames
        : [mediaType === "tv" ? "TV Show" : "Movie"];

    displayGenres.forEach(name => {
        const tag = document.createElement("span");
        tag.className = "genre-tag";
        tag.textContent = name;
        genresElement.append(tag);
    });

    // Movies expose `runtime`; TV exposes `episode_run_time[]`.
    const runtimeMinutes = Number.isFinite(movie.runtime)
        ? movie.runtime
        : movie.episode_run_time?.[0];
    const runtimeText = formatRuntime(runtimeMinutes);
    const runtimeElement = document.querySelector("#featured-runtime");

    if (runtimeElement) {
        runtimeElement.textContent = runtimeText ? `• ${runtimeText}` : "";
        runtimeElement.hidden = !runtimeText;
    }

    document.querySelector("#featured-synopsis").textContent =
        movie.overview || "No synopsis is available.";

    const heroCopy = document.querySelector(".hero-copy");

    heroCopy.classList.remove("hero-content-enter");

    // Restart the animation for each newly rendered movie.
    void heroCopy.offsetWidth;

    heroCopy.classList.add("hero-content-enter");
}

function updateCarouselDots(activeIndex) {
    const dotsContainer = document.querySelector("#hero-dots");

    if (!dotsContainer) {
        return;
    }

    const dots = dotsContainer.querySelectorAll(".hero-dot");

    // Dots are built once so the width transition can animate.
    // Rebuild only if the dot count drifted from the config.
    if (dots.length !== FEATURED_MOVIES.length) {
        createCarouselDots(activeIndex);
        return;
    }

    dots.forEach((dot, index) => {
        if (index === activeIndex) {
            dot.setAttribute("aria-current", "true");
        } else {
            dot.removeAttribute("aria-current");
        }
    });

    scrollActiveDotIntoView(dotsContainer, activeIndex);
}

// Center the active dot within the scrollable dots strip.
// Uses manual scroll math (instead of scrollIntoView) so the page
// itself never scrolls as a side effect.
function scrollActiveDotIntoView(dotsContainer, activeIndex, behavior) {
    const dots = dotsContainer.querySelectorAll(".hero-dot");
    const dot = dots[activeIndex];

    if (!dot) {
        return;
    }

    const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;
    const scrollBehavior = behavior || (reduceMotion ? "auto" : "smooth");

    const containerRect = dotsContainer.getBoundingClientRect();
    const dotRect = dot.getBoundingClientRect();
    const targetLeft =
        dotsContainer.scrollLeft +
        (dotRect.left - containerRect.left) -
        dotsContainer.clientWidth / 2 +
        dotRect.width / 2;

    dotsContainer.scrollTo({ left: targetLeft, top: 0, behavior: scrollBehavior });
}

function createCarouselDots(activeIndex = currentFeaturedIndex) {
    const dotsContainer = document.querySelector("#hero-dots");

    if (!dotsContainer) {
        return;
    }

    dotsContainer.replaceChildren();

    if (FEATURED_MOVIES.length === 0) {
        return;
    }

    const fragment = document.createDocumentFragment();

    FEATURED_MOVIES.forEach((featuredMovie, index) => {
        const title = featuredMovie.title ||
            featuredMovie.name ||
            featuredMovie.query ||
            `featured item ${index + 1}`;

        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "hero-dot";
        dot.setAttribute("aria-label", `Show ${title}`);

        if (index === activeIndex) {
            dot.setAttribute("aria-current", "true");
        }

        dot.addEventListener("click", () => {
            showFeaturedMovie(index);
        });

        fragment.append(dot);
    });

    dotsContainer.append(fragment);

    // Snap the initial active dot into view without animating.
    scrollActiveDotIntoView(dotsContainer, activeIndex, "auto");
}

async function showFeaturedMovie(index) {
    if (isFeaturedLoading || FEATURED_MOVIES.length === 0) {
        return false;
    }

    const nextIndex =
        (index + FEATURED_MOVIES.length) % FEATURED_MOVIES.length;

    const previousButton = document.querySelector("#hero-prev");
    const nextButton = document.querySelector("#hero-next");
    const dotsContainer = document.querySelector("#hero-dots");
    const status = document.querySelector("#app-status");

    isFeaturedLoading = true;

    if (previousButton) {
        previousButton.disabled = true;
    }

    if (nextButton) {
        nextButton.disabled = true;
    }

    dotsContainer?.querySelectorAll("button").forEach(dot => {
        dot.disabled = true;
    });

    if (status) {
        status.hidden = true;
    }

    try {
        await loadFeaturedMovie(nextIndex);

        currentFeaturedIndex = nextIndex;
        updateCarouselDots(currentFeaturedIndex);

        return true;
    } catch (error) {
        console.error(error);

        if (status) {
            status.textContent = error.message;
            status.hidden = false;
        }

        return false;
    } finally {
        isFeaturedLoading = false;

        if (previousButton) {
            previousButton.disabled = false;
        }

        if (nextButton) {
            nextButton.disabled = false;
        }

        dotsContainer?.querySelectorAll("button").forEach(dot => {
            dot.disabled = false;
        });
    }
}

document.querySelector("#hero-prev").addEventListener("click", () => {
    showFeaturedMovie(currentFeaturedIndex - 1);
});

document.querySelector("#hero-next").addEventListener("click", () => {
    showFeaturedMovie(currentFeaturedIndex + 1);
});

document.querySelector("#hero-more-info").addEventListener("click", () => {
    if (!currentFeaturedRef) {
        return;
    }

    window.open(
        `https://www.themoviedb.org/${currentFeaturedRef.mediaType}/${currentFeaturedRef.id}`,
        "_blank",
        "noopener"
    );
});

const hero = document.querySelector("#featured-hero");
let heroAutoplayTimer;

function startHeroAutoplay() {
    clearInterval(heroAutoplayTimer);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
    }

    heroAutoplayTimer = setInterval(() => {
        if (
            document.hidden ||
            hero.matches(":hover") ||
            hero.contains(document.activeElement) ||
            isFeaturedLoading
        ) {
            return;
        }

        showFeaturedMovie(currentFeaturedIndex + 1);
    }, 8000);
}

function stopHeroAutoplay() {
    clearInterval(heroAutoplayTimer);
}

hero.addEventListener("mouseenter", stopHeroAutoplay);
hero.addEventListener("mouseleave", startHeroAutoplay);

hero.addEventListener("focusin", stopHeroAutoplay);

hero.addEventListener("focusout", event => {
    if (!hero.contains(event.relatedTarget)) {
        startHeroAutoplay();
    }
});

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        stopHeroAutoplay();
    } else {
        startHeroAutoplay();
    }
});

// Swipe the hero banner with touch or mouse drag, with live drag-follow
// feedback. Starts on buttons, links, inputs, and the dot controls are
// ignored so CTAs and carousel controls keep working.
const heroCopy = document.querySelector(".hero-copy");

let heroSwipeX = null;
let heroSwipeY = null;
let heroSwipeStart = 0;
let heroSwiping = false;
let heroSnapTimer = 0;

const HERO_SWIPE_COMMIT = 60;
const HERO_SWIPE_FLICK = 0.45; // px per ms
const HERO_SWIPE_RESISTANCE = 0.35;

// Hero info elements: everything in .hero-copy except the action buttons,
// so buttons stay fixed during swipe drag and fly-out animations.
function heroInfoElements() {
    if (!heroCopy) return [];
    return Array.from(heroCopy.children).filter(
        el => !el.classList.contains('hero-actions')
    );
}

function resetHeroDragVisual() {
    if (!heroCopy) {
        return;
    }

    heroInfoElements().forEach(el => {
        el.style.transition = "";
        el.style.transform = "";
        el.style.opacity = "";
        el.style.willChange = "";
    });
}

function paintHeroDrag(dx) {
    if (!heroCopy) {
        return;
    }

    // The entrance animation would override the drag transform.
    heroCopy.classList.remove("hero-content-enter");

    const translatedX = (dx * HERO_SWIPE_RESISTANCE).toFixed(1);
    const fadeOpacity = `${Math.max(0.45, 1 - Math.abs(dx) / 700)}`;

    heroInfoElements().forEach(el => {
        el.style.transition = "none";
        el.style.willChange = "transform, opacity";
        el.style.transform = `translate3d(${translatedX}px, 0, 0)`;
        el.style.opacity = fadeOpacity;
    });
}

hero.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) {
        return;
    }

    if (event.target.closest("button, a, input, .hero-carousel")) {
        return;
    }

    clearTimeout(heroSnapTimer);
    resetHeroDragVisual();

    // Capture the pointer so move/up/cancel keep reaching the hero
    // even when the cursor leaves it or the screen.
    try {
        hero.setPointerCapture(event.pointerId);
    } catch {
        // Already released; the stale-gesture guards below cover it.
    }

    heroSwipeX = event.clientX;
    heroSwipeY = event.clientY;
    heroSwipeStart = performance.now();
    heroSwiping = false;
});

hero.addEventListener("pointermove", event => {
    if (heroSwipeX === null) {
        return;
    }

    // Mouse already released outside the hero: stale gesture, drop it.
    if (event.pointerType === "mouse" && event.buttons === 0) {
        heroSwipeX = null;
        heroSwipeY = null;
        return;
    }

    const dx = event.clientX - heroSwipeX;
    const dy = event.clientY - heroSwipeY;

    if (!heroSwiping) {
        // Vertical intent: hand the gesture back to page scroll.
        if (Math.abs(dy) > 14 && Math.abs(dy) >= Math.abs(dx)) {
            heroSwipeX = null;
            heroSwipeY = null;
            return;
        }

        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
            heroSwiping = true;
        } else {
            return;
        }
    }

    paintHeroDrag(dx);
});

function endHeroSwipe(event) {
    if (heroSwipeX === null) {
        return;
    }

    const dx = event.clientX - heroSwipeX;
    const elapsed = Math.max(1, performance.now() - heroSwipeStart);
    const velocity = dx / elapsed;

    heroSwipeX = null;
    heroSwipeY = null;
    heroSwiping = false;
    clearTimeout(heroSnapTimer);

    try {
        if (hero.hasPointerCapture(event.pointerId)) {
            hero.releasePointerCapture(event.pointerId);
        }
    } catch {
        // Pointer was already released; nothing to clean up.
    }

    const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;
    const flick = Math.abs(velocity) >= HERO_SWIPE_FLICK && Math.abs(dx) >= 24;
    const commit = Math.abs(dx) >= HERO_SWIPE_COMMIT || flick;

    if (commit && !isFeaturedLoading) {
        const direction = dx < 0 ? 1 : -1;

        if (heroCopy && !reduceMotion) {
            // Fly the old info out; the action buttons stay in place.
            heroInfoElements().forEach(el => {
                el.style.transition =
                    "transform 200ms ease-out, opacity 200ms ease-out";
                el.style.transform =
                    `translate3d(${direction * 110}px, 0, 0)`;
                el.style.opacity = "0";
            });
        } else {
            resetHeroDragVisual();
        }

        showFeaturedMovie(currentFeaturedIndex + direction)
            .finally(resetHeroDragVisual);
    } else if (heroCopy && !reduceMotion) {
        // Spring back to rest.
        heroInfoElements().forEach(el => {
            el.style.transition =
                "transform 240ms ease-out, opacity 240ms ease-out";
            el.style.transform = "";
            el.style.opacity = "";
        });

        heroSnapTimer = setTimeout(() => {
            if (heroCopy && !heroSwiping) {
                heroInfoElements().forEach(el => {
                    el.style.transition = "";
                    el.style.willChange = "";
                });
            }
        }, 260);
    } else {
        resetHeroDragVisual();
    }
}

hero.addEventListener("pointerup", endHeroSwipe);
hero.addEventListener("pointercancel", endHeroSwipe);

document.querySelectorAll(".shelf-arrow").forEach(button => {
    button.addEventListener("click", () => {
        const row = document.getElementById(button.dataset.target);
        const direction = Number(button.dataset.direction);

        if (!row || !Number.isFinite(direction) || direction === 0) {
            return;
        }

        row.scrollBy({
            left: direction * row.clientWidth * 0.8,
            behavior: "smooth"
        });
    });
});

async function loadContinueWatching() {
    const container = document.querySelector("#continue-track");

    if (!container) {
        return;
    }

    container.replaceChildren();

    try {
        const results = await Promise.all(
            CONTINUE_WATCHING.map(async entry => {
                try {
                    const type = entry.mediaType === "tv" ? "tv" : "movie";

                    const media = await tmdb(`/${type}/${entry.id}`, {
                        language: TMDB_LANGUAGE
                    });

                    const withType = { ...media, media_type: type };

                    // TV cards prefer the current episode's own banner.
                    const bannerPath = type === "tv"
                        ? await resolveEpisodeBanner(withType)
                        : "";

                    return {
                        media: withType,
                        progress: entry.progress,
                        bannerPath
                    };
                } catch (error) {
                    console.warn(
                        `Could not load Continue Watching item ${entry.id}:`,
                        error
                    );

                    return null;
                }
            })
        );

        const validItems = results.filter(Boolean);

        if (validItems.length === 0) {
            container.textContent = "No Continue Watching titles available.";
            return;
        }

        validItems.forEach(({ media, progress, bannerPath }, index) => {
            const card = createMediaCard(media, { progress, bannerPath });

            card.style.animationDelay = `${index * 35}ms`;
            container.append(card);
            fitCardTitle(card);
        });
    } catch (error) {
        console.error("Could not load Continue Watching titles:", error);
        container.textContent = "Unable to load Continue Watching titles.";
    }
}

async function loadTrending() {
    const container = document.querySelector("#trending-track");

    if (!container) {
        return;
    }

    container.replaceChildren();

    try {
        const data = await tmdb("/trending/all/week", {
            language: TMDB_LANGUAGE
        });

        const trendingItems = (data.results || [])
            .filter(media =>
                ["movie", "tv"].includes(media.media_type) &&
                media.poster_path
            )
            .slice(0, 14);

        if (trendingItems.length === 0) {
            container.textContent = "No trending titles available.";
            return;
        }

        trendingItems.forEach((media, index) => {
            const card = createMediaCard(media);

            card.style.animationDelay = `${index * 35}ms`;
            container.append(card);
            fitCardTitle(card);
        });
    } catch (error) {
        console.error("Could not load trending titles:", error);
        container.textContent = "Unable to load trending titles.";
    }
}

// Mirrors the TMDB website's "new on streaming" discover preset:
// latest releases available on streaming in the configured region.
async function loadNewOnStreaming() {
    const container = document.querySelector("#new-track");

    if (!container) {
        return;
    }

    container.replaceChildren();

    try {
        const today = new Date().toISOString().slice(0, 10);

        const data = await tmdb("/discover/movie", {
            language: TMDB_LANGUAGE,
            sort_by: "primary_release_date.desc",
            include_adult: "false",
            include_video: "false",
            page: 1,
            "primary_release_date.lte": today,
            watch_region: WATCH_REGION,
            with_watch_monetization_types: "flatrate"
        });

        const newItems = (data.results || [])
            .filter(media => media.poster_path)
            .map(media => ({ ...media, media_type: "movie" }))
            .slice(0, 14);

        if (newItems.length === 0) {
            container.textContent = "No new streaming titles available.";
            return;
        }

        newItems.forEach((media, index) => {
            const card = createMediaCard(media);

            card.style.animationDelay = `${index * 35}ms`;
            container.append(card);
            fitCardTitle(card);
        });
    } catch (error) {
        console.error("Could not load new streaming titles:", error);
        container.textContent = "Unable to load new streaming titles.";
    }
}

function enableMouseDragScroll(row) {
    const track = row.querySelector(".media-track");

    if (!track) {
        console.warn("Missing .media-track inside", row);
        return;
    }

    let pointerId = null;
    let startX = 0;
    let latestX = 0;
    let startScrollLeft = 0;
    let maxScroll = 0;
    let dragging = false;
    let frameId = 0;
    let momentumFrame = 0;
    let suppressClickUntil = 0;
    let lastSamples = [];
    let lastFrameTime = 0;
    let velocity = 0;

    const MAX_RUBBER_BAND = 28;
    const RUBBER_RESISTANCE = 0.18;
    const FRICTION = 0.92;
    const EDGE_FRICTION = 0.72;
    const MIN_VELOCITY = 0.035; // px/ms
    const MAX_VELOCITY = 2.2;   // px/ms

    function setRubberBand(value) {
        track.style.transform = value
            ? `translate3d(${value}px, 0, 0)`
            : "";
    }

    function measureScrollRange() {
        maxScroll = Math.max(0, row.scrollWidth - row.clientWidth);
    }

    function samplePointer(x, time) {
        lastSamples.push({ x, time });
        // Use recent samples only, so release velocity reflects the final flick.
        lastSamples = lastSamples.filter(sample => time - sample.time <= 100);
        if (lastSamples.length > 6) lastSamples.shift();
    }

    function estimateVelocity() {
        if (lastSamples.length < 2) return 0;

        const first = lastSamples[0];
        const last = lastSamples[lastSamples.length - 1];
        const elapsed = last.time - first.time;
        if (elapsed <= 0) return 0;

        // Scroll direction is opposite to the pointer's horizontal direction.
        const estimate = -(last.x - first.x) / elapsed;
        return Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, estimate));
    }

    function updateDragPosition() {
        frameId = 0;
        if (!dragging) return;

        const desiredScroll = startScrollLeft - (latestX - startX);

        if (desiredScroll < 0) {
            row.scrollLeft = 0;
            setRubberBand(Math.min(MAX_RUBBER_BAND, -desiredScroll * RUBBER_RESISTANCE));
        } else if (desiredScroll > maxScroll) {
            row.scrollLeft = maxScroll;
            setRubberBand(-Math.min(MAX_RUBBER_BAND, (desiredScroll - maxScroll) * RUBBER_RESISTANCE));
        } else {
            row.scrollLeft = desiredScroll;
            setRubberBand(0);
        }
    }

    function stopMomentum() {
        if (momentumFrame) cancelAnimationFrame(momentumFrame);
        momentumFrame = 0;
        lastFrameTime = 0;
        velocity = 0;
    }

    function animateMomentum(now) {
        momentumFrame = 0;

        if (!lastFrameTime) lastFrameTime = now;
        const deltaTime = Math.min(32, now - lastFrameTime);
        lastFrameTime = now;

        const max = Math.max(0, row.scrollWidth - row.clientWidth);
        const next = row.scrollLeft + velocity * deltaTime;

        if (next <= 0 || next >= max) {
            row.scrollLeft = Math.max(0, Math.min(max, next));
            velocity *= Math.pow(EDGE_FRICTION, deltaTime / 16.667);
        } else {
            row.scrollLeft = next;
            velocity *= Math.pow(FRICTION, deltaTime / 16.667);
        }

        if (Math.abs(velocity) >= MIN_VELOCITY) {
            momentumFrame = requestAnimationFrame(animateMomentum);
        } else {
            stopMomentum();
        }
    }

    row.addEventListener("pointerdown", event => {
        if (event.pointerType !== "mouse" || event.button !== 0) return;

        if (event.target.closest("button, a, input, select, textarea, [role='button']")) {
            return;
        }

        stopMomentum();
        measureScrollRange();

        pointerId = event.pointerId;
        startX = latestX = event.clientX;
        startScrollLeft = row.scrollLeft;
        lastSamples = [];
        samplePointer(startX, performance.now());
        dragging = false;

        row.classList.remove("is-springing");
        setRubberBand(0);
    });

    row.addEventListener("pointermove", event => {
        if (event.pointerId !== pointerId) return;

        latestX = event.clientX;
        samplePointer(latestX, performance.now());

        if (!dragging && Math.abs(latestX - startX) < 4) return;

        if (!dragging) {
            dragging = true;
            row.classList.add("is-dragging");
            row.setPointerCapture(event.pointerId);
        }

        event.preventDefault();

        // At most one scroll update per rendered frame.
        if (!frameId) frameId = requestAnimationFrame(updateDragPosition);
    });

    function finishDrag(event) {
        if (event.pointerId !== pointerId) return;

        const wasDragging = dragging;
        const releaseVelocity = wasDragging
            ? (() => {
                latestX = event.clientX;
                samplePointer(latestX, performance.now());

                if (frameId) cancelAnimationFrame(frameId);
                frameId = 0;

                // Apply the final scroll position before clearing the flag,
                // since updateDragPosition() early-returns when not dragging.
                const desiredScroll = startScrollLeft - (latestX - startX);

                if (desiredScroll < 0) {
                    row.scrollLeft = 0;
                } else if (desiredScroll > maxScroll) {
                    row.scrollLeft = maxScroll;
                } else {
                    row.scrollLeft = desiredScroll;
                }

                return estimateVelocity();
            })()
            : 0;

        pointerId = null;
        dragging = false;
        row.classList.remove("is-dragging");

        if (wasDragging) {
            suppressClickUntil = performance.now() + 250;

            // Animate the visual edge offset back to zero.
            row.classList.add("is-springing");
            setRubberBand(0);
        }

        try {
            if (row.hasPointerCapture(event.pointerId)) {
                row.releasePointerCapture(event.pointerId);
            }
        } catch {
            // Pointer was already released; nothing to clean up.
        }

        if (wasDragging && Math.abs(releaseVelocity) >= MIN_VELOCITY) {
            velocity = releaseVelocity;
            lastFrameTime = 0;
            momentumFrame = requestAnimationFrame(animateMomentum);
        }
    }

    row.addEventListener("pointerup", finishDrag);
    row.addEventListener("pointercancel", finishDrag);

    row.addEventListener("click", event => {
        if (performance.now() < suppressClickUntil) {
            event.preventDefault();
            event.stopPropagation();
            suppressClickUntil = 0;
        }
    }, true);

    row.addEventListener("dragstart", event => event.preventDefault());

    track.addEventListener("transitionend", event => {
        if (event.propertyName === "transform" && !dragging) {
            row.classList.remove("is-springing");
        }
    });
}
// Highlight the nav destination matching the URL hash with a filled
// icon. Defaults to home when the URL lists no known destination.
function syncNavSelection() {
    const links = document.querySelectorAll(
        ".nav-icons a[href^='#'], .nav-icons-bottom a[href^='#']"
    );
    const hash = window.location.hash || "#home";
    let matched = false;

    links.forEach(link => {
        if (link.getAttribute("href") === hash) {
            link.setAttribute("aria-current", "page");
            matched = true;
        } else {
            link.removeAttribute("aria-current");
        }
    });

    if (!matched) {
        document
            .querySelector(".nav-icons a[href='#home']")
            ?.setAttribute("aria-current", "page");
    }
}

window.addEventListener("hashchange", syncNavSelection);
syncNavSelection();

createCarouselDots();
showFeaturedMovie(0).then(loaded => {
    if (loaded) {
        startHeroAutoplay();
    }
});

document.querySelectorAll(".media-row").forEach(enableMouseDragScroll);

loadContinueWatching().catch(error => {
    console.error("Could not load Continue Watching titles:", error);
});
loadTrending().catch(error => {
    console.error("Could not load trending titles:", error);
});
loadNewOnStreaming().catch(error => {
    console.error("Could not load new streaming titles:", error);
});

// Re-fit titles once webfonts arrive, since the squeeze is measured
// against rendered text metrics.
if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
        document.querySelectorAll(".media-card").forEach(fitCardTitle);
        fitNavLabels();
    });
}

fitNavLabels();

function navigateToCurrentView() {
    const requestedRoute = window.location.hash.slice(1) || "home";

    const views = document.querySelectorAll(".page-view");

    const matchingView = [...views].find(
        view => view.id === requestedRoute
    );

    const activeRoute = matchingView ? requestedRoute : "home";

    // Display the selected page and hide the rest.
    views.forEach(view => {
        view.hidden = view.id !== activeRoute;
    });

    // Fresh menu, full pill.
    document.querySelector(".sidebar")?.classList.remove("is-compact");
    lastScrollY = window.scrollY;
    navTravel = 0;
    navLastDir = 0;

    if (activeRoute === "search") {
        document.querySelector("#search-input")?.focus({ preventScroll: true });

        // Discover catalog lives inside the search view now; boot it
        // lazily on first visit. Init itself runs only once.
        queueMicrotask(() => initDiscoverView());
    }

    // Update the active navigation link for accessibility.
    const navigationLinks = document.querySelectorAll(
        ".nav-icons a[href^='#'], .nav-icons-bottom a[href^='#']"
    );

    navigationLinks.forEach(link => {
        if (link.getAttribute("href") === `#${activeRoute}`) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });

    // Correct invalid routes instead of leaving a dead fragment.
    if (!matchingView && requestedRoute !== "home") {
        window.location.hash = "home";
    }
}

// Dynamic pill: minimize the mobile nav after sustained scrolling down,
// restore it on sustained scroll up. Thresholds accumulate travel in one
// direction (resetting on reversal) so scroll jitter never restarts the
// 220ms transitions mid-flight. CSS scopes the effect to the ≤768px bar.
let lastScrollY = window.scrollY;
let navCompactRaf = 0;
let navTravel = 0;
let navLastDir = 0;

function updateNavCompact() {
    navCompactRaf = 0;

    const sidebar = document.querySelector(".sidebar");

    if (!sidebar) {
        return;
    }

    const y = window.scrollY;
    const delta = y - lastScrollY;
    lastScrollY = y;

    if (Math.abs(delta) < 1) {
        return;
    }

    const dir = delta > 0 ? 1 : -1;
    navTravel = dir === navLastDir ? navTravel + Math.abs(delta) : Math.abs(delta);
    navLastDir = dir;

    const compact = sidebar.classList.contains("is-compact");

    if (!compact && dir > 0 && y > 24 && navTravel >= 24) {
        sidebar.classList.add("is-compact");
        navTravel = 0;
    } else if (compact && ((dir < 0 && navTravel >= 8) || y <= 24)) {
        sidebar.classList.remove("is-compact");
        navTravel = 0;
    }
}

window.addEventListener("scroll", () => {
    if (!navCompactRaf) {
        navCompactRaf = requestAnimationFrame(updateNavCompact);
    }
}, { passive: true });

window.addEventListener("hashchange", navigateToCurrentView);

navigateToCurrentView();

// Live TMDB search for the #search view, reusing the shelf cards.
const searchInput = document.querySelector("#search-input");
const searchResults = document.querySelector("#search-results");
const searchStatus = document.querySelector("#search-status");
const searchClear = document.querySelector("#search-clear");

let searchRequestId = 0;
let searchDebounceTimer;

async function runSearch(query) {
    const trimmed = query.trim();
    const browseSection = document.querySelector("#discover-browse");

    if (!searchResults || !searchStatus) {
        return;
    }

    if (!trimmed) {
        searchResults.replaceChildren();
        searchStatus.textContent = "Type above to search TMDB.";

        // Query cleared: bring the browse catalog back.
        if (browseSection) {
            browseSection.hidden = false;
        }

        return;
    }

    // Query present: hide the browse catalog to make room for results.
    if (browseSection) {
        browseSection.hidden = true;
    }

    const requestId = ++searchRequestId;

    searchResults.replaceChildren();
    searchStatus.textContent = `Searching for “${trimmed}”…`;

    try {
        const data = await tmdb("/search/multi", {
            query: trimmed,
            language: TMDB_LANGUAGE,
            page: 1,
            include_adult: "false"
        });

        // Drop stale responses when typing fast.
        if (requestId !== searchRequestId) {
            return;
        }

        const matches = (data.results || [])
            .filter(media =>
                ["movie", "tv"].includes(media.media_type) &&
                media.poster_path
            )
            .slice(0, 18);

        if (matches.length === 0) {
            searchStatus.textContent = `No results for “${trimmed}”.`;
            return;
        }

        const total = Number(data.total_results) || matches.length;

        searchStatus.textContent =
            `Showing ${matches.length} of ${total} result${total === 1 ? "" : "s"} for “${trimmed}”.`;

        matches.forEach(media => {
            const card = createMediaCard(media);

            searchResults.append(card);
            fitCardTitle(card);
        });
    } catch (error) {
        if (requestId !== searchRequestId) {
            return;
        }

        console.error("Search failed:", error);
        searchStatus.textContent = "Unable to search right now. Try again.";
    }
}

if (searchInput) {
    searchInput.addEventListener("input", () => {
        clearTimeout(searchDebounceTimer);

        if (searchClear) {
            searchClear.hidden = searchInput.value.length === 0;
        }

        searchDebounceTimer = setTimeout(() => {
            runSearch(searchInput.value);
        }, 350);
    });

    searchInput.addEventListener("keydown", event => {
        if (event.key === "Escape" && searchInput.value) {
            searchInput.value = "";
            searchInput.dispatchEvent(new Event("input"));
        }
    });
}

if (searchClear) {
    searchClear.addEventListener("click", () => {
        if (!searchInput) {
            return;
        }

        searchInput.value = "";
        searchInput.dispatchEvent(new Event("input"));
        searchInput.focus();
    });
}

// Discover catalog (lives inside the search view): live TMDB catalog with
// mood/genre filters plus a weekly spotlight. Boots lazily on first
// visit so home loads cost nothing extra.
const discoverRoot = document.querySelector("#discover-browse");
const discoverGrid = document.querySelector("#catalog-grid");

const DISCOVER_MOVIE_GENRES = {
    Action: 28,
    Adventure: 12,
    Animation: 16,
    Comedy: 35,
    Drama: 18,
    Fantasy: 14,
    Mystery: 9648,
    "Sci-Fi": 878,
    Thriller: 53
};

// TV genre list differs: combined entries share one id, and Thriller has
// no TV equivalent, so Crime (80) stands in as the closest mood.
const DISCOVER_TV_GENRES = {
    Action: 10759,
    Adventure: 10759,
    Animation: 16,
    Comedy: 35,
    Drama: 18,
    Fantasy: 10765,
    Mystery: 9648,
    "Sci-Fi": 10765,
    Thriller: 80
};

let discoverBooted = false;
let discoverType = "All";
let discoverGenre = "All";
let discoverRequestId = 0;
let discoverGenreNames = null;

function discoverGenreName(id) {
    return discoverGenreNames?.get(Number(id)) || "";
}

async function loadDiscoverGenreNames() {
    if (discoverGenreNames) {
        return discoverGenreNames;
    }

    discoverGenreNames = new Map();

    try {
        const [movies, shows] = await Promise.all([
            tmdb("/genre/movie/list", { language: TMDB_LANGUAGE }),
            tmdb("/genre/tv/list", { language: TMDB_LANGUAGE })
        ]);

        for (const genre of [...(movies.genres || []), ...(shows.genres || [])]) {
            if (!discoverGenreNames.has(genre.id)) {
                discoverGenreNames.set(genre.id, genre.name);
            }
        }
    } catch (error) {
        console.error("Could not load TMDB genre names:", error);
    }

    return discoverGenreNames;
}

function createDiscoverCard(media) {
    const isMovie = (media.media_type || "movie") !== "tv";
    const typeLabel = isMovie ? "Movie" : "TV Show";
    const title = media.title || media.name || "Untitled";
    const releaseDate = media.release_date || media.first_air_date || "";
    const year = releaseDate.slice(0, 4) || "—";
    const rating = Number(media.vote_average || 0).toFixed(1);
    const genreName =
        discoverGenreName(media.genre_ids?.[0]) ||
        (discoverGenre !== "All" ? discoverGenre : typeLabel);

    const card = document.createElement("article");
    card.className = "movie-card";
    card.dataset.type = typeLabel;
    card.dataset.genre = genreName;
    card.dataset.title = title;

    const posterWrap = document.createElement("div");
    posterWrap.className = "poster-wrap";

    if (media.poster_path) {
        const image = document.createElement("img");
        image.src = imageUrl(media.poster_path, DISCOVER_POSTER_SIZE);
        image.alt = `${title} poster`;
        image.loading = "lazy";
        image.decoding = "async";
        posterWrap.append(image);
    }

    const info = document.createElement("div");
    info.className = "movie-info";

    const titleRow = document.createElement("div");
    titleRow.className = "movie-title-row";

    const heading = document.createElement("h3");
    heading.textContent = title;

    const ratingBadge = document.createElement("span");
    ratingBadge.className = "rating";
    ratingBadge.append(createStarIcon(), ` ${rating}`);

    const metadata = document.createElement("p");
    metadata.textContent = `${year} • ${typeLabel} `;

    const genreLabel = document.createElement("span");
    genreLabel.className = "genre-label";
    genreLabel.textContent = genreName;
    metadata.append(genreLabel);

    titleRow.append(heading, ratingBadge);
    info.append(titleRow, metadata);
    card.append(posterWrap, info);

    return card;
}

async function loadDiscoverCatalog() {
    const count = discoverRoot.querySelector("#result-count");
    const empty = discoverRoot.querySelector("#empty-state");

    if (!discoverGrid || !count || !empty) {
        return;
    }

    const requestId = ++discoverRequestId;

    discoverGrid.replaceChildren();
    empty.hidden = true;
    count.textContent = "Loading…";

    await loadDiscoverGenreNames();

    // Stale filter pass: a newer request already took over.
    if (requestId !== discoverRequestId) {
        return;
    }

    const baseParams = { language: TMDB_LANGUAGE, page: 1, include_adult: "false" };

    const discoverEndpoint = (mediaType, genreId) => tmdb(`/discover/${mediaType}`, {
        ...baseParams,
        sort_by: "popularity.desc",
        ...(genreId ? { with_genres: genreId } : {})
    }).then(data => (data.results || []).map(media => ({ ...media, media_type: mediaType === "movie" ? "movie" : "tv" })));

    try {
        let items = [];

        if (discoverType === "Movie") {
            items = await discoverEndpoint("movie", DISCOVER_MOVIE_GENRES[discoverGenre]);
        } else if (discoverType === "TV Show") {
            items = await discoverEndpoint("tv", DISCOVER_TV_GENRES[discoverGenre]);
        } else if (discoverGenre === "All") {
            const data = await tmdb("/trending/all/week", { language: TMDB_LANGUAGE });
            items = (data.results || []).filter(media =>
                ["movie", "tv"].includes(media.media_type)
            );
        } else {
            const [movies, shows] = await Promise.all([
                discoverEndpoint("movie", DISCOVER_MOVIE_GENRES[discoverGenre]),
                discoverEndpoint("tv", DISCOVER_TV_GENRES[discoverGenre])
            ]);
            items = [...movies, ...shows].sort(
                (a, b) => (b.popularity || 0) - (a.popularity || 0)
            );
        }

        if (requestId !== discoverRequestId) {
            return;
        }

        const cards = items
            .filter(media => media.poster_path)
            .slice(0, 18);

        cards.forEach((media, index) => {
            const card = createDiscoverCard(media);
            card.style.animationDelay = `${index * 35}ms`;
            discoverGrid.append(card);
        });

        count.textContent = `${cards.length} ${cards.length === 1 ? "title" : "titles"}`;
        empty.hidden = cards.length !== 0;
    } catch (error) {
        if (requestId !== discoverRequestId) {
            return;
        }

        console.error("Could not load the discover catalog:", error);
        count.textContent = "Unable to load titles right now.";
    }
}

// Remembered so a viewport-class change can swap the spotlight
// artwork without another TMDB request.
let spotlightBackdropPath = "";
let spotlightLogoPath = "";

function updateSpotlightArtwork() {
    const image = discoverRoot?.querySelector("#spotlight-image");
    const logo = discoverRoot?.querySelector("#spotlight-logo");

    if (image && spotlightBackdropPath) {
        image.src = imageUrl(spotlightBackdropPath, backdropSize());
    }

    if (logo && spotlightLogoPath) {
        logo.src = imageUrl(spotlightLogoPath, logoSize());
    }
}

async function loadDiscoverSpotlight() {
    const image = discoverRoot.querySelector("#spotlight-image");
    const meta = discoverRoot.querySelector("#spotlight-meta");
    const logo = discoverRoot.querySelector("#spotlight-logo");
    const title = discoverRoot.querySelector("#spotlight-title");
    const description = discoverRoot.querySelector("#spotlight-description");
    const rating = discoverRoot.querySelector("#spotlight-rating");

    if (!image || !meta || !title || !description || !rating) {
        return;
    }

    try {
        const data = await tmdb("/trending/all/week", { language: TMDB_LANGUAGE });
        const pick = (data.results || []).find(media =>
            ["movie", "tv"].includes(media.media_type) && media.backdrop_path
        );

        if (!pick) {
            title.textContent = "Spotlight unavailable";
            description.textContent = "TMDB returned no spotlight pick this week.";
            return;
        }

        await loadDiscoverGenreNames();

        const pickTitle = pick.title || pick.name || "Untitled";
        const year = (pick.release_date || pick.first_air_date || "").slice(0, 4) || "—";
        const kind = pick.media_type === "tv" ? "TV" : "MOVIE";
        const mood = (discoverGenreName(pick.genre_ids?.[0]) || kind).toUpperCase();

        spotlightBackdropPath = pick.backdrop_path;
        image.src = imageUrl(spotlightBackdropPath, backdropSize());
        image.alt = "";
        meta.textContent = `FEATURED PICK • ${year} • ${mood}`;

        // Text title first so there is always a fallback, then swap in
        // the TMDB-served logo when one is available.
        title.textContent = pickTitle;
        title.hidden = false;

        if (logo) {
            logo.hidden = true;
            logo.removeAttribute("src");
            logo.alt = "";
            logo.onerror = null;
        }

        const mediaType = pick.media_type === "tv" ? "tv" : "movie";

        tmdb(`/${mediaType}/${pick.id}`, {
            language: TMDB_LANGUAGE,
            append_to_response: "images",
            include_image_language: "en,null"
        }).then(details => {
            const logos = details?.images?.logos || [];
            const selectedLogo =
                logos.find(item => item.iso_639_1 === "en") ||
                logos.find(item => item.iso_639_1 === null) ||
                logos[0];

            if (selectedLogo?.file_path && logo) {
                spotlightLogoPath = selectedLogo.file_path;
                logo.src = imageUrl(spotlightLogoPath, logoSize());
                logo.alt = `${pickTitle} logo`;
                logo.hidden = false;
                title.hidden = true;

                logo.onerror = () => {
                    logo.hidden = true;
                    title.hidden = false;
                };
            }
        }).catch(() => {
            // Logo is progressive enhancement; the text title stays.
        });

        const overview = (pick.overview || "").trim();
        description.textContent = overview.length > 160
            ? `${overview.slice(0, 160).trimEnd()}…`
            : overview || "No synopsis available yet.";

        const score = Number(pick.vote_average || 0).toFixed(1);
        rating.textContent = "";
        rating.append(createStarIcon(), " ", Object.assign(document.createElement("b"), { textContent: score }), " / 10");
    } catch (error) {
        console.error("Could not load the discover spotlight:", error);
        title.textContent = "Spotlight unavailable";
        description.textContent = "Unable to reach TMDB right now.";
    }
}

function syncGenreDropdown(genre) {
    const radios = discoverRoot.querySelectorAll(
        '#genre-dropdown-list input[type="radio"]'
    );
    const match = [...radios].find(radio => radio.value === genre);

    if (!match) {
        return;
    }

    radios.forEach(radio => {
        radio.checked = radio === match;
    });

    const label = discoverRoot.querySelector("#genre-dropdown-label");

    if (label) {
        label.textContent = match.dataset.label || match.value;
    }
}

function setDiscoverGenre(genre) {
    discoverGenre = genre;

    syncGenreDropdown(genre);

    loadDiscoverCatalog();

    if (genre !== "All") {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        discoverRoot.querySelector("#catalog-heading")?.scrollIntoView({
            behavior: reduceMotion ? "auto" : "smooth",
            block: "start"
        });
    }
}

function initDiscoverView() {
    if (discoverBooted || !discoverRoot || !discoverGrid) {
        return;
    }

    discoverBooted = true;

    discoverRoot.querySelectorAll(".type-tab").forEach(button => {
        button.addEventListener("click", () => {
            discoverType = button.dataset.type;

            discoverRoot.querySelectorAll(".type-tab").forEach(tab => {
                const selected = tab === button;
                tab.classList.toggle("is-active", selected);
                tab.setAttribute("aria-pressed", String(selected));
            });

            loadDiscoverCatalog();
        });
    });

    const genreDropdown = discoverRoot.querySelector("[data-genre-dropdown]");
    const genreButton = discoverRoot.querySelector("#genre-dropdown-button");
    const genreList = discoverRoot.querySelector("#genre-dropdown-list");

    const setGenreDropdownOpen = open => {
        if (!genreButton || !genreList) {
            return;
        }

        genreButton.setAttribute("aria-expanded", String(open));
        genreList.hidden = !open;
        genreDropdown?.classList.toggle("open", open);
    };

    genreButton?.addEventListener("click", () => {
        setGenreDropdownOpen(genreList.hidden);
    });

    genreList?.addEventListener("change", event => {
        setDiscoverGenre(event.target.value);
        setGenreDropdownOpen(false);
        genreButton?.focus();
    });

    genreDropdown?.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            setGenreDropdownOpen(false);
            genreButton?.focus();
        }
    });

    document.addEventListener("pointerdown", event => {
        if (genreList && !genreList.hidden && !genreDropdown?.contains(event.target)) {
            setGenreDropdownOpen(false);
        }
    });

    syncGenreDropdown(discoverGenre);

    discoverRoot.querySelector("#reset-filters")?.addEventListener("click", () => {
        discoverType = "All";

        discoverRoot.querySelectorAll(".type-tab").forEach(button => {
            const selected = button.dataset.type === "All";
            button.classList.toggle("is-active", selected);
            button.setAttribute("aria-pressed", String(selected));
        });

        setDiscoverGenre("All");
    });

    discoverRoot.querySelector("#spotlight-browse")?.addEventListener("click", () => {
        discoverType = "All";

        discoverRoot.querySelectorAll(".type-tab").forEach(button => {
            const selected = button.dataset.type === "All";
            button.classList.toggle("is-active", selected);
            button.setAttribute("aria-pressed", String(selected));
        });

        setDiscoverGenre("Sci-Fi");
    });

    loadDiscoverSpotlight();
    loadDiscoverCatalog();
}

// Settings & Profile views: prototype-only feedback announcer.
// Future localStorage persistence hooks in here.
const spFeedback = document.querySelector("#sp-feedback");

function announceSettingsFeedback(message) {
    if (!spFeedback) {
        return;
    }

    spFeedback.textContent = message;
    spFeedback.hidden = false;
}

document.querySelectorAll("[data-demo-message]").forEach(button => {
    button.addEventListener("click", () => {
        announceSettingsFeedback(button.dataset.demoMessage);
    });
});

const spSettingsForm = document.querySelector("#sp-settings-form");

if (spSettingsForm) {
    spSettingsForm.addEventListener("submit", event => {
        event.preventDefault();
        announceSettingsFeedback("Preview only — your changes have not been saved.");
    });

    spSettingsForm.addEventListener("reset", () => {
        window.setTimeout(() => {
            announceSettingsFeedback("Preferences reset to the prototype defaults.");
        }, 0);
    });
}

// Keep artwork in step with the viewport class: crossing the mobile
// breakpoint in either direction re-renders the active hero and swaps
// the spotlight artwork so both re-fetch at the right size. Other
// artwork picks up its size lazily on the next render.
mobileMedia.addEventListener("change", () => {
    const movie = featuredCache.get(currentFeaturedIndex);

    if (movie) {
        renderFeaturedMovie(movie, FEATURED_MOVIES[currentFeaturedIndex]);
    }

    updateSpotlightArtwork();
});