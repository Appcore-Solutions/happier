import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { createTestAuth } from '../../src/testkit/auth';
import { fetchJson } from '../../src/testkit/http';
import { startServerLight, type StartedServer } from '../../src/testkit/process/serverLight';
import { resolveUiWebBeforeAllTimeoutMs, startUiWeb, type StartedUiWeb } from '../../src/testkit/process/uiWeb';
import { createRunDirs } from '../../src/testkit/runDir';
import { addFriend, fetchAccountId, setUsername } from '../../src/testkit/socialFriends';
import { collectBrowserDiagnostics } from '../../src/testkit/uiE2e/browserDiagnostics';
import { ensureAccountReadyForConnect } from '../../src/testkit/uiE2e/ensureAccountReadyForConnect';
import { ensureUiFeatureEnabled } from '../../src/testkit/uiE2e/ensureUiFeatureEnabled';
import {
  gotoCommittedWithRetries,
  gotoDomContentLoadedWithRetries,
  normalizeLoopbackBaseUrl,
} from '../../src/testkit/uiE2e/pageNavigation';
import { waitForInitialAppUi } from '../../src/testkit/uiE2e/waitForInitialAppUi';

const run = createRunDirs({ runLabel: 'ui-e2e' });

async function readAuthTokenFromBrowserStorage(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith('auth_credentials')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { token?: unknown };
        if (typeof parsed.token === 'string' && parsed.token.trim()) return parsed.token.trim();
      } catch {
        // Keep scanning malformed storage entries.
      }
    }
    return null;
  });
  if (typeof token === 'string' && token.trim()) return token.trim();
  throw new Error('Failed to read auth token from browser storage');
}

