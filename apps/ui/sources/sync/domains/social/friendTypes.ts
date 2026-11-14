import type { RelationshipStatus, UserProfile } from '@happier-dev/protocol';

export {
    RelationshipStatusSchema,
    type RelationshipStatus,
    UserProfileSchema,
    type UserProfile,
    UserResponseSchema,
    type UserResponse,
    FriendsResponseSchema,
    type FriendsResponse,
    UsersSearchResponseSchema,
    type UsersSearchResponse,
    RelationshipUpdatedEventSchema,
    type RelationshipUpdatedEvent,
} from '@happier-dev/protocol';

//
// Utility functions
//

/** The name facts every profile shape (friend, share, own account) carries. */
export type PersonNameFacts = Readonly<{
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
}>;

/**
 * The name a person chose to show others, else their identity-provider name; null when neither
 * exists. Every surface that names a person starts from this order.
 */
export function readChosenOrRealName(person: PersonNameFacts): string | null {
    const chosen = person.displayName?.trim();
    if (chosen) return chosen;
    const realName = [person.firstName, person.lastName].filter(Boolean).join(' ');
    return realName || null;
}

/** How Happier names another person: chosen name, then provider name, then username. */
export function getDisplayName(person: PersonNameFacts): string {
    return readChosenOrRealName(person) ?? person.username ?? '';
}

export function isFriend(status: RelationshipStatus): boolean {
    return status === 'friend';
}

export function isPendingRequest(status: RelationshipStatus): boolean {
    return status === 'pending';
}

export function isRequested(status: RelationshipStatus): boolean {
    return status === 'requested';
}
