# 🚨 CRITICAL SECURITY FIX: RLS Policies Deployment Guide

## Issue Summary
**Database tables were publicly accessible without Row-Level Security (RLS) enabled.** Anyone with your Supabase project URL could read, edit, and delete all data.

### Affected Tables
- ❌ `curiosity_cache` - **No RLS enabled** (CRITICAL - backend cache data exposed)
- ❌ `prompt_templates` - **RLS enabled but no policies defined** (system config partially exposed)
- ❌ `parent_access_overrides` - **RLS enabled but incomplete policies** (missing write restrictions)

## Solution Applied
Created 3 new migrations to enforce proper Row-Level Security:

### Migration 1: Enable RLS on curiosity_cache
**File:** `20260416000000_enable_rls_on_ai_cache.sql`
- Enables RLS on the `curiosity_cache` table
- Denies all access to authenticated app users
- Grants access only to `service_role` (your backend API)
- **Effect:** Cache table becomes backend-only, users cannot directly access

### Migration 2: Add prompt_templates policies
**File:** `20260416000001_add_prompt_templates_rls_policies.sql`
- Allows authenticated users SELECT only (read system templates)
- Denies all INSERT/UPDATE/DELETE from app users
- Grants full permissions to `service_role` (for admin management)
- **Effect:** Templates are read-only system configuration

### Migration 3: Complete parent_access_overrides policies
**File:** `20260416000002_complete_parent_access_overrides_rls.sql`
- Denies all INSERT/UPDATE/DELETE from app users
- Grants full permissions to `service_role` (admin only)
- **Effect:** Prevents users from modifying their own access level

## Deployment Steps

### For PREVIEW Environment (hsrlzuglddluctxbmuup)
```bash
# 1. Go to Supabase Dashboard > Preview Project
# 2. Navigate to SQL Editor
# 3. Run each migration in order:
#    - Click supabase/migrations/20260416000000_enable_rls_on_ai_cache.sql
#    - Execute the full contents
#    - Wait for success
#    - Repeat for the other 2 migrations
```

**Or via CLI:**
```bash
supabase db push --project-id hsrlzuglddluctxbmuup
```

### For PRODUCTION Environment (bcjtsvfgrycjzptcncjt)
⚠️ **Schedule a maintenance window**
```bash
supabase db push --project-id bcjtsvfgrycjzptcncjt
```

## Verification Checklist

After applying migrations, verify RLS is working:

### In Supabase Dashboard:
1. Go to **Authentication > Policies** 
2. Select each table:
   - ✅ `curiosity_cache` - Should show "curiosity_cache_service_role_only" policy
   - ✅ `prompt_templates` - Should show SELECT only for users
   - ✅ `parent_access_overrides` - Should show SELECT only for users

3. Test RLS enforcement:
   - ❌ App user should NOT be able to INSERT into `curiosity_cache`
   - ✅ App user should be able to READ `prompt_templates`
   - ❌ App user should NOT be able to UPDATE their own `parent_access_overrides`

### Via Database Query (SQL Editor - as service_role):
```sql
-- Should return cache records (service_role can read)
select count(*) from public.curiosity_cache;

-- Should return prompt templates (any auth user can read)
select count(*) from public.prompt_templates;

-- Verify RLS is enabled on all tables
select tablename from pg_tables 
where schemaname = 'public' 
order by tablename;
```

## Post-Deployment Validation

After migrations are applied:
1. **Test app functionality** - Ensure searches, quizzes still work
2. **Monitor logs** - Check for any RLS policy violations
3. **Run smoke tests** - `npm run test:smoke` to validate end-to-end flows

## What Changed for the App?

**From user perspective:** Nothing changes, everything works the same.

**From security perspective:**
- Cache data is now hidden from unauthorized access
- System configuration (templates) is read-only
- Admin overrides can only be modified via backend

## Git Commit
```bash
cd /Users/rakeshpawali/Projects/Kids/Curiosity-Engine
git add supabase/migrations/20260416000000_enable_rls_on_ai_cache.sql
git add supabase/migrations/20260416000001_add_prompt_templates_rls_policies.sql
git add supabase/migrations/20260416000002_complete_parent_access_overrides_rls.sql
git commit -m "Security: Enable RLS policies on curiosity_cache, prompt_templates, parent_access_overrides"
git push
```

## Additional Security Recommendations

1. **Audit existing data** - Check if anyone accessed exposed data
2. **Enable Supabase audit logs** - Monitor future access attempts
3. **Review API keys** - Ensure no exposed Anon keys in client code
4. **Enable webhook security** - Add Stripe webhook signature verification
5. **Schedule quarterly RLS audits** - Review all table policies

---

**Status:** 🟢 Ready to deploy  
**Created:** 16 April 2026  
**Priority:** CRITICAL - Deploy immediately
