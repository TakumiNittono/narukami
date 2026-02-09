-- トラッキングが動作しているか確認するSQL

-- 1. notification_eventsテーブルにイベントが記録されているか確認
SELECT 
    'notification_events' as table_name,
    COUNT(*) as total_events,
    COUNT(DISTINCT notification_id) as unique_notifications,
    COUNT(DISTINCT user_id) as unique_users
FROM notification_events;

-- 2. イベントタイプ別の集計
SELECT 
    event_type,
    COUNT(*) as count,
    COUNT(DISTINCT notification_id) as notification_count,
    COUNT(DISTINCT user_id) as user_count,
    MIN(created_at) as first_event,
    MAX(created_at) as last_event
FROM notification_events
GROUP BY event_type
ORDER BY count DESC;

-- 3. 特定の通知（送信数7の通知）のイベントを確認
SELECT 
    n.id as notification_id,
    n.title,
    n.status,
    n.sent,
    ne.event_type,
    COUNT(*) as event_count,
    COUNT(DISTINCT ne.user_id) as unique_users
FROM notifications n
LEFT JOIN notification_events ne ON n.id = ne.notification_id
WHERE n.sent = true
  AND n.status = 'sent'
GROUP BY n.id, n.title, n.status, n.sent, ne.event_type
ORDER BY n.id DESC, ne.event_type;

-- 4. notification_statsとnotification_eventsの対応状況
SELECT 
    n.id as notification_id,
    n.title,
    n.status,
    ns.total_sent,
    ns.total_opened,
    ns.total_clicked,
    ns.open_rate,
    ns.ctr,
    COUNT(CASE WHEN ne.event_type = 'sent' THEN 1 END) as events_sent,
    COUNT(CASE WHEN ne.event_type = 'open' THEN 1 END) as events_open,
    COUNT(CASE WHEN ne.event_type = 'click' THEN 1 END) as events_click
FROM notifications n
LEFT JOIN notification_stats ns ON n.id = ns.notification_id
LEFT JOIN notification_events ne ON n.id = ne.notification_id
WHERE n.sent = true OR n.status = 'sent'
GROUP BY n.id, n.title, n.status, ns.total_sent, ns.total_opened, ns.total_clicked, ns.open_rate, ns.ctr
ORDER BY n.send_at DESC
LIMIT 10;

-- 5. 最近のnotification_eventsを確認
SELECT 
    ne.id,
    ne.notification_id,
    ne.event_type,
    ne.user_id,
    ne.notification_type,
    ne.created_at,
    n.title as notification_title
FROM notification_events ne
LEFT JOIN notifications n ON ne.notification_id = n.id
ORDER BY ne.created_at DESC
LIMIT 20;
