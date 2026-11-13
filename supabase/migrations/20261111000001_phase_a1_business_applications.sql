-- Phase A1: business applications, profiles, audit, private docs bucket
-- Applied via Supabase MCP; kept here as repo source of truth.

-- See apply_migration phase_a1_business_applications for full SQL.
-- Key objects:
--   business_type, application_status enums
--   business_applications, application_documents, business_profiles, audit_logs
--   storage bucket application-docs (private)
--   review_business_application(app_id, new_status, reason)
