import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "#/components/ui/card";
import { Badge } from "#/components/ui/badge";
import {
    Building2,
    DoorOpen,
    Lightbulb,
    AlertTriangle,
    Bell,
    Package,
    Zap,
} from "lucide-react";
import { Button } from "#/components/ui/button";

export const Route = createFileRoute("/dashboard")({
    component: DashboardPage,
    ssr: false,
});

function DashboardPage() {
    const stats = useQuery(api.search.dashboardStats);
    const dueReminders = useQuery(api.reminders.listDue);

    if (stats === undefined) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"/>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-6xl px-4 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Dashboard</h1>
                <p className="text-muted-foreground mt-1">
                    Overview of your lighting inventory
                </p>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                <StatCard
                    icon={<Building2 className="h-5 w-5 text-blue-500"/>}
                    label="Properties"
                    value={stats.properties}
                />
                <StatCard
                    icon={<DoorOpen className="h-5 w-5 text-indigo-500"/>}
                    label="Rooms"
                    value={stats.rooms}
                />
                <StatCard
                    icon={<Zap className="h-5 w-5 text-yellow-500"/>}
                    label="Fixtures"
                    value={stats.fixtures}
                />
                <StatCard
                    icon={<Lightbulb className="h-5 w-5 text-amber-500"/>}
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
                            <div
                                className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                                <Lightbulb className="h-5 w-5 text-green-600"/>
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
                            <div
                                className="h-10 w-10 rounded-full bg-yellow-100 dark:bg-yellow-900 flex items-center justify-center">
                                <AlertTriangle className="h-5 w-5 text-yellow-600"/>
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
                            <div
                                className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                                <Lightbulb className="h-5 w-5 text-red-600"/>
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
                            <Button variant="outline" className="w-full justify-start gap-2 mb-2">
                                <Building2 className="h-4 w-4"/>
                                Manage Properties
                            </Button>
                        </Link>
                        <Link to="/inventory" className="no-underline">
                            <Button variant="outline" className="w-full justify-start gap-2 mb-2">
                                <Package className="h-4 w-4"/>
                                Spare Bulbs ({stats.spareCount} in stock)
                            </Button>
                        </Link>
                        <Link to="/search" className="no-underline">
                            <Button variant="outline" className="w-full justify-start gap-2">
                                <Lightbulb className="h-4 w-4"/>
                                Search All Bulbs
                            </Button>
                        </Link>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Bell className="h-5 w-5"/>
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
                            <ul className="space-y-2">
                                {dueReminders.slice(0, 5).map((r: any) => (
                                    <li
                                        key={r._id}
                                        className="flex items-center gap-2 text-sm text-muted-foreground"
                                    >
                                        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0"/>
                                        {r.message}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

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
