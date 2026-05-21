import { Resend } from 'resend'
import { fmtDate } from './format-date'

const _key = process.env.RESEND_API_KEY
console.log('[send-email] module loaded — RESEND_API_KEY:', _key ? _key.slice(0, 10) + '...' : 'MISSING')
const resend = new Resend(_key)

const FROM = 'Hillside Academy <training@hlmaintenance.com>'

export interface AssignmentEmailParams {
  to: string
  employeeName: string
  videoTitle: string
  videoDescription: string | null
  dueDate: string | null       // ISO date string or null
  watchUrl: string             // absolute URL
}

export async function sendAssignmentEmail(params: AssignmentEmailParams) {
  const { to, employeeName, videoTitle, videoDescription, dueDate, watchUrl } = params

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

  const descriptionRow = videoDescription
    ? `<tr>
        <td style="padding-top:8px;font-size:14px;color:#52525b;line-height:1.65;">
          ${videoDescription.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
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
                  <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.3px;">Hillside Academy</span>
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
                    ${descriptionRow}
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
              Hillside Academy &middot; Employee Training Platform
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                  <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.3px;">Hillside Academy</span>
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
              Hillside Academy &middot; Employee Training Platform
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
