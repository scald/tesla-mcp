# Tesla MCP Server

A Model Context Protocol (MCP) server that connects to the Tesla Fleet API, allowing you to control your Tesla vehicle using Claude and other AI assistants that support MCP.

## Features

- **Wake up vehicles**: Wake up your Tesla from sleep mode
- **Vehicle information**: Get detailed information about your Tesla vehicles
- **Real-time updates**: Refresh vehicle data on demand
- **Debugging tools**: Access detailed vehicle information to help with troubleshooting

## Requirements

- Node.js 18+
- pnpm (preferred) or npm
- Tesla account with at least one vehicle
- Tesla API credentials (Client ID and Client Secret)
- Ngrok (for development and registration)

## Security Best Practices

This project handles sensitive Tesla API credentials. Please follow these security practices:

- **Never commit credentials**: The `.gitignore` file excludes `.env` and `keys/` but always double-check
- **Use the security checker**: Run `./check-secrets.sh` before committing to detect potentially leaked credentials
- **Protect your private keys**: Keep the contents of the `keys/` directory secure
- **Review code before sharing**: Make sure no credentials are hardcoded in any source files

When forking or sharing this project:

1. Make sure the `.env` file is not included
2. Check that no private keys are committed
3. Verify the `.gitignore` file is properly set up

## Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/tesla-mcp-server.git
   cd tesla-mcp-server
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:

   ```
   TESLA_CLIENT_ID=your_client_id
   TESLA_CLIENT_SECRET=your_client_secret
   TESLA_REFRESH_TOKEN=your_refresh_token
   ```

4. **Get a refresh token** (if you don't have one)

   ```bash
   pnpm get-token
   ```

5. **Register your application** with Tesla's API

   ```bash
   pnpm register
   ```

   Follow the instructions provided by the script

6. **Build the server**

   ```bash
   pnpm build
   ```

7. **Run the server**
   ```bash
   pnpm start
   ```

## Authentication & Registration

This project uses the official Tesla Fleet API OAuth 2.0 authentication flow to securely connect to your Tesla account. The full process involves two steps:

1. **Authentication**: Obtaining a refresh token through the OAuth 2.0 flow
2. **Registration**: Registering your application with Tesla via the Partner Accounts API

### Authentication

Authentication requires:

- Client ID and Client Secret from the [Tesla Developer Portal](https://developer.tesla.com/)
- A refresh token obtained through the OAuth 2.0 authorization code flow

The included `pnpm get-token` utility simplifies this process by:

- Opening a browser for you to log in with your Tesla account credentials
- Performing the OAuth PKCE (Proof Key for Code Exchange) flow
- Exchanging the authorization code for refresh and access tokens
- Storing the refresh token in your `.env` file

### Registration

The Tesla Fleet API requires applications to be registered before they can access vehicle data. The registration server (`pnpm register`) automates this process:

- Generates the required EC key pair
- Uses ngrok to create a temporary public URL for development
- Hosts the public key at the required path
- Handles the registration API call with Tesla

#### Ngrok Setup (Required for Registration)

1. Install ngrok from [ngrok.com/download](https://ngrok.com/download)
2. Create a free account at [ngrok.com](https://ngrok.com/)
3. Get your auth token from the [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken)
4. Authenticate ngrok:
   ```bash
   ngrok authtoken YOUR_AUTH_TOKEN
   ```

## Available MCP Tools

The server provides the following tools that Claude can use:

- **`wake_up`**: Wakes up a Tesla vehicle from sleep mode

  - Takes `vehicle_id` as a required parameter
  - Returns the current state of the vehicle

- **`refresh_vehicles`**: Refreshes the list of Tesla vehicles

  - No parameters required
  - Updates the internal cache of vehicles

- **`debug_vehicles`**: Shows detailed information about available vehicles
  - No parameters required
  - Returns ID, vehicle_id, VIN, and state information

## Setting Up Claude to Use the MCP Server

1. Create the Claude configuration directory:

   ```bash
   mkdir -p ~/Library/Application\ Support/Claude
   ```

2. Create or edit the configuration file:

   ```bash
   nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

3. Add the following configuration (adjust the path as needed):

   ```json
   {
     "mcpServers": {
       "tesla-mcp-server": {
         "command": "/absolute/path/to/tesla-mcp-server/run-mcp.js"
       }
     }
   }
   ```

4. Make the run-mcp.js script executable:

   ```bash
   chmod +x run-mcp.js
   ```

5. Restart Claude completely

## Using the MCP Server with Claude

Once the server is running and Claude is configured, you can ask Claude to:

- "What Tesla vehicles do I have?"
- "Can you wake up my Tesla?"
- "Show me debug information about my Tesla vehicles"

## Troubleshooting

If you encounter issues:

### Environment Variables

- Ensure your `.env` file contains valid credentials
- Run `pnpm get-token` to refresh your token if needed

### Server Connection

- Check that the server is running (`pnpm start`)
- Verify Claude's configuration points to the correct file path

### Vehicle Connectivity

- Vehicle might be offline or asleep
- Try waking up the vehicle first with the `wake_up` command

### Debug Mode

- Use the `debug_vehicles` command to get detailed information about your vehicles
- Check the server logs in the terminal where you're running the MCP server

## Command Line Tools

The server includes several helpful scripts:

- `pnpm build`: Compile the TypeScript code
- `pnpm start`: Run the server using the run-mcp.js script
- `pnpm register`: Register your app with Tesla's API
- `pnpm get-token`: Get a refresh token from Tesla
- `pnpm test-api`: Test your connection to the Tesla API
- `pnpm inspector`: Run the server with the MCP Inspector for debugging

## API Limitations

As of 2023-10-09, Tesla has deprecated many vehicle command endpoints in their REST API. Commands like honking the horn now require the [Tesla Vehicle Command Protocol](https://github.com/teslamotors/vehicle-command) instead of the REST API. This MCP server currently supports only REST API endpoints that remain functional.

## Future Enhancements

Possible future improvements include:

- Integration with Tesla's Vehicle Command Protocol for additional commands
- Support for more vehicle information endpoints
- User interface for configuration and monitoring

## License

[MIT License](LICENSE)
