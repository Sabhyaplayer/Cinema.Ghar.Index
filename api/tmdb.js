// api/tmdb.js
import fetch from 'node-fetch';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/';

export default async function handler(request, response) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    if (!TMDB_API_KEY) {
        console.error('TMDB_API_KEY is not set.');
        return response.status(500).json({ error: 'Server configuration error (TMDB API Key missing)' });
    }

    const { query, type = 'movie', year } = request.query;

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

    try {
        console.log(`Fetching TMDb search: ${searchUrl}`);
        const tmdbRes = await fetch(searchUrl);
        if (!tmdbRes.ok) {
            const errorData = await tmdbRes.text();
            console.error(`TMDb API search error: ${tmdbRes.status}`, errorData);
            return response.status(tmdbRes.status).json({ error: `Failed to fetch from TMDb: ${tmdbRes.statusText}`, details: errorData });
        }

        const tmdbData = await tmdbRes.json();

        if (tmdbData.results && tmdbData.results.length > 0) {
            const item = tmdbData.results[0];
            const responseData = {
                id: item.id,
                title: item.title || item.name,
                posterPath: item.poster_path ? `${TMDB_IMAGE_BASE_URL}w500${item.poster_path}` : null,
                backdropPath: item.backdrop_path ? `${TMDB_IMAGE_BASE_URL}w1280${item.backdrop_path}` : null,
                overview: item.overview,
                releaseDate: item.release_date || item.first_air_date,
                voteAverage: item.vote_average ? parseFloat(item.vote_average.toFixed(1)) : null,
                voteCount: item.vote_count,
                tmdbLink: `https://www.themoviedb.org/${type}/${item.id}`
            };

            if (request.query.fetchFullDetails === 'true' && item.id) {
                try {
                    const detailsUrl = `${TMDB_BASE_URL}/${type}/${item.id}?api_key=${TMDB_API_KEY}&append_to_response=credits,videos`;
                    console.log(`Fetching full TMDb details: ${detailsUrl}`);
                    const detailsRes = await fetch(detailsUrl);
                    if (detailsRes.ok) {
                        const detailsData = await detailsRes.json();
                        responseData.genres = detailsData.genres ? detailsData.genres.map(g => g.name) : [];
                        responseData.runtime = detailsData.runtime || (detailsData.episode_run_time ? detailsData.episode_run_time[0] : null);
                        responseData.tagline = detailsData.tagline;
                        responseData.actors = detailsData.credits?.cast?.slice(0, 10).map(actor => ({
                            name: actor.name,
                            character: actor.character,
                            profilePath: actor.profile_path ? `${TMDB_IMAGE_BASE_URL}w185${actor.profile_path}` : null
                        })) || [];

                        if (detailsData.videos && detailsData.videos.results) {
                            const trailers = detailsData.videos.results;
                            let officialTrailer = trailers.find(video => video.site === "YouTube" && video.type === "Trailer" && video.official === true);
                            if (!officialTrailer) {
                                officialTrailer = trailers.find(video => video.site === "YouTube" && video.type === "Trailer");
                            }
                             if (!officialTrailer) { // Fallback to Teaser if no Trailer
                                officialTrailer = trailers.find(video => video.site === "YouTube" && video.type === "Teaser" && video.official === true);
                            }
                            if (!officialTrailer) { // Fallback to any YouTube Teaser
                                officialTrailer = trailers.find(video => video.site === "YouTube" && video.type === "Teaser");
                            }
                            if (officialTrailer) {
                                responseData.trailerKey = officialTrailer.key;
                                console.log("Found trailer key:", officialTrailer.key);
                            } else {
                                console.log("No suitable YouTube trailer/teaser found for:", item.title || item.name);
                            }
                        }
                    } else {
                         console.warn(`Failed to fetch full details for ${type}/${item.id}: ${detailsRes.status}`);
                    }
                } catch (detailsError) {
                    console.error("Error fetching full TMDb details:", detailsError);
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
