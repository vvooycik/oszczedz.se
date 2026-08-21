import { Block, Code, Section, Spec } from './parts'

/**
 * The frame contract, written down because the next thing this app does is grow
 * a second and third form factor and every one of these numbers is currently a
 * phone assumption with no name.
 */
export function Layout() {
  return (
    <>
      <Section
        id="frame"
        title="The frame"
        lead={
          <>
            The app is a <b>fixed-height box with one scrolling region</b>, not a
            scrolling document. That is what keeps the dock and the add button
            put while content moves — a full-page scroll drags them off-screen on
            iOS.
          </>
        }
      >
        <Block title="Contract">
          <div className="flex flex-col">
            <Spec label="Width cap" spec="max-w-lg = 32rem = 512px">
              Declared in three places: <Code>AppShell</Code>,{' '}
              <Code>FullScreen</Code>, <Code>LoginPage</Code>. Centred with{' '}
              <Code>mx-auto</Code>; everything past it is bare ground.
            </Spec>
            <Spec label="Height" spec="useViewportHeight()">
              Measured <Code>window.innerHeight</Code>, with <Code>100svh</Code>{' '}
              only as the first-paint fallback. Never <Code>100dvh</Code> — the
              dynamic unit is stale on a cold standalone launch — and never a
              fixed box stretched to <Code>bottom: 0</Code>, which resolves
              against a viewport 62pt shorter than the screen.
            </Spec>
            <Spec label="Top inset" spec="--safe-top">
              <Code>max(env(safe-area-inset-top), 12px)</Code>. The 12px floor is
              for the browser and desktop, where the safe area is zero. A screen
              with a full-bleed colour field spends the inset as its own padding
              instead, so the tint reaches the top of the web view.
            </Spec>
            <Spec label="Bottom lane" spec="DOCK_SPACER = 96">
              Reserved as <Code>&lt;main&gt;</Code>'s padding — one number
              declared once, rather than a <Code>pb-40</Code> remembered on every
              screen. Full-screen routes with their own add button reserve the
              same lane by hand.
            </Spec>
            <Spec label="Sticky headers" spec="−var(--safe-top) margin">
              A sticky element measures its offsets against the scrollport, which
              is the padding box — so <Code>top: 0</Code> alone parks it 12px
              down. Pull up by the inset and add it back as padding.
            </Spec>
          </div>
        </Block>

        <Block
          title="Screen kinds"
          note="Three, and they are not interchangeable."
        >
          <div className="flex flex-col">
            <Spec label="Tabbed" spec="AppShell + Outlet">
              Home, Wallets, Insights, Budgets, More. Shares one scroll region
              and the dock.
            </Spec>
            <Spec label="Full screen" spec="FullScreen">
              Covers the tabs entirely; arrives through{' '}
              <Code>ScreenTransition</Code> — detail screens push in from the
              right, entry and creation forms present from the bottom. Never
              animated on a POP.
            </Spec>
            <Spec label="Overlay" spec="FullScreen overlay">
              A screen presented over another as a child rather than a route —
              the category editor above the categories list. Takes its size from
              the parent instead of re-measuring.
            </Spec>
          </div>
        </Block>
      </Section>

      <Section
        id="ios"
        title="Platform constraints"
        lead="Four rules that look like styling choices and are not. Any form-factor work has to carry them or knowingly drop them."
      >
        <Block title="Rules">
          <div className="flex flex-col">
            <Spec label="16px field floor" spec="Hard">
              iOS zooms the viewport when a focused field is smaller and never
              zooms back out, leaving the app scrolled sideways. Safari has
              ignored <Code>user-scalable=no</Code> since iOS 10, so font size is
              the only lever. index.css floors{' '}
              <Code>input, select, textarea, button</Code>, but a Tailwind
              utility beats an element selector — so every field must state its
              own size.
            </Spec>
            <Spec label="Status bar stays default" spec="Not black-translucent">
              With a translucent bar iOS hands the standalone app a web view 62pt
              shorter than the screen and the dock strands above a strip that
              cannot be painted. Changing that meta needs the app deleted from
              the home screen and re-added.
            </Spec>
            <Spec label="Keyboard is visual-viewport only" spec="useKeyboardInset">
              <Code>innerHeight</Code> deliberately does not move when iOS raises
              the keyboard. A sheet spends the inset on <Code>bottom</Code> and
              clamps its height, so it sits <i>on</i> the keyboard rather than
              behind it.
            </Spec>
            <Spec label="A blurring tap is spent" spec="keepFocus">
              iOS moves focus, starts retracting the keyboard, and the click
              never reaches the button underneath. On{' '}
              <Code>onMouseDown</Code> only — never{' '}
              <Code>onPointerDown</Code>, which React listens to non-passively.
            </Spec>
          </div>
        </Block>
      </Section>

      <Section
        id="formfactor"
        title="Second form factor"
        lead={
          <>
            Nothing here is built. This is the inventory of what a tablet or
            desktop layout has to answer, gathered while writing the reference
            above — the audit lists the code-level blockers separately.
          </>
        }
      >
        <Block title="What the 512px cap currently hides">
          <div className="flex flex-col">
            <Spec label="One column, always" spec="No breakpoints in the app">
              The source contains <b>no</b> <Code>sm:</Code> / <Code>md:</Code> /{' '}
              <Code>lg:</Code> utilities outside this page. Every screen is a
              single column that happens to be capped; there is no wide layout to
              fall back to, and none to break either.
            </Spec>
            <Spec label="The dock is bottom-centre" spec="absolute, 60px, 26 up">
              Five cells with only the active one labelled. Measured at 390px the
              nav is 288 wide and the widest pill is 107 — there is no room for a
              sixth tab. On a desktop this is a rail, not a bar, and the labelling
              rule stops being necessary.
            </Spec>
            <Spec label="Sheets are bottom drawers" spec="76% of the frame">
              Drag-to-dismiss, keyboard-aware. On a wide screen the same content
              wants to be a centred panel, which changes the dismiss gesture and
              the keyboard handling with it.
            </Spec>
            <Spec label="aspect-square needs a cap" spec="Already bitten once">
              Swatch strips and icon grids size themselves off the row they sit
              in. At 512px the six accent swatches became 72px slabs; each now
              pairs <Code>w-full</Code> with a <Code>max-w-*</Code>. Any wider
              frame re-opens that class of bug everywhere.
            </Spec>
            <Spec label="Charts are width-driven" spec="ECharts + hand-rolled SVG">
              ECharts resizes; the hand-rolled SVGs scale uniformly with{' '}
              <Code>width: 100%</Code> and <Code>height: auto</Code>, never{' '}
              <Code>preserveAspectRatio: none</Code>, which would widen every
              stroke with the card.
            </Spec>
            <Spec label="Touch targets" spec="44px">
              Sized for a thumb. A pointer wants 28–32, which means the 44px
              pseudo-element padding is a mobile-only rule rather than a
              universal one.
            </Spec>
          </div>
        </Block>
      </Section>
    </>
  )
}
