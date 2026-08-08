import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge proxy (Next.js 16's replacement for `middleware.ts`).
 *
 * This is a coarse first gate only: it redirects visitors with no session
 * cookie away from the dashboards so they see the login page instead of a
 * flash of empty UI. It deliberately does not verify the JWT signature —
 * doing crypto here would not be a security boundary anyway, because every
 * API route independently authenticates and authorises the request in
 * `lib/auth.ts`. Treat this purely as a navigation nicety.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Presence of the token mirror, not its validity.
  const hasSession = Boolean(request.cookies.get("rf_token")?.value);

  if (pathname.startsWith("/dashboard") && !hasSession) {
    const loginUrl = new URL("/auth/login", request.url);
    // Send the visitor back where they were headed once they sign in.
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Only dashboard navigations need this gate. API routes are excluded because
  // they authenticate themselves and must return 401 JSON, not a redirect.
  matcher: ["/dashboard/:path*"],
};
