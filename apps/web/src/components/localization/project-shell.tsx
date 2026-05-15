import type { ReactNode } from "react";

const navItems = [
	["Strings", "strings"],
	["Reviews", "reviews"],
	["Locales", "locales"],
	["Screens", "screens"],
	["Tags", "tags"],
	["Import", "import"],
	["Export", "export"],
	["API tokens", "settings/api-tokens"],
	["Members", "settings/members"],
] as const;

export function ProjectShell({
	projectId,
	title,
	children,
}: {
	projectId: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="grid min-h-0 flex-1 grid-cols-[220px_1fr]">
			<aside className="border-r bg-muted/20 p-3">
				<a
					href="/projects"
					className="text-muted-foreground text-xs hover:text-foreground"
				>
					Projects
				</a>
				<h1 className="mt-2 truncate font-medium text-lg">{title}</h1>
				<nav className="mt-5 flex flex-col gap-1">
					{navItems.map(([label, segment]) => (
						<a
							key={segment}
							href={`/projects/${projectId}/${segment}`}
							className="rounded-sm px-2 py-1.5 text-muted-foreground text-sm hover:bg-muted hover:text-foreground"
						>
							{label}
						</a>
					))}
				</nav>
			</aside>
			<main className="min-w-0 overflow-auto p-5">{children}</main>
		</div>
	);
}

export function PageHeader({
	title,
	description,
	action,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
}) {
	return (
		<div className="mb-5 flex items-start justify-between gap-3">
			<div>
				<h2 className="font-medium text-xl">{title}</h2>
				{description ? (
					<p className="mt-1 text-muted-foreground text-sm">{description}</p>
				) : null}
			</div>
			{action}
		</div>
	);
}
