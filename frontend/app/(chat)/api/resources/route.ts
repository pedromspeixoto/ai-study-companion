import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { deleteFile } from "@/lib/storage";
import { findResourceById, deleteResourceById, getResourcesPaginated, getResourcesGroupedByFolder } from "@/lib/db/resources/queries";
import { deleteEmbeddingsByResourceId } from "@/lib/db/embeddings/queries";

export async function GET(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 50); // Max 50
    const search = searchParams.get("search") || "";
    const grouped = searchParams.get("grouped") === "true";

    if (grouped) {
      const result = await getResourcesGroupedByFolder({ search });
      return NextResponse.json(result, { status: 200 });
    } else {
      const result = await getResourcesPaginated({ page, limit, search });
      return NextResponse.json(result, { status: 200 });
    }
  } catch (error) {
    console.error("Failed to fetch resources", error);
    return NextResponse.json(
      { error: "Failed to fetch resources" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const resourceId = searchParams.get("id");

    if (!resourceId) {
      return NextResponse.json({ error: "Resource ID is required" }, { status: 400 });
    }

    // Get the resource to find the file path
    const resource = await findResourceById(resourceId);
    if (!resource) {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    }

    // Delete the file from storage
    if (resource.pathname) {
      console.log(`Deleting file from storage: ${resource.pathname}`);
      await deleteFile(resource.pathname);
      console.log(`File deleted from storage: ${resource.pathname}`);
    }

    // Delete all related embeddings
    console.log(`Deleting embeddings for resource: ${resource.id}`);
    await deleteEmbeddingsByResourceId(resource.id);
    console.log(`Embeddings deleted for resource: ${resource.id}`);

    // Delete the resource record
    console.log(`Deleting resource record: ${resource.id}`);
    await deleteResourceById(resource.id);
    console.log(`Resource record deleted: ${resource.id}`);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to delete resource", error);
    return NextResponse.json(
      { error: "Failed to delete resource" },
      { status: 500 }
    );
  }
}
