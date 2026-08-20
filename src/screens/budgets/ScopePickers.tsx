import { useMemo, useState } from 'react'
import { IconAsterisk, IconCheck, IconSearch } from '@tabler/icons-react'
import { FullScreen } from '@/app/AppShell'
import { CategoryGlyph } from '@/components/CategoryGlyph'
import { Card, Divider } from '@/components/ui/Card'
import { Label } from '@/components/ui/Label'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { Tile } from '@/components/ui/Tile'
import { iconFor } from '@/lib/icons'
import { keepFocus } from '@/lib/touch'
import { activeWallets, labelForWalletType, walletGlyph } from '@/lib/wallets'
import { categoryVar } from '@/theme/tokens'
import type { Category, Wallet } from '@/lib/db'

/**
 * The two halves of "What counts". Both are membership lists and nothing more —
 * no order to arrange, which is the one thing that makes them simpler than the
 * per-wallet category picker they are modelled on.
 *
 * They take over the editor's frame rather than opening in a drawer, for the
 * same reason the per-wallet category picker moved out of one: fifty-odd rows
 * and a search field do not fit in 72% of a phone once the keyboard is up. The
 * editor stays mounted while they are open — it is the same component returning
 * a different tree — so the draft they write into is never rebuilt.
 */

/** The 22px square both lists check. */
function CheckBox({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      aria-hidden
      title={label}
      className="flex size-[22px] flex-none items-center justify-center rounded-[7px]"
      style={
        on
          ? { background: 'var(--color-accent)', color: 'var(--color-accent-fg)' }
          : { border: '1.5px solid var(--color-ink-dim)' }
      }
    >
      {on && <IconCheck size={14} stroke={2.5} />}
    </span>
  )
}

function PickRow({
  onToggle,
  selected,
  label,
  children,
  meta,
}: {
  onToggle: () => void
  selected: boolean
  label: string
  children: React.ReactNode
  meta?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      // The search field above is usually focused, and on iOS a tap that blurs
      // it is spent doing only that — see `keepFocus`.
      onMouseDown={keepFocus}
      onClick={onToggle}
      className="flex w-full items-center gap-[13px] px-4 py-[13px] text-left active:bg-press"
    >
      {children}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{label}</span>
        {meta && (
          <span className="mt-px block truncate text-[12.5px] text-ink-muted">{meta}</span>
        )}
      </span>
      <CheckBox on={selected} label={label} />
    </button>
  )
}

/**
 * Categories a budget counts.
 *
 * **Expense categories only.** `budget_spend` requires `kind = 'expense'`, so
 * offering an income or transfer category would be offering a choice that can
 * never change a figure — the budget would look configured and count nothing.
 *
 * The set cannot be empty, and the header says so rather than the footer of the
 * screen behind it: an empty set means "every expense category", which is a
 * coherent thing for the database to hold and never what someone naming a
 * budget "Eating out" meant.
 */
