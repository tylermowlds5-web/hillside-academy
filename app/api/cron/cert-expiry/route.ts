import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCertExpiryEmail, sendCertExpiredAdminEmail } from '@/lib/send-email'
import { getAppBaseUrl } from '@/lib/app-url'
import type { CertAward, CertProgram, Profile } from '@/lib/types'

// Daily cert-expiration notifier (Vercel cron, see vercel.json).
//
// Tiers for every unrevoked award with an expiration date:
//   14 < daysLeft <= 30  → employee "1 month" notice
//    0 < daysLeft <= 14  → employee "2 weeks" notice (nearest tier wins; a
//                          missed 1m window still gets this one)
//        daysLeft <= 0   → admins get a digest of newly-expired certs
//                          (bounded to the last 30 days so the first run
//                          doesn't dump the historical backlog)
//
// Duplicate protection: cert_notifications rows are claimed BEFORE sending
// (unique on award_id + kind + expires_at; a conflict means already
// handled). If the send fails the claim is deleted so the next daily run
// retries. Because the key includes expires_at, renewing a cert or editing
// its expiration re-arms the notices for the new date automatically.

const DAY_MS = 24 * 60 * 60 * 1000

type Kind = 'expiry_1m' | 'expiry_2w' | 'expired_admin'

export async function GET(request: NextRequest) {
  // Vercel attaches this header to cron invocations when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = Date.now()
  const horizon = new Date(now + 31 * DAY_MS).toISOString()

  const { data: awards, error: awardsError } = await admin
    .from('cert_awards')
    .select('*')
    .is('revoked_at', null)
    .not('expires_at', 'is', null)
    .lt('expires_at', horizon)
    .returns<CertAward[]>()
  if (awardsError) {
    console.error('[cert-expiry cron] awards query failed:', awardsError.message)
    return Response.json({ error: 'query failed' }, { status: 500 })
  }

  const list = awards ?? []
  if (list.length === 0) return Response.json({ ok: true, sent1m: 0, sent2w: 0, expiredNotices: 0 })

  const userIds = [...new Set(list.map((a) => a.user_id))]
  const programIds = [...new Set(list.map((a) => a.program_id))]
  const [{ data: people }, { data: programs }, { data: admins }] = await Promise.all([
    admin.from('profiles').select('*').in('id', userIds).returns<Profile[]>(),
    admin.from('cert_programs').select('*').in('id', programIds).returns<CertProgram[]>(),
    admin
      .from('profiles')
      .select('*')
      .eq('role', 'admin')
      .eq('is_active', true)
      .returns<Profile[]>(),
  ])
  const personById = new Map((people ?? []).map((p) => [p.id, p]))
  const programById = new Map((programs ?? []).map((p) => [p.id, p]))
  const baseUrl = getAppBaseUrl()

  // Claim a notification slot; false = already sent for this expiration.
  async function claim(award: CertAward, kind: Kind): Promise<boolean> {
    const { data, error } = await admin
      .from('cert_notifications')
      .upsert(
        { award_id: award.id, kind, expires_at: award.expires_at },
        { onConflict: 'award_id,kind,expires_at', ignoreDuplicates: true }
      )
      .select('id')
    if (error) {
      console.error('[cert-expiry cron] claim failed:', error.message)
      return false
    }
    return (data ?? []).length > 0
  }

  async function releaseClaim(award: CertAward, kind: Kind) {
    await admin
      .from('cert_notifications')
      .delete()
      .eq('award_id', award.id)
      .eq('kind', kind)
      .eq('expires_at', award.expires_at)
  }

  let sent1m = 0
  let sent2w = 0
  const newlyExpired: { employeeName: string; certName: string; expiredAt: string; award: CertAward }[] = []

  for (const award of list) {
    const expiresMs = Date.parse(award.expires_at!)
    const daysLeft = (expiresMs - now) / DAY_MS
    const person = personById.get(award.user_id)
    const program = programById.get(award.program_id)
    if (!person || !program) continue

    if (daysLeft <= 0) {
      // Newly-expired → admin digest (skip the deep backlog).
      if (now - expiresMs > 30 * DAY_MS) continue
      if (!(await claim(award, 'expired_admin'))) continue
      newlyExpired.push({
        employeeName: person.full_name ?? person.email,
        certName: program.name,
        expiredAt: award.expires_at!,
        award,
      })
      continue
    }

    // Employee warnings — nearest tier wins; skip deactivated employees.
    if (person.is_active === false) continue
    const kind: Kind = daysLeft <= 14 ? 'expiry_2w' : 'expiry_1m'
    if (daysLeft > 30) continue
    if (!(await claim(award, kind))) continue

    try {
      await sendCertExpiryEmail({
        to: person.email,
        employeeName: person.full_name ?? person.email,
        certName: program.name,
        expiresAt: award.expires_at!,
        certUrl: `${baseUrl}/certs/${award.program_id}`,
        tier: kind === 'expiry_2w' ? '2w' : '1m',
      })
      if (kind === 'expiry_2w') sent2w++
      else sent1m++
    } catch (err) {
      console.error('[cert-expiry cron] employee send failed, releasing claim:', err)
      await releaseClaim(award, kind)
    }
  }

  // Admin digest: one email per active admin covering this run's expirations.
  let expiredNotices = 0
  if (newlyExpired.length > 0) {
    const recipients = admins ?? []
    if (recipients.length === 0) {
      console.error('[cert-expiry cron] no active admins to notify — releasing claims')
      for (const e of newlyExpired) await releaseClaim(e.award, 'expired_admin')
    } else {
      let anySucceeded = false
      for (const adminPerson of recipients) {
        try {
          await sendCertExpiredAdminEmail({
            to: adminPerson.email,
            adminName: adminPerson.full_name ?? adminPerson.email,
            expirations: newlyExpired.map(({ employeeName, certName, expiredAt }) => ({
              employeeName,
              certName,
              expiredAt,
            })),
            rosterUrl: `${baseUrl}/certs/admin/roster`,
          })
          anySucceeded = true
        } catch (err) {
          console.error('[cert-expiry cron] admin send failed:', err)
        }
      }
      if (anySucceeded) {
        expiredNotices = newlyExpired.length
      } else {
        // Nobody got the digest — release so tomorrow's run retries.
        for (const e of newlyExpired) await releaseClaim(e.award, 'expired_admin')
      }
    }
  }

  console.log(
    `[cert-expiry cron] done — 1m: ${sent1m}, 2w: ${sent2w}, expired notices: ${expiredNotices}`
  )
  return Response.json({ ok: true, sent1m, sent2w, expiredNotices })
}
