import { env } from "@blabla/env/web";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@blabla/ui/components/alert";
import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@blabla/ui/components/card";
import { Checkbox } from "@blabla/ui/components/checkbox";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@blabla/ui/components/empty";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@blabla/ui/components/field";
import { Input } from "@blabla/ui/components/input";
import { Skeleton } from "@blabla/ui/components/skeleton";
import { cn } from "@blabla/ui/lib/utils";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Copy, KeyRound, Plus, ShieldCheck, Terminal, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { apiAny } from "@/lib/convex-api";

const scopes = ["read", "search", "propose", "export"] as const;
type TokenScope = (typeof scopes)[number];
type ApiToken = {
	_id: string;
	name: string;
	scopes: TokenScope[];
};

export const Route = createFileRoute(
	"/projects/$projectId/settings/api-tokens",
)({
	component: ApiTokensRoute,
});

function ApiTokensRoute() {
	const { projectId } = useParams({
		from: "/projects/$projectId/settings/api-tokens",
	});
	const project = useQuery(apiAny.projects.get, { projectId });
	const tokens = useQuery(apiAny.apiTokens.list, { projectId });
	const createToken = useMutation(apiAny.apiTokens.create);
	const revoke = useMutation(apiAny.apiTokens.revoke);
	const [name, setName] = useState("");
	const [selectedScopes, setSelectedScopes] = useState<string[]>([
		"read",
		"search",
		"propose",
	]);
	const [rawToken, setRawToken] = useState("");

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		try {
			const result = await createToken({
				projectId,
				name,
				scopes: selectedScopes,
			});
			setRawToken(result.token);
			setName("");
			toast.success("Token created — copy it now");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not create token",
			);
		}
	}

	async function copyToken() {
		if (!rawToken) return;
		await navigator.clipboard.writeText(rawToken);
		toast.success("Token copied to clipboard");
	}

	function closeToken() {
		setRawToken("");
	}

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title="API tokens"
				description="Project-scoped credentials for external agents."
			/>
			<div className="flex flex-col gap-4">
				<Card size="sm">
					<CardHeader>
						<CardTitle>Create token</CardTitle>
						<CardDescription>
							Use read, search, and propose for translation agents. Add export
							only for release automation.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={submit}>
							<FieldGroup>
								<Field>
									<FieldLabel htmlFor="token-name">Name</FieldLabel>
									<Input
										id="token-name"
										value={name}
										onChange={(event) => setName(event.target.value)}
										placeholder="agent-ci, translator-bot…"
									/>
								</Field>
								<Field>
									<FieldLabel>Scopes</FieldLabel>
									<div className="flex flex-wrap gap-3 rounded-md border bg-muted/30 p-3">
										{scopes.map((scope) => {
											const id = `scope-${scope}`;
											const checked = selectedScopes.includes(scope);
											return (
												<label
													key={scope}
													htmlFor={id}
													className={cn(
														"flex cursor-pointer items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs transition-colors",
														checked
															? "border-brand/40 bg-brand/5 text-foreground"
															: "border-input text-muted-foreground hover:text-foreground",
													)}
												>
													<Checkbox
														id={id}
														checked={checked}
														onCheckedChange={(value) =>
															setSelectedScopes((current) =>
																value
																	? [...current, scope]
																	: current.filter((item) => item !== scope),
															)
														}
													/>
													<span className="capitalize">{scope}</span>
												</label>
											);
										})}
									</div>
									<FieldDescription>
										Pick the minimum scopes the integration needs.
									</FieldDescription>
								</Field>
								<Button
									type="submit"
									disabled={!name.trim() || selectedScopes.length === 0}
								>
									<Plus data-icon="inline-start" />
									Create token
								</Button>
								{rawToken ? (
									<div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
										<div className="flex items-center justify-between gap-2">
											<span className="font-medium">
												Copy this token now — it won't be shown again.
											</span>
											<div className="flex items-center gap-1">
												<Button
													type="button"
													size="xs"
													variant="ghost"
													onClick={copyToken}
												>
													<Copy data-icon="inline-start" />
													Copy
												</Button>
												<Button
													type="button"
													size="xs"
													variant="ghost"
													onClick={closeToken}
													aria-label="Close token"
												>
													<X data-icon="inline-start" />
													Close
												</Button>
											</div>
										</div>
										<pre className="overflow-x-auto rounded-md bg-background p-2 font-mono text-[11px]">
											{rawToken}
										</pre>
									</div>
								) : null}
							</FieldGroup>
						</form>
					</CardContent>
				</Card>

				<Card size="sm">
					<CardHeader>
						<CardTitle>Agent handoff</CardTitle>
						<CardDescription>
							Give agents these stable details with the token value.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<div className="grid gap-2 text-xs md:grid-cols-2">
							<div className="rounded-md border bg-muted/30 p-3">
								<div className="mb-1 flex items-center gap-1.5 font-medium">
									<Terminal className="size-3.5" />
									Base URL
								</div>
								<code className="break-all text-muted-foreground">
									{env.VITE_CONVEX_SITE_URL}/api/agent/v1
								</code>
							</div>
							<div className="rounded-md border bg-muted/30 p-3">
								<div className="mb-1 flex items-center gap-1.5 font-medium">
									<ShieldCheck className="size-3.5" />
									Header
								</div>
								<code className="break-all text-muted-foreground">
									Authorization: Bearer {"<project_api_token>"}
								</code>
							</div>
						</div>
						<Alert>
							<KeyRound className="size-4" />
							<AlertTitle>Reviewable changes only</AlertTitle>
							<AlertDescription>
								Agent submissions create open reviews. A human still approves
								and applies them from the Reviews section.
							</AlertDescription>
						</Alert>
					</CardContent>
				</Card>

				{tokens === undefined ? (
					<Skeleton className="h-32 w-full" />
				) : tokens.length === 0 ? (
					<Empty className="border">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<KeyRound />
							</EmptyMedia>
							<EmptyTitle>No tokens yet</EmptyTitle>
							<EmptyDescription>
								Create a scoped token to give external agents read or write
								access.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<Card size="sm">
						<CardContent className="divide-y">
							{(tokens as ApiToken[]).map((token) => (
								<div
									key={token._id}
									className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
								>
									<div className="flex min-w-0 flex-col gap-1">
										<span className="truncate font-medium text-sm">
											{token.name}
										</span>
										<div className="flex flex-wrap gap-1">
											{token.scopes.map((scope: string) => (
												<Badge
													key={scope}
													variant="outline"
													className="font-normal capitalize"
												>
													{scope}
												</Badge>
											))}
										</div>
									</div>
									<Button
										size="sm"
										variant="outline"
										onClick={async () => {
											try {
												await revoke({ tokenId: token._id });
												toast.success("Token revoked");
											} catch (error) {
												toast.error(
													error instanceof Error
														? error.message
														: "Could not revoke token",
												);
											}
										}}
									>
										Revoke
									</Button>
								</div>
							))}
						</CardContent>
					</Card>
				)}
			</div>
		</ProjectShell>
	);
}
