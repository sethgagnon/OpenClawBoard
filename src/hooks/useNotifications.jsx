import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const { subscribe, unsubscribe } = useSocket();

  useEffect(() => {
    apiGet('/notifications')
      .then((data) => setNotifications(Array.isArray(data) ? data : data?.items ?? data?.notifications ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (payload) => {
      setNotifications((prev) => [payload, ...prev]);
    };
    subscribe('notification', handler);
    return () => unsubscribe('notification', handler);
  }, [subscribe, unsubscribe]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const markRead = useCallback(async (id) => {
    await apiPost(`/notifications/${id}/read`);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(async () => {
    await apiPost('/notifications/read-all');
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  return { notifications, unreadCount, markRead, markAllRead };
}
