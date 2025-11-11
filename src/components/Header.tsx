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
			<div className="container mx-auto px-4 py-3 sm:py-4">
				<div className="flex items-center justify-between gap-2 sm:gap-4">
					<div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
						<img src="/android/android-launchericon-96-96.png" alt="GD Tracker logo" className="w-8 h-8 sm:w-10 sm:h-10 shrink-0" />
						<div className="min-w-0">
							<h1 className="text-base sm:text-xl font-bold truncate">{t("app.title")}</h1>
							<p className="text-xs text-muted-foreground hidden sm:block">{t("app.subtitle")}</p>
						</div>
					</div>

					<div className="flex items-center gap-1 sm:gap-4 shrink-0">
						<ThemeToggle />
						<LanguageSwitcher />
						{userName && <span className="text-xs sm:text-sm text-muted-foreground hidden md:inline truncate max-w-[120px]">{userName}</span>}
						<Button variant="ghost" size="sm" onClick={onSignOut} className="gap-1 sm:gap-2 px-2 sm:px-3" aria-label={t("app.signOut")}>
							<LogOut className="h-4 w-4" />
							<span className="hidden sm:inline">{t("app.signOut")}</span>
						</Button>
					</div>
				</div>
			</div>
		</header>
	);
}
