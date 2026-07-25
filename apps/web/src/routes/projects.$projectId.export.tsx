import { Button } from "@blabla/ui/components/button";
import { Card, CardContent } from "@blabla/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@blabla/ui/components/field";
import { Input } from "@blabla/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@blabla/ui/components/select";
import { Textarea } from "@blabla/ui/components/textarea";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Copy, Download } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { api, convexId } from "@/lib/convex-api";
import {
	buildExportFileName,
	downloadExportFile,
	type ExportFormat,
} from "@/lib/export-download";

export const Route = createFileRoute("/projects/$projectId/export")({
	component: ExportRoute,
});

type SelectionType = "all" | "keys" | "tag" | "screen";
type LocaleOption = {
	_id: string;
	code: string;
};

function ExportRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/export" });
	const convexProjectId = convexId<"projects">(projectId);
	const project = useQuery(api.projects.get, { projectId: convexProjectId });
	const locales = useQuery(api.locales.list, { projectId: convexProjectId });
	const exportJson = useMutation(api.exports.startJsonExport);
	const exportArb = useMutation(api.exports.startArbExport);
	const [format, setFormat] = useState<ExportFormat>("json");
	const [localeCode, setLocaleCode] = useState("");
	const [selectionType, setSelectionType] = useState<SelectionType>("all");
	const [selectionValue, setSelectionValue] = useState("");
	const [content, setContent] = useState("");
	const [generatedFileName, setGeneratedFileName] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);

	async function submit(event: FormEvent) {
		event.preventDefault();
		setIsGenerating(true);
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
		try {
			const result =
				format === "json"
					? await exportJson({
							projectId: convexProjectId,
							localeCode,
							selection,
						})
					: await exportArb({
							projectId: convexProjectId,
							localeCode,
							selection,
						});
			setContent(result.content ?? "");
			setGeneratedFileName(
				buildExportFileName({
					projectSlug: project?.slug ?? project?.name,
					localeCode,
					scope:
						selectionType === "all"
							? "all"
							: `${selectionType}-${selectionValue || "selection"}`,
					format,
				}),
			);
			toast.success("Export ready");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not generate export",
			);
		} finally {
			setIsGenerating(false);
		}
	}

	async function copyContent() {
		if (!content) return;
		try {
			await navigator.clipboard.writeText(content);
			toast.success("Copied to clipboard");
		} catch {
			toast.error("Could not copy the export. Select and copy it manually.");
		}
	}

	function downloadContent() {
		if (!content) return;
		downloadExportFile({
			content,
			fileName:
				generatedFileName ||
				buildExportFileName({
					projectSlug: project?.slug ?? project?.name,
					localeCode,
					scope: "export",
					format,
				}),
			format,
		});
	}

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title="Export"
				description="Export all or selected strings to JSON and Flutter ARB."
			/>
			<Card size="sm" className="max-w-3xl">
				<CardContent>
					<form onSubmit={submit}>
						<FieldGroup>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
								<Field>
									<FieldLabel htmlFor="export-format">Format</FieldLabel>
									<Select
										value={format}
										onValueChange={(value) => setFormat(value as ExportFormat)}
									>
										<SelectTrigger id="export-format" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="json">JSON</SelectItem>
												<SelectItem value="arb">Flutter ARB</SelectItem>
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
								<Field>
									<FieldLabel htmlFor="export-locale">Locale</FieldLabel>
									<Select
										value={localeCode}
										onValueChange={(value) => setLocaleCode(value ?? "")}
									>
										<SelectTrigger id="export-locale" className="w-full">
											<SelectValue placeholder="Choose locale" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{((locales ?? []) as LocaleOption[]).map((locale) => (
													<SelectItem key={locale._id} value={locale.code}>
														{locale.code}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
								<Field>
									<FieldLabel htmlFor="export-selection">Selection</FieldLabel>
									<Select
										value={selectionType}
										onValueChange={(value) =>
											setSelectionType(value as SelectionType)
										}
									>
										<SelectTrigger id="export-selection" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="all">All strings</SelectItem>
												<SelectItem value="keys">Specific keys</SelectItem>
												<SelectItem value="tag">By tag</SelectItem>
												<SelectItem value="screen">By screen</SelectItem>
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
								<Field>
									<FieldLabel htmlFor="export-value">Value</FieldLabel>
									<Input
										id="export-value"
										value={selectionValue}
										onChange={(event) => setSelectionValue(event.target.value)}
										disabled={selectionType === "all"}
										placeholder={
											selectionType === "keys"
												? "key1, key2"
												: selectionType === "tag"
													? "tag-slug"
													: selectionType === "screen"
														? "screen-slug"
														: ""
										}
									/>
								</Field>
							</div>
							<Button
								type="submit"
								disabled={
									!localeCode ||
									isGenerating ||
									(selectionType !== "all" && !selectionValue.trim())
								}
							>
								<Download data-icon="inline-start" />
								{isGenerating ? "Generating…" : "Generate export"}
							</Button>
							<Field>
								<div className="flex items-center justify-between">
									<FieldLabel htmlFor="export-content">Output</FieldLabel>
									{content ? (
										<div className="flex items-center gap-1">
											<Button
												size="xs"
												type="button"
												variant="ghost"
												onClick={copyContent}
											>
												<Copy data-icon="inline-start" />
												Copy
											</Button>
											<Button
												size="xs"
												type="button"
												variant="outline"
												onClick={downloadContent}
											>
												<Download data-icon="inline-start" />
												Download
											</Button>
										</div>
									) : null}
								</div>
								<Textarea
									id="export-content"
									className="min-h-80 font-mono"
									readOnly
									value={content}
									placeholder="Generated output will appear here…"
								/>
								<FieldDescription>
									Result is generated synchronously. Long exports may take a
									moment.
								</FieldDescription>
							</Field>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</ProjectShell>
	);
}
