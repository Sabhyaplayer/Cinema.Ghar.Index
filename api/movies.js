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
        lastUpdated: 'last_updated_ts', // Maps to the timestamp column
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

    let client;

    try {
        console.log('API Request Query:', request.query);

        // --- Parse Query Parameters ---
        const {
            search,
            quality,
            type,
            sort = 'lastUpdated', // Default sort for API requests
            sortDir = 'desc',     // Default direction for API requests
            page = 1,
            limit = 50,
            id,
        } = request.query;

        const currentPage = Math.max(1, parseInt(page, 10));
        const currentLimit = Math.max(1, Math.min(100, parseInt(limit, 10)));
        const offset = (currentPage - 1) * currentLimit;
        const sortColumn = mapSortColumn(sort);
        const sortDirection = sortDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        // --- Build SQL Query ---
        // **IMPORTANT**: Ensure 'last_updated_ts' column exists and is populated correctly in your 'movies' table.
        // It should ideally be a TIMESTAMP or TIMESTAMPTZ type.
        let baseQuery = 'FROM movies WHERE 1=1';
        const queryParams = [];
        let paramIndex = 1;

        if (id) {
            baseQuery += ` AND original_id = $${paramIndex++}`;
            queryParams.push(id);
            console.log(`Fetching single item by ID: ${id}`);
        } else {
            // Apply search filter
            if (search) {
                const searchTerm = search.trim();
                const isNumericSearch = /^\d+$/.test(searchTerm);
                if (isNumericSearch) {
                    baseQuery += ` AND original_id = $${paramIndex++}`;
                    queryParams.push(parseInt(searchTerm, 10));
                    console.log(`Numeric search detected. Querying for original_id: ${searchTerm}`);
                } else {
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

        // --- Execute Queries ---
        client = await pool.connect();
        console.log('Database client connected.');

        // 1. Count Query (only if not fetching single ID)
        let totalItems = 1;
        if (!id) {
            // **Ensure WHERE clause matches the data query for accurate count**
            const countSql = `SELECT COUNT(*) ${baseQuery}`;
            console.log('Executing Count SQL:', countSql, queryParams);
            const countResult = await client.query(countSql, queryParams);
            totalItems = parseInt(countResult.rows[0].count, 10);
            console.log('Total items found for query:', totalItems);
        }

        // 2. Data Query
        // **Selecting specific columns is better practice, but ensure 'last_updated_ts' is included**
        // Example: SELECT original_id, filename, size_display, size_bytes, quality, last_updated_ts, is_series, url, telegram_link, ... etc.
        let dataSql = `SELECT * ${baseQuery}`; // Select all columns for now
        if (!id) {
            // Make sure sortColumn is a valid column or expression
            // ** Ensure last_updated_ts is a valid column for sorting **
            dataSql += ` ORDER BY ${sortColumn} ${sortDirection}, original_id ${sortDirection}`; // Secondary sort for stability
            dataSql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            queryParams.push(currentLimit, offset);
        } else {
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
            filters: { search, quality, type },
            sorting: { sort: sort, sortDir: sortDir } // Use original frontend keys
        });

    } catch (error) {
        console.error('API Database Error:', error);
        // Check if the error is related to the 'last_updated_ts' column
        if (error.message.includes('last_updated_ts')) {
             console.error("Potential issue with 'last_updated_ts' column. Ensure it exists and is a sortable type (TIMESTAMP/TIMESTAMPTZ).");
        }
        response.status(500).json({
            error: 'Failed to fetch movie data from database.',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
        });
    } finally {
        if (client) {
            client.release();
            console.log('Database client released.');
        }
    }
}
