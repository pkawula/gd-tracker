import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useTranslation } from "@/lib/i18n";
import { Languages } from "lucide-react";

export function LanguageSwitcher() {
	const { language, setLanguage } = useTranslation();

	return (
		<div className="flex items-center gap-2">
			<Languages className="h-4 w-4 text-muted-foreground" />
			<Select value={language} onValueChange={(value) => setLanguage(value as "en" | "pl")}>
				<SelectTrigger size="sm" className="w-[120px]">
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
