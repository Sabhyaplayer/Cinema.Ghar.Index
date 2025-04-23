import pkg from 'pg';

const { Pool } = pkg;

// Use Vercel's environment variable for the connection string
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL + "?sslmode=require", // Added sslmode=require standard for Neon/Vercel
    ssl: {
        rejectUnauthorized: false // Required for Neon connections
    },
    // Optional: Configure pool size (consider lower values for serverless)
    // max: 5,
    // idleTimeoutMillis: 30000,
    // connectionTimeoutMillis: 2000,
});

// Function to safely map sort keys from frontend to DB columns
const mapSortColumn = (key) => {
    const mapping = {
        id: 'original_id',
        // IMPORTANT: Use lower(filename) ONLY if you have a functional index on lower(filename)
        // Otherwise, sorting on a function call can be slow.
        // filename: 'lower(filename)', // Sort case-insensitively - REQUIRES INDEX
        filename: 'filename', // Default to case-sensitive if no index
        size: 'size_bytes',
        quality: 'quality',
        lastUpdated: 'last_updated_ts', // Maps to the timestamp column
    };
    // IMPORTANT: Default sort MUST be a valid column name from your DB
    return mapping[key] || 'last_updated_ts'; // Default sort
};

// Define explicitly the columns needed by the frontend
const MOVIE_COLUMNS = [
    'original_id',
    'filename',
    'size_display',
    'size_bytes',
    'quality',
    'last_updated_ts',
    'is_series',
    'url',
    'telegram_link',
    'gdflix_link',
    'hubcloud_link',
    'filepress_link',
    'gdtot_link',
    'languages', // Needed for action row
    'originalFilename' // Needed for action row (if exists)
].join(', ');


