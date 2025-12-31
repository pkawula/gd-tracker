import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useTranslation } from "@/lib/i18n";
import { useUserSettings } from "@/hooks/useUserSettings";
import { Languages } from "lucide-react";
import { toast } from "sonner";

export function LanguageSwitcher() {
	const { language, setLanguage } = useTranslation();
	const { updateLanguage } = useUserSettings();

	const handleLanguageChange = async (value: "en" | "pl") => {
		// Update UI immediately
		setLanguage(value);

		// Sync with database in the background
		try {
			await updateLanguage(value);
		} catch (error) {
			if (import.meta.env.DEV) {
				console.error("Failed to save language preference:", error);
			}
			// Optionally show a toast, but don't block the user
			toast.error("Failed to save language preference");
		}
	};

	return (
		<div className="flex items-center gap-1 sm:gap-2">
			<Languages className="h-4 w-4 text-muted-foreground hidden sm:block" />
			<Select value={language} onValueChange={handleLanguageChange}>
				<SelectTrigger size="sm" className="w-[90px] sm:w-[120px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="en">English</SelectItem>
					<SelectItem value="pl">Polski</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
