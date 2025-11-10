import { type GlucoseReading, TARGET_RANGES } from "@/types";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { cn } from "@/lib/utils";

interface ReadingsTableProps {
	readings: GlucoseReading[];
}

function getValueStatus(value: number, type: GlucoseReading["measurement_type"]) {
	const target = TARGET_RANGES[type];
	if (value < target) return "in-range";
	if (value <= target + 5) return "warning";
	return "out-of-range";
}

function getStatusColor(status: string) {
	switch (status) {
		case "in-range":
			return "text-green-600 bg-green-50 border-green-200";
		case "warning":
			return "text-amber-600 bg-amber-50 border-amber-200";
		case "out-of-range":
			return "text-red-600 bg-red-50 border-red-200";
		default:
			return "";
	}
}

export function ReadingsTable({ readings }: ReadingsTableProps) {
	if (readings.length === 0) {
		return (
			<Card className="p-12 text-center">
				<div className="space-y-2">
					<p className="text-lg font-medium text-muted-foreground">No readings found</p>
					<p className="text-sm text-muted-foreground">Add your first reading to get started</p>
				</div>
			</Card>
		);
	}

	return (
		<Card>
			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[180px]">Date & Time</TableHead>
							<TableHead className="w-[140px]">Type</TableHead>
							<TableHead className="w-[120px]">Glucose (mg/dL)</TableHead>
							<TableHead className="w-[140px]">Status</TableHead>
							<TableHead>Notes</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{readings.map((reading) => {
							const status = getValueStatus(reading.glucose_value, reading.measurement_type);
							return (
								<TableRow key={reading.id}>
									<TableCell className="font-medium">{format(new Date(reading.measured_at), "MMM dd, yyyy HH:mm")}</TableCell>
									<TableCell>
										<Badge variant="outline" className="whitespace-nowrap">
											{reading.measurement_type === "fasting" ? "Fasting" : "1hr After Meal"}
										</Badge>
									</TableCell>
									<TableCell>
										<span className={cn("font-semibold text-lg", getStatusColor(status).split(" ")[0])}>{reading.glucose_value}</span>
									</TableCell>
									<TableCell>
										<Badge className={cn("whitespace-nowrap border", getStatusColor(status))}>
											{status === "in-range" && "✓ In Range"}
											{status === "warning" && "⚠ Near Limit"}
											{status === "out-of-range" && "✗ Out of Range"}
										</Badge>
									</TableCell>
									<TableCell className="text-muted-foreground text-sm max-w-xs truncate">{reading.comment || "—"}</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>
		</Card>
	);
}
