// File: api/tmdb.js
// This is a Vercel Serverless Function

// Using node-fetch v2 as Vercel environment might have older Node.js
// If you have issues, you might need to install it: npm install node-fetch@2
// Or use the global fetch if your Node version supports it reliably on Vercel.
const fetch = require('node-fetch');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/';

// Helper function to fetch from TMDb
async function fetchTMDB(endpoint, params = {}) {
    if (!TMDB_API_KEY) {
        console.error("TMDB API Key is not configured in environment variables.");
        return { error: "Server configuration error.", status: 500 };
    }

    const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
    url.searchParams.set('api_key', TMDB_API_KEY);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });

    console.log(`Fetching TMDB: ${url.toString().replace(TMDB_API_KEY, '***')}`); // Log URL without key

    try {
        const response = await fetch(url.toString());
        const data = await response.json();

        if (!response.ok) {
            console.error(`TMDB API Error (${response.status}):`, data);
            return { error: data.status_message || `TMDb API error (${response.status})`, status: response.status };
        }
        return data;
    } catch (error) {
        console.error("Error fetching from TMDb:", error);
        return { error: "Failed to fetch data from TMDb.", status: 500 };
    }
}

export default async function handler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    const { query, year, type = 'movie' } = req.query; // type can be 'movie' or 'tv'

    if (!query) {
        return res.status(400).json({ error: 'Search query is required.' });
    }
    if (!TMDB_API_KEY) {
         console.error("TMDB API Key is missing on the server.");
         return res.status(500).json({ error: 'Server configuration error [TMDB Key Missing].' });
     }

    const searchType = type === 'tv' ? 'tv' : 'movie';
    const searchEndpoint = `/search/${searchType}`;
    const searchParams = {
        query: query,
        include_adult: 'false',
        language: 'en-US',
        page: '1'
    };

    // Add year parameter specifically for movies to improve accuracy
    if (searchType === 'movie' && year) {
        searchParams.primary_release_year = year;
    }
    // For TV, searching by year is less reliable (first_air_date_year), often name is enough.
    // We could add first_air_date_year if needed, but start simpler.

    try {
        // 1. Search for the item
        const searchResults = await fetchTMDB(searchEndpoint, searchParams);

        if (searchResults.error) {
            return res.status(searchResults.status || 500).json({ error: searchResults.error });
        }

        if (!searchResults.results || searchResults.results.length === 0) {
            console.log(`No TMDb results found for query: "${query}", type: ${searchType}, year: ${year || 'N/A'}`);
            return res.status(404).json({ error: 'No results found on TMDb.' });
        }

        // 2. Get the ID of the most likely result (usually the first one)
        // Add more sophisticated matching later if needed (e.g., checking year match strictly)
        const bestResult = searchResults.results[0];
        const itemId = bestResult.id;

        if (!itemId) {
             return res.status(404).json({ error: 'Could not determine item ID from TMDb search.' });
        }

        // 3. Fetch detailed information using the ID
        const detailsEndpoint = `/${searchType}/${itemId}`;
        const detailsParams = {
            language: 'en-US',
            // Append 'credits' if you want cast/crew info later
             append_to_response: 'credits'
        };
        const details = await fetchTMDB(detailsEndpoint, detailsParams);

        if (details.error) {
            return res.status(details.status || 500).json({ error: details.error });
        }

        // 4. Prepare the data to send back to the frontend
        const responseData = {
            id: details.id,
            title: details.title || details.name,
            overview: details.overview,
            posterPath: details.poster_path ? `${TMDB_IMAGE_BASE_URL}w500${details.poster_path}` : null,
            backdropPath: details.backdrop_path ? `${TMDB_IMAGE_BASE_URL}w780${details.backdrop_path}` : null,
            voteAverage: details.vote_average ? details.vote_average.toFixed(1) : null, // Format rating
            voteCount: details.vote_count,
            genres: details.genres?.map(g => g.name) || [],
            releaseDate: details.release_date || details.first_air_date,
            runtime: details.runtime || (details.episode_run_time ? details.episode_run_time[0] : null), // Movie runtime or first episode runtime
            tagline: details.tagline,
            tmdbLink: `https://www.themoviedb.org/${searchType}/${details.id}`,
             // Optional: Add main actors (example)
            actors: details.credits?.cast?.slice(0, 5).map(actor => ({
                name: actor.name,
                character: actor.character,
                profilePath: actor.profile_path ? `${TMDB_IMAGE_BASE_URL}w185${actor.profile_path}` : null
            })) || []
        };

        // Set cache headers
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=60'); // Cache for 1 hour

        return res.status(200).json(responseData);

    } catch (error) {
        console.error("Error in TMDb API handler:", error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
}
