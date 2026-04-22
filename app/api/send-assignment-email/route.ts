import { createClient } from '@/lib/supabase/server'
import { sendAssignmentEmail } from '@/lib/send-email'
import { NextRequest } from 'next/server'
import type { Profile, Video } from '@/lib/types'

export async function POST(request: NextRequest) {
  console.log('[POST /api/send-assignment-email] route HIT — NOTE: the assign action calls sendAssignmentEmail() directly and does NOT call this route')

  // Admin-only
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  console.log('[POST /api/send-assignment-email] auth user:', user?.id ?? 'none')
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()
  console.log('[POST /api/send-assignment-email] profile role:', profile?.role)
  if (profile?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })

  // Body: { videoId, userIds, dueDate? }
  let body: { videoId?: string; userIds?: string[]; dueDate?: string | null }
  try {
    body = await request.json()
  } catch {
    console.error('[POST /api/send-assignment-email] failed to parse JSON body')
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  console.log('[POST /api/send-assignment-email] request body:', JSON.stringify(body))

  const { videoId, userIds, dueDate } = body
  if (!videoId || !Array.isArray(userIds) || userIds.length === 0) {
    console.error('[POST /api/send-assignment-email] missing required fields — videoId:', videoId, 'userIds:', userIds)
    return Response.json({ error: 'videoId and userIds are required' }, { status: 400 })
  }

  // Fetch video and employee details in parallel
  const [{ data: videoData, error: videoError }, { data: employees, error: empError }] = await Promise.all([
    supabase.from('videos').select('id,title,description').eq('id', videoId).single<Video>(),
    supabase.from('profiles').select('id,email,full_name').in('id', userIds),
  ])

  console.log('[POST /api/send-assignment-email] video fetch — data:', videoData, '| error:', videoError)
  console.log('[POST /api/send-assignment-email] employees fetch — data:', employees, '| error:', empError)

  if (!videoData) return Response.json({ error: 'Video not found' }, { status: 404 })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
    `${request.nextUrl.protocol}//${request.nextUrl.host}`
  console.log('[POST /api/send-assignment-email] baseUrl:', baseUrl)

  const typedEmployees = (employees ?? []) as Pick<Profile, 'id' | 'email' | 'full_name'>[]

  const results = await Promise.allSettled(
    typedEmployees.map((emp) => {
      console.log('[POST /api/send-assignment-email] sending to:', emp.email)
      return sendAssignmentEmail({
        to: emp.email,
        employeeName: emp.full_name ?? emp.email,
        videoTitle: videoData.title,
        videoDescription: videoData.description,
        dueDate: dueDate ?? null,
        watchUrl: `${baseUrl}/watch/${videoData.id}`,
      })
    })
  )

  const failed = results.filter((r) => r.status === 'rejected').length
  const sent = results.length - failed
  console.log('[POST /api/send-assignment-email] done — sent:', sent, '| failed:', failed)
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error('[POST /api/send-assignment-email] email', i, 'failed:', r.reason)
    }
  })

  return Response.json({ sent, failed })
}
