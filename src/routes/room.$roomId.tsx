import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useState } from "react";
import { AuthGuard } from "#/components/AuthGuard";
import { Button } from "#/components/ui/button";
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
import { Checkbox } from "#/components/ui/checkbox";
import {
  Plus,
  Lightbulb,
  AlertTriangle,
  Trash2,
  Pencil,
  ArrowLeft,
  Zap,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "#/components/ConfirmDialog";
import {
  FIXTURE_LOCATION_LABELS,
  SOCKET_TYPE_OPTIONS,
  FEATURE_OPTIONS,
  FEATURE_LABELS,
  ROOM_TYPE_LABELS,
} from "#/lib/constants";

export const Route = createFileRoute("/room/$roomId")({
  component: RoomDetailPage,
  ssr: false,
});

function RoomDetailPage() {
  return (
    <AuthGuard>
      <RoomDetailContent />
    </AuthGuard>
  );
}

function RoomDetailContent() {
  const { roomId } = Route.useParams();
  const room = useQuery(api.rooms.get, { id: roomId as Id<"rooms"> });
  const fixtures = useQuery(api.fixtures.listByRoom, {
    roomId: roomId as Id<"rooms">,
  });
  const [createOpen, setCreateOpen] = useState(false);

  if (room === undefined || fixtures === undefined) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <Skeleton className="h-4 w-36 mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-9 w-48 mb-2" />
              <div className="flex gap-2 mt-1">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-32 mb-1" />
                <div className="flex gap-1 mt-1">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-14" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 text-sm mb-4">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (room === null) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Room not found</h1>
        <Link to="/properties">
          <Button variant="outline">Back to Properties</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <Link
          to="/property/$propertyId"
          params={{ propertyId: (room as any).propertyId || "" }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 no-underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to{" "}
          {(room as any).propertyName || "Property"}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{room.name}</h1>
            <div className="flex gap-2 mt-1">
              <Badge variant="secondary">
                {ROOM_TYPE_LABELS[room.roomType] || room.roomType}
              </Badge>
              <span className="text-muted-foreground text-sm">
                {fixtures.length} fixture{fixtures.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Add Fixture
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Fixture</DialogTitle>
              </DialogHeader>
              <CreateFixtureForm
                roomId={roomId as Id<"rooms">}
                onSuccess={() => setCreateOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {fixtures.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Zap className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No fixtures yet</h3>
            <p className="text-muted-foreground mb-4">
              Add light fixtures to start tracking bulbs.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Fixture
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fixtures.map((fixture: any) => (
            <FixtureCard key={fixture._id} fixture={fixture} />
          ))}
        </div>
      )}
    </div>
  );
}

function FixtureCard({ fixture }: { fixture: any }) {
  const removeFixture = useMutation(api.fixtures.remove);
  const duplicateFixture = useMutation(api.fixtures.duplicate);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">
              {FIXTURE_LOCATION_LABELS[fixture.location] || fixture.location}
            </CardTitle>
            <CardDescription className="flex flex-wrap gap-1 mt-1">
              <Badge variant="outline">{fixture.socketType}</Badge>
              {fixture.features.map((f: string) => (
                <Badge key={f} variant="secondary" className="text-xs">
                  {FEATURE_LABELS[f] || f}
                </Badge>
              ))}
            </CardDescription>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Duplicate fixture"
              onClick={async () => {
                await duplicateFixture({ id: fixture._id });
                toast.success("Fixture duplicated");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Pencil className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Edit Fixture</DialogTitle>
                </DialogHeader>
                <EditFixtureForm
                  fixture={fixture}
                  onSuccess={() => setEditOpen(false)}
                />
              </DialogContent>
            </Dialog>
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              }
              title="Delete fixture?"
              description="This will permanently delete this fixture and all its bulbs. This action cannot be undone."
              actionLabel="Delete"
              onConfirm={async () => {
                await removeFixture({ id: fixture._id });
                toast.success("Fixture deleted");
              }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {fixture.notes && (
          <p className="text-sm text-muted-foreground mb-3 italic">
            {fixture.notes}
          </p>
        )}
        <div className="flex gap-4 text-sm mb-4">
          <div className="flex items-center gap-1">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <span>{fixture.bulbCount} bulbs</span>
          </div>
          {fixture.issueCount > 0 && (
            <div className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              <span>{fixture.issueCount} issues</span>
            </div>
          )}
        </div>
        <Link
          to="/fixture/$fixtureId"
          params={{ fixtureId: fixture._id }}
          className="no-underline"
        >
          <Button variant="outline" className="w-full">
            View Bulbs
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function CreateFixtureForm({
  roomId,
  onSuccess,
}: {
  roomId: Id<"rooms">;
  onSuccess: () => void;
}) {
  const create = useMutation(api.fixtures.create);
  const [location, setLocation] = useState("");
  const [socketType, setSocketType] = useState("");
  const [features, setFeatures] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location || !socketType) return;
    setLoading(true);
    try {
      await create({
        roomId,
        location: location as any,
        socketType: socketType as any,
        features,
        notes: notes || undefined,
      });
      toast.success("Fixture created");
      onSuccess();
    } catch {
      toast.error("Failed to create fixture");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Location</Label>
        <Select value={location} onValueChange={setLocation}>
          <SelectTrigger>
            <SelectValue placeholder="Select location" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FIXTURE_LOCATION_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Socket Type</Label>
        <Select value={socketType} onValueChange={setSocketType}>
          <SelectTrigger>
            <SelectValue placeholder="Select socket type" />
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
        <Label>Notes (optional)</Label>
        <Textarea
          placeholder="e.g. Hard to reach, needs ladder"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={loading || !location || !socketType}
      >
        {loading ? "Creating..." : "Create Fixture"}
      </Button>
    </form>
  );
}

function EditFixtureForm({
  fixture,
  onSuccess,
}: {
  fixture: any;
  onSuccess: () => void;
}) {
  const update = useMutation(api.fixtures.update);
  const [location, setLocation] = useState(fixture.location);
  const [socketType, setSocketType] = useState(fixture.socketType);
  const [features, setFeatures] = useState<string[]>(fixture.features);
  const [notes, setNotes] = useState(fixture.notes || "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await update({
        id: fixture._id,
        location,
        socketType,
        features,
        notes: notes || undefined,
      });
      toast.success("Fixture updated");
      onSuccess();
    } catch {
      toast.error("Failed to update fixture");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Location</Label>
        <Select value={location} onValueChange={setLocation}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FIXTURE_LOCATION_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
