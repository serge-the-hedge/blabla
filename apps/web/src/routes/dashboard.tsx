import { api } from "@blabla/backend/convex/_generated/api";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@blabla/ui/components/card";
import { Skeleton } from "@blabla/ui/components/skeleton";
import { createFileRoute } from "@tanstack/react-router";
import {
	Authenticated,
	AuthLoading,
	Unauthenticated,
	useQuery,
} from "convex/react";
import { useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export const Route = createFileRoute("/dashboard")({
	component: RouteComponent,
});

function PrivateDashboardContent() {
	const user = useQuery(api.auth.getCurrentUser);
	const privateData = useQuery(api.privateData.get);

	return (
		<div className="mx-auto flex h-full max-w-3xl flex-col gap-6 overflow-auto px-6 py-8">
			<div className="flex flex-col gap-1">
				<h1 className="font-semibold text-2xl tracking-tight">Account</h1>
				<p className="text-muted-foreground text-sm">
					Your profile and workspace data.
				</p>
			</div>
			<div className="grid gap-3 md:grid-cols-2">
				<Card size="sm">
					<CardHeader>
						<CardTitle>Profile</CardTitle>
						<CardDescription>Signed in via Better Auth.</CardDescription>
					</CardHeader>
					<CardContent>
						{user === undefined ? (
							<Skeleton className="h-12 w-full" />
						) : (
							<dl className="grid grid-cols-[80px_1fr] gap-y-2 text-xs">
								<dt className="text-muted-foreground">Name</dt>
								<dd>{user?.name ?? "—"}</dd>
								<dt className="text-muted-foreground">Email</dt>
								<dd className="truncate font-mono">{user?.email}</dd>
							</dl>
						)}
					</CardContent>
				</Card>
				<Card size="sm">
					<CardHeader>
						<CardTitle>Private data</CardTitle>
						<CardDescription>A simple ping from the backend.</CardDescription>
					</CardHeader>
					<CardContent>
						{privateData === undefined ? (
							<Skeleton className="h-6 w-2/3" />
						) : (
							<p className="text-xs">{privateData?.message}</p>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function RouteComponent() {
	const [showSignIn, setShowSignIn] = useState(false);

	return (
		<>
			<Authenticated>
				<PrivateDashboardContent />
			</Authenticated>
			<Unauthenticated>
				{showSignIn ? (
					<SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
				) : (
					<SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
				)}
			</Unauthenticated>
			<AuthLoading>
				<div className="mx-auto flex max-w-3xl flex-col gap-3 px-6 py-8">
					<Skeleton className="h-7 w-40" />
					<Skeleton className="h-32 w-full" />
				</div>
			</AuthLoading>
		</>
	);
}
