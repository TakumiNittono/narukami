-- 送信数0の通知のステータスを修正
-- notification_statsでtotal_sent=0の通知を「送信失敗」に更新

UPDATE notifications n
SET status = 'failed', sent = false
FROM notification_stats ns
WHERE n.id = ns.notification_id
  AND ns.total_sent = 0
  AND n.status = 'sent';

-- または、notification_statsが存在しないがsent=trueの通知も確認
UPDATE notifications
SET status = 'failed', sent = false
WHERE sent = true
  AND status = 'sent'
  AND id NOT IN (
      SELECT notification_id 
      FROM notification_stats 
      WHERE total_sent > 0
  );

-- 確認用クエリ
SELECT 
    n.id,
    n.title,
    n.status,
    n.sent,
    ns.total_sent,
    ns.total_opened,
    ns.total_clicked
FROM notifications n
LEFT JOIN notification_stats ns ON n.id = ns.notification_id
WHERE n.sent = true
  OR n.status = 'sent'
ORDER BY n.send_at DESC
LIMIT 20;
