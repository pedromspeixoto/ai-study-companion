import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";

/**
 * The save file options
 * @returns The save file options
 */
type SaveFileOptions = {
  buffer: Buffer;
  filename: string;
  contentType: string;
};

/**
 * The save file result
 * @returns The save file result
 */
type SaveFileResult = {
  pathname: string;
  url: string;
  contentType: string;
};

/**
 * The default upload directory
 * @returns The default upload directory
 */
const defaultUploadDirectory =
  process.env.LOCAL_UPLOAD_DIR ?? path.join(process.cwd(), "storage", "uploads");

/**
 * Build a filename
 * @param originalFilename - The original filename
 * @returns The filename
 */
function buildFilename(originalFilename: string) {
  const extension = path.extname(originalFilename);
  const safeName = path
    .basename(originalFilename, extension)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const uniqueSuffix = nanoid(8);

  return `${safeName || "file"}-${uniqueSuffix}${extension}`;
}

/**
 * Save a file locally
 * @param options - The options
 * @returns The save file result
 */
export async function saveFileLocally({
  buffer,
  filename,
  contentType,
}: SaveFileOptions): Promise<SaveFileResult> {
  await fs.mkdir(defaultUploadDirectory, { recursive: true });

  const uniqueFilename = buildFilename(filename);
  const destinationPath = path.join(defaultUploadDirectory, uniqueFilename);

  await fs.writeFile(destinationPath, buffer);

  const pathname = `/storage/uploads/${uniqueFilename}`;

  return {
    pathname,
    url: pathname,
    contentType,
  };
}

/**
 * Delete a file locally
 * @param pathname - The pathname of the file
 * @returns void
 */
export async function deleteFileLocally(pathname: string): Promise<void> {
  try {
    // The pathname is already the full path from the database
    const fullPath = path.join(process.cwd(), pathname);
    console.log(`Deleting file: ${fullPath}`);
    await fs.unlink(fullPath);
    console.log(`Successfully deleted file: ${fullPath}`);
  } catch (error) {
    console.error(`Failed to delete file ${pathname}:`, error);
    // ignore if file doesn't exist or cannot be removed
  }
}
