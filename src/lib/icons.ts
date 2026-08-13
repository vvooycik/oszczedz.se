/**
 * Maps the kebab-case glyph names stored in `categories.glyph` /
 * `wallets.glyph` onto Tabler components.
 *
 * The keys are deliberately unchanged from when this map pointed at Lucide.
 * They are data — 59 categories and a handful of wallets hold these strings —
 * so the visual refresh swaps the *values* and leaves the column alone. A few
 * keys therefore read as Lucide names for a Tabler glyph (`utensils` draws
 * `IconToolsKitchen2`); that is the price of not migrating rows to repaint a
 * screen, and it is the right trade.
 *
 * Explicit imports, not a dynamic lookup over the whole library, and the rule
 * is *stricter* here than it was: Lucide shipped 2025 icons and indexing its
 * namespace cost 180 kB gzipped — more than the whole initial bundle — while
 * Tabler ships 5 900. Never `import * as` this package. Adding a glyph means
 * adding a line here, which is the point: the set stays known.
 */
import {
  IconArrowBackUp,
  IconArrowBarToDown,
  IconArrowBarUp,
  IconArrowDown,
  IconArrowDownRight,
  IconArrowUp,
  IconArrowUpRight,
  IconArrowsLeftRight,
  IconBackspace,
  IconBarbell,
  IconBasket,
  IconBolt,
  IconBook,
  IconBrain,
  IconBread,
  IconBriefcase,
  IconBuildingBank,
  IconBus,
  IconCalculator,
  IconCalendar,
  IconCalendarClock,
  IconCar,
  IconCarSuv,
  IconCash,
  IconCategory,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCircle,
  IconCircleDashed,
  IconClock,
  IconCloudUpload,
  IconCoffee,
  IconCoins,
  IconCopy,
  IconCpu,
  IconCreditCard,
  IconCurrencyZloty,
  IconDeviceGamepad2,
  IconDeviceMobile,
  IconDots,
  IconDotsCircleHorizontal,
  IconFileInvoice,
  IconFirstAidKit,
  IconGift,
  IconGripVertical,
  IconHeart,
  IconHeartDollar,
  IconHeartHandshake,
  IconHeartbeat,
  IconHelpCircle,
  IconHome,
  IconInfoCircle,
  IconKey,
  IconList,
  IconLock,
  IconMoon,
  IconPackage,
  IconPalette,
  IconPaw,
  IconPencil,
  IconPercentage,
  IconPigMoney,
  IconPill,
  IconPlane,
  IconPlant2,
  IconPlus,
  IconReceipt,
  IconRepeat,
  IconSalad,
  IconScale,
  IconSchool,
  IconScissors,
  IconScript,
  IconSearch,
  IconSelector,
  IconShieldCheck,
  IconShirt,
  IconShoppingBag,
  IconShoppingCart,
  IconSum,
  IconTag,
  IconTarget,
  IconTicket,
  IconToolsKitchen2,
  IconTrash,
  IconTrendingDown,
  IconTrendingUp,
  IconUmbrella,
  IconUrgent,
  IconUser,
  IconUsers,
  IconWallet,
  IconWifi,
  IconX,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'

/** What every consumer types against, so the library name stays in this file. */
export type GlyphIcon = TablerIcon

export const ICONS: Record<string, GlyphIcon> = {
  'arrow-down': IconArrowDown,
  'arrow-down-right': IconArrowDownRight,
  'arrow-down-to-line': IconArrowBarToDown,
  'arrow-left-right': IconArrowsLeftRight,
  'arrow-up': IconArrowUp,
  'arrow-up-from-line': IconArrowBarUp,
  'arrow-up-right': IconArrowUpRight,
  backspace: IconBackspace,
  banknote: IconCash,
  bolt: IconBolt,
  'book-open': IconBook,
  brain: IconBrain,
  briefcase: IconBriefcase,
  'briefcase-medical': IconFirstAidKit,
  bus: IconBus,
  calculator: IconCalculator,
  calendar: IconCalendar,
  'calendar-clock': IconCalendarClock,
  car: IconCar,
  // A second car silhouette rather than the same one twice: an icon is often the
  // only thing telling two feed rows apart, so a ride share must not draw what
  // `car` draws. Tabler has no taxi.
  'car-taxi-front': IconCarSuv,
  category: IconCategory,
  check: IconCheck,
  'chevron-left': IconChevronLeft,
  'chevron-right': IconChevronRight,
  circle: IconCircle,
  'circle-dashed': IconCircleDashed,
  'circle-ellipsis': IconDotsCircleHorizontal,
  'circle-question-mark': IconHelpCircle,
  clock: IconClock,
  'cloud-upload': IconCloudUpload,
  coffee: IconCoffee,
  copy: IconCopy,
  cpu: IconCpu,
  'credit-card': IconCreditCard,
  croissant: IconBread,
  'currency-zloty': IconCurrencyZloty,
  delete: IconBackspace,
  dumbbell: IconBarbell,
  ellipsis: IconDots,
  'gamepad-2': IconDeviceGamepad2,
  gift: IconGift,
  'graduation-cap': IconSchool,
  'grip-vertical': IconGripVertical,
  'hand-coins': IconCoins,
  // "Giving money away" — the closest Tabler has to Lucide's hand cupping a
  // heart, and unambiguous next to `heart-handshake`.
  'hand-heart': IconHeartDollar,
  handshake: IconHeartHandshake,
  heart: IconHeart,
  'heart-handshake': IconHeartHandshake,
  'heart-pulse': IconHeartbeat,
  house: IconHome,
  info: IconInfoCircle,
  'key-round': IconKey,
  landmark: IconBuildingBank,
  list: IconList,
  lock: IconLock,
  moon: IconMoon,
  package: IconPackage,
  palette: IconPalette,
  'paw-print': IconPaw,
  pencil: IconPencil,
  percent: IconPercentage,
  'piggy-bank': IconPigMoney,
  pill: IconPill,
  plane: IconPlane,
  'plant-2': IconPlant2,
  plus: IconPlus,
  receipt: IconReceipt,
  'receipt-text': IconFileInvoice,
  repeat: IconRepeat,
  salad: IconSalad,
  scale: IconScale,
  scissors: IconScissors,
  scroll: IconScript,
  search: IconSearch,
  selector: IconSelector,
  'shield-check': IconShieldCheck,
  shirt: IconShirt,
  'shopping-bag': IconShoppingBag,
  'shopping-basket': IconBasket,
  'shopping-cart': IconShoppingCart,
  sigma: IconSum,
  siren: IconUrgent,
  smartphone: IconDeviceMobile,
  tag: IconTag,
  target: IconTarget,
  ticket: IconTicket,
  'trash-2': IconTrash,
  'trending-down': IconTrendingDown,
  'trending-up': IconTrendingUp,
  umbrella: IconUmbrella,
  'undo-2': IconArrowBackUp,
  'user-round': IconUser,
  'users-round': IconUsers,
  utensils: IconToolsKitchen2,
  wallet: IconWallet,
  wifi: IconWifi,
  x: IconX,
  zap: IconBolt,
}

/** Falls back to a neutral mark rather than rendering nothing for a typo. */
export const iconFor = (name: string | null | undefined): GlyphIcon =>
  (name && ICONS[name]) || IconCircle

/**
 * App chrome, filtered out of the pickers: nobody wants a chevron for their
 * groceries, and a glyph that also means "close" or "drag me" reads as a
 * control rather than a subject.
 */
const CHROME = new Set([
  'arrow-down-right',
  'arrow-up-right',
  'backspace',
  'check',
  'chevron-left',
  'chevron-right',
  'circle-dashed',
  'delete',
  'ellipsis',
  'grip-vertical',
  'search',
  'selector',
  'x',
])

/**
 * The glyphs a picker shows first.
 *
 * `Object.keys` is alphabetical, which put five arrows and a banknote at the
 * head — the picker's first row was the least likely thing anyone wanted. These
 * are the everyday subjects instead: what people actually spend money on, in
 * rough order of how often a category needs them. Everything else follows
 * alphabetically, and the search field reaches all of it.
 */
const COMMON = [
  'shopping-basket',
  'utensils',
  'coffee',
  'car',
  'house',
  'bus',
  'shopping-bag',
  'heart-pulse',
  'gift',
  'plane',
  'ticket',
  'smartphone',
  'shirt',
  'dumbbell',
  'paw-print',
  'graduation-cap',
  'briefcase',
  'piggy-bank',
  'credit-card',
  'banknote',
  'users-round',
  'repeat',
  'zap',
  'receipt',
]

export const GLYPH_CHOICES = [
  ...COMMON.filter((n) => n in ICONS),
  ...Object.keys(ICONS).filter((n) => !CHROME.has(n) && !COMMON.includes(n)),
]
