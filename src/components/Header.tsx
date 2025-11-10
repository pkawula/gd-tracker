import { Button } from "./ui/button";
import { LogOut } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";

interface HeaderProps {
	userName?: string;
	onSignOut: () => void;
}

export function Header({ userName, onSignOut }: HeaderProps) {
	const { t } = useTranslation();

	return (
		<header className="border-b bg-card">
			<div className="container mx-auto px-4 py-4 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<img src="/android/android-launchericon-96-96.png" alt="GD Tracker logo" className="w-10 h-10" />
					<div>
						<h1 className="text-xl font-bold">{t("app.title")}</h1>
						<p className="text-xs text-muted-foreground">{t("app.subtitle")}</p>
					</div>
				</div>

				<div className="flex items-center gap-4">
					<ThemeToggle />
					<LanguageSwitcher />
					{userName && <span className="text-sm text-muted-foreground">{userName}</span>}
					<Button variant="ghost" size="sm" onClick={onSignOut} className="gap-2">
						<LogOut className="h-4 w-4" />
						{t("app.signOut")}
					</Button>
				</div>
			</div>
		</header>
	);
}
