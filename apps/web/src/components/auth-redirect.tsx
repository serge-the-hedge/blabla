import { Navigate, useRouterState } from "@tanstack/react-router";

export const DEFAULT_AUTH_REDIRECT = "/projects";

function hasControlCharacter(value: string) {
	for (const character of value) {
		const code = character.charCodeAt(0);
		if (code < 32 || code === 127) return true;
	}
	return false;
}

export function safeAuthRedirect(redirect: string | undefined) {
	if (
		!redirect?.startsWith("/") ||
		redirect.startsWith("//") ||
		redirect.startsWith("/sign-in") ||
		redirect.includes("\\") ||
		hasControlCharacter(redirect)
	) {
		return DEFAULT_AUTH_REDIRECT;
	}
	return redirect;
}

export default function AuthRedirect() {
	const redirect = useRouterState({
		select: (state) => state.location.href,
	});

	return (
		<Navigate to="/sign-in" search={{ mode: "sign-in", redirect }} replace />
	);
}
