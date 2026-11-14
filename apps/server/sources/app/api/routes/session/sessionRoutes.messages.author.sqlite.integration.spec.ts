import { randomUUID } from "node:crypto";

import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";

import { enableAuthentication } from "@/app/api/utils/enableAuthentication";
import { auth } from "@/app/auth/auth";
import { db } from "@/storage/db";
import { createLightSqliteHarness, type LightSqliteHarness } from "@/testkit/lightSqliteHarness";

import { registerSessionMessageRoutes } from "./registerSessionMessageRoutes";

type ListedMessage = { localId: string | null; authorAccountId?: string };

describe("session message authorship over authenticated HTTP and SQLite", () => {
    let harness: LightSqliteHarness;
    let origin: string;
    const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();

    beforeAll(async () => {
        harness = await createLightSqliteHarness({
            tempDirPrefix: "happier-message-author-",
            initAuth: true,
        });
        app.setValidatorCompiler(validatorCompiler);
        app.setSerializerCompiler(serializerCompiler);
        enableAuthentication(app);
        registerSessionMessageRoutes(app);
        origin = await app.listen({ host: "127.0.0.1", port: 0 });
    }, 180_000);

    afterAll(async () => {
        await app.close();
        await harness?.close();
    });

    it("stamps each user prompt with the authenticated sender and reads it back for every participant", async () => {
        const owner = await db.account.create({ data: { publicKey: randomUUID() } });
        const friend = await db.account.create({ data: { publicKey: randomUUID() } });
        const session = await db.session.create({
            data: { accountId: owner.id, tag: randomUUID(), metadata: "{}" },
        });
        await db.sessionShare.create({
            data: {
                sessionId: session.id,
                sharedByUserId: owner.id,
                sharedWithUserId: friend.id,
                accessLevel: "edit",
            },
        });
        const ownerToken = await auth.createToken(owner.id);
        const friendToken = await auth.createToken(friend.id);

        const post = async (token: string, localId: string, messageRole: "user" | "agent") => {
            const response = await fetch(`${origin}/v2/sessions/${session.id}/messages`, {
                method: "POST",
                headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
                body: JSON.stringify({ ciphertext: `cipher-${localId}`, localId, messageRole }),
            });
            expect(response.status).toBe(200);
        };
        await post(friendToken, "friend-prompt", "user");
        await post(ownerToken, "owner-prompt", "user");
        await post(ownerToken, "agent-reply", "agent");
        // A retried write from another participant cannot re-attribute an existing prompt.
        await post(ownerToken, "friend-prompt", "user");

        const listResponse = await fetch(`${origin}/v1/sessions/${session.id}/messages`, {
            headers: { authorization: `Bearer ${friendToken}` },
        });
        expect(listResponse.status).toBe(200);
        const { messages } = await listResponse.json() as { messages: ListedMessage[] };
        const byLocalId = new Map(messages.map((message) => [message.localId, message]));
        expect(byLocalId.get("friend-prompt")?.authorAccountId).toBe(friend.id);
        expect(byLocalId.get("owner-prompt")?.authorAccountId).toBe(owner.id);
        expect(byLocalId.get("agent-reply")).not.toHaveProperty("authorAccountId");

        const exactResponse = await fetch(`${origin}/v2/sessions/${session.id}/messages/by-local-id/friend-prompt`, {
            headers: { authorization: `Bearer ${ownerToken}` },
        });
        expect(exactResponse.status).toBe(200);
        const exact = await exactResponse.json() as { message: ListedMessage };
        expect(exact.message.authorAccountId).toBe(friend.id);
    });
});
