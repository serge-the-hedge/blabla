import { Toaster } from "@blabla/ui/components/sonner";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import Header from "@/components/header";
import { ThemeProvider } from "@/components/theme-provider";

import "../index.css";

export type RouterAppContext = Record<never, never>;

const RouterDevtools = import.meta.env.DEV
	? lazy(() =>
			import("@tanstack/react-router-devtools").then((module) => ({
				default: module.TanStackRouterDevtools,
			})),
		)
	: null;

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	head: () => ({
		meta: [
			{
				title: "blabla — localization workspace",
			},
			{
				name: "description",
				content:
					"Project-scoped strings, reviewable agent edits, JSON and ARB workflows.",
			},
		],
		links: [
			{
				rel: "icon",
				href: "/favicon.ico",
			},
		],
	}),
});

function RootComponent() {
	return (
		<>
			<HeadContent />
			<a
				href="#main-content"
				className="fixed top-2 left-2 z-50 -translate-y-16 bg-background px-3 py-2 text-sm shadow-md transition-transform focus:translate-y-0 motion-reduce:transition-none"
			>
				Skip to content
			</a>
			<ThemeProvider
				attribute="class"
				defaultTheme="dark"
				disableTransitionOnChange
				storageKey="vite-ui-theme"
			>
				<div className="grid h-svh grid-rows-[auto_1fr] bg-background">
					<Header />
					<main
						id="main-content"
						tabIndex={-1}
						className="min-h-0 overflow-hidden outline-none"
					>
						<Outlet />
					</main>
				</div>
				<Toaster richColors />
			</ThemeProvider>
			{RouterDevtools ? (
				<Suspense fallback={null}>
					<RouterDevtools position="bottom-left" />
				</Suspense>
			) : null}
		</>
	);
}
