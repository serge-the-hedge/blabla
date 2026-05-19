import {
	createFileRoute,
	Outlet,
	useNavigate,
	useParams,
	useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/projects/$projectId")({
	component: ProjectIndexRoute,
});

function ProjectIndexRoute() {
	const { projectId } = useParams({ from: "/projects/$projectId" });
	const navigate = useNavigate();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	useEffect(() => {
		if (pathname === `/projects/${projectId}`) {
			navigate({
				to: "/projects/$projectId/strings",
				params: { projectId },
				search: { tag: undefined },
				replace: true,
			});
		}
	}, [navigate, pathname, projectId]);

	if (pathname !== `/projects/${projectId}`) {
		return <Outlet />;
	}

	return (
		<div className="p-5 text-muted-foreground text-sm">Opening project...</div>
	);
}
