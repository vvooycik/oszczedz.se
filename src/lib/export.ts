import { supabase } from './supabase'
import { today } from './dates'
import type { Category, Transaction, Wallet } from './db'

/**
 * Every transaction as a CSV the user can keep.
 *
 * **Paged, because the history is longer than one response.** PostgREST caps a
 * response at 1000 rows and enforces it by silently truncating — no error, just
 * a short array that parses perfectly — and there are over five thousand rows.
 * An unpaged select here would produce a file that looks complete and quietly
 * stops in 2024. `range()` walks it a page at a time until a short page says
 * the end has been reached.
 */
const PAGE = 1000

async function allTransactions(): Promise<Transaction[]> {
  const rows: Transaction[] = []

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

/**
 * Quotes a field for CSV.
 *
 * Always quoted rather than only when needed: category and wallet names are
 * free text in Polish, notes are free text in anything, and one comma in one
 * note is enough to shift every column after it. Embedded quotes are doubled,
 * which is what RFC 4180 asks for and what spreadsheets read back.
 */
const cell = (value: string | number | null): string =>
  `"${String(value ?? '').replace(/"/g, '""')}"`

/**
 * `status` carries the settled/planned split rather than the export dropping
 * planned rows.
 *
 * Filtering them out would produce a file that quietly disagrees with the app —
 * subscriptions visible under Upcoming and absent from the download — while
 * including them unmarked would make a spreadsheet total read as money already
 * spent. A column says which is which and lets the spreadsheet decide.
 */
const HEADERS = [
  'date',
  'amount',
  'currency',
  'wallet',
  'category',
  'kind',
  'status',
  'note',
  'transfer_id',
  'schedule_id',
  'created_at',
]

export async function buildTransactionsCsv(
  wallets: Wallet[],
  categories: Category[],
): Promise<string> {
  const rows = await allTransactions()
  const on = today()
  const walletOf = new Map(wallets.map((w) => [w.id, w]))
  const categoryOf = new Map(categories.map((c) => [c.id, c]))

  const lines = [HEADERS.join(',')]

  for (const tx of rows) {
    const wallet = walletOf.get(tx.wallet_id)
    const category = categoryOf.get(tx.category_id)
    lines.push(
      [
        cell(tx.date),
        // Major units with a dot, because that is what a spreadsheet will read
        // as a number. Money is minor units *inside* the app (invariant 1);
        // this is the display layer, and a CSV is a display.
        cell((tx.amount / 100).toFixed(2)),
        cell(wallet?.currency ?? ''),
        cell(wallet?.name ?? ''),
        cell(category?.name ?? ''),
        cell(category?.kind ?? ''),
        cell(tx.date > on ? 'planned' : 'settled'),
        cell(tx.note),
        cell(tx.transfer_id),
        cell(tx.schedule_id),
        cell(tx.created_at),
      ].join(','),
    )
  }

  return lines.join('\n')
}

/** Hands the file to the browser. Nothing leaves the device. */
export function downloadCsv(csv: string, filename: string) {
  // A BOM, so Excel opens it as UTF-8 rather than mangling the Polish names.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
