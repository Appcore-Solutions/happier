import { describe, expect, it } from 'vitest';

import { getDisplayName } from './friendTypes';

describe('getDisplayName (how Happier names another person)', () => {
    it.each([
        {
            case: 'a chosen display name wins over the provider name and username',
            person: { displayName: 'Ada', firstName: 'Augusta', lastName: 'King', username: 'ada_l' },
            expected: 'Ada',
        },
        {
            case: 'the provider name is used when no display name is chosen',
            person: { displayName: null, firstName: 'Augusta', lastName: 'King', username: 'ada_l' },
            expected: 'Augusta King',
        },
        {
            case: 'the username is the last resort',
            person: { displayName: '   ', firstName: '', lastName: null, username: 'ada_l' },
            expected: 'ada_l',
        },
        {
            case: 'share profiles from servers without display names still resolve',
            person: { firstName: null, lastName: null, username: 'ada_l' },
            expected: 'ada_l',
        },
    ])('$case', ({ person, expected }) => {
        expect(getDisplayName(person)).toBe(expected);
    });
});
