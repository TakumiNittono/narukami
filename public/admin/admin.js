// 認証チェック
async function checkAuth() {
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
    
    loadStats();
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

// ユーザー数取得
async function loadStats() {
    try {
        const password = localStorage.getItem('adminPassword');
        const response = await fetch('/api/stats', {
            headers: {
                'Authorization': `Bearer ${password}`
            }
        });

        if (response.ok) {
            const result = await response.json();
            document.getElementById('userCount').textContent = result.data.user_count || 0;
        }
    } catch (error) {
        console.error('Stats load error:', error);
    }
}

// 通知一覧取得
async function loadNotifications() {
    const listDiv = document.getElementById('notificationsList');
    
    if (!listDiv) return;

    try {
        const password = localStorage.getItem('adminPassword');
        const response = await fetch('/api/notifications/list', {
            headers: {
                'Authorization': `Bearer ${password}`
            }
        });

        if (response.ok) {
            const result = await response.json();
            
            if (result.data && result.data.length > 0) {
                listDiv.innerHTML = result.data.map(notif => `
                    <div class="notification-item">
                        <h3>${escapeHtml(notif.title)}</h3>
                        <p>${escapeHtml(notif.body)}</p>
                        ${notif.url ? `<p>URL: <a href="${escapeHtml(notif.url)}" target="_blank">${escapeHtml(notif.url)}</a></p>` : ''}
                        <div class="notification-meta">
                            <span>送信予定: ${formatDateTime(notif.send_at)}</span>
                            <span class="status-badge ${notif.sent ? 'sent' : 'pending'}">
                                ${notif.sent ? '✅ 送信済み' : '⏳ 予約済み'}
                            </span>
                        </div>
                        ${!notif.sent ? `
                            <button class="test-send-btn" onclick="testSend(${notif.id}, '${escapeHtml(notif.title)}', '${escapeHtml(notif.body)}', '${escapeHtml(notif.url || '')}')">
                                テスト送信
                            </button>
                        ` : ''}
                    </div>
                `).join('');
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
