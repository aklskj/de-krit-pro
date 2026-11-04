// ═══════════════════════════════════════════════════════════════
// SHIM: mensimulasikan google.script.run tapi memanggil Supabase
// Setiap `google.script.run` mengembalikan chain runner baru.
// ═══════════════════════════════════════════════════════════════
(function() {
  if (window._gasShimInstalled) return;
  window._gasShimInstalled = true;

  function createRunner() {
    let _onSuccess = null;
    let _onFail = null;

    function dispatch(promise) {
      Promise.resolve(promise)
        .then(r => { if (_onSuccess) _onSuccess(r); })
        .catch(err => {
          console.error('[Shim] Error:', err);
          if (_onFail) _onFail(err);
          else Swal.fire('Error', err.message || 'Unknown error', 'error');
        });
    }

    const runner = {
      withSuccessHandler(cb) { _onSuccess = cb; return runner; },
      withFailureHandler(cb) { _onFail = cb; return runner; },

      // ─────────────────────────────────────────────────────
      // AUTH
      // ─────────────────────────────────────────────────────
      loginApp(username, password) {
        dispatch((async () => {
          // Konversi username → email (asumsi: username@pos.local)
          const email = username.includes('@') ? username : `${username}@pos.local`;
          const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
          if (error) return { success: false, message: 'Login gagal: ' + error.message };
          return { success: true, token: data.session.access_token };
        })());
        return runner;
      },

      logoutApp() {
        dispatch((async () => {
          await supabaseClient.auth.signOut();
          return { success: true };
        })());
        return runner;
      },

      // ─────────────────────────────────────────────────────
      // BOOTSTRAP — getInitialData (JANTUNG app)
      // ─────────────────────────────────────────────────────
      getInitialData() {
        dispatch((async () => {
          const { data: { user } } = await supabaseClient.auth.getUser();
          if (!user) return { success: false, error: 'UNAUTHORIZED' };

          // Parallel fetch semua data
          const [
            profile, settings, products, transactions, purchases,
            journals, expenses, layanan, bku, shifts, aset, logs, users, oo, ph
          ] = await Promise.all([
            supabaseClient.from('profiles').select('*').eq('id', user.id).single(),
            supabaseClient.from('settings').select('*'),
            supabaseClient.from('products').select('*').eq('is_deleted', false).order('nama'),
            supabaseClient.from('transactions').select('*').order('tanggal', {ascending:false}).limit(5000),
            supabaseClient.from('purchases').select('*').order('tanggal', {ascending:false}).limit(5000),
            supabaseClient.from('journals').select('*').order('tanggal', {ascending:false}).limit(20000),
            supabaseClient.from('expenses').select('*').order('tanggal', {ascending:false}).limit(5000),
            supabaseClient.from('layanan_digital').select('*').order('tanggal', {ascending:false}).limit(5000),
            supabaseClient.from('bku').select('*').order('tanggal', {ascending:false}).limit(5000),
            supabaseClient.from('shifts').select('*').eq('kasir_id', user.id).eq('status', 'OPEN').order('waktu_buka',{ascending:false}).limit(1),
            supabaseClient.from('aset_tetap').select('*'),
            supabaseClient.from('logs').select('*').order('waktu',{ascending:false}).limit(200),
            supabaseClient.from('profiles').select('id,username,nama,role,is_active'),
            supabaseClient.from('online_orders').select('*').eq('status', 'PENDING').order('tanggal',{ascending:false}),
            supabaseClient.from('pembayaran_hutang').select('*')
          ]);

          const setup = {};
          (settings.data || []).forEach(s => { setup[s.key] = s.value; });

          // Map snake_case → camelCase (sesuai state app lama)
          const mapProd = p => ({
            id: p.id, nama: p.nama, kategori: p.kategori,
            hargaBeli: +p.harga_beli, hargaJual: +p.harga_jual, stok: p.stok,
            image: p.image, jualOnline: p.jual_online
          });
          const mapTrx = t => ({
            id: t.id, tanggal: new Date(t.tanggal).getTime(),
            kasir: t.kasir, pelanggan: t.pelanggan, wa: t.wa,
            item: t.item_desc, total: +t.total, modal: +t.modal, laba: +t.laba,
            diskon: +t.diskon, metode: t.metode, bayar: +t.bayar, kembali: +t.kembali,
            status: t.status, cartJson: JSON.stringify(t.cart_json), pdfLink: t.pdf_link
          });
          const mapPur = p => ({
            id: p.id, idProduk: p.id_produk, namaProduk: p.nama_produk, qty: p.qty,
            hargaBeli: +p.harga_beli, totalBiaya: +p.total_biaya,
            tanggal: new Date(p.tanggal).getTime(), supplier: p.supplier,
            metode: p.metode, refNota: p.ref_nota, kasir: p.kasir
          });
          const mapJurnal = j => ({
            idJurnal: j.id_jurnal, tanggal: new Date(j.tanggal).getTime(),
            refId: j.ref_id, keterangan: j.keterangan,
            kodeAkun: j.kode_akun, namaAkun: j.nama_akun,
            debit: +j.debit, kredit: +j.kredit
          });
          const mapBeban = e => ({
            id: e.id, tanggal: new Date(e.tanggal).getTime(),
            kasir: e.kasir, kategori: e.kategori, keterangan: e.keterangan, nominal: +e.nominal
          });
          const mapLay = l => ({
            id: l.id, tanggal: new Date(l.tanggal).getTime(),
            kasir: l.kasir, jenis: l.jenis, nominal: +l.nominal, modal: +l.modal,
            fee: +l.fee, metode: l.metode, keterangan: l.keterangan
          });
          const mapBku = b => ({
            id: b.id, tanggal: new Date(b.tanggal).getTime(), noBukti: b.no_bukti,
            jenis: b.jenis, kategori: b.kategori, uraian: b.uraian, metode: b.metode,
            debit: +b.debit, kredit: +b.kredit, kasir: b.kasir
          });
          const mapOO = o => ({
            orderId: o.order_id, nama: o.nama, wa: o.wa, waktuAmbil: o.waktu_ambil,
            total: +o.total, cart: o.cart, metode: o.metode,
            tanggal: new Date(o.tanggal).getTime()
          });
          const mapLog = l => ({
            id: l.id, waktu: new Date(l.waktu).getTime(),
            user: l.user, aksi: l.aksi, keterangan: l.keterangan
          });
          const mapPH = p => ({
            id: p.id, refNota: p.ref_nota, tanggal: new Date(p.tanggal).getTime(),
            nominal: +p.nominal, metode: p.metode, kasir: p.kasir, keterangan: p.keterangan
          });

          const currentShift = shifts.data[0] ? {
            id: shifts.data[0].id, modalAwal: +shifts.data[0].modal_awal,
            waktuBuka: new Date(shifts.data[0].waktu_buka).getTime()
          } : null;

          // Hitung saldo ringkas
          const saldo = { kas111:0, bank115:0, piutang112:0, hutang211:0 };
          (journals.data || []).forEach(j => {
            const k = j.kode_akun;
            if (k === '111') saldo.kas111    += (+j.debit - +j.kredit);
            if (k === '115') saldo.bank115   += (+j.debit - +j.kredit);
            if (k === '112') saldo.piutang112+= (+j.debit - +j.kredit);
            if (k === '211') saldo.hutang211 += (+j.kredit - +j.debit);
          });

          return {
            success: true,
            user: { nama: profile.data.nama, role: profile.data.role, username: profile.data.username },
            setup,
            products: (products.data||[]).map(mapProd),
            transactions: (transactions.data||[]).map(mapTrx),
            purchases: (purchases.data||[]).map(mapPur),
            jurnal: (journals.data||[]).map(mapJurnal),
            beban: (expenses.data||[]).map(mapBeban),
            layananDigital: (layanan.data||[]).map(mapLay),
            bku: (bku.data||[]).map(mapBku),
            onlineOrders: (oo.data||[]).map(mapOO),
            logs: (logs.data||[]).map(mapLog),
            users: (users.data||[]).filter(u=>u.is_active).map(u=>({username:u.username,nama:u.nama,role:u.role})),
            currentShift,
            saldoRingkas: saldo,
            pembayaranHutang: (ph.data||[]).map(mapPH),
            asetTetap: aset.data || []
          };
        })());
        return runner;
      },

      // Delta sync — cukup panggil full sync untuk sederhana
      getDataSince(_token, _since) {
        dispatch((async () => {
          const r = await runner.getInitialData();
          // runner di atas tidak dispatch — kita panggil manual
          return await new Promise((res, rej) => {
            const inner = createRunner()
              .withSuccessHandler(res)
              .withFailureHandler(rej)
              .getInitialData();
          });
        })());
        return runner;
      },

      // ─────────────────────────────────────────────────────
      // TRANSAKSI
      // ─────────────────────────────────────────────────────
      saveTransaction(_token, tx, cart) {
        dispatch((async () => {
          const { data, error } = await supabaseClient.rpc('rpc_save_transaction', {
            payload: tx, cart
          });
          if (error) throw error;
          return data; // { success, id, pdfLink }
        })());
        return runner;
      },

      // ─────────────────────────────────────────────────────
      // PRODUK (CRUD langsung via Supabase table)
      // ─────────────────────────────────────────────────────
      saveProduct(_token, d) {
        dispatch((async () => {
          const row = {
            id: d.id, nama: d.nama, kategori: d.kategori,
            harga_beli: d.hargaBeli, harga_jual: d.hargaJual,
            stok: d.stok, image: d.image, jual_online: d.jualOnline
          };
          const { error } = await supabaseClient.from('products').upsert(row);
          if (error) throw error;
          return { success: true, id: d.id };
        })());
        return runner;
      },

      deleteProduct(_token, id) {
        dispatch((async () => {
          const { error } = await supabaseClient.from('products').update({ is_deleted: true }).eq('id', id);
          if (error) throw error;
          return { success: true };
        })());
        return runner;
      },

      // ─────────────────────────────────────────────────────
      // SHIFT
      // ─────────────────────────────────────────────────────
      openShift(_token, modal, source) {
        dispatch((async () => {
          const { data, error } = await supabaseClient.rpc('rpc_open_shift', {
            modal, source: source || 'EXISTING'
          });
          if (error) throw error;
          return data;
        })());
        return runner;
      },

      closeShift(_token, kasFisik) {
        dispatch((async () => {
          const { data, error } = await supabaseClient.rpc('rpc_close_shift', { kas_fisik: kasFisik });
          if (error) throw error;
          return data;
        })());
        return runner;
      },

      // ─────────────────────────────────────────────────────
      // BEBAN / EXPENSES
      // ─────────────────────────────────────────────────────
      saveBeban(_token, d) {
        dispatch((async () => {
          const { data, error } = await supabaseClient.rpc('rpc_save_beban', { payload: d });
          if (error) throw error;
          return data;
        })());
        return runner;
      },

      // ─────────────────────────────────────────────────────
      // SETUP
      // ─────────────────────────────────────────────────────
      saveSetup(_token, d) {
        dispatch((async () => {
          const rows = Object.keys(d).map(k => ({ key: k, value: d[k] })); // <-- Kirim nilai asli
          const { error } = await supabaseClient.from('settings').upsert(rows);
          if (error) throw error;
          return { success: true };
        })());
        return runner;
      }

      // ─────────────────────────────────────────────────────
      // ONLINE ORDERS
      // ─────────────────────────────────────────────────────
      submitOnlineOrder(payload) {
        dispatch((async () => {
          const orderId = 'ONL-' + Date.now();
          const { error } = await supabaseClient.from('online_orders').insert({
            order_id: orderId, nama: payload.nama, wa: payload.wa,
            waktu_ambil: payload.waktuAmbil, total: payload.total,
            cart: payload.cart, metode: payload.metode || 'Tunai',
            status: 'PENDING'
          });
          if (error) throw error;
          return { success: true, orderId };
        })());
        return runner;
      },

      getPendingOrders(_token) {
        dispatch((async () => {
          const { data, error } = await supabaseClient.from('online_orders')
            .select('*').eq('status', 'PENDING').order('tanggal', {ascending:true});
          if (error) throw error;
          const mapped = (data||[]).map(o => ({
            orderId: o.order_id, nama: o.nama, wa: o.wa, waktuAmbil: o.waktu_ambil,
            total: +o.total, cart: o.cart, metode: o.metode,
            tanggal: new Date(o.tanggal).getTime()
          }));
          return { success: true, data: mapped };
        })());
        return runner;
      },

      // ─────────────────────────────────────────────────────
      // STUBS — untuk fungsi yang belum diimplementasikan
      // (isi dengan panggilan Supabase yang sesuai seiring waktu)
      // ─────────────────────────────────────────────────────
      saveBulkPembelian(...a) { dispatch((async()=>({success:false,error:'TODO: rpc_save_bulk_pembelian'}))()); return runner; },
      saveBulkProducts(...a)  { dispatch((async()=>({success:false,error:'TODO: rpc_save_bulk_products'}))()); return runner; },
      lunasiKasbon(...a)      { dispatch((async()=>({success:false,error:'TODO: rpc_lunasi_kasbon'}))()); return runner; },
      processReturn(...a)     { dispatch((async()=>({success:false,error:'TODO: rpc_process_return'}))()); return runner; },
      cancelRestock(...a)     { dispatch((async()=>({success:false,error:'TODO'}))()); return runner; },
      saveOpname(...a)        { dispatch((async()=>({success:false,error:'TODO'}))()); return runner; },
      saveTarikTunai(...a)    { dispatch((async()=>({success:false,error:'TODO'}))()); return runner; },
      saveProdukDigital(...a) { dispatch((async()=>({success:false,error:'TODO'}))()); return runner; },
      saveTopUpEwallet(...a)  { dispatch((async()=>({success:false,error:'TODO'}))()); return runner; },
      getSaldoGoPay(...a)     { dispatch((async()=>({success:true,bank:0,transit:0,deposit:0}))()); return runner; },
      rekonsiliasiSettlementGoPay(...a) { dispatch((async()=>({success:false,error:'TODO'}))()); return runner; },
      topUpDepositGoPay(...a) { dispatch((async()=>({success:false,error:'TODO'}))()); return runner; },
      processOnlineOrder(_t, oid) {
        dispatch((async () => {
          const { error } = await supabaseClient.from('online_orders').update({status:'DONE'}).eq('order_id', oid);
          if (error) throw error;
          return { success: true };
        })());
        return runner;
      },
      cancelOnlineOrder(_t, oid) {
        dispatch((async () => {
          const { error } = await supabaseClient.from('online_orders').update({status:'CANCEL'}).eq('order_id', oid);
          if (error) throw error;
          return { success: true };
        })());
        return runner;
      },
      saveUserAccount(_t, p) {
        dispatch((async () => {
          // Buat user baru via admin API butuh service key → lakukan di Edge Function
          // Untuk edit (non-signup), update profile saja:
          if (p.isEdit) {
            const { error } = await supabaseClient.from('profiles')
              .update({ nama: p.nama, role: p.role }).eq('username', p.username);
            if (error) throw error;
            return { success: true };
          }
          return { success: false, error: 'Buat user baru via Supabase Auth Dashboard atau Edge Function' };
        })());
        return runner;
      },
      deleteUserAccount(_t, username) {
        dispatch((async () => {
          const { error } = await supabaseClient.from('profiles')
            .update({ is_active: false }).eq('username', username);
          if (error) throw error;
          return { success: true };
        })());
        return runner;
      },
      saveBukuKasUmum(_t, p) {
        dispatch((async () => {
          const id = 'BKU-' + Date.now();
          const { error } = await supabaseClient.from('bku').insert({
            id, tanggal: new Date(p.tanggal).toISOString(),
            no_bukti: p.noBukti, jenis: p.jenis, kategori: p.kategori,
            uraian: p.uraian, metode: p.metode,
            debit: p.jenis==='Pemasukan' ? p.nominal : 0,
            kredit: p.jenis==='Pengeluaran' ? p.nominal : 0,
            kasir: (await supabaseClient.auth.getUser()).data.user?.email || 'system'
          });
          if (error) throw error;
          return { success:true, newId:id, tanggal:new Date(p.tanggal).getTime(),
                   kasir:(await supabaseClient.auth.getUser()).data.user?.email };
        })());
        return runner;
      },
    };

    return runner;
  }

  // ═══════════════════════════════════════════════════════════════
  // GLOBAL `google.script.run` — getter mengembalikan runner baru
  // ═══════════════════════════════════════════════════════════════
  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, 'run', {
    configurable: true,
    get() { return createRunner(); }
  });

  // url.getLocation — untuk deteksi ?view=customer
  window.google.script.url = {
    getLocation(cb) {
      const params = Object.fromEntries(new URLSearchParams(location.search));
      cb({ parameter: params });
    }
  };

  console.log('✅ GAS Shim installed — backend: Supabase');
})();
