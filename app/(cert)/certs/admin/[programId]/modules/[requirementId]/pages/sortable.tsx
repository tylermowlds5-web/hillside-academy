'use client'

import type { ReactNode } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── Drag-and-drop plumbing shared by the plant form and the text page
// block editor (same pattern as the pages list itself). Draft rows carry a
// client-only key from newKey() so dnd has stable ids; forms strip the
// keys when saving.

let keySeq = 0
export const newKey = () => `row-${Date.now()}-${keySeq++}`

export function SortableRow({
  id,
  className,
  children,
}: {
  id: string
  className: string
  // Render prop: receives the drag handle so each row places it in its own
  // layout (inline for line rows, in the header strip for cards).
  children: (handle: ReactNode) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const handle = (
    <div
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing text-plum/40 hover:text-plum/60 px-1 touch-none select-none flex-shrink-0"
    >
      <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
        <circle cx="3" cy="3" r="1.5" /><circle cx="9" cy="3" r="1.5" />
        <circle cx="3" cy="8" r="1.5" /><circle cx="9" cy="8" r="1.5" />
        <circle cx="3" cy="13" r="1.5" /><circle cx="9" cy="13" r="1.5" />
      </svg>
    </div>
  )
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={className}
    >
      {children(handle)}
    </div>
  )
}

export function SortableList<T extends { key: string }>({
  items,
  onReorder,
  className,
  children,
}: {
  items: T[]
  onReorder: (next: T[]) => void
  className: string
  children: ReactNode
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((x) => x.key === active.id)
    const newIndex = items.findIndex((x) => x.key === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(items, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((x) => x.key)} strategy={verticalListSortingStrategy}>
        <div className={className}>{children}</div>
      </SortableContext>
    </DndContext>
  )
}
