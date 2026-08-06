"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

/**
 * "X is typing" over a Supabase broadcast channel — the dashboard half of the protocol the
 * mobile apps implement in app/hooks/useTypingIndicator.ts.
 *
 * The topic string, event name and payload shape are load-bearing: they must stay identical
 * to the mobile hook or the two sides broadcast straight past each other. The timings matter
 * too, and both sides are simultaneously sender and receiver, so REBROADCAST_MS has to stay
 * under REMOTE_TIMEOUT_MS on both. If you change one, change the other.
 *
 * Broadcast is deliberately used rather than a table: a keystroke signal is worthless a
 * second later, so it should never touch the WAL, replication, or the section-signal path
 * that drives the dashboard's data refresh.
 */

/** How long the peer's indicator survives without a refresh. */
const REMOTE_TIMEOUT_MS = 4000;
/** Minimum gap between outgoing "still typing" pings. Must be < REMOTE_TIMEOUT_MS. */
const REBROADCAST_MS = 2000;
/** Idle time after the last keystroke before we announce a stop. */
const IDLE_STOP_MS = 1500;

type TypingIndicatorConfig = {
  /** Broadcast topic; must match on both sides. Falsy disables the hook. */
  topic: string | null | undefined;
  /** This account's id, so its own echo is ignored. */
  userId: string | null | undefined;
  /**
   * Only treat pings from THIS user as the peer.
   *
   * Needed wherever more than two clients can share one topic. On the support desk the topic
   * is keyed by the thread owner, so it is joined by the owner's app AND by every dashboard
   * client with that thread open — a second agent, or simply this agent's own second tab.
   * Omit on a genuinely two-party thread, where anyone who is not you is the peer.
   */
  peerUserId?: string | null;
};

export function useTypingIndicator({
  topic,
  userId,
  peerUserId,
}: TypingIndicatorConfig) {
  const [isPeerTyping, setIsPeerTyping] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const peerUserIdRef = useRef(peerUserId);
  peerUserIdRef.current = peerUserId;

  /**
   * Identifies this tab. The peer filter cannot key on userId alone — one agent with the
   * support desk open in two tabs would otherwise filter out their own peer, and more to
   * the point the two sides here are a customer and an agent whose ids never collide but
   * whose echoes still need suppressing per-connection.
   */
  const clientIdRef = useRef(
    `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
  );

  const remoteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selfTypingRef = useRef(false);
  const lastSentAtRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (remoteTimeoutRef.current) {
      clearTimeout(remoteTimeoutRef.current);
      remoteTimeoutRef.current = null;
    }
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

  const broadcast = useCallback((isTyping: boolean) => {
    // A send on a channel that has not joined silently degrades to one HTTP POST per call.
    // Skip it rather than spend that, or the socket's event budget, on a cosmetic hint.
    const channel = channelRef.current;
    if (!channel || channel.state !== "joined") return;
    lastSentAtRef.current = Date.now();
    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: {
        userId: userIdRef.current,
        clientId: clientIdRef.current,
        isTyping,
      },
    });
  }, []);

  /** Announce a stop immediately — used on send, blur and unmount. */
  const stopTyping = useCallback(() => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
    if (!selfTypingRef.current) return;
    selfTypingRef.current = false;
    broadcast(false);
  }, [broadcast]);

  /** Call on every text change. Throttles internally. */
  const onTextChanged = useCallback(
    (text: string) => {
      if (!text.trim().length) {
        stopTyping();
        return;
      }

      const now = Date.now();
      const shouldPing =
        !selfTypingRef.current || now - lastSentAtRef.current >= REBROADCAST_MS;
      selfTypingRef.current = true;
      if (shouldPing) broadcast(true);

      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = setTimeout(() => {
        idleTimeoutRef.current = null;
        if (selfTypingRef.current) {
          selfTypingRef.current = false;
          broadcast(false);
        }
      }, IDLE_STOP_MS);
    },
    [broadcast, stopTyping],
  );

  useEffect(() => {
    setIsPeerTyping(false);
    selfTypingRef.current = false;
    lastSentAtRef.current = 0;
    clearTimers();

    if (!topic) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(topic)
      .on("broadcast", { event: "typing" }, (message) => {
        const payload = message?.payload as
          | { clientId?: string; isTyping?: boolean; userId?: string }
          | undefined;
        if (!payload) return;
        // Ignore this tab's own echo only — not everything from this account id.
        if (payload.clientId === clientIdRef.current) return;

        // Suppressing our own echo is not enough to know the sender IS the peer. Without a
        // positive check, another dashboard client's keystrokes on the same thread render as
        // "<customer> is typing", naming someone who is not typing at all.
        const expectedPeerUserId = peerUserIdRef.current;
        if (
          expectedPeerUserId &&
          String(payload.userId ?? "") !== String(expectedPeerUserId)
        ) {
          return;
        }

        if (remoteTimeoutRef.current) {
          clearTimeout(remoteTimeoutRef.current);
          remoteTimeoutRef.current = null;
        }

        if (!payload.isTyping) {
          setIsPeerTyping(false);
          return;
        }

        setIsPeerTyping(true);
        // Self-expire: a peer that backgrounds or crashes never sends its stop.
        remoteTimeoutRef.current = setTimeout(() => {
          remoteTimeoutRef.current = null;
          setIsPeerTyping(false);
        }, REMOTE_TIMEOUT_MS);
      })
      .subscribe();

    channelRef.current = channel;

    // Hiding the tab can suspend timers and drop the socket mid-"typing: true", which
    // would pin the peer's indicator until their own timeout expires. Announce the stop.
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopTyping();
        setIsPeerTyping(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearTimers();
      if (selfTypingRef.current) {
        selfTypingRef.current = false;
        // Best-effort; the peer's REMOTE_TIMEOUT_MS covers it if this is dropped.
        broadcast(false);
      }
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [broadcast, clearTimers, stopTyping, topic]);

  return { isPeerTyping, onTextChanged, stopTyping };
}

export default useTypingIndicator;
