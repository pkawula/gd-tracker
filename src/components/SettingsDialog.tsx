import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { useTranslation } from "@/lib/i18n";
import { useUserSettings } from "@/hooks/useUserSettings";
import { MealWindowsSettings } from "./MealWindowsSettings";
import { toast } from "sonner";

interface SettingsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

type SettingsTab = "general" | "mealWindows";

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
	const { t } = useTranslation();
	const { settings, loading, updateSettings } = useUserSettings();
	const [isUpdating, setIsUpdating] = useState(false);
	const [activeTab, setActiveTab] = useState<SettingsTab>("general");

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
			<DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<DialogTitle>{t("settings.title")}</DialogTitle>
				</DialogHeader>

				{/* Tab navigation */}
				<div className="flex gap-2 border-b">
					<Button
						variant={activeTab === "general" ? "default" : "ghost"}
						size="sm"
						onClick={() => setActiveTab("general")}
						className="rounded-b-none"
					>
						{t("settings.tabs.general")}
					</Button>
					<Button
						variant={activeTab === "mealWindows" ? "default" : "ghost"}
						size="sm"
						onClick={() => setActiveTab("mealWindows")}
						className="rounded-b-none"
					>
						{t("settings.tabs.mealWindows")}
					</Button>
				</div>

				{/* Tab content */}
				<div className="flex-1 overflow-y-auto py-4">
					{activeTab === "general" && (
						<div className="space-y-6">
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
					)}

					{activeTab === "mealWindows" && <MealWindowsSettings />}
				</div>
			</DialogContent>
		</Dialog>
	);
}
