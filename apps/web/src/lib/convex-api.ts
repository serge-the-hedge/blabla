import { api } from "@blabla/backend/convex/_generated/api";
import type {
	Id,
	TableNames,
} from "@blabla/backend/convex/_generated/dataModel";

export { api };

export function convexId<TableName extends TableNames>(id: string) {
	return id as Id<TableName>;
}
