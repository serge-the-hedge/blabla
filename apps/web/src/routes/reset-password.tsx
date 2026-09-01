import { createFileRoute } from "@tanstack/react-router";

import ResetPasswordForm from "@/components/reset-password-form";

export const Route = createFileRoute("/reset-password")({
	validateSearch: (search: Record<string, unknown>) => ({
		token: typeof search.token === "string" ? search.token : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
	const search = Route.useSearch();
	return <ResetPasswordForm token={search.token} error={search.error} />;
}
