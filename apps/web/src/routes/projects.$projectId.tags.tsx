import { Button } from "@blabla/ui/components/button";
import { Input } from "@blabla/ui/components/input";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { apiAny } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/tags")({
	component: TagsRoute,
});

function TagsRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/tags" });
	const project = useQuery(apiAny.projects.get, { projectId });
	const tags = useQuery(apiAny.tags.list, { projectId });
	const upsert = useMutation(apiAny.tags.upsert);
	const archive = useMutation(apiAny.tags.archive);
	const [name, setName] = useState("");
	const [color, setColor] = useState("#4f46e5");

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		await upsert({ projectId, name, color });
		setName("");
		toast.success("Tag saved");
	}

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title="Tags"
				description="Create reusable labels for filtering and export."
			/>
			<form
				onSubmit={submit}
				className="mb-4 grid grid-cols-[1fr_120px_auto] gap-2 border p-3"
			>
				<Input
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="checkout"
				/>
				<Input
					value={color}
					onChange={(event) => setColor(event.target.value)}
				/>
				<Button type="submit">Save</Button>
			</form>
			<div className="divide-y border">
				{(tags ?? []).map((tag: any) => (
					<div
						key={tag._id}
						className="flex items-center justify-between p-3 text-sm"
					>
						<div className="flex items-center gap-2">
							<span
								className="size-3 rounded-full border"
								style={{ backgroundColor: tag.color }}
							/>
							<div>
								<div className="font-medium">{tag.name}</div>
								<div className="text-muted-foreground text-xs">{tag.slug}</div>
							</div>
						</div>
						<Button
							size="sm"
							variant="outline"
							onClick={() => archive({ tagId: tag._id })}
						>
							Archive
						</Button>
					</div>
				))}
			</div>
		</ProjectShell>
	);
}
