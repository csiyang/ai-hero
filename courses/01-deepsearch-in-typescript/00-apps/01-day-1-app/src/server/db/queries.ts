import { and, count, eq, gte, desc, asc } from "drizzle-orm";
import { db } from "./index";
import { requests, users, chats, messages } from "./schema";
import type { Message } from "ai";

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

export async function upsertChat(opts: {
  userId: string;
  chatId: string;
  title: string;
  messages: Message[];
}) {
  const { userId, chatId, title, messages: messageList } = opts;

  // Check if chat exists and belongs to user
  const existingChat = await db
    .select()
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(1);

  if (existingChat.length > 0) {
    const chat = existingChat[0];
    if (!chat) {
      throw new Error("Chat not found");
    }

    // Chat exists, check if user has permission to modify it
    if (chat.userId !== userId) {
      throw new Error("You don't have permission to modify this chat");
    }

    // Chat exists and user has permission, delete existing messages and replace with new ones
    await db.delete(messages).where(eq(messages.chatId, chatId));

    // Update chat title and timestamp
    await db
      .update(chats)
      .set({
        title,
        updatedAt: new Date(),
      })
      .where(eq(chats.id, chatId));
  } else {
    // Create new chat
    await db.insert(chats).values({
      id: chatId,
      userId,
      title,
    });
  }

  // Insert all messages
  if (messageList.length > 0) {
    const messageValues = messageList.map((message, index) => ({
      chatId,
      role: message.role,
      parts: message.parts,
      order: index,
    }));

    await db.insert(messages).values(messageValues);
  }
}

export async function getChat(chatId: string, userId: string) {
  // Get chat with messages, ensuring it belongs to the user
  const chat = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .limit(1);

  if (chat.length === 0) {
    return null;
  }

  const chatMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.order));

  // Convert back to Message format
  const messageList: Message[] = chatMessages.map((msg) => {
    // Extract text content from parts for the content property
    const parts = msg.parts as Message["parts"];
    const textContent = parts?.[0]?.type === "text" ? parts[0].text : "";

    return {
      id: msg.id,
      role: msg.role as "user" | "assistant" | "system",
      parts,
      content: textContent,
    };
  });

  return {
    ...chat[0],
    messages: messageList,
  };
}

export async function getChats(userId: string) {
  const userChats = await db
    .select({
      id: chats.id,
      title: chats.title,
      createdAt: chats.createdAt,
      updatedAt: chats.updatedAt,
    })
    .from(chats)
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.updatedAt));

  return userChats;
}
