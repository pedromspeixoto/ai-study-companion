import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { getInformationFromEmbeddings } from "@/lib/ai/agents/tools/get-information-from-embeddings";
import type { getAllResources } from "@/lib/ai/agents/tools/get-all-resources";
import type { AppUsage } from "@/lib/usage";

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type EmbeddingsTool = InferUITool<typeof getInformationFromEmbeddings>;
type ResourcesTool = InferUITool<typeof getAllResources>;

export type ChatTools = {
  getInformationFromEmbeddings: EmbeddingsTool;
  getAllResources: ResourcesTool;
};

export type CustomUIDataTypes = {
  appendMessage: string;
  usage: AppUsage;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
