import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useState } from "react";

// Type for room with enriched fields from the API
type RoomWithDetails = Doc<"rooms"> & {
  propertyName: string;
};
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
import {
  Plus,
  Lightbulb,
  AlertTriangle,
  Trash2,
  Pencil,
  ArrowLeft,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "#/components/ConfirmDialog";
import {
  FIXTURE_LOCATION_LABELS,
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
          params={{ propertyId: (room as RoomWithDetails | null)?.propertyId || "" }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 no-underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to{" "}
          {(room as RoomWithDetails | null)?.propertyName || "Property"}
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
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fixtures.map((fixture: any) => (
          <FixtureCard key={fixture._id} fixture={fixture} />
        ))}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/25 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary cursor-pointer bg-transparent"
            >
              <Plus className="h-8 w-8" />
              <span className="text-sm font-medium">Add Fixture</span>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Fixture</DialogTitle>
              <DialogDescription className="sr-only">
                Enter the details for a new fixture.
              </DialogDescription>
            </DialogHeader>
            <CreateFixtureForm
              roomId={roomId as Id<"rooms">}
              onSuccess={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
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
              {fixture.name || FIXTURE_LOCATION_LABELS[fixture.location] || fixture.location}
            </CardTitle>
            <CardDescription className="flex flex-wrap gap-1 mt-1">
              {fixture.name && (
                <Badge variant="outline">
                  {FIXTURE_LOCATION_LABELS[fixture.location] || fixture.location}
                </Badge>
              )}
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
                  <DialogDescription className="sr-only">
                    Update the details for this fixture.
                  </DialogDescription>
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
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location) return;
    setLoading(true);
    try {
      await create({
        roomId,
        name: name || undefined,
        location: location as "ceiling" | "wall" | "floor" | "table" | "desk" | "under_cabinet" | "recessed" | "track" | "pendant" | "chandelier" | "sconce" | "outdoor" | "other",
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
        <Label>Name (optional)</Label>
        <Input
          placeholder="e.g. Main overhead, Bedside lamp"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
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
        disabled={loading || !location}
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
  const [name, setName] = useState(fixture.name || "");
  const [location, setLocation] = useState(fixture.location);
  const [notes, setNotes] = useState(fixture.notes || "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await update({
        id: fixture._id,
        name: name || undefined,
        location,
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
        <Label>Name (optional)</Label>
        <Input
          placeholder="e.g. Main overhead, Bedside lamp"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
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
