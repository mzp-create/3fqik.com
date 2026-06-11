export async function api<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(
    path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const json = await res.json();
  if (!json.ok)
    throw Object.assign(new Error(json.message ?? "error"), {
      code: json.code,
      extra: json,
    });
  return json.data as T;
}
