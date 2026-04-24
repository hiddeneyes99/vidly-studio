import type { Schedule, Video } from "@/hooks/use-creator-data";

// ===== ICS export =====
function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function toIcsDate(d: Date) {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}
function escIcs(s: string) {
  return (s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildICS(schedule: Schedule[], videos: Video[]): string {
  const now = toIcsDate(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vidly Studio//Schedule//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const item of schedule) {
    const v = videos.find((x) => x.id === item.videoId);
    const start = new Date(item.date);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const platforms = (item.platforms ?? ["youtube"]).join(", ");
    const summary = `${v?.title ?? "Scheduled video"} • ${platforms}`;
    const desc = [
      `Platforms: ${platforms}`,
      v?.type ? `Type: ${v.type}` : "",
      item.notes ? `Notes: ${item.notes}` : "",
    ]
      .filter(Boolean)
      .join("\\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id}@creator-os`,
      `DTSTAMP:${now}`,
      `DTSTART:${toIcsDate(start)}`,
      `DTEND:${toIcsDate(end)}`,
      `SUMMARY:${escIcs(summary)}`,
      `DESCRIPTION:${escIcs(desc)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadICS(filename: string, ics: string) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===== Posting streak =====
function startOfWeek(d: Date) {
  // Monday-start week
  const r = new Date(d);
  const day = r.getDay();
  const diff = (day + 6) % 7;
  r.setDate(r.getDate() - diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function computeWeeklyStreak(
  videos: Video[],
  schedule: Schedule[],
): number {
  const dates: Date[] = [];
  for (const v of videos) if (v.publishDate) dates.push(new Date(v.publishDate));
  for (const s of schedule) if (s.date) dates.push(new Date(s.date));
  if (dates.length === 0) return 0;

  const weeksWithPost = new Set<number>();
  for (const d of dates) {
    if (d.getTime() > Date.now()) continue; // count only past
    weeksWithPost.add(startOfWeek(d).getTime());
  }

  let streak = 0;
  let cursor = startOfWeek(new Date());
  // current week (inclusive) — counts even if no post yet (grace) — actually no, only count if has post
  while (weeksWithPost.has(cursor.getTime())) {
    streak++;
    cursor = new Date(cursor.getTime() - 7 * 24 * 60 * 60 * 1000);
    cursor = startOfWeek(cursor);
  }
  return streak;
}

// ===== Staged reminders helper =====
export const STAGED_REMINDER_MINUTES = [1440, 60, 0]; // 1 day, 1 hour, on time

export function stagedReminderLabel(minutes: number): string {
  if (minutes >= 1440) return "1 day before — thumbnail / draft ready?";
  if (minutes >= 60) return "1 hour before — title, description, tags ready?";
  return "Publish time — go live!";
}
