import { Button } from "@blabla/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { apiAny } from "@/lib/convex-api";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

const TITLE_TEXT = `
 ██████╗ ███████╗████████╗████████╗███████╗██████╗
 ██╔══██╗██╔════╝╚══██╔══╝╚══██╔══╝██╔════╝██╔══██╗
 ██████╔╝█████╗     ██║      ██║   █████╗  ██████╔╝
 ██╔══██╗██╔══╝     ██║      ██║   ██╔══╝  ██╔══██╗
 ██████╔╝███████╗   ██║      ██║   ███████╗██║  ██║
 ╚═════╝ ╚══════╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═╝

 ████████╗    ███████╗████████╗ █████╗  ██████╗██╗  ██╗
 ╚══██╔══╝    ██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝
    ██║       ███████╗   ██║   ███████║██║     █████╔╝
    ██║       ╚════██║   ██║   ██╔══██║██║     ██╔═██╗
    ██║       ███████║   ██║   ██║  ██║╚██████╗██║  ██╗
    ╚═╝       ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝
 `;

function HomeComponent() {
	const healthCheck = useQuery(apiAny.healthCheck.get);

	return (
		<div className="container mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
			<pre className="overflow-x-auto font-mono text-muted-foreground text-xs">
				{TITLE_TEXT}
			</pre>
			<div className="flex flex-col gap-4 border p-4">
				<div className="flex items-center justify-between gap-3">
					<div>
						<h1 className="font-medium text-xl">Localization Review</h1>
						<p className="text-muted-foreground text-sm">
							Project-scoped strings, reviewable agent edits, JSON and ARB
							workflows.
						</p>
					</div>
					<Link to="/projects">
						<Button>Open projects</Button>
					</Link>
				</div>
				<section className="border-t pt-3">
					<h2 className="mb-2 font-medium text-sm">API Status</h2>
					<div className="flex items-center gap-2 text-xs">
						<div
							className={`h-2 w-2 rounded-full ${healthCheck === "OK" ? "bg-green-500" : healthCheck === undefined ? "bg-orange-400" : "bg-red-500"}`}
						/>
						<span className="text-muted-foreground text-sm">
							{healthCheck === undefined
								? "Checking..."
								: healthCheck === "OK"
									? "Connected"
									: "Error"}
						</span>
					</div>
				</section>
			</div>
		</div>
	);
}
