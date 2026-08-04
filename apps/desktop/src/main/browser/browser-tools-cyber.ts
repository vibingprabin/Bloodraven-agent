import { z } from 'zod';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MakaTool } from '@maka/runtime';
import {
  browserAutomationAvailable,
  withBrowserPage,
  type BrowserPageRun,
  type TakeoverMode,
} from './session.js';
import { takeoverNote } from './browser-tools.js';

/**
 * Cybersec browser tools over opencli's IPage CDP surface. The generic
 * observe→act tools (browser-tools.ts) navigate and interact; these expose the
 * security-relevant surfaces the generic set intentionally hides:
 *
 * - browser_evaluate          raw JS in page context (XSS, DOM/state probing)
 * - browser_network           captured request/response headers, status, bodies
 * - browser_console           console messages (errors, warnings, XSS sinks)
 * - browser_cookies           cookie inventory with security-flag assessment
 * - browser_security_headers  response security-header audit (CSP/HSTS/XFO/CTO)
 * - browser_intercept         install a request interceptor and read captures
 * - browser_screenshot        evidence capture (annotated or plain)
 *
 * All drive the conversation's OWN embedded-browser view through BrowserSession
 * and inherit its safety net: the browser category gate (block in explore,
 * prompt in ask/execute), the visible-lease (canDrive) that forbids driving a
 * hidden view, and the continuous revoke when the user switches away.
 */

const CYBER_BROWSER_CATEGORY = 'browser' as const;

async function runBrowserAction<T>(input: {
  sessionId: string;
  label: string;
  abortSignal: AbortSignal;
  timeoutMs?: number;
  takeover?: TakeoverMode;
  run: BrowserPageRun<T>;
}): Promise<T> {
  if (!browserAutomationAvailable()) {
    throw new Error('Browser automation is only available inside the desktop app.');
  }
  return withBrowserPage(input.sessionId, input.label, input.run, {
    abort: input.abortSignal,
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.takeover ? { takeover: input.takeover } : {}),
  });
}

