export type PushSkipReason = 'expo-go' | 'unsupported-platform' | 'missing-project-id';

export function remotePushSkipReason(
  platform: string,
  isExpoGo: boolean,
  projectId: string | undefined,
): PushSkipReason | null {
  if (isExpoGo) return 'expo-go';
  if (platform === 'web') return 'unsupported-platform';
  if (!projectId) return 'missing-project-id';
  return null;
}
