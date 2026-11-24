import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  type AppCheck,
} from 'firebase/app-check';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import type { AppCheckStatus, FirebaseConfigStatus } from './types';

declare global {
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
}

const REQUIRED_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

export interface FirebaseServices {
  app: FirebaseApp;
  appCheck: AppCheck | null;
  db: Firestore;
  status: FirebaseConfigStatus;
}

let cachedServices: FirebaseServices | null = null;

export function resetFirebaseServicesForTest(): void {
  cachedServices = null;
}

export function isAppCheckDebugActiveOnHost(): boolean {
  const debugToken = (import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN ?? '').trim();
  if (!debugToken) {
    return false;
  }
  if (debugToken !== 'true') {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  const host = window.location.hostname;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    new URLSearchParams(window.location.search).has('appcheck_debug')
  );
}

export function getFirebaseConfigStatus(): FirebaseConfigStatus {
  const env = import.meta.env;
  const missingKeys = REQUIRED_ENV_KEYS.filter((k) => !env[k] || String(env[k]).trim() === '');
  const configured = missingKeys.length === 0;
  const siteKey = (env.VITE_FIREBASE_RECAPTCHA_SITE_KEY ?? '').trim();
  const debugToken = (env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN ?? '').trim();
  const debugOnHost = isAppCheckDebugActiveOnHost();

  let appCheckStatus: AppCheckStatus = 'not_configured';
  let appCheckDetail = 'Add a reCAPTCHA site key or debug token in .env to enable App Check attestation.';

  if (configured && siteKey) {
    appCheckStatus = 'active';
    appCheckDetail = 'App Check active with reCAPTCHA attestation.';
  } else if (configured && debugOnHost) {
    appCheckStatus = 'debug_token';
    appCheckDetail = 'App Check debug token enabled for localhost or ?appcheck_debug=1 inspection.';
  } else if (configured && debugToken) {
    appCheckStatus = 'debug_token';
    appCheckDetail =
      'App Check debug mode ready on localhost or via ?appcheck_debug=1 (skipped on public host without site key).';
  } else if (configured) {
    appCheckDetail = 'Firebase app is configured; add VITE_FIREBASE_APPCHECK_DEBUG_TOKEN or VITE_FIREBASE_RECAPTCHA_SITE_KEY.';
  }

  return {
    configured,
    missingKeys: [...missingKeys],
    projectId: configured ? String(env.VITE_FIREBASE_PROJECT_ID) : null,
    appCheckStatus,
    appCheckDetail,
  };
}

export function getFirebaseServices(): FirebaseServices | null {
  if (cachedServices) {
    return cachedServices;
  }

  const baseStatus = getFirebaseConfigStatus();
  if (!baseStatus.configured) {
    return null;
  }

  const env = import.meta.env;
  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          apiKey: env.VITE_FIREBASE_API_KEY,
          authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
          projectId: env.VITE_FIREBASE_PROJECT_ID,
          storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
          messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
          appId: env.VITE_FIREBASE_APP_ID,
        });

  let appCheck: AppCheck | null = null;
  let finalStatus = { ...baseStatus };

  const debugToken = (env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN ?? '').trim();
  const siteKey = (env.VITE_FIREBASE_RECAPTCHA_SITE_KEY ?? '').trim();
  const useEnterprise = String(env.VITE_FIREBASE_RECAPTCHA_ENTERPRISE ?? '').toLowerCase() === 'true';
  const enableDebugToken = isAppCheckDebugActiveOnHost();

  if (siteKey || enableDebugToken) {
    try {
      if (enableDebugToken && debugToken) {
        globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken === 'true' ? true : debugToken;
      }
      const effectiveKey = siteKey || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';
      const provider = useEnterprise
        ? new ReCaptchaEnterpriseProvider(effectiveKey)
        : new ReCaptchaV3Provider(effectiveKey);
      appCheck = initializeAppCheck(app, {
        provider,
        isTokenAutoRefreshEnabled: true,
      });
    } catch (err) {
      finalStatus = {
        ...finalStatus,
        appCheckStatus: 'error',
        appCheckDetail: err instanceof Error ? err.message : 'App Check initialization failed.',
      };
    }
  }

  let db: Firestore;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    db = getFirestore(app);
  }

  cachedServices = { app, appCheck, db, status: finalStatus };
  return cachedServices;
}
