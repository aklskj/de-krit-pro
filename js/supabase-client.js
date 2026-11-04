// ═══════════════════════════════════════════════════════════════
// Konfigurasi Supabase — ambil dari Cloudflare Pages env vars
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL  = 'https://wbvyhlwpsmhbryygtokz.supabase.co';       // ganti
const SUPABASE_ANON = 'sb_publishable_uB-SD0ykeWXU8uIse98R6w_jeZqz1Li';                     // ganti (anon key)

// Load supabase-js dari CDN
// Tambahkan <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
// di <head> index.html sebelum file ini.

window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true }
});

// Helper role check
window.isAdmin = async function() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return false;
  const { data } = await supabaseClient.from('profiles').select('role').eq('id', user.id).single();
  return data?.role === 'Admin';
};
