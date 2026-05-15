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

export const Route = createFileRoute("/projects/$projectId/screens")({
	component: ScreensRoute,
});

function ScreensRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/screens" });
	const project = useQuery(apiAny.projects.get, { projectId });
	const screens = useQuery(apiAny.screens.list, { projectId });
	const upsert = useMutation(apiAny.screens.upsert);
	const archive = useMutation(apiAny.screens.archive);
	const [name, setName] = useState("");

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		await upsert({ projectId, name });
		setName("");
		toast.success("Screen saved");
	}

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader title="Screens" description="Group strings by app screen." />
			<form onSubmit={submit} className="mb-4 flex gap-2 border p-3">
				<Input
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="Checkout"
				/>
				<Button type="submit">Save</Button>
			</form>
			<div className="divide-y border">
				{(screens ?? []).map((screen: any) => (
					<div
						key={screen._id}
						className="flex items-center justify-between p-3 text-sm"
					>
						<div>
							<div className="font-medium">{screen.name}</div>
							<div className="text-muted-foreground text-xs">{screen.slug}</div>
						</div>
						<Button
							size="sm"
							variant="outline"
							onClick={() => archive({ screenId: screen._id })}
						>
							Archive
						</Button>
					</div>
				))}
			</div>
		</ProjectShell>
	);
}
