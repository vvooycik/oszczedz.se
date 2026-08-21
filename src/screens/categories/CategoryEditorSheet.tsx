import { IconCheck, IconSearch, IconTrash } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { FullScreen } from '@/app/AppShell'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import { Card, Divider } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { Button } from '@/components/ui/Button'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { SegmentedTrack } from '@/components/ui/SegmentedTrack'
import { Tile } from '@/components/ui/Tile'
import { GLYPH_CHOICES, iconFor } from '@/lib/icons'
import { keepFocus } from '@/lib/touch'
import { CATEGORY_COLORS, categoryVar } from '@/theme/tokens'
import type { CategoryDraft } from '@/data/queries'
import type { Category, CategoryKind } from '@/lib/db'

const KINDS: { key: CategoryKind; label: string }[] = [
  { key: 'expense', label: 'Expense' },
  { key: 'income', label: 'Income' },
  { key: 'transfer', label: 'Transfer' },
]

/** How many glyphs the grid shows before "Search all" is the way through. */
const GLYPH_PREVIEW = 18

/**
 * Creating and editing a category, as a full screen rather than the sheet it
 * used to be.
 *
 * The colour and glyph pickers are the content, not a detail: eleven swatches
 * and eighty-three glyphs never sat comfortably in 72% of a phone with a
 * keyboard raised. On a screen they get room, and the preview at the top can be
 * big enough to actually judge — which is the whole point of editing a mark.
 */
