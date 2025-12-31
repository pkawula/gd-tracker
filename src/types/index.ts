export type MeasurementType = "fasting" | "1hr_after_meal";

export interface GlucoseReading {
	id: string;
	user_id: string;
	glucose_value: number;
	measurement_type: MeasurementType;
	measured_at: string;
	comment?: string;
	created_at: string;
	updated_at?: string;
}

export interface UserSettings {
	user_id: string;
	push_notifications_enabled: boolean;
	language: "en" | "pl";
	created_at: string;
	updated_at: string;
}

export interface DateRange {
	from: Date;
	to: Date;
}

export const TARGET_RANGES = {
	fasting: 91,
	"1hr_after_meal": 140,
} as const;

export type DateRangePreset = "today" | "7days" | "30days" | "custom";
