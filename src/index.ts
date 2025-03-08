#!/usr/bin/env node

/**
 * Tesla MCP Server
 * A Model Context Protocol server that connects to the Tesla Fleet API
 * and allows controlling Tesla vehicles through AI assistants.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import teslaService, { Vehicle } from "./teslaService.js";

/**
 * Cache for Tesla vehicles to avoid repeated API calls
 */
let vehiclesCache: Vehicle[] = [];
let lastVehicleFetch: number = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Check if vehicles cache needs refreshing and update if necessary
 */
async function getVehicles(forceRefresh = false): Promise<Vehicle[]> {
  const now = Date.now();

  if (forceRefresh || vehiclesCache.length === 0 || (now - lastVehicleFetch) > CACHE_TTL) {
    try {
      vehiclesCache = await teslaService.getVehicles();
      lastVehicleFetch = now;
    } catch (error) {
      console.error("Error fetching vehicles:", error);
      // Return empty array if error, but don't update last fetch time
      if (vehiclesCache.length === 0) {
        return [];
      }
    }
  }

  return vehiclesCache;
}

/**
 * Create an MCP server with capabilities for resources (to list/view vehicles),
 * tools (to control vehicles), and prompts.
 */
const server = new Server(
  {
    name: "tesla-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  }
);

/**
 * Handler for listing available vehicles as resources.
 * Each vehicle is exposed as a resource with:
 * - A tesla:// URI scheme
 * - JSON MIME type
 * - Vehicle display name and VIN
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const vehicles = await getVehicles();

  return {
    resources: vehicles.map((vehicle) => ({
      uri: `tesla://${vehicle.id}`,
      mimeType: "application/json",
      name: vehicle.display_name || `Tesla (${vehicle.vin})`,
      description: `Tesla vehicle: ${vehicle.display_name || 'Unknown'} (VIN: ${vehicle.vin})`
    }))
  };
});

/**
 * Handler for reading the details of a specific vehicle.
 * Takes a tesla:// URI and returns the vehicle data as JSON.
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const url = new URL(request.params.uri);
  const vehicleId = url.hostname;
  const vehicles = await getVehicles();

  const vehicle = vehicles.find(v => v.id === vehicleId);

  if (!vehicle) {
    throw new Error(`Vehicle ${vehicleId} not found`);
  }

  return {
    contents: [{
      uri: request.params.uri,
      mimeType: "application/json",
      text: JSON.stringify(vehicle, null, 2)
    }]
  };
});

/**
 * Handler that lists available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const vehicles = await getVehicles();

  if (vehicles.length === 0) {
    return {
      tools: []
    };
  }

  return {
    tools: [
      {
        name: "wake_up",
        description: "Wake up your Tesla vehicle from sleep mode",
        inputSchema: {
          type: "object",
          properties: {
            vehicle_id: {
              type: "string",
              description: "Tag of the vehicle to wake up (can be id, vehicle_id, or vin)"
            }
          },
          required: ["vehicle_id"]
        }
      },
      {
        name: "refresh_vehicles",
        description: "Refresh the list of Tesla vehicles",
        inputSchema: {
          type: "object",
          properties: {
            random_string: {
              type: "string",
              description: "Dummy parameter for no-parameter tools"
            }
          },
          required: ["random_string"]
        }
      },
      {
        name: "debug_vehicles",
        description: "Show debug information about available vehicles",
        inputSchema: {
          type: "object",
          properties: {
            random_string: {
              type: "string",
              description: "Dummy parameter for no-parameter tools"
            }
          },
          required: ["random_string"]
        }
      }
    ]
  };
});

/**
 * Handler for the vehicle control tools.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "wake_up": {
      const vehicleId = String(request.params.arguments?.vehicle_id);
      if (!vehicleId) {
        throw new Error("Vehicle ID is required");
      }

      // Validate the vehicle ID exists
      const vehicles = await getVehicles();
      const vehicle = vehicles.find(v =>
        String(v.id) === vehicleId ||
        String(v.vehicle_id) === vehicleId ||
        String(v.vin) === vehicleId
      );

      if (!vehicle) {
        throw new Error(`Vehicle ${vehicleId} not found`);
      }

      try {
        const result = await teslaService.wakeUp(vehicleId);

        return {
          content: [{
            type: "text",
            text: result
              ? `Successfully woke up ${vehicle.display_name || 'your Tesla'} (state: ${result.state})`
              : `Failed to wake up ${vehicle.display_name || 'your Tesla'}`
          }]
        };
      } catch (error) {
        throw new Error(`Failed to wake up vehicle: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    case "refresh_vehicles": {
      await getVehicles(true);

      return {
        content: [{
          type: "text",
          text: `Successfully refreshed the vehicle list. Found ${vehiclesCache.length} vehicles.`
        }]
      };
    }

    case "debug_vehicles": {
      const vehicles = await getVehicles();

      if (vehicles.length === 0) {
        return {
          content: [{
            type: "text",
            text: "No vehicles found. Make sure your Tesla account is properly connected."
          }]
        };
      }

      const debugInfo = vehicles.map(v => {
        return `Vehicle: ${v.display_name || 'Tesla'}\n` +
          `- id: ${v.id}\n` +
          `- vehicle_id: ${v.vehicle_id}\n` +
          `- vin: ${v.vin}\n` +
          `- state: ${v.state}`;
      }).join('\n\n');

      return {
        content: [{
          type: "text",
          text: `Found ${vehicles.length} vehicles:\n\n${debugInfo}`
        }]
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});

/**
 * Handler that lists available prompts.
 * Exposes a prompt to get information about all Tesla vehicles.
 */
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "summarize_vehicles",
        description: "Get information about your Tesla vehicles",
      }
    ]
  };
});

/**
 * Handler for the summarize_vehicles prompt.
 * Returns a prompt that includes all vehicle information embedded as resources.
 */
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name !== "summarize_vehicles") {
    throw new Error("Unknown prompt");
  }

  const vehicles = await getVehicles();

  if (vehicles.length === 0) {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "I don't have any Tesla vehicles connected. Please make sure you've set up your Tesla API credentials correctly in the .env file."
          }
        }
      ]
    };
  }

  const embeddedVehicles = vehicles.map(vehicle => ({
    type: "resource" as const,
    resource: {
      uri: `tesla://${vehicle.id}`,
      mimeType: "application/json",
      text: JSON.stringify(vehicle, null, 2)
    }
  }));

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "Here is the information about my Tesla vehicles:"
        }
      },
      ...embeddedVehicles.map(vehicle => ({
        role: "user" as const,
        content: vehicle
      })),
      {
        role: "user",
        content: {
          type: "text",
          text: "Please provide a summary of all my Tesla vehicles including their names, battery levels, and current state (online/offline/asleep)."
        }
      }
    ]
  };
});

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  try {
    // Preload vehicles on startup to catch any auth errors early
    await getVehicles();
    // Don't log this to stdout as it interferes with MCP protocol
    // console.error("Successfully connected to Tesla API");
  } catch (error) {
    // Use stderr instead of stdout for error messages
    console.error("Warning: Failed to connect to Tesla API on startup. Please check your credentials.");
    // Don't include the full error as it might contain sensitive information
    // console.error(error);
    // Continue anyway, since credentials might be updated later
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  // Log to stderr, not stdout
  console.error("Server error:", error);
  process.exit(1);
});
