-- How many installments a loan has left.
--
-- Counted, not decremented. `installment_count` keeps meaning what the create
-- form asks for — how many installments the loan is spread over, a fixed fact
-- about the agreement — and "left" is that minus the repayments actually
-- recorded. Nothing writes to the column after the wallet is made.
--
-- The alternative was a trigger that decrements the column on insert, and it is
-- the same mistake as storing a balance (invariant 2). A stored counter has to
-- be un-decremented when a repayment is deleted, and when a transfer is deleted
-- through `delete_transfer`, and it has no way to be right about a repayment
-- that was backdated into a period already counted. A count over the rows is
-- correct at every moment by construction, and deleting a repayment puts the
-- installment back with no code at all.
--
-- What counts as a repayment: a transaction on the loan wallet that is part of
-- a transfer (`transfer_id is not null`) and positive. Invariant 4 makes
-- positive "money enters this wallet", and for a loan — which opens negative
-- and is repaid towards zero — money entering *is* the repayment. A plain
-- positive row that is not part of a transfer is deliberately not counted:
-- repaying a loan moves money out of some other wallet, so it is a transfer,
-- and a loose row would mean the money came from nowhere.
--
-- Both predicates sit in the ON clause rather than a WHERE, so a loan with no
-- repayments yet still returns a row saying zero instead of vanishing.

create view loan_progress with (security_invoker = on) as
  select
    w.id      as wallet_id,
    w.user_id,
    -- Nullable: a loan can be recorded without an installment count, and then
    -- there is a number paid but nothing to subtract it from.
    w.installment_count,
    count(t.id)::bigint as paid_count
  from wallets w
  left join transactions t
    on  t.wallet_id   = w.id
    and t.transfer_id is not null
    and t.amount      > 0
  where w.type = 'loan'
  group by w.id, w.user_id, w.installment_count;
