// server/utils/plan.ts
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Returns true if the user is premium now:
 * - subscription_status === 'active'
 * - current_period_end is in the future
 */
export async function isPremiumUser(userId: string): Promise<boolean> {
  const [row] = await db
    .select({
      status: users.subscriptionStatus,
      periodEnd: users.currentPeriodEnd,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!row) return false;

  const now = Date.now();
  const endsAt = row.periodEnd ? new Date(row.periodEnd).getTime() : null;

  return row.status === "active" && !!endsAt && endsAt > now;
}

/** Optional helper if you want the days remaining number for UI/limits */
export async function subscriptionDaysRemaining(userId: string): Promise<number> {
  const [row] = await db
    .select({ status: users.subscriptionStatus, periodEnd: users.currentPeriodEnd })
    .from(users)
    .where(eq(users.id, userId));

  if (!row || !row.periodEnd) return 0;

  const now = Date.now();
  const end = new Date(row.periodEnd).getTime();
  if (row.status !== "active" || end <= now) return 0;

  const diffMs = end - now;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
