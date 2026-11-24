-- 0008: RLS policies of public tables call is_admin() for anonymous visitors too; anon must be able to execute it
-- (it returns false without a session). Found by supabase/tests/0007_rls_smoke.test.sql.
grant execute on function public.is_admin() to anon;