async function postPlainUserPrompt(params: Readonly<{
  baseUrl: string;
  token: string;
  sessionId: string;
  localId: string;
  text: string;
}>): Promise<void> {
  const response = await fetchJson<{ didWrite?: unknown }>(`${params.baseUrl}/v2/sessions/${params.sessionId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': params.localId,
    },
    body: JSON.stringify({
      localId: params.localId,
      messageRole: 'user',
      content: { t: 'plain', v: { role: 'user', content: { type: 'text', text: params.text } } },
    }),
    timeoutMs: 20_000,
  });
  if (response.status !== 200 || response.data?.didWrite !== true) {
    throw new Error(`Failed to post user prompt ${params.localId} (status=${response.status})`);
  }
}

test.describe('ui e2e: shared session message authors and display names', () => {
  test.describe.configure({ mode: 'serial' });

  const suiteDir = run.testDir('sharing-message-author-suite');

  let server: StartedServer | null = null;
  let ui: StartedUiWeb | null = null;
  let uiBaseUrl: string | null = null;

  test.beforeAll(async () => {
    const uiWebEnv = {
      ...process.env,
      EXPO_PUBLIC_DEBUG: '1',
      EXPO_PUBLIC_HAPPY_STORAGE_SCOPE: `e2e-${run.runId}`,
      HAPPIER_E2E_UI_WEB_MODE: 'export',
      HAPPIER_E2E_UI_WEB_EXPORT_TIMEOUT_MS: process.env.HAPPIER_E2E_UI_WEB_EXPORT_TIMEOUT_MS ?? '900000',
      HAPPIER_E2E_UI_WEB_EXPORT_FALLBACK_TO_METRO: '0',
      HAPPIER_E2E_UI_WEB_SCRIPT_FETCH_TIMEOUT_MS: process.env.HAPPIER_E2E_UI_WEB_SCRIPT_FETCH_TIMEOUT_MS ?? '480000',
    };
    test.setTimeout(resolveUiWebBeforeAllTimeoutMs(uiWebEnv));
    await mkdir(suiteDir, { recursive: true });

    server = await startServerLight({
      testDir: suiteDir,
      dbProvider: 'sqlite',
      extraEnv: {
        // Keep web create-account stable (binding signature is not reliably available on web).
        HAPPIER_BUILD_FEATURES_DENY: 'sharing.contentKeys',
        HAPPIER_FEATURE_AUTH_LOGIN__KEY_CHALLENGE_ENABLED: '1',
        // Plaintext storage lets the recipient write prompts without session content keys.
        HAPPIER_FEATURE_ENCRYPTION__STORAGE_POLICY: 'optional',
        HAPPIER_FEATURE_ENCRYPTION__ALLOW_ACCOUNT_OPTOUT: '1',
        HAPPIER_FEATURE_SOCIAL_FRIENDS__ENABLED: '1',
        HAPPIER_FEATURE_SOCIAL_FRIENDS__ALLOW_USERNAME: '1',
      },
    });

    ui = await startUiWeb({
      testDir: suiteDir,
      env: { ...uiWebEnv, EXPO_PUBLIC_HAPPY_SERVER_URL: server.baseUrl },
    });
    uiBaseUrl = normalizeLoopbackBaseUrl(ui.baseUrl);
  });

  test.afterAll(async () => {
    test.setTimeout(120_000);
    await ui?.stop().catch(() => {});
    await server?.stop().catch(() => {});
  });

  test('labels prompts a participant sent with their name, and never the viewer\'s own prompts', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    if (!server || !uiBaseUrl) throw new Error('missing server/ui fixtures');
    const diagnostics = collectBrowserDiagnostics({ page });

    try {
      // The owner signs up through the real web flow and views the Session in the browser.
      await gotoCommittedWithRetries(page, uiBaseUrl, 120_000);
      await waitForInitialAppUi({ page, timeoutMs: 120_000, browserDiagnostics: diagnostics });
      await ensureAccountReadyForConnect({ page, timeoutMs: 120_000, clickCreateAccount: true });
      // Friends is an opt-in feature in the app; the display name setting only appears while it is on.
      await ensureUiFeatureEnabled({ page, baseUrl: uiBaseUrl, featureId: 'social.friends' });
      const ownerToken = await readAuthTokenFromBrowserStorage(page);
      const ownerId = await fetchAccountId(server.baseUrl, ownerToken);

      const friend = await createTestAuth(server.baseUrl);
      const friendId = await fetchAccountId(server.baseUrl, friend.token);
      const usernameSuffix = run.runId.replace(/[^a-z0-9]/gi, '').slice(-12).toLowerCase();
      const friendUsername = `friend_${usernameSuffix}`;
      // Friendship requires a username on both sides.
      await setUsername(server.baseUrl, ownerToken, `owner_${usernameSuffix}`);
      await setUsername(server.baseUrl, friend.token, friendUsername);
      await addFriend(server.baseUrl, ownerToken, friendId);
      await addFriend(server.baseUrl, friend.token, ownerId);

      // A web-created account already holds encrypted data, so plaintext mode goes through the
      // same settings migration a person uses rather than the bare mode switch.
      await page.goto(`${uiBaseUrl}/settings/account`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('settings-account-encryption-mode-switch')).toHaveCount(1, { timeout: 120_000 });
      const migrated = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/v1/account/encryption/migrate'
          && response.request().method() === 'POST'
          && response.status() === 200,
        { timeout: 60_000 },
      );
      await page.getByTestId('settings-account-encryption-mode-switch').click();
      expect(((await (await migrated).json()) as { mode?: unknown }).mode).toBe('plain');

      // The owner chooses the name friends see through the real settings prompt.
      const ownerDisplayName = 'Owner Ada';
      await page.getByTestId('settings-account-display-name').click();
      await page.getByTestId('web-prompt-input').fill(ownerDisplayName);
      const savedName = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/v1/account/display-name'
          && response.request().method() === 'POST'
          && response.status() === 200,
        { timeout: 60_000 },
      );
      await page.getByTestId('web-prompt-confirm').click();
      expect(((await (await savedName).json()) as { displayName?: unknown }).displayName).toBe(ownerDisplayName);
      await expect(page.getByTestId('settings-account-display-name')).toContainText(ownerDisplayName, { timeout: 30_000 });

      // The friend chooses theirs too; the transcript label must use it instead of the username.
      const friendDisplayName = 'Grace Friend';
      const friendName = await fetchJson<{ displayName?: unknown }>(`${server.baseUrl}/v1/account/display-name`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${friend.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: friendDisplayName }),
        timeoutMs: 15_000,
      });
      expect(friendName.status).toBe(200);
      expect(friendName.data?.displayName).toBe(friendDisplayName);

      const created = await fetchJson<{ session?: { id?: unknown } }>(`${server.baseUrl}/v1/sessions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag: `ui-e2e-message-author-${run.runId}`,
          encryptionMode: 'plain',
          metadata: JSON.stringify({ v: 1, path: '/tmp/shared-author', flavor: 'claude', name: 'Shared author check' }),
          agentState: null,
          dataEncryptionKey: null,
        }),
        timeoutMs: 15_000,
      });
      expect(created.status).toBe(200);
      const sessionId = String(created.data?.session?.id ?? '');
      expect(sessionId).not.toBe('');

      const share = await fetchJson(`${server.baseUrl}/v1/sessions/${sessionId}/shares`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: friendId, accessLevel: 'edit' }),
        timeoutMs: 15_000,
      });
      expect(share.status).toBe(200);

      const ownerPrompt = `owner prompt ${run.runId}`;
      const friendPrompt = `friend prompt ${run.runId}`;
      await postPlainUserPrompt({ baseUrl: server.baseUrl, token: ownerToken, sessionId, localId: 'owner-prompt', text: ownerPrompt });
      await postPlainUserPrompt({ baseUrl: server.baseUrl, token: friend.token, sessionId, localId: 'friend-prompt', text: friendPrompt });

      // The server attributes each prompt to the Account that actually sent it.
      const listed = await fetchJson<{ messages?: Array<{ localId?: unknown; authorAccountId?: unknown }> }>(
        `${server.baseUrl}/v1/sessions/${sessionId}/messages?limit=10`,
        { headers: { Authorization: `Bearer ${ownerToken}` }, timeoutMs: 15_000 },
      );
      expect(listed.status).toBe(200);
      const authorsByLocalId = Object.fromEntries((listed.data?.messages ?? []).map((row) => [row.localId, row.authorAccountId]));
      expect(authorsByLocalId).toMatchObject({ 'owner-prompt': ownerId, 'friend-prompt': friendId });

      await gotoDomContentLoadedWithRetries(page, `${uiBaseUrl}/session/${sessionId}`, 120_000);
      await expect(page.getByText(ownerPrompt)).toHaveCount(1, { timeout: 120_000 });
      await expect(page.getByText(friendPrompt)).toHaveCount(1, { timeout: 120_000 });

      const attributions = page.locator('[data-testid^="transcript-author-attribution:"]');
      await expect(attributions).toHaveCount(1, { timeout: 60_000 });
      // The name resolves from the friend's profile; the username or the fallback label would mean
      // the chosen display name never reached the transcript.
      await expect(attributions).toHaveText(friendDisplayName, { timeout: 60_000 });
      await expect(attributions).toHaveAttribute('aria-label', `Sent by ${friendDisplayName}`);

      await testInfo.attach('shared-session-authors.png', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    } catch (error) {
      await testInfo.attach('browser-diagnostics.md', { body: diagnostics(), contentType: 'text/markdown' });
      throw error;
    }
  });
});
