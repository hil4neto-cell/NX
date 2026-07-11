import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  ?? 'https://babvxmoloqqlkwbezhhz.supabase.co'
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? 'sb_publishable_AlXBiq9uzghHP9jHepumMA_PGpdksKh'

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Convites sao abertos em outro navegador; o fluxo implicito e o formato
    // compativel com os links enviados pelo Auth Admin do Supabase.
    flowType: 'implicit',
  },
})
