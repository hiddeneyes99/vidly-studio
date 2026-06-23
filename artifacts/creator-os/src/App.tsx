import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import { AppLayout } from "@/components/layout";
import { AuthProvider, useAuth } from "@/components/auth-context";
import { InstallPrompt } from "@/components/install-prompt";

// Pages
import Dashboard from "@/pages/dashboard";
import ChannelSetup from "@/pages/channel";
import YouTubePage from "@/pages/youtube";
import VideoDetailPage from "@/pages/video-detail";
import VideoTracker from "@/pages/videos";
import IdeaBank from "@/pages/ideas";
import Goals from "@/pages/goals";
import Schedule from "@/pages/schedule";
import ScriptWriter from "@/pages/scripts";
import AiStudio from "@/pages/ai";
import ChatPage from "@/pages/chat";
import Comments from "@/pages/comments";
import Settings from "@/pages/settings";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/channel" component={ChannelSetup} />
        <Route path="/youtube" component={YouTubePage} />
        <Route path="/youtube/:videoId" component={VideoDetailPage} />
        <Route path="/videos" component={VideoTracker} />
        <Route path="/ideas" component={IdeaBank} />
        <Route path="/goals" component={Goals} />
        <Route path="/schedule" component={Schedule} />
        <Route path="/scripts" component={ScriptWriter} />
        <Route path="/ai" component={AiStudio} />
        <Route path="/chat" component={ChatPage} />
        <Route path="/comments" component={Comments} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function AuthGate() {
  const { isAuthed, isReady } = useAuth();

  if (!isReady) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthed) {
    return <LoginPage />;
  }

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router />
      <InstallPrompt />
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
