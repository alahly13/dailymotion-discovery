import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/config/public-env";
import { ADMIN_COOKIE_NAME, verifyAdminSession } from "@/lib/admin/session";
import { isUserAdmin } from "@/lib/auth/authorization";

/**
 * Public routes accessible without an authenticated session.
 */
function isPublicRoute(pathname: string): boolean {
  if (
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/admin/login" ||
    pathname === "/api/admin/logout" ||
    pathname === "/api/admin/session" ||
    pathname === "/api/discovery/auth-status" ||
    pathname === "/api/health"
  ) {
    return true;
  }
  return false;
}

/**
 * Admin-only routes requiring administrator privileges.
 */
function isAdminRoute(pathname: string): boolean {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return true;
  }
  if (
    pathname.startsWith("/api/admin/") &&
    pathname !== "/api/admin/login" &&
    pathname !== "/api/admin/logout" &&
    pathname !== "/api/admin/session"
  ) {
    return true;
  }
  return false;
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  let response = NextResponse.next({ request });

  let supabaseUser: { id: string; email?: string | null } | null = null;

  // 1. Supabase SSR session validation and cookie refresh
  if (publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    try {
      const supabase = createServerClient(
        publicEnv.NEXT_PUBLIC_SUPABASE_URL,
        publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
              response = NextResponse.next({ request });
              cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
            },
          },
        }
      );

      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        supabaseUser = data.user;
      }
    } catch {
      // In offline/test environments, gracefully fall through
    }
  }

  // 2. Secondary administrator session check (HMAC stateless cookie)
  const adminCookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const adminSession = verifyAdminSession(adminCookie);

  const isAuthenticated = Boolean(supabaseUser) || Boolean(adminSession);
  const isAdmin = isUserAdmin(supabaseUser) || Boolean(adminSession);

  // 3. Unauthenticated access control: redirect or 401
  if (!isAuthenticated && !isPublicRoute(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Authentication required to access this resource.",
          reason: "unauthenticated",
        },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        }
      );
    }

    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("returnUrl", `${pathname}${request.nextUrl.search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 4. Authenticated visitor navigating to /login -> redirect to return destination or /
  if (isAuthenticated && pathname === "/login") {
    const rawReturn = request.nextUrl.searchParams.get("returnUrl") || "/";
    // Prevent open redirect by ensuring destination starts with "/" and not "//"
    const safeReturn = rawReturn.startsWith("/") && !rawReturn.startsWith("//") ? rawReturn : "/";
    return NextResponse.redirect(new URL(safeReturn, request.url));
  }

  // 5. Admin-only route authorization enforcement
  if (isAdminRoute(pathname)) {
    if (!isAdmin) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            ok: false,
            error: "Administrator authorization required.",
            reason: "forbidden",
          },
          {
            status: 403,
            headers: {
              "Cache-Control": "no-store, no-cache, must-revalidate",
            },
          }
        );
      }

      // Non-admin visiting admin page: redirect to dashboard with notice
      const dashboardUrl = new URL("/", request.url);
      dashboardUrl.searchParams.set("error", "unauthorized_admin_area");
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return response;
}
