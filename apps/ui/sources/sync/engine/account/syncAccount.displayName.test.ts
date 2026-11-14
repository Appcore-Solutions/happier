import { describe, expect, it, vi } from 'vitest';

import { profileDefaults } from '@/sync/domains/profiles/profile';

vi.mock('expo-constants', () => ({
  default: {},
}));

vi.mock('expo-notifications', () => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
}));

describe('handleUpdateAccountSocketUpdate displayName', () => {
  it.each([
    { case: 'a newly chosen name', current: null, update: 'Ada', expected: 'Ada' },
    { case: 'a cleared name', current: 'Ada', update: null, expected: null },
  ])('applies $case from another device', async ({ current, update, expected }) => {
    const { handleUpdateAccountSocketUpdate } = await import('./syncAccount');
    const applyProfile = vi.fn();

    await handleUpdateAccountSocketUpdate({
      accountUpdate: { displayName: update },
      updateCreatedAt: 123,
      currentProfile: { ...profileDefaults, displayName: current, username: 'ada_l' },
      encryption: { getContentPrivateKey: () => new Uint8Array(32).fill(7), decryptRaw: vi.fn() } as any,
      applyProfile,
      applySettings: vi.fn(),
      log: { log: vi.fn() },
    });

    expect(applyProfile).toHaveBeenCalledWith(expect.objectContaining({ displayName: expected, username: 'ada_l' }));
  });

  it('keeps the current name when an account update does not mention it', async () => {
    const { handleUpdateAccountSocketUpdate } = await import('./syncAccount');
    const applyProfile = vi.fn();

    await handleUpdateAccountSocketUpdate({
      accountUpdate: { username: 'ada_lovelace' },
      updateCreatedAt: 123,
      currentProfile: { ...profileDefaults, displayName: 'Ada', username: 'ada_l' },
      encryption: { getContentPrivateKey: () => new Uint8Array(32).fill(7), decryptRaw: vi.fn() } as any,
      applyProfile,
      applySettings: vi.fn(),
      log: { log: vi.fn() },
    });

    expect(applyProfile).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Ada', username: 'ada_lovelace' }));
  });
});
