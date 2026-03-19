import { readNotifications, writeNotifications } from '../lib/fileStore.js';
import { broadcast } from '../broadcast.js';

export function getNotifications(req, res) {
  try {
    const notifications = readNotifications();
    const unreadOnly = req.query.unread === 'true';
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    let filtered = notifications;
    if (unreadOnly) {
      filtered = filtered.filter(n => !n.read);
    }

    const total = filtered.length;
    const unreadCount = notifications.filter(n => !n.read).length;
    const items = filtered.slice(offset, offset + limit);

    res.json({ items, total, unreadCount, limit, offset });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function markNotificationRead(req, res) {
  try {
    const notifications = readNotifications();
    const idx = notifications.findIndex(n => n.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Notification not found' });

    notifications[idx].read = true;
    notifications[idx].readAt = new Date().toISOString();
    writeNotifications(notifications);

    broadcast('notification:read', { id: req.params.id });
    res.json(notifications[idx]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export function markAllRead(req, res) {
  try {
    const notifications = readNotifications();
    const now = new Date().toISOString();
    let count = 0;

    for (const n of notifications) {
      if (!n.read) {
        n.read = true;
        n.readAt = now;
        count++;
      }
    }

    writeNotifications(notifications);
    broadcast('notifications:all-read', { count });
    res.json({ ok: true, marked: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
