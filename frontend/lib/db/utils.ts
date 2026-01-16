import { genSaltSync, hashSync } from "bcrypt-ts";

/**
 * Generate a hashed password
 * @param password - The password to hash
 * @returns The hashed password
 */
export function generateHashedPassword(password: string) {
  const salt = genSaltSync(10);
  const hash = hashSync(password, salt);

  return hash;
}
