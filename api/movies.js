// api/movies.js
import pkg from 'pg';

const { Pool } = pkg;

// --- Database Pool Setup ---
let pool; // Declare pool variable

function getDbPool() {
    if (!pool) {
        console.log("Initializing new PostgreSQL pool.");
        // Check if the environment variable is set
        if (!process.env.POSTGRES_URL) {
            console.error("FATAL: POSTGRES_URL environment variable is not set.");
            // Throwing an error here might be preferable in some setups,
            // but returning null allows the handler to send a 500 error gracefully.
            return null;
        }
        try {
            pool = new Pool({
                connectionString: process.env.POSTGRES_URL,
                ssl: {
                    rejectUnauthorized: false // Standard Vercel Postgres setting
                },
                // Optional: Pool configuration adjustments (defaults are usually fine)
                // max: 10, // Max number of clients in the pool
                // idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
                // connectionTimeoutMillis: 5000, // How long to wait for a connection attempt to succeed
            });

            // Optional: Add listeners for pool events (useful for debugging)
            pool.on('error', (err, client) => {
                console.error('[PostgreSQL Pool Error] Unexpected error on idle client', err);
                // process.exit(-1); // Consider exiting if pool errors are critical
            });
             pool.on('connect', (client) => {
                 console.log('[PostgreSQL Pool Event] Client connected.');
             });
             pool.on('acquire', (client) => {
                 console.log('[PostgreSQL Pool Event] Client acquired from pool.');
             });
             pool.on('remove', (client) => {
                 console.log('[PostgreSQL Pool Event] Client removed from pool.');
             });


        } catch (error) {
            console.error("FATAL: Failed to initialize PostgreSQL pool.", error);
            return null; // Return null if pool creation fails
        }
    } else {
        console.log("Reusing existing PostgreSQL pool.");
    }
    return pool;
}


// --- Helper Functions ---

/**
 * Maps frontend sort keys to actual database column names or expressions.
 */
const mapSortColumn = (key) => {
    const mapping = {
        id: 'original_id',
        filename: 'lower(filename)',
        size: 'size_bytes',
        quality: 'quality',
        lastUpdated: 'last_updated_ts', // Ensure this column exists and is TIMESTAMP/TIMESTAMPTZ
    };
    // Return the mapped column or default to 'last_updated_ts'
    const mapped = mapping[key] || 'last_updated_ts';
    console.log(`[mapSortColumn] Input key: ${key}, Mapped column: ${mapped}`);
    return mapped;
};

/**
 * Normalizes text for searching by converting to lowercase and REMOVING
 * common separators (._-) and spaces.
 */
const normalizeSearchTextForComparison = (text) => {
    if (!text) return '';
    const normalized = String(text)
        .toLowerCase()
        .replace(/[._\s-]+/g, '') // Remove periods, underscores, hyphens, spaces
        .trim();
    // console.log(`[normalizeSearchText] Input: '${text}', Normalized: '${normalized}'`); // Can be noisy
    return normalized;
};

// --- API Handler ---

