import { Badge } from "@blabla/ui/components/badge";
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
import { Languages, Plus } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-action";
import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { api, convexId } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/locales")({
	component: LocalesRoute,
});

type LocaleRow = {
	_id: string;
	code: string;
	label: string;
	isSource?: boolean;
};

function LocalesRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/locales" });
	const convexProjectId = convexId<"projects">(projectId);
	const project = useQuery(api.projects.get, { projectId: convexProjectId });
	const locales = useQuery(api.locales.list, { projectId: convexProjectId }) as
		| LocaleRow[]
		| undefined;
	const createLocale = useMutation(api.locales.create);
	const archiveLocale = useMutation(api.locales.archive);
	const [code, setCode] = useState("");
	const [label, setLabel] = useState("");
	const [archivingId, setArchivingId] = useState<string>();

	async function submit(event: FormEvent) {
		event.preventDefault();
		try {
			await createLocale({ projectId: convexProjectId, code, label });
			setCode("");
			setLabel("");
			toast.success("Locale created");
		} catch (error) {
			console.error(error);
			toast.error(
				error instanceof Error ? error.message : "Could not create locale",
			);
		}
	}

	async function onArchive(localeId: string) {
		setArchivingId(localeId);
		try {
			await archiveLocale({ localeId: convexId<"locales">(localeId) });
			toast.success("Locale archived");
		} catch (error) {
			console.error(error);
			toast.error(
				error instanceof Error ? error.message : "Could not archive locale",
			);
		} finally {
			setArchivingId(undefined);
		}
	}

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title="Locales"
				description="Create and archive target locales."
			/>
			<div className="flex flex-col gap-4">
				<Card size="sm">
					<CardContent>
						<form onSubmit={submit}>
							<FieldGroup className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[160px_1fr_auto]">
								<Field>
									<FieldLabel htmlFor="locale-code">Code</FieldLabel>
									<Input
										id="locale-code"
										name="localeCode"
										autoComplete="off"
										spellCheck={false}
										value={code}
										onChange={(event) => setCode(event.target.value)}
										placeholder="hy"
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="locale-label">Label</FieldLabel>
									<Input
										id="locale-label"
										name="localeLabel"
										autoComplete="off"
										value={label}
										onChange={(event) => setLabel(event.target.value)}
										placeholder="Armenian"
									/>
								</Field>
								<Button type="submit" disabled={!code.trim() || !label.trim()}>
									<Plus data-icon="inline-start" />
									Add locale
								</Button>
							</FieldGroup>
						</form>
					</CardContent>
				</Card>

				{locales === undefined ? (
					<Skeleton className="h-32 w-full" />
				) : locales.length === 0 ? (
					<Empty className="border">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Languages />
							</EmptyMedia>
							<EmptyTitle>No locales yet</EmptyTitle>
							<EmptyDescription>
								Add a target locale to start translating.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<Card size="sm">
						<CardContent className="divide-y">
							{locales.map((locale) => (
								<div
									key={locale._id}
									className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
								>
									<div className="flex min-w-0 flex-col">
										<div className="flex items-center gap-2">
											<span className="font-medium text-sm">
												{locale.label}
											</span>
											{locale.isSource ? (
												<Badge
													variant="outline"
													className="border-brand/40 text-brand"
												>
													Source
												</Badge>
											) : null}
										</div>
										<span className="font-mono text-muted-foreground text-xs">
											{locale.code}
										</span>
									</div>
									{!locale.isSource ? (
										<ConfirmAction
											triggerLabel={
												archivingId === locale._id ? "Archiving…" : "Archive"
											}
											title={`Archive ${locale.label}?`}
											description="This locale will be hidden from active translation and export views. Existing values are retained."
											confirmLabel="Archive locale"
											disabled={archivingId !== undefined}
											onConfirm={() => onArchive(locale._id)}
										/>
									) : null}
								</div>
							))}
						</CardContent>
					</Card>
				)}
			</div>
		</ProjectShell>
	);
}
