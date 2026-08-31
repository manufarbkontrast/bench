import type { APIResponse } from "@playwright/test";

/**
 * Playwright types a JSON body as `any`, and that spreads through every assertion that reads one.
 * These are the shapes the specs actually depend on, not the whole API surface.
 */
export async function json<T>(response: APIResponse): Promise<T> {
  return (await response.json()) as T;
}

export interface Deal {
  id: number;
  name: string;
  organization_id: number | null;
  contact_id: number | null;
  stage: string;
  value: number;
  probability: number;
  close_date: string | null;
}

export interface Organization {
  id: number;
  name: string;
}

export interface Contact {
  id: number;
  name: string;
  organization_id: number | null;
}
