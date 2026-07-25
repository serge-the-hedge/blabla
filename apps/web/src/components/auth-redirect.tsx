import { Navigate, useRouterState } from "@tanstack/react-router";

export const DEFAULT_AUTH_REDIRECT = "/projects";

export function safeAuthRedirect(redirect: string | undefined) {
	if (
		!redirect ||
		!redirect.startsWith("/") ||
		redirect.startsWith("//") ||
		redirect.startsWith("/sign-in")
	) {
		return DEFAULT_AUTH_REDIRECT;
	}
	return redirect;
}

export default function AuthRedirect() {
	const redirect = useRouterState({
		select: (state) => state.location.pathname,
	});

	return (
		<Navigate to="/sign-in" search={{ mode: "sign-in", redirect }} replace />
	);
}
