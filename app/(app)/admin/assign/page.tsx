import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile, Video, Assignment, Progress, JobRole, UserJobRole } from '@/lib/types'
import { fmtDate } from '@/lib/format-date'
import { deleteAssignment } from '@/app/actions'
import AssignForm from './AssignForm'

function RemoveButton({ assignmentId }: { assignmentId: string }) {
  async function action() {
    'use server'
    await deleteAssignment(assignmentId)
  }
  return (
    <form action={action}>
      <button
        type="submit"
        className="text-xs text-red-500 hover:text-red-400 transition-colors"
      >
        Remove
      </button>
    </form>
  )
}

function StatusBadge({ progress }: { progress: Progress | null }) {
  if (!progress || (progress.percent_watched ?? 0) === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 inline-block" />
        Not Started
      </span>
    )
  }
  if (progress.completed) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        Completed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-400">
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
      In Progress · {Math.round(progress.percent_watched ?? 0)}%
    </span>
  )
}

export default async function AdminAssignPage() {
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
    { data: employees },
    { data: videos },
    { data: assignments },
    { data: roles },
    { data: userRoles },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('role', 'employee').eq('is_active', true).order('full_name'),
    supabase.from('videos').select('*').order('title'),
    supabase
      .from('assignments')
      .select('*, video:videos(title), profile:profiles(full_name, email)')
      .order('assigned_at', { ascending: false }),
    supabase.from('roles').select('*').order('name'),
    supabase.from('user_roles').select('*'),
  ])

  const typedEmployees = (employees ?? []) as Profile[]
  const typedVideos = (videos ?? []) as Video[]
  const typedRoles = (roles ?? []) as JobRole[]
  const typedUserRoles = (userRoles ?? []) as UserJobRole[]
  const typedAssignments = (assignments ?? []) as (Assignment & {
    video: { title: string } | null
    profile: { full_name: string | null; email: string } | null
  })[]

  // ── Fetch progress for all assigned (user_id, video_id) pairs ────────────
  const userIds = [...new Set(typedAssignments.map((a) => a.user_id))]
  const videoIds = [...new Set(typedAssignments.map((a) => a.video_id))]

  const progressMap = new Map<string, Progress>()
  if (userIds.length > 0 && videoIds.length > 0) {
    const { data: progressRows } = await supabase
      .from('progress')
      .select('*')
      .in('user_id', userIds)
      .in('video_id', videoIds)

    for (const p of (progressRows ?? []) as Progress[]) {
      progressMap.set(`${p.user_id}::${p.video_id}`, p)
    }
  }

  return (
    <div className="p-4 sm:p-6 w-full max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-50">Assign Videos</h1>
        <p className="text-zinc-400 text-sm mt-1">Assign training videos to employees</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        {/* Assignments list */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Current Assignments ({typedAssignments.length})
          </h2>
          {typedAssignments.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <p className="text-zinc-500 text-sm">No assignments yet.</p>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Employee</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Video</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Due</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {typedAssignments.map((a) => {
                    const progress = progressMap.get(`${a.user_id}::${a.video_id}`) ?? null
                    return (
                      <tr key={a.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="px-4 py-3 text-zinc-200 whitespace-nowrap">
                          {a.profile?.full_name ?? a.profile?.email ?? a.user_id}
                        </td>
                        <td className="px-4 py-3 text-zinc-300 truncate max-w-[160px]">
                          {a.video?.title ?? a.video_id}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusBadge progress={progress} />
                          {progress?.completed && progress.last_watched_at && (
                            <div className="text-[11px] text-zinc-600 mt-0.5">
                              {fmtDate(progress.last_watched_at)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                          {fmtDate(a.due_date)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <RemoveButton assignmentId={a.id} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Assign form */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            New Assignment
          </h2>
          <AssignForm employees={typedEmployees} videos={typedVideos} roles={typedRoles} userRoles={typedUserRoles} />
        </div>
      </div>
    </div>
  )
}
