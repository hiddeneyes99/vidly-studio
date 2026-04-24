import { useMemo, useState } from "react";
import { useCreatorData, Goal, Video } from "@/hooks/use-creator-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Target,
  Plus,
  Trash2,
  Edit2,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Users,
  Eye,
  Video as VideoIcon,
  RefreshCw,
  CheckCircle2,
  Wand2,
} from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { useGenerateGoalSuggestions } from "@/lib/ai-hooks";
import type { SuggestedGoal } from "@/lib/gemini";

type GoalType = Goal["type"];
type FilterTab = "active" | "completed" | "overdue" | "all";

const TYPE_META: Record<
  GoalType,
  { label: string; icon: typeof Users; unit: string; format: (n: number) => string }
> = {
  subscribers: {
    label: "Subscribers",
    icon: Users,
    unit: "subs",
    format: (n) => n.toLocaleString(),
  },
  views: {
    label: "Views",
    icon: Eye,
    unit: "views",
    format: (n) => n.toLocaleString(),
  },
  videos: {
    label: "Videos Published",
    icon: VideoIcon,
    unit: "videos",
    format: (n) => n.toLocaleString(),
  },
};

function getAutoCurrentValue(
  type: GoalType,
  channel: { subscriberCount: number; totalViews: number },
  videos: Video[],
): number | null {
  if (type === "subscribers") return channel.subscriberCount || 0;
  if (type === "views") return channel.totalViews || 0;
  if (type === "videos")
    return videos.filter((v) => v.status === "Published").length;
  return null;
}

