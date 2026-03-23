import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
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
  Building2,
  Plus,
  DoorOpen,
  Lightbulb,
  AlertTriangle,
  Trash2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "#/components/ConfirmDialog";

export const Route = createFileRoute("/properties")({
  component: PropertiesPage,
  ssr: false,
});

function PropertiesPage() {
  return (
    <AuthGuard>
      <PropertiesContent />
    </AuthGuard>
  );
}

function PropertiesContent() {
  const properties = useQuery(api.properties.list);
  const [createOpen, setCreateOpen] = useState(false);

  if (properties === undefined) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Skeleton className="h-9 w-36 mb-2" />
            <Skeleton className="h-5 w-64" />
          </div>
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-40 mb-1" />
                <Skeleton className="h-4 w-28" />
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Properties</h1>
          <p className="text-muted-foreground mt-1">
            Manage your properties and their rooms
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Add Property
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Property</DialogTitle>
            </DialogHeader>
            <CreatePropertyForm onSuccess={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {properties.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No properties yet</h3>
            <p className="text-muted-foreground mb-4">
              Add your first property to start tracking your lights.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Property
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((property: any) => (
            <PropertyCard key={property._id} property={property} />
          ))}
        </div>
      )}
    </div>
  );
}

function PropertyCard({ property }: { property: any }) {
  const stats = useQuery(api.properties.getWithStats, { id: property._id });
  const removeProperty = useMutation(api.properties.remove);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{property.name}</CardTitle>
            <CardDescription>
              Created {new Date(property.createdAt).toLocaleDateString()}
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
                  <DialogTitle>Edit Property</DialogTitle>
                </DialogHeader>
                <EditPropertyForm
                  property={property}
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
              title="Delete property?"
              description="This will permanently delete this property and all its rooms, fixtures, and bulbs. This action cannot be undone."
              actionLabel="Delete"
              onConfirm={async () => {
                await removeProperty({ id: property._id });
                toast.success("Property deleted");
              }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {stats && (
          <div className="grid grid-cols-3 gap-2 text-center text-sm mb-4">
            <div className="rounded-lg bg-muted p-2">
              <DoorOpen className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="font-semibold">{stats.roomCount}</p>
              <p className="text-xs text-muted-foreground">Rooms</p>
            </div>
            <div className="rounded-lg bg-muted p-2">
              <Lightbulb className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="font-semibold">{stats.bulbCount}</p>
              <p className="text-xs text-muted-foreground">Bulbs</p>
            </div>
            <div className="rounded-lg bg-muted p-2">
              <AlertTriangle className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="font-semibold">{stats.issueCount}</p>
              <p className="text-xs text-muted-foreground">Issues</p>
            </div>
          </div>
        )}
        <Link
          to="/property/$propertyId"
          params={{ propertyId: property._id }}
          className="no-underline"
        >
          <Button variant="outline" className="w-full">
            View Rooms
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function CreatePropertyForm({ onSuccess }: { onSuccess: () => void }) {
  const create = useMutation(api.properties.create);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await create({ name });
      toast.success("Property created");
      onSuccess();
    } catch {
      toast.error("Failed to create property");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="property-name">Property Name</Label>
        <Input
          id="property-name"
          placeholder="e.g. My Home, Beach House"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Creating..." : "Create Property"}
      </Button>
    </form>
  );
}

function EditPropertyForm({
  property,
  onSuccess,
}: {
  property: any;
  onSuccess: () => void;
}) {
  const update = useMutation(api.properties.update);
  const [name, setName] = useState(property.name);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await update({ id: property._id, name });
      toast.success("Property updated");
      onSuccess();
    } catch {
      toast.error("Failed to update property");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="edit-property-name">Property Name</Label>
        <Input
          id="edit-property-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
