// api/movies.js
import pkg from 'pg';

const { Pool } = pkg;

// Use Vercel's environment variable for the connection string
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
        rejectUnauthorized: false // Required for Neon connections
    },
    // Optional: Configure pool size
    // max: 10, // Consider adjusting based on expected load & Neon plan
    // idleTimeoutMillis: 30000,
    // connectionTimeoutMillis: 5000, // Increase slightly maybe
});

// Function to safely map sort keys from frontend to DB columns/expressions
const mapSortColumn = (key) => {
    const mapping = {
        id: 'original_id',
        filename: 'lower(filename)', // Use lower() for case-insensitive sort (requires index for performance)
        size: 'size_bytes',         // Assuming size_bytes column exists and is numeric
        quality: 'quality',
        lastUpdated: 'last_updated_ts',
    };
    // IMPORTANT: Default sort MUST be a valid column name or expression from your DB
    return mapping[key] || 'last_updated_ts'; // Default sort
};

// Define the columns needed by the frontend to avoid SELECT *
const neededColumns = [
    'original_id',
    'filename',
    'size_display', // Used directly
    'size_bytes',   // Used for sorting by size
    'quality',
    'last_updated_ts',
    'is_series',
    'url',
    'telegram_link',
    'gdflix_link',
    'hubcloud_link',
    'filepress_link',
    'gdtot_link',
    'languages',
    'originalFilename' // Check if you have this column
].join(', ');


export default async function handler(request, response) {
    // Set CORS headers - Adjust '*' in production for security
    response.setHeader('Access-Control-Allow-Origin', '*');
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
        console.log('API Request Query:', request.query);
        const {
            mode,           // New parameter to control API behavior
            term,           // Used for suggestions mode
            search,
            quality,
            type,
            sort = 'lastUpdated',
            sortDir = 'desc',
            page = 1,
            limit = 50,     // Default limit for search results
            id,
        } = request.query;

        client = await pool.connect();
        console.log('Database client connected.');

        // --- Mode: Suggestions ---
        if (mode === 'suggestions') {
            const searchTerm = String(term || '').trim();
            if (!searchTerm || searchTerm.length < 2) {
                return response.status(200).json({ suggestions: [] });
            }
            // Use ILIKE for case-insensitive search. Requires pg_trgm index for performance.
            const suggestionSql = `
                SELECT filename
                FROM movies
                WHERE filename ILIKE $1
                ORDER BY last_updated_ts DESC -- Prioritize recent items in suggestions
                LIMIT 15`; // Limit suggestions fetched
            const suggestionParams = [`%${searchTerm}%`];
            console.log('Executing Suggestion SQL:', suggestionSql, suggestionParams);
            const result = await client.query(suggestionSql, suggestionParams);
            // Return just an array of filenames
            return response.status(200).json({ suggestions: result.rows.map(r => r.filename) });
        }

        // --- Mode: Qualities ---
        if (mode === 'qualities') {
            const qualitySql = `
                SELECT DISTINCT quality
                FROM movies
                WHERE quality IS NOT NULL AND quality <> ''
                ORDER BY quality ASC`;
            console.log('Executing Quality SQL:', qualitySql);
            const result = await client.query(qualitySql);
            // Return just an array of quality strings
             return response.status(200).json({ qualities: result.rows.map(r => r.quality) });
        }

        // --- Default Mode: Fetch Movie Data (Search / Filter / Updates / Single Item) ---
        const currentPage = Math.max(1, parseInt(page, 10));
        // Allow slightly higher limit for updates preview initial load if requested
        const requestedLimit = Math.max(1, parseInt(limit, 10));
        const currentLimit = Math.min(100, requestedLimit); // Cap limit generally, but allow up to 100
        const offset = (currentPage - 1) * currentLimit;
        const sortColumn = mapSortColumn(sort);
        const sortDirection = sortDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        let baseQuery = 'FROM movies WHERE 1=1';
        const queryParams = [];
        let paramIndex = 1;

        // Handle single item fetch by ID
        if (id) {
            baseQuery += ` AND original_id = $${paramIndex++}`;
            queryParams.push(id);
            console.log(`Fetching single item by ID: ${id}`);
        }
        // Handle search and filters (only if not fetching by ID)
        else {
            if (search) {
                const searchTerm = String(search).trim();
                 // Numeric ID search takes precedence
                if (/^\d+$/.test(searchTerm)) {
                    baseQuery += ` AND original_id = $${paramIndex++}`;
                    queryParams.push(parseInt(searchTerm, 10));
                     console.log(`Numeric search detected. Querying for original_id: ${searchTerm}`);
                } else if (searchTerm.length > 0) {
                    // Use ILIKE for general search (case-insensitive)
                    baseQuery += ` AND filename ILIKE $${paramIndex++}`;
                    queryParams.push(`%${searchTerm}%`);
                    console.log(`Text search detected. Querying filename ILIKE: %${searchTerm}%`);
                }
            }

            if (quality) {
                baseQuery += ` AND quality = $${paramIndex++}`;
                queryParams.push(quality);
                console.log(`Applying quality filter: ${quality}`);
            }

            if (type === 'movies') {
                baseQuery += ` AND is_series = FALSE`;
                console.log(`Applying type filter: movies`);
            } else if (type === 'series') {
                baseQuery += ` AND is_series = TRUE`;
                console.log(`Applying type filter: series`);
            }
        }

        // --- Execute Queries (Count and Data) ---
        let totalItems = 1; // Default for single item fetch

        // 1. Count Query (only if not fetching single ID)
        if (!id) {
            const countSql = `SELECT COUNT(*) ${baseQuery}`;
            console.log('Executing Count SQL:', countSql, queryParams);
            const countResult = await client.query(countSql, queryParams);
            totalItems = parseInt(countResult.rows[0].count, 10);
            console.log('Total items found for query:', totalItems);
        }

        // 2. Data Query (Using specific columns)
        let dataSql = `SELECT ${neededColumns} ${baseQuery}`;

        if (!id) {
            // Apply sorting and pagination only for list views
             // Ensure sortColumn is safe via mapSortColumn
            dataSql += ` ORDER BY ${sortColumn} ${sortDirection}, original_id ${sortDirection}`; // Secondary sort for stability
            dataSql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            queryParams.push(currentLimit, offset);
        } else {
            // Ensure only one result for ID fetch
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
             // Echo back request parameters for context if needed
            filters: { search, quality, type },
            sorting: { sort: sort, sortDir: sortDir }
        });

    } catch (error) {
        console.error('API Database Error:', error);
        // Basic error check (could be more specific)
        if (error.message.includes('column') || error.message.includes('relation')) {
             console.error("Potential SQL error: Check column names, table names, and SQL syntax.");
        }
        response.status(500).json({
            error: 'Failed to fetch movie data from database.',
            // Provide more detail only in development for security
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
        });
    } finally {
        if (client) {
            client.release();
            console.log('Database client released.');
        }
    }
}