export function BudgetCategoriesScreen({
  categories,
  selected,
  onChange,
  onClose,
}: {
  categories: Category[]
  selected: string[]
  onChange: (next: string[]) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')

  const spendable = useMemo(
    () => categories.filter((c) => c.kind === 'expense'),
    [categories],
  )

  const byId = useMemo(() => new Map(spendable.map((c) => [c.id, c])), [spendable])
  const chosen = useMemo(
    () => selected.map((id) => byId.get(id)).filter((c): c is Category => Boolean(c)),
    [selected, byId],
  )

  const rest = useMemo(() => {
    const q = query.trim().toLowerCase()
    return spendable
      .filter((c) => !selected.includes(c.id))
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : true))
  }, [spendable, selected, query])

  const toggle = (id: string) =>
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    )

  return (
    <FullScreen>
      <ScreenHeader
        title="Categories"
        onClose={onClose}
        actions={
          <button
            type="button"
            onClick={onClose}
            disabled={selected.length === 0}
            className="px-1 text-[14px] font-semibold text-accent disabled:opacity-40"
          >
            Done
          </button>
        }
      />

      <div className="no-scrollbar flex flex-1 flex-col gap-[14px] overflow-y-auto px-4 pt-2 pb-10">
        <p className="px-1 text-[12.5px] leading-[1.5] text-ink-muted">
          {selected.length === 0
            ? `Pick at least one. Only spend in these ${spendable.length} expense categories can count against the limit.`
            : `${selected.length} of ${spendable.length} counted. Spend anywhere else is invisible to this budget.`}
        </p>

        {chosen.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between px-1">
              <Label>Counted</Label>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[12.5px] font-semibold text-accent"
              >
                Clear
              </button>
            </div>
            <Card>
              {chosen.map((category, index) => (
                <div key={category.id}>
                  {index > 0 && <Divider inset={57} />}
                  <PickRow
                    selected
                    label={category.name}
                    onToggle={() => toggle(category.id)}
                  >
                    <CategoryGlyph
                      glyph={category.glyph}
                      color={category.color}
                      size={36}
                    />
                  </PickRow>
                </div>
              ))}
            </Card>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between px-1">
            <Label>
              {chosen.length > 0 ? 'Everything else' : 'All expense categories'}
            </Label>
            {rest.length > 0 && (
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => onChange([...selected, ...rest.map((c) => c.id)])}
                className="text-[12.5px] font-semibold text-accent"
              >
                {/* Counted, and it counts what is *visible*: under a search this
                    adds the matches, not the whole list, so the label has to say
                    the number rather than "Select all". */}
                Add all {rest.length}
              </button>
            )}
          </div>

          <label className="flex h-11 flex-none items-center gap-2 rounded-full bg-inset px-4">
            <IconSearch size={18} stroke={2} className="flex-none text-ink-dim" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${rest.length} categories`}
              inputMode="search"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full bg-transparent text-[16px] outline-none placeholder:text-ink-faint"
            />
          </label>

          {rest.length > 0 ? (
            <Card>
              {rest.map((category, index) => (
                <div key={category.id}>
                  {index > 0 && <Divider inset={57} />}
                  <PickRow
                    selected={false}
                    label={category.name}
                    onToggle={() => toggle(category.id)}
                  >
                    <CategoryGlyph
                      glyph={category.glyph}
                      color={category.color}
                      size={36}
                    />
                  </PickRow>
                </div>
              ))}
            </Card>
          ) : (
            <p className="px-1 pt-1 text-[12.5px] text-ink-muted">
              {query.trim()
                ? `No categories match “${query}”.`
                : // Worth saying out loud now that one tap gets here: the set is
                  // the categories that exist today, so a category made next
                  // month has to be added to this budget by hand.
                  'Every expense category is counted — including none made later.'}
            </p>
          )}
        </section>
      </div>
    </FullScreen>
  )
}

/**
 * Wallets a budget counts, with "All wallets" as a row rather than as five
 * checks.
 *
 * That row is the stored state, not a shortcut for selecting everything: an
 * empty `budget_wallets` set is what the database reads as "any wallet", so a
 * budget that says "all" keeps saying it when a sixth wallet is opened next
 * year. Ticking every wallet by hand would not.
 *
 * Archived wallets are offered anyway. A budget's period can be a year, and a
 * wallet closed in March still spent money in February — leaving it out would
 * silently drop that spend from a figure that used to include it.
 */
export function BudgetWalletsScreen({
  wallets,
  selected,
  onChange,
  onClose,
}: {
  wallets: Wallet[]
  /** Empty is the `'all'` state. */
  selected: string[]
  onChange: (next: string[]) => void
  onClose: () => void
}) {
  const all = selected.length === 0
  const active = activeWallets(wallets)
  const closed = wallets.filter((w) => !active.includes(w))

  const toggle = (id: string) =>
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    )

  const row = (wallet: Wallet) => {
    const Icon = iconFor(walletGlyph(wallet))
    return (
      <PickRow
        selected={selected.includes(wallet.id)}
        label={wallet.name}
        meta={labelForWalletType(wallet.type)}
        onToggle={() => toggle(wallet.id)}
      >
        <Tile color={categoryVar(wallet.color_scheme)} size={36}>
          <Icon size={18} stroke={2} />
        </Tile>
      </PickRow>
    )
  }

  return (
    <FullScreen>
      <ScreenHeader
        title="Wallets"
        onClose={onClose}
        actions={
          <button
            type="button"
            onClick={onClose}
            className="px-1 text-[14px] font-semibold text-accent"
          >
            Done
          </button>
        }
      />

      <div className="no-scrollbar flex flex-1 flex-col gap-[14px] overflow-y-auto px-4 pt-2 pb-10">
        <p className="px-1 text-[12.5px] leading-[1.5] text-ink-muted">
          {all
            ? 'Spend from any wallet counts, including wallets opened later.'
            : `Only spend from these ${selected.length} counts. The same purchase made from another wallet is invisible to this budget.`}
        </p>

        <Card>
          <button
            type="button"
            aria-pressed={all}
            onClick={() => onChange([])}
            className="flex w-full items-center gap-[13px] px-4 py-[13px] text-left active:bg-press"
          >
            <Tile size={36} variant="neutral">
              <IconAsterisk size={18} stroke={2} />
            </Tile>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">All wallets</span>
              <span className="mt-px block text-[12.5px] text-ink-muted">
                Including any added later
              </span>
            </span>
            <CheckBox on={all} label="All wallets" />
          </button>
        </Card>

        <section className="flex flex-col gap-2">
          <Label className="px-1">Or pick wallets</Label>
          <Card
            // Dimmed rather than disabled: the rows still work, and tapping one
            // is how you leave "all" — which is what someone reaching for a
            // greyed row is trying to do.
            style={{ opacity: all ? 0.55 : 1 }}
          >
            {active.map((wallet, index) => (
              <div key={wallet.id}>
                {index > 0 && <Divider inset={57} />}
                {row(wallet)}
              </div>
            ))}
          </Card>
        </section>

        {closed.length > 0 && (
          <section className="flex flex-col gap-2">
            <Label className="px-1">Closed</Label>
            <Card style={{ opacity: all ? 0.55 : 1 }}>
              {closed.map((wallet, index) => (
                <div key={wallet.id}>
                  {index > 0 && <Divider inset={57} />}
                  {row(wallet)}
                </div>
              ))}
            </Card>
          </section>
        )}
      </div>
    </FullScreen>
  )
}
