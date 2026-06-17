'use client'

// Confirmation shown when an admin tries to close a quiz builder (X button or
// backdrop click) while it has unsaved questions. Renders above the builder
// modal (z-[60] > z-50). Clicking its own backdrop cancels — it never closes
// the underlying builder without an explicit Confirm.

export default function ConfirmCloseDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-zinc-50">Unsaved changes</h3>
        <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
          You have unsaved changes. Are you sure you want to close? Your quiz progress will be lost.
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-400 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
