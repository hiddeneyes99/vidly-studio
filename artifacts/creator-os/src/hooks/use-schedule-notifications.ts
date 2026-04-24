import { useEffect, useRef, useState, useCallback } from "react";
import type { Schedule } from "./use-creator-data";
import {
  STAGED_REMINDER_MINUTES,
  stagedReminderLabel,
} from "@/lib/schedule-utils";

type Permission = "default" | "granted" | "denied" | "unsupported";

type FireCallbacks = {
  onMarkSimpleNotified: (id: string) => void;
  onMarkStageFired: (id: string, stage: number) => void;
};

export function useScheduleNotifications(
  schedule: Schedule[],
  callbacks: FireCallbacks,
  videoLookup: (videoId: string) => { title?: string } | undefined,
) {
  const [permission, setPermission] = useState<Permission>("default");
  const timers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as Permission);
  }, []);

  const request = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return "unsupported" as const;
    }
    const result = await Notification.requestPermission();
    setPermission(result as Permission);
    return result;
  }, []);

  useEffect(() => {
    if (permission !== "granted") return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    type Event = {
      key: string;
      itemId: string;
      stage: number | null; // null = simple reminder
      fireAt: number;
    };

    const events: Event[] = [];
    for (const item of schedule) {
      const baseTime = new Date(item.date).getTime();
      if (item.stagedReminders) {
        for (const stage of STAGED_REMINDER_MINUTES) {
          if (item.firedStages?.includes(stage)) continue;
          events.push({
            key: `${item.id}::${stage}`,
            itemId: item.id,
            stage,
            fireAt: baseTime - stage * 60_000,
          });
        }
      } else if (!item.notifiedAt) {
        const lead = (item.reminderMinutes ?? 0) * 60_000;
        events.push({
          key: `${item.id}::simple`,
          itemId: item.id,
          stage: null,
          fireAt: baseTime - lead,
        });
      }
    }

    // Cleanup timers no longer needed
    const validKeys = new Set(events.map((e) => e.key));
    for (const [key, handle] of timers.current.entries()) {
      if (!validKeys.has(key)) {
        window.clearTimeout(handle);
        timers.current.delete(key);
      }
    }

    for (const ev of events) {
      if (timers.current.has(ev.key)) continue;
      const delay = ev.fireAt - Date.now();
      const item = schedule.find((s) => s.id === ev.itemId);
      if (!item) continue;
      if (delay <= 0) {
        // Fire if recent (within 6 hours)
        if (delay > -6 * 60 * 60 * 1000) fire(ev, item);
        continue;
      }
      if (delay > 2 ** 31 - 1) continue;
      const handle = window.setTimeout(() => {
        fire(ev, item);
        timers.current.delete(ev.key);
      }, delay);
      timers.current.set(ev.key, handle);
    }

    function fire(ev: Event, item: Schedule) {
      try {
        const v = videoLookup(item.videoId);
        const platforms = (item.platforms ?? ["youtube"]).join(", ");
        const when = new Date(item.date).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        let title: string;
        let body: string;
        if (ev.stage != null) {
          title = `📋 ${stagedReminderLabel(ev.stage)}`;
          body = `${v?.title ?? "Scheduled video"} → ${platforms} @ ${when}`;
        } else {
          const lead = item.reminderMinutes ?? 0;
          title = lead
            ? `⏰ Upload in ${lead} min — ${platforms}`
            : `🚀 Upload now on ${platforms}`;
          body = `${v?.title ?? "Scheduled video"} • ${when}${
            item.notes ? ` — ${item.notes}` : ""
          }`;
        }
        new Notification(title, {
          body,
          tag: ev.key,
          icon: "/favicon.ico",
        });
      } catch (err) {
        console.warn("[notifications] failed", err);
      }
      if (ev.stage != null) callbacks.onMarkStageFired(item.id, ev.stage);
      else callbacks.onMarkSimpleNotified(item.id);
    }
  }, [schedule, permission, callbacks, videoLookup]);

  useEffect(() => {
    return () => {
      for (const handle of timers.current.values()) {
        window.clearTimeout(handle);
      }
      timers.current.clear();
    };
  }, []);

  return { permission, request };
}
