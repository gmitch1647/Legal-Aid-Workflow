-- Deduct settlement costs before calculating the owner’s private payout share.
-- Existing ledger rows preserve their original calculation by receiving zero-cost defaults.

ALTER TABLE public.settlement_payout_ledgers
  ADD COLUMN IF NOT EXISTS court_costs numeric(14,2) NOT NULL DEFAULT 0 CHECK (court_costs >= 0),
  ADD COLUMN IF NOT EXISTS attorney_paid_costs numeric(14,2) NOT NULL DEFAULT 0 CHECK (attorney_paid_costs >= 0),
  ADD COLUMN IF NOT EXISTS net_split_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (net_split_amount >= 0);

UPDATE public.settlement_payout_ledgers
SET net_split_amount = GREATEST(0, settlement_amount - court_costs - attorney_paid_costs)
WHERE net_split_amount = 0
  AND (settlement_amount > 0 OR court_costs > 0 OR attorney_paid_costs > 0);

UPDATE public.settlement_payout_ledgers
SET expected_amount = ROUND(net_split_amount * percentage / 100.0, 2)
WHERE net_split_amount >= 0;
