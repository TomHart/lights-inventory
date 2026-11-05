import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "#/components/ConfirmDialog";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Textarea } from "#/components/ui/textarea";
import { COLOUR_TEMP_LABELS, SOCKET_TYPE_OPTIONS } from "#/lib/constants";
import { userMessage } from "#/lib/errors";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

export const Route = createFileRoute("/_authed/inventory")({
  component: InventoryContent,
});

function InventoryContent() {
  const spares = useQuery(api.inventory.list);
  const [createOpen, setCreateOpen] = useState(false);

  if (spares === undefined) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Skeleton className="h-9 w-56 mb-2" />
            <Skeleton className="h-5 w-40" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {["first", "second", "third"].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-32 mb-1" />
                <Skeleton className="h-5 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-28 mb-3" />
                <div className="flex items-center justify-center gap-3 bg-muted rounded-lg p-3">
                  <Skeleton className="h-8 w-8" />
                  <div className="text-center min-w-[60px]">
                    <Skeleton className="mx-auto h-8 w-8 mb-1" />
                    <Skeleton className="mx-auto h-3 w-12" />
                  </div>
                  <Skeleton className="h-8 w-8" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const totalCount = spares.reduce((sum, s) => sum + s.quantity, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Spare Bulbs Inventory</h1>
        <p className="text-muted-foreground mt-1">
          {totalCount} spare bulb{totalCount !== 1 ? "s" : ""} in stock
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {spares.map((spare: Doc<"spareBulbs">) => (
          <SpareCard key={spare._id} spare={spare} />
        ))}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/25 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary cursor-pointer bg-transparent"
            >
              <Plus className="h-8 w-8" />
              <span className="text-sm font-medium">Add Spare</span>
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Spare Bulbs</DialogTitle>
              <DialogDescription className="sr-only">
                Enter the details for spare bulbs to add to inventory.
              </DialogDescription>
            </DialogHeader>
            <CreateSpareForm onSuccess={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function SpareCard({ spare }: { spare: Doc<"spareBulbs"> }) {
  const adjustQuantity = useMutation(api.inventory.adjustQuantity);
  const removeSpare = useMutation(api.inventory.remove);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">
              {spare.socketType} &middot; {spare.wattage}W
            </CardTitle>
            <div className="flex gap-1 mt-1">
              <Badge variant="secondary">
                {COLOUR_TEMP_LABELS[spare.colourTemperature] ||
                  spare.colourTemperature}
              </Badge>
            </div>
          </div>
          <div className="flex gap-1">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Pencil className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Edit Spare</DialogTitle>
                  <DialogDescription className="sr-only">
                    Update the details for this spare bulb entry.
                  </DialogDescription>
                </DialogHeader>
                <EditSpareForm
                  spare={spare}
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
              title="Remove spare bulb entry?"
              description="This will permanently remove this spare bulb entry from your inventory. This action cannot be undone."
              actionLabel="Remove"
              onConfirm={async () => {
                await removeSpare({ id: spare._id });
                toast.success("Spare removed");
              }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {spare.productName && (
          <p className="text-sm text-muted-foreground mb-2">
            {spare.productName}
          </p>
        )}
        {spare.notes && (
          <p className="text-xs text-muted-foreground italic mb-3">
            {spare.notes}
          </p>
        )}
        <div className="flex items-center justify-center gap-3 bg-muted rounded-lg p-3">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={async () => {
              await adjustQuantity({ id: spare._id, delta: -1 });
            }}
            disabled={spare.quantity <= 0}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <div className="text-center min-w-[60px]">
            <p className="text-2xl font-bold">{spare.quantity}</p>
            <p className="text-xs text-muted-foreground">in stock</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={async () => {
              await adjustQuantity({ id: spare._id, delta: 1 });
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {spare.productUrl && (
          <a
            href={spare.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-3 text-center text-sm text-blue-600 hover:underline"
          >
            Buy more
          </a>
        )}
      </CardContent>
    </Card>
  );
}

function CreateSpareForm({ onSuccess }: { onSuccess: () => void }) {
  const create = useMutation(api.inventory.create);
  const [socketType, setSocketType] = useState("");
  const [wattage, setWattage] = useState("60");
  const [colourTemperature, setColourTemperature] = useState("warm");
  const [quantity, setQuantity] = useState("1");
  const [productName, setProductName] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!socketType) return;
    setLoading(true);
    try {
      await create({
        socketType: socketType as Doc<"spareBulbs">["socketType"],
        wattage: Number(wattage),
        colourTemperature:
          colourTemperature as Doc<"spareBulbs">["colourTemperature"],
        quantity: Number(quantity),
        productName,
        productUrl,
        notes,
      });
      toast.success("Spare added");
      onSuccess();
    } catch (err) {
      toast.error(userMessage(err, "Failed to add spare"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Socket Type</Label>
          <Select
            value={socketType}
            onValueChange={(value) => setSocketType(value as typeof socketType)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
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
            onValueChange={(value) =>
              setColourTemperature(value as typeof colourTemperature)
            }
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
          <Label>Quantity</Label>
          <Input
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
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
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={loading || !socketType}
      >
        {loading ? "Adding..." : "Add Spare"}
      </Button>
    </form>
  );
}

function EditSpareForm({
  spare,
  onSuccess,
}: {
  spare: Doc<"spareBulbs">;
  onSuccess: () => void;
}) {
  const update = useMutation(api.inventory.update);
  const [socketType, setSocketType] = useState(spare.socketType);
  const [wattage, setWattage] = useState(String(spare.wattage));
  const [colourTemperature, setColourTemperature] = useState(
    spare.colourTemperature,
  );
  const [quantity, setQuantity] = useState(String(spare.quantity));
  const [productName, setProductName] = useState(spare.productName || "");
  const [productUrl, setProductUrl] = useState(spare.productUrl || "");
  const [notes, setNotes] = useState(spare.notes || "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await update({
        id: spare._id,
        socketType: socketType as Doc<"spareBulbs">["socketType"],
        wattage: Number(wattage),
        colourTemperature:
          colourTemperature as Doc<"spareBulbs">["colourTemperature"],
        quantity: Number(quantity),
        productName,
        productUrl,
        notes,
      });
      toast.success("Spare updated");
      onSuccess();
    } catch (err) {
      toast.error(userMessage(err, "Failed to update"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Socket Type</Label>
          <Select
            value={socketType}
            onValueChange={(value) => setSocketType(value as typeof socketType)}
          >
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
            onValueChange={(value) =>
              setColourTemperature(value as typeof colourTemperature)
            }
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
          <Label>Quantity</Label>
          <Input
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
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
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
