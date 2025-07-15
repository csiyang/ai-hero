import type { Message } from "ai";
import {
  streamText,
  createDataStreamResponse,
  appendResponseMessages,
} from "ai";
import { auth } from "~/server/auth";
import { model } from "~/models";
import {
  checkRateLimit,
  recordUserRequest,
  upsertChat,
} from "~/server/db/queries";
import { randomUUID } from "crypto";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json()) as {
    messages: Array<Message>;
    chatId?: string;
  };

  const { messages, chatId } = body;

  // Check rate limit before processing the request
  const rateLimit = await checkRateLimit(session.user.id);

  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded",
        message: `You have exceeded your daily limit of ${rateLimit.limit} requests. Please try again tomorrow.`,
        remaining: rateLimit.remaining,
        limit: rateLimit.limit,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": rateLimit.remaining.toString(),
          "X-RateLimit-Limit": rateLimit.limit.toString(),
        },
      },
    );
  }

  // Generate a chat ID if not provided
  const finalChatId = chatId ?? randomUUID();

  // Generate a title from the first user message
  const firstUserMessage = messages.find((msg) => msg.role === "user");
  const title = firstUserMessage?.content?.slice(0, 100) ?? "New Chat";

  // Create or update the chat record immediately to protect against broken streams
  // We'll save the complete conversation (including user message) in onFinish
  await upsertChat({
    userId: session.user.id,
    chatId: finalChatId,
    title,
    messages: [], // Don't save messages yet, save complete conversation in onFinish
  });

  return createDataStreamResponse({
    execute: async (dataStream) => {
      const { messages } = body;

      // Record the request before processing
      await recordUserRequest(session.user.id);

      const result = streamText({
        model,
        messages,
        system: `You are a helpful AI assistant with access to web search capabilities through search grounding. 

When users ask questions that require current information, facts, or recent events, you can use your built-in search capabilities to find relevant information.

Always search when:
- Users ask about current events, news, or recent developments
- Users ask for factual information that might be time-sensitive
- Users ask about specific products, services, or companies
- Users ask for recommendations or reviews
- Users ask about weather, sports scores, or other real-time data

After searching, always cite your sources with inline links using the format [source name](link). Provide comprehensive answers based on the search results while maintaining accuracy and relevance.

IMPORTANT: Always format URLs as markdown links using the [text](url) format. Never include raw URLs in your responses. For example:
- ✅ "According to [TechCrunch](https://techcrunch.com/article), the latest developments..."
- ❌ "According to TechCrunch at https://techcrunch.com/article, the latest developments..."

If you cannot find relevant information through search, be honest about it and suggest alternative approaches.`,
        maxSteps: 10,
        onFinish({
          text: _text,
          finishReason: _finishReason,
          usage: _usage,
          response,
        }) {
          const responseMessages = response.messages;

          const updatedMessages = appendResponseMessages({
            messages, // from the POST body
            responseMessages,
          });

          // Save the complete conversation to the database
          // This handles both new chats (created above) and existing chats
          upsertChat({
            userId: session.user.id,
            chatId: finalChatId,
            title,
            messages: updatedMessages,
          }).catch((error) => {
            console.error("Failed to save chat:", error);
          });
        },
      });

      result.mergeIntoDataStream(dataStream, {
        sendSources: true,
      });
    },
    onError: (e) => {
      console.error(e);
      return "Oops, an error occured!";
    },
  });
}
