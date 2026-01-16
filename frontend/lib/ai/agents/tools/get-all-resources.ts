import { getResourcesPaginated } from "@/lib/db/resources/queries";
import { tool } from "ai";
import { z } from "zod";

export const getAllResources = tool({
  description:
    `Use this tool to get a list of all available documents/resources that have been uploaded to the system.
    This tool returns information about all documents including their filenames, status, and when they were created.
    Use this when the user asks about what documents are available, what information you have access to, or what files have been uploaded.`,
  inputSchema: z.object({
    limit: z.number().optional().default(100).describe("Maximum number of resources to return. Default is 100."),
  }),
  execute: async (input) => {
    try {
      console.log("[getAllResources] Fetching all resources");
      const result = await getResourcesPaginated({
        page: 1,
        limit: input.limit || 100,
      });
      
      console.log(`[getAllResources] Found ${result.total} total resources, returning ${result.resources.length}`);
      
      return {
        total: result.total,
        resources: result.resources.map((resource) => ({
          id: resource.id,
          filename: resource.filename,
          contentType: resource.contentType,
          status: resource.status,
          createdAt: resource.createdAt.toISOString(),
        })),
      };
    } catch (error) {
      console.error("[getAllResources] Error:", error);
      return {
        total: 0,
        resources: [],
        error: error instanceof Error ? error.message : "Failed to fetch resources",
      };
    }
  },
});
