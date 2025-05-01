// api/movies.js
import pkg from 'pg';

const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
        rejectUnauthorized: false // Required for Vercel/Neon etc.
    },
    // Optional: Pool configuration
    // max: 10, // Default is 10
    // idleTimeoutMillis: 30000, // Default is 10000
    // connectionTimeoutMillis: 5000, // Default is disabled
});

/**
 * Maps frontend sort keys to actual database column names or expressions.
 */
const mapSortColumn = (key) => {
    const mapping = {
        id: 'original_id', // Ensure your ID column is named original_id
        filename: 'lower(filename)',
        size: 'size_bytes',
        quality: 'quality',
        lastUpdated: 'last_updated_ts', // CRITICAL: Assumes 'last_updated_ts' TIMESTAMP/TIMESTAMPTZ column exists
    };
    // Default to sorting by last_updated_ts descending if key is invalid
    return mapping[key] || 'last_updated_ts';
};

/**
 * Normalizes text for searching by converting to lowercase and REMOVING
 * common separators (._-) and spaces.
 * @param {string} text - The input text.
 * @returns {string} The normalized text with separators and spaces removed.
 */
const normalizeSearchTextForComparison = (text) => {
    if (!text) return '';
    return String(text)
        .toLowerCase()
        // Remove periods, underscores, hyphens, AND spaces
        .replace(/[._\s-]+/g, '') // Changed: Now removes spaces too (\s)
        .trim();
};


