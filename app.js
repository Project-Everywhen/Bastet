import {
    TMDB_ACCESS_TOKEN,
    TMDB_API_KEY,
    TMDB_LANUAGE,
    FEATURED_MOVIES
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

// Surface startup or network errors in the UI so they are visible to developers
// and users instead of failing silently.
createCarouselDots();
showFeaturedMovie(0);