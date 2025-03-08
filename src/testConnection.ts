/**
 * Test script to verify Tesla API connectivity
 * This script will attempt to connect to the Tesla API and list your vehicles
 */

import teslaService from './teslaService.js';

async function testConnection() {
    console.log('Testing Tesla API connection...');
    console.log('This will verify your client ID, client secret, and refresh token are working correctly.');

    try {
        console.log('\nAttempting to fetch vehicles...');
        const vehicles = await teslaService.getVehicles();

        console.log('\nSuccess! Connected to Tesla API.');
        console.log(`Found ${vehicles.length} vehicle(s):`);

        vehicles.forEach((vehicle, index) => {
            console.log(`\nVehicle ${index + 1}:`);
            console.log(`- ID: ${vehicle.id}`);
            console.log(`- VIN: ${vehicle.vin}`);
            console.log(`- Name: ${vehicle.display_name}`);
            console.log(`- State: ${vehicle.state}`);
        });

        console.log('\nYour Tesla API setup is working correctly!');
        console.log('You can now use the MCP server to control your Tesla vehicle(s).');

    } catch (error) {
        console.error('\nError connecting to Tesla API:');
        console.error(error);
        console.error('\nPlease check your credentials in the .env file:');
        console.error('1. Make sure TESLA_CLIENT_ID and TESLA_CLIENT_SECRET are correct');
        console.error('2. Make sure you have a valid TESLA_REFRESH_TOKEN');
        console.error('3. Run "pnpm get-token" to get a new refresh token if needed');
    }
}

testConnection(); 