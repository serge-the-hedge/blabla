import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@blabla/ui/components/alert";
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
import { CircleCheck, TriangleAlert, Upload } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { api, convexId } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/import")({
	component: ImportRoute,
});

type ImportMode = "create_missing" | "upsert";

type ImportJob = {
	status: "queued" | "running" | "completed" | "failed";
	input: {
		localeCode: string;
		mode?: ImportMode;
	};
	result?: { imported: number } | { error: string };
};

function ImportResult({ job }: { job: ImportJob | undefined }) {
	if (!job) {
		return (
			<Alert className="mb-4 max-w-3xl">
				<Upload />
				<AlertTitle>Loading import status</AlertTitle>
				<AlertDescription>
					Waiting for the final import summary…
				</AlertDescription>
			</Alert>
		);
	}

	if (job.status === "queued" || job.status === "running") {
		return (
			<Alert className="mb-4 max-w-3xl">
				<Upload />
				<AlertTitle>Import in progress</AlertTitle>
				<AlertDescription>
					Keep this page open to see the final result.
				</AlertDescription>
			</Alert>
		);
	}

	if (job.status === "failed") {
		const message =
			job.result && "error" in job.result
				? job.result.error
				: "Review the payload and try again.";
		return (
			<Alert variant="destructive" className="mb-4 max-w-3xl">
				<TriangleAlert />
				<AlertTitle>Import failed</AlertTitle>
				<AlertDescription>{message}</AlertDescription>
			</Alert>
		);
	}

	const imported =
		job.result && "imported" in job.result ? job.result.imported : 0;
	const updatedExisting = job.input.mode === "upsert";
	return (
		<Alert className="mb-4 max-w-3xl">
			<CircleCheck />
			<AlertTitle>
				Imported {imported} {imported === 1 ? "value" : "values"} into{" "}
				{job.input.localeCode}
			</AlertTitle>
			<AlertDescription>
				{updatedExisting
					? "Matching values were updated. Values not included in the payload were unchanged."
					: "Existing values were skipped and left unchanged."}
			</AlertDescription>
		</Alert>
	);
}

function ImportRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId/import" });
	const convexProjectId = convexId<"projects">(projectId);
	const project = useQuery(api.projects.get, { projectId: convexProjectId });
	const locales = useQuery(api.locales.list, { projectId: convexProjectId });
	const importJson = useMutation(api.imports.startJsonImport);
	const importArb = useMutation(api.imports.startArbImport);
	const [format, setFormat] = useState<"json" | "arb">("json");
	const [mode, setMode] = useState<ImportMode>("create_missing");
	const [localeCode, setLocaleCode] = useState("");
	const [screenSlug, setScreenSlug] = useState("");
	const [tagSlugs, setTagSlugs] = useState("");
	const [content, setContent] = useState(
		'{\n  "checkout.payButton": "Pay now"\n}',
	);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [lastJobId, setLastJobId] = useState<string | null>(null);
	const [importError, setImportError] = useState<string | null>(null);
	const announcedJobIdRef = useRef<string | null>(null);
	const importJob = useQuery(
		api.imports.getJob,
		lastJobId ? { jobId: convexId<"importJobs">(lastJobId) } : "skip",
	) as ImportJob | undefined;

	useEffect(() => {
		if (!lastJobId || !importJob || announcedJobIdRef.current === lastJobId) {
			return;
		}
		if (importJob.status === "completed" && importJob.result) {
			announcedJobIdRef.current = lastJobId;
			const imported =
				"imported" in importJob.result ? importJob.result.imported : 0;
			toast.success(
				`Imported ${imported} ${imported === 1 ? "value" : "values"}`,
			);
		}
	}, [importJob, lastJobId]);

	async function submit(event: FormEvent) {
		event.preventDefault();
		setIsSubmitting(true);
		setImportError(null);
		setLastJobId(null);
		const args = {
			projectId: convexProjectId,
			localeCode,
			content,
			mode,
			screenSlug: screenSlug || undefined,
			tagSlugs: tagSlugs
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean),
		};
		try {
			const jobId =
				format === "json" ? await importJson(args) : await importArb(args);
			setLastJobId(jobId);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Check the payload and locale, then try again.";
			setImportError(message);
			toast.error("Import failed. Nothing was changed.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title="Import"
				description="Bring JSON and Flutter ARB strings into this project with explicit overwrite rules."
			/>
			{importError ? (
				<Alert variant="destructive" className="mb-4 max-w-3xl">
					<TriangleAlert />
					<AlertTitle>Import failed — nothing changed</AlertTitle>
					<AlertDescription className="break-words">
						{importError} Fix the issue above, then try the import again.
					</AlertDescription>
				</Alert>
			) : lastJobId ? (
				<ImportResult job={importJob} />
			) : null}
			<Card size="sm" className="max-w-3xl">
				<CardContent>
					<form onSubmit={submit}>
						<FieldGroup>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
								<Field>
									<FieldLabel htmlFor="import-format">Format</FieldLabel>
									<Select
										value={format}
										onValueChange={(value) =>
											setFormat(value as "json" | "arb")
										}
									>
										<SelectTrigger id="import-format" className="w-full">
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
									<FieldLabel htmlFor="import-locale">Locale</FieldLabel>
									<Select
										value={localeCode}
										onValueChange={(value) => setLocaleCode(value ?? "")}
									>
										<SelectTrigger id="import-locale" className="w-full">
											<SelectValue placeholder="Choose locale" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{(locales ?? []).map((locale) => (
													<SelectItem key={locale._id} value={locale.code}>
														{locale.code}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
								<Field>
									<FieldLabel htmlFor="import-mode">Import behavior</FieldLabel>
									<Select
										value={mode}
										onValueChange={(value) => setMode(value as ImportMode)}
									>
										<SelectTrigger id="import-mode" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="create_missing">
													Add missing only
												</SelectItem>
												<SelectItem value="upsert">
													Update existing values
												</SelectItem>
											</SelectGroup>
										</SelectContent>
									</Select>
									<FieldDescription>
										{mode === "create_missing"
											? "Safe default. Existing locale values are skipped."
											: "Replaces existing values for keys in this payload."}
									</FieldDescription>
								</Field>
								<Field>
									<FieldLabel htmlFor="import-screen">Screen slug</FieldLabel>
									<Input
										id="import-screen"
										name="screenSlug"
										autoComplete="off"
										value={screenSlug}
										onChange={(event) => setScreenSlug(event.target.value)}
										placeholder="Optional screen slug…"
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="import-tags">Tags</FieldLabel>
									<Input
										id="import-tags"
										name="tagSlugs"
										autoComplete="off"
										value={tagSlugs}
										onChange={(event) => setTagSlugs(event.target.value)}
										placeholder="checkout, legal…"
									/>
								</Field>
							</div>
							{mode === "upsert" ? (
								<Alert variant="destructive">
									<TriangleAlert />
									<AlertTitle>Existing values can be overwritten</AlertTitle>
									<AlertDescription>
										Every matching key in {localeCode || "the selected locale"}
										will be updated to the payload value. The import is atomic:
										either all valid values are written or none are.
									</AlertDescription>
								</Alert>
							) : null}
							<Field>
								<FieldLabel htmlFor="import-content">Payload</FieldLabel>
								<Textarea
									id="import-content"
									name="content"
									className="min-h-80 font-mono"
									value={content}
									onChange={(event) => setContent(event.target.value)}
									spellCheck={false}
								/>
								<FieldDescription>
									Paste a JSON object of <code>key → value</code> pairs, or a
									Flutter ARB document. The file is validated before anything
									changes.
								</FieldDescription>
							</Field>
							<Button type="submit" disabled={!localeCode || isSubmitting}>
								<Upload data-icon="inline-start" />
								{isSubmitting
									? "Importing…"
									: mode === "upsert"
										? "Import & update existing"
										: "Import missing values"}
							</Button>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</ProjectShell>
	);
}
