import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  IconCategory,
  IconChevronRight,
  IconHome,
  IconSearch,
  IconSelector,
  IconTrash,
  IconWallet,
} from '@tabler/icons-react'
import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { Sheet } from '@/components/Sheet'
import { Card, Divider } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { SegmentedTrack } from '@/components/ui/SegmentedTrack'
import { Tile } from '@/components/ui/Tile'
import { Toggle } from '@/components/ui/Toggle'
import {
  useBudgetProgress,
  useBudgetScope,
  useCategories,
  useDeleteBudget,
  useSaveBudget,
  useWallets,
  type BudgetDraft,
} from '@/data/queries'
import {
  defaultResetsOn,
  nextPeriodNoun,
  perPeriod,
  PERIOD_OPTIONS,
  resetsOnLabel,
} from '@/lib/budgets'
import { GLYPH_CHOICES, iconFor } from '@/lib/icons'
import { asMinor, currencySymbol, formatAmount } from '@/lib/money'
import { keepFocus } from '@/lib/touch'
import { walletGlyph } from '@/lib/wallets'
import { CATEGORY_COLORS, categoryVar, resolveCategoryColor } from '@/theme/tokens'
import type { BudgetPeriod } from '@/lib/db'
import { LimitSheet } from './LimitSheet'
import { ResetsOnSheet } from './ResetsOnSheet'
import { BudgetCategoriesScreen, BudgetWalletsScreen } from './ScopePickers'

const CURRENCY = 'PLN'

/** How many glyphs the grid shows before "Search all" is the way through. */
const GLYPH_PREVIEW = 18

/** Past this many chips the strip stops and counts the rest. */
const CHIP_LIMIT = 6

/**
 * How many budgets ride on Home before a new one arrives switched off.
 *
 * The rail is a horizontal scroller, so it cannot overflow visibly — which is
 * exactly why it needs a ceiling. Four is a screenful at 148px, and past that
 * "See all" is the honest way through rather than a rail nobody scrolls to the
 * end of.
 */
const RAIL_SOFT_CAP = 4

const empty = (railCount: number): BudgetDraft => ({
  id: 'new',
  name: '',
  amount: asMinor(0),
  color: 'slate',
  glyph: 'target',
  period: 'monthly',
  resets_on: 1,
  rollover: false,
  show_on_home: railCount < RAIL_SOFT_CAP,
  home_order: railCount,
  categoryIds: [],
  walletIds: [],
})

/** A selection, drawn as a pill with its own mark. */
function Chip({
  label,
  colour,
  glyph,
}: {
  label: string
  colour: string
  glyph: string
}) {
  const Icon = iconFor(glyph)
  return (
    <span
      className="flex min-w-0 items-center gap-1.5 rounded-full py-[5px] pr-2.5 pl-[7px] text-[12.5px]"
      style={{ background: 'var(--color-tile)' }}
    >
      <Icon size={14} stroke={2} style={{ color: colour, flex: 'none' }} />
      <span className="truncate">{label}</span>
    </span>
  )
}

