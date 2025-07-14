import ReactMarkdown, { type Components } from "react-markdown";
import type { Message } from "ai";
import { Wrench, CheckCircle, Clock } from "lucide-react";

export type MessagePart = NonNullable<Message["parts"]>[number];

interface ChatMessageProps {
  message: Message;
  userName: string;
}

const components: Components = {
  // Override default elements with custom styling
  p: ({ children }) => <p className="mb-4 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 list-disc pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal pl-4">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  code: ({ className, children, ...props }) => (
    <code className={`${className ?? ""}`} {...props}>
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mb-4 overflow-x-auto rounded-lg bg-gray-700 p-4">
      {children}
    </pre>
  ),
  a: ({ children, ...props }) => (
    <a
      className="text-blue-400 underline"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
};

const Markdown = ({ children }: { children: string }) => {
  return <ReactMarkdown components={components}>{children}</ReactMarkdown>;
};

const ToolInvocationPart = ({ part }: { part: MessagePart }) => {
  if (part.type !== "tool-invocation") return null;

  const { toolInvocation } = part;

  const getStatusIcon = () => {
    switch (toolInvocation.state) {
      case "partial-call":
        return <Clock className="size-4 text-yellow-400" />;
      case "call":
        return <Wrench className="size-4 text-blue-400" />;
      case "result":
        return <CheckCircle className="size-4 text-green-400" />;
      default:
        return <Wrench className="size-4 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (toolInvocation.state) {
      case "partial-call":
        return "Calling tool...";
      case "call":
        return `Called ${toolInvocation.toolName}`;
      case "result":
        return `Result from ${toolInvocation.toolName}`;
      default:
        return "Tool invocation";
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-gray-600 bg-gray-800 p-3">
      <div className="mb-2 flex items-center gap-2">
        {getStatusIcon()}
        <span className="text-sm font-medium text-gray-300">
          {getStatusText()}
        </span>
      </div>

      {toolInvocation.state === "call" ||
      toolInvocation.state === "partial-call" ? (
        <div className="space-y-2">
          <div>
            <span className="text-xs text-gray-400">Tool:</span>
            <span className="ml-2 text-sm text-gray-200">
              {toolInvocation.toolName}
            </span>
          </div>
          <div>
            <span className="text-xs text-gray-400">Arguments:</span>
            <pre className="mt-1 rounded bg-gray-700 p-2 text-xs text-gray-200">
              {JSON.stringify(toolInvocation.args, null, 2)}
            </pre>
          </div>
        </div>
      ) : toolInvocation.state === "result" ? (
        <div className="space-y-2">
          <div>
            <span className="text-xs text-gray-400">Tool:</span>
            <span className="ml-2 text-sm text-gray-200">
              {toolInvocation.toolName}
            </span>
          </div>
          <div>
            <span className="text-xs text-gray-400">Result:</span>
            <pre className="mt-1 rounded bg-gray-700 p-2 text-xs text-gray-200">
              {JSON.stringify(toolInvocation.result, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const MessagePartRenderer = ({ part }: { part: MessagePart }) => {
  switch (part.type) {
    case "text":
      return <Markdown>{part.text}</Markdown>;
    case "tool-invocation":
      return <ToolInvocationPart part={part} />;
    default:
      return null;
  }
};

export const ChatMessage = ({ message, userName }: ChatMessageProps) => {
  const isAI = message.role === "assistant";

  return (
    <div className="mb-6">
      <div
        className={`rounded-lg p-4 ${
          isAI ? "bg-gray-800 text-gray-300" : "bg-gray-900 text-gray-300"
        }`}
      >
        <p className="mb-2 text-sm font-semibold text-gray-400">
          {isAI ? "AI" : userName}
        </p>

        <div className="prose prose-invert max-w-none">
          {message.parts?.map((part, index) => (
            <MessagePartRenderer key={index} part={part} />
          )) ?? (
            // Fallback for messages without parts
            <Markdown>{message.content ?? ""}</Markdown>
          )}
        </div>
      </div>
    </div>
  );
};
