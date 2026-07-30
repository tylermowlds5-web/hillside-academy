import { Resend } from 'resend'
import { fmtDate } from './format-date'

const _key = process.env.RESEND_API_KEY
console.log('[send-email] module loaded — RESEND_API_KEY:', _key ? _key.slice(0, 10) + '...' : 'MISSING')
const resend = new Resend(_key)

const FROM = 'Hillside University <training@hlmaintenance.com>'

export interface AssignmentEmailParams {
  to: string
  employeeName: string
  videoTitle: string
  dueDate: string | null       // ISO date string or null
  watchUrl: string             // absolute URL
}

export async function sendAssignmentEmail(params: AssignmentEmailParams) {
  const { to, employeeName, videoTitle, dueDate, watchUrl } = params

  const subject = `New Training Video Assigned: ${videoTitle}`
  console.log('=== sendAssignmentEmail CALLED ===')
  console.log('  to:     ', to)
  console.log('  from:   ', FROM)
  console.log('  subject:', subject)
  console.log('  RESEND_API_KEY:', process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.slice(0, 10) + '...' : 'MISSING')

  const dueLine = dueDate
    ? `<tr>
        <td style="padding-top:16px;">
          <span style="display:inline-block;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:5px 12px;font-size:13px;font-weight:600;color:#92400e;">
            Due&nbsp;${fmtDate(dueDate)}
          </span>
        </td>
      </tr>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>New Training Video Assigned: ${videoTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f4f5;">
  <tr>
    <td align="center" style="padding:40px 20px 48px;">

      <!-- Card wrapper -->
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">

        <!-- Brand header -->
        <tr>
          <td style="background:#10b981;border-radius:12px 12px 0 0;padding:24px 36px;">
            <table cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="padding-right:12px;vertical-align:middle;">
                  <div style="width:36px;height:36px;background:rgba(255,255,255,0.22);border-radius:8px;display:flex;align-items:center;justify-content:center;">
                    <img src="https://pub-82ce9b67aaba4dea9abe240e91ea5b42.r2.dev/brand/icon.png"
                         alt="" width="22" height="22"
                         onerror="this.style.display='none'"
                         style="display:block;" />
                  </div>
                </td>
                <td style="vertical-align:middle;">
                  <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.3px;">Hillside University</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:36px;border-radius:0 0 12px 12px;border:1px solid #e4e4e7;border-top:none;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">

              <!-- Headline -->
              <tr>
                <td style="padding-bottom:6px;">
                  <h1 style="margin:0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.5px;line-height:1.3;">
                    New Training Video Assigned
                  </h1>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:28px;">
                  <p style="margin:0;font-size:15px;color:#71717a;line-height:1.5;">
                    Hi&nbsp;${employeeName.replace(/</g, '&lt;')}, a new training video has been assigned to you.
                  </p>
                </td>
              </tr>

              <!-- Video card -->
              <tr>
                <td style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:20px 22px 22px;">
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                    <tr>
                      <td style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a1a1aa;padding-bottom:6px;">
                        Training Video
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:18px;font-weight:700;color:#18181b;line-height:1.3;">
                        ${videoTitle.replace(/</g, '&lt;')}
                      </td>
                    </tr>
                    ${dueLine}
                  </table>
                </td>
              </tr>

              <!-- CTA button -->
              <tr>
                <td align="center" style="padding:36px 0 28px;">
                  <a href="${watchUrl}"
                     style="display:inline-block;background:#10b981;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:15px 44px;border-radius:10px;letter-spacing:-0.2px;">
                    Watch Video &rarr;
                  </a>
                </td>
              </tr>

              <!-- Fallback link -->
              <tr>
                <td align="center">
                  <p style="margin:0;font-size:12px;color:#a1a1aa;">
                    Or copy this link into your browser:<br>
                    <a href="${watchUrl}" style="color:#10b981;word-break:break-all;">${watchUrl}</a>
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding-top:24px;">
            <p style="margin:0;font-size:12px;color:#a1a1aa;">
              Hillside University &middot; Employee Training Platform
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`

  console.log('  Calling resend.emails.send()...')
  let data: { id?: string } | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let error: any = null
  try {
    const result = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
    })
    data = result.data
    error = result.error
  } catch (thrown) {
    console.error('=== sendAssignmentEmail THREW (resend.emails.send crashed) ===', thrown)
    throw thrown
  }

  console.log('=== sendAssignmentEmail Resend response ===')
  console.log('  data: ', JSON.stringify(data))
  console.log('  error:', JSON.stringify(error))

  if (error) {
    console.error('=== sendAssignmentEmail FAILED ===', JSON.stringify(error))
    throw new Error(error.message ?? 'Resend returned an error')
  }

  console.log('=== sendAssignmentEmail SUCCESS — id:', data?.id, '===')
}

