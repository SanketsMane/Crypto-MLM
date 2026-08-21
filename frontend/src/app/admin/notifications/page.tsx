'use client';

import { NotificationList } from '@/features/notifications/notification-list';
import { adminTransport } from '@/features/notifications/transports';

export default function AdminNotificationsPage() {
  return <NotificationList transport={adminTransport} variant="admin" />;
}
