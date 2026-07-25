import { Button } from "@blabla/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@blabla/ui/components/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/convex-api";

function initialsOf(name: string | undefined, email: string | undefined) {
	if (name?.trim()) {
		const parts = name.trim().split(/\s+/).slice(0, 2);
		return parts.map((part) => part[0]?.toUpperCase()).join("");
	}
	return email?.slice(0, 2).toUpperCase() ?? "";
}

export default function UserMenu() {
	const navigate = useNavigate();
	const user = useQuery(api.auth.getCurrentUser);

	const initials = initialsOf(user?.name, user?.email);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
				<span
					aria-hidden
					className="inline-flex size-5 items-center justify-center rounded-full bg-brand text-[10px] text-brand-foreground"
				>
					{initials}
				</span>
				<span className="max-w-[10rem] truncate">
					{user?.name ?? "Account"}
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-56">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="flex flex-col gap-0.5">
						<span className="font-medium text-sm">{user?.name}</span>
						<span className="font-normal text-muted-foreground text-xs">
							{user?.email}
						</span>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						onClick={() => {
							void authClient.signOut({
								fetchOptions: {
									onSuccess: () => {
										void navigate({
											to: "/sign-in",
											search: { mode: "sign-in", redirect: "/projects" },
											replace: true,
										});
									},
									onError: (context) => {
										toast.error(
											context.error.message || "Could not sign out. Try again.",
										);
									},
								},
							});
						}}
					>
						<LogOut data-icon="inline-start" />
						Sign out
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
