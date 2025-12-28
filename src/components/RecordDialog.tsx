import { useState, useActionState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "@/lib/i18n";
import { Plus } from "lucide-react";
import type { MeasurementType, GlucoseReading } from "@/types";

// Convert UTC ISO string to local datetime-local format
function utcToLocalDatetime(utcString: string): string {
	const date = new Date(utcString);

	// Format using local time methods
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");

	return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Convert local datetime-local format to UTC ISO string
function localDatetimeToUtc(localString: string): string {
	return new Date(localString).toISOString();
}

async function addReadingAction(_prevState: { error: string | null; success: boolean }, formData: FormData) {
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return { error: "addReading.errors.notLoggedIn", success: false };
	}

	const glucoseValue = parseInt(formData.get("glucose_value") as string);
	const measurementType = formData.get("measurement_type") as MeasurementType;
	const measuredAtLocal = formData.get("measured_at") as string;
	const comment = formData.get("comment") as string;

	// Validation
	if (!glucoseValue || glucoseValue < 0 || glucoseValue > 500) {
		return { error: "addReading.errors.invalidGlucose", success: false };
	}

	if (!measurementType) {
		return { error: "addReading.errors.measurementTypeRequired", success: false };
	}

	const measuredAt = localDatetimeToUtc(measuredAtLocal);

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

async function updateReadingAction(_prevState: { error: string | null; success: boolean }, formData: FormData, readingId: string) {
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return { error: "editReading.errors.notLoggedIn", success: false };
	}

	// Verify the reading exists and belongs to the user
	const { data: existingReading, error: fetchError } = await supabase.from("glucose_readings").select("id, user_id").eq("id", readingId).single();

	if (fetchError || !existingReading) {
		return { error: "editReading.errors.notFound", success: false };
	}

	if (existingReading.user_id !== user.id) {
		return { error: "editReading.errors.unauthorized", success: false };
	}

	const glucoseValue = parseInt(formData.get("glucose_value") as string);
	const measurementType = formData.get("measurement_type") as MeasurementType;
	const measuredAtLocal = formData.get("measured_at") as string;
	const comment = formData.get("comment") as string;

	// Validation
	if (!glucoseValue || glucoseValue < 0 || glucoseValue > 500) {
		return { error: "editReading.errors.invalidGlucose", success: false };
	}

	if (!measurementType) {
		return { error: "editReading.errors.measurementTypeRequired", success: false };
	}

	const measuredAt = localDatetimeToUtc(measuredAtLocal);

	const { error } = await supabase
		.from("glucose_readings")
		.update({
			glucose_value: glucoseValue,
			measurement_type: measurementType,
			measured_at: measuredAt,
			comment: comment || null,
		})
		.eq("id", readingId);

	if (error) {
		return { error: error.message, success: false };
	}

	return { error: null, success: true };
}

interface RecordDialogProps {
	mode: "add" | "edit";
	reading?: GlucoseReading;
	onSuccess: () => void;
	trigger?: React.ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	initialMeasurementType?: MeasurementType;
}

export function RecordDialog({ mode, reading, onSuccess, trigger, open: controlledOpen, onOpenChange, initialMeasurementType }: RecordDialogProps) {
	const { t } = useTranslation();
	const [internalOpen, setInternalOpen] = useState(false);
	const [measurementType, setMeasurementType] = useState<MeasurementType>(reading?.measurement_type || initialMeasurementType || "fasting");
	const [datetimeKey, setDatetimeKey] = useState(0);
	const formRef = useRef<HTMLFormElement>(null);

	const isControlled = controlledOpen !== undefined;
	const open = isControlled ? controlledOpen : internalOpen;
	const setOpen = useMemo(() => {
		if (isControlled) {
			return onOpenChange || (() => {});
		}
		return setInternalOpen;
	}, [isControlled, onOpenChange]);

	const isEditMode = mode === "edit";

	// Get default datetime value
	const getDefaultDatetime = () => {
		if (isEditMode && reading?.measured_at) {
			return utcToLocalDatetime(reading.measured_at);
		}

		return utcToLocalDatetime(new Date().toISOString());
	};

	const actionWrapper = async (prevState: { error: string | null; success: boolean }, formData: FormData) => {
		if (isEditMode && reading) {
			return updateReadingAction(prevState, formData, reading.id);
		}
		return addReadingAction(prevState, formData);
	};

	const [state, submitAction, isPending] = useActionState(actionWrapper, {
		error: null,
		success: false,
	});

	// Reset form and measurement type when dialog opens/closes or reading changes
	useEffect(() => {
		if (open) {
			if (isEditMode && reading) {
				setMeasurementType(reading.measurement_type);
			} else {
				setMeasurementType(initialMeasurementType || "fasting");
				// Force remount of datetime input in add mode to recalculate default value
				setDatetimeKey((prev) => prev + 1);
			}
		}
	}, [open, isEditMode, reading, initialMeasurementType]);

	useEffect(() => {
		if (state.success) {
			setOpen(false);
			if (formRef.current) {
				formRef.current.reset();
			}
			onSuccess();
		}
	}, [state, setOpen, onSuccess]);

	// Translate error message
	const errorMessage =
		state.error && (state.error.startsWith("addReading.errors.") || state.error.startsWith("editReading.errors.")) ? t(state.error) : state.error;

	const translationPrefix = isEditMode ? "editReading" : "addReading";
	const submitButtonText = isPending
		? isEditMode
			? t("readings.editing")
			: t("readings.adding")
		: isEditMode
		? t("readings.editLabel")
		: t("readings.add");

	const defaultTrigger = (
		<Button size="lg" className="gap-2">
			<Plus className="h-5 w-5" />
			{t("readings.add")}
		</Button>
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
			{!trigger && !isControlled && <DialogTrigger asChild>{defaultTrigger}</DialogTrigger>}
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>{t(`${translationPrefix}.title`)}</DialogTitle>
				</DialogHeader>
				<form ref={formRef} action={submitAction} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="glucose_value">{t(`${translationPrefix}.glucoseLevel`)}</Label>
						<Input
							id="glucose_value"
							name="glucose_value"
							type="number"
							required
							min="0"
							max="500"
							placeholder={t(`${translationPrefix}.glucosePlaceholder`)}
							defaultValue={reading?.glucose_value}
							autoFocus
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="measurement_type">{t(`${translationPrefix}.measurementType`)}</Label>
						<input type="hidden" name="measurement_type" value={measurementType} required />
						<div className="flex gap-2">
							<Button
								type="button"
								variant={measurementType === "fasting" ? "default" : "outline"}
								className="flex-1 rounded-full"
								onClick={() => setMeasurementType("fasting")}
							>
								{t("measurementTypes.fasting")}
							</Button>
							<Button
								type="button"
								variant={measurementType === "1hr_after_meal" ? "default" : "outline"}
								className="flex-1 rounded-full"
								onClick={() => setMeasurementType("1hr_after_meal")}
							>
								{t("measurementTypes.1hr_after_meal")}
							</Button>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="measured_at">{t(`${translationPrefix}.dateTime`)}</Label>
						<Input
							key={isEditMode ? reading?.id : `datetime-${datetimeKey}`}
							id="measured_at"
							name="measured_at"
							type="datetime-local"
							defaultValue={getDefaultDatetime()}
							required
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="comment">{t(`${translationPrefix}.notes`)}</Label>
						<Textarea
							id="comment"
							name="comment"
							placeholder={t(`${translationPrefix}.notesPlaceholder`)}
							rows={3}
							defaultValue={reading?.comment || ""}
						/>
					</div>

					{errorMessage && (
						<div className="text-sm text-destructive bg-destructive/10 dark:bg-destructive/20 p-3 rounded-md border border-destructive/20">
							{errorMessage}
						</div>
					)}

					<div className="flex gap-2">
						<Button type="submit" disabled={isPending} className="flex-1">
							{submitButtonText}
						</Button>
						<Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
							{t(`${translationPrefix}.cancel`)}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Backward compatibility: export AddRecordDialog as an alias
export function AddRecordDialog({ onSuccess }: { onSuccess: () => void }) {
	return <RecordDialog mode="add" onSuccess={onSuccess} />;
}
