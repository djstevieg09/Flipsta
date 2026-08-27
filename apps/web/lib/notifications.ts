/**
 * 27 Aug 2026: moved to packages/shared/src/notifications.ts so
 * apps/worker can send real email too (the new deal-drop notifications
 * job). Re-exported here so every existing `@/lib/notifications` import
 * site keeps working unchanged.
 */
export { isEmailConfigured, sendNotificationEmail, NotificationEvents } from "@flipsta/shared";
