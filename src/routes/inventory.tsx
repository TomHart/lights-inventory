import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
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
  Minus,
  Package,
  Trash2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import {
  SOCKET_TYPE_OPTIONS,
  COLOUR_TEMP_LABELS,
} from "#/lib/constants";

export const Route = createFileRoute("/inventory")({
  component: InventoryPage,
  ssr: false,
});

function InventoryPage() {
  const spares = useQuery(api.inventory.list);
  const [createOpen, setCreateOpen] = useState(false);

  if (spares === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const totalCount = spares.reduce((sum: number, s: any) => sum + s.quantity, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Spare Bulbs Inventory</h1>
          <p className="text-muted-foreground mt-1">
            {totalCount} spare bulb{totalCount !== 1 ? "s" : ""} in stock
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Add Spare
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Spare Bulbs</DialogTitle>
            </DialogHeader>
            <CreateSpareForm onSuccess={() => setCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {spares.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              No spare bulbs tracked
            </h3>
            <p className="text-muted-foreground mb-4">
              Keep track of your spare bulb inventory.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Spare
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spares.map((spare: any) => (
            <SpareCard key={spare._id} spare={spare} />
          ))}
        </div>
      )}
    </div>
  );
}

function SpareCard({ spare }: { spare: any }) {
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
                </DialogHeader>
                <EditSpareForm
                  spare={spare}
                  onSuccess={() => setEditOpen(false)}
                />
              </DialogContent>
            </Dialog>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={async () => {
                if (confirm("Remove this spare bulb entry?")) {
                  await removeSpare({ id: spare._id });
                  toast.success("Spare removed");
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
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
        socketType: socketType as any,
        wattage: Number(wattage),
        colourTemperature: colourTemperature as any,
        quantity: Number(quantity),
        productName: productName || undefined,
        productUrl: productUrl || undefined,
        notes: notes || undefined,
      });
      toast.success("Spare added");
      onSuccess();
    } catch {
      toast.error("Failed to add spare");
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
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
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
  spare: any;
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
        socketType: socketType as any,
        wattage: Number(wattage),
        colourTemperature: colourTemperature as any,
        quantity: Number(quantity),
        productName: productName || undefined,
        productUrl: productUrl || undefined,
        notes: notes || undefined,
      });
      toast.success("Spare updated");
      onSuccess();
    } catch {
      toast.error("Failed to update");
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
