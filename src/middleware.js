import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret-here-123456');

export async function middleware(req) {
  const token = req.cookies.get('adey_auth_token')?.value;

  const publicRoutes = ['/login'];
  const isPublicRoute = publicRoutes.some(route => req.nextUrl.pathname.startsWith(route));

  if (!token && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      
      // If going to login while authenticated, redirect to root
      if (isPublicRoute) {
        return NextResponse.redirect(new URL('/', req.url));
      }

      // We can also add department headers or role logic if wanted later.
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set('x-user-role', payload.role || 'Staff');
      requestHeaders.set('x-user-department', payload.department || 'None');
      requestHeaders.set('x-user-username', payload.username || '');
      
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });

    } catch (err) {
      console.error('Invalid token:', err);
      if (!isPublicRoute) {
        const response = NextResponse.redirect(new URL('/login', req.url));
        response.cookies.delete('adey_auth_token');
        return response;
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes, some might need protection but we protect those internally)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
