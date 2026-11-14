import { Context } from "@/context";
import { buildUpdateAccountUpdate, eventRouter } from "@/app/events/eventRouter";
import { markAccountChanged } from "@/app/changes/markAccountChanged";
import { afterTx, inTx } from "@/storage/inTx";
import { randomKeyNaked } from "@/utils/keys/randomKeyNaked";

/**
 * Sets the name a person chose to show others; `null` clears it, so readers fall back to the
 * identity-provider name and then the username. The caller passes an already-normalized value
 * (`normalizeAccountDisplayName`). An unchanged name writes nothing and notifies nobody.
 *
 * The person's own clients learn of the change through the account update; other people pick it
 * up on their next profile read, exactly as for username changes.
 */
export async function displayNameUpdate(ctx: Context, displayName: string | null): Promise<void> {
    const userId = ctx.uid;
    await inTx(async (tx) => {
        const current = await tx.account.findUniqueOrThrow({
            where: { id: userId },
            select: { displayName: true },
        });
        if (current.displayName === displayName) return;

        await tx.account.update({
            where: { id: userId },
            data: { displayName },
        });
        const cursor = await markAccountChanged(tx, { accountId: userId, kind: 'account', entityId: 'self', hint: { displayName: true } });

        afterTx(tx, () => {
            eventRouter.emitUpdate({
                userId,
                payload: buildUpdateAccountUpdate(userId, { displayName }, cursor, randomKeyNaked(12)),
                recipientFilter: { type: 'user-scoped-only' },
            });
        });
    });
}
