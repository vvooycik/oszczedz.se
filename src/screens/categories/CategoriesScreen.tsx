import { useMemo, useState } from 'react'
import { IconChevronRight, IconPlus } from '@tabler/icons-react'
import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import { Card, Divider } from '@/components/ui/Card'
import { ActionTile } from '@/components/ui/Button'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { SegmentedTrack } from '@/components/ui/SegmentedTrack'
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
      <ScreenHeader
        title="Categories"
        onBack={goBack}
        size={19}
        actions={
          <ActionTile
            label="New category"
            onClick={() =>
              edit({ id: 'new', name: '', kind: tab, glyph: 'circle', color: 'slate' })
            }
          >
            <IconPlus size={20} stroke={2} />
          </ActionTile>
        }
      />

      <div className="flex-none px-4 pt-2">
        <SegmentedTrack options={TABS} value={tab} onChange={setTab} />
      </div>

      <div
        className="no-scrollbar flex flex-1 flex-col gap-[14px] overflow-y-auto px-4 pt-3.5"
        style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom, 0px))' }}
      >
        <Card>
          {rows.map((category, index) => (
            <div key={category.id}>
              {index > 0 && <Divider inset={57} />}
              <button
                onClick={() => edit(draftFrom(category))}
                className="flex w-full items-center gap-[13px] px-4 py-[13px] text-left active:bg-press"
              >
                <CategoryGlyph
                  glyph={category.glyph}
                  color={category.color}
                  size={36}
                  dashed={category.kind === 'transfer'}
                />
                <span className="flex-1 truncate text-[15px] font-medium">
                  {category.name}
                </span>
                <span className="tnum text-[12px] text-ink-dim">
                  {usage?.[category.id] ?? 0}
                </span>
                <IconChevronRight size={18} stroke={2} className="flex-none text-ink-dim" />
              </button>
            </div>
          ))}
        </Card>

        <p className="px-1 text-[12.5px] leading-[1.5] text-ink-muted">
          {all.length} in total, shared across wallets. Order follows the name, the
          same as the picker — a wallet's own set is what changes that.
        </p>
      </div>

      {draft && open && (
        <CategoryEditorSheet
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
