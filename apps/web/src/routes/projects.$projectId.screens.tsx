import { Button } from "@blabla/ui/components/button";
import { Card, CardContent } from "@blabla/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@blabla/ui/components/empty";
import { Field, FieldGroup, FieldLabel } from "@blabla/ui/components/field";
import { Input } from "@blabla/ui/components/input";
import { Skeleton } from "@blabla/ui/components/skeleton";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Plus, ScrollText } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { api, convexId } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/screens")({
	component: ScreensRoute,
});

function ScreensRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/screens" });
	const convexProjectId = convexId<"projects">(projectId);
	const project = useQuery(api.projects.get, { projectId: convexProjectId });
	const screens = useQuery(api.screens.list, { projectId: convexProjectId });
	const upsert = useMutation(api.screens.upsert);
	const archive = useMutation(api.screens.archive);
	const [name, setName] = useState("");

	async function submit(event: FormEvent) {
		event.preventDefault();
		await upsert({ projectId: convexProjectId, name });
		setName("");
		toast.success("Screen saved");
	}

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader title="Screens" description="Group strings by app screen." />
			<div className="flex flex-col gap-4">
				<Card size="sm">
					<CardContent>
						<form onSubmit={submit}>
							<FieldGroup className="grid grid-cols-[1fr_auto] items-end gap-3">
								<Field>
									<FieldLabel htmlFor="screen-name">Name</FieldLabel>
									<Input
										id="screen-name"
										value={name}
										onChange={(event) => setName(event.target.value)}
										placeholder="Checkout"
									/>
								</Field>
								<Button type="submit" disabled={!name.trim()}>
									<Plus data-icon="inline-start" />
									Save
								</Button>
							</FieldGroup>
						</form>
					</CardContent>
				</Card>

				{screens === undefined ? (
					<Skeleton className="h-32 w-full" />
				) : screens.length === 0 ? (
					<Empty className="border">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<ScrollText />
							</EmptyMedia>
							<EmptyTitle>No screens yet</EmptyTitle>
							<EmptyDescription>
								Add a screen name to group related strings.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<Card size="sm">
						<CardContent className="divide-y">
							{screens.map((screen: any) => (
								<div
									key={screen._id}
									className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
								>
									<div className="flex flex-col">
										<span className="font-medium text-sm">{screen.name}</span>
										<span className="font-mono text-muted-foreground text-xs">
											{screen.slug}
										</span>
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
						</CardContent>
					</Card>
				)}
			</div>
		</ProjectShell>
	);
}
