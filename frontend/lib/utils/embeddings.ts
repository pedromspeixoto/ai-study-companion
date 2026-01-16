import { customAlphabet } from "nanoid";

/**
 * Generate a nanoid
 * @returns The nanoid
 */
export const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789");