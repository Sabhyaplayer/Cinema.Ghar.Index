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
                sort = 'lastUpdated', // Default sort column
                sortDir = 'desc', // Default sort direction
                page = 1,
                limit = 50, // Default items per page (matches frontend config)
                id, // Specific ID for fetching a single shared item
                suggest // Flag for search suggestions (future use, handled separately now)
            } = request.query;

            const currentPage = Math.max(1, parseInt(page, 10));
            const currentLimit = Math.max(1, Math.min(100, parseInt(limit, 10))); // Limit max page size
            const offset = (currentPage - 1) * currentLimit;
            const sortColumn = mapSortColumn(sort);
            const sortDirection = sortDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

            // --- Build SQL Query ---
            let baseQuery = 'FROM movies WHERE 1=1'; // Start with a condition that's always true
            const queryParams = [];
            let paramIndex = 1;

            // Handle fetching a single item by ID
            if (id) {
                baseQuery += ` AND original_id = $${paramIndex++}`;
                queryParams.push(id);
            } else {
                // Apply search filter (case-insensitive)
                if (search) {
                    // Simple ILIKE search on filename
                    baseQuery += ` AND filename ILIKE $${paramIndex++}`;
                    queryParams.push(`%${search}%`);
                    // Note: For better performance, consider full-text search using the 'search_vector' column
                }

                // Apply quality filter
                if (quality) {
                    baseQuery += ` AND quality = $${paramIndex++}`;
                    queryParams.push(quality);
                }

                // Apply type filter (movie/series)
                if (type === 'movies') {
                    baseQuery += ` AND is_series = FALSE`;
                } else if (type === 'series') {
                    baseQuery += ` AND is_series = TRUE`;
                }
            }


            // --- Execute Queries (Count and Data) ---
            client = await pool.connect(); // Get a client from the pool

             // 1. Count Query (only if not fetching single ID)
            let totalItems = 1; // Assume 1 if fetching by ID
            if (!id) {
                const countSql = `SELECT COUNT(*) ${baseQuery}`;
                console.log('Count SQL:', countSql, queryParams);
                const countResult = await client.query(countSql, queryParams);
                totalItems = parseInt(countResult.rows[0].count, 10);
                console.log('Total items found:', totalItems);
            }


            // 2. Data Query
            let dataSql = `SELECT * ${baseQuery}`; // Select all columns for now
             if (!id) { // Apply sorting and pagination only for lists
                 dataSql += ` ORDER BY ${sortColumn} ${sortDirection}, original_id ${sortDirection}`; // Secondary sort for stability
                 dataSql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
                 queryParams.push(currentLimit, offset);
             } else {
                 dataSql += ` LIMIT 1`; // Ensure only one row if fetching by ID
             }

            console.log('Data SQL:', dataSql, queryParams);
            const dataResult = await client.query(dataSql, queryParams);
            const items = dataResult.rows;
            console.log(`Fetched ${items.length} items for page ${currentPage}.`);

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
                // filters: { search, quality, type },
                // sorting: { sort, sortDir }
            });

        } catch (error) {
            console.error('API Database Error:', error);
            response.status(500).json({
                error: 'Failed to fetch movie data from database.',
                details: error.message // Provide specific error in logs, maybe less in response
            });
        } finally {
            if (client) {
                client.release(); // Release the client back to the pool
                console.log('Database client released.');
            }
        }
    }
