-- Per-wallet category sets become ordered.
--
-- `wallet_categories` already decided *which* categories a wallet offers — and
-- keeps its existing rule that an empty set means every category is allowed.
-- What it could not say is what should come first, so the picker fell back to
-- the name and a wallet's three real categories sat wherever the alphabet put
-- them among fifty-nine.
--
-- The order lives on the join rather than on `categories` because it is a fact
-- about the pairing, not about the category: groceries lead on the everyday
-- account and are irrelevant on the loan. A single global order could not say
-- both. The cost is that a wallet with no set has no order either, which is why
-- the client sorts that case by name, exactly as before.
--
-- Still UX-only. The database accepts any category on any wallet; this decides
-- what the picker shows and in which order, nothing about what may be stored.
alter table wallet_categories
  add column position integer not null default 0;

-- The picker reads one wallet's rows in order on every open, which is exactly
-- this index. Positions are assigned densely from zero by the client, but
-- nothing enforces that — ties are possible and simply fall back to the name.
create index idx_wallet_categories_order
  on wallet_categories (wallet_id, position);
