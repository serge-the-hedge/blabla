import { Button } from "@blabla/ui/components/button";
import { Input } from "@blabla/ui/components/input";
import { Label } from "@blabla/ui/components/label";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { apiAny } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/locales")({
	component: LocalesRoute,
});

function LocalesRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/locales" });
	const project = useQuery(apiAny.projects.get, { projectId });
	const locales = useQuery(apiAny.locales.list, { projectId });
	const createLocale = useMutation(apiAny.locales.create);
	const archiveLocale = useMutation(apiAny.locales.archive);
	const [code, setCode] = useState("");
	const [label, setLabel] = useState("");

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		await createLocale({ projectId, code, label });
		setCode("");
		setLabel("");
		toast.success("Locale created");
	}

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title="Locales"
				description="Create and archive target locales."
			/>
			<form
				onSubmit={submit}
				className="mb-4 grid grid-cols-[160px_1fr_auto] gap-2 border p-3"
			>
				<div className="flex flex-col gap-1">
					<Label>Code</Label>
					<Input
						value={code}
						onChange={(event) => setCode(event.target.value)}
						placeholder="hy"
					/>
				</div>
				<div className="flex flex-col gap-1">
					<Label>Label</Label>
					<Input
						value={label}
						onChange={(event) => setLabel(event.target.value)}
						placeholder="Armenian"
					/>
				</div>
				<Button className="self-end" type="submit">
					Create
				</Button>
			</form>
			<div className="divide-y border">
				{(locales ?? []).map((locale: any) => (
					<div
						key={locale._id}
						className="flex items-center justify-between p-3 text-sm"
					>
						<div>
							<div className="font-medium">{locale.label}</div>
							<div className="text-muted-foreground text-xs">{locale.code}</div>
						</div>
						{locale.isSource ? (
							<span className="text-muted-foreground text-xs">Source</span>
						) : (
							<Button
								size="sm"
								variant="outline"
								onClick={() => archiveLocale({ localeId: locale._id })}
							>
								Archive
							</Button>
						)}
					</div>
				))}
			</div>
		</ProjectShell>
	);
}
