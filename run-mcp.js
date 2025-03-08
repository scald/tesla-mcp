/**
 * Script to run the Tesla MCP server with environment variables from .env
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Get script's directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to load environment variables from multiple potential locations
const envPaths = [
    path.join(__dirname, '.env'),             // Same directory as script
    path.join(process.cwd(), '.env'),         // Current working directory
    path.join(__dirname, '../.env'),          // Parent directory
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
    console.error('Warning: No .env file found in any of the expected locations.');
    console.error('Expected paths:');
    envPaths.forEach(p => console.error(` - ${p}`));
}

// Path to the MCP server - relative to script location
const mcpServerPath = path.join(__dirname, 'build', 'index.js');
const altMcpServerPath = path.join(process.cwd(), 'build', 'index.js');

// Print environment variable status for debugging
console.error('Starting Tesla MCP Server with the following environment:');
console.error(`  TESLA_CLIENT_ID = ${process.env.TESLA_CLIENT_ID ? 'set' : 'NOT FOUND - WILL FAIL'}`);
console.error(`  TESLA_CLIENT_SECRET = ${process.env.TESLA_CLIENT_SECRET ? 'set' : 'NOT FOUND - WILL FAIL'}`);
console.error(`  TESLA_REFRESH_TOKEN = ${process.env.TESLA_REFRESH_TOKEN ? 'set' : 'NOT FOUND - WILL FAIL'}`);

// Check if the MCP server file exists
let serverPath = null;
if (fs.existsSync(mcpServerPath)) {
    serverPath = mcpServerPath;
} else if (fs.existsSync(altMcpServerPath)) {
    serverPath = altMcpServerPath;
}

if (!serverPath) {
    console.error(`Error: MCP server not found at either of these locations:`);
    console.error(` - ${mcpServerPath}`);
    console.error(` - ${altMcpServerPath}`);
    console.error(`Make sure to run "pnpm build" first and that the script is run from the correct directory.`);
    process.exit(1);
}

console.error(`Found MCP server at: ${serverPath}`);
console.error('MCP server is running. Press Ctrl+C to stop.');

// Run the MCP server
const child = spawn('node', [serverPath], {
    stdio: 'inherit',
    env: process.env
});

// Handle process exit
child.on('exit', (code) => {
    console.error(`MCP server exited with code ${code}`);
});

// Forward SIGINT and SIGTERM to child process
process.on('SIGINT', () => {
    child.kill('SIGINT');
});

process.on('SIGTERM', () => {
    child.kill('SIGTERM');
}); 