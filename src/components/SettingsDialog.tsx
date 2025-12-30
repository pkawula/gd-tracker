import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { useTranslation } from "@/lib/i18n";
import { useUserSettings } from "@/hooks/useUserSettings";
import { toast } from "sonner";

interface SettingsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
	const { t } = useTranslation();
	const { settings, loading, updateSettings } = useUserSettings();
	const [isUpdating, setIsUpdating] = useState(false);

	const handleToggleNotifications = async (checked: boolean) => {
		setIsUpdating(true);
		try {
			await updateSettings(checked);

			// Show success toast
			toast.success(checked ? t("settings.notifications.enabled") : t("settings.notifications.disabled"));
		} catch (error) {
			// Show error toast
			toast.error(t("settings.notifications.error"));

			if (import.meta.env.DEV) {
				console.error("Error updating settings:", error);
			}
		} finally {
			setIsUpdating(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>{t("settings.title")}</DialogTitle>
				</DialogHeader>

				<div className="space-y-6 py-4">
					{/* Push Notifications Setting */}
					<div className="flex items-center justify-between space-x-4">
						<div className="flex-1 space-y-1">
							<Label htmlFor="push-notifications" className="text-base font-medium">
								{t("settings.notifications.label")}
							</Label>
							<DialogDescription className="text-sm">{t("settings.notifications.description")}</DialogDescription>
						</div>
						<Switch
							id="push-notifications"
							checked={settings?.push_notifications_enabled ?? false}
							onCheckedChange={handleToggleNotifications}
							disabled={loading || isUpdating}
						/>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
