import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

// Health check endpoint - using Convex's built-in health check
export default http;
