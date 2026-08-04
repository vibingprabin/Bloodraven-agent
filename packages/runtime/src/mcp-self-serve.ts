/**
 * MCP self-service tools: let the model install/register an MCP server and use
 * it in the SAME session, and enumerate what is registered.
 *
 * Why `mcp_call` exists: `buildMcpTools` snapshots the connected servers' tools
 * once at startup (mcp__<server>__<tool> proxies). A server registered
 * mid-session would not appear in that snapshot, so a dynamic dispatch tool is
 * required to reach its tools immediately. `mcp_call` reads the manager's LIVE
 * status at call time, so a just-registered server is callable this turn.
 *
 * Permission: these are side-effecting network/process tools. The CLI gates
 * them like any network_send tool (prompt in ask/execute, blocked in explore);
 * `--yolo` runs them with full access.
 */

import { z } from 'zod';
import type { McpServerConfig } from '@maka/core/mcp';
import type { MakaTool } from './tool-runtime.js';

export interface McpSelfServeDeps {
  /** Current registered servers (server id -> config). */
  getConfig(): Promise<Record<string, McpServerConfig>>;
  /** Persist one server registration. */
  upsertServer(serverId: string, config: McpServerConfig): Promise<void>;
  /** (Re)sync the manager against the persisted config; connects new servers. */
  sync(): Promise<void>;
  /** Live tool descriptors per connected server. */
  listTools(): Array<{ serverId: string; tools: Array<{ name: string; description?: string }> }>;
  /** Invoke one tool on a connected server. */
  callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ content: unknown[] }>;
}

export function buildMcpRegisterTool(deps: McpSelfServeDeps): MakaTool<Record<string, unknown>, string> {
  return {
    name: 'mcp_register',
    description:
      'Register an MCP server and make its tools callable in THIS session. ' +
      'Provide a server id (kebab-case) and either a stdio command+args (local process) ' +
      'or a remote url (http/https streamable-http or SSE). The server is persisted to ' +
      'mcp.json and connected immediately; then use mcp_call(server, tool, args) or the ' +
      'mcp__server__tool proxies to invoke its tools. Use mcp_list_servers to see what is ' +
      'registered. Example: register a local `node server.mjs`, or a remote MCP URL.',
    parameters: z.object({
      server_id: z
        .string()
        .min(1)
        .max(128)
        .describe('Unique server id, kebab-case (e.g. "nepse", "filesystem").'),
      command: z
        .string()
        .optional()
        .describe('For stdio servers: the executable command (e.g. "node", "npx").'),
      args: z
        .array(z.string())
        .optional()
        .describe('For stdio servers: CLI arguments (e.g. ["server.mjs"]).'),
      env: z.record(z.string(), z.string()).optional().describe('Optional environment variables for the stdio process.'),
      cwd: z.string().optional().describe('Optional working directory for the stdio process.'),
      url: z
        .string()
        .url()
        .optional()
        .describe('For remote servers: the http/https URL (streamable-http auto-detected).'),
      transport: z.enum(['auto', 'streamable-http', 'sse']).optional().describe('Remote transport (default auto).'),
      headers: z.record(z.string(), z.string()).optional().describe('Optional headers for the remote server.'),
    }),
    categoryHint: 'network_send',
    impl: async (args, ctx) => {
      const serverId = String(args.server_id).trim();
      if (!serverId) throw new Error('server_id is required.');
      const config = buildServerConfig(args);
      await deps.upsertServer(serverId, config);
      await deps.sync();
      // Re-read the live catalog after sync.
      const servers = deps.listTools();
      const entry = servers.find((s) => s.serverId === serverId);
      const tools = entry?.tools ?? [];
      const toolList = tools.length
        ? tools.map((t) => `  - ${t.name}: ${t.description ?? ''}`.slice(0, 160)).join('\n')
        : '  (no tools discovered)';
      return [
        `Registered MCP server "${serverId}" and connected.`,
        '',
        'Discovered tools (callable via mcp_call in this session, or mcp__<server>__<tool> next session):',
        toolList,
        '',
        'Persisted to mcp.json. Use mcp_list_servers to verify; mcp_call(server, tool, args) to invoke.',
      ].join('\n');
    },
  };
}