/** The "Categories" / "Wallets" row and the strip of chips under it. */
function ScopeRow({
  icon,
  title,
  meta,
  chips,
  onOpen,
}: {
  icon: React.ReactNode
  title: string
  meta: string
  chips: { key: string; label: string; colour: string; glyph: string }[]
  onOpen: () => void
}) {
  const shown = chips.slice(0, CHIP_LIMIT)
  const hidden = chips.length - shown.length

  return (
    <div className="px-4 py-[13px]">
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={onOpen}
        className="flex w-full items-center gap-[13px] text-left"
      >
        <Tile size={36} variant="neutral">
          {icon}
        </Tile>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">{title}</span>
          <span className="mt-px block truncate text-[12.5px] text-ink-muted">
            {meta}
          </span>
        </span>
        <IconChevronRight size={18} stroke={2} className="flex-none text-ink-dim" />
      </button>

      {chips.length > 0 && (
        // Indented to the title, not to the tile — the chips are what the row
        // says, so they line up with its words.
        <div className="mt-2.5 flex flex-wrap gap-1.5" style={{ marginLeft: 49 }}>
          {shown.map((chip) => (
            <Chip
              key={chip.key}
              label={chip.label}
              colour={chip.colour}
              glyph={chip.glyph}
            />
          ))}
          {hidden > 0 && (
            <span
              className="tnum flex items-center rounded-full px-2.5 py-[5px] text-[12.5px] text-ink-muted"
              style={{ background: 'var(--color-tile)' }}
            >
              +{hidden}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Creating and editing a budget — one screen, `:id` being what switches it, the
 * same arrangement `/tx/:id/edit` uses.
 *
 * The identity block **follows the first category chosen** until it is touched
 * by hand. A budget over one category is that category with a limit on it, and
 * making someone re-pick its name, colour and glyph is asking a question they
 * have already answered. The handoff asks for the group case to adopt the
 * *largest* member's identity; the first pick is used instead, because "largest"
 * means a spend query this screen otherwise does not need, and the category
 * someone reaches for first is the one the budget is about. Adding a second
 * category never re-themes what is already on screen.
 */
export function BudgetEditScreen() {
  const { id } = useParams()
  const goBack = useGoBack('/budgets')
  const navigate = useNavigate()

  const editing = Boolean(id)
  const categories = useCategories()
  const wallets = useWallets()
  const budgets = useBudgetProgress()
  const scope = useBudgetScope(id)
  const save = useSaveBudget()
  const remove = useDeleteBudget()

  const railCount = (budgets.data ?? []).filter((b) => b.show_on_home).length

  const [draft, setDraft] = useState<BudgetDraft | null>(null)
  // Once the identity has been set by hand it stops following the categories.
  const [touched, setTouched] = useState({ name: false, mark: false })

  const [pane, setPane] = useState<'categories' | 'wallets' | null>(null)
  const [limitOpen, setLimitOpen] = useState(false)
  const [resetsOpen, setResetsOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [glyphQuery, setGlyphQuery] = useState('')
  const [showAllGlyphs, setShowAllGlyphs] = useState(false)
  const iconCard = useRef<HTMLDivElement>(null)

  const row = editing ? (budgets.data ?? []).find((b) => b.budget_id === id) : undefined

  // Deleted from another tab, or a stale deep link: there is nothing to edit and
  // no form to show, so leave rather than sit on a spinner forever.
  useEffect(() => {
    if (editing && budgets.data && !row) navigate('/budgets', { replace: true })
  }, [editing, budgets.data, row, navigate])

  /*
   * Seeded once, on the render where everything it needs has arrived — the same
   * `hydrated` gate `/tx/:id/edit` uses, and for the same reason: a background
   * refetch must not reach in and undo what has been typed. For a new budget
   * that is the rail count; for an existing one, the row and both scopes.
   */
  useEffect(() => {
    if (draft) return
    if (!editing) {
      if (!budgets.data) return
      setDraft(empty(railCount))
      return
    }
    if (!row || !scope.data) return
    setDraft({
      id: row.budget_id,
      name: row.name,
      amount: asMinor(row.limit_amount),
      color: resolveCategoryColor(row.color),
      glyph: row.glyph,
      period: row.period,
      resets_on: row.resets_on,
      rollover: row.rollover,
      show_on_home: row.show_on_home,
      home_order: row.home_order,
      categoryIds: scope.data.categoryIds,
      walletIds: scope.data.walletIds,
    })
    setTouched({ name: true, mark: true })
  }, [draft, editing, budgets.data, railCount, row, scope.data])

  const categoryById = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  )
  const walletById = useMemo(
    () => new Map((wallets.data ?? []).map((w) => [w.id, w])),
    [wallets.data],
  )

  const glyphs = useMemo(() => {
    const q = glyphQuery.trim().toLowerCase()
    if (q) return GLYPH_CHOICES.filter((g) => g.includes(q))
    if (showAllGlyphs) return GLYPH_CHOICES
    const head = GLYPH_CHOICES.slice(0, GLYPH_PREVIEW)
    return head.includes(draft?.glyph ?? '') ? head : [draft?.glyph ?? 'target', ...head.slice(1)]
  }, [glyphQuery, showAllGlyphs, draft?.glyph])

  if (!draft) {
    return (
      <FullScreen>
        <ScreenHeader title={editing ? 'Edit budget' : 'New budget'} onClose={goBack} />
        <p className="px-4 pt-6 text-[13px] text-ink-muted">Loading…</p>
      </FullScreen>
    )
  }

  const patch = (changes: Partial<BudgetDraft>) =>
    setDraft((current) => (current ? { ...current, ...changes } : current))

  /**
   * Applying a category set is where the identity rule lives: the *first* pick
   * names and marks the budget, and only while nothing has been set by hand.
   */
  const applyCategories = (next: string[]) => {
    const lead = next[0] ? categoryById.get(next[0]) : undefined
    patch({
      categoryIds: next,
      ...(lead && !touched.name && draft.name.trim() === '' ? { name: lead.name } : null),
      ...(lead && !touched.mark
        ? { color: resolveCategoryColor(lead.color), glyph: lead.glyph }
        : null),
    })
  }

  const tint = categoryVar(draft.color)
  const named = draft.name.trim() !== ''
  const hasCategories = draft.categoryIds.length > 0
  const canSave = named && draft.amount > 0 && hasCategories && !save.isPending

  const commit = async () => {
    if (!canSave) return
    try {
      await save.mutateAsync(draft)
      navigate('/budgets', { replace: true })
    } catch {
      /* The error is rendered from the mutation below. */
    }
  }

  const failure =
    save.error instanceof Error
      ? save.error.message
      : remove.error instanceof Error
        ? remove.error.message
        : null

  if (pane === 'categories') {
    return (
      <BudgetCategoriesScreen
        categories={categories.data ?? []}
        selected={draft.categoryIds}
        onChange={applyCategories}
        onClose={() => setPane(null)}
      />
    )
  }

  if (pane === 'wallets') {
    return (
      <BudgetWalletsScreen
        wallets={wallets.data ?? []}
        selected={draft.walletIds}
        onChange={(walletIds) => patch({ walletIds })}
        onClose={() => setPane(null)}
      />
    )
  }

  const Mark = iconFor(draft.glyph)

  const categoryChips = draft.categoryIds.flatMap((cid) => {
    const category = categoryById.get(cid)
    return category
      ? [
          {
            key: cid,
            label: category.name,
            colour: categoryVar(category.color),
            glyph: category.glyph,
          },
        ]
      : []
  })

  const walletChips = draft.walletIds.flatMap((wid) => {
    const wallet = walletById.get(wid)
    return wallet
      ? [
          {
            key: wid,
            label: wallet.name,
            colour: categoryVar(wallet.color_scheme),
            glyph: walletGlyph(wallet),
          },
        ]
      : []
  })

  const expenseCount = (categories.data ?? []).filter((c) => c.kind === 'expense').length
  const walletCount = (wallets.data ?? []).length

  return (
    <FullScreen>
      {/* The budget's own colour owns the accent for this screen, the way the
          wallet form and the entry screen do. Overrides --color-accent, not
          --c-accent: a var() resolves against the element that declares it. */}
      <div
        className="flex h-full flex-col"
        style={{ ['--color-accent' as string]: tint }}
      >
        <ScreenHeader title={editing ? 'Edit budget' : 'New budget'} onClose={goBack} />

        <div className="no-scrollbar flex flex-1 flex-col gap-[14px] overflow-y-auto px-4 pt-2 pb-6">
          {failure && <p className="px-1 text-[12.5px] text-expense">{failure}</p>}

          {/* ------------------------------------------------------ identity */}
          <Card className="flex flex-col items-center gap-3.5 p-[18px]">
            <button
              type="button"
              aria-label="Change icon"
              onMouseDown={keepFocus}
              onClick={() =>
                iconCard.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
              className="active:opacity-70"
            >
              <Tile color={tint} size={68}>
                <Mark size={34} stroke={2} />
              </Tile>
            </button>

            <input
              value={draft.name}
              onChange={(e) => {
                setTouched((t) => ({ ...t, name: true }))
                patch({ name: e.target.value })
              }}
              placeholder="Budget name"
              aria-label="Budget name"
              className="w-full rounded-field bg-inset px-3.5 py-3 text-[16px] font-medium caret-accent outline-none placeholder:text-ink-faint"
            />

            <button
              type="button"
              onMouseDown={keepFocus}
              onClick={() => setLimitOpen(true)}
              className="w-full text-center active:opacity-70"
            >
              <span
                className="tnum block"
                style={{
                  fontSize: 38,
                  fontWeight: 600,
                  lineHeight: 1.1,
                  letterSpacing: '-.035em',
                  // Before a limit is entered the figure is a placeholder, not a
                  // value — it has to read as one.
                  color: draft.amount > 0 ? undefined : 'var(--color-ink-faint)',
                }}
              >
                {formatAmount(asMinor(draft.amount))}
                <span
                  className="text-ink-faint"
                  style={{ fontSize: 19, fontWeight: 500, letterSpacing: 0 }}
                >
                  {' '}
                  {currencySymbol(CURRENCY)}
                </span>
              </span>
              <span className="mt-0.5 block text-[12.5px] text-ink-muted">
                {perPeriod(draft.period)}
              </span>
            </button>
          </Card>

          {/* -------------------------------------------------------- colour */}
          <section className="flex flex-col gap-2">
            <Label className="px-1">Colour</Label>
            <Card className="p-[18px]">
              {/* `aspect-square` off the row is right on a phone and enormous at
                  the frame's 512px desktop cap, hence the max-width. */}
              <div className="grid grid-cols-5 justify-items-center gap-2.5">
                {CATEGORY_COLORS.map((slot) => {
                  const active = draft.color === slot
                  return (
                    <button
                      key={slot}
                      type="button"
                      aria-label={slot}
                      aria-pressed={active}
                      onMouseDown={keepFocus}
                      onClick={() => {
                        setTouched((t) => ({ ...t, mark: true }))
                        patch({ color: slot })
                      }}
                      className="aspect-square w-full max-w-14 rounded-tile"
                      style={{
                        background: `var(--color-${slot})`,
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

          {/* ---------------------------------------------------------- icon */}
          <section ref={iconCard} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between px-1">
              <Label>Icon</Label>
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => setShowAllGlyphs((s) => !s)}
                className="text-[12.5px] font-semibold text-accent"
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
                  className="w-full bg-transparent text-[16px] outline-none placeholder:text-ink-faint"
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
                      onClick={() => {
                        setTouched((t) => ({ ...t, mark: true }))
                        patch({ glyph: name })
                      }}
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
                <p className="text-center text-[12.5px] text-ink-muted">
                  No icons match “{glyphQuery}”.
                </p>
              )}
            </Card>
          </section>

          {/* -------------------------------------------------- what counts */}
          <section className="flex flex-col gap-2">
            <Label className="px-1">What counts</Label>
            <Card>
              <ScopeRow
                icon={<IconCategory size={18} stroke={2} />}
                title="Categories"
                meta={
                  hasCategories
                    ? `${draft.categoryIds.length} of ${expenseCount}${
                        draft.categoryIds.length > 1 ? ' · a group' : ''
                      }`
                    : 'Pick at least one category'
                }
                chips={categoryChips}
                onOpen={() => setPane('categories')}
              />
              <Divider inset={65} />
              <ScopeRow
                icon={<IconWallet size={18} stroke={2} />}
                title="Wallets"
                meta={
                  draft.walletIds.length === 0
                    ? 'All wallets'
                    : `${draft.walletIds.length} of ${walletCount} counted`
                }
                chips={walletChips}
                onOpen={() => setPane('wallets')}
              />
            </Card>
            <p className="px-1 text-[12px] leading-[1.5] text-ink-faint">
              Only spend in these categories, made from these wallets, counts
              against the limit. Transfers never do, and a refund gives the limit
              its room back.
            </p>
          </section>

          {/* -------------------------------------------------------- period */}
          <section className="flex flex-col gap-2">
            <Label className="px-1">Period</Label>
            <Card>
              <div className="p-[14px] pb-3">
                <SegmentedTrack
                  options={PERIOD_OPTIONS}
                  value={draft.period}
                  onChange={(period: BudgetPeriod) =>
                    // `resets_on` cannot ride across: the CHECK constraint reads
                    // it against the period, so the 25th is illegal the instant
                    // this becomes weekly.
                    patch({ period, resets_on: defaultResetsOn(period) })
                  }
                />
              </div>

              <Divider inset={0} />
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => setResetsOpen(true)}
                className="flex w-full items-center gap-3 px-4 py-[13px] text-left active:bg-press"
              >
                <span className="flex-1 text-[15px] font-medium">Resets on</span>
                <span className="flex items-center gap-1.5 text-[13px] text-ink-muted">
                  {resetsOnLabel(draft.period, draft.resets_on)}
                  <IconSelector size={17} stroke={2} className="text-ink-dim" />
                </span>
              </button>

              <Divider inset={0} />
              <div className="flex items-center gap-3 px-4 py-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">
                    Roll over what’s left
                  </span>
                  <span className="mt-px block text-[12.5px] text-ink-muted">
                    Adds unspent {currencySymbol(CURRENCY)} to next{' '}
                    {nextPeriodNoun(draft.period)} — one {nextPeriodNoun(draft.period)}
                    , never compounding
                  </span>
                </span>
                <Toggle
                  checked={draft.rollover}
                  onChange={(rollover) => patch({ rollover })}
                  label="Roll over what’s left"
                />
              </div>
            </Card>
          </section>

          {/* -------------------------------------------------- show on home */}
          <Card>
            <div className="flex items-center gap-[13px] px-4 py-[13px]">
              <Tile size={36} color="var(--color-accent)">
                <IconHome size={18} stroke={2} />
              </Tile>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">Show on Home</span>
                <span className="mt-px block text-[12.5px] text-ink-muted">
                  {railCount === 0
                    ? 'Nothing in the rail yet'
                    : `${railCount} budget${railCount === 1 ? '' : 's'} in the rail now`}
                </span>
              </span>
              <Toggle
                checked={draft.show_on_home}
                onChange={(show_on_home) => patch({ show_on_home })}
                label="Show on Home"
              />
            </div>
          </Card>

          {editing && (
            <Card>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex w-full items-center gap-[13px] px-4 py-[13px] text-left active:bg-press"
              >
                <Tile size={36} variant="neutral">
                  <IconTrash size={18} stroke={2} style={{ color: 'var(--color-expense)' }} />
                </Tile>
                <span
                  className="flex-1 text-[15px] font-medium"
                  style={{ color: 'var(--color-expense)' }}
                >
                  Delete budget
                </span>
              </button>
            </Card>
          )}
        </div>

        {/* -------------------------------------------------------- footer */}
        <div className="flex flex-none gap-2.5 px-4 pt-2 pb-[max(env(safe-area-inset-bottom,0px),16px)]">
          <Button variant="secondary" full={false} className="w-24" onClick={goBack}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={commit} disabled={!canSave}>
            {save.isPending
              ? 'Saving…'
              : !hasCategories
                ? 'Pick at least one category'
                : editing
                  ? 'Save'
                  : 'Create budget'}
          </Button>
        </div>

        <LimitSheet
          open={limitOpen}
          onClose={() => setLimitOpen(false)}
          value={draft.amount > 0 ? asMinor(draft.amount) : null}
          onChange={(amount) => patch({ amount })}
          currency={CURRENCY}
          tone={tint}
          periodLabel={perPeriod(draft.period)}
        />

        <ResetsOnSheet
          open={resetsOpen}
          onClose={() => setResetsOpen(false)}
          period={draft.period}
          value={draft.resets_on}
          onChange={(resets_on) => patch({ resets_on })}
        />

        <Sheet
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          height="38%"
          label="Delete budget"
        >
          <div className="flex flex-1 flex-col px-4 pb-[max(env(safe-area-inset-bottom,0px),16px)]">
            <Label>Delete {draft.name}</Label>
            <p className="flex-1 pt-3 text-[14px] leading-[1.55] text-ink-muted">
              The limit and its scope go. <strong className="font-semibold text-ink">
                No transactions are touched
              </strong>{' '}
              — a budget is a lens over spending that already happened, not a
              container for it.
            </p>
            <div className="flex gap-2.5">
              <Button
                variant="secondary"
                full={false}
                className="w-24"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                tone="var(--color-expense)"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(draft.id, {
                    onSuccess: () => navigate('/budgets', { replace: true }),
                  })
                }
              >
                {remove.isPending ? 'Deleting…' : 'Delete budget'}
              </Button>
            </div>
          </div>
        </Sheet>
      </div>
    </FullScreen>
  )
}
