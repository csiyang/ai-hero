import ReactMarkdown, { type Components } from "react-markdown";
import type { Message } from "ai";
import {
  Wrench,
  CheckCircle,
  Clock,
  Search,
  FileText,
  Database,
  Globe,
  ExternalLink,
} from "lucide-react";

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

const getToolIcon = (toolName: string) => {
  const name = toolName.toLowerCase();
  if (name.includes("search") || name.includes("query"))
    return <Search className="size-4" />;
  if (name.includes("file") || name.includes("read"))
    return <FileText className="size-4" />;
  if (name.includes("database") || name.includes("db"))
    return <Database className="size-4" />;
  if (name.includes("web") || name.includes("url"))
    return <Globe className="size-4" />;
  return <Wrench className="size-4" />;
};

const formatToolName = (toolName: string) => {
  return toolName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};

const formatArguments = (args: Record<string, unknown>) => {
  if (typeof args === "string") {
    return args;
  }

  const formatted: string[] = [];

  Object.entries(args).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      const formattedKey = key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
      if (typeof value === "string" && value.length > 100) {
        formatted.push(`${formattedKey}: "${value.substring(0, 100)}..."`);
      } else {
        formatted.push(`${formattedKey}: ${JSON.stringify(value)}`);
      }
    }
  });

  return formatted.join(", ");
};

const formatResult = (result: unknown) => {
  if (typeof result === "string") {
    return result;
  }

  if (Array.isArray(result)) {
    if (result.length === 0) return "No results found";
    if (result.length === 1) return "1 result found";
    return `${result.length} results found`;
  }

  if (typeof result === "object" && result !== null) {
    const obj = result as Record<string, unknown>;
    if (typeof obj.content === "string") return obj.content;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.title === "string") return obj.title;
    if (typeof obj.name === "string") return obj.name;

    // Try to find a meaningful string property
    const stringProps = Object.values(obj).filter(
      (val) => typeof val === "string",
    );
    if (stringProps.length > 0) {
      return stringProps[0]!;
    }
  }

  return JSON.stringify(result);
};

const SourcePart = ({ part }: { part: MessagePart }) => {
  if (part.type !== "source") return null;

  const { source } = part;

  return (
    <div className="mb-4 rounded-lg border border-gray-600 bg-gray-800/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Globe className="size-4 text-blue-400" />
        <span className="text-sm font-medium text-gray-200">Source</span>
      </div>

      {source.title && (
        <div>
          <span className="text-xs text-gray-400">Title:</span>
          <span className="ml-2 text-sm text-gray-200">{source.title}</span>
        </div>
      )}
      <div className="mt-2">
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-400 underline hover:text-blue-300"
        >
          View Source
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
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
        return "Working on it...";
      case "call":
        return `Using ${formatToolName(toolInvocation.toolName)}`;
      case "result":
        return `Found information using ${formatToolName(toolInvocation.toolName)}`;
      default:
        return "Processing...";
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-gray-600 bg-gray-800/50 p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          {toolInvocation.state === "result" &&
            getToolIcon(toolInvocation.toolName)}
        </div>
        <span className="text-sm font-medium text-gray-200">
          {getStatusText()}
        </span>
      </div>

      {toolInvocation.state === "call" ||
      toolInvocation.state === "partial-call" ? (
        <div className="space-y-3">
          {Object.keys(toolInvocation.args).length > 0 && (
            <div className="rounded-md bg-gray-700/50 p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                What I&apos;m looking for
              </div>
              <div className="text-sm text-gray-200">
                {formatArguments(toolInvocation.args)}
              </div>
            </div>
          )}
        </div>
      ) : toolInvocation.state === "result" ? (
        <div className="space-y-3">
          {Object.keys(toolInvocation.args).length > 0 && (
            <div className="rounded-md bg-gray-700/50 p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                What I searched for
              </div>
              <div className="text-sm text-gray-200">
                {formatArguments(toolInvocation.args)}
              </div>
            </div>
          )}

          <div className="rounded-md bg-gray-700/50 p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              What I found
            </div>
            <div className="text-sm text-gray-200">
              {formatResult(toolInvocation.result)}
            </div>
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
    case "source":
      return <SourcePart part={part} />;
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
