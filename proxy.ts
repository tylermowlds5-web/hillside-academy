import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isAuthRoute = pathname.startsWith('/login')
  const isApiRoute = pathname.startsWith('/api')
  const isStaticRoute =
    pathname.startsWith('/_next') || pathname.includes('.')
  // Server actions POST with a Next-Action header — never redirect them,
  // they expect an action response, not an HTML redirect.
  const isServerAction = Boolean(request.headers.get('next-action'))

  if (isStaticRoute || isApiRoute || isServerAction) {
    return supabaseResponse
  }

  if (!user && !isAuthRoute) {
    // Preserve the originally-requested URL (path + query) as ?next= so
    // email/share links like /watch/[id] resolve correctly after sign-in
    // instead of dumping the user on /dashboard.
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    const intended = pathname + (request.nextUrl.search || '')
    // Avoid pointless ?next=/ or ?next=/login loops.
    if (intended && intended !== '/' && !intended.startsWith('/login')) {
      loginUrl.searchParams.set('next', intended)
    }
    return NextResponse.redirect(loginUrl)
  }

  if (user && isAuthRoute) {
    // Honor ?next= if it points to a same-app path; otherwise default to dashboard.
    const next = request.nextUrl.searchParams.get('next')
    const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
    const targetUrl = request.nextUrl.clone()
    // Reset search params so ?next= doesn't tag along.
    targetUrl.search = ''
    targetUrl.pathname = target.split('?')[0]
    const q = target.split('?')[1]
    if (q) targetUrl.search = '?' + q
    return NextResponse.redirect(targetUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
