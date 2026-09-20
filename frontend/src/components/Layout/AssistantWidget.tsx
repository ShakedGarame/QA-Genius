import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Loader2 } from "lucide-react";
import clsx from "clsx";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/** Global floating AI assistant — answers questions about the signed-in user's
 * own QA-Genius data (test runs, STDs, log analyses, flakiness). Self-contained:
 * owns its own open/closed and conversation state. Conversation is intentionally
 * ephemeral — it resets on page reload, there's no server-side chat history. */
export default function AssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      // Focus after the panel paints, so autofocus doesn't fight open animation.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  const handleSend = async () => {
    if (sendingRef.current) return;
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    sendingRef.current = true;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError(null);
    setIsSending(true);

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          messages: [...messages, userMessage].map(({ role, content }) => ({ role, content })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Assistant failed to respond");
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: json.reply as string },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assistant failed to respond");
    } finally {
      setIsSending(false);
      sendingRef.current = false;
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-[60] w-12 h-12 rounded-full bg-sky-500 hover:bg-sky-400 text-white shadow-2xl flex items-center justify-center transition-colors"
        aria-label={isOpen ? "Close assistant" : "Open assistant"}
      >
        {isOpen ? <X className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
      </button>

      {isOpen && (
        <div
          className="fixed bottom-20 right-5 z-[60] w-[min(360px,calc(100vw-2.5rem))] max-h-[70vh] bg-surface-800 border border-surface-600 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          role="region"
          aria-label="AI assistant"
        >
          <div className="px-4 py-3 border-b border-surface-600 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-400" aria-hidden />
            <p className="text-sm font-medium text-slate-100">Ask QA-Genius</p>
          </div>

          <div
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[160px]"
            aria-live="polite"
            aria-atomic="false"
          >
            {messages.length === 0 && (
              <p className="text-sm text-slate-500">
                Ask me about your test runs, STDs, or flaky tests.
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={clsx(
                  "text-sm rounded-xl px-3 py-2 max-w-[85%] whitespace-pre-wrap",
                  m.role === "user"
                    ? "bg-sky-500/15 text-white ml-auto"
                    : "bg-surface-700 text-slate-200"
                )}
              >
                {m.content}
              </div>
            ))}
            {error && (
              <div className="text-sm rounded-xl px-3 py-2 bg-red-500/10 text-red-300">
                {error}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-surface-600 flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask a question…"
              className="flex-1 bg-surface-700 text-sm text-slate-100 placeholder:text-slate-500 rounded-lg px-3 py-2 outline-none"
              disabled={isSending}
              maxLength={6000}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending || !input.trim()}
              className="w-9 h-9 flex-shrink-0 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500 text-white flex items-center justify-center transition-colors"
              aria-label="Send"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
