import { Button } from "@blabla/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@blabla/ui/components/card";
import {
	createFileRoute,
	Link,
	Outlet,
	useRouterState,
} from "@tanstack/react-router";
import {
	Authenticated,
	AuthLoading,
	Unauthenticated,
	useQuery,
} from "convex/react";

import SignInForm from "@/components/sign-in-form";
import { apiAny } from "@/lib/convex-api";

export const Route = createFileRoute("/projects")({
	component: ProjectsRoute,
});

function ProjectsContent() {
	const projects = useQuery(apiAny.projects.listMine);

	return (
		<div className="mx-auto flex max-w-5xl flex-col gap-5 p-5">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h1 className="font-medium text-2xl">Projects</h1>
					<p className="text-muted-foreground text-sm">
						Localization workspaces and review queues.
					</p>
				</div>
				<Link to="/projects/new">
					<Button>New project</Button>
				</Link>
			</div>
			<div className="grid gap-3 md:grid-cols-2">
				{projects === undefined ? (
					<p className="text-muted-foreground text-sm">Loading projects...</p>
				) : projects.length === 0 ? (
					<Card>
						<CardHeader>
							<CardTitle>No projects yet</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground text-sm">
								Create a project to start managing strings.
							</p>
						</CardContent>
					</Card>
				) : (
					projects.map((project: any) => (
						<Link
							key={project._id}
							to="/projects/$projectId/strings"
							params={{ projectId: project._id }}
						>
							<Card className="transition-colors hover:bg-muted/40">
								<CardHeader>
									<CardTitle>{project.name}</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="flex items-center justify-between text-muted-foreground text-xs">
										<span>{project.slug}</span>
										<span>{project.role}</span>
									</div>
								</CardContent>
							</Card>
						</Link>
					))
				)}
			</div>
		</div>
	);
}

function ProjectsRoute() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	return (
		<>
			<Authenticated>
				{pathname === "/projects" ? <ProjectsContent /> : <Outlet />}
			</Authenticated>
			<Unauthenticated>
				<SignInForm onSwitchToSignUp={() => undefined} />
			</Unauthenticated>
			<AuthLoading>
				<div className="p-6 text-muted-foreground text-sm">Loading...</div>
			</AuthLoading>
		</>
	);
}
