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
        });
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
      getInitialData() {
        dispatch((async () => {
          const { data: { user } } = await supabaseClient.auth.getUser();
          if (!user) return { success: false, error: 'UNAUTHORIZED' };

          const [ profile, settings, products, transactions, purchases, journals, expenses, layanan, bku, shifts, aset, logs, users, oo, ph ] = await Promise.all([
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

          const pData = profile.data || {};
          const userObj = { 
            nama: pData.nama || 'Admin', 
            role: pData.role || 'Admin', 
            username: pData.username || user.email.split('@')[0] 
          };

          const mapProd = p => ({ id: p.id, nama: p.nama, kategori: p.kategori, hargaBeli: +p.harga_beli, hargaJual: +p.harga_jual, stok: p.stok, image: p.image, jualOnline: p.jual_online });
          const mapTrx = t => ({ id: t.id, tanggal: new Date(t.tanggal).getTime(), kasir: t.kasir, pelanggan: t.pelanggan, wa: t.wa, item: t.item_desc, total: +t.total, modal: +t.modal, laba: +t.laba, diskon: +t.diskon, metode: t.metode, bayar: +t.bayar, kembali: +t.kembali, status: t.status, cartJson: JSON.stringify(t.cart_json), pdfLink: t.pdf_link });
          const mapPur = p => ({ id: p.id, idProduk: p.id_produk, namaProduk: p.nama_produk, qty: p.qty, hargaBeli: +p.harga_beli, totalBiaya: +p.total_biaya, tanggal: new Date(p.tanggal).getTime(), supplier: p.supplier, metode: p.metode, refNota: p.ref_nota, kasir: p.kasir });
          const mapJurnal = j => ({ idJurnal: j.id_jurnal, tanggal: new Date(j.tanggal).getTime(), refId: j.ref_id, keterangan: j.keterangan, kodeAkun: j.kode_akun, namaAkun: j.nama_akun, debit: +j.debit, kredit: +j.kredit });
          const mapBeban = e => ({ id: e.id, tanggal: new Date(e.tanggal).getTime(), kasir: e.kasir, kategori: e.kategori, keterangan: e.keterangan, nominal: +e.nominal });
          const mapLay = l => ({ id: l.id, tanggal: new Date(l.tanggal).getTime(), kasir: l.kasir, jenis: l.jenis, nominal: +l.nominal, modal: +l.modal, fee: +l.fee, metode: l.metode, keterangan: l.keterangan });
          const mapBku = b => ({ id: b.id, tanggal: new Date(b.tanggal).getTime(), noBukti: b.no_bukti, jenis: b.jenis, kategori: b.kategori, uraian: b.uraian, metode: b.metode, debit: +b.debit, kredit: +b.kredit, kasir: b.kasir });
          const mapOO = o => ({ orderId: o.order_id, nama: o.nama, wa: o.wa, waktuAmbil: o.waktu_ambil, total: +o.total, cart: o.cart, metode: o.metode, tanggal: new Date(o.tanggal).getTime() });
          const mapLog = l => ({ id: l.id, waktu: new Date(l.waktu).getTime(), user: l.user, aksi: l.aksi, keterangan: l.keterangan });
          const mapPH = p => ({ id: p.id, refNota: p.ref_nota, tanggal: new Date(p.tanggal).getTime(), nominal: +p.nominal, metode: p.metode, kasir: p.kasir, keterangan: p.keterangan });
          const mapAset = a => ({ idAset: a.id_aset, nama: a.nama, kategori: a.kategori, tanggalPerolehan: new Date(a.tanggal_perolehan).getTime(), nilaiPerolehan: +a.nilai_perolehan, nilaiResidu: +a.nilai_residu, masaManfaat: a.masa_manfaat, akumPenyusutan: +a.akum_penyusutan, nbv: (+a.nilai_perolehan) - (+a.akum_penyusutan), lokasi: a.lokasi, keterangan: a.keterangan, sumberDana: a.sumber_dana, status: a.status });

          const currentShift = shifts.data[0] ? { id: shifts.data[0].id, modalAwal: +shifts.data[0].modal_awal, waktuBuka: new Date(shifts.data[0].waktu_buka).getTime() } : null;

          const saldo = { kas111:0, bank115:0, piutang112:0, hutang211:0 };
          (journals.data || []).forEach(j => {
            const k = j.kode_akun;
            if (k === '111') saldo.kas111    += (+j.debit - +j.kredit);
            if (k === '115') saldo.bank115   += (+j.debit - +j.kredit);
            if (k === '112') saldo.piutang112+= (+j.debit - +j.kredit);
            if (k === '211') saldo.hutang211 += (+j.kredit - +j.debit);
          });

          return {
            success: true, user: userObj, setup,
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
            currentShift, saldoRingkas: saldo,
            pembayaranHutang: (ph.data||[]).map(mapPH),
            asetTetap: (aset.data||[]).map(mapAset)
          };
        })());
        return runner;
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
          const row = { id: d.id, nama: d.nama, kategori: d.kategori, harga_beli: d.hargaBeli, harga_jual: d.hargaJual, stok: d.stok, image: d.image, jual_online: d.jualOnline };
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
