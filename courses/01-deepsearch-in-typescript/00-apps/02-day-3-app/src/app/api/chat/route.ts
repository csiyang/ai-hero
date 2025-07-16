import type { Message } from "ai";
import {
  streamText,
  createDataStreamResponse,
  appendResponseMessages,
} from "ai";
import { model } from "~/model";
import { auth } from "~/server/auth";
import { searchSerper } from "~/serper";
import { bulkCrawlWebsites } from "~/scraper";
import { z } from "zod";
import { upsertChat } from "~/server/db/queries";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { chats } from "~/server/db/schema";
import { Langfuse } from "langfuse";
import { env } from "~/env";

const langfuse = new Langfuse({
  environment: env.NODE_ENV,
});

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json()) as {
    messages: Array<Message>;
    chatId?: string;
  };

  const { messages, chatId } = body;

  if (!messages.length) {
    return new Response("No messages provided", { status: 400 });
  }

  // Create trace at the beginning
  const trace = langfuse.trace({
    name: "chat",
    userId: session.user.id,
  });

  // If no chatId is provided, create a new chat with the user's message
  let currentChatId = chatId;
  if (!currentChatId) {
    const newChatId = crypto.randomUUID();

    const createChatSpan = trace.span({
      name: "create-new-chat",
      input: {
        userId: session.user.id,
        chatId: newChatId,
        title: messages[messages.length - 1]!.content.slice(0, 50) + "...",
        messageCount: messages.length,
      },
    });

    try {
      await upsertChat({
        userId: session.user.id,
        chatId: newChatId,
        title: messages[messages.length - 1]!.content.slice(0, 50) + "...",
        messages: messages, // Only save the user's message initially
      });

      createChatSpan.end({
        output: {
          chatId: newChatId,
          success: true,
        },
      });
    } catch (error) {
      createChatSpan.end({
        output: {
          error: error instanceof Error ? error.message : "Unknown error",
          success: false,
        },
      });
      throw error;
    }

    currentChatId = newChatId;
  } else {
    // Verify the chat belongs to the user
    const verifyChatSpan = trace.span({
      name: "verify-chat-ownership",
      input: {
        chatId: currentChatId,
        userId: session.user.id,
      },
    });

    try {
      const chat = await db.query.chats.findFirst({
        where: eq(chats.id, currentChatId),
      });

      if (!chat || chat.userId !== session.user.id) {
        verifyChatSpan.end({
          output: {
            success: false,
            error: "Chat not found or unauthorized",
          },
        });
        return new Response("Chat not found or unauthorized", { status: 404 });
      }

      verifyChatSpan.end({
        output: {
          success: true,
          chatFound: true,
          chatOwner: chat.userId,
        },
      });
    } catch (error) {
      verifyChatSpan.end({
        output: {
          error: error instanceof Error ? error.message : "Unknown error",
          success: false,
        },
      });
      throw error;
    }
  }

  // Update trace with sessionId now that we have the chatId
  trace.update({
    sessionId: currentChatId,
  });

  return createDataStreamResponse({
    execute: async (dataStream) => {
      // If this is a new chat, send the chat ID to the frontend
      if (!chatId) {
        dataStream.writeData({
          type: "NEW_CHAT_CREATED",
          chatId: currentChatId,
        });
      }

      const result = streamText({
        model,
        messages,
        maxSteps: 10,
        experimental_telemetry: {
          isEnabled: true,
          functionId: `agent`,
          metadata: {
            langfuseTraceId: trace.id,
          },
        },
        system: `You are a helpful AI assistant with access to real-time web search and web scraping capabilities. 

CURRENT DATE AND TIME: ${new Date().toISOString()}

When answering questions:

1. Always search the web for up-to-date information when relevant
2. ALWAYS format URLs as markdown links using the format [title](url)
3. Be thorough but concise in your responses
4. If you're unsure about something, search the web to verify
5. When providing information, always include the source where you found it using markdown links
6. Never include raw URLs - always use markdown link format
7. When users ask for "up to date" or "current" information, use the current date above to determine what constitutes recent information
8. Pay attention to publication dates in search results and prioritize more recent information when available

Available tools:
- searchWeb: Use this to search the web for current information. This returns search snippets with publication dates when available.
- scrapePages: Use this when you need the full content of specific web pages. This tool will:
  * Fetch the complete HTML of the pages
  * Check robots.txt to ensure crawling is allowed
  * Extract the main content (removing navigation, ads, etc.)
  * Convert the content to clean markdown format
  * Handle rate limiting and retries automatically
  * Cache results for performance

Use scrapePages when:
- You need detailed information from specific articles or pages
- Search snippets don't provide enough detail
- You want to analyze the full content of a webpage
- You need to extract specific data or quotes from pages

IMPORTANT: When using scrapePages, always scrape 4-6 URLs per query to get comprehensive information from diverse sources. This ensures you have multiple perspectives and detailed content from different websites. Don't just scrape 1-2 URLs - be thorough and gather information from multiple sources. Choose URLs from different domains and sources to get a well-rounded view of the topic.

Remember to use the searchWeb tool for general searches and scrapePages for detailed content extraction.`,
        tools: {
          searchWeb: {
            parameters: z.object({
              query: z.string().describe("The query to search the web for"),
            }),
            execute: async ({ query }, { abortSignal }) => {
              const results = await searchSerper(
                { q: query, num: 10 },
                abortSignal,
              );

              return results.organic.map((result) => ({
                title: result.title,
                link: result.link,
                snippet: result.snippet,
                date: result.date,
              }));
            },
          },
          scrapePages: {
            parameters: z.object({
              urls: z
                .array(z.string())
                .describe("Array of URLs to scrape and extract content from"),
            }),
            execute: async ({ urls }, { abortSignal: _abortSignal }) => {
              const result = await bulkCrawlWebsites({ urls });

              if (!result.success) {
                return {
                  error: result.error,
                  results: result.results.map((r) => ({
                    url: r.url,
                    success: r.result.success,
                    data: r.result.success ? r.result.data : r.result.error,
                  })),
                };
              }

              return {
                success: true,
                results: result.results.map((r) => ({
                  url: r.url,
                  data: r.result.data,
                })),
              };
            },
          },
        },
        onFinish: async ({ response }) => {
          // Merge the existing messages with the response messages
          const updatedMessages = appendResponseMessages({
            messages,
            responseMessages: response.messages,
          });

          const lastMessage = messages[messages.length - 1];
          if (!lastMessage) {
            return;
          }

          // Save the complete chat history
          const saveChatSpan = trace.span({
            name: "save-chat-history",
            input: {
              chatId: currentChatId,
              userId: session.user.id,
              messageCount: updatedMessages.length,
              title: lastMessage.content.slice(0, 50) + "...",
            },
          });

          try {
            await upsertChat({
              userId: session.user.id,
              chatId: currentChatId,
              title: lastMessage.content.slice(0, 50) + "...",
              messages: updatedMessages,
            });

            saveChatSpan.end({
              output: {
                success: true,
                savedMessageCount: updatedMessages.length,
              },
            });
          } catch (error) {
            saveChatSpan.end({
              output: {
                error: error instanceof Error ? error.message : "Unknown error",
                success: false,
              },
            });
            throw error;
          }

          await langfuse.flushAsync();
        },
      });

      result.mergeIntoDataStream(dataStream);
    },
    onError: (e) => {
      console.error(e);
      return "Oops, an error occurred!";
    },
  });
}
