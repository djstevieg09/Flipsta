"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Message = { id: string; role: "user" | "assistant"; content: string; created_at: string };
type ConversationDetail = {
  id: string;
  displayName: string;
  status: string;
  escalatedTicketId: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function AdminChatDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/chats/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setConversation(d.conversation ?? null);
        setMessages(d.messages ?? []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-textDim text-sm">Loading…</p>;
  if (!conversation) return <p className="text-textDim text-sm">No such conversation.</p>;

  return (
    <div className="space-y-4">
      <div>
        <a href="/admin/chats" className="text-xs text-textDim hover:text-text">← Back to all conversations</a>
        <div className="flex items-center justify-between mt-2">
          <h2 className="font-bold text-lg">{conversation.displayName}</h2>
          <span className="text-xs uppercase font-bold text-textDim">{conversation.status}</span>
        </div>
        {conversation.escalatedTicketId && (
          <p className="text-xs text-gold mt-1">
            Escalated to a ticket —{" "}
            <a href="/admin/tickets" className="underline">
              view in Tickets
            </a>
            .
          </p>
        )}
      </div>
      <div className="card space-y-3 max-w-2xl">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`rounded-2xl px-4 py-2 text-sm max-w-md ${
                m.role === "user" ? "bg-brand text-bg" : "bg-surface2"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {messages.length === 0 && <p className="text-textDim text-sm">No messages.</p>}
      </div>
    </div>
  );
}
