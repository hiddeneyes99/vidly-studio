import { useCallback, useMemo, useState } from "react";
import {
  useCreatorData,
  type Schedule,
  type SchedulePlatform,
} from "@/hooks/use-creator-data";
import { useScheduleNotifications } from "@/hooks/use-schedule-notifications";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Trash2,
  Bell,
  BellOff,
  BellRing,
  Sparkles,
  Loader2,
  Youtube,
  Instagram,
  Twitter,
  Users,
  RefreshCw,
  Star,
  CalendarDays,
  Download,
  Flame,
  ListChecks,
  Link2,
  ChevronRight,
} from "lucide-react";
import { format, isSameDay, isAfter } from "date-fns";
import {
  useGenerateBestUploadTimes,
  useSuggestCrossPostDelays,
} from "@/lib/ai-hooks";
import type { BestTimeSlot, CrossPostDelaySuggestion } from "@/lib/gemini";
import {
  buildICS,
  computeWeeklyStreak,
  downloadICS,
} from "@/lib/schedule-utils";

const PLATFORM_META: Record<
  SchedulePlatform,
  { label: string; icon: typeof Youtube; className: string; dot: string }
> = {
  youtube: {
    label: "YouTube",
    icon: Youtube,
    className: "bg-red-500/15 text-red-400 border-red-500/30",
    dot: "bg-red-500",
  },
  instagram: {
    label: "Instagram",
    icon: Instagram,
    className: "bg-pink-500/15 text-pink-400 border-pink-500/30",
    dot: "bg-pink-500",
  },
  twitter: {
    label: "X / Twitter",
    icon: Twitter,
    className: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    dot: "bg-sky-500",
  },
  community: {
    label: "Community",
    icon: Users,
    className: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    dot: "bg-violet-500",
  },
};

const REMINDER_OPTIONS = [
  { value: 0, label: "At publish time" },
  { value: 5, label: "5 min before" },
  { value: 15, label: "15 min before" },
  { value: 30, label: "30 min before" },
  { value: 60, label: "1 hour before" },
  { value: 180, label: "3 hours before" },
  { value: 1440, label: "1 day before" },
];

const DELAY_CHIPS = [
  { value: 0, label: "Same time" },
  { value: 30, label: "+30 min" },
  { value: 60, label: "+1 hr" },
  { value: 120, label: "+2 hr" },
  { value: 240, label: "+4 hr" },
  { value: 1440, label: "+1 day" },
];

const DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function nextDateForDay(dayName: string, time: string): Date {
  const target = DAY_INDEX[dayName] ?? 0;
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  const now = new Date();
  const result = new Date(now);
  const diff = (target - now.getDay() + 7) % 7;
  result.setDate(now.getDate() + (diff === 0 ? 7 : diff));
  result.setHours(h || 0, m || 0, 0, 0);
  return result;
}

type CrossPostState = {
  enabled: boolean;
  delayMinutes: number;
};

const CROSS_PLATFORMS: SchedulePlatform[] = [
  "instagram",
  "twitter",
  "community",
];