export default async function handler(request, response) {
    // Set CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*'); // Adjust in production
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    if (request.method !== 'GET') {
        response.setHeader('Allow', ['GET', 'OPTIONS']);
        return response.status(405).json({ error: `Method ${request.method} Not Allowed` });
    }

    let client;

    try {
        const {
            mode, // 'movies', 'suggestions', 'qualities'
            term, // For suggestions
            search, // For movie search
            quality,
            type,
            sort = 'lastUpdated',
            sortDir = 'desc',
            page = 1,
            limit = 50,
            id,
        } = request.query;

        console.log('API Request - Mode:', mode || 'movies', 'Query:', request.query);

        client = await pool.connect();
        console.log('Database client connected.');

        // --- Mode: Fetch Suggestions ---
        if (mode === 'suggestions') {
            const searchTerm = term?.trim();
            if (!searchTerm || searchTerm.length < 2) {
                return response.status(200).json({ suggestions: [] });
            }
            // Limit suggestions for performance
            const suggestionLimit = 15;
            // Requires pg_trgm extension and GIN index for good performance:
            // CREATE EXTENSION IF NOT EXISTS pg_trgm;
            // CREATE INDEX IF NOT EXISTS idx_movies_filename_trgm ON movies USING gin (filename gin_trgm_ops);
            const suggestSql = `
                SELECT filename
                FROM movies
                WHERE filename ILIKE $1
                ORDER BY similarity(filename, $2) DESC, last_updated_ts DESC
                LIMIT $3`;
            const suggestParams = [`%${searchTerm}%`, searchTerm, suggestionLimit];

            console.log('Executing Suggestion SQL:', suggestSql, suggestParams);
            const suggestResult = await client.query(suggestSql, suggestParams);
            const suggestions = suggestResult.rows.map(row => row.filename);
            console.log(`Found ${suggestions.length} suggestions.`);
            return response.status(200).json({ suggestions });
        }

        // --- Mode: Fetch Qualities ---
        if (mode === 'qualities') {
            const qualitySql = `
                SELECT DISTINCT quality
                FROM movies
                WHERE quality IS NOT NULL AND quality <> ''
                ORDER BY quality ASC`; // Or add custom sorting logic if needed
            console.log('Executing Qualities SQL:', qualitySql);
            const qualityResult = await client.query(qualitySql);
            const qualities = qualityResult.rows.map(row => row.quality);
            console.log(`Found ${qualities.length} distinct qualities.`);
            return response.status(200).json({ qualities });
        }

        // --- Mode: Fetch Movies (Default) ---
        const currentPage = Math.max(1, parseInt(page, 10));
        const currentLimit = Math.max(1, Math.min(100, parseInt(limit, 10))); // Keep limit reasonable
        const offset = (currentPage - 1) * currentLimit;
        const sortColumn = mapSortColumn(sort);
        const sortDirection = sortDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        let baseQuery = 'FROM movies WHERE 1=1';
        const queryParams = [];
        let paramIndex = 1;

        if (id) {
            // Fetching single item by ID (for sharing)
            baseQuery += ` AND original_id = $${paramIndex++}`;
            queryParams.push(id);
            console.log(`Fetching single item by ID: ${id}`);
        } else {
            // Apply search filter (if searching)
            if (search) {
                const searchTerm = search.trim();
                const isNumericSearch = /^\d+$/.test(searchTerm);
                if (isNumericSearch) {
                    baseQuery += ` AND original_id = $${paramIndex++}`;
                    queryParams.push(parseInt(searchTerm, 10));
                    console.log(`Numeric search detected. Querying for original_id: ${searchTerm}`);
                } else {
                    // Use ILIKE - Requires index for performance!
                    baseQuery += ` AND filename ILIKE $${paramIndex++}`;
                    queryParams.push(`%${searchTerm}%`);
                    console.log(`Text search detected. Querying filename ILIKE: %${searchTerm}%`);
                }
            }

            // Apply quality filter
            if (quality) {
                baseQuery += ` AND quality = $${paramIndex++}`;
                queryParams.push(quality);
                console.log(`Applying quality filter: ${quality}`);
            }

            // Apply type filter
            if (type === 'movies') {
                baseQuery += ` AND is_series = FALSE`;
                console.log(`Applying type filter: movies`);
            } else if (type === 'series') {
                baseQuery += ` AND is_series = TRUE`;
                console.log(`Applying type filter: series`);
            }
        }

        // 1. Count Query (only if not fetching single ID)
        let totalItems = 1; // Default for single ID fetch
        if (!id) {
            const countSql = `SELECT COUNT(*) ${baseQuery}`;
            console.log('Executing Count SQL:', countSql, queryParams);
            const countResult = await client.query(countSql, queryParams);
            totalItems = parseInt(countResult.rows[0].count, 10);
            console.log('Total items found for query:', totalItems);
        }

        // 2. Data Query - SELECT specific columns
        // Make sure MOVIE_COLUMNS includes everything needed by the frontend
        let dataSql = `SELECT ${MOVIE_COLUMNS} ${baseQuery}`;

        if (!id) {
            // Apply sorting, limit, and offset only for list view
            dataSql += ` ORDER BY ${sortColumn} ${sortDirection}, original_id ${sortDirection}`; // Secondary sort
            dataSql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            queryParams.push(currentLimit, offset);
        } else {
            // Single item fetch needs no sorting/pagination, just limit 1
            dataSql += ` LIMIT 1`;
        }

        console.log('Executing Data SQL:', dataSql, queryParams);
        const dataResult = await client.query(dataSql, queryParams);
        const items = dataResult.rows;
        console.log(`Fetched ${items.length} items.`);

        // --- Format Response ---
        const totalPages = id ? 1 : Math.ceil(totalItems / currentLimit);
        console.log(`Calculated totalPages: ${totalPages} (totalItems: ${totalItems}, limit: ${currentLimit})`);

        response.setHeader('Content-Type', 'application/json');
        response.status(200).json({
            items: items,
            totalItems: totalItems,
            page: currentPage,
            totalPages: totalPages,
            limit: currentLimit,
            filters: { search, quality, type }, // Echo back filters
            sorting: { sort: sort, sortDir: sortDir } // Echo back sorting
        });

    } catch (error) {
        console.error('API Database Error:', error);
        response.status(500).json({
            error: 'Failed to fetch data from database.',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
        });
    } finally {
        if (client) {
            client.release();
            console.log('Database client released.');
        }
    }
}
