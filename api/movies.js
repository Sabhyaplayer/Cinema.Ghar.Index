// api/movies.js
import pkg from 'pg';

const { Pool } = pkg;

// Use Vercel's environment variable for the connection string
// Ensure POSTGRES_URL is set in your Vercel project settings.
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
        rejectUnauthorized: false // Required for Neon/Vercel Postgres connections
    },
    // Optional: Configure pool size for better performance under load
    // max: 10, // Example: Limit concurrent connections
    // idleTimeoutMillis: 30000,
    // connectionTimeoutMillis: 5000, // Increased timeout slightly
});

/**
 * Maps frontend sort keys to actual database column names or expressions.
 * IMPORTANT: Verify these column names match your 'movies' table schema exactly!
 * @param {string} key - The sort key from the frontend request (e.g., 'lastUpdated').
 * @returns {string} The corresponding database column name or expression.
 */
const mapSortColumn = (key) => {
    const mapping = {
        id: 'original_id',        // Assumes 'original_id' column exists
        filename: 'lower(filename)', // Sort case-insensitively on 'filename' column
        size: 'size_bytes',       // Assumes 'size_bytes' column exists (numeric type)
        quality: 'quality',         // Assumes 'quality' column exists
        lastUpdated: 'last_updated_ts', // !! CRITICAL: Assumes 'last_updated_ts' column exists (TIMESTAMP/TIMESTAMPTZ type) !!
    };
    // Default sort column if key is invalid or missing
    return mapping[key] || 'last_updated_ts';
};

