-- alert_outbox is written by the alerts evaluation job and read by the alerts-dispatch edge function
-- (service_role, which bypasses RLS). Clients never access it: make that explicit (AGENTS rule 1).
create policy alert_outbox_no_client_access on public.alert_outbox
  as restrictive for all to anon, authenticated
  using (false) with check (false);
