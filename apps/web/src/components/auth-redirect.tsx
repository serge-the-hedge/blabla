import { Navigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";

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
	const currentHref = useRouterState({
		select: (state) => state.location.href,
	});
	// Keep the protected destination that caused this guard to mount. During the
	// route transition this component can render once with /sign-in as the
	// current location; following that transient value would recursively nest
	// the sign-in URL inside its own redirect query.
	const [redirect] = useState(() => safeAuthRedirect(currentHref));

	return (
		<Navigate to="/sign-in" search={{ mode: "sign-in", redirect }} replace />
	);
}
