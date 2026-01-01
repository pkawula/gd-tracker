import { useState } from "react";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useTranslation } from "@/lib/i18n";
import { useMealWindows } from "@/hooks/useMealWindows";
import { toast } from "sonner";
import type { MealWindow } from "@/types";

export function MealWindowsSettings() {
	const { t } = useTranslation();
	const { mealWindows, loading, updateMealWindow, seedDefaultWindows } = useMealWindows();
	const [isUpdating, setIsUpdating] = useState(false);

	const getCurrentDayIndex = () => {
		const today = new Date().getDay();
		return today === 0 ? 6 : today - 1;
	};

	const [selectedDay, setSelectedDay] = useState(getCurrentDayIndex());

	const dayNames = [
		t("mealWindows.days.monday"),
		t("mealWindows.days.tuesday"),
		t("mealWindows.days.wednesday"),
		t("mealWindows.days.thursday"),
		t("mealWindows.days.friday"),
		t("mealWindows.days.saturday"),
		t("mealWindows.days.sunday"),
	];

	const getDayOfWeek = (index: number) => {
		return index === 6 ? 0 : index + 1;
	};

	// Get windows for selected day
	const dayWindows = mealWindows?.filter((w) => w.day_of_week === getDayOfWeek(selectedDay)) || [];

	// Group windows by measurement type for display
	const fastingWindow = dayWindows.find((w) => w.measurement_type === "fasting");
	const mealWindows1to5 = dayWindows
		.filter((w) => w.measurement_type === "1hr_after_meal")
		.sort((a, b) => (a.meal_number || 0) - (b.meal_number || 0));

	const handleTimeChange = async (window: MealWindow, field: "time_start" | "time_end", value: string) => {
		// Validate time format (HH:MM)
		if (!/^\d{2}:\d{2}$/.test(value)) {
			toast.error(t("mealWindows.errors.invalidTimeFormat"));
			return;
		}

		setIsUpdating(true);
		try {
			await updateMealWindow({
				id: window.id,
				[field]: `${value}:00`, // Add seconds
			});
		} catch (error) {
			toast.error(t("mealWindows.errors.updateFailed"));
			if (import.meta.env.DEV) {
				console.error("Error updating meal window:", error);
			}
		} finally {
			setIsUpdating(false);
		}
	};

	const handleResetToDefaults = async () => {
		setIsUpdating(true);
		try {
			await seedDefaultWindows();
			toast.success(t("mealWindows.resetSuccess"));
		} catch (error) {
			toast.error(t("mealWindows.errors.resetFailed"));
			if (import.meta.env.DEV) {
				console.error("Error resetting to defaults:", error);
			}
		} finally {
			setIsUpdating(false);
		}
	};

	// Helper to format time string for input (HH:MM:SS -> HH:MM)
	const formatTimeForInput = (time: string) => {
		return time.substring(0, 5);
	};

	if (loading) {
		return <div className="py-4 text-center text-sm text-muted-foreground">{t("app.loading")}</div>;
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="space-y-2">
				<h3 className="text-lg font-medium">{t("mealWindows.title")}</h3>
				<p className="text-sm text-muted-foreground">{t("mealWindows.description")}</p>
			</div>

			{/* Day selector */}
			<div className="space-y-2">
				<Label>{t("mealWindows.selectDay")}</Label>
				<div className="flex gap-2 flex-wrap">
					{dayNames.map((day, index) => (
						<Button
							key={index}
							variant={selectedDay === index ? "default" : "outline"}
							size="sm"
							onClick={() => setSelectedDay(index)}
							disabled={isUpdating}
						>
							{day}
						</Button>
					))}
				</div>
			</div>

			{/* Time windows */}
			<div className="space-y-4">
				{/* Fasting window */}
				{fastingWindow && (
					<div className="rounded-lg border p-4 space-y-3">
						<Label className="text-base font-medium">{t("measurementTypes.fasting")}</Label>
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor={`fasting-start`} className="text-sm">
									{t("mealWindows.timeStart")}
								</Label>
								<Input
									id={`fasting-start`}
									type="time"
									value={formatTimeForInput(fastingWindow.time_start)}
									onChange={(e) => handleTimeChange(fastingWindow, "time_start", e.target.value)}
									disabled={isUpdating}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor={`fasting-end`} className="text-sm">
									{t("mealWindows.timeEnd")}
								</Label>
								<Input
									id={`fasting-end`}
									type="time"
									value={formatTimeForInput(fastingWindow.time_end)}
									onChange={(e) => handleTimeChange(fastingWindow, "time_end", e.target.value)}
									disabled={isUpdating}
								/>
							</div>
						</div>
					</div>
				)}

				{/* Meal windows */}
				{mealWindows1to5.map((window) => (
					<div key={window.id} className="rounded-lg border p-4 space-y-3">
						<Label className="text-base font-medium">{t("mealWindows.mealLabel", { number: window.meal_number! })}</Label>
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor={`meal-${window.meal_number}-start`} className="text-sm">
									{t("mealWindows.timeStart")}
								</Label>
								<Input
									id={`meal-${window.meal_number}-start`}
									type="time"
									value={formatTimeForInput(window.time_start)}
									onChange={(e) => handleTimeChange(window, "time_start", e.target.value)}
									disabled={isUpdating}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor={`meal-${window.meal_number}-end`} className="text-sm">
									{t("mealWindows.timeEnd")}
								</Label>
								<Input
									id={`meal-${window.meal_number}-end`}
									type="time"
									value={formatTimeForInput(window.time_end)}
									onChange={(e) => handleTimeChange(window, "time_end", e.target.value)}
									disabled={isUpdating}
								/>
							</div>
						</div>
					</div>
				))}
			</div>

			{/* Reset button */}
			<div className="flex justify-end pt-4 border-t">
				<Button variant="outline" onClick={handleResetToDefaults} disabled={isUpdating}>
					{t("mealWindows.resetToDefaults")}
				</Button>
			</div>

			{/* Help text */}
			<div className="rounded-lg bg-muted/50 p-4 space-y-2">
				<p className="text-sm font-medium">{t("mealWindows.help.title")}</p>
				<ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
					<li>{t("mealWindows.help.point1")}</li>
					<li>{t("mealWindows.help.point2")}</li>
					<li>{t("mealWindows.help.point3")}</li>
				</ul>
			</div>
		</div>
	);
}
