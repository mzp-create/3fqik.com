// Tiny HTTP client for the 3fqik admin API. Authenticates with the service
// bearer token (resolved server-side to the bot-admin player) and unwraps the
// app's { ok, data } / { ok:false, code, message } envelope (src/lib/api.ts).

const BASE = process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";

function token(): string {
  const t = process.env.MCP_ADMIN_TOKEN;
  if (!t || t.length < 32)
    throw new Error(
      "MCP_ADMIN_TOKEN is not set (must match the app's, ≥32 chars)",
    );
  return t;
}

async function call(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token()}`,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let json: {
    ok?: boolean;
    data?: unknown;
    code?: string;
    message?: string;
  } | null = null;
  try {
    json = txt ? JSON.parse(txt) : null;
  } catch {
    json = null; // non-JSON response (e.g. an HTML error page)
  }
  if (!res.ok || (json && json.ok === false)) {
    const code = json?.code ?? `http_${res.status}`;
    const message = json?.message ?? txt.slice(0, 300) ?? res.statusText;
    throw new Error(`[${code}] ${message}`);
  }
  return json && "data" in json ? json.data : json;
}

export const apiGet = (path: string) => call("GET", path);
export const apiPost = (path: string, body?: unknown) =>
  call("POST", path, body);

/** Build a query string from defined params only. */
export function qs(
  params: Record<string, string | number | undefined>,
): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}
