import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval(
  "purge stale rate limits",
  { hours: 1 },
  internal.rateLimit.purgeStale,
);
export default crons;
