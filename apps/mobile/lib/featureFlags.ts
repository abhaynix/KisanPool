/** Local demo flags are honored only in Metro development builds. */
export const DOCUMENT_VERIFICATION_PAUSED =
  __DEV__ && process.env.EXPO_PUBLIC_SKIP_DOCUMENT_VERIFICATION === 'true';
export const FRESH_DEMO_DATA_ENABLED =
  __DEV__ && process.env.EXPO_PUBLIC_FRESH_DEMO_DATA === 'true';
