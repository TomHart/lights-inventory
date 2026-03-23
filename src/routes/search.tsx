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
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { Badge } from "#/components/ui/badge";
import { Checkbox } from "#/components/ui/checkbox";
import { Separator } from "#/components/ui/separator";
import {
  Search,
  Lightbulb,
  Filter,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  SOCKET_TYPE_OPTIONS,
  BULB_STATUS_LABELS,
  BULB_STATUS_COLORS,
  COLOUR_TEMP_LABELS,
  FIXTURE_LOCATION_LABELS,
  ROOM_TYPE_LABELS,
} from "#/lib/constants";

export const Route = createFileRoute("/search")({
  component: SearchPage,
  ssr: false,
});

function SearchPage() {
  return (
    <AuthGuard>
      <SearchContent />
    </AuthGuard>
  );
}

function SearchContent() {
  const [socketType, setSocketType] = useState<string>("");
  const [minWattage, setMinWattage] = useState<string>("");
  const [maxWattage, setMaxWattage] = useState<string>("");
  const [isSmart, setIsSmart] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [colourTemperature, setColourTemperature] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const results = useQuery(api.search.searchAll, {
    socketType: socketType || undefined,
    minWattage: minWattage ? Number(minWattage) : undefined,
    maxWattage: maxWattage ? Number(maxWattage) : undefined,
    isSmart:
      isSmart === "true" ? true : isSmart === "false" ? false : undefined,
    status: status || undefined,
    colourTemperature: colourTemperature || undefined,
  });

  const bulkUpdateStatus = useMutation(api.bulbs.bulkUpdateStatus);

  const clearFilters = () => {
    setSocketType("");
    setMinWattage("");
    setMaxWattage("");
    setIsSmart("");
    setStatus("");
    setColourTemperature("");
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!results) return;
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map((r: any) => r.bulbId)));
    }
  };

  const handleBulkStatus = async (newStatus: "working" | "flickering" | "dead") => {
    if (selectedIds.size === 0) return;
    try {
      await bulkUpdateStatus({
        ids: Array.from(selectedIds) as any,
        status: newStatus,
      });
      toast.success(`Updated ${selectedIds.size} bulbs to ${newStatus}`);
      setSelectedIds(new Set());
    } catch {
      toast.error("Failed to update");
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Search className="h-8 w-8" />
          Search & Filter
        </h1>
        <p className="text-muted-foreground mt-1">
          Search across all your bulbs and apply bulk actions
        </p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Socket Type</Label>
              <Select value={socketType} onValueChange={setSocketType}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
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
              <Label>Min Wattage</Label>
              <Input
                type="number"
                placeholder="Min"
                value={minWattage}
                onChange={(e) => setMinWattage(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Wattage</Label>
              <Input
                type="number"
                placeholder="Max"
                value={maxWattage}
                onChange={(e) => setMaxWattage(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Smart / Non-Smart</Label>
              <Select value={isSmart} onValueChange={setIsSmart}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Smart only</SelectItem>
                  <SelectItem value="false">Non-smart only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
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
            <div className="space-y-2">
              <Label>Colour Temperature</Label>
              <Select
                value={colourTemperature}
                onValueChange={setColourTemperature}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All" />
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
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={clearFilters}>
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <Card className="mb-4 border-primary">
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">
                {selectedIds.size} selected
              </span>
              <Separator orientation="vertical" className="h-6" />
              <span className="text-sm text-muted-foreground">
                Set status:
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkStatus("working")}
              >
                Working
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkStatus("flickering")}
              >
                Flickering
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkStatus("dead")}
              >
                Dead
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results === undefined ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-5 w-5 rounded" />
              <div className="flex-1">
                <div className="flex gap-2 mb-1">
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <Skeleton className="h-3 w-60" />
              </div>
              <Skeleton className="h-8 w-8" />
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Lightbulb className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No results found</h3>
            <p className="text-muted-foreground">
              Try adjusting your filters or add some bulbs first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </p>
            <Button variant="ghost" size="sm" onClick={selectAll}>
              {selectedIds.size === results.length
                ? "Deselect All"
                : "Select All"}
            </Button>
          </div>

          <div className="space-y-2">
            {results.map((result: any) => (
              <div
                key={result.bulbId}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                  selectedIds.has(result.bulbId)
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50"
                }`}
              >
                <Checkbox
                  checked={selectedIds.has(result.bulbId)}
                  onCheckedChange={() => toggleSelect(result.bulbId)}
                />
                <Lightbulb className="h-5 w-5 text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{result.wattage}W</span>
                    <Badge variant="outline" className="text-xs">
                      {result.socketType}
                    </Badge>
                    <Badge
                      className={`text-xs ${BULB_STATUS_COLORS[result.status]}`}
                    >
                      {BULB_STATUS_LABELS[result.status]}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {COLOUR_TEMP_LABELS[result.colourTemperature] ||
                        result.colourTemperature}
                    </Badge>
                    {result.features.includes("smart") && (
                      <Badge
                        variant="secondary"
                        className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                      >
                        Smart
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {result.propertyName} &rarr;{" "}
                    {result.roomName} (
                    {ROOM_TYPE_LABELS[result.roomType] || result.roomType}) &rarr;{" "}
                    {FIXTURE_LOCATION_LABELS[result.fixtureLocation] ||
                      result.fixtureLocation}
                    {result.productName && ` &middot; ${result.productName}`}
                  </p>
                </div>
                <Link
                  to="/fixture/$fixtureId"
                  params={{ fixtureId: result.fixtureId }}
                  className="no-underline"
                >
                  <Button variant="ghost" size="sm">
                    <Zap className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
