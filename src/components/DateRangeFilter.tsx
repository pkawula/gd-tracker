import { useState } from "react";
import type { DateRange, DateRangePreset } from "@/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import { useTranslation } from "@/lib/i18n";
import { startOfDay, subDays, format } from "date-fns";
import { pl, enUS } from "date-fns/locale";
import { Calendar } from "lucide-react";

interface DateRangeFilterProps {
	dateRange: DateRange;
	onDateRangeChange: (range: DateRange) => void;
}

export function DateRangeFilter({ dateRange, onDateRangeChange }: DateRangeFilterProps) {
	const { t, language } = useTranslation();
	const [preset, setPreset] = useState<DateRangePreset>("7days");
	const [showCustom, setShowCustom] = useState(false);

	const locale = language === "pl" ? pl : enUS;

	function handlePresetChange(newPreset: DateRangePreset) {
		setPreset(newPreset);
		setShowCustom(false);

		const today = startOfDay(new Date());

		switch (newPreset) {
			case "today":
				onDateRangeChange({ from: today, to: today });
				break;
			case "7days":
				onDateRangeChange({ from: subDays(today, 6), to: today });
				break;
			case "30days":
				onDateRangeChange({ from: subDays(today, 29), to: today });
				break;
			case "custom":
				setShowCustom(true);
				break;
		}
	}

	function handleCustomRangeChange(type: "from" | "to", value: string) {
		const newDate = startOfDay(new Date(value));
		onDateRangeChange({
			...dateRange,
			[type]: newDate,
		});
	}

	return (
		<Card className="p-4">
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<Calendar className="h-4 w-4 text-muted-foreground" />
					<h3 className="font-medium">{t("dateRange.title")}</h3>
				</div>

				<div className="flex flex-wrap gap-2">
					<Button variant={preset === "today" ? "default" : "outline"} size="sm" onClick={() => handlePresetChange("today")}>
						{t("dateRange.today")}
					</Button>
					<Button variant={preset === "7days" ? "default" : "outline"} size="sm" onClick={() => handlePresetChange("7days")}>
						{t("dateRange.last7Days")}
					</Button>
					<Button variant={preset === "30days" ? "default" : "outline"} size="sm" onClick={() => handlePresetChange("30days")}>
						{t("dateRange.last30Days")}
					</Button>
					<Button variant={preset === "custom" ? "default" : "outline"} size="sm" onClick={() => handlePresetChange("custom")}>
						{t("dateRange.customRange")}
					</Button>
				</div>

				{showCustom && (
					<div className="grid grid-cols-2 gap-4 pt-2 border-t">
						<div className="space-y-2">
							<Label htmlFor="from-date">{t("dateRange.from")}</Label>
							<Input
								id="from-date"
								type="date"
								value={format(dateRange.from, "yyyy-MM-dd")}
								onChange={(e) => handleCustomRangeChange("from", e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="to-date">{t("dateRange.to")}</Label>
							<Input
								id="to-date"
								type="date"
								value={format(dateRange.to, "yyyy-MM-dd")}
								onChange={(e) => handleCustomRangeChange("to", e.target.value)}
							/>
						</div>
					</div>
				)}

				<div className="text-sm text-muted-foreground pt-2 border-t">
					{t("dateRange.showing")} {format(dateRange.from, "MMM dd, yyyy", { locale })} - {format(dateRange.to, "MMM dd, yyyy", { locale })}
				</div>
			</div>
		</Card>
	);
}
