import {
  IconCategory,
  IconCloudUpload,
  IconDots,
  IconHome,
  IconPalette,
  IconRepeat,
  IconTag,
  IconTarget,
  IconTrendingUp,
  IconWallet,
} from '@tabler/icons-react'
import type { GlyphIcon } from '@/lib/icons'

export type NavItem = {
  to: string
  label: string
  Icon: GlyphIcon
  /** Match the path exactly — only `/`, which would otherwise match everything. */
  end?: boolean
}

/**
 * The five destinations, in one place.
 *
 * Extracted from `TabBar` when the sidebar arrived, because the dock and the
 * sidebar are the *same* navigation drawn at two sizes — a second copy of this
 * array is how a tab added on a phone quietly fails to appear on a desktop.
 */
export const TABS: NavItem[] = [
  { to: '/', label: 'Home', Icon: IconHome, end: true },
  { to: '/wallets', label: 'Wallets', Icon: IconWallet },
  { to: '/insights', label: 'Insights', Icon: IconTrendingUp },
  { to: '/budgets', label: 'Budgets', Icon: IconTarget },
  { to: '/more', label: 'More', Icon: IconDots },
]

/**
 * The four the desktop sidebar labels. **More is not a tab there** — a sidebar
 * is exactly what More was standing in for on a phone, so its rows are drawn
 * directly, below, instead of behind a fifth destination that would open a
 * screen listing what is already on screen.
 */
export const SIDEBAR_TABS = TABS.filter((t) => t.to !== '/more')

/**
 * What the primary action makes, per tab. The button keeps one place and one
 * shape and only its destination moves — the dock's rule, and the sidebar's
 * full-width button follows it so the two cannot disagree about what the plus
 * on a given screen does.
 *
 * **Budgets is in here now, and it was a real inconsistency that it was not.**
 * The budgets work argued that the plus should stay a transaction everywhere
 * and that a budget is made from the 38px tile in the list's own title row.
 * That reasoning does not survive the button growing a *label*: a sidebar
 * reading "New transaction" while standing on the Budgets screen — one row
 * below a Wallets screen where the same button reads "New wallet" — is the map
 * telling two different stories about itself.
 *
 * One entry, so both places change together. That is the whole point of the map
 * and the reason a sidebar-only version of it would be worse than the bug: the
 * dock's plus on `/budgets` now makes a budget too. It leaves the screen with
 * two ways to start one, which is exactly what `/wallets` has already had since
 * that screen got its own title-row plus — so the two screens agree, which is
 * what was being asked for.
 */
export const CREATES: Record<string, { label: string; to: string }> = {
  '/wallets': { label: 'New wallet', to: '/wallets/new' },
  '/budgets': { label: 'New budget', to: '/budgets/new' },
}

export const DEFAULT_CREATE = { label: 'New transaction', to: '/add' }

/** The dock's shorter word for the same button, where a pill has no room. */
export const DEFAULT_CREATE_SHORT = 'Add transaction'

/**
 * The `More` screen's Data group, promoted into the sidebar.
 *
 * `count` names which query answers the trailing figure; the sidebar owns the
 * queries, since a module of constants should not be a component in disguise.
 */
export const DATA_LINKS: (NavItem & {
  count: 'categories' | 'tags' | 'schedules'
})[] = [
  {
    to: '/categories',
    label: 'Categories',
    Icon: IconCategory,
    count: 'categories',
  },
  { to: '/tags', label: 'Tags', Icon: IconTag, count: 'tags' },
  {
    to: '/scheduled',
    label: 'Scheduled',
    Icon: IconRepeat,
    count: 'schedules',
  },
]

export const APPEARANCE: NavItem = {
  to: '/appearance',
  label: 'Appearance',
  Icon: IconPalette,
}

export const EXPORT_GLYPH: GlyphIcon = IconCloudUpload
