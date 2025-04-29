// api/bypass-hubcloud.js
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Helper to get the directory name in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine the path to the python executable (important for Vercel)
// Vercel typically provides python3
const pythonExecutable = process.env.VERCEL ? 'python3' : 'python'; // Adjust if needed
const scriptPath = path.join(__dirname, 'hubcloud.py');

export default async function handler(request, response) {
    // CORS Headers
    response.setHeader('Access-Control-Allow-Origin', '*'); // Adjust in production
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    if (request.method !== 'POST') {
        response.setHeader('Allow', ['POST', 'OPTIONS']);
        return response.status(405).json({ success: false, error: `Method ${request.method} Not Allowed` });
    }

    console.log('Bypass API Request Received. Body:', request.body);

    const { hubcloudUrl } = request.body;

    if (!hubcloudUrl || typeof hubcloudUrl !== 'string') {
        return response.status(400).json({ success: false, error: 'Missing or invalid hubcloudUrl in request body' });
    }

    try {
        console.log(`Attempting to bypass HubCloud URL: ${hubcloudUrl}`);
        console.log(`Executing: ${pythonExecutable} ${scriptPath} "${hubcloudUrl}"`);

        const pythonProcess = spawn(pythonExecutable, [scriptPath, hubcloudUrl]);

        let scriptOutput = '';
        let scriptError = '';

        pythonProcess.stdout.on('data', (data) => {
            scriptOutput += data.toString();
            console.log(`Python Script STDOUT: ${data}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            scriptError += data.toString();
            console.error(`Python Script STDERR: ${data}`);
        });

        // Handle process exit
        pythonProcess.on('close', (code) => {
            console.log(`Python script finished with code ${code}`);
            if (code !== 0) {
                console.error(`Python script exited with non-zero code: ${code}`);
                // Try to parse output anyway, it might contain a JSON error
            }

            try {
                // Important: Python script should ONLY print the final JSON to stdout
                const result = JSON.parse(scriptOutput.trim());

                if (result && result.success && result.finalUrl) {
                    console.log(`Bypass successful. Final URL: ${result.finalUrl}`);
                    return response.status(200).json({
                        success: true,
                        finalUrl: result.finalUrl,
                    });
                } else {
                    const errorMessage = result?.error || scriptError || 'Python script failed to return a final URL.';
                    console.error(`Bypass failed: ${errorMessage}`);
                    return response.status(500).json({
                        success: false,
                        error: 'HubCloud bypass failed.',
                        details: errorMessage,
                        // logs: result?.logs || [] // Optional: include logs in response for debugging
                    });
                }
            } catch (parseError) {
                console.error('Failed to parse Python script output:', parseError);
                console.error('Raw script output:', scriptOutput);
                console.error('Raw script error:', scriptError);
                return response.status(500).json({
                    success: false,
                    error: 'Failed to process HubCloud bypass result.',
                    details: scriptError || 'Could not parse script output.',
                });
            }
        });

        // Handle potential errors during spawn
        pythonProcess.on('error', (spawnError) => {
            console.error('Failed to spawn Python script:', spawnError);
            return response.status(500).json({
                success: false,
                error: 'Failed to execute bypass script.',
                details: spawnError.message,
            });
        });

    } catch (error) {
        console.error('!!! API Bypass Error (Node.js):', error);
        response.status(500).json({
            success: false,
            error: 'Internal server error during bypass process.',
            details: error.message,
        });
    }
}
