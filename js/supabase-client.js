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

// Helper pagination generik
window.supabasePaginate = async function(table, selectCols, options = {}) {
  const {
    pageSize = 1000,
    order = { column: 'created_at', ascending: false },
    filters = [], // array of [method, col, val] e.g. [['eq','status','OPEN']]
    maxRows = 50000
  } = options;

  let all = [];
  let from = 0;
  while (true) {
    let q = window.supabaseClient
      .from(table)
      .select(selectCols)
      .order(order.column, { ascending: order.ascending })
      .range(from, from + pageSize - 1);

    for (const [method, col, val] of filters) {
      q = q[method](col, val);
    }
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
    if (from >= maxRows) break;
  }
  return all;
};

// Helper role check
window.isAdmin = async function() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return false;
  const { data } = await supabaseClient.from('profiles').select('role').eq('id', user.id).single();
  return data?.role === 'Admin';
};