export default async function handler(request, response) {
    // Set CORS headers - Allow requests from any origin (*)
    // Consider restricting this in production for security:
    // response.setHeader('Access-Control-Allow-Origin', 'https://your-frontend-domain.com');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
        response.setHeader('Allow', ['GET', 'OPTIONS']);
        return response.status(405).json({ error: `Method ${request.method} Not Allowed` });
    }

    let client;

    try {
        console.log('API Request Received. Query:', request.query);

        // --- Parse and Validate Query Parameters ---
        const {
            search,             // Search term (string)
            quality,            // Quality filter (string)
            type,               // Type filter ('movies' or 'series')
            sort = 'lastUpdated',// Default sort column key
            sortDir = 'desc',   // Default sort direction
            page = 1,           // Page number (default 1)
            limit = 50,         // Items per page (default 50)
            id,                 // Specific item ID to fetch (string)
        } = request.query;

        // Sanitize pagination parameters
        const currentPage = Math.max(1, parseInt(page, 10) || 1);
        const currentLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50)); // Limit max items per page
        const offset = (currentPage - 1) * currentLimit;

        // Sanitize sorting parameters
        const sortColumn = mapSortColumn(sort); // Map to DB column
        const sortDirection = sortDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC'; // Ensure valid direction

        console.log(`Parsed Params: page=${currentPage}, limit=${currentLimit}, offset=${offset}, sort=${sortColumn}, dir=${sortDirection}, search='${search}', quality='${quality}', type='${type}', id='${id}'`);

        // --- Build SQL Query ---
        // ** IMPORTANT: Double-check all column names used here against your database schema! **
        let baseQuery = 'FROM movies WHERE 1=1'; // Start with a clause that's always true
        const queryParams = []; // Array to hold parameterized query values
        let paramIndex = 1;     // Index for query parameters ($1, $2, ...)

        // --- Filtering Logic ---
        if (id) {
            // If an ID is provided, fetch only that specific item
            baseQuery += ` AND original_id = $${paramIndex++}`; // Use 'original_id' column
            queryParams.push(id);
            console.log(`Filtering by specific original_id: ${id}`);
        } else {
            // Apply search filter (if ID is not specified)
            if (search) {
                const searchTerm = search.trim();
                // Check if search term looks like a numeric ID
                const isNumericSearch = /^\d+$/.test(searchTerm);
                if (isNumericSearch) {
                    // Search by 'original_id' if it's numeric
                    baseQuery += ` AND original_id = $${paramIndex++}`;
                    queryParams.push(parseInt(searchTerm, 10));
                    console.log(`Numeric search detected. Querying for original_id: ${searchTerm}`);
                } else {
                    // Otherwise, perform case-insensitive search on 'filename'
                    baseQuery += ` AND filename ILIKE $${paramIndex++}`; // Use ILIKE for PostgreSQL
                    queryParams.push(`%${searchTerm}%`); // Add wildcards
                    console.log(`Text search detected. Querying filename ILIKE: %${searchTerm}%`);
                }
            }

            // Apply quality filter (if provided)
            if (quality) {
                baseQuery += ` AND quality = $${paramIndex++}`; // Filter by 'quality' column
                queryParams.push(quality);
                console.log(`Applying quality filter: ${quality}`);
            }

            // Apply type filter (movies or series)
            if (type === 'movies') {
                baseQuery += ` AND is_series = FALSE`; // Assumes 'is_series' boolean column
                console.log(`Applying type filter: movies`);
            } else if (type === 'series') {
                baseQuery += ` AND is_series = TRUE`; // Assumes 'is_series' boolean column
                console.log(`Applying type filter: series`);
            }
        } // End of filtering logic (for non-ID requests)

        // --- Execute Database Queries ---
        client = await pool.connect();
        console.log('Database client connected successfully.');

        // 1. Count Query (only needed for paginated results, not single ID fetch)
        let totalItems = 1; // Default to 1 if fetching single ID
        if (!id) {
            // ** The WHERE clause here MUST match the data query's WHERE clause **
            const countSql = `SELECT COUNT(*) ${baseQuery}`;
            console.log('Executing Count SQL:', countSql, 'Params:', queryParams);
            const countResult = await client.query(countSql, queryParams);
            totalItems = parseInt(countResult.rows[0].count, 10);
            console.log('Total items found for query:', totalItems);
        }

        // 2. Data Query
        // Selecting specific columns is better for performance, but SELECT * is simpler for now.
        // Ensure all columns needed by the frontend are included if you switch from SELECT *.
        let dataSql = `SELECT * ${baseQuery}`; // Selecting all columns

        if (!id) {
            // Add ORDER BY, LIMIT, and OFFSET for paginated results
            // ** Ensure 'sortColumn' is a valid column name from mapSortColumn **
            // Adding 'original_id' as a secondary sort ensures stable ordering for items with the same primary sort value
            dataSql += ` ORDER BY ${sortColumn} ${sortDirection}, original_id ${sortDirection}`;
            dataSql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            queryParams.push(currentLimit, offset);
        } else {
            // For single ID fetch, limit to 1 (should ideally only return 1 anyway)
            dataSql += ` LIMIT 1`;
        }

        console.log('Executing Data SQL:', dataSql, 'Params:', queryParams);
        const dataResult = await client.query(dataSql, queryParams);
        const items = dataResult.rows;
        console.log(`Fetched ${items.length} item(s).`);

        // --- Format and Send JSON Response ---
        const totalPages = id ? 1 : Math.ceil(totalItems / currentLimit); // Calculate total pages
        console.log(`Calculated totalPages: ${totalPages} (totalItems: ${totalItems}, limit: ${currentLimit})`);

        response.setHeader('Content-Type', 'application/json');
        response.status(200).json({
            items: items,                   // The array of movie/series data
            totalItems: totalItems,         // Total count matching the filters (for pagination)
            page: currentPage,              // Current page number returned
            totalPages: totalPages,         // Total number of pages available
            limit: currentLimit,            // Limit used for this request
            // Echo back filters/sorting used for potential debugging on frontend
            filters: { search, quality, type },
            sorting: { sort: sort, sortDir: sortDir } // Use original frontend keys here
        });

    } catch (error) {
        console.error('!!! API Database Error:', error);
        // Provide more specific feedback if the error relates to the critical sort column
        if (error.message && error.message.includes('last_updated_ts')) {
             console.error(">>> Potential issue with 'last_updated_ts' column. Ensure it exists in the 'movies' table and is a sortable type (e.g., TIMESTAMP, TIMESTAMPTZ). <<<");
        }
        response.status(500).json({
            error: 'Failed to fetch movie data from database.',
            // Provide detailed error message only in development for security
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error. Check API logs.'
        });
    } finally {
        // Release the database client back to the pool
        if (client) {
            client.release();
            console.log('Database client released.');
        }
    }
}
