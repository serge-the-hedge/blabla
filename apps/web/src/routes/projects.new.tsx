import { Button } from "@blabla/ui/components/button";
import { Input } from "@blabla/ui/components/input";
import { Label } from "@blabla/ui/components/label";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { apiAny } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/new")({
	component: NewProjectRoute,
});

function NewProjectRoute() {
	const navigate = useNavigate();
	const createProject = useMutation(apiAny.projects.create);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [sourceLocaleCode, setSourceLocaleCode] = useState("en");
	const [sourceLocaleLabel, setSourceLocaleLabel] = useState("English");

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		const projectId = await createProject({
			name,
			slug,
			sourceLocaleCode,
			sourceLocaleLabel,
		});
		toast.success("Project created");
		await navigate({
			to: "/projects/$projectId/strings",
			params: { projectId },
		});
	}

	return (
		<div className="mx-auto max-w-xl p-5">
			<h1 className="font-medium text-2xl">New project</h1>
			<form onSubmit={submit} className="mt-6 flex flex-col gap-4">
				<div className="flex flex-col gap-2">
					<Label>Name</Label>
					<Input
						value={name}
						onChange={(event) => setName(event.target.value)}
						required
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label>Slug</Label>
					<Input
						value={slug}
						onChange={(event) => setSlug(event.target.value)}
						placeholder="mobile-app"
					/>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<div className="flex flex-col gap-2">
						<Label>Source locale</Label>
						<Input
							value={sourceLocaleCode}
							onChange={(event) => setSourceLocaleCode(event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label>Locale label</Label>
						<Input
							value={sourceLocaleLabel}
							onChange={(event) => setSourceLocaleLabel(event.target.value)}
						/>
					</div>
				</div>
				<div className="flex gap-2">
					<Button type="submit">Create</Button>
					<Link to="/projects">
						<Button type="button" variant="outline">
							Cancel
						</Button>
					</Link>
				</div>
			</form>
		</div>
	);
}
