import type { Progress } from './types'

type ProgressFields = Pick<Progress, 'completed' | 'percent_watched' | 'last_watched_at'>

/**
 * Progress as it relates to a specific assignment. Any progress recorded
 * BEFORE the assignment's `assigned_at` timestamp doesn't count — the
 * employee must re-watch the video for the new assignment.
 */
export type EffectiveProgress = {
  completed: boolean
  percent: number
  started: boolean
}

/**
 * Compute assignment-relative progress. If the employee's last watch event
 * was before the assignment was created, this returns "not started".
 *
 * @param progress    Raw row from the `progress` table (or null if none)
 * @param assignedAt  Assignment's assigned_at timestamp. Pass null to use
 *                    the raw progress unchanged (non-assignment contexts).
 */
export function getEffectiveProgress(
  progress: ProgressFields | null | undefined,
  assignedAt: string | null | undefined
): EffectiveProgress {
  if (!progress) {
    return { completed: false, percent: 0, started: false }
  }

  // No assignment context → show raw progress (e.g. library browsing)
  if (!assignedAt) {
    const pct = progress.percent_watched ?? 0
    return {
      completed: progress.completed,
      percent: pct,
      started: pct > 0,
    }
  }

  // Any progress older than the assignment doesn't count for this assignment.
  // ISO timestamps compare correctly as strings.
  const lastWatchedAt = progress.last_watched_at ?? ''
  if (lastWatchedAt < assignedAt) {
    return { completed: false, percent: 0, started: false }
  }

  const pct = progress.percent_watched ?? 0
  return {
    completed: progress.completed,
    percent: pct,
    started: pct > 0,
  }
}
