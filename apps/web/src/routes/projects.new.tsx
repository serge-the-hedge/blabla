import { Button } from "@blabla/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@blabla/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@blabla/ui/components/field";
import { Input } from "@blabla/ui/components/input";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { apiAny } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/new")({
	component: NewProjectRoute,
});

function slugify(value: string) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function NewProjectRoute() {
	const navigate = useNavigate();
	const createProject = useMutation(apiAny.projects.create);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugTouched, setSlugTouched] = useState(false);
	const [sourceLocaleCode, setSourceLocaleCode] = useState("en");
	const [sourceLocaleLabel, setSourceLocaleLabel] = useState("English");

	function handleNameChange(value: string) {
		setName(value);
		if (!slugTouched) setSlug(slugify(value));
	}

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		const projectId = await createProject({
			name,
			slug: slug || slugify(name),
			sourceLocaleCode,
			sourceLocaleLabel,
		});
		toast.success("Project created");
		await navigate({
			to: "/projects/$projectId/strings",
			params: { projectId },
			search: { tag: undefined },
		});
	}

	return (
		<div className="mx-auto h-full max-w-xl overflow-auto px-6 py-10">
			<div className="mb-6 flex flex-col gap-2">
				<Link
					to="/projects"
					className="inline-flex w-fit items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
				>
					<ArrowLeft className="size-3" />
					Back to projects
				</Link>
				<h1 className="font-semibold text-2xl tracking-tight">New project</h1>
				<p className="text-muted-foreground text-sm">
					Pick a name, slug, and source locale to get started.
				</p>
			</div>
			<Card>
				<CardHeader className="sr-only">
					<CardTitle>Project details</CardTitle>
					<CardDescription>Initial project configuration</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={submit}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="project-name">Name</FieldLabel>
								<Input
									id="project-name"
									value={name}
									onChange={(event) => handleNameChange(event.target.value)}
									required
									placeholder="Mobile App"
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="project-slug">Slug</FieldLabel>
								<Input
									id="project-slug"
									value={slug}
									onChange={(event) => {
										setSlug(event.target.value);
										setSlugTouched(true);
									}}
									placeholder="mobile-app"
								/>
								<FieldDescription>
									Used in URLs and the API. We'll slugify your name by default.
								</FieldDescription>
							</Field>
							<div className="grid grid-cols-2 gap-3">
								<Field>
									<FieldLabel htmlFor="project-locale-code">
										Source locale
									</FieldLabel>
									<Input
										id="project-locale-code"
										value={sourceLocaleCode}
										onChange={(event) =>
											setSourceLocaleCode(event.target.value)
										}
										placeholder="en"
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="project-locale-label">
										Locale label
									</FieldLabel>
									<Input
										id="project-locale-label"
										value={sourceLocaleLabel}
										onChange={(event) =>
											setSourceLocaleLabel(event.target.value)
										}
										placeholder="English"
									/>
								</Field>
							</div>
							<div className="flex gap-2">
								<Button type="submit" disabled={!name.trim()}>
									Create project
								</Button>
								<Link to="/projects">
									<Button type="button" variant="outline">
										Cancel
									</Button>
								</Link>
							</div>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
