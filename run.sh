#!/bin/bash

echo "Tesla MCP Server Launcher"
echo "========================="

# Check if .env file exists
if [ ! -f .env ]; then
  echo "Error: .env file not found. Please create one with your Tesla API credentials."
  exit 1
fi

# Check if refresh token exists in .env
if ! grep -q "TESLA_REFRESH_TOKEN=" .env || grep -q "TESLA_REFRESH_TOKEN=your_refresh_token" .env; then
  echo "No valid refresh token found in .env file."
  echo "Would you like to get a refresh token now? (y/n)"
  read -r response
  if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo "Running token retrieval script..."
    pnpm get-token
  else
    echo "Please update your .env file with a valid TESLA_REFRESH_TOKEN."
    exit 1
  fi
fi

# Build the application
echo "Building Tesla MCP Server..."
pnpm build

# Run the server with the inspector
echo "Starting Tesla MCP Server with inspector..."
pnpm inspector 