SELECT work_item_id, alert_status, alert_channel_type, alert_error, detected_at FROM devops_qa_return_events WHERE detected_at > now() - interval '10 minutes' ORDER BY detected_at DESC LIMIT 20;
