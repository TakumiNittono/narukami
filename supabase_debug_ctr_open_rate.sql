-- 開封率・CTRが0%になる原因を調査するSQL

-- 1. notification_statsテーブルの状況確認
SELECT 
    ns.notification_id,
    ns.tenant_id,
    ns.total_sent,
    ns.total_opened,
    ns.total_clicked,
    ns.open_rate,
    ns.ctr,
    ns.updated_at,
    n.title as notification_title,
    n.tenant_id as notification_tenant_id
FROM notification_stats ns
LEFT JOIN notifications n ON ns.notification_id = n.id
ORDER BY ns.updated_at DESC
LIMIT 20;

-- 2. tenant_id=1のnotification_statsが存在するか確認
SELECT 
    COUNT(*) as stats_count,
    SUM(total_sent) as total_sent_sum,
    SUM(total_opened) as total_opened_sum,
    SUM(total_clicked) as total_clicked_sum
FROM notification_stats
WHERE tenant_id = 1
  AND total_sent > 0;

-- 3. tenant_idがNULLのnotification_statsが存在するか確認
SELECT 
    COUNT(*) as null_tenant_stats_count,
    SUM(total_sent) as total_sent_sum
FROM notification_stats
WHERE tenant_id IS NULL
  AND total_sent > 0;

-- 4. notificationsテーブルで送信済みの通知を確認
SELECT 
    id,
    title,
    tenant_id,
    sent,
    status,
    send_at,
    created_at
FROM notifications
WHERE sent = true
  AND deleted_at IS NULL
ORDER BY send_at DESC
LIMIT 10;

-- 5. notification_eventsテーブルでイベントが記録されているか確認
SELECT 
    event_type,
    COUNT(*) as count,
    COUNT(DISTINCT notification_id) as notification_count
FROM notification_events
GROUP BY event_type
ORDER BY count DESC;

-- 6. tenant_id=1のnotification_eventsを確認
SELECT 
    ne.event_type,
    COUNT(*) as count,
    n.tenant_id
FROM notification_events ne
LEFT JOIN notifications n ON ne.notification_id = n.id
WHERE n.tenant_id = 1
GROUP BY ne.event_type, n.tenant_id
ORDER BY count DESC;
