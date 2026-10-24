/**
 * Public surface of the core feature (README §4). Other features import only from here.
 */
export { notify } from './server/notify';
export { logAgentAction } from './server/agent-log';
export { getCurrentUser, type CurrentUser } from './server/current-user';
export { AppShell } from './components/app-shell/AppShell';
export { NotificationBell } from './components/notifications/NotificationBell';
