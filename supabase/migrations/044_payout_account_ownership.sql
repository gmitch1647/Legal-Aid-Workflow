-- Record whether each client payout account is personal or business.
-- New submissions are validated by the API; existing historical submissions remain unchanged.

alter table public.client_payout_information_submissions
  add column if not exists account_ownership text;

alter table public.client_payout_information_submissions
  drop constraint if exists client_payout_information_submissions_account_ownership_check;

alter table public.client_payout_information_submissions
  add constraint client_payout_information_submissions_account_ownership_check
  check (account_ownership is null or account_ownership in ('personal', 'business'));
