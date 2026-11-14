import { z } from 'zod';

import { lazySchema } from '../lazySchema.js';

/**
 * A display name renders in the same single-line identity slots as a username (friends, share
 * rows, transcript sender labels). Servers may configure usernames up to 128 characters, the
 * longest identity string those slots already accept, so a chosen name shares that ceiling.
 */
export const ACCOUNT_DISPLAY_NAME_MAX_LENGTH = 128;

// Control characters, line breaks included, would break those single-line slots.
const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;

export type AccountDisplayNameNormalization =
  | Readonly<{ ok: true; displayName: string | null }>
  | Readonly<{ ok: false }>;

/**
 * The single rule for a chosen display name: surrounding whitespace is dropped, an empty result
 * clears the name, and an over-long name or one with control characters is rejected. Length is
 * counted in code points so emoji and non-Latin scripts are not penalized.
 */
export function normalizeAccountDisplayName(input: string | null): AccountDisplayNameNormalization {
  if (input === null) return { ok: true, displayName: null };
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: true, displayName: null };
  if (Array.from(trimmed).length > ACCOUNT_DISPLAY_NAME_MAX_LENGTH) return { ok: false };
  if (CONTROL_CHARACTER_PATTERN.test(trimmed)) return { ok: false };
  return { ok: true, displayName: trimmed };
}

export const AccountDisplayNameUpdateRequestSchema = lazySchema(() => z.object({
  displayName: z.string().nullable(),
}).strict());

export type AccountDisplayNameUpdateRequest = z.infer<typeof AccountDisplayNameUpdateRequestSchema>;

export const AccountDisplayNameUpdateResponseSchema = lazySchema(() => z.object({
  displayName: z.string().nullable(),
}).strict());

export type AccountDisplayNameUpdateResponse = z.infer<typeof AccountDisplayNameUpdateResponseSchema>;
