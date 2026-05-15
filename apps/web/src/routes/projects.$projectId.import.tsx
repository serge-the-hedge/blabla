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

export const Route = createFileRoute("/projects/$projectId/import")({
	component: ImportRoute,
});

function ImportRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/import" });
	const project = useQuery(apiAny.projects.get, { projectId });
	const locales = useQuery(apiAny.locales.list, { projectId });
	const importJson = useMutation(apiAny.imports.startJsonImport);
	const importArb = useMutation(apiAny.imports.startArbImport);
	const [format, setFormat] = useState<"json" | "arb">("json");
	const [localeCode, setLocaleCode] = useState("");
	const [screenSlug, setScreenSlug] = useState("");
	const [tagSlugs, setTagSlugs] = useState("");
	const [content, setContent] = useState(
		'{\n  "checkout.payButton": "Pay now"\n}',
	);

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		const args = {
			projectId,
			localeCode,
			content,
			screenSlug: screenSlug || undefined,
			tagSlugs: tagSlugs
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean),
		};
		const jobId =
			format === "json" ? await importJson(args) : await importArb(args);
		toast.success(`Import queued: ${jobId}`);
	}

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title="Import"
				description="Bootstrap or update strings from JSON and Flutter ARB."
			/>
			<form onSubmit={submit} className="flex max-w-3xl flex-col gap-3">
				<div className="grid grid-cols-4 gap-3">
					<div className="flex flex-col gap-1">
						<Label>Format</Label>
						<select
							className="h-8 border bg-background px-2 text-xs"
							value={format}
							onChange={(event) =>
								setFormat(event.target.value as "json" | "arb")
							}
						>
							<option value="json">JSON</option>
							<option value="arb">Flutter ARB</option>
						</select>
					</div>
					<div className="flex flex-col gap-1">
						<Label>Locale</Label>
						<select
							className="h-8 border bg-background px-2 text-xs"
							value={localeCode}
							onChange={(event) => setLocaleCode(event.target.value)}
						>
							<option value="">Choose locale</option>
							{(locales ?? []).map((locale: any) => (
								<option key={locale._id} value={locale.code}>
									{locale.code}
								</option>
							))}
						</select>
					</div>
					<div className="flex flex-col gap-1">
						<Label>Screen slug</Label>
						<Input
							value={screenSlug}
							onChange={(event) => setScreenSlug(event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1">
						<Label>Tags</Label>
						<Input
							value={tagSlugs}
							onChange={(event) => setTagSlugs(event.target.value)}
							placeholder="checkout, legal"
						/>
					</div>
				</div>
				<textarea
					className="min-h-96 rounded-sm border bg-background p-3 font-mono text-xs outline-none focus:border-ring"
					value={content}
					onChange={(event) => setContent(event.target.value)}
				/>
				<Button type="submit">Import</Button>
			</form>
		</ProjectShell>
	);
}
