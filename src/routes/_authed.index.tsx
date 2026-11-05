import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvex, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Bell,
  Building2,
  Check,
  DoorOpen,
  Download,
  HardDriveDownload,
  HardDriveUpload,
  Lightbulb,
  Package,
  Upload,
  Zap,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { Skeleton } from "#/components/ui/skeleton";
import { FIXTURE_LOCATION_LABELS } from "#/lib/constants";
import { userMessage } from "#/lib/errors";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/_authed/")({
  component: DashboardContent,
});

// ── Import preview types ────────────────────────────────────────────────

interface ImportPreview {
  properties: number;
  rooms: number;
  fixtures: number;
  bulbs: number;
  spareBulbs: number;
  rawJson: string;
}

import {
  countImportEntities as countImportData,
  parseImportData,
} from "#/lib/import-data";

// ── Dashboard ───────────────────────────────────────────────────────────

function DashboardContent() {
  const stats = useQuery(api.search.dashboardStats);
  const dueReminders = useQuery(api.reminders.listDue);
  const dismissReminder = useMutation(api.reminders.dismiss);
  const importAll = useMutation(api.dataTransfer.importAll);
  const convex = useConvex();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(
    null,
  );
  const [importing, setImporting] = useState(false);

  // ── Export handler ──────────────────────────────────────────────

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await convex.query(api.dataTransfer.exportAll, {});
      if (!data) {
        toast.error("No data to export");
        return;
      }
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `lights-inventory-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Inventory exported successfully");
    } catch (err) {
      toast.error(userMessage(err, "Export failed"));
    } finally {
      setExporting(false);
    }
  };

  // ── Import handlers ─────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      toast.error("Import file is too large");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        const parsed = parseImportData(text);
        const counts = countImportData(parsed);
        setImportPreview({ ...counts, rawJson: text });
      } catch (err) {
        toast.error(
          userMessage(
            err,
            "Invalid JSON file. Please select a valid export file.",
          ),
        );
      }
    };
    reader.readAsText(file);

    // Reset file input so the same file can be re-selected
    e.target.value = "";
  };

  const handleImportConfirm = async () => {
    if (!importPreview) return;
    setImporting(true);
    try {
      const result = await importAll({ data: importPreview.rawJson });
      toast.success(
        `Imported ${result.importedProperties} properties, ${result.importedRooms} rooms, ${result.importedFixtures} fixtures, ${result.importedBulbs} bulbs, and ${result.importedSpares} spare bulbs`,
      );
      setImportPreview(null);
    } catch (err) {
      toast.error(userMessage(err, "Import failed"));
    } finally {
      setImporting(false);
    }
  };

  // ── Loading state ───────────────────────────────────────────────

  if (stats === undefined) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8">
          <Skeleton className="h-9 w-40 mb-2" />
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {["first", "second", "third", "fourth"].map((i) => (
            <Card key={i}>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-5 rounded" />
                  <div>
                    <Skeleton className="h-4 w-16 mb-1" />
                    <Skeleton className="h-7 w-10" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          {["first", "second", "third"].map((i) => (
            <Card key={i}>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-9 w-12" />
                  </div>
                  <Skeleton className="h-10 w-10 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {["first", "second"].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Rendered dashboard ──────────────────────────────────────────

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        {stats.truncated && (
          <p role="status" className="text-sm text-muted-foreground">
            Showing partial totals: the 20,000-document scan limit was reached.
          </p>
        )}
        <p className="text-muted-foreground mt-1">
          Overview of your lighting inventory
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard
          icon={<Building2 className="h-5 w-5 text-blue-500" />}
          label="Properties"
          value={stats.properties}
        />
        <StatCard
          icon={<DoorOpen className="h-5 w-5 text-indigo-500" />}
          label="Rooms"
          value={stats.rooms}
        />
        <StatCard
          icon={<Zap className="h-5 w-5 text-yellow-500" />}
          label="Fixtures"
          value={stats.fixtures}
        />
        <StatCard
          icon={<Lightbulb className="h-5 w-5 text-amber-500" />}
          label="Bulbs"
          value={stats.bulbs}
        />
      </div>

      {/* Status Overview */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Working</p>
                <p className="text-3xl font-bold text-green-600">
                  {stats.working}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <Lightbulb className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Flickering</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {stats.flickering}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-yellow-100 dark:bg-yellow-900 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Dead</p>
                <p className="text-3xl font-bold text-red-600">{stats.dead}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                <Lightbulb className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions + Alerts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link to="/properties" className="no-underline">
              <Button
                variant="outline"
                className="w-full justify-start gap-2 mb-2"
              >
                <Building2 className="h-4 w-4" />
                Manage Properties
              </Button>
            </Link>
            <Link to="/inventory" className="no-underline">
              <Button
                variant="outline"
                className="w-full justify-start gap-2 mb-2"
              >
                <Package className="h-4 w-4" />
                Spare Bulbs ({stats.spareCount} in stock)
              </Button>
            </Link>
            <Link to="/search" className="no-underline">
              <Button variant="outline" className="w-full justify-start gap-2">
                <Lightbulb className="h-4 w-4" />
                Search All Bulbs
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bell className="h-5 w-5" />
              Due Reminders
              {dueReminders && dueReminders.length > 0 && (
                <Badge variant="destructive">{dueReminders.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!dueReminders || dueReminders.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reminders due. All bulbs are on schedule.
              </p>
            ) : (
              <ul className="space-y-1">
                {dueReminders.slice(0, 5).map((r) => (
                  <li key={r._id} className="flex items-center gap-1">
                    {r.fixtureId ? (
                      <Link
                        to="/fixture/$fixtureId"
                        params={{ fixtureId: r.fixtureId }}
                        search={{ bulbId: r.bulbId }}
                        className="flex-1 flex items-start gap-2 text-sm text-muted-foreground rounded-md p-2 hover:bg-muted transition-colors min-w-0"
                      >
                        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p>{r.message}</p>
                          <p className="text-xs text-muted-foreground/70 mt-0.5">
                            {[
                              r.roomName,
                              r.fixtureName ||
                                (r.fixtureLocation &&
                                  FIXTURE_LOCATION_LABELS[r.fixtureLocation]),
                              r.bulbProductName,
                              r.bulbWattage && `${r.bulbWattage}W`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </Link>
                    ) : (
                      <div className="flex-1 flex items-center gap-2 text-sm text-muted-foreground p-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        {r.message}
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-green-600"
                      title="Mark as done"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        await dismissReminder({ id: r._id });
                        toast.success("Reminder dismissed");
                      }}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Data Management */}
      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <HardDriveDownload className="h-5 w-5" />
              Data Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Export your entire inventory as a JSON file for backup, or import
              data from a previously exported file.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleExport}
                disabled={exporting}
              >
                <Download className="h-4 w-4" />
                {exporting ? "Exporting..." : "Export Data"}
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Import Data
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Import Confirmation Dialog */}
      <Dialog
        open={importPreview !== null}
        onOpenChange={(open) => {
          if (!open) setImportPreview(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Import</DialogTitle>
            <DialogDescription>
              The following data will be added to your inventory. Existing data
              will not be modified or removed.
            </DialogDescription>
          </DialogHeader>

          {importPreview && (
            <div className="grid grid-cols-2 gap-3 py-2">
              <SummaryItem
                icon={<Building2 className="h-4 w-4 text-blue-500" />}
                label="Properties"
                value={importPreview.properties}
              />
              <SummaryItem
                icon={<DoorOpen className="h-4 w-4 text-indigo-500" />}
                label="Rooms"
                value={importPreview.rooms}
              />
              <SummaryItem
                icon={<Zap className="h-4 w-4 text-yellow-500" />}
                label="Fixtures"
                value={importPreview.fixtures}
              />
              <SummaryItem
                icon={<Lightbulb className="h-4 w-4 text-amber-500" />}
                label="Bulbs"
                value={importPreview.bulbs}
              />
              <SummaryItem
                icon={<Package className="h-4 w-4 text-emerald-500" />}
                label="Spare Bulbs"
                value={importPreview.spareBulbs}
              />
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportPreview(null)}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button onClick={handleImportConfirm} disabled={importing}>
              <HardDriveUpload className="h-4 w-4 mr-2" />
              {importing ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Shared components ───────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border p-3">
      {icon}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
      </div>
    </div>
  );
}
