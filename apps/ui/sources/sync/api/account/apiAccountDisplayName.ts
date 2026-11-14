import { AccountDisplayNameUpdateResponseSchema } from '@happier-dev/protocol';

import type { AuthCredentials } from '@/auth/storage/tokenStorage';
import { serverFetch } from '@/sync/http/client';
import { HappyError } from '@/utils/errors/errors';
import { backoff } from '@/utils/timing/time';

/** A relay that predates display names has no route for them. */
export const DISPLAY_NAME_UNSUPPORTED_ERROR = 'display-name-unsupported';

/** Sets the caller's display name; `null` clears it. Resolves to the name the server stored. */
export async function setAccountDisplayName(
    credentials: AuthCredentials,
    displayName: string | null,
): Promise<{ displayName: string | null }> {
    return await backoff(async () => {
        const response = await serverFetch('/v1/account/display-name', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${credentials.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ displayName }),
        }, { includeAuth: false });

        if (!response.ok) {
            if (response.status === 404) {
                throw new HappyError(DISPLAY_NAME_UNSUPPORTED_ERROR, false, { status: 404, kind: 'config' });
            }
            if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
                let message = 'Failed to set display name';
                try {
                    const error = await response.json();
                    if (error?.error) message = error.error;
                } catch {
                    // Keep the generic message when the body is not JSON.
                }
                throw new HappyError(message, false, {
                    status: response.status,
                    kind: message === 'friends-disabled' ? 'config' : 'server',
                });
            }
            throw new Error(`Failed to set display name: ${response.status}`);
        }

        const parsed = AccountDisplayNameUpdateResponseSchema.safeParse(await response.json());
        if (!parsed.success) {
            throw new Error('Failed to parse set display name response');
        }
        return parsed.data;
    });
}
