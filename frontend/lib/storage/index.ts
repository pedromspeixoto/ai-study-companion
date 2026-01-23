/**
 * The upload file options
 * @returns The upload file options
 */
export type UploadFileOptions = {
  buffer: Buffer;
  filename: string;
  contentType: string;
};

/**
 * The upload file result
 * @returns The upload file result
 */
export type UploadFileResult = {
  pathname: string;
  url: string;
  contentType: string;
};

/**
 * Upload a file to the configured storage provider.
 * Currently only local storage is supported, but this function can be
 * extended to route uploads to S3, GCS, or other providers.
 */
export async function uploadFile(
  options: UploadFileOptions
): Promise<UploadFileResult> {
  const { saveFileLocally } = await import("./local");

  return saveFileLocally(options);
}

/**
 * Delete a file by full pathname
 * @param pathname - The pathname of the file
 * @returns void
 */
export async function deleteFile(pathname: string): Promise<void> {
  const { deleteFileLocally } = await import("./local");
  return deleteFileLocally(pathname.replace(/^\/+/, ""));
}
