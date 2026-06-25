'use client'

import { useEffect, useState, useCallback } from 'react'

type Usage = {
  totalBytes: number
  objectCount: number
  humanSize: string
  freeTierBytes: number
}

// Listing the whole bucket has a small cost + latency, so we cache the result
// in sessionStorage and reuse it across page loads within the session. The
// admin can force a fresh read with the refresh button.
const CACHE_KEY = 'r2-storage-usage'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

function readCache(): Usage | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { at, data } = JSON.parse(raw) as { at: number; data: Usage }
    if (Date.now() - at > CACHE_TTL_MS) return null
    return data
  } catch {
    return null
  }
}

function writeCache(data: Usage) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }))
  } catch {
    // sessionStorage may be unavailable (private mode quota) — non-fatal.
  }
}

export default function StorageUsageCard() {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUsage = useCallback(async (force = false) => {
    if (!force) {
      const cached = readCache()
      if (cached) {
        setUsage(cached)
        return
      }
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/storage-usage')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `Request failed (${res.status})`)
      }
      const data = (await res.json()) as Usage
      setUsage(data)
      writeCache(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load storage usage')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch once when the card mounts (uses cache if fresh).
  useEffect(() => {
    fetchUsage()
  }, [fetchUsage])

  const percent = usage ? Math.min(100, (usage.totalBytes / usage.freeTierBytes) * 100) : 0
  const barColor = percent > 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
  const freeTierHuman = usage ? formatGB(usage.freeTierBytes) : '10 GB'

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008V11.25zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008V11.25z" />
          </svg>
          <h2 className="text-sm font-semibold text-zinc-200">R2 Storage</h2>
        </div>
        <button
          onClick={() => fetchUsage(true)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M3.985 14.652H-.007m.014 0h4.992v4.992m-4.978-4.992l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          {loading ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : !usage ? (
        <p className="text-sm text-zinc-500">{loading ? 'Reading bucket…' : 'No data yet.'}</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-lg font-bold text-zinc-50">
              {usage.humanSize} <span className="text-sm font-normal text-zinc-400">of {freeTierHuman}</span>
            </span>
            <span className="text-sm font-semibold text-zinc-300 tabular-nums">{percent.toFixed(1)}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div className={`h-full ${barColor} transition-all`} style={{ width: `${percent}%` }} />
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            {usage.objectCount.toLocaleString()} file{usage.objectCount === 1 ? '' : 's'} stored
          </p>
          <p className="text-[11px] text-zinc-600 mt-2 leading-relaxed">
            R2 free tier is {freeTierHuman}; overage runs about $0.015/GB per month.
          </p>
        </>
      )}
    </div>
  )
}

function formatGB(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`
}
