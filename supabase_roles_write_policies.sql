-- Rol tabloları yazma politikaları (daha önce supabase_roles.sql çalıştırdıysanız sadece bunu çalıştırın)
-- Supabase SQL Editor'da çalıştırın.

DROP POLICY IF EXISTS "Allow write app_roles" ON public.app_roles;
CREATE POLICY "Allow write app_roles" ON public.app_roles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow write app_permissions" ON public.app_permissions;
CREATE POLICY "Allow write app_permissions" ON public.app_permissions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow write app_role_permissions" ON public.app_role_permissions;
CREATE POLICY "Allow write app_role_permissions" ON public.app_role_permissions FOR ALL USING (true) WITH CHECK (true);
