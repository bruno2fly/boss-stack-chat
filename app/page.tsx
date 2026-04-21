"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// ============================================================
// Types
// ============================================================
type Category = { id: string; name: string };
type Channel = { id: string; name: string; categoryId: string };
type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

// ============================================================
// Constants
// ============================================================
const KEY_META = "boss_channels";
const KEY_ACTIVE = "boss_active_channel";
const KEY_UNREAD = "boss_unread";
const KEY_MSG = (id: string) => `boss_chat_${id}`;
const MAX_CONTEXT = 20;

const DEFAULT_META: { categories: Category[]; channels: Channel[] } = {
  categories: [
    { id: "cat-command", name: "COMMAND CENTER" },
    { id: "cat-agency", name: "AGENCY" },
    { id: "cat-projects", name: "PROJECTS" },
  ],
  channels: [
    { id: "ch-morning-brief", name: "morning-brief", categoryId: "cat-command" },
    { id: "ch-daily-priorities", name: "daily-priorities", categoryId: "cat-command" },
    { id: "ch-client-alerts", name: "client-alerts", categoryId: "cat-agency" },
    { id: "ch-team-ops", name: "team-ops", categoryId: "cat-agency" },
    { id: "ch-offbounds", name: "offbounds", categoryId: "cat-projects" },
    { id: "ch-boss-stack", name: "boss-stack", categoryId: "cat-projects" },
  ],
};

const makeId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

const slugify = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-_ ]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40) || "channel";

