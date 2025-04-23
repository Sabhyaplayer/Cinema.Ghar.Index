// api/movies.js
import pkg from 'pg';

const { Pool } = pkg;

// Use Vercel's environment variable for the connection string
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
        rejectUnauthorized: false // Required for Neon/Vercel Postgres connections
    },
    // Optional: Configure pool size
    // max: 10,
    // idleTimeoutMillis: 30000,
    // connectionTimeoutMillis: 5000,
});

/**
 * Maps frontend sort keys to actual database column names or expressions.
 * Verify these column names match your 'movies' table schema exactly!
 */
const mapSortColumn = (key) => {
    const mapping = {
        id: 'original_id',
        filename: 'lower(filename)', // Keep sorting case-insensitive if desired
        size: 'size_bytes',
        quality: 'quality',
        lastUpdated: 'last_updated_ts', // CRITICAL: Assumes 'last_updated_ts' column exists (TIMESTAMP/TIMESTAMPTZ type)
    };
    return mapping[key] || 'last_updated_ts'; // Default sort
};

/**
 * Normalizes text for searching by converting to lowercase,
 * replacing common separators (._-) with spaces, and collapsing multiple spaces.
 * @param {string} text - The input text.
 * @returns {string} The normalized text.
 */
const normalizeSearchText = (text) => {
    if (!text) return '';
    return String(text)
        .toLowerCase()
        .replace(/[._-]+/g, ' ') // Replace separators with a single space
        .replace(/\s+/g, ' ')     // Collapse multiple spaces into one
        .trim();                  // Trim leading/trailing spaces
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
        console.log('API Request Received. Query:', request.query);

        // --- Parse and Validate Query Parameters ---
        const {
            search,
            quality,
            type,
            sort = 'lastUpdated',
            sortDir = 'desc',
            page = 1,
            limit = 50,
            id,
        } = request.query;

        const currentPage = Math.max(1, parseInt(page, 10) || 1);
        const currentLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
        const offset = (currentPage - 1) * currentLimit;
        const sortColumn = mapSortColumn(sort);
        const sortDirection = sortDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        console.log(`Parsed Params: page=${currentPage}, limit=${currentLimit}, offset=${offset}, sort=${sortColumn}, dir=${sortDirection}, search='${search}', quality='${quality}', type='${type}', id='${id}'`);

        // --- Build SQL Query ---
        let baseQuery = 'FROM movies WHERE 1=1';
        const queryParams = [];
        let paramIndex = 1;

        // --- Filtering Logic ---
        if (id) {
            // Fetch specific item by ID
            baseQuery += ` AND original_id = $${paramIndex++}`;
            queryParams.push(id);
            console.log(`Filtering by specific original_id: ${id}`);
        } else {
            // Apply search filter (if ID is not specified)
            if (search) {
                const searchTerm = search.trim();
                // Check if search term looks like a numeric ID FIRST
                const isNumericSearch = /^\d+$/.test(searchTerm);
                if (isNumericSearch) {
                    // Search by 'original_id' if it's numeric
                    baseQuery += ` AND original_id = $${paramIndex++}`;
                    queryParams.push(parseInt(searchTerm, 10));
                    console.log(`Numeric search detected. Querying for original_id: ${searchTerm}`);
                } else {
                    // *** IMPROVED TEXT SEARCH ***
                    // Normalize the search term entered by the user
                    const normalizedSearchTerm = normalizeSearchText(searchTerm);

                    if (normalizedSearchTerm) {
                        // Normalize the 'filename' column *in the SQL query* for comparison
                        // This replaces . _ - with spaces, converts to lower, collapses spaces
                        const normalizedDbFilename = `trim(regexp_replace(lower(filename), '[._-]+', ' ', 'g'))`;

                        // Use ILIKE with wildcards for flexible matching on the normalized strings
                        baseQuery += ` AND ${normalizedDbFilename} ILIKE $${paramIndex++}`;
                        queryParams.push(`%${normalizedSearchTerm}%`); // Match anywhere in the normalized name
                        console.log(`Normalized text search detected. Querying normalized filename ILIKE: %${normalizedSearchTerm}%`);

                        // --- Alternative: Split words (more complex, keep previous simpler version if preferred) ---
                        /*
                        const searchWords = normalizedSearchTerm.split(' ').filter(w => w.length > 1); // Split into words, ignore very short ones
                        if (searchWords.length > 0) {
                            const searchConditions = searchWords.map((word, index) => {
                                queryParams.push(`%${word}%`); // Add word for parameter binding
                                // Check if the normalized filename contains the current word
                                return `${normalizedDbFilename} ILIKE $${paramIndex + index}`;
                            }).join(' AND '); // Require ALL words to be present

                            baseQuery += ` AND (${searchConditions})`;
                            paramIndex += searchWords.length; // Increment paramIndex by the number of words added
                            console.log(`Normalized multi-word search. Querying for words: ${searchWords.join(', ')}`);
                        } else if (normalizedSearchTerm) {
                             // Fallback to single term search if no valid words after split
                             baseQuery += ` AND ${normalizedDbFilename} ILIKE $${paramIndex++}`;
                             queryParams.push(`%${normalizedSearchTerm}%`);
                             console.log(`Normalized single-term search fallback. Querying normalized filename ILIKE: %${normalizedSearchTerm}%`);
                        }
                        */
                        // --- End Alternative ---
                    }
                }
            } // End if (search)

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
        } // End if (!id)

        // --- Execute Database Queries ---
        client = await pool.connect();
        console.log('Database client connected successfully.');

        // 1. Count Query (only for paginated results)
        let totalItems = 1;
        if (!id) {
            const countSql = `SELECT COUNT(*) ${baseQuery}`;
            console.log('Executing Count SQL:', countSql, 'Params:', queryParams);
            const countResult = await client.query(countSql, queryParams);
            totalItems = parseInt(countResult.rows[0].count, 10);
            console.log('Total items found for query:', totalItems);
        }

        // 2. Data Query
        let dataSql = `SELECT * ${baseQuery}`; // Select all columns for simplicity

        if (!id) {
            // Add ORDER BY, LIMIT, OFFSET for pagination
            // Note: Sorting happens *after* filtering
            dataSql += ` ORDER BY ${sortColumn} ${sortDirection}, original_id ${sortDirection}`; // Stable sort
            dataSql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            queryParams.push(currentLimit, offset);
        } else {
            dataSql += ` LIMIT 1`;
        }

        console.log('Executing Data SQL:', dataSql, 'Params:', queryParams);
        const dataResult = await client.query(dataSql, queryParams);
        const items = dataResult.rows;
        console.log(`Fetched ${items.length} item(s).`);

        // --- Format and Send JSON Response ---
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
            sorting: { sort: sort, sortDir: sortDir }
        });

    } catch (error) {
        console.error('!!! API Database Error:', error);
        if (error.message && error.message.includes('last_updated_ts')) {
             console.error(">>> Potential issue with 'last_updated_ts' column. Ensure it exists and is a sortable type (e.g., TIMESTAMP, TIMESTAMPTZ). <<<");
        }
         // Log the failing SQL and params if possible (be careful with sensitive data in production logs)
        console.error("Failing SQL (approximate):", error.query || "N/A"); // Some drivers might attach query to error
        console.error("Failing Params (approximate):", queryParams); // Log params used

        response.status(500).json({
            error: 'Failed to fetch movie data from database.',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error. Check API logs.'
        });
    } finally {
        if (client) {
            client.release();
            console.log('Database client released.');
        }
    }
}
