import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@blabla/ui/components/alert-dialog";
import { Button } from "@blabla/ui/components/button";
import type { ReactNode } from "react";

type ConfirmActionProps = {
	triggerLabel: string;
	title: string;
	description: ReactNode;
	confirmLabel: string;
	onConfirm: () => void | Promise<void>;
	disabled?: boolean;
};

export function ConfirmAction({
	triggerLabel,
	title,
	description,
	confirmLabel,
	onConfirm,
	disabled,
}: ConfirmActionProps) {
	return (
		<AlertDialog>
			<AlertDialogTrigger
				render={<Button size="sm" variant="outline" disabled={disabled} />}
			>
				{triggerLabel}
			</AlertDialogTrigger>
			<AlertDialogContent size="sm">
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={onConfirm}>
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
