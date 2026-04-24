import { exportCreatorData, importCreatorData, resetCreatorData, useCreatorData } from "@/hooks/use-creator-data";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Moon, Sun, Download, Upload, Trash2, ShieldAlert, Save, Sparkles, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";

export default function Settings() {
  const { toast } = useToast();
  const { brandDefaults, setBrandDefaults } = useCreatorData();
  const { logout, username } = useAuth();
  const [isDark, setIsDark] = useState(true);

  const handleLogout = async () => {
    if (!confirm("Sign out from this device? You'll need to log in again.")) return;
    await logout();
  };

  const [draftBrand, setDraftBrand] = useState(brandDefaults);
  useEffect(() => setDraftBrand(brandDefaults), [brandDefaults]);

  const saveBrand = () => {
    setBrandDefaults(draftBrand);
    toast({ title: "Brand defaults saved", description: "AI ab in details ko har description me automatic add karega." });
  };

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);
  }, []);

  const toggleTheme = (checked: boolean) => {
    setIsDark(checked);
    if (checked) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("creator_os_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("creator_os_theme", "light");
    }
  };

  const handleExport = async () => {
    const data = await exportCreatorData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `creator-os-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({ title: "Data Exported", description: "Your data has been downloaded as a JSON file." });
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          await importCreatorData(data);
          toast({ title: "Data Imported", description: "Your data has been restored. Reloading..." });
          setTimeout(() => window.location.reload(), 1500);
        } catch (error) {
          toast({ title: "Import Failed", description: "The file could not be parsed or saved.", variant: "destructive" });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleClearData = async () => {
    if (confirm("WARNING: This will permanently delete ALL your data. This cannot be undone. Are you sure?")) {
      if (confirm("Are you absolutely sure?")) {
        await resetCreatorData();
        toast({ title: "Data Cleared", description: "All data has been wiped. Reloading..." });
        setTimeout(() => window.location.reload(), 1500);
      }
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your workspace preferences and data.</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Customize the look and feel of Vidly Studio.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Dark Mode</Label>
                <p className="text-sm text-muted-foreground">Toggle between light and dark themes.</p>
              </div>
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-muted-foreground" />
                <Switch checked={isDark} onCheckedChange={toggleTheme} />
                <Moon className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-400" /> Brand Defaults
            </CardTitle>
            <CardDescription>
              Ye details AI har generated YouTube description ke end me automatic add karega.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="yt">YouTube URL</Label>
                <Input
                  id="yt"
                  value={draftBrand.socialLinks.youtube}
                  onChange={(e) =>
                    setDraftBrand((d) => ({ ...d, socialLinks: { ...d.socialLinks, youtube: e.target.value } }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ig">Instagram URL</Label>
                <Input
                  id="ig"
                  value={draftBrand.socialLinks.instagram}
                  onChange={(e) =>
                    setDraftBrand((d) => ({ ...d, socialLinks: { ...d.socialLinks, instagram: e.target.value } }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tg">Telegram URL</Label>
                <Input
                  id="tg"
                  value={draftBrand.socialLinks.telegram}
                  onChange={(e) =>
                    setDraftBrand((d) => ({ ...d, socialLinks: { ...d.socialLinks, telegram: e.target.value } }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tw">Twitter URL (optional)</Label>
                <Input
                  id="tw"
                  value={draftBrand.socialLinks.twitter ?? ""}
                  onChange={(e) =>
                    setDraftBrand((d) => ({ ...d, socialLinks: { ...d.socialLinks, twitter: e.target.value } }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fb">Facebook URL (optional)</Label>
                <Input
                  id="fb"
                  value={draftBrand.socialLinks.facebook ?? ""}
                  onChange={(e) =>
                    setDraftBrand((d) => ({ ...d, socialLinks: { ...d.socialLinks, facebook: e.target.value } }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Business email</Label>
                <Input
                  id="email"
                  type="email"
                  value={draftBrand.businessEmail}
                  onChange={(e) =>
                    setDraftBrand((d) => ({ ...d, businessEmail: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tagline">Business tagline</Label>
              <Input
                id="tagline"
                value={draftBrand.businessTagline}
                onChange={(e) =>
                  setDraftBrand((d) => ({ ...d, businessTagline: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signoff">Sign-off line (optional)</Label>
              <Textarea
                id="signoff"
                rows={2}
                value={draftBrand.signOffLine}
                onChange={(e) =>
                  setDraftBrand((d) => ({ ...d, signOffLine: e.target.value }))
                }
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={saveBrand} className="gap-2">
              <Save className="h-4 w-4" /> Save brand defaults
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Management</CardTitle>
            <CardDescription>Export your data for backup or import from a previous save.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col space-y-3 p-4 border rounded-lg">
                <div>
                  <h4 className="font-semibold">Export Data</h4>
                  <p className="text-sm text-muted-foreground">Download a JSON file containing all your channel data, videos, scripts, and goals.</p>
                </div>
                <Button variant="outline" className="w-full gap-2 mt-auto" onClick={handleExport}>
                  <Download className="h-4 w-4" /> Export Backup
                </Button>
              </div>
              
              <div className="flex flex-col space-y-3 p-4 border rounded-lg">
                <div>
                  <h4 className="font-semibold">Import Data</h4>
                  <p className="text-sm text-muted-foreground">Restore your workspace from a previously exported JSON backup file.</p>
                </div>
                <Button variant="outline" className="w-full gap-2 mt-auto" onClick={handleImport}>
                  <Upload className="h-4 w-4" /> Import Backup
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5" /> Account
            </CardTitle>
            <CardDescription>
              {username
                ? `Signed in as ${username}. Stays signed in for 7 days on this device.`
                : "Stays signed in for 7 days on this device."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 border border-border rounded-lg bg-card/50">
              <div>
                <h4 className="font-semibold">Sign out</h4>
                <p className="text-sm text-muted-foreground">
                  You'll need your username and password to sign back in.
                </p>
              </div>
              <Button variant="outline" className="shrink-0 gap-2" onClick={handleLogout}>
                <LogOut className="h-4 w-4" /> Sign out
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> Danger Zone
            </CardTitle>
            <CardDescription>Irreversible actions for your workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 border border-destructive/20 rounded-lg bg-destructive/5">
              <div>
                <h4 className="font-semibold text-destructive">Wipe All Data</h4>
                <p className="text-sm text-muted-foreground">Permanently delete all videos, goals, scripts, and channel settings from this browser.</p>
              </div>
              <Button variant="destructive" className="shrink-0 gap-2" onClick={handleClearData}>
                <Trash2 className="h-4 w-4" /> Clear Workspace
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
