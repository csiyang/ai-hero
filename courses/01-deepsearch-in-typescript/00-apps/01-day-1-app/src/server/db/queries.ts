import { and, count, eq, gte } from "drizzle-orm";
import { db } from "./index";
import { requests, users } from "./schema";

const DAILY_REQUEST_LIMIT = 50; // Adjust this number as needed

export async function getUserRequestCountToday(
  userId: string,
): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await db
    .select({ count: count() })
    .from(requests)
    .where(and(eq(requests.userId, userId), gte(requests.createdAt, today)));

  return result[0]?.count ?? 0;
}

export async function isUserAdmin(userId: string): Promise<boolean> {
  const result = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return result[0]?.isAdmin ?? false;
}

export async function recordUserRequest(userId: string): Promise<void> {
  await db.insert(requests).values({
    userId,
  });
}

export async function checkRateLimit(userId: string): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  const isAdmin = await isUserAdmin(userId);

  if (isAdmin) {
    return {
      allowed: true,
      remaining: -1, // -1 indicates unlimited for admins
      limit: -1,
    };
  }

  const requestCount = await getUserRequestCountToday(userId);
  const remaining = Math.max(0, DAILY_REQUEST_LIMIT - requestCount);

  return {
    allowed: requestCount < DAILY_REQUEST_LIMIT,
    remaining,
    limit: DAILY_REQUEST_LIMIT,
  };
}
