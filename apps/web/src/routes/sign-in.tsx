import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { useEffect } from "react";

import { safeAuthRedirect } from "@/components/auth-redirect";
import Loader from "@/components/loader";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

type AuthMode = "sign-in" | "sign-up";

export const Route = createFileRoute("/sign-in")({
	validateSearch: (search: Record<string, unknown>) => ({
		mode: (search.mode === "sign-up" ? "sign-up" : "sign-in") as AuthMode,
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	}),
	component: SignInRoute,
});

function SignedInRedirect({ redirectTo }: { redirectTo: string }) {
	const navigate = useNavigate();

	useEffect(() => {
		void navigate({ href: redirectTo, replace: true });
	}, [navigate, redirectTo]);

	return <Loader />;
}

function SignInRoute() {
	const search = Route.useSearch();
	const redirectTo = safeAuthRedirect(search.redirect);

	return (
		<>
			<Authenticated>
				<SignedInRedirect redirectTo={redirectTo} />
			</Authenticated>
			<Unauthenticated>
				{search.mode === "sign-up" ? (
					<SignUpForm redirectTo={redirectTo} />
				) : (
					<SignInForm redirectTo={redirectTo} />
				)}
			</Unauthenticated>
			<AuthLoading>
				<Loader />
			</AuthLoading>
		</>
	);
}