export default async function handler(request, response) {
    console.log(`[API Handler Start] Method: ${request.method}, URL: ${request.url}`);

    // CORS Headers (Important for Vercel)
    response.setHeader('Access-Control-Allow-Credentials', true);
    response.setHeader('Access-Control-Allow-Origin', '*'); // Or restrict to your frontend domain in production
    response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Handle OPTIONS request (preflight)
    if (request.method === 'OPTIONS') {
        console.log("[API Handler] Responding to OPTIONS preflight request.");
        return response.status(200).end();
    }

    // Allow only GET requests
    if (request.method !== 'GET') {
        console.warn(`[API Handler] Method Not Allowed: ${request.method}`);
        response.setHeader('Allow', ['GET', 'OPTIONS']);
        return response.status(405).json({ error: `Method ${request.method} Not Allowed` });
    }

    // --- Main Logic ---
    let client = null; // Initialize client to null
    const currentPool = getDbPool(); // Get or initialize the pool

    // Check if pool initialization failed
    if (!currentPool) {
        console.error("[API Handler] Database pool is not available. Sending 500 error.");
        return response.status(500).json({
            error: 'Database configuration error.',
            details: 'Failed to initialize database pool. Check server logs and environment variables.'
        });
    }

    try {
        console.log('[API Handler] Attempting to connect database client...');
        client = await currentPool.connect();
        console.log('[API Handler] Database client connected successfully.');

        // --- Extract and Parse Query Parameters ---
        const {
            search, quality, type,
            sort = 'lastUpdated', sortDir = 'desc',
            page = 1, limit = 50, id,
        } = request.query;

        const currentPage = Math.max(1, parseInt(page, 10) || 1);
        const currentLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50)); // Limit max results per page
        const offset = (currentPage - 1) * currentLimit;
        const sortColumn = mapSortColumn(sort); // Use helper to map sort key
        const sortDirection = sortDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC'; // Sanitize sort direction

        console.log(`[API Handler] Parsed Params: page=${currentPage}, limit=${currentLimit}, offset=${offset}, sort=${sortColumn}, dir=${sortDirection}, search='${search}', quality='${quality}', type='${type}', id='${id}'`);

        // --- Build SQL Query Dynamically ---
        let baseQuery = 'FROM movies WHERE 1=1'; // Start with a base condition
        const queryParams = []; // Array to hold parameterized query values
        let paramIndex = 1; // Positional parameter index ($1, $2, ...)

        // --- Filtering Logic ---
        if (id) {
            // If a specific ID is requested, filter by it
            baseQuery += ` AND original_id = $${paramIndex++}`;
            queryParams.push(id);
            console.log(`[API Query Builder] Filtering by specific original_id: ${id}`);
        } else {
            // Apply search filter if present
            if (search) {
                const searchTerm = search.trim();
                const isNumericSearch = /^\d+$/.test(searchTerm);
                if (isNumericSearch) {
                    // If search term is purely numeric, assume it's an ID search
                    baseQuery += ` AND original_id = $${paramIndex++}`;
                    queryParams.push(parseInt(searchTerm, 10));
                    console.log(`[API Query Builder] Numeric search detected. Querying for original_id: ${searchTerm}`);
                } else {
                    // Otherwise, perform normalized text search on filename
                    const normalizedSearchTerm = normalizeSearchTextForComparison(searchTerm);
                    if (normalizedSearchTerm) {
                        // Normalize the 'filename' column in SQL similarly
                        const normalizedDbFilename = `regexp_replace(lower(filename), '[._\\s-]+', '', 'g')`;
                        baseQuery += ` AND ${normalizedDbFilename} ILIKE $${paramIndex++}`;
                        queryParams.push(`%${normalizedSearchTerm}%`); // Use % for wildcard matching
                        console.log(`[API Query Builder] Normalized text search. Comparing normalized filename with: %${normalizedSearchTerm}%`);
                    }
                }
            }

            // Apply quality filter if present
            if (quality) {
                baseQuery += ` AND quality = $${paramIndex++}`;
                queryParams.push(quality);
                console.log(`[API Query Builder] Applying quality filter: ${quality}`);
            }

            // Apply type filter (movies/series) if present
            if (type === 'movies') {
                baseQuery += ` AND is_series = FALSE`;
                console.log(`[API Query Builder] Applying type filter: movies`);
            } else if (type === 'series') {
                baseQuery += ` AND is_series = TRUE`;
                console.log(`[API Query Builder] Applying type filter: series`);
            }
        } // End if (!id)

        // --- Execute Database Queries ---

        // 1. Count Query (Only if not fetching by specific ID)
        let totalItems = 0;
        if (!id) {
            const countSql = `SELECT COUNT(*) ${baseQuery}`;
            console.log('[API Handler] Executing Count SQL:', countSql, 'Params:', queryParams);
            const countResult = await client.query(countSql, queryParams);
            totalItems = parseInt(countResult.rows[0].count, 10);
            console.log('[API Handler] Total items found for query:', totalItems);
        } else {
            // If fetching by ID, we expect at most 1 item
            totalItems = 1; // Set totalItems for consistency in response structure
        }


        // 2. Data Query
        // Select all columns needed by the frontend
        let dataSql = `SELECT original_id, filename, url, hubcloud_link, gdflix_link, telegram_link, filepress_link, gdtot_link, size_display, size_bytes, quality, languages, last_updated_ts, is_series, original_filename ${baseQuery}`; // Explicitly list columns

        if (!id) {
            // Apply sorting, pagination only if not fetching by specific ID
            dataSql += ` ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, original_id ${sortDirection}`; // Add secondary sort by ID, handle NULLs
            dataSql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            queryParams.push(currentLimit, offset);
        } else {
            // If fetching by ID, limit to 1 result (should be handled by WHERE clause anyway, but safe)
            dataSql += ` LIMIT 1`;
        }

        console.log('[API Handler] Executing Data SQL:', dataSql, 'Params:', queryParams);
        const dataResult = await client.query(dataSql, queryParams);
        const items = dataResult.rows;
        console.log(`[API Handler] Fetched ${items.length} item(s).`);

        // If fetching by ID and no item found, maybe send a 404? (Optional)
        // if (id && items.length === 0) {
        //     console.log(`[API Handler] Item with ID ${id} not found.`);
        //     return response.status(404).json({ error: `Item with ID ${id} not found.` });
        // }

        // --- Format and Send JSON Response ---
        const totalPages = id ? 1 : (totalItems > 0 ? Math.ceil(totalItems / currentLimit) : 0); // Calculate total pages
        console.log(`[API Handler] Calculated totalPages: ${totalPages} (totalItems: ${totalItems}, limit: ${currentLimit})`);

        const responsePayload = {
            items: items,
            totalItems: totalItems,
            page: currentPage,
            totalPages: totalPages,
            limit: currentLimit,
            filters: { search, quality, type }, // Echo back applied filters
            sorting: { sort: sort, sortDir: sortDir } // Echo back applied sorting
        };

        console.log("[API Handler] Sending successful JSON response.");
        response.setHeader('Content-Type', 'application/json');
        return response.status(200).json(responsePayload);

    } catch (error) {
        // --- Comprehensive Error Handling ---
        console.error('!!! [API Handler] ERROR DURING REQUEST PROCESSING !!!');
        console.error(`[API Handler Error] Error Type: ${error.name}`);
        console.error(`[API Handler Error] Error Message: ${error.message}`);
        console.error(`[API Handler Error] Error Stack: ${error.stack}`); // Log stack trace for debugging

        // Log details if it's a Postgres error
        if (error.code) { // Check if it looks like a Postgres error object
             console.error(`[API Handler Error] PG Error Code: ${error.code}`);
             console.error(`[API Handler Error] PG Detail: ${error.detail}`);
             console.error(`[API Handler Error] PG Hint: ${error.hint}`);
             console.error(`[API Handler Error] PG Position: ${error.position}`);
             console.error(`[API Handler Error] Associated Query (if available): ${error.query}`);
        }

        // Send a generic 500 error response
        return response.status(500).json({
            error: 'Failed to process request.',
            // Provide more detail only in development environment for security
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error. Please check the API logs.'
        });

    } finally {
        // --- Release Client ---
        // IMPORTANT: Always release the client back to the pool, even if an error occurred
        if (client) {
            try {
                client.release();
                console.log('[API Handler] Database client released successfully.');
            } catch (releaseError) {
                 console.error('[API Handler] Error releasing database client:', releaseError);
            }
        } else {
            console.log("[API Handler] No database client was acquired, nothing to release.");
        }
         console.log("[API Handler End]");
    }
}
