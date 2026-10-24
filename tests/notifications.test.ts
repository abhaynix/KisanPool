import assert from 'node:assert/strict';
import test from 'node:test';
import { remotePushSkipReason } from '../apps/mobile/lib/notificationPolicy';

test('Expo Go skips remote push before loading native notification modules', () => {
  assert.equal(remotePushSkipReason('android', true, 'eas-project'), 'expo-go');
});

test('web and missing EAS configuration return explicit skip reasons', () => {
  assert.equal(remotePushSkipReason('web', false, 'eas-project'), 'unsupported-platform');
  assert.equal(remotePushSkipReason('android', false, undefined), 'missing-project-id');
});

test('configured native builds may attempt remote push registration', () => {
  assert.equal(remotePushSkipReason('android', false, 'eas-project'), null);
});
