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
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Plus, Tags as TagsIcon } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { api, convexId } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/tags")({
	component: TagsRoute,
});

type TagRow = {
	_id: string;
	name: string;
	slug: string;
	color?: string;
};

function TagsRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/tags" });
	const convexProjectId = convexId<"projects">(projectId);
	const project = useQuery(api.projects.get, { projectId: convexProjectId });
	const tags = useQuery(api.tags.list, { projectId: convexProjectId }) as
		| TagRow[]
		| undefined;
	const upsert = useMutation(api.tags.upsert);
	const archive = useMutation(api.tags.archive);
	const [name, setName] = useState("");
	const [color, setColor] = useState("#4f46e5");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [archivingId, setArchivingId] = useState<string>();

	async function submit(event: FormEvent) {
		event.preventDefault();
		setIsSubmitting(true);
		try {
			await upsert({ projectId: convexProjectId, name, color });
			setName("");
			toast.success("Tag saved");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not save tag",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	async function archiveTag(tag: TagRow) {
		setArchivingId(tag._id);
		try {
			await archive({ tagId: convexId<"tags">(tag._id) });
			toast.success("Tag archived");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not archive tag",
			);
		} finally {
			setArchivingId(undefined);
		}
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
							<FieldGroup className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_120px_auto]">
								<Field>
									<FieldLabel htmlFor="tag-name">Name</FieldLabel>
									<Input
										id="tag-name"
										name="tagName"
										autoComplete="off"
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
								<Button type="submit" disabled={!name.trim() || isSubmitting}>
									<Plus data-icon="inline-start" />
									{isSubmitting ? "Saving…" : "Save tag"}
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
							{tags.map((tag) => (
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
										<Link
											to="/projects/$projectId/strings"
											params={{ projectId }}
											search={{
												tag: tag.slug,
												screen: undefined,
												q: undefined,
											}}
											className="flex min-w-0 flex-col rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											<span className="font-medium text-sm">{tag.name}</span>
											<span className="font-mono text-muted-foreground text-xs">
												{tag.slug}
											</span>
										</Link>
									</div>
									<ConfirmAction
										triggerLabel={
											archivingId === tag._id ? "Archiving…" : "Archive"
										}
										title={`Archive ${tag.name}?`}
										description="This tag will be removed from active filters and string metadata."
										confirmLabel="Archive tag"
										disabled={archivingId !== undefined}
										onConfirm={() => archiveTag(tag)}
									/>
								</div>
							))}
						</CardContent>
					</Card>
				)}
			</div>
		</ProjectShell>
	);
}