// ── Standalone quiz assignment email ──────────────────────────────────────

export interface StandaloneQuizAssignmentEmailParams {
  to: string
  employeeName: string
  quizTitle: string
  dueDate: string | null
  quizUrl: string              // absolute URL to /quizzes/[quizId]
}

export async function sendStandaloneQuizAssignmentEmail(params: StandaloneQuizAssignmentEmailParams) {
  const { to, employeeName, quizTitle, dueDate, quizUrl } = params

  const subject = `New Quiz Assigned: ${quizTitle}`
  console.log('=== sendStandaloneQuizAssignmentEmail CALLED ===')
  console.log('  to:     ', to)
  console.log('  subject:', subject)

  const dueLine = dueDate
    ? `<tr>
        <td style="padding-top:16px;">
          <span style="display:inline-block;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:5px 12px;font-size:13px;font-weight:600;color:#92400e;">
            Due&nbsp;${fmtDate(dueDate)}
          </span>
        </td>
      </tr>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>New Quiz Assigned: ${quizTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f4f5;">
  <tr>
    <td align="center" style="padding:40px 20px 48px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">
        <tr>
          <td style="background:#10b981;border-radius:12px 12px 0 0;padding:24px 36px;">
            <table cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="padding-right:12px;vertical-align:middle;">
                  <div style="width:36px;height:36px;background:rgba(255,255,255,0.22);border-radius:8px;"></div>
                </td>
                <td style="vertical-align:middle;">
                  <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.3px;">Hillside University</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:36px;border-radius:0 0 12px 12px;border:1px solid #e4e4e7;border-top:none;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="padding-bottom:6px;">
                  <h1 style="margin:0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.5px;line-height:1.3;">
                    New Quiz Assigned
                  </h1>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:28px;">
                  <p style="margin:0;font-size:15px;color:#71717a;line-height:1.5;">
                    Hi&nbsp;${employeeName.replace(/</g, '&lt;')}, a new quiz has been assigned to you.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:20px 22px 22px;">
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                    <tr>
                      <td style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a1a1aa;padding-bottom:6px;">
                        Quiz
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:18px;font-weight:700;color:#18181b;line-height:1.3;">
                        ${quizTitle.replace(/</g, '&lt;')}
                      </td>
                    </tr>
                    ${dueLine}
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:36px 0 28px;">
                  <a href="${quizUrl}"
                     style="display:inline-block;background:#10b981;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:15px 44px;border-radius:10px;letter-spacing:-0.2px;">
                    Take Quiz &rarr;
                  </a>
                </td>
              </tr>
              <tr>
                <td align="center">
                  <p style="margin:0;font-size:12px;color:#a1a1aa;">
                    Or copy this link into your browser:<br>
                    <a href="${quizUrl}" style="color:#10b981;word-break:break-all;">${quizUrl}</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:24px;">
            <p style="margin:0;font-size:12px;color:#a1a1aa;">
              Hillside University &middot; Employee Training Platform
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

  try {
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html })
    if (error) {
      console.error('=== sendStandaloneQuizAssignmentEmail FAILED ===', JSON.stringify(error))
      throw new Error(error.message ?? 'Resend returned an error')
    }
    console.log('=== sendStandaloneQuizAssignmentEmail SUCCESS — id:', data?.id, '===')
  } catch (thrown) {
    console.error('=== sendStandaloneQuizAssignmentEmail THREW ===', thrown)
    throw thrown
  }
}

// ── Learning path assignment email ────────────────────────────────────────

export interface PathAssignmentEmailParams {
  to: string
  employeeName: string
  pathName: string
  pathDescription: string | null
  videoCount: number
  pathsUrl: string
}

export async function sendPathAssignmentEmail(params: PathAssignmentEmailParams) {
  const { to, employeeName, pathName, pathDescription, videoCount, pathsUrl } = params

  const subject = `New Learning Path Assigned: ${pathName}`
  console.log('=== sendPathAssignmentEmail CALLED ===')
  console.log('  to:     ', to)
  console.log('  path:   ', pathName)

  const descriptionRow = pathDescription
    ? `<tr>
        <td style="padding-top:8px;font-size:14px;color:#52525b;line-height:1.65;">
          ${pathDescription.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </td>
      </tr>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>New Learning Path Assigned: ${pathName}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f4f5;">
  <tr>
    <td align="center" style="padding:40px 20px 48px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">
        <tr>
          <td style="background:#10b981;border-radius:12px 12px 0 0;padding:24px 36px;">
            <table cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="padding-right:12px;vertical-align:middle;">
                  <div style="width:36px;height:36px;background:rgba(255,255,255,0.22);border-radius:8px;"></div>
                </td>
                <td style="vertical-align:middle;">
                  <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.3px;">Hillside University</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="background:#ffffff;padding:36px;border-radius:0 0 12px 12px;border:1px solid #e4e4e7;border-top:none;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="padding-bottom:6px;">
                  <h1 style="margin:0;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.5px;line-height:1.3;">
                    New Learning Path Assigned
                  </h1>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:28px;">
                  <p style="margin:0;font-size:15px;color:#71717a;line-height:1.5;">
                    Hi&nbsp;${employeeName.replace(/</g, '&lt;')}, a new learning path has been assigned to you.
                  </p>
                </td>
              </tr>

              <tr>
                <td style="background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:20px 22px 22px;">
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                    <tr>
                      <td style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a1a1aa;padding-bottom:6px;">
                        Learning Path
                      </td>
                    </tr>
                    <tr>
                      <td style="font-size:18px;font-weight:700;color:#18181b;line-height:1.3;">
                        ${pathName.replace(/</g, '&lt;')}
                      </td>
                    </tr>
                    ${descriptionRow}
                    <tr>
                      <td style="padding-top:12px;font-size:13px;color:#71717a;">
                        ${videoCount} video${videoCount === 1 ? '' : 's'} in order
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td align="center" style="padding:36px 0 28px;">
                  <a href="${pathsUrl}"
                     style="display:inline-block;background:#10b981;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:15px 44px;border-radius:10px;letter-spacing:-0.2px;">
                    View Learning Path &rarr;
                  </a>
                </td>
              </tr>

              <tr>
                <td align="center">
                  <p style="margin:0;font-size:12px;color:#a1a1aa;">
                    Or copy this link into your browser:<br>
                    <a href="${pathsUrl}" style="color:#10b981;word-break:break-all;">${pathsUrl}</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding-top:24px;">
            <p style="margin:0;font-size:12px;color:#a1a1aa;">
              Hillside University &middot; Employee Training Platform
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

  try {
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html })
    if (error) {
      console.error('=== sendPathAssignmentEmail FAILED ===', JSON.stringify(error))
      throw new Error(error.message ?? 'Resend returned an error')
    }
    console.log('=== sendPathAssignmentEmail SUCCESS — id:', data?.id, '===')
  } catch (thrown) {
    console.error('=== sendPathAssignmentEmail THREW ===', thrown)
    throw thrown
  }
}

