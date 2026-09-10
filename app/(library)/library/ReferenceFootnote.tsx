import Link from 'next/link'

// Reminder under every standalone reference page: reading it here is not
// the same as completing it inside a certification module.
export default function ReferenceFootnote() {
  return (
    <p className="mt-10 border-t border-plum/10 pt-5 text-xs text-plum/50">
      Reference copy — reading it here doesn&apos;t count toward a certification. Open the module from{' '}
      <Link href="/certs" className="font-semibold text-emerald-700 hover:underline">
        Certifications
      </Link>{' '}
      to get credit.
    </p>
  )
}
