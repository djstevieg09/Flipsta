-- 27 Aug 2026, Steven: "need the ability to add credit to people to spend on
-- the store for sorry's etc." — a manual, admin-granted wallet credit for
-- goodwill/compensation (a bad experience, a service issue, a gesture of
-- apology) — distinct from loyalty_credit (auto-awarded % of spend) and
-- referral_credit (auto-awarded on signup). Reuses the same wallet_transactions
-- ledger everything else already uses rather than a separate mechanism — see
-- apps/web/app/api/admin/wallet-credit/route.ts. Who granted it and why is
-- recorded in admin_audit_log (Section 12.1), same as every other admin
-- action that moves money or access.
alter table wallet_transactions drop constraint wallet_transactions_kind_check;
alter table wallet_transactions add constraint wallet_transactions_kind_check
  check (kind in ('payout', 'commission', 'auction_fee', 'insurance_premium', 'referral_credit', 'buyback_payout', 'loyalty_credit', 'goodwill_credit'));