// ── Cert expiration notices (sent by the daily cron) ──────────────────────

// Shared minimal branded shell for the cert notices.
function certEmailShell(title: string, inner: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f4f5;">
  <tr>
    <td align="center" style="padding:40px 20px 48px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">
        <tr>
          <td style="background:#10b981;border-radius:12px 12px 0 0;padding:24px 36px;">
            <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.3px;">Hillside University</span>
            <span style="color:rgba(255,255,255,0.85);font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;display:block;margin-top:2px;">Certification</span>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:36px;border-radius:0 0 12px 12px;border:1px solid #e4e4e7;border-top:none;">
            ${inner}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:24px;">
            <p style="margin:0;font-size:12px;color:#a1a1aa;">
              Hillside University &middot; Employee Training Platform
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

export interface CertExpiryEmailParams {
  to: string
  employeeName: string
  certName: string
  expiresAt: string   // ISO
  certUrl: string     // absolute URL to the program overview
  tier: '1m' | '2w'
}

// Employee warning: 1 month / 2 weeks before a certification expires.
export async function sendCertExpiryEmail(params: CertExpiryEmailParams) {
  const { to, employeeName, certName, expiresAt, certUrl, tier } = params
  const windowText = tier === '1m' ? 'in about a month' : 'in two weeks'
  const subject = `Your ${certName} certification expires ${fmtDate(expiresAt)}`

  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#18181b;">Certification expiring ${windowText}</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3f3f46;">
      Hi ${employeeName}, your <strong>${certName}</strong> certification expires on
      <strong>${fmtDate(expiresAt)}</strong>.
    </p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#3f3f46;">
      Renewing means completing the full course again — every module, in order. Once it
      expires you can start the renewal from the certification page.
    </p>
    <a href="${certUrl}"
       style="display:inline-block;background:#10b981;color:#ffffff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">
      View certification
    </a>`

  const { error } = await resend.emails.send({
    from: FROM, to, subject, html: certEmailShell(subject, inner),
  })
  if (error) {
    console.error('[sendCertExpiryEmail] FAILED', JSON.stringify(error))
    throw new Error(error.message ?? 'Resend returned an error')
  }
}

export interface CertExpiredAdminEmailParams {
  to: string
  adminName: string
  // Newly-expired certs in this run
  expirations: { employeeName: string; certName: string; expiredAt: string }[]
  rosterUrl: string
}

// Admin digest: certs that have just expired (one email per admin per run).
export async function sendCertExpiredAdminEmail(params: CertExpiredAdminEmailParams) {
  const { to, adminName, expirations, rosterUrl } = params
  const subject =
    expirations.length === 1
      ? `Certification expired: ${expirations[0].employeeName} — ${expirations[0].certName}`
      : `${expirations.length} certifications expired`

  const rows = expirations
    .map(
      (e) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f4f4f5;font-size:14px;color:#18181b;">${e.employeeName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f4f4f5;font-size:14px;color:#3f3f46;">${e.certName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f4f4f5;font-size:13px;color:#991b1b;white-space:nowrap;">${fmtDate(e.expiredAt)}</td>
      </tr>`
    )
    .join('')

  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#18181b;">Certification${expirations.length === 1 ? '' : 's'} expired</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3f3f46;">
      Hi ${adminName}, the following certification${expirations.length === 1 ? ' has' : 's have'} expired.
      Renewal requires the employee to re-take the full course; you can also adjust
      expiration dates from the roster.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;border:1px solid #e4e4e7;border-radius:8px;border-collapse:separate;overflow:hidden;">
      <tr style="background:#fafafa;">
        <th align="left" style="padding:8px 12px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Employee</th>
        <th align="left" style="padding:8px 12px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Certification</th>
        <th align="left" style="padding:8px 12px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Expired</th>
      </tr>
      ${rows}
    </table>
    <a href="${rosterUrl}"
       style="display:inline-block;background:#10b981;color:#ffffff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">
      Open the roster
    </a>`

  const { error } = await resend.emails.send({
    from: FROM, to, subject, html: certEmailShell(subject, inner),
  })
  if (error) {
    console.error('[sendCertExpiredAdminEmail] FAILED', JSON.stringify(error))
    throw new Error(error.message ?? 'Resend returned an error')
  }
}
