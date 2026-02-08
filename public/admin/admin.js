// ドメインベースでテナントを識別
let currentTenantId = null;
let currentTenant = null;

async function identifyTenantByDomain() {
    const domain = window.location.hostname;
    
    // モックモード（実際のAPI呼び出しは将来実装）
    // 実際には /api/tenants?domain=xxx でテナント情報を取得
    if (domain.includes('example.com') || domain.includes('localhost')) {
        currentTenantId = 1;
        currentTenant = {
            id: 1,
            name: 'サンプル企業A',
            domain: domain,
            plan: 'pro'
        };
    } else {
        // デフォルトテナント（モック）
        currentTenantId = 1;
        currentTenant = {
            id: 1,
            name: 'デフォルトテナント',
            domain: domain,
            plan: 'basic'
        };
    }
    
    // テナント情報を表示
    const tenantTitle = document.getElementById('tenantTitle');
    const currentDomainEl = document.getElementById('currentDomain');
    
    if (tenantTitle && currentTenant) {
        tenantTitle.textContent = `${currentTenant.name} - 管理画面`;
    }
    if (currentDomainEl) {
        currentDomainEl.textContent = domain;
    }
    
    return currentTenantId;
}

// 認証チェック
async function checkAuth() {
    // テナントを識別
    await identifyTenantByDomain();
    
    const password = localStorage.getItem('adminPassword');
    
    if (!password) {
        showLoginScreen();
        return false;
    }

    // パスワード検証（stats APIで確認）
    try {
        const response = await fetch('/api/stats', {
            headers: {
                'Authorization': `Bearer ${password}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem('adminPassword');
            showLoginScreen();
            return false;
        }

        if (response.ok) {
            showMainScreen();
            return true;
        }
    } catch (error) {
        console.error('Auth check error:', error);
        showLoginScreen();
        return false;
    }

    return false;
}

// ログイン画面表示
function showLoginScreen() {
    const loginScreen = document.getElementById('loginScreen');
    const mainScreen = document.getElementById('mainScreen');
    const createScreen = document.getElementById('createScreen');
    
    if (loginScreen) loginScreen.style.display = 'flex';
    if (mainScreen) mainScreen.style.display = 'none';
    if (createScreen) createScreen.style.display = 'none';
}

// メイン画面表示
function showMainScreen() {
    const loginScreen = document.getElementById('loginScreen');
    const mainScreen = document.getElementById('mainScreen');
    
    if (loginScreen) loginScreen.style.display = 'none';
    if (mainScreen) mainScreen.style.display = 'block';
    
    loadDashboard();
    loadNotifications();
}

// ログイン処理
async function login() {
    const password = document.getElementById('passwordInput').value;
    const errorDiv = document.getElementById('loginError');

    if (!password) {
        errorDiv.textContent = 'パスワードを入力してください';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/stats', {
            headers: {
                'Authorization': `Bearer ${password}`
            }
        });

        if (response.ok) {
            localStorage.setItem('adminPassword', password);
            showMainScreen();
        } else {
            errorDiv.textContent = 'パスワードが正しくありません';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = 'エラーが発生しました';
        errorDiv.style.display = 'block';
    }
}

// ログアウト処理
function logout() {
    localStorage.removeItem('adminPassword');
    showLoginScreen();
}

// ダッシュボードデータ読み込み
let usersChart = null;
let notificationsChart = null;

async function loadDashboard() {
    await loadKPIs();
    await loadTrends('users', '30d');
    await loadNotificationsChart();
}

// KPIサマリ読み込み
async function loadKPIs() {
    try {
        const password = localStorage.getItem('adminPassword');
        const url = currentTenantId 
            ? `/api/analytics?type=overview&tenant_id=${currentTenantId}`
            : '/api/analytics?type=overview';
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${password}`
            }
        });

        if (response.ok) {
            const result = await response.json();
            const data = result.data;

            // KPIカード更新
            document.getElementById('kpiTotalUsers').textContent = formatNumber(data.total_users);
            document.getElementById('kpiNewUsers').textContent = formatNumber(data.new_users_this_week);
            document.getElementById('kpiOpenRate').textContent = formatPercent(data.avg_open_rate);
            document.getElementById('kpiCtr').textContent = formatPercent(data.avg_ctr);

            // トレンド表示
            updateTrend('kpiUsersTrend', data.trends.users_change_pct);
            updateTrend('kpiNewUsersTrend', data.trends.new_users_change_pct);
            updateTrend('kpiOpenRateTrend', data.trends.open_rate_change_pct);
            updateTrend('kpiCtrTrend', data.trends.ctr_change_pct);
        }
    } catch (error) {
        console.error('KPI load error:', error);
    }
}

