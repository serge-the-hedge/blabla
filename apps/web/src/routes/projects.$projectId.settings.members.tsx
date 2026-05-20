import { Badge } from "@blabla/ui/components/badge";
import { Button } from "@blabla/ui/components/button";
import { Card, CardContent } from "@blabla/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@blabla/ui/components/empty";
import { Field, FieldGroup, FieldLabel } from "@blabla/ui/components/field";
import { Input } from "@blabla/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@blabla/ui/components/select";
import { Skeleton } from "@blabla/ui/components/skeleton";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { UserPlus, Users } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import {
	PageHeader,
	ProjectShell,
} from "@/components/localization/project-shell";
import { api, convexId } from "@/lib/convex-api";

export const Route = createFileRoute("/projects/$projectId/settings/members")({
	component: MembersRoute,
});

const ROLE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
	owner: "default",
	editor: "secondary",
	viewer: "outline",
};

type Role = "owner" | "editor" | "viewer";

function MembersRoute() {
	const { projectId } = useParams({
		from: "/projects/$projectId/settings/members",
	});
	const convexProjectId = convexId<"projects">(projectId);
	const project = useQuery(api.projects.get, { projectId: convexProjectId });
	const members = useQuery(api.projects.listMembers, {
		projectId: convexProjectId,
	});
	const addMember = useMutation(api.projects.addMember);
	const updateRole = useMutation(api.projects.updateMemberRole);
	const removeMember = useMutation(api.projects.removeMember);
	const [userId, setUserId] = useState("");
	const [role, setRole] = useState<Role>("viewer");

	async function submit(event: FormEvent) {
		event.preventDefault();
		await addMember({ projectId: convexProjectId, userId, role });
		setUserId("");
	}

	return (
		<ProjectShell projectId={projectId} title={project?.name ?? "Project"}>
			<PageHeader
				title="Members"
				description="Simple owner, editor, and viewer access."
			/>
			<div className="flex flex-col gap-4">
				<Card size="sm">
					<CardContent>
						<form onSubmit={submit}>
							<FieldGroup className="grid grid-cols-[1fr_160px_auto] items-end gap-3">
								<Field>
									<FieldLabel htmlFor="member-id">User ID</FieldLabel>
									<Input
										id="member-id"
										value={userId}
										onChange={(event) => setUserId(event.target.value)}
										placeholder="Better Auth user id"
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="member-role">Role</FieldLabel>
									<Select
										value={role}
										onValueChange={(value) => setRole(value as Role)}
									>
										<SelectTrigger id="member-role" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="viewer">Viewer</SelectItem>
												<SelectItem value="editor">Editor</SelectItem>
												<SelectItem value="owner">Owner</SelectItem>
											</SelectGroup>
										</SelectContent>
									</Select>
								</Field>
								<Button type="submit" disabled={!userId.trim()}>
									<UserPlus data-icon="inline-start" />
									Add
								</Button>
							</FieldGroup>
						</form>
					</CardContent>
				</Card>

				{members === undefined ? (
					<Skeleton className="h-32 w-full" />
				) : members.length === 0 ? (
					<Empty className="border">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Users />
							</EmptyMedia>
							<EmptyTitle>No members yet</EmptyTitle>
							<EmptyDescription>
								Invite teammates by their Better Auth user id.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<Card size="sm">
						<CardContent className="divide-y">
							{members.map((member: any) => (
								<div
									key={member._id}
									className="grid grid-cols-[1fr_140px_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
								>
									<div className="min-w-0 truncate font-mono text-xs">
										{member.userId}
									</div>
									<div className="flex items-center gap-2">
										<Badge
											variant={ROLE_VARIANT[member.role] ?? "outline"}
											className="capitalize"
										>
											{member.role}
										</Badge>
										<Select
											value={member.role}
											onValueChange={(value) =>
												updateRole({ memberId: member._id, role: value })
											}
										>
											<SelectTrigger size="sm" className="w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													<SelectItem value="viewer">Viewer</SelectItem>
													<SelectItem value="editor">Editor</SelectItem>
													<SelectItem value="owner">Owner</SelectItem>
												</SelectGroup>
											</SelectContent>
										</Select>
									</div>
									<Button
										size="sm"
										variant="outline"
										onClick={() => removeMember({ memberId: member._id })}
									>
										Remove
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
