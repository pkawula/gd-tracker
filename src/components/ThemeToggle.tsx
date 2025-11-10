import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
	const { theme, setTheme, resolvedTheme } = useTheme();

	const toggleTheme = () => {
		if (theme === "light") {
			setTheme("dark");
		} else if (theme === "dark") {
			setTheme("light");
		} else {
			setTheme(resolvedTheme === "light" ? "dark" : "light");
		}
	};

	return (
		<Button variant="ghost" size="sm" onClick={toggleTheme} className="gap-2" aria-label="Toggle theme">
			{resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
		</Button>
	);
}
