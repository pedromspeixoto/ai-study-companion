import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { findResourceById } from "@/lib/db/resources/queries";
import { getAllContentByResourceId } from "@/lib/db/embeddings/queries";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Resource ID is required" }, { status: 400 });
    }

    const resource = await findResourceById(id);
    if (!resource) {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    }

    // Get all content chunks from embeddings table (stored by Dagster pipeline)
    const contentChunks = await getAllContentByResourceId(id);
    const content = contentChunks.length > 0 
      ? contentChunks.join("\n\n")
      : "[Content not yet processed]";

    return NextResponse.json(
      {
        filename: resource.filename,
        contentType: resource.contentType,
        content,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Failed to preview resource", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to preview resource",
      },
      { status: 500 }
    );
  }
}

