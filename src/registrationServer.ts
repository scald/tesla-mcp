/**
 * Tesla API Registration Server
 * 
 * This server handles the Tesla API registration process:
 * 1. Hosts the public key at /.well-known/appspecific/com.tesla.3p.public-key.pem
 * 2. Registers the application with the Tesla API
 */

import express, { Request, Response } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import ngrok from 'ngrok';

// For ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

// Configuration
const PORT = 4000; // Use a different port than the MCP server
const KEYS_DIR = path.join(__dirname, '../keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private-key.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public-key.pem');
const PUBLIC_KEY_ENDPOINT = '/.well-known/appspecific/com.tesla.3p.public-key.pem';

// Tesla API configuration
const BASE_URL = 'https://fleet-api.prd.na.vn.cloud.tesla.com'; // Change if needed for your region

const app = express();

// Ensure keys directory exists
if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
}

/**
 * Generate EC key pair if it doesn't exist
 */
async function generateKeyPair(): Promise<void> {
    if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
        console.log('Key pair already exists');
        return;
    }

    console.log('Generating EC key pair...');

    return new Promise<void>((resolve, reject) => {
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
 * Authorize with Tesla API and get access token
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
    } catch (error: any) {
        console.error('Error getting access token:', error.response?.data || error.message);
        throw new Error('Failed to get access token');
    }
}

/**
 * Register the application with Tesla API
 */
async function registerApplication(domain: string) {
    try {
        console.log(`Registering application with domain: ${domain}...`);
        const accessToken = await getAccessToken();

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
    } catch (error: any) {
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
async function checkPublicKeyRegistration(domain: string) {
    try {
        console.log(`Checking public key registration for domain: ${domain}...`);
        const accessToken = await getAccessToken();

        const response = await axios.get(`${BASE_URL}/api/1/partner_accounts/public_key?domain=${encodeURIComponent(domain)}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        console.log('Public key registration status:', response.data);
        return response.data;
    } catch (error: any) {
        console.error('Error checking public key registration:', error.response?.data || error.message);
        throw new Error('Failed to check public key registration');
    }
}

// Set up routes
app.get(PUBLIC_KEY_ENDPOINT, (req: Request, res: Response) => {
    console.log('Public key requested');
    if (fs.existsSync(PUBLIC_KEY_PATH)) {
        res.setHeader('Content-Type', 'application/x-pem-file');
        res.sendFile(PUBLIC_KEY_PATH);
    } else {
        res.status(404).send('Public key not found');
    }
});

app.get('/status', (req: Request, res: Response) => {
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

// Define the register route handler separately to resolve TypeScript error
const registerHandler = async (req: Request, res: Response) => {
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
    } catch (error: any) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

app.get('/register', registerHandler);

// Start server and ngrok
async function startServer() {
    await generateKeyPair();

    // Start the Express server
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });

    try {
        // Start ngrok and create a tunnel to the Express server
        const url = await ngrok.connect({
            addr: PORT,
            region: 'us' // Change if needed
        });

        console.log(`ngrok tunnel created: ${url}`);
        console.log(`Public key URL: ${url}${PUBLIC_KEY_ENDPOINT}`);

        // Store ngrok URL in environment for registration process
        process.env.NGROK_URL = url;

        console.log('\nRegister your application:');
        console.log('---------------------------');
        console.log('1. Go to the Tesla Developer Portal: https://developer.tesla.com');
        console.log('2. Update your application settings:');
        console.log(`   - Set Allowed Origin to: ${url}`);
        console.log('3. Once updated, open this URL in your browser to register:');
        console.log(`   ${url}/register`);

    } catch (error) {
        console.error('Error starting ngrok:', error);
    }
}

// Start the server
startServer(); 