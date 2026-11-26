// Copy this file to config.js and fill in the two PUBLIC values below.
// These are safe to expose in the browser: the anon key only ever grants
// read-only access, enforced by Postgres Row Level Security (see
// supabase/migrations/0001_init.sql). Never put a service_role key here.
export const SUPABASE_URL = "https://<project-ref>.supabase.co";
export const SUPABASE_ANON_KEY = "<anon-public-key>";
