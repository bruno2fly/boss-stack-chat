"use client";

import { useChat } from "ai/react";
import { useEffect, useRef } from "react";

export default function Home() {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    reload,
    error,
  } = useChat({
    api: "/api/chat",
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom as new tokens stream in
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter to send, Shift+Enter for newline
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        handleSubmit();
      }
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-black text-zinc-100">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-900 bg-black/80 px-4 py-3 backdrop-blur">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-500 text-xl shadow-[0_0_20px_rgba(234,179,8,0.25)]">
          🍌
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">Boss</span>
          <span className="text-[11px] text-zinc-500">
            AI Co-founder · 2FLY Digital
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isLoading && (
            <button
              onClick={() => stop()}
              className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-900"
            >
              Stop
            </button>
          )}
          {!isLoading && messages.length > 0 && (
            <button
              onClick={() => reload()}
              className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-900"
            >
              Retry
            </button>
          )}
        </div>
      </header>

      {/* Messages */}
      <main
        ref={scrollRef}
        className="chat-scroll flex-1 overflow-y-auto px-4 py-6"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages.length === 0 && (
            <div className="mt-24 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-500 text-3xl shadow-[0_0_40px_rgba(234,179,8,0.3)]">
                🍌
              </div>
              <p className="text-zinc-400">What's on your mind, Bruno?</p>
              <p className="mt-1 text-xs text-zinc-600">
                Boss is here. No middleware. Just direct.
              </p>
            </div>
          )}

          {messages.map((m) => {
            const isUser = m.role === "user";
            return (
              <div
                key={m.id}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={[
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
                    isUser
                      ? "rounded-br-md bg-blue-600 text-white"
                      : "rounded-bl-md bg-zinc-900 text-zinc-100 ring-1 ring-inset ring-zinc-800",
                  ].join(" ")}
                >
                  {m.content || (
                    <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-zinc-600" />
                  )}
                </div>
              </div>
            );
          })}

          {error && (
            <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              Something broke: {error.message}
            </div>
          )}
        </div>
      </main>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        className="safe-bottom shrink-0 border-t border-zinc-900 bg-black/80 px-4 py-3 backdrop-blur"
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Message Boss…"
            className="max-h-40 min-h-[42px] flex-1 resize-none rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
            disabled={isLoading}
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-[42px] shrink-0 items-center justify-center rounded-2xl bg-yellow-500 px-4 text-sm font-semibold text-black transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
          >
            {isLoading ? "…" : "Send"}
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-2xl text-center text-[10px] text-zinc-600">
          Enter to send · Shift+Enter for newline
        </p>
      </form>
    </div>
  );
}
