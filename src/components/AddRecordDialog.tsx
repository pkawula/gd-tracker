import { useState, useActionState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "@/lib/i18n";
import { Plus } from "lucide-react";
import type { MeasurementType } from "@/types";

async function addReadingAction(_prevState: { error: string | null; success: boolean }, formData: FormData) {
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return { error: "addReading.errors.notLoggedIn", success: false };
	}

	const glucoseValue = parseInt(formData.get("glucose_value") as string);
	const measurementType = formData.get("measurement_type") as MeasurementType;
	const measuredAt = formData.get("measured_at") as string;
	const comment = formData.get("comment") as string;

	// Validation
	if (!glucoseValue || glucoseValue < 0 || glucoseValue > 500) {
		return { error: "addReading.errors.invalidGlucose", success: false };
	}

	if (!measurementType) {
		return { error: "addReading.errors.measurementTypeRequired", success: false };
	}

	const { error } = await supabase.from("glucose_readings").insert({
		user_id: user.id,
		glucose_value: glucoseValue,
		measurement_type: measurementType,
		measured_at: measuredAt,
		comment: comment || null,
	});

	if (error) {
		return { error: error.message, success: false };
	}

	return { error: null, success: true };
}

export function AddRecordDialog({ onSuccess }: { onSuccess: () => void }) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [measurementType, setMeasurementType] = useState<MeasurementType>("fasting");
	const [state, submitAction, isPending] = useActionState(addReadingAction, {
		error: null,
		success: false,
	});

	// Get current datetime in local format for input
	const now = new Date();
	const localDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

	useEffect(() => {
		// Close dialog and refresh on success
		if (state.success) {
			setOpen(false);
			onSuccess();
		}
	}, [state, onSuccess]);

	// Translate error message if it's a translation key
	const errorMessage = state.error && state.error.startsWith("addReading.errors.") ? t(state.error) : state.error;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="lg" className="gap-2">
					<Plus className="h-5 w-5" />
					{t("readings.add")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>{t("addReading.title")}</DialogTitle>
				</DialogHeader>
				<form action={submitAction} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="glucose_value">{t("addReading.glucoseLevel")}</Label>
						<Input
							id="glucose_value"
							name="glucose_value"
							type="number"
							required
							min="0"
							max="500"
							placeholder={t("addReading.glucosePlaceholder")}
							autoFocus
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="measurement_type">{t("addReading.measurementType")}</Label>
						<Select name="measurement_type" value={measurementType} onValueChange={(value) => setMeasurementType(value as MeasurementType)} required>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="fasting">{t("measurementTypes.fasting")}</SelectItem>
								<SelectItem value="1hr_after_meal">{t("measurementTypes.1hr_after_meal")}</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="measured_at">{t("addReading.dateTime")}</Label>
						<Input id="measured_at" name="measured_at" type="datetime-local" defaultValue={localDatetime} required />
					</div>

					<div className="space-y-2">
						<Label htmlFor="comment">{t("addReading.notes")}</Label>
						<Textarea id="comment" name="comment" placeholder={t("addReading.notesPlaceholder")} rows={3} />
					</div>

					{errorMessage && (
						<div className="text-sm text-destructive bg-destructive/10 dark:bg-destructive/20 p-3 rounded-md border border-destructive/20">
							{errorMessage}
						</div>
					)}

					<div className="flex gap-2">
						<Button type="submit" disabled={isPending} className="flex-1">
							{isPending ? t("readings.adding") : t("readings.add")}
						</Button>
						<Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
							{t("addReading.cancel")}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
