import { z } from "zod";
import {
    AccountDisplayNameUpdateRequestSchema,
    AccountDisplayNameUpdateResponseSchema,
    normalizeAccountDisplayName,
} from "@happier-dev/protocol";
import { Context } from "@/context";
import { displayNameUpdate } from "@/app/social/displayNameUpdate";
import { resolveFriendsPolicyFromServerFeatures } from "@/app/social/resolveFriendsPolicyFromServerFeatures";
import { type Fastify } from "../../types";

/**
 * Sets or clears the caller's display name. A display name is only ever shown to friends and
 * people a session is shared with, so it follows the Friends feature like the username does.
 */
export function registerAccountDisplayNameRoute(app: Fastify): void {
    app.post('/v1/account/display-name', {
        preHandler: app.authenticate,
        schema: {
            body: AccountDisplayNameUpdateRequestSchema,
            response: {
                200: AccountDisplayNameUpdateResponseSchema,
                400: z.object({ error: z.enum(['invalid-display-name', 'friends-disabled']) }),
            },
        },
    }, async (request, reply) => {
        if (!resolveFriendsPolicyFromServerFeatures(process.env).enabled) {
            return reply.code(400).send({ error: 'friends-disabled' });
        }
        const normalized = normalizeAccountDisplayName(request.body.displayName);
        if (!normalized.ok) {
            return reply.code(400).send({ error: 'invalid-display-name' });
        }
        await displayNameUpdate(Context.create(request.userId), normalized.displayName);
        return reply.send({ displayName: normalized.displayName });
    });
}
