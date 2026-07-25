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

import { ConfirmAction } from "@/components/confirm-action";
import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { api, convexId } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/screens")({
	component: ScreensRoute,
});

type ScreenRow = { _id: string; name: string; slug: string };

function ScreensRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/screens" });
	const convexProjectId = convexId<"projects">(projectId);
	const project = useQuery(api.projects.get, { projectId: convexProjectId });
	const screens = useQuery(api.screens.list, { projectId: convexProjectId }) as
		| ScreenRow[]
		| undefined;
	const upsert = useMutation(api.screens.upsert);
	const archive = useMutation(api.screens.archive);
	const [name, setName] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [archivingId, setArchivingId] = useState<string>();

	async function submit(event: FormEvent) {
		event.preventDefault();
		setIsSubmitting(true);
		try {
			await upsert({ projectId: convexProjectId, name });
			setName("");
			toast.success("Screen saved");
		} catch (error) {
			toast.error(
				error instanceof Error
					? `Could not save screen: ${error.message}`
					: "Could not save screen. Check the name and try again.",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	async function archiveScreen(screen: ScreenRow) {
		setArchivingId(screen._id);
		try {
			await archive({ screenId: convexId<"screens">(screen._id) });
			toast.success("Screen archived");
		} catch (error) {
			toast.error(
				error instanceof Error
					? `Could not archive screen: ${error.message}`
					: "Could not archive screen. Try again.",
			);
		} finally {
			setArchivingId(undefined);
		}
	}

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader title="Screens" description="Group strings by app screen." />
			<div className="flex flex-col gap-4">
				<Card size="sm">
					<CardContent>
						<form onSubmit={submit}>
							<FieldGroup className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto]">
								<Field>
									<FieldLabel htmlFor="screen-name">Name</FieldLabel>
									<Input
										id="screen-name"
										name="screenName"
										autoComplete="off"
										value={name}
										onChange={(event) => setName(event.target.value)}
										placeholder="Checkout…"
									/>
								</Field>
								<Button type="submit" disabled={!name.trim() || isSubmitting}>
									<Plus data-icon="inline-start" />
									{isSubmitting ? "Saving…" : "Save screen"}
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
							{screens.map((screen) => (
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
									<ConfirmAction
										triggerLabel={
											archivingId === screen._id ? "Archiving…" : "Archive"
										}
										title={`Archive ${screen.name}?`}
										description="This screen will no longer appear in active filters. Existing strings remain available."
										confirmLabel="Archive screen"
										disabled={archivingId !== undefined}
										onConfirm={() => archiveScreen(screen)}
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
