/**
 * Utility script to obtain a Tesla API refresh token
 * Following the official Tesla Fleet API OAuth flow
 */

import axios from 'axios';
import dotenv from 'dotenv';
import * as http from 'http';
import { URL } from 'url';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as crypto from 'crypto';

// Get current file's directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

// Get environment variables
const clientId = process.env.TESLA_CLIENT_ID;
const clientSecret = process.env.TESLA_CLIENT_SECRET;

if (!clientId || !clientSecret) {
    console.error('Error: TESLA_CLIENT_ID and TESLA_CLIENT_SECRET must be set in .env file');
    process.exit(1);
}

// Constants
const AUTH_URL = 'https://auth.tesla.com/oauth2/v3';
const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = 'openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds';

// Generate PKCE code verifier and challenge
function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// Generate random state for security
const state = crypto.randomBytes(16).toString('base64url');
const codeVerifier = generateCodeVerifier();
const codeChallenge = generateCodeChallenge(codeVerifier);

// Authorization URL
const authUrl = `${AUTH_URL}/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPES)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

// Debug output
console.log('\n==== DEBUG INFO ====');
console.log('Client ID:', clientId);
console.log('Redirect URI:', REDIRECT_URI);
console.log('Code Verifier:', codeVerifier);
console.log('Code Challenge:', codeChallenge);
console.log('Full Auth URL:', authUrl);
console.log('====================\n');

// Open the browser for the user to authenticate
console.log('Opening browser for Tesla authentication...');
console.log('Please log in with your Tesla account when the browser opens.');
console.log('\nIf the browser doesn\'t open automatically, paste this URL into your browser:');
console.log(authUrl);

// Open the URL in the default browser
try {
    const command = process.platform === 'darwin' ? 'open' :
        process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${command} "${authUrl}"`);
} catch (error: any) {
    console.log('Failed to open browser automatically. Please open the URL manually.');
}

// Create a simple HTTP server to handle the callback
const server = http.createServer(async (req, res) => {
    if (!req.url) {
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    if (parsedUrl.pathname === '/callback') {
        const code = parsedUrl.searchParams.get('code');
        const error = parsedUrl.searchParams.get('error');
        const returnedState = parsedUrl.searchParams.get('state');

        // Close response with a success message
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
      <html>
        <body>
          <h1>Tesla API Authentication</h1>
          <p>You can close this window and return to your terminal.</p>
        </body>
      </html>
    `);

        // Handle errors
        if (error) {
            console.error(`Authentication error: ${error}`);
            server.close();
            process.exit(1);
        }

        // Verify state to prevent CSRF attacks
        if (returnedState !== state) {
            console.error('Error: State mismatch. Possible CSRF attack.');
            server.close();
            process.exit(1);
        }

        if (code) {
            try {
                console.log('\nExchanging authorization code for tokens...');

                // Create form data for the request
                const params = new URLSearchParams();
                params.append('grant_type', 'authorization_code');
                params.append('client_id', clientId);
                params.append('client_secret', clientSecret);
                params.append('code', code);
                params.append('code_verifier', codeVerifier);
                params.append('redirect_uri', REDIRECT_URI);

                // Exchange the code for tokens using form URL encoding
                const tokenResponse = await axios.post(`${AUTH_URL}/token`, params, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });

                const { access_token, refresh_token, expires_in } = tokenResponse.data;

                console.log('\nAuthentication successful!\n');
                console.log('Access Token:', access_token.substring(0, 20) + '...');
                console.log('Refresh Token:', refresh_token);
                console.log('Token expires in:', expires_in, 'seconds');
                console.log('\nThis refresh token does not expire unless revoked.');

                // Update the .env file with the refresh token
                try {
                    const envPath = path.resolve(process.cwd(), '.env');
                    let envContent = fs.readFileSync(envPath, 'utf8');

                    // Replace or add the refresh token
                    if (envContent.includes('TESLA_REFRESH_TOKEN=')) {
                        envContent = envContent.replace(
                            /TESLA_REFRESH_TOKEN=.*/,
                            `TESLA_REFRESH_TOKEN=${refresh_token}`
                        );
                    } else {
                        envContent += `\nTESLA_REFRESH_TOKEN=${refresh_token}\n`;
                    }

                    fs.writeFileSync(envPath, envContent);
                    console.log('\nThe refresh token has been saved to your .env file.');
                } catch (err) {
                    console.error('Failed to update .env file. Please update it manually with the refresh token above.');
                }

            } catch (error: any) {
                console.error('\nError exchanging authorization code for tokens:');
                if (error.response) {
                    console.error('Response status:', error.response.status);
                    console.error('Response data:', JSON.stringify(error.response.data, null, 2));

                    // Specific error handling for common issues
                    if (error.response.data && error.response.data.error === 'invalid_grant') {
                        console.error('\nThe authorization code is invalid or expired. Please try again.');
                    } else if (error.response.data && error.response.data.error === 'invalid_request') {
                        console.error('\nInvalid request. Check if the redirect_uri matches exactly what is configured in the Tesla Developer Console.');
                    }
                } else if (error.request) {
                    console.error('No response received from server:', error.request);
                } else {
                    console.error('Error message:', error.message);
                }
            }

            // Close the server
            server.close();
            process.exit(0);
        }
    }
});

// Attempt to start the server with error handling for port conflicts
function startServer() {
    server.on('error', (error: Error & { code?: string }) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`\nError: Port ${PORT} is already in use.`);
            console.error('The MCP server is likely running on this port.');
            console.error('Please stop the MCP server before running this script, or update your Tesla Developer Portal settings to use a different port.');
            process.exit(1);
        } else {
            console.error('Server error:', error);
            process.exit(1);
        }
    });

    // Start the server
    server.listen(PORT, () => {
        console.log(`\nListening for Tesla API callback on http://localhost:${PORT}`);
    });
}

startServer(); 