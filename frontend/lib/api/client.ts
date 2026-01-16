"use client";

import { signOut } from "next-auth/react";
import { ChatSDKError, type ErrorCode } from "@/lib/errors";

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  requireAuth?: boolean;
};

type ApiResponse<T = unknown> = {
  data: T;
  response: Response;
};

class ApiClient {
  private baseUrl: string = "";

  constructor(baseUrl?: string) {
    if (baseUrl) {
      this.baseUrl = baseUrl;
    } else if (typeof window !== "undefined") {
      this.baseUrl = window.location.origin;
    }
  }

  /**
   * Handle unauthorized errors by signing out and redirecting to login
   */
  private async handleUnauthorized(error: ChatSDKError): Promise<never> {
    if (typeof window === "undefined") {
      throw error;
    }

    const pathname = window.location.pathname;
    console.log("[ApiClient] Unauthorized error detected, signing out and redirecting to login");

    await signOut({ redirect: false });
    window.location.href = `/login?callbackUrl=${encodeURIComponent(pathname)}`;

    throw error;
  }

  /**
   * Parse error response and create ChatSDKError
   */
  private async parseErrorResponse(response: Response): Promise<ChatSDKError> {
    try {
      const { code, cause } = await response.json();
      return new ChatSDKError(code as ErrorCode, cause);
    } catch {
      // If response is not JSON, create a generic error
      return new ChatSDKError(
        response.status === 401
          ? "unauthorized:chat"
          : response.status === 403
            ? "forbidden:chat"
            : response.status === 404
              ? "not_found:chat"
              : "bad_request:api"
      );
    }
  }

  /**
   * Make a fetch request with error handling
   */
  private async request<T = unknown>(
    url: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { body, requireAuth = true, headers, ...fetchOptions } = options;

    // Handle offline state
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new ChatSDKError("offline:chat");
    }

    // Prepare headers
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(headers as Record<string, string>),
    };

    // Prepare body
    let requestBody: string | FormData | undefined;
    if (body instanceof FormData) {
      requestBody = body;
      // Don't set Content-Type for FormData, let browser set it with boundary
      delete requestHeaders["Content-Type"];
    } else if (body instanceof ReadableStream) {
      // For streaming requests, pass through as-is
      requestBody = body as unknown as string;
    } else if (typeof body === "string") {
      // Body is already a string (e.g., from DefaultChatTransport), use as-is
      requestBody = body;
    } else if (body !== undefined) {
      // Body is an object, stringify it
      requestBody = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${this.baseUrl}${url}`, {
        ...fetchOptions,
        headers: requestHeaders as HeadersInit,
        body: requestBody,
      });

      if (!response.ok) {
        const error = await this.parseErrorResponse(response);

        // Handle unauthorized errors globally
        if (requireAuth && (error.statusCode === 401 || error.type === "unauthorized")) {
          await this.handleUnauthorized(error);
        }

        throw error;
      }

      // Parse JSON response
      const data = await response.json();

      return {
        data: data as T,
        response,
      };
    } catch (error) {
      if (error instanceof ChatSDKError) {
        throw error;
      }

      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Make a request and return the raw Response object
   */
  private async requestRaw(
    url: string,
    options: RequestOptions = {}
  ): Promise<Response> {
    const { body, requireAuth = true, headers, ...fetchOptions } = options;

    // Handle offline state
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new ChatSDKError("offline:chat");
    }

    // Prepare headers
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(headers as Record<string, string>),
    };

    // Prepare body
    let requestBody: string | FormData | undefined;
    if (body instanceof FormData) {
      requestBody = body;
      // Don't set Content-Type for FormData, let browser set it with boundary
      delete requestHeaders["Content-Type"];
    } else if (body instanceof ReadableStream) {
      // For streaming requests, pass through as-is
      requestBody = body as unknown as string;
    } else if (typeof body === "string") {
      // Body is already a string (e.g., from DefaultChatTransport), use as-is
      requestBody = body;
    } else if (body !== undefined) {
      // Body is an object, stringify it
      requestBody = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${this.baseUrl}${url}`, {
        ...fetchOptions,
        headers: requestHeaders as HeadersInit,
        body: requestBody,
      });

      if (!response.ok) {
        const error = await this.parseErrorResponse(response);

        // Handle unauthorized errors globally
        if (requireAuth && (error.statusCode === 401 || error.type === "unauthorized")) {
          await this.handleUnauthorized(error);
        }

        throw error;
      }

      return response;
    } catch (error) {
      if (error instanceof ChatSDKError) {
        throw error;
      }

      // Re-throw other errors
      throw error;
    }
  }

  /**
   * GET request
   */
  async get<T = unknown>(url: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    const { data } = await this.request<T>(url, {
      ...options,
      method: "GET",
    });
    return data;
  }

  /**
   * POST request
   */
  async post<T = unknown>(url: string, body?: unknown, options?: Omit<RequestOptions, "method">): Promise<T> {
    const { data } = await this.request<T>(url, {
      ...options,
      method: "POST",
      body,
    });
    return data;
  }

  /**
   * PATCH request
   */
  async patch<T = unknown>(url: string, body?: unknown, options?: Omit<RequestOptions, "method">): Promise<T> {
    const { data } = await this.request<T>(url, {
      ...options,
      method: "PATCH",
      body,
    });
    return data;
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(url: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    const { data } = await this.request<T>(url, {
      ...options,
      method: "DELETE",
    });
    return data;
  }

  /**
   * GET request returning raw Response (for streaming, etc.)
   */
  async getRaw(url: string, options?: Omit<RequestOptions, "method" | "body">): Promise<Response> {
    return this.requestRaw(url, {
      ...options,
      method: "GET",
    });
  }

  /**
   * POST request returning raw Response (for streaming, etc.)
   */
  async postRaw(url: string, body?: unknown, options?: Omit<RequestOptions, "method">): Promise<Response> {
    return this.requestRaw(url, {
      ...options,
      method: "POST",
      body,
    });
  }

  /**
   * Fetch function compatible with fetchWithErrorHandlers (for useChat transport)
   */
  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url: string;
    let method: string = "GET";
    let body: unknown;
    let headers: HeadersInit = {};

    if (typeof input === "string") {
      url = input;
      method = init?.method || "GET";
      body = init?.body;
      headers = init?.headers || {};
    } else if (input instanceof URL) {
      url = input.pathname + input.search;
      method = init?.method || "GET";
      body = init?.body;
      headers = init?.headers || {};
    } else if (input instanceof Request) {
      url = input.url;
      method = init?.method || input.method || "GET";
      body = init?.body ?? input.body;
      headers = init?.headers || input.headers || {};
    } else {
      url = "/";
      method = init?.method || "GET";
      body = init?.body;
      headers = init?.headers || {};
    }

    const options: RequestOptions = {
      method: method as RequestInit["method"],
      headers,
      body,
      requireAuth: true,
    };

    return this.requestRaw(url, options);
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export class for custom instances if needed
export { ApiClient };

// Export types
export type { RequestOptions, ApiResponse };
