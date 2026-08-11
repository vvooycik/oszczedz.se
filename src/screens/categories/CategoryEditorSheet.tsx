import { Check, ChevronLeft } from 'lucide-react'
import { Sheet } from '@/components/Sheet'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import { Pill } from '@/components/Pill'
import { GLYPH_CHOICES, iconFor } from '@/lib/icons'
import { CATEGORY_COLORS, categoryVar } from '@/theme/tokens'
import type { CategoryDraft } from '@/data/queries'
import type { Category, CategoryKind } from '@/lib/db'

const KINDS: { key: CategoryKind; label: string }[] = [
  { key: 'expense', label: 'Expense' },
  { key: 'income', label: 'Income' },
  { key: 'transfer', label: 'Transfer' },
]

export function CategoryEditorSheet({
  open,
  mode,
  draft,
  usageCount,
  targets,
  reassignTo,
  busy,
  error,
  onPatch,
  onClose,
  onSave,
  onAskDelete,
  onCancelDelete,
  onReassign,
  onDelete,
}: {
  open: boolean
  mode: 'edit' | 'delete'
  draft: CategoryDraft
  /** How many transactions point at this category today. */
  usageCount: number
  /** Other categories of the same kind — the only places its rows can land. */
  targets: Category[]
  reassignTo: string | null
  busy: boolean
  error: string | null
  onPatch: (patch: Partial<CategoryDraft>) => void
  onClose: () => void
  onSave: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onReassign: (id: string) => void
  onDelete: () => void
}) {
  const named = draft.name.trim()
  // The mark, the selected swatch and the selected glyph all read from the same
  // draft colour, so changing it re-tints the whole sheet at once.
  const tint = categoryVar(draft.color)
  const target = targets.find((c) => c.id === reassignTo)

  return (
    // Taller than the 62% default: the glyph grid needs the room.
    <Sheet
      open={open}
      onClose={onClose}
      height="72%"
      label={draft.id === 'new' ? 'New category' : `Edit ${draft.name}`}
    >
      {mode === 'edit' ? (
        <>
          <div className="flex flex-none items-center px-5 pt-3.5">
            <button onClick={onClose} className="text-[13.5px] text-ink-muted">
              Cancel
            </button>
            <span className="flex-1" />
            <button
              onClick={onSave}
              disabled={!named || busy}
              className="text-[13.5px] text-accent disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>

          {error && (
            <p className="flex-none px-5 pt-1.5 text-center text-[12px] text-expense">
              {error}
            </p>
          )}

          <div className="flex flex-none flex-col items-center gap-3 px-5 pt-2 pb-[18px]">
            <CategoryGlyph
              glyph={draft.glyph}
              color={draft.color}
              size={64}
              ringWidth={1.5}
              dashed={draft.kind === 'transfer'}
            />
            <input
              value={draft.name}
              onChange={(e) => onPatch({ name: e.target.value })}
              placeholder="Category name"
              aria-label="Category name"
              className="w-full bg-transparent pb-1.5 text-center text-[22px] outline-none placeholder:text-ink-dim"
              style={{ borderBottom: '1px solid var(--color-line-soft)' }}
            />
            <div className="flex gap-2">
              {KINDS.map((kind) => (
                <Pill
                  key={kind.key}
                  active={draft.kind === kind.key}
                  onClick={() => onPatch({ kind: kind.key })}
                >
                  {kind.label}
                </Pill>
              ))}
            </div>
          </div>

          {/* Wraps: ten swatches at the old 14px gap overrun a 360px screen by
              a few pixels, and the row is centred so a spill reads as a grid
              rather than a ragged line. */}
          <div className="flex flex-none flex-wrap items-center justify-center gap-x-3 gap-y-2.5 px-5 pb-4">
            {CATEGORY_COLORS.map((color) => {
              const active = draft.color === color
              return (
                <button
                  key={color}
                  aria-label={color}
                  onClick={() => onPatch({ color })}
                  className="flex-none rounded-full"
                  style={{
                    width: active ? 26 : 20,
                    height: active ? 26 : 20,
                    background: `var(--color-${color})`,
                    // A ground-coloured ring holds the swatch off its own halo,
                    // so the selected one reads as larger, not just bolder.
                    border: `2px solid ${active ? 'var(--color-bg)' : 'transparent'}`,
                    boxShadow: active ? `0 0 0 1.5px var(--color-${color})` : 'none',
                  }}
                />
              )
            })}
          </div>

          <div className="mx-5 h-px flex-none" style={{ background: 'var(--color-line-soft)' }} />

          <div className="no-scrollbar flex-1 overflow-y-auto px-5 pt-4 pb-6">
            <div className="grid grid-cols-5 gap-x-2 gap-y-[14px]">
              {GLYPH_CHOICES.map((name) => {
                const Icon = iconFor(name)
                const active = draft.glyph === name
                return (
                  <button
                    key={name}
                    aria-label={name}
                    onClick={() => onPatch({ glyph: name })}
                    className="flex aspect-square items-center justify-center rounded-full"
                    style={{
                      border: `1px solid ${active ? tint : 'transparent'}`,
                      color: active ? tint : 'var(--color-ink-muted)',
                    }}
                  >
                    <Icon size={18} strokeWidth={1.5} />
                  </button>
                )
              })}
            </div>

            {draft.id !== 'new' && (
              <button
                onClick={onAskDelete}
                className="mt-6 w-full rounded-[4px] py-[11px] text-[13.5px]"
                style={{
                  border: '1px solid var(--color-line)',
                  color: 'var(--color-expense)',
                }}
              >
                Delete category
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div
            className="flex flex-none items-center gap-3 px-5 pt-4 pb-2.5"
            style={{ borderBottom: '1px solid var(--color-line-soft)' }}
          >
            <button onClick={onCancelDelete} aria-label="Back" className="text-ink-muted">
              <ChevronLeft size={20} strokeWidth={1.5} />
            </button>
            <span className="flex-1 text-center text-[15px]">Delete {draft.name}</span>
            <span className="w-5" />
          </div>

          <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6">
            <p className="mt-4 text-[13px] leading-[1.55] text-ink-muted">
              {usageCount === 0 ? (
                <>Nothing uses {draft.name} yet, so it can go straight away.</>
              ) : (
                <>
                  <span className="tnum">{usageCount}</span>
                  {usageCount === 1 ? ' transaction uses ' : ' transactions use '}
                  {draft.name}. They keep their amounts and dates — pick where they
                  should land, then the category goes.
                </>
              )}
            </p>

            {error && <p className="mt-3 text-[12px] text-expense">{error}</p>}

            {usageCount > 0 && targets.length === 0 && (
              <p className="mt-4 text-[13px] leading-[1.55] text-ink-muted">
                There is no other {draft.kind} category to move them to.
                Create one first, and this one can go.
              </p>
            )}

            {usageCount > 0 && targets.length > 0 && (
              <>
                <div className="kicker pt-5 pb-2 text-ink-muted">Move them to</div>
                <div className="h-px" style={{ background: 'var(--color-line)' }} />
                {targets.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => onReassign(category.id)}
                    className="flex w-full items-center gap-3 py-[11px] text-left"
                    style={{ borderBottom: '1px solid var(--color-line-soft)' }}
                  >
                    <CategoryGlyph
                      glyph={category.glyph}
                      color={category.color}
                      size={28}
                      dashed={category.kind === 'transfer'}
                    />
                    <span className="flex-1 text-[14px]">{category.name}</span>
                    <Check
                      size={16}
                      strokeWidth={1.5}
                      className="text-accent"
                      style={{ opacity: reassignTo === category.id ? 1 : 0 }}
                    />
                  </button>
                ))}
              </>
            )}

            {(usageCount === 0 || targets.length > 0) && (
              <button
                onClick={onDelete}
                disabled={busy || (usageCount > 0 && !target)}
                className="mt-[22px] w-full rounded-[4px] py-3 text-[14px] disabled:opacity-40"
                style={{
                  border: '1px solid var(--color-expense)',
                  color: 'var(--color-expense)',
                }}
              >
                {usageCount === 0
                  ? `Delete ${draft.name}`
                  : target
                    ? `Move to ${target.name} and delete`
                    : 'Pick a category first'}
              </button>
            )}
          </div>
        </>
      )}
    </Sheet>
  )
}
