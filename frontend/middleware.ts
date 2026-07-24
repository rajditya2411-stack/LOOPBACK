import { NextRequest, NextResponse } from "next/server";

const PUBLIC_AUTH_ROUTES = ["/login", "/register", "/forgot-password"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionMarker = request.cookies.get("loopback_session")?.value;

  if (pathname === "/") {
    const destination = sessionMarker ? "/dashboard" : "/login";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  const isPublicAuthRoute = PUBLIC_AUTH_ROUTES.includes(pathname);

  if (!sessionMarker && !isPublicAuthRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (sessionMarker && isPublicAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
