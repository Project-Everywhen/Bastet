import {
    TMDB_ACCESS_TOKEN,
    TMDB_API_KEY,
    TMDB_LANGUAGE,
    FEATURED_MOVIES,
    CONTINUE_WATCHING
} from "./config.js";

const API_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/";

let currentFeaturedIndex = 0;
let isFeaturedLoading = false;

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

// Find the configured featured movie, then request its full details and images.
async function loadFeaturedMovie(featuredConfig) {
    const mediaType = featuredConfig.mediaType || "movie";

    const movie = await tmdb(`/${mediaType}/${featuredConfig.id}`, {
        language: TMDB_LANGUAGE,
        append_to_response: "images",
        include_image_language: "en,null"
    });

    renderFeaturedMovie(movie, featuredConfig);
}

// Build a TMDB image URL from a path returned by the API.
function imageUrl(path, size) {
    return path
        ? `${IMAGE_BASE}${size}${path}`
        : "";
}

function createMediaCard(media, options = {}) {
    const { progress } = options;
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
        ? media.backdrop_path || media.poster_path
        : media.poster_path || media.backdrop_path;

    if (posterPath) {
        const image = document.createElement("img");

        image.className = "media-image";
        image.src = imageUrl(
            posterPath,
            isContinue ? "w780" : "w342"
        );
        image.alt = `${title} ${isContinue ? "backdrop" : "poster"}`;
        image.loading = "lazy";

        artwork.append(image);
    } else {
        artwork.textContent = "Artwork unavailable";
    }

    if (isContinue) {
        const track = document.createElement("div");
        track.className = "media-progress";

        const fill = document.createElement("div");
        fill.className = "media-progress-fill";
        fill.style.width = `${Math.min(100, Math.max(0, progress))}%`;

        track.append(fill);
        artwork.append(track);
    }

    const details = document.createElement("div");
    details.className = "media-card-details";

    const heading = document.createElement("h3");
    heading.textContent = title;

    const metadata = document.createElement("p");
    const year = releaseDate.slice(0, 4) || "—";

    metadata.textContent = isContinue
        ? `${year} · ${progress}% watched`
        : `${year} · ★ ${Number(media.vote_average || 0).toFixed(1)}`;

    details.append(heading, metadata);
    card.append(artwork, details);

    return card;
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
            `url("${imageUrl(backdrop, "w1280")}")`
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
        logo.src = imageUrl(selectedLogo.file_path, "w500");
        logo.alt = `${displayTitle} logo`;
        logo.hidden = false;
        title.hidden = true;

        logo.onerror = () => {
            logo.hidden = true;
            title.hidden = false;
        };
    }

    // Update the movie metadata, using friendly fallbacks for missing fields.
    document.querySelector("#featured-year").textContent =
        (movie.release_date || movie.first_air_date || "").slice(0, 4) || "—";

    document.querySelector("#featured-rating").textContent =
        Number(movie.vote_average || 0).toFixed(1);

    document.querySelector("#featured-genres").textContent =
        (movie.genres || [])
            .slice(0, 3)
            .map(genre => genre.name)
            .join(", ") || "Movie";

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
        await loadFeaturedMovie(FEATURED_MOVIES[nextIndex]);

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

                    return {
                        media: { ...media, media_type: type },
                        progress: entry.progress
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

        validItems.forEach(({ media, progress }, index) => {
            const card = createMediaCard(media, { progress });

            card.style.animationDelay = `${index * 35}ms`;
            container.append(card);
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
        });
    } catch (error) {
        console.error("Could not load trending titles:", error);
        container.textContent = "Unable to load trending titles.";
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
        track.style.setProperty("--rubber-band", `${value}px`);
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