export function CategoryEditorSheet({
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
  const [glyphQuery, setGlyphQuery] = useState('')
  const [showAllGlyphs, setShowAllGlyphs] = useState(false)

  const named = draft.name.trim()
  const isNew = draft.id === 'new'
  // The mark, the selected swatch and the selected glyph all read from the same
  // draft colour, so changing it re-tints the whole screen at once.
  const tint = categoryVar(draft.color)
  const target = targets.find((c) => c.id === reassignTo)

  const glyphs = useMemo(() => {
    const q = glyphQuery.trim().toLowerCase()
    if (q) return GLYPH_CHOICES.filter((g) => g.includes(q))
    if (showAllGlyphs) return GLYPH_CHOICES
    // The chosen glyph is pinned into the preview even when it sits past the
    // cut, so the grid always shows what is currently selected.
    const head = GLYPH_CHOICES.slice(0, GLYPH_PREVIEW)
    return head.includes(draft.glyph) ? head : [draft.glyph, ...head.slice(1)]
  }, [glyphQuery, showAllGlyphs, draft.glyph])

  if (mode === 'delete') {
    return (
      <FullScreen overlay>
        <ScreenHeader title={`Delete ${draft.name}`} onBack={onCancelDelete} />

        <div className="no-scrollbar flex flex-1 flex-col gap-[14px] overflow-y-auto px-4 pt-2 pb-8">
          <p className="px-1 text-link leading-[1.55] text-ink-muted">
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

          {error && <p className="px-1 text-meta text-expense">{error}</p>}

          {usageCount > 0 && targets.length === 0 && (
            <p className="px-1 text-link leading-[1.55] text-ink-muted">
              There is no other {draft.kind} category to move them to. Create one
              first, and this one can go.
            </p>
          )}

          {usageCount > 0 && targets.length > 0 && (
            <section className="flex flex-col gap-2">
              {/* Same kind only: an expense moved into an income category would
                  flip what every chart says about it. */}
              <Label className="px-1">Move them to</Label>
              <Card>
                {targets.map((category, index) => (
                  <div key={category.id}>
                    {index > 0 && <Divider inset={57} />}
                    <button
                      type="button"
                      onClick={() => onReassign(category.id)}
                      className="flex w-full items-center gap-[13px] px-4 py-[13px] text-left active:bg-press"
                    >
                      <CategoryGlyph
                        glyph={category.glyph}
                        color={category.color}
                        size={36}
                        dashed={category.kind === 'transfer'}
                      />
                      <span className="flex-1 truncate text-row font-medium">
                        {category.name}
                      </span>
                      {reassignTo === category.id && (
                        <span className="flex size-[22px] flex-none items-center justify-center rounded-full bg-accent text-accent-fg">
                          <IconCheck size={14} stroke={2.5} />
                        </span>
                      )}
                    </button>
                  </div>
                ))}
              </Card>
            </section>
          )}
        </div>

        {(usageCount === 0 || targets.length > 0) && (
          <div className="flex-none px-4 pt-2 pb-[max(env(safe-area-inset-bottom,0px),16px)]">
            <Button
              tone="var(--color-expense)"
              onClick={onDelete}
              disabled={busy || (usageCount > 0 && !target)}
            >
              {usageCount === 0
                ? `Delete ${draft.name}`
                : target
                  ? `Move to ${target.name} and delete`
                  : 'Pick a category first'}
            </Button>
          </div>
        )}
      </FullScreen>
    )
  }

  return (
    <FullScreen overlay>
      <div
        className="flex h-full flex-col"
        style={{ ['--color-accent' as string]: tint }}
      >
        <ScreenHeader
          title={isNew ? 'New category' : 'Edit category'}
          onClose={onClose}
        />

        <div className="no-scrollbar flex flex-1 flex-col gap-[14px] overflow-y-auto px-4 pt-2 pb-8">
          {error && <p className="px-1 text-meta text-expense">{error}</p>}

          <Card className="flex flex-col items-center gap-4 p-[18px]">
            <CategoryGlyph
              glyph={draft.glyph}
              color={draft.color}
              size={68}
              dashed={draft.kind === 'transfer'}
            />
            <input
              value={draft.name}
              onChange={(e) => onPatch({ name: e.target.value })}
              placeholder="Category name"
              aria-label="Category name"
              className="w-full rounded-field bg-inset px-4 py-3 text-center text-field font-medium caret-accent outline-none placeholder:text-ink-faint"
            />
            <SegmentedTrack
              className="w-full"
              options={KINDS}
              value={draft.kind}
              onChange={(kind) => onPatch({ kind })}
            />
          </Card>

          <section className="flex flex-col gap-2">
            <Label className="px-1">Colour</Label>
            <Card className="p-[18px]">
              {/* Same cap as the accent strip on More: five `aspect-square`
                  cells sized off the row are fine on a phone and enormous at
                  the frame's 512px desktop width. */}
              <div className="grid grid-cols-5 justify-items-center gap-2.5">
                {CATEGORY_COLORS.map((color) => {
                  const active = draft.color === color
                  return (
                    <button
                      key={color}
                      type="button"
                      aria-label={color}
                      aria-pressed={active}
                      // The name field above is usually focused; without this the
                      // tap only dismisses the keyboard. See `keepFocus`.
                      onMouseDown={keepFocus}
                      onClick={() => onPatch({ color })}
                      className="aspect-square w-full max-w-14 rounded-tile"
                      style={{
                        background: `var(--color-${color})`,
                        boxShadow: active
                          ? '0 0 0 2px var(--color-card), 0 0 0 4px var(--color-accent)'
                          : undefined,
                      }}
                    />
                  )
                })}
              </div>
            </Card>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between px-1">
              <Label>Icon</Label>
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => setShowAllGlyphs((s) => !s)}
                className="text-meta font-semibold text-accent"
              >
                {showAllGlyphs ? 'Show fewer' : `Search all ${GLYPH_CHOICES.length}`}
              </button>
            </div>

            {showAllGlyphs && (
              <label className="flex h-11 items-center gap-2 rounded-full bg-inset px-4">
                <IconSearch size={18} stroke={2} className="flex-none text-ink-dim" />
                <input
                  value={glyphQuery}
                  onChange={(e) => setGlyphQuery(e.target.value)}
                  placeholder="Search icons"
                  inputMode="search"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full bg-transparent text-field outline-none placeholder:text-ink-faint"
                />
              </label>
            )}

            <Card className="p-[18px]">
              <div className="grid grid-cols-6 justify-items-center gap-2">
                {glyphs.map((name) => {
                  const Icon = iconFor(name)
                  const active = draft.glyph === name
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-label={name}
                      aria-pressed={active}
                      onMouseDown={keepFocus}
                      onClick={() => onPatch({ glyph: name })}
                      className="flex aspect-square w-full max-w-13 items-center justify-center rounded-tile-sm"
                      style={
                        active
                          ? {
                              background: `color-mix(in oklab, ${tint} var(--tile-mix), transparent)`,
                              color: tint,
                            }
                          : {
                              background: 'var(--color-tile)',
                              color: 'var(--color-ink-muted)',
                            }
                      }
                    >
                      <Icon size={21} stroke={2} />
                    </button>
                  )
                })}
              </div>
              {glyphs.length === 0 && (
                <p className="text-center text-meta text-ink-muted">
                  No icons match “{glyphQuery}”.
                </p>
              )}
            </Card>
          </section>

          {!isNew && (
            <Card>
              <button
                type="button"
                onClick={onAskDelete}
                className="flex w-full items-center gap-[13px] px-4 py-[13px] text-left active:bg-press"
              >
                <Tile size={36} variant="neutral">
                  <IconTrash
                    size={18}
                    stroke={2}
                    style={{ color: 'var(--color-expense)' }}
                  />
                </Tile>
                <span
                  className="flex-1 text-row font-medium"
                  style={{ color: 'var(--color-expense)' }}
                >
                  Delete category
                </span>
              </button>
            </Card>
          )}
        </div>

        <div className="flex-none px-4 pt-2 pb-[max(env(safe-area-inset-bottom,0px),16px)]">
          <Button onClick={onSave} disabled={!named || busy}>
            {busy ? 'Saving…' : isNew ? 'Create category' : 'Save changes'}
          </Button>
        </div>
      </div>
    </FullScreen>
  )
}
