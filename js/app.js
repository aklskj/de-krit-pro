    function toggleMobileSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            if (sidebar.classList.contains('-translate-x-full')) {
                sidebar.classList.remove('-translate-x-full');
                overlay.classList.remove('hidden');
            } else {
                sidebar.classList.add('-translate-x-full');
                overlay.classList.add('hidden');
            }
        }
      // Taruh di atas sekali (helper global)
      function handleApiResponse(r, errMsgFallback) {
        if (!r) return false;
        if (r.error === "UNAUTHORIZED") {
          Swal.fire({
            icon: 'warning',
            title: 'Sesi Berakhir',
            html: 'Sesi login Anda sudah tidak valid.<br>' +
                  '<small class="text-slate-500">Biasanya karena login dari perangkat/tab lain dengan akun yang sama.</small><br><br>' +
                  '<b>Silakan login ulang.</b>',
            confirmButtonText: 'Login Ulang',
            allowOutsideClick: false
          }).then(function() {
            forceLogout();
          });
          return false;
        }
        if (!r.success) {
          Swal.fire('Error', errMsgFallback + (r.error || 'Unknown'), 'error');
          return false;
        }
        return true;
      }
      
      var posSearchIndex = -1;
		  // --- LOGIKA CUSTOMER VIEW APP ---
        function initCustomerSystem() {
            document.getElementById('initial-loader').style.display = 'flex';

            if (typeof google === 'undefined' || !google.script) {
                // Local dev / backend hilang
                document.getElementById('initial-loader').style.display = 'none';
                Swal.fire('Backend Tidak Terdeteksi', 'Google Apps Script tidak tersedia. Deploy ulang web app.', 'error');
                return;
            }

            google.script.run.withSuccessHandler(function(res) {
                // [FIX #10] Hide loader TERLEBIH DAHULU, di luar `if success`
                document.getElementById('initial-loader').style.display = 'none';

                if (!res || !res.success) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Gagal Memuat Katalog',
                        html:
                            'Server mengembalikan error:<br>' +
                            '<b>' + escapeHtml((res && res.error) || 'Unknown') + '</b><br><br>' +
                            '<span class="text-xs text-slate-500">Silakan refresh halaman atau hubungi admin.</span>',
                        confirmButtonText: 'Refresh',
                        allowOutsideClick: false
                    }).then(function() { location.reload(); });
                    return;
                }

                state.products = res.products || [];
                state.setup = res.setup || {};
                document.getElementById('cust-store-name').innerText = escapeHtml(res.setup['Nama Toko'] || 'Menu Restoran');
                renderCustomerGrid();
            }).withFailureHandler(function(err) {
                document.getElementById('initial-loader').style.display = 'none';
                Swal.fire({
                    icon: 'error',
                    title: 'Koneksi Gagal',
                    text: 'Tidak bisa terhubung ke server: ' + (err && err.message ? err.message : 'Unknown'),
                    confirmButtonText: 'Refresh',
                    allowOutsideClick: false
                }).then(function() { location.reload(); });
            }).getInitialData(null);
        }

        // AUTO SEPARATOR RIBUAN UNTUK INPUT ANGKA
        function formatAngkaRibuan(el) {
            if (!el) return;
            
            var cursorPos = el.selectionStart;
            var oldValue = el.value;
            var oldLength = oldValue.length;
            
            var raw = String(el.value || '').replace(/\D/g, '');
            if (raw.length > 15) raw = raw.substring(0, 15);
            
            var newValue;
            if (raw === '') {
                newValue = '';
            } else {
                raw = String(parseInt(raw, 10));
                newValue = Number(raw).toLocaleString('id-ID');
            }
            
            el.value = newValue;
            
            // Reposisi kursor: hitung pergeseran karakter
            if (oldLength !== newValue.length && cursorPos !== null) {
                var addedChars = newValue.length - oldLength;
                var newCursor = Math.max(0, cursorPos + addedChars);
                try { el.setSelectionRange(newCursor, newCursor); } catch(e) {}
            }
            
            el.dataset.raw = raw;
        }

        // [FIX] Helper: Hitung fee tarik tunai bertingkat + pembulatan ke ATAS per Rp 1.000
        function hitungFeeTarikTunaiJS(nominal) {
          function numOr(v, def) { var n = parseFloat(v); return isNaN(n) ? def : n; }
          var nominalNum  = Number(nominal) || 0;
          var feeFlat     = numOr(state.setup['Fee Tarik Tunai'], 2000);
          var batasFlat   = numOr(state.setup['Batas Fee Flat Tarik Tunai'], 499999);
          var persenBesar = numOr(state.setup['Persen Fee Tarik Tunai'], 1);
          
          if (nominalNum <= batasFlat) return feeFlat;
          var feeHitung = nominalNum * persenBesar / 100;
          // [FIX #5] Round ke integer dulu (hilangkan float drift),
          // lalu ceil ke ribuan terdekat dengan epsilon.
          return Math.ceil(Math.round(feeHitung) / 1000 - 1e-9) * 1000;
        }

        // Helper untuk ambil nilai angka bersih (tanpa titik)
        function getAngkaBersih(id) {
            var el = document.getElementById(id);
            if (!el) return 0;
            var raw = String(el.value || '').replace(/\D/g, '');
            return parseInt(raw, 10) || 0;
        }

        function isStoreOpen() {
          var now = new Date();
          
          // 1. CEK HARI AKTIF
          var savedHari = state.setup['Hari Buka Online'];
          var arrHari = savedHari !== undefined ? String(savedHari).split(',') : ['0','1','2','3','4','5','6'];
          if (!arrHari.includes(String(now.getDay()))) return false;

          // 2. CEK JAM OPERASIONAL
          var jamBuka = state.setup['Jam Buka Online'];
          var jamTutup = state.setup['Jam Tutup Online'];
          if (!jamBuka || !jamTutup) return true; 

          var currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
          
          if (jamBuka <= jamTutup) {
            // Mode Normal (Contoh: 08:00 s/d 20:00)
            return currentTime >= jamBuka && currentTime <= jamTutup;
          } else {
            // Mode Lewat Tengah Malam (Contoh: 17:00 s/d 02:00)
            return currentTime >= jamBuka || currentTime <= jamTutup;
          }
        }

        function renderCustomerGrid() {
            var grid = document.getElementById('cust-product-grid');
            
            // 1. BLOKIR KATALOG JIKA KANTIN TUTUP (HARI/JAM)
            if (!isStoreOpen()) {
                grid.innerHTML = `
                    <div class="col-span-full flex flex-col items-center justify-center py-20 text-center px-4">
                        <div class="w-24 h-24 bg-slate-200 text-slate-400 rounded-full flex items-center justify-center text-4xl mb-4 shadow-inner">
                            <i class="fas fa-store-slash"></i>
                        </div>
                        <h2 class="text-2xl font-black text-slate-800 mb-2">Kantin Sedang Tutup</h2>
                        <p class="text-slate-500 font-medium text-sm">Mohon maaf, pemesanan online saat ini belum tersedia.</p>
                        <p class="text-slate-400 font-bold text-[10px] mt-3">Silakan kembali pada hari dan jam operasional aktif.</p>
                    </div>`;
                
                document.getElementById('cust-fab-container').classList.add('hidden');
                return; 
            }

            // 2. GAMBAR KATALOG JIKA BUKA
            var search = document.getElementById('cust-search').value.toLowerCase();
            var html = '';
            
            var f = state.products.filter(function(p) {
                // Hanya tampilkan produk yang stoknya ada DAN dicentang Jual Online
                var tersedia = (p.stokTersedia !== undefined) ? p.stokTersedia : p.stok;
                return String(p.nama).toLowerCase().includes(search) && tersedia > 0 && p.jualOnline === true;
            });

            if(f.length === 0) {
                grid.innerHTML = '<div class="col-span-full text-center py-10 text-slate-400 font-bold">Produk tidak ditemukan</div>';
                return;
            }

            for(var i=0; i<f.length; i++) {
                var p = f[i];
                var imgSrc = p.image || 'https://placehold.co/150x150/e2e8f0/64748b?text=Menu';
                
                // PERUBAHAN: Menambahkan onclick di div utama, menambahkan cursor-pointer
                html += `
                <div onclick="addCustCart('${p.id}')" class="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex flex-col items-center text-center active:scale-95 transition-all cursor-pointer hover:border-blue-300 hover:shadow-md select-none">
                    <img src="${imgSrc}" class="w-20 h-20 object-contain p-1 bg-white rounded-xl mb-3 shadow-sm pointer-events-none" alt="${escapeHtml(p.nama)}">
					<h3 class="font-extrabold text-slate-800 text-xs mb-1 line-clamp-2 leading-tight pointer-events-none">${escapeHtml(p.nama)}</h3>
                    <p class="text-blue-600 font-black text-sm mt-auto mb-2 pointer-events-none">${formatRp(p.hargaJual)}</p>
                    <div class="w-full bg-blue-50 text-blue-600 font-bold py-1.5 rounded-lg text-xs transition-colors pointer-events-none">Tambah</div>
                </div>`;
            }
            grid.innerHTML = html;
        }
        
		    function addCustCart(id) {
            var p = state.products.find(x => String(x.id) === String(id));
            var item = state.custCart.find(x => String(x.id) === String(id));
            if(!p) return; 
            
            var tersedia = (p.stokTersedia !== undefined) ? p.stokTersedia : p.stok;
            if(item) { 
                if(item.qty < tersedia) { 
                    item.qty++; 
                } else { 
                    Swal.fire('Stok Terbatas', 'Maksimal pesanan untuk item ini adalah ' + tersedia, 'warning'); 
                    return; 
                }
            }
            else { 
                if(tersedia > 0) { 
                    state.custCart.push({ id: p.id, nama: p.nama, hargaJual: p.hargaJual, qty: 1 }); 
                } 
            }
            renderCustCartBadge();
        }
		
        function updateCustCartQty(id, delta) {
            var p = state.products.find(x => String(x.id) === String(id));
            var idx = state.custCart.findIndex(x => String(x.id) === String(id));
            var tersedia = (p.stokTersedia !== undefined) ? p.stokTersedia : p.stok;

            if(idx > -1) {
                var newQty = state.custCart[idx].qty + delta;
                if(newQty > tersedia) {
                    Swal.fire('Stok Terbatas', 'Sisa stok tersedia: ' + tersedia, 'warning');
                    return;
                }
                state.custCart[idx].qty = newQty;
                if(state.custCart[idx].qty <= 0) state.custCart.splice(idx, 1);
            }
            renderCustCartItems();
            renderCustCartBadge();
        }
		
        function renderCustCartBadge() {
            var fab = document.getElementById('cust-fab-container');
            if(state.custCart.length === 0) {
                fab.classList.add('hidden');
                return;
            }
            fab.classList.remove('hidden');
            
            var totalQty = 0; var totalBayar = 0;
            for(var i=0; i<state.custCart.length; i++) {
                totalQty += state.custCart[i].qty;
                totalBayar += (state.custCart[i].qty * state.custCart[i].hargaJual);
            }
            document.getElementById('cust-cart-qty').innerText = totalQty;
            document.getElementById('cust-cart-total').innerText = formatRp(totalBayar);
        }

        function openCustomerCart() {
            renderCustCartItems();
            document.getElementById('modal-cust-cart').classList.remove('hidden');
        }

        function renderCustCartItems() {
            var c = document.getElementById('cust-cart-items');
            var total = 0;
            var html = '';
            
            if(state.custCart.length === 0) {
                c.innerHTML = '<div class="text-center py-10 text-slate-400 font-bold">Keranjang Kosong</div>';
                document.getElementById('cust-cart-final-total').innerText = 'Rp 0';
                return;
            }

            for(var i=0; i<state.custCart.length; i++) {
                var it = state.custCart[i];
                total += (it.qty * it.hargaJual);
                html += `
                <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center">
                    <div>
                        <h4 class="font-extrabold text-slate-800 text-sm">${escapeHtml(it.nama)}</h4>
                        <p class="text-blue-600 font-black text-xs mt-0.5">${formatRp(it.hargaJual)}</p>
                    </div>
                    <div class="flex items-center gap-3 bg-white px-2 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                        <button onclick="updateCustCartQty('${it.id}', -1)" class="w-6 h-6 flex items-center justify-center font-black text-slate-500 bg-slate-50 rounded">-</button>
                        <span class="font-black text-sm w-4 text-center">${it.qty}</span>
                        <button onclick="updateCustCartQty('${it.id}', 1)" class="w-6 h-6 flex items-center justify-center font-black text-slate-500 bg-slate-50 rounded">+</button>
                    </div>
                </div>`;
            }
            c.innerHTML = html;
            document.getElementById('cust-cart-final-total').innerText = formatRp(total);
        }

        function openCustomerCheckout() {
            if(state.custCart.length === 0) return;
            var minOrder = parseInt(state.setup['Minimal Order Online']) || 0;
            var totalBayar = 0;
            for(var i=0; i<state.custCart.length; i++) { totalBayar += state.custCart[i].qty * state.custCart[i].hargaJual; }
            
            if (totalBayar < minOrder) { Swal.fire('Minimal Order', 'Mohon maaf, minimal pemesanan online adalah ' + formatRp(minOrder), 'warning'); return; }

            // Gunakan fungsi isStoreOpen untuk memblokir jika sedang tutup hari ini / di luar jam
            if (!isStoreOpen()) {
                Swal.fire('Kantin Tutup', 'Mohon maaf, pemesanan online saat ini sedang ditutup atau di luar jam operasional.', 'error');
                return;
            }
            
            document.getElementById('modal-cust-cart').classList.add('hidden'); document.getElementById('modal-cust-checkout').classList.remove('hidden');
        }
        
		    function submitCustomerOrder() {
            var namaRaw = document.getElementById('cust-name').value.trim();
            var wa = document.getElementById('cust-wa').value.trim();
            var waktu = document.getElementById('cust-time').value;

            // 1. FILTER NAMA DARI HACKER (Cuma boleh huruf, angka, spasi, titik, koma)
            var namaClean = namaRaw.replace(/[^a-zA-Z0-9\s.,'-]/g, "");
            
            if(!namaClean) { 
                Swal.fire('Eits!', 'Nama pemesan wajib diisi yaa!', 'warning'); 
                return; 
            }
            if(namaRaw !== namaClean) { 
                Swal.fire('Peringatan Keamanan', 'Duh, namanya jangan pakai simbol aneh-aneh ya, pakai huruf dan angka aja biar aman!', 'error'); 
                return; 
            }

            // 2. CEK RECAPTCHA (Mencegah Bot Spam)
            var recaptchaResponse = grecaptcha.getResponse();
            if(recaptchaResponse.length === 0) {
                Swal.fire('Tunggu Dulu', 'Centang dulu kotak "I\'m not a robot" nya.', 'warning');
                return;
            }

            var btn = document.getElementById('btn-cust-submit');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Memproses...'; 
            btn.disabled = true;

            var totalBayar = 0;
            for(var i=0; i<state.custCart.length; i++) { totalBayar += state.custCart[i].qty * state.custCart[i].hargaJual; }

            var payload = {
                nama: namaClean,
                wa: wa,
                waktuAmbil: waktu,
                total: totalBayar,
                cart: state.custCart,
                metode: 'Tunai',  // [PATCH v7.19 #9] Default tunai (customer bayar di kasir)
                tanggal: new Date().getTime(),
                recaptchaToken: recaptchaResponse
            };

            google.script.run.withSuccessHandler(function(res) {
                btn.innerHTML = 'Pesan Sekarang'; btn.disabled = false;
                grecaptcha.reset(); // Jangan lupa reset captchanya ya kalau udah beres

                if(res.success) {
                    document.getElementById('modal-cust-checkout').classList.add('hidden');
                    
                    // --- ISI DATA TIKET UMUM ---
                    document.getElementById('cust-success-id').innerText = res.orderId;
                    document.getElementById('cust-success-toko').innerText = state.setup['Nama Toko'] || 'AK Shop';
                    document.getElementById('cust-success-nama').innerText = escapeHtml(namaClean);
                    document.getElementById('cust-success-waktu').innerText = escapeHtml(waktu);

                    // --- LOGIKA TANGGAL & JAM SEKARANG ---
                    var sekarang = new Date();
                    var formatTgl = sekarang.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
                    var formatJam = sekarang.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
                    document.getElementById('cust-success-timestamp').innerText = formatTgl + ' ' + formatJam + ' WIB';
                    
                    // --- INJECT DETAIL PESANAN ITEM ---
                    var itemsHtml = '';
                    var totalSukses = 0;
                    for(var j=0; j<state.custCart.length; j++) {
                        var itm = state.custCart[j];
                        var sub = itm.qty * itm.hargaJual;
                        totalSukses += sub;
                        itemsHtml += `<div class="flex justify-between font-medium text-slate-700">
                            <span class="truncate pr-2">${escapeHtml(itm.nama)} <span class="text-slate-400 font-bold ml-1">x${itm.qty}</span></span>
                            <span class="font-bold whitespace-nowrap">${formatRp(sub)}</span>
                        </div>`;
                    }
                    document.getElementById('cust-success-items').innerHTML = itemsHtml;
                    document.getElementById('cust-success-total').innerText = formatRp(totalSukses);

                    // --- GAMBAR BARCODE ---
                    JsBarcode("#cust-barcode-canvas", res.orderId, {
                        format: "CODE128",
                        width: 2,
                        height: 50,
                        displayValue: false, 
                        margin: 0
                    });

                    document.getElementById('cust-success-screen').classList.remove('hidden');
                    document.getElementById('cust-fab-container').classList.add('hidden');
                    state.custCart = []; 
                } else {
                    Swal.fire("Gagal", res.error, "error");
                }
            }).withFailureHandler(function(err){
                btn.innerHTML = 'Pesan Sekarang'; btn.disabled = false;
                grecaptcha.reset();
                Swal.fire("Koneksi gagal", "Gagal menghubungi server, coba lagi ya!", "error");
            }).submitOnlineOrder(payload);
        }
		
        // FUNGSI DOWNLOAD TIKET BARU DENGAN HTML2CANVAS
        function downloadCustomerBarcode(event) {
            var btn = event.currentTarget;
            var originalText = btn.innerHTML;
            
            // Ubah tombol jadi loading
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Menyimpan...';
            btn.disabled = true;

            var ticketArea = document.getElementById("ticket-download-area");

            // html2canvas mengubah elemen div html menjadi gambar canvas
            html2canvas(ticketArea, {
                scale: 2, // Agar hasil download beresolusi tinggi (tidak pecah)
                backgroundColor: "#ffffff",
                useCORS: true
            }).then(function(canvas) {
                var link = document.createElement('a');
                link.download = 'TIKET_' + document.getElementById('cust-success-id').innerText + '.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
                
                // Kembalikan status tombol
                btn.innerHTML = originalText;
                btn.disabled = false;
            }).catch(function(err) {
                btn.innerHTML = originalText;
                btn.disabled = false;
                alert("Gagal menyimpan tiket: " + err);
            });
        }
		
		    function resetCustomerView() {
            document.getElementById('cust-success-screen').classList.add('hidden');
            document.getElementById('cust-name').value = '';
            document.getElementById('cust-wa').value = '';
        }

        // --- LOGIKA CASHIER DASHBOARD (POLLING)----
        function startOnlineOrdersPolling() {
            if(onlinePollingInterval) clearInterval(onlinePollingInterval);
            
            // Tambahkan variabel untuk melacak ID pesanan terakhir yang dilihat kasir
            var lastKnownOrderIds = [];
            
            onlinePollingInterval = setInterval(function() {
                // HENTIKAN POLLING JIKA INI ADALAH LAYAR CUSTOMER VIEW
                if (!document.getElementById('customer-app').classList.contains('hidden')) {
                    return; 
                }

                if(typeof google !== 'undefined' && storageManager.get('pos_token_final')) {
                    google.script.run.withSuccessHandler(function(res) {
                        if(res.success) {
                            var newOrders = res.data || [];
                            state.onlineOrders = newOrders;
                            
                            // Gunakan logika array ID untuk deteksi pesanan baru, BUKAN panjang array (length)
                            var currentOrderIds = newOrders.map(function(o) { return o.orderId; });
                            var hasNewOrder = false;
                            
                            // Cek apakah ada ID pesanan baru yang belum pernah dilihat sebelumnya
                            for (var i = 0; i < currentOrderIds.length; i++) {
                                if (lastKnownOrderIds.indexOf(currentOrderIds[i]) === -1) {
                                    hasNewOrder = true;
                                    break;
                                }
                            }
                            
                            updateOnlineOrdersBadge(hasNewOrder);
                            lastKnownOrderIds = currentOrderIds; // Update catatan ID terakhir

                            // Auto refresh list if modal is open
                            if(!document.getElementById('modal-online-orders').classList.contains('hidden')) {
                                renderOnlineOrdersList();
                            }
                        }
                    }).getPendingOrders(storageManager.get('pos_token_final')); // <-- PASTIKAN TOKEN DIKIRIM KE BACKEND!
                }
            }, 5000); // 5000ms = 5 Detik
        }

        function updateOnlineOrdersBadge(hasNewOrder) {
            var btn = document.getElementById('badge-online-orders');
            var countTxt = document.getElementById('badge-online-count');
            
            var currLen = state.onlineOrders.length;
            
            if(currLen > 0) {
                btn.classList.remove('hidden');
                countTxt.innerText = currLen;
                
                // Efek Flash/Kedip HANYA JIKA ADA ID PESANAN BARU
                if(hasNewOrder) {
                    var mainBtn = btn.parentElement;
                    mainBtn.classList.add('animate-flash');
                    playBeep(); // Bunyikan beep kasir
                    
                    // Tambahan efek goyang/bounce agar kasir lebih notice
                    mainBtn.classList.add('animate-bounce');
                    
                    setTimeout(function() {
                        mainBtn.classList.remove('animate-flash');
                        mainBtn.classList.remove('animate-bounce');
                    }, 4000);
                }
            } else {
                btn.classList.add('hidden');
            }
        }
		
		    function openOnlineOrdersModal() {
            var searchInput = document.getElementById('search-online-order');
            searchInput.value = ''; // Bersihkan pencarian sebelumnya
            renderOnlineOrdersList();
            openModal('modal-online-orders');
            // Otomatis fokus ke kotak pencarian agar siap di-scan kasir
            setTimeout(() => searchInput.focus(), 300); 
        }

        function renderOnlineOrdersList() {
            var c = document.getElementById('online-orders-list');
            var searchQ = document.getElementById('search-online-order').value.toLowerCase().trim();
            var html = '';

            // Filter data jika ada pencarian (scan barcode / ketik nama)
            var filteredOrders = state.onlineOrders;
            if(searchQ !== '') {
                filteredOrders = state.onlineOrders.filter(function(o) {
                    return String(o.orderId).toLowerCase().includes(searchQ) || String(o.nama).toLowerCase().includes(searchQ);
                });
            }

            if(filteredOrders.length === 0) {
                c.innerHTML = '<div class="text-center py-10 text-slate-400"><i class="fas fa-box-open text-4xl mb-3 text-emerald-200"></i><p class="font-bold">Tidak ada pesanan online.</p></div>';
                return;
            }

            for(var i=0; i<filteredOrders.length; i++) {
                var o = filteredOrders[i];
                var dObj = new Date(o.tanggal);
                var dateStr = dObj.toLocaleDateString('id-ID', {day:'2-digit', month:'short'}) + ' ' + dObj.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
				
                var itemsHtml = '';
                for(var j=0; j<o.cart.length; j++) {
                    itemsHtml += `<div class="flex justify-between text-[11px] text-slate-600 border-b border-slate-50 last:border-0 py-1"><span>${escapeHtml(o.cart[j].nama)} x${o.cart[j].qty}</span><span class="font-bold">${formatRp(o.cart[j].hargaJual * o.cart[j].qty)}</span></div>`;
                }

                html += `
                <div class="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200 flex flex-col gap-3 relative overflow-hidden">
                    <div class="absolute top-0 right-0 bg-emerald-500 text-white text-[9px] font-black px-2 py-1 rounded-bl-lg">${dateStr}</div>
                    <div>
                        <h4 class="font-extrabold text-sm text-emerald-800">${escapeHtml(o.orderId)}</h4>
                        <p class="text-xs font-bold text-slate-600 mt-0.5"><i class="fas fa-user text-slate-400 mr-1"></i> ${escapeHtml(o.nama)} <span class="text-slate-300 mx-1">|</span> <i class="fas fa-clock text-slate-400 mr-1"></i> Ambil: ${escapeHtml(o.waktuAmbil)}</p>
                    </div>
                    <div class="bg-white p-2 rounded-lg border border-slate-100 shadow-sm">
                        ${itemsHtml}
                    </div>
                    <div class="flex justify-between items-center mt-1">
                        <span class="font-black text-emerald-700">${formatRp(o.total)}</span>
                        <div class="flex gap-2">
                            <button onclick="cancelOnlineOrderAction('${o.orderId}')" class="bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 text-xs px-3 py-2 rounded-lg font-bold transition-all active:scale-95">Batal</button>
                            <button onclick="processOnlineOrderAction('${o.orderId}')" class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2 rounded-lg font-bold shadow-md transition-all active:scale-95">Selesai</button>
                        </div>
                    </div>
                </div>`;
            }
            c.innerHTML = html;
        }
		
        function processOnlineOrderAction(orderId) {
            if(!state.currentShift) {
                alert("Harap buka shift terlebih dahulu!"); return;
            }

            var token = storageManager.get('pos_token_final');
            Swal.fire({
                title: 'Selesaikan Pesanan?',
                text: "Memproses pesanan ini akan mencatat transaksi tunai dan memotong stok. Pastikan pelanggan sudah membayar.",
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Ya, Bayar & Selesai'
            }).then((result) => {
                if (result.isConfirmed) {
                    Swal.fire({title: 'Memproses...', allowOutsideClick: false, didOpen: () => {Swal.showLoading()}});
                    
                    google.script.run.withSuccessHandler(function(res) {
                        if(res.success) {
                            Swal.fire('Berhasil', 'Pesanan online berhasil diselesaikan!', 'success');
                            manualSync(true);
                            // [TAMBAHKAN INI]
                            setTimeout(function() {
                                var s = document.getElementById('pos-search');
                                if (s) { s.value = ''; s.focus(); }
                            }, 500);
                        } else {
                            Swal.fire('Gagal', res.error, 'error');
                        }
                    }).withFailureHandler(function(){
                        Swal.fire('Error', 'Gagal memproses ke server.', 'error');
                    }).processOnlineOrder(token, orderId); // Kirim ke endpoint khusus proses order online
                }
            });
        }

		function cancelOnlineOrderAction(orderId) {
            var token = storageManager.get('pos_token_final');
            Swal.fire({
                title: 'Batalkan Pesanan?',
                text: "Pesanan online ini akan dibatalkan dan dihapus dari antrean.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: 'Ya, Batalkan'
            }).then((result) => {
                if (result.isConfirmed) {
                    Swal.fire({title: 'Memproses...', allowOutsideClick: false, didOpen: () => {Swal.showLoading()}});
                    google.script.run.withSuccessHandler(function(res) {
                        if(res.success) {
                            Swal.fire('Dibatalkan', 'Pesanan online berhasil dibatalkan.', 'success');
                            // Hapus dari state lokal dan render ulang secara instan
                            state.onlineOrders = state.onlineOrders.filter(function(o) { return o.orderId !== orderId; });
                            renderOnlineOrdersList();
                            updateOnlineOrdersBadge(false);
                            manualSync(true);   // [FIX] sinkron state server agar Dashboard & Reports fresh
                        } else {
                            Swal.fire('Gagal', res.error, 'error');
                        }
                    }).withFailureHandler(function(){
                        Swal.fire('Error', 'Gagal memproses ke server.', 'error');
                    }).cancelOnlineOrder(token, orderId); 
                }
            });
        }
		
        // --- HOTKEYS & BEEP ---
        document.addEventListener('keydown', function(e) {
            // 1. Eksekusi tombol "Enter" untuk Konfirmasi Pembayaran
            if(e.key === 'Enter') {
                var modalPay = document.getElementById('modal-payment');
                if (modalPay && !modalPay.classList.contains('hidden')) {
                    var btnConfirm = document.getElementById('btn-confirm-pay');
                    if (btnConfirm && !btnConfirm.disabled && !btnConfirm.classList.contains('hidden')) {
                        e.preventDefault();
                        processTransaction();
                        return;
                    }
                }
            }

            // 2. Daftar Hotkeys F-Keys (Kasir & Global)
            if(e.key === 'F2') { e.preventDefault(); if(!document.getElementById('view-pos').classList.contains('hidden')) openScanner(); return; }
            if(e.key === 'F3') { 
                e.preventDefault(); 
                if(!document.getElementById('view-pos').classList.contains('hidden')) { 
                    var s = document.getElementById('pos-search'); if(s) { s.focus(); s.select(); } 
                } else if (!document.getElementById('view-inventory').classList.contains('hidden')) {
                    var invS = document.getElementById('inv-search'); if(invS) { invS.focus(); invS.select(); }
                }
                return; 
            }
            if(e.key === 'F4') { e.preventDefault(); if(!document.getElementById('view-pos').classList.contains('hidden') && state.cart.length > 0) openPayment('Tunai'); return; }
            if(e.key === 'F6') { e.preventDefault(); if(!document.getElementById('view-pos').classList.contains('hidden') && state.cart.length > 0) openPayment('QRIS'); return; }
            if(e.key === 'F7') { e.preventDefault(); openOnlineOrdersModal(); return; }
            if(e.key === 'F8') { e.preventDefault(); if(!document.getElementById('view-pos').classList.contains('hidden')) holdCurrentCart(); return; }
            if(e.key === 'F9') { e.preventDefault(); openCloseShiftModal(); return; }
            if(e.key === 'F10') { e.preventDefault(); switchView('layanan'); return; }
            if(e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); toggleNotificationCenter(); return; }
            
            // 3. Daftar Hotkeys Inventori (Alt + Huruf)
            if(!document.getElementById('view-inventory').classList.contains('hidden')) {
                if(e.altKey && e.key.toLowerCase() === 'c') { e.preventDefault(); printAllInventory(); return; }
                if(e.altKey && e.key.toLowerCase() === 'r') { e.preventDefault(); prepareRestockModal(); return; }
                if(e.altKey && e.key.toLowerCase() === 'o') { e.preventDefault(); prepareOpnameModal(); return; }
                if(e.altKey && e.key.toLowerCase() === 'b') { e.preventDefault(); openProductModal(); return; }
            }

            // 4. Escape untuk menutup semua Modal
            if(e.key === 'Escape') { 
                e.preventDefault(); 
                var modals = ['modal-payment', 'modal-receipt', 'modal-hold', 'modal-product', 'modal-restock', 'modal-opname', 'modal-tx-detail', 'modal-purch-detail', 'modal-beban', 'modal-shift-close', 'modal-online-orders', 'modal-command', 'modal-layanan', 'modal-layanan-detail', 'modal-gopay', 'modal-histori-lunas', 'modal-user'];
                modals.forEach(m => closeModal(m)); 
                //if(isScanning) closeScanner(); 
                Swal.close();
                return;
            }

            // 5. Abaikan ketikan huruf/angka biasa jika kursor sedang di dalam input box
            if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return; 
        });

        function playBeep() { 
            if(state.setup['Suara Kasir'] === false) return; 
            try {
                var ctx = new (window.AudioContext || window.webkitAudioContext)();
                var osc = ctx.createOscillator(); var gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type = 'sine'; osc.frequency.setValueAtTime(800, ctx.currentTime);
                gain.gain.setValueAtTime(0.1, ctx.currentTime);
                osc.start(); osc.stop(ctx.currentTime + 0.1);
            } catch(e) {} 
        }

        function escapeHtml(str) { 
            if (str == null) return ''; 
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;'); 
        }

        // [PATCH v7.19 #4] Escape nilai yang akan dimasukkan ke JS string literal
        // DI DALAM atribut HTML onclick="..." — karena browser decode HTML entity
        // SEBELUM JS parse, kita perlu escape ganda: JS dulu, baru HTML.
        function safeJsArg(v) {
            if (v == null) return '';
            var jsEsc = String(v)
                .replace(/\\/g, '\\\\')   // backslash
                .replace(/'/g,  "\\'")    // single quote → \'
                .replace(/\r/g, '\\r')
                .replace(/\n/g, '\\n');
            // Setelah JS-escape, baru HTML-escape supaya aman di atribut
            return jsEsc
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');  // entity ini akan didecode browser JADI \'
        }
        function formatRp(angka) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka); }

        // [PATCH v7.19.2] Helper: format tanggal ke YYYY-MM-DD pakai TIMEZONE LOKAL (bukan UTC)
        // Menggantikan pola `.toISOString().split('T')[0]` yang bisa mundur 1 hari
        // saat diakses pagi (00:00–07:00 WIB).
        function toLocalDateStr(d) {
            if (!d) d = new Date();
            if (typeof d === 'string') {
                // Kalau input "YYYY-MM-DD", return langsung (sudah format yang benar)
                if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
                d = new Date(d);
            }
            var yyyy = d.getFullYear();
            var mm   = String(d.getMonth() + 1).padStart(2, '0');
            var dd   = String(d.getDate()).padStart(2, '0');
            return yyyy + '-' + mm + '-' + dd;
        }

        // [PATCH v7.19.2] Helper: parse string "YYYY-MM-DD" menjadi Date pada LOCAL midnight
        // Menghindari UTC drift dari `new Date("2024-01-15")` yang diinterpretasi sbg UTC.
        function parseLocalDate(str) {
            if (!str) return new Date();
            var parts = String(str).split('-');
            if (parts.length !== 3) return new Date(str);
            return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        }

        var storageManager = { get: function(k) { try{return localStorage.getItem(k)}catch(e){return null} }, set: function(k,v) { try{localStorage.setItem(k,v)}catch(e){} }, remove: function(k) { try{localStorage.removeItem(k)}catch(e){} } };

        // --- STATE MANAGER ---
        var state = { 
            products: [], transactions: [], purchases: [], setup: {}, logs: [], cart: [], user: null, paymentMethod: 'Tunai',
            heldCarts: JSON.parse(storageManager.get('pos_held_carts') || '[]'),
            offlineQueue: JSON.parse(storageManager.get('pos_offline_tx') || '[]'),
            currentShift: null, restockCart: [], opnameCart: [], beban: [], custCart: [], onlineOrders: [], jurnal: [], users: [], layananDigital: [], bku: [], pembayaranHutang: [], saldoRingkas: { kas111: 0, bank115: 0, piutang112: 0, hutang211: 0 },
        };
        // [NEW] NOTIFICATION CENTER
        var _lastNotifIds = JSON.parse(storageManager.get('pos_notif_read_ids') || '[]');
		    var onlinePollingInterval = null; // <--- TAMBAHAN
        var _notifPollingInterval = null;
        var salesChartInstance = null; var isMobileCartOpen = false;
        
        var invCurrentPage = 1;
        var invItemsPerPage = 10;
        var invFilteredData = [];
		
        var invSortCol = 'nama';
        var invSortAsc = true;
      		
		    // --- VARIABEL PAGINASI LAPORAN ---
        var repJualCurrentPage = 1;
        var repBeliCurrentPage = 1;
        var repItemsPerPage = 10;
        var filteredJualData = [];
        var filteredBeliData = [];

        // Fungsi Helper untuk Navigasi Halaman Laporan
        function repJualNextPage() { var maxPage = Math.ceil(filteredJualData.length / repItemsPerPage); if (repJualCurrentPage < maxPage) { repJualCurrentPage++; renderReports(); } }
        function repJualPrevPage() { if (repJualCurrentPage > 1) { repJualCurrentPage--; renderReports(); } }
        function repBeliNextPage() { var maxPage = Math.ceil(filteredBeliData.length / repItemsPerPage); if (repBeliCurrentPage < maxPage) { repBeliCurrentPage++; renderReports(); } }
        function repBeliPrevPage() { if (repBeliCurrentPage > 1) { repBeliCurrentPage--; renderReports(); } }

        // Fungsi Pembungkus Export Excel (Trik Agar Export Semua Data Bukan Cuma 1 Halaman)
        function exportDataJual() { var temp = repItemsPerPage; repItemsPerPage = 999999; renderReports(); exportCSV('rep-table-jual', 'Laporan_Penjualan'); repItemsPerPage = temp; renderReports(); }
        function exportDataBeli() { var temp = repItemsPerPage; repItemsPerPage = 999999; renderReports(); exportCSV('rep-table-beli', 'Laporan_Pembelian'); repItemsPerPage = temp; renderReports(); }
        // Fungsi untuk Mencetak Semua Baris Laporan Tanpa Terpotong Paginasi & Scroll
        function printLaporan() {
            // 1. Simpan pengaturan halaman saat ini
            var tempItemsPerPage = repItemsPerPage;
            var tempJualPage = repJualCurrentPage;
            var tempBeliPage = repBeliCurrentPage;

            // 2. Set tampilan jadi tak terbatas (semua baris)
            repItemsPerPage = 999999;
            repJualCurrentPage = 1;
            repBeliCurrentPage = 1;
            renderReports(); // Render ulang tabel agar semua data keluar

            // 3. Matikan batas scrollbar sementara agar printer browser tidak memotong tabel
            var wrapJual = document.getElementById('wrap-table-jual');
            var wrapBeli = document.getElementById('wrap-table-beli');
            if(wrapJual) { wrapJual.classList.remove('overflow-x-auto'); wrapJual.style.overflow = 'visible'; }
            if(wrapBeli) { wrapBeli.classList.remove('overflow-x-auto'); wrapBeli.style.overflow = 'visible'; }

            // 4. Buka jeda sepersekian detik agar DOM (HTML) sempat menggambar tabel penuh sebelum dialog Print muncul
            setTimeout(function() {
                // Panggil dialog pencetakan browser
                printArea('print-area-rep');

                // 5. Kembalikan tabel dan paginasi seperti semula (rapi kembali)
                repItemsPerPage = tempItemsPerPage;
                repJualCurrentPage = tempJualPage;
                repBeliCurrentPage = tempBeliPage;
                
                if(wrapJual) { wrapJual.classList.add('overflow-x-auto'); wrapJual.style.overflow = ''; }
                if(wrapBeli) { wrapBeli.classList.add('overflow-x-auto'); wrapBeli.style.overflow = ''; }
                
                renderReports(); // Render ulang kembali ke 10 baris
            }, 300);
        }
		
        // [PATCH v7.19.3] exportDataInventori() → .xls rapi, angka murni number
        function exportDataInventori() {
            if (!state.products || state.products.length === 0) {
                showToast('Tidak ada data produk untuk diexport', 'error');
                return;
            }

            // Gunakan CSV murni, bukan HTML Table agar ID tidak rusak
            var csvContent = "ID,Nama Produk,Kategori,Harga Beli,Harga Jual,Stok,Jual Online\n";
            
            for (var i = 0; i < state.products.length; i++) {
                var p = state.products[i];
                // Bungkus ID dengan tanda kutip (="...") agar Excel membacanya sebagai Teks, bukan Angka
                var safeId = '="' + String(p.id).replace(/"/g, '""') + '"';
                var safeNama = '"' + String(p.nama).replace(/"/g, '""') + '"';
                var safeKategori = '"' + String(p.kategori).replace(/"/g, '""') + '"';
                var onlineStr = p.jualOnline ? 'Ya' : 'Tidak';
                
                csvContent += safeId + "," + 
                              safeNama + "," + 
                              safeKategori + "," + 
                              p.hargaBeli + "," + 
                              p.hargaJual + "," + 
                              p.stok + "," + 
                              onlineStr + "\n";
            }

            var blob = new Blob(["\ufeff", csvContent], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = url;
            link.download = 'Data_Inventori_' + toLocalDateStr(new Date()) + '.csv';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
            showToast('File CSV berhasil diunduh', 'success');
        }

		    document.addEventListener('DOMContentLoaded', function() { 
			  setupEventListeners(); 

			  // Cek parameter URL melalui API Google Apps Script
			  if (typeof google !== 'undefined' && google.script && google.script.url) {
				google.script.url.getLocation(function(location) {
            // Jika ada parameter ?view=customer
            if (location.parameter && location.parameter.view === 'customer') {
              document.getElementById('login-screen').classList.add('hidden');
              document.getElementById('customer-app').classList.remove('hidden');
              initCustomerSystem();
            } else {
              // Mode Admin/Kasir Default
              initializeAppSystem(); 
              setInterval(updateClock, 1000); 
              updateClock(); 
              applySidebarState();
            }
          });
        } else {
				// Fallback jika dibuka di Localhost/Offline
            var urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('view') === 'customer') {
              document.getElementById('login-screen').classList.add('hidden');
              document.getElementById('customer-app').classList.remove('hidden');
              initCustomerSystem();
            } else {
              initializeAppSystem(); 
              setInterval(updateClock, 1000); 
              updateClock(); 
              applySidebarState();
            }
          }
        });
        function updateClock() { try { var now = new Date(); var el = document.getElementById('realtime-clock'); if(el) el.innerText = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0'); } catch(e) {} }

        function toggleSidebar() {
            var sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('collapsed');
            storageManager.set('pos_sidebar_collapsed', sidebar.classList.contains('collapsed'));
        }

        function applySidebarState() {
            if(storageManager.get('pos_sidebar_collapsed') === 'true') {
                document.getElementById('sidebar').classList.add('collapsed');
            }
        }

        function setupEventListeners() {
            document.getElementById('pos-grid').addEventListener('click', function(e) { var card = e.target.closest('.product-card'); 
            if (card && !card.classList.contains('opacity-60')) addToCart(card.getAttribute('data-id')); });
            document.getElementById('cart-container').addEventListener('click', function(e) { var btn = e.target.closest('.cart-btn'); 
            if (btn) updateQty(btn.getAttribute('data-id'), parseInt(btn.getAttribute('data-val'))); });
            // [PATCH] Event delegation baru untuk semua aksi inventory
            document.getElementById('inv-tbody').addEventListener('click', function(e) {
                var btn = e.target.closest('.inv-action-btn');
                if (!btn) return;
                
                var action = btn.getAttribute('data-action');
                var id     = btn.getAttribute('data-id');
                var nama   = btn.getAttribute('data-nama') || '';
                var harga  = parseInt(btn.getAttribute('data-harga'), 10) || 0;
                
                if (action === 'edit') {
                    if (!canDoAdmin()) return showToast('Hanya Admin!', 'error');
                    openProductModal(id);
                } else if (action === 'barcode') {
                    printItemBarcode(id, nama, harga);
                } else if (action === 'delete') {
                    if (!canDoAdmin()) return showToast('Hanya Admin!', 'error');
                    deleteProductAction(id, nama);
                }
            });
            document.getElementById('rep-tbody-jual').addEventListener('click', function(e) { var btnD = e.target.closest('.detail-btn'); 
            if(btnD) openTxDetail(btnD.getAttribute('data-id')); });
            document.getElementById('rep-tbody-beli').addEventListener('click', function(e) { var btnDP = e.target.closest('.detail-purch-btn'); 
            if(btnDP) openPurchDetail(btnDP.getAttribute('data-id')); });
            
            var payCustInput = document.getElementById('pay-customer');
            if (payCustInput) {
                payCustInput.addEventListener('input', function() {
                    var btn = document.getElementById('btn-confirm-pay');
                    if (!btn) return;
                    var custName = this.value.trim();

                    // [FIX] Untuk QRIS & Kasbon: nama wajib
                    if (state.paymentMethod === 'QRIS' || state.paymentMethod === 'Kasbon') {
                        if (!custName) {
                            btn.disabled = true;
                            btn.classList.add('opacity-50');
                        } else {
                            btn.disabled = false;
                            btn.classList.remove('opacity-50');
                        }
                    }

                    // [FIX] Update visual hint khusus Kasbon
                    if (state.paymentMethod === 'Kasbon') {
                        updateKasbonNameHint();
                    }
                });
            }         
        }

        // ═══════════════════════════════════════════════════════════════
        // [PATCH v7.19] Sinkronisasi tanggal antar tab
        // Biar user ubah di tab manapun → header & tab lain ikut update
        // ═══════════════════════════════════════════════════════════════
        (function initDateSync() {
          // Daftar pasangan date picker (startId, endId) + callback re-render
          var DATE_PAIRS = [
              { start: 'filter-rep-start', end: 'filter-rep-end', onChange: function() { repJualCurrentPage = 1; repBeliCurrentPage = 1; renderReports(); } },
              { start: 'lr-start',         end: 'lr-end',         onChange: function() { renderLabaRugi(); } },
              { start: 'ak-start',         end: 'ak-end',         onChange: function() { renderArusKas(); } },
              { start: 'jur-start',        end: 'jur-end',        onChange: function() { renderJurnal(); } },
              { start: 'bb-start',         end: 'bb-end',         onChange: function() { renderBukuBesar(); } },
              { start: 'lay-start',        end: 'lay-end',        onChange: function() { renderLayanan(); } },
              { start: 'pt-start',         end: 'pt-end',         onChange: function() { renderProdukTerlaris(); } },
              { start: 'an-start', end: 'an-end', onChange: function() { renderAnalisis(); } }
          ];

          window._datePairs = DATE_PAIRS;

          // Pasang listener ke semua input tanggal
          DATE_PAIRS.forEach(function(pair) {
              var sEl = document.getElementById(pair.start);
              var eEl = document.getElementById(pair.end);
              if (!sEl || !eEl) return;

              [sEl, eEl].forEach(function(inp) {
                  inp.addEventListener('change', function() {
                      // 1. Re-render header dengan rentang baru
                      renderReportSummary();

                      // 2. Optional: broadcast ke tab lain? (default: NO — user ekspektasi tiap tab independen)
                      // Uncomment baris di bawah kalau mau FULL sync antar tab:
                      // broadcastDate(pair.start, sEl.value, eEl.value);
                  });
              });
          });
        })();

        // (Opsional) Fungsi broadcast — panggil kalau mau tanggal di semua tab seragam
        function broadcastDate(srcId, startVal, endVal) {
          var pairs = window._datePairs || [];
          pairs.forEach(function(p) {
              if (p.start === srcId) return; // skip sumber
              var sEl = document.getElementById(p.start);
              var eEl = document.getElementById(p.end);
              if (sEl) sEl.value = startVal;
              if (eEl) eEl.value = endVal;
          });
        }

        function initializeAppSystem() {
            var token = storageManager.get('pos_token_final');
            if (!token) { document.getElementById('initial-loader').style.display = 'none'; document.getElementById('login-screen').classList.remove('hidden'); return; }
            document.getElementById('initial-loader').style.display = 'flex';
            
            if (typeof google !== 'undefined' && google.script) {
                google.script.run.withSuccessHandler(function(res) { 
            try {
                // [FIX] Guard: kalau backend balas null, jangan crash
                if (!res) {
                    document.getElementById('initial-loader').style.display = 'none';
                    Swal.fire({
                        icon: 'error',
                        title: 'Server Tidak Merespon',
                        html: 'Backend mengembalikan data kosong.<br><br><b>Solusi:</b><br>1. Buka Apps Script Editor<br>2. Jalankan <code>setupDatabase()</code><br>3. Cek menu <b>Executions</b> untuk lihat error detail<br>4. Deploy ulang sebagai <b>New version</b>'
                    });
                    return;
                }
                if (!res.success) forceLogout(); 
                else {
                    initApp(res); 
                    startOnlineOrdersPolling();
                }
            } catch(err) {
                document.getElementById('initial-loader').style.display = 'none';
                Swal.fire('Terjadi Kesalahan', 'Gagal memproses data: ' + err.message + '<br><br>Buka Apps Script → Executions untuk lihat log detail.', 'error');
                console.error(err);
            }
          }).withFailureHandler(function(err) { 
            document.getElementById('initial-loader').style.display = 'none';
            Swal.fire('Koneksi Gagal', 'Server error: ' + (err && err.message ? err.message : 'unknown'), 'error');
          }).getInitialData(token);
                  } else { document.getElementById('initial-loader').style.display = 'none'; }
        }

        // Menerima hasil scan dari halaman eksternal (popup)
        window.addEventListener('message', function(event) {
            console.log('Pesan masuk:', event.data, 'dari:', event.origin);
            // (Opsional) Validasi asal pesan untuk keamanan
            if (event.origin !== 'https://acc-pos.blogspot.com') return;

            if (event.data && event.data.type === 'barcode') {
                var barcode = event.data.data;
                if (barcode) {
                    // Proses seperti biasa (sama seperti onScanSuccessPOS)
                    var p = state.products.find(function(x) {
                        return String(x.id).trim() === String(barcode).trim();
                    });
                    if (p) {
                        var berhasil = addToCart(p.id);
                        if (berhasil) showToast("Berhasil: " + p.nama, "success");
                        document.getElementById('pos-search').value = '';
                        renderPosProducts();
                    } else {
                        showToast("Barcode " + barcode + " tidak terdaftar!", "error");
                        document.getElementById('pos-search').value = barcode;
                        renderPosProducts();
                    }
                }
            }
        });
		
		function handleLogin(e) {
		    e.preventDefault();
		    var btn = document.getElementById('btn-login');
		    var err = document.getElementById('log-error');
		    if (btn.disabled) return;
		    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Memproses...';
		    btn.disabled = true;
		    err.classList.add('hidden');
		
		    // Shim loginApp sudah handle konversi username → email
		    google.script.run
		      .withSuccessHandler(function(res) {
		        if (res.success) {
		            storageManager.set('pos_token_final', res.token);
		            document.getElementById('login-screen').classList.add('hidden');
		            btn.innerText = 'Masuk Sekarang'; btn.disabled = false;
		            initializeAppSystem();
		        } else {
		            err.innerText = res.message;
		            err.classList.remove('hidden');
		            btn.innerText = 'Masuk Sekarang'; btn.disabled = false;
		        }
		      })
		      .withFailureHandler(function(err2) {
		        err.innerText = 'Koneksi gagal: ' + (err2?.message || '');
		        err.classList.remove('hidden');
		        btn.innerText = 'Masuk Sekarang'; btn.disabled = false;
		      })
		      .loginApp(
		        document.getElementById('log-user').value,
		        document.getElementById('log-pass').value
		      );
		}
        
        function handleLogout() { 
            if(state.currentShift) { return Swal.fire('Shift Masih Buka', 'Silakan Tutup Kasir terlebih dahulu sebelum keluar (Logout).', 'warning'); }
            Swal.fire({ title: 'Keluar?', text: "Anda yakin ingin keluar dari sistem?", icon: 'question', showCancelButton: true, confirmButtonColor: '#ef4444', cancelButtonColor: '#94a3b8', confirmButtonText: 'Ya, Keluar' }).then((result) => {
                if (result.isConfirmed) {
                    var token = storageManager.get('pos_token_final'); if(token) google.script.run.logoutApp(token); forceLogout(); 
                }
            });
        }
        
        function forceLogout() { 
            storageManager.remove('pos_token_final');
            // [FIX #8+#13] Clear state + hentikan polling
            try {
                if (typeof onlinePollingInterval !== 'undefined' && onlinePollingInterval) {
                    clearInterval(onlinePollingInterval);
                    onlinePollingInterval = null;
                }
                if (typeof _notifPollingInterval !== 'undefined' && _notifPollingInterval) {
                    clearInterval(_notifPollingInterval);
                    _notifPollingInterval = null;
                }
                state.user = null;
                state.cart = [];
                state.currentShift = null;
            } catch (e) { console.warn('[forceLogout] cleanup warn:', e); } 
            document.getElementById('initial-loader').style.display = 'none'; 
            var panels = document.querySelectorAll('.view-panel'); 
            for(var i=0; i<panels.length; i++) panels[i].classList.add('hidden'); 
            document.getElementById('login-screen').classList.remove('hidden'); 
            document.getElementById('log-user').value = ''; 
            document.getElementById('log-pass').value = '';
            // [FIX] Reset ikon mata ke kondisi tersembunyi
            document.getElementById('log-pass').type = 'password';
            var eyeIcon = document.getElementById('log-pass-eye');
            if (eyeIcon) {
                eyeIcon.classList.remove('fa-eye-slash');
                eyeIcon.classList.add('fa-eye');
            }
            storageManager.remove('pos_insight_user_toggled');  // ← biar reset tiap login 
        }

        // [FIX] Terapkan visibility elemen admin-only berdasarkan role user
        // Versi robust: BACA ROLE DARI STATE + GUARD + debug log
        function applyRoleVisibility() {
            if (!state || !state.user) {
                console.warn('[applyRoleVisibility] state.user belum ada, skip');
                return;
            }
            
            var roleRaw = String(state.user.role || '').trim();
            var isAdmin = (roleRaw === 'Admin');
            
            console.log('[applyRoleVisibility] User:', state.user.nama, 
                        '| Role:', roleRaw, 
                        '| isAdmin:', isAdmin);
            
            // Set flag di body
            if (isAdmin) {
                document.body.classList.add('role-admin');
            } else {
                document.body.classList.remove('role-admin');
            }

            // [FIX v7.19] PISAHKAN antara elemen konten admin-only dan view panel.
            // View panel (.view-panel) dikelola oleh switchView(), BUKAN di sini.
            var adminEls = document.querySelectorAll('.admin-only:not(.view-panel)');
            console.log('[applyRoleVisibility] Ditemukan', adminEls.length, 'elemen konten .admin-only');
            
            for (var i = 0; i < adminEls.length; i++) {
                var el = adminEls[i];
                if (isAdmin) {
                    el.classList.remove('hidden-by-role');
                    if (el.style.display === 'none') {
                        el.style.removeProperty('display');
                    }
                } else {
                    el.classList.add('hidden-by-role');
                }
            }

            // [FIX v7.19] Tangani view panel admin-only secara terpisah.
            // Pastikan mereka TETAP hidden jika belum dipilih oleh switchView().
            var adminViewPanels = document.querySelectorAll('.view-panel.admin-only');
            for (var j = 0; j < adminViewPanels.length; j++) {
                var panel = adminViewPanels[j];
                if (isAdmin) {
                    // Admin: JANGAN paksa tampil. Biarkan switchView() yang atur.
                    // Cukup pastikan tidak ada blocker dari role.
                    panel.classList.remove('hidden-by-role');
                } else {
                    // Non-admin: sembunyikan total.
                    panel.classList.add('hidden-by-role');
                }
            }
            
            // Update text user info di sidebar
            // var roleEl = document.getElementById('ui-user-role');
            // if (roleEl) roleEl.innerText = roleRaw;
            // var nameEl = document.getElementById('ui-user-name');
            // if (nameEl) nameEl.innerText = String(state.user.nama || '-');

            // [FIX v7.19] DEBUG: Verifikasi view panel status setelah role apply
            setTimeout(function() {
                var logs = document.getElementById('view-logs');
                var setup = document.getElementById('view-setup');
                if (logs) console.log('[applyRoleVisibility] view-logs → classes:', logs.className);
                if (setup) console.log('[applyRoleVisibility] view-setup → classes:', setup.className);
            }, 100);
        }

        // [FIX BUG] Sinkronisasi tombol Tutup Shift (mobile + desktop)
        function syncShiftButtonVisibility() {
            var isActive = !!state.currentShift;
            
            // Tombol mobile (di dalam overflow menu)
            var btnMobile = document.getElementById('btn-shift-status');
            if (btnMobile) {
                if (isActive) {
                    btnMobile.classList.remove('hidden');
                    // JANGAN gunakan btnMobile.innerHTML di sini! 
                    // Biarkan HTML aslinya tetap utuh.
                } else {
                    btnMobile.classList.add('hidden');
                }
            }
            
            // Tombol desktop (di header)
            var btnDesktop = document.getElementById('btn-shift-desktop');
            if (btnDesktop) {
                btnDesktop.classList.toggle('is-visible', isActive);
            }
        }

        // [PATCH] Helper: apakah user boleh melakukan aksi admin
        function canDoAdmin() {
            return !!(state && state.user && state.user.role === 'Admin');
        }

        // [PATCH] Helper: render tombol aksi dengan role-guard
        function buildInventoryActions(id, nama, hargaJual) {
            var safeId   = escapeHtml(id);
            var safeNama = escapeHtml(nama);
            var btn = '';

            // Tombol Edit — hanya Admin
            if (canDoAdmin()) {
                btn += '<button data-action="edit" data-id="' + safeId + '" ' +
                      'class="inv-action-btn text-blue-500 bg-blue-50 hover:bg-blue-100 w-7 h-7 rounded mr-1.5 transition-all shadow-sm active:scale-95" ' +
                      'title="Edit"><i class="fas fa-edit text-[10px]"></i></button>';
            }

            // Tombol Barcode — semua role (kasir butuh print barcode)
            btn += '<button data-action="barcode" data-id="' + safeId + '" ' +
                  'data-nama="' + safeNama + '" data-harga="' + Number(hargaJual || 0) + '" ' +
                  'class="inv-action-btn text-slate-500 bg-slate-100 hover:bg-slate-200 w-7 h-7 rounded mr-1.5 transition-all shadow-sm active:scale-95" ' +
                  'title="Cetak Barcode"><i class="fas fa-barcode text-[10px]"></i></button>';

            // Tombol Hapus — hanya Admin
            if (canDoAdmin()) {
                btn += '<button data-action="delete" data-id="' + safeId + '" data-nama="' + safeNama + '" ' +
                      'class="inv-action-btn text-red-500 bg-red-50 hover:bg-red-100 w-7 h-7 rounded transition-all shadow-sm active:scale-95" ' +
                      'title="Hapus"><i class="fas fa-trash text-[10px]"></i></button>';
            }

            return btn;
        }

		// ═══════════════════════════════════════════════════════════════
		// [PATCH v7.20] ADAPTER — Normalisasi output shim baru ke shape lama
		// Supaya semua kode lama (initApp, manualSync, render*) tidak perlu diubah.
		// ═══════════════════════════════════════════════════════════════
		function _normalizeInitialData(res) {
		    if (!res) return null;
		
		    // 1. Konversi settings (array of {key, value}) → objek
		    var setupObj = {};
		    if (res.setup && typeof res.setup === 'object' && !Array.isArray(res.setup)) {
		        setupObj = res.setup;
		    } else if (Array.isArray(res.settings)) {
		        for (var i = 0; i < res.settings.length; i++) {
		            var s = res.settings[i];
		            if (s && s.key !== undefined) setupObj[s.key] = s.value;
		        }
		    }
		
		    // 2. Konversi profil Supabase → shape state.user lama
		    var u = res.profile || res.user || null;
		    var userMapped = null;
		    if (u) {
		        userMapped = {
		            id:       u.id,
		            username: u.username,
		            nama:     u.nama,
		            role:     u.role,
		            is_active:u.is_active
		        };
		    }
		
		    return {
		        // ─── Field langsung (sama nama) ───
		        products:       res.products || [],
		        transactions:   res.transactions || [],
		        purchases:      res.purchases || [],
		        onlineOrders:   res.onlineOrders || [],
		        layananDigital: res.layananDigital || [],
		        asetTetap:      res.asetTetap || [],
		        dashboard:      res.dashboard || {},
		        currentShift:   res.shift || res.currentShift || null,
		
		        // ─── Field yang di-rename ───
		        user:  userMapped,
		        setup: setupObj,
		        jurnal: res.journals || res.jurnal || [],
		        beban:  res.expenses || res.beban  || [],
		
		        // ─── Field yang mungkin belum dikirim shim (fallback) ───
		        logs:             res.logs             || [],
		        users:            res.users            || [],
		        bku:              res.bku              || [],
		        pembayaranHutang: res.pembayaranHutang || [],
		        saldoRingkas:     res.saldoRingkas     || { kas111: 0, bank115: 0, piutang112: 0, hutang211: 0 },
		
		        // ─── Flag kompatibilitas ───
		        success: true,
		        deltaSync: false,
		        _journalsFullLoaded: res._journalsFullLoaded || false,
		        _transactionsFullLoaded: res._transactionsFullLoaded || false
		    };
		}

		var _suppFetchInProgress = false;
		var _suppFetchLastRun    = 0;
		
		function _loadSupplementaryData() {
		    if (_suppFetchInProgress) return;
		    if (Date.now() - _suppFetchLastRun < 8000) return;   // debounce 8 detik
		    var sb = window.supabaseClient;
		    if (!sb) return;
		
		    _suppFetchInProgress = true;
		    _suppFetchLastRun = Date.now();
		
		    var since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
		
		    Promise.all([
		        // Logs: 200 terbaru
		        sb.from('logs')
		          .select('id, waktu, user, aksi, keterangan')
		          .order('waktu', { ascending: false })
		          .limit(200),
		        // BKU: 30 hari terakhir
		        sb.from('bku')
		          .select('id, tanggal, no_bukti, jenis, kategori, uraian, metode, debit, kredit, kasir')
		          .gte('tanggal', since30)
		          .order('tanggal', { ascending: false })
		          .limit(500),
		        // Pembayaran hutang: 500 terbaru
		        sb.from('pembayaran_hutang')
		          .select('id, ref_nota, tanggal, nominal, metode, kasir, keterangan')
		          .order('tanggal', { ascending: false })
		          .limit(500),
		        // Users (admin only, tapi aman kalau 403)
		        sb.from('profiles')
		          .select('id, username, nama, role, is_active')
		    ]).then(function(results) {
		        var logsRes = results[0], bkuRes = results[1], payRes = results[2], usrRes = results[3];
		
		        if (!logsRes.error && logsRes.data) {
		            state.logs = logsRes.data.map(function(l) {
		                return {
		                    id: l.id, waktu: new Date(l.waktu).getTime(),
		                    user: l.user, aksi: l.aksi, keterangan: l.keterangan
		                };
		            });
		        }
		        if (!bkuRes.error && bkuRes.data) {
		            state.bku = bkuRes.data.map(function(b) {
		                return {
		                    id: b.id, tanggal: new Date(b.tanggal).getTime(),
		                    noBukti: b.no_bukti, jenis: b.jenis, kategori: b.kategori,
		                    uraian: b.uraian, metode: b.metode,
		                    debit: +b.debit, kredit: +b.kredit, kasir: b.kasir
		                };
		            });
		        }
		        if (!payRes.error && payRes.data) {
		            state.pembayaranHutang = payRes.data.map(function(p) {
		                return {
		                    id: p.id, refNota: p.ref_nota,
		                    tanggal: new Date(p.tanggal).getTime(),
		                    nominal: +p.nominal, metode: p.metode,
		                    kasir: p.kasir, keterangan: p.keterangan
		                };
		            });
		        }
		        if (!usrRes.error && usrRes.data) {
		            state.users = usrRes.data;
		        }
		
		        // Re-render view aktif kalau relevan
		        var activePanel = document.querySelector('.view-panel:not(.hidden)');
		        var v = activePanel ? activePanel.id : '';
		        try { if (v === 'view-logs') renderLogs(); } catch(e) {}
		        try { if (v === 'view-bku') renderBku(); } catch(e) {}
		        try { if (v === 'view-setup') renderUsersList(); } catch(e) {}
		        try { if (v === 'view-reports') renderHutang(); } catch(e) {}
		    }).catch(function(err) {
		        console.warn('[Supplementary] Fetch warn:', err);
		    }).then(function() {
		        _suppFetchInProgress = false;
		    });
		}
		
		function _loadSaldoRingkas() {
		    var sb = window.supabaseClient;
		    if (!sb) return;
		    sb.rpc('get_saldo_ringkas').then(function(r) {
		        if (!r.error && r.data) {
		            state.saldoRingkas = r.data;
		            // Simpan cache akun kumulatif untuk fallback render
		            if (r.data._by_account) {
		                state._saldoByAccount = r.data._by_account;
		            }
		        }
		    }).catch(function(){});
		}

        function initApp(rawData) {
		    try {
		        // [PATCH v7.20] Normalisasi dulu!
		        var data = _normalizeInitialData(rawData);
		        if (!data) {
		            document.getElementById('initial-loader').style.display = 'none';
		            Swal.fire('Data Kosong', 'Server tidak mengembalikan data. Coba reload.', 'error');
		            return;
		        }
		        // Set state DULU sebelum apapun
		        window._lastSyncTime = Date.now();
		        state.products = data.products || []; 
                state.transactions = data.transactions || []; 
                state.purchases = data.purchases || []; 
                state.setup = data.setup || {}; 
                state.logs = data.logs || []; 
                state.user = data.user;   // ← WAJIB di-set sebelum applyRoleVisibility
                state.cart = []; 
                state.currentShift = data.currentShift; 
                state.beban = data.beban || []; 
                state.onlineOrders = data.onlineOrders || []; 
                state.jurnal = data.jurnal || []; 
                state.users = data.users || []; 
                state.layananDigital = data.layananDigital || [];
                state.bku = data.bku || [];
                state.pembayaranHutang = data.pembayaranHutang || [];
                state.saldoRingkas = data.saldoRingkas || { kas111: 0, bank115: 0, piutang112: 0, hutang211: 0 };

                // [FIX #2] DEBUG: pastikan data.user ada
                console.log('[initApp] data.user:', data.user);
                console.log('[initApp] state.user:', state.user);

                // [FIX #3] Guard: kalau data.user tidak ada → error jelas
                if (!state.user || !state.user.role) {
                    document.getElementById('initial-loader').style.display = 'none';
                    Swal.fire({
                        icon: 'error',
                        title: 'Data User Tidak Valid',
                        html: 'Backend tidak mengirimkan data user yang valid.<br><br>' +
                              '<b>Solusi:</b><br>' +
                              '1. Cek tab <b>Akun</b> di spreadsheet<br>' +
                              '2. Pastikan kolom <b>Token</b> berisi token aktif Anda<br>' +
                              '3. Jalankan <code>setupDatabase()</code> ulang<br>' +
                              '4. Logout & login ulang'
                    });
                    return;
                }

                // Set UI info
                document.getElementById('ui-store-name').innerText = escapeHtml(state.setup['Nama Toko'] || 'POS Pro'); 
                // document.getElementById('ui-user-name').innerText = escapeHtml(state.user.nama); 
                // document.getElementById('ui-user-role').innerText = escapeHtml(state.user.role);
                
                // Isi form setup
                document.getElementById('set-jam-buka').value = state.setup['Jam Buka Online'] || '';
                document.getElementById('set-jam-tutup').value = state.setup['Jam Tutup Online'] || '';
                document.getElementById('set-min-order').value = Number(state.setup['Minimal Order Online'] || 0).toLocaleString('id-ID');
                
                var savedHari = state.setup['Hari Buka Online'];
                var arrHari = savedHari !== undefined ? String(savedHari).split(',') : ['0','1','2','3','4','5','6'];
                var cbHari = document.querySelectorAll('input[name="set-hari"]');
                for(var h=0; h<cbHari.length; h++) { cbHari[h].checked = arrHari.includes(cbHari[h].value); }

                document.getElementById('set-nama').value = state.setup['Nama Toko'] || ''; 
                document.getElementById('set-alamat').value = state.setup['Alamat'] || ''; 
                document.getElementById('set-telp').value = state.setup['Telepon'] || ''; 
                document.getElementById('set-hpp').value = state.setup['Metode HPP'] || 'AVERAGE'; 
                document.getElementById('set-fonnte').value = state.setup['Fonnte Token'] || ''; 
                document.getElementById('set-sound').checked = state.setup['Suara Kasir'] !== false;
                document.getElementById('set-fee-tarik').value = Number(state.setup['Fee Tarik Tunai'] || 2000).toLocaleString('id-ID');
                document.getElementById('set-batas-fee-flat').value = Number(state.setup['Batas Fee Flat Tarik Tunai'] || 499999).toLocaleString('id-ID');
                document.getElementById('set-persen-fee').value = Number(state.setup['Persen Fee Tarik Tunai'] || 1);
                document.getElementById('set-sumber-dana').value = state.setup['Sumber Dana Operasional'] || 'BRANGKAS';

                // [FIX] Field baru notif WA admin — guard kalau elemen tidak ada
                var waAdminEl = document.getElementById('set-wa-admin-topup');
                if (waAdminEl) waAdminEl.value = state.setup['WA Admin Topup'] || '';
                var notifAktifEl = document.getElementById('set-notif-topup-aktif');
                if (notifAktifEl) notifAktifEl.checked = String(state.setup['Notif WA Topup Aktif'] || 'TRUE').toUpperCase() === 'TRUE';
                
                // [FIX #4] APPLY ROLE VISIBILITY — paling penting!
                applyRoleVisibility();
                
                syncShiftButtonVisibility();
                updateSidebarShiftInfo();

                // Render semua UI
                updateCategories(); 
                renderPosProducts(); 
                renderInventory(); 
                renderAllReports(); 
                renderDashboard(); 
                renderLogs(); 
                renderCart(); 
                renderHeldCartsBadge(); 
                renderUsersList();
                updateOnlineOrdersBadge(0); 
                initDashboardDragAndDrop(); 
                updateSidebarBadges();
                
                document.getElementById('initial-loader').style.display = 'none';

                // Tablet & iPad: buka semua widget dashboard biar informatif
                if (window.innerWidth >= 768 && window.innerWidth < 1024) {
                    var grid = document.getElementById('dashboard-sortable-grid');
                    if (grid) grid.classList.add('show-all-mobile');
                }
                // iPad Pro & tablet besar: layout 3 kolom otomatis

                switchView('pos');
                updateOfflineBadge();
                
                // Buka modal shift kalau belum ada shift
                if(!state.currentShift) { 
                    openModal('modal-shift-open'); 
                    setTimeout(function() { 
                        var src = document.getElementById('modal-shift-open').querySelector('#shift-modal-source');
                        if (src) src.focus(); 
                    }, 300);
                }
                
                // [FIX #5] Log untuk debugging
                console.log('[initApp] ✓ Selesai init. Role:', state.user.role);
				_loadSupplementaryData();
                _loadSaldoRingkas();
                
            } catch (err) {
                console.error("InitApp Error: ", err);
                var loader = document.getElementById('initial-loader');
                loader.style.display = 'flex';
                loader.innerHTML = 
                    '<div class="text-red-500 mb-4"><i class="fas fa-exclamation-triangle text-4xl"></i></div>' +
                    '<p class="font-extrabold text-slate-700">Sistem Gagal Memuat</p>' +
                    '<p class="text-xs font-bold text-slate-500 mt-2 max-w-xs">' + escapeHtml(err.message) + '</p>' +
                    '<p class="text-[10px] font-mono text-slate-400 mt-2 max-w-xs">' + escapeHtml(err.stack || '').substring(0, 200) + '</p>' +
                    '<button onclick="window.location.reload()" class="mt-5 bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-md">Muat Ulang Halaman</button>';
            }
        }

        // [FIX] Global last sync timestamp
        if (typeof window._lastSyncTime === 'undefined') window._lastSyncTime = 0;

        function manualSync(forceFullSync) {
            // [PATCH v7.19 #7] Debounce: cegah sync paralel saat user spam klik
            var nowMs = Date.now();
            if (!window._lastSyncRequestTime) window._lastSyncRequestTime = 0;
            if (nowMs - window._lastSyncRequestTime < 1500) {
                // Dalam 1.5 detik terakhir sudah sync → tolak
                console.log('[Sync] Debounced (klik terlalu cepat)');
                return;
            }
            window._lastSyncRequestTime = nowMs;
            
            // Cegah concurrent
            if (window._syncInProgress) {
                console.log('[Sync] Masih ada sync yang berjalan');
                return;
            }
            window._syncInProgress = true;
            
            var token = storageManager.get('pos_token_final');
            if(!token) { window._syncInProgress = false; return; }
            var dot = document.getElementById('sync-dot');
            dot.className = 'w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-amber-400';
            document.getElementById('sync-text').innerText = 'Sync...';

            // Tentukan: delta atau full?
            var isFirstSync = (window._lastSyncTime === 0);
            var useFull = forceFullSync || isFirstSync;

            var successHandler = function(rawRes) {
              window._syncInProgress = false;
                if (!rawRes) {
                    dot.className = 'w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-red-500';
                    document.getElementById('sync-text').innerText = 'No Response';
                    return;
                }
                if (rawRes.error === "UNAUTHORIZED") return forceLogout();

                // [PATCH v7.20] Normalisasi — shim baru tidak kirim field success
                var res = _normalizeInitialData(rawRes);
                if (!res) {
                    dot.className = 'w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-red-500';
                    document.getElementById('sync-text').innerText = 'Invalid';
                    return;
                }

                // === MERGE STATE ===
                state.products = res.products || state.products;
                state.transactions   = res.transactions   || [];
                state.purchases      = res.purchases      || [];
                state.beban          = res.beban          || [];
                state.layananDigital = res.layananDigital || [];
                state.jurnal         = res.jurnal         || [];
                state.currentShift   = res.currentShift;
                if (res.setup && Object.keys(res.setup).length > 0) state.setup = res.setup;
                if (res.saldoRingkas) state.saldoRingkas = res.saldoRingkas;

                // Update last sync time
                window._lastSyncTime = Date.now();

                // === REFRESH UI (hanya view aktif, biar cepat) ===
                var viewPanel = document.querySelector('.view-panel:not(.hidden)');
                var view = viewPanel ? viewPanel.id : '';
                if (view === 'view-pos') renderPosProducts();
                if (view === 'view-inventory') renderInventory();
                if (view === 'view-reports') renderAllReports();
                if (view === 'view-dashboard') renderDashboard();
                if (view === 'view-logs') renderLogs();
                if (view === 'view-layanan') renderLayananView();
                if (view === 'view-bku') renderBku();

                dot.className = 'w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]';
                document.getElementById('sync-text').innerText = res.deltaSync ? 'Terhubung' : 'Terhubung (full)';

                // [FIX #6] Update tooltip dengan waktu sync terakhir
                var syncBtn = document.getElementById('sync-btn');
                if (syncBtn) {
                    var nowSync = new Date();
                    var hh = String(nowSync.getHours()).padStart(2,'0');
                    var mi = String(nowSync.getMinutes()).padStart(2,'0');
                    var ss = String(nowSync.getSeconds()).padStart(2,'0');
                    syncBtn.title = 'Terakhir sync: ' + hh + ':' + mi + ':' + ss + ' • Klik untuk sync paksa';
                }
				_loadSupplementaryData();
				_loadSaldoRingkas();
                // Update tombol shift
                syncShiftButtonVisibility();
                updateSidebarShiftInfo();
                if (!state.currentShift && view === 'view-pos') {
                    openModal('modal-shift-open');
                    setTimeout(function() {
                        var inp = document.getElementById('shift-modal-awal');
                        if (inp) inp.focus();
                    }, 300);
                }

                // [FIX] Auto-flush offline queue setelah sync sukses
                if (state.offlineQueue && state.offlineQueue.length > 0) {
                    setTimeout(flushOfflineQueue, 1000);
                }
                // [FIX SARAN #2] Update sidebar badges setelah sync
                try { updateSidebarBadges(); } catch(e) {}
            };

            var failHandler = function(err) {
              window._syncInProgress = false; 
                dot.className = 'w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-red-500';
                document.getElementById('sync-text').innerText = 'Offline';
            };

            // [PATCH v7.19 #10] Simpan timestamp SEBELUM request, baru reset
            // _lastSyncTime hanya jika request SUKSES. Kalau gagal, tetap
            // pakai timestamp lama supaya retry berikutnya masih pakai delta.
            var syncTimestamp = window._lastSyncTime;
            var isFullMode = useFull;
            
            if (isFullMode) {
                google.script.run
                    .withSuccessHandler(function(res) {
                        // Reset hanya jika sukses
                        if (res && res.success) window._lastSyncTime = 0;
                        successHandler(res);
                    })
                    .withFailureHandler(failHandler)
                    .getInitialData(token);
            } else {
                google.script.run
                    .withSuccessHandler(successHandler)
                    .withFailureHandler(failHandler)
                    .getDataSince(token, syncTimestamp);
            }
        }

        // ============================================================
        // [FIX] OFFLINE QUEUE FLUSH
        // ============================================================
        function flushOfflineQueue() {
          if (!state.offlineQueue || state.offlineQueue.length === 0) return;
          if (!navigator.onLine) return;

          var token = storageManager.get('pos_token_final');
          if (!token) return;

          // Cegah concurrent flush
          if (window._isFlushingOffline) return;
          window._isFlushingOffline = true;

          var queue = state.offlineQueue.slice();
          var idx = 0;
          var successCount = 0;
          var failedItems = [];

          Swal.fire({
            title: 'Sinkronisasi Data Offline...',
            html: 'Memproses <b>0</b> dari ' + queue.length + ' transaksi.',
            allowOutsideClick: false,
            didOpen: function() { Swal.showLoading(); }
          });

          function processNext() {
            if (idx >= queue.length) {
              // Semua selesai
              state.offlineQueue = failedItems; // hanya yang gagal disimpan
              storageManager.set('pos_offline_tx', JSON.stringify(state.offlineQueue));
              window._isFlushingOffline = false;
              Swal.close();
              updateOfflineBadge();

              if (successCount > 0) {
                showToast(successCount + ' transaksi offline berhasil disinkronkan', 'success');
              }
              if (failedItems.length > 0) {
                Swal.fire({
                  icon: 'warning',
                  title: 'Sinkronisasi Parsial',
                  html: '<b>' + successCount + '</b> transaksi berhasil.<br><b>' + failedItems.length + '</b> gagal dan akan dicoba lagi nanti.',
                });
              }
              // Refresh data setelah flush
              if (successCount > 0) manualSync(true);
              return;
            }

            var item = queue[idx];
            Swal.update({ html: 'Memproses <b>' + (idx + 1) + '</b> dari ' + queue.length + ' transaksi...' });

            google.script.run.withSuccessHandler(function(res) {
              if (res && res.success) {
                successCount++;
              } else {
                // Gagal karena data (misal stok habis) — tetap keep di queue
                failedItems.push(item);
              }
              idx++;
              processNext();
            }).withFailureHandler(function() {
              // Network failure — stop flush, keep sisa di queue
              // Kembalikan item yang belum diproses + item yang gagal
              for (var r = idx; r < queue.length; r++) failedItems.push(queue[r]);
              state.offlineQueue = failedItems;
              storageManager.set('pos_offline_tx', JSON.stringify(state.offlineQueue));
              window._isFlushingOffline = false;
              Swal.close();
              showToast('Koneksi terputus. ' + state.offlineQueue.length + ' transaksi tetap tersimpan offline.', 'error');
              updateOfflineBadge();
            }).saveTransaction(token, item.txData, item.cartPayload);
          }

          processNext();
        }

        // Auto-flush saat koneksi pulih
        window.addEventListener('online', function() {
          showToast('🌐 Koneksi pulih — memproses antrean offline...', 'success');
          setTimeout(flushOfflineQueue, 2000);
        });

        // Auto-flush saat halaman dibuka kembali
        window.addEventListener('focus', function() {
          if (navigator.onLine && state.offlineQueue && state.offlineQueue.length > 0) {
            flushOfflineQueue();
          }
        });

        // [NEW] Helper: render SEMUA section laporan sekaligus
        function renderAllReports() {
            renderReports();
            renderBebanList();
            renderLabaRugi();
            renderArusKas();
            renderNeraca();
            renderJurnal();
            renderPiutang();
            renderHutang();
            renderLayanan();
            renderProdukTerlaris();
        }

        function switchView(id) {
            // Normalisasi role
            var isAdmin = state.user && String(state.user.role || '').trim().toLowerCase() === 'admin';
            
            // Guard akses
            var adminOnlyViews = ['setup', 'logs', 'bku', 'aset', 'analisis'];
            if (adminOnlyViews.indexOf(id) > -1 && !isAdmin) {
                return showToast('Akses ditolak — hanya Admin', 'error');
            }
            
            if(isMobileCartOpen) toggleMobileCart();
            if(window.innerWidth < 1024) {
                document.getElementById('sidebar').classList.add('-translate-x-full');
                document.getElementById('sidebar-overlay').classList.add('hidden');
            }
            
            // Sembunyikan SEMUA view panel + bersihkan SEMUA blocker
            var panels = document.querySelectorAll('.view-panel');
            for(var i=0; i<panels.length; i++) {
                panels[i].classList.add('hidden');
                panels[i].classList.remove('hidden-by-role');
                panels[i].style.removeProperty('display');
            }
            
            // Tampilkan target
            var targetPanel = document.getElementById('view-' + id);
            if (!targetPanel) {
                console.error('[switchView] Panel tidak ditemukan: view-' + id);
                return;
            }
            targetPanel.classList.remove('hidden');
            targetPanel.classList.remove('hidden-by-role');
            targetPanel.style.removeProperty('display');
            
            // Update nav active state
            var btns = document.querySelectorAll('.nav-btn');
            for(var j=0; j<btns.length; j++) {
                btns[j].classList.remove('bg-blue-600', 'text-white', 'shadow-lg', 'shadow-blue-600/20');
                btns[j].classList.add('text-slate-400');
                if(btns[j].getAttribute('data-target') === id) {
                btns[j].classList.add('bg-blue-600/10', 'text-blue-400', 'border-l-4', 'border-blue-500', 'font-black');
                btns[j].classList.remove('text-slate-400', 'hover:bg-slate-800/60', 'hover:text-white');
                } else {
                    btns[j].classList.remove('bg-blue-600/10', 'text-blue-400', 'border-l-4', 'border-blue-500', 'font-black');
                    btns[j].classList.add('text-slate-400', 'hover:bg-slate-800/60', 'hover:text-white');
                } 
            }
            
            // Render view
            if(id === 'dashboard') renderDashboard();
			if(id === 'reports') { renderAllReports(); renderReportSummary(); }
            if (id === 'logs' && (!state.logs || state.logs.length === 0)) {
                _loadSupplementaryData();
            }
            if (id === 'bku' && (!state.bku || state.bku.length === 0)) {
                _loadSupplementaryData();
            }
            if (id === 'setup' && (!state.users || state.users.length === 0)) {
                _loadSupplementaryData();
            }
            if(id === 'logs') renderLogs();
            if(id === 'layanan') renderLayananView();
            if(id === 'bku') renderBku();
            if(id === 'aset') { loadAsetList(); loadRiwayatPenyusutan(); }
            if(id === 'analisis') renderAnalisis();
            if(id === 'pos') {
                var searchInput = document.getElementById('pos-search');
                if (searchInput) {
                    searchInput.value = '';
                    renderPosProducts();
                    setTimeout(() => searchInput.focus(), 100);
                    posSearchIndex = -1;
                }
            }
        }

        // 1. Buka Modal & Set Default — [PATCH] reset ke mode Tambah
        function openBkuModal() {
            document.getElementById('form-bku').reset();
            document.getElementById('bku-edit-id').value = '';
            document.getElementById('bku-modal-title').innerHTML =
                '<i class="fas fa-book text-blue-500 mr-2"></i> Catat Buku Kas';
            var submitBtn = document.querySelector('#form-bku button[type="submit"]');
            if (submitBtn) submitBtn.innerHTML = 'Simpan';
            // Set default tanggal ke hari ini
            var today = new Date().toISOString().split('T')[0];
            document.getElementById('bku-tgl').value = today;
            toggleBkuKategori();
            openModal('modal-bku');
        }

        // [PATCH] Buka modal dalam mode Edit — pre-fill semua field
        function openEditBku(id) {
            if (!state.user || state.user.role !== 'Admin') {
                return showToast('Hanya Admin!', 'error');
            }
            var b = state.bku.find(function(x) { return String(x.id) === String(id); });
            if (!b) return showToast('Data BKU tidak ditemukan', 'error');

            document.getElementById('form-bku').reset();
            document.getElementById('bku-edit-id').value = b.id;
            document.getElementById('bku-modal-title').innerHTML =
                '<i class="fas fa-edit text-blue-500 mr-2"></i> Edit Buku Kas';
            var submitBtn = document.querySelector('#form-bku button[type="submit"]');
            if (submitBtn) submitBtn.innerHTML = 'Update';

            document.getElementById('bku-tgl').value = toLocalDateStr(new Date(b.tanggal));
            document.getElementById('bku-bukti').value = b.noBukti || '';
            document.getElementById('bku-jenis').value = b.jenis;
            toggleBkuKategori();   // isi ulang opsi kategori sesuai jenis
            document.getElementById('bku-kategori').value = b.kategori;
            document.getElementById('bku-metode').value = b.metode;
            document.getElementById('bku-uraian').value = b.uraian || '';
            var nominalVal = (Number(b.debit) > 0) ? Number(b.debit) : (Number(b.kredit) || 0);
            document.getElementById('bku-nominal').value = nominalVal.toLocaleString('id-ID');

            openModal('modal-bku');
        }

        // 2. Ganti Pilihan Kategori berdasarkan Jenis
        function toggleBkuKategori() {
            var jenis = document.getElementById('bku-jenis').value;
            var select = document.getElementById('bku-kategori');
            select.innerHTML = '';
            
            if (jenis === 'Pemasukan') {
                select.innerHTML = `
                    <option value="Penjualan Harian">Penjualan Harian</option>
                    <option value="Pendapatan Lain">Pendapatan Lain-lain</option>
                    <option value="Setoran Modal">Setoran Modal</option>
                    <option value="Penerimaan Pinjaman">Penerimaan Pinjaman</option>
                `;
            } else {
                select.innerHTML = `
                    <option value="Lainnya">Lainnya</option>
                    <option value="Gaji Pegawai">Gaji Pegawai</option>
                    <option value="Listrik & Air">Listrik & Air</option>
                    <option value="Transportasi">Transportasi</option>
                    <option value="Sewa Tempat">Sewa Tempat</option>
                    <option value="Pembayaran Cicilan">Pembayaran Cicilan</option>
                `;
            }
        }

        // 3. Simpan Data ke Backend — [PATCH] dual-mode (Tambah / Edit)
        function saveBkuAction(e) {
            e.preventDefault();
            var btn = e.target.querySelector('button[type="submit"]');
            var originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...';
            btn.disabled = true;

            var editId = (document.getElementById('bku-edit-id') || {}).value || '';
            var isEdit = !!editId;

            var payload = {
                tanggal:  document.getElementById('bku-tgl').value,
                noBukti:  document.getElementById('bku-bukti').value,
                jenis:    document.getElementById('bku-jenis').value,
                kategori: document.getElementById('bku-kategori').value,
                metode:   document.getElementById('bku-metode').value,
                uraian:   document.getElementById('bku-uraian').value,
                nominal:  getAngkaBersih('bku-nominal')
            };

            function onSuccess(res) {
                btn.innerHTML = originalText;
                btn.disabled = false;
                if (!res.success) return Swal.fire('Gagal', res.error, 'error');

                if (isEdit) {
                    // ── Mode Edit: update baris di state lokal ──
                    var idx = state.bku.findIndex(function(x) { return String(x.id) === String(editId); });
                    if (idx > -1) {
                        state.bku[idx] = {
                            id:       editId,
                            tanggal:  res.tanggal,
                            noBukti:  payload.noBukti || '-',
                            jenis:    payload.jenis,
                            kategori: payload.kategori,
                            uraian:   payload.uraian,
                            metode:   payload.metode,
                            debit:    payload.jenis === 'Pemasukan'   ? payload.nominal : 0,
                            kredit:   payload.jenis === 'Pengeluaran' ? payload.nominal : 0,
                            kasir:    res.kasir
                        };
                    }
                } else {
                    // ── Mode Tambah: push record baru ──
                    state.bku.push({
                        id:       res.newId,
                        tanggal:  res.tanggal,
                        noBukti:  payload.noBukti || '-',
                        jenis:    payload.jenis,
                        kategori: payload.kategori,
                        uraian:   payload.uraian,
                        metode:   payload.metode,
                        debit:    payload.jenis === 'Pemasukan'   ? payload.nominal : 0,
                        kredit:   payload.jenis === 'Pengeluaran' ? payload.nominal : 0,
                        kasir:    res.kasir
                    });
                }

                renderBku();
                closeModal('modal-bku');
                Swal.fire('Berhasil',
                    isEdit ? 'Data BKU berhasil diperbarui.' : 'Data Buku Kas berhasil disimpan.',
                    'success');
                manualSync(true);
            }

            function onFail(err) {
                btn.innerHTML = originalText;
                btn.disabled = false;
                Swal.fire('Koneksi Gagal', 'Tidak bisa terhubung ke server', 'error');
            }

            if (isEdit) {
                google.script.run
                    .withSuccessHandler(onSuccess)
                    .withFailureHandler(onFail)
                    .updateBukuKasUmum(storageManager.get('pos_token_final'), editId, payload);
            } else {
                google.script.run
                    .withSuccessHandler(onSuccess)
                    .withFailureHandler(onFail)
                    .saveBukuKasUmum(storageManager.get('pos_token_final'), payload);
            }
        }

        // [PATCH] Hapus baris BKU dengan konfirmasi
        function deleteBkuRow(id) {
            if (!state.user || state.user.role !== 'Admin') {
                return showToast('Hanya Admin!', 'error');
            }
            var b = state.bku.find(function(x) { return String(x.id) === String(id); });
            if (!b) return showToast('Data BKU tidak ditemukan', 'error');

            var nominal = (Number(b.debit) > 0) ? Number(b.debit) : (Number(b.kredit) || 0);
            var label = b.jenis + ' • ' + b.kategori + ' • ' + formatRp(nominal);

            Swal.fire({
                title: 'Hapus Data BKU?',
                html:
                    '<div class="text-left text-xs space-y-1">' +
                        '<div class="bg-slate-50 p-3 rounded-lg border border-slate-200">' +
                            '<div class="flex justify-between mb-1"><span class="text-slate-500">No. Bukti:</span><b>' + escapeHtml(b.noBukti || '-') + '</b></div>' +
                            '<div class="flex justify-between mb-1"><span class="text-slate-500">Kategori:</span><b>' + escapeHtml(b.kategori) + '</b></div>' +
                            '<div class="flex justify-between mb-1"><span class="text-slate-500">Uraian:</span><b>' + escapeHtml(b.uraian || '-') + '</b></div>' +
                            '<div class="flex justify-between pt-2 border-t border-slate-200 mt-2"><span class="font-bold">Nominal:</span><b class="' + (b.jenis === 'Pemasukan' ? 'text-emerald-600' : 'text-red-600') + '">' + label + '</b></div>' +
                        '</div>' +
                        '<p class="text-center text-slate-400 text-[10px] mt-3">Data akan dihapus permanen dari spreadsheet.</p>' +
                    '</div>',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: '<i class="fas fa-trash mr-1"></i> Ya, Hapus!',
                cancelButtonText: 'Batal'
            }).then(function(r) {
                if (!r.isConfirmed) return;
                Swal.fire({ title: 'Memproses...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });

                google.script.run.withSuccessHandler(function(res) {
                    if (!res.success) return Swal.fire('Gagal', res.error, 'error');

                    // Optimistic: hapus dari state lokal + re-render
                    state.bku = state.bku.filter(function(x) { return String(x.id) !== String(id); });
                    renderBku();

                    Swal.fire('Terhapus!', 'Data BKU berhasil dihapus.', 'success');
                    manualSync(true);
                }).withFailureHandler(function(err) {
                    Swal.fire('Koneksi Gagal', 'Tidak bisa terhubung ke server: ' + (err && err.message ? err.message : 'unknown'), 'error');
                }).deleteBukuKasUmum(storageManager.get('pos_token_final'), id);
            });
        }

        // 4. Render Tabel & Kalkulasi Saldo
        function renderBku() {
            var tbody = document.getElementById('bku-tbody');
            if (!tbody) return;

            var startInput = document.getElementById('bku-filter-start');
            var endInput = document.getElementById('bku-filter-end');
            
            // Set default filter ke bulan ini jika kosong
            if(!startInput.value || !endInput.value) {
                var now = new Date();
                var firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                startInput.value = toLocalDateStr(firstDay);
                endInput.value = toLocalDateStr(now);
            }

            var startTime = parseLocalDate(startInput.value).setHours(0,0,0,0);
            var endTime = parseLocalDate(endInput.value).setHours(23,59,59,999);

            // 1. Hitung Saldo Awal (sebelum tanggal filter mulai)
            var saldoAwalTunai = 0;
            var saldoAwalQris = 0;
            for (var i = 0; i < state.bku.length; i++) {
                var b = state.bku[i];
                if (b.tanggal >= startTime) continue;
                
                if (b.metode === 'Tunai') saldoAwalTunai += (b.debit - b.kredit);
                if (b.metode === 'QRIS') saldoAwalQris += (b.debit - b.kredit);
            }

            // 2. Filter data di rentang waktu
            var filtered = state.bku.filter(function(b) {
                return b.tanggal >= startTime && b.tanggal <= endTime;
            });

            // ── [PATCH v2] Sort ASC: tanggal dulu, lalu id (tie-breaker) ──
            filtered.sort(function(a, b) {
                if (a.tanggal !== b.tanggal) return a.tanggal - b.tanggal;
                return String(a.id).localeCompare(String(b.id));
            });

            // 3. Render Baris & Hitung Saldo Berjalan
            var html = '';
            var currentSaldoTunai = saldoAwalTunai;
            var currentSaldoQris = saldoAwalQris;
            var totalDebit = 0;
            var totalKredit = 0;

            for (var j = 0; j < filtered.length; j++) {
                var row = filtered[j];
                var tglStr = new Date(row.tanggal).toLocaleDateString('id-ID', {day:'2-digit', month:'2-digit', year:'numeric'});
                
                // Kalkulasi saldo berjalan
                if (row.metode === 'Tunai') currentSaldoTunai += (row.debit - row.kredit);
                if (row.metode === 'QRIS') currentSaldoQris += (row.debit - row.kredit);
                
                totalDebit += row.debit;
                totalKredit += row.kredit;

                var badgeColor = row.metode === 'Tunai' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700';
                
                html += `<tr class="hover:bg-slate-50 transition-colors border-b border-slate-50">
                    <td class="p-3 text-center text-slate-400 font-bold">${j+1}</td>
                    <td class="p-3 whitespace-nowrap">${tglStr}</td>
                    <td class="p-3 font-mono text-slate-500">${escapeHtml(row.noBukti)}</td>
                    <td class="p-3 font-bold ${row.jenis === 'Pemasukan' ? 'text-emerald-600' : 'text-red-600'}">${row.jenis}</td>
                    <td class="p-3">${escapeHtml(row.kategori)}</td>
                    <td class="p-3 truncate max-w-[150px]">${escapeHtml(row.uraian)}</td>
                    <td class="p-3 text-center"><span class="px-2 py-0.5 rounded text-[9px] font-black ${badgeColor}">${row.metode}</span></td>
                    <td class="p-3 text-right font-black text-emerald-600">${row.debit > 0 ? formatRp(row.debit) : '-'}</td>
                    <td class="p-3 text-right font-black text-red-600">${row.kredit > 0 ? formatRp(row.kredit) : '-'}</td>
                    <td class="p-3 text-right font-bold text-blue-700">${formatRp(currentSaldoTunai)}</td>
                    <td class="p-3 text-right font-bold text-cyan-700">${formatRp(currentSaldoQris)}</td>
                    <td class="p-3 text-center no-print whitespace-nowrap">
                        <button onclick="openEditBku('${safeJsArg(row.id)}')" 
                                class="text-blue-500 bg-blue-50 hover:bg-blue-100 w-7 h-7 rounded mr-1 transition-all shadow-sm active:scale-95" 
                                title="Edit">
                            <i class="fas fa-edit text-[10px]"></i>
                        </button>
                        <button onclick="deleteBkuRow('${safeJsArg(row.id)}')" 
                                class="text-red-500 bg-red-50 hover:bg-red-100 w-7 h-7 rounded transition-all shadow-sm active:scale-95" 
                                title="Hapus">
                            <i class="fas fa-trash text-[10px]"></i>
                        </button>
                    </td>
                </tr>`;
            }

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="12" class="text-center p-8 text-slate-400 font-bold">Tidak ada data pada periode ini.</td></tr>';
            } else {
                tbody.innerHTML = html;
            }

            // Update Footer (Hanya total periode, saldo akhir tetap dihitung berjalan)
            document.getElementById('bku-foot-debit').innerText = formatRp(totalDebit);
            document.getElementById('bku-foot-kredit').innerText = formatRp(totalKredit);
            document.getElementById('bku-foot-saldo-tunai').innerText = formatRp(currentSaldoTunai);
            document.getElementById('bku-foot-saldo-qris').innerText = formatRp(currentSaldoQris);
        }

        function printBku() {
            var startInput = document.getElementById('bku-filter-start').value;
            var endInput   = document.getElementById('bku-filter-end').value;

            var rangeText = '';
            if (startInput && endInput) {
                var startObj = parseLocalDate(startInput);
                var endObj   = parseLocalDate(endInput);
                var opt = { day: '2-digit', month: 'long', year: 'numeric' };
                rangeText = startObj.toLocaleDateString('id-ID', opt)
                          + ' s/d ' + endObj.toLocaleDateString('id-ID', opt);
            } else {
                rangeText = 'Semua Periode';
            }

            // Pastikan state.setup sudah terbaru
            if (!state.setup || !state.setup['Nama Toko']) {
                return Swal.fire({
                    icon: 'warning',
                    title: 'Data Toko Belum Lengkap',
                    html: 'Nama toko / alamat belum diisi di Pengaturan.<br><br>' +
                          'Buka <b>Pengaturan → Profil Toko & Kasir</b>, isi kolom <b>Nama Toko</b> dan <b>Alamat</b>, ' +
                          'lalu klik <b>Simpan</b>. Setelah itu cetak ulang.',
                    confirmButtonText: 'Buka Pengaturan',
                    showCancelButton: true,
                    cancelButtonText: 'Batal',
                    confirmButtonColor: '#3b82f6'
                }).then(function(r) {
                    if (r.isConfirmed) switchView('setup');
                });
            }

            // ── AMBIL DARI SETUP (dengan fallback eksplisit) ──
            var tokoName   = String(state.setup['Nama Toko'] || '').trim();
            var tokoAlamat = String(state.setup['Alamat'] || '').trim();
            var tokoTelp   = String(state.setup['Telepon'] || '').trim();

            if (!tokoName) {
                tokoName = 'NAMA TOKO BELUM DIATUR';
                console.warn('[printBku] state.setup["Nama Toko"] kosong. Buka Pengaturan → isi Nama Toko → Simpan → Sync.');
            }

            // ── Susun baris alamat (gabung alamat + telp kalau ada) ──
            var alamatLine = '';
            if (tokoAlamat) alamatLine = tokoAlamat;
            if (tokoTelp)   alamatLine += (alamatLine ? ' • Telp: ' : 'Telp: ') + tokoTelp;

            // ── Bangun header print ──
            var headerEl = document.getElementById('bku-print-header');
            if (!headerEl) {
                headerEl = document.createElement('div');
                headerEl.id = 'bku-print-header';
                headerEl.style.cssText = 'text-align:center; margin-bottom:18px; border-bottom:2px solid #000; padding-bottom:12px;';
                var tableContainer = document.getElementById('bku-table').parentNode;
                tableContainer.insertBefore(headerEl, tableContainer.firstChild);
            }

            headerEl.innerHTML =
                '<h1 style="font-size:22px; font-weight:900; margin:0 0 4px 0; text-transform:uppercase; letter-spacing:0.5px; color:#000;">' +
                    escapeHtml(tokoName) +
                '</h1>' +
                (alamatLine
                    ? '<p style="font-size:11px; margin:0 0 14px 0; color:#333;">' + escapeHtml(alamatLine) + '</p>'
                    : '<div style="height:14px;"></div>') +
                '<h2 style="font-size:15px; font-weight:800; margin:10px 0 4px 0; text-transform:uppercase; letter-spacing:1px; color:#000;">' +
                    'LAPORAN BUKU KAS UMUM' +
                '</h2>' +
                '<p style="font-size:11px; margin:0; color:#555;">Periode: ' + escapeHtml(rangeText) + '</p>';

            // ── Cetak ke A4 landscape ──
            printArea('bku-table-container', { orientation: 'landscape' });
        }

        // 5. Tombol Filter Cepat
        function setPresetDateBku(mode) {
            var now = new Date();
            var start = document.getElementById('bku-filter-start');
            var end = document.getElementById('bku-filter-end');
            
            if (mode === 'month') {
                start.value = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
                end.value = toLocalDateStr(now);
            } else if (mode === 'all') {
                start.value = '2000-01-01'; // Mundur jauh untuk menarik semua
                end.value = toLocalDateStr(now);
            }
            renderBku();
        }

        // [MODUL v7.15] REGISTER ASET TETAP — FRONTEND
        var _stateAsetList = [];
        // [PATCH v7.15.1] Cache aset untuk akses cepat dari view lain
        var _asetCache = { data: null, timestamp: 0 };
        var _asetLoadInProgress = false;
        var _asetLoadQueue = [];

        function _asetCacheReady() {
            return _asetCache.data !== null && (Date.now() - _asetCache.timestamp) < 120000; // 2 menit
        }

        function _ensureAsetLoaded(callback) {
            if (_asetCacheReady()) {
                _stateAsetList = _asetCache.data;
                callback();
                return;
            }
            if (_asetLoadInProgress) {
                _asetLoadQueue.push(callback);
                return;
            }
            _asetLoadInProgress = true;
            _asetLoadQueue = [callback];

            // [FIX #3] SELALU set _asetCache.data (fallback ke array kosong jika gagal).
            // Tanpa fallback, renderHutang() akan detect cache kosong → panggil
            // _ensureAsetLoaded() lagi → infinite loop / tab crash.
            function _finishLoad(dataArr) {
                _asetCache.data = dataArr || [];
                _asetCache.timestamp = Date.now();
                _stateAsetList = _asetCache.data;
                _asetLoadInProgress = false;
                var queue = _asetLoadQueue.slice();
                _asetLoadQueue = [];
                for (var q = 0; q < queue.length; q++) {
                    try { queue[q](); } catch (e) { console.error('[ensureAset] cb error:', e); }
                }
            }

            google.script.run.withSuccessHandler(function(r) {
                if (r && r.success) {
                    _finishLoad(r.data || []);
                } else {
                    // Server balas error → tetap set array kosong agar tidak loop
                    console.warn('[ensureAset] Server error:', (r && r.error) || 'unknown');
                    _finishLoad(_asetCache.data || []);
                }
            }).withFailureHandler(function(err) {
                console.warn('[ensureAset] Network error:', err && err.message);
                _finishLoad(_asetCache.data || []);
            }).getAsetTetapList(storageManager.get('pos_token_final'));
        }

        function _invalidateAsetCache() {
            _asetCache.data = null;
            _asetCache.timestamp = 0;
        }
        var _stateRiwayatPenyusutan = [];

        function loadAsetList() {
            if (!state.user || state.user.role !== 'Admin') return;
            google.script.run.withSuccessHandler(function(r) {
                if (!r.success) return showToast(r.error, 'error');
                _stateAsetList = r.data || [];
                // [NEW v7.15.1] Update cache global
                _asetCache.data = _stateAsetList;
                _asetCache.timestamp = Date.now();
                document.getElementById('aset-summary-cost').innerText = formatRp(r.totalAset);
                document.getElementById('aset-summary-akum').innerText = formatRp(r.totalAkum);
                document.getElementById('aset-summary-nbv').innerText = formatRp(r.totalNbv);
                _populateAsetKategoriFilter();
                renderAsetList();
            }).withFailureHandler(function(err) {
                showToast('Gagal load aset: ' + (err && err.message ? err.message : 'unknown'), 'error');
            }).getAsetTetapList(storageManager.get('pos_token_final'));
        }

        function _populateAsetKategoriFilter() {
            var sel = document.getElementById('aset-filter-kategori');
            if (!sel) return;
            var current = sel.value;
            var kats = {};
            for (var i = 0; i < _stateAsetList.length; i++) {
                if (_stateAsetList[i].kategori) kats[_stateAsetList[i].kategori] = true;
            }
            var html = '<option value="ALL">Semua Kategori</option>';
            Object.keys(kats).sort().forEach(function(k) {
                html += '<option value="' + escapeHtml(k) + '">' + escapeHtml(k) + '</option>';
            });
            sel.innerHTML = html;
            if (kats[current]) sel.value = current;
        }

        function renderAsetList() {
            var tbody = document.getElementById('aset-tbody');
            if (!tbody) return;

            var filterStatus = document.getElementById('aset-filter-status').value;
            var filterKat = document.getElementById('aset-filter-kategori').value;
            var search = (document.getElementById('aset-search').value || '').toLowerCase().trim();

            var filtered = _stateAsetList.filter(function(a) {
                if (filterStatus !== 'ALL' && a.status !== filterStatus) return false;
                if (filterKat !== 'ALL' && a.kategori !== filterKat) return false;
                if (search) {
                    var hay = (a.nama + ' ' + a.idAset).toLowerCase();
                    if (hay.indexOf(search) === -1) return false;
                }
                return true;
            });

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center p-8 text-slate-400 font-bold text-xs"><i class="fas fa-box-open text-2xl mb-2 block text-slate-300"></i>Belum ada aset terdaftar</td></tr>';
                return;
            }

            var html = '';
            for (var i = 0; i < filtered.length; i++) {
                var a = filtered[i];
                var tgl = new Date(a.tanggalPerolehan).toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'numeric'});
                var statusBadge = a.status === 'AKTIF'
                    ? '<span class="px-2 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-700 border border-emerald-200">AKTIF</span>'
                    : '<span class="px-2 py-0.5 rounded text-[9px] font-black bg-slate-200 text-slate-600 border border-slate-300">DISPOSED</span>';

                var aksi = '';
                if (a.status === 'AKTIF') {
                    aksi =
                        '<button onclick="openDisposalAset(\'' + safeJsArg(a.idAset) + '\')" class="text-red-600 bg-red-50 hover:bg-red-100 w-7 h-7 rounded mr-1 transition-all active:scale-95" title="Disposal"><i class="fas fa-truck-ramp-box text-[10px]"></i></button>' +
                        '<button onclick="openAsetModal(\'' + safeJsArg(a.idAset) + '\')" class="text-blue-600 bg-blue-50 hover:bg-blue-100 w-7 h-7 rounded transition-all active:scale-95" title="Edit"><i class="fas fa-edit text-[10px]"></i></button>';
                } else {
                    aksi = '<span class="text-[10px] text-slate-400 italic">—</span>';
                }

                html += '<tr class="hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">' +
                    '<td class="p-3"><div class="font-bold text-xs text-slate-800 truncate max-w-[180px]">' + escapeHtml(a.nama) + '</div><div class="text-[9px] text-slate-400 font-mono">' + escapeHtml(a.idAset) + '</div></td>' +
                    '<td class="p-3 text-[10px] text-slate-600">' + escapeHtml(a.kategori) + '</td>' +
                    '<td class="p-3 text-[10px] text-slate-500 whitespace-nowrap">' + tgl + '</td>' +
                    '<td class="p-3 text-right font-bold text-xs text-slate-700">' + formatRp(a.nilaiPerolehan) + '</td>' +
                    '<td class="p-3 text-center text-xs text-slate-600">' + a.masaManfaat + '</td>' +
                    '<td class="p-3 text-right font-bold text-xs text-orange-600">' + formatRp(a.akumPenyusutan) + '</td>' +
                    '<td class="p-3 text-right font-black text-xs text-emerald-600">' + formatRp(a.nbv) + '</td>' +
                    '<td class="p-3 text-center">' + statusBadge + '</td>' +
                    '<td class="p-3 text-center whitespace-nowrap">' + aksi + '</td>' +
                    '</tr>';
            }
            tbody.innerHTML = html;
        }

        function openAsetModal(idAset) {
            if (!state.user || state.user.role !== 'Admin') return showToast('Hanya Admin!', 'error');

            var formIds = ['aset-nama','aset-nilai','aset-residu','aset-masa','aset-lokasi','aset-ket'];
            formIds.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; });

            var today = new Date();
            document.getElementById('aset-tanggal').value = toLocalDateStr(today);
            document.getElementById('aset-kategori').value = 'Peralatan';
            document.getElementById('aset-sumber').value = 'KAS';
            document.getElementById('aset-id-hidden').value = '';
            document.getElementById('aset-is-new').value = 'true';
            document.getElementById('modal-aset-title').innerHTML = '<i class="fas fa-building text-blue-500 mr-2"></i>Tambah Aset';

            if (idAset) {
                var a = _stateAsetList.find(function(x) { return x.idAset === idAset; });
                if (!a) return showToast('Aset tidak ditemukan', 'error');

                document.getElementById('aset-id-hidden').value = a.idAset;
                document.getElementById('aset-is-new').value = 'false';
                document.getElementById('aset-nama').value = a.nama;
                document.getElementById('aset-kategori').value = a.kategori || 'Peralatan';
                document.getElementById('aset-tanggal').value = toLocalDateStr(new Date(a.tanggalPerolehan));
                document.getElementById('aset-nilai').value = Number(a.nilaiPerolehan || 0).toLocaleString('id-ID');
                document.getElementById('aset-residu').value = Number(a.nilaiResidu || 0).toLocaleString('id-ID');
                document.getElementById('aset-masa').value = a.masaManfaat;
                document.getElementById('aset-lokasi').value = a.lokasi || '';
                document.getElementById('aset-ket').value = a.keterangan || '';
                document.getElementById('modal-aset-title').innerHTML = '<i class="fas fa-edit text-blue-500 mr-2"></i>Edit Aset';

                // Sembunyikan input yang tidak boleh diubah saat edit
                document.getElementById('aset-sumber-section').classList.add('hidden');
                document.getElementById('aset-nilai').setAttribute('readonly', 'readonly');
                document.getElementById('aset-nilai').classList.add('opacity-60');
                document.getElementById('aset-residu').setAttribute('readonly', 'readonly');
                document.getElementById('aset-residu').classList.add('opacity-60');
                document.getElementById('aset-tanggal').setAttribute('readonly', 'readonly');
                document.getElementById('aset-tanggal').classList.add('opacity-60');
                document.getElementById('aset-masa').setAttribute('readonly', 'readonly');
                document.getElementById('aset-masa').classList.add('opacity-60');
            } else {
                document.getElementById('aset-sumber-section').classList.remove('hidden');
                ['aset-nilai','aset-residu','aset-masa'].forEach(function(fid) {
                    var el = document.getElementById(fid);
                    el.removeAttribute('readonly');
                    el.classList.remove('opacity-60');
                });
                document.getElementById('aset-tanggal').removeAttribute('readonly');
                document.getElementById('aset-tanggal').classList.remove('opacity-60');
            }

            openModal('modal-aset');
        }

        function submitAset() {
            var isNew = document.getElementById('aset-is-new').value === 'true';
            var payload = {
                isNew: isNew,
                idAset: document.getElementById('aset-id-hidden').value,
                nama: document.getElementById('aset-nama').value.trim(),
                kategori: document.getElementById('aset-kategori').value,
                tanggalPerolehan: parseLocalDate(document.getElementById('aset-tanggal').value).getTime(),
                nilaiPerolehan: getAngkaBersih('aset-nilai'),
                nilaiResidu: getAngkaBersih('aset-residu'),
                masaManfaat: parseInt(document.getElementById('aset-masa').value, 10) || 0,
                lokasi: document.getElementById('aset-lokasi').value.trim(),
                keterangan: document.getElementById('aset-ket').value.trim(),
                sumberDana: isNew ? document.getElementById('aset-sumber').value : null
            };

            if (!payload.nama) return showToast('Nama aset wajib diisi', 'error');
            if (isNew && payload.nilaiPerolehan <= 0) return showToast('Nilai perolehan wajib > 0', 'error');
            if (isNew && payload.masaManfaat <= 0) return showToast('Masa manfaat wajib > 0', 'error');

            var btn = document.getElementById('btn-save-aset');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...';
            btn.disabled = true;

            google.script.run.withSuccessHandler(function(r) {
                btn.innerHTML = 'Simpan Aset';
                btn.disabled = false;
                if (!r.success) return Swal.fire('Gagal', r.error, 'error');

                closeModal('modal-aset');
                _invalidateAsetCache();
                Swal.fire('Tersimpan!', isNew ? 'Aset baru berhasil didaftarkan.' : 'Aset berhasil diperbarui.', 'success');
                loadAsetList();
            }).withFailureHandler(function(err) {
                btn.innerHTML = 'Simpan Aset';
                btn.disabled = false;
                Swal.fire('Koneksi Gagal', err && err.message ? err.message : 'unknown', 'error');
            }).saveAsetTetap(storageManager.get('pos_token_final'), payload);
        }

        // ── Disposal ──
        function openDisposalAset(idAset) {
            var a = _stateAsetList.find(function(x) { return x.idAset === idAset; });
            if (!a) return showToast('Aset tidak ditemukan', 'error');
            if (a.status !== 'AKTIF') return showToast('Aset sudah disposed', 'error');

            document.getElementById('disp-id-hidden').value = a.idAset;
            document.getElementById('disp-nama').innerText = a.nama;
            document.getElementById('disp-cost').innerText = formatRp(a.nilaiPerolehan);
            document.getElementById('disp-akum').innerText = formatRp(a.akumPenyusutan);
            document.getElementById('disp-nbv').innerText = formatRp(a.nbv);
            document.getElementById('disp-tanggal').value = toLocalDateStr(new Date());
            document.getElementById('disp-jual').value = '0';
            document.getElementById('disp-metode').value = 'TUNAI';
            updateDisposalPreview();
            openModal('modal-dispose-aset');
        }

        function updateDisposalPreview() {
            var idAset = document.getElementById('disp-id-hidden').value;
            var a = _stateAsetList.find(function(x) { return x.idAset === idAset; });
            if (!a) return;

            var nilaiJual = getAngkaBersih('disp-jual');
            var nbv = a.nbv;
            var gainLoss = nilaiJual - nbv;
            var preview = document.getElementById('disp-preview');
            if (!preview) return;

            var label, color;
            if (gainLoss > 0) { label = 'GAIN (untung)'; color = 'text-emerald-700 bg-emerald-50 border-emerald-200'; }
            else if (gainLoss < 0) { label = 'LOSS (rugi)'; color = 'text-red-700 bg-red-50 border-red-200'; }
            else { label = 'BREAK EVEN'; color = 'text-slate-700 bg-slate-50 border-slate-200'; }

            preview.className = 'border rounded-xl p-3 text-xs ' + color;
            preview.innerHTML =
                '<div class="flex justify-between mb-1"><span>Nilai Jual:</span><b>' + formatRp(nilaiJual) + '</b></div>' +
                '<div class="flex justify-between mb-1"><span>NBV:</span><b>' + formatRp(nbv) + '</b></div>' +
                '<div class="flex justify-between border-t border-current/20 pt-2 mt-1"><span class="font-bold">' + label + ':</span><b>' + formatRp(Math.abs(gainLoss)) + '</b></div>';
        }

        function submitDisposalAset() {
            var idAset = document.getElementById('disp-id-hidden').value;
            var nilaiJual = getAngkaBersih('disp-jual');
            var tanggal = parseLocalDate(document.getElementById('disp-tanggal').value).getTime();
            var metode = document.getElementById('disp-metode').value;

            var a = _stateAsetList.find(function(x) { return x.idAset === idAset; });
            if (!a) return showToast('Aset tidak ditemukan', 'error');

            var nbv = a.nbv;
            var gl = nilaiJual - nbv;
            var glText = gl >= 0 ? 'Gain Rp ' + formatRp(gl) : 'Loss Rp ' + formatRp(Math.abs(gl));

            Swal.fire({
                title: 'Konfirmasi Disposal',
                html: 'Aset <b>' + escapeHtml(a.nama) + '</b> akan di-disposal.<br><br>' +
                      '<div class="text-left text-xs bg-slate-50 p-3 rounded border"><b>Jurnal yang akan dibuat:</b><br>' +
                      'D Kas/Bank: ' + formatRp(nilaiJual) + '<br>' +
                      'D Akum. Penyusutan: ' + formatRp(a.akumPenyusutan) + '<br>' +
                      (gl < 0 ? 'D Beban Lainnya: ' + formatRp(Math.abs(gl)) + '<br>' : '') +
                      'K Peralatan: ' + formatRp(a.nilaiPerolehan) + '<br>' +
                      (gl > 0 ? 'K Pendapatan Lain: ' + formatRp(gl) + '<br>' : '') +
                      '</div><br><span class="text-xs text-red-600 font-bold">Tidak bisa dibatalkan.</span>',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Ya, Disposal',
                cancelButtonText: 'Batal',
                confirmButtonColor: '#dc2626'
            }).then(function(res) {
                if (!res.isConfirmed) return;

                var btn = document.getElementById('btn-dispose-aset');
                btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Memproses...';
                btn.disabled = true;

                google.script.run.withSuccessHandler(function(r) {
                    btn.innerHTML = 'Disposal';
                    btn.disabled = false;
                    if (!r.success) return Swal.fire('Gagal', r.error, 'error');

                    closeModal('modal-dispose-aset');
                    _invalidateAsetCache();
                    Swal.fire({
                        icon: 'success',
                        title: 'Disposal Berhasil',
                        html: '<div class="text-sm">NBV: <b>' + formatRp(r.nbv) + '</b><br>' +
                              'Hasil: <b class="' + (r.isGain ? 'text-emerald-600' : 'text-red-600') + '">' +
                              (r.isGain ? 'Gain' : 'Loss') + ' ' + formatRp(Math.abs(r.gainLoss)) + '</b></div>'
                    });
                    loadAsetList();
                }).withFailureHandler(function(err) {
                    btn.innerHTML = 'Disposal';
                    btn.disabled = false;
                    Swal.fire('Koneksi Gagal', err && err.message ? err.message : 'unknown', 'error');
                }).disposeAsetTetap(storageManager.get('pos_token_final'), {
                    idAset: idAset, tanggalDisposal: tanggal, nilaiJual: nilaiJual,
                    metodeBayar: metode, keterangan: ''
                });
            });
        }

        // [PATCH v7.15.1] openPenyusutanModal + preview handler
        function openPenyusutanModal() {
            var now = new Date();
            var yyyy = now.getFullYear();
            var mm = String(now.getMonth() + 1).padStart(2, '0');
            document.getElementById('peny-periode').value = yyyy + '-' + mm;

            // [NEW] Pasang handler onchange + trigger pertama kali
            document.getElementById('peny-periode').onchange = _updatePenyusutanPreview;

            if (_asetCacheReady()) {
                _updatePenyusutanPreview();
            } else {
                document.getElementById('peny-preview').innerHTML =
                    '<i class="fas fa-spinner fa-spin mr-1 text-slate-400"></i> Memuat data aset...';
                _ensureAsetLoaded(function() { _updatePenyusutanPreview(); });
            }

            openModal('modal-penyusutan');
        }

        function _updatePenyusutanPreview() {
            var periode = document.getElementById('peny-periode').value;
            var preview = document.getElementById('peny-preview');
            if (!preview) return;

            if (!periode) {
                preview.innerHTML = 'Pilih periode untuk melihat preview.';
                return;
            }
            if (!_stateAsetList || _stateAsetList.length === 0) {
                preview.innerHTML = '<i class="fas fa-info-circle text-slate-400 mr-1"></i> Belum ada aset terdaftar.';
                return;
            }

            var parts = periode.split('-');
            if (parts.length !== 2) {
                preview.innerHTML = 'Format periode tidak valid.';
                return;
            }
            var pStart = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1).getTime();

            var total = 0, count = 0, skipCount = 0;
            for (var i = 0; i < _stateAsetList.length; i++) {
                var a = _stateAsetList[i];
                if (a.status !== 'AKTIF') continue;

                var tglBeli = new Date(a.tanggalPerolehan);
                var mBeli = new Date(tglBeli.getFullYear(), tglBeli.getMonth(), 1).getTime();
                if (pStart <= mBeli) { skipCount++; continue; }

                var dapat = a.nilaiPerolehan - (a.nilaiResidu || 0);
                if (a.masaManfaat <= 0) { skipCount++; continue; }
                var perBln = dapat / a.masaManfaat;
                var sisa = dapat - a.akumPenyusutan;
                if (sisa <= 0) { skipCount++; continue; }

                var nominal = Math.min(Math.round(perBln), Math.round(sisa));
                total += nominal;
                count++;
            }

            if (count > 0) {
                preview.innerHTML =
                    '<i class="fas fa-info-circle text-blue-500 mr-1"></i> ' +
                    'Estimasi: <b class="text-amber-700">' + formatRp(total) + '</b> ' +
                    'untuk <b class="text-amber-700">' + count + '</b> aset aktif' +
                    (skipCount > 0
                        ? '<br><span class="text-[10px] text-slate-400">' + skipCount + ' aset dilewati (belum waktunya / sudah habis)</span>'
                        : '');
            } else {
                preview.innerHTML =
                    '<i class="fas fa-check-circle text-emerald-500 mr-1"></i> ' +
                    'Tidak ada aset yang perlu disusutkan periode ini.' +
                    (skipCount > 0
                        ? '<br><span class="text-[10px] text-slate-400">' + skipCount + ' aset aktif dilewati</span>'
                        : '');
            }
        }

        function submitPenyusutan() {
            var periode = document.getElementById('peny-periode').value;
            if (!periode) return showToast('Pilih periode dulu', 'error');

            var btn = document.getElementById('btn-jalankan-peny');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Memproses...';
            btn.disabled = true;

            google.script.run.withSuccessHandler(function(r) {
                btn.innerHTML = 'Jalankan';
                btn.disabled = false;
                if (!r.success) return Swal.fire('Gagal', r.error, 'error');

                closeModal('modal-penyusutan');
                if (r.totalPenyusutan > 0) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Penyusutan Diposting',
                        html: 'Total: <b>' + formatRp(r.totalPenyusutan) + '</b><br>Untuk ' + r.jumlahAset + ' aset aktif.'
                    });
                    _invalidateAsetCache();
                    loadAsetList();
                    loadRiwayatPenyusutan();
                } else {
                    Swal.fire('Info', r.message || 'Tidak ada aset yang perlu disusutkan.', 'info');
                }
            }).withFailureHandler(function(err) {
                btn.innerHTML = 'Jalankan';
                btn.disabled = false;
                Swal.fire('Koneksi Gagal', err && err.message ? err.message : 'unknown', 'error');
            }).jalankanPenyusutanBulanan(storageManager.get('pos_token_final'), periode);
        }

        function loadRiwayatPenyusutan() {
            var container = document.getElementById('riwayat-penyusutan-container');
            if (!container) return;
            container.innerHTML = '<div class="text-center py-4 text-slate-400 text-xs"><i class="fas fa-spinner fa-spin"></i> Memuat...</div>';

            google.script.run.withSuccessHandler(function(r) {
                if (!r.success) { container.innerHTML = '<div class="text-center py-4 text-red-500 text-xs">' + escapeHtml(r.error) + '</div>'; return; }
                _stateRiwayatPenyusutan = r.data || [];
                if (_stateRiwayatPenyusutan.length === 0) {
                    container.innerHTML = '<div class="text-center py-6 text-slate-400 text-xs italic">Belum ada riwayat penyusutan.</div>';
                    return;
                }
                var html = '';
                for (var i = 0; i < _stateRiwayatPenyusutan.length; i++) {
                    var row = _stateRiwayatPenyusutan[i];
                    var tgl = new Date(row.tanggalPosting).toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
                    html += '<div class="bg-slate-50 border border-slate-200 rounded-lg p-3 flex justify-between items-center">' +
                        '<div>' +
                            '<div class="font-black text-sm text-slate-800">Periode ' + escapeHtml(row.periode) + '</div>' +
                            '<div class="text-[10px] text-slate-500 mt-0.5">' + tgl + ' • ' + row.jumlahAset + ' aset • Ref: ' + escapeHtml(row.refJurnal) + '</div>' +
                        '</div>' +
                        '<div class="text-right"><div class="text-[9px] text-slate-400 font-bold uppercase">Total</div><div class="font-black text-emerald-600">' + formatRp(row.totalNominal) + '</div></div>' +
                    '</div>';
                }
                container.innerHTML = html;
            }).withFailureHandler(function(err) {
                container.innerHTML = '<div class="text-center py-4 text-red-500 text-xs">Gagal load: ' + (err && err.message ? err.message : 'unknown') + '</div>';
            }).getRiwayatPenyusutan(storageManager.get('pos_token_final'));
        }

        function showToast(msg, type) { 
            var t = document.getElementById('toast'); 
            document.getElementById('toast-msg').innerText = msg; 
            document.getElementById('toast-icon').className = (type === 'error') ? 'fas fa-times-circle text-red-400 text-xl' : 'fas fa-check-circle text-emerald-400 text-xl'; 
            t.classList.remove('-translate-y-[200%]', 'opacity-0'); 
            t.classList.add('translate-y-0', 'opacity-100'); 
            setTimeout(function() { 
                t.classList.remove('translate-y-0', 'opacity-100'); 
                t.classList.add('-translate-y-[200%]', 'opacity-0'); 
            }, 3000); 
        }
		    function openModal(id) { var m = document.getElementById(id); if(m) m.classList.remove('hidden'); }
        function closeModal(id) { var m = document.getElementById(id); if(m) m.classList.add('hidden'); }
        
        function printArea(id, options) {
            options = options || {};
            var el = document.getElementById(id);
            if (!el) {
                console.warn('[printArea] Element tidak ditemukan: ' + id);
                return;
            }

            var isThermal   = (id === 'print-struk-area');
            var isBarcode   = (id === 'print-barcode-area');
            var isLandscape = (options.orientation === 'landscape');
            var removeAfter = (options.removeAfter === true);
            var isReport    = !isThermal && !isBarcode;

            // ═══════════════════════════════════════════════════════
            // 1. PROFIL KERTAS
            // ═══════════════════════════════════════════════════════
            var pageSize, pageMargin;
            if (isThermal) {
                pageSize   = '58mm auto';  pageMargin = '2mm';
            } else if (isBarcode) {
                pageSize   = '50mm 30mm';  pageMargin = '0';
            } else if (isLandscape) {
                pageSize   = 'A4 landscape'; pageMargin = '10mm';
            } else {
                pageSize   = 'A4 portrait';  pageMargin = '12mm';
            }

            // ═══════════════════════════════════════════════════════
            // 2. TANDAI BODY & PINDAHKAN ELEMEN
            // ═══════════════════════════════════════════════════════
            if (isThermal)   document.body.classList.add('thermal-mode');
            if (isBarcode)   document.body.classList.add('barcode-mode');
            if (isLandscape) document.body.classList.add('landscape-mode');

            var parent = el.parentNode;
            var next   = el.nextSibling;
            document.body.appendChild(el);
            document.body.classList.add('printing-now');
            el.classList.add('print-section');

            if (id === 'print-area-inv') {
                var hdr = document.getElementById('inv-print-header');
                if (hdr) hdr.classList.remove('hidden');
            }

            // ═══════════════════════════════════════════════════════
            // 3. CLEANUP — dipanggil dari MULTIPLE jalur
            // ═══════════════════════════════════════════════════════
            var cleaned = false;
            var iframe  = null;
            function cleanup() {
                if (cleaned) return;
                cleaned = true;

                try {
                    el.classList.remove('print-section');
                    if (id === 'print-area-inv') {
                        var h2 = document.getElementById('inv-print-header');
                        if (h2) h2.classList.add('hidden');
                    }

                    // removeAfter: hapus total (dipakai printDailyFullReport)
                    if (removeAfter) {
                        if (el.parentNode) el.parentNode.removeChild(el);
                    } else if (parent) {
                        try {
                            if (next && next.parentNode === parent) {
                                parent.insertBefore(el, next);
                            } else {
                                parent.appendChild(el);
                            }
                        } catch (e) {
                            console.warn('[printArea] Restore gagal:', e);
                        }
                    }

                    document.body.classList.remove('thermal-mode');
                    document.body.classList.remove('barcode-mode');
                    document.body.classList.remove('landscape-mode');
                    document.body.classList.remove('printing-now');
                } catch (e) {
                    console.warn('[printArea] Cleanup error:', e);
                }

                setTimeout(function() {
                    try {
                        if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
                    } catch (e) {}
                }, 500);
            }

            // Safety net: paksa cleanup dalam 30 detik walau print() hang
            setTimeout(cleanup, 30000);

            // ═══════════════════════════════════════════════════════
            // 4. CRITICAL CSS
            // ═══════════════════════════════════════════════════════
            var critical = '';
            critical += '@page { size: ' + pageSize + '; margin: ' + pageMargin + '; }\n';
            critical += 'html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }\n';
            critical += '.no-print, #sidebar, header, #fab-cart, #cart-backdrop, #toast, ' +
                        '#notif-panel, #overflow-menu-panel, #cmd-list { display: none !important; }\n';
            critical += '.print-section { box-shadow: none !important; border: none !important; background: #fff !important; }\n';

            if (isReport) {
                critical +=
                    '.print-section { width: 100% !important; max-width: 100% !important; ' +
                        'padding: 0 !important; margin: 0 !important; }\n' +
                    '.print-table { width: 100%; border-collapse: collapse; page-break-inside: auto; }\n' +
                    '.print-table thead { display: table-header-group; }\n' +
                    '.print-table tfoot { display: table-footer-group; }\n' +
                    '.print-table tr { page-break-inside: avoid; page-break-after: auto; }\n' +
                    '.print-table th, .print-table td { border: 1px solid #000 !important; ' +
                        'padding: 5px 7px !important; font-size: 10px !important; color: #000 !important; ' +
                        'text-align: left; vertical-align: middle; }\n' +
                    '.print-table th { background: #e5e7eb !important; font-weight: bold !important; ' +
                        '-webkit-print-color-adjust: exact; print-color-adjust: exact; }\n' +
                    'table { page-break-inside: auto; }\n' +
                    'tr { page-break-inside: avoid; }\n' +
                    'h1, h2, h3, h4, h5 { page-break-after: avoid; color: #000 !important; }\n' +
                    'img { max-width: 100%; height: auto; }\n' +
                    '.opname-sheet { page-break-after: always; width: 100%; }\n' +
                    '.opname-sheet:last-child { page-break-after: auto; }\n' +
                    '.opname-table { width: 100%; border-collapse: collapse; }\n' +
                    '.opname-table th, .opname-table td { border: 1px solid #000 !important; ' +
                        'padding: 4px 6px !important; font-size: 10px !important; }\n';
            } else if (isThermal) {
                critical +=
                    'html, body { width: 58mm; margin: 0; padding: 2mm; ' +
                        'font-family: "Courier New", monospace; font-size: 10px; ' +
                        'line-height: 1.15; color: #000; background: #fff; }\n' +
                    '.print-section { width: 100% !important; padding: 0 !important; }\n' +
                    '.border-dashed { border-top: 1px dashed #000; margin: 4px 0; }\n';
            } else if (isBarcode) {
                critical +=
                    'html, body { width: 50mm; height: 30mm; margin: 0; padding: 2mm; ' +
                        'display: flex; flex-direction: column; align-items: center; ' +
                        'justify-content: center; background: #fff; }\n' +
                    '.print-section { text-align: center; width: 100%; }\n';
            }

            // ═══════════════════════════════════════════════════════
            // 5. SALIN INLINE CSS
            // ═══════════════════════════════════════════════════════
            var inlineCss = '';
            try {
                var sheets = document.styleSheets;
                for (var i = 0; i < sheets.length; i++) {
                    var sheet = sheets[i];
                    if (sheet.href) continue;
                    try {
                        var rules = sheet.cssRules || sheet.rules;
                        if (!rules) continue;
                        for (var j = 0; j < rules.length; j++) {
                            inlineCss += rules[j].cssText + '\n';
                        }
                    } catch (e) {}
                }
            } catch (e) {
                console.warn('[printArea] Gagal baca inline CSS:', e);
            }

            var contentHtml = el.outerHTML;

            // ═══════════════════════════════════════════════════════
            // 6. BUAT IFRAME — off-screen TAPI TERLIHAT (kunci fix!)
            // ═══════════════════════════════════════════════════════
            try {
                iframe = document.createElement('iframe');
                iframe.setAttribute('aria-hidden', 'true');
                // PENTING: JANGAN width:0/height:0/visibility:hidden.
                // Iframe harus RENDERED supaya print() bekerja.
                iframe.style.cssText =
                    'position:fixed; top:0; left:-99999px; ' +
                    'width:' + (isThermal ? '58mm' : isBarcode ? '50mm' : '1024px') + ';' +
                    'height:' + (isThermal ? '800px' : isBarcode ? '100px' : '768px') + ';' +
                    'border:0; visibility:visible; opacity:0; pointer-events:none;';
                document.body.appendChild(iframe);

                var idoc = iframe.contentWindow.document;
                idoc.open();
                idoc.write(
                    '<!DOCTYPE html><html lang="id"><head>' +
                    '<meta charset="UTF-8">' +
                    '<title>Cetak</title>' +
                    '<style>' + inlineCss + '</style>' +
                    '<style>' + critical + '</style>' +
                    '</head><body class="' + (document.body.className || '') + '">' +
                    contentHtml +
                    '</body></html>'
                );
                idoc.close();

                // ═══════════════════════════════════════════════════════
                // 7. TRIGGER PRINT dengan proteksi anti-hang
                // ═══════════════════════════════════════════════════════
                var printTriggered = false;
                function doPrint() {
                    if (printTriggered || cleaned) return;
                    printTriggered = true;

                    try { iframe.contentWindow.focus(); } catch (e) {}

                    // Dengar event afterprint dari iframe (paling reliable)
                    var afterPrintFired = false;
                    try {
                        iframe.contentWindow.addEventListener('afterprint', function() {
                            if (afterPrintFired) return;
                            afterPrintFired = true;
                            setTimeout(cleanup, 200);
                        }, { once: true });
                    } catch (e) {}

                    // Juga dengar from parent untuk fallback window.print()
                    try {
                        window.addEventListener('afterprint', function() {
                            if (afterPrintFired) return;
                            afterPrintFired = true;
                            setTimeout(cleanup, 200);
                        }, { once: true });
                    } catch (e) {}

                    setTimeout(function() {
                        try {
                            iframe.contentWindow.print();
                        } catch (e) {
                            console.warn('[printArea] iframe.print gagal, fallback:', e);
                            try { window.print(); } catch (e2) {
                                console.error('[printArea] window.print juga gagal:', e2);
                            }
                        }
                        // Cleanup 2.5s setelah print() return (berjaga-jaga afterprint tidak fire)
                        setTimeout(cleanup, 2500);
                    }, 350);
                }

                if (idoc.readyState === 'complete') {
                    doPrint();
                } else {
                    iframe.onload = doPrint;
                    // Fallback jika onload tidak fire
                    setTimeout(function() {
                        if (!printTriggered) doPrint();
                    }, 800);
                }

            } catch (e) {
                console.error('[printArea] Fatal error:', e);
                cleanup();
                try { window.print(); } catch (e2) {}
            }
        }

        // [PATCH v7.19.4] Fix: hapus fallback "Rp 0" yang false-positive
        // (regex lama bisa salah konversi "10" jadi "0")
        function exportElementCSV(elementId, filename) {
            var el = document.getElementById(elementId);
            if (!el) { showToast('Elemen tidak ditemukan', 'error'); return; }

            // 1. Ambil judul & periode
            var titleTxt = '';
            var titleEl = el.querySelector('h3');
            if (titleEl) titleTxt = titleEl.innerText.trim();
            var periodeTxt = '';
            var pEl = el.querySelector('p');
            if (pEl) periodeTxt = pEl.innerText.trim();

            // 2. Bangun tabel HTML
            var html = '<table>';
            var colCount = 2;

            if (titleTxt) {
                html += '<tr><td colspan="' + colCount + '" class="hdr-title">' + escapeHtml(titleTxt) + '</td></tr>';
            }
            if (periodeTxt) {
                html += '<tr><td colspan="' + colCount + '" class="hdr-sub">' + escapeHtml(periodeTxt) + '</td></tr>';
            }
            html += '<tr><td colspan="' + colCount + '"></td></tr>';

            // Baris header kolom
            html += '<tr>' +
                        '<td class="hdr-col lbl">Label</td>' +
                        '<td class="hdr-col num">Nilai</td>' +
                    '</tr>';

            // 3. Loop semua baris flex justify-between (Label ↔ Nilai)
            var rows = el.querySelectorAll('.flex.justify-between');
            var rowCount = 0;
            for (var i = 0; i < rows.length; i++) {
                var spans = rows[i].querySelectorAll('span');
                if (spans.length < 2) continue;
                var label = spans[0].innerText.trim();
                var val = spans[spans.length - 1].innerText.trim();
                if (!label || !val) continue;

                var isTotalRow = rows[i].classList.contains('font-black') ||
                                rows[i].classList.contains('border-t') ||
                                /total|kenaikan kas|laba bersih|laba kotor/i.test(label);

                var labelCls = isTotalRow ? 'lbl-bold' : 'lbl';
                var numVal = excelParseNumber(val);
                var cellHtml;

                // [FIX] Tidak ada fallback regex "0*" lagi.
                // Angka valid → number. Selain itu → string apa adanya.
                if (numVal !== null) {
                    cellHtml = '<td class="' + (isTotalRow ? 'num-bold' : 'num') + '">' + numVal + '</td>';
                } else {
                    cellHtml = '<td class="' + (isTotalRow ? 'lbl-bold' : 'lbl') + '">' + escapeHtml(val) + '</td>';
                }

                html += '<tr><td class="' + labelCls + '">' + escapeHtml(label) + '</td>' + cellHtml + '</tr>';
                rowCount++;
            }

            if (rowCount === 0) {
                showToast('Tidak ada data untuk diexport', 'error');
                return;
            }

            html += '</table>';
            exportToExcel(html, filename);
        }

        // [PATCH v7.19.3] exportCSV() → sekarang generate .xls lewat HTML table method
        function exportCSV(tableId, filename) {
            var table = document.getElementById(tableId);
            if (!table) { showToast('Tabel tidak ditemukan', 'error'); return; }
            var html = buildExcelTable(tableId);
            if (!html || html === '<table></table>') {
                showToast('Tidak ada data untuk diexport', 'error');
                return;
            }
            exportToExcel(html, filename);
        }

        // Helper universal: bungkus HTML table jadi file Excel
        function exportToExcel(htmlTableContent, filename) {
            var template =
                '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
                      'xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
                      'xmlns="http://www.w3.org/TR/REC-html40">' +
                '<head>' +
                    '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">' +
                    '<!--[if gte mso 9]>' +
                    '<xml>' +
                        '<x:ExcelWorkbook>' +
                            '<x:ExcelWorksheets>' +
                                '<x:ExcelWorksheet>' +
                                    '<x:Name>Laporan</x:Name>' +
                                    '<x:WorksheetOptions>' +
                                        '<x:DisplayGridlines/>' +
                                    '</x:WorksheetOptions>' +
                                '</x:ExcelWorksheet>' +
                            '</x:ExcelWorksheets>' +
                        '</x:ExcelWorkbook>' +
                    '</xml>' +
                    '<![endif]-->' +
                    '<style>' +
                        'table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt; }' +
                        'th, td { border: 1px solid #999; padding: 4px 8px; vertical-align: middle; }' +
                        '.hdr-title { font-size: 14pt; font-weight: bold; text-align: center; background: #1e40af; color: #ffffff; }' +
                        '.hdr-sub   { font-size: 11pt; font-weight: bold; text-align: center; background: #dbeafe; color: #1e3a8a; }' +
                        '.hdr-col   { font-weight: bold; background: #1e40af; color: #ffffff; text-align: center; }' +
                        '.num       { mso-number-format:"\\#\\,\\#\\#0"; text-align: right; }' +
                        '.num-cur   { mso-number-format:"\\"Rp\\"\\ \\#\\,\\#\\#0"; text-align: right; }' +
                        '.lbl       { text-align: left; }' +
                        '.bold      { font-weight: bold; }' +
                        '.lbl-bold  { text-align: left; font-weight: bold; background: #f1f5f9; }' +
                        '.num-bold  { mso-number-format:"\\#\\,\\#\\#0"; text-align: right; font-weight: bold; background: #f1f5f9; }' +
                    '</style>' +
                '</head>' +
                '<body>' + htmlTableContent + '</body>' +
                '</html>';

            var blob = new Blob(['\ufeff', template], { type: 'application/vnd.ms-excel;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = url;
            link.download = filename + '_' + toLocalDateStr(new Date()) + '.xls';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
            showToast('File Excel berhasil diunduh', 'success');
        }

        // [PATCH v7.19.4] Fix: handle prefix "- Rp", "+ Rp", "Rp", leading/trailing spaces
        function excelParseNumber(txt) {
            if (!txt) return null;
            var s = String(txt).trim();
            if (!s) return null;

            // Deteksi sign negatif di awal (mis. "- Rp 500.000" atau "-500.000")
            var isNegative = /^[\-\u2212]/.test(s);   // \u2212 = minus unicode

            // Buang prefix sign & "Rp" & spasi (di mana pun posisinya)
            s = s.replace(/^[+\-\u2212]\s*/, '')       // buang sign di depan
                .replace(/Rp\s?/i, '')                // buang "Rp" & spasi setelahnya
                .replace(/\s/g, '')                   // buang semua spasi
                .trim();

            if (!s) return null;

            // Format Indonesia: "1.846.500" atau "1.846.500,75"
            if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
                var raw = s.replace(/\./g, '').replace(',', '.');
                var n = parseFloat(raw);
                if (!isNaN(n)) return isNegative ? -n : n;
            }

            // Format plain: "1846500" atau "1846500.75"
            if (/^\d+(\.\d+)?$/.test(s)) {
                var n2 = parseFloat(s);
                if (!isNaN(n2)) return isNegative ? -n2 : n2;
            }

            return null;
        }

        // [SEC] Cegah formula injection saat file Excel dibuka.
        // Kalau teks dimulai dengan = + - @ TAB CR → prefix apostrof ('),
        // supaya Excel membacanya sebagai string literal, bukan formula.
        function excelSafe(txt) {
            var s = String(txt == null ? '' : txt);
            if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
            return escapeHtml(s);
        }

        // [PATCH v7.19.4] Fix: cegah ID/Kode/Nota ke-parse jadi number
        // (leading zero hilang, mis. "008" → 8)
        function buildExcelTable(tableId, opts) {
            opts = opts || {};
            var table = document.getElementById(tableId);
            if (!table) return '';
            var rows = table.querySelectorAll('tr');
            var html = '<table>';

            // [NEW] Deteksi kolom index mana saja yang header-nya text-only
            // (ID, Kode, Nota, Barcode) — kolom ini tidak boleh diparse jadi number
            var textOnlyCols = {};
            var headerRow = table.querySelector('thead tr') || rows[0];
            if (headerRow) {
                var ths = headerRow.querySelectorAll('th, td');
                for (var t = 0; t < ths.length; t++) {
                    // [FIX #16] Pakai DUA regex:
                    //   1. Case-sensitive, "ID"/"Kode" di awal + diikuti uppercase/space/end
                    //      → menangkap "IDPelanggan", "KodeTrx"
                    //   2. Case-insensitive word-boundary untuk varian lain
                    var hTxtRaw = String(ths[t].innerText || '').trim();
                    var isIdCol =
                        /^\s*(id|kode|nota|barcode|ref)(?=[A-Z]|\s|$)/.test(hTxtRaw) ||
                        /\b(id|kode|nota|barcode|ref)\b/i.test(hTxtRaw);
                    if (isIdCol) {
                        textOnlyCols[t] = true;
                    }
                }
            }

            for (var i = 0; i < rows.length; i++) {
                var cells = rows[i].querySelectorAll('td, th');
                var visible = [];
                var origIdxMap = [];   // simpan index asli untuk lookup textOnlyCols
                for (var v = 0; v < cells.length; v++) {
                    if (!cells[v].classList.contains('no-print')) {
                        visible.push(cells[v]);
                        origIdxMap.push(v);
                    }
                }
                if (visible.length === 0) continue;

                html += '<tr>';
                for (var j = 0; j < visible.length; j++) {
                    var cell = visible[j];
                    var origColIdx = origIdxMap[j];
                    var txt = cell.innerText.replace(/(\r\n|\n|\r)/gm, ' ').trim();
                    var isHeader = (cell.tagName === 'TH');

                    if (isHeader) {
                        html += '<td class="hdr-col">' + escapeHtml(txt) + '</td>';
                        continue;
                    }

                    if (textOnlyCols[origColIdx]) {
                        html += '<td class="lbl">' + excelSafe(txt) + '</td>';
                        continue;
                    }

                    var numVal = excelParseNumber(txt);
                    if (numVal !== null) {
                        html += '<td class="num">' + numVal + '</td>';
                    } else {
                        html += '<td class="lbl">' + excelSafe(txt) + '</td>';
                    }
                }
                html += '</tr>';
            }
            html += '</table>';
            return html;
        }

        function printItemBarcode(id, nama, harga) {
            JsBarcode("#barcode-canvas", id, { format: "CODE128", width: 2, height: 40, displayValue: true, fontSize: 14, margin: 0 });
            document.getElementById('barcode-text').innerText = nama.substring(0, 20) + ' - Rp ' + harga.toLocaleString('id-ID');
            printArea('print-barcode-area');
        }

        // --- SCANNER KAMERA & FISIK ---
        function openScanner() {
            var scannerUrl = 'https://acc-pos.blogspot.com/p/scanner.html';

            // Deteksi mobile
            var isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);

            if (isMobile) {
                // Di mobile, buka full-screen (bukan popup kecil)
                window.location.href = scannerUrl + '?return=' + encodeURIComponent(window.location.href);
            } else {
                window.open(scannerUrl, '_blank', 'width=450,height=650');
            }
        }
  
        // [FIX] Global state untuk debounce
        var _lastScanTime = 0;

        function handlePhysicalScanner(e) {
            // 1. Eksekusi Enter (Barcode Scanner atau pilih via panah)
            if (e.key === 'Enter') {
                e.preventDefault();

                // [FIX] DEBOUNCE: cegah double-fire dalam 300ms (scanner murah sering double)
                var now = Date.now();
                if (now - _lastScanTime < 300) {
                    e.target.value = '';
                    return;
                }
                _lastScanTime = now;

                var val = e.target.value.trim();

                // Jika sedang memilih barang pakai panah keyboard
                if (posSearchIndex > -1) {
                    var grid = document.getElementById('pos-grid');
                    var cards = grid.querySelectorAll('.product-card');
                    if (cards[posSearchIndex]) {
                        var id = cards[posSearchIndex].getAttribute('data-id');
                        var berhasil = addToCart(id);
                        if (berhasil) showToast("Ditambahkan ke keranjang", "success");

                        e.target.value = '';
                        posSearchIndex = -1;
                        renderPosProducts();
                    }
                    return;
                }

                if (!val) return;

                // [FIX] Normalisasi: trim + lowercase + hapus karakter aneh
                var normalizedVal = val.replace(/[\s\r\n\t]+/g, '').toLowerCase();
                var p = state.products.find(function(x) {
                    return String(x.id).replace(/[\s\r\n\t]+/g, '').toLowerCase() === normalizedVal;
                });

                if (p) {
                    var berhasilScan = addToCart(p.id);
                    if (berhasilScan) showToast("✓ " + p.nama, "success");
                    e.target.value = '';
                    renderPosProducts();
                } else {
                    // [FIX] Beep error + keep value supaya kasir bisa lihat
                    showToast("Barcode tidak terdaftar: " + val, "error");
                    try {
                        var ctx = new (window.AudioContext || window.webkitAudioContext)();
                        var osc = ctx.createOscillator(); var gain = ctx.createGain();
                        osc.connect(gain); gain.connect(ctx.destination);
                        osc.type = 'square'; osc.frequency.setValueAtTime(200, ctx.currentTime);
                        gain.gain.setValueAtTime(0.1, ctx.currentTime);
                        osc.start(); osc.stop(ctx.currentTime + 0.3);
                    } catch(ex) {}
                    setTimeout(function() {
                        var s = document.getElementById('pos-search');
                        if (s) { s.value = ''; s.focus(); }
                    }, 800);
                }
            }
            // 2. Navigasi Panah Bawah
            else if (e.key === 'ArrowDown') {
                e.preventDefault();
                var gridCards = document.querySelectorAll('#pos-grid .product-card');
                posSearchIndex = Math.min(posSearchIndex + 1, gridCards.length - 1);
                renderPosProducts();
            }
            // 3. Navigasi Panah Atas
            else if (e.key === 'ArrowUp') {
                e.preventDefault();
                posSearchIndex = Math.max(posSearchIndex - 1, 0);
                renderPosProducts();
            }
            // 4. Reset index saat ngetik huruf lain
            else {
                posSearchIndex = -1;
            }
        }

        // --- POS & CART ---
        function updateCategories() { var catsObj = {}; for(var i=0; i<state.products.length; i++) catsObj[state.products[i].kategori] = true; var cats = Object.keys(catsObj); var html = '<option value="All">Semua Kategori</option>'; for(var j=0; j<cats.length; j++) html += '<option value="' + escapeHtml(cats[j]) + '">' + escapeHtml(cats[j]) + '</option>'; document.getElementById('pos-category').innerHTML = html; }
        
        function togglePosViewMode() {
            var mode = storageManager.get('pos_view_mode') || 'grid';
            storageManager.set('pos_view_mode', mode === 'grid' ? 'list' : 'grid');
            renderPosProducts();
        }

        function renderPosProducts() {
            var searchInput = document.getElementById('pos-search');
            var query = String(searchInput.value || '').toLowerCase().trim();
            
            var isSearching = (query.length > 0);

            var f = state.products.filter(function(p) { 
                // Sembunyikan stok 0 HANYA jika tidak sedang mencari
                if (!isSearching && Number(p.stok) <= 0) return false;
                
                var namaStr = String(p.nama || '').toLowerCase();
                var idStr = String(p.id || '').toLowerCase();
                return namaStr.includes(query) || idStr.includes(query); 
            }); 
            
            var c = document.getElementById('pos-category').value; 
            if(c && c !== 'All') { 
                f = f.filter(function(p) { return p.kategori === c; }); 
            }
            
            // Sort: yang ada stok di atas, yang habis di bawah; lalu A-Z
            f.sort(function(a, b) {
                var aOut = Number(a.stok) <= 0 ? 1 : 0;
                var bOut = Number(b.stok) <= 0 ? 1 : 0;
                if (aOut !== bOut) return aOut - bOut;
                return String(a.nama).localeCompare(String(b.nama));
            });

            var gridContainer = document.getElementById('pos-grid'); 
            if(!gridContainer) return;
            
            var viewMode = storageManager.get('pos_view_mode') || 'grid';
            var html = '';
            
            if(f.length === 0) { 
                gridContainer.innerHTML = '<div class="col-span-full flex flex-col items-center justify-center py-16 text-slate-400 font-bold w-full"><p>' + (isSearching ? 'Barang tidak ditemukan' : 'Belum ada produk tersedia') + '</p></div>'; 
                return; 
            }

            for(var j=0; j<f.length; j++) {
                var prod = f[j]; 
                var isOut = Number(prod.stok) <= 0;
                var isActive = (j === posSearchIndex);
                
                // Hanya produk yang ada stok bisa di-highlight aktif
                var activeClass = (isActive && !isOut) 
                    ? 'ring-4 ring-blue-500 transform scale-95 shadow-lg border-blue-500 glow-blue' 
                    : 'border-slate-200/60';
                
                // Produk habis: tidak bisa diklik (pointer-events-none) & opacity redup
                var outClass = isOut 
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'cursor-pointer hover:border-blue-400 hover:shadow-blue-200/50';
                
                var displayStok = Number(prod.stok) || 0;

                html += `<div data-id="${escapeHtml(prod.id)}" class="product-card group glass-card p-3 rounded-2xl shadow-sm border ${activeClass} ${outClass} hover:shadow-lg transition-all duration-200 flex flex-col relative">`;

                // Badge HABIS hanya saat searching
                if (isOut) {
                    html += '<div class="absolute top-2 right-2 bg-red-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-black z-10 shadow-sm">HABIS</div>';
                }
                
                html += `
                    <div class="h-20 mb-2 overflow-hidden rounded-xl bg-slate-50 flex items-center justify-center">
                        <img src="${prod.image || 'https://placehold.co/100'}" class="w-full h-full object-contain p-1">
                    </div>
                    <h4 class="font-extrabold text-slate-800 text-[11px] truncate mb-1">${escapeHtml(prod.nama)}</h4>
                    <div class="mt-auto flex justify-between items-center relative">
                        <span class="text-blue-600 font-black text-xs">${formatRp(prod.hargaJual)}</span>
                        <!-- Warna Stok Dinamis -->
                        <span class="text-[10px] font-bold ${isOut ? 'text-red-500' : (displayStok <= 5 ? 'text-orange-500' : 'text-emerald-500')}">
                            Sisa: ${displayStok}
                        </span>
                        <!-- Tombol Quick Add (Muncul saat hover) -->
                        ${!isOut ? `<button onclick="event.stopPropagation(); addToCart('${escapeHtml(prod.id)}')" class="absolute -bottom-1 -right-1 w-7 h-7 bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all z-20 hover:bg-blue-700 active:scale-95" title="Tambah Cepat"><i class="fas fa-plus text-[10px]"></i></button>` : ''}
                    </div>
                </div>`;
            }
            gridContainer.innerHTML = html;
        }

        function addToCart(id) { 
          var p = state.products.find(function(x) { return String(x.id) === String(id); }); 
          if(!p) return false;

          var i = state.cart.find(function(x) { return String(x.id) === String(id); }); 
          
          if(i) { 
              if(i.qty < p.stok) { 
                  i.qty++; 
                  playBeep(); 
                  // [FIX BUG] Force re-render cart agar qty display selalu sinkron
                  renderCart();
              } else { 
                  showToast('Stok barang sudah maksimal!', 'error'); 
                  return false; 
              } 
          } else { 
              if(p.stok > 0) { 
                  state.cart.push({ id: p.id, nama: p.nama, qty: 1, hargaJual: p.hargaJual, hargaBeli: p.hargaBeli }); 
                  playBeep(); 
                  renderCart();  // Full render hanya untuk item baru
              } else {
                  Swal.fire('Stok Habis!', 'Gagal menambahkan ' + p.nama + '. Stok saat ini 0.', 'error');
                  return false;
              }
          } 
          var badge = document.getElementById('fab-badge'); 
          badge.classList.add('scale-150'); 
          setTimeout(function() { badge.classList.remove('scale-150'); }, 200); 
          return true;
        }

        // [FIX] Konsolidasi updateQty & setQtyManual
        function updateQty(id, d) { 
            var idx = state.cart.findIndex(function(c) { return String(c.id) === String(id); }); 
            if(idx === -1) return; 
            var currentQty = state.cart[idx].qty;
            var newQty = currentQty + d;
            
            if(newQty <= 0) {
                state.cart.splice(idx, 1);
                renderCart();
                return;
            }
            
            setQtyManual(id, newQty);
        }

        // [NEW] Update subtotal & total saja tanpa render ulang
        function updateCartTotals() {
            var t = 0, totalItems = 0;
            for(var i=0; i<state.cart.length; i++) { 
                t += state.cart[i].qty * state.cart[i].hargaJual; 
                totalItems += state.cart[i].qty;
            }
            document.getElementById('fab-badge').innerText = totalItems; 
            document.getElementById('mobile-cart-badge').innerText = totalItems + ' item';

            // [FIX] Selalu sinkronkan tampilan input qty di DOM dengan state.cart
            // Ini yang bikin qty stuck di "1" sebelumnya karena tidak pernah diupdate.
            var inputs = document.querySelectorAll('.cart-qty-input');
            for (var k = 0; k < inputs.length; k++) {
                var inputId = String(inputs[k].getAttribute('data-id'));
                var cartItem = state.cart.find(function(c) { return String(c.id) === inputId; });
                if (cartItem && String(inputs[k].value) !== String(cartItem.qty)) {
                    inputs[k].value = cartItem.qty;
                }
            }
            
            var disc = getAngkaBersih('cart-discount');
            var finalTotal = t - disc; 
            if(finalTotal < 0) finalTotal = 0;
            
            document.getElementById('cart-subtotal').innerText = formatRp(t); 
            document.getElementById('cart-total').innerText = formatRp(finalTotal);
        }

        function renderCart() {
          var c = document.getElementById('cart-container'); 
          var totalItems = 0; 
          var t = 0;
          for(var i=0; i<state.cart.length; i++) { 
              totalItems += state.cart[i].qty; 
              t += state.cart[i].qty * state.cart[i].hargaJual; 
          }
          document.getElementById('fab-badge').innerText = totalItems; 
          document.getElementById('mobile-cart-badge').innerText = totalItems + ' item';
          
          var disc = getAngkaBersih('cart-discount');
          var finalTotal = t - disc; 
          if(finalTotal < 0) finalTotal = 0;

          if(state.cart.length === 0) { 
              document.getElementById('cart-subtotal').innerText = 'Rp 0'; 
              document.getElementById('cart-total').innerText = 'Rp 0'; 
              c.innerHTML = `
                  <div class="flex flex-col items-center justify-center h-full text-slate-400 py-10">
                      <div class="w-20 h-20 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center mb-4">
                          <i class="fas fa-shopping-basket text-3xl text-slate-300"></i>
                      </div>
                      <p class="text-sm font-black text-slate-600 mb-1">Keranjang Kosong</p>
                      <p class="text-[11px] font-medium text-center px-4 leading-relaxed">Scan Barcode atau klik produk di sebelah kiri untuk mulai menambah pesanan.</p>
                  </div>`; 
              return;
          }
          
          var html = '';
            for(var j=0; j<state.cart.length; j++) {
                var item = state.cart[j]; 
                var safeId = escapeHtml(item.id);
                
                html += '<div class="bg-white p-3 rounded-xl border border-slate-100 flex flex-col gap-2 shadow-sm">' +
                    '<div class="flex justify-between items-start">' +
                        '<span class="font-extrabold text-xs text-slate-800 leading-tight pr-2">' + escapeHtml(item.nama) + '</span>' +
                        '<button data-id="' + safeId + '" data-val="-999" class="cart-btn text-slate-400 hover:text-red-500 hover:bg-red-50 w-7 h-7 flex items-center justify-center rounded transition-all"><i class="fas fa-trash text-xs"></i></button>' +
                    '</div>' +
                    '<div class="flex justify-between items-center">' +
                        '<span class="text-blue-600 font-black text-sm">' + formatRp(item.hargaJual) + '</span>' +
                        '<div class="flex items-center gap-1 bg-slate-50 rounded-lg p-1 border border-slate-200/60">' +
                            '<button data-id="' + safeId + '" data-val="-1" class="cart-btn w-6 h-6 bg-white border border-slate-200 rounded text-xs font-bold hover:bg-slate-100 active:scale-95 transition-transform">-</button>' +
                            // [FIX] Tambahkan class & data-id, dan buat bisa diklik untuk input manual
                            '<input type="number" min="1" value="' + parseInt(item.qty, 10) + '" data-id="' + safeId + '" ' +
                                'class="cart-qty-input w-10 text-center text-xs font-black text-slate-700 bg-transparent border-none outline-none appearance-none" ' +
                                'onchange="setQtyManual(\'' + safeId + '\', this.value)" ' +
                                'onblur="setQtyManual(\'' + safeId + '\', this.value)" ' +
                                'onclick="this.select()" ' +
                                'onkeypress="if(event.key===\'Enter\'){this.blur();}" ' +
                                'style="-moz-appearance: textfield;">' +
                            '<button data-id="' + safeId + '" data-val="1" class="cart-btn w-6 h-6 bg-white border border-slate-200 rounded text-xs font-bold hover:bg-slate-100 active:scale-95 transition-transform">+</button>' +
                        '</div>' +
                    '</div>' +
                '</div>'; 
            }
            c.innerHTML = html; 
            document.getElementById('cart-subtotal').innerText = formatRp(t); 
            document.getElementById('cart-total').innerText = formatRp(finalTotal);
        }

        function setQtyManual(id, val) {
            var q = parseInt(val, 10);
            if (isNaN(q) || q < 1) q = 1;
            
            var idx = state.cart.findIndex(function(c) { return String(c.id) === String(id); }); 
            if(idx === -1) return;
            
            var p = state.products.find(function(x) { return String(x.id) === String(id); }); 
            if(q > p.stok) {
                showToast('Stok maksimal ' + p.stok, 'error');
                q = p.stok;
                // Sinkronkan kembali nilai input field ke qty maksimal
                var targetId = String(id);
                var inputs = document.querySelectorAll('.cart-qty-input');
                for (var k = 0; k < inputs.length; k++) {
                    if (String(inputs[k].getAttribute('data-id')) === targetId) {
                        inputs[k].value = q;
                        break;
                    }
                }
            }
            
            state.cart[idx].qty = q; 
            playBeep();
            updateCartTotals();
        }

        function clearCart() { state.cart = []; document.getElementById('cart-discount').value = 0; renderCart(); if(isMobileCartOpen) toggleMobileCart(); }
        
        function toggleMobileCart() { 
            var panel = document.getElementById('cart-mobile-panel'); 
            var fab = document.getElementById('fab-cart'); 
            var backdrop = document.getElementById('cart-backdrop');
                  if (isMobileCartOpen) { panel.classList.replace('translate-y-0', 'translate-y-full'); fab.classList.remove('hidden'); 
                  if(backdrop) backdrop.classList.add('hidden'); } 
            else { panel.classList.replace('translate-y-full', 'translate-y-0'); fab.classList.add('hidden'); 
                  if(backdrop) backdrop.classList.remove('hidden'); } 
            isMobileCartOpen = !isMobileCartOpen; 
        }

        // --- HOLD CART FEATURE ---
        function renderHeldCartsBadge() { document.getElementById('hold-badge').innerText = state.heldCarts.length; }
        function holdCurrentCart() {
            if(state.cart.length === 0) return;
            Swal.fire({
                title: 'Simpan Antrean',
                input: 'text',
                inputLabel: 'Masukkan Nama Pemesan',
                inputPlaceholder: 'Cth: Meja 1 / Bpk. Budi',
                showCancelButton: true,
                confirmButtonText: 'Simpan',
                cancelButtonText: 'Batal',
                inputValidator: (value) => { if (!value) return 'Nama tidak boleh kosong!' }
            }).then((result) => {
                if (result.isConfirmed) {
                    state.heldCarts.push({ id: Date.now(), note: result.value, cart: JSON.parse(JSON.stringify(state.cart)), discount: document.getElementById('cart-discount').value });
                    storageManager.set('pos_held_carts', JSON.stringify(state.heldCarts));
                    clearCart(); renderHeldCartsBadge(); showToast("Keranjang ditahan", "success");
                }
            });
        }
        function viewHoldCarts() {
            var list = document.getElementById('hold-list'); var empty = document.getElementById('hold-empty');
            if(state.heldCarts.length === 0) { list.innerHTML = ''; empty.classList.remove('hidden'); }
            else {
                empty.classList.add('hidden'); var html = '';
                for(var i=0; i<state.heldCarts.length; i++) {
                    var hc = state.heldCarts[i]; var d = new Date(hc.id).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
                    html += '<div class="bg-amber-50 border border-amber-200 p-3 rounded-xl flex justify-between items-center shadow-sm"><div><p class="font-extrabold text-sm text-amber-800">' + escapeHtml(hc.note) + '</p><p class="text-[10px] font-bold text-amber-600 mt-1">' + hc.cart.length + ' item • ' + d + '</p></div><div class="flex gap-2"><button onclick="restoreCart(' + Number(hc.id) + ')" class="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 shadow-sm transition-all active:scale-95">Panggil</button><button onclick="deleteHoldCart(' + Number(hc.id) + ')" class="text-red-500 bg-white hover:bg-red-50 border border-red-200 w-8 h-8 flex items-center justify-center rounded-lg transition-all active:scale-95"><i class="fas fa-trash text-xs"></i></button></div></div>';
                }
                list.innerHTML = html;
            }
            openModal('modal-hold');
        }
        
        function restoreCart(id) {
            var idx = state.heldCarts.findIndex(function(x) { return String(x.id) === String(id); }); if(idx === -1) return;
            var executeRestore = function() {
                var hc = state.heldCarts[idx]; 
                
                // --- PENYARINGAN STOK SAAT DIPANGGIL ULANG ---
                var validCart = [];
                for(var i=0; i<hc.cart.length; i++) {
                    var cItem = hc.cart[i];
                    var pObj = state.products.find(x => String(x.id) === String(cItem.id));
                    // Cek apakah barang masih ada stoknya
                    if(pObj && pObj.stok > 0) {
                        // Jika stok di gudang sekarang lebih sedikit dari pesanan antrean, sesuaikan!
                        if(cItem.qty > pObj.stok) cItem.qty = pObj.stok; 
                        validCart.push(cItem);
                    }
                }
                state.cart = validCart; 
                // ---------------------------------------------
                
                document.getElementById('cart-discount').value = hc.discount;
                document.getElementById('pay-customer').value = hc.note; 
                state.heldCarts.splice(idx, 1); storageManager.set('pos_held_carts', JSON.stringify(state.heldCarts));
                renderCart(); renderHeldCartsBadge(); closeModal('modal-hold'); showToast("Antrean dipanggil", "success");
            };
            if(state.cart.length > 0) {
                Swal.fire({ title: 'Timpa Keranjang?', text: "Keranjang tidak kosong. Memanggil antrean akan menimpa pesanan saat ini.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#3b82f6', cancelButtonColor: '#94a3b8', confirmButtonText: 'Ya, Timpa!', cancelButtonText: 'Batal' }).then((result) => {
                    if (result.isConfirmed) executeRestore();
                });
            } else { executeRestore(); }
        }
		
		    function deleteHoldCart(id) {
            var idx = state.heldCarts.findIndex(function(x) { return String(x.id) === String(id); }); if(idx > -1) { state.heldCarts.splice(idx, 1); storageManager.set('pos_held_carts', JSON.stringify(state.heldCarts)); viewHoldCarts(); renderHeldCartsBadge(); }
        }

        // [FIX] Helper terpadu: update hint + tombol Konfirmasi
        // Dipakai oleh QRIS & Kasbon yang mewajibkan nama pelanggan

        function updatePaymentNameHint() {
            var mode = state.paymentMethod;
            if (mode !== 'QRIS' && mode !== 'Kasbon') return;

            var custInput = document.getElementById('pay-customer');
            var btn       = document.getElementById('btn-confirm-pay');
            var hintId    = (mode === 'QRIS') ? 'pay-qris-name-hint' : 'pay-kasbon-name-hint';
            var hint      = document.getElementById(hintId);
            if (!custInput || !btn) return;

            var nama = (custInput.value || '').trim();
            var isFilled = !!nama;

            // 1. Toggle tombol Konfirmasi
            btn.disabled = !isFilled;
            btn.classList.toggle('opacity-50', !isFilled);

            // 2. Toggle banner hint
            if (hint) {
                if (isFilled) hint.classList.add('hidden');
                else hint.classList.remove('hidden');
            }

            // 3. Flash border input hijau saat baru terisi (feedback visual)
            if (isFilled && !custInput.dataset._wasFilled) {
                custInput.classList.add('border-emerald-400', 'bg-emerald-50');
                setTimeout(function() {
                    custInput.classList.remove('border-emerald-400', 'bg-emerald-50');
                }, 800);
                custInput.dataset._wasFilled = '1';
            } else if (!isFilled) {
                delete custInput.dataset._wasFilled;
            }
        }

        // --- PAYMENT dengan MIDTRANS QRIS & TUNAI CERDAS ---
        function openPayment(m) {
            if(state.cart.length === 0) return; 
            state.paymentMethod = m; 
            var t = 0; for(var i=0; i<state.cart.length; i++) t += (state.cart[i].hargaJual * state.cart[i].qty);
            var disc = getAngkaBersih('cart-discount');
            var finalTotal = t - disc; if(finalTotal < 0) finalTotal = 0;
            
            document.getElementById('pay-total').innerText = formatRp(finalTotal); 
            var discEl = document.getElementById('pay-discount-text');
            if(disc > 0) { discEl.innerText = '(Diskon ' + formatRp(disc) + ')'; discEl.classList.remove('hidden'); } else discEl.classList.add('hidden');

            document.getElementById('pay-tunai-area').classList.add('hidden');
            document.getElementById('pay-qris-area').classList.add('hidden');
            document.getElementById('pay-kasbon-area').classList.add('hidden');
            document.getElementById('btn-confirm-pay').classList.remove('hidden');

            if(m === 'Tunai') { 
                document.getElementById('pay-tunai-area').classList.remove('hidden'); 
                document.getElementById('pay-cash').value = ''; 
                document.getElementById('btn-confirm-pay').disabled = true; 
                document.getElementById('pay-change').innerText = 'Rp 0'; 
                document.getElementById('pay-change').className = 'text-xl font-black text-slate-300'; 
                
                var container = document.getElementById('quick-cash-buttons');
                container.className = 'grid grid-cols-4 gap-2 mb-3'; // Ubah jadi 4 kolom agar muat banyak
                
                // Tombol Uang Pas
                var html = '<button type="button" onclick="setQuickCash(' + finalTotal + ')" class="py-2.5 px-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-[11px] font-bold hover:bg-blue-100 transition-all shadow-sm leading-tight">Uang<br>Pas</button>';
                
                // LOGIKA PECAHAN UANG CERDAS (Otomatis menyesuaikan total belanja)
                var nextAmounts = [];
                var ceil10 = Math.ceil(finalTotal / 10000) * 10000;   // Pembulatan 10rb ke atas
                var ceil20 = Math.ceil(finalTotal / 20000) * 20000;   // Pembulatan 20rb ke atas
                var ceil50 = Math.ceil(finalTotal / 50000) * 50000;   // Pembulatan 50rb ke atas
                var ceil100 = Math.ceil(finalTotal / 100000) * 100000; // Pembulatan 100rb ke atas

                if (ceil10 > finalTotal && !nextAmounts.includes(ceil10)) nextAmounts.push(ceil10);
                if (ceil20 > finalTotal && !nextAmounts.includes(ceil20)) nextAmounts.push(ceil20);
                if (ceil50 > finalTotal && !nextAmounts.includes(ceil50)) nextAmounts.push(ceil50);
                if (ceil100 > finalTotal && !nextAmounts.includes(ceil100)) nextAmounts.push(ceil100);
                
                // Urutkan dari nominal terkecil
                nextAmounts.sort(function(a, b){return a - b});
                var suggestions = nextAmounts.slice(0, 3); // Ambil 3 pecahan terdekat

                for(var i=0; i<suggestions.length; i++) { 
                    var labelPecahan = (suggestions[i] / 1000) + 'k'; // Singkat jadi 50k, 100k, 250k dsb
                    html += '<button type="button" onclick="setQuickCash(' + suggestions[i] + ')" class="py-2.5 px-1 bg-white text-slate-600 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all shadow-sm">' + labelPecahan + '</button>'; 
                }
                
                container.innerHTML = html;
                setTimeout(() => { document.getElementById('pay-cash').focus(); }, 300);
            } else if (m === 'QRIS') { 
                document.getElementById('pay-qris-area').classList.remove('hidden');
                document.getElementById('qris-manual-content').classList.remove('hidden');
                document.getElementById('btn-confirm-pay').classList.remove('hidden');
                // [FIX] Unified handler — QRIS juga butuh nama wajib
                updatePaymentNameHint();
            } else if (m === 'Kasbon') {
                document.getElementById('pay-kasbon-area').classList.remove('hidden');
                document.getElementById('btn-confirm-pay').classList.remove('hidden');
                var dpEl = document.getElementById('pay-kasbon-dp');
                if (dpEl) dpEl.value = '';
                // [FIX] Unified handler
                updatePaymentNameHint();
            }
            openModal('modal-payment');
        }
        function setQuickCash(amount) { 
            document.getElementById('pay-cash').value = Number(amount).toLocaleString('id-ID'); 
            calcChange(); 
        }
        
        function calcChange() { 
            var t = 0; for(var i=0; i<state.cart.length; i++) t += (state.cart[i].hargaJual * state.cart[i].qty);
            var disc = getAngkaBersih('cart-discount');   // ✅ pakai helper yang benar
            var finalTotal = Math.max(0, t - disc);
            var c = getAngkaBersih('pay-cash'); 
            var el = document.getElementById('pay-change'); 
            var btn = document.getElementById('btn-confirm-pay'); 
            if(c >= finalTotal) { el.innerText = formatRp(c - finalTotal); el.className = 'text-lg font-black text-emerald-500'; btn.disabled = false; } 
            else { el.innerText = 'Kurang ' + formatRp(finalTotal - c); el.className = 'text-base font-black text-red-500'; btn.disabled = true; } 
        }

        // Fungsi asli processTransaction untuk Tunai dan Kasbon
        function processTransaction() {
            if(!state.currentShift) { closeModal('modal-payment'); return Swal.fire('Kasir Tutup', 'Silakan Buka Shift (Input Modal Awal) terlebih dahulu sebelum melakukan transaksi!', 'warning'); }
            try {
                var token = storageManager.get('pos_token_final'); var tJ = 0; var tB = 0; var itemDescArr = [];
                for(var i=0; i<state.cart.length; i++) { tJ += (state.cart[i].hargaJual * state.cart[i].qty); tB += (state.cart[i].hargaBeli * state.cart[i].qty); itemDescArr.push(state.cart[i].nama + '(' + state.cart[i].qty + ')'); }
                
                var disc = getAngkaBersih('cart-discount');
                var tFinal = Math.max(0, tJ - disc);
                var bayar = tFinal;
                if (state.paymentMethod === 'Tunai') {
                    bayar = getAngkaBersih('pay-cash');
                } else if (state.paymentMethod === 'Kasbon') {
                    bayar = getAngkaBersih('pay-kasbon-dp');
                }
                // QRIS manual: bayar penuh (tidak ada kembalian)
                else if (state.paymentMethod === 'QRIS') {
                    bayar = tFinal;
                }

                var custName = document.getElementById('pay-customer').value.trim() || '-';
                var custWA = document.getElementById('pay-wa').value.trim();
                
                // [WAJIB] Nama pelanggan untuk Kasbon DAN QRIS Manual GoPay
                if ((state.paymentMethod === 'Kasbon' || state.paymentMethod === 'QRIS') && custName === '-') {
                    return Swal.fire(
                        'Data Kurang',
                        'Untuk pembayaran ' + state.paymentMethod + ', Nama Pelanggan WAJIB diisi agar tercatat di rekonsiliasi QRIS GoPay!',
                        'warning'
                    );
                }

                // [FIX] Validasi DP tidak melebihi total
                if(state.paymentMethod === 'Kasbon' && bayar > tFinal) {
                    return Swal.fire('DP Terlalu Besar', 'Uang muka (' + formatRp(bayar) + ') tidak boleh melebihi total tagihan (' + formatRp(tFinal) + ').', 'warning');
                }

                var btnConfirm = document.getElementById('btn-confirm-pay');
                btnConfirm.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Memproses...'; btnConfirm.disabled = true;

                var txData = { id: 'TRX' + new Date().getTime(), itemDesc: itemDescArr.join(', '), total: tFinal, modal: tB, laba: tFinal - tB, metode: state.paymentMethod, bayar: bayar, kembali: bayar > tFinal ? bayar - tFinal : 0, wa: custWA, diskon: disc, pelanggan: custName };
                var cartPayload = [];
                for(var j=0; j<state.cart.length; j++) {
                    var cItem = state.cart[j];
                    cartPayload.push({ id: cItem.id, nama: cItem.nama, qty: cItem.qty, hargaJual: cItem.hargaJual });
                }
                
                var currentTx = { id: txData.id, item: txData.itemDesc, total: txData.total, modal: txData.modal, laba: txData.laba, metode: txData.metode, bayar: txData.bayar, kembali: txData.kembali, wa: txData.wa, diskon: disc, pelanggan: custName, tanggal: new Date().getTime(), kasir: state.user.nama, status: (state.paymentMethod === 'Kasbon' ? 'HUTANG' : 'SUKSES'), cartJson: JSON.stringify(cartPayload), pdfLink: '' }; 
                state.transactions.unshift(currentTx);
                
                closeModal('modal-payment'); clearCart(); document.getElementById('pay-customer').value=''; document.getElementById('pay-wa').value=''; renderPosProducts(); renderInventory(); if(isMobileCartOpen) toggleMobileCart(); generateReceipt(currentTx, cartPayload);

                // [FIX] Auto-focus pos-search setelah transaksi (scanner siap scan berikutnya)
                setTimeout(function() {
                    var s = document.getElementById('pos-search');
                    if (s) { s.value = ''; s.focus(); }
                }, 400);
                
                // [FIX] Sesudah: pindahkan reduce stok ke sini
                google.script.run.withSuccessHandler(function(r) { 
                    if (!handleApiResponse(r, "Gagal Simpan ke Sheet: ")) {
                        // [FIX #9] Server menolak (mis. stok server habis) →
                        // hapus phantom dari state lokal supaya Riwayat & Dashboard
                        // tidak menampilkan transaksi yang tidak ada di jurnal.
                        var _phIdx = state.transactions.findIndex(function(t) { return String(t.id) === String(txData.id); });
                        if (_phIdx > -1) state.transactions.splice(_phIdx, 1);
                        renderReports();
                        renderDashboard();
                        renderPiutang();
                        return;
                    }

                    if (r.id && String(r.id) !== String(currentTx.id)) {
                        var oldId = currentTx.id;
                        currentTx.id = r.id;
                        var txIdx2 = state.transactions.findIndex(function(t) { return String(t.id) === String(oldId); });
                        if (txIdx2 > -1) state.transactions[txIdx2].id = r.id;
                        // Update struk yang sedang ditampilkan
                        var strukArea = document.getElementById('print-struk-area');
                        if (strukArea) strukArea.innerHTML = strukArea.innerHTML.split(oldId).join(r.id);
                        console.log('[processTransaction] Server ID:', oldId, '→', r.id);
                    }
                    
                    // [FIX] Stok dikurangi setelah server konfirmasi
                    for(var sk=0; sk<cartPayload.length; sk++) {
                        var cS = cartPayload[sk];
                        var pIdx = state.products.findIndex(function(x) { return String(x.id).trim() === String(cS.id).trim(); });
                        if(pIdx > -1) state.products[pIdx].stok = Math.max(0, state.products[pIdx].stok - cS.qty);
                    }
                    renderPosProducts(); 
                    renderInventory();
                    
                    var txIdx = state.transactions.findIndex(function(t) { return String(t.id) === String(currentTx.id); }); 
                    if(txIdx > -1) { state.transactions[txIdx].pdfLink = r.pdfLink; renderReports(); renderLabaRugi(); renderArusKas(); } 
                    
                    manualSync(true);
                }).withFailureHandler(function(err) {
                    state.offlineQueue.push({ txData: txData, cartPayload: cartPayload });
                    storageManager.set('pos_offline_tx', JSON.stringify(state.offlineQueue));
                    showToast('Tersimpan Offline (Menunggu Koneksi)', 'error');
                    updateOfflineBadge();
                }).saveTransaction(token, txData, cartPayload);
            } catch (err) { Swal.fire("Error Browser", err.message, "error"); }
        }

        function generateReceipt(tx, cartData) {
            var toko = escapeHtml(state.setup['Nama Toko'] || 'POS Pro'); var alamat = escapeHtml(state.setup['Alamat'] || ''); var dateStr = escapeHtml(new Date(tx.tanggal).toLocaleString('id-ID')); var txId = escapeHtml(tx.id);
            var html = '<div style="text-align:center; font-weight:bold; font-size:12px; margin-bottom: 2px;">' + toko + '</div><div style="text-align:center; font-size:10px; margin-bottom: 5px;">' + alamat + '</div><div class="border-dashed mb-1 mt-1"></div><div style="font-size:10px;">ID: ' + txId + '<br>Tgl: ' + dateStr + '<br>Ksr: ' + escapeHtml(tx.kasir) + '<br>Plg: ' + escapeHtml(tx.pelanggan) + '</div><div class="border-dashed mb-1 mt-1"></div>';
            var sub = 0;
            for(var i=0; i<cartData.length; i++) { var item = cartData[i]; sub += item.qty*item.hargaJual; html += '<div style="margin-bottom: 2px; font-size:10px; font-weight:bold;">' + escapeHtml(item.nama) + '</div><div class="flex justify-between mb-1" style="font-size:10px;"><span>' + item.qty + ' x ' + item.hargaJual.toLocaleString('id-ID') + '</span><span>' + (item.qty * item.hargaJual).toLocaleString('id-ID') + '</span></div>'; }
            // [NEW] Hint scroll kalau item banyak
            if(cartData.length > 8) {
                html += '<div style="text-align:center; font-size:9px; color:#94a3b8; padding:4px 0; font-style:italic;">' +
                        '↓ ' + (cartData.length - 8) + ' item lainnya — scroll untuk lihat ↓' +
                        '</div>';
            }

            html += '<div class="border-dashed mb-1 mt-1"></div>';
            if(tx.diskon > 0) html += '<div class="flex justify-between" style="font-size:10px;"><span>Subtotal</span><span>' + formatRp(sub) + '</span></div><div class="flex justify-between font-bold" style="font-size:10px;"><span>Diskon</span><span>-' + formatRp(tx.diskon) + '</span></div>';
            html += '<div class="flex justify-between font-bold mt-1 pt-1 border-t border-black" style="font-size:10px;"><span>TOTAL</span><span>' + formatRp(tx.total) + '</span></div>';
            if(tx.metode === 'Kasbon') {
                html += '<div class="flex justify-between" style="font-size:10px;"><span>DP Dibayar</span><span>' + formatRp(tx.bayar) + '</span></div>';
                html += '<div class="flex justify-between font-bold" style="font-size:10px;"><span>Sisa Hutang</span><span>' + formatRp(tx.total - tx.bayar) + '</span></div>';
            } else {
                html += '<div class="flex justify-between" style="font-size:10px;"><span>Bayar (' + escapeHtml(tx.metode) + ')</span><span>' + formatRp(tx.bayar) + '</span></div>';
                html += '<div class="flex justify-between" style="font-size:10px;"><span>Kembali</span><span>' + formatRp(tx.kembali) + '</span></div>';
            }
            if(tx.status === 'HUTANG') html += '<div class="text-center mt-3 p-1 border border-black font-bold" style="font-size:10px;">BELUM LUNAS (KASBON)</div>';
            html += '<div class="text-center mt-4 mb-2" style="font-size:10px;">Terima Kasih Atas Kunjungan Anda</div>';
            
            var strukArea = document.getElementById('print-struk-area'); strukArea.innerHTML = html; strukArea.classList.remove('hidden'); 
            openModal('modal-receipt');
        }

        // Fungsi untuk mengubah kriteria sorting saat header diklik
        function sortInventory(col) {
            if (invSortCol === col) {
                invSortAsc = !invSortAsc; // Balikkan arah jika kolom yang sama diklik
            } else {
                invSortCol = col;
                invSortAsc = true; // Default A-Z jika kolom baru
            }
            invCurrentPage = 1; // Kembalikan ke halaman pertama setiap kali disortir
            renderInventory();
        }
		
		    // --- INVENTORY PAGINATION ---
        function renderInventory() { 
            var tbody = document.getElementById('inv-tbody'); if(!tbody) return;
            var searchVal = document.getElementById('inv-search').value.toLowerCase(); 
            invFilteredData = []; var totalAset = 0; var totalItem = 0;
            
            for(var i=0; i<state.products.length; i++) {
                var p = state.products[i]; 
                if(p.stok > 0) { totalAset += (p.stok * p.hargaBeli); totalItem += p.stok; }
                if(!String(p.nama).toLowerCase().includes(searchVal) && !String(p.id).toLowerCase().includes(searchVal)) continue; 
                invFilteredData.push(p);
            }
            // Logika Sorting Dinamis
            invFilteredData.sort(function(a, b) {
                var valA = a[invSortCol];
                var valB = b[invSortCol];
                
                var comparison = 0;
                // Jika tipe datanya angka (HPP, Jual, Stok), gunakan pengurangan
                if (typeof valA === 'number' && typeof valB === 'number') {
                    comparison = valA - valB;
                } else {
                    // Jika teks atau boolean, gunakan localeCompare
                    comparison = String(valA).localeCompare(String(valB));
                }
                
                return invSortAsc ? comparison : -comparison; // Balikkan nilai jika Z-A
            });

            // Update UI Icon Sort (Panah Atas / Panah Bawah / Strip)
            var cols = ['id', 'nama', 'kategori', 'hargaBeli', 'hargaJual', 'stok', 'jualOnline'];
            cols.forEach(function(c) {
                var icon = document.getElementById('sort-icon-' + c);
                if (icon) {
                    icon.className = 'fas ml-1 text-[10px] transition-colors ' + 
                        (invSortCol === c ? (invSortAsc ? 'fa-sort-up text-blue-600' : 'fa-sort-down text-blue-600') : 'fa-sort text-slate-300');
                }
            });
			
            document.getElementById('inv-total-aset').innerText = formatRp(totalAset); 
            document.getElementById('inv-total-item').innerText = totalItem;

            // [NEW] Update badge jumlah item & low stock counter
            // [FIX] Tampilkan "X dari Y" saat ada filter aktif, "Y item" saat tanpa filter
            var badgeCountEl = document.getElementById('inv-count-badge');
            if (badgeCountEl) {
                var isFiltered = (String(searchVal || '').trim() !== '');
                if (isFiltered) {
                    badgeCountEl.innerText = invFilteredData.length + ' dari ' + state.products.length + ' item';
                    badgeCountEl.className = 'text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full hidden sm:inline';
                } else {
                    badgeCountEl.innerText = state.products.length + ' item';
                    badgeCountEl.className = 'text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full hidden sm:inline';
                }
            }

            var lowStockCount = state.products.filter(function(p) { return p.stok > 0 && p.stok <= 5; }).length;
            var zeroStockCount = state.products.filter(function(p) { return p.stok === 0; }).length;
            var lowStockEl = document.getElementById('inv-total-low');
            if (lowStockEl) {
                var totalLow = lowStockCount + zeroStockCount;
                lowStockEl.innerText = totalLow + ' item';
                lowStockEl.className = totalLow > 0 
                    ? 'text-sm md:text-base font-black text-red-600 leading-none mt-0.5 truncate' 
                    : 'text-sm md:text-base font-black text-emerald-600 leading-none mt-0.5 truncate';
            }

            var maxPage = Math.ceil(invFilteredData.length / invItemsPerPage) || 1;
            if (invCurrentPage > maxPage) invCurrentPage = maxPage;
            if (invCurrentPage < 1) invCurrentPage = 1;
            
            var startIndex = (invCurrentPage - 1) * invItemsPerPage;
            var paginatedItems = invFilteredData.slice(startIndex, startIndex + invItemsPerPage);

            var html = '';
            if(paginatedItems.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center p-8 text-slate-400 font-bold">Barang tidak ditemukan.</td></tr>';
            } else {
                for(var j=0; j<paginatedItems.length; j++) {
                    var p2 = paginatedItems[j];
                    var safeId = escapeHtml(p2.id);
                    var stokClass = p2.stok <= 5 ? 'text-red-500 bg-red-50 px-2 py-0.5 rounded' : 'text-slate-700';

                    // --- TAMBAHAN KALKULASI MARGIN ---
                    var marginPersen = 0;
                    if (p2.hargaJual > 0) {
                        marginPersen = ((p2.hargaJual - p2.hargaBeli) / p2.hargaJual) * 100;
                    }
                    var marginWarna = marginPersen > 40 ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : (marginPersen > 20 ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-orange-600 bg-orange-50 border-orange-200');
                    var marginBadge = '<div class="text-[9px] font-black ' + marginWarna + ' border px-1.5 py-0.5 rounded mt-1 inline-block">Mgn: ' + marginPersen.toFixed(1) + '%</div>';
                    // ----------------------------------
                    
                    // Render Image
                    var imgSrc = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(p2.nama) + '&background=e2e8f0&color=64748b&bold=true&size=150';
                    if (p2.image && typeof p2.image === 'string') {
                        if (p2.image.includes('drive.google.com')) { 
                            var idMatch = p2.image.match(/id=([a-zA-Z0-9_-]+)/) || p2.image.match(/d\/([a-zA-Z0-9_-]+)/); 
                            if (idMatch && idMatch[1]) imgSrc = 'https://drive.google.com/thumbnail?id=' + idMatch[1] + '&sz=w400'; else imgSrc = p2.image; 
                        } else { imgSrc = p2.image; }
                    }

                    // Render Badge Online
                    var onlBadge = p2.jualOnline ? '<span class="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[9px] border border-emerald-100"><i class="fas fa-check mr-1"></i>Ya</span>' : '<span class="text-slate-400 bg-slate-100 px-2 py-0.5 rounded text-[9px] border border-slate-200"><i class="fas fa-times mr-1"></i>Tdk</span>';

                    // PERBAIKAN: Menggabungkan Harga Jual dan Margin ke dalam 1 kolom <td> yang sama
                    html += '<tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-50 last:border-0">' +
                            '<td class="p-3 font-mono text-[10px] text-slate-400 whitespace-nowrap">' + safeId + '</td>' +
                            '<td class="p-3 whitespace-nowrap flex items-center gap-3"><img src="'+imgSrc+'" class="w-8 h-8 rounded border border-slate-200 object-cover bg-white"><span class="font-extrabold text-slate-800 text-xs">' + escapeHtml(p2.nama) + '</span></td>' +
                            '<td class="p-3 text-slate-500 font-medium text-[10px] hidden md:table-cell whitespace-nowrap">' + escapeHtml(p2.kategori) + '</td>' +
                            '<td class="p-3 admin-only font-bold text-slate-400 hidden sm:table-cell whitespace-nowrap text-[11px]">' + formatRp(p2.hargaBeli) + '</td>' +
                            '<td class="p-3 text-blue-600 font-black whitespace-nowrap text-xs leading-tight">' + formatRp(p2.hargaJual) + '<br>' + marginBadge + '</td>' +
                            '<td class="p-3 font-black text-center whitespace-nowrap text-xs"><span class="' + stokClass + '">' + p2.stok + '</span></td>' +
                            '<td class="p-3 font-bold text-center whitespace-nowrap">' + onlBadge + '</td>' +
                            '<td class="p-3 text-center no-print whitespace-nowrap">' +
                            buildInventoryActions(p2.id, p2.nama, p2.hargaJual) +
                            '</td></tr>';
				}
                tbody.innerHTML = html;
            }
            document.getElementById('inv-page-info').innerText = 'Hal ' + invCurrentPage + ' dari ' + maxPage;
        }
        function invNextPage() { var maxPage = Math.ceil(invFilteredData.length / invItemsPerPage); if (invCurrentPage < maxPage) { invCurrentPage++; renderInventory(); } }
        function invPrevPage() { if (invCurrentPage > 1) { invCurrentPage--; renderInventory(); } }

        function compressImage(event) {
            var file = event.target.files[0]; if (!file) return;
            var reader = new FileReader();
            reader.onload = function(e) {
                var img = new Image();
                img.onload = function() {
                    var canvas = document.createElement('canvas'); var max_size = 300; 
                    var width = img.width; var height = img.height;
                    if (width > height) { if (width > max_size) { height *= max_size / width; width = max_size; } } 
                    else { if (height > max_size) { width *= max_size / height; height = max_size; } }
                    canvas.width = width; canvas.height = height;
                    var ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
                    var dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                    document.getElementById('mp-image-base64').value = dataUrl;
                    document.getElementById('mp-img-preview').src = dataUrl;
                }
                img.src = e.target.result;
            }
            reader.readAsDataURL(file);
        }

        function openProductModal(id) { 
            if(state.user.role !== 'Admin') return showToast('Hanya Admin!', 'error'); 
            document.getElementById('form-product').reset(); document.getElementById('mp-image').value = '';
            
            var histSection = document.getElementById('mp-history-section');

            if(id) { 
                var p = state.products.find(function(x) { return String(x.id) === String(id); }); 
                if(p) { 
                    document.getElementById('mp-title').innerText = 'Edit Barang'; 
                    document.getElementById('mp-id').value = p.id; document.getElementById('mp-id').readOnly = true; 
                    document.getElementById('mp-jual-online').checked = p.jualOnline === true;
                    document.getElementById('mp-nama').value = p.nama; document.getElementById('mp-kategori').value = p.kategori; 
                    document.getElementById('mp-beli').value = Number(p.hargaBeli || 0).toLocaleString('id-ID'); 
                    document.getElementById('mp-jual').value = Number(p.hargaJual || 0).toLocaleString('id-ID'); 
                    document.getElementById('mp-stok').value = p.stok;  
                    document.getElementById('mp-image-base64').value = p.image || ''; 
                    
                    var prevSrc = p.image || 'https://placehold.co/150x150/e2e8f0/64748b?text=Img';
                    if(p.image && typeof p.image === 'string' && p.image.includes('drive.google.com')) {
                        var idMatch = p.image.match(/id=([a-zA-Z0-9_-]+)/) || p.image.match(/d\/([a-zA-Z0-9_-]+)/);
                        if(idMatch && idMatch[1]) prevSrc = 'https://drive.google.com/thumbnail?id=' + idMatch[1] + '&sz=w400';
                    }
                    document.getElementById('mp-img-preview').src = prevSrc; 

                    // Tampilkan Riwayat Stok
                    if(histSection) {
                        histSection.classList.remove('hidden');
                        renderProductHistory(p.id);
                    }
                } 
            } else { 
                document.getElementById('mp-title').innerText = 'Barang Baru'; document.getElementById('mp-id').value = 'BRG' + new Date().getTime(); document.getElementById('mp-id').readOnly = false; 
                document.getElementById('mp-jual-online').checked = true;
                document.getElementById('mp-image-base64').value = ''; document.getElementById('mp-img-preview').src = 'https://placehold.co/150x150/e2e8f0/64748b?text=Img'; 
                
                // Sembunyikan Riwayat Stok karena barang baru belum ada riwayat
                if(histSection) histSection.classList.add('hidden');
            } 
            openModal('modal-product'); 
        }

        function renderProductHistory(productId) {
            var history = [];

            // 1. Ekstrak dari Riwayat Penjualan & Retur Jual
            for(var i=0; i<state.transactions.length; i++) {
                var tx = state.transactions[i];
                if(tx.status !== 'SUKSES' && tx.status !== 'HUTANG' && tx.status !== 'RETUR') continue;
                
                var cartItems = [];
                try { cartItems = JSON.parse(tx.cartJson); } catch(e){}
                
                var itemSold = cartItems.find(function(itm) { return String(itm.id) === String(productId); });
                if(itemSold) {
                    var isRetur = tx.status === 'RETUR';
                    history.push({
                        waktu: tx.tanggal,
                        jenis: isRetur ? 'Retur Penjualan' : 'Terjual (Kasir)',
                        qty: isRetur ? '+' + itemSold.qty : '-' + itemSold.qty,
                        color: isRetur ? 'text-blue-600 bg-blue-50' : 'text-red-500 bg-red-50'
                    });
                }
            }

            // 2. Ekstrak dari Riwayat Pembelian / Restock
            for(var p=0; p<state.purchases.length; p++) {
                var pur = state.purchases[p];
                if(String(pur.idProduk) === String(productId)) {
                    history.push({
                        waktu: pur.tanggal,
                        jenis: 'Restock Masuk',
                        qty: '+' + pur.qty,
                        color: 'text-emerald-600 bg-emerald-50'
                    });
                }
            }

            // Urutkan dari yang terbaru (Descending)
            history.sort(function(a,b) { return b.waktu - a.waktu; });

            var tbody = document.getElementById('mp-history-tbody');
            if(history.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="text-center p-6 text-slate-400 font-bold">Belum ada riwayat mutasi stok.</td></tr>';
                return;
            }

            var html = '';
            var batasLimit = Math.min(history.length, 50); // Maksimal tampilkan 50 mutasi terakhir agar ringan
            for(var j=0; j<batasLimit; j++) { 
                var h = history[j];
                var dateStr = new Date(h.waktu).toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit'});
                html += '<tr class="hover:bg-white transition-colors">' +
                        '<td class="p-2.5 whitespace-nowrap">' + dateStr + '</td>' +
                        '<td class="p-2.5 truncate max-w-[120px]">' + h.jenis + '</td>' +
                        '<td class="p-2.5 text-center"><span class="px-2 py-1 rounded font-black ' + h.color + '">' + h.qty + '</span></td>' +
                        '</tr>';
            }
            tbody.innerHTML = html;
        }
		
		function saveProductForm(e) { 
            e.preventDefault(); 
            // AMBIL NILAI DARI FORM
            var hargaBeli = getAngkaBersih('mp-beli');
            var hargaJual = getAngkaBersih('mp-jual');

            // --- TAMBAHKAN VALIDASI DI SINI ---
            if (hargaBeli >= hargaJual) {
                Swal.fire({
                    icon: 'error',
                    title: 'Validasi Gagal',
                    text: 'Harga Modal (Rp ' + formatRp(hargaBeli) + ') tidak boleh lebih besar atau sama dengan Harga Jual (Rp ' + formatRp(hargaJual) + ')!'
                });
                return; // Hentikan proses simpan
            }
            // ----------------------------------

            var b = document.getElementById('btn-save-prod'); 
            b.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...'; 
            b.disabled = true; 
            var isBaru = !document.getElementById('mp-id').readOnly;
            
            var d = { 
                id: document.getElementById('mp-id').value, 
                isNew: isBaru, 
                nama: document.getElementById('mp-nama').value, 
                kategori: document.getElementById('mp-kategori').value, 
                hargaBeli: hargaBeli, // gunakan variabel yang sudah diambil
                hargaJual: hargaJual, // gunakan variabel yang sudah diambil
                stok: parseInt(document.getElementById('mp-stok').value)||0, 
                image: document.getElementById('mp-image-base64').value,
                jualOnline: document.getElementById('mp-jual-online').checked
            }; 
            
            google.script.run.withSuccessHandler(function(r) { 
                b.innerText = 'Simpan'; b.disabled = false; 
                if (!handleApiResponse(r, "Gagal simpan produk: ")) return;

                // ── Success path ──
                if(d.isNew) { d.id = r.id; state.products.push(d); }  
                else { var idx = state.products.findIndex(function(p) { return String(p.id) === String(d.id); }); state.products[idx] = d; } 
                closeModal('modal-product'); 
                renderInventory(); 
                renderPosProducts(); 
                updateCategories(); 
                renderDashboard();
                manualSync(true);
                showToast('Tersimpan!'); 
            }).saveProduct(storageManager.get('pos_token_final'), d);  
        }

        // [NEW] Hapus produk dengan konfirmasi double
        function deleteProductAction(id, nama) {
          if (state.user.role !== 'Admin') return showToast('Hanya Admin!', 'error');

          Swal.fire({
            title: 'Hapus Produk?',
            html: 'Produk <b>' + escapeHtml(nama) + '</b> akan dihapus dari daftar Inventori.<br><br>' +
                  '<span class="text-xs text-slate-500">Data transaksi lama yang mereferensikan produk ini <b>tidak akan rusak</b>.</span>',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#94a3b8',
            confirmButtonText: '<i class="fas fa-trash mr-1"></i> Ya, Hapus!',
            cancelButtonText: 'Batal'
          }).then(function(result) {
            if (!result.isConfirmed) return;

            Swal.fire({ title: 'Memproses...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });

            google.script.run.withSuccessHandler(function(res) {
                if (!handleApiResponse(res, "Gagal hapus produk: ")) return;

                state.products = state.products.filter(function(p) { return String(p.id) !== String(id); });
                renderInventory(); 
                renderPosProducts(); 
                updateCategories();
                renderDashboard();
                manualSync(true);
                Swal.fire('Terhapus!', 'Produk berhasil dihapus dari daftar.', 'success');
            }).withFailureHandler(function(err) {
              Swal.fire('Koneksi Gagal', 'Tidak bisa terhubung ke server: ' + (err && err.message ? err.message : 'unknown'), 'error');
            }).deleteProduct(storageManager.get('pos_token_final'), id);
          });
        }
        
		    // --- BULK UPLOAD CSV ---
        // Helper: Parse nilai Rupiah dari string manapun (handle "Rp 2.000Mgn: 25.0%")
        function parseRupiahCSV(val) {
            if (val == null) return 0;
            var s = String(val).replace(/["']/g, '').trim();
            var m = s.match(/(\d[\d.]*)/); // Ambil grup angka pertama
            if (!m) return 0;
            return parseInt(m[1].replace(/\./g, ''), 10) || 0;
        }

        // 1. UPDATE FUNGSI INI AGAR MENDUKUNG PEMISAH ; ATAU ,
        function parseCSVLine(line, delimiter) {
            delimiter = delimiter || ',';
            var result = [], cur = '', inQuote = false;
            for (var i = 0; i < line.length; i++) {
                var ch = line[i];
                if (ch === '"') {
                    if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
                    else { inQuote = !inQuote; }
                } else if (ch === delimiter && !inQuote) {
                    result.push(cur); cur = '';
                } else {
                    cur += ch;
                }
            }
            result.push(cur);
            return result;
        }

        // 2. UPDATE FUNGSI UPLOAD AGAR OTOMATIS MELEWATI BARIS JUDUL
        function handleBulkUpload(event) {
            var file = event.target.files[0];
            if (!file) return;
            if (state.user.role !== 'Admin') return showToast("Hanya Admin yang dapat Upload Masal!", "error");

            var reader = new FileReader();
            reader.onload = function(e) {
                var text = e.target.result;
                
                // Deteksi otomatis pemisah
                var firstLine = text.split(/\r\n|\n/)[0] || '';
                var delimiter = ',';
                if (firstLine.includes(';')) delimiter = ';';
                else if (firstLine.includes('\t')) delimiter = '\t';

                var lines = text.split(/\r\n|\n/);
                var dataToUpload = [];
                var startRow = 0;

                // Cari baris header
                for (var h = 0; h < lines.length; h++) {
                    var upper = lines[h].toUpperCase();
                    if (upper.includes('ID') && upper.includes('NAMA')) {
                        startRow = h + 1;
                        break;
                    }
                }

                // Fungsi Helper untuk memperbaiki notasi ilmiah (8,99E+12 menjadi 899...)
                function fixScientificNotation(val) {
                    if (!val) return "";
                    val = String(val).replace(/["']/g, '').trim();
                    // Jika ada 'E+' dan koma/titik, itu format notasi ilmiah
                    if (/E\+/i.test(val)) {
                        // Ubah koma ke titik untuk perhitungan JS
                        var num = parseFloat(val.replace(',', '.'));
                        if (!isNaN(num)) {
                            // toFixed(0) akan mengembalikan format angka utuh
                            return num.toFixed(0); 
                        }
                    }
                    return val;
                }

                for (var i = startRow; i < lines.length; i++) {
                    if (!lines[i].trim()) continue; 
                    
                    var cols = parseCSVLine(lines[i], delimiter);
                    
                    if (cols.length >= 6) {
                        // Perbaiki ID jika terlanjur jadi notasi ilmiah
                        var id       = fixScientificNotation(cols[0]);
                        // Hapus karakter aneh seperti ="123"
                        id = id.replace(/=|\"/g, '').trim();

                        var nama     = cols[1].replace(/["']/g, '').trim();
                        var kategori = cols[2].replace(/["']/g, '').trim();
                        var hargaBeli = parseRupiahCSV(cols[3]);
                        var hargaJual = parseRupiahCSV(cols[4]);
                        var stok     = parseInt(String(cols[5] || '').replace(/\D/g, ''), 10) || 0;

                        var jualOnline = true;
                        if (cols[6] !== undefined) {
                            var s = String(cols[6]).replace(/["']/g, '').trim().toLowerCase();
                            jualOnline = (s === 'ya' || s === 'yes' || s === 'true' || s === '1');
                        }

                        if (id && nama && id.toUpperCase() !== 'ID') {
                            dataToUpload.push({
                                id: id, nama: nama, kategori: kategori,
                                hargaBeli: hargaBeli, hargaJual: hargaJual,
                                stok: stok, jualOnline: jualOnline
                            });
                        }
                    }
                }

                if (dataToUpload.length > 0) {
                    Swal.fire({
                        title: 'Upload Masal',
                        width: 520,
                        html:
                            '<div class="text-left">' +
                                '<p class="text-sm text-slate-600 mb-3">Ditemukan <b>' + dataToUpload.length + '</b> data valid.</p>' +
                                '<label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Sumber Stok Awal (untuk jurnal)</label>' +
                                '<select id="swal-csv-source" class="w-full p-2.5 border border-slate-200 rounded-xl text-sm font-bold bg-slate-50 outline-none focus:border-blue-500 cursor-pointer">' +
                                    '<option value="MODAL">💰 Setoran Modal Pemilik (D 113 / K 311)</option>' +
                                    '<option value="KAS">💵 Beli Tunai dari Kas (D 113 / K 111)</option>' +
                                    '<option value="BANK">🏦 Beli Transfer dari Bank (D 113 / K 115)</option>' +
                                    '<option value="HUTANG">📝 Beli Kredit dari Supplier (D 113 / K 211)</option>' +
                                '</select>' +
                            '</div>',
                        icon: 'info',
                        showCancelButton: true,
                        confirmButtonColor: '#10b981',
                        cancelButtonColor: '#94a3b8',
                        confirmButtonText: 'Ya, Upload Sekarang',
                        cancelButtonText: 'Batal',
                        preConfirm: function() {
                            return document.getElementById('swal-csv-source').value;
                        }
                    }).then((result) => {
                        if (result.isConfirmed) {
                            var stokSource = result.value || 'MODAL';
                            Swal.fire({ title: 'Memproses...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
                            google.script.run.withSuccessHandler(function(res) {
                                if (res.success) {
                                    Swal.fire('Sukses!', "Upload " + dataToUpload.length + " item berhasil!", 'success');
                                    manualSyncAllViews();
                                } else {
                                    Swal.fire('Gagal!', res.error, 'error');
                                }
                            }).withFailureHandler(function() {
                                Swal.fire('Error', "Gagal koneksi saat upload.", "error");
                            }).saveBulkProducts(storageManager.get('pos_token_final'), dataToUpload, stokSource);
                        } else {
                            event.target.value = '';
                        }
                    });
                } else {
                    Swal.fire('Format Salah', 'File tidak memiliki data yang sesuai.', 'error');
                    event.target.value = '';
                }
            };
            reader.readAsText(file);
        }

        // [NEW] Fungsi sync yang merender SEMUA view (bukan cuma yang aktif)
        function manualSyncAllViews() {
            var token = storageManager.get('pos_token_final');
            if (!token) return;
            var dot = document.getElementById('sync-dot');
            if (dot) dot.className = 'w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-amber-400';
            var txt = document.getElementById('sync-text');
            if (txt) txt.innerText = 'Sync...';

            google.script.run.withSuccessHandler(function(res) {
                if (!res) {
                    if (dot) dot.className = 'w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-red-500';
                    if (txt) txt.innerText = 'No Response';
                    return;
                }
                if (res.error === "UNAUTHORIZED") return forceLogout();

                // [FIX #14] Kalau server return success:false, indikator HARUS merah
                if (!res.success) {
                    if (dot) dot.className = 'w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-red-500';
                    if (txt) txt.innerText = 'Error';
                    return;
                }

                state.products      = res.products;
                state.transactions  = res.transactions;
                state.purchases     = res.purchases;
                state.logs          = res.logs || [];
                state.currentShift  = res.currentShift;
                state.beban         = res.beban || [];
                state.jurnal        = res.jurnal || [];
                state.layananDigital = res.layananDigital || [];
                if (res.saldoRingkas) state.saldoRingkas = res.saldoRingkas;
                state.bku           = res.bku || [];

                try { updateCategories(); } catch(e) {}
                try { renderPosProducts(); } catch(e) {}
                try { renderInventory(); } catch(e) {}
                try { renderAllReports(); } catch(e) {}
                try { renderDashboard(); } catch(e) {}
                try { renderLogs(); } catch(e) {}
                try { renderLayananView(); } catch(e) {}
                try { renderBku(); } catch(e) {}
                try { updateSidebarBadges(); } catch(e) {}

                if (dot) dot.className = 'w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]';
                if (txt) txt.innerText = 'Terhubung';
            }).withFailureHandler(function() {
                if (dot) dot.className = 'w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-red-500';
                if (txt) txt.innerText = 'Offline';
            }).getInitialData(token);
        }

        // --- REPORTS & ACCOUNTING ---
        // [PATCH U1] Group switcher
        function switchReportGroup(groupId) {
            var groups = ['ops', 'layanan', 'akun'];
            for (var i = 0; i < groups.length; i++) {
                var subEl = document.getElementById('grp-sub-' + groups[i]);
                var btnEl = document.getElementById('grp-btn-' + groups[i]);
                if (!subEl || !btnEl) continue;
                if (groups[i] === groupId) {
                    subEl.classList.remove('hidden');
                    subEl.classList.add('flex');
                    btnEl.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
                    btnEl.classList.remove('text-slate-600');
                    // auto pilih tab pertama
                    var firstTab = subEl.querySelector('.rep-tab-btn');
                    if (firstTab) firstTab.click();
                } else {
                    subEl.classList.add('hidden');
                    subEl.classList.remove('flex');
                    btnEl.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
                    btnEl.classList.add('text-slate-600');
                }
            }
            renderReportSummary();
        }

        // Ganti switchRepTab() lama dengan versi ini
        function switchRepTab(tabId) {
            var sections = document.querySelectorAll('.rep-section');
            for (var i = 0; i < sections.length; i++) sections[i].classList.add('hidden');

            var tabs = document.querySelectorAll('.rep-tab-btn');
            for (var j = 0; j < tabs.length; j++) {
                tabs[j].classList.remove('text-blue-600', 'bg-blue-50', 'border-blue-100');
                tabs[j].classList.add('text-slate-500', 'border-transparent');
            }

            var targetSection = document.getElementById('rep-' + tabId);
            if (targetSection) targetSection.classList.remove('hidden');
            var selectedTab = document.getElementById('tab-rep-' + tabId);
            if (selectedTab) {
                selectedTab.classList.remove('text-slate-500', 'border-transparent');
                selectedTab.classList.add('text-blue-600', 'bg-blue-50', 'border-blue-100');
            }

            // Auto-expand grup yang sesuai
            var opsTabs = ['riwayat', 'piutang', 'hutang', 'produkterlaris'];
            var layananTabs = ['layanan', 'beban'];
            var akunTabs = ['jurnal', 'bukubesar', 'labarugi', 'aruskas', 'neraca'];
            var targetGroup = opsTabs.indexOf(tabId) > -1 ? 'ops' : (layananTabs.indexOf(tabId) > -1 ? 'layanan' : 'akun');
            var subEl = document.getElementById('grp-sub-' + targetGroup);
            if (subEl && subEl.classList.contains('hidden')) {
                // panggil switch tanpa .click() untuk hindari loop
                var groups = ['ops', 'layanan', 'akun'];
                for (var g = 0; g < groups.length; g++) {
                    var sEl = document.getElementById('grp-sub-' + groups[g]);
                    var bEl = document.getElementById('grp-btn-' + groups[g]);
                    if (!sEl || !bEl) continue;
                    if (groups[g] === targetGroup) {
                        sEl.classList.remove('hidden'); sEl.classList.add('flex');
                        bEl.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
                        bEl.classList.remove('text-slate-600');
                    } else {
                        sEl.classList.add('hidden'); sEl.classList.remove('flex');
                        bEl.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
                        bEl.classList.add('text-slate-600');
                    }
                }
            }

            if (tabId === 'riwayat') renderReports();
            if (tabId === 'produkterlaris') renderProdukTerlaris();
            if (tabId === 'beban') renderBebanList();
            if (tabId === 'labarugi') renderLabaRugi();
            if (tabId === 'aruskas') renderArusKas();
            if (tabId === 'neraca') renderNeraca();
            if (tabId === 'layanan') renderLayanan();
            if (tabId === 'jurnal') renderJurnal();
            if (tabId === 'bukubesar') renderBukuBesar();
            if (tabId === 'piutang') renderPiutang();
            if (tabId === 'hutang') renderHutang();

            renderReportSummary();
        }

        // ═══════════════════════════════════════════════════════════════
        // [PATCH v7.19] SINGLE SOURCE OF TRUTH — Unified Accounting Engine
        // Semua metric keuangan WAJIB baca dari sini. Jangan hitung manual lagi.
        // Alasan: state.transactions = event (bisa beda dgn jurnal saat ada
        // diskon/reversal/layanan). state.jurnal = truth akuntansi.
        // ═══════════════════════════════════════════════════════════════
        function computeFinancialMetrics(startTime, endTime) {
          var m = {
              // ── PERIODE (dalam rentang startTime..endTime) ──
              pendapatanBruto: 0,       // 411 + 413 + 414 + 415 + 421 + 422 + 423
              pendapatanBarang: 0,      // khusus 411 (untuk breakdown)
              pendapatanLayanan: 0,     // 421 + 422 + 423 (untuk breakdown)
              returPenjualan: 0,        // 412 (kontra)
              diskonPenjualan: 0,       // 412.1 (kontra)
              pendapatanNeto: 0,        // Bruto - Retur - Diskon
              hppBarang: 0,             // 511
              hppDigital: 0,            // 512.1
              hppTotal: 0,
              labaKotor: 0,
              bebanOperasional: 0,      // 5xx selain 511, 512.1
              pendapatanLain: 0,        // 413 + 414 + 415 (subset dari Bruto)
              labaBersih: 0,
              marginPct: 0,
              rincianPendapatan: {},    // {namaAkun: nilai} untuk Laba Rugi
              rincianBeban: {},         // {namaAkun: nilai} untuk Laba Rugi
              // ── SNAPSHOT (kumulatif s/d endTime — POSISI SALDO) ──
              kas: 0, bank: 0, transit: 0, deposit: 0,
              piutang: 0, persediaan: 0,
              hutang: 0, hutangPinjaman: 0
          };

          var jurnal = state.jurnal || [];
          for (var i = 0; i < jurnal.length; i++) {
              var j = jurnal[i];
              var kode = String(j.kodeAkun).trim();
              var d = Number(j.debit)  || 0;
              var k = Number(j.kredit) || 0;
              var tgl = j.tanggal;
			  var _sb = state._saldoByAccount || {};
				m.kas            = Number(_sb['111']) || 0;
				m.piutang        = Number(_sb['112']) || 0;
				m.persediaan     = Number(_sb['113']) || 0;
				m.bank           = Number(_sb['115']) || 0;
				m.transit        = Number(_sb['116']) || 0;
				m.deposit        = Number(_sb['117']) || 0;
				m.hutang         = Math.abs(Number(_sb['211']) || 0);
				m.hutangPinjaman = Math.abs(Number(_sb['212']) || 0);

              // ══════ PERIODE (hanya yang dalam rentang) ══════
              if (tgl < startTime || tgl > endTime) continue;

              var namaAkun = j.namaAkun || kode;

              // ── PENDAPATAN (akun 4xx saldo kredit normal) ──
              if (kode === '411' || kode === '413' || kode === '414' ||
                  kode === '415' || kode === '421' || kode === '422' ||
                  kode === '423') {
                  var nilaiPend = k - d;
                  m.pendapatanBruto += nilaiPend;
                  m.rincianPendapatan[namaAkun] = (m.rincianPendapatan[namaAkun] || 0) + nilaiPend;
                  if (kode === '411') {
                      m.pendapatanBarang += nilaiPend;
                  } else if (kode === '421' || kode === '422' || kode === '423') {
                      m.pendapatanLayanan += nilaiPend;
                  } else {
                      m.pendapatanLain += nilaiPend; // 413/414/415
                  }
              }
              // ── KONTRA PENDAPATAN (saldo debit normal) ──
              else if (kode === '412') {
                  m.returPenjualan += (d - k);
              }
              else if (kode === '412.1') {
                  m.diskonPenjualan += (d - k);
              }
              // ── HPP ──
              else if (kode === '511') {
                  m.hppBarang += (d - k);
              }
              else if (kode === '512.1') {
                  m.hppDigital += (d - k);
              }
              // ── BEBAN OPERASIONAL (5xx lain, saldo debit normal) ──
              else if (/^5/.test(kode)) {
                  var nilaiBeban = d - k;   // 519 bisa negatif saat overage → kontra-beban
                  m.bebanOperasional += nilaiBeban;
                  m.rincianBeban[namaAkun] = (m.rincianBeban[namaAkun] || 0) + nilaiBeban;
              }
          }

          // [PATCH #2] KALKULASI TURUNAN (Fixed Double-Count)
          //   - pendapatanNeto  = Penjualan Barang + Layanan Digital
          //                       - Retur - Diskon
          //                       (Pendapatan Lain 413/414/415 DIKELUARKAN dari sini)
          //   - labaBersih      = Laba Kotor + Pendapatan Lain - Beban Operasional
          //                       (Pendapatan Lain ditambahkan SETELAH Laba Kotor,
          //                        bukan di dalam Neto)
          // ══════════════════════════════════════════════════════════════
          m.pendapatanNeto  = m.pendapatanBarang + m.pendapatanLayanan
                          - m.returPenjualan - m.diskonPenjualan;
          m.hppTotal        = m.hppBarang + m.hppDigital;
          m.labaKotor       = m.pendapatanNeto - m.hppTotal;
          m.labaBersih      = m.labaKotor + m.pendapatanLain - m.bebanOperasional;
          m.marginPct       = m.pendapatanNeto > 0 ? (m.labaKotor / m.pendapatanNeto) * 100 : 0;

          return m;
        }

        // ═══════════════════════════════════════════════════════════════
        // [PATCH v7.19] Header Summary Bar — pakai Unified Engine
        // ═══════════════════════════════════════════════════════════════
        function renderReportSummary() {
          var elOmset = document.getElementById('rep-sum-omset');
          if (!elOmset) return;

          // ── Ambil rentang tanggal dari input yang AKTIF (tab-aware) ──
          var range = getActiveReportDateRange();
          var startTime = range.startTime;
          var endTime   = range.endTime;

          // [PATCH #4] Fallback Kasir
          var isAdminSum = !!(state.user && state.user.role === 'Admin');
          var m = isAdminSum
              ? computeFinancialMetrics(startTime, endTime)
              : computeMetricsFromTransactions(startTime, endTime);

          // ── Render ke header ──
          elOmset.innerText = formatRp(m.pendapatanNeto);          // Omset NET (setelah retur & diskon)

          var elLaba = document.getElementById('rep-sum-laba');
          if (elLaba) elLaba.innerText = formatRp(m.labaKotor);

          // Kas/Piutang/Hutang = SNAPSHOT (label sudah diberi "Saldo" di HTML)
          var elKas = document.getElementById('rep-sum-kas');
          if (elKas) elKas.innerText = formatRp(m.kas);

          var elPiu = document.getElementById('rep-sum-piutang');
          if (elPiu) elPiu.innerText = formatRp(m.piutang);

          var elHut = document.getElementById('rep-sum-hutang');
          if (elHut) elHut.innerText = formatRp(m.hutang);

          // ── Update tooltip untuk transparansi ──
          var rangeLabel = range.label || 'Periode';
          var barEl = document.getElementById('report-summary-bar');
          if (barEl) {
              barEl.title = 'Omset & Laba: ' + rangeLabel +
                          ' • Kas/Piutang/Hutang: saldo kumulatif s/d ' +
                          new Date(endTime).toLocaleDateString('id-ID');
          }
        }

        // ═══════════════════════════════════════════════════════════════
        // [PATCH v7.19] Helper: deteksi tab aktif → ambil rentang tanggal yg sesuai
        // ═══════════════════════════════════════════════════════════════
        function getActiveReportDateRange() {
          var activeTab = document.querySelector('.rep-tab-btn.text-blue-600');
          var tabId = activeTab ? activeTab.id.replace('tab-rep-', '') : 'riwayat';

          // Pemetaan tab → prefix input tanggal
          var prefixMap = {
              'riwayat':        'filter-rep',
              'labarugi':       'lr',
              'aruskas':        'ak',
              'jurnal':         'jur',
              'bukubesar':      'bb',
              'layanan':        'lay',
              'produkterlaris': 'pt',
              'piutang':        null,
              'hutang':         null,
              'beban':          null
          };

          var prefix = prefixMap[tabId];
          var startStr, endStr;

          if (prefix) {
              var sEl = document.getElementById(prefix + '-start');
              var eEl = document.getElementById(prefix + '-end');
              startStr = sEl ? sEl.value : '';
              endStr   = eEl ? eEl.value   : '';
          }

          // Fallback ke filter-rep kalau kosong
          if (!startStr || !endStr) {
              var sFallback = document.getElementById('filter-rep-start');
              var eFallback = document.getElementById('filter-rep-end');
              startStr = (sFallback && sFallback.value) ? sFallback.value : toLocalDateStr(new Date());
              endStr   = (eFallback && eFallback.value)   ? eFallback.value   : toLocalDateStr(new Date());
          }

          var startObj = parseLocalDate(startStr); startObj.setHours(0, 0, 0, 0);
          var endObj   = parseLocalDate(endStr);   endObj.setHours(23, 59, 59, 999);

          // Label human-readable
          var opts = { day: '2-digit', month: 'short', year: 'numeric' };
          var label = startObj.toDateString() === endObj.toDateString()
              ? startObj.toLocaleDateString('id-ID', opts)
              : startObj.toLocaleDateString('id-ID', opts) + ' s/d ' + endObj.toLocaleDateString('id-ID', opts);
          
          // [PATCH v7.19 #5] Auto-trigger lazy load jika rentang > 90 hari
          var umurHari = (Date.now() - startObj.getTime()) / (24 * 3600 * 1000);
          if (umurHari > 90 && state.user && state.user.role === 'Admin') {
              var rangeKey = toLocalDateStr(startObj) + '_' + toLocalDateStr(endObj);
              var sudahDimuat = state._loadedJurnalRanges && state._loadedJurnalRanges[rangeKey];
              
              if (!sudahDimuat) {
                  if (!state._loadedJurnalRanges) state._loadedJurnalRanges = {};
                  state._loadedJurnalRanges[rangeKey] = 'loading';
                  
                  console.log('[LazyJurnal] Memuat jurnal historis ' + rangeKey + '...');
                  google.script.run.withSuccessHandler(function(res) {
                      if (res.success && res.data && res.data.length > 0) {
                          // Merge ke state.jurnal (hindari duplikat by idJurnal+tanggal+kodeAkun)
                          var existingKeys = {};
                          for (var ei = 0; ei < state.jurnal.length; ei++) {
                              var jr = state.jurnal[ei];
                              existingKeys[jr.idJurnal + '|' + jr.tanggal + '|' + jr.kodeAkun] = true;
                          }
                          var added = 0;
                          for (var ni = 0; ni < res.data.length; ni++) {
                              var n = res.data[ni];
                              var key = n.idJurnal + '|' + n.tanggal + '|' + n.kodeAkun;
                              if (!existingKeys[key]) {
                                  state.jurnal.push(n);
                                  existingKeys[key] = true;
                                  added++;
                              }
                          }
                          state._loadedJurnalRanges[rangeKey] = 'done';
                          if (added > 0) {
                              console.log('[LazyJurnal] +' + added + ' baris untuk ' + rangeKey);
                              // Re-render laporan yang sedang aktif
                              var activeTab = document.querySelector('.rep-tab-btn.text-blue-600');
                              if (activeTab) {
                                  var tabId = activeTab.id.replace('tab-rep-', '');
                                  if (tabId === 'labarugi') renderLabaRugi();
                                  if (tabId === 'aruskas') renderArusKas();
                                  if (tabId === 'neraca') renderNeraca();
                                  if (tabId === 'jurnal') renderJurnal();
                                  if (tabId === 'bukubesar') renderBukuBesar();
                                  renderReportSummary();
                              }
                          }
                      } else {
                          state._loadedJurnalRanges[rangeKey] = 'done';
                      }
                  }).withFailureHandler(function(err) {
                      console.warn('[LazyJurnal] Gagal load:', err);
                      state._loadedJurnalRanges[rangeKey] = 'failed';
                  }).getJurnalHistoris(
                      storageManager.get('pos_token_final'),
                      toLocalDateStr(startObj),
                      toLocalDateStr(endObj)
                  );
              }
          }

          return { startTime: startObj.getTime(), endTime: endObj.getTime(), label: label, prefix: prefix };
        }

        // [PATCH U2] Preset tanggal
        function setPresetDate(prefix, preset) {
            var now = new Date();
            var start, end;
            if (preset === 'today') {
                start = now; end = now;
            } else if (preset === 'week') {
                start = new Date(); start.setDate(start.getDate() - 6); end = now;
            } else if (preset === 'month') {
                start = new Date(now.getFullYear(), now.getMonth(), 1); end = now;
            } else if (preset === 'lastmonth') {
                start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                end = new Date(now.getFullYear(), now.getMonth(), 0);
            } else { start = now; end = now; }

            document.getElementById(prefix + '-start').value = toLocalDateStr(start);
            document.getElementById(prefix + '-end').value = toLocalDateStr(end);

            if (prefix === 'lr') renderLabaRugi();
            else if (prefix === 'ak') renderArusKas();
            else if (prefix === 'jur') renderJurnal();
            else if (prefix === 'bb') renderBukuBesar();
            else if (prefix === 'lay') renderLayanan();
            else if (prefix === 'rep') { repJualCurrentPage = 1; repBeliCurrentPage = 1; renderReports(); }
            else if (prefix === 'pt') { renderProdukTerlaris(); }
            else if (prefix === 'an') { renderAnalisis(); }
        }

        function toggleTable(type) {
            var wrap = document.getElementById('wrap-table-' + type); var icon = document.getElementById('icon-toggle-' + type);
            if(!wrap || !icon) return;
            if(wrap.classList.contains('hidden')) { wrap.classList.remove('hidden'); icon.style.transform = 'rotate(0deg)'; } 
            else { wrap.classList.add('hidden'); icon.style.transform = 'rotate(-90deg)'; }
        }

        function resetRepDateFilter() {
            var startInput = document.getElementById('filter-rep-start');
            var endInput = document.getElementById('filter-rep-end');
            // [FIX #6] Set eksplisit ke "all time" (bukan clear supaya tidak auto-refill)
            if(startInput) startInput.value = '2000-01-01';
            if(endInput) endInput.value = toLocalDateStr(new Date());
            renderReports();
        }

        function renderReports() {
            var filterStatus = document.getElementById('filter-rep-status').value;
            var startInput = document.getElementById('filter-rep-start');
            var endInput = document.getElementById('filter-rep-end');
            var now = new Date();
            
            // [FIX] Set default tanggal: awal bulan ini s/d hari ini, HANYA jika belum diisi
            if (startInput && !startInput.value) {
                var firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                startInput.value = toLocalDateStr(firstDay);
            }
            if (endInput && !endInput.value) {
                endInput.value = toLocalDateStr(now);
            }
            
            var startDateStr = startInput ? startInput.value : '';
            var endDateStr = endInput ? endInput.value : '';
            var startObj = startDateStr ? parseLocalDate(startDateStr) : null;
            if(startObj) startObj.setHours(0,0,0,0);
            // [FIX #11] Konsisten pakai parseLocalDate (local TZ), bukan new Date(str)
            // yang diinterpretasi sebagai UTC — bergeser di zona non-WIB.
            var endObj = endDateStr ? parseLocalDate(endDateStr) : null;
            if(endObj) endObj.setHours(23,59,59,999);

            // [FIX PATCH AKUNTANSI] Buat timestamp numerik untuk filter layanan digital
            var startTime = startObj ? startObj.getTime() : 0;
            var endTime   = endObj ? endObj.getTime() : Number.MAX_SAFE_INTEGER;
            var btnReset = document.getElementById('btn-reset-rep-date');
            if(btnReset) { if(startDateStr || endDateStr) btnReset.classList.remove('hidden'); else btnReset.classList.add('hidden'); }

            // --- PROSES DATA PENJUALAN ---
            var tbJual = document.getElementById('rep-tbody-jual'); if(!tbJual) return;
            var sJual = state.transactions.slice().sort(function(a,b) { return b.tanggal - a.tanggal; });
            
            filteredJualData = [];
            for(var i=0; i<sJual.length; i++) {
                var t = sJual[i]; 
                if (startObj || endObj) { var txDate = new Date(t.tanggal); if (startObj && txDate < startObj) continue; if (endObj && txDate > endObj) continue; }
                // Filter status
                var statusNorm = String(t.status || '').trim().toUpperCase();
                if(filterStatus === 'HUTANG' && statusNorm !== 'HUTANG') continue;
                if(filterStatus === 'SUKSES' && statusNorm !== 'SUKSES') continue;

                // [NEW] Filter metode bayar (Tunai / QRIS / Kasbon)
                var filterMetode = document.getElementById('filter-rep-metode').value;
                if(filterMetode !== 'ALL') {
                    if(String(t.metode || '').trim() !== filterMetode) continue;
                } 
                
                filteredJualData.push(t); 
            }

            // ============================================================
            // [PATCH AKUNTANSI] Agregasi Pendapatan Layanan Digital
            // Pisahkan per COA agar traceable:
            //   421 Fee Tarik Tunai     → fee
            //   422 Produk Digital      → nominal (harga jual penuh)
            //   423 Fee Top Up E-Wallet → fee
            // ============================================================
            var tLayananOmset = 0;
            var tLayananLaba  = 0;
            var tLayananTarik = 0;
            var tLayananTopup = 0;
            var tLayananDigi  = 0;

            for (var ld = 0; ld < (state.layananDigital || []).length; ld++) {
                var lay = state.layananDigital[ld];
                if (lay.tanggal < startTime || lay.tanggal > endTime) continue;

                var layJenis   = String(lay.jenis);
                var layFee     = Number(lay.fee) || 0;
                var layNominal = Number(lay.nominal) || 0;

                // Laba layanan = fee (konsisten untuk semua jenis)
                tLayananLaba += layFee;

                if (layJenis === 'TARIK_TUNAI') {
                    tLayananTarik += layFee;
                    tLayananOmset += layFee;        // pass-through — hanya fee = revenue
                } else if (layJenis === 'TOPUP_EWALLET') {
                    tLayananTopup += layFee;
                    tLayananOmset += layFee;
                } else {  // PRODUK_DIGITAL
                    tLayananDigi  += layNominal;
                    tLayananOmset += layNominal;    // harga jual penuh = revenue
                }
            }

            // [PATCH #4] Fallback untuk Kasir (jurnal kosong) → pakai transaksi
            var isAdminRpt = !!(state.user && state.user.role === 'Admin');
            var mMetricsBody = isAdminRpt
                ? computeFinancialMetrics(startTime, endTime)
                : computeMetricsFromTransactions(startTime, endTime);
            var tOmsetTotal  = mMetricsBody.pendapatanNeto;
            var tLabaTotal   = mMetricsBody.labaKotor;
            
            var maxPageJual = Math.ceil(filteredJualData.length / repItemsPerPage) || 1;
            if (repJualCurrentPage > maxPageJual) repJualCurrentPage = maxPageJual;
            if (repJualCurrentPage < 1) repJualCurrentPage = 1;
            var startJual = (repJualCurrentPage - 1) * repItemsPerPage;
            var paginatedJual = filteredJualData.slice(startJual, startJual + repItemsPerPage);

            var htmlJual = '';
            for(var k=0; k<paginatedJual.length; k++) {
                var tp = paginatedJual[k];
                var d = new Date(tp.tanggal).toLocaleDateString('id-ID', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}); 
                var isRetur = tp.status === 'RETUR'; 
                var safeId = escapeHtml(tp.id);
                var pName = (tp.pelanggan && tp.pelanggan !== '-') ? escapeHtml(tp.pelanggan) : escapeHtml(tp.kasir);
                
                var statColor = isRetur 
                    ? 'text-red-500 line-through bg-red-50 px-1.5 py-0.5 rounded' 
                    : (tp.status === 'HUTANG' 
                        ? 'text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded' 
                        : 'text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded');

                // 🔽 NEW: Badge Metode Bayar
                var metodeVal = String(tp.metode || 'Tunai');
                var metodeBadge;
                if (metodeVal === 'QRIS') {
                    metodeBadge = '<span class="text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded text-[9px] font-black"><i class="fas fa-qrcode mr-1"></i>QRIS</span>';
                } else if (metodeVal === 'Kasbon') {
                    metodeBadge = '<span class="text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded text-[9px] font-black"><i class="fas fa-handshake mr-1"></i>KASBON</span>';
                } else {
                    metodeBadge = '<span class="text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded text-[9px] font-black"><i class="fas fa-money-bill-wave mr-1"></i>TUNAI</span>';
                }

                htmlJual += '<tr class="' + (isRetur ? 'opacity-60' : '') + ' hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">' 
                    + '<td class="p-3 whitespace-nowrap text-slate-500 text-[10px]">' + d + '</td>' 
                    + '<td class="p-3 text-[10px] text-slate-400 font-mono hidden sm:table-cell">' + safeId + '</td>' 
                    + '<td class="p-3 truncate max-w-[120px] font-bold text-xs">' + pName + '</td>' 
                    + '<td class="p-3 truncate max-w-[150px] text-slate-600 text-[10px]">' + escapeHtml(tp.item) + '</td>' 
                    + '<td class="p-3 text-[9px] font-black"><span class="' + statColor + '">' + escapeHtml(tp.status === 'HUTANG' ? 'KASBON' : tp.status) + '</span></td>' 
                    + '<td class="p-3 whitespace-nowrap">' + metodeBadge + '</td>'   /* 🔽 NEW */
                    + '<td class="p-3 text-right font-black text-slate-800 text-xs ' + (isRetur ? 'text-red-400' : '') + '">' + formatRp(tp.total) + '</td>' 
                    + '<td class="p-3 text-center no-print whitespace-nowrap"><button data-id="' + safeId + '" class="detail-btn bg-blue-50 text-blue-600 px-2.5 py-1.5 rounded-md text-[10px] font-bold hover:bg-blue-100 shadow-sm transition-all active:scale-95"><i class="fas fa-eye sm:mr-1"></i> <span class="hidden sm:inline">Detail</span></button></td>' 
                    + '</tr>'; 
            }

            tbJual.innerHTML = htmlJual || '<tr><td colspan="8" class="text-center p-6 text-slate-400 font-bold text-xs">Tidak ada data transaksi.</td></tr>';  
            // [PATCH #2] Render total + breakdown — SEMUA dari engine
            var elOmset = document.getElementById('rep-omset');
            if (elOmset) elOmset.innerText = formatRp(mMetricsBody.pendapatanNeto);
            // [FIX DISPLAY] Tampilkan retur/diskon agar breakdown konsisten dengan total
            var elOmsetBarang = document.getElementById('rep-omset-barang');
            if (elOmsetBarang) elOmsetBarang.innerText = formatRp(mMetricsBody.pendapatanBarang);
            var elOmsetLayanan = document.getElementById('rep-omset-layanan');
            if (elOmsetLayanan) elOmsetLayanan.innerText = formatRp(mMetricsBody.pendapatanLayanan);

            var _returDiskon = (mMetricsBody.returPenjualan || 0) + (mMetricsBody.diskonPenjualan || 0);
            var _returRow = document.getElementById('rep-omset-retur-row');
            var _returVal = document.getElementById('rep-omset-retur');
            if (_returRow && _returVal) {
                if (_returDiskon > 0) {
                    _returVal.innerText = '- ' + formatRp(_returDiskon);
                    _returRow.classList.remove('hidden');
                } else {
                    _returRow.classList.add('hidden');
                }
            }

            var elLaba = document.getElementById('rep-laba');
            if (elLaba) elLaba.innerText = formatRp(mMetricsBody.labaKotor);
            var elLabaBarang = document.getElementById('rep-laba-barang');
            if (elLabaBarang) elLabaBarang.innerText = formatRp(mMetricsBody.pendapatanBarang - mMetricsBody.hppBarang);
            var elLabaLayanan = document.getElementById('rep-laba-layanan');
            if (elLabaLayanan) elLabaLayanan.innerText = formatRp(mMetricsBody.pendapatanLayanan - mMetricsBody.hppDigital);

            // Margin total
            var elMargin = document.getElementById('rep-laba-margin');
            if (elMargin) {
                var marginPct = tOmsetTotal > 0 ? ((tLabaTotal / tOmsetTotal) * 100) : 0;
                elMargin.innerText = marginPct.toFixed(1) + '%';
                elMargin.className = marginPct >= 25 ? 'font-bold text-emerald-500'
                                  : marginPct >= 10 ? 'font-bold text-blue-500'
                                  : 'font-bold text-orange-500';
            }

            // Breakdown detail layanan (Tarik / Topup / Digital)
            var elDetailRow = document.getElementById('rep-omset-detail-row');
            var elDetailLabel = document.getElementById('rep-omset-detail-label');
            var elDetailVal = document.getElementById('rep-omset-detail-val');
            if (elDetailRow && tLayananOmset > 0) {
                var parts = [];
                if (tLayananTarik > 0) parts.push('Tarik ' + formatRp(tLayananTarik));
                if (tLayananTopup > 0) parts.push('Topup ' + formatRp(tLayananTopup));
                if (tLayananDigi > 0)  parts.push('Digital ' + formatRp(tLayananDigi));
                if (elDetailLabel) elDetailLabel.innerText = parts.join(' • ');
                if (elDetailVal) elDetailVal.innerText = '';
                elDetailRow.classList.remove('hidden');
            } else if (elDetailRow) {
                elDetailRow.classList.add('hidden');
            }

            var infoJual = document.getElementById('rep-jual-page-info'); if(infoJual) infoJual.innerText = 'Hal ' + repJualCurrentPage + ' dari ' + maxPageJual;
            
            // --- PROSES DATA PEMBELIAN ---
            var tbBeli = document.getElementById('rep-tbody-beli');
            var sBeli = state.purchases.slice().sort(function(a,b) { return b.tanggal - a.tanggal; }); var tB = 0; 
            
            filteredBeliData = [];
            for(var j=0; j<sBeli.length; j++) {
                var pb = sBeli[j]; 
                if (startObj || endObj) { var pbDate = new Date(pb.tanggal); if (startObj && pbDate < startObj) continue; if (endObj && pbDate > endObj) continue; }
                filteredBeliData.push(pb);
                tB += pb.totalBiaya; 
            }

            // Counter nota pembelian
            var elBeliCount = document.getElementById('rep-beli-count');
            if (elBeliCount) elBeliCount.innerText = filteredBeliData.length + 'x';
            
            var maxPageBeli = Math.ceil(filteredBeliData.length / repItemsPerPage) || 1;
            if (repBeliCurrentPage > maxPageBeli) repBeliCurrentPage = maxPageBeli;
            if (repBeliCurrentPage < 1) repBeliCurrentPage = 1;
            var startBeli = (repBeliCurrentPage - 1) * repItemsPerPage;
            var paginatedBeli = filteredBeliData.slice(startBeli, startBeli + repItemsPerPage);

            var htmlBeli = '';
            for(var m=0; m<paginatedBeli.length; m++) {
                var ppb = paginatedBeli[m];
                var dt = new Date(ppb.tanggal).toLocaleDateString('id-ID', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}); var safePbId = escapeHtml(ppb.id);
                var actionBtns = '<button data-id="' + safePbId + '" class="detail-purch-btn bg-purple-50 text-purple-600 px-2.5 py-1.5 rounded-md text-[10px] font-bold hover:bg-purple-100 transition-all shadow-sm active:scale-95"><i class="fas fa-eye sm:mr-1"></i> <span class="hidden sm:inline">Detail</span></button>';
                if(state.user && state.user.role === 'Admin') actionBtns += '<button onclick="processDeleteRestock(\'' + safePbId + '\')" class="ml-1.5 bg-red-50 text-red-600 px-2.5 py-1.5 rounded-md text-[10px] font-bold hover:bg-red-100 transition-all shadow-sm active:scale-95"><i class="fas fa-undo sm:mr-1"></i> <span class="hidden sm:inline">Retur</span></button>';
                
                var metodeBadge;
                if (ppb.metode === 'Hutang') {
                    metodeBadge = '<span class="text-red-500 bg-red-50 px-1.5 py-0.5 rounded text-[9px] font-black border border-red-100">HUTANG</span>';
                } else if (ppb.metode === 'LUNAS') {
                    metodeBadge = '<span class="text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded text-[9px] font-black border border-emerald-100">LUNAS</span>';
                } else if (ppb.metode === 'Transfer') {
                    metodeBadge = '<span class="text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded text-[9px] font-black border border-cyan-100">🏦 TRANSFER</span>';
                } else {
                    metodeBadge = '<span class="text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded text-[9px] font-black border border-blue-100">💵 TUNAI</span>';
                }

                htmlBeli += '<tr class="hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"><td class="p-3 whitespace-nowrap text-slate-500 text-[10px]">' + dt + '</td><td class="p-3 text-[10px] text-slate-400 font-mono hidden sm:table-cell">' + safePbId + '</td><td class="p-3 font-bold truncate max-w-[150px] text-xs">' + escapeHtml(ppb.namaProduk) + '</td><td class="p-3 truncate max-w-[120px] text-slate-600 text-[10px]">' + escapeHtml(ppb.supplier) + '</td><td class="p-3 text-center font-black text-xs">' + ppb.qty + '</td><td class="p-3 text-center">' + metodeBadge + '</td><td class="p-3 text-right font-black text-orange-600 text-xs">' + formatRp(ppb.totalBiaya) + '</td><td class="p-3 text-center no-print whitespace-nowrap">' + actionBtns + '</td></tr>'; 
            }
            
            var theadBeli = document.querySelector('#rep-table-beli thead');
            if(theadBeli) theadBeli.innerHTML = '<tr class="bg-white text-slate-400 text-[9px] border-b border-slate-100 uppercase tracking-wider"><th class="p-3 font-bold whitespace-nowrap">Tanggal</th><th class="p-3 font-bold whitespace-nowrap hidden sm:table-cell">ID Beli</th><th class="p-3 font-bold whitespace-nowrap">Produk</th><th class="p-3 font-bold whitespace-nowrap">Supplier</th><th class="p-3 font-bold text-center whitespace-nowrap">Qty</th><th class="p-3 font-bold text-center whitespace-nowrap">Metode</th><th class="p-3 font-bold text-right whitespace-nowrap">Biaya</th><th class="p-3 font-bold text-center no-print whitespace-nowrap">Aksi</th></tr>';

            tbBeli.innerHTML = htmlBeli || '<tr><td colspan="8" class="text-center p-6 text-slate-400 font-bold text-xs">Tidak ada data pembelian.</td></tr>';
            document.getElementById('rep-beli').innerText = formatRp(tB);
            var infoBeli = document.getElementById('rep-beli-page-info'); if(infoBeli) infoBeli.innerText = 'Hal ' + repBeliCurrentPage + ' dari ' + maxPageBeli; renderReportSummary();
        }

        function renderPiutang() {
            var tbody = document.getElementById('rep-tbody-piutang');
            if (!tbody) return;
            var html = '';
            var totalPiutang = 0;

            // Tampilkan semua Kasbon (HUTANG + SUKSES), kecuali RETUR
            var allLoans = state.transactions.filter(function(t) {
                var status = String(t.status || '').trim().toUpperCase();
                var metode = String(t.metode || '').trim();
                return metode === 'Kasbon' && (status === 'HUTANG' || status === 'SUKSES');
            });
            allLoans.sort(function(a, b) { return b.tanggal - a.tanggal; });

            if (allLoans.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center p-10 text-slate-400 font-bold">Belum ada riwayat kasbon.</td></tr>';
                document.getElementById('tot-piutang').innerText = formatRp(0);
                return; // Hentikan eksekusi lebih awal
            }

            var unpaidRows = [];
            var paidRows = [];

            for (var i = 0; i < allLoans.length; i++) {
                var t = allLoans[i];
                var isLunas = (String(t.status).toUpperCase() === 'SUKSES');
                var nominalTagihan = Number(t.total) - (Number(t.bayar) || 0);
                if (nominalTagihan < 0) nominalTagihan = 0;
                
                var totalDibayarKasbon = Number(t.bayar) || 0;
                if (isLunas) totalDibayarKasbon = Number(t.total) || 0;
                
                if (!isLunas) totalPiutang += nominalTagihan;

                var dStr = new Date(t.tanggal).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
                var safePelanggan = escapeHtml(t.pelanggan && t.pelanggan !== '-' ? t.pelanggan : 'Hamba Allah');
                var safeWA = escapeHtml(t.wa || '-');

                var statusBadge = isLunas
                    ? '<span class="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[9px] font-black border border-emerald-200"><i class="fas fa-check-circle mr-1"></i>LUNAS</span>'
                    : '<span class="text-red-500 bg-red-50 px-1.5 py-0.5 rounded text-[9px] font-black border border-red-100"><i class="fas fa-hourglass-half mr-1"></i>BELUM LUNAS</span>';

                var rowStyle = isLunas ? 'opacity-60 bg-emerald-50/20' : 'hover:bg-slate-50';
                var nominalDisplay = isLunas
                    ? '<span class="line-through text-slate-400">' + formatRp(t.total) + '</span><br><span class="text-[9px] text-emerald-600 font-bold">Terbayar Penuh</span>'
                    : formatRp(nominalTagihan);

                var aksiHtml = '';
                if (isLunas) {
                    aksiHtml =
                        '<button onclick="viewInstallmentHistory(\'' + safeJsArg(t.id) + '\', \'piutang\')" class="bg-slate-100 text-slate-600 w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-200 transition-all active:scale-95" title="Lihat Riwayat"><i class="fas fa-history"></i></button>' +
                        '<button onclick="reprintTx(\'' + safeJsArg(t.id) + '\')" class="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all shadow-sm active:scale-95" title="Cetak Ulang Bukti"><i class="fas fa-print mr-1"></i>Cetak</button>';
                } else {
                    aksiHtml =
                        '<button onclick="viewInstallmentHistory(\'' + safeJsArg(t.id) + '\', \'piutang\')" class="bg-slate-100 text-slate-600 w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-200 transition-all active:scale-95" title="Lihat Riwayat"><i class="fas fa-history"></i></button>' +
                        '<button onclick="prosesLunasPiutang(\'' + safeJsArg(t.id) + '\', \'' + safeJsArg(t.pelanggan || '-') + '\', ' + Number(t.total || 0) + ', \'' + safeJsArg(t.wa || '-') + '\')" class="bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all shadow-sm active:scale-95"><i class="fas fa-check-double mr-1"></i>Lunasi Full</button>';
                }

                var trHtml = '<tr class="transition-colors ' + rowStyle + '">' +
                    '<td class="p-4 text-xs text-slate-500 whitespace-nowrap">' + dStr + '</td>' +
                    '<td class="p-4"><div><p class="font-black text-slate-800">' + safePelanggan + '</p><p class="text-[10px] text-slate-400">' + safeWA + '</p></div></td>' +
                    '<td class="p-4 font-mono text-[10px] text-blue-500 cursor-pointer hover:underline" onclick="openTxDetail(\'' + safeJsArg(t.id) + '\')">' + escapeHtml(t.id) + '</td>' +
                    '<td class="p-4 text-center">' + statusBadge + '</td>' +
                    '<td class="p-4 text-right font-black text-slate-700">' + nominalDisplay + '</td>' +
                    '<td class="p-4 text-center whitespace-nowrap"><div class="flex items-center justify-center gap-2">' + aksiHtml + '</div></td>' +
                    '</tr>';

                if (isLunas) paidRows.push(trHtml);
                else unpaidRows.push(trHtml);
            }

            // Gabungkan: Unpaid di atas, Paid di bawah dengan divider
            html = unpaidRows.join('');
            
            if (paidRows.length > 0) {
                html += `<tr><td colspan="6" class="py-3 px-4 bg-slate-100 border-y border-slate-200 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest"><i class="fas fa-check-circle text-emerald-500 mr-1"></i> Riwayat Lunas</td></tr>`;
                html += paidRows.join('');
            }

            tbody.innerHTML = html;
            document.getElementById('tot-piutang').innerText = formatRp(totalPiutang);
        }

        // [PATCH v7.15.1] renderHutang — include AST (sumberDana === 'HUTANG')
        function renderHutang() {
            var tbody = document.getElementById('rep-tbody-hutang');
            if (!tbody) return;

            if (!state.user || state.user.role !== 'Admin') {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center p-6 text-slate-400 font-bold text-xs">Akses ditolak — hanya Admin</td></tr>';
                return;
            }

            if (!_asetCacheReady()) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center p-6 text-slate-400 font-bold text-xs"><i class="fas fa-spinner fa-spin mr-1"></i>Memuat data hutang...</td></tr>';
                _ensureAsetLoaded(function() { renderHutang(); });
                return;
            }

            var jurnalPayments = {}; 
            for (var j = 0; j < state.jurnal.length; j++) {
                var jr = state.jurnal[j];
                if (String(jr.kodeAkun).trim() === '211' && (jr.debit || 0) > 0) {
                    var refId = String(jr.refId || '');
                    if (refId.indexOf('-LNS') > -1) {
                        var purchId = refId.replace('-LNS', '');
                        jurnalPayments[purchId] = (jurnalPayments[purchId] || 0) + (jr.debit || 0);
                    }
                    if (refId.indexOf('-PAY-') > -1) {
                        var parts = refId.split('-PAY-');
                        var refNotaPart = parts[0];
                        jurnalPayments[refNotaPart] = (jurnalPayments[refNotaPart] || 0) + (jr.debit || 0);
                    }
                }
            }

            var unpaidHtml = '';
            var paidHtml = '';
            var totalHutang = 0;
            var hasAnyData = false;

            // PART 1: PEMBELIAN
            var batches = {};
            var relevantPurchases = state.purchases.filter(function(p) {
                var m = String(p.metode || '').trim();
                return m === 'Hutang' || m === 'LUNAS';
            });

            for (var i = 0; i < relevantPurchases.length; i++) {
                var p = relevantPurchases[i];
                var key = String(p.refNota || '').trim() || ('NOTA' + p.tanggal);
                if (!batches[key]) {
                    batches[key] = {
                        refNota: key, supplier: p.supplier || '-', tanggal: p.tanggal,
                        totalBiaya: 0, metode: String(p.metode || '').toUpperCase(), items: []
                    };
                }
                batches[key].totalBiaya += Number(p.totalBiaya) || 0;
                batches[key].items.push(p);
            }

            var pembayaranPerNota = {};
            for (var ph = 0; ph < (state.pembayaranHutang || []).length; ph++) {
                var pay = state.pembayaranHutang[ph];
                pembayaranPerNota[pay.refNota] = (pembayaranPerNota[pay.refNota] || 0) + (Number(pay.nominal) || 0);
            }

            var batchList = [];
            for (var rn in batches) {
                var b = batches[rn];
                var totalDibayar = pembayaranPerNota[b.refNota] || 0;
                var lnsPaid = 0;
                for (var itemIdx = 0; itemIdx < b.items.length; itemIdx++) {
                    var itemId = String(b.items[itemIdx].id);
                    if (jurnalPayments[itemId]) lnsPaid += jurnalPayments[itemId];
                }
                var payPaid = 0;
                if (jurnalPayments[b.refNota] && pembayaranPerNota[b.refNota] === undefined) {
                    payPaid = jurnalPayments[b.refNota];
                }
                
                var totalDibayarFinal = totalDibayar + lnsPaid + payPaid;
                var sisa = Math.max(0, b.totalBiaya - totalDibayarFinal);
                var allItemsLunas = b.items.length > 0 && b.items.every(function(it) {
                    return String(it.metode || '').toUpperCase() === 'LUNAS';
                });
                var isLunas = allItemsLunas || (sisa <= 0);
                
                b.sisa = sisa;
                b.totalDibayar = totalDibayarFinal;
                b.isLunas = isLunas;
                
                if (!isLunas) totalHutang += sisa; // <--- HANYA DI SINI PENAMBAHANNYA
                batchList.push(b);
            }
            batchList.sort(function(a, b) { return b.tanggal - a.tanggal; });

            for (var k = 0; k < batchList.length; k++) {
                var batch = batchList[k];
                var dStr = new Date(batch.tanggal).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });

                var statusBadge = batch.isLunas
                    ? '<span class="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[9px] font-black border border-emerald-200"><i class="fas fa-check-circle mr-1"></i>LUNAS</span>'
                    : '<span class="text-red-500 bg-red-50 px-1.5 py-0.5 rounded text-[9px] font-black border border-red-100"><i class="fas fa-hourglass-half mr-1"></i>BELUM LUNAS</span>';

                var rowStyle = batch.isLunas ? 'opacity-60 bg-emerald-50/20' : 'hover:bg-slate-50';
                var itemsSummary = batch.items.map(function(it) {
                    return escapeHtml(it.namaProduk) + ' <span class="text-slate-400">(' + it.qty + 'x)</span>';
                }).join(', ');

                var nominalDisplay = batch.isLunas
                    ? '<span class="line-through text-slate-400">' + formatRp(batch.totalBiaya) + '</span><br><span class="text-[9px] text-emerald-600 font-bold">Lunas (Rp ' + formatRp(batch.totalDibayar) + ')</span>'
                    : '<span class="text-red-600">' + formatRp(batch.sisa) + '</span><br><span class="text-[9px] text-slate-400">dari Rp ' + formatRp(batch.totalBiaya) + '</span>';

                var aksiHtml = '';
                if (batch.isLunas) {
                    aksiHtml =
                        '<button onclick="viewPembayaranHutangHistory(\'' + safeJsArg(batch.refNota) + '\')" class="bg-slate-100 text-slate-600 w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-200 transition-all active:scale-95" title="Lihat Riwayat Pembayaran"><i class="fas fa-history"></i></button>' +
                        '<button onclick="printHutangBukti(\'' + safeJsArg(batch.refNota) + '\')" class="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all shadow-sm active:scale-95" title="Cetak Bukti Lunas"><i class="fas fa-print mr-1"></i>Cetak</button>';
                } else {
                    aksiHtml =
                        '<button onclick="viewPembayaranHutangHistory(\'' + safeJsArg(batch.refNota) + '\')" class="bg-slate-100 text-slate-600 w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-200 transition-all active:scale-95" title="Riwayat"><i class="fas fa-history"></i></button>' +
                        '<button onclick="openPembayaranHutangModal(\'' + safeJsArg(batch.refNota) + '\', ' + Number(batch.sisa) + ', \'' + safeJsArg(batch.supplier) + '\', ' + Number(batch.totalBiaya) + ', ' + Number(batch.totalDibayar) + ')" class="bg-purple-50 text-purple-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-purple-100 transition-all shadow-sm active:scale-95" title="Cicil / Lunasi"><i class="fas fa-hand-holding-usd mr-1"></i>Bayar</button>';
                }

                var trHtml = '<tr class="transition-colors ' + rowStyle + '">' +
                    '<td class="p-4 text-xs text-slate-500 whitespace-nowrap">' + dStr + '</td>' +
                    '<td class="p-4 font-black text-slate-800">' + escapeHtml(batch.supplier) + '</td>' +
                    '<td class="p-4 font-mono text-[10px] text-blue-500">' + escapeHtml(batch.refNota) + '</td>' +
                    '<td class="p-4 text-xs text-slate-600 max-w-[180px] truncate" title="' + escapeHtml(itemsSummary) + '">' + itemsSummary + '</td>' +
                    '<td class="p-4 text-center">' + statusBadge + '</td>' +
                    '<td class="p-4 text-right font-black">' + nominalDisplay + '</td>' +
                    '<td class="p-4 text-center whitespace-nowrap"><div class="flex items-center justify-center gap-2">' + aksiHtml + '</div></td>' +
                    '</tr>';

                if (batch.isLunas) paidHtml += trHtml;
                else unpaidHtml += trHtml;
                
                hasAnyData = true;
            }

            // PART 2: ASET dengan sumberDana === 'HUTANG'
            var asetHutangList = (_stateAsetList || []).filter(function(a) {
                var sd = String(a.sumberDana || '').trim().toUpperCase();
                if (sd !== 'HUTANG') return false;
                var totalDibayarA = pembayaranPerNota[a.idAset] || 0;
                var sisaA = a.nilaiPerolehan - totalDibayarA;
                return sisaA > 0 || totalDibayarA > 0;
            });

            asetHutangList.sort(function(a, b) { return b.tanggalPerolehan - a.tanggalPerolehan; });

            for (var ah = 0; ah < asetHutangList.length; ah++) {
                var a = asetHutangList[ah];
                var totalDibayarAset = pembayaranPerNota[a.idAset] || 0;
                var sisaAset = Math.max(0, a.nilaiPerolehan - totalDibayarAset);
                var isLunasAset = sisaAset <= 0;

                var dStrA = new Date(a.tanggalPerolehan).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });

                var statusBadgeA = isLunasAset
                    ? '<span class="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[9px] font-black border border-emerald-200"><i class="fas fa-check-circle mr-1"></i>LUNAS</span>'
                    : '<span class="text-red-500 bg-red-50 px-1.5 py-0.5 rounded text-[9px] font-black border border-red-100"><i class="fas fa-hourglass-half mr-1"></i>BELUM LUNAS</span>';

                var rowStyleA = isLunasAset ? 'opacity-60 bg-emerald-50/20' : 'hover:bg-slate-50';
                var nominalDisplayA = isLunasAset
                    ? '<span class="line-through text-slate-400">' + formatRp(a.nilaiPerolehan) + '</span><br><span class="text-[9px] text-emerald-600 font-bold">Lunas (Rp ' + formatRp(totalDibayarAset) + ')</span>'
                    : '<span class="text-red-600">' + formatRp(sisaAset) + '</span><br><span class="text-[9px] text-slate-400">dari Rp ' + formatRp(a.nilaiPerolehan) + '</span>';

                if (!isLunasAset) totalHutang += sisaAset; // <--- HANYA DI SINI PENAMBAHANNYA

                var aksiHtmlA = '';
                if (isLunasAset) {
                    aksiHtmlA =
                        '<button onclick="viewPembayaranHutangHistory(\'' + safeJsArg(a.idAset) + '\')" class="bg-slate-100 text-slate-600 w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-200 transition-all active:scale-95" title="Riwayat"><i class="fas fa-history"></i></button>' +
                        '<button onclick="printHutangBukti(\'' + safeJsArg(a.idAset) + '\')" class="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all shadow-sm active:scale-95"><i class="fas fa-print mr-1"></i>Cetak</button>';
                } else {
                    aksiHtmlA =
                        '<button onclick="viewPembayaranHutangHistory(\'' + safeJsArg(a.idAset) + '\')" class="bg-slate-100 text-slate-600 w-9 h-9 rounded-full flex items-center justify-center hover:bg-slate-200 transition-all active:scale-95" title="Riwayat"><i class="fas fa-history"></i></button>' +
                        '<button onclick="openPembayaranHutangModal(\'' + safeJsArg(a.idAset) + '\', ' + Number(sisaAset) + ', \'' + safeJsArg(a.nama) + '\', ' + Number(a.nilaiPerolehan) + ', ' + Number(totalDibayarAset) + ')" class="bg-purple-50 text-purple-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-purple-100 transition-all shadow-sm active:scale-95" title="Cicil / Lunasi"><i class="fas fa-hand-holding-usd mr-1"></i>Bayar</button>';
                }

                var trHtmlA = '<tr class="transition-colors ' + rowStyleA + '">' +
                    '<td class="p-4 text-xs text-slate-500 whitespace-nowrap">' + dStrA + '</td>' +
                    '<td class="p-4 font-black text-slate-800"><span class="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded mr-1 font-black">ASET</span>' + escapeHtml(a.nama) + '</td>' +
                    '<td class="p-4 font-mono text-[10px] text-blue-500">' + escapeHtml(a.idAset) + '</td>' +
                    '<td class="p-4 text-xs text-slate-600 max-w-[180px] truncate">' + escapeHtml(a.kategori || '-') + '</td>' +
                    '<td class="p-4 text-center">' + statusBadgeA + '</td>' +
                    '<td class="p-4 text-right font-black">' + nominalDisplayA + '</td>' +
                    '<td class="p-4 text-center whitespace-nowrap"><div class="flex items-center justify-center gap-2">' + aksiHtmlA + '</div></td>' +
                    '</tr>';

                if (isLunasAset) paidHtml += trHtmlA;
                else unpaidHtml += trHtmlA;
                
                hasAnyData = true;
            }

            // Render
            if (!hasAnyData) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center p-10 text-slate-400 font-bold">Belum ada riwayat hutang.</td></tr>';
            } else {
                var finalHtml = unpaidHtml;
                if (paidHtml) {
                    finalHtml += `<tr><td colspan="7" class="py-3 px-4 bg-slate-100 border-y border-slate-200 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest"><i class="fas fa-check-circle text-emerald-500 mr-1"></i> Riwayat Lunas</td></tr>`;
                    finalHtml += paidHtml;
                }
                tbody.innerHTML = finalHtml;
            }
            document.getElementById('tot-hutang').innerText = formatRp(totalHutang);
        }
		
        function renderBebanList() {
            var tb = document.getElementById('rep-tbody-beban'); if(!tb) return;
            var sBeban = state.beban.slice().sort(function(a,b) { return b.tanggal - a.tanggal; }); 
            var html = ''; var total = 0;
            
            for(var i=0; i<sBeban.length; i++) {
                var b = sBeban[i];
                // [FIX] Tambahkan 'Penarikan Bank ke Kas' ke exclusion (transfer aset, bukan beban)
                var nonBeban = ['Setoran Modal', 'Penerimaan Pinjaman', 'Pendapatan Lainnya', 'Penyusutan Aset', 'Penarikan Bank ke Kas'];
                if (nonBeban.indexOf(b.kategori) === -1) { total += b.nominal; }
                
                var dt = new Date(b.tanggal).toLocaleDateString('id-ID', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
                var isPemasukan = (b.kategori === 'Setoran Modal' || b.kategori === 'Penerimaan Pinjaman' || b.kategori === 'Pendapatan Lainnya');
                var isTransfer = (b.kategori === 'Penarikan Bank ke Kas');
                var nomColor = isPemasukan ? 'text-emerald-500' : (isTransfer ? 'text-indigo-500' : 'text-red-500');
                var nomSign  = isPemasukan ? '+' : (isTransfer ? '⇄' : '-');
                
                html += '<tr class="hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">' +
                            '<td class="p-3 text-slate-500 text-[10px] whitespace-nowrap">' + dt + '</td>' +
                            '<td class="p-3 text-slate-600 font-bold text-[10px]">' + escapeHtml(b.kasir) + '</td>' +
                            '<td class="p-3 whitespace-nowrap"><span class="bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded text-[9px] font-black">' + escapeHtml(b.kategori) + '</span></td>' +
                            '<td class="p-3 text-slate-600 text-[10px]">' + escapeHtml(b.keterangan) + '</td>' +
                            '<td class="p-3 text-right font-black ' + nomColor + ' whitespace-nowrap text-xs">' + nomSign + ' ' + formatRp(b.nominal) + '</td>' +
                            '<td class="p-3 text-center no-print">' + 
                                (state.user && state.user.role === 'Admin' ? '<button onclick="deleteBebanAction(\''+b.id+'\')" class="bg-red-50 text-red-500 hover:bg-red-100 px-2 py-1.5 rounded transition-all active:scale-95" title="Batalkan Transaksi"><i class="fas fa-trash text-[10px]"></i></button>' : '-') +
                            '</td>' +
                        '</tr>';
            }
            
            var thead = document.querySelector('#rep-beban thead');
            if(thead) thead.innerHTML = '<tr class="bg-slate-50 text-slate-400 text-[9px] border-b border-slate-100 uppercase tracking-wider"><th class="p-3 font-bold whitespace-nowrap">Tanggal</th><th class="p-3 font-bold whitespace-nowrap">Oleh</th><th class="p-3 font-bold whitespace-nowrap">Kategori</th><th class="p-3 font-bold whitespace-nowrap">Keterangan</th><th class="p-3 font-bold text-right whitespace-nowrap">Nominal</th><th class="p-3 font-bold text-center no-print whitespace-nowrap">Aksi</th></tr>';

            tb.innerHTML = html || '<tr><td colspan="6" class="text-center p-6 text-slate-400 font-bold text-xs">Belum ada catatan transaksi kas lainnya.</td></tr>';
            document.getElementById('rep-total-beban').innerText = formatRp(total);
        }

        // [NEW] Buka modal beban + set default tanggal hari ini
        function openBebanModal() {
            document.getElementById('form-beban').reset();

            // Set default tanggal = hari ini (format YYYY-MM-DD untuk input[type=date])
            var now = new Date();
            var yyyy = now.getFullYear();
            var mm = String(now.getMonth() + 1).padStart(2, '0');
            var dd = String(now.getDate()).padStart(2, '0');
            document.getElementById('mb-tanggal').value = yyyy + '-' + mm + '-' + dd;

            // Reset Ikon default tidak perlu — form-beban sudah punya default
            openModal('modal-beban');
        }

        // TAMBAHKAN FUNGSI INI
        function saveBebanForm(e) {
            e.preventDefault();

            var kategori = document.getElementById('mb-kategori').value;
            var nominal = getAngkaBersih('mb-nominal');
            var keterangan = document.getElementById('mb-keterangan').value;
            var tanggalInput = document.getElementById('mb-tanggal').value;

            if (!tanggalInput) {
                Swal.fire('Tanggal Kosong', 'Silakan pilih tanggal transaksi terlebih dahulu.', 'warning');
                return;
            }

            var now = new Date();
            var parts = tanggalInput.split('-');
            var tglTerpilih = new Date(
                parseInt(parts[0], 10),
                parseInt(parts[1], 10) - 1,
                parseInt(parts[2], 10),
                now.getHours(), now.getMinutes(), now.getSeconds()
            );
            var timestamp = tglTerpilih.getTime();

            var besok = new Date();
            besok.setHours(23, 59, 59, 999);
            if (timestamp > besok.getTime()) {
                Swal.fire('Tanggal Tidak Valid', 'Tanggal transaksi tidak boleh melebihi hari ini.', 'error');
                return;
            }

            // ── Validasi kas minus ──
            var isKasKeluar = true;
            if (kategori === 'Setoran Modal' || kategori === 'Penerimaan Pinjaman' ||
                kategori === 'Pendapatan Lainnya' || kategori === 'Penyusutan Aset' ||
                kategori === 'Penarikan Bank ke Kas') {
                isKasKeluar = false;
            }

            // ✅ GANTI dengan:
			if (isKasKeluar) {
			    var saldoKas =
			        (state._saldoByAccount && Number(state._saldoByAccount['111'])) ||
			        (Number(state.saldoRingkas.kas111) || 0);
			    if (nominal > saldoKas) { /* reject */ }
			}

            // ── Inner function untuk eksekusi simpan ──
            function _doSaveBeban() {
                var b = document.getElementById('btn-save-beban');
                b.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...';
                b.disabled = true;

                var data = {
                    kategori: kategori,
                    nominal: nominal,
                    keterangan: keterangan,
                    tanggal: timestamp
                };

                // ── [FIX v7.15.1] Guard setelah `data` dideklarasi ──
                if (data.kategori === 'Aset Tetap (Peralatan)') {
                    b.innerHTML = 'Simpan Transaksi';
                    b.disabled = false;
                    return Swal.fire({
                        icon: 'warning',
                        title: 'Gunakan Modul Aset Tetap',
                        html: 'Pembelian aset sekarang harus lewat menu <b>Aset Tetap</b> di sidebar.<br><br>' +
                              '<span class="text-xs text-slate-500">Menu: Sidebar → Aset Tetap → Tambah Aset</span>'
                    });
                }

                google.script.run.withSuccessHandler(function(r) {
                    b.innerText = 'Simpan Transaksi';
                    b.disabled = false;
                    if (!handleApiResponse(r, "Gagal simpan transaksi kas: ")) return;

                    state.beban.unshift({
                        id: r.newId, tanggal: r.tanggal, kasir: r.kasir,
                        kategori: data.kategori, keterangan: data.keterangan, nominal: data.nominal
                    });
                    closeModal('modal-beban');
                    document.getElementById('form-beban').reset();
                    renderBebanList();
                    renderLabaRugi();
                    renderArusKas();
                    renderNeraca();
                    renderJurnal();
                    renderDashboard();
                    manualSync(true);
                    showToast('Transaksi kas berhasil dicatat', 'success');
                }).saveBeban(storageManager.get('pos_token_final'), data);
            }

            // ── Peringatan Setoran Modal → pakai .then() ──
            if (kategori === 'Setoran Modal') {
                Swal.fire({
                    icon: 'info',
                    title: 'Setoran Modal',
                    html: 'Menu ini untuk setoran modal ke <b>BRANGKAS / REKENING</b>.<br><br>' +
                          'Untuk modal awal <b>KASIR</b>, gunakan tombol <b>Buka Shift</b> dengan sumber modal yang sesuai.<br><br>' +
                          'Apakah uang ini akan masuk ke <b>LACI KASIR</b>?',
                    showCancelButton: true,
                    confirmButtonText: 'Ya, Masuk Laci',
                    cancelButtonText: 'Batal, Brangkas Saja',
                    confirmButtonColor: '#3b82f6'
                }).then(function(confirm) {
                    // Lanjut simpan apapun pilihan user (atau bisa dikembangkan)
                    _doSaveBeban();
                });
            } else {
                _doSaveBeban();
            }
        }
		
        // PERBAIKAN: Fungsi Histori Pintar (Menghitung Mundur Nilai Retur Sebagian)
        function viewInstallmentHistory(refId, type) {
            Swal.fire({title: 'Memuat histori...', allowOutsideClick: false, didOpen: () => {Swal.showLoading()}});

            // 1. Tentukan Objek Utama (Info Header)
            var objMain = type === 'piutang' 
                ? state.transactions.find(function(t) { return String(t.id) === String(refId); }) 
                : state.purchases.find(function(p) { return String(p.id) === String(refId); });

            if(!objMain) { Swal.close(); return showToast('Data utama tidak ditemukan', 'error'); }

            var isPiutang = (type === 'piutang');
            var iconEl = document.getElementById('hist-lunas-icon');
            var titleEl = document.getElementById('hist-lunas-title');
            var initialTagihanEl = document.getElementById('hist-lunas-tagihan-awal'); // Kita gunakan ini untuk Total Tagihan Saat Ini
            var bodyEl = document.getElementById('hist-lunas-body');
            var statusBadgeEl = document.getElementById('hist-lunas-status');
            
            // Tagihan berjalan adalah nilai yang ada di database sekarang
            var tagihanSaatIni = isPiutang ? objMain.total : objMain.totalBiaya;
            var tagihanAwal = tagihanSaatIni; // Akan ditambah dengan nilai retur (jika ada) untuk mencari Nota Awal

            if(isPiutang) {
                iconEl.className = 'w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-inner relative bg-emerald-50 text-emerald-500';
                titleEl.innerText = 'Histori Piutang / Kasbon';
                titleEl.innerHTML += '<span class="text-xs text-slate-400 font-medium ml-2 block sm:inline">(Pelanggan: '+ escapeHtml(objMain.pelanggan || 'Guest') +')</span>';
            } else {
                iconEl.className = 'w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-inner relative bg-red-50 text-red-500';
                titleEl.innerText = 'Histori Hutang Dagang';
                titleEl.innerHTML += '<span class="text-xs text-slate-400 font-medium ml-2 block sm:inline">(Supplier: '+ escapeHtml(objMain.supplier) +')</span>';
            }

            // Cari aktivitas Pelunasan atau Retur dari Log Sistem
            var relatedLogs = state.logs.filter(function(l) {
                if(isPiutang && (l.aksi === 'PELUNASAN' || l.aksi === 'RETUR') && String(l.keterangan).includes(refId)) return true;
                if(!isPiutang && (l.aksi === 'PELUNASAN HUTANG' || l.aksi === 'RETUR PEMBELIAN') && String(l.keterangan).includes(refId)) return true;
                return false;
            });

            // Urutkan dari yang terlama ke terbaru untuk timeline
            relatedLogs.sort(function(a,b) { return a.waktu - b.waktu; });

            var logReturHtml = '';
            var adaRetur = false;

            // 2. Kalkulasi Nilai Retur untuk mencari Tagihan Awal
            for(var i=0; i<relatedLogs.length; i++) {
                var l = relatedLogs[i];
                if (l.aksi.includes('RETUR')) {
                    adaRetur = true;
                    var nominalRetur = 0;
                    
                    if (!isPiutang) {
                        // Ekstrak Qty dari teks log misal: "Retur restock ID BELI... sebanyak X item"
                        var match = l.keterangan.match(/sebanyak (\d+) item/);
                        if (match && objMain.hargaBeli) {
                            nominalRetur = parseInt(match[1]) * objMain.hargaBeli;
                            tagihanAwal += nominalRetur; // Tambahkan kembali ke tagihan awal
                        }
                    } else {
                        // Penjualan saat ini menggunakan Retur Full (Bukan Sebagian)
                        nominalRetur = objMain.total; 
                        tagihanAwal = nominalRetur;
                    }

                    logReturHtml += generateHistLunasItem(new Date(l.waktu), 'fa-undo', 'text-orange-500 bg-orange-50', 'Transaksi Diretur', escapeHtml(l.user) + ' (Kasir)', nominalRetur, 'Retur');
                }
            }

            // Update Header Modal dengan Sisa Tagihan Berjalan
            initialTagihanEl.innerText = formatRp(tagihanSaatIni);

            // 3. Bangun HTML Timeline
            var htmlHist = '';
            var dateAwal = new Date(objMain.tanggal);
            
            // A. ITEM 1: Nota Diterbitkan (MUNCULKAN TAGIHAN AWAL SEBELUM RETUR)
            htmlHist += generateHistLunasItem(dateAwal, 'fa-file-invoice-dollar', 'text-slate-400 bg-slate-100', 'Nota Diterbitkan', 'Status Awal: ' + (isPiutang?'Kasbon':'Kredit'), tagihanAwal, '-');

            // B. ITEM 2: Log Retur (Jika ada)
            htmlHist += logReturHtml;

            // C. ITEM 3: Log Pelunasan (Jika ada)
            var isLunas = isPiutang ? (objMain.status === 'SUKSES') : (objMain.metode === 'LUNAS');
            var isReturFull = isPiutang ? (objMain.status === 'RETUR') : false;

            if (isLunas) {
                var logLunas = relatedLogs.find(l => l.aksi.includes('PELUNASAN'));
                var lunasDate = logLunas ? new Date(logLunas.waktu) : new Date(objMain.tanggal + 2000); 
                var iconTypeLunas = isPiutang ? 'text-emerald-500 bg-emerald-50' : 'text-blue-500 bg-blue-50';
                
                // Nominal pelunasan adalah tagihan yang tersisa
                htmlHist += generateHistLunasItem(lunasDate, 'fa-check-double', iconTypeLunas, 'Pelunasan Penuh (LUNAS)', logLunas ? escapeHtml(logLunas.user) : 'Sistem Kasir', tagihanSaatIni, 'Lunas');
                
                statusBadgeEl.innerText = 'LUNAS';
                statusBadgeEl.className = 'ml-1 font-black text-xs px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600';
            } else if (isReturFull || (adaRetur && tagihanSaatIni === 0 && !isPiutang)) {
                statusBadgeEl.innerText = 'DIRETUR FULL';
                statusBadgeEl.className = 'ml-1 font-black text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-600';
            } else if (adaRetur && tagihanSaatIni > 0) {
                htmlHist += '<div class="text-center p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 font-bold text-xs"><i class="fas fa-hand-holding-usd text-2xl mb-2 block"></i>Menunggu Pembayaran Sisa...</div>';
                statusBadgeEl.innerText = 'BELUM LUNAS (RETUR SEBAGIAN)';
                statusBadgeEl.className = 'ml-1 font-black text-[10px] px-2 py-1 rounded-lg bg-orange-50 text-orange-600';
            } else {
                htmlHist += '<div class="text-center p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 font-bold text-xs"><i class="fas fa-hand-holding-usd text-2xl mb-2 block"></i>Menunggu Pembayaran...</div>';
                statusBadgeEl.innerText = 'BELUM LUNAS';
                statusBadgeEl.className = 'ml-1 font-black text-xs px-2 py-1 rounded-lg bg-red-50 text-red-600';
            }

            bodyEl.innerHTML = htmlHist;
            Swal.close();
            openModal('modal-histori-lunas');
        }
		
        function generateHistLunasItem(date, icon, iconColor, title, subtitle, nominal, keterangan) {
            var dateStr = date.toLocaleDateString('id-ID', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
            var infoTambahan = keterangan !== '-' ? '<span class="ml-2 font-black text-[9px] px-1.5 py-0.5 rounded bg-emerald-500 text-white shadow-sm">'+keterangan+'</span>' : '';
            
            return `
                <div class="flex items-start gap-3 relative z-10">
                    <div class="w-6 h-6 rounded-full flex items-center justify-center shadow-sm ${iconColor} mt-1 border border-white shrink-0">
                        <i class="fas ${icon} text-[10px]"></i>
                    </div>
                    <div class="flex-1 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                        <div class="flex justify-between items-start gap-2 mb-1">
                            <p class="font-bold text-slate-700 text-xs leading-tight">${escapeHtml(title)} ${infoTambahan}</p>
                            <p class="text-[9px] text-slate-400 font-mono text-right whitespace-nowrap">${dateStr}</p>
                        </div>
                        <p class="text-[9px] text-slate-400 mb-1">${escapeHtml(subtitle)}</p>
                        <p class="font-black text-sm text-slate-800 text-right">${formatRp(nominal)}</p>
                    </div>
                </div>`;
        }
		
        function deleteBebanAction(id) {
            if(state.user.role !== 'Admin') return showToast('Hanya Admin!', 'error');
            Swal.fire({ 
                title: 'Batalkan Transaksi?', 
                text: 'Transaksi Kas ini akan dibatalkan permanen. Saldo Kas & Jurnal Umum akan kembali seperti semula.', 
                icon: 'warning', 
                showCancelButton: true, 
                confirmButtonColor: '#ef4444', 
                cancelButtonColor: '#94a3b8', 
                confirmButtonText: 'Ya, Batalkan!'
            }).then((result) => {
                if (result.isConfirmed) {
                    Swal.fire({title: 'Memproses...', allowOutsideClick: false, didOpen: () => {Swal.showLoading()}});
                    google.script.run.withSuccessHandler(function(r) {
                        if (!handleApiResponse(r, "Gagal batalkan transaksi: ")) return;

                        state.beban = state.beban.filter(function(x) { return x.id !== id; });
                        renderBebanList(); renderLabaRugi(); renderArusKas(); renderNeraca(); renderJurnal(); renderDashboard();
                        manualSync(true);
                        Swal.fire('Berhasil!', 'Transaksi dibatalkan.', 'success');
                    }).deleteBeban(storageManager.get('pos_token_final'), id);
                }
            });
        }

            // ══════════════════════════════════════════════════════════════
        // [PATCH v7.19] LAPORAN PRODUK TERLARIS & MENGUNTUNGKAN
        // ══════════════════════════════════════════════════════════════
        var _ptChartInstance = null;

        function renderProdukTerlaris() {
            var startEl = document.getElementById('pt-start');
            var endEl   = document.getElementById('pt-end');
            if (!startEl || !endEl) return;

            var now = new Date();
            if (!startEl.value || !endEl.value) {
                var firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                startEl.value = toLocalDateStr(firstDay);
                endEl.value   = toLocalDateStr(now);
            }

            var startTime = parseLocalDate(startEl.value).setHours(0, 0, 0, 0);
            var endTime   = parseLocalDate(endEl.value).setHours(23, 59, 59, 999);

            // ── 1. Agregasi dari transaksi barang ──
            var map = {};
            for (var i = 0; i < state.transactions.length; i++) {
                var t = state.transactions[i];
                // [FIX #3] HUTANG IKUT dihitung (barang fisik sudah keluar,
                // hanya pembayaran yang belum lunas). Konsisten dengan
                // analisisKategori() yang sudah include HUTANG.
                if (t.status === 'RETUR') continue;
                if (t.tanggal < startTime || t.tanggal > endTime) continue;

                var items = [];
                try { items = JSON.parse(t.cartJson); } catch(e) {}

                for (var j = 0; j < items.length; j++) {
                    var it = items[j];
                    if (!it.nama) continue;

                    var p = state.products.find(function(x){ return String(x.id) === String(it.id); });
                    var hpp = p ? (Number(p.hargaBeli) || 0) : 0;
                    var kat = p ? p.kategori : 'Lainnya';
                    var qty = Number(it.qty) || 0;
                    var jual = Number(it.hargaJual) || 0;

                    if (!map[it.nama]) {
                        map[it.nama] = { qty: 0, omzet: 0, hpp: 0, laba: 0, kategori: kat, isLayanan: false };
                    }
                    map[it.nama].qty   += qty;
                    map[it.nama].omzet += qty * jual;
                    map[it.nama].hpp   += qty * hpp;
                }
            }

            // ── 2. Agregasi Layanan Digital sebagai pseudo-produk ──
            for (var ld = 0; ld < (state.layananDigital || []).length; ld++) {
                var lay = state.layananDigital[ld];
                if (lay.tanggal < startTime || lay.tanggal > endTime) continue;

                var jenis   = String(lay.jenis);
                var nominal = Number(lay.nominal) || 0;
                var fee     = Number(lay.fee) || 0;
                var modal   = Number(lay.modal) || 0;

                var namaLayanan;
                if (jenis === 'TARIK_TUNAI')        namaLayanan = 'Tarik Tunai';
                else if (jenis === 'TOPUP_EWALLET') namaLayanan = 'Top Up E-Wallet';
                else {
                    var ket = String(lay.keterangan || '');
                    var idx = ket.lastIndexOf(' - ');
                    namaLayanan = idx > -1 ? ket.substring(0, idx).trim() : ket.trim();
                    if (!namaLayanan) namaLayanan = 'Produk Digital';
                }

                if (!map[namaLayanan]) {
                    map[namaLayanan] = { qty: 0, omzet: 0, hpp: 0, laba: 0, kategori: 'Layanan Digital', isLayanan: true };
                }

                // Revenue: PRODUK_DIGITAL = nominal; TARIK/TOPUP = fee (pass-through)
                var rev = (jenis === 'PRODUK_DIGITAL') ? nominal : fee;
                var hppL = (jenis === 'PRODUK_DIGITAL') ? modal : 0;

                map[namaLayanan].qty   += 1;
                map[namaLayanan].omzet += rev;
                map[namaLayanan].hpp   += hppL;
            }

            // ── 3. Hitung laba & margin ──
            var arr = [];
            for (var nama in map) {
                var m = map[nama];
                m.laba = m.omzet - m.hpp;
                m.margin = m.omzet > 0 ? (m.laba / m.omzet) * 100 : 0;
                m.nama = nama;
                arr.push(m);
            }

            // ── 4. Sort dinamis ──
            var sortEl = document.getElementById('pt-sort');
            var sortBy = sortEl ? sortEl.value : 'qty';
            arr.sort(function(a, b) { return (b[sortBy] || 0) - (a[sortBy] || 0); });

            // ── 5. Summary Cards ──
            var totalQty = 0, totalOmzet = 0, totalLaba = 0;
            for (var s = 0; s < arr.length; s++) {
                totalQty   += arr[s].qty;
                totalOmzet += arr[s].omzet;
                totalLaba  += arr[s].laba;
            }
            var totalMargin = totalOmzet > 0 ? (totalLaba / totalOmzet) * 100 : 0;

            var el;
            if ((el = document.getElementById('pt-total-produk'))) el.innerText = arr.length + ' item';
            if ((el = document.getElementById('pt-total-qty')))    el.innerText = totalQty + 'x';
            if ((el = document.getElementById('pt-total-omzet')))  el.innerText = formatRp(totalOmzet);
            if ((el = document.getElementById('pt-total-laba')))   el.innerText = formatRp(totalLaba);
            if ((el = document.getElementById('pt-total-margin'))) {
                el.innerText = totalMargin.toFixed(1) + '%';
                el.className = totalMargin >= 25 ? 'text-base md:text-lg font-black text-emerald-600'
                            : totalMargin >= 10 ? 'text-base md:text-lg font-black text-blue-600'
                            :                     'text-base md:text-lg font-black text-orange-600';
            }

            // ── 6. Render Tabel ──
            var tbody = document.getElementById('pt-tbody');
            if (tbody) {
                var html = '';
                var maxRank = Math.min(arr.length, 100);
                for (var k = 0; k < maxRank; k++) {
                    var it = arr[k];
                    var marginColor = it.margin >= 30 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                    : it.margin >= 15 ? 'text-blue-700 bg-blue-50 border-blue-200'
                                    :                   'text-orange-700 bg-orange-50 border-orange-200';
                    var rankColor = k === 0 ? 'text-yellow-500'
                                  : k === 1 ? 'text-slate-400'
                                  : k === 2 ? 'text-amber-700'
                                  :           'text-slate-300';
                    var layananBadge = it.isLayanan
                        ? '<span class="ml-1.5 text-[8px] font-black bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded align-middle">LAYANAN</span>'
                        : '';

                    html += '<tr class="hover:bg-slate-50 transition-colors border-b border-slate-50">' +
                        '<td class="p-3 text-center"><i class="fas fa-medal ' + rankColor + '"></i> <span class="font-bold text-xs">' + (k + 1) + '</span></td>' +
                        '<td class="p-3"><p class="font-extrabold text-slate-800 text-xs truncate max-w-[220px]">' + escapeHtml(it.nama) + layananBadge + '</p>' +
                            '<p class="text-[10px] text-slate-400 font-bold">' + escapeHtml(it.kategori) + '</p></td>' +
                        '<td class="p-3 text-center font-black text-slate-700">' + it.qty + 'x</td>' +
                        '<td class="p-3 text-right font-bold text-slate-700">' + formatRp(it.omzet) + '</td>' +
                        '<td class="p-3 text-right font-bold text-orange-600 text-[10px]">' + formatRp(it.hpp) + '</td>' +
                        '<td class="p-3 text-right font-black text-emerald-600">' + formatRp(it.laba) + '</td>' +
                        '<td class="p-3 text-center"><span class="text-[10px] font-black border px-2 py-0.5 rounded ' + marginColor + '">' + it.margin.toFixed(1) + '%</span></td>' +
                        '</tr>';
                }
                tbody.innerHTML = html || '<tr><td colspan="7" class="text-center p-8 text-slate-400 font-bold">Tidak ada data penjualan pada periode ini.</td></tr>';
            }

            // ── 7. Render Chart Top 10 ──
            renderProdukTerlarisChart(arr.slice(0, 10), sortBy);

            // ── 8. Update Header Print ──
            var tokoEl = document.getElementById('ui-pt-toko');
            if (tokoEl) tokoEl.innerText = (state.setup['Nama Toko'] || 'POS Pro').toUpperCase();
            var perEl = document.getElementById('pt-periode-text');
            if (perEl) {
                var opts = { day: '2-digit', month: 'short', year: 'numeric' };
                perEl.innerText = 'Periode: ' + new Date(startTime).toLocaleDateString('id-ID', opts) + ' s/d ' + new Date(endTime).toLocaleDateString('id-ID', opts);
            }
        }

        function renderProdukTerlarisChart(top10, sortBy) {
            if (typeof Chart === 'undefined') return;
            var canvas = document.getElementById('ptChart');
            if (!canvas) return;

            if (_ptChartInstance) { _ptChartInstance.destroy(); _ptChartInstance = null; }

            if (!top10 || top10.length === 0) {
                var ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                return;
            }

            var labels = top10.map(function(x) {
                return x.nama.length > 22 ? x.nama.substring(0, 22) + '…' : x.nama;
            });

            var data, label, color;
            if (sortBy === 'laba')        { data = top10.map(function(x){ return x.laba; });   label = 'Laba';      color = 'rgba(16,185,129,0.8)'; }
            else if (sortBy === 'omzet')  { data = top10.map(function(x){ return x.omzet; });  label = 'Omzet';     color = 'rgba(37,99,235,0.8)'; }
            else if (sortBy === 'margin') { data = top10.map(function(x){ return x.margin; }); label = 'Margin (%)';color = 'rgba(245,158,11,0.8)'; }
            else                          { data = top10.map(function(x){ return x.qty; });    label = 'Qty';       color = 'rgba(139,92,246,0.8)'; }

            _ptChartInstance = new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{ label: label, data: data, backgroundColor: color, borderRadius: 4 }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(ctx2) {
                                    if (sortBy === 'margin') return ctx2.parsed.x.toFixed(1) + '%';
                                    if (sortBy === 'qty')    return ctx2.parsed.x + ' unit';
                                    return 'Rp ' + Number(ctx2.parsed.x).toLocaleString('id-ID');
                                }
                            }
                        }
                    },
                    scales: {
                        x: { beginAtZero: true, ticks: { font: { size: 10 } } },
                        y: { grid: { display: false }, ticks: { font: { size: 10 } } }
                    }
                }
            });
        }
        
        // ═══════════════════════════════════════════════════════════════
        // [PATCH v7.19] Laba Rugi — pakai Unified Engine (konsisten dgn header)
        // ═══════════════════════════════════════════════════════════════
        function renderLabaRugi() {
            var startInput = document.getElementById('lr-start');
            var endInput   = document.getElementById('lr-end');
            if (!startInput || !endInput) return;

            if (!startInput.value || !endInput.value) {
                var now = new Date();
                var firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                startInput.value = toLocalDateStr(firstDay);
                endInput.value   = toLocalDateStr(now);
            }

            var startObj = parseLocalDate(startInput.value); startObj.setHours(0, 0, 0, 0);
            var endObj   = parseLocalDate(endInput.value);   endObj.setHours(23, 59, 59, 999);

            // ── Pakai engine yang sama dengan header ──
            var m = computeFinancialMetrics(startObj.getTime(), endObj.getTime());

            // Render values
            document.getElementById('lr-pendapatan-barang').innerText   = formatRp(m.pendapatanBarang);
            document.getElementById('lr-pendapatan-layanan').innerText  = formatRp(m.pendapatanLayanan);
            document.getElementById('lr-retur').innerText               = '- ' + formatRp(m.returPenjualan);
            document.getElementById('lr-diskon').innerText              = '- ' + formatRp(m.diskonPenjualan);
            document.getElementById('lr-pendapatan').innerText          = formatRp(m.pendapatanNeto);
            document.getElementById('lr-hpp').innerText                 = '- ' + formatRp(m.hppBarang);
            document.getElementById('lr-hpp-digital').innerText         = '- ' + formatRp(m.hppDigital);
            document.getElementById('lr-kotor').innerText               = formatRp(m.labaKotor);
            document.getElementById('lr-beban-total').innerText         = formatRp(m.bebanOperasional);

            // Rincian beban
            // [FIX #15] Pisahkan pendapatan lain dari beban operasional
            // 1. Rincian Pendapatan Lain (dari akun 413/414/415)
            var htmlPendapatanLain = '';
            // ═══ [PATCH M2] Rincian per COA untuk Pendapatan Lain ═══
            var detailsPendapatanLain = [
                { kode: '413', label: 'Pendapatan Lain-lain', color: 'text-emerald-400' },
                { kode: '414', label: 'Pendapatan Selisih Persediaan', color: 'text-emerald-400' },
                { kode: '415', label: 'Pendapatan Selisih Kas', color: 'text-emerald-400' }
            ];
            var htmlPendapatanLain = '';
            var adaPL = false;
            for (var dp = 0; dp < detailsPendapatanLain.length; dp++) {
                var acc = detailsPendapatanLain[dp];
                var nilai = m.rincianPendapatan[acc.label] || m.rincianPendapatan['Pendapatan ' + acc.label] || 0;
                if (nilai > 0) {
                    adaPL = true;
                    htmlPendapatanLain +=
                        '<div class="report-row">' +
                            '<span class="label"><i class="fas fa-plus-circle ' + acc.color + '"></i>' + acc.label + ' (' + acc.kode + ')</span>' +
                            '<span class="value text-emerald-600">+ ' + formatRp(nilai) + '</span>' +
                        '</div>';
                }
            }
            if (!adaPL) {
                htmlPendapatanLain = '<div class="text-center py-4 text-slate-400 text-xs italic">Tidak ada pendapatan lain</div>';
            }
            document.getElementById('lr-rincian-pendapatan-lain').innerHTML = htmlPendapatanLain;
            var _plTotEl = document.getElementById('lr-pendapatan-lain-total');
            if (_plTotEl) _plTotEl.innerText = formatRp(m.pendapatanLain);

            // 2. Rincian Beban Operasional (5xx selain HPP)
            var htmlBeban = '';
            var cats = Object.keys(m.rincianBeban);
            if (cats.length === 0) {
                htmlBeban = '<div class="text-center py-4 text-slate-400 text-xs italic">Tidak ada beban operasional</div>';
            } else {
                for (var c = 0; c < cats.length; c++) {
                    var nominal = m.rincianBeban[cats[c]];
                    var isNeg   = nominal >= 0;
                    var cls     = isNeg ? 'report-row is-negative' : 'report-row';
                    var tanda   = isNeg ? '- ' : '+ ';
                    htmlBeban += '<div class="' + cls + '">' +
                                    '<span class="label">' + escapeHtml(cats[c]) + '</span>' +
                                    '<span class="value">' + tanda + formatRp(Math.abs(nominal)) + '</span>' +
                                '</div>';
                }
            }
            document.getElementById('lr-rincian-beban').innerHTML = htmlBeban;

            // Grand total
            var lrBersihEl = document.getElementById('lr-bersih');
            lrBersihEl.innerText = formatRp(m.labaBersih);
            document.getElementById('lr-grand-total-row').classList.toggle('is-loss', m.labaBersih < 0);

            // Header
            document.getElementById('ui-lr-toko').innerText = escapeHtml(state.setup['Nama Toko'] || 'POS Pro');
            var formatOpts = { day: '2-digit', month: 'short', year: 'numeric' };
            document.getElementById('lr-periode-text').innerText =
                'Periode: ' + startObj.toLocaleDateString('id-ID', formatOpts) +
                ' s/d ' + endObj.toLocaleDateString('id-ID', formatOpts);
        }
        
        // [PATCH A1/A2/A3] Arus Kas 3-Section
        function renderArusKas() {
            var startInput = document.getElementById('ak-start').value;
            var endInput = document.getElementById('ak-end').value;
            if (!startInput || !endInput) {
                var now = new Date();
                var firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                startInput = toLocalDateStr(firstDay);
                endInput = toLocalDateStr(now);
                var elStart = document.getElementById('ak-start');
                var elEnd = document.getElementById('ak-end');
                if (elStart) elStart.value = startInput;
                if (elEnd) elEnd.value = endInput;
            }
            var startTime = parseLocalDate(startInput).setHours(0, 0, 0, 0);
            var endTime   = parseLocalDate(endInput).setHours(23, 59, 59, 999);

            // Inisialisasi kategori
            var masukJual = 0, masukLayanan = 0, masukPiutang = 0;
            var masukPendapatanLain = 0;   // ← TAMBAH
            var keluarBeli = 0, keluarBeban = 0, keluarReversal = 0, keluarTransfer = 0;
            var keluarSelisihKas = 0;      // ← TAMBAH
            var investKeluar = 0;
            var pendanaanModal = 0, pendanaanPinjamIn = 0, pendanaanPinjamOut = 0;

            if (!state.jurnal) state.jurnal = [];

            // Pre-build map: idJurnal → list of {kodeAkun, debit, kredit}
            var jurnalMap = {};
            for (var p = 0; p < state.jurnal.length; p++) {
                var jp = state.jurnal[p];
                if (jp.tanggal < startTime || jp.tanggal > endTime) continue;
                if (!jurnalMap[jp.idJurnal]) jurnalMap[jp.idJurnal] = [];
                jurnalMap[jp.idJurnal].push({
                    kode: String(jp.kodeAkun).trim(),
                    d: jp.debit || 0,
                    k: jp.kredit || 0
                });
            }

            // Helper: cek apakah jurnal idJurnal berisi kodeAkun dengan saldo tertentu
            function jurnalHas(idJurnal, kodeTarget, arah) {
                var arr = jurnalMap[idJurnal] || [];
                for (var q = 0; q < arr.length; q++) {
                    if (arr[q].kode !== kodeTarget) continue;
                    if (arah === 'D' && arr[q].d > 0) return true;
                    if (arah === 'K' && arr[q].k > 0) return true;
                }
                return false;
            }

            // Loop utama (ganti for sebelumnya)
            for (var i = 0; i < state.jurnal.length; i++) {
                var j = state.jurnal[i];
                if (j.tanggal < startTime || j.tanggal > endTime) continue;

                var kodeAkun = String(j.kodeAkun).trim();
                var d = j.debit || 0;
                var k = j.kredit || 0;
                var ref = String(j.refId || '').toUpperCase();
                var idJ = j.idJurnal;

                if (kodeAkun !== '111' && kodeAkun !== '115') continue;

                // [PATCH v7.19 #8] Whitelist prefix eksplisit — hindari false-positive
                // substring (mis. TRX yang mengandung 'PLN' di tengah refId)
                var REF_PREFIXES = {
                    TRX: true, ONL: true, TARIK: true, TUPW: true, DIGI: true,
                    BELI: true, RESTOCK: true, EXP: true, SHF: true,
                    SETTLE: true, TOPUP: true, IMPORT: true,
                    SELISIHKAS: true, TUTUPBUKU: true
                };
                function isPrefixOf(refStr, prefix) {
                    // Cek prefix + delimiter (- atau end of string)
                    if (refStr.indexOf(prefix) !== 0) return false;
                    var after = refStr.charAt(prefix.length);
                    return after === '' || after === '-' || after === '_';
                }
                function hasSuffix(refStr, suffix) {
                    // Cek suffix harus di akhir atau diikuti delimiter
                    var idx = refStr.lastIndexOf(suffix);
                    if (idx === -1) return false;
                    var after = refStr.charAt(idx + suffix.length);
                    return after === '' || after === '-' || after === '_';
                }

                var isReversalBeban   = hasSuffix(ref, '-REV');
                var isReversalRestock = hasSuffix(ref, '-RET') || hasSuffix(ref, '-RTR');
                var isTopupEWallet    = isPrefixOf(ref, 'TUPW');
                var isTarikTunai      = isPrefixOf(ref, 'TARIK');

                // ============ SISI DEBIT ============
                if (d > 0) {
                    if (isTopupEWallet) { masukLayanan += d; }
                    else if (ref.indexOf('-PLN') > -1) { masukPiutang += d; }
                    else if (ref.indexOf('-MODAL') > -1) { pendanaanModal += d; }
                    else if (ref.indexOf('SETTLE') > -1) {
                      // [PATCH #5] Settlement QRIS = uang MASUK ke bank → harus terhitung sebagai kas inflow
                      masukJual += d;
                    }
                    else if (isReversalBeban) { keluarBeban -= d; }
                    else if (isReversalRestock) { keluarBeli -= d; }
                    else if (ref.indexOf('REKKAS-') === 0 || hasSuffix(ref, '-SELISIH')) { masukPendapatanLain += d; }
                    else if (jurnalHas(idJ, '212', 'K')) { pendanaanPinjamIn += d; }        // ← BUG #3 FIX
                    else if (jurnalHas(idJ, '311', 'K')) { pendanaanModal += d; }
                    else if (jurnalHas(idJ, '121', 'D') || jurnalHas(idJ, '122', 'D')) { /* transfer aset, skip */ }
                    // BUG #4 FIX: pendapatan lain → masuk operasional (bukan penjualan)
                    else if (jurnalHas(idJ, '413', 'K') || jurnalHas(idJ, '414', 'K') || jurnalHas(idJ, '415', 'K')) { masukPendapatanLain += d; }
                    else if (isTarikTunai) { masukLayanan += d; }
                    else if (ref.indexOf('TRX') === 0 || ref.indexOf('ONL') === 0) { masukJual += d; }
                    else { masukJual += d; }
                }
                // ============ SISI KREDIT ============
                else if (k > 0) {
                    if (isTopupEWallet) { keluarTransfer += k; }
                    else if (ref.indexOf('BELI') === 0 || ref.indexOf('RESTOCK') === 0) {
                        if (isReversalRestock) keluarBeli -= k;
                        else keluarBeli += k;
                    }
                    else if (isReversalBeban) { keluarBeban -= k; }
                    else if (ref.indexOf('SETTLE') > -1 || ref.indexOf('TOPUP') === 0) { /* skip — internal transfer GoPay (115↔116 ↔ 117), bukan beban */ }
                    else if (ref.indexOf('REKKAS-') === 0 || hasSuffix(ref, '-SELISIH')) { keluarSelisihKas += k; }
                    else if (jurnalHas(idJ, '212', 'D')) { pendanaanPinjamOut += k; }
                    else if (jurnalHas(idJ, '121', 'D') || jurnalHas(idJ, '122', 'D')) {
                        investKeluar += k;
                    }
                    else if (isTarikTunai) { keluarBeban += k; }
                    else { keluarBeban += k; }
                }
            }

            // Total
            var totalMasukOps = masukJual + masukLayanan + masukPiutang + masukPendapatanLain;
            var totalKeluarOps = keluarBeli + keluarBeban + keluarReversal + keluarTransfer + keluarSelisihKas;
            var netOps = totalMasukOps - totalKeluarOps;
            var netInvest = -investKeluar;
            var netPendanaan = pendanaanModal + pendanaanPinjamIn - pendanaanPinjamOut;
            var kenaikanKas = netOps + netInvest + netPendanaan;

            // Render ke UI
            var el;
            if ((el = document.getElementById('ak-masuk-jual')))       el.innerText = formatRp(masukJual);
            if ((el = document.getElementById('ak-masuk-layanan')))    el.innerText = formatRp(masukLayanan);
            if ((el = document.getElementById('ak-masuk-piutang')))    el.innerText = formatRp(masukPiutang);
            if ((el = document.getElementById('ak-sub-operasi-masuk'))) el.innerText = formatRp(totalMasukOps);
            if ((el = document.getElementById('ak-keluar-beli')))      el.innerText = formatRp(keluarBeli);
            if ((el = document.getElementById('ak-keluar-beban')))     el.innerText = formatRp(keluarBeban);
            if ((el = document.getElementById('ak-keluar-reversal')))  el.innerText = formatRp(keluarReversal);
            if ((el = document.getElementById('ak-keluar-transfer')))  el.innerText = formatRp(keluarTransfer);
            if ((el = document.getElementById('ak-sub-operasi-keluar'))) el.innerText = formatRp(totalKeluarOps);
            if ((el = document.getElementById('ak-net-operasi')))      el.innerText = formatRp(netOps);
            if ((el = document.getElementById('ak-invest-keluar')))    el.innerText = formatRp(investKeluar);
            if ((el = document.getElementById('ak-net-investasi')))    el.innerText = formatRp(netInvest);
            if ((el = document.getElementById('ak-pendanaan-modal')))  el.innerText = formatRp(pendanaanModal);
            if ((el = document.getElementById('ak-pendanaan-pinjam-in'))) el.innerText = formatRp(pendanaanPinjamIn);
            if ((el = document.getElementById('ak-pendanaan-pinjam-out'))) el.innerText = formatRp(pendanaanPinjamOut);
            if ((el = document.getElementById('ak-net-pendanaan')))    el.innerText = formatRp(netPendanaan);
            if ((el = document.getElementById('ak-masuk-selisih'))) el.innerText = formatRp(masukPendapatanLain);
            if ((el = document.getElementById('ak-keluar-selisih'))) el.innerText = formatRp(keluarSelisihKas);
            if ((el = document.getElementById('ak-bersih'))) {
                el.innerText = formatRp(kenaikanKas);
                el.className = kenaikanKas < 0 ? 'text-xl md:text-2xl font-black text-red-600' : 'text-xl md:text-2xl font-black text-blue-700';
            }

            var tokoEl = document.getElementById('ui-ak-toko');
            if (tokoEl) tokoEl.innerText = escapeHtml(state.setup['Nama Toko'] || 'POS Pro');
            var periodeEl = document.getElementById('ak-periode-text');
            if (periodeEl) {
                var formatOpts = { day: '2-digit', month: 'short', year: 'numeric' };
                periodeEl.innerText = 'Periode: ' + new Date(startTime).toLocaleDateString('id-ID', formatOpts) + ' s/d ' + new Date(endTime).toLocaleDateString('id-ID', formatOpts);
            }
        }
        
        // [PATCH A4/A7] Neraca + Cross-check + Tutup Buku
        function renderNeraca() {
            var totalKas = 0, piutang = 0, persediaan = 0, perlengkapan = 0;
            var bankQris = 0, piutangGopay = 0, depositGopay = 0;
            var asetTetap = 0, akumPenyusutan = 0;
            var hutangDagang = 0, hutangPinjaman = 0;
            var modalTambahan = 0, labaDitahan = 0, labaDitahanPermanen = 0;

            var dateInput = document.getElementById('nrc-date');
            var cutoffDate = new Date();
            if (dateInput && dateInput.value) cutoffDate = parseLocalDate(dateInput.value);
            else if (dateInput) dateInput.value = toLocalDateStr(cutoffDate);
            cutoffDate.setHours(23, 59, 59, 999);
            var cutoffTime = cutoffDate.getTime();

            // ✅ GANTI blok for loop dengan:
			var _sb = state._saldoByAccount || {};
			var totalKas       = Number(_sb['111']) || 0;
			var bankQris       = Number(_sb['115']) || 0;
			var piutangGopay   = Number(_sb['116']) || 0;
			var depositGopay   = Number(_sb['117']) || 0;
			var piutang        = Number(_sb['112']) || 0;
			var persediaan     = Number(_sb['113']) || 0;
			var perlengkapan   = Number(_sb['114']) || 0;
			var asetTetap      = Number(_sb['121']) || 0;
			var akumPenyusutan = Math.abs(Number(_sb['122']) || 0);
			var hutangDagang   = Math.abs(Number(_sb['211']) || 0);
			var hutangPinjaman = Math.abs(Number(_sb['212']) || 0);
			var modalTambahan  = Math.abs(Number(_sb['311']) || 0);
			var labaDitahanPermanen = Math.abs(Number(_sb['312']) || 0);
			
			// Laba tahun berjalan = -(total 4xx + total 5xx)
			var total4 = 0, total5 = 0;
			for (var _k in _sb) {
			    if (_k.startsWith('4')) total4 += Number(_sb[_k]) || 0;
			    else if (_k.startsWith('5')) total5 += Number(_sb[_k]) || 0;
			}
			var labaDitahan = -(total4 + total5);

            // [PATCH A7] Cross-check persediaan dari tabel produk
            var persediaanFisik = 0;
            var persediaanDeleted = 0;
            for (var p = 0; p < state.products.length; p++) {
                var prod = state.products[p];
                var stok = Number(prod.stok) || 0;
                var hpp = Number(prod.hargaBeli) || 0;
                persediaanFisik += (stok * hpp);
            }
            var selisihPers = persediaanFisik - persediaan;

            var nilaiBukuAsetTetap = asetTetap - akumPenyusutan;
            var totalAset = totalKas + bankQris + piutangGopay + depositGopay + piutang + persediaan + perlengkapan + nilaiBukuAsetTetap;
            var hutang = hutangPinjaman + hutangDagang;
            var modal = modalTambahan + labaDitahan + labaDitahanPermanen;
            var totalPasiva = hutang + modal;
            var selisihNeraca = totalAset - totalPasiva;

            var asetHtml = `
                <div class="flex justify-between text-sm font-semibold text-slate-700 py-1.5"><span>Kas Fisik</span><span>${formatRp(totalKas)}</span></div>
                <div class="flex justify-between text-sm font-semibold text-slate-700 py-1.5"><span>Bank / Settlement QRIS</span><span>${formatRp(bankQris)}</span></div>
                <div class="flex justify-between text-sm font-semibold text-slate-700 py-1.5"><span>Piutang GoPay (In Transit)</span><span>${formatRp(piutangGopay)}</span></div>
                <div class="flex justify-between text-sm font-semibold text-slate-700 py-1.5"><span>Deposit GoPay Merchant</span><span>${formatRp(depositGopay)}</span></div>
                <div class="flex justify-between text-sm font-semibold text-slate-700 py-1.5"><span>Piutang Usaha</span><span>${formatRp(piutang)}</span></div>
                <div class="flex justify-between text-sm font-semibold text-slate-700 py-1.5"><span>Persediaan Barang</span><span>${formatRp(persediaan)}</span></div>
                <div class="flex justify-between text-sm font-semibold text-slate-700 py-1.5"><span>Perlengkapan Toko</span><span>${formatRp(perlengkapan)}</span></div>
                <h5 class="font-bold text-xs text-blue-600 mt-4 mb-1">Aset Tetap</h5>
                <div class="flex justify-between text-sm font-semibold text-slate-700 py-1"><span>Peralatan/Mesin</span><span>${formatRp(asetTetap)}</span></div>
                <div class="flex justify-between text-sm font-semibold text-red-500 py-1"><span>Akumulasi Penyusutan</span><span>-${formatRp(akumPenyusutan)}</span></div>
                <div class="flex justify-between text-xs font-bold text-slate-500 py-1 border-t border-slate-100 border-dashed"><span>Nilai Buku Peralatan</span><span>${formatRp(nilaiBukuAsetTetap)}</span></div>
                <div class="flex justify-between text-sm font-black text-blue-900 mt-4 pt-2 border-t border-slate-300"><span>TOTAL ASET</span><span>${formatRp(totalAset)}</span></div>
            `;
            var pasivaHtml = `
                <div class="flex justify-between text-sm font-semibold text-slate-700 py-1.5"><span>Hutang Dagang (Kredit Supplier)</span><span class="text-red-500">${formatRp(hutangDagang)}</span></div>
                <div class="flex justify-between text-sm font-semibold text-red-600 py-1.5"><span>Hutang Pinjaman/Bank</span><span>${formatRp(hutangPinjaman)}</span></div>
                <div class="flex justify-between text-sm font-semibold text-slate-700 py-1.5 mt-2 border-t border-slate-100"><span>Modal Usaha &amp; Laba Ditahan</span><span>${formatRp(modal)}</span></div>
                <div class="flex justify-between text-xs text-slate-500 py-0.5"><span style="padding-left:1rem;">• Modal Pemilik (311)</span><span>${formatRp(modalTambahan)}</span></div>
                <div class="flex justify-between text-xs text-slate-500 py-0.5"><span style="padding-left:1rem;">• Laba Ditahan (312)</span><span>${formatRp(labaDitahanPermanen)}</span></div>
                <div class="flex justify-between text-xs text-slate-500 py-0.5"><span style="padding-left:1rem;">• Laba Tahun Berjalan</span><span>${formatRp(labaDitahan)}</span></div>
                <div class="flex justify-between text-sm font-black text-orange-900 mt-3 pt-2 border-t border-slate-300"><span>TOTAL KEWAJIBAN &amp; EKUITAS</span><span>${formatRp(totalPasiva)}</span></div>
            `;
            var asetContainer   = document.querySelector('#rep-neraca .report-grid-2 > div:nth-child(1)');
            var pasivaContainer = document.querySelector('#rep-neraca .report-grid-2 > div:nth-child(2)');

            if (asetContainer) {
                asetContainer.innerHTML =
                    '<h4 class="font-black text-sm text-blue-700 border-b-2 border-blue-200 pb-2 mb-3 uppercase tracking-wider">Aset (Harta)</h4>'
                    + asetHtml;
            } else {
                console.warn('[renderNeraca] Container aset tidak ditemukan.');
            }
            if (pasivaContainer) {
                pasivaContainer.innerHTML =
                    '<h4 class="font-black text-sm text-orange-700 border-b-2 border-orange-200 pb-2 mb-3 uppercase tracking-wider">Kewajiban &amp; Ekuitas</h4>'
                    + pasivaHtml;
            } else {
                console.warn('[renderNeraca] Container pasiva tidak ditemukan.');
            }

            document.getElementById('ui-nrc-toko').innerText = escapeHtml(state.setup['Nama Toko'] || 'POS Pro');
            var dateOpts = { day: '2-digit', month: 'short', year: 'numeric' };
            document.getElementById('nrc-periode-text').innerText = 'Per Tanggal ' + cutoffDate.toLocaleDateString('id-ID', dateOpts);

            var statusEl = document.getElementById('nrc-balance-status');
            if (Math.abs(selisihNeraca) < 1) {
                statusEl.innerHTML = '<span class="text-emerald-500"><i class="fas fa-check-circle mr-1"></i> SEIMBANG</span>';
            } else {
                statusEl.innerHTML = '<span class="text-red-500"><i class="fas fa-exclamation-triangle mr-1"></i> TIDAK SEIMBANG (Selisih: ' + formatRp(selisihNeraca) + ')</span>';
            }

            // [PATCH A7] Render cross-check
            var elPJ = document.getElementById('nrc-pers-jurnal');
            var elPF = document.getElementById('nrc-pers-fisik');
            var elPS = document.getElementById('nrc-pers-selisih');
            // Setelah baris nrc-pers-selisih
            if (Math.abs(selisihPers) >= 10000) {
                console.warn('[Neraca Cross-Check] Selisih > Rp 10.000. Kemungkinan penyebab:\n' +
                              '1. Ada produk soft-deleted (Deleted=TRUE) yang masih punya stok\n' +
                              '2. Ada opname yang belum dijurnal\n' +
                              '3. HPP produk berubah setelah penjualan (metode AVERAGE)\n' +
                              'Selisih: ' + formatRp(selisihPers));   // ← hapus "Rp " prefix
            }
            if (elPJ) elPJ.innerText = formatRp(persediaan);
            if (elPF) elPF.innerText = formatRp(persediaanFisik);
            if (elPS) {
                elPS.innerText = formatRp(selisihPers);
                elPS.className = Math.abs(selisihPers) < 1 ? 'font-black text-emerald-600' : (Math.abs(selisihPers) < 10000 ? 'font-black text-amber-600' : 'font-black text-red-600');
            }
        }

        // [PATCH A6/U4] Jurnal + Search + Balance indicator
        function renderJurnal() {
            var startInput = document.getElementById('jur-start').value;
            var endInput = document.getElementById('jur-end').value;
            var now = new Date();
            if (!startInput || !endInput) {
                var firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                startInput = toLocalDateStr(firstDay);
                endInput = toLocalDateStr(now);
                document.getElementById('jur-start').value = startInput;
                document.getElementById('jur-end').value = endInput;
            }
            var startTime = parseLocalDate(startInput).setHours(0, 0, 0, 0);
            var endTime   = parseLocalDate(endInput).setHours(23, 59, 59, 999);

            // [PATCH U4] Ambil query pencarian
            var searchInput = document.getElementById('jur-search');
            var q = searchInput ? String(searchInput.value).toLowerCase().trim() : '';

            var tbody = document.getElementById('jur-tbody');
            var html = '';
            var totalDebit = 0;
            var totalKredit = 0;

            var filteredJurnal = state.jurnal.filter(function(j) {
                if (j.tanggal < startTime || j.tanggal > endTime) return false;
                if (q) {
                    var ket = String(j.keterangan || '').toLowerCase();
                    var ref = String(j.refId || '').toLowerCase();
                    var akun = String(j.namaAkun || '').toLowerCase();
                    var kode = String(j.kodeAkun || '').toLowerCase();
                    if (ket.indexOf(q) === -1 && ref.indexOf(q) === -1 && akun.indexOf(q) === -1 && kode.indexOf(q) === -1) return false;
                }
                return true;
            });

            var grouped = {};
            filteredJurnal.forEach(function(j) {
                if (!grouped[j.idJurnal]) grouped[j.idJurnal] = { tanggal: j.tanggal, desc: j.keterangan, entries: [] };
                grouped[j.idJurnal].entries.push(j);
            });
            var events = Object.values(grouped).sort(function(a, b) { return a.tanggal - b.tanggal; });

            if (events.length === 0) {
                html = '<tr><td colspan="5" class="text-center p-8 text-slate-400 font-bold">' + (q ? 'Tidak ada jurnal yang cocok dengan pencarian.' : 'Tidak ada jurnal untuk periode ini.') + '</td></tr>';
            } else {
                for (var k = 0; k < events.length; k++) {
                    var ev = events[k];
                    var dtStr = new Date(ev.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    html += '<tr class="bg-slate-50/50"><td class="p-3 align-top font-bold text-slate-500">' + dtStr + '</td><td colspan="4" class="p-3 font-extrabold text-blue-600 text-xs">[' + escapeHtml(ev.desc) + ']</td></tr>';

                    var subDebit = 0, subKredit = 0;
                    for (var e = 0; e < ev.entries.length; e++) {
                        var ent = ev.entries[e];
                        totalDebit += ent.debit;
                        totalKredit += ent.kredit;
                        subDebit += ent.debit;
                        subKredit += ent.kredit;
                        var isCredit = ent.kredit > 0;
                        var accountName = isCredit
                            ? '<span class="ml-6 text-slate-600">' + escapeHtml(ent.namaAkun) + '</span>'
                            : '<span class="font-bold text-slate-700">' + escapeHtml(ent.namaAkun) + '</span>';
                        html += '<tr><td class="p-2 border-none"></td>'
                            + '<td class="p-2 border-none border-b border-slate-50">' + accountName + '</td>'
                            + '<td class="p-2 text-center text-slate-400 font-mono text-[10px]">' + escapeHtml(ent.kodeAkun) + '</td>'
                            + '<td class="p-2 text-right">' + (ent.debit > 0 ? formatRp(ent.debit) : '-') + '</td>'
                            + '<td class="p-2 text-right">' + (ent.kredit > 0 ? formatRp(ent.kredit) : '-') + '</td></tr>';
                    }
                }
            }

            tbody.innerHTML = html;
            document.getElementById('jur-total-debit').innerText = formatRp(totalDebit);
            document.getElementById('jur-total-kredit').innerText = formatRp(totalKredit);

            // [PATCH A6] Balance indicator
            var selisihJurnal = totalDebit - totalKredit;
            var balEl = document.getElementById('jur-balance-status');
            if (balEl) {
                if (Math.abs(selisihJurnal) < 1) {
                    balEl.innerHTML = '<span class="text-emerald-600 font-black text-xs"><i class="fas fa-check-circle mr-1"></i> JURNAL BALANCE ✓</span>';
                } else {
                    balEl.innerHTML = '<span class="text-red-600 font-black text-xs"><i class="fas fa-exclamation-triangle mr-1"></i> TIDAK BALANCE: ' + formatRp(selisihJurnal) + '</span>';
                }
            }

            document.getElementById('ui-jur-toko').innerText = escapeHtml(state.setup['Nama Toko'] || 'POS Pro');
            var formatOpts = { day: '2-digit', month: 'short', year: 'numeric' };
            document.getElementById('jur-periode-text').innerText = 'Periode: ' + new Date(startTime).toLocaleDateString('id-ID', formatOpts) + ' s/d ' + new Date(endTime).toLocaleDateString('id-ID', formatOpts);
        }

        // [PATCH A5] Buku Besar per COA
        var BUKU_BESAR_COA = [
            { kode: '111', nama: 'Kas' },
            { kode: '112', nama: 'Piutang Usaha' },
            { kode: '113', nama: 'Persediaan Barang Dagang' },
            { kode: '114', nama: 'Perlengkapan Toko' },
            { kode: '115', nama: 'Bank / Settlement QRIS' },
            { kode: '116', nama: 'Piutang GoPay (In Transit)' },
            { kode: '117', nama: 'Deposit GoPay Merchant' },
            { kode: '121', nama: 'Peralatan/Mesin Toko' },
            { kode: '122', nama: 'Akumulasi Penyusutan' },
            { kode: '211', nama: 'Hutang Usaha' },
            { kode: '212', nama: 'Hutang Pinjaman' },
            { kode: '311', nama: 'Modal Pemilik' },
            { kode: '312', nama: 'Laba Ditahan' },
            { kode: '411', nama: 'Pendapatan Penjualan' },
            { kode: '412', nama: 'Retur Penjualan' },
            { kode: '412.1', nama: 'Diskon Penjualan' },
            { kode: '413', nama: 'Pendapatan Lain-lain' },
            { kode: '414', nama: 'Pendapatan Selisih Persediaan' },
            { kode: '415', nama: 'Pendapatan Selisih Kas' },
            { kode: '421', nama: 'Fee Tarik Tunai' },
            { kode: '422', nama: 'Pendapatan Produk Digital' },
            { kode: '423', nama: 'Fee Top Up E-Wallet' },
            { kode: '511', nama: 'HPP Barang' },
            { kode: '512.1', nama: 'HPP Produk Digital' },
            { kode: '519', nama: 'Beban Selisih Persediaan' },
            { kode: '521', nama: 'Beban Selisih Kas' }
        ];

        function renderBukuBesar() {
            // Populate dropdown sekali saja
            var selEl = document.getElementById('bb-akun');
            if (selEl && selEl.options.length <= 1) {
                for (var i = 0; i < BUKU_BESAR_COA.length; i++) {
                    var opt = document.createElement('option');
                    opt.value = BUKU_BESAR_COA[i].kode;
                    opt.innerText = BUKU_BESAR_COA[i].kode + ' — ' + BUKU_BESAR_COA[i].nama;
                    selEl.appendChild(opt);
                }
                selEl.value = '111';  // default: Kas
            }

            var kodeAkun = selEl ? selEl.value : '111';
            if (!kodeAkun) return;

            var startInput = document.getElementById('bb-start').value;
            var endInput = document.getElementById('bb-end').value;
            var now = new Date();
            if (!startInput || !endInput) {
                var firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                startInput = toLocalDateStr(firstDay);
                endInput = toLocalDateStr(now);
                document.getElementById('bb-start').value = startInput;
                document.getElementById('bb-end').value = endInput;
            }
            var startTime = parseLocalDate(startInput).setHours(0, 0, 0, 0);
            var endTime   = parseLocalDate(endInput).setHours(23, 59, 59, 999);

            // ═══ [PATCH H3] Deteksi saldo normal akun ═══
            var saldoNormalKredit = ['211','212','311','312','411','412','412.1','413','414','415','421','422','423'].indexOf(kodeAkun) > -1;
            var labelSaldo = saldoNormalKredit ? 'Saldo (Kredit)' : 'Saldo (Debit)';

            // Hitung saldo awal (sebelum startTime)
            var saldo = 0;
            for (var s = 0; s < state.jurnal.length; s++) {
                var js = state.jurnal[s];
                if (String(js.kodeAkun).trim() !== kodeAkun) continue;
                if (js.tanggal >= startTime) continue;
                saldo += (js.debit || 0) - (js.kredit || 0);
            }
            var saldoAwal = saldo;

            // Kumpulkan entries dalam range
            var entries = [];
            for (var i = 0; i < state.jurnal.length; i++) {
                var j = state.jurnal[i];
                if (String(j.kodeAkun).trim() !== kodeAkun) continue;
                if (j.tanggal < startTime || j.tanggal > endTime) continue;
                entries.push(j);
            }
            entries.sort(function(a, b) { return a.tanggal - b.tanggal; });

            // Render
            var tbody = document.getElementById('bb-tbody');
            var html = '';
            var totalD = 0, totalK = 0;

            // Baris saldo awal
            var saldoAwalDisplay = saldoNormalKredit ? -saldoAwal : saldoAwal;
            html += '<tr class="bg-slate-50/60 border-b border-slate-100">'
                + '<td class="p-3 text-slate-500 font-bold text-[10px]" colspan="2">Saldo Awal per ' + new Date(startTime).toLocaleDateString('id-ID') + '</td>'
                + '<td class="p-3 text-center text-slate-400">-</td>'
                + '<td class="p-3 text-right text-slate-400">-</td>'
                + '<td class="p-3 text-right text-slate-400">-</td>'
                + '<td class="p-3 text-right font-black text-indigo-700">' + formatRp(saldoAwalDisplay) + '</td></tr>';

            if (entries.length === 0) {
                html += '<tr><td colspan="6" class="text-center p-6 text-slate-400 font-bold text-xs">Tidak ada mutasi akun ini pada periode.</td></tr>';
            } else {
                for (var k = 0; k < entries.length; k++) {
                    var ent = entries[k];
                    var dtStr = new Date(ent.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
                    var d = ent.debit || 0;
                    var cr = ent.kredit || 0;
                    totalD += d;
                    totalK += cr;
                    saldo += (d - cr);
                    var saldoDisplay = saldoNormalKredit ? -saldo : saldo;
                    html += '<tr class="hover:bg-slate-50/60 border-b border-slate-50">'
                        + '<td class="p-3 text-slate-500 text-[10px] whitespace-nowrap">' + dtStr + '</td>'
                        + '<td class="p-3 text-slate-700">' + escapeHtml(ent.keterangan || '') + '</td>'
                        + '<td class="p-3 text-center font-mono text-[10px] text-slate-400">' + escapeHtml(ent.refId || '') + '</td>'
                        + '<td class="p-3 text-right">' + (d > 0 ? formatRp(d) : '-') + '</td>'
                        + '<td class="p-3 text-right">' + (cr > 0 ? formatRp(cr) : '-') + '</td>'
                        + '<td class="p-3 text-right font-black text-indigo-700">' + formatRp(saldoDisplay) + '</td></tr>';
                }
            }

            tbody.innerHTML = html;
            document.getElementById('bb-total-debit').innerText = formatRp(totalD);
            document.getElementById('bb-total-kredit').innerText = formatRp(totalK);
            document.getElementById('bb-saldo-akhir').innerText = formatRp(saldoNormalKredit ? -saldo : saldo);

            var coaObj = BUKU_BESAR_COA.find(function(x) { return x.kode === kodeAkun; });
            var titleEl = document.getElementById('bb-akun-title');
            if (titleEl) titleEl.innerText = 'Akun ' + kodeAkun + ' — ' + (coaObj ? coaObj.nama : '');
            document.getElementById('ui-bb-toko').innerText = escapeHtml(state.setup['Nama Toko'] || 'POS Pro');
            var periodeEl = document.getElementById('bb-periode-text');
            if (periodeEl) {
                var formatOpts = { day: '2-digit', month: 'short', year: 'numeric' };
                periodeEl.innerText = 'Periode: ' + new Date(startTime).toLocaleDateString('id-ID', formatOpts) + ' s/d ' + new Date(endTime).toLocaleDateString('id-ID', formatOpts);
            }
        }

        // [PATCH A4] Tutup Buku
        function openTutupBukuModal() {
            if (!state.user || state.user.role !== 'Admin') return showToast('Hanya Admin!', 'error');
            var tbEl = document.getElementById('tb-cutoff');
            if (tbEl) {
                // Default: akhir bulan lalu
                var now = new Date();
                var lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
                tbEl.value = toLocalDateStr(lastMonthEnd);
            }
            openModal('modal-tutup-buku');
        }

        function submitTutupBuku() {
            var cutoffStr = document.getElementById('tb-cutoff').value;
            if (!cutoffStr) return Swal.fire('Tanggal Kosong', 'Isi tanggal cutoff terlebih dahulu.', 'warning');

            Swal.fire({
                title: 'Konfirmasi Tutup Buku',
                html: 'Periode sampai <b>' + cutoffStr + '</b> akan ditutup.<br><br>' +
                      '<span class="text-xs text-red-600 font-bold">Aksi ini tidak bisa dibatalkan!</span>',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#f59e0b',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: 'Ya, Jalankan',
                cancelButtonText: 'Batal'
            }).then(function(res) {
                if (!res.isConfirmed) return;
                Swal.fire({ title: 'Memproses...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });

                google.script.run.withSuccessHandler(function(r) {
                    if (r.success) {
                        closeModal('modal-tutup-buku');
                        Swal.fire('Berhasil', 'Laba Rp ' + formatRp(r.totalLaba) + ' dipindahkan ke Laba Ditahan.<br>Jurnal: ' + r.idJurnal, 'success');
                        manualSync(true);
                    } else {
                        Swal.fire('Gagal', r.error, 'error');
                    }
                }).withFailureHandler(function(err) {
                    Swal.fire('Koneksi Gagal', err && err.message ? err.message : 'unknown', 'error');
                }).tutupBukuTahunan(storageManager.get('pos_token_final'), cutoffStr);
            });
        }
		
        function processDeleteRestock(id) {
            if(state.user.role !== 'Admin') return showToast('Hanya Admin!', 'error');
            
            var pIdx = state.purchases.findIndex(function(x) { return String(x.id) === String(id); });
            if(pIdx === -1) return showToast('Data tidak ditemukan', 'error');
            var p = state.purchases[pIdx];

            Swal.fire({ 
                title: 'Retur Pembelian?', 
                html: 'Masukkan jumlah barang yang ingin dikembalikan ke supplier.<br><span class="text-xs text-slate-500 font-bold mt-1 block">Maksimal retur untuk nota ini: <b class="text-slate-700">' + p.qty + ' item</b></span>', 
                input: 'number',
                inputValue: p.qty,
                inputAttributes: { min: 1, max: p.qty, step: 1 },
                icon: 'warning', 
                showCancelButton: true, 
                confirmButtonColor: '#ef4444', 
                cancelButtonColor: '#94a3b8', 
                confirmButtonText: 'Ya, Retur Barang!', 
                cancelButtonText: 'Batal',
                inputValidator: (value) => {
                    if (!value || value <= 0) return 'Jumlah tidak valid!';
                    if (value > p.qty) return 'Maksimal retur adalah ' + p.qty + '!';
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    var qtyRetur = parseInt(result.value);
                    Swal.fire({title: 'Memproses...', allowOutsideClick: false, didOpen: () => {Swal.showLoading()}});
                    
                    google.script.run.withSuccessHandler(function(r) {
                        if(r.success) {
                            var prod = state.products.find(function(x) { return String(x.id) === String(p.idProduk); });
                            if(prod) { 
                                prod.stok -= qtyRetur; 
                                if(r.newHpp !== undefined) prod.hargaBeli = r.newHpp; 
                            }
                            
                            if (qtyRetur >= p.qty) {
                                state.purchases.splice(pIdx, 1);
                            } else {
                                state.purchases[pIdx].qty -= qtyRetur;
                                state.purchases[pIdx].totalBiaya -= (qtyRetur * state.purchases[pIdx].hargaBeli);
                            }
                            
                            renderInventory(); renderPosProducts(); renderReports(); renderLabaRugi(); renderArusKas(); renderNeraca(); renderJurnal(); manualSync(true);
                            Swal.fire('Berhasil!', 'Retur ' + qtyRetur + ' item berhasil diproses.', 'success');
                        } else { 
                            Swal.fire('Gagal!', r.error, 'error'); 
                        }
                    }).cancelRestock(storageManager.get('pos_token_final'), id, qtyRetur); 
                }
            });
        }
        
        function openTxDetail(id) {
            var t = state.transactions.find(function(x) { return String(x.id) === String(id); }); if(!t) return;
            var isRetur = t.status === 'RETUR'; var items = []; try { items = JSON.parse(t.cartJson); } catch(e){}
            
            var html = '<div class="flex justify-between border-b border-slate-100 pb-2"><span class="text-slate-500 font-bold">ID Transaksi</span><span class="font-bold text-xs font-mono">' + escapeHtml(t.id) + '</span></div><div class="flex justify-between border-b border-slate-100 pb-2 pt-2"><span class="text-slate-500 font-bold">Tanggal</span><span class="font-bold">' + new Date(t.tanggal).toLocaleString('id-ID') + '</span></div><div class="flex justify-between border-b border-slate-100 pb-2 pt-2"><span class="text-slate-500 font-bold">Kasir</span><span class="font-bold">' + escapeHtml(t.kasir) + '</span></div><div class="flex justify-between border-b border-slate-100 pb-2 pt-2"><span class="text-slate-500 font-bold">Pelanggan</span><span class="font-bold">' + escapeHtml(t.pelanggan || '-') + '</span></div><div class="flex justify-between border-b border-slate-100 pb-2 pt-2"><span class="text-slate-500 font-bold">Metode</span><span class="font-bold">' + escapeHtml(t.metode) + '</span></div><div class="flex justify-between border-b border-slate-100 pb-2 pt-2"><span class="text-slate-500 font-bold">Status Akhir</span><span class="font-black px-2 py-0.5 rounded text-[10px] ' + (isRetur ? 'text-red-500 bg-red-50 border border-red-100' : (t.status==='HUTANG'?'text-orange-500 bg-orange-50 border border-orange-100':'text-emerald-500 bg-emerald-50 border border-emerald-100')) + '">' + escapeHtml(t.status === 'HUTANG' ? 'KASBON' : t.status) + '</span></div>';
            html += '<div class="mt-4 font-extrabold text-slate-800">Daftar Item:</div><div class="bg-slate-50 p-3 rounded-xl border border-slate-200/60 space-y-2 mt-2 text-xs">';
            var sub = 0; for(var i=0; i<items.length; i++) { sub += items[i].qty * items[i].hargaJual; html += '<div class="flex justify-between"><span class="font-bold text-slate-700">' + escapeHtml(items[i].nama) + ' <span class="text-slate-400 ml-1">x' + items[i].qty + '</span></span><span class="font-black">' + formatRp(items[i].qty * items[i].hargaJual) + '</span></div>'; }
            html += '</div>';
            if(t.diskon > 0) html += '<div class="flex justify-between mt-3 text-xs font-bold text-slate-500"><span>Subtotal Tagihan</span><span>' + formatRp(sub) + '</span></div><div class="flex justify-between text-xs font-black text-red-500 mt-1"><span>Diskon</span><span>-' + formatRp(t.diskon) + '</span></div>';
            html += '<div class="flex justify-between font-black text-lg mt-3 border-t border-slate-200 pt-3"><span>Total Akhir</span><span class="text-blue-600">' + formatRp(t.total) + '</span></div>';
            
            document.getElementById('tx-detail-content').innerHTML = html;
            var actionHtml = '<button onclick="reprintTx(\'' + t.id + '\')" class="flex-1 bg-slate-800 hover:bg-slate-900 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 w-full sm:w-auto"><i class="fas fa-print mr-1"></i> Struk</button>';
            if(t.pdfLink && !t.pdfLink.includes('Error')) actionHtml += '<a href="' + escapeHtml(t.pdfLink) + '" target="_blank" class="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-1 transition-all shadow-sm active:scale-95 w-full sm:w-auto"><i class="fas fa-file-pdf"></i> PDF</a>';
            
            var safePelanggan = escapeHtml(t.pelanggan || '-');
            var safeWA = escapeHtml(t.wa || '-');
            if(t.status === 'HUTANG' && state.user.role === 'Admin') actionHtml += '<button onclick="prosesLunasPiutang(\'' + t.id + '\', \''+safePelanggan+'\', '+t.total+', \''+safeWA+'\')" class="w-full mt-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"><i class="fas fa-check-double mr-1"></i> Pelunasan Kasbon</button>';
            if(!isRetur && state.user.role === 'Admin') actionHtml += '<button onclick="processRetur(\'' + t.id + '\')" class="w-full mt-2 border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95"><i class="fas fa-undo mr-1"></i> Retur Transaksi</button>';
            
            document.getElementById('tx-detail-actions').innerHTML = actionHtml; openModal('modal-tx-detail');
        }

        function reprintTx(id) { var t = state.transactions.find(function(x) { return String(x.id) === String(id); }); if(!t) return; var items = []; try { items = JSON.parse(t.cartJson); } catch(e){} closeModal('modal-tx-detail'); generateReceipt(t, items); }
        
        function prosesLunasPiutang(txId, pelanggan, total, wa) {
            Swal.fire({ title: 'Yakin Lunas?', text: "Anda yakin hutang ini sudah dibayar LUNAS oleh pelanggan? Omset bersih akan otomatis ditambahkan ke laporan.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#10b981', cancelButtonColor: '#94a3b8', confirmButtonText: '<i class="fas fa-check"></i> Ya, Lunas!', cancelButtonText: 'Batal' }).then((result) => {
                if (result.isConfirmed) {
                    Swal.fire({title: 'Memproses...', text: 'Menyimpan & Mengirim Notif WA', allowOutsideClick: false, didOpen: () => {Swal.showLoading()}});
                    google.script.run.withSuccessHandler(function(r) { 
                        if(!r.success) { Swal.fire('Error', r.error, 'error'); }
                        else {
                            var tIdx = state.transactions.findIndex(function(t) { return String(t.id) === String(txId); });
                            if(tIdx > -1) { state.transactions[tIdx].status = 'SUKSES'; state.transactions[tIdx].bayar = state.transactions[tIdx].total; }
                            renderReports(); renderLabaRugi(); renderArusKas(); renderDashboard(); renderPiutang(); closeModal('modal-tx-detail'); manualSync(true);
                            Swal.fire('Pelunasan Berhasil!', '<small class="text-slate-500 font-bold">' + r.wa_respon + '</small>', 'success');
                        }
                    }).lunasiKasbon(storageManager.get('pos_token_final'), txId);
                }
            });
        }

        function processRetur(txId) {
            if(state.user.role !== 'Admin') return showToast('Hanya Admin!', 'error'); 
            Swal.fire({ title: 'Retur Transaksi?', text: 'Batalkan transaksi ini? Stok barang akan dikembalikan utuh ke dalam inventori.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', cancelButtonColor: '#94a3b8', confirmButtonText: 'Ya, Retur Transaksi!', cancelButtonText: 'Batal' }).then((result) => {
                if (result.isConfirmed) {
                    Swal.fire({title: 'Memproses...', allowOutsideClick: false, didOpen: () => {Swal.showLoading()}});
                    google.script.run.withSuccessHandler(function(r) { 
                        if(!r.success) { Swal.fire('Gagal', r.error, 'error'); }
                        // [FIX] Sesudah: tunggu server sukses, baru ubah stok lokal
                        else {
                            var tIdx = state.transactions.findIndex(function(t) { return String(t.id) === String(txId); });
                            if(tIdx > -1) {
                                var tx = state.transactions[tIdx]; 
                                tx.status = 'RETUR'; 
                                var items = []; 
                                try { items = JSON.parse(tx.cartJson); } catch(e){}
                                // [FIX] Stok lokal dikembalikan setelah server sukses
                                for(var i=0; i<items.length; i++) { 
                                    var it = items[i]; 
                                    var p = state.products.find(function(x) { return String(x.id) === String(it.id); }); 
                                    if(p) p.stok += it.qty; 
                                }
                                renderReports(); renderLabaRugi(); renderArusKas(); renderDashboard(); renderInventory(); renderPosProducts(); closeModal('modal-tx-detail'); manualSync(true);
                                Swal.fire('Berhasil!', 'Transaksi Dibatalkan', 'success'); 
                            }
                        }
                    }).processReturn(storageManager.get('pos_token_final'), txId);
                }
            });
        }

        function analisisKategori() {
            var kategoriStats = {};

            for(var i = 0; i < state.transactions.length; i++) {
                    var t = state.transactions[i];
                    // [FIX] HUTANG juga dihitung (accrual basis, konsisten dengan computeFinancialMetrics header)
                    if(t.status === 'SUKSES' || t.status === 'HUTANG') {
                    var items = [];
                    try { items = JSON.parse(t.cartJson); } catch(e){}
                    
                    // Hitung total kotor transaksi untuk basis rasio diskon
                    var totalKotorTx = 0;
                    for(var m = 0; m < items.length; m++) { totalKotorTx += (items[m].hargaJual * items[m].qty); }

                    for(var k = 0; k < items.length; k++) {
                        var itm = items[k];
                        var pAsli = state.products.find(x => String(x.id) === String(itm.id));
                        var namaKategori = pAsli ? pAsli.kategori : 'Lainnya';

                        if(!kategoriStats[namaKategori]) {
                            kategoriStats[namaKategori] = { totalPenjualan: 0, totalModal: 0 };
                        }
                        
                        var subtotalItem = (itm.hargaJual * itm.qty);
                        // Hitung proporsi diskon per item secara adil
                        var proporsiDiskon = totalKotorTx > 0 ? (subtotalItem / totalKotorTx) * (t.diskon || 0) : 0;
                        var penjualanBersihItem = subtotalItem - proporsiDiskon;

                        kategoriStats[namaKategori].totalPenjualan += penjualanBersihItem;
                        // Fallback harga beli jika pAsli terhapus
                        var hBeli = pAsli ? pAsli.hargaBeli : (itm.hargaBeli ? itm.hargaBeli : 0);
                        kategoriStats[namaKategori].totalModal += (hBeli * itm.qty);
                    }
                }
            }

            // [v7.19] Margin Kategori: Tarik Tunai, Top Up E-Wallet, Produk Digital (terpisah)
            var layKatTarik = { totalPenjualan: 0, totalModal: 0 };
            var layKatDigi  = { totalPenjualan: 0, totalModal: 0 };
            var layKatTopup = { totalPenjualan: 0, totalModal: 0 };
            for (var ld = 0; ld < (state.layananDigital || []).length; ld++) {
              var layM = state.layananDigital[ld];
              var jenisM = String(layM.jenis);
              if (jenisM === 'TARIK_TUNAI') {
                layKatTarik.totalPenjualan += (Number(layM.fee) || 0);
              } else if (jenisM === 'TOPUP_EWALLET') {
                layKatTopup.totalPenjualan += (Number(layM.fee) || 0); // revenue = fee
              } else {
                layKatDigi.totalPenjualan += (Number(layM.nominal) || 0);
                layKatDigi.totalModal     += (Number(layM.modal) || 0);
              }
            }
            if (layKatTarik.totalPenjualan > 0) kategoriStats['Layanan Tarik Tunai'] = layKatTarik;
            if (layKatDigi.totalPenjualan  > 0) kategoriStats['Produk Digital'] = layKatDigi;
            if (layKatTopup.totalPenjualan > 0) kategoriStats['Top Up E-Wallet'] = layKatTopup;

            var hasilAnalisis = [];
            for (var cat in kategoriStats) {
                var stat = kategoriStats[cat];
                var labaKotor = stat.totalPenjualan - stat.totalModal;
                var margin = stat.totalPenjualan > 0 ? (labaKotor / stat.totalPenjualan) * 100 : 0;
                
                hasilAnalisis.push({
                    kategori: cat,
                    omset: stat.totalPenjualan,
                    laba: labaKotor,
                    margin: margin.toFixed(2)
                });
            }

            // Urutkan berdasarkan Margin terbesar
            hasilAnalisis.sort((a, b) => b.margin - a.margin);
            return hasilAnalisis;
        }

        // [FIX 2.1] Helper: hitung rentang tanggal dari filter dashboard
        function getDashboardDateRange() {
            var filterEl = document.getElementById('dash-date-filter');
            var filter = filterEl ? filterEl.value : 'today';
            
            var start = new Date();
            var end = new Date();
            end.setHours(23, 59, 59, 999);
            
            if (filter === 'today') {
                start.setHours(0, 0, 0, 0);
            } else if (filter === 'yesterday') {
                start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
                end.setDate(end.getDate() - 1); end.setHours(23, 59, 59, 999);
            } else if (filter === 'week') {
                start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
            } else if (filter === 'month') {
                start.setDate(1); start.setHours(0, 0, 0, 0);
            }
            
            return { 
                start: start.getTime(), 
                end: end.getTime(), 
                filter: filter,
                startDate: start,
                endDate: end
            };
        }

        // [FIX 3.1] Generate insight proaktif (rules-based)
        function generateInsights() {
            var insights = [];
            var now = new Date();
            var currentHour = now.getHours();
            // [FIX] Baca filter tanggal langsung dari DOM (isToday tidak global)
            var filterEl = document.getElementById('dash-date-filter');
            var isToday = !filterEl || filterEl.value === 'today';
            
            // 1. STOK HABIS (Prioritas TINGGI)
            var stok0 = state.products.filter(function(p) { return p.stok === 0; });
            if (stok0.length > 0) {
                insights.push({
                    level: 'danger',
                    icon: 'fa-exclamation-triangle',
                    text: '<b>' + stok0.length + ' produk STOK HABIS</b> — segera restock!',
                    action: { label: 'Buka Inventori', fn: "switchView('inventory')" }
                });
            }
            
            // 2. STOK TIPIS
            var stokTipis = state.products.filter(function(p) { return p.stok > 0 && p.stok <= 5; });
            if (stokTipis.length > 0 && stok0.length === 0) {
                insights.push({
                    level: 'warning',
                    icon: 'fa-boxes',
                    text: '<b>' + stokTipis.length + ' produk stok tipis</b> (≤3 unit)',
                    action: { label: 'Cek Inventori', fn: "switchView('inventory')" }
                });
            }
            
            // 3. KASBON MENUMPUK
            var totalKasbon = state.transactions
                .filter(function(t) { return String(t.status || '').trim().toUpperCase() === 'HUTANG'; })
                .reduce(function(s, t) { return s + (t.total - (t.bayar || 0)); }, 0);
            if (totalKasbon > 100000) {
                insights.push({
                    level: 'warning',
                    icon: 'fa-hand-holding-usd',
                    text: '<b>Total kasbon Rp ' + formatRp(totalKasbon) + '</b> — segera tagih!',
                    action: { label: 'Buku Piutang', fn: "drillDown('piutang')" }
                });
            }
            
            // 4. PIUTANG GOPAY BELUM DI-SETTLE
            var totalTransit = state.jurnal.reduce(function(s, j) {
                return String(j.kodeAkun).trim() === '116' ? s + (j.debit || 0) - (j.kredit || 0) : s;
            }, 0);
            if (totalTransit > 500000) {
                insights.push({
                    level: 'info',
                    icon: 'fa-hourglass-half',
                    text: '<b>Piutang GoPay Rp ' + formatRp(totalTransit) + '</b> belum di-settle ke bank',
                    action: { label: 'Settle Sekarang', fn: "drillDown('transit')" }
                });
            }
            
            // 5. JAM SIBUK PREDICT
            if (currentHour >= 11 && currentHour <= 13) {
                insights.push({
                    level: 'info',
                    icon: 'fa-utensils',
                    text: '🍽️ <b>Jam makan siang</b> — siapkan stok minuman & makanan!',
                    action: null
                });
            } else if (currentHour >= 16 && currentHour <= 18) {
                insights.push({
                    level: 'info',
                    icon: 'fa-mug-hot',
                    text: '☕ <b>Jam pulang kerja</b> — biasanya ramai pemesanan take away',
                    action: null
                });
            }
            
            // 6. PERFORMA OMSET HARI INI
            if (isToday) {
                var today = new Date().toDateString();
                var yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
                var yesterdayStr = yesterday.toDateString();
                
                var avgWeek = 0, countWeek = 0;
                for (var d = 1; d <= 7; d++) {
                    var checkDate = new Date();
                    checkDate.setDate(checkDate.getDate() - d);
                    var checkStr = checkDate.toDateString();
                    var dayTotal = state.transactions
                        .filter(function(t) { 
                            return new Date(t.tanggal).toDateString() === checkStr && 
                                  t.status !== 'RETUR' && t.status !== 'HUTANG'; 
                        })
                        .reduce(function(s, t) { return s + t.total; }, 0);
                    if (dayTotal > 0) { avgWeek += dayTotal; countWeek++; }
                }
                var avg = countWeek > 0 ? avgWeek / countWeek : 0;
                
                // Sudah ada variabel dS dari renderDashboard, tapi generateInsights dipanggil terpisah
                var todaySales = state.transactions
                    .filter(function(t) { 
                        return new Date(t.tanggal).toDateString() === today && 
                              t.status !== 'RETUR' && t.status !== 'HUTANG'; 
                    })
                    .reduce(function(s, t) { return s + t.total; }, 0);
                
                if (avg > 0) {
                    var perf = ((todaySales - avg) / avg) * 100;
                    if (perf >= 20) {
                        insights.push({
                            level: 'success',
                            icon: 'fa-rocket',
                            text: '🚀 <b>Penjualan hari ini +' + perf.toFixed(0) + '%</b> di atas rata-rata 7 hari!',
                            action: null
                        });
                    } else if (perf <= -30) {
                        insights.push({
                            level: 'warning',
                            icon: 'fa-chart-line',
                            text: '📉 Penjualan hari ini <b>' + perf.toFixed(0) + '%</b> di bawah rata-rata. Butuh promo?',
                            action: { label: 'Lihat Laporan', fn: "drillDown('sales')" }
                        });
                    }
                }
            }
            
        // [PATCH v7.19] 8. PRODUK JUARA HARI INI
            var filterRange8 = getDashboardDateRange();
            var topMap8 = {};
            for (var tn = 0; tn < state.transactions.length; tn++) {
                var txn8 = state.transactions[tn];
                if (txn8.status === 'RETUR' || txn8.status === 'HUTANG') continue;
                if (txn8.tanggal < filterRange8.start || txn8.tanggal > filterRange8.end) continue;
                var items8 = [];
                try { items8 = JSON.parse(txn8.cartJson); } catch(e) {}
                for (var im = 0; im < items8.length; im++) {
                    var itm8 = items8[im];
                    if (!itm8.nama) continue;
                    var p8 = state.products.find(function(x){ return String(x.id) === String(itm8.id); });
                    var hpp8 = p8 ? (Number(p8.hargaBeli) || 0) : 0;
                    var qty8 = Number(itm8.qty) || 0;
                    var jual8 = Number(itm8.hargaJual) || 0;
                    if (!topMap8[itm8.nama]) topMap8[itm8.nama] = { qty: 0, laba: 0 };
                    topMap8[itm8.nama].qty  += qty8;
                    topMap8[itm8.nama].laba += (jual8 - hpp8) * qty8;
                }
            }
            var topArr8 = Object.keys(topMap8).map(function(k) {
                return { nama: k, qty: topMap8[k].qty, laba: topMap8[k].laba };
            });
            topArr8.sort(function(a, b) { return b.qty - a.qty; });
            if (topArr8.length > 0 && topArr8[0].qty > 0) {
                insights.push({
                    level: 'success',
                    icon: 'fa-crown',
                    text: '👑 <b>' + escapeHtml(topArr8[0].nama) + '</b> terlaris (' + topArr8[0].qty + 'x, laba ' + formatRp(topArr8[0].laba) + ')',
                    action: { label: 'Lihat Detail', fn: "switchView('reports'); setTimeout(function(){ switchRepTab('produkterlaris'); }, 150);" }
                });
            }

            return insights;
        }

        // [FIX] Render banner insight — collapsible
        function renderInsightBanner() {
            var banner = document.getElementById('dash-insight-banner');
            if (!banner) return;

            var insights = generateInsights();
            if (insights.length === 0) {
                banner.classList.add('hidden');
                return;
            }
            banner.classList.remove('hidden');

            var isCollapsed = storageManager.get('pos_insight_collapsed') === 'true';
            var isExpanded  = storageManager.get('pos_insight_expanded') === 'true';  // ← STATE BARU

            var colorMap = {
                danger:  { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     icon: 'text-red-500' },
                warning: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   icon: 'text-amber-500' },
                info:    { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    icon: 'text-blue-500' },
                success: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: 'text-emerald-500' }
            };

            var urgentCount = insights.filter(function(ins) {
                return ins.level === 'danger' || ins.level === 'warning';
            }).length;

            var badgeColor = urgentCount > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
            var badgeText  = urgentCount > 0
                ? urgentCount + ' butuh perhatian'
                : insights.length + ' notifikasi';

            // Header
            var html =
                '<div class="insight-header flex items-center justify-between gap-2 px-1 py-0.5" onclick="toggleInsightBanner()">' +
                    '<div class="flex items-center gap-2 min-w-0">' +
                        '<i class="fas fa-lightbulb text-amber-500"></i>' +
                        '<span class="text-[10px] font-black text-amber-800 uppercase tracking-wider">Insight Hari Ini</span>' +
                        '<span class="text-[9px] font-bold ' + badgeColor + ' px-1.5 py-0.5 rounded whitespace-nowrap">' +
                            badgeText +
                        '</span>' +
                    '</div>' +
                    '<div class="flex items-center gap-1.5 shrink-0">' +
                        '<span data-hint class="text-[9px] font-bold text-amber-600/70 hidden sm:inline">Klik untuk ' +
                            (isCollapsed ? 'buka' : 'tutup') +
                        '</span>' +
                        '<i class="fas fa-chevron-down text-amber-600 insight-toggle-icon text-xs"></i>' +
                    '</div>' +
                '</div>';

            // Body
            html += '<div class="insight-body flex flex-col gap-2">';

            // Tentukan berapa yang ditampilkan
            var maxShow = isExpanded ? insights.length : Math.min(insights.length, 3);

            for (var i = 0; i < maxShow; i++) {
                var ins = insights[i];
                var c = colorMap[ins.level] || colorMap.info;
                var actionHtml = ins.action
                    ? '<button onclick="event.stopPropagation(); ' + ins.action.fn + '" class="text-[9px] font-black ' + c.text + ' bg-white border ' + c.border + ' px-2 py-1 rounded-md transition-all active:scale-95 whitespace-nowrap shrink-0">' +
                      ins.action.label + ' <i class="fas fa-arrow-right ml-0.5"></i></button>'
                    : '';

                html += '<div class="flex items-center gap-2 ' + c.bg + ' ' + c.border + ' border rounded-lg p-2">' +
                        '<i class="fas ' + ins.icon + ' ' + c.icon + ' text-sm shrink-0"></i>' +
                        '<div class="flex-1 min-w-0 text-xs ' + c.text + ' leading-snug">' + ins.text + '</div>' +
                        actionHtml +
                        '</div>';
            }

            // 🔽 INI YANG DIUBAH: tombol expand/collapse fungsional
            if (insights.length > 3) {
                if (!isExpanded) {
                    // Tombol "lihat lainnya"
                    html += '<button onclick="toggleInsightExpand()" ' +
                            'class="text-[10px] font-bold text-amber-700 bg-amber-100/70 hover:bg-amber-200 border border-amber-200 rounded-lg py-1.5 transition-all active:scale-95 w-full">' +
                            '<i class="fas fa-chevron-down mr-1"></i>' +
                            'Lihat ' + (insights.length - 3) + ' notifikasi lainnya' +
                            '</button>';
                } else {
                    // Tombol "sembunyikan"
                    html += '<button onclick="toggleInsightExpand()" ' +
                            'class="text-[10px] font-bold text-amber-700 bg-amber-100/70 hover:bg-amber-200 border border-amber-200 rounded-lg py-1.5 transition-all active:scale-95 w-full">' +
                            '<i class="fas fa-chevron-up mr-1"></i>' +
                            'Sembunyikan notifikasi tambahan' +
                            '</button>';
                }
            }

            html += '</div>';
            banner.innerHTML = html;

            // Auto-collapse logic (tidak berubah)
            var userToggled = storageManager.get('pos_insight_user_toggled') === 'true';
            var hasUrgent   = insights.some(function(ins) { return ins.level === 'danger'; });
            var shouldCollapse = userToggled ? isCollapsed : !hasUrgent;

            if (shouldCollapse) banner.classList.add('collapsed');
            else banner.classList.remove('collapsed');
        }

        function renderWidgetAOV() {
            var range = getDashboardDateRange();
            var mM = computeFinancialMetrics(range.start, range.end);
            
            // Hitung total transaksi dalam rentang
            var trxCount = 0;
            for (var i = 0; i < state.transactions.length; i++) {
                var t = state.transactions[i];
                if (t.tanggal < range.start || t.tanggal > range.end) continue;
                var st = String(t.status || '').trim().toUpperCase();
                if (st === 'RETUR' || st === 'HUTANG') continue;
                trxCount++;
            }
            // + layanan digital
            for (var j = 0; j < (state.layananDigital || []).length; j++) {
                var l = state.layananDigital[j];
                if (l.tanggal < range.start || l.tanggal > range.end) continue;
                trxCount++;
            }
            
            var aov = trxCount > 0 ? Math.round(mM.pendapatanNeto / trxCount) : 0;
            var el = document.getElementById('dash-aov');
            if (el) el.innerText = formatRp(aov);
            var lbl = document.getElementById('dash-aov-label');
            if (lbl) {
                lbl.innerText = trxCount > 0 
                    ? trxCount + ' trx • ' + formatRp(mM.pendapatanNeto) + ' omset'
                    : 'Belum ada transaksi';
            }
        }

        // [NEW] Toggle collapse state — disimpan di localStorage
        function toggleInsightBanner() {
            var banner = document.getElementById('dash-insight-banner');
            if (!banner) return;

            var isNowCollapsed = banner.classList.toggle('collapsed');
            storageManager.set('pos_insight_collapsed', isNowCollapsed ? 'true' : 'false');
            storageManager.set('pos_insight_user_toggled', 'true');   // ← [NEW] Tandai user sudah klik manual

            // Update teks hint kecil di kanan header
            var hint = banner.querySelector('.insight-header [data-hint]');
            if (hint) hint.innerText = 'Klik untuk ' + (isNowCollapsed ? 'buka' : 'tutup');
        }

        // [NEW] Toggle expand/collapse daftar insight tambahan
        function toggleInsightExpand() {
            var current = storageManager.get('pos_insight_expanded') === 'true';
            storageManager.set('pos_insight_expanded', current ? 'false' : 'true');
            renderInsightBanner();
        }

        // [FIX 2.3] Helper: render delta generik
        function renderDelta(elementId, current, previous, options) {
            options = options || {};
            var unit = options.unit || 'vs kemarin';
            var mode = options.mode || 'percent'; // 'percent' | 'absolute' | 'points'
            var isActive = options.isActive !== false; // true default
            
            var el = document.getElementById(elementId);
            if (!el) return;
            
            // Kalau filter bukan "Hari Ini", jangan tampilkan perbandingan
            if (!isActive) {
                el.innerHTML = '<i class="fas fa-info-circle text-slate-300 mr-1"></i><span class="text-slate-400">' + (options.inactiveText || 'Data periode') + '</span>';
                return;
            }
            
            if (previous === 0 && current === 0) {
                el.innerHTML = '<i class="fas fa-minus text-slate-300 mr-1"></i><span class="text-slate-400">Belum ada data</span>';
                return;
            }
            
            if (previous === 0) {
                el.innerHTML = '<i class="fas fa-arrow-up text-emerald-500 mr-1"></i><span class="text-emerald-500">Baru (dari 0)</span>';
                return;
            }
            
            var delta;
            var suffix = '';
            
            if (mode === 'percent') {
                delta = ((current - previous) / previous) * 100;
                suffix = '% ' + unit;
            } else if (mode === 'points') {
                delta = current - previous;
                suffix = ' poin ' + unit;
            } else {
                delta = current - previous;
                suffix = ' ' + unit;
            }
            
            if (Math.abs(delta) < 0.05) {
                el.innerHTML = '<i class="fas fa-minus text-slate-400 mr-1"></i><span class="text-slate-400">Sama dengan kemarin</span>';
                return;
            }
            
            var isUp = delta > 0;
            var color = isUp ? 'text-emerald-500' : 'text-red-500';
            var arrow = isUp ? 'fa-arrow-up' : 'fa-arrow-down';
            var sign = isUp ? '+' : '';
            
            el.innerHTML = '<i class="fas ' + arrow + ' ' + color + ' mr-1"></i>' +
                          '<span class="' + color + '">' + sign + delta.toFixed(1) + suffix + '</span>';
        }

        // [FIX MISSING] Drill-down ke halaman terkait
        function drillDown(type) {
          switch(type) {
              case 'bank':
              case 'transit':
              case 'deposit':
                  if (state.user.role === 'Admin') openGoPayPanel();
                  else showToast('Hubungi Admin untuk detail saldo GoPay', 'error');
                  break;
              case 'kas':
                  switchView('reports');
                  setTimeout(function(){ switchRepTab('aruskas'); }, 150);
                  break;
              case 'piutang':
                  switchView('reports');
                  setTimeout(function(){ switchRepTab('piutang'); }, 150);
                  break;
              case 'hutang':
                  switchView('reports');
                  setTimeout(function(){ switchRepTab('hutang'); }, 150);
                  break;
              case 'persediaan':
                  switchView('inventory');
                  break;
              case 'sales':
              case 'profit':
              case 'margin-today':
                  switchView('reports');
                  setTimeout(function(){ switchRepTab('labarugi'); }, 150);
                  break;
              case 'expense':
                  switchView('reports');
                  setTimeout(function(){ switchRepTab('beban'); }, 150);
                  break;
              case 'terlaris':
                  switchView('reports');
                  setTimeout(function(){ switchRepTab('riwayat'); }, 150);
                  break;
              case 'stok-tipis':
                  switchView('inventory');
                  break;
          }
        }

        // [FIX MISSING] Tooltip edukasi widget
        function showWidgetInfo(type) {
          var config = {
              transit: {
                  title: '💰 Piutang GoPay (In Transit)',
                  subtitle: 'Dana yang belum settle ke bank',
                  explanation: 'Dana QRIS pelanggan yang <b>sudah masuk aplikasi GoPay Bisnis</b>, tapi <b>belum ditransfer ke rekening bank</b> Anda.',
                  icon: 'fa-hourglass-half',
                  color: '#f59e0b',
                  steps: [
                      'Buka menu <b>Layanan Digital</b> → <b>Saldo GoPay</b>',
                      'Isi nominal settlement yang sudah masuk ke rekening',
                      'Klik tombol <b>Settle</b>'
                  ]
              },
              bank: {
                  title: '🏦 Bank / Settlement QRIS',
                  subtitle: 'Saldo di rekening bank',
                  explanation: 'Uang yang <b>sudah settle</b> dan ada di rekening bank Anda dari GoPay/QRIS.',
                  icon: 'fa-university',
                  color: '#0891b2',
                  steps: [
                      'Dana masuk ke sini setelah Anda klik <b>Settle</b> di GoPay Panel',
                      'Saldo ini bisa dipakai untuk <b>Top Up Deposit GoPay</b> (jual pulsa)',
                      'Atau ditarik ke kas fisik via menu <b>Transaksi Lain</b> → <b>Penarikan Bank ke Kas</b>'
                  ]
              },
              deposit: {
                  title: '💳 Deposit GoPay Merchant',
                  subtitle: 'Saldo untuk jual produk digital',
                  explanation: 'Saldo khusus yang dipakai untuk <b>jual pulsa, token, kuota</b>, dll. Terpisah dari saldo bank.',
                  icon: 'fa-wallet',
                  color: '#14b8a6',
                  steps: [
                      'Top up deposit dari menu <b>Layanan Digital</b> → <b>Saldo GoPay</b>',
                      'Setiap jual produk digital, modal dipotong dari sini',
                      'Kalau saldo habis, transaksi pulsa akan ditolak'
                  ]
              },
              'margin-today': {
                  title: '📊 Margin Hari Ini',
                  subtitle: 'Persentase laba bersih',
                  explanation: 'Rasio <b>laba bersih ÷ omset kotor</b> × 100% (omset kotor = nilai transaksi riil termasuk modal produk digital). Semakin tinggi, semakin sehat bisnis Anda.',
                  icon: 'fa-percentage',
                  color: '#6366f1',
                  steps: [
                      '🟢 <b>≥ 25%</b>: Sehat — margin di atas rata-rata',
                      '🔵 <b>10–25%</b>: Normal',
                      '🟠 <b>&lt; 10%</b>: Perlu perhatian (cek harga jual vs HPP)',
                      'Lihat rincian lengkap di <b>Laporan → Laba Rugi</b>'
                  ]
              }
          };
          
          var cfg = config[type];
          if (!cfg) return;
          
          var stepsHtml = cfg.steps.map(function(s) {
              return '<li class="mb-1.5 pl-2">' + s + '</li>';
          }).join('');
          
          Swal.fire({
              html: 
                  '<div class="text-left">' +
                  '<div class="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">' +
                      '<div class="w-12 h-12 rounded-xl flex items-center justify-center text-xl text-white shadow-sm" style="background:' + cfg.color + '">' +
                          '<i class="fas ' + cfg.icon + '"></i>' +
                      '</div>' +
                      '<div>' +
                          '<h3 class="font-black text-base text-slate-800">' + cfg.title + '</h3>' +
                          '<p class="text-xs text-slate-500 font-medium">' + cfg.subtitle + '</p>' +
                      '</div>' +
                  '</div>' +
                  '<div class="bg-slate-50 p-3 rounded-xl mb-3 text-sm text-slate-700 leading-relaxed">' +
                      cfg.explanation +
                  '</div>' +
                  '<p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 mt-4">Cara pakai:</p>' +
                  '<ol class="text-xs text-slate-600 list-decimal pl-4 space-y-0.5">' +
                      stepsHtml +
                  '</ol>' +
                  '</div>',
              showCancelButton: true,
              confirmButtonText: '<i class="fas fa-arrow-right mr-1"></i> Buka Sekarang',
              cancelButtonText: 'Tutup',
              confirmButtonColor: cfg.color,
              cancelButtonColor: '#94a3b8',
              width: 480
          }).then(function(r) {
              if (r.isConfirmed) {
                  if (type === 'transit' || type === 'bank' || type === 'deposit') {
                      if (state.user.role === 'Admin') openGoPayPanel();
                  } else if (type === 'margin-today') {
                      switchView('reports');
                      setTimeout(function() { switchRepTab('labarugi'); }, 150);
                  }
              }
          });
        }

        // [FIX #5] Helper: bangun HTML delta comparison (1 baris)
        function buildDeltaLine(current, base, label) {
            if (base === 0 && current === 0) {
                return '<i class="fas fa-minus text-slate-300 mr-1"></i><span class="text-slate-400">Belum ada data</span>';
            }
            if (base === 0) {
                return '<i class="fas fa-arrow-up text-emerald-500 mr-1"></i><span class="text-emerald-500">Baru ' + label + '</span>';
            }
            var pct = ((current - base) / base) * 100;
            if (Math.abs(pct) < 0.5) {
                return '<i class="fas fa-minus text-slate-400 mr-1"></i><span class="text-slate-400">Sama ' + label + '</span>';
            }
            var isUp = pct > 0;
            var cls = isUp ? 'text-emerald-500' : 'text-red-500';
            var arrow = isUp ? 'fa-arrow-up' : 'fa-arrow-down';
            var sign = isUp ? '+' : '';
            return '<i class="fas ' + arrow + ' ' + cls + ' mr-1"></i><span class="' + cls + '">' + sign + pct.toFixed(1) + '% ' + label + '</span>';
        }

        // [FIX #3b] Fallback metrik untuk Kasir (tanpa akses jurnal).
        // Approksimasi dari state.transactions + state.layananDigital.
        // Untuk Admin, tetap pakai computeFinancialMetrics() (jurnal = sumber kebenaran).
        function computeMetricsFromTransactions(startTime, endTime) {
            var m = {
                pendapatanBarang: 0, pendapatanLayanan: 0,
                returPenjualan: 0, diskonPenjualan: 0,
                hppBarang: 0, hppDigital: 0,
                pendapatanNeto: 0, labaKotor: 0, pendapatanLain: 0,
                bebanOperasional: 0, labaBersih: 0,
                marginPct: 0,
                // Snapshot (non-admin tidak perlu, set 0)
                kas: 0, bank: 0, transit: 0, deposit: 0,
                piutang: 0, persediaan: 0,
                hutang: 0, hutangPinjaman: 0,
                rincianPendapatan: {}, rincianBeban: {}
            };

            // Barang: SUKSES + HUTANG dihitung sebagai pendapatan bruto (accrual).
            // RETUR ditambahkan ke bruto juga (karena jurnal 411 masih mencatat),
            // lalu dikoreksi lewat returPenjualan.
            for (var i = 0; i < state.transactions.length; i++) {
                var t = state.transactions[i];
                if (t.tanggal < startTime || t.tanggal > endTime) continue;
                var st = String(t.status || '').trim().toUpperCase();
                if (st !== 'SUKSES' && st !== 'HUTANG' && st !== 'RETUR') continue;

                var total = Number(t.total) || 0;
                var modal = Number(t.modal) || 0;

                if (st === 'RETUR') {
                    m.returPenjualan += total;
                    // Tetap hitung gross di pendapatanBarang agar neto match jurnal
                    m.pendapatanBarang += total;
                } else {
                    m.pendapatanBarang += total;
                    m.hppBarang += modal;
                }
            }

            // Layanan Digital
            for (var j = 0; j < (state.layananDigital || []).length; j++) {
                var l = state.layananDigital[j];
                if (l.tanggal < startTime || l.tanggal > endTime) continue;
                var jenis = String(l.jenis);
                var nominal = Number(l.nominal) || 0;
                var modal = Number(l.modal) || 0;
                var fee = Number(l.fee) || 0;
                if (jenis === 'PRODUK_DIGITAL') {
                    m.pendapatanLayanan += nominal;
                    m.hppDigital += modal;
                } else {
                    // Tarik tunai & topup = pass-through, hanya fee
                    m.pendapatanLayanan += fee;
                }
            }

            m.pendapatanNeto = m.pendapatanBarang + m.pendapatanLayanan - m.returPenjualan - m.diskonPenjualan;
            m.labaKotor     = m.pendapatanNeto - m.hppBarang - m.hppDigital;
            m.marginPct     = m.pendapatanNeto > 0 ? (m.labaKotor / m.pendapatanNeto) * 100 : 0;
            return m;
        }

        // --- DASHBOARD ---
        function renderDashboard() {
            // [FIX 2.1] Ambil rentang tanggal dari filter
            var range = getDashboardDateRange();
            var startTime = range.start;
            var endTime = range.end;
            var filterMode = range.filter;
            var isToday = (filterMode === 'today');

            // Update label tanggal
            var dateLabel = document.getElementById('dash-date');
            if (dateLabel) {
                var optShort = { day: 'numeric', month: 'short', year: 'numeric' };
                if (filterMode === 'today') {
                    dateLabel.innerText = range.startDate.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
                } else if (filterMode === 'yesterday') {
                    dateLabel.innerText = range.startDate.toLocaleDateString('id-ID', optShort);
                } else {
                    dateLabel.innerText = range.startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ' - ' + range.endDate.toLocaleDateString('id-ID', optShort);
                }
            }

            // Update judul dashboard
            var dashTitleEl = document.getElementById('dash-title');
            if (dashTitleEl) {
                var titleMap = { today: 'Ringkasan Hari Ini', yesterday: 'Ringkasan Kemarin', week: 'Ringkasan 7 Hari', month: 'Ringkasan Bulan Ini' };
                dashTitleEl.innerText = titleMap[filterMode] || 'Ringkasan';
            }

            // [PATCH v7.19 #2] Dashboard pakai SUMBER YANG SAMA dengan Laba Rugi
            // (jurnal engine) supaya angka konsisten di seluruh aplikasi.
            // Perubahan: kasbon (status HUTANG) SEKARANG ikut terhitung di omset
            // karena secara akuntansi accrual sudah menjadi pendapatan (D 112 / K 411).
            var isAdminUser = !!(state.user && state.user.role === 'Admin');
            var mMetricsDash = isAdminUser
              ? computeFinancialMetrics(startTime, endTime)
              : computeMetricsFromTransactions(startTime, endTime);

            var dSBarang  = mMetricsDash.pendapatanBarang;
            var dSLayanan = mMetricsDash.pendapatanLayanan;
            var dS        = mMetricsDash.pendapatanNeto;
            var dPBarang  = mMetricsDash.pendapatanBarang - mMetricsDash.hppBarang;
            var dPLayanan = mMetricsDash.pendapatanLayanan - mMetricsDash.hppDigital;
            var dP        = mMetricsDash.labaKotor;
            var dOmset    = dS;   // basis margin = pendapatan neto
            var dExp = 0, dCountOnl = 0, dCountOff = 0;
            var todayTxArr = [];

            // [FIX #11] Loop transaksi — pisahkan RETUR dari hitungan "Transaksi"
            var dCountRetur = 0;
            for(var i=0; i<state.transactions.length; i++) { 
                var t = state.transactions[i]; 
                if(t.tanggal >= startTime && t.tanggal <= endTime) { 
                    var _st = String(t.status || '').trim().toUpperCase();
                    if (_st === 'RETUR') {
                        dCountRetur++;
                    } else {
                        if(String(t.id).startsWith('ONL')) dCountOnl++; else dCountOff++;
                    }
                    todayTxArr.push(t);
                } 
            }
            // [PATCH v7.19 #2] todayLayanan hanya untuk daftar list, kalkulasi sudah di engine
            var todayLayanan = (state.layananDigital || []).filter(function(l) {
                return l.tanggal >= startTime && l.tanggal <= endTime;
            });

            // Loop untuk COUNT & daftar Transaksi Hari Ini (tidak hitung ulang omset)
            for (var ll = 0; ll < todayLayanan.length; ll++) {
                var layItem = todayLayanan[ll];
                dCountOff++;

                // ═══ [PATCH H1] Untuk TARIK_TUNAI, pisahkan fee (revenue) dari pass-through (uang fisik) ═══
                var jenisLay = String(layItem.jenis);
                var nominalLay = Number(layItem.nominal) || 0;
                var feeLay = Number(layItem.fee) || 0;
                var uangFisikLay = nominalLay - feeLay;  // untuk TARIK_TUNAI

                var tvDash;
                if (jenisLay === 'TARIK_TUNAI') {
                    // Untuk dashboard "Pembayaran Hari Ini", hanya fee yang dianggap "revenue"
                    // Pass-through uang fisik ditampilkan di baris terpisah (cash outflow)
                    tvDash = feeLay;
                } else if (jenisLay === 'TOPUP_EWALLET') {
                    tvDash = feeLay;  // revenue = fee
                } else {
                    // PRODUK_DIGITAL: harga jual penuh (revenue), modal = HPP
                    tvDash = nominalLay;
                }

                todayTxArr.push({
                    id:         layItem.id,
                    tanggal:    layItem.tanggal,
                    total:      tvDash,               // untuk dashboard metrics
                    totalBruto: nominalLay,           // untuk detail (list Transaksi Hari Ini)
                    uangFisik:  uangFisikLay,         // untuk TARIK_TUNAI (tracking outflow)
                    status:     'LAYANAN',
                    metode:     layItem.metode,
                    isLayanan:  true,
                    jenis:      jenisLay,
                    pelanggan:  layItem.keterangan || '-',
                    kasir:      layItem.kasir || '-'
                });
            }

            // KODE BARU (PENGELUARAN KAS HARI INI YANG AKURAT)
            for(var j=0; j<state.purchases.length; j++) { 
              if(state.purchases[j].tanggal >= startTime && state.purchases[j].tanggal <= endTime) { 
                if(state.purchases[j].metode !== 'Hutang') {
                  dExp += state.purchases[j].totalBiaya; 
                }
              } 
            } 
            for(var b=0; b<state.beban.length; b++) { 
              if(state.beban[b].tanggal >= startTime && state.beban[b].tanggal <= endTime) { 
                var kb = state.beban[b].kategori;
                var isNonKas = ['Setoran Modal', 'Penerimaan Pinjaman', 'Pendapatan Lainnya', 
                                'Penyusutan Aset', 'Penarikan Bank ke Kas'];
                if (isNonKas.indexOf(kb) === -1) { 
                  dExp += state.beban[b].nominal; 
                }
              } 
            }

            // [NEW] Hitung omset kemarin untuk perbandingan
            var kemarin = new Date();
            kemarin.setDate(kemarin.getDate() - 1);
            var kemarinStr = kemarin.toDateString();
            var dSKemarin = 0;
            for (var kI = 0; kI < state.transactions.length; kI++) {
                var tKI = state.transactions[kI];
                if (new Date(tKI.tanggal).toDateString() === kemarinStr) {
                    if (tKI.status !== 'RETUR' && tKI.status !== 'HUTANG') {
                        dSKemarin += tKI.total;
                    }
                }
            }
            // Tambah fee dari layanan digital kemarin
            for (var kL = 0; kL < (state.layananDigital || []).length; kL++) {
                var layKI = state.layananDigital[kL];
                if (new Date(layKI.tanggal).toDateString() === kemarinStr) {
                    dSKemarin += Number(layKI.fee) || 0;
                }
            }

            // [FIX #5] Hitung omset minggu lalu (hari yang sama, 7 hari lalu)
            var mingguLaluDate = new Date();
            mingguLaluDate.setDate(mingguLaluDate.getDate() - 7);
            var mingguLaluStr = mingguLaluDate.toDateString();
            var dSMingguLalu = 0;
            for (var kM = 0; kM < state.transactions.length; kM++) {
                var tKM = state.transactions[kM];
                if (new Date(tKM.tanggal).toDateString() === mingguLaluStr) {
                    if (tKM.status !== 'RETUR' && tKM.status !== 'HUTANG') {
                        dSMingguLalu += tKM.total;
                    }
                }
            }
            for (var kL2m = 0; kL2m < (state.layananDigital || []).length; kL2m++) {
                var layKM = state.layananDigital[kL2m];
                if (new Date(layKM.tanggal).toDateString() === mingguLaluStr) {
                    dSMingguLalu += Number(layKM.fee) || 0;
                }
            }

            // [FIX 2.3] Hitung juga delta untuk transaksi & laba kemarin
            var kemarinCount = 0;
            var dPKemarin = 0;
            //var kemarinMarginPct = 0;

            for (var kC = 0; kC < state.transactions.length; kC++) {
                var tKC = state.transactions[kC];
                if (new Date(tKC.tanggal).toDateString() === kemarinStr) {
                    var stN = String(tKC.status || '').trim().toUpperCase();
                if (stN !== 'RETUR' && stN !== 'HUTANG') {
                    dPKemarin += tKC.laba;
                }
                    kemarinCount++;
                }
            }
            // Tambah layanan digital kemarin (count + laba)
            for (var kL2 = 0; kL2 < (state.layananDigital || []).length; kL2++) {
                var layKC = state.layananDigital[kL2];
                if (new Date(layKC.tanggal).toDateString() === kemarinStr) {
                    kemarinCount++;
                    dPKemarin += Number(layKC.fee) || 0;
                }
            }
            //kemarinMarginPct = dSKemarin > 0 ? (dPKemarin / dSKemarin) * 100 : 0;

            // Render delta
            var deltaEl = document.getElementById('dash-sales-delta');
            if (deltaEl) {
                if (!isToday) {
                    deltaEl.innerHTML = '<i class="fas fa-info-circle text-slate-300 mr-1"></i><span class="text-slate-400">' + (filterMode === 'yesterday' ? 'Data kemarin' : 'Data periode') + '</span>';
                } else {
                    // [FIX #5] Dual comparison: vs kemarin & vs minggu lalu
                    deltaEl.innerHTML =
                        '<span class="block">' + buildDeltaLine(dS, dSKemarin, 'vs kmrn') + '</span>' +
                        '<span class="block mt-0.5">' + buildDeltaLine(dS, dSMingguLalu, 'vs mgg lalu') + '</span>';
                }
            }
			
            // [PATCH AKUNTANSI] Render total + breakdown Barang vs Layanan
            // [FIX #4] Retur + Diskon breakdown agar Barang + Layanan − Retur = Total
            var dSReturDiskon = (mMetricsDash.returPenjualan || 0) + (mMetricsDash.diskonPenjualan || 0);

            if(document.getElementById('dash-sales'))           document.getElementById('dash-sales').innerText = formatRp(dS);
            if(document.getElementById('dash-sales-barang'))    document.getElementById('dash-sales-barang').innerText = formatRp(dSBarang);
            if(document.getElementById('dash-sales-layanan'))   document.getElementById('dash-sales-layanan').innerText = formatRp(dSLayanan);
            if(document.getElementById('dash-profit-barang'))   document.getElementById('dash-profit-barang').innerText = formatRp(dPBarang);
            if(document.getElementById('dash-profit-layanan'))  document.getElementById('dash-profit-layanan').innerText = formatRp(dPLayanan);

            // Toggle row retur (hanya muncul kalau ada)
            var _rdRow = document.getElementById('dash-sales-retur-row');
            var _rdVal = document.getElementById('dash-sales-retur');
            if (_rdRow && _rdVal) {
                if (dSReturDiskon > 0) {
                    _rdVal.innerText = '- ' + formatRp(dSReturDiskon);
                    _rdRow.classList.remove('hidden');
                } else {
                    _rdRow.classList.add('hidden');
                }
            }
            var _prRow = document.getElementById('dash-profit-retur-row');
            var _prVal = document.getElementById('dash-profit-retur');
            if (_prRow && _prVal) {
                if (dSReturDiskon > 0) {
                    _prVal.innerText = '- ' + formatRp(dSReturDiskon);
                    _prRow.classList.remove('hidden');
                } else {
                    _prRow.classList.add('hidden');
                }
            }
            if(document.getElementById('dash-count')) {
                var _countEl = document.getElementById('dash-count');
                _countEl.innerText = (dCountOnl + dCountOff) + 'x';
                _countEl.title = dCountRetur > 0
                    ? (dCountOnl + dCountOff) + ' transaksi aktif · ' + dCountRetur + ' retur (tidak dihitung)'
                    : (dCountOnl + dCountOff) + ' transaksi';
            }  
            if(document.getElementById('dash-count-onl')) document.getElementById('dash-count-onl').innerText = dCountOnl;
            if(document.getElementById('dash-count-off')) document.getElementById('dash-count-off').innerText = dCountOff;
            if(document.getElementById('dash-profit')) document.getElementById('dash-profit').innerText = formatRp(dP); 
            if(document.getElementById('dash-expense')) document.getElementById('dash-expense').innerText = formatRp(dExp);
            // [FIX 1.1] Info delta pengeluaran
            var expenseInfoEl = document.getElementById('dash-expense-delta');
            if (expenseInfoEl) {
                if (dExp === 0) {
                    expenseInfoEl.innerHTML = '<i class="fas fa-check-circle text-emerald-400 mr-1"></i><span class="text-emerald-500">Hemat! Tidak ada pengeluaran</span>';
                } else {
                    // [FIX] Hitung beban dalam rentang filter yang sedang aktif
                    var expenseHariIni = state.beban.filter(function(b) {
                        return b.tanggal >= startTime && b.tanggal <= endTime;
                    }).length;
                    
                    // Label dinamis sesuai filter
                    var labelMap = { today: 'hari ini', yesterday: 'kemarin', week: '7 hari', month: 'bulan ini' };
                    var label = labelMap[filterMode] || 'periode ini';
                    
                    expenseInfoEl.innerHTML = '<i class="fas fa-receipt text-orange-400 mr-1"></i><span class="text-orange-500">' + expenseHariIni + ' trx kas keluar (' + label + ')</span>';
                }
            }
            
            var dashTable = document.getElementById('dash-today-table');
            if(dashTable) {
                todayTxArr.sort(function(a,b) { return b.tanggal - a.tanggal; });
                var maxRows = Math.min(todayTxArr.length, 15); 
                var todayTxHtml = '';
                for(var z=0; z < maxRows; z++) {
                    var tz = todayTxArr[z];
                    var timeStr = new Date(tz.tanggal).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
                    
                    // [FIX] Dukung Layanan Digital (TARIK_TUNAI / PRODUK_DIGITAL)
                    var isLayanan = tz.isLayanan === true;
                    var isOnline  = !isLayanan && String(tz.id).startsWith('ONL');
                    
                    var statColor = tz.status === 'RETUR'   ? 'text-red-500 bg-red-50'
                                : tz.status === 'HUTANG'  ? 'text-orange-500 bg-orange-50'
                                : isLayanan               ? 'text-purple-600 bg-purple-50'
                                :                           'text-emerald-500 bg-emerald-50';
      
                    var statusLabel = tz.status === 'HUTANG' ? 'KASBON'
                                  : isLayanan
                                      ? (tz.jenis === 'TARIK_TUNAI' ? 'TARIK TUNAI' : 'DIGITAL')
                                      : tz.status;
      
                    var icon = isLayanan
                        ? '<i class="fas fa-mobile-alt text-purple-500 mr-1.5" title="Layanan Digital"></i>'
                       : isOnline
                           ? '<i class="fas fa-globe text-blue-500 mr-1.5" title="Online"></i>'
                           : '<i class="fas fa-store text-slate-400 mr-1.5" title="Offline"></i>';
      
                    var clickAction = isLayanan
                       ? `openLayananDetail('${tz.id}')`
                       : `openTxDetail('${tz.id}')`;

                    // Untuk TARIK_TUNAI tampilkan fee sebagai revenue
                    var displayTotal = tz.total;
                    var displaySubtitle = '';
                    if (tz.isLayanan && tz.jenis === 'TARIK_TUNAI') {
                        displaySubtitle = '<span class="text-[8px] text-slate-400 block">Tarik ' + formatRp(tz.totalBruto) + ' (fee)</span>';
                    }
      
                    todayTxHtml += `<tr class="hover:bg-slate-100/50 transition-colors cursor-pointer" onclick="${clickAction}">
                                        <td class="p-3 whitespace-nowrap">
                                            <p class="text-[10px] text-slate-400 font-bold mb-0.5">${timeStr}</p>
                                            <p class="font-mono text-slate-700 font-bold text-xs">${icon}${escapeHtml(tz.id)}</p>
                                        </td>
                                        <td class="p-3 text-right">
                                            <span class="px-2 py-0.5 rounded font-black text-[9px] mb-1 inline-block ${statColor}">${escapeHtml(statusLabel)}</span>
                                            <p class="font-black text-slate-800 text-sm">${formatRp(tz.total)}</p>
                                        </td>
                                    </tr>`;
                }
                dashTable.innerHTML = todayTxHtml || '<tr><td colspan="2" class="text-center py-10 text-slate-400 font-bold"><i class="fas fa-receipt text-2xl mb-2 text-slate-300 block"></i>Belum ada transaksi</td></tr>';
            }
			
            var lbs = [], dts = []; var filter = document.getElementById('chart-filter') ? document.getElementById('chart-filter').value : 'daily'; var now = new Date();
            if (filter === 'daily') {
                for(var dIdx=6; dIdx>=0; dIdx--) { var d = new Date(now); d.setDate(d.getDate() - dIdx); lbs.push(d.toLocaleDateString('id-ID', {day:'numeric', month:'short'})); dts.push(0); }
                for(var k=0; k<state.transactions.length; k++) { var trx = state.transactions[k]; if(trx.status === 'RETUR' || trx.status === 'HUTANG') continue; var dStr = new Date(trx.tanggal).toLocaleDateString('id-ID', {day:'numeric', month:'short'}); var idx = lbs.indexOf(dStr); if(idx > -1) dts[idx] += trx.total; }
            } else if (filter === 'weekly') {
                for(var wIdx=3; wIdx>=0; wIdx--) { lbs.push(wIdx === 0 ? 'Mgg Ini' : (wIdx + ' Mgg Lalu')); dts.push(0); }
                var todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime(); var msPerWeek = 7 * 24 * 60 * 60 * 1000;
                for(var k=0; k<state.transactions.length; k++) { var trx = state.transactions[k]; if(trx.status === 'RETUR' || trx.status === 'HUTANG') continue; var diffTime = todayEnd - trx.tanggal; if (diffTime >= 0 && diffTime < 4 * msPerWeek) { var weekIdx = 3 - Math.floor(diffTime / msPerWeek); if(weekIdx >= 0 && weekIdx <= 3) dts[weekIdx] += trx.total; } }
            } else if (filter === 'monthly') {
                for(var mIdx=5; mIdx>=0; mIdx--) { var d = new Date(now.getFullYear(), now.getMonth() - mIdx, 1); lbs.push(d.toLocaleDateString('id-ID', {month:'short', year:'2-digit'})); dts.push(0); }
                for(var k=0; k<state.transactions.length; k++) { var trx = state.transactions[k]; if(trx.status === 'RETUR' || trx.status === 'HUTANG') continue; var tStr = new Date(trx.tanggal).toLocaleDateString('id-ID', {month:'short', year:'2-digit'}); var idx = lbs.indexOf(tStr); if(idx > -1) dts[idx] += trx.total; }
            }
            
            if (typeof Chart !== 'undefined') {
              if (salesChartInstance) {
                try { salesChartInstance.destroy(); } catch (_) {}
                salesChartInstance = null;
              } 
                var canvas = document.getElementById('salesChart');
                if (canvas) {
                    salesChartInstance = new Chart(canvas.getContext('2d'), { type: 'line', data: { labels: lbs, datasets: [{ label: 'Omset', data: dts, borderColor: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.1)', borderWidth: 3, fill: true, tension: 0.4, pointBackgroundColor: '#ffffff', pointBorderColor: '#2563eb', pointBorderWidth: 2, pointRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { borderDash: [5, 5] } }, x: { grid: { display: false } } } } });
                }
            }
            
            // [PATCH v7.19] Track Qty + Revenue + LABA + Filter Tanggal
            var cnts = {};
            var revenueMap = {};
            var labaMap = {};

            for(var n=0; n<state.transactions.length; n++) {
                var txn = state.transactions[n];
                if(txn.status === 'RETUR' || txn.status === 'HUTANG') continue;
                if(txn.tanggal < startTime || txn.tanggal > endTime) continue;  // ← FILTER TANGGAL
                
                var items = [];
                try { items = JSON.parse(txn.cartJson); } catch(e) {}
                
                for (var m=0; m<items.length; m++) {
                    var itm = items[m];
                    if (!itm.nama) continue;
                    
                    var produk = state.products.find(function(x){ 
                        return String(x.id) === String(itm.id); 
                    });
                    var hppItm = produk ? (Number(produk.hargaBeli) || 0) : 0;
                    var qtyItm = Number(itm.qty) || 0;
                    var jualItm = Number(itm.hargaJual) || 0;
                    
                    cnts[itm.nama]       = (cnts[itm.nama] || 0) + qtyItm;
                    revenueMap[itm.nama] = (revenueMap[itm.nama] || 0) + (qtyItm * jualItm);
                    labaMap[itm.nama]    = (labaMap[itm.nama] || 0) + ((jualItm - hppItm) * qtyItm);
                }
            } 
            
            // [FIX] Terlaris — masukkan Layanan Digital sebagai pseudo-item
            for (var ld = 0; ld < (state.layananDigital || []).length; ld++) {
                var layTop = state.layananDigital[ld];
                var namaTop;
                if (String(layTop.jenis) === 'TARIK_TUNAI') { namaTop = 'Tarik Tunai';
                } else {
                    var ketTop = String(layTop.keterangan || '');
                    var idxTop = ketTop.lastIndexOf(' - ');
                    namaTop = idxTop > -1 ? ketTop.substring(0, idxTop).trim() : ketTop.trim();
                    if (!namaTop) namaTop = 'Produk Digital';
                }
                cnts[namaTop] = (cnts[namaTop] || 0) + 1;
            }

            var sortedCnts = Object.keys(cnts).map(function(key) { return [key, cnts[key]]; }); sortedCnts.sort(function(a,b) { return b[1] - a[1]; }); sortedCnts = sortedCnts.slice(0, 15);
            
            // [PATCH v7.19] Render Terlaris dengan Qty + Omzet + Laba
            var htmlTop = ''; 
            if(sortedCnts.length === 0) { 
                htmlTop = '<div class="text-center text-slate-400 text-xs py-4 font-bold">Belum ada data</div>'; 
            } else { 
                for(var s=0; s<sortedCnts.length; s++) { 
                    var name = sortedCnts[s][0];
                    var qty = sortedCnts[s][1];
                    var revenue = revenueMap[name] || 0;
                    var laba = labaMap[name] || 0;
                    
                    htmlTop += '<div class="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">' +
                        '<div class="min-w-0 flex-1 pr-2">' +
                            '<div class="text-xs font-bold text-slate-700 truncate">' +
                                '<span class="text-orange-500 mr-1.5 font-black">#' + (s+1) + '</span>' + 
                                escapeHtml(name) +
                            '</div>' +
                            '<div class="text-[9px] font-bold text-slate-400 mt-0.5 flex gap-2">' + 
                                '<span>Omzet: ' + formatRp(revenue) + '</span>' +
                                '<span class="text-emerald-600">Laba: ' + formatRp(laba) + '</span>' +
                            '</div>' +
                        '</div>' +
                        '<span class="text-[10px] font-black bg-orange-100 text-orange-700 px-2 py-0.5 rounded shrink-0">' + 
                            qty + 'x</span>' +
                    '</div>'; 
                } 
            }

            if(document.getElementById('dash-top-list')) document.getElementById('dash-top-list').innerHTML = htmlTop;

            var lowStockArr = state.products.filter(p => p.stok <= 5).sort((a,b) => a.stok - b.stok);
            var htmlLow = ''; 
            if(lowStockArr.length === 0) { htmlLow = '<div class="text-center text-emerald-500 text-xs py-8 font-bold"><i class="fas fa-check-circle mb-2 block text-2xl"></i> Semua stok aman</div>'; } 
            else { for(var ls=0; ls<lowStockArr.length; ls++) { var stColor = lowStockArr[ls].stok === 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'; htmlLow += '<div class="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100"><span class="text-xs font-bold text-slate-700 truncate pr-2">' + escapeHtml(lowStockArr[ls].nama) + '</span><span class="text-[10px] font-black px-2 py-0.5 rounded ' + stColor + '">Sisa ' + lowStockArr[ls].stok + '</span></div>'; } }
            if(document.getElementById('dash-low-list')) document.getElementById('dash-low-list').innerHTML = htmlLow;

            var pTunai = 0, pQris = 0, pKasbon = 0;
            for(var z=0; z < todayTxArr.length; z++) {
                var tzz = todayTxArr[z];
                var statusTzz = String(tzz.status || '').trim().toUpperCase();
                var metodeTzz = String(tzz.metode || '').trim();

                if (statusTzz === 'RETUR') continue;

                // [PATCH H1] Gunakan `total` (sudah difilter: revenue-only untuk layanan)
                var val = Number(tzz.total) || 0;

                if (metodeTzz === 'Tunai')                       pTunai  += val;
                else if (metodeTzz === 'QRIS')                   pQris   += val;
                else if (metodeTzz === 'Kasbon' || statusTzz === 'HUTANG') pKasbon += val;
                else if (metodeTzz === 'SPLIT' || metodeTzz === 'QRIS+Tunai') pQris += val;  // treat as QRIS
            }
            var totalAllPay = pTunai + pQris + pKasbon;
            var htmlPay = '';
            if(totalAllPay === 0) { htmlPay = '<div class="text-center text-slate-400 text-xs font-bold">Belum ada transaksi</div>'; } 
            else { 
                var pctTunai = Math.round((pTunai/totalAllPay)*100); 
                var pctQris = Math.round((pQris/totalAllPay)*100); 
                var pctKasbon = Math.round((pKasbon/totalAllPay)*100); 
                
                // Format nominal Rupiah
                var rpTunai = formatRp(pTunai);
                var rpQris = formatRp(pQris);
                var rpKasbon = formatRp(pKasbon);
                
                htmlPay += `<div class="space-y-3 mt-1">
                    <div>
                        <div class="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                            <span><i class="fas fa-money-bill-wave text-emerald-500 mr-1.5"></i> Tunai</span>
                            <span>${rpTunai} (${pctTunai}%)</span>
                        </div>
                        <div class="w-full bg-slate-200/70 rounded-full h-1.5">
                            <div class="bg-emerald-500 h-1.5 rounded-full" style="width: ${pctTunai}%"></div>
                        </div>
                    </div>
                    <div>
                        <div class="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                            <span><i class="fas fa-qrcode text-blue-500 mr-1.5"></i> QRIS</span>
                            <span>${rpQris} (${pctQris}%)</span>
                        </div>
                        <div class="w-full bg-slate-100 rounded-full h-1.5">
                            <div class="bg-blue-500 h-1.5 rounded-full" style="width: ${pctQris}%"></div>
                        </div>
                    </div>
                    <div>
                        <div class="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                            <span><i class="fas fa-handshake text-red-500 mr-1.5"></i> Kasbon</span>
                            <span>${rpKasbon} (${pctKasbon}%)</span>
                        </div>
                        <div class="w-full bg-slate-100 rounded-full h-1.5">
                            <div class="bg-red-500 h-1.5 rounded-full" style="width: ${pctKasbon}%"></div>
                        </div>
                    </div>
                </div>`; 
            }
            if(document.getElementById('dash-payment-methods')) document.getElementById('dash-payment-methods').innerHTML = htmlPay;

            var marginData = analisisKategori();
            var htmlMargin = '';
            if(marginData.length === 0) { htmlMargin = '<div class="text-center text-slate-400 text-xs py-8 font-bold">Belum ada data</div>'; } 
            else { for(var m = 0; m < marginData.length; m++) { var cat = marginData[m]; var warnaMargin = cat.margin > 40 ? 'text-emerald-700 bg-emerald-100' : (cat.margin > 20 ? 'text-blue-700 bg-blue-100' : 'text-orange-700 bg-orange-100'); htmlMargin += '<div class="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100"><span class="text-xs font-bold text-slate-700 truncate pr-2">' + escapeHtml(cat.kategori) + '</span><span class="text-[10px] font-black px-2 py-0.5 rounded ' + warnaMargin + '">' + cat.margin + '%</span></div>'; } }
            if(document.getElementById('dash-margin-list')) document.getElementById('dash-margin-list').innerHTML = htmlMargin;

            // KODE BARU: 5 IDE DASHBOARD TAMBAHAN

            // 1. Kalkulasi Akuntansi Real-time (Kas, Piutang, Hutang, Persediaan)
            // [v7.19] KALKULASI AKUNTANSI REAL-TIME
            var dKas = 0, dPiutang = 0, dHutang = 0, dPersediaan = 0;
            var dBank = 0, dTransit = 0, dDeposit = 0;   // [NEW]

            // ✅ GANTI dengan lookup langsung
			var _sb = state._saldoByAccount || {};
			var dKas        = Number(_sb['111']) || 0;
			var dPiutang    = Number(_sb['112']) || 0;
			var dHutang     = -(Number(_sb['211']) || 0);   // normal kredit
			var dPersediaan = Number(_sb['113']) || 0;
			var dBank       = Number(_sb['115']) || 0;
			var dTransit    = Number(_sb['116']) || 0;
			var dDeposit    = Number(_sb['117']) || 0;

            // Render widget lama
            if(document.getElementById('dash-kas'))        document.getElementById('dash-kas').innerText = formatRp(dKas);
            if(document.getElementById('dash-piutang'))    document.getElementById('dash-piutang').innerText = formatRp(dPiutang);
            if(document.getElementById('dash-hutang'))     document.getElementById('dash-hutang').innerText = formatRp(dHutang);
            if(document.getElementById('dash-persediaan')) document.getElementById('dash-persediaan').innerText = formatRp(dPersediaan);

            // [NEW] Render widget baru
            if(document.getElementById('dash-bank'))    document.getElementById('dash-bank').innerText = formatRp(dBank);
            if(document.getElementById('dash-transit')) document.getElementById('dash-transit').innerText = formatRp(dTransit);
            if(document.getElementById('dash-deposit')) document.getElementById('dash-deposit').innerText = formatRp(dDeposit);

            // [NEW] Hitung Margin Hari Ini (%) dari dS (penjualan bersih) & dP (laba bersih)
            //var marginHariIni = (dS > 0) ? ((dP / dS) * 100) : 0;
            // [FIX] Margin = Laba / Omset Kotor riil (bukan / dS net kontribusi)
            var marginHariIni = (dOmset > 0) ? ((dP / dOmset) * 100) : 0;
            var marginEl = document.getElementById('dash-margin-today');
            if(marginEl) {
                // Background sudah gradient indigo — angka selalu putih + emoji indikator
                var emoji = '';
                if (dOmset === 0) {
                    emoji = '';  // Belum ada data
                } else if (marginHariIni >= 25) {
                    emoji = ' 🚀';  // Sehat
                } else if (marginHariIni >= 10) {
                    emoji = ' ✓';   // Normal
                } else if (marginHariIni > 0) {
                    emoji = ' ⚠️';  // Perlu perhatian
                } else {
                    emoji = ' 📉';  // Rugi
                }
                
                marginEl.innerHTML = marginHariIni.toFixed(1) + '%' + emoji;
                marginEl.className = 'text-xl md:text-2xl font-black text-white truncate';
            }
            var marginLabelEl = document.getElementById('dash-margin-today-label');
            var marginBigEl   = document.getElementById('dash-margin-today');
            if (marginLabelEl) {
                if (dOmset === 0) {
                    marginLabelEl.innerText = 'Belum ada transaksi';
                    if (marginBigEl) marginBigEl.title = '';
                } else {
                    // [FIX] Tampilkan basis perhitungan agar user tidak bingung
                    // saat angka Penjualan Bersih (dS) ≠ basis margin (dOmset).
                    // Format: "Laba ÷ Omset Kotor"
                    marginLabelEl.innerText = formatRp(dP) + ' ÷ ' + formatRp(dOmset);

                    // Status tetap tersedia via tooltip
                    var statusText;
                    if (marginHariIni >= 25) statusText = 'Margin sehat ✓ (≥25%)';
                    else if (marginHariIni >= 10) statusText = 'Margin normal (10–25%)';
                    else if (marginHariIni > 0) statusText = 'Perlu perhatian (<10%)';
                    else statusText = '⚠️ Rugi!';

                    if (marginBigEl) marginBigEl.title = statusText + ' — Laba ' + formatRp(dP) + ' ÷ Omset Kotor ' + formatRp(dOmset);
                    marginLabelEl.title = statusText;
                }
            }

            // [FIX 2.3] Render delta untuk transaksi, laba, margin
            var inactiveTextMap = { yesterday: 'Data kemarin', week: 'Data periode', month: 'Data periode' };
            var inactiveText = inactiveTextMap[filterMode] || 'Data periode';

            renderDelta('dash-trx-delta', 
                (dCountOnl + dCountOff), 
                kemarinCount, 
                { unit: 'vs kemarin', mode: 'percent', isActive: isToday, inactiveText: inactiveText }
            );

            // Tambahkan setelah dCountOff render:
            if (document.getElementById('dash-count-retur')) {
                document.getElementById('dash-count-retur').innerText = dCountRetur;
                var _rw = document.getElementById('dash-count-retur-wrap');
                if (_rw) { if (dCountRetur > 0) _rw.classList.remove('hidden'); else _rw.classList.add('hidden'); }
            }

            renderDelta('dash-profit-delta', 
                dP, 
                dPKemarin, 
                { unit: 'vs kemarin', mode: 'percent', isActive: isToday, inactiveText: inactiveText }
            );

            // 2. Kalkulasi Jam Sibuk & Top Pelanggan
            var peakHours = new Array(24).fill(0); 
            var custMap = {};

            for(var tx=0; tx<state.transactions.length; tx++) {
                var dTrx = state.transactions[tx];
                if(dTrx.status !== 'RETUR') {
                    var txHour = new Date(dTrx.tanggal).getHours();
                    peakHours[txHour]++;

                    var pel = (dTrx.pelanggan && dTrx.pelanggan !== '-') ? dTrx.pelanggan.trim() : null;
                    if(pel && pel.toLowerCase() !== 'guest') {
                        custMap[pel] = (custMap[pel] || 0) + dTrx.total;
                    }
                }
            }

            // [FIX] Top Pelanggan — tambahkan pelanggan dari Layanan Digital.
            // TARIK_TUNAI: nilai kontribusi = fee (nominal pass-through)
            // PRODUK_DIGITAL: nilai kontribusi = nominal (harga jual penuh)
            // Nama pelanggan di-parse dari keterangan (format: "... - <pelanggan>")
            for (var lc = 0; lc < (state.layananDigital || []).length; lc++) {
                var layCust = state.layananDigital[lc];
                var ketCust = String(layCust.keterangan || '');
                var idxCust = ketCust.lastIndexOf(' - ');
                if (idxCust === -1) continue;
                var namaCust = ketCust.substring(idxCust + 3).trim();
                if (!namaCust || namaCust === '-') continue;
                var jenisCust = String(layCust.jenis);
                var nilaiCust = (jenisCust === 'TARIK_TUNAI' || jenisCust === 'TOPUP_EWALLET')
                    ? (Number(layCust.fee) || 0)
                    : (Number(layCust.nominal) || 0);
                custMap[namaCust] = (custMap[namaCust] || 0) + nilaiCust;
            }

            // 3. Render Grafik Jam Sibuk (Chart.js)
            if (typeof Chart !== 'undefined' && window.peakChartInstance) { window.peakChartInstance.destroy(); }
            var peakCanvas = document.getElementById('peakHoursChart');
            if (peakCanvas && typeof Chart !== 'undefined') {
                var hourLabels = Array.from({length: 24}, (_, i) => String(i).padStart(2, '0') + ":00");
                window.peakChartInstance = new Chart(peakCanvas.getContext('2d'), { 
                    type: 'bar', 
                    data: { 
                        labels: hourLabels, 
                        datasets: [{ 
                            label: 'Jumlah Transaksi', 
                            data: peakHours, 
                            backgroundColor: 'rgba(99, 102, 241, 0.8)', 
                            borderRadius: 4
                        }] 
                    }, 
                    options: { 
                        responsive: true, maintainAspectRatio: false, 
                        plugins: { legend: { display: false } }, 
                        scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false }, ticks: { font: { size: 8 }, maxRotation: 45, minRotation: 45 } } } 
                    } 
                });
            }

            // 4. Render Top 5 Pelanggan Setia
            var sortedCust = Object.keys(custMap).map(function(key) { return [key, custMap[key]]; });
            sortedCust.sort(function(a,b) { return b[1] - a[1]; }); 
            sortedCust = sortedCust.slice(0, 5); 

            var htmlCust = '';
            if(sortedCust.length === 0) {
                htmlCust = '<div class="text-center text-slate-400 text-xs py-6 font-bold">Belum ada data pelanggan</div>';
            } else {
                for(var sc=0; sc<sortedCust.length; sc++) {
                    var rankColor = sc === 0 ? 'text-yellow-500' : (sc === 1 ? 'text-slate-400' : (sc === 2 ? 'text-amber-700' : 'text-slate-300'));
                    htmlCust += `<div class="flex justify-between items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                    <span class="text-xs font-bold text-slate-700 truncate min-w-0 flex-1"><i class="fas fa-medal mr-1 ${rankColor}"></i> ${escapeHtml(sortedCust[sc][0])}</span>
                                    <span class="text-[10px] font-black bg-pink-100 text-pink-700 px-2 py-0.5 rounded whitespace-nowrap shrink-0">${formatRp(sortedCust[sc][1])}</span>
                                  </div>`;
                }
            }
            if(document.getElementById('dash-top-cust')) document.getElementById('dash-top-cust').innerHTML = htmlCust;
            // [FIX 3.1] Render insight banner
            renderWidgetAOV(); renderInsightBanner();
        }

        // INITIALIZE DRAG AND DROP
        function initDashboardDragAndDrop() {
            var el = document.getElementById('dashboard-sortable-grid');
            if(!el) return;
            
            // Restore layout dari localStorage
            var savedOrder = storageManager.get('pos_dash_layout');
            if(savedOrder) {
                try {
                    var orderArr = JSON.parse(savedOrder);
                    orderArr.forEach(function(id) {
                        var child = document.querySelector('[data-wid="' + id + '"]');
                        if(child) el.appendChild(child); // appends di urutan akhir (menyusun ulang)
                    });
                } catch(e){}
            }

            // Aktifkan Sortable
            if(typeof Sortable !== 'undefined') {
                new Sortable(el, {
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    handle: '.drag-handle', // Hanya bisa digeser lewat icon handle
                    onEnd: function () {
                        // Simpan urutan terbaru ke localStorage
                        var order = [];
                        el.querySelectorAll('.dash-widget').forEach(function(item) {
                            order.push(item.getAttribute('data-wid'));
                        });
                        storageManager.set('pos_dash_layout', JSON.stringify(order));
                    },
                });
            }
        }

        // [FIX 3.2] Toggle tampil semua widget di mobile
        function toggleMobileWidgets() {
            var grid = document.getElementById('dashboard-sortable-grid');
            var labelEl = document.getElementById('toggle-mobile-text');
            if (!grid) return;
            
            var isExpanded = grid.classList.toggle('show-all-mobile');
            if (labelEl) {
                labelEl.innerText = isExpanded ? 'Sembunyikan Widget Lain' : 'Tampilkan Semua Widget';
            }
        }

        // Reset Posisi Default UI Dashboard
        function resetDashboardLayout() {
            Swal.fire({
                title: 'Reset UI Dashboard?',
                text: "Posisi widget akan dikembalikan ke posisi bawaan pabrik.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Ya, Reset',
                cancelButtonText: 'Batal',
                confirmButtonColor: '#3b82f6',
                cancelButtonColor: '#94a3b8'
            }).then((result) => {
                if (result.isConfirmed) {

                    // 1. Hapus layout tersimpan
                    storageManager.remove('pos_dash_layout');

                    // 2. Restore urutan widget di DOM tanpa reload
                    var grid = document.getElementById('dashboard-sortable-grid');
                    if (grid) {
                        // Urutan default sesuai urutan HTML asli
                        var defaultOrder = [
                            // BARIS 1: Operasional Harian
                            'w-sales', 'w-trx', 'w-profit', 'w-margin-today',
                            // BARIS 2: Kas & Setara Kas (111, 115, 116, 117)
                            'w-kas', 'w-bank', 'w-transit', 'w-deposit',
                            // BARIS 3: Kewajiban, Aset, Pengeluaran
                            'w-piutang', 'w-hutang', 'w-persediaan', 'w-expense',
                            // BARIS 4+: Chart, list, & analisis
                            'w-chart', 'w-peak', 'w-today-tx', 'w-top-cust',
                            'w-terlaris', 'w-low-stock', 'w-pay-method', 'w-margin'
                        ];

                        // Pindahkan tiap widget ke urutan yang benar
                        defaultOrder.forEach(function(id) {
                            var widget = document.querySelector('[data-wid="' + id + '"]');
                            if (widget) grid.appendChild(widget);
                        });
                    }

                    // 3. (Opsional) Beri efek visual sukses
                    showToast('Layout dashboard berhasil direset!', 'success');
                }
            });
        }
		
        // --- LOGS ---
        function renderLogs() {
            var tbody = document.getElementById('log-tbody'); if(!tbody) return;
            var html = '';
            if(!state.logs || state.logs.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400 font-bold">Belum ada aktivitas.</td></tr>'; return; }
            
            var sortedLogs = state.logs.slice().sort(function(a,b) { return b.waktu - a.waktu; });
            
            for(var i=0; i<sortedLogs.length; i++) {
                var log = sortedLogs[i];
                var dt = new Date(log.waktu).toLocaleString('id-ID', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', second:'2-digit'});
                var actColor = 'bg-slate-100 text-slate-600 border border-slate-200';
                if(log.aksi.includes('LOGIN') || log.aksi.includes('LOGOUT')) actColor = 'bg-slate-50 text-slate-600 border border-slate-200';
                else if(log.aksi.includes('TRANSAKSI') || log.aksi.includes('PELUNASAN')) actColor = 'bg-emerald-50 text-emerald-600 border border-emerald-200';
                else if(log.aksi.includes('RETUR') || log.aksi.includes('BATAL RESTOCK')) actColor = 'bg-red-50 text-red-600 border border-red-200';
                else if(log.aksi.includes('BARANG') || log.aksi.includes('PRODUK')) actColor = 'bg-blue-50 text-blue-600 border border-blue-200';
                else if(log.aksi.includes('RESTOCK') || log.aksi.includes('OPNAME')) actColor = 'bg-purple-50 text-purple-600 border border-purple-200';
                else if(log.aksi.includes('SHIFT BUKA') || log.aksi.includes('SHIFT TUTUP')) actColor = 'bg-indigo-50 text-indigo-600 border border-indigo-200';
                else if(log.aksi.includes('PENGELUARAN')) actColor = 'bg-orange-50 text-orange-600 border border-orange-200';
                
                html += '<tr class="hover:bg-slate-50 transition-colors"><td class="p-4 whitespace-nowrap text-slate-500 text-[11px]">' + dt + '</td><td class="p-4 font-bold text-slate-700 text-xs whitespace-nowrap">' + escapeHtml(log.user) + '</td><td class="p-4 whitespace-nowrap"><span class="px-2 py-1 rounded text-[10px] font-bold ' + actColor + '">' + escapeHtml(log.aksi) + '</span></td><td class="p-4 text-slate-600 text-xs">' + escapeHtml(log.keterangan) + '</span></td></tr>';
            }
            tbody.innerHTML = html;
        }

        function updateHargaSatuanPreview() {
            var qtyEl   = document.getElementById('mr-qty');
            var totEl   = document.getElementById('mr-total-harga');
            var labelEl = document.getElementById('mr-harga-satuan-label');
            var hintEl  = document.getElementById('mr-rounding-hint');
            if (!qtyEl || !totEl || !labelEl) return;

            var qty   = parseInt(qtyEl.value, 10) || 0;
            var total = getAngkaBersih('mr-total-harga');

            if (qty > 0 && total > 0) {
                var unit     = Math.round(total / qty);
                var isExact  = (unit * qty === total);

                labelEl.innerText = '→ ' + formatRp(unit) + ' / unit';
                labelEl.className = 'text-purple-600 ml-1 normal-case font-black text-[9px]';

                // Tampilkan hint HANYA jika ada sisa pembulatan
                if (hintEl) {
                    if (isExact) {
                        hintEl.classList.add('hidden');
                    } else {
                        var selisih = total - (unit * qty);
                        var sign    = selisih > 0 ? '+' : '';
                        hintEl.innerHTML =
                            '<i class="fas fa-info-circle mr-0.5"></i>' +
                            'Dibulatkan ' + sign + selisih + ' rupiah dari nota (drift wajar)';
                        hintEl.classList.remove('hidden');
                    }
                }
            } else {
                labelEl.innerText = '→ Rp 0 / unit';
                labelEl.className = 'text-purple-300 ml-1 normal-case font-bold text-[9px]';
                if (hintEl) hintEl.classList.add('hidden');
            }
        }

        // --- SETUP & MINOR FUNCTIONS ---
        function addRestockItem() {
            var id = document.getElementById('mr-id').value;
            var p = state.products.find(x => String(x.id) === String(id));
            if (!p) return showToast('Pilih barang!', 'error');

            var q = parseInt(document.getElementById('mr-qty').value, 10);
            var totalHarga = getAngkaBersih('mr-total-harga');

            if (!q || q <= 0) return showToast('Qty tidak valid', 'error');
            if (!totalHarga || totalHarga <= 0) return showToast('Total harga tidak valid', 'error');

            // ▶ HITUNG HARGA SATUAN OTOMATIS
            var h = Math.round(totalHarga / q);

            // Validasi: cegah rugi (harga modal satuan >= harga jual)
            if (h >= p.hargaJual) {
                Swal.fire({
                    icon: 'error',
                    title: 'Awas Rugi!',
                    html:
                        'Harga Modal per Unit: <b>' + formatRp(h) + '</b><br>' +
                        'Harga Jual Etalase: <b>' + formatRp(p.hargaJual) + '</b><br><br>' +
                        '<span class="text-xs text-slate-500">Perhitungan: Total ' + formatRp(totalHarga) +
                        ' ÷ ' + q + ' unit = ' + formatRp(h) + '/unit.</span><br><br>' +
                        'Sistem menolak input ini. Silakan ubah <b>Harga Jual</b> di menu Inventori terlebih dahulu!'
                });
                return;
            }

            var existing = state.restockCart.find(x => String(x.idProduk) === String(id));
            if (existing) {
                // Gabung: hitung ulang total & harga satuan rata-rata
                var newQty = existing.qty + q;
                var newTotal = existing.totalBiaya + totalHarga;
                existing.qty = newQty;
                existing.hargaBeli = Math.round(newTotal / newQty);
                existing.totalBiaya = newQty * existing.hargaBeli;
            } else {
                state.restockCart.unshift({
                    idProduk: p.id,
                    namaProduk: p.nama,
                    qty: q,
                    hargaBeli: h,
                    totalBiaya: q * h
                });
            }

            // Reset form agar siap input barang berikutnya
            document.getElementById('mr-id').value = '';
            document.getElementById('mr-qty').value = '';
            document.getElementById('mr-total-harga').value = '';
            document.getElementById('mr-search-input').value = '';
            updateHargaSatuanPreview();

            renderRestockCart();
            playBeep();
            document.getElementById('mr-search-input').focus();
        }

        function removeRestockItem(id) { state.restockCart = state.restockCart.filter(x => String(x.idProduk) !== String(id)); renderRestockCart(); }
        
        function renderRestockCart() {
            var c = document.getElementById('mr-cart-list');
            var html = '';
            var t = 0;
            if (state.restockCart.length === 0) {
                c.innerHTML = '<div class="text-center p-4 text-slate-400 font-bold text-xs">Belum ada item ditambahkan</div>';
                document.getElementById('mr-total-all').innerText = 'Rp 0';
                return;
            }
            for (var i = 0; i < state.restockCart.length; i++) {
                var it = state.restockCart[i];
                t += it.totalBiaya;
                html += '<div class="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-lg shadow-sm">' +
                            '<div class="flex-1 min-w-0 pr-2">' +
                                '<h4 class="font-extrabold text-xs text-slate-700 truncate">' + escapeHtml(it.namaProduk) + '</h4>' +
                                '<p class="text-[10px] text-slate-500 font-bold mt-0.5">' + it.qty + ' x ' + formatRp(it.hargaBeli) + '</p>' +
                            '</div>' +
                            '<div class="flex items-center gap-3">' +
                                '<span class="font-black text-purple-600 text-xs">' + formatRp(it.totalBiaya) + '</span>' +
                                '<button onclick="removeRestockItem(\'' + safeJsArg(it.idProduk) + '\')" class="w-7 h-7 bg-red-50 text-red-500 rounded flex items-center justify-center hover:bg-red-100 transition-colors"><i class="fas fa-trash text-xs"></i></button>' +
                            '</div>' +
                        '</div>';
            }
            c.innerHTML = html;
            document.getElementById('mr-total-all').innerText = formatRp(t);
        }
        
        function saveBulkRestockForm() { 
            if(state.restockCart.length === 0) return showToast('List restock kosong!', 'error');
            var sup = document.getElementById('mr-sup').value.trim(); if(!sup) return showToast('Isi Supplier/Nota!', 'error');
            var metodeBeli = document.getElementById('mr-metode').value; 

            var totalBiayaRestock = 0;
            for(var r=0; r<state.restockCart.length; r++) totalBiayaRestock += state.restockCart[r].totalBiaya;

            // [FIX #2] Validasi saldo Tunai (Kas 111) / Transfer (Bank 115)
            // Menggunakan saldoRingkas dari server agar tersedia juga untuk Kasir
            if (metodeBeli === 'Tunai' || metodeBeli === 'Transfer') {
                var kodeAkun = (metodeBeli === 'Tunai') ? '111' : '115';
                var namaSumber = (metodeBeli === 'Tunai') ? 'Kas Fisik' : 'Bank / Settlement QRIS';
                
                var isAdmin = !!(state.user && state.user.role === 'Admin');
                var saldoSumber;
                // ✅ GANTI dengan:
				var saldoSumber =
				    (state._saldoByAccount && Number(state._saldoByAccount[kodeAkun])) ||
				    (kodeAkun === '111' ? (Number(state.saldoRingkas.kas111) || 0)
				                        : (Number(state.saldoRingkas.bank115) || 0));
                
                if (totalBiayaRestock > saldoSumber) {
                    Swal.fire({
                        icon: 'error',
                        title: namaSumber + ' Tidak Mencukupi!',
                        html: 'Total belanja adalah <b>' + formatRp(totalBiayaRestock) + '</b>,<br>' +
                              'saldo ' + namaSumber + ' Anda hanya <b>' + formatRp(saldoSumber) + '</b>.<br><br>' +
                              '<span class="text-xs text-slate-500">' +
                              (metodeBeli === 'Transfer'
                                ? 'Lakukan Settlement GoPay ke Bank terlebih dahulu, atau tambah saldo Bank.'
                                : 'Setor modal atau kurangi nominal belanja.') +
                              '</span>',
                        confirmButtonColor: '#3b82f6'
                    });
                    return; 
                }
            }

            var btn = document.getElementById('btn-save-restock'); 
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Memproses...'; 
            btn.disabled = true;

            var dpVal = 0;
            if (metodeBeli === 'Hutang') {
                dpVal = getAngkaBersih('mr-dp');
            }
            
            google.script.run.withSuccessHandler(function(r) { 
                btn.innerText = 'Simpan Restock'; 
                btn.disabled = false; 
                if (!handleApiResponse(r, "Gagal simpan restock: ")) return;

                for(var i=0; i<r.newPurchases.length; i++) { state.purchases.unshift(r.newPurchases[i]); }

                var metodeHPP = state.setup['Metode HPP'] || 'AVERAGE';
                for(var j=0; j<state.restockCart.length; j++) { 
                  var it = state.restockCart[j]; 
                  var pObj = state.products.find(x => String(x.id) === String(it.idProduk)); 
                  if(pObj) { 
                      if (metodeHPP === 'AVERAGE') {
                          var totalNilaiLama = pObj.stok * pObj.hargaBeli;
                          var totalNilaiBaru = it.qty * it.hargaBeli;
                          var stokBaru = pObj.stok + it.qty;
                          pObj.hargaBeli = stokBaru > 0 ? Math.round((totalNilaiLama + totalNilaiBaru) / stokBaru) : it.hargaBeli;
                      } else {
                          pObj.hargaBeli = it.hargaBeli;
                      }
                      pObj.stok += it.qty; 
                  } 
                }
                closeModal('modal-restock'); 
                renderInventory(); 
                renderPosProducts(); 
                renderReports(); 
                renderArusKas(); 
                renderNeraca(); 
                renderJurnal(); 
                manualSync(true); 
                showToast('Restock Masal Berhasil!');
            }).saveBulkPembelian(storageManager.get('pos_token_final'), state.restockCart, sup, metodeBeli, dpVal);
        }  
		
        // --- FITUR SHIFT (KASIR) ---
        function submitOpenShift() {
            var elInput = document.getElementById('shift-modal-awal');
            var rawVal = String(elInput.value || '').trim();
            if (rawVal === '') return showToast('Masukkan modal awal', 'error');
            
            // [FIX] Peringatan jika modal 0 dengan sumber EXISTING
            var sourceEl = document.getElementById('shift-modal-source');
            var source = sourceEl ? sourceEl.value : 'EXISTING';
            var modal = getAngkaBersih('shift-modal-awal');
            
            if (source === 'EXISTING' && modal === 0) {
                return Swal.fire({
                    icon: 'warning',
                    title: 'Modal Awal = 0',
                    html: 'Anda memilih "Ambil dari Kas yang Sudah Ada" tapi modal = Rp 0.<br><br>' +
                          '<b>Pastikan laci kasir memang kosong.</b><br>' +
                          'Jika ada uang di laci, isi nominalnya agar rekonsiliasi selisih akurat.',
                    showCancelButton: true,
                    confirmButtonText: 'Ya, Lanjutkan',
                    cancelButtonText: 'Batal, Isi Modal',
                    confirmButtonColor: '#f59e0b'
                }).then(function(r) {
                    if (r.isConfirmed) _doOpenShift(modal, source, elInput);
                });
            } else {
                _doOpenShift(modal, source, elInput);
            }
        }

        function openCloseShiftModal() {
            if(!state.currentShift) return;
            var modalAwal = state.currentShift.modalAwal;
            var tunaiShift = 0;
            var pengeluaranShift = 0;
            var returTunai = 0;
            var tarikTunaiKeluar = 0;

            // [FIX #1] PRE-BUILD pelunasan map dari SEMUA jurnal -PLN, supaya
            // kasbon LUNAS bisa dihitung DP-nya = (total − semua_pelunasan).
            // Ini menyamakan logika frontend dengan backend closeShift().
            var _allPelunasanMapPre = {};
            for (var _jPre = 0; _jPre < state.jurnal.length; _jPre++) {
              var _jrPre = state.jurnal[_jPre];
              var _refPre = String(_jrPre.refId || '').trim();
              if (_refPre.indexOf('-PLN') === -1) continue;
              if (String(_jrPre.kodeAkun).trim() !== '111') continue;
              if ((_jrPre.debit || 0) <= 0) continue;
              var _txIdPre = _refPre.replace(/-PLN$/, '');
              _allPelunasanMapPre[_txIdPre] = (_allPelunasanMapPre[_txIdPre] || 0) + (_jrPre.debit || 0);
            }

            // 1. Hitung pemasukan tunai (Tunai + DP Kasbon + Retur)
            for (var i = 0; i < state.transactions.length; i++) {
              var t = state.transactions[i];
              if (t.kasir !== state.user.nama) continue;
              if (t.tanggal < state.currentShift.waktuBuka) continue;

              var metodeN = String(t.metode || '').trim();
              var statusN = String(t.status || '').trim().toUpperCase();

              if (metodeN === 'Tunai' && statusN === 'SUKSES') {
                tunaiShift += t.total;
              } else if (metodeN === 'Kasbon' && statusN === 'HUTANG' && t.bayar > 0) {
                tunaiShift += Number(t.bayar) || 0;
              } else if (metodeN === 'Kasbon' && statusN === 'SUKSES') {
                // [FIX #1] DP ASLI = total − semua_pelunasan.
                // Pelunasan shift ini ditambahkan terpisah di loop pelunasan bawah
                // (mencegah double-count untuk kasbon yang lunas di shift yang sama).
                var _pelAll = _allPelunasanMapPre[t.id] || 0;
                var _originalDp = Number(t.total) - _pelAll;
                if (_originalDp > 0) tunaiShift += _originalDp;
              } else if (statusN === 'RETUR' && metodeN === 'Tunai') {
                tunaiShift -= t.total;
                returTunai += t.total;
              }
            }

            // ═══════════════════════════════════════════════════════════════
            // [FIX B2c] Pelunasan kasbon LINTAS SHIFT via scan jurnal lokal
            // Menangkap pelunasan yang terjadi periode ini untuk kasbon lama.
            // ═══════════════════════════════════════════════════════════════
            for (var jpl = 0; jpl < state.jurnal.length; jpl++) {
                var jPel = state.jurnal[jpl];
                var refPel = String(jPel.refId || '').trim();
                if (refPel.indexOf('-PLN') === -1) continue;
                if (jPel.tanggal < state.currentShift.waktuBuka) continue;
                if (String(jPel.kodeAkun).trim() !== '111') continue;
                if ((jPel.debit || 0) <= 0) continue;

                // Verifikasi pelunasan milik kasir ini via log
                var refPelBase = refPel.replace(/-PLN$/, '');
                var isOwnPel = false;
                for (var lg = 0; lg < state.logs.length; lg++) {
                    var lgRow = state.logs[lg];
                    if (String(lgRow.aksi || '') !== 'PELUNASAN') continue;
                    if (String(lgRow.keterangan || '').indexOf(refPelBase) === -1) continue;
                    if (String(lgRow.user || '') !== state.user.nama) continue;
                    if (lgRow.waktu < state.currentShift.waktuBuka) continue;
                    isOwnPel = true;
                    break;
                }
                if (isOwnPel) tunaiShift += Number(jPel.debit) || 0;
            }

            // [FIX B2d] Pelunasan hutang supplier LINTAS SHIFT (kas keluar)
            for (var jls = 0; jls < state.jurnal.length; jls++) {
                var jLns = state.jurnal[jls];
                var refLns = String(jLns.refId || '').trim();
                if (refLns.indexOf('-LNS') === -1) continue;
                if (jLns.tanggal < state.currentShift.waktuBuka) continue;
                if (String(jLns.kodeAkun).trim() !== '111') continue;
                if ((jLns.kredit || 0) <= 0) continue;

                var refLnsBase = refLns.replace(/-LNS$/, '');
                var isOwnLns = false;
                for (var lg2 = 0; lg2 < state.logs.length; lg2++) {
                    var lgRow2 = state.logs[lg2];
                    if (String(lgRow2.aksi || '') !== 'PELUNASAN HUTANG') continue;
                    if (String(lgRow2.keterangan || '').indexOf(refLnsBase) === -1) continue;
                    if (String(lgRow2.user || '') !== state.user.nama) continue;
                    if (lgRow2.waktu < state.currentShift.waktuBuka) continue;
                    isOwnLns = true;
                    break;
                }
                if (isOwnLns) pengeluaranShift += Number(jLns.kredit) || 0;
            }

            // 2. Hitung pengeluaran operasional (Beban) - EXCLUDE non-kas
            var nonKasKategori = [
                'Setoran Modal', 'Penerimaan Pinjaman', 'Pendapatan Lainnya',
                'Penyusutan Aset', 'Penarikan Bank ke Kas'
            ];
            for(var b=0; b<state.beban.length; b++) {
                var beban = state.beban[b];
                if(beban.kasir !== state.user.nama) continue;
                if(beban.tanggal < state.currentShift.waktuBuka) continue;
                if(nonKasKategori.indexOf(beban.kategori) === -1) {
                    pengeluaranShift += beban.nominal;
                }
            }

            // 3. Hitung pengeluaran restock tunai - HANYA milik kasir ini
            for(var p=0; p<state.purchases.length; p++) {
                var pur = state.purchases[p];
                if(pur.metode !== 'Tunai') continue;
                if(pur.kasir !== state.user.nama) continue;      // ← tambahan
                if(pur.tanggal < state.currentShift.waktuBuka) continue;
                pengeluaranShift += pur.totalBiaya;
            }

            // [FIX BUG #1] Baca setting Sumber Dana Operasional
            var sumberDana = state.setup['Sumber Dana Operasional'] || 'BRANGKAS';

            // [FIX BUG #2] Hitung Layanan Digital Tunai yang masuk ke laci
            var layananDigiMasukLaci = 0;
            var layananTarikKeluarLaci = 0;
            for (var ly = 0; ly < state.layananDigital.length; ly++) {
                var lay = state.layananDigital[ly];
                if (lay.kasir !== state.user.nama) continue;
                if (lay.tanggal < state.currentShift.waktuBuka) continue;
                
                if (lay.jenis === 'PRODUK_DIGITAL' && lay.metode === 'Tunai') {
                    layananDigiMasukLaci += Number(lay.nominal) || 0;
                  } else if (lay.jenis === 'TARIK_TUNAI') {
                    // lay.nominal sekarang = total transfer (uangFisik + fee)
                    var uangFisikLay = (Number(lay.nominal) || 0) - (Number(lay.fee) || 0);
                    var totalTrfLay  = Number(lay.nominal) || 0;
                    var metodeTarik = String(lay.metode || '').toUpperCase();

                    // Kas fisik keluar laci = uang tunai yg diserahkan ke pelanggan
                    layananTarikKeluarLaci += uangFisikLay;
                    tarikTunaiKeluar += uangFisikLay;

                    // Kas fisik MASUK laci
                    if (metodeTarik === 'TUNAI') {
                        layananDigiMasukLaci += totalTrfLay;  // pelanggan kasih tunai total transfer
                    } else if (metodeTarik === 'SPLIT') {
                        layananDigiMasukLaci += Number(lay.fee) || 0;  // hanya fee tunai
                    }
                    // QRIS: tidak masuk laci
                } else if (lay.jenis === 'TOPUP_EWALLET') {              // ← TAMBAHKAN
                    if (lay.metode === 'TUNAI') {
                        layananDigiMasukLaci += (Number(lay.nominal) || 0) + (Number(lay.fee) || 0);
                    } else if (lay.metode === 'SPLIT') {
                        layananDigiMasukLaci += Number(lay.fee) || 0;
                    }
                }
            }

            // Setelah set expected, update breakdown
            document.getElementById('shift-info-modal').innerText = formatRp(modalAwal);
            document.getElementById('shift-info-tunai').innerText = formatRp(tunaiShift);
            document.getElementById('shift-info-digital').innerText = formatRp(layananDigiMasukLaci);

            // Breakdown pengurang
            var hasDeduction = false;
            if (returTunai > 0) {
                document.getElementById('shift-info-retur').innerText = '- ' + formatRp(returTunai);
                document.getElementById('shift-row-retur').classList.remove('hidden');
                hasDeduction = true;
            } else {
                document.getElementById('shift-row-retur').classList.add('hidden');
            }
            if (tarikTunaiKeluar > 0) {
                document.getElementById('shift-info-tarik').innerText = '- ' + formatRp(tarikTunaiKeluar);
                document.getElementById('shift-row-tarik').classList.remove('hidden');
                hasDeduction = true;
            } else {
                document.getElementById('shift-row-tarik').classList.add('hidden');
            }
            if (sumberDana === 'LACI' && pengeluaranShift > 0) {
                document.getElementById('shift-info-beban').innerText = '- ' + formatRp(pengeluaranShift);
                document.getElementById('shift-row-beban').classList.remove('hidden');
                hasDeduction = true;
            } else {
                document.getElementById('shift-row-beban').classList.add('hidden');
            }
            document.getElementById('shift-info-deductions').classList.toggle('hidden', !hasDeduction); 

            // Total uang yang harusnya ada di laci fisik
            // Mode BRANGKAS: beban/restock/tarik tunai TIDAK memotong laci
            // Mode LACI: semuanya memotong laci
            var expected = modalAwal + tunaiShift + layananDigiMasukLaci;
            if (sumberDana === 'LACI') {
                expected = expected - pengeluaranShift;
            }
            expected = expected - layananTarikKeluarLaci;

            // Re-render baris deduction (nilai sudah di-update di atas)
            //document.getElementById('shift-info-retur').innerText  = '- ' + formatRp(returTunai);
            //document.getElementById('shift-info-tarik').innerText  = '- ' + formatRp(tarikTunaiKeluar);
            //document.getElementById('shift-info-beban').innerText  = '- ' + formatRp(pengeluaranShift);

            document.getElementById('shift-row-retur').classList.toggle('hidden', returTunai <= 0);
            document.getElementById('shift-row-tarik').classList.toggle('hidden', tarikTunaiKeluar <= 0);
            document.getElementById('shift-row-beban').classList.toggle('hidden',
                !(sumberDana === 'LACI' && pengeluaranShift > 0));

            // hasDeduction sudah di-set benar di blok IF/ELSE di atas
            document.getElementById('shift-info-deductions').classList.toggle('hidden', !hasDeduction);

            document.getElementById('shift-info-expected').innerText = formatRp(expected);
            
            var elFisik = document.getElementById('shift-kas-fisik');
            if(elFisik) {
                elFisik.value = Number(expected).toLocaleString('id-ID');
                elFisik.setAttribute('data-expected', expected);
            }
            
            calcShiftSelisih();
            openModal('modal-shift-close');
        }

        function calcShiftSelisih() {
            var expected = parseInt(document.getElementById('shift-kas-fisik').getAttribute('data-expected')) || 0;
            // [FIX] Gunakan getAngkaBersih agar "10.000" dibaca 10000, bukan 10
            var fisik = getAngkaBersih('shift-kas-fisik');
            var selisih = fisik - expected;
            var el = document.getElementById('shift-selisih-text');
            if(selisih === 0) { el.innerHTML = '<span class="text-emerald-500 bg-emerald-50 px-2 py-1 rounded-full"><i class="fas fa-check-circle mr-1"></i> Uang Pas (Sesuai)</span>'; }
            else if(selisih > 0) { el.innerHTML = '<span class="text-blue-500 bg-blue-50 px-2 py-1 rounded-full"><i class="fas fa-arrow-up mr-1"></i> Lebih ' + formatRp(selisih) + '</span>'; }
            else { el.innerHTML = '<span class="text-red-500 bg-red-50 px-2 py-1 rounded-full"><i class="fas fa-arrow-down mr-1"></i> Kurang ' + formatRp(Math.abs(selisih)) + '</span>'; }
        }

        function submitCloseShift() {
            var fisik = getAngkaBersih('shift-kas-fisik');
            var expected = parseInt(document.getElementById('shift-kas-fisik').getAttribute('data-expected')) || 0;
            var selisih = fisik - expected;
            
            // [FIX] Guard selisih besar (> 10x modal awal)
            var modalAwal = state.currentShift ? state.currentShift.modalAwal : 0;
            if (Math.abs(selisih) > Math.max(100000, modalAwal * 10)) {
                return Swal.fire({
                    icon: 'warning',
                    title: 'Selisih Sangat Besar',
                    html: 'Selisih <b>Rp ' + formatRp(Math.abs(selisih)) + '</b> sangat besar (modal awal hanya Rp ' + formatRp(modalAwal) + ').<br><br>' +
                          'Kemungkinan Anda lupa:<br>' +
                          '• Mengisi modal awal saat buka shift<br>' +
                          '• Mencatat pengeluaran restock/beban<br>' +
                          '• Uang fisik berada di brangkas, bukan laci<br><br>' +
                          '<b>Yakin lanjut? Jurnal selisih akan dibuat permanen.</b>',
                    showCancelButton: true,
                    confirmButtonText: 'Ya, Lanjut (bikin jurnal)',
                    cancelButtonText: 'Batal, Cek Ulang',
                    confirmButtonColor: '#ef4444'
                }).then(function(r) {
                    if (r.isConfirmed) _doCloseShift(fisik);
                });
            } else {
                _doCloseShift(fisik);
            }
        }

        // [FIX] Helper Buka Shift — dipanggil dari submitOpenShift()
        function _doOpenShift(modal, source, elInput) {
            var btn = document.getElementById('btn-open-shift');
            if (btn) {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Memproses...';
                btn.disabled = true;
            }

            google.script.run.withSuccessHandler(function (r) {
                if (btn) {
                    btn.innerText = 'Mulai Transaksi';
                    btn.disabled = false;
                }
                if (!handleApiResponse(r, "Gagal buka shift: ")) return;

                state.currentShift = r.shift;
                closeModal('modal-shift-open');
                if (elInput) elInput.value = '';
                syncShiftButtonVisibility();
                updateSidebarShiftInfo();
                manualSync(true);
                showToast('Shift dibuka. Selamat bekerja!', 'success');
            }).withFailureHandler(function (err) {
                if (btn) {
                    btn.innerText = 'Mulai Transaksi';
                    btn.disabled = false;
                }
                Swal.fire(
                    'Koneksi Gagal',
                    'Tidak bisa terhubung ke server: ' + (err && err.message ? err.message : 'unknown'),
                    'error'
                );
            }).openShift(storageManager.get('pos_token_final'), modal, source);
        }

        // [FIX] Helper Tutup Shift — Otomatis Logout setelah sukses
        function _doCloseShift(fisik) {
            var btn = document.getElementById('btn-close-shift');
            if (btn) {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Memproses...';
                btn.disabled = true;
            }

            google.script.run.withSuccessHandler(function (r) {
                if (btn) {
                    btn.innerHTML = 'Akhiri Shift';
                    btn.disabled = false;
                }
                if (!handleApiResponse(r, "Gagal tutup shift: ")) return;

                // 1. Reset state shift
                state.currentShift = null;
                closeModal('modal-shift-close');
                syncShiftButtonVisibility();
                updateSidebarShiftInfo();

                // 2. Tampilkan notifikasi sukses beserta info selisih
                Swal.fire({
                    icon: 'success',
                    title: 'Shift Ditutup',
                    html:
                        '<div class="text-left text-xs">' +
                            '<div class="flex justify-between mb-1"><span class="text-slate-500">Uang fisik:</span>' +
                                '<b>' + formatRp(fisik) + '</b></div>' +
                            (r.selisih !== undefined
                                ? '<div class="flex justify-between"><span class="text-slate-500">Selisih:</span>' +
                                  '<b class="' + (r.selisih < 0 ? 'text-red-500' : (r.selisih > 0 ? 'text-blue-500' : 'text-emerald-500')) + '">' +
                                  formatRp(r.selisih) + '</b></div>'
                                : '') +
                        '</div>' +
                        '<p class="text-xs text-slate-400 mt-3">Sesi kasir telah berakhir. Anda akan diarahkan ke halaman login.</p>',
                    confirmButtonText: 'OK, Logout',
                    confirmButtonColor: '#0f172a',
                    allowOutsideClick: false
                }).then(function() {
                    // 3. Eksekusi Logout setelah user klik OK
                    forceLogout(); 
                });

            }).withFailureHandler(function (err) {
                if (btn) {
                    btn.innerHTML = 'Akhiri Shift';
                    btn.disabled = false;
                }
                Swal.fire(
                    'Koneksi Gagal',
                    'Tidak bisa terhubung ke server: ' + (err && err.message ? err.message : 'unknown'),
                    'error'
                );
            }).closeShift(storageManager.get('pos_token_final'), fisik);
        }
        
		    // --- LOGIKA CETAK SEMUA INVENTORI ---
        function printAllInventory() {
            var tempItemsPerPage = invItemsPerPage;
            var tempPage = invCurrentPage;

            // Buka limit tabel agar semua data muncul
            invItemsPerPage = 999999;
            invCurrentPage = 1;
            renderInventory(); 

            // Beri jeda 0.5 detik agar DOM Browser selesai menggambar seluruh data sebelum diprint
            setTimeout(function() {
                printArea('print-area-inv');
                
                // Kembalikan paginasi seperti semula
                invItemsPerPage = tempItemsPerPage;
                invCurrentPage = tempPage;
                renderInventory();
            }, 500);
        }

        // --- LOGIKA PENCARIAN BARANG (RESTOCK & OPNAME) ---
        // 1. Fungsi Bantuan Menutup Dropdown jika klik di luar kotak
        document.addEventListener('click', function(e) {
            var mrRes = document.getElementById('mr-search-results');
            var moRes = document.getElementById('mo-search-results');
            if(mrRes && !e.target.closest('#mr-search-input') && !e.target.closest('#mr-search-results')) mrRes.classList.add('hidden');
            if(moRes && !e.target.closest('#mo-search-input') && !e.target.closest('#mo-search-results')) moRes.classList.add('hidden');
        });

        // 2. Modifikasi Modal Restock
        function prepareRestockModal() { 
            state.restockCart = []; 
            document.getElementById('mr-search-input').value = '';
            document.getElementById('mr-id').value = '';
            document.getElementById('mr-qty').value=''; 
            document.getElementById('mr-total-harga').value='';
            updateHargaSatuanPreview(); 
            document.getElementById('mr-sup').value=''; 
            // [FIX] Reset dropdown metode ke default — cegah sisa pilihan dari sesi sebelumnya
            var metodeEl = document.getElementById('mr-metode');
            if (metodeEl) metodeEl.value = 'Tunai';
            renderRestockCart(); 
            openModal('modal-restock'); 
            setTimeout(() => document.getElementById('mr-search-input').focus(), 300);
            var dpEl = document.getElementById('mr-dp');
            if (dpEl) dpEl.value = '';
            var dpSection = document.getElementById('mr-dp-section');
            if (dpSection) dpSection.classList.add('hidden');
        }

        function toggleMrDpSection() {
            var metode = document.getElementById('mr-metode').value;
            var section = document.getElementById('mr-dp-section');
            if (!section) return;
            if (metode === 'Hutang') {
                section.classList.remove('hidden');
            } else {
                section.classList.add('hidden');
                var dpEl = document.getElementById('mr-dp');
                if (dpEl) dpEl.value = '';
            }
        }
        
        function searchRestockItem(query) {
            var resBox = document.getElementById('mr-search-results');
            document.getElementById('mr-id').value = ''; // Reset ID setiap kali ngetik
            document.getElementById('mr-total-harga').value = '';
            updateHargaSatuanPreview();
            
            if(!query) { resBox.classList.add('hidden'); return; }
            
            var q = query.toLowerCase().trim();
            var matches = state.products.filter(function(p) {
                return String(p.id).toLowerCase() === q || String(p.id).toLowerCase().includes(q) || String(p.nama).toLowerCase().includes(q);
            });
            
            // LOGIKA SCAN BARCODE: Jika scanner fisik langsung mengirim 1 ID yang cocok persis 100%
            // Hapus syarat matches.length === 1. Jika ID cocok 100% (barcode persis), langsung pilih!
            var exactMatch = matches.find(p => String(p.id).toLowerCase() === q);
            if (exactMatch && matches.length === 1) {
                selectRestockItem(exactMatch.id, exactMatch.nama, exactMatch.hargaBeli);   // ← BENAR
                return;
            }

            if(matches.length === 0) {
                resBox.innerHTML = '<div class="p-3 text-xs text-slate-400 font-bold text-center">Barang tidak ditemukan</div>';
                resBox.classList.remove('hidden');
                return;
            }
            
            var html = '';
            for(var i=0; i<Math.min(matches.length, 15); i++) {
                var p = matches[i];
                // [FIX] Escape nama & id secara aman untuk atribut onclick
                // Pakai backslash escape (bukan HTML entity), karena HTML parser akan decode entity di atribut
                var safeId   = String(p.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                var safeNama = String(p.nama).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

                html += `<div class="p-2.5 border-b border-slate-100 hover:bg-purple-50 cursor-pointer transition-colors" onclick="selectRestockItem('${safeId}', '${safeNama}', ${p.hargaBeli})">
                            <p class="font-extrabold text-slate-800 text-xs truncate">${escapeHtml(p.nama)}</p>
                            <div class="flex justify-between mt-0.5">
                                <span class="text-[10px] text-slate-400 font-mono">${escapeHtml(p.id)}</span>
                                <span class="text-[10px] text-purple-600 font-bold">Stok: ${p.stok}</span>
                            </div>
                        </div>`;
            }
            resBox.innerHTML = html;
            resBox.classList.remove('hidden');
        }

        function selectRestockItem(id, nama, hargaBeli) {
            document.getElementById('mr-id').value = id;
            document.getElementById('mr-search-input').value = nama;

            // JANGAN auto-fill harga lagi — karena maknanya sekarang "total dari nota",
            // bukan "harga satuan". Biarkan kasir input manual dari nota supplier.
            document.getElementById('mr-total-harga').value = '';
            updateHargaSatuanPreview();

            document.getElementById('mr-search-results').classList.add('hidden');
            document.getElementById('mr-qty').focus();
        }

        // 3. Modifikasi Modal Opname (Koreksi)
        function prepareOpnameModal() { 
            state.opnameCart = []; 
            
            // Pengaman agar tidak error jika HTML lama masih dipakai
            var searchInput = document.getElementById('mo-search-input');
            if (searchInput) searchInput.value = '';
            
            var idInput = document.getElementById('mo-id');
            if (idInput) {
                idInput.value = '';
                // Fallback otomatis jika masih memakai elemen <select> lama
                if (idInput.tagName === 'SELECT') {
                    var html = '<option value="">-- Pilih Barang --</option>'; 
                    for(var i=0; i<state.products.length; i++) {
                        html += '<option value="' + escapeHtml(state.products[i].id) + '">' + escapeHtml(state.products[i].nama) + ' (Sistem: ' + state.products[i].stok + ')</option>'; 
                    }
                    idInput.innerHTML = html;
                }
            }
            
            var sistemEl = document.getElementById('mo-sistem');
            if (sistemEl) sistemEl.value = '';
            
            var fisikEl = document.getElementById('mo-fisik');
            if (fisikEl) fisikEl.value = ''; 
            
            var ketEl = document.getElementById('mo-ket');
            if (ketEl) ketEl.value = ''; 
            
            renderOpnameCart(); 
            openModal('modal-opname'); 
            
            if (searchInput) {
                setTimeout(() => searchInput.focus(), 300);
            }
        }

        function searchOpnameItem(query) {
            var resBox = document.getElementById('mo-search-results');
            document.getElementById('mo-id').value = ''; 
            document.getElementById('mo-sistem').value = '';
            
            if(!query) { resBox.classList.add('hidden'); return; }
            
            var q = query.toLowerCase().trim();
            var matches = state.products.filter(function(p) {
                return String(p.id).toLowerCase() === q || String(p.id).toLowerCase().includes(q) || String(p.nama).toLowerCase().includes(q);
            });
            
            // LOGIKA SCAN BARCODE
            var exactMatch = matches.find(p => String(p.id).toLowerCase() === q);
            if (exactMatch && matches.length === 1) {
                selectOpnameItem(exactMatch.id, exactMatch.nama, exactMatch.stok);
                return;
            }

            if(matches.length === 0) {
                resBox.innerHTML = '<div class="p-3 text-xs text-slate-400 font-bold text-center">Barang tidak ditemukan</div>';
                resBox.classList.remove('hidden');
                return;
            }
            
            var html = '';
            for(var i=0; i<Math.min(matches.length, 15); i++) {
                var p = matches[i];
                var safeId   = String(p.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                var safeNama = String(p.nama).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

                html += `<div class="p-2.5 border-b border-slate-100 hover:bg-amber-50 cursor-pointer transition-colors" onclick="selectOpnameItem('${safeId}', '${safeNama}', ${p.stok})">
                            <p class="font-extrabold text-slate-800 text-xs truncate">${escapeHtml(p.nama)}</p>
                            <div class="flex justify-between mt-0.5">
                                <span class="text-[10px] text-slate-400 font-mono">${escapeHtml(p.id)}</span>
                                <span class="text-[10px] text-amber-600 font-bold">Stok Sistem: ${p.stok}</span>
                            </div>
                        </div>`;
            }
            resBox.innerHTML = html;
            resBox.classList.remove('hidden');
        }

        function selectOpnameItem(id, nama, stokSistem) {
            document.getElementById('mo-id').value = id;
            document.getElementById('mo-search-input').value = nama;
            document.getElementById('mo-sistem').value = stokSistem;
            document.getElementById('mo-search-results').classList.add('hidden');
            document.getElementById('mo-fisik').focus();
        }

        function addOpnameItem() {
            var id = document.getElementById('mo-id').value; 
            var p = state.products.find(x => String(x.id) === String(id)); 
            if(!p) return showToast('Pilih barang terlebih dahulu!', 'error');
            
            var fisik = parseInt(document.getElementById('mo-fisik').value);
            var ket = document.getElementById('mo-ket').value.trim();
            
            if(isNaN(fisik) || fisik < 0) {
                Swal.fire('Nilai Tidak Valid', 'Stok fisik tidak boleh minus (-). Jika barang habis, cukup tulis 0.', 'error');
                return;
            };
            if(fisik === p.stok) return showToast('Stok fisik sama dengan sistem', 'warning');
            if(!ket) return showToast('Isi keterangan!', 'error');

            var existing = state.opnameCart.find(x => String(x.idProduk) === String(id));
            if(existing) { 
                existing.stokFisik = fisik; 
                existing.keterangan = ket; 
            } else { 
                state.opnameCart.unshift({ idProduk: p.id, namaProduk: p.nama, stokSistem: p.stok, stokFisik: fisik, keterangan: ket }); 
            }
            
            // Reset input form
            document.getElementById('mo-id').value = ''; 
            document.getElementById('mo-sistem').value = ''; 
            document.getElementById('mo-fisik').value = ''; 
            document.getElementById('mo-ket').value = ''; 
            
            var searchInput = document.getElementById('mo-search-input');
            if(searchInput) searchInput.value = ''; // Kosongkan kotak pencarian

            renderOpnameCart(); 
        }

        function removeOpnameItem(id) { 
            state.opnameCart = state.opnameCart.filter(x => String(x.idProduk) !== String(id)); 
            renderOpnameCart(); 
        }

        function renderOpnameCart() {
            var c = document.getElementById('mo-cart-list'); 
            var html = ''; 
            if(state.opnameCart.length === 0) { 
                c.innerHTML = '<div class="text-center p-4 text-slate-400 font-bold text-xs">Belum ada item ditambahkan</div>'; 
                return; 
            }
            for(var i=0; i<state.opnameCart.length; i++) {
                var it = state.opnameCart[i];
                var selisih = it.stokFisik - it.stokSistem;
                var selisihBadge = selisih > 0 ? '<span class="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded text-[10px] font-black">+' + selisih + '</span>' : '<span class="text-red-600 bg-red-50 px-1.5 py-0.5 rounded text-[10px] font-black">' + selisih + '</span>';
                
                html += '<div class="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-lg shadow-sm"><div class="flex-1 min-w-0 pr-2"><h4 class="font-extrabold text-xs text-slate-700 truncate">' + escapeHtml(it.namaProduk) + '</h4><p class="text-[10px] text-slate-500 font-bold mt-0.5">Sistem: ' + it.stokSistem + ' <i class="fas fa-arrow-right mx-1"></i> Fisik: <span class="text-amber-600 font-black">' + it.stokFisik + '</span> ' + selisihBadge + '</p><p class="text-[9px] text-slate-400 mt-1"><i class="fas fa-comment-dots mr-1"></i> ' + escapeHtml(it.keterangan) + '</p></div><button onclick="removeOpnameItem(\'' + safeJsArg(it.idProduk) + '\')" class="w-7 h-7 bg-red-50 text-red-500 rounded flex items-center justify-center hover:bg-red-100 transition-colors shrink-0"><i class="fas fa-trash text-xs"></i></button></div>';
            }
            c.innerHTML = html;
        }
		
        // Loop Runner: Menyimpan banyak data menggunakan API lama Anda agar Backend tidak perlu dirubah
        function saveBulkOpnameForm() {
            if(state.opnameCart.length === 0) return showToast('Daftar opname kosong!', 'error');
            var b = document.getElementById('btn-save-opname'); 
            b.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Memproses...'; 
            b.disabled = true;

            var itemsToProcess = [...state.opnameCart];
            var currentIndex = 0;
            var token = storageManager.get('pos_token_final');
            
            Swal.fire({
                title: 'Menyimpan ke Database...',
                html: 'Jangan tutup halaman ini.<br>Memproses data <b>1</b> dari ' + itemsToProcess.length,
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });

            function processNext() {
                if (currentIndex >= itemsToProcess.length) {
                    // SELESAI: Panggil manualSync untuk memastikan data terbaru ditarik dari backend
                    google.script.run.withSuccessHandler(function() {
                        b.innerText = 'Terapkan Semua'; b.disabled = false;
                        closeModal('modal-opname');
                        Swal.fire('Berhasil!', 'Stok permanen diperbarui di Google Sheets.', 'success');
                        manualSync(true); // Sinkronisasi ulang untuk memastikan UI & State sama dengan Database
                    }).getInitialData(token);
                    return;
                }

                var item = itemsToProcess[currentIndex];
                var payload = { idProduk: item.idProduk, stokSistem: item.stokSistem, stokFisik: item.stokFisik, keterangan: item.keterangan };
                Swal.update({ html: 'Menyimpan <b>'+item.namaProduk+'</b><br>Data ke <b>' + (currentIndex + 1) + '</b> dari ' + itemsToProcess.length });

                google.script.run.withSuccessHandler(function(r) {
                    if(r.success) {
                        currentIndex++;
                        processNext();
                    } else {
                        b.disabled = false;
                        Swal.fire('Gagal', 'Terhenti di barang: ' + item.namaProduk + '. Error: ' + r.error, 'error');
                    }
                }).saveOpname(token, payload);
            }
            processNext();
        }
        
        function saveSetup(e) {
            e.preventDefault();

            // --- BACA CENTANG HARI AKTIF ---
            var arrHari = [];
            var cbHari = document.querySelectorAll('input[name="set-hari"]:checked');
            for(var h=0; h<cbHari.length; h++) arrHari.push(cbHari[h].value);

            var d = {
                'Nama Toko': document.getElementById('set-nama').value,
                'Alamat': document.getElementById('set-alamat').value,
                'Telepon': document.getElementById('set-telp').value,
                'Metode HPP': document.getElementById('set-hpp').value,
                'Fonnte Token': document.getElementById('set-fonnte').value,
                'Suara Kasir': document.getElementById('set-sound').checked,
                'Jam Buka Online': document.getElementById('set-jam-buka').value,
                'Jam Tutup Online': document.getElementById('set-jam-tutup').value,
                'Hari Buka Online': arrHari.join(','),
                'Minimal Order Online': getAngkaBersih('set-min-order'),
                'Fee Tarik Tunai': (function() {
                    var raw = document.getElementById('set-fee-tarik').value;
                    if (!raw || String(raw).trim() === '') return 2000;    // kosong → default
                    return getAngkaBersih('set-fee-tarik');                 // 0 → 0 (VALID)
                })(),
                'Batas Fee Flat Tarik Tunai': (function() {
                    var raw = document.getElementById('set-batas-fee-flat').value;
                    if (!raw || String(raw).trim() === '') return 499999;
                    return getAngkaBersih('set-batas-fee-flat');
                })(),
                'Persen Fee Tarik Tunai': (function() {
                    var raw = document.getElementById('set-persen-fee').value;
                    if (raw === '' || raw === null) return 1;               // kosong → default
                    var v = parseFloat(raw);
                    return isNaN(v) ? 1 : v;                                // 0 → 0 (VALID)
                })(),
                'Sumber Dana Operasional': document.getElementById('set-sumber-dana').value || 'BRANGKAS',
                'WA Admin Topup': (document.getElementById('set-wa-admin-topup').value || '').trim(),
                'Notif WA Topup Aktif': document.getElementById('set-notif-topup-aktif').checked ? 'TRUE' : 'FALSE'
            };

            Swal.fire({ title: 'Menyimpan Pengaturan...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });

            google.script.run.withSuccessHandler(function(r) {
                if(r.success) {
                    state.setup = d;
                    document.getElementById('ui-store-name').innerText = escapeHtml(d['Nama Toko']);
                    manualSync(true);
                    Swal.fire('Tersimpan', 'Pengaturan berhasil diperbarui', 'success');
                } else { Swal.fire('Error', r.error, 'error'); }
            }).withFailureHandler(function(err) { Swal.fire('Koneksi Gagal', 'Gagal terhubung ke server', 'error'); }).saveSetup(storageManager.get('pos_token_final'), d);
        }
        
        function openPurchDetail(id) { 
          var p = state.purchases.find(function(x) { return String(x.id) === String(id); }); 
          if(!p) return; 
            var html = '<div class="flex justify-between border-b border-slate-100 pb-2"><span class="text-slate-500 font-bold">ID</span><span class="font-bold text-slate-800 font-mono text-xs">' + escapeHtml(p.id) + '</span></div><div class="flex justify-between border-b border-slate-100 pb-2 pt-2"><span class="text-slate-500 font-bold">Tgl</span><span class="font-bold text-slate-800">' + new Date(p.tanggal).toLocaleString('id-ID') + '</span></div><div class="flex justify-between mt-3 text-sm text-slate-800 font-bold"><span>' + escapeHtml(p.namaProduk) + '</span><span>' + formatRp(p.hargaBeli) + ' x ' + p.qty + '</span></div><div class="flex justify-between font-black text-lg mt-4 border-t border-slate-200 pt-3"><span>Total Biaya</span><span class="text-purple-600">' + formatRp(p.totalBiaya) + '</span></div>'; document.getElementById('purch-detail-content').innerHTML = html; 
            var actionHtml = '<button onclick="closeModal(\'modal-purch-detail\')" class="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95">Tutup</button>'; document.getElementById('purch-detail-actions').innerHTML = actionHtml; openModal('modal-purch-detail'); 
        }
		
		// --- MANAJEMEN AKUN PENGGUNA ---
        function renderUsersList() {
            var tbody = document.getElementById('setup-users-tbody');
            if(!tbody) return;
            var html = '';
            
            for(var i=0; i<state.users.length; i++) {
                var u = state.users[i];
                var roleBadge = u.role === 'Admin' ? '<span class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg text-[9px] font-black"><i class="fas fa-shield-alt mr-1"></i>ADMIN</span>' : '<span class="bg-blue-50 text-blue-600 px-2 py-1 rounded-lg text-[9px] font-black"><i class="fas fa-user-tag mr-1"></i>KASIR</span>';
                
                var btnDelete = u.username.toLowerCase() === 'admin' 
                  ? '<button disabled class="w-7 h-7 bg-slate-100 text-slate-300 rounded cursor-not-allowed" title="Admin Root Tidak Bisa Dihapus"><i class="fas fa-lock text-[10px]"></i></button>' 
                  : '<button onclick="deleteUserAction(\'' + safeJsArg(u.username) + '\')" class="w-7 h-7 bg-red-50 text-red-500 hover:bg-red-100 rounded transition-colors active:scale-95"><i class="fas fa-trash text-[10px]"></i></button>';

              html += '<tr class="hover:bg-slate-50 transition-colors">' +
                  '<td class="p-3 font-mono text-slate-500 font-bold">' + escapeHtml(u.username) + '</td>' +
                  '<td class="p-3 font-extrabold text-slate-800">' + escapeHtml(u.nama) + '</td>' +
                  '<td class="p-3">' + roleBadge + '</td>' +
                  '<td class="p-3 text-center flex justify-center gap-1.5">' +
                      '<button onclick="openUserModal(\'' + safeJsArg(u.username) + '\')" class="w-7 h-7 bg-blue-50 text-blue-500 hover:bg-blue-100 rounded transition-colors active:scale-95"><i class="fas fa-edit text-[10px]"></i></button>' +
                      btnDelete +
                  '</td>' +
              '</tr>';
            }
            tbody.innerHTML = html;
        }

        function openUserModal(username) {
            document.getElementById('form-user').reset();
            // [FIX] Reset ikon mata ke kondisi tersembunyi setiap buka modal
            var passInput = document.getElementById('mu-pass');
            var passIcon = document.getElementById('mu-pass-eye');
            if (passInput) passInput.type = 'password';
            if (passIcon) {
                passIcon.classList.remove('fa-eye-slash');
                passIcon.classList.add('fa-eye');
            }
            var isEditEl = document.getElementById('mu-is-edit');
            var userEl = document.getElementById('mu-username');
            var passHelper = document.getElementById('mu-pass-helper');
            var titleEl = document.getElementById('mu-title');

            if(username) {
                // EDIT MODE
                var u = state.users.find(x => x.username === username);
                if(u) {
                    isEditEl.value = 'true';
                    userEl.value = u.username;
                    userEl.readOnly = true; // Username tidak boleh diganti
                    userEl.classList.add('opacity-60', 'cursor-not-allowed');
                    
                    document.getElementById('mu-nama').value = u.nama;
                    document.getElementById('mu-role').value = u.role;
                    
                    titleEl.innerText = 'Edit Akun';
                    passHelper.classList.remove('hidden'); // Tampilkan info kosongkan sandi
                }
            } else {
                // ADD MODE
                isEditEl.value = 'false';
                userEl.readOnly = false;
                userEl.classList.remove('opacity-60', 'cursor-not-allowed');
                titleEl.innerText = 'Tambah Akun';
                passHelper.classList.add('hidden');
            }
            openModal('modal-user');
        }

        function saveUserAction(e) {
            e.preventDefault();
            var isEdit = document.getElementById('mu-is-edit').value === 'true';
            var username = document.getElementById('mu-username').value.trim();
            var pass = document.getElementById('mu-pass').value;
            
            // Validasi Password Wajib jika Buat Baru
            if (!isEdit && !pass) return showToast('Password wajib diisi!', 'error');

            var btn = document.getElementById('btn-save-user');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Menyimpan...'; 
            btn.disabled = true;

            var payload = {
                isEdit: isEdit,
                username: username,
                nama: document.getElementById('mu-nama').value,
                password: pass,
                role: document.getElementById('mu-role').value
            };

            google.script.run.withSuccessHandler(function(res) {
                btn.innerText = 'Simpan Akun'; btn.disabled = false;
                if(res.success) {
                    manualSync(true); // Sinkronisasi otomatis memuat ulang data akun
                    closeModal('modal-user');
                    Swal.fire('Tersimpan!', 'Data akun berhasil diperbarui.', 'success');
                } else {
                    Swal.fire('Gagal', res.error, 'error');
                }
            }).saveUserAccount(storageManager.get('pos_token_final'), payload);
        }

        function deleteUserAction(username) {
            Swal.fire({
                title: 'Hapus Akun?',
                html: 'Akun <b>' + username + '</b> akan dihapus permanen. Lanjutkan?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: 'Ya, Hapus!'
            }).then((result) => {
                if (result.isConfirmed) {
                    Swal.fire({title: 'Memproses...', allowOutsideClick: false, didOpen: () => {Swal.showLoading()}});
                    google.script.run.withSuccessHandler(function(res) {
                        if (!handleApiResponse(res, "Gagal hapus akun: ")) return;

                        manualSync(true);
                        Swal.fire('Dihapus!', 'Akun berhasil dihapus.', 'success');
                    }).deleteUserAccount(storageManager.get('pos_token_final'), username);
                }
            });
        }
	
		// --- LOGIKA ACCORDION MENU PENGATURAN ---
        function toggleSetupAccordion(section) {
            var content = document.getElementById('acc-' + section);
            var icon = document.getElementById('icon-' + section);
            if(!content || !icon) return;
            
            // Tutup atau buka kotak
            if (content.classList.contains('hidden')) {
                content.classList.remove('hidden');
                icon.classList.remove('-rotate-90'); // Ikon menunjuk ke bawah (Terbuka)
            } else {
                content.classList.add('hidden');
                icon.classList.add('-rotate-90'); // Ikon menunjuk ke kanan (Tertutup)
            }
        }
		// ==========================================
		// FUNGSI FULLSCREEN (UNTUK MOBILE/TABLET)
		// ==========================================
		function toggleFullscreen() {
		var doc = window.document;
		var docEl = doc.documentElement;

		var requestFullScreen = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
		var cancelFullScreen = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

		var icon = document.getElementById('fs-icon');

      if (!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
        // Masuk Mode Fullscreen
        if (requestFullScreen) {
          requestFullScreen.call(docEl);
          if(icon) {
            icon.classList.remove('fa-expand');
            icon.classList.add('fa-compress');
          }
        }
      } else {
        // Keluar Mode Fullscreen
        if (cancelFullScreen) {
          cancelFullScreen.call(doc);
          if(icon) {
            icon.classList.remove('fa-compress');
            icon.classList.add('fa-expand');
          }
        }
      }
		}

		// Tambahan: Reset icon jika user keluar fullscreen pakai tombol bawaan HP (Back)
		document.addEventListener('fullscreenchange', handleExitFS);
		document.addEventListener('webkitfullscreenchange', handleExitFS);
		document.addEventListener('mozfullscreenchange', handleExitFS);
		document.addEventListener('MSFullscreenChange', handleExitFS);

		function handleExitFS() {
		var icon = document.getElementById('fs-icon');
      if (!document.fullscreenElement && icon) {
        icon.classList.remove('fa-compress');
        icon.classList.add('fa-expand');
      }
		}

    function printDailyFullReport() {
        var today = new Date().toDateString();
        var todayDate = new Date();

        var todaySales = state.transactions.filter(function(t) {
            return new Date(t.tanggal).toDateString() === today && t.status === 'SUKSES';
        });
        var todayPurchases = state.purchases.filter(function(p) {
            return new Date(p.tanggal).toDateString() === today;
        });
        var todayLayanan = (state.layananDigital || []).filter(function(l) {
            return new Date(l.tanggal).toDateString() === today;
        });

        if (todaySales.length === 0 && todayPurchases.length === 0 && todayLayanan.length === 0) {
            Swal.fire('Info', 'Belum ada transaksi penjualan, pembelian, atau layanan digital hari ini.', 'info');
            return;
        }

        // Hitung kas LACI seharusnya (informasi cetak saja)
        var kasLaciSeharusnya = _hitungKasLaciHariIni();
        // [FIX #10] Deteksi apakah shift aktif melewati batas hari (24 jam+)
        var shiftWaktuBuka = state.currentShift ? new Date(state.currentShift.waktuBuka) : null;
        var shiftIsMultiDay = shiftWaktuBuka && shiftWaktuBuka.toDateString() !== new Date().toDateString();
        var shiftNoteHtml = shiftIsMultiDay
            ? '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:8px;margin-bottom:10px;font-size:10px;color:#92400e;text-align:left;">' +
              '<b><i class="fas fa-exclamation-triangle mr-1"></i>Perhatian:</b> Shift aktif dibuka pada <b>' +
              shiftWaktuBuka.toLocaleString('id-ID', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) +
              '</b>. Laporan ini mencakup <b>SEMUA transaksi sejak shift dibuka</b>, bukan hanya hari ini (00:00).' +
              '</div>'
            : '';

        // Hitung saldo 111 sistem (informasi)
        var saldo111 =
		    (state._saldoByAccount && Number(state._saldoByAccount['111'])) ||
		    (Number(state.saldoRingkas.kas111) || 0);

        Swal.fire({
            title: shiftIsMultiDay ? '💰 Cetak Laporan Shift Aktif' : '💰 Cetak Laporan Harian',
            width: 520,
            html:
                shiftNoteHtml +
                '<p style="font-size:11px; color:#64748b; margin-bottom:10px; text-align:left;">' +
                    '<i class="fas fa-info-circle mr-1 text-blue-500"></i>' +
                    'Laporan ini <b>hanya untuk cetak</b>. Untuk koreksi selisih kas, gunakan menu ' +
                    '<b>Laporan → Arus Kas → Rekonsiliasi Kas Total</b>.' +
                '</p>' +
                '<div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px; margin-bottom:12px; text-align:left;">' +
                    '<div style="display:flex; justify-content:space-between; margin-bottom:4px;">' +
                        '<span style="font-size:11px; color:#1e40af; font-weight:bold;">Laci seharusnya:</span>' +
                        '<span style="font-size:13px; font-weight:900; color:#1e3a8a;">' + formatRp(kasLaciSeharusnya) + '</span>' +
                    '</div>' +
                    '<div style="display:flex; justify-content:space-between;">' +
                        '<span style="font-size:11px; color:#1e40af; font-weight:bold;">Saldo 111 total:</span>' +
                        '<span style="font-size:12px; font-weight:900; color:#1e3a8a;">' + formatRp(saldo111) + '</span>' +
                    '</div>' +
                '</div>' +
                '<label style="display:block; font-size:11px; font-weight:bold; color:#64748b; margin-bottom:6px; text-align:left;">' +
                    'Uang fisik di LACI (info rekap):' +
                '</label>',
            input: 'text',
            inputAttributes: { inputmode: 'numeric', autocomplete: 'off', placeholder: 'Cth: 1.500.000' },
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-print mr-1"></i> Cetak',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#10b981',
            cancelButtonColor: '#94a3b8',
            didOpen: function() {
                var input = Swal.getInput();
                input.addEventListener('input', function() {
                    var raw = String(this.value || '').replace(/\D/g, '');
                    if (raw) this.value = Number(raw).toLocaleString('id-ID');
                    else this.value = '';
                });
                setTimeout(function() { input.focus(); }, 200);
            },
            preConfirm: function() {
                var raw = String(Swal.getInput().value || '').replace(/\D/g, '');
                return raw === '' ? 0 : parseInt(raw, 10);
            }
        }).then(function(step) {
            if (step.isDismissed) return;
            var uangFisikLaci = step.value;
            var selisihLaci = uangFisikLaci - kasLaciSeharusnya;

            // ═══ Hanya cetak — TIDAK buat jurnal dari sini ═══
            // [FIX #17] Hapus dua argumen terakhir (dead params)
            _executeCetakLaporanHarian(
                today, todayDate, todaySales, todayPurchases, todayLayanan,
                uangFisikLaci, kasLaciSeharusnya, selisihLaci
            );
        });
    }

    // ═══ Helper: hitung kas LACI seharusnya hari ini (informasi cetak) ═══
    function _hitungKasLaciHariIni() {
        var today = new Date().toDateString();
        var sumberDana = state.setup['Sumber Dana Operasional'] || 'BRANGKAS';
        var kasSistem = 0;

        // ═══════════════════════════════════════════════════════════════
        // [FIX v7.19.3] Konsistensi dengan openCloseShiftModal()
        // Definisi "uang laci hari ini" = modal shift aktif + transaksi
        // sejak shift dibuka − pengeluaran (jika mode LACI) − tarik tunai.
        //
        // Kalau tidak ada shift aktif, kas laci = 0 (tidak ada laci aktif).
        // Kalau ada shift aktif (walau buka kemarin), hitung sejak waktuBuka.
        // ═══════════════════════════════════════════════════════════════
        if (!state.currentShift) {
            // Tidak ada shift aktif → tidak ada uang di laci yang bisa diverifikasi
            return 0;
        }

        var waktuBukaShift = Number(state.currentShift.waktuBuka) || 0;
        kasSistem += Number(state.currentShift.modalAwal) || 0;

        // ── TRANSAKSI (sejak shift buka) ──
        for (var i = 0; i < state.transactions.length; i++) {
            var trx = state.transactions[i];
            if (trx.tanggal < waktuBukaShift) continue;
            // [FIX #2] Filter kasir — konsisten dengan openCloseShiftModal().
            // Tanpa filter ini, laporan harian multi-kasir akan salah.
            if (trx.kasir !== state.user.nama) continue;
            // Opsional: kalau shift buka kemarin, transaksi kemarin & hari ini
            // dari shift yang SAMA tetap dihitung

            if (trx.metode === 'Tunai' && trx.status === 'SUKSES') {
                kasSistem += Number(trx.total) || 0;
            } else if (trx.metode === 'Kasbon' && trx.status === 'HUTANG') {
                kasSistem += Number(trx.bayar) || 0;
            } else if (trx.metode === 'Kasbon' && trx.status === 'SUKSES') {
                // [FIX v7.19.3] Kasbon LUNAS → DP + pelunasan sudah masuk laci
                kasSistem += Number(trx.bayar) || 0;
            } else if (trx.status === 'RETUR' && trx.metode === 'Tunai') {
                kasSistem -= Number(trx.total) || 0;
            }
        }

        // [FIX B2e] Pelunasan kasbon lintas shift dari jurnal (-PLN)
        for (var jpl2 = 0; jpl2 < state.jurnal.length; jpl2++) {
            var jPel2 = state.jurnal[jpl2];
            var refP2 = String(jPel2.refId || '').trim();
            if (refP2.indexOf('-PLN') === -1) continue;
            if (jPel2.tanggal < waktuBukaShift) continue;
            if (String(jPel2.kodeAkun).trim() !== '111') continue;
            if ((jPel2.debit || 0) <= 0) continue;

            var refP2Base = refP2.replace(/-PLN$/, '');
            var isOwn = false;
            for (var lgP = 0; lgP < state.logs.length; lgP++) {
                var lgP2 = state.logs[lgP];
                if (String(lgP2.aksi) !== 'PELUNASAN') continue;
                if (String(lgP2.keterangan || '').indexOf(refP2Base) === -1) continue;
                if (String(lgP2.user || '') !== state.user.nama) continue;
                if (lgP2.waktu < waktuBukaShift) continue;
                isOwn = true;
                break;
            }
            if (isOwn) kasSistem += Number(jPel2.debit) || 0;
        }

        // ── LAYANAN DIGITAL (sejak shift buka) ──
        for (var l = 0; l < (state.layananDigital || []).length; l++) {
            var lay = state.layananDigital[l];
            if (lay.tanggal < waktuBukaShift) continue;

            if (lay.jenis === 'PRODUK_DIGITAL' && lay.metode === 'Tunai') {
                kasSistem += Number(lay.nominal) || 0;
            } else if (lay.jenis === 'TARIK_TUNAI') {
                var uangFisikLay = (Number(lay.nominal) || 0) - (Number(lay.fee) || 0);
                var m = String(lay.metode || '').toUpperCase();
                kasSistem -= uangFisikLay;
                if (m === 'TUNAI') {
                    kasSistem += Number(lay.nominal) || 0;
                } else if (m === 'SPLIT') {
                    kasSistem += Number(lay.fee) || 0;
                }
            } else if (lay.jenis === 'TOPUP_EWALLET') {
                if (lay.metode === 'TUNAI') kasSistem += (Number(lay.nominal) || 0) + (Number(lay.fee) || 0);
                else if (lay.metode === 'SPLIT') kasSistem += Number(lay.fee) || 0;
            }
        }

        // ── PENGELUARAN (sejak shift buka, HANYA mode LACI) ──
        if (sumberDana === 'LACI') {
            for (var b = 0; b < state.beban.length; b++) {
                var beb = state.beban[b];
                if (beb.tanggal < waktuBukaShift) continue;
                var nonKas = ['Setoran Modal', 'Penerimaan Pinjaman', 'Pendapatan Lainnya', 'Penyusutan Aset', 'Penarikan Bank ke Kas'];
                if (nonKas.indexOf(beb.kategori) === -1) kasSistem -= Number(beb.nominal) || 0;
            }
            for (var p = 0; p < state.purchases.length; p++) {
                var pur = state.purchases[p];
                if (pur.tanggal < waktuBukaShift) continue;
                if (String(pur.metode).toLowerCase() === 'tunai') kasSistem -= Number(pur.totalBiaya) || 0;
            }
        }

        return Math.round(kasSistem);
    }

    // [FIX #17] `sudahDijurnal` & `idJurnal` dihapus — selalu false/'' di
    // pemanggil. Jurnal selisih sudah otomatis dibuat di closeShift().
    function _executeCetakLaporanHarian(today, todayDate, todaySales, todayPurchases, todayLayanan, uangFisik, kasSistem, selisih) {
        // [FIX BUG #2] Baca sumberDana dari state.setup
        var sumberDana = state.setup['Sumber Dana Operasional'] || 'BRANGKAS';
        // ========== 1. Agregasi Layanan Digital ==========
        var totalTarikTunai = 0, totalProdukDigital = 0, totalFeeLayanan = 0;
        var layananRows = [];
        todayLayanan.forEach(function(l) {
            var nom = Number(l.nominal) || 0;
            var fee = Number(l.fee) || 0;
            if (l.jenis === 'TARIK_TUNAI') totalTarikTunai += nom;
            else totalProdukDigital += nom;
            totalFeeLayanan += fee;
            layananRows.push({
                jenis: l.jenis, keterangan: l.keterangan,
                nominal: nom, modal: Number(l.modal) || 0,
                fee: fee, metode: l.metode
            });
        });

        // ========== 2. Agregasi Penjualan per Kategori ==========
        var salesByCategory = {};
        todaySales.forEach(function(tx) {
            var items = [];
            try { items = JSON.parse(tx.cartJson); } catch(e) {}
            items.forEach(function(item) {
                var prod = state.products.find(function(p) { return String(p.id) === String(item.id); });
                var category = prod ? prod.kategori : 'Lainnya';
                if (!salesByCategory[category]) salesByCategory[category] = [];
                var existing = salesByCategory[category].find(function(it) { return it.id === item.id; });
                if (existing) {
                    existing.qty += item.qty;
                    existing.total += item.qty * item.hargaJual;
                } else {
                    salesByCategory[category].push({
                        id: item.id, nama: item.nama, qty: item.qty,
                        hargaJual: item.hargaJual, total: item.qty * item.hargaJual
                    });
                }
            });
        });
        var salesCategories = Object.keys(salesByCategory).sort();

        // ========== 3. Agregasi Pembelian per Kategori ==========
        var purchasesByCategory = {};
        todayPurchases.forEach(function(pur) {
            var prod = state.products.find(function(p) { return String(p.id) === String(pur.idProduk); });
            var category = prod ? prod.kategori : 'Lainnya';
            if (!purchasesByCategory[category]) purchasesByCategory[category] = [];
            purchasesByCategory[category].push({
                nama: pur.namaProduk, qty: pur.qty, hargaBeli: pur.hargaBeli,
                total: pur.totalBiaya, supplier: pur.supplier || '-'
            });
        });
        var purchaseCategories = Object.keys(purchasesByCategory).sort();

        // ========== 4. Rekap Metode Pembayaran ==========
        var payMethods = { Tunai: 0, QRIS: 0, Kasbon: 0 };
        todaySales.forEach(function(tx) {
            var metode = tx.metode || 'Tunai';
            if (payMethods[metode] !== undefined) payMethods[metode] += tx.total;
            else payMethods[metode] = tx.total;
        });

        // ========== 5. Variabel Umum ==========
        var toko = escapeHtml(state.setup['Nama Toko'] || 'Toko Saya');
        var alamat = escapeHtml(state.setup['Alamat'] || '');
        var tanggal = todayDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        var waktu = todayDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        function headerHtml() {
            return '<div style="text-align: center; margin-bottom: 20px;">' +
                    '<h1 style="margin:0; font-size: 24px;">' + toko + '</h1>' +
                    '<p style="margin:5px 0; font-size: 14px;">' + alamat + '</p>' +
                    '<p style="margin:5px 0; font-size: 14px; font-weight:bold;">LAPORAN HARIAN LENGKAP</p>' +
                    '<p style="margin:5px 0; font-size: 12px;">' + tanggal + ' - ' + waktu + '</p>' +
                    '<hr style="border: 2px solid #000; margin: 10px 0;">' +
                  '</div>';
        }

        // --- Halaman 1: Penjualan ---
        function buildSalesPage() {
            var html = headerHtml();
            html += '<h2 style="border-bottom: 2px solid #2563eb; padding-bottom: 5px; color: #2563eb;">A. PENJUALAN HARI INI</h2>';
            var grandTotalSales = 0;
            var hasSales = false;
            salesCategories.forEach(function(cat) {
                var items = salesByCategory[cat];
                items.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
                var catTotal = items.reduce(function(sum, it) { return sum + it.total; }, 0);
                grandTotalSales += catTotal;
                if (catTotal > 0) hasSales = true;
                html += '<h4 style="margin: 15px 0 5px 0; color: #2563eb; border-bottom: 1px solid #ddd; padding-bottom: 3px;">Kategori: ' + escapeHtml(cat) + ' (Total: ' + formatRp(catTotal) + ')</h4>';
                html += '<table style="width:100%; border-collapse: collapse; font-size: 12px; margin-bottom: 10px;">';
                html += '<thead><tr style="border-bottom: 1px solid #333;"><th style="text-align:left; padding:4px;">Produk</th><th style="text-align:center; padding:4px;">Qty</th><th style="text-align:right; padding:4px;">Harga Jual</th><th style="text-align:right; padding:4px;">Total</th></tr></thead><tbody>';
                items.forEach(function(it) {
                    html += '<tr style="border-bottom: 1px solid #eee;"><td style="padding:4px;">' + escapeHtml(it.nama) + '</td><td style="text-align:center; padding:4px;">' + it.qty + '</td><td style="text-align:right; padding:4px;">' + formatRp(it.hargaJual) + '</td><td style="text-align:right; padding:4px;">' + formatRp(it.total) + '</td></tr>';
                });
                html += '</tbody></table>';
            });
            if (!hasSales) html += '<p style="text-align:center; color:#999;">Tidak ada penjualan hari ini.</p>';
            else {
                html += '<div style="text-align:right; font-weight:bold; font-size:14px; border-top: 2px solid #000; padding-top: 8px;">Total Penjualan: ' + formatRp(grandTotalSales) + '</div>';
                html += '<p style="text-align:right; font-size: 12px; margin-top: 5px;">Total Transaksi: ' + todaySales.length + '</p>';
            }
            return html;
        }

        // --- Halaman 2: Pembelian ---
        function buildPurchasesPage() {
            var html = headerHtml();
            html += '<h2 style="border-bottom: 2px solid #8b5cf6; padding-bottom: 5px; color: #8b5cf6;">B. PEMBELIAN HARI INI</h2>';
            var grandTotalPurchases = 0;
            var hasPurchases = false;
            purchaseCategories.forEach(function(cat) {
                var items = purchasesByCategory[cat];
                items.sort(function(a, b) { return a.nama.localeCompare(b.nama); });
                var catTotal = items.reduce(function(sum, it) { return sum + it.total; }, 0);
                grandTotalPurchases += catTotal;
                if (catTotal > 0) hasPurchases = true;
                html += '<h4 style="margin: 15px 0 5px 0; color: #8b5cf6; border-bottom: 1px solid #ddd; padding-bottom: 3px;">Kategori: ' + escapeHtml(cat) + ' (Total: ' + formatRp(catTotal) + ')</h4>';
                html += '<table style="width:100%; border-collapse: collapse; font-size: 12px; margin-bottom: 10px;">';
                html += '<thead><tr style="border-bottom: 1px solid #333;"><th style="text-align:left; padding:4px;">Produk</th><th style="text-align:center; padding:4px;">Qty</th><th style="text-align:right; padding:4px;">Harga Beli</th><th style="text-align:right; padding:4px;">Total</th><th style="text-align:left; padding:4px;">Supplier</th></tr></thead><tbody>';
                items.forEach(function(it) {
                    html += '<tr style="border-bottom: 1px solid #eee;"><td style="padding:4px;">' + escapeHtml(it.nama) + '</td><td style="text-align:center; padding:4px;">' + it.qty + '</td><td style="text-align:right; padding:4px;">' + formatRp(it.hargaBeli) + '</td><td style="text-align:right; padding:4px;">' + formatRp(it.total) + '</td><td style="padding:4px;">' + escapeHtml(it.supplier) + '</td></tr>';
                });
                html += '</tbody></table>';
            });
            if (!hasPurchases) html += '<p style="text-align:center; color:#999;">Tidak ada pembelian hari ini.</p>';
            else {
                html += '<div style="text-align:right; font-weight:bold; font-size:14px; border-top: 2px solid #000; padding-top: 8px;">Total Pembelian: ' + formatRp(grandTotalPurchases) + '</div>';
                html += '<p style="text-align:right; font-size: 12px; margin-top: 5px;">Total Transaksi Pembelian: ' + todayPurchases.length + '</p>';
            }
            return html;
        }

        // --- Halaman 3: Rekap Pembayaran ---
        function buildPaymentPage() {
            var html = headerHtml();
            html += '<h2 style="border-bottom: 2px solid #10b981; padding-bottom: 5px; color: #10b981;">C. REKAPITULASI METODE PEMBAYARAN</h2>';
            html += '<table style="width:100%; border-collapse: collapse; font-size: 12px; margin-top: 15px;">';
            html += '<thead><tr style="border-bottom: 1px solid #333;"><th style="text-align:left; padding:4px;">Metode</th><th style="text-align:right; padding:4px;">Nominal</th></tr></thead><tbody>';
            var grandPay = 0; var hasPayment = false;
            for (var method in payMethods) {
                if (payMethods[method] > 0) {
                    hasPayment = true;
                    grandPay += payMethods[method];
                    var icon = method === 'Tunai' ? '💵' : (method === 'QRIS' ? '📱' : '📝');
                    html += '<tr style="border-bottom: 1px solid #eee;"><td style="padding:4px;">' + icon + ' ' + method + '</td><td style="text-align:right; padding:4px;">' + formatRp(payMethods[method]) + '</td></tr>';
                }
            }
            if (!hasPayment) html += '<tr><td colspan="2" style="text-align:center; color:#999;">Tidak ada data pembayaran</td></tr>';
            else html += '<tr style="border-top: 2px solid #000; font-weight:bold;"><td style="padding:4px;">Total Penerimaan</td><td style="text-align:right; padding:4px;">' + formatRp(grandPay) + '</td></tr>';
            html += '</tbody></table>';
            return html;
        }

        // --- Halaman 4: Layanan Digital ---
        function buildLayananPage() {
            var html = headerHtml();
            html += '<h2 style="border-bottom: 2px solid #8b5cf6; padding-bottom: 5px; color: #8b5cf6;">D. LAYANAN DIGITAL & TARIK TUNAI</h2>';
            if (layananRows.length === 0) {
                html += '<p style="text-align:center; color:#999;">Tidak ada transaksi layanan digital hari ini.</p>';
                return html;
            }
            html += '<table style="width:100%; border-collapse: collapse; font-size: 12px; margin-top: 15px;">';
            html += '<thead><tr style="border-bottom: 1px solid #333;"><th style="text-align:left; padding:4px;">Jenis</th><th style="text-align:left; padding:4px;">Keterangan</th><th style="text-align:right; padding:4px;">Nominal</th><th style="text-align:right; padding:4px;">Modal</th><th style="text-align:right; padding:4px;">Fee/Margin</th><th style="text-align:center; padding:4px;">Metode</th></tr></thead><tbody>';
            layananRows.forEach(function(r) {
                html += '<tr style="border-bottom: 1px solid #eee;"><td style="padding:4px;">' + r.jenis + '</td><td style="padding:4px;">' + r.keterangan + '</td><td style="text-align:right; padding:4px;">' + formatRp(r.nominal) + '</td><td style="text-align:right; padding:4px;">' + (r.modal > 0 ? formatRp(r.modal) : '-') + '</td><td style="text-align:right; padding:4px;">' + formatRp(r.fee) + '</td><td style="text-align:center; padding:4px;">' + r.metode + '</td></tr>';
            });
            html += '</tbody></table>';
            html += '<div style="margin-top: 15px; padding: 10px; background: #f3f4f6;">';
            html += '<p style="margin:3px 0;"><b>Total Tarik Tunai:</b> ' + formatRp(totalTarikTunai) + '</p>';
            html += '<p style="margin:3px 0;"><b>Total Produk Digital:</b> ' + formatRp(totalProdukDigital) + '</p>';
            html += '<p style="margin:3px 0; color: #059669;"><b>Total Fee/Margin Toko:</b> ' + formatRp(totalFeeLayanan) + '</p>';
            html += '</div>';
            return html;
        }

        // --- [NEW] Halaman 5: Rekonsiliasi Kas Fisik ---
        function buildRekonsiliasiPage() {
            var html = headerHtml();
            html += '<h2 style="border-bottom: 2px solid #f59e0b; padding-bottom: 5px; color: #f59e0b;">E. REKONSILIASI KAS FISIK (LACI KASIR)</h2>';
            html += '<p style="margin: 0 0 10px 0; font-size: 11px; color: #64748b; font-style: italic;">Rekonsiliasi uang fisik di laci kasir hari ini — bukan total Kas 111 toko.</p>';

            var statusText, selisihColor, statusIcon;
            if (selisih === 0) {
                statusText = 'COCOK (SESUAI)';
                selisihColor = '#10b981';
                statusIcon = '✓';
            } else if (selisih > 0) {
                statusText = 'LEBIH';
                selisihColor = '#3b82f6';
                statusIcon = '⚠';
            } else {
                statusText = 'KURANG';
                selisihColor = '#ef4444';
                statusIcon = '⚠';
            }

            html += '<div style="margin-top: 20px;">';
            html += '<table style="width:100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">';
            html += '<tr style="border-bottom: 1px solid #ddd;">';
            html +=   '<td style="padding: 12px 5px;">Uang Seharusnya di Laci Kasir</td>';
            html +=   '<td style="text-align:right; padding: 12px 5px; font-weight: bold;">' + formatRp(kasSistem) + '</td>';
            html += '</tr>';
            html += '<tr style="border-bottom: 1px solid #ddd;">';
            html +=   '<td style="padding: 12px 5px;">Uang Fisik di Laci Kasir</td>';
            html +=   '<td style="text-align:right; padding: 12px 5px; font-weight: bold;">' + formatRp(uangFisik) + '</td>';
            html += '</tr>';
            html += '<tr style="border-top: 3px double #000;">';
            html +=   '<td style="padding: 15px 5px; font-weight: bold; font-size: 16px;">SELISIH</td>';
            html +=   '<td style="text-align:right; padding: 15px 5px; font-weight: bold; font-size: 18px; color: ' + selisihColor + ';">';
            html +=     statusIcon + ' Rp ' + formatRp(Math.abs(selisih)) + ' <span style="font-size: 13px;">(' + statusText + ')</span>';
            html +=   '</td>';
            html += '</tr>';
            html += '</table>';

            // Keterangan status
            // [FIX #17] Dead branch `sudahDijurnal` dihapus — jurnal selisih
            // sudah otomatis dibuat oleh closeShift(), bukan dari printDaily.
            if (selisih !== 0) {
                html += '<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-top: 20px;">';
                html +=   '<p style="margin: 5px 0; font-weight: bold; color: #92400e;">📋 Keterangan</p>';
                html +=   '<p style="margin: 5px 0; font-size: 12px; color: #78350f;">';
                html +=     'Selisih <b>TIDAK dijurnal otomatis</b>. Laporan ini hanya untuk audit.<br>';
                html +=     'Jika perlu koreksi permanen, lakukan lewat <b>Tutup Shift</b> atau buat jurnal manual.';
                html +=   '</p>';
                html += '</div>';
            } else {
                html += '<div style="background: #dcfce7; border-left: 4px solid #10b981; padding: 15px; margin-top: 20px;">';
                html +=   '<p style="margin: 5px 0; font-weight: bold; color: #065f46;">✓ LUAR BIASA!</p>';
                html +=   '<p style="margin: 5px 0; font-size: 13px; color: #166534;">Uang fisik di laci COCOK dengan catatan sistem. Kas terkontrol dengan baik.</p>';
                html += '</div>';
            }
            // [FIX] Pindahkan keluar — selalu tampil
            html += '<p style="margin-top: 15px; font-size: 10px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 10px;">';
            html +=   '<b>Catatan Sumber Dana:</b> ' + (sumberDana === 'BRANGKAS' 
                ? 'Restock, Beban, dan Tarik Tunai diambil dari <b>BRANGKAS</b> (tidak memotong laci kasir).' 
                : 'Restock, Beban, dan Tarik Tunai <b>memotong laci kasir</b>.');
            html += '</p>';

            html += '</div>';
            return html;
        }

        // ========== 6. Gabungkan ke dalam Cetakan ==========
        var fullHtml =
            '<div style="font-family: \'Courier New\', monospace; padding: 20px; max-width: 1000px; margin: 0 auto;">' +
                '<div style="page-break-after: always;">' + buildSalesPage() + '</div>' +
                '<div style="page-break-after: always;">' + buildPurchasesPage() + '</div>' +
                '<div style="page-break-after: always;">' + buildLayananPage() + '</div>' +
                '<div style="page-break-after: always;">' + buildRekonsiliasiPage() + '</div>' +
                '<div>' + buildPaymentPage() + '</div>' +
            '</div>';

        // ========== 7. Eksekusi Cetak ==========
        var printDiv = document.createElement('div');
        printDiv.id = 'print-daily-full';
        printDiv.innerHTML = fullHtml;
        printDiv.style.display = 'none';
        document.body.appendChild(printDiv);

        // ✅ BARU — biarkan cleanup printArea yang hapus
        printArea('print-daily-full', { removeAfter: true });
    }

    // [NEW] MODUL LAYANAN DIGITAL & TARIK TUNAI
    function openLayananModal(jenis) {
        if(!state.currentShift) {
            Swal.fire('Shift Belum Buka', 'Silakan buka shift terlebih dahulu.', 'warning');
            return;
        }
        document.getElementById('ml-form-tarik').classList.add('hidden');
        document.getElementById('ml-form-digital').classList.add('hidden');
        document.getElementById('ml-form-topup').classList.add('hidden');

        // Reset semua input
        ['ml-nominal','ml-pelanggan','ml-digi-nama','ml-digi-modal','ml-digi-jual','ml-digi-pelanggan',
         'ml-topup-nominal','ml-topup-pelanggan','ml-topup-nohp','ml-topup-atasnama'].forEach(function(id){
            var el = document.getElementById(id); if(el) el.value = '';
        });
        document.getElementById('ml-uang-fisik').innerText = 'Rp 0';
        document.getElementById('ml-digi-fee').innerText = 'Rp 0';
        document.getElementById('ml-topup-fee').innerText = 'Rp 0';
        document.getElementById('ml-topup-bank').innerText = 'Rp 0';

        if (jenis === 'TARIK_TUNAI') {
            document.getElementById('ml-title').innerText = 'Tarik Tunai';
            document.getElementById('ml-form-tarik').classList.remove('hidden');
            document.getElementById('ml-metode-bayar').value = 'QRIS';
            updateTarikPreview();
            validateTarikBtn();        // ← Pastikan tombol disabled saat buka
            setTimeout(() => document.getElementById('ml-nominal').focus(), 200);
        } else if (jenis === 'TOPUP_EWALLET') {
            document.getElementById('ml-title').innerText = 'Top Up E-Wallet';
            document.getElementById('ml-form-topup').classList.remove('hidden');
            document.getElementById('ml-topup-metode').value = 'QRIS';
            updateTopupPreview();
            validateTopupBtn();        // ← Pastikan tombol disabled saat buka
            setTimeout(() => document.getElementById('ml-topup-nominal').focus(), 200);
        } else {
            document.getElementById('ml-title').innerText = 'Produk Digital';
            document.getElementById('ml-form-digital').classList.remove('hidden');
            validateDigiBtn();         // ← Pastikan tombol disabled saat buka
            setTimeout(() => document.getElementById('ml-digi-nama').focus(), 200);
        }
        openModal('modal-layanan');
    }

    function setQuickTarik(nominal) {
        // [FIX] Tampilkan dengan format ribuan agar konsisten dengan hasil ketikan manual
        document.getElementById('ml-nominal').value = Number(nominal).toLocaleString('id-ID');
        updateTarikPreview();
    }

    document.addEventListener('input', function(e) {
        if (!e.target) return;
        if (e.target.id === 'ml-nominal') updateTarikPreview();
        if (e.target.id === 'ml-topup-nominal') updateTopupPreview();
        if (e.target.id === 'ml-digi-jual' || e.target.id === 'ml-digi-modal' || e.target.id === 'ml-digi-nama') updateDigiPreview();
        if (e.target.id === 'ml-pelanggan') validateTarikBtn();
        if (e.target.id === 'ml-topup-pelanggan') validateTopupBtn();
        if (e.target.id === 'ml-digi-pelanggan') validateDigiBtn();
    });

    /* ============================================================
      [NEW] VALIDASI TOMBOL — Disable jika input belum valid
      ============================================================ */
    function validateTarikBtn() {
        var btn = document.getElementById('btn-submit-tarik');
        if (!btn) return;
        var uangFisik = getAngkaBersih('ml-nominal');
        var nama = (document.getElementById('ml-pelanggan').value || '').trim();
        var metodeBayar = document.getElementById('ml-metode-bayar').value;
        
        // [FIX #2] Gunakan saldoRingkas dari server (tersedia untuk SEMUA role).
        // Fallback ke state.jurnal (Admin) atau 0 (Kasir tanpa data).
        var isAdmin = !!(state.user && state.user.role === 'Admin');
        var saldoKas;
        // Prioritas: cache RPC > state.jurnal > 0
		var saldoKas =
		    (state._saldoByAccount && Number(state._saldoByAccount['111'])) ||
		    (state.saldoRingkas && Number(state.saldoRingkas.kas111)) ||
		    0;
        
        var fee = hitungFeeTarikTunaiJS(uangFisik);
        var minimalKas = (metodeBayar === 'SPLIT') ? Math.max(0, uangFisik - fee) : uangFisik;
        
        if (uangFisik < 10000 || !nama || minimalKas > saldoKas) {
            btn.disabled = true;
            if (minimalKas > saldoKas) btn.title = 'Saldo Kas tidak cukup: ' + formatRp(saldoKas) + ' (butuh minimal ' + formatRp(minimalKas) + ')';
        } else {
            btn.disabled = false;
            btn.title = '';
        }
    }

    function validateTopupBtn() {
        var btn = document.getElementById('btn-submit-topup');
        if (!btn) return;
        var nominal  = getAngkaBersih('ml-topup-nominal');
        var noHPEl   = document.getElementById('ml-topup-nohp');
        var atasEl   = document.getElementById('ml-topup-atasnama');
        var pelEl    = document.getElementById('ml-topup-pelanggan');
        var noHP     = noHPEl  ? String(noHPEl.value  || '').replace(/\D/g, '').trim() : '';
        var atasNama = atasEl  ? String(atasEl.value  || '').trim() : '';
        var namaPel  = pelEl   ? String(pelEl.value   || '').trim() : '';

        var noHpValid = noHP.length >= 8;

        if (nominal < 10000 || !namaPel || !noHpValid || !atasNama) {
            btn.disabled = true;
        } else {
            btn.disabled = false;
        }
    }

    function validateDigiBtn() {
        var btn = document.getElementById('btn-submit-digi');
        if (!btn) return;
        var namaPelanggan = (document.getElementById('ml-digi-pelanggan').value || '').trim();
        var namaProduk    = (document.getElementById('ml-digi-nama').value || '').trim();
        var modal         = getAngkaBersih('ml-digi-modal');
        var jual          = getAngkaBersih('ml-digi-jual');
        
        if (!namaPelanggan || !namaProduk || modal <= 0 || jual <= 0) {
            btn.disabled = true;
        } else {
            btn.disabled = false;
        }
    }

    function updateTarikPreview() {
        var uangFisik = getAngkaBersih('ml-nominal'); 
        var fee = hitungFeeTarikTunaiJS(uangFisik);
        var totalTransfer = uangFisik + fee;
        
        var hintEl = document.getElementById('ml-metode-hint');
        if (uangFisik <= 0) {
            if (hintEl) hintEl.innerHTML = 'Masukkan jumlah uang tunai yang ingin diserahkan ke pelanggan.';
            document.getElementById('ml-uang-fisik').innerText = 'Rp 0';
            document.getElementById('ml-fee-txt').innerText = 'Rp 0';
            validateTarikBtn();
            return;
        }
        
        var feeEl = document.getElementById('ml-fee-txt');
        if (feeEl) {
            var batasFlat = parseInt(state.setup['Batas Fee Flat Tarik Tunai']) || 499999;
            var persenBesar = parseFloat(state.setup['Persen Fee Tarik Tunai']) || 1;
            var infoTier = uangFisik > batasFlat 
                ? '<span class="block text-[9px] font-normal text-purple-500">(nominal × ' + persenBesar + '%)</span>'
                : '<span class="block text-[9px] font-normal text-purple-500">(fee flat)</span>';
            feeEl.innerHTML = formatRp(fee) + infoTier;
        }
        
        document.getElementById('ml-uang-fisik').innerText = formatRp(uangFisik);

        var metodeBayar = document.getElementById('ml-metode-bayar').value;
        
        // --- PERBAIKAN TEKS HINT (Tanpa "Rp Rp" & Lebih Ringkas) ---
        if (metodeBayar === 'QRIS') {
            hintEl.innerHTML = 
                '<div class="flex justify-between mb-0.5"><span>📥 Pelanggan QRIS:</span> <b>' + formatRp(totalTransfer) + '</b></div>' +
                '<div class="flex justify-between mb-0.5"><span>📤 Uang diserahkan:</span> <b>' + formatRp(uangFisik) + '</b></div>' +
                '<div class="flex justify-between"><span>💰 Fee Toko:</span> <b class="text-emerald-600">' + formatRp(fee) + '</b></div>';
        //} else if (metodeBayar === 'TUNAI') {
            //hintEl.innerHTML = 
                //'<div class="flex justify-between mb-0.5"><span>📥 Pelanggan Tunai:</span> <b>' + formatRp(totalTransfer) + '</b></div>' +
                //'<div class="flex justify-between mb-0.5"><span>📤 Uang diserahkan:</span> <b>' + formatRp(uangFisik) + '</b></div>' +
                //'<div class="flex justify-between"><span>💰 Fee Toko:</span> <b class="text-emerald-600">' + formatRp(fee) + '</b></div>';
        } else { // SPLIT
            hintEl.innerHTML = 
                '<div class="flex justify-between mb-0.5"><span>📥 QRIS:</span> <b>' + formatRp(uangFisik) + '</b></div>' +
                '<div class="flex justify-between mb-0.5"><span>📥 Tunai (Fee):</span> <b>' + formatRp(fee) + '</b></div>' +
                '<div class="flex justify-between border-t border-slate-200 pt-1 mt-1"><span>📤 Uang diserahkan:</span> <b>' + formatRp(uangFisik) + '</b></div>';
        }
        validateTarikBtn();
    }

    function updateTopupPreview() {
        var nominal = getAngkaBersih('ml-topup-nominal');
        var fee = hitungFeeTarikTunaiJS(nominal);
        var feeEl = document.getElementById('ml-topup-fee');
        if (feeEl) feeEl.innerText = formatRp(fee);

        // Hitung saldo Bank dari jurnal lokal
        var saldoBank =
		    (state._saldoByAccount && Number(state._saldoByAccount['115'])) ||
		    (Number(state.saldoRingkas.bank115) || 0);
		
        var bankEl = document.getElementById('ml-topup-bank');
        if (bankEl) {
            var warna = (nominal > saldoBank) ? 'text-red-600' : 'text-orange-600';
            bankEl.className = 'font-black ' + warna;
            bankEl.innerText = formatRp(nominal) + ' (Saldo: ' + formatRp(saldoBank) + ')';
        }
        validateTopupBtn();
    }

    function setQuickTopup(nominal) {
        document.getElementById('ml-topup-nominal').value = Number(nominal).toLocaleString('id-ID');
        updateTopupPreview();
    }

    function submitTopUpEwallet() {
        var namaEwallet = document.getElementById('ml-topup-ewallet').value;
        var nominal = getAngkaBersih('ml-topup-nominal');
        var namaPelanggan = (document.getElementById('ml-topup-pelanggan').value || '').trim();
        var noHPTujuan = String(document.getElementById('ml-topup-nohp').value || '').replace(/\D/g, '').trim();
        var atasNama = (document.getElementById('ml-topup-atasnama').value || '').trim();

        if (nominal < 10000) return Swal.fire('Nominal Kurang', 'Minimal Top Up Rp 10.000', 'warning');
        if (!namaPelanggan) return Swal.fire('Nama Wajib', 'Nama Pelanggan wajib diisi untuk audit trail top up.', 'warning');
        if (!noHPTujuan || noHPTujuan.length < 8) return Swal.fire('No HP Wajib', 'No. HP tujuan top up wajib diisi (minimal 8 digit).', 'warning');
        if (!atasNama) return Swal.fire('Atas Nama Wajib', 'Atas Nama pemilik e-wallet wajib diisi.', 'warning');

        var fee = hitungFeeTarikTunaiJS(nominal);
        var metodeBayar = document.getElementById('ml-topup-metode').value;
        var pelanggan = namaPelanggan;

        var totalDariPelanggan = nominal + fee;
        var rincian = '';
        if (metodeBayar === 'QRIS') rincian = 'Pelanggan QRIS <b>' + formatRp(totalDariPelanggan) + '</b>.';
        else if (metodeBayar === 'TUNAI') rincian = 'Pelanggan kasih tunai <b>' + formatRp(totalDariPelanggan) + '</b>.';
        else rincian = 'Pelanggan QRIS <b>' + formatRp(nominal) + '</b> + tunai fee <b>' + formatRp(fee) + '</b>.';

        Swal.fire({
            title: 'Konfirmasi Top Up',
            html:
                '<div class="text-left text-xs space-y-1.5">' +
                    '<div class="bg-indigo-50 p-2 rounded-lg border border-indigo-100">' +
                        '<div class="font-bold text-indigo-800">' + escapeHtml(namaEwallet) + ' → ' + escapeHtml(noHPTujuan) + '</div>' +
                        '<div class="text-indigo-600">a/n <b>' + escapeHtml(atasNama) + '</b></div>' +
                    '</div>' +
                    '<div class="flex justify-between"><span class="text-slate-500">Nominal:</span> <b>' + formatRp(nominal) + '</b></div>' +
                    '<div class="flex justify-between"><span class="text-slate-500">Fee Toko:</span> <b class="text-emerald-600">' + formatRp(fee) + '</b></div>' +
                    '<div class="flex justify-between border-t border-slate-100 pt-1"><span class="text-slate-500">Total dari Pelanggan:</span> <b>' + formatRp(totalDariPelanggan) + '</b></div>' +
                    '<div class="text-slate-400 text-[10px] pt-1">' + rincian + '</div>' +
                    '<div class="text-[10px] text-orange-600 font-bold pt-1">📱 Notifikasi WA akan dikirim ke admin.</div>' +
                '</div>',
            icon: 'question', showCancelButton: true,
            confirmButtonText: 'Ya, Proses', confirmButtonColor: '#6366f1', cancelButtonText: 'Batal'
        }).then(function(result) {
            if (!result.isConfirmed) return;
            var btn = document.getElementById('btn-submit-topup');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Memproses...';
            btn.disabled = true;

            var data = {
                namaEwallet: namaEwallet,
                nominal: nominal,
                metodeBayar: metodeBayar,
                pelanggan: pelanggan,
                noHP: noHPTujuan,
                atasNama: atasNama
            };

            google.script.run.withSuccessHandler(function(r) {
                btn.innerHTML = '<i class="fas fa-wallet mr-2"></i> Proses Top Up E-Wallet';
                btn.disabled = false;
                if (!handleApiResponse(r, "Gagal top up e-wallet: ")) return;

                state.layananDigital.unshift(r);
                closeModal('modal-layanan');
                Swal.fire({
                    icon: 'success',
                    title: 'Berhasil!',
                    html:
                        'Top Up <b>' + escapeHtml(namaEwallet) + '</b> ke <b>' + escapeHtml(noHPTujuan) + '</b><br>' +
                        'a/n <b>' + escapeHtml(atasNama) + '</b> sebesar <b>' + formatRp(nominal) + '</b><br>' +
                        'Fee: <b>' + formatRp(r.fee) + '</b><br><br>' +
                        '<span class="text-xs text-slate-500">' + escapeHtml(r.notifWA || 'Notif WA: -') + '</span>'
                });
                manualSync(true);
            }).withFailureHandler(function() {
                btn.innerHTML = '<i class="fas fa-wallet mr-2"></i> Proses Top Up E-Wallet';
                btn.disabled = false;
                Swal.fire('Koneksi Gagal', 'Tidak bisa terhubung ke server', 'error');
            }).saveTopUpEwallet(storageManager.get('pos_token_final'), data);
        });
    }

    function updateDigiPreview() {
        var jual = getAngkaBersih('ml-digi-jual');
        var modal = getAngkaBersih('ml-digi-modal');
        var fee = jual - modal;
        document.getElementById('ml-digi-fee').innerText = formatRp(fee);
        validateDigiBtn();
    }

    function submitTarikTunai() {
        var uangFisik = getAngkaBersih('ml-nominal');
        var namaPelanggan = (document.getElementById('ml-pelanggan').value || '').trim();
        
        if (uangFisik < 10000) return Swal.fire('Nominal Kurang', 'Minimal tarik tunai Rp 10.000', 'warning');
        if (!namaPelanggan) return Swal.fire('Nama Wajib', 'Nama Pelanggan wajib diisi untuk audit trail tarik tunai.', 'warning');

        var fee = hitungFeeTarikTunaiJS(uangFisik);
        var metodeBayar = document.getElementById('ml-metode-bayar').value;
        var pelanggan = namaPelanggan;

        var totalDariPelanggan = uangFisik + fee;
        var rincian = '';
        if (metodeBayar === 'QRIS') rincian = 'Pelanggan QRIS <b>' + formatRp(totalDariPelanggan) + '</b>.';
        else if (metodeBayar === 'TUNAI') rincian = 'Pelanggan kasih tunai <b>' + formatRp(totalDariPelanggan) + '</b>.';
        else rincian = 'Pelanggan QRIS <b>' + formatRp(uangFisik) + '</b> + tunai fee <b>' + formatRp(fee) + '</b>.';

        Swal.fire({
            title: 'Konfirmasi Tarik Tunai',
            html: 'Uang fisik diserahkan: <b>' + formatRp(uangFisik) + '</b><br>' +
                  'Fee toko: <b class="text-emerald-600">' + formatRp(fee) + '</b><br>' +
                  '<div class="text-xs text-slate-500 mt-2">' + rincian + '</div>',
            icon: 'question', showCancelButton: true,
            confirmButtonText: 'Ya, Proses', confirmButtonColor: '#8b5cf6', cancelButtonText: 'Batal'
        }).then(function(result) {
            if (!result.isConfirmed) return;
            var btn = document.getElementById('btn-submit-tarik');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Memproses...';
            btn.disabled = true;

            var data = {
                nominal: uangFisik,   // kirim uang fisik ke backend (backend akan hitung totalTransfer)
                metodeBayar: metodeBayar,
                pelanggan: pelanggan
            };

            google.script.run.withSuccessHandler(function(r) {
                btn.innerHTML = '<i class="fas fa-hand-holding-usd mr-2"></i> Proses Tarik Tunai';
                btn.disabled = false;
                if (!handleApiResponse(r, "Gagal proses tarik tunai: ")) return;

                state.layananDigital.unshift(r);
                closeModal('modal-layanan');
                Swal.fire('Berhasil!', 'Tarik tunai ' + formatRp(uangFisik) + ' berhasil.<br>Fee: ' + formatRp(r.fee), 'success');
                manualSync(true);
            }).withFailureHandler(function() {
                btn.innerHTML = '<i class="fas fa-hand-holding-usd mr-2"></i> Proses Tarik Tunai';
                btn.disabled = false;
                Swal.fire('Koneksi Gagal', 'Tidak bisa terhubung ke server', 'error');
            }).saveTarikTunai(storageManager.get('pos_token_final'), data);
        });
    }

    function submitProdukDigital() {
        var nama = document.getElementById('ml-digi-nama').value.trim();
        var modal = getAngkaBersih('ml-digi-modal');
        var jual = getAngkaBersih('ml-digi-jual');
        var metode = document.getElementById('ml-digi-metode').value;
        var namaPelanggan = (document.getElementById('ml-digi-pelanggan').value || '').trim();

        if (!nama) return Swal.fire('Data Kurang', 'Nama produk wajib diisi', 'warning');
        if (modal <= 0) return Swal.fire('Data Kurang', 'Harga modal wajib diisi', 'warning');
        if (jual <= 0) return Swal.fire('Data Kurang', 'Harga jual wajib diisi', 'warning');
        if (jual < modal) return Swal.fire('Harga Salah', 'Harga jual tidak boleh di bawah modal', 'warning');
        if (!namaPelanggan) return Swal.fire('Nama Wajib', 'Nama Pelanggan wajib diisi untuk audit trail produk digital.', 'warning');
        
        var pelanggan = namaPelanggan;

        var btn = document.getElementById('btn-submit-digi');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Memproses...';
        btn.disabled = true;

        var data = { nama: nama, hargaModal: modal, hargaJual: jual, metode: metode, pelanggan: pelanggan };

        google.script.run.withSuccessHandler(function(r) {
          btn.innerHTML = '<i class="fas fa-mobile-alt mr-2"></i> Proses Produk Digital';
          btn.disabled = false;
          if (!handleApiResponse(r, "Gagal proses produk digital: ")) return;

          state.layananDigital.unshift(r);
          closeModal('modal-layanan');
          Swal.fire('Berhasil!', nama + ' terjual.<br>Margin: ' + formatRp(r.fee), 'success');
          manualSync(true);
      }).withFailureHandler(function() {
          btn.innerHTML = '<i class="fas fa-mobile-alt mr-2"></i> Proses Produk Digital';
          btn.disabled = false;
          Swal.fire('Koneksi Gagal', 'Tidak bisa terhubung ke server', 'error');
      }).saveProdukDigital(storageManager.get('pos_token_final'), data);
    }

    function openGoPayPanel() {
        if(state.user.role !== 'Admin') return showToast('Hanya Admin', 'error');
        var token = storageManager.get('pos_token_final');
        document.getElementById('gp-saldo-bank').innerText = 'Memuat...';
        document.getElementById('gp-saldo-transit').innerText = 'Memuat...';
        document.getElementById('gp-saldo-deposit').innerText = 'Memuat...';
        document.getElementById('gp-settle-nominal').value = '';
        document.getElementById('gp-topup-nominal').value = '';
        openModal('modal-gopay');

        google.script.run.withSuccessHandler(function(r) {
            if (r.success) {
                document.getElementById('gp-saldo-bank').innerText = formatRp(r.bank);
                document.getElementById('gp-saldo-transit').innerText = formatRp(r.transit);
                document.getElementById('gp-saldo-deposit').innerText = formatRp(r.deposit);
            } else {
                Swal.fire('Gagal', r.error, 'error');
            }
        }).getSaldoGoPay(token);
    }

    function submitSettlement() {
        var nominal = getAngkaBersih('gp-settle-nominal');
        if (nominal <= 0) return Swal.fire('Nominal Invalid', 'Isi nominal settlement', 'warning');

        Swal.fire({
            title: 'Konfirmasi Settlement',
            html: 'Saldo Piutang GoPay (116) akan berkurang <b>' + formatRp(nominal) + '</b><br>dan Bank (115) bertambah <b>' + formatRp(nominal) + '</b>.',
            icon: 'question', showCancelButton: true,
            confirmButtonText: 'Ya, Proses', confirmButtonColor: '#f97316'
        }).then((result) => {
            if (!result.isConfirmed) return;
            Swal.fire({title: 'Memproses...', allowOutsideClick: false, didOpen: () => {Swal.showLoading()}});
            google.script.run.withSuccessHandler(function(r) {
                if (r.success) {
                    Swal.fire('Berhasil', 'Settlement tercatat', 'success');
                    openGoPayPanel();
                    manualSync(true);
                } else Swal.fire('Gagal', r.error, 'error');
            }).rekonsiliasiSettlementGoPay(storageManager.get('pos_token_final'), nominal);
        });
    }

    function submitTopUp() {
        var nominal = getAngkaBersih('gp-topup-nominal');
        if (nominal <= 0) return Swal.fire('Nominal Invalid', 'Isi nominal top up', 'warning');

        Swal.fire({
            title: 'Konfirmasi Top Up Deposit',
            html: 'Bank (115) akan berkurang <b>' + formatRp(nominal) + '</b><br>dan Deposit GoPay (117) bertambah <b>' + formatRp(nominal) + '</b>.',
            icon: 'question', showCancelButton: true,
            confirmButtonText: 'Ya, Proses', confirmButtonColor: '#10b981'
        }).then((result) => {
            if (!result.isConfirmed) return;
            Swal.fire({title: 'Memproses...', allowOutsideClick: false, didOpen: () => {Swal.showLoading()}});
            google.script.run.withSuccessHandler(function(r) {
                if (r.success) {
                    Swal.fire('Berhasil', 'Top up deposit tercatat', 'success');
                    openGoPayPanel();
                    manualSync(true);
                } else Swal.fire('Gagal', r.error, 'error');
            }).topUpDepositGoPay(storageManager.get('pos_token_final'), nominal);
        });
    }

    function renderLayanan() {
        var startEl = document.getElementById('lay-start');
        var endEl = document.getElementById('lay-end');
        if (!startEl || !endEl) return;

        var now = new Date();
        var startInput = startEl.value;
        var endInput = endEl.value;
        if (!startInput || !endInput) {
            var firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            // [PATCH v7.19.2] Pakai LOCAL date, bukan UTC
            startInput = toLocalDateStr(firstDay);
            endInput = toLocalDateStr(now);
            startEl.value = startInput;
            endEl.value = endInput;
        }
        // [FIX #11] Konsisten pakai parseLocalDate
        var startTime = parseLocalDate(startInput).setHours(0,0,0,0);
        var endTime   = parseLocalDate(endInput).setHours(23,59,59,999);

        var data = (state.layananDigital || []).filter(function(l) {
            return l.tanggal >= startTime && l.tanggal <= endTime;
        }).sort(function(a,b) { return b.tanggal - a.tanggal; });

        var totalTarik = 0, totalDigi = 0, totalTopup = 0, totalFee = 0, totalNominal = 0, totalModal = 0;

        var html = '';
        for (var i = 0; i < data.length; i++) {
            var l = data[i];
            var dt = new Date(l.tanggal).toLocaleDateString('id-ID', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
            // Ganti blok jenisBadge:
            var jenisBadge;
            if (l.jenis === 'TARIK_TUNAI') {
                jenisBadge = '<span class="text-purple-700 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded text-[10px] font-black">TARIK TUNAI</span>';
            } else if (l.jenis === 'TOPUP_EWALLET') {
                jenisBadge = '<span class="text-indigo-700 bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded text-[10px] font-black">TOP UP E-WALLET</span>';
            } else {
                jenisBadge = '<span class="text-cyan-700 bg-cyan-100 border border-cyan-200 px-2 py-0.5 rounded text-[10px] font-black">PRODUK DIGITAL</span>';
            }

            // Ganti blok metodeBadge:
            var metodeUp = String(l.metode).toUpperCase();
            var metodeBadge;
            if (metodeUp === 'QRIS') {
                metodeBadge = '<span class="text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-100">QRIS</span>';
            } else if (metodeUp === 'TUNAI') {
                metodeBadge = '<span class="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-100">TUNAI</span>';
            } else {
                metodeBadge = '<span class="text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-bold border border-amber-100">SPLIT</span>';
            }

            if (l.jenis === 'TARIK_TUNAI') totalTarik += l.nominal;
            else if (l.jenis === 'TOPUP_EWALLET') totalTopup += l.nominal;
            else totalDigi += l.nominal;
            totalFee += l.fee;
            totalNominal += l.nominal;
            totalModal += l.modal;

            html += '<tr class="hover:bg-slate-50 transition-colors">' +
                '<td class="p-3 whitespace-nowrap text-slate-500">' + dt + '</td>' +
                '<td class="p-3 font-mono text-[10px] text-slate-400">' + escapeHtml(l.id) + '</td>' +
                '<td class="p-3 font-bold">' + escapeHtml(l.kasir) + '</td>' +
                '<td class="p-3">' + jenisBadge + '</td>' +
                '<td class="p-3 truncate max-w-[200px]">' + escapeHtml(l.keterangan) + '</td>' +
                '<td class="p-3 text-right font-black text-slate-700">' + formatRp(l.nominal) + '</td>' +
                '<td class="p-3 text-right font-bold text-orange-600">' + (l.modal > 0 ? formatRp(l.modal) : '-') + '</td>' +
                '<td class="p-3 text-right font-black text-emerald-700">' + formatRp(l.fee) + '</td>' +
                '<td class="p-3 text-center">' + metodeBadge + '</td>' +
                '<td class="p-3 text-center no-print whitespace-nowrap">' +
                    '<button onclick="openLayananDetail(\'' + safeJsArg(l.id) + '\')" class="bg-blue-50 text-blue-600 px-2.5 py-1.5 rounded-md text-[10px] font-bold hover:bg-blue-100 transition-all shadow-sm active:scale-95" title="Detail">' +
                '<i class="fas fa-eye"></i>' +
              '</button>' +
              (state.user.role === 'Admin' ? 
                '<button onclick="processReturLayanan(\'' + safeJsArg(l.id) + '\', \'' + safeJsArg(l.jenis) + '\', ' + Number(l.nominal || 0) + ')" class="ml-1.5 bg-red-50 text-red-600 px-2.5 py-1.5 rounded-md text-[10px] font-bold hover:bg-red-100 transition-all shadow-sm active:scale-95" title="Retur">' +
                    '<i class="fas fa-undo"></i>' +
                '</button>' 
                : ''
              ) +
                '</td>' +
                '</tr>';
        }

        var tbody = document.getElementById('lay-tbody');
        if (tbody) tbody.innerHTML = html || '<tr><td colspan="10" class="text-center p-8 text-slate-400 font-bold">Tidak ada transaksi layanan pada periode ini.</td></tr>';

        document.getElementById('lay-total-tarik').innerText = formatRp(totalTarik);
        document.getElementById('lay-total-digi').innerText = formatRp(totalDigi);
        document.getElementById('lay-total-topup').innerText = formatRp(totalTopup);
        document.getElementById('lay-total-fee').innerText = formatRp(totalFee);
        document.getElementById('lay-count').innerText = data.length + 'x';

        document.getElementById('lay-foot-nominal').innerText = formatRp(totalNominal);
        document.getElementById('lay-foot-modal').innerText = formatRp(totalModal);
        document.getElementById('lay-foot-fee').innerText = formatRp(totalFee);

        var tokoEl = document.getElementById('ui-lay-toko');
        if (tokoEl) tokoEl.innerText = (state.setup['Nama Toko'] || 'POS Pro').toUpperCase();
        var perEl = document.getElementById('lay-periode-text');
        if (perEl) {
            var formatOpts = { day: '2-digit', month: 'short', year: 'numeric' };
            perEl.innerText = 'Periode: ' + new Date(startTime).toLocaleDateString('id-ID', formatOpts) + ' s/d ' + new Date(endTime).toLocaleDateString('id-ID', formatOpts);
        }
    }

    function renderLayananView() {
        if (!state || !state.layananDigital) return;
        
        var now = new Date();
        var startInput = document.getElementById('lay-view-start');
        var endInput = document.getElementById('lay-view-end');
        
        // Set default tanggal ke HARI INI jika masih kosong
        // [PATCH v7.19.2] Pakai LOCAL date, bukan UTC
        if (startInput && !startInput.value) {
            startInput.value = toLocalDateStr(now);
        }
        if (endInput && !endInput.value) {
            endInput.value = toLocalDateStr(now);
        }

        var startTime = parseLocalDate(startInput.value).setHours(0, 0, 0, 0);
        var endTime   = parseLocalDate(endInput.value).setHours(23, 59, 59, 999);
        
        // Ambil Kata Kunci Pencarian
        var searchInput = document.getElementById('lay-view-search');
        var query = searchInput ? searchInput.value.toLowerCase().trim() : '';

        // Filter Data: Berdasarkan Rentang Tanggal & Pencarian
        var filteredData = state.layananDigital.filter(function(l) {
            var isInDateRange = l.tanggal >= startTime && l.tanggal <= endTime;
            if (!isInDateRange) return false;
            
            if (query) {
                var matchId = String(l.id).toLowerCase().includes(query);
                var matchKet = String(l.keterangan).toLowerCase().includes(query);
                var matchJenis = String(l.jenis).toLowerCase().includes(query);
                return matchId || matchKet || matchJenis;
            }
            return true;
        });

        // Hitung Statistik (Berdasarkan data yang terfilter)
        var totalTarik = 0, totalDigi = 0, totalTopup = 0, totalFee = 0;
        filteredData.forEach(function(l) {
            var jenis = String(l.jenis);
            if (jenis === 'TARIK_TUNAI') totalTarik += Number(l.nominal) || 0;
            else if (jenis === 'TOPUP_EWALLET') totalTopup += Number(l.nominal) || 0;
            else totalDigi += Number(l.nominal) || 0;
            totalFee += Number(l.fee) || 0;
        });

        // Update Widget Ringkasan
        var el;
        if ((el = document.getElementById('lay-view-total-tarik'))) el.innerText = formatRp(totalTarik);
        if ((el = document.getElementById('lay-view-total-topup'))) el.innerText = formatRp(totalTopup);
        if ((el = document.getElementById('lay-view-total-digi')))  el.innerText = formatRp(totalDigi);
        if ((el = document.getElementById('lay-view-total-fee')))   el.innerText = formatRp(totalFee);
        if ((el = document.getElementById('lay-view-count')))       el.innerText = filteredData.length + 'x';

        // Render Tabel
        var tbody = document.getElementById('lay-view-tbody');
        if (!tbody) return;

        // Urutkan dari yang terbaru, batasi maksimal 50 baris agar tidak terlalu berat
        var sorted = filteredData.slice().sort(function(a, b) { return b.tanggal - a.tanggal; }).slice(0, 50);
        var html = '';
        
        for (var i = 0; i < sorted.length; i++) {
            var l = sorted[i];
            var dateObj = new Date(l.tanggal);
            
            // Pisahkan format Tanggal dan Waktu
            var tglStr = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
            var waktuStr = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            
            var jenis = String(l.jenis);
            var jenisBadge = '';
            if (jenis === 'TARIK_TUNAI') {
                jenisBadge = '<span class="text-purple-700 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded text-[9px] font-black">TARIK TUNAI</span>';
            } else if (jenis === 'TOPUP_EWALLET') {
                jenisBadge = '<span class="text-indigo-700 bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded text-[9px] font-black">TOP UP</span>';
            } else {
                jenisBadge = '<span class="text-cyan-700 bg-cyan-100 border border-cyan-200 px-2 py-0.5 rounded text-[9px] font-black">DIGITAL</span>';
            }

            html += '<tr class="hover:bg-slate-50 cursor-pointer transition-colors" onclick="openLayananDetail(\'' + safeJsArg(l.id) + '\')">' +
                '<td class="p-3 text-[10px] text-slate-500 font-bold whitespace-nowrap">' + tglStr + '</td>' +
                '<td class="p-3 text-[10px] text-slate-500 font-bold whitespace-nowrap">' + waktuStr + '</td>' +
                '<td class="p-3 text-[10px] font-mono text-slate-400">' + escapeHtml(l.id) + '</td>' +
                '<td class="p-3">' + jenisBadge + '</td>' +
                '<td class="p-3 text-xs text-slate-600 truncate max-w-[150px]">' + escapeHtml(l.keterangan) + '</td>' +
                '<td class="p-3 text-right font-black text-slate-700 text-xs">' + formatRp(l.nominal) + '</td>' +
                '<td class="p-3 text-right font-black text-emerald-700 text-xs">' + formatRp(l.fee) + '</td>' +
            '</tr>';
        }
        
        // [FIX] Cek apakah data terpotong
        var totalCount = filteredData.length;
        var displayCount = sorted.length;
        var truncated = totalCount > displayCount;

        var footerHtml = '';
        if (truncated) {
            footerHtml = '<tr><td colspan="7" class="text-center py-3 bg-amber-50 border-t border-amber-200 text-amber-700 font-bold text-[10px]">' +
                        '<i class="fas fa-info-circle mr-1"></i>' +
                        'Menampilkan <b>' + displayCount + '</b> dari <b>' + totalCount + '</b> transaksi. ' +
                        'Gunakan filter tanggal untuk mempersempit.' +
                        '</td></tr>';
        }

        tbody.innerHTML = (html || '<tr><td colspan="7" class="text-center py-8 text-slate-400 font-bold text-xs"><i class="fas fa-inbox text-2xl mb-2 block text-slate-300"></i>Tidak ada transaksi pada periode ini</td></tr>') + footerHtml;
    }

    // [NEW] Buka modal detail layanan digital
    function openLayananDetail(idLayanan) {
        Swal.fire({ title: 'Memuat detail...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
        
        google.script.run.withSuccessHandler(function(res) {
            Swal.close();
            if (!res.success) return Swal.fire('Gagal', res.error, 'error');
            
            var l = res.data;
            var dt = new Date(l.tanggal).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
            
            // Ganti blok jenisBadge:
            var jenisBadge;
            if (l.jenis === 'TARIK_TUNAI') {
                jenisBadge = '<span class="text-purple-700 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded text-[10px] font-black">TARIK TUNAI</span>';
            } else if (l.jenis === 'TOPUP_EWALLET') {
                jenisBadge = '<span class="text-indigo-700 bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded text-[10px] font-black">TOP UP E-WALLET</span>';
            } else {
                jenisBadge = '<span class="text-cyan-700 bg-cyan-100 border border-cyan-200 px-2 py-0.5 rounded text-[10px] font-black">PRODUK DIGITAL</span>';
            }
            
            // Ganti blok metodeBadge:
            var metodeUp = String(l.metode).toUpperCase();
            var metodeBadge;
            if (metodeUp === 'QRIS') {
                metodeBadge = '<span class="text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-100">QRIS</span>';
            } else if (metodeUp === 'TUNAI') {
                metodeBadge = '<span class="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-100">TUNAI</span>';
            } else {
                metodeBadge = '<span class="text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-bold border border-amber-100">SPLIT</span>';
            }
            
            // Hitung uang fisik yang diserahkan (untuk tarik tunai)
            var uangFisikHtml = '';
            if (l.jenis === 'TARIK_TUNAI') {
                uangFisikHtml = '<div class="flex justify-between text-xs font-bold text-slate-600 pt-2 border-t border-slate-100"><span>Uang Fisik Diserahkan</span><span class="text-purple-700">' + formatRp(l.nominal - l.fee) + '</span></div>';
            }
            if (l.jenis === 'TOPUP_EWALLET') {
                uangFisikHtml = '<div class="flex justify-between text-xs font-bold text-slate-600 pt-2 border-t border-slate-100"><span>Sumber Dana</span><span class="text-indigo-700">Bank (115) → E-Wallet Customer</span></div>';
            }
            
            // Jurnal terkait
            var jurnalHtml = '';
            if (l.jurnal && l.jurnal.length > 0) {
                jurnalHtml = '<div class="mt-3 pt-3 border-t border-slate-200"><p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Jurnal Terkait</p><table class="w-full text-[10px]"><thead><tr class="text-slate-400 border-b border-slate-100"><th class="text-left py-1 font-bold">Akun</th><th class="text-right py-1 font-bold">Debit</th><th class="text-right py-1 font-bold">Kredit</th></tr></thead><tbody>';
                for (var j = 0; j < l.jurnal.length; j++) {
                    var jr = l.jurnal[j];
                    jurnalHtml += '<tr class="border-b border-slate-50"><td class="py-1 text-slate-600">' + escapeHtml(jr.kodeAkun) + ' - ' + escapeHtml(jr.namaAkun) + '</td>' +
                        '<td class="py-1 text-right font-bold text-slate-700">' + (jr.debit > 0 ? formatRp(jr.debit) : '-') + '</td>' +
                        '<td class="py-1 text-right font-bold text-slate-700">' + (jr.kredit > 0 ? formatRp(jr.kredit) : '-') + '</td></tr>';
                }
                jurnalHtml += '</tbody></table></div>';
            }
            
            var html = '' +
                '<div class="flex justify-between items-center border-b border-slate-100 pb-3"><span class="text-xs font-bold text-slate-500">Jenis</span>' + jenisBadge + '</div>' +
                '<div class="flex justify-between items-center border-b border-slate-100 pb-2"><span class="text-xs font-bold text-slate-500">ID</span><span class="font-mono text-[11px] font-bold text-slate-700">' + escapeHtml(l.id) + '</span></div>' +
                '<div class="flex justify-between items-center border-b border-slate-100 pb-2"><span class="text-xs font-bold text-slate-500">Tanggal</span><span class="text-xs font-bold text-slate-700">' + dt + '</span></div>' +
                '<div class="flex justify-between items-center border-b border-slate-100 pb-2"><span class="text-xs font-bold text-slate-500">Kasir</span><span class="text-xs font-bold text-slate-700">' + escapeHtml(l.kasir) + '</span></div>' +
                '<div class="flex justify-between items-center border-b border-slate-100 pb-2"><span class="text-xs font-bold text-slate-500">Metode</span>' + metodeBadge + '</div>' +
                '<div class="bg-slate-50 p-3 rounded-xl border border-slate-100 mt-3">' +
                    '<p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Keterangan</p>' +
                    '<p class="text-xs text-slate-700 font-medium">' + escapeHtml(l.keterangan) + '</p>' +
                '</div>' +
                '<div class="bg-blue-50 p-3 rounded-xl border border-blue-100 mt-2 space-y-1.5">' +
                    '<div class="flex justify-between text-xs font-bold text-slate-600"><span>Nominal</span><span class="text-blue-700">' + formatRp(l.nominal) + '</span></div>' +
                    (l.modal > 0 ? '<div class="flex justify-between text-xs font-bold text-slate-600"><span>Modal</span><span class="text-orange-600">' + formatRp(l.modal) + '</span></div>' : '') +
                    '<div class="flex justify-between text-xs font-bold text-slate-600 border-t border-blue-200 pt-1.5"><span>Fee / Margin</span><span class="text-emerald-700">' + formatRp(l.fee) + '</span></div>' +
                    uangFisikHtml +
                '</div>' +
                jurnalHtml;
            
            document.getElementById('layanan-detail-content').innerHTML = html;
            openModal('modal-layanan-detail');
        }).withFailureHandler(function(err) {
            Swal.close();
            Swal.fire('Koneksi Gagal', 'Tidak bisa terhubung ke server: ' + (err && err.message ? err.message : 'unknown'), 'error');
        }).getLayananDetail(storageManager.get('pos_token_final'), idLayanan);
    }

    // [NEW] Retur / batalkan transaksi layanan digital
    function processReturLayanan(idLayanan, jenis, nominal) {
        if (state.user.role !== 'Admin') return showToast('Hanya Admin!', 'error');
        
        var jenisLabel = jenis === 'TARIK_TUNAI' ? 'Tarik Tunai' : 'Produk Digital';
        
        Swal.fire({
            title: 'Retur ' + jenisLabel + '?',
            html: 'Transaksi <b>' + idLayanan + '</b> senilai <b>' + formatRp(nominal) + '</b> akan dibatalkan.<br><br>' +
                  '<span class="text-xs text-slate-500">Jurnal reversal akan dicatat (audit trail terjaga) dan data akan dihapus dari laporan.</span>',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#94a3b8',
            confirmButtonText: '<i class="fas fa-undo"></i> Ya, Retur!',
            cancelButtonText: 'Batal'
        }).then(function(result) {
            if (!result.isConfirmed) return;
            Swal.fire({ title: 'Memproses...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });
            
            google.script.run.withSuccessHandler(function(res) {
                if (res.success) {
                    // Hapus dari state lokal
                    state.layananDigital = state.layananDigital.filter(function(x) { return String(x.id) !== String(idLayanan); });
                    renderLayanan();
                    manualSync(true); // Sync ulang untuk pastikan jurnal & saldo ter-update
                    Swal.fire('Berhasil!', 'Transaksi layanan berhasil diretur.', 'success');
                } else {
                    Swal.fire('Gagal Retur', res.error, 'error');
                }
            }).withFailureHandler(function(err) {
                Swal.fire('Koneksi Gagal', 'Tidak bisa terhubung ke server: ' + (err && err.message ? err.message : 'unknown'), 'error');
            }).processReturnLayanan(storageManager.get('pos_token_final'), idLayanan);
        });
    }

    function togglePassword(inputId, iconId) {
        var input = document.getElementById(inputId);
        var icon = document.getElementById(iconId);
        if (!input || !icon) return;
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    }

    function updateOfflineBadge() {
        var btn = document.getElementById('btn-offline-queue');
        var cnt = document.getElementById('offline-count');
        if (!btn || !cnt) return;
        var n = (state.offlineQueue && state.offlineQueue.length) || 0;
        if (n > 0) {
            btn.classList.remove('hidden');
            cnt.innerText = n;
            // Flash animasi
            btn.classList.add('animate-pulse');
        } else {
            btn.classList.add('hidden');
            btn.classList.remove('animate-pulse');
        }
    }

    // Panggil setiap kali queue berubah
    // (Tambahkan di processTransaction catch-block saat push ke queue)
    
    // [SARAN #1] Toggle Overflow Menu Mobile
    function toggleOverflowMenu() {
        var menu = document.getElementById('overflow-menu-panel');
        var backdrop = document.getElementById('overflow-backdrop');
        if (!menu) return;
        
        if (menu.classList.contains('hidden')) {
            menu.classList.remove('hidden');
            menu.style.animation = 'fadeSlide 0.15s ease-out';
            if (backdrop) backdrop.classList.remove('hidden');
        } else {
            menu.classList.add('hidden');
            if (backdrop) backdrop.classList.add('hidden');
        }
    }

    // Auto-close saat klik di luar menu
    document.addEventListener('click', function(e) {
        var menu = document.getElementById('overflow-menu-panel');
        var btn = document.getElementById('btn-overflow-menu');
        if (!menu || !btn) return;
        if (menu.classList.contains('hidden')) return;
        if (!e.target.closest('#overflow-menu-panel') && !e.target.closest('#btn-overflow-menu')) {
            menu.classList.add('hidden');
            var bd = document.getElementById('overflow-backdrop');
            if (bd) bd.classList.add('hidden');
        }
    });
    
    function collectNotifications() {
        var notifs = [];

        // 1. Stok HABIS
        var stok0 = state.products.filter(function(p) { return p.stok === 0; });
        if (stok0.length > 0) {
            notifs.push({
                id: 'stok0-' + stok0.length,
                level: 'danger',
                icon: 'fa-exclamation-triangle',
                title: stok0.length + ' Produk Stok HABIS',
                desc: stok0.slice(0, 3).map(function(p) { return p.nama; }).join(', ') + (stok0.length > 3 ? '...' : ''),
                action: function() { switchView('inventory'); },   // ← function
                actionLabel: 'Cek Stok'
            });
        }

        // 2. Stok tipis
        var stokTipis = state.products.filter(function(p) { return p.stok > 0 && p.stok <= 5; });
        if (stokTipis.length > 0 && stok0.length === 0) {
            notifs.push({
                id: 'stoktipis-' + stokTipis.length,
                level: 'warning',
                icon: 'fa-boxes',
                title: stokTipis.length + ' Produk Stok Tipis',
                desc: 'Segera restock agar tidak kehabisan',
                action: function() { switchView('inventory'); },
                actionLabel: 'Lihat'
            });
        }

        // 3. Kasbon Aktif
        var kasbons = state.transactions.filter(function(t) { 
            return String(t.status || '').trim().toUpperCase() === 'HUTANG'; 
        });
        var totalKasbon = kasbons.reduce(function(s, t) { return s + (t.total - (t.bayar || 0)); }, 0);
        if (kasbons.length > 0) {
            notifs.push({
                id: 'kasbon-' + kasbons.length,
                level: 'warning',
                icon: 'fa-hand-holding-usd',
                title: kasbons.length + ' Kasbon Belum Lunas',
                desc: 'Total tagihan: ' + formatRp(totalKasbon),
                action: function() {
                    switchView('reports');
                    setTimeout(function() { switchRepTab('piutang'); }, 150);
                },
                actionLabel: 'Tagih'
            });
        }

        // 4. Pesanan Online pending
        if (state.onlineOrders && state.onlineOrders.length > 0) {
            notifs.push({
                id: 'online-' + state.onlineOrders.length,
                level: 'info',
                icon: 'fa-motorcycle',
                title: state.onlineOrders.length + ' Pesanan Online Baru',
                desc: 'Menunggu diproses kasir',
                action: function() { openOnlineOrdersModal(); },
                actionLabel: 'Buka'
            });
        }

        // 5. Piutang GoPay belum di-settle
        var transit =
    		(state._saldoByAccount && Number(state._saldoByAccount['116'])) || 0;
		
        if (transit >= 500000) {
            notifs.push({
                id: 'transit',
                level: 'info',
                icon: 'fa-hourglass-half',
                title: 'Piutang GoPay: ' + formatRp(transit),
                desc: 'Dana QRIS belum di-settle ke bank',
                action: function() {
                    if (state.user.role === 'Admin') openGoPayPanel();
                    else showToast('Hubungi Admin', 'error');
                },
                actionLabel: 'Settle'
            });
        }

        // 6. Shift belum buka
        if (!state.currentShift) {
            notifs.push({
                id: 'shift-closed',
                level: 'danger',
                icon: 'fa-store-slash',
                title: 'Shift Kasir Belum Dibuka',
                desc: 'Kasir tidak dapat memproses transaksi',
                action: function() { openModal('modal-shift-open'); },
                actionLabel: 'Buka Shift'
            });
        }

        // 7. Offline queue
        if (state.offlineQueue && state.offlineQueue.length > 0) {
            notifs.push({
                id: 'offline-' + state.offlineQueue.length,
                level: 'warning',
                icon: 'fa-cloud-upload-alt',
                title: state.offlineQueue.length + ' Transaksi Offline',
                desc: 'Menunggu sinkronisasi ke server',
                action: function() { flushOfflineQueue(); },
                actionLabel: 'Sync'
            });
        }

        var priority = { danger: 0, warning: 1, info: 2, success: 3 };
        notifs.sort(function(a, b) { return priority[a.level] - priority[b.level]; });

        return notifs;
    }

    function renderNotificationCenter(silent) {
        var notifs = collectNotifications();
        var list = document.getElementById('notif-list');
        var badge = document.getElementById('notif-badge');
        var countEl = document.getElementById('notif-count');
        var totalEl = document.getElementById('notif-total');
        if (!list) return;

        var unread = notifs.filter(function(n) { return _lastNotifIds.indexOf(n.id) === -1; });

        // Badge di topbar
        if (notifs.length > 0) {
            badge.classList.remove('hidden');
            countEl.innerText = unread.length > 0 ? unread.length : notifs.length;
            countEl.className = unread.length > 0
                ? 'relative inline-flex items-center justify-center rounded-full h-4 min-w-[16px] px-1 bg-red-500 text-[10px] text-white font-bold border border-white'
                : 'relative inline-flex items-center justify-center rounded-full h-4 min-w-[16px] px-1 bg-slate-400 text-[10px] text-white font-bold border border-white';

            // [FIX] Bell shake HANYA jika ada notif baru yang belum pernah dilihat
            if (!silent && unread.length > 0 && window._lastNotifCount !== unread.length) {
                var icon = document.getElementById('notif-bell-icon');
                if (icon) {
                    icon.classList.remove('animate-bell');
                    void icon.offsetWidth;
                    icon.classList.add('animate-bell');
                    setTimeout(function() { icon.classList.remove('animate-bell'); }, 800);
                }
            }
            window._lastNotifCount = unread.length;
            totalEl.innerText = notifs.length;
        } else {
            badge.classList.add('hidden');
            totalEl.innerText = '0';
            window._lastNotifCount = 0;
        }

        // List body
        if (notifs.length === 0) {
            list.innerHTML = '<div class="text-center py-12 text-slate-400"><i class="fas fa-check-circle text-4xl mb-3 text-emerald-300"></i><p class="font-bold text-xs">Semua aman! Tidak ada notifikasi.</p></div>';
            return;
        }

        var colorMap = {
            danger:  { bg: 'bg-red-50',     border: 'border-red-100',     text: 'text-red-700',     icon: 'text-red-500',     dot: 'bg-red-500' },
            warning: { bg: 'bg-amber-50',   border: 'border-amber-100',   text: 'text-amber-700',   icon: 'text-amber-500',   dot: 'bg-amber-500' },
            info:    { bg: 'bg-blue-50',    border: 'border-blue-100',    text: 'text-blue-700',    icon: 'text-blue-500',    dot: 'bg-blue-500' },
            success: { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700', icon: 'text-emerald-500', dot: 'bg-emerald-500' }
        };

        var html = '';
        for (var k = 0; k < notifs.length; k++) {
            var n = notifs[k];
            var c = colorMap[n.level] || colorMap.info;
            var isUnread = _lastNotifIds.indexOf(n.id) === -1;

            html +=
                '<div class="p-3 rounded-xl ' + c.bg + ' ' + c.border + ' border hover:shadow-sm transition-all group cursor-pointer" ' +
                    'data-notif-idx="' + k + '">' +
                    '<div class="flex items-start gap-3">' +
                        '<div class="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0 shadow-sm">' +
                            '<i class="fas ' + n.icon + ' ' + c.icon + '"></i>' +
                        '</div>' +
                        '<div class="flex-1 min-w-0">' +
                            '<div class="flex items-center gap-2 mb-0.5">' +
                                (isUnread ? '<span class="w-1.5 h-1.5 rounded-full ' + c.dot + ' animate-pulse shrink-0"></span>' : '') +
                                '<p class="font-black text-xs ' + c.text + ' truncate">' + escapeHtml(n.title) + '</p>' +
                            '</div>' +
                            '<p class="text-[10px] text-slate-500 font-medium leading-snug">' + escapeHtml(n.desc) + '</p>' +
                        '</div>' +
                        '<i class="fas fa-chevron-right text-slate-300 text-xs group-hover:text-slate-500 transition-colors mt-3"></i>' +
                    '</div>' +
                '</div>';
        }

        list.innerHTML = html;
    }
    // [NEW] Event delegation untuk notif list — lebih aman, tidak pakai string onclick
    document.addEventListener('click', function(e) {
        var card = e.target.closest('[data-notif-idx]');
        if (!card) return;
        var idx = parseInt(card.getAttribute('data-notif-idx'), 10);
        if (isNaN(idx)) return;

        var notifs = collectNotifications();
        var n = notifs[idx];
        if (!n || typeof n.action !== 'function') return;

        closeNotificationCenter();
        setTimeout(function() {
            try { n.action(); } catch (err) { console.error('Notif exec error:', err); }
        }, 150);
    });

    function toggleNotificationCenter() {
        var panel = document.getElementById('notif-panel');
        if (!panel) return;
        if (panel.classList.contains('hidden')) {
            renderNotificationCenter();
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    }

    function closeNotificationCenter() {
        var panel = document.getElementById('notif-panel');
        if (panel) panel.classList.add('hidden');
    }

    function markAllNotificationsRead() {
      var notifs = collectNotifications();
      _lastNotifIds = notifs.map(function(n) { return n.id; });
      if (_lastNotifIds.length > 200) {
        _lastNotifIds = _lastNotifIds.slice(-200);
      }
      storageManager.set('pos_notif_read_ids', JSON.stringify(_lastNotifIds));
      renderNotificationCenter();
      showToast('Semua notifikasi ditandai dibaca', 'success');
    }

    // Auto-poll notif setiap 5 detik (silent — tanpa shake)
    _notifPollingInterval = setInterval(function() {
      var custApp = document.getElementById('customer-app');
      if (custApp && !custApp.classList.contains('hidden')) return;
      if (typeof state === 'undefined' || !state.user) return;
      renderNotificationCenter(true);
    }, 5000);

    // Close on click outside
    document.addEventListener('click', function(e) {
        var panel = document.getElementById('notif-panel');
        var btn = document.getElementById('btn-notif');
        if (!panel || !btn) return;
        if (panel.classList.contains('hidden')) return;
        if (!e.target.closest('#notif-panel') && !e.target.closest('#btn-notif')) {
            panel.classList.add('hidden');
        }
    });

    // [NEW] COMMAND PALETTE (Ctrl+K)
    var _cmdSelectedIndex = 0;
    var _cmdFilteredItems = [];

    var COMMAND_PALETTE_ITEMS = [
        // --- NAVIGASI ---
        { id: 'nav-dash',    label: 'Buka Dashboard',        icon: 'fa-chart-pie',           cat: 'Navigasi', action: function() { switchView('dashboard'); } },
        { id: 'nav-pos',     label: 'Buka Kasir / POS',      icon: 'fa-cash-register',       cat: 'Navigasi', kbd: 'F1',  action: function() { switchView('pos'); } },
        { id: 'nav-layanan', label: 'Buka Layanan Digital',  icon: 'fa-mobile-alt',          cat: 'Navigasi', kbd: 'F10', action: function() { switchView('layanan'); } },
        { id: 'nav-inv',     label: 'Buka Inventori',        icon: 'fa-boxes',               cat: 'Navigasi', action: function() { switchView('inventory'); } },
        { id: 'nav-rep',     label: 'Buka Laporan',          icon: 'fa-file-invoice-dollar', cat: 'Navigasi', action: function() { switchView('reports'); } },
        { id: 'nav-logs',    label: 'Buka Log Sistem',       icon: 'fa-history',             cat: 'Navigasi', adminOnly: true, action: function() { switchView('logs'); } },
        { id: 'nav-setup',   label: 'Buka Pengaturan',       icon: 'fa-cog',                 cat: 'Navigasi', adminOnly: true, action: function() { switchView('setup'); } },

        // --- AKSI KASIR ---
        { id: 'act-scan',    label: 'Scan Barcode Kamera',   icon: 'fa-qrcode',              cat: 'Aksi Kasir', kbd: 'F2', action: function() { openScanner(); } },
        { id: 'act-cari',    label: 'Cari Produk',           icon: 'fa-search',              cat: 'Aksi Kasir', kbd: 'F3', action: function() { switchView('pos'); setTimeout(function() { document.getElementById('pos-search').focus(); }, 200); } },
        { id: 'act-hold',    label: 'Tahan Keranjang',       icon: 'fa-pause',               cat: 'Aksi Kasir', kbd: 'F8', action: function() { holdCurrentCart(); } },
        { id: 'act-online',  label: 'Pesanan Online',        icon: 'fa-motorcycle',          cat: 'Aksi Kasir', kbd: 'F7', action: function() { openOnlineOrdersModal(); } },
        { id: 'act-shift',   label: 'Tutup Kasir / Shift',   icon: 'fa-cash-register',       cat: 'Aksi Kasir', kbd: 'F9', action: function() { openCloseShiftModal(); } },

        // --- INVENTORI ---
        { id: 'act-newprod', label: 'Tambah Barang Baru',    icon: 'fa-plus',                cat: 'Inventori', kbd: 'Alt+B', adminOnly: true, action: function() { openProductModal(); } },
        { id: 'act-restock', label: 'Restock Barang',        icon: 'fa-truck-loading',       cat: 'Inventori', kbd: 'Alt+R', action: function() { prepareRestockModal(); } },
        { id: 'act-opname',  label: 'Stok Opname',           icon: 'fa-clipboard-check',     cat: 'Inventori', kbd: 'Alt+O', action: function() { prepareOpnameModal(); } },
        { id: 'act-printinv',label: 'Cetak Inventori',       icon: 'fa-print',               cat: 'Inventori', kbd: 'Alt+C', action: function() { printAllInventory(); } },

        // --- LAYANAN DIGITAL ---
        { id: 'act-tarik',   label: 'Tarik Tunai',           icon: 'fa-hand-holding-usd',    cat: 'Layanan', action: function() { openLayananModal('TARIK_TUNAI'); } },
        { id: 'act-topup',   label: 'Top Up E-Wallet',       icon: 'fa-wallet',              cat: 'Layanan', action: function() { openLayananModal('TOPUP_EWALLET'); } },
        { id: 'act-digi',    label: 'Produk Digital (Pulsa)',icon: 'fa-mobile-alt',          cat: 'Layanan', action: function() { openLayananModal('PRODUK_DIGITAL'); } },
        { id: 'act-gopay',   label: 'Kelola Saldo GoPay',    icon: 'fa-university',          cat: 'Layanan', adminOnly: true, action: function() { openGoPayPanel(); } },

        // --- KAS & BIAYA ---
        { id: 'act-beban',   label: 'Catat Pengeluaran / Kas', icon: 'fa-money-bill-wave',   cat: 'Kas & Biaya', adminOnly: true, action: function() { openBebanModal(); } },

        // --- SISTEM ---
        { id: 'sys-sync',    label: 'Sync Manual ke Server', icon: 'fa-sync-alt',            cat: 'Sistem', action: function() { manualSync(true); } },
        { id: 'sys-fullscreen', label: 'Mode Layar Penuh',   icon: 'fa-expand',              cat: 'Sistem', action: function() { toggleFullscreen(); } },
        { id: 'sys-reset',   label: 'Reset Layout Dashboard',icon: 'fa-th',                  cat: 'Sistem', adminOnly: true, action: function() { resetDashboardLayout(); } },
        { id: 'sys-printdaily', label: 'Cetak Laporan Harian', icon: 'fa-print',             cat: 'Sistem', adminOnly: true, action: function() { printDailyFullReport(); } },
        { id: 'sys-logout',  label: 'Keluar / Logout',       icon: 'fa-sign-out-alt',        cat: 'Sistem', action: function() { handleLogout(); } }
    ];

    function _getAllowedCommands() {
        var isAdmin = (state && state.user && state.user.role === 'Admin');
        return COMMAND_PALETTE_ITEMS.filter(function(it) {
            return !(it.adminOnly && !isAdmin);
        });
    }

    function openCommandPalette() {
        var modal = document.getElementById('modal-command');
        if (!modal) return;

        _cmdFilteredItems = _getAllowedCommands();
        _cmdSelectedIndex = 0;

        var input = document.getElementById('cmd-input');
        if (input) input.value = '';

        modal.classList.remove('hidden');
        renderCommandList();
        setTimeout(function() { if (input) input.focus(); }, 80);
    }

    function closeCommandPalette() {
        var modal = document.getElementById('modal-command');
        if (modal) modal.classList.add('hidden');
    }

    function filterCommandPalette(query) {
        var q = String(query || '').toLowerCase().trim();
        var base = _getAllowedCommands();

        if (q === '') {
            _cmdFilteredItems = base;
        } else {
            _cmdFilteredItems = base.filter(function(it) {
                return it.label.toLowerCase().indexOf(q) > -1 ||
                      it.cat.toLowerCase().indexOf(q) > -1 ||
                      (it.kbd && it.kbd.toLowerCase().indexOf(q) > -1);
            });
        }
        _cmdSelectedIndex = 0;
        renderCommandList();
    }

    function renderCommandList() {
        var list = document.getElementById('cmd-list');
        if (!list) return;

        if (_cmdFilteredItems.length === 0) {
            list.innerHTML = '<div class="text-center py-10 text-slate-400"><i class="fas fa-search text-3xl mb-2 text-slate-300"></i><p class="font-bold text-xs">Tidak ada hasil untuk pencarian Anda</p></div>';
            return;
        }

        // Group by category
        var groups = {};
        for (var i = 0; i < _cmdFilteredItems.length; i++) {
            var it = _cmdFilteredItems[i];
            if (!groups[it.cat]) groups[it.cat] = [];
            groups[it.cat].push({ item: it, origIdx: i });
        }

        var html = '';
        var cats = Object.keys(groups);

        for (var c = 0; c < cats.length; c++) {
            var cat = cats[c];
            html += '<div class="px-3 py-1.5 mt-1"><p class="text-[9px] font-black text-slate-400 uppercase tracking-wider">' + escapeHtml(cat) + '</p></div>';

            for (var j = 0; j < groups[cat].length; j++) {
                var entry = groups[cat][j];
                var item = entry.item;
                var isSelected = entry.origIdx === _cmdSelectedIndex;

                var cls = isSelected
                    ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                    : 'bg-white border-transparent text-slate-700 hover:bg-slate-50';

                // [FIX] onmouseenter hanya update index + visual, TIDAK rebuild list
                html +=
                    '<div class="cmd-item flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ' + cls + '" ' +
                        'data-cmd-idx="' + entry.origIdx + '" ' +
                        'onclick="executeCommand(' + entry.origIdx + ')" ' +
                        'onmouseenter="highlightCommandItem(' + entry.origIdx + ')">' +
                        '<i class="fas ' + item.icon + ' w-5 text-center text-sm"></i>' +
                        '<span class="flex-1 font-bold text-xs">' + escapeHtml(item.label) + '</span>' +
                        (item.kbd ? '<kbd class="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">' + item.kbd + '</kbd>' : '') +
                    '</div>';
            }
        }

        list.innerHTML = html;

        // Scroll selected item ke viewport
        var selEl = list.querySelector('[data-cmd-idx="' + _cmdSelectedIndex + '"]');
        if (selEl && selEl.scrollIntoView) selEl.scrollIntoView({ block: 'nearest' });
    }

    // [NEW] Highlight item tanpa rebuild seluruh list
    function highlightCommandItem(idx) {
        if (_cmdSelectedIndex === idx) return;  // sudah ter-highlight, skip
        _cmdSelectedIndex = idx;

        var list = document.getElementById('cmd-list');
        if (!list) return;

        // Loop semua item, cabut class highlight, pasang ke yang baru
        var items = list.querySelectorAll('.cmd-item');
        for (var i = 0; i < items.length; i++) {
            var el = items[i];
            var elIdx = parseInt(el.getAttribute('data-cmd-idx'), 10);
            if (elIdx === idx) {
                el.classList.remove('bg-white', 'border-transparent', 'text-slate-700', 'hover:bg-slate-50');
                el.classList.add('bg-blue-50', 'border-blue-200', 'text-blue-700', 'shadow-sm');
            } else {
                el.classList.remove('bg-blue-50', 'border-blue-200', 'text-blue-700', 'shadow-sm');
                el.classList.add('bg-white', 'border-transparent', 'text-slate-700', 'hover:bg-slate-50');
            }
        }
    }

    function handleCommandKeydown(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            var newIdx = Math.min(_cmdSelectedIndex + 1, _cmdFilteredItems.length - 1);
            if (newIdx !== _cmdSelectedIndex) {
                highlightCommandItem(newIdx);
                scrollCommandItemIntoView(newIdx);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            var newIdx = Math.max(_cmdSelectedIndex - 1, 0);
            if (newIdx !== _cmdSelectedIndex) {
                highlightCommandItem(newIdx);
                scrollCommandItemIntoView(newIdx);
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (_cmdFilteredItems[_cmdSelectedIndex]) executeCommand(_cmdSelectedIndex);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeCommandPalette();
        }
    }

    // [NEW] Helper: scroll item terpilih ke viewport tanpa rebuild
    function scrollCommandItemIntoView(idx) {
        var list = document.getElementById('cmd-list');
        if (!list) return;
        var selEl = list.querySelector('[data-cmd-idx="' + idx + '"]');
        if (selEl && selEl.scrollIntoView) {
            selEl.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }
    }

    function executeCommand(idx) {
        var item = _cmdFilteredItems[idx];
        if (!item) return;
        closeCommandPalette();
        setTimeout(function() {
            // [FIX] Tidak lagi pakai eval — panggil function reference
            try { item.action(); } catch (err) { console.error('Command exec error:', err); }
        }, 100);
    }

    // [HOTKEY] Ctrl+K / Cmd+K
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            var modal = document.getElementById('modal-command');
            if (modal && modal.classList.contains('hidden')) openCommandPalette();
            else closeCommandPalette();
        }
    });

    // [NEW] KEYBOARD SHORTCUT HELP
    function openShortcutHelp() {
        var shortcuts = [
            { cat: 'Umum', items: [
                { k: 'Ctrl + K',  d: 'Buka Command Palette' },
                { k: 'Alt + N',   d: 'Buka Notification Center' },
                { k: 'ESC',       d: 'Tutup modal aktif' }
            ]},
            { cat: 'Kasir / POS', items: [
                { k: 'F1',  d: 'Pindah ke Kasir' },
                { k: 'F2',  d: 'Buka Scanner Kamera' },
                { k: 'F3',  d: 'Fokus ke Pencarian Produk' },
                { k: 'F4',  d: 'Bayar Tunai' },
                { k: 'F6',  d: 'Bayar QRIS' },
                { k: 'F7',  d: 'Pesanan Online' },
                { k: 'F8',  d: 'Tahan Keranjang' },
                { k: 'F9',  d: 'Tutup Kasir' },
                { k: 'F10', d: 'Layanan Digital' }
            ]},
            { cat: 'Inventori', items: [
                { k: 'Alt + B', d: 'Tambah Barang Baru' },
                { k: 'Alt + R', d: 'Restock Barang' },
                { k: 'Alt + O', d: 'Stok Opname' },
                { k: 'Alt + C', d: 'Cetak Inventori' }
            ]}
        ];

        var html = '<div class="text-left">';
        for (var c = 0; c < shortcuts.length; c++) {
            var cat = shortcuts[c];
            html += '<p class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 mt-3 first:mt-0">' + cat.cat + '</p>';
            html += '<div class="space-y-1 mb-3">';
            for (var i = 0; i < cat.items.length; i++) {
                var s = cat.items[i];
                html += '<div class="flex justify-between items-center py-1.5 border-b border-slate-50 last:border-0">' +
                            '<span class="text-xs text-slate-600 font-medium">' + s.d + '</span>' +
                            '<kbd class="text-[10px] font-black bg-slate-100 text-slate-700 px-2 py-1 rounded border border-slate-200 shadow-sm">' + s.k + '</kbd>' +
                        '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        Swal.fire({
            title: '<i class="fas fa-keyboard text-blue-500 mr-2"></i> Shortcut Keyboard',
            html: html,
            width: 520,
            confirmButtonText: 'Mengerti',
            confirmButtonColor: '#3b82f6'
        });
    }

    // [HOTKEY] Tekan "?" (Shift + /) untuk buka help
    document.addEventListener('keydown', function(e) {
        var tag = (e.target && e.target.tagName) ? e.target.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            openShortcutHelp();
        }
    });

    // ============================================================
    // [PATCH AKUNTANSI] Fungsi Audit Rekonsiliasi
    // Jalankan di Console Browser: auditRekonsiliasi()
    // Output seharusnya: "✓ SEMUA BALANCE" atau daftar selisih
    // ============================================================
    function auditRekonsiliasi(tanggalAwal, tanggalAkhir) {
        var startTime, endTime;
        
        if (!tanggalAwal || !tanggalAkhir) {
            // Default: hari ini
            var today = new Date();
            startTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).getTime();
            endTime   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).getTime();
        } else {
            startTime = new Date(tanggalAwal).setHours(0, 0, 0, 0);
            endTime   = new Date(tanggalAkhir).setHours(23, 59, 59, 999);
        }
        
        console.log('%c═══ AUDIT REKONSILIASI ═══', 'font-weight:bold;font-size:14px;color:#2563eb;');
        console.log('Periode:', new Date(startTime).toLocaleString('id-ID'), '→', new Date(endTime).toLocaleString('id-ID'));
        console.log('');
        
        // 1. OMSET — dari 3 sumber berbeda
        var omsetBarang = 0, omsetLayanan = 0;
        for (var i = 0; i < state.transactions.length; i++) {
            var t = state.transactions[i];
            if (t.tanggal < startTime || t.tanggal > endTime) continue;
            if (t.status === 'RETUR' || t.status === 'HUTANG') continue;
            omsetBarang += t.total;
        }
        for (var j = 0; j < (state.layananDigital || []).length; j++) {
            var l = state.layananDigital[j];
            if (l.tanggal < startTime || l.tanggal > endTime) continue;
            if (l.jenis === 'PRODUK_DIGITAL') omsetLayanan += (Number(l.nominal) || 0);
            else omsetLayanan += (Number(l.fee) || 0);
        }
        var omsetDariState = omsetBarang + omsetLayanan;
        
        // Omset dari Jurnal: 411 + 421 + 422 + 423 (Kredit - Debit)
        var omsetDariJurnal = 0;
        var rincianJurnal = {};
        for (var k = 0; k < state.jurnal.length; k++) {
            var jr = state.jurnal[k];
            if (jr.tanggal < startTime || jr.tanggal > endTime) continue;
            var kode = String(jr.kodeAkun).trim();
            if (kode !== '411' && kode !== '421' && kode !== '422' && kode !== '423') continue;
            var nilai = (jr.kredit || 0) - (jr.debit || 0);
            omsetDariJurnal += nilai;
            rincianJurnal[kode] = (rincianJurnal[kode] || 0) + nilai;
        }
        
        console.log('%c1. OMSET / PENDAPATAN', 'font-weight:bold;color:#1e40af;');
        console.log('   State (Barang)         :', formatRp(omsetBarang));
        console.log('   State (Layanan)        :', formatRp(omsetLayanan));
        console.log('   State (Total)          :', formatRp(omsetDariState));
        console.log('   Jurnal COA 411         :', formatRp(rincianJurnal['411'] || 0));
        console.log('   Jurnal COA 421         :', formatRp(rincianJurnal['421'] || 0));
        console.log('   Jurnal COA 422         :', formatRp(rincianJurnal['422'] || 0));
        console.log('   Jurnal COA 423         :', formatRp(rincianJurnal['423'] || 0));
        console.log('   Jurnal (Total)         :', formatRp(omsetDariJurnal));
        var deltaOmset = omsetDariState - omsetDariJurnal;
        if (Math.abs(deltaOmset) < 1) {
            console.log('   %c✓ BALANCE', 'color:#10b981;font-weight:bold;');
        } else {
            console.log('   %c✗ SELISIH: ' + formatRp(deltaOmset), 'color:#ef4444;font-weight:bold;');
        }
        console.log('');
        
        // 2. HPP — Barang + Digital
        var hppBarang = 0, hppDigital = 0;
        for (var m = 0; m < state.transactions.length; m++) {
            var tm = state.transactions[m];
            if (tm.tanggal < startTime || tm.tanggal > endTime) continue;
            if (tm.status === 'RETUR' || tm.status === 'HUTANG') continue;
            hppBarang += (Number(tm.modal) || 0);
        }
        for (var n = 0; n < (state.layananDigital || []).length; n++) {
            var ln = state.layananDigital[n];
            if (ln.tanggal < startTime || ln.tanggal > endTime) continue;
            if (ln.jenis === 'PRODUK_DIGITAL') hppDigital += (Number(ln.modal) || 0);
        }
        var hppDariState = hppBarang + hppDigital;
        
        var hppDariJurnal = 0;
        for (var p = 0; p < state.jurnal.length; p++) {
            var jp = state.jurnal[p];
            if (jp.tanggal < startTime || jp.tanggal > endTime) continue;
            var kodeP = String(jp.kodeAkun).trim();
            if (kodeP === '511' || kodeP === '512.1') {
                hppDariJurnal += (jp.debit || 0) - (jp.kredit || 0);
            }
        }
        
        console.log('%c2. HPP (Harga Pokok Penjualan)', 'font-weight:bold;color:#7c3aed;');
        console.log('   State Barang (511)     :', formatRp(hppBarang));
        console.log('   State Digital (512.1)  :', formatRp(hppDigital));
        console.log('   State (Total)          :', formatRp(hppDariState));
        console.log('   Jurnal (511 + 512.1)   :', formatRp(hppDariJurnal));
        var deltaHpp = hppDariState - hppDariJurnal;
        if (Math.abs(deltaHpp) < 1) {
            console.log('   %c✓ BALANCE', 'color:#10b981;font-weight:bold;');
        } else {
            console.log('   %c✗ SELISIH: ' + formatRp(deltaHpp), 'color:#ef4444;font-weight:bold;');
        }
        console.log('');
        
        // 3. LABA KOTOR
        var labaKotorState = omsetDariState - hppDariState;
        var labaKotorJurnal = omsetDariJurnal - hppDariJurnal;
        
        console.log('%c3. LABA KOTOR', 'font-weight:bold;color:#059669;');
        console.log('   Dari State             :', formatRp(labaKotorState));
        console.log('   Dari Jurnal            :', formatRp(labaKotorJurnal));
        var deltaLaba = labaKotorState - labaKotorJurnal;
        if (Math.abs(deltaLaba) < 1) {
            console.log('   %c✓ BALANCE', 'color:#10b981;font-weight:bold;');
        } else {
            console.log('   %c✗ SELISIH: ' + formatRp(deltaLaba), 'color:#ef4444;font-weight:bold;');
        }
        console.log('');
        
        // 4. KAS FISIK
        var kasDariJurnal = 0;
        for (var q = 0; q < state.jurnal.length; q++) {
            var jq = state.jurnal[q];
            if (String(jq.kodeAkun).trim() !== '111') continue;
            if (jq.tanggal > endTime) continue;
            kasDariJurnal += (jq.debit || 0) - (jq.kredit || 0);
        }
        
        console.log('%c4. KAS (COA 111) — Saldo Kumulatif', 'font-weight:bold;color:#0891b2;');
        console.log('   Saldo Kas (Jurnal)     :', formatRp(kasDariJurnal));
        console.log('   (Bandingkan dengan fisik laci — harus cocok setelah setoran/penarikan)');
        console.log('');
        
        console.log('%c═══ SELESAI ═══', 'font-weight:bold;color:#2563eb;');
        console.log('Tip: copy hasil ini untuk audit trail.');
    }

    // Expose ke global scope
    window.auditRekonsiliasi = auditRekonsiliasi;

    // [NEW] Toggle menu Aksi Lain di Inventori
    function toggleInvActionsMenu() {
        var menu = document.getElementById('inv-actions-menu');
        var btn  = document.getElementById('btn-inv-actions');
        if (!menu) return;
        var willOpen = menu.classList.contains('hidden');
        menu.classList.toggle('hidden');
        // [NEW] Ubah state tombol saat dropdown terbuka
        if (btn) {
            if (willOpen) {
                btn.classList.add('bg-blue-50', 'text-blue-700', 'border-blue-200');
                btn.classList.remove('bg-white', 'text-slate-700');
            } else {
                btn.classList.remove('bg-blue-50', 'text-blue-700', 'border-blue-200');
                btn.classList.add('bg-white', 'text-slate-700');
            }
        }
    }

    // [PATCH v7.19] Modal REKONSILIASI KAS TOTAL (111)
    function openRekonKasTotalModal() {
        if (!state.user || state.user.role !== 'Admin') {
            return showToast('Hanya Admin!', 'error');
        }

        // Saldo 111 sistem (kumulatif)
        var saldo111 =
		    (state._saldoByAccount && Number(state._saldoByAccount['111'])) ||
		    (Number(state.saldoRingkas.kas111) || 0);

        Swal.fire({
            title: '<i class="fas fa-coins text-amber-500 mr-2"></i>Rekonsiliasi Kas Total',
            width: 520,
            html:
                '<div class="text-left">' +
                    '<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">' +
                        '<p class="text-[11px] text-amber-800 leading-relaxed">' +
                            '<b><i class="fas fa-info-circle mr-1"></i>Rekonsiliasi Akun Kas (111)</b><br>' +
                            'Hitung <b>SEMUA uang fisik</b>: laci kasir + brangkas + safe + lainnya.<br>' +
                            'Sistem akan bandingkan dengan <b>saldo akun Kas 111</b> di jurnal.<br>' +
                            'Selisih otomatis dijurnal ke <b>D 521 / K 111</b> (kurang) ' +
                            'atau <b>D 111 / K 415</b> (lebih).' +
                        '</p>' +
                    '</div>' +
                    '<div class="bg-slate-100 rounded-xl p-3 mb-3 flex justify-between items-center">' +
                        '<span class="text-xs font-bold text-slate-600">Saldo Kas 111 (sistem):</span>' +
                        '<span class="text-base font-black text-slate-800">' + formatRp(saldo111) + '</span>' +
                    '</div>' +
                    '<label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">' +
                        'Total Uang Fisik (SEMUA tempat)' +
                    '</label>' +
                '</div>',
            input: 'text',
            inputAttributes: { inputmode: 'numeric', autocomplete: 'off', placeholder: 'Cth: 5.000.000' },
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-check mr-1"></i> Rekonsiliasi',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#f59e0b',
            cancelButtonColor: '#94a3b8',
            didOpen: function() {
                var input = Swal.getInput();
                input.addEventListener('input', function() {
                    var raw = String(this.value || '').replace(/\D/g, '');
                    if (raw) this.value = Number(raw).toLocaleString('id-ID');
                    else this.value = '';
                });
                setTimeout(function() { input.focus(); }, 200);
            },
            preConfirm: function() {
                var raw = String(Swal.getInput().value || '').replace(/\D/g, '');
                if (raw === '') {
                    Swal.showValidationMessage('Wajib diisi! Ketik 0 jika kas kosong.');
                    return false;
                }
                return parseInt(raw, 10) || 0;
            }
        }).then(function(result) {
            if (!result.isConfirmed) return;
            var fisikTotal = result.value;
            var selisih = fisikTotal - saldo111;

            if (Math.abs(selisih) < 1) {
                Swal.fire({
                    icon: 'success', title: 'Saldo COCOK',
                    html: 'Uang fisik <b>sama dengan</b> saldo Kas 111 sistem.<br>Tidak perlu jurnal koreksi.',
                    confirmButtonColor: '#10b981'
                });
                return;
            }

            var jurnalPreview = selisih < 0
                ? 'D: <b>Beban Selisih Kas (521)</b> Rp ' + formatRp(Math.abs(selisih)) + '<br>' +
                  'K: <b>Kas (111)</b> Rp ' + formatRp(Math.abs(selisih))
                : 'D: <b>Kas (111)</b> Rp ' + formatRp(Math.abs(selisih)) + '<br>' +
                  'K: <b>Pendapatan Selisih Kas (415)</b> Rp ' + formatRp(Math.abs(selisih));

            var tipe = selisih < 0 ? 'KURANG' : 'LEBIH';
            var warna = selisih < 0 ? '#ef4444' : '#10b981';

            Swal.fire({
                title: 'Konfirmasi Jurnal',
                width: 480,
                html:
                    '<div class="text-left">' +
                        '<div class="bg-slate-50 rounded-lg p-3 mb-3">' +
                            '<div class="flex justify-between mb-1"><span class="text-xs">Saldo sistem:</span><span class="font-bold">' + formatRp(saldo111) + '</span></div>' +
                            '<div class="flex justify-between mb-1"><span class="text-xs">Uang fisik:</span><span class="font-bold">' + formatRp(fisikTotal) + '</span></div>' +
                            '<div class="flex justify-between pt-2 border-t border-slate-300 mt-2"><span class="font-bold">Selisih:</span>' +
                                '<span class="font-black" style="color:' + warna + '">' + tipe + ' Rp ' + formatRp(Math.abs(selisih)) + '</span></div>' +
                        '</div>' +
                        '<p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Jurnal yang akan dibuat:</p>' +
                        '<div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] font-mono">' + jurnalPreview + '</div>' +
                    '</div>',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Ya, Posting Jurnal',
                cancelButtonText: 'Batal',
                confirmButtonColor: warna
            }).then(function(conf) {
                if (!conf.isConfirmed) return;
                Swal.fire({ title: 'Memproses...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });

                google.script.run.withSuccessHandler(function(res) {
                    if (!res.success) return Swal.fire('Gagal', res.error, 'error');
                    Swal.fire({
                        icon: 'success',
                        title: 'Berhasil!',
                        html:
                            'Rekonsiliasi Kas Total berhasil.<br>' +
                            '<span class="text-xs text-slate-500 font-mono">' + res.idJurnal + '</span><br><br>' +
                            '<div class="text-left text-[11px] bg-slate-50 p-2 rounded">' +
                            '<b>D:</b> ' + res.akunDebit + '<br>' +
                            '<b>K:</b> ' + res.akunKredit +
                            '</div>'
                    });
                    manualSync(true);
                }).withFailureHandler(function(err) {
                    Swal.fire('Koneksi Gagal', err && err.message ? err.message : 'unknown', 'error');
                }).catatJurnalSelisihKas(storageManager.get('pos_token_final'), fisikTotal, 'Full cash count');
            });
        });
    }

    // [PATCH v7.19] Modal REKONSILIASI BANK (115)
    function openRekonBankModal() {
        if (!state.user || state.user.role !== 'Admin') {
            return showToast('Hanya Admin!', 'error');
        }

        var saldo115 =
		    (state._saldoByAccount && Number(state._saldoByAccount['115'])) ||
		    (Number(state.saldoRingkas.bank115) || 0);

        Swal.fire({
            title: '<i class="fas fa-university text-cyan-500 mr-2"></i>Rekonsiliasi Bank',
            width: 520,
            html:
                '<div class="text-left">' +
                    '<div class="bg-cyan-50 border border-cyan-200 rounded-xl p-3 mb-3">' +
                        '<p class="text-[11px] text-cyan-800 leading-relaxed">' +
                            '<b><i class="fas fa-info-circle mr-1"></i>Rekonsiliasi Akun Bank (115)</b><br>' +
                            'Bandingkan saldo akun <b>Bank / Settlement QRIS (115)</b> sistem ' +
                            'dengan <b>saldo riil di rekening bank</b> (dari m-banking / statement).<br>' +
                            'Selisih otomatis dijurnal ke akun Pendapatan Lain-lain (413) atau Beban Lainnya (518).' +
                        '</p>' +
                    '</div>' +
                    '<div class="bg-slate-100 rounded-xl p-3 mb-3 flex justify-between items-center">' +
                        '<span class="text-xs font-bold text-slate-600">Saldo Bank 115 (sistem):</span>' +
                        '<span class="text-base font-black text-slate-800">' + formatRp(saldo115) + '</span>' +
                    '</div>' +
                    '<label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">' +
                        'Saldo Riil di Rekening Bank' +
                    '</label>' +
                '</div>',
            input: 'text',
            inputAttributes: { inputmode: 'numeric', autocomplete: 'off', placeholder: 'Cth: 10.500.000' },
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-check mr-1"></i> Rekonsiliasi',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#0891b2',
            cancelButtonColor: '#94a3b8',
            didOpen: function() {
                var input = Swal.getInput();
                input.addEventListener('input', function() {
                    var raw = String(this.value || '').replace(/\D/g, '');
                    if (raw) this.value = Number(raw).toLocaleString('id-ID');
                    else this.value = '';
                });
                setTimeout(function() { input.focus(); }, 200);
            },
            preConfirm: function() {
                var raw = String(Swal.getInput().value || '').replace(/\D/g, '');
                if (raw === '') {
                    Swal.showValidationMessage('Wajib diisi! Ketik 0 jika rekening kosong.');
                    return false;
                }
                return parseInt(raw, 10) || 0;
            }
        }).then(function(result) {
            if (!result.isConfirmed) return;
            var saldoRiil = result.value;
            var selisih = saldoRiil - saldo115;

            if (Math.abs(selisih) < 1) {
                Swal.fire({
                    icon: 'success', title: 'Saldo COCOK',
                    html: 'Saldo Bank 115 sistem <b>sama dengan</b> saldo riil di rekening.',
                    confirmButtonColor: '#10b981'
                });
                return;
            }

            var jurnalPreview = selisih > 0
                ? 'D: <b>Bank (115)</b> Rp ' + formatRp(Math.abs(selisih)) + '<br>' +
                  'K: <b>Pendapatan Lain-lain (413)</b> Rp ' + formatRp(Math.abs(selisih))
                : 'D: <b>Beban Lainnya (518)</b> Rp ' + formatRp(Math.abs(selisih)) + '<br>' +
                  'K: <b>Bank (115)</b> Rp ' + formatRp(Math.abs(selisih));

            var tipe = selisih > 0 ? 'LEBIH' : 'KURANG';
            var warna = selisih > 0 ? '#10b981' : '#ef4444';

            Swal.fire({
                title: 'Konfirmasi Jurnal',
                width: 480,
                html:
                    '<div class="text-left">' +
                        '<div class="bg-slate-50 rounded-lg p-3 mb-3">' +
                            '<div class="flex justify-between mb-1"><span class="text-xs">Saldo sistem:</span><span class="font-bold">' + formatRp(saldo115) + '</span></div>' +
                            '<div class="flex justify-between mb-1"><span class="text-xs">Saldo riil:</span><span class="font-bold">' + formatRp(saldoRiil) + '</span></div>' +
                            '<div class="flex justify-between pt-2 border-t border-slate-300 mt-2"><span class="font-bold">Selisih:</span>' +
                                '<span class="font-black" style="color:' + warna + '">' + tipe + ' Rp ' + formatRp(Math.abs(selisih)) + '</span></div>' +
                        '</div>' +
                        '<p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Jurnal yang akan dibuat:</p>' +
                        '<div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] font-mono">' + jurnalPreview + '</div>' +
                    '</div>',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Ya, Posting Jurnal',
                cancelButtonText: 'Batal',
                confirmButtonColor: warna
            }).then(function(conf) {
                if (!conf.isConfirmed) return;
                Swal.fire({ title: 'Memproses...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });

                google.script.run.withSuccessHandler(function(res) {
                    if (!res.success) return Swal.fire('Gagal', res.error, 'error');
                    Swal.fire({
                        icon: 'success',
                        title: 'Berhasil!',
                        html:
                            'Rekonsiliasi Bank berhasil.<br>' +
                            '<span class="text-xs text-slate-500 font-mono">' + res.idJurnal + '</span><br><br>' +
                            '<div class="text-left text-[11px] bg-slate-50 p-2 rounded">' +
                            '<b>D:</b> ' + res.akunDebit + '<br>' +
                            '<b>K:</b> ' + res.akunKredit +
                            '</div>'
                    });
                    manualSync(true);
                }).withFailureHandler(function(err) {
                    Swal.fire('Koneksi Gagal', err && err.message ? err.message : 'unknown', 'error');
                }).rekonsiliasiBank(storageManager.get('pos_token_final'), saldoRiil, 'Rekonsiliasi Bank');
            });
        });
    }

    function closeInvActionsMenu() {
        var menu = document.getElementById('inv-actions-menu');
        var btn  = document.getElementById('btn-inv-actions');
        if (menu) menu.classList.add('hidden');
        // [NEW] Reset visual tombol saat menu ditutup
        if (btn) {
            btn.classList.remove('bg-blue-50', 'text-blue-700', 'border-blue-200');
            btn.classList.add('bg-white', 'text-slate-700');
        }
    }

    // Close on click outside
    document.addEventListener('click', function(e) {
        var menu = document.getElementById('inv-actions-menu');
        var btn = document.getElementById('btn-inv-actions');
        if (!menu || !btn) return;
        if (menu.classList.contains('hidden')) return;
        if (!e.target.closest('#inv-actions-menu') && !e.target.closest('#btn-inv-actions')) {
            menu.classList.add('hidden');
        }
    });

    // ============================================================
    // [NEW v2] CETAK FORM STOK OPNAME — FORMAT TABEL KOMPAK
    // Hemat kertas: ~28-35 produk per A4, dikelompokkan per kategori
    // ============================================================
    function printKartuOpname() {
        if (!state.products || state.products.length === 0) {
            Swal.fire('Tidak Ada Produk', 'Data produk kosong, tidak bisa cetak form opname.', 'warning');
            return;
        }

        // Daftar kategori unik
        var cats = {};
        for (var i = 0; i < state.products.length; i++) {
            cats[state.products[i].kategori] = (cats[state.products[i].kategori] || 0) + 1;
        }
        var catList = Object.keys(cats).sort();

        var opts = '<option value="ALL">📦 Semua Kategori (' + state.products.length + ' produk)</option>';
        for (var j = 0; j < catList.length; j++) {
            opts += '<option value="' + escapeHtml(catList[j]) + '">' + escapeHtml(catList[j]) + ' (' + cats[catList[j]] + ')</option>';
        }

        Swal.fire({
            title: '<i class="fas fa-clipboard-list text-amber-500 mr-2"></i>Cetak Form Stok Opname',
            width: 500,
            html:
                '<div class="text-left">' +
                    '<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">' +
                        '<p class="text-[11px] text-amber-800 font-medium leading-relaxed">' +
                            '<b><i class="fas fa-info-circle mr-1"></i>Format tabel kompak:</b><br>' +
                            '±25-30 produk per halaman A4, dikelompokkan per kategori.<br>' +
                            'Kolom <b>Stok Sistem</b> diisi otomatis.<br>' +
                            'Kolom <b>Stok Fisik / Selisih / Ket</b> dikosongkan untuk diisi tangan petugas.' +
                        '</p>' +
                    '</div>' +
                    '<label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Filter Kategori</label>' +
                    '<select id="swal-kat-opname" class="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold bg-slate-50 outline-none focus:border-amber-500 cursor-pointer">' +
                        opts +
                    '</select>' +
                    '<p class="text-[10px] text-slate-400 mt-2 text-center">' +
                        '<i class="fas fa-print mr-1"></i>Header tabel dicetak ulang di setiap halaman' +
                    '</p>' +
                '</div>',
            icon: 'question',
            showConfirmButton: true,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-print mr-1"></i> Cetak Form',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#f59e0b',
            cancelButtonColor: '#94a3b8',
            preConfirm: function() {
                return document.getElementById('swal-kat-opname').value;
            }
        }).then(function(result) {
            if (!result.isConfirmed) return;
            _generateAndPrintOpnameSheet(result.value);
        });
    }

    function _generateAndPrintOpnameSheet(category) {
        var products = state.products.slice();
        if (category && category !== 'ALL') {
            products = products.filter(function(p) { return p.kategori === category; });
        }
        // Sort: per kategori (A-Z), lalu per nama (A-Z)
        products.sort(function(a, b) {
            var k = String(a.kategori).localeCompare(String(b.kategori));
            if (k !== 0) return k;
            return String(a.nama).localeCompare(String(b.nama));
        });

        if (products.length === 0) {
            Swal.fire('Tidak Ada Produk', 'Tidak ada produk pada kategori ini.', 'warning');
            return;
        }

        var toko     = escapeHtml(state.setup['Nama Toko'] || 'Toko');
        var alamat   = escapeHtml(state.setup['Alamat'] || '');
        var telp     = escapeHtml(state.setup['Telepon'] || '');
        var todayStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
        var catLabel = (category === 'ALL') ? 'Semua Kategori' : category;
        var petugas  = state.user && state.user.nama ? escapeHtml(state.user.nama) : '-';

        // Kelompokkan per kategori (untuk header row)
        var grouped = [];
        var lastCat = null;
        for (var g = 0; g < products.length; g++) {
            var p = products[g];
            if (p.kategori !== lastCat) {
                grouped.push({ type: 'cat', kategori: p.kategori });
                lastCat = p.kategori;
            }
            grouped.push({ type: 'item', produk: p });
        }

        // Paginasi: hitung berapa baris bisa masuk per halaman
        // Header sheet (~40mm) + header tabel (~8mm) + signature (~25mm)
        // Sisa untuk tabel = 297mm - 20mm(margin) - 73mm = ~204mm
        // Tinggi 1 baris item = 8mm, tinggi 1 baris kategori = 10mm
        // Estimate: ~22 baris item + kategori kalau ada
        var MAX_ROWS_PER_PAGE = 24;

        // Pecah grouped → chunks dengan hitung baris
        var pages = [];
        var currentPage = [];
        var currentRows = 0;

        for (var h = 0; h < grouped.length; h++) {
            var row = grouped[h];
            var cost = (row.type === 'cat') ? 1.3 : 1;   // baris kategori lebih tinggi

            if (currentRows + cost > MAX_ROWS_PER_PAGE && currentPage.length > 0) {
                pages.push(currentPage);
                currentPage = [];
                currentRows = 0;
            }
            currentPage.push(row);
            currentRows += cost;
        }
        if (currentPage.length > 0) pages.push(currentPage);

        // Build HTML per halaman
        var totalPages = pages.length;
        var pagesHtml = '';

        for (var pg = 0; pg < totalPages; pg++) {
            pagesHtml += _buildOpnameSheetPage({
                rows: pages[pg],
                toko: toko,
                alamat: alamat,
                telp: telp,
                dateStr: todayStr,
                catLabel: catLabel,
                petugas: petugas,
                pageNo: pg + 1,
                totalPages: totalPages,
                startIndex: null // dihitung saat render
            });
        }

        var printEl = document.getElementById('print-opname-cards-area');
        printEl.innerHTML = pagesHtml;
        printArea('print-opname-cards-area');
    }

    function _buildOpnameSheetPage(cfg) {
        var html = '<div class="opname-sheet">';

        // ── HEADER ──
        html += '<div class="opname-sheet-header">';
        html +=   '<div class="opname-sheet-title">FORMULIR STOK OPNAME</div>';
        html +=   '<div class="opname-sheet-store">' + cfg.toko + '</div>';
        if (cfg.alamat) html += '<div class="opname-sheet-addr">' + cfg.alamat + (cfg.telp ? ' • Telp: ' + cfg.telp : '') + '</div>';
        html +=   '<div class="opname-sheet-subtitle">Lembar Hitung Stok Fisik</div>';
        html += '</div>';

        // ── META ──
        html += '<div class="opname-sheet-meta">';
        html +=   '<span><b>Tanggal:</b> ' + cfg.dateStr + '</span>';
        html +=   '<span><b>Filter:</b> ' + escapeHtml(cfg.catLabel) + '</span>';
        html +=   '<span><b>Petugas:</b> ' + cfg.petugas + '</span>';
        html +=   '<span><b>Halaman:</b> ' + cfg.pageNo + ' / ' + cfg.totalPages + '</span>';
        html += '</div>';

        // ── TABEL ──
        html += '<table class="opname-table">';
        html +=   '<thead>';
        html +=     '<tr>';
        html +=       '<th rowspan="2" class="opn-col-no">No</th>';
        html +=       '<th rowspan="2" class="opn-col-id">ID / Barcode</th>';
        html +=       '<th rowspan="2" class="opn-col-nama">Nama Produk</th>';
        html +=       '<th rowspan="2" class="opn-col-sistem">Stok Sistem</th>';
        html +=       '<th colspan="3" class="opn-col-fisik-group">Stok Fisik</th>';
        html +=       '<th rowspan="2" class="opn-col-selisih">Selisih</th>';
        html +=     '</tr>';
        html +=     '<tr>';
        html +=       '<th class="opn-col-display">Display</th>';
        html +=       '<th class="opn-col-gudang">Gudang</th>';
        html +=       '<th class="opn-col-total">Total</th>';
        html +=     '</tr>';
        html +=   '</thead>';
        html +=   '<tbody>';

        var itemNo = 0;
        for (var i = 0; i < cfg.rows.length; i++) {
            var row = cfg.rows[i];

            if (row.type === 'cat') {
                html += '<tr class="opname-cat-row">';
                html +=   '<td colspan="8"><i class="fas fa-folder-open"></i> KATEGORI: ' + escapeHtml(row.kategori).toUpperCase() + '</td>';
                html += '</tr>';
            } else {
                itemNo++;
                var p = row.produk;
                html += '<tr class="opname-item">';
                html +=   '<td class="opn-col-no">' + itemNo + '</td>';
                html +=   '<td class="opn-col-id">' + escapeHtml(p.id) + '</td>';
                html +=   '<td class="opn-col-nama">' + escapeHtml(p.nama) + '</td>';
                html +=   '<td class="opn-col-sistem">' + (Number(p.stok) || 0) + '</td>';
                html +=   '<td class="opn-col-display"></td>';
                html +=   '<td class="opn-col-gudang"></td>';
                html +=   '<td class="opn-col-total"></td>';
                html +=   '<td class="opn-col-selisih"></td>';
                html += '</tr>';
            }
        }
        html +=   '</tbody>';
        html += '</table>';

        // ── TANDA TANGAN ──
        html += '<div class="opname-sign-row">';
        html +=   '<div class="opname-sign-col">';
        html +=     '<div class="opname-sign-title">Petugas Penghitung</div>';
        html +=     '<div class="opname-sign-line">Nama &amp; Tanda Tangan</div>';
        html +=   '</div>';
        html +=   '<div class="opname-sign-col">';
        html +=     '<div class="opname-sign-title">Verifikator / Admin</div>';
        html +=     '<div class="opname-sign-line">Nama &amp; Tanda Tangan</div>';
        html +=   '</div>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    // [PATCH v7.14] Handler Pembayaran Hutang
    function openPembayaranHutangModal(refNota, sisa, supplier, totalBiaya, totalDibayar) {
        var isAset = String(refNota).indexOf('AST') === 0;
        document.getElementById('mph-ref').innerText = refNota;
        document.getElementById('mph-ref-hidden').value = refNota;
        document.getElementById('mph-sisa-hidden').value = sisa;
        document.getElementById('mph-supplier').innerHTML =
            (isAset
                ? '<span class="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded mr-1 font-black">ASET</span> '
                : '') +
        escapeHtml(supplier || '-');
        document.getElementById('mph-total').innerText = formatRp(totalBiaya);
        document.getElementById('mph-dibayar').innerText = formatRp(totalDibayar);
        document.getElementById('mph-sisa').innerText = formatRp(sisa);

        // ── RENDER DAFTAR PRODUK (Hanya untuk non-Aset) ──
        var itemSection = document.getElementById('mph-item-section');
        var itemList = document.getElementById('mph-item-list');
        
        if (isAset) {
            itemSection.classList.add('hidden');
        } else {
            itemSection.classList.remove('hidden');
            var items = state.purchases.filter(function(p) { return String(p.refNota) === String(refNota); });
            var htmlItems = '';
            
            if (items.length === 0) {
                htmlItems = '<div class="text-xs text-slate-400 italic text-center py-2">Detail produk tidak ditemukan</div>';
            } else {
                for (var i = 0; i < items.length; i++) {
                    var it = items[i];
                    htmlItems += `
                        <label class="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                            <div class="flex items-center gap-2">
                                <input type="checkbox" class="mph-item-cb w-4 h-4 accent-purple-600 rounded" 
                                       value="${it.id}" 
                                       data-cost="${it.totalBiaya}" 
                                       onchange="calcSelectedMph()">
                                <span class="text-xs font-bold text-slate-700">${escapeHtml(it.namaProduk)}</span>
                                <span class="text-[10px] text-slate-400">(${it.qty}x)</span>
                            </div>
                            <span class="text-xs font-black text-slate-800">${formatRp(it.totalBiaya)}</span>
                        </label>`;
                }
            }
            itemList.innerHTML = htmlItems;
        }

        document.getElementById('mph-nominal').value = '';
        document.getElementById('mph-ket').value = '';
        document.getElementById('mph-metode').value = 'Tunai';
        updateMphPreview();

        openModal('modal-pembayaran-hutang');
        setTimeout(function() { document.getElementById('mph-nominal').focus(); }, 200);
    }

    // [NEW] Kalkulasi otomatis nominal saat checkbox dicentang
    function calcSelectedMph() {
        var checkboxes = document.querySelectorAll('.mph-item-cb:checked');
        var totalSelected = 0;
        for (var i = 0; i < checkboxes.length; i++) {
            totalSelected += Number(checkboxes[i].getAttribute('data-cost')) || 0;
        }
        
        var sisa = Number(document.getElementById('mph-sisa-hidden').value) || 0;
        
        // Jika total centang melebihi sisa hutang, batasi ke sisa
        if (totalSelected > sisa) {
            totalSelected = sisa;
            // Opsional: Beri peringatan kecil
            showToast('Total produk melebihi sisa hutang. Dibatasi ke sisa.', 'warning');
        }

        var nominalInput = document.getElementById('mph-nominal');
        if (totalSelected > 0) {
            nominalInput.value = totalSelected.toLocaleString('id-ID');
        } else {
            nominalInput.value = '';
        }
        updateMphPreview();
    }

    // [NEW] Hapus centang jika user mengetik manual
    function clearMphCheckboxes() {
        var checkboxes = document.querySelectorAll('.mph-item-cb');
        for (var i = 0; i < checkboxes.length; i++) {
            checkboxes[i].checked = false;
        }
    }

    function setMphQuick(fraction) {
        var sisa = Number(document.getElementById('mph-sisa-hidden').value) || 0;
        var nominal = Math.round(sisa * fraction);
        document.getElementById('mph-nominal').value = nominal.toLocaleString('id-ID');
        updateMphPreview();
    }

    function updateMphPreview() {
        var nominal = getAngkaBersih('mph-nominal');
        var sisa = Number(document.getElementById('mph-sisa-hidden').value) || 0;
        var btn = document.getElementById('btn-save-mph');
        if (nominal > sisa) {
            btn.disabled = true;
            btn.classList.add('opacity-50');
            btn.title = 'Nominal melebihi sisa hutang';
        } else if (nominal <= 0) {
            btn.disabled = true;
            btn.classList.add('opacity-50');
            btn.title = '';
        } else {
            btn.disabled = false;
            btn.classList.remove('opacity-50');
            btn.title = '';
        }
    }

    function submitPembayaranHutang() {
        var refNota = document.getElementById('mph-ref-hidden').value;
        var nominal = getAngkaBersih('mph-nominal');
        var metode = document.getElementById('mph-metode').value;
        var keterangan = document.getElementById('mph-ket').value.trim();
        var sisa = Number(document.getElementById('mph-sisa-hidden').value) || 0;

        if (nominal <= 0) return Swal.fire('Nominal Kosong', 'Isi nominal pembayaran.', 'warning');
        if (nominal > sisa) return Swal.fire('Nominal Berlebih', 'Nominal tidak boleh melebihi sisa hutang.', 'warning');

        var isFullPay = (nominal === sisa);
        Swal.fire({
            title: isFullPay ? 'Lunasi Hutang?' : 'Konfirmasi Cicilan',
            html: 'Bayar <b>' + formatRp(nominal) + '</b> via <b>' + escapeHtml(metode) + '</b>' +
                  '<br><span class="text-xs text-slate-500">' +
                  (isFullPay ? 'Hutang akan LUNAS setelah ini.' : 'Sisa setelah bayar: ' + formatRp(sisa - nominal)) +
                  '</span>',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Ya, Bayar',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#9333ea'
        }).then(function(res) {
            if (!res.isConfirmed) return;
            Swal.fire({ title: 'Memproses...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });

            google.script.run.withSuccessHandler(function(r) {
                if (!r.success) return Swal.fire('Gagal', r.error, 'error');

                // Update state lokal
                var payData = {
                    id: r.payId,
                    refNota: refNota,
                    tanggal: Date.now(),
                    nominal: nominal,
                    metode: metode,
                    kasir: (state.user && state.user.nama) || '',
                    keterangan: keterangan || 'Cicilan'
                };
                if (!state.pembayaranHutang) state.pembayaranHutang = [];
                state.pembayaranHutang.push(payData);

                // Update metode lokal kalau lunas
                if (r.isLunas) {
                    for (var i = 0; i < state.purchases.length; i++) {
                        if (String(state.purchases[i].refNota) === String(refNota)) {
                            state.purchases[i].metode = 'LUNAS';
                        }
                    }
                }

                closeModal('modal-pembayaran-hutang');
                Swal.fire({
                    icon: 'success',
                    title: r.isLunas ? 'Hutang LUNAS!' : 'Pembayaran Tercatat',
                    html: r.isLunas
                        ? 'Hutang <b>' + escapeHtml(refNota) + '</b> telah lunas.'
                        : 'Sisa hutang: <b>' + formatRp(r.sisaAfter) + '</b>'
                });

                // Refresh UI
                renderHutang();
                renderLaporanLainSetelahPembayaran();
                manualSync(true);
				_suppFetchLastRun = 0;
                _loadSupplementaryData();
				_loadSaldoRingkas();
            }).withFailureHandler(function(err) {
                Swal.fire('Koneksi Gagal', err && err.message ? err.message : 'unknown', 'error');
            }).savePembayaranHutang(storageManager.get('pos_token_final'), {
                refNota: refNota,
                nominal: nominal,
                metode: metode,
                keterangan: keterangan
            });
        });
    }

    function renderLaporanLainSetelahPembayaran() {
        // Refresh laporan yang terpengaruh
        try { renderArusKas(); } catch(e) {}
        try { renderNeraca(); } catch(e) {}
        try { renderJurnal(); } catch(e) {}
        try { renderLabaRugi(); } catch(e) {}
        try { renderDashboard(); } catch(e) {}
    }

    // [PATCH v7.15.1] viewPembayaranHutangHistory — support AST
    function viewPembayaranHutangHistory(refNota) {
        Swal.fire({ title: 'Memuat riwayat...', allowOutsideClick: false, didOpen: function() { Swal.showLoading(); } });

        var isAset = String(refNota).indexOf('AST') === 0;

        google.script.run.withSuccessHandler(function(r) {
            if (!r.success) return Swal.fire('Gagal', r.error, 'error');

            var payments = r.data || [];
            var totalBiaya = 0;
            var supplier = '-';
            var itemsHtml = '';

            if (isAset) {
                // ── Lookup dari _stateAsetList ──
                var a = (_stateAsetList || []).find(function(x) { return String(x.idAset) === String(refNota); });
                if (a) {
                    supplier = a.nama;
                    totalBiaya = a.nilaiPerolehan;
                    itemsHtml =
                        '<div class="flex justify-between text-xs text-slate-600">' +
                            '<span>' + escapeHtml(a.nama) + ' <span class="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded ml-1 font-black">ASET</span></span>' +
                            '<span class="font-bold">' + formatRp(a.nilaiPerolehan) + '</span>' +
                        '</div>' +
                        '<div class="text-[10px] text-slate-400 mt-1">Kategori: ' + escapeHtml(a.kategori || '-') + ' • Tanggal: ' +
                            new Date(a.tanggalPerolehan).toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'numeric'}) + '</div>';
                } else {
                    // Fallback: hitung dari payments saja
                    totalBiaya = payments.reduce(function(s, p) { return s + Number(p.nominal || 0); }, 0);
                    itemsHtml = '<div class="text-[10px] text-slate-400 italic">Data aset tidak ditemukan di cache. Total dihitung dari pembayaran.</div>';
                }
            } else {
                // ── Lookup dari state.purchases (existing) ──
                var batchPurchases = state.purchases.filter(function(p) { return String(p.refNota) === String(refNota); });
                for (var i = 0; i < batchPurchases.length; i++) {
                    totalBiaya += Number(batchPurchases[i].totalBiaya) || 0;
                    if (supplier === '-') supplier = batchPurchases[i].supplier || '-';
                    itemsHtml += '<div class="flex justify-between text-[10px] text-slate-600"><span>' + escapeHtml(batchPurchases[i].namaProduk) + ' <span class="text-slate-400">x' + batchPurchases[i].qty + '</span></span><span class="font-bold">' + formatRp(batchPurchases[i].totalBiaya) + '</span></div>';
                }
            }

            // ── Riwayat pembayaran ──
            var totalDibayar = 0;
            var payHtml = '';
            if (payments.length === 0) {
                payHtml = '<div class="text-center py-4 text-slate-400 text-xs italic">Belum ada pembayaran</div>';
            } else {
                payments.sort(function(a, b) { return a.tanggal - b.tanggal; });
                for (var j = 0; j < payments.length; j++) {
                    var pay = payments[j];
                    totalDibayar += Number(pay.nominal) || 0;
                    var dtStr = new Date(pay.tanggal).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
                    payHtml += '<div class="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-lg p-2">' +
                        '<div class="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] shrink-0"><i class="fas fa-check"></i></div>' +
                        '<div class="flex-1 min-w-0">' +
                            '<div class="flex justify-between"><span class="text-xs font-bold text-emerald-800">' + escapeHtml(pay.keterangan || 'Pembayaran') + '</span><span class="text-xs font-black text-emerald-700">' + formatRp(pay.nominal) + '</span></div>' +
                            '<div class="text-[9px] text-emerald-600 mt-0.5">' + dtStr + ' • ' + escapeHtml(pay.metode) + ' • ' + escapeHtml(pay.kasir) + '</div>' +
                        '</div>' +
                    '</div>';
                }
            }

            var sisa = Math.max(0, totalBiaya - totalDibayar);
            var isLunas = sisa <= 0;

            var html =
                '<div class="text-left">' +
                    '<div class="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-3">' +
                        '<div class="flex justify-between text-xs mb-1"><span class="text-slate-500">' + (isAset ? 'Aset:' : 'Supplier:') + '</span><span class="font-bold">' + escapeHtml(supplier) + '</span></div>' +
                        '<div class="flex justify-between text-xs mb-1"><span class="text-slate-500">Ref:</span><span class="font-mono text-[10px]">' + escapeHtml(refNota) + '</span></div>' +
                        '<div class="flex justify-between text-xs mb-1"><span class="text-slate-500">Status:</span>' + (isLunas ? '<span class="text-emerald-600 font-black">LUNAS ✓</span>' : '<span class="text-red-600 font-black">BELUM LUNAS</span>') + '</div>' +
                    '</div>' +
                    '<p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">' + (isAset ? 'Detail Aset' : 'Daftar Item') + '</p>' +
                    '<div class="bg-slate-50 p-2 rounded-lg mb-3">' + itemsHtml + '<div class="flex justify-between text-xs mt-1 pt-1 border-t border-slate-200"><span class="font-black">Total:</span><span class="font-black">' + formatRp(totalBiaya) + '</span></div></div>' +
                    '<p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Riwayat Pembayaran (' + payments.length + ')</p>' +
                    '<div class="space-y-1.5 mb-3">' + payHtml + '</div>' +
                    '<div class="bg-slate-100 p-3 rounded-lg flex justify-between items-center">' +
                        '<span class="text-xs font-bold text-slate-600">SISA HUTANG:</span>' +
                        '<span class="text-lg font-black ' + (isLunas ? 'text-emerald-600' : 'text-red-600') + '">' + formatRp(sisa) + '</span>' +
                    '</div>' +
                '</div>';

            Swal.fire({
                title: '<i class="fas fa-history text-purple-500 mr-2"></i>Riwayat Hutang' + (isAset ? ' (Aset)' : ''),
                html: html,
                width: 480,
                confirmButtonText: 'Tutup',
                confirmButtonColor: '#64748b'
            });
        }).withFailureHandler(function(err) {
            Swal.fire('Koneksi Gagal', err && err.message ? err.message : 'unknown', 'error');
        }).getPembayaranHutangHistory(storageManager.get('pos_token_final'), refNota);
    }

    // [PATCH v7.15.1] printHutangBukti — support AST
    function printHutangBukti(refNota) {
        var isAset = String(refNota).indexOf('AST') === 0;
        var supplier = '-';
        var tglBatch = '-';
        var totalBiaya = 0;
        var itemsHtml = '';

        if (isAset) {
            var a = (_stateAsetList || []).find(function(x) { return String(x.idAset) === String(refNota); });
            if (!a) return showToast('Data aset tidak ditemukan (coba reload halaman)', 'error');

            supplier = a.nama;
            tglBatch = new Date(a.tanggalPerolehan).toLocaleDateString('id-ID', {day:'2-digit', month:'long', year:'numeric'});
            totalBiaya = a.nilaiPerolehan;
            itemsHtml =
                '<tr>' +
                    '<td>' + escapeHtml(a.nama) + ' <span style="display:inline-block; padding:1px 6px; background:#ede9fe; color:#6d28d9; border-radius:3px; font-size:9px; font-weight:800; margin-left:4px;">ASET</span></td>' +
                    '<td class="text-center">1</td>' +
                    '<td class="text-right">' + formatRp(a.nilaiPerolehan) + '</td>' +
                    '<td class="text-right">' + formatRp(a.nilaiPerolehan) + '</td>' +
                '</tr>';
        } else {
            var batchPurchases = state.purchases.filter(function(p) { return String(p.refNota) === String(refNota); });
            if (batchPurchases.length === 0) return showToast('Data tidak ditemukan', 'error');
            supplier = batchPurchases[0].supplier || '-';
            tglBatch = new Date(batchPurchases[0].tanggal).toLocaleDateString('id-ID', {day:'2-digit', month:'long', year:'numeric'});
            for (var i = 0; i < batchPurchases.length; i++) {
                totalBiaya += Number(batchPurchases[i].totalBiaya) || 0;
                itemsHtml += '<tr><td>' + escapeHtml(batchPurchases[i].namaProduk) + '</td><td class="text-center">' + batchPurchases[i].qty + '</td><td class="text-right">' + formatRp(batchPurchases[i].hargaBeli) + '</td><td class="text-right">' + formatRp(batchPurchases[i].totalBiaya) + '</td></tr>';
            }
        }

        var payments = (state.pembayaranHutang || []).filter(function(p) { return String(p.refNota) === String(refNota); });

        var payHtml = '';
        var totalDibayar = 0;
        payments.sort(function(a, b) { return a.tanggal - b.tanggal; });
        for (var j = 0; j < payments.length; j++) {
            var dt = new Date(payments[j].tanggal).toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'});
            totalDibayar += payments[j].nominal;
            payHtml += '<tr><td>' + dt + '</td><td>' + escapeHtml(payments[j].keterangan || 'Pembayaran') + '</td><td class="text-center">' + escapeHtml(payments[j].metode) + '</td><td class="text-right">' + formatRp(payments[j].nominal) + '</td></tr>';
        }

        var sisa = Math.max(0, totalBiaya - totalDibayar);
        var statusText = sisa <= 0 ? 'LUNAS' : 'BELUM LUNAS';
        var statusColor = sisa <= 0 ? '#10b981' : '#ef4444';

        var toko = escapeHtml(state.setup['Nama Toko'] || 'Toko');
        var alamat = escapeHtml(state.setup['Alamat'] || '');

        var html = '<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">' +
            '<div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px;">' +
                '<h1 style="margin: 0; font-size: 22px;">' + toko + '</h1>' +
                '<p style="margin: 3px 0; font-size: 11px;">' + alamat + '</p>' +
                '<h2 style="margin: 10px 0 3px 0; font-size: 16px;">BUKTI HUTANG ' + (isAset ? 'ASET' : 'SUPPLIER') + '</h2>' +
                '<p style="margin: 0; font-size: 11px;">Ref: ' + escapeHtml(refNota) + '</p>' +
            '</div>' +
            '<table style="width: 100%; font-size: 12px; margin-bottom: 15px;">' +
                '<tr><td style="width: 120px;"><b>' + (isAset ? 'Aset' : 'Supplier') + '</b></td><td>: ' + escapeHtml(supplier) + '</td></tr>' +
                '<tr><td><b>Tanggal ' + (isAset ? 'Perolehan' : 'Nota') + '</b></td><td>: ' + tglBatch + '</td></tr>' +
                '<tr><td><b>Status</b></td><td>: <b style="color: ' + statusColor + ';">' + statusText + '</b></td></tr>' +
            '</table>' +
            '<h4 style="margin: 15px 0 5px 0; font-size: 13px; border-bottom: 1px solid #ccc; padding-bottom: 3px;">' + (isAset ? 'Detail Aset' : 'Daftar Item') + '</h4>' +
            '<table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 15px;">' +
                '<thead><tr style="background: #f0f0f0;"><th style="padding: 5px; text-align: left; border: 1px solid #999;">' + (isAset ? 'Nama Aset' : 'Produk') + '</th><th style="padding: 5px; border: 1px solid #999;">Qty</th><th style="padding: 5px; border: 1px solid #999;">' + (isAset ? 'Nilai' : 'Harga') + '</th><th style="padding: 5px; border: 1px solid #999;">Total</th></tr></thead>' +
                '<tbody>' + itemsHtml + '</tbody>' +
                '<tfoot><tr style="background: #f0f0f0; font-weight: bold;"><td colspan="3" style="padding: 5px; border: 1px solid #999; text-align: right;">TOTAL</td><td style="padding: 5px; border: 1px solid #999; text-align: right;">' + formatRp(totalBiaya) + '</td></tr></tfoot>' +
            '</table>' +
            '<h4 style="margin: 15px 0 5px 0; font-size: 13px; border-bottom: 1px solid #ccc; padding-bottom: 3px;">Riwayat Pembayaran</h4>' +
            '<table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 15px;">' +
                '<thead><tr style="background: #f0f0f0;"><th style="padding: 5px; text-align: left; border: 1px solid #999;">Tanggal</th><th style="padding: 5px; text-align: left; border: 1px solid #999;">Keterangan</th><th style="padding: 5px; border: 1px solid #999;">Metode</th><th style="padding: 5px; border: 1px solid #999;">Nominal</th></tr></thead>' +
                '<tbody>' + (payHtml || '<tr><td colspan="4" style="padding: 5px; text-align: center; border: 1px solid #999; color: #999;">Belum ada pembayaran</td></tr>') + '</tbody>' +
                '<tfoot>' +
                    '<tr style="background: #f0f0f0; font-weight: bold;"><td colspan="3" style="padding: 5px; border: 1px solid #999; text-align: right;">TOTAL DIBAYAR</td><td style="padding: 5px; border: 1px solid #999; text-align: right;">' + formatRp(totalDibayar) + '</td></tr>' +
                    '<tr style="background: ' + (sisa <= 0 ? '#d1fae5' : '#fee2e2') + '; font-weight: bold;"><td colspan="3" style="padding: 5px; border: 1px solid #999; text-align: right;">SISA HUTANG</td><td style="padding: 5px; border: 1px solid #999; text-align: right; color: ' + statusColor + ';">' + formatRp(sisa) + '</td></tr>' +
                '</tfoot>' +
            '</table>' +
            '<div style="margin-top: 30px; text-align: center; font-size: 10px; color: #666; border-top: 1px dashed #ccc; padding-top: 10px;">' +
                'Dicetak pada: ' + new Date().toLocaleString('id-ID') +
            '</div>' +
        '</div>';

        var printDiv = document.createElement('div');
        printDiv.id = 'print-hutang-bukti';
        printDiv.innerHTML = html;
        document.body.appendChild(printDiv);
        printArea('print-hutang-bukti', { removeAfter: true });
    }

    // [MODUL BARU] ANALISIS KEUANGAN 
    var _anChartOmset = null;
    var _anChartCashflow = null;

    function renderAnalisis() {
        // ── Init tanggal default ──
        var startEl = document.getElementById('an-start');
        var endEl = document.getElementById('an-end');
        if (!startEl || !endEl) return;

        if (!startEl.value || !endEl.value) {
            var now = new Date();
            var firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            startEl.value = toLocalDateStr(firstDay);
            endEl.value   = toLocalDateStr(now);
        }

        var startTime = parseLocalDate(startEl.value).setHours(0, 0, 0, 0);
        var endTime   = parseLocalDate(endEl.value).setHours(23, 59, 59, 999);
        if (endTime < startTime) { endTime = startTime + 86400000; }

        // ── Periode sebelumnya (durasi sama, tepat sebelum startTime) ──
        var durasiMs = endTime - startTime;
        var prevStartTime = startTime - durasiMs;
        var prevEndTime   = startTime - 1;

        // ── Metrik periode ini & lalu ──
        var mNow  = computeFinancialMetrics(startTime, endTime);
        var mPrev = computeFinancialMetrics(prevStartTime, prevEndTime);

        // ── Transaksi dalam periode ──
        var trxList = (state.transactions || []).filter(function(t) {
            if (t.tanggal < startTime || t.tanggal > endTime) return false;
            var s = String(t.status || '').trim().toUpperCase();
            return s === 'SUKSES' || s === 'HUTANG';
        });
        var trxPrevCount = (state.transactions || []).filter(function(t) {
            if (t.tanggal < prevStartTime || t.tanggal > prevEndTime) return false;
            var s = String(t.status || '').trim().toUpperCase();
            return s === 'SUKSES' || s === 'HUTANG';
        }).length;

        // ── Render KPI ──
        _anSetText('an-omset', formatRp(mNow.pendapatanNeto));
        _anSetText('an-laba-kotor', formatRp(mNow.labaKotor));
        _anSetText('an-beban', formatRp(mNow.bebanOperasional));
        _anSetText('an-laba-bersih', formatRp(mNow.labaBersih));
        _anSetText('an-trx-count', trxList.length + 'x');

        // Omset growth
        var growthOmset = mPrev.pendapatanNeto > 0
            ? ((mNow.pendapatanNeto - mPrev.pendapatanNeto) / mPrev.pendapatanNeto * 100) : 0;
        _anSetHtml('an-omset-growth', _anDeltaBadge(growthOmset, 'vs periode lalu'));

        // Margin kotor
        var marginKotor = mNow.pendapatanNeto > 0 ? (mNow.labaKotor / mNow.pendapatanNeto * 100) : 0;
        _anSetHtml('an-margin-kotor', _anMarginBadge(marginKotor) + ' margin');

        // Beban ratio
        var bebanRatio = mNow.pendapatanNeto > 0 ? (mNow.bebanOperasional / mNow.pendapatanNeto * 100) : 0;
        _anSetHtml('an-beban-ratio', bebanRatio.toFixed(1) + '% dari omset');

        // Margin bersih
        var marginBersih = mNow.pendapatanNeto > 0 ? (mNow.labaBersih / mNow.pendapatanNeto * 100) : 0;
        var labelBersih = marginBersih >= 15 ? 'text-emerald-600' : marginBersih >= 5 ? 'text-blue-600' : marginBersih > 0 ? 'text-orange-600' : 'text-red-600';
        _anSetHtml('an-margin-bersih', '<span class="' + labelBersih + '">' + marginBersih.toFixed(1) + '% margin</span>');

        // AOV
        var aov = trxList.length > 0 ? (mNow.pendapatanNeto / trxList.length) : 0;
        _anSetText('an-aov', formatRp(aov));

        // Health score (0-100)
        var health = _anComputeHealthScore(mNow, marginKotor, marginBersih, growthOmset);
        _anSetHtml('an-health-score', health.score + '<span class="text-sm text-indigo-200">/100</span>');
        _anSetText('an-health-label', health.label);

        // ── Rasio Keuangan ──
        _anRenderRatios(mNow, marginKotor, marginBersih);

        // ── Chart ──
        _anRenderCharts(startTime, endTime);

        // ── BEP ──
        _anRenderBEP(mNow, marginKotor);

        // ── Insight ──
        _anRenderInsights(mNow, mPrev, growthOmset, marginKotor, marginBersih, trxList);

        // ── Top Produk ──
        _anRenderTopProduk(startTime, endTime);

        // ── Top Kategori ──
        _anRenderTopKategori(startTime, endTime);

        // ── Perbandingan ──
        _anRenderCompare(mNow, mPrev, trxList.length, trxPrevCount);

        // ── Update header toko ──
        var tokoEl = document.getElementById('ui-an-toko');
        if (tokoEl) tokoEl.innerText = (state.setup['Nama Toko'] || 'POS Pro').toUpperCase();
    }

    // Helper: set text aman
    function _anSetText(id, txt) { var el = document.getElementById(id); if (el) el.innerText = txt; }
    function _anSetHtml(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }

    // Badge delta (growth %)
    function _anDeltaBadge(pct, suffix) {
        if (Math.abs(pct) < 0.5) return '<span class="text-slate-400">~0% ' + suffix + '</span>';
        var up = pct > 0;
        var cls = up ? 'text-emerald-500' : 'text-red-500';
        var arrow = up ? 'fa-arrow-up' : 'fa-arrow-down';
        return '<span class="' + cls + '"><i class="fas ' + arrow + ' mr-0.5"></i>' + (up ? '+' : '') + pct.toFixed(1) + '% ' + suffix + '</span>';
    }

    // Badge margin dengan warna
    function _anMarginBadge(pct) {
        var cls = pct >= 25 ? 'text-emerald-500' : pct >= 10 ? 'text-blue-500' : pct > 0 ? 'text-orange-500' : 'text-red-500';
        return '<span class="' + cls + '">' + pct.toFixed(1) + '%</span>';
    }

    // Health score
    function _anComputeHealthScore(m, marginKotor, marginBersih, growth) {
        var score = 0;
        // Profitability (0-40)
        if (marginKotor >= 30) score += 25; else if (marginKotor >= 20) score += 20; else if (marginKotor >= 10) score += 12; else if (marginKotor > 0) score += 5;
        if (marginBersih >= 15) score += 15; else if (marginBersih >= 8) score += 10; else if (marginBersih > 0) score += 5;
        // Growth (0-30)
        if (growth >= 20) score += 30; else if (growth >= 5) score += 22; else if (growth >= 0) score += 15; else if (growth >= -10) score += 8; else score += 0;
        // Liquidity (0-30) — current ratio
        var al = (m.kas || 0) + (m.piutang || 0) + (m.persediaan || 0) + (m.bank || 0) + (m.transit || 0) + (m.deposit || 0);
        var kl = Math.max(0, m.hutang || 0);
        var cr = kl > 0 ? (al / kl) : 999;
        if (cr >= 2) score += 30; else if (cr >= 1.5) score += 22; else if (cr >= 1) score += 15; else score += 5;
        score = Math.max(0, Math.min(100, score));

        var label = score >= 80 ? 'Sangat Sehat' : score >= 65 ? 'Sehat' : score >= 50 ? 'Cukup' : score >= 35 ? 'Perlu Perhatian' : 'Kritis';
        return { score: Math.round(score), label: label };
    }

    // Rasio keuangan
    function _anRenderRatios(m, marginKotor, marginBersih) {
        var al = (m.kas || 0) + (m.piutang || 0) + (m.persediaan || 0) + (m.bank || 0) + (m.transit || 0) + (m.deposit || 0);
        var kl = Math.max(0, m.hutang || 0);
        var currentRatio = kl > 0 ? (al / kl) : null;
        var quickRatio = kl > 0 ? ((al - (m.persediaan || 0)) / kl) : null;
        var der = (m.hutang || 0) > 0 ? ((m.hutang || 0) / Math.max(1, (m.kas || 0) + (m.bank || 0))) : 0;
        var invTurnover = (m.persediaan || 0) > 0 ? (m.hppTotal / m.persediaan) : 0;

        var items = [
            {
                label: 'Current Ratio',
                value: currentRatio === null ? '—' : currentRatio.toFixed(2),
                help: 'Aset lancar / utang lancar',
                status: currentRatio === null ? 'good' : currentRatio >= 1.5 ? 'good' : currentRatio >= 1 ? 'warn' : 'bad'
            },
            {
                label: 'Quick Ratio',
                value: quickRatio === null ? '—' : quickRatio.toFixed(2),
                help: '(Aset lancar - persediaan) / utang',
                status: quickRatio === null ? 'good' : quickRatio >= 1 ? 'good' : quickRatio >= 0.5 ? 'warn' : 'bad'
            },
            {
                label: 'DER (Debt/Equity)',
                value: der === 0 ? '0.00' : der.toFixed(2),
                help: 'Ketergantungan pada hutang',
                status: der <= 1 ? 'good' : der <= 2 ? 'warn' : 'bad'
            },
            {
                label: 'Inventory Turn',
                value: invTurnover.toFixed(1) + 'x',
                help: 'HPP / rata-rata persediaan',
                status: invTurnover >= 2 ? 'good' : invTurnover >= 1 ? 'warn' : 'bad'
            }
        ];

        var colorMap = {
            good: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: 'fa-check-circle' },
            warn: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'fa-exclamation-triangle' },
            bad:  { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: 'fa-times-circle' }
        };

        var html = '';
        items.forEach(function(it) {
            var c = colorMap[it.status];
            html += '<div class="' + c.bg + ' ' + c.border + ' border rounded-xl p-3">' +
                '<div class="flex justify-between items-start mb-1">' +
                    '<p class="text-[10px] font-bold text-slate-600 uppercase tracking-wider">' + it.label + '</p>' +
                    '<i class="fas ' + c.icon + ' ' + c.text + ' text-xs"></i>' +
                '</div>' +
                '<p class="text-xl font-black ' + c.text + '">' + it.value + '</p>' +
                '<p class="text-[9px] text-slate-500 mt-1">' + it.help + '</p>' +
            '</div>';
        });
        _anSetHtml('an-ratios-grid', html);
    }

    // Chart trend omset & cashflow
    function _anRenderCharts(startTime, endTime) {
        if (typeof Chart === 'undefined') return;

        // ── Build data harian ──
        var durasiHari = Math.ceil((endTime - startTime) / 86400000) + 1;
        var step;
        if (durasiHari <= 14) step = 'day';
        else if (durasiHari <= 60) step = 'day';
        else if (durasiHari <= 180) step = 'week';
        else step = 'month';

        var buckets = {};
        var labels = [];

        function getBucketKey(ts) {
            var d = new Date(ts);
            if (step === 'day') return d.toLocaleDateString('id-ID', {day: '2-digit', month: 'short'});
            if (step === 'week') {
                var wk = new Date(d); wk.setDate(d.getDate() - d.getDay());
                return wk.toLocaleDateString('id-ID', {day: '2-digit', month: 'short'});
            }
            return d.toLocaleDateString('id-ID', {month: 'short', year: '2-digit'});
        }

        // Omset per bucket
        (state.transactions || []).forEach(function(t) {
            if (t.tanggal < startTime || t.tanggal > endTime) return;
            var s = String(t.status || '').trim().toUpperCase();
            if (s !== 'SUKSES' && s !== 'HUTANG') return;
            var k = getBucketKey(t.tanggal);
            if (!buckets[k]) buckets[k] = { omset: 0, trx: 0 };
            buckets[k].omset += Number(t.total) || 0;
            buckets[k].trx++;
        });

        // Cashflow (masuk 111 per bucket)
        (state.jurnal || []).forEach(function(j) {
            if (j.tanggal < startTime || j.tanggal > endTime) return;
            if (String(j.kodeAkun).trim() !== '111') return;
            if ((j.debit || 0) <= 0) return;
            var k = getBucketKey(j.tanggal);
            if (!buckets[k]) buckets[k] = { omset: 0, trx: 0, cashIn: 0 };
            buckets[k].cashIn = (buckets[k].cashIn || 0) + (j.debit || 0);
        });

        labels = Object.keys(buckets);
        var dataOmset = labels.map(function(k) { return buckets[k].omset; });
        var dataCash = labels.map(function(k) { return buckets[k].cashIn || 0; });

        // ── Chart Omset ──
        var canvasOmset = document.getElementById('an-chart-omset');
        if (canvasOmset) {
            if (_anChartOmset) { try { _anChartOmset.destroy(); } catch(e){} }
            _anChartOmset = new Chart(canvasOmset.getContext('2d'), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Omset',
                        data: dataOmset,
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        borderWidth: 2, fill: true, tension: 0.35,
                        pointBackgroundColor: '#fff', pointBorderColor: '#2563eb', pointRadius: 3
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { callback: function(v){ return v >= 1e6 ? (v/1e6).toFixed(1)+'jt' : v >= 1e3 ? (v/1e3).toFixed(0)+'rb' : v; }, font:{size:9} } },
                        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } }
                    }
                }
            });
        }

        // ── Chart Cashflow ──
        var canvasCash = document.getElementById('an-chart-cashflow');
        if (canvasCash) {
            if (_anChartCashflow) { try { _anChartCashflow.destroy(); } catch(e){} }
            _anChartCashflow = new Chart(canvasCash.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Kas Masuk',
                        data: dataCash,
                        backgroundColor: 'rgba(16, 185, 129, 0.8)',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { callback: function(v){ return v >= 1e6 ? (v/1e6).toFixed(1)+'jt' : v >= 1e3 ? (v/1e3).toFixed(0)+'rb' : v; }, font:{size:9} } },
                        x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } }
                    }
                }
            });
        }
    }

    // BEP
    function _anRenderBEP(m, marginKotor) {
        var beban = m.bebanOperasional || 0;
        var cmRatio = marginKotor / 100;   // Contribution Margin Ratio
        var bepRupiah = cmRatio > 0 ? (beban / cmRatio) : 0;
        var omset = m.pendapatanNeto || 0;
        var mos = omset > 0 && bepRupiah > 0 ? ((omset - bepRupiah) / omset * 100) : 0;
        var jarakBEP = omset - bepRupiah;

        var status;
        if (bepRupiah === 0) { status = { cls: 'text-slate-400', icon: 'fa-minus-circle', text: 'Beban operasional nol — BEP otomatis tercapai' }; }
        else if (omset >= bepRupiah) {
            status = { cls: 'text-emerald-600', icon: 'fa-check-circle', text: 'Omset SUDAH melewati BEP sebesar ' + formatRp(jarakBEP) };
        } else {
            status = { cls: 'text-red-500', icon: 'fa-exclamation-triangle', text: 'Omset MASIH KURANG ' + formatRp(Math.abs(jarakBEP)) + ' untuk BEP' };
        }

        var html =
            '<div class="bg-amber-50 border border-amber-200 rounded-lg p-3">' +
                '<div class="flex justify-between items-center">' +
                    '<span class="text-xs font-bold text-amber-800">BEP (Rupiah)</span>' +
                    '<span class="text-lg font-black text-amber-900">' + formatRp(bepRupiah) + '</span>' +
                '</div>' +
                '<p class="text-[10px] text-amber-700 mt-1">Beban ÷ CM Ratio (' + marginKotor.toFixed(1) + '%)</p>' +
            '</div>' +
            '<div class="bg-slate-50 border border-slate-200 rounded-lg p-3">' +
                '<div class="flex justify-between items-center">' +
                    '<span class="text-xs font-bold text-slate-700">Margin of Safety</span>' +
                    '<span class="text-base font-black ' + (mos >= 20 ? 'text-emerald-600' : mos >= 0 ? 'text-amber-600' : 'text-red-600') + '">' + mos.toFixed(1) + '%</span>' +
                '</div>' +
                '<p class="text-[10px] text-slate-500 mt-1">Seberapa jauh omset di atas BEP</p>' +
            '</div>' +
            '<div class="' + status.cls + ' text-xs font-bold flex items-center gap-2 p-2 bg-white border border-current/20 rounded-lg">' +
                '<i class="fas ' + status.icon + '"></i>' +
                '<span>' + status.text + '</span>' +
            '</div>';

        _anSetHtml('an-bep-content', html);
    }

    // Insight otomatis
    function _anRenderInsights(m, mPrev, growth, marginKotor, marginBersih, trxList) {
        var insights = [];

        // 1. Growth
        if (growth >= 20) {
            insights.push({ level: 'success', icon: 'fa-rocket', text: 'Penjualan tumbuh ' + growth.toFixed(0) + '% dari periode sebelumnya. Pertahankan momentum!' });
        } else if (growth <= -20 && mPrev.pendapatanNeto > 0) {
            insights.push({ level: 'danger', icon: 'fa-arrow-down', text: 'Penjualan TURUN ' + Math.abs(growth).toFixed(0) + '%. Review strategi pemasaran & stok.' });
        } else if (growth > 0) {
            insights.push({ level: 'info', icon: 'fa-arrow-up', text: 'Penjualan naik ' + growth.toFixed(1) + '% dari periode lalu.' });
        }

        // 2. Margin
        if (marginKotor < 15 && m.pendapatanNeto > 0) {
            insights.push({ level: 'warning', icon: 'fa-percent', text: 'Margin kotor rendah (' + marginKotor.toFixed(1) + '%). Pertimbangkan naikkan harga atau negosiasi HPP.' });
        } else if (marginKotor >= 30) {
            insights.push({ level: 'success', icon: 'fa-percent', text: 'Margin kotor SEHAT (' + marginKotor.toFixed(1) + '%). Struktur harga sudah optimal.' });
        }

        // 3. Laba bersih
        if (m.labaBersih < 0) {
            insights.push({ level: 'danger', icon: 'fa-exclamation-triangle', text: 'RUGI pada periode ini! Beban lebih besar dari laba kotor. Segera evaluasi biaya operasional.' });
        }

        // 4. Kasbon tinggi
        var kasbonOpen = (state.transactions || []).filter(function(t){
            return String(t.status || '').trim().toUpperCase() === 'HUTANG';
        }).reduce(function(s,t){ return s + (t.total - (t.bayar||0)); }, 0);
        if (kasbonOpen > 200000) {
            insights.push({ level: 'warning', icon: 'fa-hand-holding-usd', text: 'Kasbon outstanding ' + formatRp(kasbonOpen) + '. Segera tagih untuk menjaga cashflow.' });
        }

        // 5. Piutang GoPay
        var transit = m.transit || 0;
        if (transit >= 500000) {
            insights.push({ level: 'info', icon: 'fa-hourglass-half', text: 'Saldo In Transit ' + formatRp(transit) + ' belum di-settle. Lakukan Settlement untuk menambah kas bank.' });
        }

        // 6. Beban rasio
        if (m.pendapatanNeto > 0) {
            var bebanRatio = (m.bebanOperasional / m.pendapatanNeto) * 100;
            if (bebanRatio > 40) {
                insights.push({ level: 'warning', icon: 'fa-receipt', text: 'Beban mencapai ' + bebanRatio.toFixed(0) + '% dari omset. Cari pos yang bisa dihemat.' });
            }
        }

        // 7. AOV
        var aov = trxList.length > 0 ? (m.pendapatanNeto / trxList.length) : 0;
        if (aov > 0 && aov < 20000) {
            insights.push({ level: 'info', icon: 'fa-shopping-basket', text: 'Rata-rata transaksi Rp ' + formatRp(aov) + ' masih rendah. Coba program upsell/bundling.' });
        }

        // 8. Stok tipis
        var stokTipis = (state.products || []).filter(function(p){ return p.stok > 0 && p.stok <= 5; });
        if (stokTipis.length > 0) {
            insights.push({ level: 'warning', icon: 'fa-boxes', text: stokTipis.length + ' produk stoknya ≤5. Segera restock agar tidak kehabisan.' });
        }

        // 9. Trx count
        if (trxList.length === 0) {
            insights.push({ level: 'danger', icon: 'fa-info-circle', text: 'Belum ada transaksi pada periode ini. Data analisis akan muncul setelah ada penjualan.' });
        }

        if (insights.length === 0) {
            insights.push({ level: 'success', icon: 'fa-check-circle', text: 'Semua indikator dalam kondisi baik. Pertahankan performa!' });
        }

        var colorMap = {
            danger:  { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     icon: 'text-red-500' },
            warning: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   icon: 'text-amber-500' },
            info:    { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    icon: 'text-blue-500' },
            success: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: 'text-emerald-500' }
        };

        var html = '';
        insights.slice(0, 6).forEach(function(ins) {
            var c = colorMap[ins.level] || colorMap.info;
            html += '<div class="' + c.bg + ' ' + c.border + ' border rounded-lg p-2.5 flex gap-2 items-start">' +
                '<i class="fas ' + ins.icon + ' ' + c.icon + ' mt-0.5 shrink-0"></i>' +
                '<p class="text-[11px] ' + c.text + ' font-medium leading-snug">' + ins.text + '</p>' +
            '</div>';
        });
        _anSetHtml('an-insights', html);
    }

    // Top produk berdasarkan laba
    function _anRenderTopProduk(startTime, endTime) {
        var map = {};
        (state.transactions || []).forEach(function(t) {
            if (t.tanggal < startTime || t.tanggal > endTime) return;
            var s = String(t.status || '').trim().toUpperCase();
            if (s !== 'SUKSES' && s !== 'HUTANG') return;
            var items = [];
            try { items = JSON.parse(t.cartJson); } catch(e) {}
            items.forEach(function(it) {
                var p = (state.products || []).find(function(x){ return String(x.id) === String(it.id); });
                var hpp = p ? (Number(p.hargaBeli) || 0) : 0;
                var qty = Number(it.qty) || 0;
                var jual = Number(it.hargaJual) || 0;
                var laba = (jual - hpp) * qty;
                var key = it.nama || 'Item';
                if (!map[key]) map[key] = { qty: 0, laba: 0, omzet: 0 };
                map[key].qty += qty;
                map[key].laba += laba;
                map[key].omzet += jual * qty;
            });
        });

        // Tambah layanan digital
        (state.layananDigital || []).forEach(function(l) {
            if (l.tanggal < startTime || l.tanggal > endTime) return;
            var jenis = String(l.jenis);
            var nama = jenis === 'TARIK_TUNAI' ? 'Tarik Tunai' : jenis === 'TOPUP_EWALLET' ? 'Top Up E-Wallet' : (String(l.keterangan||'').split(' - ')[0] || 'Produk Digital');
            var fee = Number(l.fee) || 0;
            if (!map[nama]) map[nama] = { qty: 0, laba: 0, omzet: 0 };
            map[nama].qty += 1;
            map[nama].laba += fee;
            map[nama].omzet += jenis === 'PRODUK_DIGITAL' ? (Number(l.nominal) || 0) : fee;
        });

        var arr = Object.keys(map).map(function(k) {
            return { nama: k, qty: map[k].qty, laba: map[k].laba, omzet: map[k].omzet };
        });
        arr.sort(function(a,b){ return b.laba - a.laba; });
        arr = arr.slice(0, 5);

        if (arr.length === 0) {
            _anSetHtml('an-top-produk', '<div class="text-center py-6 text-slate-400 text-xs italic">Belum ada data produk terjual.</div>');
            return;
        }

        var html = '';
        var rankColor = ['text-yellow-500', 'text-slate-400', 'text-amber-700', 'text-slate-300', 'text-slate-300'];
        arr.forEach(function(p, i) {
            var margin = p.omzet > 0 ? (p.laba / p.omzet * 100) : 0;
            html += '<div class="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">' +
                '<div class="flex items-center gap-2 min-w-0 flex-1">' +
                    '<span class="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0"><i class="fas fa-medal ' + rankColor[i] + ' text-xs"></i></span>' +
                    '<div class="min-w-0">' +
                        '<p class="text-xs font-bold text-slate-700 truncate">' + escapeHtml(p.nama) + '</p>' +
                        '<p class="text-[9px] text-slate-400 font-bold">' + p.qty + 'x · margin ' + margin.toFixed(0) + '%</p>' +
                    '</div>' +
                '</div>' +
                '<div class="text-right shrink-0">' +
                    '<p class="text-xs font-black text-emerald-600">' + formatRp(p.laba) + '</p>' +
                    '<p class="text-[9px] text-slate-400">dari ' + formatRp(p.omzet) + '</p>' +
                '</div>' +
            '</div>';
        });
        _anSetHtml('an-top-produk', html);
    }

    // Top kategori berdasarkan margin
    function _anRenderTopKategori(startTime, endTime) {
        var map = {};
        (state.transactions || []).forEach(function(t) {
            if (t.tanggal < startTime || t.tanggal > endTime) return;
            var s = String(t.status || '').trim().toUpperCase();
            if (s !== 'SUKSES' && s !== 'HUTANG') return;
            var items = [];
            try { items = JSON.parse(t.cartJson); } catch(e) {}
            items.forEach(function(it) {
                var p = (state.products || []).find(function(x){ return String(x.id) === String(it.id); });
                var kat = p ? (p.kategori || 'Lainnya') : 'Lainnya';
                var hpp = p ? (Number(p.hargaBeli) || 0) : 0;
                var qty = Number(it.qty) || 0;
                var jual = Number(it.hargaJual) || 0;
                if (!map[kat]) map[kat] = { omzet: 0, hpp: 0 };
                map[kat].omzet += jual * qty;
                map[kat].hpp += hpp * qty;
            });
        });

        var arr = Object.keys(map).map(function(k) {
            var m = map[k];
            var laba = m.omzet - m.hpp;
            var margin = m.omzet > 0 ? (laba / m.omzet * 100) : 0;
            return { nama: k, omzet: m.omzet, laba: laba, margin: margin };
        });
        arr.sort(function(a,b){ return b.margin - a.margin; });
        arr = arr.slice(0, 6);

        if (arr.length === 0) {
            _anSetHtml('an-top-kategori', '<div class="text-center py-6 text-slate-400 text-xs italic">Belum ada data kategori.</div>');
            return;
        }

        var html = '';
        arr.forEach(function(c) {
            var marginCls = c.margin >= 30 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          : c.margin >= 15 ? 'text-blue-700 bg-blue-50 border-blue-200'
                          : 'text-orange-700 bg-orange-50 border-orange-200';
            html += '<div class="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">' +
                '<div class="min-w-0 flex-1">' +
                    '<p class="text-xs font-bold text-slate-700 truncate">' + escapeHtml(c.nama) + '</p>' +
                    '<p class="text-[9px] text-slate-400 font-bold">' + formatRp(c.omzet) + ' · laba ' + formatRp(c.laba) + '</p>' +
                '</div>' +
                '<span class="text-[10px] font-black border px-2 py-0.5 rounded shrink-0 ' + marginCls + '">' + c.margin.toFixed(1) + '%</span>' +
            '</div>';
        });
        _anSetHtml('an-top-kategori', html);
    }

    // Tabel perbandingan
    function _anRenderCompare(mNow, mPrev, trxNow, trxPrev) {
        var rows = [
            { label: 'Omset', now: mNow.pendapatanNeto, prev: mPrev.pendapatanNeto },
            { label: 'Laba Kotor', now: mNow.labaKotor, prev: mPrev.labaKotor },
            { label: 'Beban Operasional', now: mNow.bebanOperasional, prev: mPrev.bebanOperasional },
            { label: 'Laba Bersih', now: mNow.labaBersih, prev: mPrev.labaBersih },
            { label: 'Total Trx', now: trxNow, prev: trxPrev, isCount: true }
        ];

        var html = '';
        rows.forEach(function(r) {
            var pct = r.prev > 0 ? ((r.now - r.prev) / r.prev * 100) : (r.now > 0 ? 999 : 0);
            var pctHtml;
            if (r.prev === 0 && r.now > 0) {
                pctHtml = '<span class="text-emerald-500 font-bold">Baru</span>';
            } else if (r.prev === 0 && r.now === 0) {
                pctHtml = '<span class="text-slate-400">—</span>';
            } else if (Math.abs(pct) < 0.5) {
                pctHtml = '<span class="text-slate-400">~0%</span>';
            } else {
                var up = pct > 0;
                pctHtml = '<span class="' + (up ? 'text-emerald-500' : 'text-red-500') + ' font-bold"><i class="fas fa-arrow-' + (up ? 'up' : 'down') + ' mr-0.5"></i>' + (up ? '+' : '') + pct.toFixed(1) + '%</span>';
            }
            var isNegBeban = r.label === 'Beban Operasional';
            var nowCls = isNegBeban ? 'text-orange-600' : 'text-slate-800';
            var prevCls = 'text-slate-400';

            html += '<tr class="hover:bg-slate-50">' +
                '<td class="p-3 font-bold text-slate-700">' + r.label + '</td>' +
                '<td class="p-3 text-right font-black ' + nowCls + '">' + (r.isCount ? r.now + 'x' : formatRp(r.now)) + '</td>' +
                '<td class="p-3 text-right font-bold ' + prevCls + '">' + (r.isCount ? r.prev + 'x' : formatRp(r.prev)) + '</td>' +
                '<td class="p-3 text-right">' + pctHtml + '</td>' +
            '</tr>';
        });
        _anSetHtml('an-compare-tbody', html);
    }
    
	// [SARAN #2] Update badge sidebar dinamis
    function updateSidebarBadges() {
        // 1. Badge stok tipis (<=5)
        var lowStock = state.products.filter(function(p) { return p.stok <= 5 && p.stok > 0; }).length;
        var stok0 = state.products.filter(function(p) { return p.stok === 0; }).length;
        var totalLow = lowStock + stok0;
        var badgeLS = document.getElementById('sidebar-badge-lowstock');
        if (badgeLS) {
            if (totalLow > 0) {
                badgeLS.innerText = totalLow;
                badgeLS.classList.remove('hidden');
                // Untuk Low Stock (Lebih soft pakai red-100 / red-600)
                badgeLS.className = stok0 > 0 
                    ? 'sidebar-text text-[10px] font-black bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded-md min-w-[18px] text-center'
                    : 'sidebar-text text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-md min-w-[18px] text-center';
            } else {
                badgeLS.classList.add('hidden');
            }
        }
        
        // 2. Badge kasbon aktif — [PATCH] Normalisasi status biar konsisten dgn Buku Piutang
        var kasbonCount = state.transactions.filter(function(t) {
            return String(t.status || '').trim().toUpperCase() === 'HUTANG';
        }).length;
        var badgeK = document.getElementById('sidebar-badge-kasbon');
        if (badgeK) {
            if (kasbonCount > 0) {
                badgeK.innerText = kasbonCount;
                badgeK.className = 'sidebar-text text-[10px] font-black bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded-md min-w-[18px] text-center';
                badgeK.classList.remove('hidden');
            } else {
                badgeK.classList.add('hidden');
            }
        }
    }
	
	// FUNGSI BARU: Render Info Shift di Sidebar
    function updateSidebarShiftInfo() {
        var container = document.getElementById('sidebar-shift-info');
        if (!container) return;

        if (state.currentShift) {
            // Hitung durasi shift
            var waktuBuka = new Date(state.currentShift.waktuBuka);
            var diffMs = Date.now() - waktuBuka.getTime();
            var diffMins = Math.floor(diffMs / 60000);
            var hours = Math.floor(diffMins / 60);
            var mins = diffMins % 60;
            var durasi = (hours > 0 ? hours + 'j ' : '') + mins + 'm';

            // Tampilan Jika Shift Sedang Buka
            container.innerHTML = `
                <div class="flex items-center justify-between mb-2">
                    <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        <i class="fas fa-circle text-emerald-400 text-[6px] mr-1 animate-pulse"></i> Shift Aktif
                    </p>
                    <span class="text-[9px] font-black text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">${durasi}</span>
                </div>
                <div class="space-y-1.5 mb-3">
                    <div class="flex items-center justify-between text-[11px]">
                        <span class="text-slate-500 font-bold">Kasir</span>
                        <span class="text-white font-extrabold truncate max-w-[110px] text-right">${escapeHtml(state.user.nama)}</span>
                    </div>
                    <div class="flex items-center justify-between text-[11px]">
                        <span class="text-slate-500 font-bold">Modal</span>
                        <span class="text-blue-400 font-extrabold">${formatRp(state.currentShift.modalAwal || 0)}</span>
                    </div>
                </div>
                <button onclick="openCloseShiftModal()" class="w-full py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg font-bold text-[10px] border border-indigo-500/30 transition-all flex items-center justify-center gap-1.5 active:scale-95">
                    <i class="fas fa-cash-register"></i> Tutup Shift
                </button>
            `;
        } else {
            // Tampilan Jika Shift Belum Buka
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-1 text-center">
                    <div class="w-8 h-8 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mb-2 border border-red-500/20">
                        <i class="fas fa-store-slash text-xs"></i>
                    </div>
                    <p class="text-[10px] font-bold text-slate-400 mb-2">Shift Belum Dibuka</p>
                    <button onclick="openModal('modal-shift-open')" class="w-full py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg font-bold text-[10px] border border-emerald-500/30 transition-all flex items-center justify-center gap-1.5 active:scale-95">
                        <i class="fas fa-play"></i> Buka Shift
                    </button>
                </div>
            `;
        }
    }

    /* ── 1. ACCORDION SECTION ── */
    function toggleSidebarSection(sectionId) {
        var sec = document.querySelector('.sidebar-section[data-section="' + sectionId + '"]');
        if (!sec) return;
        var isCollapsed = sec.classList.toggle('collapsed');

        var st = {};
        try { st = JSON.parse(storageManager.get('pos_sidebar_sections') || '{}'); } catch(e) {}
        st[sectionId] = isCollapsed ? 'collapsed' : 'expanded';
        storageManager.set('pos_sidebar_sections', JSON.stringify(st));
    }

    function applySidebarSectionState() {
        var st = {};
        try { st = JSON.parse(storageManager.get('pos_sidebar_sections') || '{}'); } catch(e) {}
        document.querySelectorAll('.sidebar-section').forEach(function(sec) {
            var id = sec.getAttribute('data-section');
            if (st[id] === 'collapsed') sec.classList.add('collapsed');
        });
    }

    function expandSectionOfView(viewId) {
        var btn = document.querySelector('.nav-btn[data-target="' + viewId + '"]');
        if (!btn) return;
        var sec = btn.closest('.sidebar-section');
        if (sec && sec.classList.contains('collapsed')) {
            sec.classList.remove('collapsed');
            var st = {};
            try { st = JSON.parse(storageManager.get('pos_sidebar_sections') || '{}'); } catch(e) {}
            st[sec.getAttribute('data-section')] = 'expanded';
            storageManager.set('pos_sidebar_sections', JSON.stringify(st));
        }
    }

    /* ── 2. AGGREGATE BADGE di HEADER SECTION ── */
    function updateSectionBadges() {
        var analitikSec = document.querySelector('.sidebar-section[data-section="analitik"]');
        if (!analitikSec) return;
        var badge = analitikSec.querySelector('[data-section-badge]');
        if (!badge) return;

        var total = 0;
        var low = document.getElementById('sidebar-badge-lowstock');
        var kas = document.getElementById('sidebar-badge-kasbon');
        if (low && !low.classList.contains('hidden')) total += parseInt(low.innerText) || 0;
        if (kas && !kas.classList.contains('hidden')) total += parseInt(kas.innerText) || 0;

        if (total > 0) {
            badge.innerText = total;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    /* ── 3. FLYOUT (hover saat collapsed) ── */
    var _flyoutTimer = null;

    function initSidebarFlyout() {
        var flyout = document.getElementById('sidebar-flyout');
        if (!flyout) {
            flyout = document.createElement('div');
            flyout.id = 'sidebar-flyout';
            flyout.className = 'sidebar-flyout';
            document.body.appendChild(flyout);
            flyout.addEventListener('mouseenter', function() {
                if (_flyoutTimer) { clearTimeout(_flyoutTimer); _flyoutTimer = null; }
            });
            flyout.addEventListener('mouseleave', hideSidebarFlyout);
        }

        document.querySelectorAll('.nav-btn[data-target]').forEach(function(btn) {
            if (btn.hasAttribute('data-flyout-bound')) return;
            btn.setAttribute('data-flyout-bound', '1');

            btn.addEventListener('mouseenter', function() {
                var sidebar = document.getElementById('sidebar');
                if (!sidebar.classList.contains('collapsed')) return;
                if (window.innerWidth < 1024) return;
                if (_flyoutTimer) clearTimeout(_flyoutTimer);
                _flyoutTimer = setTimeout(function() { showSidebarFlyout(btn); }, 180);
            });

            btn.addEventListener('mouseleave', function() {
                if (_flyoutTimer) { clearTimeout(_flyoutTimer); _flyoutTimer = null; }
                _flyoutTimer = setTimeout(hideSidebarFlyout, 150);
            });
        });
    }

    function showSidebarFlyout(btn) {
        var target = btn.getAttribute('data-target');
        var sectionEl = btn.closest('.sidebar-section');
        if (!sectionEl) return;

        var sectionName = (sectionEl.querySelector('.sidebar-section-label') || {}).innerText || 'Menu';
        var items = sectionEl.querySelectorAll('.nav-btn[data-target]');

        var html = '<div class="flyout-header">' + escapeHtml(sectionName) + '</div>';
        items.forEach(function(item) {
            var t = item.getAttribute('data-target');
            var icon = (item.querySelector('i') || {}).className || '';
            var labelEl = item.querySelector('.sidebar-text');
            var label = labelEl ? labelEl.innerText : t;
            var isActive = (t === target);

            var badgeHtml = '';
            var badge = item.querySelector('#sidebar-badge-lowstock, #sidebar-badge-kasbon');
            if (badge && !badge.classList.contains('hidden')) {
                badgeHtml = '<span class="flyout-badge">' + escapeHtml(badge.innerText) + '</span>';
            }

            html += '<button class="flyout-item' + (isActive ? ' active' : '') + '" ' +
                    'onclick="flyoutNavigate(\'' + safeJsArg(t) + '\')">' +
                    '<i class="' + icon + '"></i>' +
                    '<span>' + escapeHtml(label) + '</span>' +
                    badgeHtml +
                    '</button>';
        });

        var flyout = document.getElementById('sidebar-flyout');
        flyout.innerHTML = html;
        flyout.classList.add('show');

        // Position near button
        var rect = btn.getBoundingClientRect();
        var fh = flyout.offsetHeight;
        var top = rect.top - 8;
        if (top + fh > window.innerHeight - 12) top = window.innerHeight - fh - 12;
        if (top < 12) top = 12;
        flyout.style.top = top + 'px';
    }

    function hideSidebarFlyout() {
        var flyout = document.getElementById('sidebar-flyout');
        if (flyout) flyout.classList.remove('show');
    }

    function flyoutNavigate(target) {
        hideSidebarFlyout();
        switchView(target);
    }

    /* ── 4. USER MENU POPUP ── */
    function toggleUserMenu() {
        var popup = document.getElementById('user-menu-popup');
        if (!popup) return;
        popup.classList.toggle('show');
    }
    function closeUserMenu() {
        var popup = document.getElementById('user-menu-popup');
        if (popup) popup.classList.remove('show');
    }
    document.addEventListener('click', function(e) {
        var popup = document.getElementById('user-menu-popup');
        var trigger = document.getElementById('user-menu-trigger');
        if (!popup || !trigger) return;
        if (popup.classList.contains('show') &&
            !e.target.closest('#user-menu-popup') &&
            !e.target.closest('#user-menu-trigger')) {
            popup.classList.remove('show');
        }
    });

    /* ── 5. UPDATE BOTTOM USER INFO ── */
    function updateBottomUserInfo() {
        if (!state || !state.user) return;
        var nameEl = document.getElementById('ui-user-name-bottom');
        var roleEl = document.getElementById('ui-user-role-bottom');
        var avatar = document.getElementById('user-avatar-initials');
        if (nameEl) nameEl.innerText = state.user.nama || '-';
        if (roleEl) roleEl.innerText = state.user.role || '-';
        if (avatar) {
            var initials = String(state.user.nama || '?').split(/\s+/)
                .map(function(w) { return w[0] || ''; })
                .join('').substring(0, 2).toUpperCase();
            avatar.innerText = initials || '?';
        }
    }

    /* ── 6. WRAP SWITCHVIEW — auto expand section + refresh badges ── */
    (function patchSwitchView() {
        var _orig = window.switchView;
        if (typeof _orig !== 'function' || window._switchViewPatched) return;
        window._switchViewPatched = true;
        window.switchView = function(id) {
            _orig(id);
            expandSectionOfView(id);
            setTimeout(updateSectionBadges, 100);
        };
    })();

    /* ── 7. WRAP updateSidebarBadges — aggregate ke header ── */
    (function patchUpdateBadges() {
        var _orig = window.updateSidebarBadges;
        if (typeof _orig !== 'function' || window._updateBadgesPatched) return;
        window._updateBadgesPatched = true;
        window.updateSidebarBadges = function() {
            _orig();
            updateSectionBadges();
        };
    })();

    /* ── 8. WRAP initApp — isi user info bottom ── */
    (function patchInitApp() {
        var _orig = window.initApp;
        if (typeof _orig !== 'function' || window._initAppPatched) return;
        window._initAppPatched = true;
        window.initApp = function(data) {
            _orig(data);
            updateBottomUserInfo();
            setTimeout(function() {
                updateSectionBadges();
                initSidebarFlyout();
            }, 300);
        };
    })();

    /* ── 9. INIT ── */
    function initSidebarAccordion() {
        applySidebarSectionState();
        initSidebarFlyout();
        updateSectionBadges();
        // Hide flyout when sidebar expands
        var sidebar = document.getElementById('sidebar');
        if (sidebar) {
            var observer = new MutationObserver(function() {
                if (!sidebar.classList.contains('collapsed')) hideSidebarFlyout();
            });
            observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSidebarAccordion);
    } else {
        initSidebarAccordion();
    }

    /* ── 10. Close user menu saat ESC ── */
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            var popup = document.getElementById('user-menu-popup');
            if (popup && popup.classList.contains('show')) {
                popup.classList.remove('show');
            }
        }
    });
