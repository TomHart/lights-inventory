import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useState } from "react";
import { AuthGuard } from "#/components/AuthGuard";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { Badge } from "#/components/ui/badge";
import { Separator } from "#/components/ui/separator";
import {
  Plus,
  Lightbulb,
  Trash2,
  Pencil,
  ArrowLeft,
  Calendar,
  Clock,
  Bell,
  Wrench,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "#/components/ConfirmDialog";
import { Checkbox } from "#/components/ui/checkbox";
import {
  BULB_STATUS_LABELS,
  BULB_STATUS_COLORS,
  COLOUR_TEMP_LABELS,
  FIXTURE_LOCATION_LABELS,
  SOCKET_TYPE_OPTIONS,
  FEATURE_OPTIONS,
  FEATURE_LABELS,
} from "#/lib/constants";

export const Route = createFileRoute("/fixture/$fixtureId")({
  component: FixtureDetailPage,
  ssr: false,
});

function FixtureDetailPage() {
  return (
    <AuthGuard>
      <FixtureDetailContent />
    </AuthGuard>
  );
}

function FixtureDetailContent() {
  const { fixtureId } = Route.useParams();
  const fixture = useQuery(api.fixtures.get, {
    id: fixtureId as Id<"fixtures">,
  });
  const bulbs = useQuery(api.bulbs.listByFixture, {
    fixtureId: fixtureId as Id<"fixtures">,
  });
  const maintenanceLogs = useQuery(api.maintenance.listByFixture, {
    fixtureId: fixtureId as Id<"fixtures">,
  });
  const [createBulbOpen, setCreateBulbOpen] = useState(false);
  const [addLogOpen, setAddLogOpen] = useState(false);

  if (fixture === undefined || bulbs === undefined) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <Skeleton className="h-4 w-32 mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-9 w-56 mb-2" />
              <div className="flex gap-2 mt-1">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-40" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-10 w-28" />
            </div>
          </div>
        </div>
        <Skeleton className="h-7 w-28 mb-4" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <Skeleton className="h-5 w-32 mb-1" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="flex gap-1 mb-3">
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 flex-1" />
                </div>
                <div className="flex gap-1">
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 w-8" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (fixture === null) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Fixture not found</h1>
        <Link to="/properties">
          <Button variant="outline">Back to Properties</Button>
        </Link>
      </div>
    );
  }

  const fixtureData = fixture as any;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <Link
          to="/room/$roomId"
          params={{ roomId: fixtureData.roomId || "" }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 no-underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {fixtureData.roomName || "Room"}
        </Link>
        <div>
          <h1 className="text-3xl font-bold">
            {FIXTURE_LOCATION_LABELS[fixture.location] || fixture.location}{" "}
            Fixture
          </h1>
          <div className="flex gap-2 mt-1 flex-wrap">
            <span className="text-muted-foreground text-sm">
              in {fixtureData.roomName} &middot; {fixtureData.propertyName}
            </span>
          </div>
        </div>
        {fixture.notes && (
          <p className="mt-2 text-sm text-muted-foreground italic">
            {fixture.notes}
          </p>
        )}
      </div>

      {/* Bulbs List */}
      <h2 className="text-xl font-semibold mb-4">
        Bulbs ({bulbs.length})
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {bulbs.map((bulb: any) => (
          <BulbCard
            key={bulb._id}
            bulb={bulb}
            fixtureId={fixtureId as Id<"fixtures">}
          />
        ))}
        <Dialog open={createBulbOpen} onOpenChange={setCreateBulbOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/25 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary cursor-pointer bg-transparent"
            >
              <Plus className="h-8 w-8" />
              <span className="text-sm font-medium">Add Bulb</span>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Bulb</DialogTitle>
              <DialogDescription className="sr-only">
                Enter the details for a new bulb.
              </DialogDescription>
            </DialogHeader>
            <CreateBulbForm
              fixtureId={fixtureId as Id<"fixtures">}
              onSuccess={() => setCreateBulbOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Maintenance History */}
      <Separator className="my-8" />
      <h2 className="text-xl font-semibold mb-4">
        Maintenance History
      </h2>
      <div className="space-y-2">
        {maintenanceLogs && maintenanceLogs.map((log: any) => (
          <div
            key={log._id}
            className="flex items-start gap-3 rounded-lg border p-3 text-sm"
          >
            <Wrench className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{log.action}</p>
              {log.notes && (
                <p className="text-muted-foreground">{log.notes}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(log.date).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
        <Dialog open={addLogOpen} onOpenChange={setAddLogOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary cursor-pointer bg-transparent"
            >
              <Plus className="h-4 w-4" />
              <span className="font-medium">Log Maintenance</span>
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Maintenance Log</DialogTitle>
              <DialogDescription className="sr-only">
                Record a maintenance action for this fixture.
              </DialogDescription>
            </DialogHeader>
            <AddMaintenanceLogForm
              fixtureId={fixtureId as Id<"fixtures">}
              onSuccess={() => setAddLogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function BulbCard({
  bulb,
}: {
  bulb: any;
  fixtureId: Id<"fixtures">;
}) {
  const updateStatus = useMutation(api.bulbs.updateStatus);
  const duplicateBulb = useMutation(api.bulbs.duplicate);
  const removeBulb = useMutation(api.bulbs.remove);
  const [editOpen, setEditOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);

  const daysSinceInstall = Math.floor(
    (Date.now() - bulb.installDate) / (1000 * 60 * 60 * 24),
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              {bulb.wattage}W{" "}
              {COLOUR_TEMP_LABELS[bulb.colourTemperature] ||
                bulb.colourTemperature}
            </CardTitle>
            <CardDescription className="mt-1 flex flex-wrap gap-1">
              <Badge variant="outline" className="text-xs">{bulb.socketType}</Badge>
              {bulb.features?.map((f: string) => (
                <Badge key={f} variant="secondary" className="text-xs">
                  {FEATURE_LABELS[f] || f}
                </Badge>
              ))}
              <span className="text-xs">{bulb.productName || "Unknown product"}</span>
            </CardDescription>
          </div>
          <Badge className={BULB_STATUS_COLORS[bulb.status]}>
            {BULB_STATUS_LABELS[bulb.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm mb-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            Installed {new Date(bulb.installDate).toLocaleDateString()}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {daysSinceInstall} days in use
          </div>
          {bulb.productUrl && (
            <a
              href={bulb.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              Product link
            </a>
          )}
          {bulb.notes && (
            <p className="text-xs italic text-muted-foreground mt-1">
              {bulb.notes}
            </p>
          )}
        </div>

        {/* Status quick-change */}
        <div className="flex gap-1 mb-3">
          {(["working", "flickering", "dead"] as const).map((status) => (
            <Button
              key={status}
              variant={bulb.status === status ? "default" : "outline"}
              size="sm"
              className="flex-1 text-xs"
              onClick={async () => {
                if (bulb.status !== status) {
                  await updateStatus({ id: bulb._id, status });
                  toast.success(`Status updated to ${status}`);
                }
              }}
            >
              {BULB_STATUS_LABELS[status]}
            </Button>
          ))}
        </div>

        <div className="flex gap-1">
          <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1">
                <Bell className="h-3.5 w-3.5 mr-1" /> Reminder
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Set Replacement Reminder</DialogTitle>
                <DialogDescription className="sr-only">
                  Set a date to be reminded to replace this bulb.
                </DialogDescription>
              </DialogHeader>
              <ReminderForm
                bulbId={bulb._id}
                onSuccess={() => setReminderOpen(false)}
              />
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            size="sm"
            title="Duplicate bulb"
            onClick={async () => {
              await duplicateBulb({ id: bulb._id });
              toast.success("Bulb duplicated");
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit Bulb</DialogTitle>
                <DialogDescription className="sr-only">
                  Update the details for this bulb.
                </DialogDescription>
              </DialogHeader>
              <EditBulbForm
                bulb={bulb}
                onSuccess={() => setEditOpen(false)}
              />
            </DialogContent>
          </Dialog>
          <ConfirmDialog
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            }
            title="Delete bulb?"
            description="This will permanently remove this bulb from the fixture. This action cannot be undone."
            actionLabel="Delete"
            onConfirm={async () => {
              await removeBulb({ id: bulb._id });
              toast.success("Bulb deleted");
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function CreateBulbForm({
  fixtureId,
  onSuccess,
}: {
  fixtureId: Id<"fixtures">;
  onSuccess: () => void;
}) {
  const create = useMutation(api.bulbs.create);
  const [socketType, setSocketType] = useState("E26");
  const [features, setFeatures] = useState<string[]>([]);
  const [wattage, setWattage] = useState("60");
  const [colourTemperature, setColourTemperature] = useState("warm");
  const [status, setStatus] = useState("working");
  const [installDate, setInstallDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [notes, setNotes] = useState("");
  const [productName, setProductName] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await create({
        fixtureId,
        socketType: socketType as any,
        features,
        wattage: Number(wattage),
        colourTemperature: colourTemperature as any,
        status: status as any,
        installDate: new Date(installDate).getTime(),
        notes: notes || undefined,
        productName: productName || undefined,
        productUrl: productUrl || undefined,
      });
      toast.success("Bulb added");
      onSuccess();
    } catch {
      toast.error("Failed to add bulb");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Socket Type</Label>
          <Select value={socketType} onValueChange={setSocketType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOCKET_TYPE_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Wattage</Label>
          <Input
            type="number"
            min="1"
            value={wattage}
            onChange={(e) => setWattage(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Colour Temperature</Label>
          <Select
            value={colourTemperature}
            onValueChange={setColourTemperature}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(COLOUR_TEMP_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(BULB_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Install Date</Label>
        <Input
          type="date"
          value={installDate}
          onChange={(e) => setInstallDate(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Features</Label>
        <div className="grid grid-cols-2 gap-2">
          {FEATURE_OPTIONS.map((f) => (
            <div key={f} className="flex items-center gap-2">
              <Checkbox
                id={`feature-${f}`}
                checked={features.includes(f)}
                onCheckedChange={(checked) =>
                  setFeatures(
                    checked
                      ? [...features, f]
                      : features.filter((x) => x !== f),
                  )
                }
              />
              <Label htmlFor={`feature-${f}`} className="text-sm font-normal">
                {FEATURE_LABELS[f] || f}
              </Label>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Product Name (optional)</Label>
        <Input
          placeholder="e.g. Philips LED A19"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Product URL (optional)</Label>
        <Input
          type="url"
          placeholder="https://..."
          value={productUrl}
          onChange={(e) => setProductUrl(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Notes (optional)</Label>
        <Textarea
          placeholder="Any notes about this bulb"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Adding..." : "Add Bulb"}
      </Button>
    </form>
  );
}

function EditBulbForm({
  bulb,
  onSuccess,
}: {
  bulb: any;
  onSuccess: () => void;
}) {
  const update = useMutation(api.bulbs.update);
  const [socketType, setSocketType] = useState(bulb.socketType || "E26");
  const [features, setFeatures] = useState<string[]>(bulb.features || []);
  const [wattage, setWattage] = useState(String(bulb.wattage));
  const [colourTemperature, setColourTemperature] = useState(
    bulb.colourTemperature,
  );
  const [installDate, setInstallDate] = useState(
    new Date(bulb.installDate).toISOString().split("T")[0],
  );
  const [notes, setNotes] = useState(bulb.notes || "");
  const [productName, setProductName] = useState(bulb.productName || "");
  const [productUrl, setProductUrl] = useState(bulb.productUrl || "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await update({
        id: bulb._id,
        socketType: socketType as any,
        features,
        wattage: Number(wattage),
        colourTemperature: colourTemperature as any,
        installDate: new Date(installDate).getTime(),
        notes: notes || undefined,
        productName: productName || undefined,
        productUrl: productUrl || undefined,
      });
      toast.success("Bulb updated");
      onSuccess();
    } catch {
      toast.error("Failed to update bulb");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Socket Type</Label>
          <Select value={socketType} onValueChange={setSocketType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOCKET_TYPE_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Wattage</Label>
          <Input
            type="number"
            min="1"
            value={wattage}
            onChange={(e) => setWattage(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Colour Temperature</Label>
          <Select
            value={colourTemperature}
            onValueChange={setColourTemperature}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(COLOUR_TEMP_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Install Date</Label>
          <Input
            type="date"
            value={installDate}
            onChange={(e) => setInstallDate(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Features</Label>
        <div className="grid grid-cols-2 gap-2">
          {FEATURE_OPTIONS.map((f) => (
            <div key={f} className="flex items-center gap-2">
              <Checkbox
                id={`edit-feature-${f}`}
                checked={features.includes(f)}
                onCheckedChange={(checked) =>
                  setFeatures(
                    checked
                      ? [...features, f]
                      : features.filter((x) => x !== f),
                  )
                }
              />
              <Label
                htmlFor={`edit-feature-${f}`}
                className="text-sm font-normal"
              >
                {FEATURE_LABELS[f] || f}
              </Label>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Product Name</Label>
        <Input
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Product URL</Label>
        <Input
          type="url"
          value={productUrl}
          onChange={(e) => setProductUrl(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}

function ReminderForm({
  bulbId,
  onSuccess,
}: {
  bulbId: Id<"bulbs">;
  onSuccess: () => void;
}) {
  const createReminder = useMutation(api.reminders.create);
  const [date, setDate] = useState("");
  const [message, setMessage] = useState("Time to replace this bulb");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createReminder({
        bulbId,
        reminderDate: new Date(date).getTime(),
        message,
      });
      toast.success("Reminder set");
      onSuccess();
    } catch {
      toast.error("Failed to set reminder");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Reminder Date</Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Message</Label>
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading || !date}>
        {loading ? "Setting..." : "Set Reminder"}
      </Button>
    </form>
  );
}

function AddMaintenanceLogForm({
  fixtureId,
  onSuccess,
}: {
  fixtureId: Id<"fixtures">;
  onSuccess: () => void;
}) {
  const createLog = useMutation(api.maintenance.create);
  const [action, setAction] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createLog({
        fixtureId,
        action,
        notes: notes || undefined,
        date: new Date(date).getTime(),
      });
      toast.success("Maintenance log added");
      onSuccess();
    } catch {
      toast.error("Failed to add log");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Action</Label>
        <Input
          placeholder="e.g. Replaced bulb, Cleaned fixture"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Date</Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Notes (optional)</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Adding..." : "Add Log Entry"}
      </Button>
    </form>
  );
}
