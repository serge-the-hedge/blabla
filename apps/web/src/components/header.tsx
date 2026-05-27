import { cn } from "@blabla/ui/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { Authenticated, Unauthenticated } from "convex/react";
import { BrandWordmark } from "@/components/brand";
import { ModeToggle } from "@/components/mode-toggle";
import UserMenu from "@/components/user-menu";

const links = [
	{ to: "/", label: "Home" },
	{ to: "/projects", label: "Projects" },
	{ to: "/dashboard", label: "Account" },
] as const;

export default function Header() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	return (
		<header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="flex h-12 items-center justify-between gap-4 px-4">
				<div className="flex items-center gap-6">
					<Link to="/" className="outline-none focus-visible:opacity-80">
						<BrandWordmark />
					</Link>
					<nav className="flex items-center gap-1 text-sm">
						{links.map(({ to, label }) => {
							const active =
								to === "/"
									? pathname === "/"
									: pathname === to || pathname.startsWith(`${to}/`);
							return (
								<Link
									key={to}
									to={to}
									className={cn(
										"rounded-md px-2.5 py-1 font-medium text-xs transition-colors",
										active
											? "bg-accent text-accent-foreground"
											: "text-muted-foreground hover:bg-muted hover:text-foreground",
									)}
								>
									{label}
								</Link>
							);
						})}
					</nav>
				</div>
				<div className="flex items-center gap-2">
					<ModeToggle />
					<Authenticated>
						<UserMenu />
					</Authenticated>
					<Unauthenticated>
						<Link
							to="/dashboard"
							className="rounded-md border bg-background px-2.5 py-1 font-medium text-xs hover:bg-muted"
						>
							Sign in
						</Link>
					</Unauthenticated>
				</div>
			</div>
		</header>
	);
}
