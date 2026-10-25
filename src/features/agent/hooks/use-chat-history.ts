"use client";
import { useEffect, useState } from "react";
import type { SuggestionCard } from "../schemas";
import type { ChatLine } from "../components/chat-panel";
import { api } from "./use-api";

type History = { conversationId: string | null; messages: { role: "user" | "assistant"; content: string; suggestions: SuggestionCard[] | null }[] };

export type ChatHistoryState =
  | { status: "loading" }
  | { status: "ready"; conversationId?: string; lines: ChatLine[] };

/** Loads the latest /agent conversation once; on failure the chat simply starts empty. */
export function useChatHistory(): ChatHistoryState {
  const [state, setState] = useState<ChatHistoryState>({ status: "loading" });
  useEffect(() => {
    let live = true;
    api<History>("/api/agent/chat").then(
      (h) => live && setState({
        status: "ready",
        conversationId: h.conversationId ?? undefined,
        lines: h.messages.map((m) => ({ role: m.role, content: m.content, ...(m.suggestions ? { suggestions: m.suggestions } : {}) })),
      }),
      () => live && setState({ status: "ready", lines: [] }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}
