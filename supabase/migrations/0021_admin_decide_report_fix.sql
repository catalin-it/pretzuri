-- 0021: fix admin_decide_report from 0020: the local variable `reason` was ambiguous with review_reports.reason.

-- Decide a DSA notice about a review; optionally remove the review with the same statement of reasons.
create or replace function public.admin_decide_report(p_report_id bigint, p_decision text, p_reason text, p_remove_review boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.admin_guard();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  rid bigint;
begin
  if p_decision not in ('actioned', 'dismissed') then raise exception 'invalid decision' using errcode = '22023'; end if;
  if v_reason is null or length(v_reason) < 10 or length(v_reason) > 2000 then
    raise exception 'decision reason required (10-2000 chars)' using errcode = '22023';
  end if;
  if p_remove_review and p_decision <> 'actioned' then
    raise exception 'removing a review means the notice is actioned' using errcode = '22023';
  end if;
  update public.review_reports set status = p_decision, decision_reason = v_reason, decided_by = me, decided_at = now()
  where id = p_report_id and status = 'open'
  returning review_id into rid;
  if rid is null then raise exception 'open report not found' using errcode = 'P0002'; end if;
  if p_remove_review then
    update public.reviews set status = 'removed', moderation_reason = v_reason, moderated_by = me, moderated_at = now()
    where id = rid;
    -- Other open notices about the same review are settled by the removal.
    update public.review_reports set status = 'actioned', decision_reason = v_reason, decided_by = me, decided_at = now()
    where review_id = rid and status = 'open';
  end if;
  perform public.admin_log(me, 'report_' || p_decision, 'review_report', p_report_id::text, v_reason,
    jsonb_build_object('review_id', rid, 'review_removed', p_remove_review));
end $$;
revoke execute on function public.admin_decide_report(bigint, text, text, boolean) from public, anon;
grant execute on function public.admin_decide_report(bigint, text, text, boolean) to authenticated;
