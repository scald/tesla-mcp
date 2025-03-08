/**
 * Tesla API Registration Server (JavaScript version)
 * 
 * This server handles the Tesla API registration process:
 * 1. Hosts the public key at /.well-known/appspecific/com.tesla.3p.public-key.pem
 * 2. Registers the application with the Tesla API
 */

import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import readline from 'readline';

// For ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

// Configuration
let PORT = 4000; // Default port, but we'll try others if it's in use
const PORTS_TO_TRY = [4000, 4001, 4002, 4003, 4004]; // Try these ports in order
const KEYS_DIR = path.join(__dirname, '../keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private-key.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public-key.pem');
const PUBLIC_KEY_ENDPOINT = '/.well-known/appspecific/com.tesla.3p.public-key.pem';

// Tesla API configuration
const BASE_URL = 'https://fleet-api.prd.na.vn.cloud.tesla.com'; // Change if needed for your region
const AUTH_URL = 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token';

const app = express();

// Ensure keys directory exists
if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
}

/**
 * Generate EC key pair if it doesn't exist
 */
async function generateKeyPair() {
    if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
        console.log('Key pair already exists');
        return;
    }

    console.log('Generating EC key pair...');

    return new Promise((resolve, reject) => {
        exec(`openssl ecparam -name prime256v1 -genkey -noout -out ${PRIVATE_KEY_PATH}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error generating private key: ${error.message}`);
                reject(error);
                return;
            }

            if (stderr && !stderr.includes('Generating EC parameters')) {
                console.error(`stderr: ${stderr}`);
            }

            // Generate public key from private key
            exec(`openssl ec -in ${PRIVATE_KEY_PATH} -pubout -out ${PUBLIC_KEY_PATH}`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error generating public key: ${error.message}`);
                    reject(error);
                    return;
                }

                if (stderr && !stderr.includes('read EC key')) {
                    console.error(`stderr: ${stderr}`);
                }

                console.log('Successfully generated key pair');
                resolve();
            });
        });
    });
}

/**
 * Get a partner authentication token (for registration)
 * This is different from the normal access token used for API access
 */
async function getPartnerAuthToken() {
    try {
        console.log('Getting Tesla Partner Authentication Token...');
        const clientId = process.env.TESLA_CLIENT_ID;
        const clientSecret = process.env.TESLA_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            throw new Error('Missing required environment variables');
        }

        // Create form data
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);
        params.append('audience', BASE_URL);
        params.append('scope', 'openid vehicle_device_data vehicle_cmds vehicle_charging_cmds');

        const response = await axios.post(AUTH_URL, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log('Successfully obtained partner authentication token');
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting partner authentication token:', error.response?.data || error.message);
        throw new Error('Failed to get partner authentication token');
    }
}

/**
 * Authorize with Tesla API and get access token for general API use
 */
async function getAccessToken() {
    try {
        console.log('Getting Tesla API access token...');
        const clientId = process.env.TESLA_CLIENT_ID;
        const clientSecret = process.env.TESLA_CLIENT_SECRET;
        const refreshToken = process.env.TESLA_REFRESH_TOKEN;

        if (!clientId || !clientSecret || !refreshToken) {
            throw new Error('Missing required environment variables');
        }

        // Create form data
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);
        params.append('refresh_token', refreshToken);
        params.append('scope', 'openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds');

        const response = await axios.post('https://auth.tesla.com/oauth2/v3/token', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log('Successfully obtained access token');
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting access token:', error.response?.data || error.message);
        throw new Error('Failed to get access token');
    }
}

/**
 * Register the application with Tesla API
 */
async function registerApplication(domain) {
    try {
        console.log(`Registering application with domain: ${domain}...`);

        // For registration, we need a partner authentication token, not the regular access token
        const accessToken = await getPartnerAuthToken();

        const response = await axios.post(`${BASE_URL}/api/1/partner_accounts`,
            { domain },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('Application registered successfully with Tesla API!');
        console.log('Response:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error registering application:', error.response?.data || error.message);

        // Special handling for the "already registered" case which is not really an error
        if (error.response?.data?.error?.message?.includes('already registered')) {
            console.log('Application is already registered (this is not an error)');
            return { status: 'already_registered' };
        }

        throw new Error('Failed to register application');
    }
}

/**
 * Check if the public key is properly registered
 */
async function checkPublicKeyRegistration(domain) {
    try {
        console.log(`Checking public key registration for domain: ${domain}...`);

        // For registration-related endpoints, we need a partner authentication token
        const accessToken = await getPartnerAuthToken();

        const response = await axios.get(`${BASE_URL}/api/1/partner_accounts/public_key?domain=${encodeURIComponent(domain)}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        console.log('Public key registration status:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error checking public key registration:', error.response?.data || error.message);
        throw new Error('Failed to check public key registration');
    }
}

// Set up routes
app.get(PUBLIC_KEY_ENDPOINT, (req, res) => {
    console.log('Public key requested');
    if (fs.existsSync(PUBLIC_KEY_PATH)) {
        res.setHeader('Content-Type', 'application/x-pem-file');
        res.sendFile(PUBLIC_KEY_PATH);
    } else {
        res.status(404).send('Public key not found');
    }
});

