// Use CommonJS require for built-in modules
const { spawn } = require('child_process');
const path = require('path');

// __dirname is automatically available in CommonJS modules, no need for import.meta

// Determine the path to the python executable (important for Vercel)
// Vercel typically provides python3
const pythonExecutable = process.env.VERCEL ? 'python3' : 'python'; // Adjust if needed

// Use the globally available __dirname to find the python script
const scriptPath = path.join(__dirname, 'hubcloud.py');

// Using export default is often handled correctly by Vercel for CJS serverless functions
export default async function handler(request, response) {
    // CORS Headers
    response.setHeader('Access-Control-Allow-Origin', '*'); // Adjust in production if needed
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        console.log("Handling OPTIONS request");
        return response.status(200).end();
    }

    if (request.method !== 'POST') {
        console.log(`Method ${request.method} received, expected POST`);
        response.setHeader('Allow', ['POST', 'OPTIONS']);
        return response.status(405).json({ success: false, error: `Method ${request.method} Not Allowed` });
    }

    console.log('Bypass API POST Request Received. Body:', request.body);

    const { hubcloudUrl } = request.body;

    if (!hubcloudUrl || typeof hubcloudUrl !== 'string') {
        console.error('Missing or invalid hubcloudUrl in request body');
        return response.status(400).json({ success: false, error: 'Missing or invalid hubcloudUrl in request body' });
    }

    try {
        console.log(`Attempting to bypass HubCloud URL: ${hubcloudUrl}`);
        console.log(`Executing: ${pythonExecutable} ${scriptPath} "${hubcloudUrl}"`);

        const pythonProcess = spawn(pythonExecutable, [scriptPath, hubcloudUrl]);

        let scriptOutput = '';
        let scriptError = '';

        pythonProcess.stdout.on('data', (data) => {
            const outputChunk = data.toString();
            scriptOutput += outputChunk;
            // Avoid excessive logging in production, but useful for debugging
            // console.log(`Python Script STDOUT Chunk: ${outputChunk}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            const errorChunk = data.toString();
            scriptError += errorChunk;
            // Log Python errors to Vercel logs
            console.error(`Python Script STDERR: ${errorChunk}`);
        });

        // Handle process exit
        pythonProcess.on('close', (code) => {
            console.log(`Python script finished with exit code ${code}`);

            if (code !== 0) {
                console.error(`Python script exited with non-zero code: ${code}.`);
                // Stderr content was already logged via the 'data' event handler
            }
             // Always try to parse the output, even if the exit code was non-zero,
             // as the Python script is designed to output JSON on error too.
            try {
                // Trim whitespace which might interfere with JSON parsing
                const trimmedOutput = scriptOutput.trim();
                if (!trimmedOutput) {
                     throw new Error("Python script produced no output.");
                }

                console.log("Attempting to parse Python script output:", trimmedOutput);
                const result = JSON.parse(trimmedOutput);

                if (result && result.success && result.finalUrl) {
                    console.log(`Bypass successful. Final URL: ${result.finalUrl}`);
                    return response.status(200).json({
                        success: true,
                        finalUrl: result.finalUrl,
                    });
                } else {
                    // Use error from JSON result if available, otherwise use stderr content
                    const errorMessage = result?.error || scriptError.trim() || 'Python script failed to return a final URL or specific error.';
                    console.error(`Bypass failed according to script output or exit code. Error: ${errorMessage}`);
                    return response.status(500).json({
                        success: false,
                        error: 'HubCloud bypass failed.',
                        details: errorMessage,
                        logs: result?.logs || [] // Include logs if the python script provided them
                    });
                }
            } catch (parseError) {
                console.error('Failed to parse Python script output as JSON:', parseError);
                console.error('Raw script stdout:', scriptOutput); // Log raw output for debugging
                console.error('Raw script stderr:', scriptError); // Log raw error output for debugging
                return response.status(500).json({
                    success: false,
                    error: 'Failed to process HubCloud bypass result.',
                    details: scriptError.trim() || 'Could not parse script output or script produced invalid JSON.',
                });
            }
        });

        // Handle potential errors during spawn itself
        pythonProcess.on('error', (spawnError) => {
            console.error('Failed to spawn Python script:', spawnError);
            return response.status(500).json({
                success: false,
                error: 'Failed to execute bypass script.',
                details: spawnError.message,
            });
        });

    } catch (error) {
        console.error('!!! API Bypass Error (Node.js handler level):', error);
        response.status(500).json({
            success: false,
            error: 'Internal server error during bypass process.',
            details: error.message,
        });
    }
}
