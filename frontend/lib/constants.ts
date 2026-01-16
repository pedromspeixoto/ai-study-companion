/**
 * The production environment
 * @returns The production environment
 */
export const isProductionEnvironment = process.env.NODE_ENV === "production";

/**
 * The development environment
 * @returns The development environment
 */
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);
