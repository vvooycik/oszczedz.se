-- The redesign renames the six colour slots. `color` / `color_scheme` are
-- free-text columns, so nothing broke — the client falls back for unknown
-- values — but leaving stale names in the database means the fallback is
-- carrying data it should not have to. Remap the ones we seeded.
--
-- Old -> new: green->moss, amber->ochre, indigo->slate, rose->terracotta,
-- violet->plum. `teal` keeps its name.

update categories set color = case color
  when 'green'  then 'moss'
  when 'amber'  then 'ochre'
  when 'indigo' then 'slate'
  when 'rose'   then 'terracotta'
  when 'violet' then 'plum'
  else color
end
where color in ('green', 'amber', 'indigo', 'rose', 'violet');

update wallets set color_scheme = case color_scheme
  when 'green'  then 'moss'
  when 'amber'  then 'ochre'
  when 'indigo' then 'slate'
  when 'rose'   then 'terracotta'
  when 'violet' then 'plum'
  else color_scheme
end
where color_scheme in ('green', 'amber', 'indigo', 'rose', 'violet');
