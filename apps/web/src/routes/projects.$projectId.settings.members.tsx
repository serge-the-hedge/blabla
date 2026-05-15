import { Button } from "@blabla/ui/components/button";
import { Input } from "@blabla/ui/components/input";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { apiAny } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/settings/members")({
	component: MembersRoute,
});

function MembersRoute() {
	const { projectId } = useParams({
		from: "/projects/$projectId/settings/members",
	});
	const project = useQuery(apiAny.projects.get, { projectId });
	const members = useQuery(apiAny.projects.listMembers, { projectId });
	const addMember = useMutation(apiAny.projects.addMember);
	const updateRole = useMutation(apiAny.projects.updateMemberRole);
	const removeMember = useMutation(apiAny.projects.removeMember);
	const [userId, setUserId] = useState("");
	const [role, setRole] = useState<"owner" | "editor" | "viewer">("viewer");

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		await addMember({ projectId, userId, role });
		setUserId("");
	}

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title="Members"
				description="Simple owner, editor, and viewer access."
			/>
			<form
				onSubmit={submit}
				className="mb-4 grid grid-cols-[1fr_160px_auto] gap-2 border p-3"
			>
				<Input
					value={userId}
					onChange={(event) => setUserId(event.target.value)}
					placeholder="Better Auth user id"
				/>
				<select
					className="h-8 border bg-background px-2 text-xs"
					value={role}
					onChange={(event) => setRole(event.target.value as any)}
				>
					<option value="viewer">Viewer</option>
					<option value="editor">Editor</option>
					<option value="owner">Owner</option>
				</select>
				<Button type="submit">Add</Button>
			</form>
			<div className="divide-y border">
				{(members ?? []).map((member: any) => (
					<div
						key={member._id}
						className="grid grid-cols-[1fr_140px_auto] items-center gap-2 p-3 text-sm"
					>
						<div className="font-mono text-xs">{member.userId}</div>
						<select
							className="h-8 border bg-background px-2 text-xs"
							value={member.role}
							onChange={(event) =>
								updateRole({ memberId: member._id, role: event.target.value })
							}
						>
							<option value="viewer">Viewer</option>
							<option value="editor">Editor</option>
							<option value="owner">Owner</option>
						</select>
						<Button
							size="sm"
							variant="outline"
							onClick={() => removeMember({ memberId: member._id })}
						>
							Remove
						</Button>
					</div>
				))}
			</div>
		</ProjectShell>
	);
}
