import PlantPage from './PlantPage'
import PageBlocks from './PageBlocks'
import { RICH_TEXT_CLASSES } from './richText'
import type { CertPage } from '@/lib/types'

// The content of one cert page (plant reference, block page, or legacy
// rich-text page) with nothing around it: no progress, no read-to-complete
// footer, no stepper. The cert module stepper wraps the same PlantPage /
// PageBlocks components with its own completion mechanics; the standalone
// /library reference view renders this as-is.
export type ReferencePageContent = Pick<
  CertPage,
  'kind' | 'title' | 'body' | 'image_url' | 'image_position' | 'plant_data' | 'blocks'
>

export default function ReferencePageBody({ page }: { page: ReferencePageContent }) {
  if (page.kind === 'plant') {
    return page.plant_data ? (
      <PlantPage plant={page.plant_data} />
    ) : (
      <p className="rounded-xl border border-plum/10 bg-white p-6 text-sm text-plum/60">
        This plant page has no content yet. Let an admin know.
      </p>
    )
  }

  if ((page.blocks?.length ?? 0) > 0) {
    return (
      <div>
        {page.title && (
          <h2 className="mb-4 font-serif text-xl font-semibold text-plum sm:text-2xl">{page.title}</h2>
        )}
        <PageBlocks blocks={page.blocks ?? []} alt={page.title ?? 'Page'} />
      </div>
    )
  }

  const img = page.image_url && (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={page.image_url}
      alt=""
      className={
        page.image_position === 'left'
          ? 'float-left mr-4 mb-2 w-1/2 max-w-xs rounded-xl border border-plum/10'
          : page.image_position === 'right'
            ? 'float-right ml-4 mb-2 w-1/2 max-w-xs rounded-xl border border-plum/10'
            : 'mb-4 mt-1 max-h-96 w-full rounded-xl border border-plum/10 object-cover'
      }
    />
  )

  return (
    <div className="rounded-2xl border border-plum/10 bg-white p-6 shadow-sm sm:p-8">
      {page.title && (
        <h2 className="mb-4 font-serif text-xl font-semibold text-plum">{page.title}</h2>
      )}
      <div className="flow-root">
        {page.image_position !== 'bottom' && img}
        {page.body ? (
          <div className={RICH_TEXT_CLASSES} dangerouslySetInnerHTML={{ __html: page.body }} />
        ) : (
          <p className="text-sm text-plum/50">This page has no content yet.</p>
        )}
        {page.image_position === 'bottom' && img}
      </div>
    </div>
  )
}
