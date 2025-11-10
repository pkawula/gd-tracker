import { useState, useActionState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { supabase } from "@/lib/supabase";
import { Plus } from "lucide-react";
import type { MeasurementType } from "@/types";

async function addReadingAction(_prevState: { error: string | null; success: boolean }, formData: FormData) {
	const glucoseValue = parseInt(formData.get("glucose_value") as string);
	const measurementType = formData.get("measurement_type") as MeasurementType;
	const measuredAt = formData.get("measured_at") as string;
	const comment = formData.get("comment") as string;

	// Validation
	if (!glucoseValue || glucoseValue < 0 || glucoseValue > 500) {
		return { error: "Glucose value must be between 0 and 500", success: false };
	}

	if (!measurementType) {
		return { error: "Measurement type is required", success: false };
	}

	const { error } = await supabase.from("glucose_readings").insert({
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
	const [open, setOpen] = useState(false);
	const [measurementType, setMeasurementType] = useState<MeasurementType>("fasting");
	const [state, submitAction, isPending] = useActionState(addReadingAction, {
		error: null,
		success: false,
	});

	// Get current datetime in local format for input
	const now = new Date();
	const localDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

	// Close dialog and refresh on success
	if (state.success && open) {
		setOpen(false);
		onSuccess();
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="lg" className="gap-2">
					<Plus className="h-5 w-5" />
					Add Reading
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Add Glucose Reading</DialogTitle>
				</DialogHeader>
				<form action={submitAction} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="glucose_value">Glucose Level (mg/dL) *</Label>
						<Input id="glucose_value" name="glucose_value" type="number" required min="0" max="500" placeholder="Enter glucose value" autoFocus />
					</div>

					<div className="space-y-2">
						<Label htmlFor="measurement_type">Measurement Type *</Label>
						<Select name="measurement_type" value={measurementType} onValueChange={(value) => setMeasurementType(value as MeasurementType)} required>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="fasting">Fasting</SelectItem>
								<SelectItem value="1hr_after_meal">1hr After Meal</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="measured_at">Date & Time *</Label>
						<Input id="measured_at" name="measured_at" type="datetime-local" defaultValue={localDatetime} required />
					</div>

					<div className="space-y-2">
						<Label htmlFor="comment">Notes (Optional)</Label>
						<Textarea id="comment" name="comment" placeholder="Add any relevant notes..." rows={3} />
					</div>

					{state.error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">{state.error}</div>}

					<div className="flex gap-2">
						<Button type="submit" disabled={isPending} className="flex-1">
							{isPending ? "Adding..." : "Add Reading"}
						</Button>
						<Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
							Cancel
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
