/**
 * MODSKINFF PREMIUM SHELL V3 — main.js
 * Giao tiếp: Web → api.php (proxy) → admin_app.py (VPS)
 */

// Tự động nhận diện nếu chạy trực tiếp trên Flask (port 5000)
const IS_DIRECT = window.location.port === '5000';
const PHP_PROXY = 'api.php';

const app = {
    user: null,

    init: async function() {
        await this.checkInitialStatus();
        this.startHeartbeat();
    },

    // ── CHECK STATUS & AUTO-LOGIN ─────────────────
    checkInitialStatus: async function() {
        try {
            let url = IS_DIRECT ? '/api/check_status' : `${PHP_PROXY}?action=check_status`;
            const r = await fetch(url);
            const d = await r.json();
            if (d.status === 'offline') {
                this.showOffline();
            } else {
                document.getElementById('offline-screen').classList.add('hidden');
                this.user = localStorage.getItem('mod_user');
                const pass = localStorage.getItem('mod_pass');
                if (this.user && pass) {
                    await this.verifySession(this.user, pass);
                } else {
                    document.getElementById('auth-section').classList.remove('hidden');
                }
            }
        } catch(e) {
            this.showOffline();
        }
    },


    showOffline: function() {
        document.getElementById('offline-screen').classList.remove('hidden');
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('dashboard-section').classList.add('hidden');
    },

    verifySession: async function(u, p) {
        try {
            const r = await this.apiCall('POST', '/web/login', { username: u, password: p });
            if (r.status === 'success') {
                this.showDashboard();
                document.getElementById('display-balance').textContent = `${(r.balance||0).toLocaleString()} VNĐ`;
            } else {
                localStorage.removeItem('mod_user');
                localStorage.removeItem('mod_pass');
                document.getElementById('auth-section').classList.remove('hidden');
            }
        } catch(e) {
            document.getElementById('auth-section').classList.remove('hidden');
        }
    },

    // ── HEARTBEAT ─────────────────────────────────
    startHeartbeat: function() {
        const dot = document.getElementById('server-dot');
        const status = document.getElementById('server-status');

        setInterval(async () => {
            try {
                let url = IS_DIRECT ? '/api/check_status' : `${PHP_PROXY}?action=check_status`;
                const r = await fetch(url);
                const d = await r.json();
                if (d.status === 'online') {
                    if (!document.getElementById('offline-screen').classList.contains('hidden')) {
                        location.reload();
                    }
                    if (dot) {
                        dot.style.background = '#00ff88';
                        dot.style.boxShadow = '0 0 15px #00ff88';
                        status.textContent = 'Hệ thống đang trực tuyến';
                        status.style.color = '#00ff88';
                    }
                } else {
                    this.showOffline();
                }
            } catch(e) {
                this.showOffline();
            }
        }, 5000);
    },

    // ── AUTH ───────────────────────────────────────
    toggleAuth: function() {
        document.getElementById('login-view').classList.toggle('hidden');
        document.getElementById('register-view').classList.toggle('hidden');
    },

    login: async function() {
        const u = document.getElementById('l-user').value;
        const p = document.getElementById('l-pass').value;
        const btn = document.getElementById('btn-login');

        if (!u || !p) return alert('Vui lòng nhập đầy đủ thông tin');

        // Check VPS online
        try {
            let statusUrl = IS_DIRECT ? '/api/check_status' : `${PHP_PROXY}?action=check_status`;
            const sr = await fetch(statusUrl);
            const sd = await sr.json();
            if (sd.status === 'offline') return alert('LỖI: VPS hiện đang Offline!');
        } catch(e) { return alert('Không kết nối được tới máy chủ.'); }

        btn.innerHTML = '<span class="loader"></span> ĐANG XÁC THỰC...';
        btn.disabled = true;

        try {
            const r = await this.apiCall('POST', '/web/login', { username: u, password: p });
            if (r.status === 'success') {
                localStorage.setItem('mod_user', u);
                localStorage.setItem('mod_pass', p);
                this.user = u;
                this.showDashboard();
                document.getElementById('display-balance').textContent = `${(r.balance||0).toLocaleString()} VNĐ`;
            } else {
                alert(r.msg || 'Sai tên đăng nhập hoặc mật khẩu');
            }
        } catch(e) {
            alert('Lỗi kết nối VPS.');
        }

        btn.innerHTML = 'ĐĂNG NHẬP NGAY';
        btn.disabled = false;
    },

    register: async function() {
        const email = document.getElementById('r-email').value;
        const user = document.getElementById('r-user').value;
        const pass = document.getElementById('r-pass').value;
        const btn = document.getElementById('btn-reg');

        if (!email || !user || !pass) return alert('Vui lòng nhập đủ thông tin');

        btn.innerHTML = '<span class="loader"></span> ĐANG GỬI MÃ...';
        btn.disabled = true;

        try {
            const r = await this.apiCall('POST', '/web/register', { email, username: user, password: pass });
            if (r.status === 'success') {
                document.getElementById('reg-step-1').classList.add('hidden');
                document.getElementById('reg-step-2').classList.remove('hidden');
            } else {
                alert(r.msg || 'Không thể gửi email. Kiểm tra lại.');
            }
        } catch(e) {
            alert('Lỗi kết nối.');
        }

        btn.innerHTML = 'NHẬN MÃ XÁC THỰC';
        btn.disabled = false;
    },

    verifyOTP: async function() {
        const otp = document.getElementById('r-otp').value;
        const user = document.getElementById('r-user').value;
        const btn = document.getElementById('btn-verify');

        if (!otp) return alert('Vui lòng nhập mã OTP');

        btn.innerHTML = '<span class="loader"></span> ĐANG XÁC NHẬN...';
        btn.disabled = true;

        try {
            const r = await this.apiCall('POST', '/web/verify_otp', { username: user, otp });
            if (r.status === 'success') {
                alert('Đăng ký thành công! Bạn có thể đăng nhập.');
                location.reload();
            } else {
                alert('Mã OTP không chính xác!');
            }
        } catch(e) {
            alert('Lỗi kết nối.');
        }

        btn.innerHTML = 'XÁC NHẬN TẠO TÀI KHOẢN';
        btn.disabled = false;
    },

    // ── DASHBOARD ─────────────────────────────────
    showDashboard: function() {
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('dashboard-section').classList.remove('hidden');
        document.getElementById('display-name').textContent = this.user;
        this.pollBalance();
    },

    logout: function() {
        localStorage.removeItem('mod_user');
        localStorage.removeItem('mod_pass');
        location.reload();
    },

    // ── DEPOSIT ───────────────────────────────────
    showDeposit: function() {
        document.getElementById('deposit-modal').classList.toggle('hidden');
    },

    createQR: async function() {
        const amount = document.getElementById('dep-amount').value;
        if (!amount || amount < 10000) return alert('Số tiền tối thiểu 10,000đ');

        try {
            const r = await this.apiCall('POST', '/web/create_deposit', { amount, username: this.user });
            if (r.bank_id && r.account_no) {
                const url = `https://img.vietqr.io/image/${r.bank_id}-${r.account_no}-compact.png?amount=${amount}&addInfo=${encodeURIComponent(r.content)}`;
                document.getElementById('qr-img').src = url;
                document.getElementById('qr-info').textContent = r.content;
                document.getElementById('qr-result').classList.remove('hidden');
            } else {
                // Fallback nếu API chưa có endpoint
                const bankId = 'MB';
                const accountNo = '78908369999';
                const content = `NAP ${this.user.toUpperCase()}`;
                const url = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact.png?amount=${amount}&addInfo=${encodeURIComponent(content)}`;
                document.getElementById('qr-img').src = url;
                document.getElementById('qr-info').textContent = content;
                document.getElementById('qr-result').classList.remove('hidden');
            }
        } catch(e) {
            alert('Lỗi tạo QR.');
        }
    },

    // ── POLL BALANCE ──────────────────────────────
    pollBalance: function() {
        setInterval(async () => {
            if (!this.user) return;
            try {
                const r = await this.apiCall('GET', '/web/balance', { username: this.user });
                if (r.balance !== undefined) {
                    document.getElementById('display-balance').textContent = `${r.balance.toLocaleString()} VNĐ`;
                }
            } catch(e) {}
        }, 5000);
    },

    // ── API HELPER ────────────────────────────────
    apiCall: async function(method, path, data) {
        const opts = { credentials: 'include' };
        let url = IS_DIRECT ? `/api${path}` : `${PHP_PROXY}?path=${encodeURIComponent(path)}`;

        if (method === 'GET' && data) {
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(data)) {
                if (v !== '' && v != null) params.set(k, v);
            }
            const qs = params.toString();
            if (qs) url += '&' + qs;
            opts.method = 'GET';
        } else {
            opts.method = method;
            opts.headers = { 'Content-Type': 'application/json' };
            if (data) opts.body = JSON.stringify(data);
        }

        const resp = await fetch(url, opts);
        return await resp.json();
    }
};

window.onload = () => app.init();
