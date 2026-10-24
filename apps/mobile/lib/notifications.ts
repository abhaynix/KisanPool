import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';
import { remotePushSkipReason, type PushSkipReason } from './notificationPolicy';
import { getUser } from './session';

export type PushRegistrationResult =
  | { status: 'registered' }
  | { status: 'skipped'; reason: PushSkipReason | 'native-module-unavailable' | 'permission-denied' }
  | { status: 'failed'; reason: 'notification-initialization' | 'permission-request' | 'token-request' | 'backend-registration' };
type PushFailureReason = Extract<PushRegistrationResult, { status: 'failed' }>['reason'];

interface NotificationsModule {
  setNotificationHandler?: (handler: unknown) => void;
  setNotificationChannelAsync?: (id: string, channel: unknown) => Promise<unknown>;
  getPermissionsAsync?: () => Promise<{ status: string }>;
  requestPermissionsAsync?: () => Promise<{ status: string }>;
  getExpoPushTokenAsync?: (options: { projectId: string }) => Promise<{ data: string }>;
  AndroidImportance?: { HIGH: number };
}

let notifications: NotificationsModule | null = null;
let handlerInstalled = false;
let nativeModuleUnavailable = false;
let registrationInFlight: Promise<PushRegistrationResult> | null = null;
let lastRegisteredUserId: string | null = null;
let permissionDeniedUserId: string | null = null;
const logged = new Set<string>();

function logOnce(code: string, message: string): void {
  if (logged.has(code)) return;
  logged.add(code);
  console.info(message);
}

function projectId(): string | undefined {
  return Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
}

function loadNotifications(): NotificationsModule | null {
  if (notifications) return notifications;

  try {
    // Avoid evaluating expo-notifications' native modules at application startup.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require('expo-notifications') as NotificationsModule | undefined;
    if (
      !loaded ||
      typeof loaded.setNotificationHandler !== 'function' ||
      typeof loaded.getPermissionsAsync !== 'function' ||
      typeof loaded.requestPermissionsAsync !== 'function' ||
      typeof loaded.getExpoPushTokenAsync !== 'function'
    ) {
      return null;
    }
    notifications = loaded;
    return loaded;
  } catch {
    return null;
  }
}

function initializeNotifications(module: NotificationsModule): boolean {
  if (handlerInstalled) return true;
  try {
    module.setNotificationHandler?.({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    handlerInstalled = true;
    return true;
  } catch {
    return false;
  }
}

/** True when remote push is supported by this runtime and the app has EAS configured. */
export const pushSupported = (): boolean =>
  remotePushSkipReason(Platform.OS, isRunningInExpoGo(), projectId()) === null;

/** Registers a token once per user session; notification failures never block auth. */
export function registerForPush(): Promise<PushRegistrationResult> {
  if (!registrationInFlight) {
    registrationInFlight = register()
      .catch(() => {
        console.warn('[push] Notification initialization failed; authentication will continue.');
        return { status: 'failed', reason: 'notification-initialization' } as const;
      })
      .finally(() => {
        registrationInFlight = null;
      });
  }
  return registrationInFlight;
}

async function register(): Promise<PushRegistrationResult> {
  const skipReason = remotePushSkipReason(Platform.OS, isRunningInExpoGo(), projectId());
  if (skipReason) {
    if (skipReason === 'expo-go') {
      logOnce(skipReason, '[push] Remote push is unavailable in Expo Go; use an EAS development build.');
    } else if (skipReason === 'missing-project-id') {
      logOnce(skipReason, '[push] Remote push is disabled until an EAS project ID is configured.');
    }
    return { status: 'skipped', reason: skipReason };
  }

  const user = await getUser().catch(() => null);
  const userId = user?._id ?? null;
  if (userId && userId === lastRegisteredUserId) return { status: 'registered' };
  if (userId && userId === permissionDeniedUserId) {
    return { status: 'skipped', reason: 'permission-denied' };
  }

  if (nativeModuleUnavailable) return { status: 'skipped', reason: 'native-module-unavailable' };
  const module = loadNotifications();
  if (!module) {
    nativeModuleUnavailable = true;
    logOnce('native-module-unavailable', '[push] Notifications native module is unavailable; rebuild the development app.');
    return { status: 'skipped', reason: 'native-module-unavailable' };
  }
  if (!initializeNotifications(module)) {
    console.warn('[push] Notification handler could not be initialized.');
    return { status: 'failed', reason: 'notification-initialization' };
  }

  let stage: PushFailureReason = 'notification-initialization';
  try {
    if (Platform.OS === 'android') {
      if (!module.setNotificationChannelAsync || !module.AndroidImportance) {
        return { status: 'skipped', reason: 'native-module-unavailable' };
      }
      await module.setNotificationChannelAsync('default', {
        name: 'Trip updates',
        importance: module.AndroidImportance.HIGH,
        lightColor: '#0d631b',
      });
    }

    stage = 'permission-request';
    const current = await module.getPermissionsAsync!();
    let status = current.status;
    if (status !== 'granted') status = (await module.requestPermissionsAsync!()).status;
    if (status !== 'granted') {
      permissionDeniedUserId = userId;
      return { status: 'skipped', reason: 'permission-denied' };
    }

    stage = 'token-request';
    const token = (await module.getExpoPushTokenAsync!({ projectId: projectId()! })).data;
    stage = 'backend-registration';
    await api.updateMe({ pushToken: token });
    lastRegisteredUserId = userId;
    return { status: 'registered' };
  } catch {
    console.warn(`[push] Registration failed during ${stage}; authentication will continue.`);
    return { status: 'failed', reason: stage };
  }
}