export function buildMcpCallTool(deps: McpSelfServeDeps): MakaTool<Record<string, unknown>, string> {
  return {
    name: 'mcp_call',
    description:
      'Invoke a tool on a registered MCP server by server id and tool name, with JSON arguments. ' +
      'This is the dynamic dispatch path: it reaches tools on servers registered THIS session ' +
      '(mcp_register), which the static mcp__server__tool proxies cannot do until restart. ' +
      'Use mcp_list_servers to find server ids and tool names.',
    parameters: z.object({
      server: z.string().min(1).max(128).describe('Registered MCP server id (from mcp_list_servers).'),
      tool: z.string().min(1).max(200).describe('Tool name on that server.'),
      arguments: z.record(z.string(), z.unknown()).describe('JSON arguments for the tool.'),
    }),
    categoryHint: 'network_send',
    impl: async (args) => {
      const server = String(args.server);
      const tool = String(args.tool);
      const toolArgs = (args.arguments ?? {}) as Record<string, unknown>;
      const result = await deps.callTool(server, tool, toolArgs);
      return serializeMcpResult(result);
    },
  };
}

export function buildMcpListServersTool(deps: McpSelfServeDeps): MakaTool<Record<string, never>, string> {
  return {
    name: 'mcp_list_servers',
    description:
      'List registered MCP servers and their tools. Returns server id, transport/command, ' +
      'connection state, and each tool name + description. Use this to discover what to call ' +
      'with mcp_call, and to see whether a server registered via mcp_register connected.',
    parameters: z.object({}),
    categoryHint: 'network_send',
    impl: async () => {
      const config = await deps.getConfig();
      const servers = deps.listTools();
      const ids = Object.keys(config);
      if (ids.length === 0) {
        return 'No MCP servers registered. Use mcp_register to add one.';
      }
      const lines: string[] = [];
      for (const id of ids) {
        const cfg = config[id];
        const live = servers.find((s) => s.serverId === id);
        const state = live ? `connected (${live.tools.length} tools)` : 'not-connected';
        const transport = 'command' in cfg ? `stdio:${cfg.command}` : `remote:${cfg.url}`;
        lines.push(`## ${id} — ${state} — ${transport}`);
        if (live) {
          for (const t of live.tools) {
            lines.push(`  - ${t.name}: ${t.description ?? ''}`.slice(0, 180));
          }
        }
      }
      return lines.join('\n');
    },
  };
}

function buildServerConfig(args: Record<string, unknown>): McpServerConfig {
  const command = typeof args.command === 'string' && args.command ? args.command : undefined;
  const url = typeof args.url === 'string' && args.url ? args.url : undefined;
  if (!command && !url) {
    throw new Error('Provide either command (stdio server) or url (remote server).');
  }
  if (command) {
    return {
      enabled: true,
      command,
      ...(Array.isArray(args.args) ? { args: args.args.map(String) } : {}),
      ...(isStringRecord(args.env) ? { env: args.env } : {}),
      ...(typeof args.cwd === 'string' && args.cwd ? { cwd: args.cwd } : {}),
    };
  }
  return {
    enabled: true,
    url: url as string,
    transport: (args.transport as 'auto' | 'streamable-http' | 'sse') ?? 'auto',
    ...(isStringRecord(args.headers) ? { headers: args.headers } : {}),
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function serializeMcpResult(result: { content: unknown[] }): string {
  const text = result.content
    .map((block) => {
      if (typeof block === 'object' && block !== null && 'text' in block) {
        return String((block as { text: unknown }).text);
      }
      return JSON.stringify(block);
    })
    .filter(Boolean)
    .join('\n');
  return text || '(empty result)';
}
