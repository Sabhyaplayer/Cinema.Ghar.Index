    // api/movies.js
    import pkg from 'pg';

    const { Pool } = pkg;

    // Use Vercel's environment variable for the connection string
    // Ensure POSTGRES_URL is set in your Vercel project settings
    const pool = new Pool({
        connectionString: process.env.POSTGRES_URL,
        ssl: {
            rejectUnauthorized: false // Required for Neon connections
        },
        // Optional: Configure pool size (defaults are usually fine)
        // max: 20,
        // idleTimeoutMillis: 30000,
        // connectionTimeoutMillis: 2000,
    });

    // Function to safely map sort keys from frontend to DB columns
    const mapSortColumn = (key) => {
        const mapping = {
            id: 'original_id',
            filename: 'lower(filename)', // Sort case-insensitively
            size: 'size_bytes',
            quality: 'quality',
            lastUpdated: 'last_updated_ts',
        };
        // IMPORTANT: Default sort MUST be a valid column name from your DB
        return mapping[key] || 'last_updated_ts'; // Default sort
    };

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

        let client; // Define client outside try block

        try {
            console.log('API Request Query:', request.query);

            // --- Parse Query Parameters ---
            const {
                search,
                quality,
                type, // 'movies', 'series', or unset for all
                sort = 'lastUpdated', // Default sort column (maps to DB col via mapSortColumn)
                sortDir = 'desc', // Default sort direction
                page = 1,
                limit = 50, // Default items per page (matches frontend config)
                id, // Specific ID for fetching a single shared item
                // suggest // Flag for search suggestions (future use, handled separately now)
            } = request.query;

            const currentPage = Math.max(1, parseInt(page, 10));
            const currentLimit = Math.max(1, Math.min(100, parseInt(limit, 10))); // Limit max page size
            const offset = (currentPage - 1) * currentLimit;
            const sortColumn = mapSortColumn(sort); // Map frontend key to DB column
            const sortDirection = sortDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

            // --- Build SQL Query ---
            let baseQuery = 'FROM movies WHERE 1=1'; // Start with a condition that's always true
            const queryParams = [];
            let paramIndex = 1;

            // Handle fetching a single item by ID (used for direct share links)
            if (id) {
                baseQuery += ` AND original_id = $${paramIndex++}`;
                queryParams.push(id);
                console.log(`Fetching single item by ID: ${id}`);
            } else {
                // Apply search filter (case-insensitive)
                // *** MODIFIED SEARCH LOGIC ***
                if (search) {
                    const searchTerm = search.trim();
                    // Check if the search term consists ONLY of digits
                    const isNumericSearch = /^\d+$/.test(searchTerm);

                    if (isNumericSearch) {
                        // If it's purely numeric, search the original_id column
                        baseQuery += ` AND original_id = $${paramIndex++}`;
                        queryParams.push(parseInt(searchTerm, 10)); // Use the integer value
                        console.log(`Numeric search detected. Querying for original_id: ${searchTerm}`);
                    } else {
                        // Otherwise, perform ILIKE search on the filename
                        baseQuery += ` AND filename ILIKE $${paramIndex++}`;
                        queryParams.push(`%${searchTerm}%`);
                        console.log(`Text search detected. Querying filename ILIKE: %${searchTerm}%`);
                         // Note: For better performance on large datasets, consider full-text search
                         // using a pre-indexed column (e.g., using tsvector and tsquery).
                         // Example (requires setup): baseQuery += ` AND search_vector @@ plainto_tsquery('english', $${paramIndex++})`;
                         // queryParams.push(searchTerm);
                    }
                }
                // *** END OF MODIFIED SEARCH LOGIC ***

                // Apply quality filter
                if (quality) {
                    baseQuery += ` AND quality = $${paramIndex++}`;
                    queryParams.push(quality);
                     console.log(`Applying quality filter: ${quality}`);
                }

                // Apply type filter (movie/series)
                if (type === 'movies') {
                    baseQuery += ` AND is_series = FALSE`;
                     console.log(`Applying type filter: movies (is_series = FALSE)`);
                } else if (type === 'series') {
                    baseQuery += ` AND is_series = TRUE`;
                     console.log(`Applying type filter: series (is_series = TRUE)`);
                }
            }


            // --- Execute Queries (Count and Data) ---
            client = await pool.connect(); // Get a client from the pool
             console.log('Database client connected.');

             // 1. Count Query (only if not fetching single ID)
            let totalItems = 1; // Assume 1 if fetching by ID
            if (!id) {
                const countSql = `SELECT COUNT(*) ${baseQuery}`;
                console.log('Executing Count SQL:', countSql, queryParams);
                const countResult = await client.query(countSql, queryParams);
                totalItems = parseInt(countResult.rows[0].count, 10);
                console.log('Total items found:', totalItems);
            }


            // 2. Data Query
            // IMPORTANT: Ensure all columns needed by the frontend (preprocessMovieData, createActionContentHTML etc.)
            // are actually present in your 'movies' table. Selecting '*' is convenient but less explicit.
            // Consider listing columns explicitly: SELECT original_id, filename, size_display, size_bytes, quality, last_updated_ts, is_series, url, telegram_link, ... etc.
            let dataSql = `SELECT * ${baseQuery}`; // Select all columns for now
             if (!id) { // Apply sorting and pagination only for lists
                 // Make sure sortColumn is a valid column or expression
                 dataSql += ` ORDER BY ${sortColumn} ${sortDirection}, original_id ${sortDirection}`; // Secondary sort for stability
                 dataSql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
                 queryParams.push(currentLimit, offset);
             } else {
                 dataSql += ` LIMIT 1`; // Ensure only one row if fetching by ID
             }

            console.log('Executing Data SQL:', dataSql, queryParams);
            const dataResult = await client.query(dataSql, queryParams);
            const items = dataResult.rows;
            console.log(`Fetched ${items.length} items.`);

            // --- Format Response ---
            const totalPages = id ? 1 : Math.ceil(totalItems / currentLimit);

            response.setHeader('Content-Type', 'application/json');
            response.status(200).json({
                items: items,
                totalItems: totalItems,
                page: currentPage,
                totalPages: totalPages,
                limit: currentLimit,
                // Optional: Include current filter/sort state for debugging or client use
                filters: { search, quality, type },
                sorting: { sort: sort, sortDir: sortDir } // Use the original frontend keys here
            });

        } catch (error) {
            console.error('API Database Error:', error);
            response.status(500).json({
                error: 'Failed to fetch movie data from database.',
                // Avoid sending detailed SQL errors to the client in production
                details: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
            });
        } finally {
            if (client) {
                client.release(); // Release the client back to the pool
                console.log('Database client released.');
            }
        }
    }
