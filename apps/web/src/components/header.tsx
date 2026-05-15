import { Link } from "@tanstack/react-router";

import { ModeToggle } from "./mode-toggle";

export default function Header() {
	const links = [
		{ to: "/", label: "Home" },
		{ to: "/projects", label: "Projects" },
		{ to: "/dashboard", label: "Account" },
	] as const;

	return (
		<div>
			<div className="flex flex-row items-center justify-between px-4 py-2">
				<nav className="flex gap-4 text-sm">
					{links.map(({ to, label }) => {
						return (
							<Link key={to} to={to}>
								{label}
							</Link>
						);
					})}
				</nav>
				<div className="flex items-center gap-2">
					<ModeToggle />
				</div>
			</div>
			<hr />
		</div>
	);
}