app.get('/status', (req, res) => {
    res.json({
        status: 'OK',
        keys: {
            privateKeyExists: fs.existsSync(PRIVATE_KEY_PATH),
            publicKeyExists: fs.existsSync(PUBLIC_KEY_PATH)
        },
        env: {
            clientIdExists: !!process.env.TESLA_CLIENT_ID,
            clientSecretExists: !!process.env.TESLA_CLIENT_SECRET,
            refreshTokenExists: !!process.env.TESLA_REFRESH_TOKEN
        }
    });
});

app.get('/register', async (req, res) => {
    try {
        const ngrokUrl = process.env.NGROK_URL;
        if (!ngrokUrl) {
            return res.status(400).json({ error: 'NGROK_URL environment variable not set' });
        }

        const domain = new URL(ngrokUrl).hostname;

        // First check the public key registration
        const checkResult = await checkPublicKeyRegistration(domain).catch(() => null);

        // If public key is already registered, no need to register again
        if (checkResult && checkResult.public_key) {
            return res.json({
                status: 'already_registered',
                message: 'Application is already registered with Tesla API',
                details: checkResult
            });
        }

        // Register the application
        const result = await registerApplication(domain);
        res.json({
            status: 'success',
            message: 'Application registered successfully with Tesla API',
            details: result
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Function to create readline interface
function createReadlineInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

// Start server and ngrok
async function startServer() {
    await generateKeyPair();

    // Try different ports
    let server;
    let portIndex = 0;

    while (portIndex < PORTS_TO_TRY.length) {
        PORT = PORTS_TO_TRY[portIndex];
        try {
            server = app.listen(PORT);
            console.log(`Server running on http://localhost:${PORT}`);
            break; // Successfully started server
        } catch (error) {
            if (error.code === 'EADDRINUSE') {
                console.log(`Port ${PORT} is already in use, trying next port...`);
                portIndex++;
            } else {
                // Some other error
                console.error('Error starting server:', error);
                process.exit(1);
            }
        }
    }

    if (!server) {
        console.error('Could not find an available port. Please free up one of these ports and try again:', PORTS_TO_TRY);
        process.exit(1);
    }

    try {
        // Instructions for running ngrok manually
        console.log('\n=========== IMPORTANT: MANUAL STEPS REQUIRED ===========');
        console.log('Please open a new terminal window and run this command:');
        console.log(`ngrok http ${PORT}`);
        console.log('\nAfter running the command:');
        console.log('1. Leave that terminal open');
        console.log('2. Check the ngrok interface at http://localhost:4040');
        console.log('3. Copy the https URL from the ngrok interface');
        console.log('=========================================================\n');

        // Ask the user for the ngrok URL
        const rl = createReadlineInterface();

        const url = await new Promise(resolve => {
            rl.question('\nPlease paste the ngrok https URL here: ', answer => {
                rl.close();
                resolve(answer.trim());
            });
        });

        if (!url || !url.startsWith('https://')) {
            console.error('Invalid URL provided. Please start again and provide a valid HTTPS URL.');
            process.exit(1);
        }

        console.log(`\nUsing URL: ${url}`);
        console.log(`Public key URL: ${url}${PUBLIC_KEY_ENDPOINT}`);

        // Store ngrok URL in environment for registration process
        process.env.NGROK_URL = url;

        console.log('\nUpdate your Tesla Developer Portal settings:');
        console.log('---------------------------');
        console.log('1. Go to the Tesla Developer Portal: https://developer.tesla.com');
        console.log('2. Update your application settings:');
        console.log(`   - Set Allowed Origin to: ${url}`);
        console.log(`   - Set Allowed Redirect URI to: ${url}/callback`);

        // Ask if the user has updated the settings
        const rl2 = createReadlineInterface();

        await new Promise(resolve => {
            rl2.question('\nHave you updated your Tesla Developer Portal settings? (Press enter to continue) ', () => {
                rl2.close();
                resolve();
            });
        });

        // Try to access the registration endpoint
        const domain = new URL(url).hostname;

        // First check if the application is already registered
        console.log('\nChecking if application is already registered...');
        let isRegistered = false;

        try {
            const checkResult = await checkPublicKeyRegistration(domain);
            if (checkResult && checkResult.public_key) {
                console.log('Application is already registered with Tesla API');
                isRegistered = true;
            }
        } catch (error) {
            console.log('Application not yet registered or error checking registration.');
        }

        if (!isRegistered) {
            console.log('\nRegistering application with Tesla API...');
            try {
                const result = await registerApplication(domain);
                console.log('Registration result:', result);
                console.log('\nApplication registered successfully!');
            } catch (error) {
                console.error('Error registering application:', error.message);
                console.error('Please check that:');
                console.error('1. Your Tesla API credentials are correct');
                console.error('2. Your public key is accessible at the well-known URL');
                console.error(`3. The domain in your Tesla Developer Portal matches the ngrok domain (${domain})`);
            }
        }

        console.log('\nSetup complete! You can now test your connection:');
        console.log('pnpm test-api');

        console.log('\nKeeping the registration server running for tests. Press Ctrl+C to exit.');
        console.log('IMPORTANT: Remember to keep both this terminal and the ngrok terminal open for testing.');

        // Keep the process running until manually terminated
        await new Promise(() => { }); // Never resolves

    } catch (error) {
        console.error('Error:', error);

        // Clean up the server
        if (server) {
            server.close();
        }
    }
}

// Start the server
startServer(); 