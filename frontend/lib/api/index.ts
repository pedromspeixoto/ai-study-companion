import { apiClient } from "./client";
export { apiClient, ApiClient, type RequestOptions, type ApiResponse } from "./client";

/**
 * SWR fetcher compatible with the new API client
 * Automatically handles unauthorized errors
 */
export async function swrFetcher<T = unknown>(url: string): Promise<T> {
  return apiClient.get<T>(url);
}
