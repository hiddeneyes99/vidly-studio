import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useCreatorData } from "@/hooks/use-creator-data";
import {
  LayoutDashboard,
  Youtube,
  Video,
  Lightbulb,
  Target,
  Calendar,
  FileText,
  Wand2,
  Settings,
  PlaySquare,
  Menu,
  Sparkles,
  MessageCircle,
  BadgeCheck,
  BotMessageSquare,
} from "lucide-react";

const VERIFIED_THRESHOLD = 10_000;

const FALLBACK_LOGO = "/twh-logo.jpeg";

const NAV_ITEMS = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "My Channel", href: "/youtube", icon: PlaySquare },
  { name: "Channel Setup", href: "/channel", icon: Youtube },
  { name: "Video Tracker", href: "/videos", icon: Video },
  { name: "Idea Bank", href: "/ideas", icon: Lightbulb },
  { name: "Goals", href: "/goals", icon: Target },
  { name: "Schedule", href: "/schedule", icon: Calendar },
  { name: "Script Writer", href: "/scripts", icon: FileText },
  { name: "AI Studio", href: "/ai", icon: Wand2 },
  { name: "AI Chat", href: "/chat", icon: BotMessageSquare },
  { name: "Comment Helper", href: "/comments", icon: MessageCircle },
  { name: "Settings", href: "/settings", icon: Settings },
];

const MOBILE_PRIMARY = [
  { name: "Home", href: "/", icon: LayoutDashboard },
  { name: "Channel", href: "/youtube", icon: PlaySquare },
  { name: "AI Chat", href: "/chat", icon: BotMessageSquare, highlight: true },
  { name: "AI Studio", href: "/ai", icon: Sparkles },
  { name: "Ideas", href: "/ideas", icon: Lightbulb },
];

function ChannelHeader() {
  const { channel } = useCreatorData();
  const logo = channel.logoUrl || FALLBACK_LOGO;
  const subs = channel.subscriberCount
    ? `${channel.subscriberCount.toLocaleString()} subscribers`
    : "Not synced yet";
  const isVerified = (channel.subscriberCount ?? 0) >= VERIFIED_THRESHOLD;

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="relative shrink-0">
        <img
          src={logo}
          alt={channel.name}
          className="h-11 w-11 rounded-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = FALLBACK_LOGO;
          }}
        />
        <span className="absolute inset-0 rounded-full ring-2 ring-primary/40 pointer-events-none" />
      </div>
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <h2 className="font-bold tracking-tight text-sidebar-foreground truncate text-sm">
            {channel.name}
          </h2>
          {isVerified && (
            <BadgeCheck
              className="h-5 w-5 shrink-0 fill-sky-500 text-background"
              aria-label="Verified — 10K+ subscribers"
            />
          )}
        </div>
        <p className="text-[11px] text-sidebar-foreground/60 truncate">{subs}</p>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { channel } = useCreatorData();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        {/* Desktop sidebar */}
        <Sidebar className="border-r border-sidebar-border bg-sidebar hidden lg:flex">
          <SidebarHeader className="border-b border-sidebar-border p-4">
            <ChannelHeader />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="px-3 pt-4 text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
                Mission Control
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="px-2 gap-1">
                  {NAV_ITEMS.map((item) => {
                    const isActive = location === item.href;
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.name}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.name}
                          className="h-11 rounded-lg data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold transition-colors"
                        >
                          <Link href={item.href} className="flex items-center gap-3.5 relative px-3">
                            {isActive && (
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary" />
                            )}
                            <Icon className="h-5 w-5 shrink-0" />
                            <span className="text-[15px]">{item.name}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border p-4">
            <div className="flex items-center gap-2">
              <img
                src="/vidly-logo.png"
                alt="Vidly Studio"
                className="h-6 w-6 rounded-md object-cover shrink-0"
              />
              <div className="flex flex-col leading-tight">
                <span className="text-[12px] font-semibold tracking-tight text-sidebar-foreground/80">
                  Vidly Studio
                </span>
                <span className="text-[10px] text-sidebar-foreground/40">v1.2</span>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          {/* Mobile top header */}
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border glass px-4 lg:hidden">
            <img
              src={channel.logoUrl || FALLBACK_LOGO}
              alt={channel.name}
              className="h-9 w-9 rounded-full object-cover ring-2 ring-primary/40 shrink-0"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = FALLBACK_LOGO;
              }}
            />
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1 min-w-0">
                <h1 className="font-semibold text-sm truncate leading-tight">{channel.name}</h1>
                {(channel.subscriberCount ?? 0) >= VERIFIED_THRESHOLD && (
                  <BadgeCheck
                    className="h-5 w-5 shrink-0 fill-sky-500 text-background"
                    aria-label="Verified — 10K+ subscribers"
                  />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground truncate">
                {channel.subscriberCount
                  ? `${channel.subscriberCount.toLocaleString()} subscribers`
                  : "Sync in Settings"}
              </p>
            </div>
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-accent transition-colors"
                  aria-label="Open menu"
                >
                  <Menu className="h-4 w-4" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0 flex flex-col">
                <SheetHeader className="border-b border-border p-4 text-left">
                  <SheetTitle className="text-sm">All sections</SheetTitle>
                </SheetHeader>
                <nav className="p-2 space-y-0.5 flex-1 overflow-y-auto">
                  {NAV_ITEMS.map((item) => {
                    const isActive = location === item.href;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
                        className={`flex items-center gap-3.5 px-3 py-3 rounded-lg text-[15px] transition-colors ${
                          isActive
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-foreground hover:bg-accent"
                        }`}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        {item.name}
                      </Link>
                    );
                  })}
                </nav>
                <div className="border-t border-border p-4">
                  <div className="flex items-center gap-2">
                    <img
                      src="/vidly-logo.png"
                      alt="Vidly Studio"
                      className="h-6 w-6 rounded-md object-cover shrink-0"
                    />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[12px] font-semibold tracking-tight text-foreground/80">
                        Vidly Studio
                      </span>
                      <span className="text-[10px] text-muted-foreground">v1.2</span>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </header>

          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-background p-3 sm:p-6 lg:p-8 pad-bottom-nav">
            <div className="mx-auto w-full max-w-7xl min-w-0">
              {children}
            </div>
          </main>

          {/* Mobile bottom navigation */}
          <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border glass">
            <div className="grid grid-cols-5 h-16 max-w-md mx-auto px-2">
              {MOBILE_PRIMARY.map((item) => {
                const isActive =
                  location === item.href ||
                  (item.href !== "/" && location.startsWith(item.href));
                const Icon = item.icon;
                if (item.highlight) {
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className="flex items-center justify-center"
                    >
                      <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full gradient-primary shadow-lg shadow-primary/30 ring-4 ring-background">
                        <Icon className="h-6 w-6 text-white" />
                      </span>
                    </Link>
                  );
                }
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                      isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-[10px] font-medium">{item.name}</span>
                  </Link>
                );
              })}
              <button
                onClick={() => setMoreOpen(true)}
                className="flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Menu className="h-5 w-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>
            </div>
          </nav>
        </div>
      </div>
    </SidebarProvider>
  );
}
