-- notification_statsテーブルの既存レコードにtenant_idを設定
-- notificationsテーブルからtenant_idを取得して設定

UPDATE notification_stats ns
SET tenant_id = n.tenant_id
FROM notifications n
WHERE ns.notification_id = n.id
  AND ns.tenant_id IS NULL
  AND n.tenant_id IS NOT NULL;

-- 確認用クエリ
SELECT 
    ns.notification_id,
    ns.tenant_id,
    n.tenant_id as notification_tenant_id,
    ns.total_sent,
    ns.total_opened,
    ns.total_clicked,
    ns.open_rate,
    ns.ctr
FROM notification_stats ns
LEFT JOIN notifications n ON ns.notification_id = n.id
ORDER BY ns.updated_at DESC
LIMIT 20;
