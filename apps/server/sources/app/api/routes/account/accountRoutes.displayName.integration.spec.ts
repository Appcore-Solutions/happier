import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/storage/db";
import { auth } from "@/app/auth/auth";
import { createLightSqliteHarness, type LightSqliteHarness } from "@/testkit/lightSqliteHarness";
import { withAuthenticatedTestApp } from "../../testkit/sqliteFastify";
import { userRoutes } from "../user/userRoutes";
import { accountRoutes } from "./accountRoutes";

describe("Account display name (integration)", () => {
    let harness: LightSqliteHarness;

    beforeAll(async () => {
        harness = await createLightSqliteHarness({
            tempDirPrefix: "happier-account-display-name-",
            initAuth: false,
            env: { HAPPIER_FEATURE_SOCIAL_FRIENDS__ENABLED: "1" },
        });
        await auth.init();
    }, 120_000);

    afterAll(async () => {
        await harness.close();
    });

    afterEach(async () => {
        harness.resetEnv();
        await harness.resetDbTables([
            () => db.accountChange.deleteMany(),
            () => db.repeatKey.deleteMany(),
            () => db.account.deleteMany(),
        ]);
    });

    const registerRoutes = (app: any) => {
        accountRoutes(app);
        void userRoutes(app);
    };

    it("lets a person choose the name others see, keeps it on invalid input, and falls back when cleared", async () => {
        await withAuthenticatedTestApp(registerRoutes, async (app) => {
            const person = await db.account.create({
                data: { publicKey: "pk-display-name-person", username: "ada_l", firstName: "Augusta", lastName: "King" },
                select: { id: true },
            });
            const friend = await db.account.create({ data: { publicKey: "pk-display-name-friend" }, select: { id: true } });
            const setName = (displayName: string | null) => app.inject({
                method: "POST",
                url: "/v1/account/display-name",
                headers: { "x-test-user-id": person.id },
                payload: { displayName },
            });
            const seenByFriend = async () => (await app.inject({
                method: "GET",
                url: `/v1/user/${person.id}`,
                headers: { "x-test-user-id": friend.id },
            })).json().user;

            const saved = await setName("  Ada Lovelace  ");
            expect(saved.statusCode).toBe(200);
            expect(saved.json()).toEqual({ displayName: "Ada Lovelace" });
            await expect(seenByFriend()).resolves.toMatchObject({ displayName: "Ada Lovelace", firstName: "Augusta" });
            const ownProfile = await app.inject({
                method: "GET",
                url: "/v1/account/profile",
                headers: { "x-test-user-id": person.id },
            });
            expect(ownProfile.json()).toMatchObject({ displayName: "Ada Lovelace" });

            for (const invalid of ["Ada\nLovelace", "x".repeat(129)]) {
                const rejected = await setName(invalid);
                expect(rejected.statusCode).toBe(400);
                expect(rejected.json()).toEqual({ error: "invalid-display-name" });
            }
            await expect(seenByFriend()).resolves.toMatchObject({ displayName: "Ada Lovelace" });

            for (const cleared of ["   ", null]) {
                const res = await setName(cleared);
                expect(res.statusCode).toBe(200);
                expect(res.json()).toEqual({ displayName: null });
                await expect(seenByFriend()).resolves.toMatchObject({ displayName: null, firstName: "Augusta" });
            }
        });
    });

    it("rejects display names while Friends is off, because nobody else can see them", async () => {
        harness.resetEnv({ HAPPIER_FEATURE_SOCIAL_FRIENDS__ENABLED: "0" });
        await withAuthenticatedTestApp(registerRoutes, async (app) => {
            const person = await db.account.create({ data: { publicKey: "pk-display-name-off" }, select: { id: true } });
            const res = await app.inject({
                method: "POST",
                url: "/v1/account/display-name",
                headers: { "x-test-user-id": person.id },
                payload: { displayName: "Ada" },
            });
            expect(res.statusCode).toBe(400);
            expect(res.json()).toEqual({ error: "friends-disabled" });
        });
    });
});
