-- Visual refresh: the appearance model changes shape, and wallet glyphs start
-- meaning something.
--
-- Two accents are retired and two arrive, and the four-step ground tint becomes
-- a single switch. Both are CHECK-constrained columns, so the data has to move
-- before the constraints do.

-- ------------------------------------------------------------------- accents
--
-- `claret` and `olive` are gone from the palette. Map rather than reset: the
-- user picked a colour deliberately and a default would silently discard it.
-- claret -> copper is the nearest surviving warm hue; olive -> moss is the
-- nearest green. Kept in step with RETIRED_ACCENTS in src/theme/theme.ts and
-- the same table duplicated in the pre-paint script in index.html.

alter table user_settings drop constraint user_settings_accent_check;

update user_settings
set accent = case accent
  when 'claret' then 'copper'
  when 'olive'  then 'moss'
  else accent
end
where accent in ('claret', 'olive');

alter table user_settings add constraint user_settings_accent_check
  check (accent in ('gold', 'copper', 'ink', 'moss', 'plum', 'slate'));

-- --------------------------------------------------------------------- tint
--
-- The ground no longer takes the accent's hue at all, so a chroma applied to it
-- has nothing left to say. What replaces it is narrower and honest: mix a
-- little accent into cards and the dock, or don't. Any non-zero step meant "I
-- want to see the accent in the surfaces", so that is what it becomes.

alter table user_settings
  add column tint_surfaces boolean not null default false;

update user_settings set tint_surfaces = true where tint > 0;

alter table user_settings drop column tint;

-- ------------------------------------------------------------ wallet glyphs
--
-- `wallets.glyph` has been dead weight: the legacy import wrote the literal
-- 'wallet' into all seven rows, so the wallets list reads `type` instead and
-- draws the type's mark. That was right while nothing could set the column —
-- trusting it would have drawn one icon on an account, a savings account, a
-- card and a loan, which is the single distinction the mark exists to make.
--
-- The wallet form now has an icon picker, so the column becomes a real choice.
-- Null is what "no choice yet" has to look like for the type fallback to work,
-- and the import's sentinel is exactly that with a string in its place. The
-- column was NOT NULL precisely because nothing could ever leave it unset.
--
-- Only the sentinel is cleared. A wallet carrying anything else — 'landmark' on
-- the imported bank accounts — was a real choice and keeps it.

alter table wallets alter column glyph drop not null;

update wallets set glyph = null where glyph = 'wallet';
