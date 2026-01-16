import { findRelevantContent, findRelevantContentByResourceId } from "@/lib/db/embeddings/queries";
import { tool } from "ai";
import { z } from "zod";
import { generateEmbedding } from "@/lib/ai/embeddings/generate";


export const getInformationFromEmbeddings = tool({
  description:
    `MANDATORY: Use this tool to search for information in uploaded documents before answering ANY question. 
    This is the ONLY source of information you can use. 
    Provide a user query and, optionally, a resource id to search for information from.
    If a resource id is not provided, we will search for information from all embeddings.
    
    IMPORTANT: 
    - If this tool returns results (non-empty array), you MUST use the content from those results to answer the user's question.
    - Each result contains: content (the text to use), similarity (relevance score), and resourceName (source document).
    - Use the content from the results to provide a comprehensive answer based on the documents.
    - If this tool returns an empty array or no results, only then should you tell the user the information is not available in the documents.`,
  inputSchema: z.object({
    userQuery: z.string().describe("The user query to search for information from."),
    resourceId: z.string().optional().nullable().describe("The resource id to search for information from. If not provided, we will search for information from all embeddings."),
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