// ============================================================
// Page
// ============================================================
export default function Page() {
  // ----- persistent state -----
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>("");
  const [messagesByChannel, setMessagesByChannel] = useState<
    Record<string, Message[]>
  >({});
  const [streaming, setStreaming] = useState<Set<string>>(new Set());
  const [unread, setUnread] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  // ----- ui state -----
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [renamingChannelId, setRenamingChannelId] = useState<string | null>(null);
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(
    null
  );

  // ----- refs -----
  const activeIdRef = useRef(activeChannelId);
  useEffect(() => {
    activeIdRef.current = activeChannelId;
  }, [activeChannelId]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ==========================================================
  // Hydrate from localStorage
  // ==========================================================
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY_META);
      let meta = DEFAULT_META;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (
            Array.isArray(parsed?.categories) &&
            Array.isArray(parsed?.channels)
          ) {
            meta = {
              categories: parsed.categories,
              channels: parsed.channels,
            };
          }
        } catch {
          /* fall through to defaults */
        }
      }
      setCategories(meta.categories);
      setChannels(meta.channels);

      const msgs: Record<string, Message[]> = {};
      for (const ch of meta.channels) {
        const r = localStorage.getItem(KEY_MSG(ch.id));
        if (!r) continue;
        try {
          const parsed = JSON.parse(r);
          if (Array.isArray(parsed)) msgs[ch.id] = parsed;
        } catch {
          /* skip corrupt */
        }
      }
      setMessagesByChannel(msgs);

      const last = localStorage.getItem(KEY_ACTIVE);
      const picked =
        meta.channels.find((c) => c.id === last)?.id ??
        meta.channels[0]?.id ??
        "";
      setActiveChannelId(picked);

      const ur = localStorage.getItem(KEY_UNREAD);
      if (ur) {
        try {
          const parsed = JSON.parse(ur);
          if (Array.isArray(parsed)) setUnread(new Set(parsed));
        } catch {
          /* skip */
        }
      }
    } finally {
      setHydrated(true);
    }
  }, []);

  // ==========================================================
  // Persist meta / active / unread
  // ==========================================================
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      KEY_META,
      JSON.stringify({ categories, channels })
    );
  }, [categories, channels, hydrated]);

  useEffect(() => {
    if (!hydrated || !activeChannelId) return;
    localStorage.setItem(KEY_ACTIVE, activeChannelId);
  }, [activeChannelId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(KEY_UNREAD, JSON.stringify([...unread]));
  }, [unread, hydrated]);

  // Clear unread + close mobile sidebar when switching channels
  useEffect(() => {
    if (!hydrated || !activeChannelId) return;
    if (unread.has(activeChannelId)) {
      setUnread((u) => {
        const n = new Set(u);
        n.delete(activeChannelId);
        return n;
      });
    }
    setSidebarOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId, hydrated]);

  // ==========================================================
  // Auto-scroll
  // ==========================================================
  useLayoutEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeChannelId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesByChannel, activeChannelId]);

  // ==========================================================
  // Send message (streams even if user switches channels)
  // ==========================================================
  const sendMessage = useCallback(
    async (channelId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const userMsg: Message = {
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };
      const assistantStub: Message = {
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };

      // Build the history for the API call from the latest state.
      let historyForApi: Message[] = [];
      setMessagesByChannel((m) => {
        const cur = m[channelId] ?? [];
        historyForApi = [...cur, userMsg];
        // Persist immediately (user message safe even if network dies)
        localStorage.setItem(KEY_MSG(channelId), JSON.stringify(historyForApi));
        return { ...m, [channelId]: [...historyForApi, assistantStub] };
      });
      setStreaming((s) => new Set(s).add(channelId));

      try {
        const apiMessages = historyForApi
          .slice(-MAX_CONTEXT)
          .map((msg) => ({ role: msg.role, content: msg.content }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
        });

        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessagesByChannel((m) => {
            const chMsgs = m[channelId];
            if (!chMsgs || chMsgs.length === 0) return m;
            const updated = [...chMsgs];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: acc,
            };
            return { ...m, [channelId]: updated };
          });
        }
        acc += decoder.decode();

        // Final persist after stream closes.
        setMessagesByChannel((m) => {
          const chMsgs = m[channelId];
          if (chMsgs) localStorage.setItem(KEY_MSG(channelId), JSON.stringify(chMsgs));
          return m;
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "unknown error";
        setMessagesByChannel((m) => {
          const chMsgs = m[channelId];
          if (!chMsgs || chMsgs.length === 0) return m;
          const updated = [...chMsgs];
          updated[updated.length - 1] = {
            role: "assistant",
            content: `Boss: couldn't reach Claude (${errMsg}). Try again.\n🍌`,
            timestamp: Date.now(),
          };
          localStorage.setItem(KEY_MSG(channelId), JSON.stringify(updated));
          return { ...m, [channelId]: updated };
        });
      } finally {
        setStreaming((s) => {
          const n = new Set(s);
          n.delete(channelId);
          return n;
        });
        // If the user left this channel during streaming, mark unread.
        if (channelId !== activeIdRef.current) {
          setUnread((u) => new Set(u).add(channelId));
        }
      }
    },
    []
  );

  // ==========================================================
  // CRUD — channels
  // ==========================================================
  const addChannel = (categoryId: string) => {
    const raw = window.prompt("New channel name:");
    if (raw === null) return;
    const name = slugify(raw);
    const ch: Channel = { id: makeId("ch"), name, categoryId };
    setChannels((cs) => [...cs, ch]);
    setActiveChannelId(ch.id);
  };

  const commitChannelName = (id: string, newName: string) => {
    const clean = slugify(newName);
    if (!clean) {
      setRenamingChannelId(null);
      return;
    }
    setChannels((cs) => cs.map((c) => (c.id === id ? { ...c, name: clean } : c)));
    setRenamingChannelId(null);
  };

  const deleteChannel = (id: string) => {
    const ch = channels.find((c) => c.id === id);
    if (!ch) return;
    if (!window.confirm(`Delete #${ch.name} and all its history?`)) return;
    setChannels((cs) => cs.filter((c) => c.id !== id));
    setMessagesByChannel((m) => {
      const n = { ...m };
      delete n[id];
      return n;
    });
    localStorage.removeItem(KEY_MSG(id));
    setUnread((u) => {
      const n = new Set(u);
      n.delete(id);
      return n;
    });
    if (activeChannelId === id) {
      const next = channels.find((c) => c.id !== id);
      setActiveChannelId(next?.id ?? "");
    }
  };

  // ==========================================================
  // CRUD — categories
  // ==========================================================
  const addCategory = () => {
    const raw = window.prompt("New category name:");
    if (raw === null) return;
    const name = raw.trim().toUpperCase();
    if (!name) return;
    setCategories((cs) => [...cs, { id: makeId("cat"), name }]);
  };

  const commitCategoryName = (id: string, newName: string) => {
    const clean = newName.trim().toUpperCase();
    if (!clean) {
      setRenamingCategoryId(null);
      return;
    }
    setCategories((cs) =>
      cs.map((c) => (c.id === id ? { ...c, name: clean } : c))
    );
    setRenamingCategoryId(null);
  };

  const deleteCategory = (id: string) => {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    const inCat = channels.filter((c) => c.categoryId === id);
    const msg =
      inCat.length > 0
        ? `Delete category "${cat.name}" and its ${inCat.length} channel${
            inCat.length === 1 ? "" : "s"
          }?`
        : `Delete category "${cat.name}"?`;
    if (!window.confirm(msg)) return;

    setCategories((cs) => cs.filter((c) => c.id !== id));
    setChannels((cs) => cs.filter((c) => c.categoryId !== id));
    for (const ch of inCat) localStorage.removeItem(KEY_MSG(ch.id));
    setMessagesByChannel((m) => {
      const n = { ...m };
      for (const ch of inCat) delete n[ch.id];
      return n;
    });
    setUnread((u) => {
      const n = new Set(u);
      for (const ch of inCat) n.delete(ch.id);
      return n;
    });
    if (inCat.some((c) => c.id === activeChannelId)) {
      const next = channels.find((c) => c.categoryId !== id);
      setActiveChannelId(next?.id ?? "");
    }
  };

  // ==========================================================
  // Derived
  // ==========================================================
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const activeMessages = messagesByChannel[activeChannelId] ?? [];
  const isActiveStreaming = streaming.has(activeChannelId);

  // ==========================================================
  // Render
  // ==========================================================
  if (!hydrated) {
    return <div className="h-dvh bg-black" />;
  }

  return (
    <div className="flex h-dvh bg-black text-zinc-100">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-10 bg-black/70 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          "fixed z-20 h-dvh w-60 shrink-0 border-r border-zinc-900 bg-zinc-950",
          "md:static md:block",
          sidebarOpen ? "block" : "hidden md:block",
        ].join(" ")}
      >
        <div className="flex h-full flex-col">
          {/* Server header */}
          <div className="flex shrink-0 items-center gap-2 border-b border-zinc-900 px-3 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-500 text-lg shadow-[0_0_20px_rgba(234,179,8,0.25)]">
              🍌
            </div>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">Boss</span>
              <span className="text-[10px] text-zinc-500">2FLY Digital</span>
            </div>
            <button
              onClick={addCategory}
              title="Add category"
              aria-label="Add category"
              className="ml-auto flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              +
            </button>
          </div>

          {/* Categories + channels */}
          <nav className="chat-scroll flex-1 overflow-y-auto px-1 py-2">
            {categories.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-zinc-600">
                No categories yet. Click + above.
              </div>
            )}
            {categories.map((cat) => {
              const chs = channels.filter((c) => c.categoryId === cat.id);
              return (
                <div key={cat.id} className="mb-3">
                  <div className="group flex items-center gap-1 px-2 py-1">
                    {renamingCategoryId === cat.id ? (
                      <input
                        autoFocus
                        defaultValue={cat.name}
                        onBlur={(e) =>
                          commitCategoryName(cat.id, e.currentTarget.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            commitCategoryName(
                              cat.id,
                              (e.target as HTMLInputElement).value
                            );
                          if (e.key === "Escape") setRenamingCategoryId(null);
                        }}
                        className="w-full rounded bg-zinc-800 px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-100 focus:outline-none"
                      />
                    ) : (
                      <button
                        onDoubleClick={() => setRenamingCategoryId(cat.id)}
                        title="Double-click to rename"
                        className="flex-1 truncate text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-300"
                      >
                        {cat.name}
                      </button>
                    )}
                    <button
                      onClick={() => addChannel(cat.id)}
                      title="Add channel"
                      aria-label={`Add channel to ${cat.name}`}
                      className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 md:opacity-0 md:group-hover:opacity-100"
                    >
                      +
                    </button>
                    <button
                      onClick={() => deleteCategory(cat.id)}
                      title="Delete category"
                      aria-label={`Delete ${cat.name}`}
                      className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-red-400 md:opacity-0 md:group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>

                  <ul>
                    {chs.length === 0 && (
                      <li className="px-3 py-1 text-[11px] text-zinc-700">
                        empty
                      </li>
                    )}
                    {chs.map((ch) => {
                      const isActive = ch.id === activeChannelId;
                      const isUnread = unread.has(ch.id);
                      const isStreamingChan = streaming.has(ch.id);
                      return (
                        <li
                          key={ch.id}
                          className="group/ch px-1"
                          onContextMenu={(e) => {
                            e.preventDefault();
                            deleteChannel(ch.id);
                          }}
                        >
                          {renamingChannelId === ch.id ? (
                            <input
                              autoFocus
                              defaultValue={ch.name}
                              onBlur={(e) =>
                                commitChannelName(ch.id, e.currentTarget.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  commitChannelName(
                                    ch.id,
                                    (e.target as HTMLInputElement).value
                                  );
                                if (e.key === "Escape")
                                  setRenamingChannelId(null);
                              }}
                              className="w-full rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-100 focus:outline-none"
                            />
                          ) : (
                            <div
                              className={[
                                "flex cursor-pointer items-center gap-1 rounded px-2 py-1",
                                isActive
                                  ? "bg-zinc-800 text-zinc-100"
                                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
                              ].join(" ")}
                              onClick={() => setActiveChannelId(ch.id)}
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                setRenamingChannelId(ch.id);
                              }}
                              title="Double-click to rename · right-click to delete"
                            >
                              <span className="text-zinc-600">#</span>
                              <span
                                className={[
                                  "flex-1 truncate text-sm",
                                  isUnread && !isActive
                                    ? "font-bold text-zinc-100"
                                    : "",
                                ].join(" ")}
                              >
                                {ch.name}
                              </span>
                              {isStreamingChan && (
                                <span
                                  className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-yellow-400"
                                  title="Streaming"
                                />
                              )}
                              {isUnread && !isActive && !isStreamingChan && (
                                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingChannelId(ch.id);
                                }}
                                title="Rename"
                                className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 group-hover/ch:md:flex"
                              >
                                ✎
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteChannel(ch.id);
                                }}
                                title="Delete"
                                className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-red-400 group-hover/ch:md:flex"
                              >
                                ×
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="shrink-0 border-t border-zinc-900 px-3 py-2 text-[10px] text-zinc-600">
            {channels.length} channel{channels.length === 1 ? "" : "s"} ·{" "}
            {categories.length}{" "}
            {categories.length === 1 ? "category" : "categories"}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Chat header */}
        <header className="flex shrink-0 items-center gap-2 border-b border-zinc-900 bg-black/80 px-4 py-3 backdrop-blur">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="flex h-8 w-8 items-center justify-center rounded text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 md:hidden"
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
          <span className="text-zinc-600">#</span>
          <span className="truncate font-semibold">
            {activeChannel?.name ?? "no channel"}
          </span>
          {isActiveStreaming && (
            <span className="ml-2 shrink-0 text-xs text-yellow-400">
              Boss is typing…
            </span>
          )}
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="chat-scroll flex-1 overflow-y-auto px-4 py-4"
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {!activeChannel && (
              <div className="mt-24 text-center text-zinc-500">
                No channel selected. Create one in the sidebar.
              </div>
            )}

            {activeChannel && activeMessages.length === 0 && (
              <div className="mt-24 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-500 text-3xl shadow-[0_0_40px_rgba(234,179,8,0.3)]">
                  🍌
                </div>
                <p className="text-zinc-400">
                  <span className="text-zinc-200">#{activeChannel.name}</span>{" "}
                  — fresh channel.
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  What's on your mind, Bruno?
                </p>
              </div>
            )}

            {activeMessages.map((m, i) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={i}
                  className={`flex ${
                    isUser ? "justify-end" : "justify-start"
                  }`}
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
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (
              !activeChannelId ||
              !input.trim() ||
              streaming.has(activeChannelId)
            )
              return;
            const text = input;
            setInput("");
            sendMessage(activeChannelId, text);
          }}
          className="safe-bottom shrink-0 border-t border-zinc-900 bg-black/80 px-4 py-3 backdrop-blur"
        >
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  if (
                    activeChannelId &&
                    input.trim() &&
                    !streaming.has(activeChannelId)
                  ) {
                    const text = input;
                    setInput("");
                    sendMessage(activeChannelId, text);
                  }
                }
              }}
              rows={1}
              placeholder={
                activeChannel
                  ? `Message #${activeChannel.name}…`
                  : "Create a channel to start"
              }
              className="max-h-40 min-h-[42px] flex-1 resize-none rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none disabled:opacity-40"
              disabled={!activeChannelId}
              autoFocus
            />
            <button
              type="submit"
              disabled={
                !activeChannelId ||
                !input.trim() ||
                streaming.has(activeChannelId)
              }
              className="flex h-[42px] shrink-0 items-center justify-center rounded-2xl bg-yellow-500 px-4 text-sm font-semibold text-black transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send"
            >
              {streaming.has(activeChannelId) ? "…" : "Send"}
            </button>
          </div>
          <p className="mx-auto mt-2 max-w-2xl text-center text-[10px] text-zinc-600">
            Enter to send · Shift+Enter for newline · double-click channel to
            rename · right-click to delete
          </p>
        </form>
      </main>
    </div>
  );
}
