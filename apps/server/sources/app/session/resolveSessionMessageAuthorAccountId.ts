import type { SessionMessageRole } from "@happier-dev/protocol";

/**
 * Transcript authorship attributes user prompts to the Account that submitted them, so shared
 * Session participants can see who sent each prompt. Agent output, events and role-less legacy
 * rows are not submitted by an Account and carry no author.
 *
 * `submittedBy` must come from server authority: the authenticated writer for a direct write, or
 * the Pending row's stamped author when the owner's runtime settles that row.
 */
export function resolveSessionMessageAuthorAccountId(params: Readonly<{
    messageRole: SessionMessageRole | null;
    submittedBy: string | null;
}>): string | null {
    return params.messageRole === "user" ? params.submittedBy : null;
}
