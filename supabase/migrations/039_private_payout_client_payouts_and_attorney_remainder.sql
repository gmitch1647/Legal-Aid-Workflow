-- Revise private payout calculations:
-- settlement less court costs and client payouts is split by the private percentage.
-- The legacy attorney_paid_costs column is intentionally retained for history but
-- is no longer used by the calculation or displayed in the application.

ALTER TABLE public.settlement_payout_ledgers
  ADD COLUMN IF NOT EXISTS client_payouts numeric(14,2) NOT NULL DEFAULT 0 CHECK (client_payouts >= 0),
  ADD COLUMN IF NOT EXISTS attorney_remainder numeric(14,2) NOT NULL DEFAULT 0 CHECK (attorney_remainder >= 0);

UPDATE public.settlement_payout_ledgers
SET net_split_amount = GREATEST(0, settlement_amount - court_costs - client_payouts);

UPDATE public.settlement_payout_ledgers
SET expected_amount = ROUND(net_split_amount * percentage / 100.0, 2),
    attorney_remainder = GREATEST(0, net_split_amount - ROUND(net_split_amount * percentage / 100.0, 2));
