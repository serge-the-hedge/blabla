import aggregate from "@convex-dev/aggregate/convex.config";
import betterAuth from "@convex-dev/better-auth/convex.config";
import migrations from "@convex-dev/migrations/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(betterAuth);
app.use(migrations);
app.use(rateLimiter);
app.use(aggregate);
app.use(workflow);

export default app;
