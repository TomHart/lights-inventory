import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useState } from "react";
import { AuthGuard } from "#/components/AuthGuard";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
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
import {
  Plus,
  DoorOpen,
  Lightbulb,
  AlertTriangle,
  Trash2,
  Pencil,
  ArrowLeft,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "#/components/ConfirmDialog";
import { ROOM_TYPE_LABELS } from "#/lib/constants";

export const Route = createFileRoute("/property/$propertyId")({
  component: PropertyDetailPage,
  ssr: false,
});

function PropertyDetailPage() {
  return (
    <AuthGuard>
      <PropertyDetailContent />
    </AuthGuard>
  );
}

function PropertyDetailContent() {
  const { propertyId } = Route.useParams();
  const property = useQuery(api.properties.get, {
    id: propertyId as Id<"properties">,
  });
  const rooms = useQuery(api.rooms.listByProperty, {
    propertyId: propertyId as Id<"properties">,
  });
  const [createOpen, setCreateOpen] = useState(false);

  if (property === undefined || rooms === undefined) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <Skeleton className="h-4 w-36 mb-4" />
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-9 w-48 mb-2" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-36 mb-1" />
                <Skeleton className="h-5 w-20" />
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 text-center text-sm mb-4">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className="rounded-lg bg-muted p-2">
                      <Skeleton className="mx-auto h-4 w-4 mb-1" />
                      <Skeleton className="mx-auto h-5 w-6 mb-1" />
                      <Skeleton className="mx-auto h-3 w-10" />
                    </div>
                  ))}
                </div>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (property === null) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Property not found</h1>
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
          to="/properties"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 no-underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Properties
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{property.name}</h1>
            <p className="text-muted-foreground mt-1">
              {rooms.length} room{rooms.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Add Room
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Room</DialogTitle>
              </DialogHeader>
              <CreateRoomForm
                propertyId={propertyId as Id<"properties">}
                onSuccess={() => setCreateOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {rooms.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <DoorOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No rooms yet</h3>
            <p className="text-muted-foreground mb-4">
              Add rooms to start tracking fixtures and bulbs.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Room
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room: any) => (
            <RoomCard key={room._id} room={room} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoomCard({
  room,
}: {
  room: any;
}) {
  const removeRoom = useMutation(api.rooms.remove);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{room.name}</CardTitle>
            <CardDescription>
              <Badge variant="secondary" className="mt-1">
                {ROOM_TYPE_LABELS[room.roomType] || room.roomType}
              </Badge>
            </CardDescription>
          </div>
          <div className="flex gap-1">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Pencil className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Room</DialogTitle>
                </DialogHeader>
                <EditRoomForm
                  room={room}
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
              title="Delete room?"
              description="This will permanently delete this room and all its fixtures and bulbs. This action cannot be undone."
              actionLabel="Delete"
              onConfirm={async () => {
                await removeRoom({ id: room._id });
                toast.success("Room deleted");
              }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 text-center text-sm mb-4">
          <div className="rounded-lg bg-muted p-2">
            <Zap className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
            <p className="font-semibold">{room.fixtureCount}</p>
            <p className="text-xs text-muted-foreground">Fixtures</p>
          </div>
          <div className="rounded-lg bg-muted p-2">
            <Lightbulb className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
            <p className="font-semibold">{room.bulbCount}</p>
            <p className="text-xs text-muted-foreground">Bulbs</p>
          </div>
          <div className="rounded-lg bg-muted p-2">
            <AlertTriangle className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
            <p className="font-semibold">{room.issueCount}</p>
            <p className="text-xs text-muted-foreground">Issues</p>
          </div>
        </div>
        <Link
          to="/room/$roomId"
          params={{ roomId: room._id }}
          className="no-underline"
        >
          <Button variant="outline" className="w-full">
            View Fixtures
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function CreateRoomForm({
  propertyId,
  onSuccess,
}: {
  propertyId: Id<"properties">;
  onSuccess: () => void;
}) {
  const create = useMutation(api.rooms.create);
  const [name, setName] = useState("");
  const [roomType, setRoomType] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomType) return;
    setLoading(true);
    try {
      await create({ propertyId, name, roomType: roomType as any });
      toast.success("Room created");
      onSuccess();
    } catch {
      toast.error("Failed to create room");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="room-name">Room Name</Label>
        <Input
          id="room-name"
          placeholder="e.g. Master Bedroom, Kitchen"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="room-type">Room Type</Label>
        <Select value={roomType} onValueChange={setRoomType}>
          <SelectTrigger>
            <SelectValue placeholder="Select room type" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ROOM_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={loading || !roomType}
      >
        {loading ? "Creating..." : "Create Room"}
      </Button>
    </form>
  );
}

function EditRoomForm({
  room,
  onSuccess,
}: {
  room: any;
  onSuccess: () => void;
}) {
  const update = useMutation(api.rooms.update);
  const [name, setName] = useState(room.name);
  const [roomType, setRoomType] = useState(room.roomType);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await update({ id: room._id, name, roomType });
      toast.success("Room updated");
      onSuccess();
    } catch {
      toast.error("Failed to update room");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Room Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Room Type</Label>
        <Select value={roomType} onValueChange={setRoomType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ROOM_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
