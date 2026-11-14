import { getServerFetchUrl } from '@/dev/testkit/mocks/serverFetch';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react-test-renderer';
import {
    renderSettingsView,
    standardCleanup,
} from '@/dev/testkit';
import { storage } from '@/sync/domains/state/storageStore';
import { profileDefaults } from '@/sync/domains/profiles/profile';
import { createAccountFeaturesResponse, isFeaturesRequest } from './account.testHelpers';
import {
    getAccountSettingsRouteModalMockRef,
    getAccountSettingsRouteRouterMockRef,
    installAccountSettingsRouteModuleMocks,
} from './accountSettingsRouteTestHelpers';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native-reanimated', async () => {
    const { createReanimatedModuleMock } = await import('@/dev/testkit/mocks/reanimated');
    return createReanimatedModuleMock();
});
installAccountSettingsRouteModuleMocks();

const routerMockRef = getAccountSettingsRouteRouterMockRef();
const modalMockRef = getAccountSettingsRouteModalMockRef();

vi.mock('expo-camera', () => ({
    useCameraPermissions: () => [{ granted: true }, async () => ({ granted: true })],
    CameraView: {
        isModernBarcodeScannerAvailable: false,
        onModernBarcodeScanned: () => ({ remove: () => {} }),
        launchScanner: () => {},
        dismissScanner: async () => {},
    },
}));

vi.mock('@/auth/context/AuthContext', () => ({
    useAuth: () => ({
        isAuthenticated: true,
        credentials: { token: 't', secret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
        logout: vi.fn(),
    }),
}));

vi.mock('@/hooks/auth/useConnectAccount', () => ({
    useConnectAccount: () => ({
        connectAccount: vi.fn(),
        isLoading: false,
    }),
}));

vi.mock('@/hooks/server/useFriendsEnabled', () => ({
    useFriendsEnabled: () => true,
}));

vi.mock('@/hooks/server/useFriendsIdentityReadiness', () => ({
    useFriendsIdentityReadiness: () => ({
        isReady: true,
        isLoadingFeatures: false,
        reason: null,
        requiredProviderId: null,
        requiredProviderDisplayName: null,
        requiredProviderConnected: false,
        requiredProviderLogin: null,
        gate: { isReady: true, gateVariant: 'username' },
    }),
}));

vi.mock('@/hooks/server/useFeatureEnabled', () => ({
    useFeatureEnabled: () => false,
}));

vi.mock('@/components/account/ProviderIdentityItems', () => ({
    ProviderIdentityItems: () => null,
}));

vi.mock('@/agents/registry/AgentIcon', () => ({
    AgentIcon: () => null,
}));

function stubServer(displayNameResponse: unknown) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = getServerFetchUrl(input).pathname;
        if (url.endsWith('/health') || url.endsWith('/v1/auth/ping')) {
            return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
        }
        if (isFeaturesRequest(url)) {
            return { ok: true, json: async () => createAccountFeaturesResponse() };
        }
        if (url.endsWith('/v1/account/display-name')) {
            return { ok: true, status: 200, json: async () => displayNameResponse };
        }
        throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    return fetchMock;
}

function displayNameRequests(fetchMock: ReturnType<typeof stubServer>) {
    return fetchMock.mock.calls.filter(([input]) => getServerFetchUrl(input).pathname.endsWith('/v1/account/display-name'));
}

describe('Settings → Account (display name)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        routerMockRef.current?.spies.push.mockReset();
        // `@/modal` stays cached across tests, so keep the mock and reset only the spies each test drives.
        modalMockRef.current?.spies.prompt.mockReset();
        modalMockRef.current?.spies.alert.mockReset();
        standardCleanup();
    });

    it('saves the trimmed name friends will see and shows it on the profile', async () => {
        storage.getState().applyProfile({ ...profileDefaults, linkedProviders: [], username: 'ada_l', displayName: null });
        const fetchMock = stubServer({ displayName: 'Ada Lovelace' });
        await import('@/modal');
        modalMockRef.current.spies.prompt.mockResolvedValue('  Ada Lovelace  ');

        const { default: AccountScreen } = await import('@/app/(app)/settings/account');
        const screen = await renderSettingsView(<AccountScreen />);
        await act(async () => {
            await screen.pressRowByTitle('settingsAccount.displayName');
        });

        const [request] = displayNameRequests(fetchMock);
        expect(JSON.parse(String(request?.[1]?.body))).toEqual({ displayName: 'Ada Lovelace' });
        expect(storage.getState().profile.displayName).toBe('Ada Lovelace');
    }, 40_000);

    it('explains an invalid name without sending it', async () => {
        storage.getState().applyProfile({ ...profileDefaults, linkedProviders: [], username: 'ada_l', displayName: 'Ada' });
        const fetchMock = stubServer({ displayName: 'never' });
        await import('@/modal');
        modalMockRef.current.spies.prompt.mockResolvedValue('Ada\nLovelace');

        const { default: AccountScreen } = await import('@/app/(app)/settings/account');
        const screen = await renderSettingsView(<AccountScreen />);
        await act(async () => {
            await screen.pressRowByTitle('settingsAccount.displayName');
        });

        expect(displayNameRequests(fetchMock)).toHaveLength(0);
        expect(modalMockRef.current.spies.alert).toHaveBeenCalledWith('common.error', expect.stringContaining('settingsAccount.displayNameInvalid'));
        expect(storage.getState().profile.displayName).toBe('Ada');
    }, 40_000);
});
