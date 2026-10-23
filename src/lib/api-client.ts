// Browser helper for calling our JSON API with consistent error handling.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; csrf?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.csrf ? { "x-csrf-token": init.csrf } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("No connection. Check that you are connected and try again.", 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string; details?: { path: string; message: string }[] } };
  if (!res.ok) throw new ApiError(data.error?.message ?? "Something went wrong.", res.status, data.error?.code, data.error?.details);
  return data as T;
}

/** Maps validation details to { field: message }. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !err.details) return {};
  return Object.fromEntries(err.details.map((d) => [d.path, d.message]));
}
