import { Button } from "./ui/button";
import { LogOut } from "lucide-react";

interface HeaderProps {
	userName?: string;
	onSignOut: () => void;
}

export function Header({ userName, onSignOut }: HeaderProps) {
	return (
		<header className="border-b bg-white">
			<div className="container mx-auto px-4 py-4 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
						<span className="text-white font-bold text-xl">GD</span>
					</div>
					<div>
						<h1 className="text-xl font-bold">GD Tracker</h1>
						<p className="text-xs text-muted-foreground">Gestational Diabetes Monitor</p>
					</div>
				</div>

				<div className="flex items-center gap-4">
					{userName && <span className="text-sm text-muted-foreground">{userName}</span>}
					<Button variant="ghost" size="sm" onClick={onSignOut} className="gap-2">
						<LogOut className="h-4 w-4" />
						Sign Out
					</Button>
				</div>
			</div>
		</header>
	);
}
