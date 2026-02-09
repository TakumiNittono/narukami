-- notification_statsのデータ状況を確認し、必要に応じて再計算

-- 1. notification_statsテーブルにレコードが存在するか確認
SELECT 
    'notification_stats records' as check_type,
    COUNT(*) as count
FROM notification_stats;

-- 2. notification_eventsテーブルにイベントが記録されているか確認
SELECT 
    event_type,
    COUNT(*) as count,
    COUNT(DISTINCT notification_id) as notification_count
FROM notification_events
GROUP BY event_type
ORDER BY count DESC;

-- 3. 送信済み通知とnotification_statsの対応状況を確認
SELECT 
    n.id as notification_id,
    n.title,
    n.status,
    n.sent,
    n.tenant_id,
    ns.notification_id as stats_exists,
    ns.total_sent,
    ns.total_opened,
    ns.total_clicked,
    ns.open_rate,
    ns.ctr
FROM notifications n
LEFT JOIN notification_stats ns ON n.id = ns.notification_id
WHERE n.sent = true OR n.status = 'sent'
ORDER BY n.send_at DESC
LIMIT 20;

-- 4. notification_eventsからnotification_statsを再計算・作成
-- 送信済み通知に対して、notification_eventsから統計を集計してnotification_statsに挿入/更新
INSERT INTO notification_stats (
    notification_id,
    notification_type,
    tenant_id,
    total_sent,
    total_delivered,
    total_opened,
    total_clicked,
    total_dismissed,
    open_rate,
    ctr,
    updated_at
)
SELECT 
    n.id as notification_id,
    COALESCE(ne.notification_type, 'scheduled') as notification_type,
    n.tenant_id,
    COUNT(CASE WHEN ne.event_type = 'sent' THEN 1 END) as total_sent,
    COUNT(CASE WHEN ne.event_type = 'delivered' THEN 1 END) as total_delivered,
    COUNT(CASE WHEN ne.event_type = 'open' THEN 1 END) as total_opened,
    COUNT(CASE WHEN ne.event_type = 'click' THEN 1 END) as total_clicked,
    COUNT(CASE WHEN ne.event_type = 'dismiss' THEN 1 END) as total_dismissed,
    CASE 
        WHEN COUNT(CASE WHEN ne.event_type = 'sent' THEN 1 END) > 0 
        THEN ROUND(
            (COUNT(CASE WHEN ne.event_type = 'open' THEN 1 END)::DECIMAL / 
             COUNT(CASE WHEN ne.event_type = 'sent' THEN 1 END)::DECIMAL) * 100, 
            2
        )
        ELSE 0
    END as open_rate,
    CASE 
        WHEN COUNT(CASE WHEN ne.event_type = 'sent' THEN 1 END) > 0 
        THEN ROUND(
            (COUNT(CASE WHEN ne.event_type = 'click' THEN 1 END)::DECIMAL / 
             COUNT(CASE WHEN ne.event_type = 'sent' THEN 1 END)::DECIMAL) * 100, 
            2
        )
        ELSE 0
    END as ctr,
    NOW() as updated_at
FROM notifications n
LEFT JOIN notification_events ne ON n.id = ne.notification_id
WHERE (n.sent = true OR n.status = 'sent')
  AND EXISTS (
      SELECT 1 
      FROM notification_events ne2 
      WHERE ne2.notification_id = n.id
  )
GROUP BY n.id, n.tenant_id, ne.notification_type
ON CONFLICT (notification_id) 
DO UPDATE SET
    notification_type = EXCLUDED.notification_type,
    tenant_id = EXCLUDED.tenant_id,
    total_sent = EXCLUDED.total_sent,
    total_delivered = EXCLUDED.total_delivered,
    total_opened = EXCLUDED.total_opened,
    total_clicked = EXCLUDED.total_clicked,
    total_dismissed = EXCLUDED.total_dismissed,
    open_rate = EXCLUDED.open_rate,
    ctr = EXCLUDED.ctr,
    updated_at = EXCLUDED.updated_at;

-- 5. 再計算後の確認
SELECT 
    n.id,
    n.title,
    n.status,
    ns.total_sent,
    ns.total_opened,
    ns.total_clicked,
    ns.open_rate,
    ns.ctr
FROM notifications n
LEFT JOIN notification_stats ns ON n.id = ns.notification_id
WHERE n.sent = true OR n.status = 'sent'
ORDER BY n.send_at DESC
LIMIT 20;
