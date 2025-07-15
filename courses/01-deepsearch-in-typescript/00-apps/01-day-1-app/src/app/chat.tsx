"use client";

import { useState, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { useRouter } from "next/navigation";
import { Send, Loader2 } from "lucide-react";
import type { Message } from "ai";
import { StickToBottom } from "use-stick-to-bottom";
import { ChatMessage } from "~/components/chat-message";
import { SignInModal } from "~/components/sign-in-modal";
import { isNewChatCreated } from "~/utils";

interface ChatProps {
  userName: string;
  isAuthenticated: boolean;
  chatId: string;
  isNewChat: boolean;
  initialMessages?: Message[];
  onNewChatCreated?: (chatId: string) => void;
}

export const ChatPage = ({
  userName,
  isAuthenticated,
  chatId,
  isNewChat,
  initialMessages,
  onNewChatCreated,
}: ChatProps) => {
  const router = useRouter();
  const { messages, input, handleInputChange, handleSubmit, isLoading, data } =
    useChat({
      body: {
        chatId,
        isNewChat,
      },
      initialMessages,
    });
  const [showSignInModal, setShowSignInModal] = useState(false);

  // Handle redirect when a new chat is created
  useEffect(() => {
    const lastDataItem = data?.[data.length - 1];

    if (lastDataItem && isNewChatCreated(lastDataItem)) {
      const newChatId = lastDataItem.chatId;
      router.push(`?id=${newChatId}`);
      // Notify parent component about the new chat
      onNewChatCreated?.(newChatId);
    }
  }, [data, router, onNewChatCreated]);

  const handleFormSubmit = (e: React.FormEvent) => {
    if (!isAuthenticated) {
      e.preventDefault();
      setShowSignInModal(true);
      return;
    }
    handleSubmit(e);
  };

  return (
    <>
      <StickToBottom
        className="flex flex-1 flex-col [&>div]:scrollbar-thin [&>div]:scrollbar-track-gray-800 [&>div]:scrollbar-thumb-gray-600 [&>div]:hover:scrollbar-thumb-gray-500"
        resize="smooth"
        initial="smooth"
      >
        <StickToBottom.Content className="mx-auto w-full max-w-[65ch] flex-1 p-4">
          {messages.map((message, index) => {
            return (
              <ChatMessage
                key={message.id || index}
                message={message}
                userName={userName}
              />
            );
          })}
        </StickToBottom.Content>

        <div className="border-t border-gray-700">
          <form
            onSubmit={handleFormSubmit}
            className="mx-auto max-w-[65ch] p-4"
          >
            <div className="flex gap-2">
              <input
                value={input}
                onChange={handleInputChange}
                placeholder="Say something..."
                autoFocus
                aria-label="Chat input"
                className="flex-1 rounded border border-gray-700 bg-gray-800 p-2 text-gray-200 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-600 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:hover:bg-gray-700"
              >
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </button>
            </div>
          </form>
        </div>
      </StickToBottom>

      <SignInModal
        isOpen={showSignInModal}
        onClose={() => setShowSignInModal(false)}
      />
    </>
  );
};
