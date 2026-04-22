import { createClient } from '@/lib/supabase/server'
import { deleteR2Files } from '@/lib/r2'
import { NextRequest } from 'next/server'

export async function DELETE(request: NextRequest) {
  // Auth check — admin only
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()
  if (profile?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })

  let body: { videoUrl?: string; thumbnailUrl?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { videoUrl, thumbnailUrl } = body

  if (!videoUrl && !thumbnailUrl) {
    return Response.json({ error: 'Provide at least one of videoUrl or thumbnailUrl' }, { status: 400 })
  }

  await deleteR2Files([videoUrl, thumbnailUrl])

  return Response.json({ success: true })
}