function computePacing(goal: Goal, currentValue: number) {
  const total = Math.max(1, new Date(goal.deadline).getTime() - new Date(goal.createdAt).getTime());
  const elapsed = Math.max(0, Date.now() - new Date(goal.createdAt).getTime());
  const timeProgress = Math.min(1, elapsed / total);
  const valueProgress = Math.min(1, currentValue / Math.max(1, goal.targetValue));
  const expected = Math.round(goal.targetValue * timeProgress);
  const remainingValue = Math.max(0, goal.targetValue - currentValue);
  const remainingDaysRaw = Math.max(
    0,
    (new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  const perDayNeeded = remainingDaysRaw > 0
    ? Math.ceil(remainingValue / remainingDaysRaw)
    : remainingValue;

  const completed = currentValue >= goal.targetValue;
  const overdue = remainingDaysRaw <= 0 && !completed;

  let status: "completed" | "ahead" | "ontrack" | "behind" | "overdue" = "ontrack";
  if (completed) status = "completed";
  else if (overdue) status = "overdue";
  else if (valueProgress >= timeProgress + 0.05) status = "ahead";
  else if (valueProgress < timeProgress - 0.1) status = "behind";

  return {
    expected,
    perDayNeeded,
    remainingValue,
    remainingDays: Math.ceil(remainingDaysRaw),
    timeProgress,
    valueProgress,
    status,
    completed,
    overdue,
  };
}

const STATUS_BADGE: Record<
  ReturnType<typeof computePacing>["status"],
  { label: string; className: string; icon: typeof TrendingUp }
> = {
  ahead: {
    label: "Ahead",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: TrendingUp,
  },
  ontrack: {
    label: "On track",
    className: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    icon: Minus,
  },
  behind: {
    label: "Behind",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: TrendingDown,
  },
  overdue: {
    label: "Overdue",
    className: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    icon: TrendingDown,
  },
  completed: {
    label: "Completed",
    className: "bg-primary/15 text-primary border-primary/30",
    icon: CheckCircle2,
  },
};

const CATEGORY_META: Record<
  SuggestedGoal["category"],
  { label: string; emoji: string; className: string }
> = {
  growth: {
    label: "Growth",
    emoji: "📈",
    className: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  },
  content: {
    label: "Content",
    emoji: "🎬",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  skill: {
    label: "Stretch",
    emoji: "🚀",
    className: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  },
};

export default function Goals() {
  const { goals, setGoals, channel, videos } = useCreatorData();
  const { toast } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCoachOpen, setIsCoachOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [filter, setFilter] = useState<FilterTab>("active");
  const [coachSuggestions, setCoachSuggestions] = useState<SuggestedGoal[]>([]);
  const [acceptedIdx, setAcceptedIdx] = useState<Set<number>>(new Set());

  const suggestGoals = useGenerateGoalSuggestions();

  // Resolve effective current value: when the metric can be auto-pulled from
  // the connected channel, ALWAYS trust the live channel value. This way,
  // switching to a different YouTube channel immediately updates goal progress
  // instead of showing stale numbers from the previous channel.
  const goalsWithLive = useMemo(
    () =>
      goals.map((g) => {
        const auto = getAutoCurrentValue(g.type, channel, videos);
        const effective = auto != null ? auto : g.currentValue;
        return {
          goal: g,
          effective,
          auto: auto != null,
          pacing: computePacing(g, effective),
        };
      }),
    [goals, channel, videos],
  );

  const counts = useMemo(() => {
    let active = 0,
      completed = 0,
      overdue = 0;
    for (const { pacing } of goalsWithLive) {
      if (pacing.completed) completed++;
      else if (pacing.overdue) overdue++;
      else active++;
    }
    return { active, completed, overdue, all: goalsWithLive.length };
  }, [goalsWithLive]);

  const filteredGoals = useMemo(() => {
    return goalsWithLive.filter(({ pacing }) => {
      if (filter === "all") return true;
      if (filter === "completed") return pacing.completed;
      if (filter === "overdue") return pacing.overdue;
      return !pacing.completed && !pacing.overdue;
    });
  }, [goalsWithLive, filter]);

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const type = formData.get("type") as GoalType;
    const auto = getAutoCurrentValue(type, channel, videos);
    const newGoal: Goal = {
      id: Math.random().toString(36).substring(7),
      title: formData.get("title") as string,
      type,
      targetValue: Number(formData.get("targetValue")),
      currentValue: Number(formData.get("currentValue")) || auto || 0,
      deadline: new Date(formData.get("deadline") as string).toISOString(),
      createdAt: new Date().toISOString(),
    };
    setGoals([...goals, newGoal]);
    setIsAddOpen(false);
    toast({ title: "Goal created", description: "Tracking starts now." });
  };

  const handleEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingGoal) return;
    const formData = new FormData(e.currentTarget);
    const updatedGoal: Goal = {
      ...editingGoal,
      title: formData.get("title") as string,
      type: formData.get("type") as GoalType,
      targetValue: Number(formData.get("targetValue")),
      currentValue: Number(formData.get("currentValue")),
      deadline: new Date(formData.get("deadline") as string).toISOString(),
    };
    setGoals(goals.map((g) => (g.id === updatedGoal.id ? updatedGoal : g)));
    setIsEditOpen(false);
    setEditingGoal(null);
    toast({ title: "Goal updated" });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this goal?")) return;
    setGoals(goals.filter((g) => g.id !== id));
    toast({ title: "Goal deleted" });
  };

  const openCoach = async () => {
    setIsCoachOpen(true);
    setAcceptedIdx(new Set());
    if (coachSuggestions.length > 0) return;
    await runCoach();
  };

  const runCoach = async () => {
    try {
      const publishedCount = videos.filter((v) => v.status === "Published").length;
      const out = await suggestGoals.mutateAsync({
        data: {
          channelName: channel.name || "My Channel",
          niche: channel.niche || "general",
          description: channel.description,
          subscriberCount: channel.subscriberCount || 0,
          totalViews: channel.totalViews || 0,
          videosPublished: publishedCount,
          existingGoals: goals.map((g) => ({ title: g.title, type: g.type })),
        },
      });
      setCoachSuggestions(out.goals ?? []);
      setAcceptedIdx(new Set());
    } catch (err: any) {
      toast({
        title: "Coach failed",
        description: err?.message ?? "Try again",
        variant: "destructive",
      });
    }
  };

  const acceptSuggestion = (s: SuggestedGoal, idx: number) => {
    const auto = getAutoCurrentValue(s.type, channel, videos);
    const newGoal: Goal = {
      id: Math.random().toString(36).substring(7),
      title: s.title,
      type: s.type,
      targetValue: s.targetValue,
      currentValue: auto ?? 0,
      deadline: new Date(
        Date.now() + s.daysFromNow * 24 * 60 * 60 * 1000,
      ).toISOString(),
      createdAt: new Date().toISOString(),
    };
    setGoals([...goals, newGoal]);
    setAcceptedIdx((prev) => new Set([...prev, idx]));
    toast({
      title: "Goal added",
      description: s.title,
    });
  };

  const defaultDeadline = useMemo(() => {
    const d = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    return d.toISOString().split("T")[0];
  }, []);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-emerald-500/15 via-amber-500/10 to-transparent p-4 sm:p-6">
        <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-amber-500/20 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-amber-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
              <Target className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Goals
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Set targets, auto-sync from YouTube, and let the coach guide your pace.
              </p>
              <div className="hidden sm:flex flex-wrap items-center gap-2 mt-3 text-xs">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" /> {counts.completed} done
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300">
                  <TrendingUp className="h-3 w-3" /> {counts.active} active
                </span>
                {counts.overdue > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300">
                    <TrendingDown className="h-3 w-3" /> {counts.overdue} overdue
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
            <Button
              variant="outline"
              className="gap-2 w-full sm:w-auto border-amber-500/40 hover:border-amber-500/60 hover:bg-amber-500/10"
              onClick={openCoach}
            >
              <Sparkles className="h-4 w-4 text-amber-400" />
              AI Goal Coach
            </Button>
            <Button
              className="gap-2 w-full sm:w-auto bg-gradient-to-br from-emerald-500 to-amber-500 hover:from-emerald-500/90 hover:to-amber-500/90 text-white border-0 shadow-md shadow-emerald-500/30"
              onClick={() => setIsAddOpen(true)}
            >
              <Plus className="h-4 w-4" /> Set New Goal
            </Button>
          </div>
        </div>
      </div>

      {/* Live stats summary */}
      <Card className="bg-muted/20">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6">
            <StatTile
              icon={Users}
              label="Subscribers"
              value={(channel.subscriberCount || 0).toLocaleString()}
            />
            <StatTile
              icon={Eye}
              label="Total views"
              value={(channel.totalViews || 0).toLocaleString()}
            />
            <StatTile
              icon={VideoIcon}
              label="Published"
              value={videos
                .filter((v) => v.status === "Published")
                .length.toString()}
            />
            <StatTile
              icon={Target}
              label="Active goals"
              value={counts.active.toString()}
            />
          </div>
        </CardContent>
      </Card>

      {/* Filter tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)}>
        <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:inline-flex">
          <TabsTrigger value="active" className="gap-1.5">
            Active
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {counts.active}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1.5">
            Done
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {counts.completed}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="overdue" className="gap-1.5">
            Overdue
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {counts.overdue}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-1.5">
            All
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {counts.all}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Goals grid */}
      <div className="grid gap-4 md:gap-6 sm:grid-cols-2">
        {filteredGoals.map(({ goal, effective, auto, pacing }) => {
          const meta = TYPE_META[goal.type];
          const TypeIcon = meta.icon;
          const percent = Math.min(
            100,
            Math.round((effective / Math.max(1, goal.targetValue)) * 100),
          );
          const badge = STATUS_BADGE[pacing.status];
          const StatusIcon = badge.icon;

          return (
            <Card key={goal.id} className="hover-elevate">
              <CardHeader className="pb-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0 flex-1">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2 leading-tight">
                      <TypeIcon className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">{goal.title}</span>
                    </CardTitle>
                    <CardDescription className="text-xs flex items-center gap-1.5 flex-wrap">
                      <span>
                        Due {format(new Date(goal.deadline), "MMM d, yyyy")}
                      </span>
                      {auto && (
                        <span className="inline-flex items-center gap-1 text-emerald-400/80">
                          <RefreshCw className="h-3 w-3" /> Auto-synced
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() => {
                        setEditingGoal(goal);
                        setIsEditOpen(true);
                      }}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive/60 hover:text-destructive"
                      onClick={() => handleDelete(goal.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <Badge
                  variant="outline"
                  className={`${badge.className} gap-1 w-fit text-[10px]`}
                >
                  <StatusIcon className="h-3 w-3" />
                  {badge.label}
                  {!pacing.completed && !pacing.overdue && (
                    <span className="opacity-70">
                      • {pacing.remainingDays}d left
                    </span>
                  )}
                </Badge>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-bold">{percent}%</span>
                  </div>
                  <div className="relative">
                    <Progress value={percent} className="h-2.5" />
                    {!pacing.completed && pacing.timeProgress > 0.02 && (
                      <div
                        className="absolute top-0 h-2.5 w-0.5 bg-foreground/40"
                        style={{
                          left: `${Math.min(99, pacing.timeProgress * 100)}%`,
                        }}
                        title="Where you should be by now"
                      />
                    )}
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground pt-0.5">
                    <span className="font-mono">
                      {meta.format(effective)}
                    </span>
                    <span className="font-mono">
                      {meta.format(goal.targetValue)}
                    </span>
                  </div>
                </div>

                {!pacing.completed && (
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/60">
                    <PaceTile
                      label="Need / day"
                      value={
                        pacing.remainingDays > 0
                          ? meta.format(pacing.perDayNeeded)
                          : "—"
                      }
                    />
                    <PaceTile
                      label="Expected by now"
                      value={meta.format(pacing.expected)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {filteredGoals.length === 0 && (
          <Card className="sm:col-span-2 bg-muted/20 border-dashed">
            <CardContent className="flex flex-col items-center justify-center p-8 sm:p-12 text-center space-y-3">
              <Target className="h-10 w-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">
                  {filter === "active"
                    ? "No active goals"
                    : filter === "completed"
                    ? "Nothing completed yet"
                    : filter === "overdue"
                    ? "Nothing overdue 🎉"
                    : "No goals yet"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Set one yourself or let the AI Coach suggest some.
                </p>
              </div>
              <div className="flex gap-2 flex-col sm:flex-row w-full sm:w-auto">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={openCoach}
                >
                  <Sparkles className="h-4 w-4" /> Ask AI Coach
                </Button>
                <Button onClick={() => setIsAddOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" /> Set Goal
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ===== Add Goal Dialog ===== */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Set a new goal
            </DialogTitle>
          </DialogHeader>
          <GoalForm
            onSubmit={handleAdd}
            defaultDeadline={defaultDeadline}
            channel={channel}
            videos={videos}
          />
        </DialogContent>
      </Dialog>

      {/* ===== Edit Goal Dialog ===== */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-primary" />
              Update goal
            </DialogTitle>
          </DialogHeader>
          {editingGoal && (
            <GoalForm
              key={editingGoal.id}
              onSubmit={handleEdit}
              defaultDeadline={editingGoal.deadline.split("T")[0]}
              channel={channel}
              videos={videos}
              initial={editingGoal}
              submitLabel="Save changes"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ===== AI Coach Dialog ===== */}
      <Dialog open={isCoachOpen} onOpenChange={setIsCoachOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Goal Coach
              <Badge variant="outline" className="ml-1 text-[10px]">
                Beta
              </Badge>
            </DialogTitle>
            <p className="text-xs text-muted-foreground pt-1">
              SMART goals tailored to your current channel size and niche.
            </p>
          </DialogHeader>

          {suggestGoals.isPending && coachSuggestions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm">Coach is analyzing your channel…</p>
            </div>
          ) : coachSuggestions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Wand2 className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Click below to generate goal suggestions.
              </p>
              <Button onClick={runCoach} className="gap-2">
                <Sparkles className="h-4 w-4" /> Suggest goals
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {coachSuggestions.map((s, idx) => {
                const cat = CATEGORY_META[s.category] ?? CATEGORY_META.growth;
                const meta = TYPE_META[s.type];
                const accepted = acceptedIdx.has(idx);
                return (
                  <div
                    key={`${s.title}-${idx}`}
                    className={`rounded-lg border p-3 transition-colors ${
                      accepted
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/60 hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`${cat.className} text-[10px] gap-1`}
                          >
                            <span>{cat.emoji}</span>
                            {cat.label}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[10px] gap-1"
                          >
                            <meta.icon className="h-3 w-3" />
                            {meta.label}
                          </Badge>
                        </div>
                        <p className="font-semibold text-sm leading-tight">
                          {s.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.reasoning}
                        </p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1">
                          <span>
                            🎯{" "}
                            <span className="font-mono text-foreground">
                              {meta.format(s.targetValue)}
                            </span>
                          </span>
                          <span>
                            🗓️{" "}
                            <span className="font-mono text-foreground">
                              {s.daysFromNow} days
                            </span>
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={accepted ? "secondary" : "default"}
                        disabled={accepted}
                        onClick={() => acceptSuggestion(s, idx)}
                        className="gap-1 shrink-0"
                      >
                        {accepted ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Added
                          </>
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5" /> Add
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-end pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runCoach}
                  disabled={suggestGoals.isPending}
                  className="gap-1.5"
                >
                  {suggestGoals.isPending ? (
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

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="text-lg sm:text-xl font-bold font-mono">{value}</p>
    </div>
  );
}

function PaceTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/30 px-2.5 py-1.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="text-sm font-mono font-semibold">{value}</p>
    </div>
  );
}

function GoalForm({
  onSubmit,
  defaultDeadline,
  channel,
  videos,
  initial,
  submitLabel = "Create goal",
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  defaultDeadline: string;
  channel: { subscriberCount: number; totalViews: number };
  videos: Video[];
  initial?: Goal;
  submitLabel?: string;
}) {
  const [type, setType] = useState<GoalType>(initial?.type ?? "subscribers");
  const auto = getAutoCurrentValue(type, channel, videos);
  const meta = TYPE_META[type];

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Goal title</Label>
        <Input
          id="title"
          name="title"
          placeholder='e.g. "Reach 20K subscribers"'
          defaultValue={initial?.title}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Goal type</Label>
        <Select
          name="type"
          value={type}
          onValueChange={(v) => setType(v as GoalType)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(TYPE_META) as GoalType[]).map((t) => {
              const m = TYPE_META[t];
              const Icon = m.icon;
              return (
                <SelectItem key={t} value={t}>
                  <span className="inline-flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5" />
                    {m.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {auto != null && (
          <p className="text-[11px] text-emerald-400/80 flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            Auto-synced from your channel — current value updates by itself.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="currentValue">
            Current
            <span className="text-[10px] text-muted-foreground ml-1">
              ({meta.unit})
            </span>
          </Label>
          <Input
            id="currentValue"
            name="currentValue"
            type="number"
            min="0"
            defaultValue={initial?.currentValue ?? auto ?? 0}
            disabled={auto != null && !initial}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="targetValue">
            Target
            <span className="text-[10px] text-muted-foreground ml-1">
              ({meta.unit})
            </span>
          </Label>
          <Input
            id="targetValue"
            name="targetValue"
            type="number"
            min="1"
            placeholder={String(((auto ?? 0) || 1000) * 2)}
            defaultValue={initial?.targetValue}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="deadline">Deadline</Label>
        <Input
          id="deadline"
          name="deadline"
          type="date"
          defaultValue={initial ? initial.deadline.split("T")[0] : defaultDeadline}
          required
        />
        {!initial && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {[
              { label: "30 days", days: 30 },
              { label: "60 days", days: 60 },
              { label: "90 days", days: 90 },
              { label: "6 months", days: 180 },
              { label: "1 year", days: 365 },
            ].map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={(e) => {
                  const form = (e.target as HTMLElement).closest("form");
                  const input = form?.querySelector<HTMLInputElement>(
                    'input[name="deadline"]',
                  );
                  if (input) {
                    const d = new Date(
                      Date.now() + p.days * 24 * 60 * 60 * 1000,
                    );
                    input.value = d.toISOString().split("T")[0];
                  }
                }}
                className="text-[11px] px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Button type="submit" className="w-full gap-2">
        <Target className="h-4 w-4" /> {submitLabel}
      </Button>
    </form>
  );
}
