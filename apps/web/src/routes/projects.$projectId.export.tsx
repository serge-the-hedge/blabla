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
import { useState } from "react";
import { toast } from "sonner";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { apiAny } from "@/lib/convex-api";
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
	const project = useQuery(apiAny.projects.get, { projectId });
	const locales = useQuery(apiAny.locales.list, { projectId });
	const exportJson = useMutation(apiAny.exports.startJsonExport);
	const exportArb = useMutation(apiAny.exports.startArbExport);
	const [format, setFormat] = useState<ExportFormat>("json");
	const [localeCode, setLocaleCode] = useState("");
	const [selectionType, setSelectionType] = useState<SelectionType>("all");
	const [selectionValue, setSelectionValue] = useState("");
	const [content, setContent] = useState("");
	const [generatedFileName, setGeneratedFileName] = useState("");

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
	}

	async function copyContent() {
		if (!content) return;
		await navigator.clipboard.writeText(content);
		toast.success("Copied to clipboard");
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
							<Button type="submit" disabled={!localeCode}>
								<Download data-icon="inline-start" />
								Generate export
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
									placeholder="Generated output will appear here."
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
