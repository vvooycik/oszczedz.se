import { createContext, use } from 'react'
import { useGoBack } from './useGoBack'
import { Modal } from './Modal'

/**
 * True while a screen is being rendered inside a centred modal.
 *
 * Read by `FullScreen`, which is the one thing every one of those screens has
 * in common: a context is what lets Categories, Tags, Scheduled, the budget
 * editor and both wallet forms present as dialogs **without a line changing in
 * any of them**. The alternative was a `modal` prop threaded through six
 * components and their route elements, for a fact none of them has any use for.
 */
const InModal = createContext(false)

export const useInModal = () => use(InModal)

/**
 * Presents a full-screen route as a centred dialog, for the wide layouts.
 *
 * These screens are *forms* — they were full-screen on a phone because there is
 * nowhere else to be, not because they wanted the window. Replacing a 1440px
 * desktop with a category editor throws away the list it was started from for
 * no gain.
 *
 * Closing goes through `useGoBack`, the same call the screen's own close button
 * makes, so a modal dismissed by Escape or by the scrim lands exactly where one
 * dismissed by its X does — including the `/` fallback when the route was a
 * cold deep link with no history behind it.
 */
export function ModalScreen({
  children,
  width = 720,
}: {
  children: React.ReactNode
  width?: number
}) {
  const goBack = useGoBack()

  return (
    <InModal value={true}>
      <Modal onClose={goBack} width={width} fill>
        {children}
      </Modal>
    </InModal>
  )
}
