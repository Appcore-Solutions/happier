import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSessionFixture, renderScreen, standardCleanup } from '@/dev/testkit';
import type { UserTextMessage } from '@/sync/domains/messages/messageTypes';
import { getActiveServerSnapshot } from '@/sync/domains/server/serverRuntime';
import { storage } from '@/sync/domains/state/storageStore';
import { installMessageViewCommonModuleMocks } from './messageViewTestHelpers';

installMessageViewCommonModuleMocks({
    text: async () => {
        const { createTextModuleMock } = await import('@/dev/testkit/mocks/text');
        return createTextModuleMock({
            translate: (key, params) => params ? `${key}: ${Object.values(params).join(' ')}` : key,
        });
    },
});

const SESSION_ID = 'shared-session';
const VIEWER_ACCOUNT_ID = 'viewer-account';
const FRIEND_ACCOUNT_ID = 'friend-account';

function seedSharedSession(params: Readonly<{ sessionServerId?: string; friendProfileCached: boolean }>) {
    const activeServerId = getActiveServerSnapshot().serverId;
    storage.setState({
        profileScope: { serverId: activeServerId, accountId: VIEWER_ACCOUNT_ID },
        sessions: {
            [SESSION_ID]: createSessionFixture({ id: SESSION_ID, serverId: params.sessionServerId ?? activeServerId }),
        },
        sessionListRenderables: {},
        users: params.friendProfileCached ? {
            [FRIEND_ACCOUNT_ID]: {
                id: FRIEND_ACCOUNT_ID,
                firstName: 'Ada',
                lastName: 'Lovelace',
                avatar: null,
                username: 'ada',
                bio: null,
                badges: [],
                status: 'friend',
                publicKey: null,
            },
        } : {},
    });
}

function userPrompt(authorAccountId: string | undefined): UserTextMessage {
    return {
        kind: 'user-text', id: 'prompt', localId: 'prompt', createdAt: 1,
        text: 'Run the migration tests.',
        ...(authorAccountId !== undefined ? { authorAccountId } : {}),
    };
}

describe('MessageView shared-session author attribution', () => {
    let previousState: ReturnType<typeof storage.getState>;
    beforeEach(() => { previousState = storage.getState(); });
    afterEach(() => {
        standardCleanup();
        storage.setState(previousState);
    });

    it.each([
        { friendProfileCached: true, name: 'Ada Lovelace' },
        { friendProfileCached: false, name: 'message.authorUnknown' },
    ])('names the participant who sent a prompt (profile cached: $friendProfileCached)', async ({ friendProfileCached, name }) => {
        const { MessageView } = await import('./MessageView');
        seedSharedSession({ friendProfileCached });

        const screen = await renderScreen(
            <MessageView sessionId={SESSION_ID} metadata={null} message={userPrompt(FRIEND_ACCOUNT_ID)} />,
        );

        const attribution = screen.findByTestId('transcript-author-attribution:prompt');
        expect(attribution).not.toBeNull();
        expect(attribution?.props.accessibilityLabel).toBe(`message.sentBy: ${name}`);
    });

    it.each([
        { case: 'the viewer\'s own prompt', author: VIEWER_ACCOUNT_ID, sessionServerId: undefined },
        { case: 'a prompt with no recorded author', author: undefined, sessionServerId: undefined },
        { case: 'a Session on another server', author: FRIEND_ACCOUNT_ID, sessionServerId: 'another-server' },
    ])('claims no author for $case', async ({ author, sessionServerId }) => {
        const { MessageView } = await import('./MessageView');
        seedSharedSession({ friendProfileCached: true, ...(sessionServerId ? { sessionServerId } : {}) });

        const screen = await renderScreen(
            <MessageView sessionId={SESSION_ID} metadata={null} message={userPrompt(author)} />,
        );

        expect(screen.findAllByTestId('transcript-author-attribution:prompt')).toHaveLength(0);
    });
});
