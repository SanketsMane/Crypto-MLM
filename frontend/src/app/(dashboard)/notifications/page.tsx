'use client';

import { NotificationList } from '@/features/notifications/notification-list';
import { memberTransport } from '@/features/notifications/transports';

export default function NotificationsPage() {
  return <NotificationList transport={memberTransport} />;
}
