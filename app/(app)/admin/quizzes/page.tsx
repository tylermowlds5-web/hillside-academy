import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type {
  Profile,
  Category,
  StandaloneQuiz,
  StandaloneQuizAssignment,
  StandaloneQuizAttempt,
  JobRole,
  UserJobRole,
} from '@/lib/types'
import QuizzesClient from './QuizzesClient'

export default async function AdminQuizzesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const [
    { data: quizzes },
    { data: categories },
    { data: employees },
    { data: roles },
    { data: userRoles },
    { data: assignments },
    { data: attempts },
  ] = await Promise.all([
    supabase.from('standalone_quizzes').select('*').order('created_at', { ascending: false }),
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('profiles').select('*').eq('role', 'employee').eq('is_active', true).order('full_name'),
    supabase.from('roles').select('*').order('name'),
    supabase.from('user_roles').select('*'),
    supabase.from('standalone_quiz_assignments').select('quiz_id, user_id'),
    supabase.from('standalone_quiz_attempts').select('quiz_id'),
  ])

  const typedQuizzes = (quizzes ?? []) as StandaloneQuiz[]
  const typedCategories = (categories ?? []) as Category[]
  const typedEmployees = (employees ?? []) as Profile[]
  const typedRoles = (roles ?? []) as JobRole[]
  const typedUserRoles = (userRoles ?? []) as UserJobRole[]
  const typedAssignments = (assignments ?? []) as Pick<StandaloneQuizAssignment, 'quiz_id' | 'user_id'>[]
  const typedAttempts = (attempts ?? []) as Pick<StandaloneQuizAttempt, 'quiz_id'>[]

  // Per-quiz counts for the list. Cheap aggregations done in app code so we
  // don't need a separate DB view.
  const assignedCount = new Map<string, number>()
  for (const a of typedAssignments) {
    assignedCount.set(a.quiz_id, (assignedCount.get(a.quiz_id) ?? 0) + 1)
  }
  const attemptCount = new Map<string, number>()
  for (const a of typedAttempts) {
    attemptCount.set(a.quiz_id, (attemptCount.get(a.quiz_id) ?? 0) + 1)
  }

  return (
    <div className="p-4 sm:p-6 w-full max-w-5xl mx-auto">
      <QuizzesClient
        quizzes={typedQuizzes}
        categories={typedCategories}
        employees={typedEmployees}
        roles={typedRoles}
        userRoles={typedUserRoles}
        assignedCount={Object.fromEntries(assignedCount)}
        attemptCount={Object.fromEntries(attemptCount)}
      />
    </div>
  )
}