export default function SchedulePage() {
  const { videos, schedule, setSchedule, channel } = useCreatorData();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date(),
  );
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);

  // Add-form state
  const [formVideoId, setFormVideoId] = useState("");
  const [formTime, setFormTime] = useState("18:00");
  const [formPrimary, setFormPrimary] = useState<SchedulePlatform>("youtube");
  const [formReminder, setFormReminder] = useState(30);
  const [formStaged, setFormStaged] = useState(false);
  const [formNotes, setFormNotes] = useState("");
  const [crossPosts, setCrossPosts] = useState<
    Record<SchedulePlatform, CrossPostState>
  >({
    youtube: { enabled: false, delayMinutes: 0 },
    instagram: { enabled: false, delayMinutes: 60 },
    twitter: { enabled: false, delayMinutes: 0 },
    community: { enabled: false, delayMinutes: 0 },
  });

  const [aiSlots, setAiSlots] = useState<BestTimeSlot[]>([]);
  const [aiSummary, setAiSummary] = useState("");
  const bestTimes = useGenerateBestUploadTimes();
  const crossPostAI = useSuggestCrossPostDelays();

  const markSimpleNotified = useCallback(
    (id: string) =>
      setSchedule(
        schedule.map((s) =>
          s.id === id ? { ...s, notifiedAt: new Date().toISOString() } : s,
        ),
      ),
    [schedule, setSchedule],
  );

  const markStageFired = useCallback(
    (id: string, stage: number) =>
      setSchedule(
        schedule.map((s) => {
          if (s.id !== id) return s;
          const fired = new Set(s.firedStages ?? []);
          fired.add(stage);
          return { ...s, firedStages: Array.from(fired) };
        }),
      ),
    [schedule, setSchedule],
  );

  const callbacks = useMemo(
    () => ({
      onMarkSimpleNotified: markSimpleNotified,
      onMarkStageFired: markStageFired,
    }),
    [markSimpleNotified, markStageFired],
  );

  const videoLookup = useCallback(
    (id: string) => videos.find((v) => v.id === id),
    [videos],
  );

  const { permission, request } = useScheduleNotifications(
    schedule,
    callbacks,
    videoLookup,
  );

  const upcomingCount = useMemo(
    () => schedule.filter((s) => isAfter(new Date(s.date), new Date())).length,
    [schedule],
  );
  const todayCount = useMemo(
    () => schedule.filter((s) => isSameDay(new Date(s.date), new Date())).length,
    [schedule],
  );
  const streak = useMemo(
    () => computeWeeklyStreak(videos, schedule),
    [videos, schedule],
  );

  const openAdd = () => {
    setFormVideoId("");
    setFormTime("18:00");
    setFormPrimary("youtube");
    setFormReminder(30);
    setFormStaged(false);
    setFormNotes("");
    setCrossPosts({
      youtube: { enabled: false, delayMinutes: 0 },
      instagram: { enabled: false, delayMinutes: 60 },
      twitter: { enabled: false, delayMinutes: 0 },
      community: { enabled: false, delayMinutes: 0 },
    });
    setIsAddOpen(true);
  };

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedDate || !formVideoId) {
      toast({
        title: "Missing info",
        description: "Pick a date, video and time first.",
        variant: "destructive",
      });
      return;
    }
    const dateStr = selectedDate.toISOString().split("T")[0];
    const baseISO = `${dateStr}T${formTime}:00`;
    const baseTime = new Date(baseISO).getTime();
    const parentId = Math.random().toString(36).substring(7);

    const items: Schedule[] = [
      {
        id: parentId,
        videoId: formVideoId,
        date: baseISO,
        notes: formNotes,
        platforms: [formPrimary],
        reminderMinutes: formReminder,
        stagedReminders: formStaged,
      },
    ];

    let chainCount = 0;
    for (const p of CROSS_PLATFORMS) {
      if (p === formPrimary) continue;
      const c = crossPosts[p];
      if (!c.enabled) continue;
      const childTime = new Date(baseTime + c.delayMinutes * 60_000);
      items.push({
        id: Math.random().toString(36).substring(7),
        videoId: formVideoId,
        date: childTime.toISOString().slice(0, 19),
        notes: formNotes,
        platforms: [p],
        reminderMinutes: formReminder,
        stagedReminders: false,
        parentId,
      });
      chainCount++;
    }

    setSchedule([...schedule, ...items]);
    setIsAddOpen(false);
    toast({
      title: chainCount > 0 ? "Scheduled with cross-posts" : "Scheduled",
      description:
        chainCount > 0
          ? `Primary + ${chainCount} follow-up${chainCount > 1 ? "s" : ""} added.`
          : permission === "granted"
            ? `Reminder set ${formReminder ? `${formReminder} min before` : "for publish time"}.`
            : "Tip: enable reminders for a notification.",
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Remove this from schedule? Linked cross-posts will also be removed.")) return;
    setSchedule(
      schedule.filter((s) => s.id !== id && s.parentId !== id),
    );
    toast({ title: "Removed from schedule" });
  };

  const runAI = async () => {
    try {
      const recentTitles = videos.slice(0, 15).map((v) => v.title).filter(Boolean);
      const out = await bestTimes.mutateAsync({
        data: {
          channelName: channel.name || "My Channel",
          niche: channel.niche || "general",
          description: channel.description,
          recentTitles,
        },
      });
      setAiSlots(out.slots ?? []);
      setAiSummary(out.summary ?? "");
    } catch (err: any) {
      toast({
        title: "AI failed",
        description: err?.message ?? "Try again",
        variant: "destructive",
      });
    }
  };

  const openAIPanel = async () => {
    setIsAIOpen(true);
    if (aiSlots.length === 0) await runAI();
  };

  const applyAISlot = (slot: BestTimeSlot) => {
    const target = nextDateForDay(slot.day, slot.time);
    setSelectedDate(target);
    setFormTime(slot.time);
    setIsAIOpen(false);
    setIsAddOpen(true);
    toast({
      title: `Picked ${slot.day} ${slot.time}`,
      description: "Now choose the video and confirm.",
    });
  };

  const runCrossPostAI = async () => {
    const v = videos.find((x) => x.id === formVideoId);
    if (!v) {
      toast({
        title: "Pick a video first",
        description: "AI needs a video title to suggest delays.",
        variant: "destructive",
      });
      return;
    }
    try {
      const out = await crossPostAI.mutateAsync({
        data: {
          videoTitle: v.title,
          videoType: v.type,
          primaryPlatform: formPrimary,
          primaryTime: formTime,
          niche: channel.niche || "general",
        },
      });
      const next = { ...crossPosts };
      out.suggestions.forEach((s: CrossPostDelaySuggestion) => {
        const p = s.platform as SchedulePlatform;
        if (p === formPrimary) return;
        if (!next[p]) return;
        next[p] = { enabled: true, delayMinutes: Math.round(s.delayMinutes) };
      });
      setCrossPosts(next);
      toast({
        title: "AI delays applied",
        description: out.summary || "Cross-post chain ready.",
      });
    } catch (err: any) {
      toast({
        title: "AI failed",
        description: err?.message ?? "Try again",
        variant: "destructive",
      });
    }
  };

  const handleExportICS = () => {
    if (schedule.length === 0) {
      toast({
        title: "Nothing to export",
        description: "Schedule something first.",
      });
      return;
    }
    const ics = buildICS(schedule, videos);
    downloadICS(`creator-os-schedule-${format(new Date(), "yyyy-MM-dd")}.ics`, ics);
    toast({
      title: "Calendar downloaded",
      description: "Open the .ics file to import into Google/Apple Calendar.",
    });
  };

  const allSelectedDayItems = schedule
    .filter((s) => selectedDate && isSameDay(new Date(s.date), selectedDate))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Group children under their parent visually (parent first, then its children below regardless of date order)
  const parents = allSelectedDayItems.filter((s) => !s.parentId);
  const orphanChildren = allSelectedDayItems.filter(
    (s) => s.parentId && !parents.some((p) => p.id === s.parentId),
  );

  const selectedDateVideos = videos.filter(
    (v) =>
      selectedDate &&
      isSameDay(new Date(v.publishDate), selectedDate) &&
      !schedule.find((s) => s.videoId === v.id),
  );

  const allChildrenForDay = (parentId: string) =>
    schedule
      .filter((s) => s.parentId === parentId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="space-y-6">
      {/* ===== Hero — sky → indigo ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-sky-500/15 via-indigo-600/10 to-transparent p-4 sm:p-6">
        <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-sky-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-indigo-600/20 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-sky-500/30 shrink-0">
              <CalendarDays className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Schedule
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Plan uploads, cross-post chains, and let AI pick the best slots.
              </p>
              <div className="hidden sm:flex flex-wrap items-center gap-1.5 mt-3 text-xs">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300">
                  <CalendarIcon className="h-3 w-3" /> {todayCount} today
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300">
                  <Clock className="h-3 w-3" /> {upcomingCount} upcoming
                </span>
                {streak > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/15 text-orange-300">
                    <Flame className="h-3 w-3" /> {streak}-week streak
                  </span>
                )}
                <NotifBadge permission={permission} onRequest={request} />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 w-full sm:w-auto h-9"
              onClick={handleExportICS}
              title="Export to Google/Apple Calendar"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="sm:hidden md:inline">Export .ics</span>
              <span className="hidden sm:inline md:hidden">Export</span>
            </Button>
            <Button
              variant="outline"
              className="gap-2 w-full sm:w-auto border-indigo-500/40 hover:border-indigo-500/60 hover:bg-indigo-500/10"
              onClick={openAIPanel}
            >
              <Sparkles className="h-4 w-4 text-indigo-400" />
              AI Best Times
            </Button>
            <Button
              className="gap-2 w-full sm:w-auto bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-500/90 hover:to-indigo-600/90 text-white border-0 shadow-md shadow-sky-500/30"
              onClick={openAdd}
              disabled={!selectedDate}
            >
              <Plus className="h-4 w-4" /> Schedule Video
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile-only summary chips */}
      <div className="flex flex-wrap gap-1.5 sm:hidden">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-500/15 text-sky-300 text-xs">
          <CalendarIcon className="h-3 w-3" /> {todayCount} today
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-500/15 text-indigo-300 text-xs">
          <Clock className="h-3 w-3" /> {upcomingCount} upcoming
        </span>
        {streak > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-orange-500/15 text-orange-300 text-xs">
            <Flame className="h-3 w-3" /> {streak}w streak
          </span>
        )}
        <NotifBadge permission={permission} onRequest={request} large />
      </div>

      <div className="grid gap-6 md:grid-cols-12 lg:grid-cols-3">
        {/* Calendar */}
        <Card className="md:col-span-5 lg:col-span-1 border-border overflow-hidden bg-gradient-to-br from-sky-500/[0.04] via-transparent to-indigo-500/[0.04]">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="h-7 w-7 rounded-md bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-sky-500/30 flex items-center justify-center">
                  <CalendarIcon className="h-3.5 w-3.5 text-sky-400" />
                </div>
                Calendar
              </CardTitle>
              {selectedDate && !isSameDay(selectedDate, new Date()) && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(new Date())}
                  className="text-[11px] px-2 py-1 rounded-md border border-border/60 text-muted-foreground hover:text-sky-300 hover:border-sky-500/40 transition-colors"
                >
                  Today
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 mt-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                Scheduled
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 ring-2 ring-emerald-400/20" />
                Today
              </span>
            </div>
          </CardHeader>
          <CardContent className="flex justify-center p-2 sm:p-3">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="w-full rounded-md border-0 [--cell-size:2.5rem] sm:[--cell-size:2.25rem] md:[--cell-size:2.5rem]"
              classNames={{
                root: "relative w-full",
                months: "relative w-full",
                month: "relative w-full flex flex-col gap-3",
                month_caption:
                  "flex h-10 w-full items-center justify-center px-10 text-sm font-semibold",
                caption_label: "text-sm font-semibold tracking-tight",
                nav: "absolute inset-x-0 top-0 z-10 flex w-full items-center justify-between gap-1 px-1 pointer-events-none [&>button]:pointer-events-auto",
                button_previous:
                  "inline-flex items-center justify-center h-8 w-8 rounded-md border border-border/60 bg-background/40 text-foreground hover:bg-sky-500/15 hover:text-sky-300 hover:border-sky-500/40 transition-colors",
                button_next:
                  "inline-flex items-center justify-center h-8 w-8 rounded-md border border-border/60 bg-background/40 text-foreground hover:bg-sky-500/15 hover:text-sky-300 hover:border-sky-500/40 transition-colors",
                weekdays: "flex w-full",
                weekday:
                  "text-muted-foreground/70 flex-1 select-none text-[0.7rem] font-medium uppercase tracking-wider",
                week: "mt-1 flex w-full",
                day: "group/day relative aspect-square h-full w-full select-none p-0 text-center",
              }}
              modifiers={{
                scheduled: (date) =>
                  schedule.some((s) => isSameDay(new Date(s.date), date)) ||
                  videos.some((v) => isSameDay(new Date(v.publishDate), date)),
              }}
              modifiersClassNames={{
                scheduled:
                  "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-sky-400 after:shadow-[0_0_6px_rgba(56,189,248,0.6)]",
              }}
            />
          </CardContent>
        </Card>

        {/* Day list */}
        <div className="md:col-span-7 lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between pb-4 gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base sm:text-lg leading-tight">
                  {selectedDate
                    ? format(selectedDate, "EEEE, MMM d, yyyy")
                    : "Select a date"}
                </CardTitle>
                <CardDescription className="text-xs">
                  Content scheduled for this day
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {parents.length === 0 &&
              orphanChildren.length === 0 &&
              selectedDateVideos.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-lg">
                  Nothing scheduled. Tap{" "}
                  <span className="text-foreground font-medium">
                    Schedule Video
                  </span>{" "}
                  to add one.
                </div>
              ) : (
                <>
                  {parents.map((item) => {
                    const video = videos.find((v) => v.id === item.videoId);
                    if (!video) return null;
                    const children = allChildrenForDay(item.id);
                    return (
                      <ScheduleRow
                        key={item.id}
                        item={item}
                        videoTitle={video.title}
                        videoType={video.type}
                        onDelete={handleDelete}
                        children={children}
                      />
                    );
                  })}

                  {orphanChildren.map((item) => {
                    const video = videos.find((v) => v.id === item.videoId);
                    if (!video) return null;
                    return (
                      <ScheduleRow
                        key={item.id}
                        item={item}
                        videoTitle={video.title}
                        videoType={video.type}
                        onDelete={handleDelete}
                        isOrphanChild
                      />
                    );
                  })}

                  {selectedDateVideos.map((video) => (
                    <div
                      key={video.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover-elevate"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex flex-col items-center justify-center bg-primary/10 text-primary h-10 w-10 rounded text-xs font-medium border border-primary/20 shrink-0">
                          <Clock className="h-4 w-4 mb-0.5" />
                          Target
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{video.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px] h-4 px-1">
                              {video.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              From Video Tracker
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== Add Dialog ===== */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-sky-400" />
              Schedule for {selectedDate && format(selectedDate, "MMM d, yyyy")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-5">
            <div className="space-y-2">
              <Label>Video</Label>
              <Select value={formVideoId} onValueChange={setFormVideoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a tracked video" />
                </SelectTrigger>
                <SelectContent>
                  {videos.length === 0 && (
                    <SelectItem value="__none" disabled>
                      No videos yet — add one in Video Tracker
                    </SelectItem>
                  )}
                  {videos.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Publish time</Label>
                <Input
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  required
                />
                {channel.bestPostingTimes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {channel.bestPostingTimes.slice(0, 3).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setFormTime(t)}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground hover:border-sky-500/40 hover:text-sky-300"
                      >
                        ⭐ {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Primary platform</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(PLATFORM_META) as SchedulePlatform[]).map((p) => {
                    const meta = PLATFORM_META[p];
                    const Icon = meta.icon;
                    const active = formPrimary === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setFormPrimary(p)}
                        className={`text-xs px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 transition-colors ${
                          active
                            ? meta.className
                            : "bg-muted/40 border-border/60 text-muted-foreground hover:border-sky-500/40"
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Cross-post chain */}
            <div className="space-y-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Link2 className="h-3.5 w-3.5 text-indigo-400" />
                  Cross-post chain
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10"
                  disabled={crossPostAI.isPending}
                  onClick={runCrossPostAI}
                >
                  {crossPostAI.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  AI suggest
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Auto-publish the same video to other platforms with a delay so
                your primary upload gets initial momentum.
              </p>
              <div className="space-y-2">
                {CROSS_PLATFORMS.filter((p) => p !== formPrimary).map((p) => {
                  const meta = PLATFORM_META[p];
                  const Icon = meta.icon;
                  const c = crossPosts[p];
                  return (
                    <div
                      key={p}
                      className="rounded-md border border-border/50 bg-background/40 p-2 sm:p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium">{meta.label}</span>
                        </div>
                        <Switch
                          checked={c.enabled}
                          onCheckedChange={(v) =>
                            setCrossPosts({
                              ...crossPosts,
                              [p]: { ...c, enabled: v },
                            })
                          }
                        />
                      </div>
                      {c.enabled && (
                        <div className="mt-2 space-y-1.5">
                          <div className="flex flex-wrap gap-1">
                            {DELAY_CHIPS.map((chip) => (
                              <button
                                key={chip.value}
                                type="button"
                                onClick={() =>
                                  setCrossPosts({
                                    ...crossPosts,
                                    [p]: { ...c, delayMinutes: chip.value },
                                  })
                                }
                                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                  c.delayMinutes === chip.value
                                    ? "bg-indigo-500/20 border-indigo-400/60 text-indigo-200"
                                    : "border-border/60 text-muted-foreground hover:border-indigo-400/40"
                                }`}
                              >
                                {chip.label}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              max={4320}
                              value={c.delayMinutes}
                              onChange={(e) =>
                                setCrossPosts({
                                  ...crossPosts,
                                  [p]: {
                                    ...c,
                                    delayMinutes: Math.max(
                                      0,
                                      parseInt(e.target.value || "0", 10),
                                    ),
                                  },
                                })
                              }
                              className="h-7 w-20 text-xs"
                            />
                            <span className="text-[11px] text-muted-foreground">
                              min after primary
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reminders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Bell className="h-3 w-3" /> Single reminder
                </Label>
                <Select
                  value={String(formReminder)}
                  onValueChange={(v) => setFormReminder(Number(v))}
                  disabled={formStaged}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REMINDER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <ListChecks className="h-3 w-3" /> Production checklist
                </Label>
                <div className="rounded-md border border-border/60 px-2.5 py-1.5 flex items-center justify-between bg-background/40">
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    3 alerts: 1 day, 1 hr, on-time
                  </span>
                  <Switch checked={formStaged} onCheckedChange={setFormStaged} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="e.g. Pin first comment, post community update"
              />
            </div>

            {permission !== "granted" && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <BellOff className="h-3 w-3" />
                Browser notifications off — enable up top to get reminders.
              </p>
            )}

            <Button
              type="submit"
              className="w-full gap-2 bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-500/90 hover:to-indigo-600/90 text-white border-0"
            >
              <CalendarDays className="h-4 w-4" /> Confirm schedule
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== AI Best Times Dialog ===== */}
      <Dialog open={isAIOpen} onOpenChange={setIsAIOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-400" />
              AI Best Upload Times
              <Badge variant="outline" className="ml-1 text-[10px]">
                For your niche
              </Badge>
            </DialogTitle>
            {aiSummary && (
              <p className="text-xs text-muted-foreground pt-1">{aiSummary}</p>
            )}
          </DialogHeader>

          {bestTimes.isPending && aiSlots.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
              <p className="text-sm">Analyzing your audience patterns…</p>
            </div>
          ) : aiSlots.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Sparkles className="h-10 w-10 text-muted-foreground" />
              <Button onClick={runAI} className="gap-2">
                <Sparkles className="h-4 w-4" /> Get suggestions
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {aiSlots
                .sort((a, b) => b.score - a.score)
                .map((slot, idx) => {
                  const target = nextDateForDay(slot.day, slot.time);
                  return (
                    <div
                      key={`${slot.day}-${slot.time}-${idx}`}
                      className="rounded-lg border border-border/60 hover:bg-muted/30 transition-colors p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="flex flex-col items-center justify-center bg-gradient-to-br from-sky-500/15 to-indigo-600/15 border border-indigo-500/30 text-indigo-300 h-14 w-14 rounded-md shrink-0">
                            <span className="text-[10px] font-medium uppercase">
                              {slot.day.slice(0, 3)}
                            </span>
                            <span className="text-sm font-mono font-bold">
                              {slot.time}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge
                                variant="outline"
                                className="text-[10px] gap-1 bg-amber-500/10 border-amber-500/30 text-amber-300"
                              >
                                <Star className="h-2.5 w-2.5 fill-current" />
                                {slot.score}/10
                              </Badge>
                              <Badge variant="secondary" className="text-[10px]">
                                {slot.videoType}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground">
                                Next: {format(target, "MMM d")}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {slot.reasoning}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => applyAISlot(slot)}
                          className="gap-1 shrink-0 bg-gradient-to-br from-sky-500 to-indigo-600 hover:from-sky-500/90 hover:to-indigo-600/90 text-white border-0"
                        >
                          <Plus className="h-3.5 w-3.5" /> Use
                        </Button>
                      </div>
                    </div>
                  );
                })}
              <div className="flex justify-end pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runAI}
                  disabled={bestTimes.isPending}
                  className="gap-1.5"
                >
                  {bestTimes.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Regenerate
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== Item row =====
function ScheduleRow({
  item,
  videoTitle,
  videoType,
  onDelete,
  children,
  isOrphanChild,
}: {
  item: Schedule;
  videoTitle: string;
  videoType: string;
  onDelete: (id: string) => void;
  children?: Schedule[];
  isOrphanChild?: boolean;
}) {
  const fired = !!item.notifiedAt;
  const due = new Date(item.date).getTime() <= Date.now() && !fired;
  const platforms = item.platforms ?? ["youtube"];
  const stagedDone = (item.firedStages ?? []).length;
  const stagedTotal = 3;

  return (
    <div className="space-y-2">
      <div
        className={`flex items-start justify-between gap-3 p-3 rounded-lg border bg-card hover-elevate ${
          isOrphanChild ? "border-indigo-500/30" : ""
        }`}
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex flex-col items-center justify-center bg-gradient-to-br from-sky-500/15 to-indigo-600/15 text-sky-300 border border-sky-500/30 h-12 w-12 rounded text-[11px] font-mono font-medium shrink-0">
            <Clock className="h-3.5 w-3.5 mb-0.5" />
            {format(new Date(item.date), "HH:mm")}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-sm leading-tight truncate">
              {videoTitle}
            </p>
            <div className="flex flex-wrap items-center gap-1">
              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                {videoType}
              </Badge>
              {platforms.map((p) => {
                const meta = PLATFORM_META[p];
                const Icon = meta.icon;
                return (
                  <Badge
                    key={p}
                    variant="outline"
                    className={`${meta.className} text-[10px] h-4 px-1 gap-0.5`}
                  >
                    <Icon className="h-2.5 w-2.5" />
                    {meta.label}
                  </Badge>
                );
              })}
              {item.stagedReminders ? (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1 gap-0.5 border-emerald-500/30 text-emerald-300 bg-emerald-500/10"
                >
                  <ListChecks className="h-2.5 w-2.5" />
                  Checklist {stagedDone}/{stagedTotal}
                </Badge>
              ) : item.reminderMinutes != null ? (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1 gap-0.5 border-amber-500/30 text-amber-300 bg-amber-500/10"
                >
                  {fired ? (
                    <BellRing className="h-2.5 w-2.5" />
                  ) : (
                    <Bell className="h-2.5 w-2.5" />
                  )}
                  {item.reminderMinutes === 0
                    ? "On time"
                    : `${item.reminderMinutes}m before`}
                </Badge>
              ) : null}
              {due && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1 border-rose-500/30 text-rose-300 bg-rose-500/10"
                >
                  Due now
                </Badge>
              )}
              {isOrphanChild && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1 gap-0.5 border-indigo-500/30 text-indigo-300 bg-indigo-500/10"
                >
                  <Link2 className="h-2.5 w-2.5" />
                  Cross-post
                </Badge>
              )}
            </div>
            {item.notes && (
              <p className="text-xs text-muted-foreground">{item.notes}</p>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => onDelete(item.id)}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {children && children.length > 0 && (
        <div className="ml-3 sm:ml-6 pl-3 border-l-2 border-indigo-500/30 space-y-2">
          {children.map((child) => {
            const meta = PLATFORM_META[(child.platforms ?? ["youtube"])[0]];
            const Icon = meta.icon;
            const baseTime = new Date(item.date).getTime();
            const childTime = new Date(child.date).getTime();
            const diffMin = Math.round((childTime - baseTime) / 60_000);
            return (
              <div
                key={child.id}
                className="flex items-center justify-between gap-2 p-2 rounded-md border border-border/50 bg-card/60"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronRight className="h-3 w-3 text-indigo-400 shrink-0" />
                  <span
                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${meta.dot}`}
                  />
                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium truncate">
                    {meta.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    {format(new Date(child.date), "HH:mm")}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] h-4 px-1 border-indigo-500/30 text-indigo-300 bg-indigo-500/10 shrink-0"
                  >
                    +{diffMin}m
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => onDelete(child.id)}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NotifBadge({
  permission,
  onRequest,
  large,
}: {
  permission: "default" | "granted" | "denied" | "unsupported";
  onRequest: () => Promise<unknown>;
  large?: boolean;
}) {
  const sizeClass = large ? "text-xs" : "text-[11px]";
  if (permission === "granted") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 ${sizeClass}`}
      >
        <BellRing className="h-3 w-3" /> Reminders on
      </span>
    );
  }
  if (permission === "unsupported") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-muted-foreground ${sizeClass}`}
      >
        <BellOff className="h-3 w-3" /> Notifications unsupported
      </span>
    );
  }
  if (permission === "denied") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 ${sizeClass}`}
      >
        <BellOff className="h-3 w-3" /> Reminders blocked
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onRequest()}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition-colors ${sizeClass}`}
    >
      <Bell className="h-3 w-3" /> Enable reminders
    </button>
  );
}