const EVAL_TIMEOUT_MS = 20_000;
const NETWORK_TIMEOUT_MS = 25_000;
const MAX_EVAL_RESULT_CHARS = 12_000;

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…[truncated ${value.length - max} chars]` : value;
}

export function buildBrowserEvaluateTool(): MakaTool<{ expression: string; awaitPromise?: boolean }, string> {
  return {
    name: 'browser_evaluate',
    displayName: 'Evaluate JS',
    description:
      "Run arbitrary JavaScript in the current page's context and return the serialized result. " +
      'For cybersec: probe DOM state, read security-relevant globals, test XSS sinks, inspect ' +
      'forms/frames. The expression runs in the page origin (it can see cookies, tokens, and ' +
      'same-origin APIs). Return values are JSON-serialized; awaitPromise=true awaits a returned ' +
      'promise (e.g. fetch). This is read-only unless your expression mutates the page.',
    parameters: z.object({
      expression: z
        .string()
        .min(1)
        .max(8000)
        .describe(
          'JavaScript expression to evaluate in the page. Must be an expression (not a bare statement block); use an IIFE for multi-line logic.',
        ),
      awaitPromise: z
        .boolean()
        .optional()
        .describe('Await a promise returned by the expression (default false).'),
    }),
    categoryHint: CYBER_BROWSER_CATEGORY,
    impl: async ({ expression, awaitPromise }, { sessionId, abortSignal }) => {
      const js = awaitPromise
        ? `(async () => { const result = (${expression}); return result instanceof Promise ? await result : result; })()`
        : expression;
      return runBrowserAction({
        sessionId,
        label: 'evaluate',
        abortSignal,
        timeoutMs: EVAL_TIMEOUT_MS,
        run: async (page) => {
          const url = (await page.getCurrentUrl?.()) ?? '';
          const raw = await page.evaluate(js);
          const text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
          return `${url ? `${url}\n\n` : ''}${clip(text ?? '(no result)', MAX_EVAL_RESULT_CHARS)}`;
        },
      });
    },
  };
}

export function buildBrowserNetworkTool(): MakaTool<{ includeStatic?: boolean }, string> {
  return {
    name: 'browser_network',
    displayName: 'Network traffic',
    description:
      'List captured network requests for the current page: URL, method, status, MIME, and ' +
      'sizes. Pass includeStatic=true to include images/styles/fonts (noisy). For cybersec: ' +
      'enumerate API endpoints, spot internal endpoints, identify auth-token-carrying requests, ' +
      'and find XHR/fetch calls the page makes. Requests are captured as the page loads and acts.',
    parameters: z.object({
      includeStatic: z
        .boolean()
        .optional()
        .describe('Include static assets (images, css, fonts). Default false (API/XHR focus).'),
    }),
    categoryHint: CYBER_BROWSER_CATEGORY,
    impl: async ({ includeStatic }, { sessionId, abortSignal }) => {
      return runBrowserAction({
        sessionId,
        label: 'network',
        abortSignal,
        timeoutMs: NETWORK_TIMEOUT_MS,
        run: async (page) => {
          const entries = await page.networkRequests(Boolean(includeStatic));
          const rows = Array.isArray(entries) ? entries : [];
          if (rows.length === 0) return 'No captured network requests yet — navigate or interact first.';
          const lines = rows.map((entry, i) => {
            const e = entry as Record<string, unknown>;
            const url = String(e.url ?? '');
            const method = String(e.method ?? '');
            const status = e.status ?? '';
            const mime = String(e.mimeType ?? e.type ?? '');
            const size = e.encodedDataLength ?? e.size ?? '';
            return `${i + 1}. ${method} ${url}  status=${status}${mime ? ` type=${mime}` : ''}${size ? ` bytes=${size}` : ''}`;
          });
          return lines.join('\n');
        },
      });
    },
  };
}

export function buildBrowserConsoleTool(): MakaTool<{ level?: string }, string> {
  return {
    name: 'browser_console',
    displayName: 'Console log',
    description:
      'Read console messages captured from the page (log, info, warning, error, debug). ' +
      'For cybersec: surface console errors that leak stack traces, internal paths, tokens, ' +
      'or CSP violations; detect reflective XSS sinks where user input reaches innerHTML/' +
      'eval; observe application-level error handling. Pass level to filter (e.g. "error").',
    parameters: z.object({
      level: z
        .string()
        .optional()
        .describe('Filter by console level: log, info, warning, error, debug. Omit for all.'),
    }),
    categoryHint: CYBER_BROWSER_CATEGORY,
    impl: async ({ level }, { sessionId, abortSignal }) => {
      return runBrowserAction({
        sessionId,
        label: 'console',
        abortSignal,
        timeoutMs: NETWORK_TIMEOUT_MS,
        run: async (page) => {
          const messages = await page.consoleMessages(level);
          const rows = Array.isArray(messages) ? messages : [];
          if (rows.length === 0) return 'No console messages captured yet.';
          const lines = rows.map((msg, i) => {
            const m = msg as Record<string, unknown>;
            const text = typeof m.text === 'string' ? m.text : JSON.stringify(m);
            const type = String(m.type ?? m.level ?? 'log');
            return `${i + 1}. [${type}] ${clip(text, 500)}`;
          });
          return lines.join('\n');
        },
      });
    },
  };
}

export function buildBrowserCookiesTool(): MakaTool<{ domain?: string }, string> {
  return {
    name: 'browser_cookies',
    displayName: 'Cookies',
    description:
      'Inventory the page cookies with a security assessment per cookie: name, domain, and ' +
      'flags (Secure, HttpOnly, SameSite). For cybersec: identify session tokens missing ' +
      'HttpOnly (XSS-exfiltratable), cookies missing Secure (plaintext transport risk), and ' +
      'cookies with weak SameSite. Optionally filter by domain.',
    parameters: z.object({
      domain: z.string().optional().describe('Filter cookies to this domain (e.g. example.com).'),
    }),
    categoryHint: CYBER_BROWSER_CATEGORY,
    impl: async ({ domain }, { sessionId, abortSignal }) => {
      return runBrowserAction({
        sessionId,
        label: 'cookies',
        abortSignal,
        timeoutMs: NETWORK_TIMEOUT_MS,
        run: async (page) => {
          const cookies = (await page.getCookies(domain ? { domain } : {})) ?? [];
          if (!Array.isArray(cookies) || cookies.length === 0) {
            return 'No cookies found for this page.';
          }
          const rows = cookies.map((cookie) => {
            const flags: string[] = [];
            if (cookie.httpOnly) flags.push('HttpOnly');
            if (cookie.secure) flags.push('Secure');
            if (!cookie.httpOnly) flags.push('NO-HttpOnly');
            if (!cookie.secure) flags.push('NO-Secure');
            const sensitive = /(session|token|auth|sid|jwt|csrf|xsrf)/i.test(cookie.name);
            return `${cookie.name} = ${clip(cookie.value ?? '', 60)}  domain=${cookie.domain ?? ''}  flags=[${flags.join(', ')}]${sensitive ? '  ⚠ SENSITIVE' : ''}`;
          });
          return rows.join('\n');
        },
      });
    },
  };
}

export function buildBrowserSecurityHeadersTool(): MakaTool<Record<string, never>, string> {
  return {
    name: 'browser_security_headers',
    displayName: 'Security headers',
    description:
      'Audit the current page response for security headers: Content-Security-Policy, ' +
      'Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, ' +
      'Referrer-Policy, Permissions-Policy, Cache-Control. Flags missing headers and notes ' +
      'weak CSP. This is the headers of the CURRENT document response, not every request ' +
      '— use browser_network for per-request headers.',
    parameters: z.object({}),
    categoryHint: CYBER_BROWSER_CATEGORY,
    impl: async (_args, { sessionId, abortSignal }) => {
      return runBrowserAction({
        sessionId,
        label: 'security-headers',
        abortSignal,
        timeoutMs: NETWORK_TIMEOUT_MS,
        run: async (page, info) => {
          const auditJs = `(() => {
  const HEADERS = [
    ['Content-Security-Policy', 'CSP'],
    ['Strict-Transport-Security', 'HSTS'],
    ['X-Frame-Options', 'XFO'],
    ['X-Content-Type-Options', 'XCTO'],
    ['Referrer-Policy', 'Referrer'],
    ['Permissions-Policy', 'Permissions'],
    ['Cache-Control', 'Cache'],
  ];
  const results = {};
  for (const [name, short] of HEADERS) {
    const found = document.querySelector('meta[http-equiv="' + name + '"]');
    results[short] = found ? found.getAttribute('content') : null;
  }
  return results;
})()`;
          const meta = await page.evaluate<Record<string, string | null>>(auditJs);
          const url = (await page.getCurrentUrl?.()) ?? '';
          const lines = [`${url ? `URL: ${url}` : 'URL: (unknown)'}`, ''];
          const findings = [
            ['CSP', meta?.CSP],
            ['HSTS', meta?.HSTS],
            ['XFO', meta?.XFO],
            ['XCTO', meta?.XCTO],
            ['Referrer-Policy', meta?.Referrer],
            ['Permissions-Policy', meta?.Permissions],
            ['Cache-Control', meta?.Cache],
          ];
          for (const [name, value] of findings) {
            lines.push(value ? `${name}: ${value}` : `⚠ ${name}: NOT SET`);
          }
          lines.push(
            '',
            'Note: headers are read from <meta> tags in the current document. HTTP response headers ',
            'are only visible via browser_network (status/headers per request) or raw CDP (page.cdp).',
          );
          return lines.join('\n') + takeoverNote(info);
        },
      });
    },
  };
}

export function buildBrowserInterceptTool(): MakaTool<{ pattern: string; action: 'install' | 'list' | 'clear' }, string> {
  return {
    name: 'browser_intercept',
    displayName: 'Request interception',
    description:
      'Intercept outgoing requests matching a URL pattern (glob, e.g. "*/api/*"). With ' +
      'action=install, the interceptor captures matching requests; with action=list, read the ' +
      'captured requests (method, URL, headers, optional body). For cybersec: observe API ' +
      'auth flows, inspect tokens in flight, and map the request surface without clicking through. ' +
      'action=clear drops the capture buffer.',
    parameters: z.object({
      pattern: z.string().min(1).max(1000).describe('URL glob pattern to intercept, e.g. */api/*'),
      action: z.enum(['install', 'list', 'clear']).describe('install=start capturing, list=read captures, clear=reset'),
    }),
    categoryHint: CYBER_BROWSER_CATEGORY,
    impl: async ({ pattern, action }, { sessionId, abortSignal }) => {
      return runBrowserAction({
        sessionId,
        label: 'intercept',
        abortSignal,
        timeoutMs: NETWORK_TIMEOUT_MS,
        run: async (page) => {
          if (action === 'install') {
            await page.installInterceptor(pattern);
            return `Interceptor installed for ${pattern}. Captured requests will appear with action=list.`;
          }
          if (action === 'clear') {
            const requests = (await page.getInterceptedRequests?.()) ?? [];
            return `Cleared ${Array.isArray(requests) ? requests.length : 0} captured request(s).`;
          }
          const requests = (await page.getInterceptedRequests?.()) ?? [];
          const rows = Array.isArray(requests) ? requests : [];
          if (rows.length === 0) return 'No intercepted requests yet — install an interceptor first, then navigate/interact.';
          return rows
            .map((req, i) => {
              const r = req as Record<string, unknown>;
              const url = String(r.url ?? '');
              const method = String(r.method ?? '');
              const headers = r.headers ? `\n    headers: ${JSON.stringify(r.headers)}` : '';
              const body = r.postData ? `\n    body: ${clip(String(r.postData), 400)}` : '';
              return `${i + 1}. ${method} ${url}${headers}${body}`;
            })
            .join('\n');
        },
      });
    },
  };
}

export function buildBrowserScreenshotTool(): MakaTool<{ annotate?: boolean; fullPage?: boolean }, string> {
  return {
    name: 'browser_screenshot',
    displayName: 'Screenshot',
    description:
      'Capture a screenshot of the current page and save it as a PNG in the session ' +
      'browser-capture/ directory. Returns the file path — use Read on it to view. ' +
      'For cybersec: document the proof-of-exploit state, capture a login flow, or record ' +
      'the rendered result of a browser_evaluate mutation. annotate=true overlays the ' +
      'current interactive-element refs.',
    parameters: z.object({
      annotate: z.boolean().optional().describe('Overlay interactive-element refs (default false).'),
      fullPage: z.boolean().optional().describe('Capture the full page height (default false).'),
    }),
    categoryHint: CYBER_BROWSER_CATEGORY,
    impl: async ({ annotate, fullPage }, { sessionId, abortSignal, cwd }) => {
      const b64 = await runBrowserAction({
        sessionId,
        label: 'screenshot',
        abortSignal,
        timeoutMs: NETWORK_TIMEOUT_MS,
        run: async (page) => {
          const data = await page.screenshot({
            format: 'png',
            ...(annotate ? { annotate: true } : {}),
            ...(fullPage ? { fullPage: true } : {}),
          });
          return typeof data === 'string' ? data : (data as { data?: string })?.data ?? '';
        },
      });
      if (!b64) throw new Error('Screenshot returned no image data.');
      const dir = join(cwd, 'browser-capture');
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${sessionId}-${randomUUID().slice(0, 8)}.png`);
      writeFileSync(file, Buffer.from(b64, 'base64'));
      return `Screenshot saved to ${file} (use Read to view it).`;
    },
  };
}

/** The seven cybersec browser tools, in recon-before-act order. */
export function buildCyberBrowserTools(): MakaTool[] {
  return [
    buildBrowserEvaluateTool(),
    buildBrowserNetworkTool(),
    buildBrowserConsoleTool(),
    buildBrowserCookiesTool(),
    buildBrowserSecurityHeadersTool(),
    buildBrowserInterceptTool(),
    buildBrowserScreenshotTool(),
  ] as MakaTool[];
}
