import { findRelevantContent, findRelevantContentByResourceId } from "@/lib/db/embeddings/queries";
import { tool } from "ai";
import { z } from "zod";
import { generateEmbedding } from "@/lib/ai/embeddings/generate";


export const getInformationFromEmbeddings = tool({
  description:
    `Search for information in uploaded documents by semantic similarity.

    Use this tool when users ask questions about content in their documents.

    Input:
    - userQuery: The question or topic to search for (will be embedded and matched semantically)
    - resourceId (optional): Limit search to a specific document ID

    Output:
    - Array of relevant content chunks, each containing:
      * content: The text content from the document
      * similarity: Relevance score (0-1, higher is more relevant)
      * resourceName: Source document filename
    - Empty array if no relevant information found

    The tool returns the most semantically similar content chunks. Use all returned results to provide a comprehensive answer.`,
  inputSchema: z.object({
    userQuery: z.string().describe("The user's question or topic to search for in the documents."),
    resourceId: z.string().optional().nullable().describe("Optional: The specific document ID to search within. If not provided, searches across all documents."),
  }),
  execute: async (input) => {
    try {
      if (!input.userQuery) {
        console.warn("[getInformationFromEmbeddings] No user query provided");
        return [];
      }

      console.log("[getInformationFromEmbeddings] Searching for:", input.userQuery);
      if (input.resourceId) {
        console.log("[getInformationFromEmbeddings] Filtering by resource ID:", input.resourceId);
      }

      // Generate the embedding for the user query
      const userQueryEmbedded = await generateEmbedding(input.userQuery);
      console.log("[getInformationFromEmbeddings] Generated embedding with dimensions:", userQueryEmbedded.length);

      let similarContent: Awaited<ReturnType<typeof findRelevantContent>>;
      if (input.resourceId) {
        similarContent = await findRelevantContentByResourceId(userQueryEmbedded, input.resourceId);
      } else {
        similarContent = await findRelevantContent(userQueryEmbedded);
      }

      // Filter out any results with empty content
      const validResults = similarContent.filter(r => r.content && r.content.trim().length > 0);
      
      console.log("[getInformationFromEmbeddings] Found", similarContent.length, "results");
      if (validResults.length === 0) {
        console.warn("[getInformationFromEmbeddings] No valid content found for query:", input.userQuery);
        if (similarContent.length > 0) {
          console.warn("[getInformationFromEmbeddings] All results had empty content");
        }
      } else {
        console.log("[getInformationFromEmbeddings] Valid results:", validResults.map(r => ({
          similarity: r.similarity,
          contentLength: r.content.length,
          resourceName: r.resourceName,
          contentPreview: r.content.substring(0, 100) + "...",
        })));
      }

      return validResults;
    } catch (error) {
      console.error("[getInformationFromEmbeddings] Error:", error);
      // Return empty array on error so the AI can handle it gracefully
      return [];
    }
  },
});
