import {
    TMDB_ACCESS_TOKEN,
    TMDB_API_KEY,
    TMDB_LANUAGE,
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

    const token = TMDB_ACCESS_TOKEN.trim();
    const apiKey = TMDB_API_KEY.trim();

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

    return response.json();
}

// Find the configured featured movie, then request its full details and images.
async function loadFeaturedMovie(featuredConfig) {
    const mediaType = featuredConfig.mediaType || "movie";

    const movie = await tmdb(`/${mediaType}/${featuredConfig.id}`, {
        language: TMDB_LANUAGE,
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

// Populate the hero section with the movie's title, artwork, and metadata.
function renderFeaturedMovie(movie, searchResult) {
    const hero = document.querySelector("#featured-hero");
    const title = document.querySelector("#featured-title");
    const logo = document.querySelector("#featured-logo");
    
    // Show the text title first in case no usable logo is available.
    const displayTitle = movie.title || movie.name || searchResult.title;
    title.textContent = displayTitle;
    title.hidden = false;
    logo.hidden = true;

    const backdrop = movie.backdrop_path;

    if (backdrop) {
        hero.style.setProperty(
            "--hero-backdrop",
            `url("${imageUrl(backdrop, "w1280")}")`
        );
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

    document.querySelector("#featured-synopsis").textContent =
        movie.overview || "No synopsis is available.";

    const heroCopy = document.querySelector(".hero-copy");

    heroCopy.classList.remove("hero-content-enter");

    // Restart the animation for each newly rendered movie.
    void heroCopy.offsetWidth;

    heroCopy.classList.add("hero-content-enter");
}

function updateCarouselDots(activeIndex) {
    const dots = document.querySelectorAll(".hero-dot");

    dots.forEach((dot, index) => {
        if (index === activeIndex) {
            dot.setAttribute("aria-current", "true");
        } else {
            dot.removeAttribute("aria-current");
        }
    });
}

function createCarouselDots() {
    const dotsContainer = document.querySelector("#hero-dots");

    dotsContainer.replaceChildren();

    FEATURED_MOVIES.forEach((featuredMovie, index) => {
        const dot = document.createElement("button");

        dot.type = "button";
        dot.className = "hero-dot";
        dot.setAttribute(
            "aria-label",
            `Show ${featuredMovie.title}`
        );

        dot.addEventListener("click", () => {
            showFeaturedMovie(index);
        });

        dotsContainer.append(dot);
    });

    updateCarouselDots(currentFeaturedIndex);
}

async function showFeaturedMovie(index) {
    if (isFeaturedLoading || FEATURED_MOVIES.length === 0) {
        return;
    }

    const nextIndex =
        (index + FEATURED_MOVIES.length) % FEATURED_MOVIES.length;

    const previousButton = document.querySelector("#hero-prev");
    const nextButton = document.querySelector("#hero-next");
    const dotsContainer = document.querySelector("#hero-dots");
    const status = document.querySelector("#app-status");

    isFeaturedLoading = true;

    previousButton.disabled = true;
    nextButton.disabled = true;

    dotsContainer.querySelectorAll("button").forEach(dot => {
        dot.disabled = true;
    });

    if (status) {
        status.hidden = true;
    }

    try {
        await loadFeaturedMovie(FEATURED_MOVIES[nextIndex]);

        currentFeaturedIndex = nextIndex;
        updateCarouselDots(currentFeaturedIndex);
    } catch (error) {
        console.error(error);

        if (status) {
            status.textContent = error.message;
            status.hidden = false;
        }
    } finally {
        isFeaturedLoading = false;

        previousButton.disabled = false;
        nextButton.disabled = false;

        dotsContainer.querySelectorAll("button").forEach(dot => {
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

        row.scrollBy({
            left: direction * row.clientWidth * 0.8,
            behavior: "smooth"
        });
    });
});

async function loadContinueWatching() {
    const container = document.querySelector("#continue-track");
    container.replaceChildren();

    const results = await Promise.all(
        CONTINUE_WATCHING.map(async entry => {
            try {
                const type = entry.mediaType === "tv" ? "tv" : "movie";

                const media = await tmdb(`/${type}/${entry.id}`, {
                    language: TMDB_LANUAGE
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
}

async function loadTrending() {

    const container = document.querySelector("#trending-track");
    container.replaceChildren();

    try {
        const data = await tmdb("/trending/all/week", {
            language: TMDB_LANUAGE
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
    let maxScrollAtStart = 0;

    let dragging = false;
    let frameId = 0;
    let suppressClickUntil = 0;

    function updateDragPosition() {
        frameId = 0;

        if (!dragging) return;

        const deltaX = latestX - startX;
        const desiredScroll = startScrollLeft - deltaX;

        if (desiredScroll < 0) {
            row.scrollLeft = 0;

            const resistance = Math.min(
                28,
                -desiredScroll * 0.18
            );

            track.style.setProperty(
                "--rubber-band",
                `${resistance}px`
            );
        } else if (desiredScroll > maxScrollAtStart) {
            row.scrollLeft = maxScrollAtStart;

            const resistance = Math.min(
                28,
                (desiredScroll - maxScrollAtStart) * 0.18
            );

            track.style.setProperty(
                "--rubber-band",
                `${-resistance}px`
            );
        } else {
            row.scrollLeft = desiredScroll;
            track.style.setProperty("--rubber-band", "0px");
        }
    }

    row.addEventListener("pointerdown", event => {
        if (event.pointerType !== "mouse" || event.button !== 0) {
            return;
        }

        if (
            event.target.closest(
                "button, a, input, select, textarea, [role='button']"
            )
        ) {
            return;
        }

        pointerId = event.pointerId;
        startX = latestX = event.clientX;
        startScrollLeft = row.scrollLeft;

        // Measure once, before any rubber-band transform is applied.
        maxScrollAtStart = Math.max(
            0,
            row.scrollWidth - row.clientWidth
        );

        dragging = false;

        row.classList.remove("is-springing");
        track.style.setProperty("--rubber-band", "0px");
    });

    row.addEventListener("pointermove", event => {
        if (event.pointerId !== pointerId) return;

        latestX = event.clientX;

        // Ignore tiny mouse movements so ordinary clicks still work.
        if (!dragging && Math.abs(latestX - startX) < 4) {
            return;
        }

        if (!dragging) {
            dragging = true;
            row.classList.add("is-dragging");

            row.setPointerCapture(event.pointerId);
        }

        event.preventDefault();

        // Coalesce frequent pointer events into one visual update per frame.
        if (!frameId) {
            frameId = requestAnimationFrame(updateDragPosition);
        }
    });

    function finishDrag(event) {
        if (event.pointerId !== pointerId) return;

        // Apply the final pointer position before releasing.
        if (dragging) {
            latestX = event.clientX;

            if (frameId) {
                cancelAnimationFrame(frameId);
                frameId = 0;
            }

            updateDragPosition();
        }

        const wasDragging = dragging;

        pointerId = null;
        dragging = false;

        row.classList.remove("is-dragging");

        if (wasDragging) {
            suppressClickUntil = performance.now() + 250;

            row.classList.add("is-springing");
            track.style.setProperty("--rubber-band", "0px");
        }

        if (row.hasPointerCapture(event.pointerId)) {
            row.releasePointerCapture(event.pointerId);
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

    row.addEventListener("dragstart", event => {
        event.preventDefault();
    });

    track.addEventListener("transitionend", event => {
        if (event.propertyName === "transform" && !dragging) {
            row.classList.remove("is-springing");
        }
    });
}

createCarouselDots();
showFeaturedMovie(0).then(startHeroAutoplay);

document.querySelectorAll(".media-row").forEach(enableMouseDragScroll);

loadContinueWatching();
loadTrending();