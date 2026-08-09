import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export function MoreScreen() {
  return (
    <div className="px-5 pt-3.5 pb-40">
      <h1 className="text-[24px]">More</h1>

      <div className="mt-5">
        <Link
          to="/appearance"
          className="flex items-center gap-3 py-4"
          style={{ borderBottom: '1px solid var(--color-line-soft)' }}
        >
          <span className="flex-1 text-[15px]">Appearance</span>
          <span className="font-sans text-[12px] text-ink-faint">Theme &amp; accent</span>
          <ChevronRight size={18} strokeWidth={1.5} className="text-ink-dim" />
        </Link>
      </div>

      <button
        onClick={() => supabase.auth.signOut()}
        className="mt-8 w-full rounded-[4px] py-3 text-[14px] text-ink-muted"
        style={{ border: '1px solid var(--color-line)' }}
      >
        Sign out
      </button>
    </div>
  )
}

/**
 * Placeholder for a tab the redesign names but does not specify. Better an
 * honest empty screen than a fabricated one that implies work exists.
 */
export function ComingSoonScreen({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="px-5 pt-3.5 pb-40">
      <h1 className="text-[24px]">{title}</h1>
      <p className="mt-3 max-w-sm text-[13.5px] leading-[1.6] text-ink-muted">{blurb}</p>
    </div>
  )
}
