import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// Use AUTH_URL for the public-facing URL, fallback to request URL
const getBaseUrl = () => process.env.AUTH_URL || "http://localhost:1337";

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Static assets should be allowed through without authentication
  // Check this BEFORE authentication to prevent redirects
  const isStaticAsset =
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image") ||
    pathname.match(/\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|ico|webp|avif)$/i);

  if (isStaticAsset) {
    const response = NextResponse.next();
    // Static assets - cache aggressively (1 year)
    // Next.js adds content hash to filenames, so these are safe to cache forever
    response.headers.set(
      "Cache-Control",
      "public, max-age=31536000, immutable"
    );
    return response;
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: false, // Allow HTTP for local development
  });

  if (!token) {
    // Don't redirect if already going to login or register
    if (pathname === "/login" || pathname === "/register") {
      return NextResponse.next();
    }

    // Use the configured base URL for the callback
    const baseUrl = getBaseUrl();
    const callbackUrl = encodeURIComponent(`${baseUrl}${pathname}`);

    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${callbackUrl}`, baseUrl)
    );
  }

  if (token && ["/login", "/register"].includes(pathname)) {
    return NextResponse.redirect(new URL("/", getBaseUrl()));
  }

  // Create response and add cache headers
  const response = NextResponse.next();

  // Manifest files - cache for 1 hour (can be updated)
  if (pathname.startsWith("/__manifest") || pathname === "/manifest.json") {
    response.headers.set(
      "Cache-Control",
      "public, max-age=3600, s-maxage=3600"
    );
  }

  // Static data files (.data routes) - cache for 5 minutes
  if (pathname.endsWith(".data")) {
    response.headers.set(
      "Cache-Control",
      "public, max-age=300, s-maxage=300"
    );
  }

  // HTML pages - cache for short period (5 minutes) but allow revalidation
  if (
    (!pathname.includes(".") || pathname.match(/\.(html|htm)$/i)) &&
    !pathname.startsWith("/api/")
  ) {
    response.headers.set(
      "Cache-Control",
      "public, max-age=300, s-maxage=300, must-revalidate"
    );
  }

  // API routes - no cache
  if (pathname.startsWith("/api/")) {
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/api/:path*",
    "/login",
    "/register",
    "/__manifest",
    "/manifest.json",
    "/assets/:path*",
    "/_next/:path*",
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files) - handled above
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};

