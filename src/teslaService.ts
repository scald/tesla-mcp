/**
 * Tesla Fleet API service
 * A service for connecting to and interacting with the Tesla Fleet API
 * Based on documentation at: https://developer.tesla.com/docs/fleet-api
 */

import axios from 'axios';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// For ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from different potential locations
const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '../.env'),
    path.join(__dirname, '../../.env'),
];

let envLoaded = false;
for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        console.error(`Loading environment from ${envPath}`);
        dotenv.config({ path: envPath });
        envLoaded = true;
        break;
    }
}

if (!envLoaded) {
    console.error('Warning: No .env file found. Environment variables must be set manually.');
}

// Print environment variable status for debugging (to stderr so it doesn't interfere with MCP)
console.error(`Environment check: TESLA_CLIENT_ID=${process.env.TESLA_CLIENT_ID ? 'set' : 'not set'}, TESLA_CLIENT_SECRET=${process.env.TESLA_CLIENT_SECRET ? 'set' : 'not set'}, TESLA_REFRESH_TOKEN=${process.env.TESLA_REFRESH_TOKEN ? 'set' : 'not set'}`);

// Paths to keys
const KEYS_DIR = path.join(__dirname, '../keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private-key.pem');

// API constants - choose the appropriate endpoint based on your region
const BASE_URLS = {
    'NA': 'https://fleet-api.prd.na.vn.cloud.tesla.com', // North America, Asia-Pacific (excluding China)
    'EU': 'https://fleet-api.prd.eu.vn.cloud.tesla.com', // Europe, Middle East, Africa
    'CN': 'https://fleet-api.prd.cn.vn.cloud.tesla.cn'   // China
};
const BASE_URL = BASE_URLS.NA; // Default to North America
const AUTH_URL = 'https://auth.tesla.com/oauth2/v3/token';

// Types
export interface Vehicle {
    id: string;
    vin: string;
    display_name: string;
    state: string;
    vehicle_id: number;
    [key: string]: any;
}

export interface VehicleData {
    id: string;
    vehicle_id: number;
    vin: string;
    [key: string]: any;
}

// Check registration status
function isAppRegistered(): boolean {
    return fs.existsSync(PRIVATE_KEY_PATH);
}

// Tesla API Service class
export class TeslaService {
    private accessToken: string | null = null;
    private tokenExpiration: number = 0;
    private isRegistered: boolean = false;

    constructor() {
        this.isRegistered = isAppRegistered();
        if (!this.isRegistered) {
            // We'll use a specific error instead of console.warn
            console.error('Warning: Application does not appear to be registered with Tesla API');
            console.error('Run "pnpm register" to complete the registration process');
        }
    }

    /**
     * Authorize with the Tesla API using the refresh token
     * Following the official OAuth flow from Tesla's documentation
     */
    private async authorize(): Promise<void> {
        try {
            // Get credentials from environment
            const clientId = process.env.TESLA_CLIENT_ID;
            const clientSecret = process.env.TESLA_CLIENT_SECRET;
            const refreshToken = process.env.TESLA_REFRESH_TOKEN;

            // Validate credentials
            if (!clientId) {
                throw new Error('TESLA_CLIENT_ID is not set in environment variables');
            }
            if (!clientSecret) {
                throw new Error('TESLA_CLIENT_SECRET is not set in environment variables');
            }
            if (!refreshToken) {
                throw new Error('TESLA_REFRESH_TOKEN is not set in environment variables');
            }

            // Create form data
            const params = new URLSearchParams();
            params.append('grant_type', 'refresh_token');
            params.append('client_id', clientId);
            params.append('client_secret', clientSecret);
            params.append('refresh_token', refreshToken);
            params.append('scope', 'openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds');

            const response = await axios.post(AUTH_URL, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            this.accessToken = response.data.access_token;
            // Set token expiration (token is valid for response.data.expires_in seconds)
            this.tokenExpiration = Date.now() + (response.data.expires_in * 1000);
        } catch (error: any) {
            // Simplify error logging to avoid interfering with JSON
            const errorDetails = error.response?.data || error.message;
            throw new Error(`Failed to authorize with Tesla API: ${JSON.stringify(errorDetails)}`);
        }
    }

    /**
     * Get access token, refreshing if necessary
     */
    private async getAccessToken(): Promise<string> {
        console.error(`[DEBUG] Getting access token. Current status: ${this.accessToken ? 'token exists' : 'no token'}, expired: ${Date.now() >= this.tokenExpiration}`);

        // If token is not set or is expired, refresh it
        if (!this.accessToken || Date.now() >= this.tokenExpiration) {
            console.error(`[DEBUG] Token needs refresh, calling authorize()`);
            await this.authorize();
        }

        if (!this.accessToken) {
            console.error(`[DEBUG] Critical error: Still no access token after authorize()`);
            throw new Error('Could not obtain access token');
        }

        console.error(`[DEBUG] Returning access token (first 5 chars: ${this.accessToken.substring(0, 5)}...)`);
        return this.accessToken;
    }

    /**
     * Get list of vehicles
     */
    async getVehicles(): Promise<Vehicle[]> {
        const token = await this.getAccessToken();

        try {
            if (!this.isRegistered) {
                throw new Error('Application is not registered with Tesla API. Run "pnpm register" to complete the registration process');
            }

            const response = await axios.get(`${BASE_URL}/api/1/vehicles`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            return response.data.response || [];
        } catch (error: any) {
            // Simplify error handling
            throw new Error('Failed to fetch vehicles');
        }
    }

    /**
     * Wake up a vehicle
     * This is often needed before sending commands to a vehicle that is asleep
     */
    async wakeUp(vehicleId: string): Promise<Vehicle> {
        console.error(`[DEBUG] Starting wakeUp for vehicle ${vehicleId}`);
        const token = await this.getAccessToken();
        console.error(`[DEBUG] Got access token for wakeUp (length: ${token.length})`);

        try {
            if (!this.isRegistered) {
                console.error(`[DEBUG] Error: Application is not registered with Tesla API`);
                throw new Error('Application is not registered with Tesla API. Run "pnpm register" to complete the registration process');
            }

            const wakeUpUrl = `${BASE_URL}/api/1/vehicles/${vehicleId}/wake_up`;
            console.error(`[DEBUG] Sending wake_up request to URL: ${wakeUpUrl}`);

            try {
                const response = await axios.post(wakeUpUrl, {}, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });

                console.error(`[DEBUG] Wake up response status: ${response.status}`);
                if (response.data && response.data.response) {
                    console.error(`[DEBUG] Vehicle state after wake_up: ${response.data.response.state}`);
                } else {
                    console.error(`[DEBUG] Unexpected response format: ${JSON.stringify(response.data)}`);
                }

                return response.data.response;
            } catch (axiosError: any) {
                console.error(`[DEBUG] Axios error in wake_up request: ${axiosError.message}`);
                if (axiosError.response) {
                    console.error(`[DEBUG] Response status: ${axiosError.response.status}`);
                    console.error(`[DEBUG] Response data: ${JSON.stringify(axiosError.response.data, null, 2)}`);
                }
                throw axiosError;
            }
        } catch (error: any) {
            console.error(`[DEBUG] Error in wakeUp: ${error.message}`);
            throw new Error(`Failed to wake up vehicle: ${error.message}`);
        }
    }
}

// Create and export default instance
const teslaService = new TeslaService();
export default teslaService; 