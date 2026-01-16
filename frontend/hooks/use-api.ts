"use client";

import { apiClient } from "@/lib/api/client";

/**
 * Hook to use the API client in React components
 * Provides convenient access to API methods
 */
export function useApi() {
  return apiClient;
}
