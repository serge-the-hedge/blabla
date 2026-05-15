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
import { Plus, Tags as TagsIcon } from "lucide-react";
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
			<div className="flex flex-col gap-4">
				<Card size="sm">
					<CardContent>
						<form onSubmit={submit}>
							<FieldGroup className="grid grid-cols-[1fr_120px_auto] items-end gap-3">
								<Field>
									<FieldLabel htmlFor="tag-name">Name</FieldLabel>
									<Input
										id="tag-name"
										value={name}
										onChange={(event) => setName(event.target.value)}
										placeholder="checkout"
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="tag-color">Color</FieldLabel>
									<div className="relative">
										<input
											aria-label="Tag color"
											type="color"
											value={color}
											onChange={(event) => setColor(event.target.value)}
											className="h-8 w-full cursor-pointer rounded-md border border-input bg-transparent p-0.5"
										/>
									</div>
								</Field>
								<Button type="submit" disabled={!name.trim()}>
									<Plus data-icon="inline-start" />
									Save
								</Button>
							</FieldGroup>
						</form>
					</CardContent>
				</Card>

				{tags === undefined ? (
					<Skeleton className="h-32 w-full" />
				) : tags.length === 0 ? (
					<Empty className="border">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<TagsIcon />
							</EmptyMedia>
							<EmptyTitle>No tags yet</EmptyTitle>
							<EmptyDescription>
								Add a tag above to start slicing your strings.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<Card size="sm">
						<CardContent className="divide-y">
							{tags.map((tag: any) => (
								<div
									key={tag._id}
									className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
								>
									<div className="flex items-center gap-3">
										<span
											className="size-3 shrink-0 rounded-full border"
											style={{ backgroundColor: tag.color }}
											aria-hidden
										/>
										<div className="flex flex-col">
											<span className="font-medium text-sm">{tag.name}</span>
											<span className="font-mono text-muted-foreground text-xs">
												{tag.slug}
											</span>
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
						</CardContent>
					</Card>
				)}
			</div>
		</ProjectShell>
	);
}
