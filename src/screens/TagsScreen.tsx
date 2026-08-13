import { FullScreen } from '@/app/AppShell'
import { useGoBack } from '@/app/useGoBack'
import { IconTag } from '@tabler/icons-react'
import { Card, Divider } from '@/components/ui/Card'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { Tile } from '@/components/ui/Tile'
import { useTags } from '@/data/queries'

/**
 * The tags that exist, and nothing more.
 *
 * Deliberately read-only. Tags are created and attached from the entry screen,
 * and a full CRUD screen for them is not in the visual refresh's handoff — so
 * this is the list the More screen's count promises, in the new language,
 * rather than an invented editor. Renaming and deleting belong with the next
 * batch of designs.
 */
export function TagsScreen() {
  const goBack = useGoBack('/more')
  const tags = useTags()

  return (
    <FullScreen>
      <ScreenHeader title="Tags" onBack={goBack} size={19} />

      <div className="no-scrollbar flex flex-1 flex-col gap-[14px] overflow-y-auto px-4 pt-2 pb-10">
        {!tags.data ? (
          <p className="px-1 text-[13px] text-ink-muted">
            {tags.error ? 'Could not load tags.' : 'Loading…'}
          </p>
        ) : tags.data.length === 0 ? (
          <p className="px-1 text-[13px] leading-[1.6] text-ink-muted">
            No tags yet. They are a second way to label a transaction, alongside
            its one category — useful for things that cut across categories, like
            a trip or a project.
          </p>
        ) : (
          <>
            <Card>
              {tags.data.map((tag, index) => (
                <div key={tag.id}>
                  {index > 0 && <Divider inset={57} />}
                  <div className="flex items-center gap-[13px] px-4 py-[13px]">
                    <Tile size={36} variant="neutral">
                      <IconTag size={18} stroke={2} />
                    </Tile>
                    <span className="flex-1 truncate text-[15px] font-medium">
                      {tag.name}
                    </span>
                  </div>
                </div>
              ))}
            </Card>
            <p className="px-1 text-[12.5px] leading-[1.5] text-ink-muted">
              Attached to transactions from the entry screen. A transaction has
              exactly one category but any number of tags.
            </p>
          </>
        )}
      </div>
    </FullScreen>
  )
}
