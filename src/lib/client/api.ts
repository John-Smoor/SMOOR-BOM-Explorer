"use client";

export class ApiError extends Error {
  constructor(public errors: string[], public status: number) {
    super(errors.join("\n"));
  }
}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    method: rest.method ?? (json !== undefined ? "POST" : "GET"),
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.errors ?? [`Request failed (${res.status}). Check your connection and try again.`], res.status);
  return data as T;
}

export interface ExportSheet {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

/** Builds the .xlsx on the server (same sheet layout as the Streamlit download buttons) and downloads it. */
export async function downloadXlsx(filename: string, sheets: ExportSheet[]) {
  const res = await fetch("/api/export", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename, sheets }),
  });
  if (!res.ok) throw new Error("Export failed. Try again.");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
