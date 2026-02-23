/**
 * NARUKAMI Admin - Shared Auth & UI Layer
 * Supabase Google OAuth + Nav injection + Toast + Skeleton
 */

let _supabase = null;
let _currentUser = null;
let _accessToken = null;

// ==========================================
// Initialisation (called on DOMContentLoaded)
// ==========================================
async function initAdmin() {
    try {
        // 1. Get Supabase config — キャッシュ優先で即時取得
        let config = _loadConfigCache();
        if (!config) {
            const configRes = await fetch('/api/config');
            if (!configRes.ok) throw new Error('Failed to load config');
            config = await configRes.json();
            if (!config.supabaseUrl || !config.supabaseAnonKey) {
                throw new Error('Supabase config is missing');
            }
            _saveConfigCache(config);
        }

        // 2. Supabase クライアント初期化
        _supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

        // 3. セッション確認（ローカルストレージから即時取得・ネットワーク不要）
        const { data: { session } } = await _supabase.auth.getSession();

        if (!session) {
            window.location.href = '/admin/login';
            return;
        }

        _accessToken = session.access_token;
        _currentUser = session.user;

        // 4. ナビ注入 → ページ初期化（ホワイトリスト再確認は不要。
        //    ログイン時に確認済み。各API呼び出しで401なら自動リダイレクト）
        _injectNav(_currentUser);

        if (typeof onAdminReady === 'function') {
            onAdminReady(_currentUser);
        }

    } catch (err) {
        console.error('[Admin] Init error:', err);
        window.location.href = '/admin/login';
    }
}

// ==========================================
// Auth helpers
// ==========================================
function getToken() { return _accessToken; }
function getCurrentUser() { return _currentUser; }

async function adminLogout() {
    sessionStorage.removeItem('_nk_cfg');
    if (_supabase) await _supabase.auth.signOut();
    window.location.href = '/admin/login';
}

// ==========================================
// Config cache (sessionStorage)
// ==========================================
function _loadConfigCache() {
    try {
        const raw = sessionStorage.getItem('_nk_cfg');
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function _saveConfigCache(config) {
    try { sessionStorage.setItem('_nk_cfg', JSON.stringify(config)); } catch {}
}

// ==========================================
// API helpers
// ==========================================
async function apiGet(url) {
    const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (res.status === 401) {
        window.location.href = '/admin/login';
        return null;
    }
    return res;
}

async function apiPost(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(body)
    });
    if (res.status === 401) {
        window.location.href = '/admin/login';
        return null;
    }
    return res;
}

// ==========================================
// Nav bar injection
// ==========================================
const NAV_LINKS = [
    { href: '/admin/dashboard',         label: 'ダッシュボード', match: ['/admin', '/admin/dashboard'] },
    { href: '/admin/create',            label: '通知作成',       match: ['/admin/create'] },
    { href: '/admin/sequences',         label: 'ステップ配信',   match: ['/admin/sequences'] },
    { href: '/admin/users',             label: 'ユーザー',       match: ['/admin/users'] },
    { href: '/admin/managed',           label: 'テナント管理',   match: ['/admin/managed'] },
];

function _injectNav(user) {
    const root = document.getElementById('admin-nav-root');
    if (!root) return;

    const path = window.location.pathname.replace(/\/$/, '') || '/admin';

    const linksHtml = NAV_LINKS.map(({ href, label, match }) => {
        const isActive = match.some(m => path === m || path.startsWith(m + '/'));
        return `<a href="${href}" class="${isActive ? 'active' : ''}">${label}</a>`;
    }).join('');

    const initial = (user.email || '?')[0].toUpperCase();
    const email = user.email || '';

    root.innerHTML = `
        <nav class="admin-nav">
            <a class="admin-nav-logo" href="/admin/dashboard">運営管理事務局</a>
            <div class="admin-nav-links">${linksHtml}</div>
            <div class="admin-nav-right">
                <span class="admin-nav-email">${escapeHtml(email)}</span>
                <div class="admin-nav-avatar" title="${escapeHtml(email)}">${escapeHtml(initial)}</div>
                <button class="admin-nav-logout" id="adminLogoutBtn">ログアウト</button>
            </div>
        </nav>`;

    document.getElementById('adminLogoutBtn').addEventListener('click', adminLogout);

    // Ensure toast container exists
    if (!document.getElementById('toast-container')) {
        const tc = document.createElement('div');
        tc.id = 'toast-container';
        document.body.appendChild(tc);
    }
}

// ==========================================
// Toast notifications
// ==========================================
function toast(type, title, message, duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const icon = icons[type] || icons.info;

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <div class="toast-body">
            <div class="toast-title">${escapeHtml(title)}</div>
            ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
        </div>`;

    container.appendChild(el);

    setTimeout(() => {
        el.classList.add('toast-out');
        el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duration);
}

// ==========================================
// Skeleton helpers
// ==========================================
function skeletonKpis(containerId, count = 4) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = Array(count).fill(
        `<div class="skeleton skeleton-kpi"></div>`
    ).join('');
}

function skeletonRows(containerId, rows = 5) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = Array(rows).fill(
        `<div class="skeleton skeleton-row" style="margin-bottom:8px"></div>`
    ).join('');
}

// ==========================================
// Button loading state
// ==========================================
function setButtonLoading(btn, loading, label) {
    if (loading) {
        btn.disabled = true;
        btn._originalHtml = btn.innerHTML;
        btn.innerHTML = `<span class="btn-spinner"></span> ${escapeHtml(label || '処理中...')}`;
    } else {
        btn.disabled = false;
        if (btn._originalHtml) btn.innerHTML = btn._originalHtml;
    }
}

// ==========================================
// Utilities (shared with pages)
// ==========================================
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function formatNumber(num) {
    if (num === null || num === undefined) return '-';
    return Number(num).toLocaleString('ja-JP');
}

function formatPercent(num) {
    if (num === null || num === undefined) return '-';
    return `${Number(num).toFixed(1)}%`;
}

function formatDateTime(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleString('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
}

function updateTrend(elementId, changePct) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const positive = changePct >= 0;
    el.textContent = `${positive ? '▲' : '▼'} ${Math.abs(changePct).toFixed(1)}%`;
    el.className = `kpi-trend ${positive ? 'positive' : 'negative'}`;
}

// ==========================================
// Confirm dialog (replaces browser confirm())
// ==========================================
function confirmDialog(title, message, confirmLabel = '実行', danger = false) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;display:flex;align-items:center;justify-content:center;';
        const confirmColor = danger ? '#ef4444' : '#6366F1';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:12px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 24px 64px rgba(0,0,0,.18);">
                <h3 style="margin:0 0 10px;font-size:17px;color:#1a1a2e;">${escapeHtml(title)}</h3>
                <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.65;">${escapeHtml(message)}</p>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button id="_cd_cancel" style="padding:8px 20px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-size:14px;color:#555;">キャンセル</button>
                    <button id="_cd_ok" style="padding:8px 20px;background:${confirmColor};color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">${escapeHtml(confirmLabel)}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const close = (result) => { overlay.remove(); resolve(result); };
        overlay.querySelector('#_cd_ok').addEventListener('click', () => close(true));
        overlay.querySelector('#_cd_cancel').addEventListener('click', () => close(false));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    });
}

// ==========================================
// Boot
// ==========================================
document.addEventListener('DOMContentLoaded', initAdmin);
