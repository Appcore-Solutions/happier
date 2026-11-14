import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
    const { createReactNativeWebMock } = await import('@/dev/testkit/mocks/reactNative');
    return createReactNativeWebMock(
        {
                                            Platform: {
                                                OS: 'web',
                                            },
                                            AppState: {
                                                addEventListener: vi.fn(() => ({ remove: vi.fn() })) as any,
                                            },
                                        }
    );
});

vi.mock('@/log', () => ({
    log: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./api/social/apiFriends', () => ({
    getUserProfile: vi.fn(),
}));

import { storage } from './domains/state/storage';
import { getUserProfile } from './api/social/apiFriends';

const initialStorageState = storage.getState();

describe('sync.assumeUsers', () => {
    beforeEach(async () => {
        storage.setState(initialStorageState, true);

        const { sync } = await import('./sync');
        (sync as any).credentials = { token: 'test-token', secret: 'test-secret' };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('does not cache null when user fetch throws a transient error', async () => {
        (getUserProfile as any).mockRejectedValueOnce(new Error('boom'));

        const { sync } = await import('./sync');
        await sync.assumeUsers(['user_transient']);

        expect(storage.getState().users.user_transient).toBeUndefined();
    });

    it('caches null when user fetch returns null (not found)', async () => {
        (getUserProfile as any).mockResolvedValueOnce(null);

        const { sync } = await import('./sync');
        await sync.assumeUsers(['user_missing']);

        expect(storage.getState().users.user_missing).toBeNull();
    });

    it('shares one profile request across concurrent callers for the same missing user', async () => {
        let resolveProfile: (profile: unknown) => void = () => {};
        (getUserProfile as any).mockImplementationOnce(() => new Promise((resolve) => {
            resolveProfile = resolve;
        }));

        const { sync } = await import('./sync');
        // Every transcript row by one author asks for the same profile as the rows mount together.
        const first = sync.assumeUsers(['user_shared']);
        const second = sync.assumeUsers(['user_shared', 'user_shared']);
        resolveProfile({ id: 'user_shared', firstName: 'Ada', lastName: null, username: 'ada' });
        await Promise.all([first, second]);

        expect(getUserProfile).toHaveBeenCalledTimes(1);
        expect(storage.getState().users.user_shared).toMatchObject({ id: 'user_shared' });
    });

    it('caches null when user fetch throws a 404-shaped error', async () => {
        (getUserProfile as any).mockRejectedValueOnce({ status: 404 });

        const { sync } = await import('./sync');
        await sync.assumeUsers(['user_404']);

        expect(storage.getState().users.user_404).toBeNull();
    });
});

