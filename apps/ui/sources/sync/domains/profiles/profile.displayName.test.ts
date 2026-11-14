import { describe, expect, it } from 'vitest';

import { getDisplayName, profileDefaults, type Profile } from './profile';

const github = {
    id: 'github', login: 'octocat', displayName: 'Octo Cat', avatarUrl: null, profileUrl: null, showOnProfile: true,
} satisfies Profile['linkedProviders'][number];

describe('getDisplayName (your own profile)', () => {
    it('shows the name you chose before any linked account name', () => {
        const profile: Profile = { ...profileDefaults, displayName: 'Ada', username: 'ada_l', linkedProviders: [github] };
        expect(getDisplayName(profile)).toBe('Ada');
    });

    it('keeps the linked account name ahead of the username when no name is chosen', () => {
        const profile: Profile = { ...profileDefaults, displayName: null, username: 'ada_l', linkedProviders: [github] };
        expect(getDisplayName(profile)).toBe('Octo Cat');
    });
});
