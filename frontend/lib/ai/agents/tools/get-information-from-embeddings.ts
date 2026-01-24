import {
  findRelevantContent,
  findRelevantContentByResourceId,
  findRelevantContentWithFallback,
  findRelevantContentByResourceIdWithFallback
} from "@/lib/db/embeddings/queries";
import { tool } from "ai";
import { z } from "zod";
import { generateEmbedding } from "@/lib/ai/embeddings/generate";
import { generateText } from "ai";
import { myProvider, getTitleModelId } from "@/lib/ai/providers";

/**
 * Refine a user query using an LLM to generate alternative search terms
 * @param originalQuery - The original user query
 * @returns Array of refined/expanded queries to try
 */
async function refineQuery(originalQuery: string): Promise<string[]> {
  try {
    console.log("[refineQuery] Refining query:", originalQuery);

    // Use the title model (fast and cheap) for query refinement
    const modelId = getTitleModelId();
    const model = myProvider.languageModel(modelId);

    const { text } = await generateText({
      model,
      prompt: `Given this search query: "${originalQuery}"

Generate 2-3 alternative phrasings or related search terms that might help find relevant information in documents.
Consider:
- Synonyms and related terminology
- More specific or more general versions
- Alternative ways to express the same concept
- Related concepts that might appear in the same context

Return only the alternative queries, one per line, without numbering or explanations.`,
    });

    const refinedQueries = text
      .split("\n")
      .map(q => q.trim())
      .filter(q => q.length > 0 && q !== originalQuery);

    console.log("[refineQuery] Generated refined queries:", refinedQueries);
    return refinedQueries;
  } catch (error) {
    console.error("[refineQuery] Error refining query:", error);
    return [];
  }
}

export const getInformationFromEmbeddings = tool({
  description:
    `Search for information in uploaded documents by semantic similarity using a multi-hop approach.

    Use this tool when users ask questions about content in their documents.

    Multi-hop strategy:
    1. First searches with high similarity threshold (0.5)
    2. If no results, progressively lowers threshold (0.3, then 0.15)
    3. If still no results, generates alternative query phrasings and searches again
    4. Returns the best available matches

    Input:
    - userQuery: The question or topic to search for (will be embedded and matched semantically)
    - resourceId (optional): Limit search to a specific document ID

    Output:
    - Array of relevant content chunks, each containing:
      * content: The text content from the document
      * similarity: Relevance score (0-1, higher is more relevant)
      * resourceName: Source document filename
      * _meta: Metadata including threshold used and search attempts needed
    - Empty array if no relevant information found even after query refinement

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

      console.log("[getInformationFromEmbeddings] Starting multi-hop search for:", input.userQuery);
      if (input.resourceId) {
        console.log("[getInformationFromEmbeddings] Filtering by resource ID:", input.resourceId);
      }

      // Step 1: Try with original query using multi-hop (progressive threshold lowering)
      const userQueryEmbedded = await generateEmbedding(input.userQuery);
      console.log("[getInformationFromEmbeddings] Generated embedding with dimensions:", userQueryEmbedded.length);

      let searchResult;
      if (input.resourceId) {
        searchResult = await findRelevantContentByResourceIdWithFallback(userQueryEmbedded, input.resourceId);
      } else {
        searchResult = await findRelevantContentWithFallback(userQueryEmbedded);
      }

      let validResults = searchResult.results.filter(r => r.content && r.content.trim().length > 0);

      console.log(`[getInformationFromEmbeddings] Initial search: Found ${validResults.length} results (threshold: ${searchResult.threshold}, attempt: ${searchResult.attempt})`);

      // Step 2: If no results, try query refinement
      if (validResults.length === 0) {
        console.log("[getInformationFromEmbeddings] No results found. Attempting query refinement...");

        const refinedQueries = await refineQuery(input.userQuery);

        for (const refinedQuery of refinedQueries) {
          console.log("[getInformationFromEmbeddings] Trying refined query:", refinedQuery);

          const refinedEmbedding = await generateEmbedding(refinedQuery);

          let refinedSearchResult;
          if (input.resourceId) {
            refinedSearchResult = await findRelevantContentByResourceIdWithFallback(refinedEmbedding, input.resourceId);
          } else {
            refinedSearchResult = await findRelevantContentWithFallback(refinedEmbedding);
          }

          const refinedValidResults = refinedSearchResult.results.filter(r => r.content && r.content.trim().length > 0);

          if (refinedValidResults.length > 0) {
            console.log(`[getInformationFromEmbeddings] Refined query found ${refinedValidResults.length} results (threshold: ${refinedSearchResult.threshold}, attempt: ${refinedSearchResult.attempt})`);
            validResults = refinedValidResults;
            searchResult = refinedSearchResult;
            break;
          }
        }
      }

      // Log final results
      if (validResults.length === 0) {
        console.warn("[getInformationFromEmbeddings] No valid content found after all attempts for query:", input.userQuery);
      } else {
        const totalChars = validResults.reduce((sum, r) => sum + r.content.length, 0);
        const avgSimilarity = validResults.reduce((sum, r) => sum + r.similarity, 0) / validResults.length;

        console.log("[getInformationFromEmbeddings] Final results:", {
          count: validResults.length,
          totalChars,
          avgChars: Math.round(totalChars / validResults.length),
          avgSimilarity: avgSimilarity.toFixed(3),
          thresholdUsed: searchResult.threshold,
          attemptsNeeded: searchResult.attempt,
          results: validResults.map(r => ({
            similarity: r.similarity.toFixed(3),
            contentLength: r.content.length,
            resourceName: r.resourceName,
            chunkIndex: r.chunkIndex,
            contentPreview: r.content.substring(0, 100) + "...",
          })),
        });
      }

      // Return compact results to prevent context bloat
      return validResults.map(result => ({
        content: result.content,
        similarity: result.similarity,
        resourceName: result.resourceName,
        chunkIndex: result.chunkIndex,
        _meta: {
          chars: result.content.length,
          folder: result.folder,
          thresholdUsed: searchResult.threshold,
          searchAttempts: searchResult.attempt,
        }
      }));
    } catch (error) {
      console.error("[getInformationFromEmbeddings] Error:", error);
      // Return empty array on error so the AI can handle it gracefully
      return [];
    }
  },
});
