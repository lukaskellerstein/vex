import { useCallback, useEffect, useRef, useState } from "react";
import { AGENT_MANAGER_URL, NATS_WS_URL } from "../../shared/messages";

interface Subscription {
  subject: string;
  callback: (data: object) => void;
}

export interface NatsClient {
  connected: boolean;
  fallbackMode: boolean;
  publish: (subject: string, data: object) => void;
  subscribe: (subject: string, callback: (data: object) => void) => string;
  unsubscribe: (subId: string) => void;
  pollForResult: (requestId: string, timeoutMs: number) => Promise<unknown>;
}

/**
 * Lightweight NATS WebSocket client hook.
 *
 * Uses raw WebSocket with JSON-framed messages. Designed to be swapped
 * to nats.ws later without changing the consumer API.
 *
 * Reconnects with exponential backoff: 1s, 2s, 4s, 8s ... max 30s.
 */
export function useNatsClient(): NatsClient {
  const [connected, setConnected] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const subsRef = useRef<Map<string, Subscription>>(new Map());
  const subCounterRef = useRef(0);
  const reconnectDelayRef = useRef(1000);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    clearReconnectTimer();

    try {
      const ws = new WebSocket(NATS_WS_URL);

      ws.onopen = () => {
        // Send NATS CONNECT command
        ws.send(JSON.stringify({ op: "CONNECT", verbose: false }));
        setConnected(true);
        setFallbackMode(false);
        reconnectDelayRef.current = 1000;

        // Re-subscribe existing subscriptions
        for (const [id, sub] of subsRef.current) {
          ws.send(JSON.stringify({ op: "SUB", subject: sub.subject, sid: id }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            op?: string;
            subject?: string;
            sid?: string;
            data?: object;
          };
          if (msg.op === "MSG" && msg.sid) {
            const sub = subsRef.current.get(msg.sid);
            if (sub && msg.data) {
              sub.callback(msg.data);
            }
          }
        } catch {
          // Non-JSON message or parse error — ignore
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setFallbackMode(true);
        wsRef.current = null;
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror, triggering reconnect
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      scheduleReconnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearReconnectTimer]);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    const delay = reconnectDelayRef.current;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectDelayRef.current = Math.min(delay * 2, 30000);
      connect();
    }, delay);
  }, [connect]);

  // Auto-connect on mount, disconnect on unmount
  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearReconnectTimer();
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on intentional close
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [connect, clearReconnectTimer]);

  const publish = useCallback((subject: string, data: object) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ op: "PUB", subject, data }));
  }, []);

  const subscribe = useCallback(
    (subject: string, callback: (data: object) => void): string => {
      const subId = String(++subCounterRef.current);
      subsRef.current.set(subId, { subject, callback });

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op: "SUB", subject, sid: subId }));
      }

      return subId;
    },
    [],
  );

  const unsubscribe = useCallback((subId: string) => {
    subsRef.current.delete(subId);

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ op: "UNSUB", sid: subId }));
    }
  }, []);

  const pollForResult = useCallback(
    (requestId: string, timeoutMs: number): Promise<unknown> => {
      const url = AGENT_MANAGER_URL + "/api/tasks/" + requestId;
      const pollInterval = 2000;

      return new Promise((resolve, reject) => {
        const deadline = Date.now() + timeoutMs;

        const tick = async () => {
          if (Date.now() > deadline) {
            reject(new Error("pollForResult timed out after " + timeoutMs + "ms"));
            return;
          }
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = (await res.json()) as { status?: string };
            if (data.status === "completed") {
              resolve(data);
              return;
            }
            if (data.status === "failed") {
              reject(new Error("Task failed"));
              return;
            }
          } catch {
            // Network error — keep polling until deadline
          }
          setTimeout(tick, pollInterval);
        };

        tick();
      });
    },
    [],
  );

  return { connected, fallbackMode, publish, subscribe, unsubscribe, pollForResult };
}
