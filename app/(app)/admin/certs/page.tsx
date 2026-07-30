import { redirect } from 'next/navigation'

// The certification builder moved into the cert area (self-contained).
// This stub keeps old bookmarks working; the target is admin-gated.
export default function LegacyAdminCertsRedirect() {
  redirect('/certs/admin')
}
