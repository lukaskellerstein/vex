import { useCallback, useEffect, useRef, useState } from "react";
import { connect, JSONCodec, type NatsConnection, type Subscription } from "nats.ws";
import { AGENT_MANAGER_URL, NATS_WS_URL } from "../../shared/messages";

interface SubEntry {
  subject: string;
  callback: (data: object) => void;
  sub: Subscription | null;
}

export interface NatsClient {
  connected: boolean;
  fallbackMode: boolean;
  publish: (subject: string, data: object) => void;
  subscribe: (subject: string, callback: (data: object) => void) => string;
  unsubscribe: (subId: string) => void;
  pollForResult: (requestId: string, timeoutMs: number) => Promise<unknown>;
}

const jc = JSONCodec();

/**
 * NATS WebSocket client hook using the official nats.ws library.
 *
 * Reconnects with exponential backoff: 1s, 2s, 4s, 8s ... max 30s.
 */
export function useNatsClient(enabled: boolean): NatsClient {
  const [connected, setConnected] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);
  const ncRef = useRef<NatsConnection | null>(null);
  const subsRef = useRef<Map<string, SubEntry>>(new Map());
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

  const drainSubscription = useCallback(async (entry: SubEntry) => {
    if (entry.sub) {
      try {
        entry.sub.unsubscribe();
      } catch {
        // already closed
      }
      entry.sub = null;
    }
  }, []);

  const startSubscription = useCallback(
    (nc: NatsConnection, entry: SubEntry) => {
      const sub = nc.subscribe(entry.subject);
      entry.sub = sub;
      (async () => {
        for await (const msg of sub) {
          try {
            const data = jc.decode(msg.data) as object;
            entry.callback(data);
          } catch {
            // decode error — skip
          }
        }
      })();
    },
    [],
  );

  const doConnect = useCallback(async () => {
    if (!mountedRef.current) return;
    clearReconnectTimer();

    try {
      const nc = await connect({ servers: NATS_WS_URL, name: "vex-chrome-ext-v3.0.0" });
      ncRef.current = nc;
      setConnected(true);
      setFallbackMode(false);
      reconnectDelayRef.current = 1000;

      // Re-subscribe existing entries
      for (const entry of subsRef.current.values()) {
        startSubscription(nc, entry);
      }

      // Monitor connection close
      (async () => {
        const err = await nc.closed();
        if (!mountedRef.current) return;
        ncRef.current = null;
        setConnected(false);
        setFallbackMode(true);
        if (err) {
          console.warn("[vex] NATS closed with error:", err.message);
        }
        scheduleReconnect();
      })();
    } catch {
      setFallbackMode(true);
      scheduleReconnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearReconnectTimer, startSubscription]);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    const delay = reconnectDelayRef.current;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectDelayRef.current = Math.min(delay * 2, 30000);
      doConnect();
    }, delay);
  }, [doConnect]);

  // Connect when enabled, disconnect when disabled or on unmount
  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      doConnect();
    }
    return () => {
      mountedRef.current = false;
      clearReconnectTimer();
      const nc = ncRef.current;
      if (nc) {
        nc.drain().catch(() => {});
        ncRef.current = null;
      }
      setConnected(false);
    };
  }, [enabled, doConnect, clearReconnectTimer]);

  const publish = useCallback((subject: string, data: object) => {
    const nc = ncRef.current;
    if (!nc || nc.isClosed()) return;
    nc.publish(subject, jc.encode(data));
  }, []);

  const subscribe = useCallback(
    (subject: string, callback: (data: object) => void): string => {
      const subId = String(++subCounterRef.current);
      const entry: SubEntry = { subject, callback, sub: null };
      subsRef.current.set(subId, entry);

      const nc = ncRef.current;
      if (nc && !nc.isClosed()) {
        startSubscription(nc, entry);
      }

      return subId;
    },
    [startSubscription],
  );

  const unsubscribe = useCallback(
    (subId: string) => {
      const entry = subsRef.current.get(subId);
      if (entry) {
        drainSubscription(entry);
        subsRef.current.delete(subId);
      }
    },
    [drainSubscription],
  );

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
