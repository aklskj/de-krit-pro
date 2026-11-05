// js/shim-gas.js
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
        })
    }

    const runner = {
      withSuccessHandler(cb) { _onSuccess = cb; return runner; },
      withFailureHandler(cb) { _onFail = cb; return runner; },

      // ── AUTH ──
      loginApp(username, password) {
        dispatch((async () => {
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

      // ── INIT DATA ──
      async getInitialData() {
        const sb = window.supabaseClient;
        const { data: { user } } = await sb.auth.getUser();
        if (!user) throw new Error('Not authenticated');
      
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const since = sevenDaysAgo.toISOString();
        const today = new Date().toISOString().split('T')[0];
      
        // Load paralel — semua query KECIL & WAJIB
        const [
          profileRes,
          settingsRes,
          productsRes,
          shiftRes,
          onlineOrdersRes,
          asetRes,
          dashboardRes,
          recentTxRes,
          recentJournalsRes,
          recentExpensesRes,
          recentPurchasesRes,
          recentLayananRes
        ] = await Promise.all([
          sb.from('profiles').select('id, username, nama, role, is_active').eq('id', user.id).single(),
          sb.from('settings').select('key, value'),
          sb.from('products').select('id, nama, kategori, harga_beli, harga_jual, stok, image, jual_online')
            .eq('is_deleted', false).order('nama'),
          sb.from('shifts')
            .select('id, kasir_id, kasir_nama, modal_awal, modal_source, waktu_buka, status')
            .eq('kasir_id', user.id).eq('status', 'OPEN').maybeSingle(),
          sb.from('online_orders')
            .select('order_id, nama, wa, waktu_ambil, total, cart, metode, tanggal, status')
            .eq('status', 'PENDING').order('tanggal', { ascending: false }).limit(100),
          sb.from('aset_tetap')
            .select('id_aset, nama, kategori, tanggal_perolehan, nilai_perolehan, nilai_residu, masa_manfaat, akum_penyusutan, lokasi, status')
            .eq('status', 'AKTIF'),
          sb.rpc('get_dashboard_summary', { p_tanggal: today }),
          // Riwayat ringkas 7 hari terakhir saja (bukan 5000 baris full)
          sb.from('transactions')
            .select('id, tanggal, kasir, pelanggan, total, modal, laba, diskon, metode, status, shift_id')
            .gte('tanggal', since).order('tanggal', { ascending: false }).limit(2000),
          sb.from('journals')
            .select('id, id_jurnal, tanggal, ref_id, keterangan, kode_akun, nama_akun, debit, kredit, shift_id')
            .gte('tanggal', since).order('tanggal', { ascending: false }).limit(3000),
          sb.from('expenses')
            .select('id, tanggal, kasir, kategori, keterangan, nominal, shift_id')
            .gte('tanggal', since).order('tanggal', { ascending: false }).limit(300),
          sb.from('purchases')
            .select('id, id_produk, nama_produk, qty, harga_beli, total_biaya, tanggal, supplier, metode, ref_nota, shift_id')
            .gte('tanggal', since).order('tanggal', { ascending: false }).limit(300),
          sb.from('layanan_digital')
            .select('id, tanggal, kasir, jenis, nominal, modal, fee, metode, keterangan, shift_id')
            .gte('tanggal', since).order('tanggal', { ascending: false }).limit(300)
        ]);
      
        // Cek error sekali
        const errors = [profileRes, settingsRes, productsRes, shiftRes, onlineOrdersRes, asetRes,
                        dashboardRes, recentTxRes, recentJournalsRes, recentExpensesRes,
                        recentPurchasesRes, recentLayananRes]
          .filter(r => r && r.error);
        if (errors.length) console.warn('[getInitialData] warnings:', errors.map(e => e.error));
      
        return {
          profile:         profileRes.data,
          settings:        settingsRes.data || [],
          products:        productsRes.data || [],
          shift:           shiftRes.data || null,
          onlineOrders:    onlineOrdersRes.data || [],
          asetTetap:       asetRes.data || [],
          dashboard:       dashboardRes.data || {},
          transactions:    recentTxRes.data || [],
          journals:        recentJournalsRes.data || [],
          expenses:        recentExpensesRes.data || [],
          purchases:       recentPurchasesRes.data || [],
          layananDigital:  recentLayananRes.data || [],
          // Flags untuk lazy loader
          _journalsFullLoaded: false,
          _transactionsFullLoaded: false
        }
      },
      
      async loadAllJournals(p_from, p_to) {
        const sb = window.supabaseClient;
        const PAGE = 1000;
        let all = [];
        let offset = 0;
        while (true) {
          const { data, error } = await sb.rpc('get_journals_paginated', {
            p_offset: offset,
            p_limit:  PAGE,
            p_from:    p_from || null,
            p_to:      p_to   || null
          });
          if (error) throw error;
          if (!data || data.length === 0) break;
          all = all.concat(data);
          if (data.length < PAGE) break;
          offset += PAGE;
          // safety stop
          if (offset > 200000) break;
        }
        return all;
      },
      
      // Paginated fetch (untuk infinite scroll)
      async loadJournalsPage({ offset = 0, limit = 100, from, to } = {}) {
        const sb = window.supabaseClient;
        const { data, error } = await sb.rpc('get_journals_paginated', {
          p_offset: offset, p_limit: limit, p_from: from || null, p_to: to || null
        });
        if (error) throw error;
        return { rows: data || [], total: data?.[0]?.total_count ?? 0 };
      },

      getDataSince(_token, _since) {
        dispatch((async () => {
          const inner = await new Promise((res, rej) => {
            createRunner().withSuccessHandler(res).withFailureHandler(rej).getInitialData();
          });
          return inner;
        })());
        return runner;
      },

      // ── TRANSAKSI & KASIR ──
      saveTransaction(_token, tx, cart) {
        dispatch((async () => {
          const { data, error } = await supabaseClient.rpc('rpc_save_transaction', { payload: tx, cart });
          if (error) throw error;
          return data;
        })());
        return runner;
      },

      saveProduct(_token, d) {
        dispatch((async () => {
          let finalImageUrl = d.image; // Default: link lama atau base64
      
          // Cek apakah user mengupload gambar baru (formatnya Base64)
          if (d.image && d.image.startsWith('data:image')) {
            try {
              // 1. Ubah Base64 menjadi File (Blob)
              const base64Data = d.image.split(',')[1];
              const byteCharacters = atob(base64Data);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                  byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], {type: 'image/jpeg'});
      
              // 2. Buat nama file unik
              const fileName = `prod-${Date.now()}.jpg`;
      
              // 3. Upload ke Supabase Storage (bucket 'products')
              const { data: uploadData, error: uploadError } = await supabaseClient.storage
                .from('products')
                .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
      
              if (uploadError) throw uploadError;
      
              // 4. Ambil Link URL Publik dari file yang diupload
              const { data: urlData } = supabaseClient.storage
                .from('products')
                .getPublicUrl(fileName);
                
              finalImageUrl = urlData.publicUrl; // Simpan URL ini ke database
      
            } catch (err) {
              console.error("Gagal upload gambar ke Storage:", err);
              // Jika gagal upload, tetap simpan Base64 (tapi tidak disarankan)
            }
          }
      
          // Simpan data ke tabel products (pakai URL dari Storage)
          const row = {
            id: d.id, nama: d.nama, kategori: d.kategori,
            harga_beli: d.hargaBeli, harga_jual: d.hargaJual,
            stok: d.stok, image: finalImageUrl, jual_online: d.jualOnline
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
      
      restoreProduct(_token, id) {
        dispatch((async () => {
          const { error } = await supabaseClient.from('products').update({ is_deleted: false }).eq('id', id);
          if (error) throw error;
          return { success: true };
        })());
        return runner;
      },

      openShift(_token, modal, source) {
        dispatch((async () => {
          const { data, error } = await supabaseClient.rpc('rpc_open_shift', { modal, source: source || 'EXISTING' });
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

      saveBeban(_token, d) {
        dispatch((async () => {
          const { data, error } = await supabaseClient.rpc('rpc_save_beban', { payload: d });
          if (error) throw error;
          return data;
        })());
        return runner;
      },

      deleteBeban(_token, id) {
        dispatch((async () => {
          const { error } = await supabaseClient.from('expenses').delete().eq('id', id);
          if (error) throw error;
          return { success: true };
        })());
        return runner;
      },

      // ── SETUP ──
      saveSetup(_token, d) {
        dispatch((async () => {
          const rows = Object.keys(d).map(k => ({ key: k, value: d[k] }));
          const { error } = await supabaseClient.from('settings').upsert(rows);
          if (error) throw error;
          return { success: true };
        })());
        return runner;
      },

      // ── ONLINE ORDERS ──
      submitOnlineOrder(payload) {
        dispatch((async () => {
          const orderId = 'ONL-' + Date.now();
          const { error } = await supabaseClient.from('online_orders').insert({ order_id: orderId, nama: payload.nama, wa: payload.wa, waktu_ambil: payload.waktuAmbil, total: payload.total, cart: payload.cart, metode: payload.metode || 'Tunai', status: 'PENDING' });
          if (error) throw error;
          return { success: true, orderId };
        })());
        return runner;
      },

      getPendingOrders(_token) {
        dispatch((async () => {
          const { data, error } = await supabaseClient.from('online_orders').select('*').eq('status', 'PENDING').order('tanggal', {ascending:true});
          if (error) throw error;
          const mapped = (data||[]).map(o => ({ orderId: o.order_id, nama: o.nama, wa: o.wa, waktuAmbil: o.waktu_ambil, total: +o.total, cart: o.cart, metode: o.metode, tanggal: new Date(o.tanggal).getTime() }));
          return { success: true, data: mapped };
        })());
        return runner;
      },

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

      // ── ASET TETAP ──
      getAsetTetapList(_t) {
        dispatch((async () => {
          const { data, error } = await supabaseClient.from('aset_tetap').select('*');
          if (error) throw error;
          const mapAset = a => ({
            idAset: a.id_aset, nama: a.nama, kategori: a.kategori,
            tanggalPerolehan: new Date(a.tanggal_perolehan).getTime(),
            nilaiPerolehan: +a.nilai_perolehan, nilaiResidu: +a.nilai_residu,
            masaManfaat: a.masa_manfaat, akumPenyusutan: +a.akum_penyusutan,
            nbv: (+a.nilai_perolehan) - (+a.akum_penyusutan),
            lokasi: a.lokasi, keterangan: a.keterangan, sumberDana: a.sumber_dana, status: a.status
          });
          const mapped = (data || []).map(mapAset);
          const totalAset = mapped.reduce((s, a) => s + a.nilaiPerolehan, 0);
          const totalAkum = mapped.reduce((s, a) => s + a.akumPenyusutan, 0);
          const totalNbv = mapped.reduce((s, a) => s + a.nbv, 0);
          return { success: true, data: mapped, totalAset, totalAkum, totalNbv };
        })());
        return runner;
      },
      
      saveAsetTetap(_t, p) {
        dispatch((async () => {
          const row = {
            id_aset: p.idAset || ('AST-' + Date.now()),
            nama: p.nama,
            kategori: p.kategori,
            tanggal_perolehan: new Date(p.tanggalPerolehan).toISOString(),
            nilai_perolehan: p.nilaiPerolehan,
            nilai_residu: p.nilaiResidu,
            masa_manfaat: p.masaManfaat,
            lokasi: p.lokasi,
            keterangan: p.keterangan,
            sumber_dana: p.sumberDana
          };
          if (p.isNew) {
            const { error } = await supabaseClient.from('aset_tetap').insert(row);
            if (error) throw error;
          } else {
            const { error } = await supabaseClient.from('aset_tetap').update(row).eq('id_aset', p.idAset);
            if (error) throw error;
          }
          return { success: true };
        })());
        return runner;
      },

      disposeAsetTetap(_t, p) {
        dispatch((async () => {
          const { error } = await supabaseClient.from('aset_tetap').update({
            status: 'DISPOSED',
            tanggal_disposal: new Date(p.tanggalDisposal).toISOString(),
            nilai_jual: p.nilaiJual
          }).eq('id_aset', p.idAset);
          if (error) throw error;
          return { success: true };
        })());
        return runner;
      },

      jalankanPenyusutanBulanan(_t, periode) {
        dispatch((async () => {
          // Stub: Anggap sukses. (Bisa dikembangkan nanti menggunakan RPC di Supabase)
          return { success: true, totalPenyusutan: 0, jumlahAset: 0, message: 'Fitur penyusutan otomatis dalam pengembangan.' };
        })());
        return runner;
      },

      getRiwayatPenyusutan(_t) {
        dispatch((async () => {
          // Stub: return array kosong agar tabel tidak crash
          return { success: true, data: [] };
        })());
        return runner;
      },

      // ── BKU (BUKU KAS UMUM) ──
      saveBukuKasUmum(_t, p) {
        dispatch((async () => {
          const id = 'BKU-' + Date.now();
          const { data: { user } } = await supabaseClient.auth.getUser();
          const { error } = await supabaseClient.from('bku').insert({ id, tanggal: new Date(p.tanggal).toISOString(), no_bukti: p.noBukti, jenis: p.jenis, kategori: p.kategori, uraian: p.uraian, metode: p.metode, debit: p.jenis==='Pemasukan' ? p.nominal : 0, kredit: p.jenis==='Pengeluaran' ? p.nominal : 0, kasir: user?.email || 'system' });
          if (error) throw error;
          return { success:true, newId:id, tanggal:new Date(p.tanggal).getTime(), kasir:user?.email };
        })());
        return runner;
      },

      updateBukuKasUmum(_t, id, p) {
        dispatch((async () => {
          const { error } = await supabaseClient.from('bku').update({
            tanggal: new Date(p.tanggal).toISOString(), no_bukti: p.noBukti, jenis: p.jenis, kategori: p.kategori, uraian: p.uraian, metode: p.metode,
            debit: p.jenis === 'Pemasukan' ? p.nominal : 0, kredit: p.jenis === 'Pengeluaran' ? p.nominal : 0
          }).eq('id', id);
          if (error) throw error;
          return { success: true, tanggal: new Date(p.tanggal).getTime(), kasir: 'Admin' };
        })());
        return runner;
      },
      
      deleteBukuKasUmum(_t, id) {
        dispatch((async () => {
          const { error } = await supabaseClient.from('bku').delete().eq('id', id);
          if (error) throw error;
          return { success: true };
        })());
        return runner;
      },

      // ── PEMBAYARAN HUTANG ──
      getPembayaranHutangHistory(_t, refNota) {
        dispatch((async () => {
          const { data, error } = await supabaseClient.from('pembayaran_hutang').select('*').eq('ref_nota', refNota);
          if (error) throw error;
          const mapped = (data || []).map(p => ({
            id: p.id, refNota: p.ref_nota, tanggal: new Date(p.tanggal).getTime(),
            nominal: +p.nominal, metode: p.metode, kasir: p.kasir, keterangan: p.keterangan
          }));
          return { success: true, data: mapped };
        })());
        return runner;
      },

      savePembayaranHutang(_t, p) {
        dispatch((async () => {
          const id = 'PH-' + Date.now();
          const { data: { user } } = await supabaseClient.auth.getUser();
          const { error } = await supabaseClient.from('pembayaran_hutang').insert({
            id, ref_nota: p.refNota, tanggal: new Date().toISOString(),
            nominal: p.nominal, metode: p.metode, kasir: user?.email || 'Admin', keterangan: p.keterangan
          });
          if (error) throw error;
          return { success: true, payId: id, isLunas: false }; // Simplified stub
        })());
        return runner;
      },

      // ── LAYANAN DIGITAL ──
      getLayananDetail(_t, id) {
        dispatch((async () => {
          const { data, error } = await supabaseClient.from('layanan_digital').select('*').eq('id', id).single();
          if (error) throw error;
          return { success: true, data: { ...data, tanggal: new Date(data.tanggal).getTime() } };
        })());
        return runner;
      },

      processReturnLayanan(_t, id) {
        dispatch((async () => {
          const { error } = await supabaseClient.from('layanan_digital').delete().eq('id', id);
          if (error) throw error;
          return { success: true };
        })());
        return runner;
      },

      // ── STUBS LAINNYA (Mencegah Error if Called) ──
      saveBulkPembelian() { dispatch((async()=>({success:false,error:'Fitur belum tersedia di Supabase'}))()); return runner; },
      saveBulkProducts(_token, data, source) {
        dispatch((async () => {
          const { data: res, error } = await supabaseClient.rpc('rpc_save_bulk_products', {
            p_data: data,
            p_source: source || 'MODAL'
          });
          if (error) throw error;
          return res; // Akan mengembalikan { success: true, count: 142 }
        })());
        return runner;
      },
      lunasiKasbon()      { dispatch((async()=>({success:false,error:'Fitur belum tersedia di Supabase'}))()); return runner; },
      processReturn()     { dispatch((async()=>({success:false,error:'Fitur belum tersedia di Supabase'}))()); return runner; },
      cancelRestock()     { dispatch((async()=>({success:false,error:'Fitur belum tersedia di Supabase'}))()); return runner; },
      saveOpname()        { dispatch((async()=>({success:false,error:'Fitur belum tersedia di Supabase'}))()); return runner; },
      saveTarikTunai()    { dispatch((async()=>({success:false,error:'Fitur belum tersedia di Supabase'}))()); return runner; },
      saveProdukDigital() { dispatch((async()=>({success:false,error:'Fitur belum tersedia di Supabase'}))()); return runner; },
      saveTopUpEwallet()  { dispatch((async()=>({success:false,error:'Fitur belum tersedia di Supabase'}))()); return runner; },
      getSaldoGoPay()     { dispatch((async()=>({success:true,bank:0,transit:0,deposit:0}))()); return runner; },
      rekonsiliasiSettlementGoPay() { dispatch((async()=>({success:false,error:'Fitur belum tersedia di Supabase'}))()); return runner; },
      topUpDepositGoPay() { dispatch((async()=>({success:false,error:'Fitur belum tersedia di Supabase'}))()); return runner; },
    };

    return runner;
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, 'run', {
    configurable: true,
    get() { return createRunner(); }
  });

  window.google.script.url = {
    getLocation(cb) {
      const params = Object.fromEntries(new URLSearchParams(location.search));
      cb({ parameter: params });
    }
  };

  console.log('✅ GAS Shim installed — backend: Supabase');
})();
