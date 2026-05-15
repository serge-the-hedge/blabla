import { Button } from "@blabla/ui/components/button";
import { Checkbox } from "@blabla/ui/components/checkbox";
import { Input } from "@blabla/ui/components/input";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { apiAny } from "@/lib/convex-api";

const scopes = ["read", "search", "propose", "export"] as const;

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
		const result = await createToken({
			projectId,
			name,
			scopes: selectedScopes,
		});
		setRawToken(result.token);
		setName("");
	}

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title="API tokens"
				description="Project-scoped credentials for external agents."
			/>
			<form onSubmit={submit} className="mb-4 flex flex-col gap-3 border p-3">
				<Input
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="Agent token name"
				/>
				<div className="flex gap-4">
					{scopes.map((scope) => (
						<div key={scope} className="flex items-center gap-2 text-xs">
							<Checkbox
								checked={selectedScopes.includes(scope)}
								onCheckedChange={(checked) =>
									setSelectedScopes((current) =>
										checked
											? [...current, scope]
											: current.filter((item) => item !== scope),
									)
								}
							/>
							{scope}
						</div>
					))}
				</div>
				<Button type="submit">Create token</Button>
				{rawToken ? (
					<pre className="overflow-auto border bg-muted/30 p-3 text-xs">
						{rawToken}
					</pre>
				) : null}
			</form>
			<div className="divide-y border">
				{(tokens ?? []).map((token: any) => (
					<div
						key={token._id}
						className="flex items-center justify-between p-3 text-sm"
					>
						<div>
							<div className="font-medium">{token.name}</div>
							<div className="text-muted-foreground text-xs">
								{token.scopes.join(", ")}
							</div>
						</div>
						<Button
							size="sm"
							variant="outline"
							onClick={() => revoke({ tokenId: token._id })}
						>
							Revoke
						</Button>
					</div>
				))}
			</div>
		</ProjectShell>
	);
}