export default async function handler(request, response) {
    // CORS Headers
    response.setHeader('Access-Control-Allow-Origin', '*'); // TODO: Restrict in production
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        console.log('Handling OPTIONS request');
        return response.status(200).end();
    }

    if (request.method !== 'GET') {
        console.log(`Method Not Allowed: ${request.method}`);
        response.setHeader('Allow', ['GET', 'OPTIONS']);
        return response.status(405).json({ error: `Method ${request.method} Not Allowed` });
    }

    let client;
    // Define queryParams here to be accessible in catch/finally
    const queryParams = [];
    let dataSql = ''; // Make SQL query accessible in catch

    try {
        console.log('API Request Received. Query:', request.query);

        const {
            search, quality, type,
            sort = 'lastUpdated', sortDir = 'desc',
            page = 1, limit = 50, id, // Make sure 'id' is correctly destructured
        } = request.query;

        // --- Parameter Parsing ---
        const currentPage = Math.max(1, parseInt(page, 10) || 1);
        // Increase max limit slightly if needed, but keep reasonable
        const currentLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
        const offset = (currentPage - 1) * currentLimit;
        const sortColumn = mapSortColumn(sort);
        const sortDirection = sortDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        console.log(`Parsed Params: page=${currentPage}, limit=${currentLimit}, offset=${offset}, sort=${sortColumn}, dir=${sortDirection}, search='${search}', quality='${quality}', type='${type}', id='${id}'`);

        // --- Build SQL Query ---
        // Important: Ensure your table name is 'movies' or change it here
        let baseQuery = 'FROM movies WHERE 1=1';
        // Clear queryParams at the start of building logic
        queryParams.length = 0;
        let paramIndex = 1;

        // --- Filtering Logic ---
        if (id) {
            console.log(`Filtering by specific original_id: ${id}`);
            // IMPORTANT: Ensure your ID column is indeed 'original_id'
            baseQuery += ` AND original_id = $${paramIndex++}`;
            queryParams.push(id);
            // Note: Type casting might be needed if original_id is numeric:
            // queryParams.push(parseInt(id, 10)); // If original_id is an integer
            // Be careful if IDs can be non-numeric strings.
        } else {
            console.log("Not filtering by specific ID. Applying list filters.");
            // --- Search Logic ---
            if (search) {
                 const searchTerm = search.trim();
                 // Check if search term looks like an ID (all digits)
                 const isNumericSearch = /^\d+$/.test(searchTerm);

                 if (isNumericSearch) {
                     // Search by ID if the term is purely numeric
                     console.log(`Numeric search detected. Querying for original_id: ${searchTerm}`);
                     baseQuery += ` AND original_id = $${paramIndex++}`;
                     queryParams.push(parseInt(searchTerm, 10)); // Assuming original_id is numeric
                 } else {
                     // *** NORMALIZED TEXT SEARCH ***
                     const normalizedSearchTerm = normalizeSearchTextForComparison(searchTerm);
                     if (normalizedSearchTerm) {
                         // Normalize the 'filename' column IN THE SQL QUERY similarly
                         const normalizedDbFilename = `regexp_replace(lower(filename), '[._\\s-]+', '', 'g')`;
                         baseQuery += ` AND ${normalizedDbFilename} ILIKE $${paramIndex++}`;
                         queryParams.push(`%${normalizedSearchTerm}%`);
                         console.log(`Normalized text search. Comparing normalized filename with: %${normalizedSearchTerm}%`);
                     } else {
                         console.log("Search term provided but normalized to empty, skipping text search.");
                     }
                 }
            }


            // --- Quality Filter ---
            if (quality) {
                baseQuery += ` AND quality = $${paramIndex++}`;
                queryParams.push(quality);
                console.log(`Applying quality filter: ${quality}`);
            }

            // --- Type Filter (Assumes boolean 'is_series' column) ---
            if (type === 'movies') {
                 // IMPORTANT: Ensure 'is_series' column exists and is boolean
                baseQuery += ` AND is_series = FALSE`;
                console.log(`Applying type filter: movies`);
            } else if (type === 'series') {
                 // IMPORTANT: Ensure 'is_series' column exists and is boolean
                baseQuery += ` AND is_series = TRUE`;
                console.log(`Applying type filter: series`);
            }
        } // End if (!id)

        // --- Execute Database Queries ---
        console.log("Attempting to connect to database...");
        client = await pool.connect();
        console.log('Database client connected successfully.');

        // 1. Count Query (Only if not fetching by ID)
        let totalItems = 0; // Initialize to 0
        if (!id) {
            // IMPORTANT: Ensure 'movies' table name is correct
            const countSql = `SELECT COUNT(*) ${baseQuery}`;
            console.log('Executing Count SQL:', countSql, 'Params:', queryParams);
            const countResult = await client.query(countSql, queryParams);
            totalItems = parseInt(countResult.rows[0].count, 10);
            console.log('Total items found for query:', totalItems);
        } else {
             console.log("Skipping count query because fetching by specific ID.");
        }


        // 2. Data Query
        // IMPORTANT: Ensure 'movies' table name is correct
        // SELECT * is generally fine for moderate column counts, but consider specifying columns for performance/clarity
        dataSql = `SELECT * ${baseQuery}`;

        if (!id) {
            // Apply sorting and pagination only for list views
            // Add fallback sort by original_id for consistent ordering when primary sort values are equal
            dataSql += ` ORDER BY ${sortColumn} ${sortDirection}, original_id ${sortDirection}`;
            dataSql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
            queryParams.push(currentLimit, offset);
        } else {
            // When fetching by ID, limit to 1 and don't apply other sorting/pagination
            dataSql += ` ORDER BY last_updated_ts DESC LIMIT 1`; // Add a default order just in case, limit 1
        }

        console.log('Executing Data SQL:', dataSql, 'Params:', queryParams);
        const dataResult = await client.query(dataSql, queryParams);
        const items = dataResult.rows;
        console.log(`Fetched ${items.length} item(s).`);

        // Adjust totalItems if fetching by ID
        if (id) {
            totalItems = items.length; // Will be 0 or 1
        }

        // --- Format and Send JSON Response ---
        const totalPages = id ? 1 : (totalItems === 0 ? 0 : Math.ceil(totalItems / currentLimit)); // Handle totalItems=0 case
        console.log(`Responding with: totalItems=${totalItems}, currentPage=${currentPage}, totalPages=${totalPages}, limit=${id ? 1 : currentLimit}, fetchedItems=${items.length}`);

        response.setHeader('Content-Type', 'application/json');
        response.status(200).json({
            items: items,
            totalItems: totalItems,
            page: currentPage,
            totalPages: totalPages,
            limit: id ? 1 : currentLimit, // Limit is 1 if fetched by ID
            filters: { search, quality, type },
            sorting: { sort: sort, sortDir: sortDir } // Reflect actual sort used
        });

    } catch (error) {
        console.error('!!! API Database Error:', error);
        console.error("Failing SQL (approximate):", dataSql || "N/A"); // Log the data SQL query attempt
        console.error("Failing Params:", queryParams);
        // Check for specific common errors
        if (error.message && error.message.includes('last_updated_ts')) {
             console.error(">>> Potential issue with 'last_updated_ts' column. Check schema and naming. <<<");
        }
        if (error.message && error.message.includes('is_series')) {
             console.error(">>> Potential issue with 'is_series' column. Check schema and naming (should be BOOLEAN). <<<");
        }
         if (error.message && error.message.includes('original_id')) {
             console.error(">>> Potential issue with 'original_id' column. Check schema and naming. <<<");
        }
         if (error.message && error.message.includes('relation "movies" does not exist')) {
             console.error(">>> Table named 'movies' not found. Check table name. <<<");
        }


        response.status(500).json({
            error: 'Failed to fetch movie data from database.',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error. Check API logs.'
        });
    } finally {
        if (client) {
            client.release();
            console.log('Database client released.');
        } else {
             console.log('Database client was not acquired or already released.');
        }
    }
}