// トレンド表示更新
function updateTrend(elementId, changePct) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const isPositive = changePct >= 0;
    const symbol = isPositive ? '▲' : '▼';
    const color = isPositive ? '#28a745' : '#dc3545';
    
    element.textContent = `${symbol} ${Math.abs(changePct).toFixed(1)}%`;
    element.style.color = color;
}

// グラフデータ読み込み
async function loadTrends(metric, period) {
    try {
        const password = localStorage.getItem('adminPassword');
        const url = currentTenantId 
            ? `/api/analytics?type=trends&metric=${metric}&period=${period}&tenant_id=${currentTenantId}`
            : `/api/analytics?type=trends&metric=${metric}&period=${period}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${password}`
            }
        });

        if (response.ok) {
            const result = await response.json();
            const dataPoints = result.data.data_points;

            if (metric === 'users') {
                updateUsersChart(dataPoints, period);
            }
        }
    } catch (error) {
        console.error('Trends load error:', error);
    }
}

// ユーザー推移グラフ更新
function updateUsersChart(dataPoints, period) {
    const ctx = document.getElementById('usersChart');
    if (!ctx) return;

    const labels = dataPoints.map(d => {
        const date = new Date(d.date);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    });
    const totalData = dataPoints.map(d => d.value);
    const newData = dataPoints.map(d => d.new || 0);

    if (usersChart) {
        usersChart.destroy();
    }

    usersChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '累計ユーザー数',
                    data: totalData,
                    borderColor: '#4A90D9',
                    backgroundColor: 'rgba(74, 144, 217, 0.1)',
                    tension: 0.4
                },
                {
                    label: '新規登録数',
                    data: newData,
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// 通知パフォーマンスグラフ読み込み
async function loadNotificationsChart() {
    try {
        const password = localStorage.getItem('adminPassword');
        const url = currentTenantId 
            ? `/api/analytics?type=notifications&limit=10&tenant_id=${currentTenantId}`
            : '/api/analytics?type=notifications&limit=10';
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${password}`
            }
        });

        if (response.ok) {
            const result = await response.json();
            const notifications = result.data.slice(0, 10).reverse(); // 最新10件

            const ctx = document.getElementById('notificationsChart');
            if (!ctx) return;

            const labels = notifications.map(n => {
                const date = new Date(n.send_at);
                return `${date.getMonth() + 1}/${date.getDate()}`;
            });
            const sentData = notifications.map(n => n.performance.total_sent);
            const openedData = notifications.map(n => n.performance.total_opened);
            const clickedData = notifications.map(n => n.performance.total_clicked);

            if (notificationsChart) {
                notificationsChart.destroy();
            }

            notificationsChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: '送信数',
                            data: sentData,
                            backgroundColor: '#4A90D9'
                        },
                        {
                            label: '開封数',
                            data: openedData,
                            backgroundColor: '#28a745'
                        },
                        {
                            label: 'クリック数',
                            data: clickedData,
                            backgroundColor: '#ffc107'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('Notifications chart load error:', error);
    }
}

// ユーティリティ関数
function formatNumber(num) {
    if (num === null || num === undefined) return '-';
    return num.toLocaleString('ja-JP');
}

function formatPercent(num) {
    if (num === null || num === undefined) return '-';
    return `${num.toFixed(1)}%`;
}

// 通知一覧取得
async function loadNotifications() {
    const listDiv = document.getElementById('notificationsList');
    
    if (!listDiv) return;

    try {
        const password = localStorage.getItem('adminPassword');
        
        // 通知一覧とパフォーマンスデータを取得
        const notificationsUrl = currentTenantId 
            ? `/api/notifications/list?tenant_id=${currentTenantId}`
            : '/api/notifications/list';
        const analyticsUrl = currentTenantId 
            ? `/api/analytics?type=notifications&limit=100&tenant_id=${currentTenantId}`
            : '/api/analytics?type=notifications&limit=100';
        
        const [notificationsRes, analyticsRes] = await Promise.all([
            fetch(notificationsUrl, {
                headers: { 'Authorization': `Bearer ${password}` }
            }),
            fetch(analyticsUrl, {
                headers: { 'Authorization': `Bearer ${password}` }
            })
        ]);

        if (notificationsRes.ok && analyticsRes.ok) {
            const notificationsResult = await notificationsRes.json();
            const analyticsResult = await analyticsRes.json();
            
            // パフォーマンスデータをマップ
            const perfMap = {};
            if (analyticsResult.data) {
                analyticsResult.data.forEach(item => {
                    perfMap[item.id] = item.performance;
                });
            }

            if (notificationsResult.data && notificationsResult.data.length > 0) {
                listDiv.innerHTML = notificationsResult.data.map(notif => {
                    const perf = perfMap[notif.id] || {
                        total_sent: 0,
                        total_opened: 0,
                        total_clicked: 0,
                        open_rate: 0,
                        ctr: 0
                    };

                    return `
                        <div class="notification-item">
                            <div class="notification-header">
                                <h3>${escapeHtml(notif.title)}</h3>
                                <span class="status-badge ${notif.sent ? 'sent' : 'pending'}">
                                    ${notif.sent ? '✅ 送信済み' : '⏳ 予約済み'}
                                </span>
                            </div>
                            <p>${escapeHtml(notif.body)}</p>
                            ${notif.url ? `<p>URL: <a href="${escapeHtml(notif.url)}" target="_blank">${escapeHtml(notif.url)}</a></p>` : ''}
                            <div class="notification-meta">
                                <span>送信予定: ${formatDateTime(notif.send_at)}</span>
                            </div>
                            ${notif.sent && perf.total_sent > 0 ? `
                                <div class="notification-performance">
                                    <h4>📊 パフォーマンス</h4>
                                    <div class="perf-grid">
                                        <div class="perf-item">
                                            <div class="perf-label">送信数</div>
                                            <div class="perf-value">${formatNumber(perf.total_sent)}</div>
                                        </div>
                                        <div class="perf-item">
                                            <div class="perf-label">開封数</div>
                                            <div class="perf-value">${formatNumber(perf.total_opened)}</div>
                                        </div>
                                        <div class="perf-item">
                                            <div class="perf-label">クリック数</div>
                                            <div class="perf-value">${formatNumber(perf.total_clicked)}</div>
                                        </div>
                                        <div class="perf-item">
                                            <div class="perf-label">開封率</div>
                                            <div class="perf-value">${formatPercent(perf.open_rate)}</div>
                                        </div>
                                        <div class="perf-item">
                                            <div class="perf-label">CTR</div>
                                            <div class="perf-value">${formatPercent(perf.ctr)}</div>
                                        </div>
                                    </div>
                                </div>
                            ` : ''}
                            ${!notif.sent ? `
                                <button class="test-send-btn" onclick="testSend(${notif.id}, '${escapeHtml(notif.title)}', '${escapeHtml(notif.body)}', '${escapeHtml(notif.url || '')}')">
                                    テスト送信
                                </button>
                            ` : ''}
                        </div>
                    `;
                }).join('');
            } else {
                listDiv.innerHTML = '<p class="loading">通知がありません</p>';
            }
        } else {
            listDiv.innerHTML = '<p class="loading">読み込みエラー</p>';
        }
    } catch (error) {
        console.error('Notifications load error:', error);
        listDiv.innerHTML = '<p class="loading">読み込みエラー</p>';
    }
}

// テスト送信
async function testSend(id, title, body, url) {
    if (!confirm('テスト送信を実行しますか？')) {
        return;
    }

    try {
        const password = localStorage.getItem('adminPassword');
        const response = await fetch('/api/send-notification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${password}`
            },
            body: JSON.stringify({ title, body, url })
        });

        const result = await response.json();

        if (result.status === 'ok') {
            alert(`送信完了！\n成功: ${result.sent_count}件\n失敗: ${result.error_count}件`);
            loadNotifications();
        } else {
            alert('送信に失敗しました: ' + (result.message || 'エラー'));
        }
    } catch (error) {
        alert('エラーが発生しました: ' + error.message);
    }
}

// ユーティリティ関数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDateTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ページ読み込み時の処理
document.addEventListener('DOMContentLoaded', () => {
    // ログインボタン
    const loginButton = document.getElementById('loginButton');
    if (loginButton) {
        loginButton.addEventListener('click', login);
        
        // Enterキーでログイン
        const passwordInput = document.getElementById('passwordInput');
        if (passwordInput) {
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    login();
                }
            });
        }
    }

    // ログアウトボタン
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }

    // 認証チェック
    checkAuth();
});
