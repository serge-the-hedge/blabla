import { WorkflowManager } from "@convex-dev/workflow";

import { components } from "./_generated/api";

export const workflow = new WorkflowManager((components as any).workflow);
