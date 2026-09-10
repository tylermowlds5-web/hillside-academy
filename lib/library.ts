import type { SupabaseClient } from '@supabase/supabase-js'
import type { CertPage } from '@/lib/types'

// One cert page opened as standalone reference (/library/plant/[id] and
// /library/page/[id]), with the lesson and section it lives in for context.
export type ReferencePage = CertPage & {
  lessonTitle: string | null
  sectionName: string | null
}

// Loads a cert page for the reference library. Returns null when the page
// doesn't exist or the id isn't a uuid. Drafts (needs_review) load like any
// other page — the flag only hides a page from the cert stepper — and the
// caller shows a "Draft" tag.
export async function loadReferencePage(db: SupabaseClient, id: string): Promise<ReferencePage | null> {
  const { data: page } = await db.from('cert_pages').select('*').eq('id', id).maybeSingle<CertPage>()
  if (!page) return null

  const [modRes, catRes] = await Promise.all([
    db
      .from('cert_requirements')
      .select('lesson_title')
      .eq('id', page.requirement_id)
      .maybeSingle<{ lesson_title: string | null }>(),
    page.category_id
      ? db.from('cert_categories').select('name').eq('id', page.category_id).maybeSingle<{ name: string }>()
      : Promise.resolve({ data: null as { name: string } | null }),
  ])

  return {
    ...page,
    lessonTitle: modRes.data?.lesson_title ?? null,
    sectionName: catRes.data?.name ?? null,
  }
}

// Strips the **bold** markers plant fields may carry (PlantPage renders them
// as emphasis; lists and titles want plain text).
export const unbold = (s: string | undefined | null): string => (s ?? '').replace(/\*\*/g, '').trim()
