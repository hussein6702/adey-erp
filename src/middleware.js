import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret-here-123456');

const PUBLIC_ROUTES = ['/login'];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('adey_auth_token')?.value;
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'));

  // 1. Public routes without a token — let them through immediately
  if (isPublicRoute && !token) {
    return NextResponse.next();
  }

  // 2. No token and not public — redirect to login
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // 3. Has a token — verify it
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);

    // Authenticated user visiting login → send to dashboard
    if (isPublicRoute) {
      return NextResponse.redirect(new URL('/', req.url));
    }

    // Attach user context to headers for downstream use
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-user-role', payload.role || 'Staff');
    requestHeaders.set('x-user-department', payload.department || 'None');
    requestHeaders.set('x-user-username', payload.username || '');

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  } catch (err) {
    // Token invalid/expired — clear it and redirect to login
    const response = isPublicRoute
      ? NextResponse.next()
      : NextResponse.redirect(new URL('/login', req.url));
    response.cookies.delete('adey_auth_token');
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - api routes
     * - Next.js internals (_next/)
     * - Static assets (favicon, images, svgs)
     */
    '/((?!api|_next/static|_next/image|_next/webpack-hmr|favicon\\.ico|.*\\.svg$).*)',
  ],
};
