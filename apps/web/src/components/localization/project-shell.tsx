import { Separator } from "@blabla/ui/components/separator";
import { Skeleton } from "@blabla/ui/components/skeleton";
import { cn } from "@blabla/ui/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import {
	ChevronLeft,
	Download,
	GitPullRequestArrow,
	KeyRound,
	Languages,
	type LucideIcon,
	MessageSquareText,
	ScrollText,
	Tags,
	Upload,
	Users,
} from "lucide-react";
import type { ReactNode } from "react";

type NavItem = {
	label: string;
	to: string;
	icon: LucideIcon;
};

type NavGroup = {
	label: string;
	items: NavItem[];
};

const navGroups: NavGroup[] = [
	{
		label: "Workspace",
		items: [
			{
				label: "Strings",
				to: "/projects/$projectId/strings",
				icon: MessageSquareText,
			},
			{
				label: "Reviews",
				to: "/projects/$projectId/reviews",
				icon: GitPullRequestArrow,
			},
		],
	},
	{
		label: "Setup",
		items: [
			{
				label: "Locales",
				to: "/projects/$projectId/locales",
				icon: Languages,
			},
			{
				label: "Screens",
				to: "/projects/$projectId/screens",
				icon: ScrollText,
			},
			{ label: "Tags", to: "/projects/$projectId/tags", icon: Tags },
		],
	},
	{
		label: "Pipelines",
		items: [
			{ label: "Import", to: "/projects/$projectId/import", icon: Upload },
			{ label: "Export", to: "/projects/$projectId/export", icon: Download },
		],
	},
	{
		label: "Settings",
		items: [
			{
				label: "API tokens",
				to: "/projects/$projectId/settings/api-tokens",
				icon: KeyRound,
			},
			{
				label: "Members",
				to: "/projects/$projectId/settings/members",
				icon: Users,
			},
		],
	},
];

export function ProjectShell({
	projectId,
	title,
	children,
}: {
	projectId: string;
	title: string;
	children: ReactNode;
}) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	return (
		<div className="grid h-full min-h-0 grid-cols-[232px_1fr]">
			<aside className="flex min-h-0 flex-col border-r bg-sidebar text-sidebar-foreground">
				<div className="flex flex-col gap-3 border-b p-4">
					<Link
						to="/projects"
						className="inline-flex w-fit items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
					>
						<ChevronLeft className="size-3" />
						All projects
					</Link>
					{title ? (
						<h1 className="truncate font-semibold text-base tracking-tight">
							{title}
						</h1>
					) : (
						<Skeleton className="h-5 w-3/4" />
					)}
				</div>
				<nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2.5 py-4">
					{navGroups.map((group) => (
						<div key={group.label} className="flex flex-col gap-1">
							<div className="px-2 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
								{group.label}
							</div>
							{group.items.map((item) => {
								const resolvedHref = item.to.replace(
									"$projectId",
									projectId,
								);
								const active = pathname.startsWith(resolvedHref);
								return (
									<Link
										key={item.to}
										to={item.to as never}
										params={{ projectId } as never}
										className={cn(
											"group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
											active
												? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
												: "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
										)}
									>
										<item.icon className="size-3.5" />
										{item.label}
									</Link>
								);
							})}
						</div>
					))}
				</nav>
			</aside>
			<main className="min-w-0 overflow-auto">
				<div className="mx-auto max-w-6xl px-6 py-6">{children}</div>
			</main>
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
		<div className="mb-6 flex flex-col gap-3">
			<div className="flex items-start justify-between gap-4">
				<div className="flex min-w-0 flex-col gap-1">
					<h2 className="truncate font-semibold text-xl tracking-tight">
						{title}
					</h2>
					{description ? (
						<p className="text-muted-foreground text-sm">{description}</p>
					) : null}
				</div>
				{action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
			</div>
			<Separator />
		</div>
	);
}

export function PageSection({
	title,
	description,
	children,
	className,
}: {
	title?: string;
	description?: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("flex flex-col gap-3", className)}>
			{title || description ? (
				<div className="flex flex-col gap-0.5">
					{title ? (
						<h3 className="font-medium text-sm">{title}</h3>
					) : null}
					{description ? (
						<p className="text-muted-foreground text-xs">{description}</p>
					) : null}
				</div>
			) : null}
			{children}
		</section>
	);
}

export function PageSkeleton() {
	return (
		<div className="flex flex-col gap-3">
			<Skeleton className="h-9 w-full" />
			<Skeleton className="h-32 w-full" />
			<Skeleton className="h-32 w-full" />
		</div>
	);
}
