import { Button } from "@blabla/ui/components/button";
import { Input } from "@blabla/ui/components/input";
import { Label } from "@blabla/ui/components/label";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { apiAny } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/export")({
	component: ExportRoute,
});

function ExportRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/export" });
	const project = useQuery(apiAny.projects.get, { projectId });
	const locales = useQuery(apiAny.locales.list, { projectId });
	const exportJson = useMutation(apiAny.exports.startJsonExport);
	const exportArb = useMutation(apiAny.exports.startArbExport);
	const [format, setFormat] = useState<"json" | "arb">("json");
	const [localeCode, setLocaleCode] = useState("");
	const [selectionType, setSelectionType] = useState<
		"all" | "keys" | "tag" | "screen"
	>("all");
	const [selectionValue, setSelectionValue] = useState("");
	const [content, setContent] = useState("");

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		const selection =
			selectionType === "keys"
				? {
						type: "keys" as const,
						keys: selectionValue
							.split(",")
							.map((item) => item.trim())
							.filter(Boolean),
					}
				: selectionType === "tag"
					? { type: "tag" as const, tag: selectionValue }
					: selectionType === "screen"
						? { type: "screen" as const, screen: selectionValue }
						: { type: "all" as const };
		const result =
			format === "json"
				? await exportJson({ projectId, localeCode, selection })
				: await exportArb({ projectId, localeCode, selection });
		setContent(result.content ?? "");
	}

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title="Export"
				description="Export all or selected strings to JSON and Flutter ARB."
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
						<Label>Selection</Label>
						<select
							className="h-8 border bg-background px-2 text-xs"
							value={selectionType}
							onChange={(event) => setSelectionType(event.target.value as any)}
						>
							<option value="all">All</option>
							<option value="keys">Keys</option>
							<option value="tag">Tag</option>
							<option value="screen">Screen</option>
						</select>
					</div>
					<div className="flex flex-col gap-1">
						<Label>Value</Label>
						<Input
							value={selectionValue}
							onChange={(event) => setSelectionValue(event.target.value)}
						/>
					</div>
				</div>
				<Button type="submit">Export</Button>
				<textarea
					className="min-h-96 rounded-sm border bg-background p-3 font-mono text-xs outline-none"
					readOnly
					value={content}
				/>
			</form>
		</ProjectShell>
	);
}
