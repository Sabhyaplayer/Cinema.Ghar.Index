// api/tmdb.js
import fetch from 'node-fetch'; // or your preferred HTTP client

const TMDB_API_KEY = process.env.TMDB_API_KEY; // Store your API key in environment variables
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/';

export default async function handler(request, response) {
    // CORS Headers
    response.setHeader('Access-Control-Allow-Origin', '*'); // TODO: Restrict in production
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    if (!TMDB_API_KEY) {
        console.error('TMDB_API_KEY is not set.');
        return response.status(500).json({ error: 'Server configuration error (TMDB API Key missing)' });
    }

    const { query, type = 'movie', year } = request.query; // 'type' can be 'movie' or 'tv'

    if (!query) {
        return response.status(400).json({ error: 'Query parameter is required' });
    }

    let searchUrl;
    if (type === 'movie') {
        searchUrl = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
        if (year) {
            searchUrl += `&primary_release_year=${year}`;
        }
    } else if (type === 'tv') {
        searchUrl = `${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
        if (year) {
            searchUrl += `&first_air_date_year=${year}`;
        }
    } else {
        return response.status(400).json({ error: 'Invalid type parameter. Use "movie" or "tv".' });
    }
    // Add language if needed: &language=en-US

    try {
        console.log(`Fetching TMDb: ${searchUrl}`);
        const tmdbRes = await fetch(searchUrl);
        if (!tmdbRes.ok) {
            const errorData = await tmdbRes.text(); // Get more info on TMDb error
            console.error(`TMDb API error: ${tmdbRes.status}`, errorData);
            return response.status(tmdbRes.status).json({ error: `Failed to fetch from TMDb: ${tmdbRes.statusText}`, details: errorData });
        }

        const tmdbData = await tmdbRes.json();

        if (tmdbData.results && tmdbData.results.length > 0) {
            const item = tmdbData.results[0]; // Take the first result

            // Prepare data for the frontend (similar to what createItemDetailContentHTML expects)
            const responseData = {
                id: item.id,
                title: item.title || item.name,
                posterPath: item.poster_path ? `${TMDB_IMAGE_BASE_URL}w500${item.poster_path}` : null,
                backdropPath: item.backdrop_path ? `${TMDB_IMAGE_BASE_URL}w1280${item.backdrop_path}` : null,
                overview: item.overview,
                releaseDate: item.release_date || item.first_air_date,
                voteAverage: item.vote_average,
                voteCount: item.vote_count,
                // For item detail view, you might want more like genres, runtime, actors
                // For actors (credits): you'd need another API call for /movie/{id}/credits or /tv/{id}/credits
                // For genres: item.genre_ids (you'd need to map these to names or fetch genre list)
                tmdbLink: `https://www.themoviedb.org/${type}/${item.id}`
            };
             // If fetching for item detail, you might want to fetch credits and more details
            if (request.query.fetchFullDetails === 'true' && item.id) {
                try {
                    // Fetch Genres (if not already present as names)
                    // Example: Fetch movie details which often include genres
                    const detailsUrl = `${TMDB_BASE_URL}/${type}/${item.id}?api_key=${TMDB_API_KEY}&append_to_response=credits,videos`;
                    const detailsRes = await fetch(detailsUrl);
                    if (detailsRes.ok) {
                        const detailsData = await detailsRes.json();
                        responseData.genres = detailsData.genres ? detailsData.genres.map(g => g.name) : [];
                        responseData.runtime = detailsData.runtime || (detailsData.episode_run_time ? detailsData.episode_run_time[0] : null);
                        responseData.tagline = detailsData.tagline;
                        responseData.actors = detailsData.credits?.cast?.slice(0, 10).map(actor => ({ // Top 10 actors
                            name: actor.name,
                            character: actor.character,
                            profilePath: actor.profile_path ? `${TMDB_IMAGE_BASE_URL}w185${actor.profile_path}` : null
                        })) || [];
                        // You can also get trailer video keys from detailsData.videos.results
                    }
                } catch (detailsError) {
                    console.error("Error fetching full TMDb details:", detailsError);
                    // Continue with partial data
                }
            }


            response.status(200).json(responseData);
        } else {
            response.status(404).json({ error: 'No results found on TMDb for the query.' });
        }
    } catch (error) {
        console.error('Error in /api/tmdb proxy:', error);
        response.status(500).json({ error: 'Internal server error in TMDb proxy.' });
    }
}
