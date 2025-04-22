// Import necessary Node.js modules
import fs from 'fs';
import path from 'path';

// Define the path to your JSON data file relative to the project root
// Vercel runs functions from the project root, so this should work
const filePath = path.resolve('./data/movies.json');

// Export the serverless function handler
export default async function handler(request, response) {
    try {
        // Read the JSON file content synchronously
        // Using sync is okay here for Serverless Functions as they handle one request at a time
        // and it simplifies the code. For high-concurrency servers, async would be better.
        const jsonData = fs.readFileSync(filePath, 'utf-8');

        // Parse the JSON data
        const data = JSON.parse(jsonData);

        // Set CORS headers to allow requests from any origin (*)
        // You could restrict this to your actual domain in production for better security:
        // response.setHeader('Access-Control-Allow-Origin', 'https://your-deployed-domain.vercel.app');
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Handle potential OPTIONS pre-flight requests (required for CORS in some cases)
        if (request.method === 'OPTIONS') {
            return response.status(200).end();
        }

        // Set the content type to JSON
        response.setHeader('Content-Type', 'application/json');

        // Send the parsed data as the response with a 200 OK status
        response.status(200).json(data);

    } catch (error) {
        // Log the error to the Vercel function logs for debugging
        console.error('API Error:', error);

        // Determine the status code based on the error type
        let statusCode = 500; // Internal Server Error by default
        let errorMessage = 'Failed to load movie data.';

        if (error.code === 'ENOENT') {
            // File Not Found error
            statusCode = 404; // Not Found
            errorMessage = `Data file not found at ${filePath}. Ensure data/movies.json exists.`;
            console.error(`Specific Error: Could not find the file at ${filePath}`);
        } else if (error instanceof SyntaxError) {
            // JSON Parsing error
            statusCode = 500;
            errorMessage = 'Failed to parse movie data. Check if data/movies.json is valid JSON.';
            console.error(`Specific Error: Invalid JSON format in ${filePath}`);
        }

        // Send an error response back to the client
        response.status(statusCode).json({
            error: errorMessage,
            details: error.message // Include the original error message for more context
        });
    }
}