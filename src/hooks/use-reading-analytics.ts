"use client";
import { useEffect, useRef } from "react";
/** Visible, focused reading only; stop after two minutes without input. One heartbeat per 30s. */
export function useReadingAnalytics(bookId: string, page: number, ready: boolean) {
    const currentPage = useRef(page);
    const inputAt = useRef(0);
    useEffect(() => { currentPage.current = page; inputAt.current = Date.now(); }, [page]);
    useEffect(() => {
        if (!ready)
            return;
        let sessionId: string | undefined, sequence = 0, inFlight = false, disposed = false, paused = false;
        const post = (body: unknown) => fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
        const pause = () => {
            if (sessionId && !paused)
                void post({ kind: "pause", sessionId }).catch(() => { });
            paused = true;
        };
        const pulse = async () => {
            if (disposed || inFlight)
                return;
            if (document.visibilityState !== "visible" || !document.hasFocus() || Date.now() - inputAt.current > 120000) {
                pause();
                return;
            }
            inFlight = true;
            try {
                const response = await post({ kind: "reading", bookId, page: currentPage.current, sessionId, sequence: ++sequence });
                if (response.ok) {
                    const data = await response.json();
                    if (!data.stale) {
                        sessionId = data.sessionId;
                        sequence = Math.max(sequence, data.sequence ?? 0);
                        paused = false;
                    }
                    else {
                        paused = true;
                    }
                }
                if (disposed)
                    pause();
            }
            catch { /* Telemetry must never prevent reading. */ }
            finally {
                inFlight = false;
            }
        };
        const input = () => { inputAt.current = Date.now(); };
        const visibility = () => { if (document.visibilityState === "hidden")
            pause();
        else {
            inputAt.current = Date.now();
            void pulse();
        } };
        const events = ["pointerdown", "keydown", "scroll", "wheel", "touchstart"] as const;
        events.forEach(name => window.addEventListener(name, input, { passive: true, capture: true }));
        document.addEventListener("visibilitychange", visibility);
        window.addEventListener("blur", pause);
        void pulse();
        const timer = setInterval(() => void pulse(), 30000);
        return () => { disposed = true; clearInterval(timer); pause(); events.forEach(name => window.removeEventListener(name, input, true)); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("blur", pause); };
    }, [bookId, ready]);
}
