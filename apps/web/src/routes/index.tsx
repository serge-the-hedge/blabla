import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@blabla/ui/components/card";
import { cn } from "@blabla/ui/lib/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
	ArrowRight,
	FileJson,
	GitPullRequestArrow,
	KeyRound,
	Languages,
	MessageSquareText,
	Tags,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	type AuthEndpointCheck,
	checkAuthEndpoint,
	getConnectionDiagnostics,
} from "@/lib/connection-diagnostics";
import { api } from "@/lib/convex-api";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

const featureItems = [
	{
		icon: MessageSquareText,
		title: "Project-scoped strings",
		description:
			"Browse, filter, and edit copy across screens, tags, and locales without leaving the page.",
	},
	{
		icon: GitPullRequestArrow,
		title: "Reviewable agent edits",
		description:
			"Agents propose changes as patch sets. Inspect diffs, accept or reject per field, then apply.",
	},
	{
		icon: FileJson,
		title: "JSON & Flutter ARB",
		description:
			"Bootstrap from existing locale files or export selected slices for any release branch.",
	},
	{
		icon: Languages,
		title: "Locales & screens",
		description:
			"Define your target locales and group strings by screen for tight, scoped translation work.",
	},
	{
		icon: Tags,
		title: "Tags for slicing",
		description:
			"Tag once, filter and export forever. Batch-tag visible strings in a single action.",
	},
	{
		icon: KeyRound,
		title: "Scoped API tokens",
		description:
			"Hand agents and integrations read, search, propose, and export scopes — no broader access.",
	},
] as const;

function StatusPill({ status }: { status: "ok" | "loading" | "error" }) {
	const label =
		status === "ok"
			? "Connected"
			: status === "loading"
				? "Connecting…"
				: "Offline";
	const dot =
		status === "ok"
			? "bg-success"
			: status === "loading"
				? "bg-warning animate-pulse"
				: "bg-destructive";
	return (
		<span className="inline-flex items-center gap-2 rounded-full border bg-background/60 px-2.5 py-1 text-muted-foreground text-xs">
			<span className={cn("size-2 rounded-full", dot)} aria-hidden />
			{label}
		</span>
	);
}

function HomeComponent() {
	const healthCheck = useQuery(api.healthCheck.get);
	const [timedOut, setTimedOut] = useState(false);
	const [authCheck, setAuthCheck] = useState<AuthEndpointCheck | null>(null);
	const status: "ok" | "loading" | "error" =
		healthCheck === "OK"
			? "ok"
			: healthCheck === undefined && !timedOut
				? "loading"
				: "error";
	const diagnostics = getConnectionDiagnostics();

	useEffect(() => {
		if (healthCheck !== undefined) {
			setTimedOut(false);
			return;
		}
		const timeout = window.setTimeout(() => setTimedOut(true), 5000);
		return () => window.clearTimeout(timeout);
	}, [healthCheck]);

	useEffect(() => {
		if (!timedOut || authCheck) {
			return;
		}
		void checkAuthEndpoint().then(setAuthCheck);
	}, [timedOut, authCheck]);

	return (
		<div className="h-full overflow-auto">
			<div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
				<section className="flex flex-col gap-6">
					<div className="flex items-center gap-2">
						<Badge variant="outline" className="border-brand/40 text-brand">
							Localization workspace
						</Badge>
						<StatusPill status={status} />
					</div>
					<div className="flex flex-col gap-3">
						<h1 className="font-semibold text-3xl tracking-tight md:text-4xl">
							Translate together. Ship with confidence.
						</h1>
						<p className="max-w-2xl text-muted-foreground text-sm md:text-base">
							blabla is a focused workspace for product strings — humans and
							agents edit side by side, and every change goes through a clean
							review queue.
						</p>
					</div>
					{status === "error" ? (
						<div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-xs">
							<div className="font-medium">
								Backend connection is not ready.
							</div>
							{import.meta.env.DEV ? (
								<dl className="mt-2 grid gap-1 text-muted-foreground">
									<div className="grid gap-1 sm:grid-cols-[140px_1fr]">
										<dt>App origin</dt>
										<dd className="break-all font-mono">
											{diagnostics.origin}
										</dd>
									</div>
									<div className="grid gap-1 sm:grid-cols-[140px_1fr]">
										<dt>Convex URL</dt>
										<dd className="break-all font-mono">
											{diagnostics.convexUrl}
										</dd>
									</div>
									<div className="grid gap-1 sm:grid-cols-[140px_1fr]">
										<dt>Auth URL</dt>
										<dd className="break-all font-mono">
											{diagnostics.convexSiteUrl}
										</dd>
									</div>
									<div className="grid gap-1 sm:grid-cols-[140px_1fr]">
										<dt>Auth check</dt>
										<dd className="break-all font-mono">
											{authCheck
												? authCheck.ok
													? "OK"
													: (authCheck.message ?? "Failed")
												: "Checking…"}
										</dd>
									</div>
								</dl>
							) : null}
						</div>
					) : null}
					<div className="flex flex-wrap gap-2">
						<Link to="/projects">
							<Button>
								Open projects
								<ArrowRight data-icon="inline-end" />
							</Button>
						</Link>
						<Link to="/projects/new">
							<Button variant="outline">New project</Button>
						</Link>
					</div>
				</section>

				<section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{featureItems.map(({ icon: Icon, title, description }) => (
						<Card key={title} size="sm">
							<CardHeader>
								<span
									aria-hidden
									className="inline-flex size-7 items-center justify-center rounded-md bg-muted text-foreground"
								>
									<Icon className="size-4" />
								</span>
								<CardTitle className="mt-2">{title}</CardTitle>
								<CardDescription>{description}</CardDescription>
							</CardHeader>
						</Card>
					))}
				</section>
			</div>
		</div>
	);
}
