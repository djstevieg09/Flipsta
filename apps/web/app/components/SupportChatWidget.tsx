"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Message = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "flipsta_chat_conversation_id";

/**
 * 27 Aug 2026, Steven: "need a Ai chat bot that can assist with any quiries
 * people may have. needs to cover all areas before passing to a real
 * agent." Confirmed via a clarifying question: a floating widget on every
 * page (not a dedicated help page), able to use the asker's own real
 * account data when they're signed in, and escalating by opening a real
 * ticket in the existing admin system rather than a separate live-handoff
 * mechanism — see api/chat/route.ts and lib/supportChat.ts.
 *
 * conversationId is kept in localStorage (not just component state) so a
 * page refresh continues the same conversation instead of silently
 * starting a new one and losing the thread — the actual message history
 * itself still lives server-side in chat_messages, this is purely "which
 * conversation am I continuing."
 */
export default function SupportChatWidget({ isAuthed }: { isAuthed: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [escalated, setEscalated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setConversationId(stored);
    } catch {
      // localStorage can throw in some browser contexts (private mode,
      // blocked storage) — the widget just starts a fresh conversation.
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  if (pathname?.startsWith("/admin")) return null;

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.error ?? "Something went wrong — please try again." }]);
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
      if (data.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
        try {
          window.localStorage.setItem(STORAGE_KEY, data.conversationId);
        } catch {
          // Non-fatal — worst case a refresh starts a new conversation.
        }
      }
      if (data.escalated) setEscalated(true);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong sending that — please try again." }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-3 w-80 sm:w-96 h-[28rem] card p-0 flex flex-col shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-bold text-sm">Flipsta support</span>
            <button onClick={() => setOpen(false)} className="text-textDim hover:text-text text-lg leading-none">
              ×
            </button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-xs text-textDim">
                {isAuthed
                  ? "Ask me anything — how the auctions work, an order, your wallet, whatever you need."
                  : "Ask me anything about how Flipsta works. Sign in first if you need help with your own orders or wallet."}
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`rounded-2xl px-3 py-2 text-sm max-w-[85%] ${m.role === "user" ? "bg-brand text-bg" : "bg-surface2"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {sending && <div className="text-xs text-textDim px-1">Typing…</div>}
            {escalated && (
              <p className="text-xs text-gold text-center pt-1">
                This has been passed to a real member of the team — they'll follow up from here.
              </p>
            )}
          </div>
          <div className="flex gap-2 p-3 border-t border-border">
            <input
              className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="Type a message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />
            <button className="btn btn-primary text-sm px-3" disabled={sending || !input.trim()} onClick={send}>
              Send
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn btn-primary rounded-full w-14 h-14 shadow-2xl text-xl"
        aria-label="Support chat"
      >
        {open ? "×" : "💬"}
      </button>
    </div>
  );
}
