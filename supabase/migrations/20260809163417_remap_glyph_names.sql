-- `glyph` now holds a Lucide icon name, looked up in src/lib/icons.ts. The
-- originally seeded values were informal labels, so they miss the lookup and
-- render as the neutral fallback mark. Remap the ones we created.

update categories set glyph = case glyph
  when 'basket' then 'shopping-basket'
  when 'arrows' then 'arrow-left-right'
  when 'bank'   then 'wallet'
  else glyph
end
where glyph in ('basket', 'arrows', 'bank');

update wallets set glyph = case glyph
  when 'bank'   then 'wallet'
  when 'basket' then 'shopping-basket'
  else glyph
end
where glyph in ('bank', 'basket');
