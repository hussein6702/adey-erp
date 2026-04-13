import { createClient } from "@supabase/supabase-js";

// Ensure environment variables exist
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Create a single shared Supabase client for use throughout the application
// Note: In Next.js 13+ App Router, this basic client is fine for Client Components
// and Server Actions. For robust SSR auth flows you would need @supabase/ssr.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
