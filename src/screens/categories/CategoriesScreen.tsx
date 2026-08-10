import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import { Pill } from '@/components/Pill'
import {
  useCategories,
  useCategoryUsage,
  useDeleteCategory,
  useUpsertCategory,
  type CategoryDraft,
} from '@/data/queries'
import { ICONS } from '@/lib/icons'
import { resolveCategoryColor } from '@/theme/tokens'
import type { Category, CategoryKind } from '@/lib/db'
import { CategoryEditorSheet } from './CategoryEditorSheet'

const TABS: { key: CategoryKind; label: string }[] = [
  { key: 'expense', label: 'Expenses' },
  { key: 'income', label: 'Income' },
  { key: 'transfer', label: 'Transfer' },
]

/**
 * `glyph` and `color` are free-text columns, and the legacy import filled them
 * with values that match neither the icon map nor a palette slot. Normalising on
 * the way into the editor means the sheet opens showing what the row currently
 * renders as — and saving writes a real slot back, which is how those rows get
 * fixed.
 */
const draftFrom = (category: Category): CategoryDraft => ({
  id: category.id,
  name: category.name,
  kind: category.kind,
  glyph: ICONS[category.glyph] ? category.glyph : 'circle',
  color: resolveCategoryColor(category.color),
})

const messageOf = (error: unknown): string | null =>
  error && typeof error === 'object' && 'message' in error
    ? String((error as { message: unknown }).message)
    : error
      ? 'Something went wrong'
      : null

export function CategoriesScreen() {
  const goBack = useGoBack()
  const { data: categories } = useCategories()
  const { data: usage } = useCategoryUsage()
  const upsert = useUpsertCategory()
  const remove = useDeleteCategory()

  const [tab, setTab] = useState<CategoryKind>('expense')
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'edit' | 'delete'>('edit')
  // Kept while the sheet slides away, so the pane does not blank mid-animation.
  const [draft, setDraft] = useState<CategoryDraft | null>(null)
  const [reassignTo, setReassignTo] = useState<string | null>(null)

  const all = useMemo(() => categories ?? [], [categories])
  const rows = useMemo(() => all.filter((c) => c.kind === tab), [all, tab])

  // Rows can only land on another category of the same kind — an expense moved
  // into an income category would flip what every chart says about it.
  const targets = useMemo(
    () => (draft ? all.filter((c) => c.kind === draft.kind && c.id !== draft.id) : []),
    [all, draft],
  )

  const edit = (next: CategoryDraft) => {
    upsert.reset()
    remove.reset()
    setDraft(next)
    setMode('edit')
    setReassignTo(null)
    setOpen(true)
  }

  const patch = (changes: Partial<CategoryDraft>) =>
    setDraft((current) => (current ? { ...current, ...changes } : current))

  const save = () => {
    if (!draft) return
    upsert.mutate(draft, { onSuccess: () => setOpen(false) })
  }

  const destroy = () => {
    if (!draft) return
    remove.mutate(
      { id: draft.id, reassignTo },
      { onSuccess: () => setOpen(false) },
    )
  }

  return (
    <FullScreen>
      <header className="flex flex-none items-center gap-3 px-5 pt-3 pb-2">
        <button onClick={goBack} aria-label="Back" className="text-ink-muted">
          <ChevronLeft size={22} strokeWidth={1.5} />
        </button>
        <h1 className="text-[18px]">Categories</h1>
        <span className="flex-1" />
        <span className="tnum text-[11.5px] text-ink-faint">{all.length} total</span>
      </header>

      <div className="flex flex-none gap-2 px-5 pt-3">
        {TABS.map((option) => (
          <Pill key={option.key} active={tab === option.key} onClick={() => setTab(option.key)}>
            {option.label}
          </Pill>
        ))}
      </div>

      <div
        className="no-scrollbar flex-1 overflow-y-auto px-5"
        // Clears the floating button, so the last row is never trapped under it.
        style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="mt-3.5 h-px" style={{ background: 'var(--color-line)' }} />

        {rows.map((category) => (
          <button
            key={category.id}
            onClick={() => edit(draftFrom(category))}
            className="flex w-full items-center gap-3 py-3.5 text-left"
            style={{ borderBottom: '1px solid var(--color-line-soft)' }}
          >
            <CategoryGlyph
              glyph={category.glyph}
              color={category.color}
              dashed={category.kind === 'transfer'}
            />
            <span className="flex-1 text-[15px]">{category.name}</span>
            <span className="tnum text-[11.5px] text-ink-faint">
              {usage?.[category.id] ?? 0}
            </span>
            <ChevronRight size={18} strokeWidth={1.5} className="text-ink-dim" />
          </button>
        ))}

        <p className="mt-[22px] px-0.5 text-[11.5px] leading-[1.5] text-ink-muted">
          Categories are shared across wallets. Order follows the name, the same as
          the picker.
        </p>
      </div>

      <button
        aria-label="New category"
        onClick={() =>
          edit({ id: 'new', name: '', kind: tab, glyph: 'circle', color: 'slate' })
        }
        className="absolute right-5 z-20 flex size-14 items-center justify-center rounded-full bg-bg text-accent"
        style={{
          bottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
          border: '1px solid var(--color-accent)',
          boxShadow: '0 3px 10px rgba(45,43,43,.16)',
        }}
      >
        <Plus size={24} strokeWidth={1.5} />
      </button>

      {draft && (
        <CategoryEditorSheet
          open={open}
          mode={mode}
          draft={draft}
          usageCount={usage?.[draft.id] ?? 0}
          targets={targets}
          reassignTo={reassignTo}
          busy={upsert.isPending || remove.isPending}
          error={messageOf(mode === 'edit' ? upsert.error : remove.error)}
          onPatch={patch}
          onClose={() => setOpen(false)}
          onSave={save}
          onAskDelete={() => {
            remove.reset()
            setMode('delete')
          }}
          onCancelDelete={() => {
            remove.reset()
            setMode('edit')
            setReassignTo(null)
          }}
          onReassign={setReassignTo}
          onDelete={destroy}
        />
      )}
    </FullScreen>
  )
}
