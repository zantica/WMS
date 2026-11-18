-- Migration: 20261117000000_session_superuser_auth
-- Feature F10.1: Capa de Sesión JWT con Bcrypt, Superuser (admin@navelo.dev) y Lookup RLS controlado por email

-- 1. Añadir columna passwordHash opcional en users (retrocompatible con Clerk y seed)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

-- 3. Índice para búsqueda controlada de login por email
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users"("email");

-- 4. Actualizar política RLS de users para soportar handshake controlado por app.auth_email
--    y conteo/detección controlada de SUPERUSER (app.auth_superuser_check), manteniendo WITH CHECK estricto por tenant.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_tenant_isolation_policy" ON "users";
CREATE POLICY "users_tenant_isolation_policy" ON "users"
  FOR ALL
  USING (
    (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
      AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    )
    OR (
      NULLIF(current_setting('app.auth_clerk_id', true), '') IS NOT NULL
      AND "clerkId" = NULLIF(current_setting('app.auth_clerk_id', true), '')
    )
    OR (
      NULLIF(current_setting('app.auth_email', true), '') IS NOT NULL
      AND lower("email") = lower(NULLIF(current_setting('app.auth_email', true), ''))
    )
    OR (
      NULLIF(current_setting('app.auth_superuser_check', true), '') = 'true'
      AND "role" = 'SUPERUSER'
    )
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  );
