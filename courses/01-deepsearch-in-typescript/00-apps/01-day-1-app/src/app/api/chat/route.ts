import type { Message } from "ai";
import { streamText, createDataStreamResponse } from "ai";
import { z } from "zod";
import { auth } from "~/server/auth";
import { model } from "~/models";
import { searchSerper } from "~/serper";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json()) as {
    messages: Array<Message>;
  };

  return createDataStreamResponse({
    execute: async (dataStream) => {
      const { messages } = body;

      const result = streamText({
        model,
        messages,
        system: `You are a helpful AI assistant with access to web search capabilities. 

When users ask questions that require current information, facts, or recent events, you should use the search web tool to find relevant information.

Always search the web when:
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
        tools: {
          searchWeb: {
            parameters: z.object({
              query: z.string().describe("The query to search the web for"),
            }),
            execute: async ({ query }: { query: string }, { abortSignal }) => {
              const results = await searchSerper(
                { q: query, num: 10 },
                abortSignal,
              );

              return results.organic.map((result) => ({
                title: result.title,
                link: result.link,
                snippet: result.snippet,
              }));
            },
          },
        },
      });

      result.mergeIntoDataStream(dataStream);
    },
    onError: (e) => {
      console.error(e);
      return "Oops, an error occured!";
    },
  });
}
