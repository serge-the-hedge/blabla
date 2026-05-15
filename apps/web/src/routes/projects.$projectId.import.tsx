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
import { Upload } from "lucide-react";
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
			<Card size="sm" className="max-w-3xl">
				<CardContent>
					<form onSubmit={submit}>
						<FieldGroup>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
												{(locales ?? []).map((locale: any) => (
													<SelectItem key={locale._id} value={locale.code}>
														{locale.code}
													</SelectItem>
												))}
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
								<Field>
									<FieldLabel htmlFor="import-screen">Screen slug</FieldLabel>
									<Input
										id="import-screen"
										value={screenSlug}
										onChange={(event) => setScreenSlug(event.target.value)}
										placeholder="(optional)"
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="import-tags">Tags</FieldLabel>
									<Input
										id="import-tags"
										value={tagSlugs}
										onChange={(event) => setTagSlugs(event.target.value)}
										placeholder="checkout, legal"
									/>
								</Field>
							</div>
							<Field>
								<FieldLabel htmlFor="import-content">Payload</FieldLabel>
								<Textarea
									id="import-content"
									className="min-h-80 font-mono"
									value={content}
									onChange={(event) => setContent(event.target.value)}
									spellCheck={false}
								/>
								<FieldDescription>
									Paste a JSON object of <code>key → value</code> pairs, or a
									Flutter ARB document.
								</FieldDescription>
							</Field>
							<Button type="submit" disabled={!localeCode}>
								<Upload data-icon="inline-start" />
								Queue import
							</Button>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</ProjectShell>
	);
}
