import { createContext, useContext, useEffect, useState, useLayoutEffect } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	resolvedTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getInitialTheme(): { theme: Theme; resolvedTheme: "light" | "dark" } {
	const stored = localStorage.getItem("theme") as Theme | null;
	const theme = stored || "system";

	let resolvedTheme: "light" | "dark";
	if (theme === "system") {
		resolvedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	} else {
		resolvedTheme = theme;
	}

	return { theme, resolvedTheme };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [{ theme, resolvedTheme }, setThemeState] = useState(getInitialTheme);

	useLayoutEffect(() => {
		const root = document.documentElement;
		const { resolvedTheme: initialResolvedTheme } = getInitialTheme();
		root.classList.toggle("dark", initialResolvedTheme === "dark");
	}, []);

	useEffect(() => {
		const root = document.documentElement;

		if (theme === "system") {
			const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
			const updateTheme = () => {
				const systemTheme = mediaQuery.matches ? "dark" : "light";
				setThemeState({ theme: "system", resolvedTheme: systemTheme });
				root.classList.toggle("dark", systemTheme === "dark");
			};

			updateTheme();
			mediaQuery.addEventListener("change", updateTheme);

			return () => mediaQuery.removeEventListener("change", updateTheme);
		} else {
			setThemeState({ theme, resolvedTheme: theme });
			root.classList.toggle("dark", theme === "dark");
		}
	}, [theme]);

	const setTheme = (newTheme: Theme) => {
		setThemeState(() => {
			let newResolvedTheme: "light" | "dark";
			if (newTheme === "system") {
				newResolvedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
			} else {
				newResolvedTheme = newTheme;
			}
			return { theme: newTheme, resolvedTheme: newResolvedTheme };
		});
		localStorage.setItem("theme", newTheme);
	};

	return <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within ThemeProvider");
	}
	return context;
}
