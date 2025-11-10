import { type GlucoseReading, TARGET_RANGES } from "@/types";
import { format } from "date-fns";
import { pl, enUS } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { useTranslation } from "@/lib/i18n";
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
			return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
		case "warning":
			return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
		case "out-of-range":
			return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
		default:
			return "";
	}
}

export function ReadingsTable({ readings }: ReadingsTableProps) {
	const { t, language } = useTranslation();
	const locale = language === "pl" ? pl : enUS;

	if (readings.length === 0) {
		return (
			<Card className="p-12 text-center">
				<div className="space-y-2">
					<p className="text-lg font-medium text-muted-foreground">{t("readings.noReadings")}</p>
					<p className="text-sm text-muted-foreground">{t("readings.noReadingsSubtext")}</p>
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
							<TableHead className="w-[180px]">{t("readings.table.dateTime")}</TableHead>
							<TableHead className="w-[140px]">{t("readings.table.type")}</TableHead>
							<TableHead className="w-[120px]">{t("readings.table.glucose")}</TableHead>
							<TableHead className="w-[140px]">{t("readings.table.status")}</TableHead>
							<TableHead>{t("readings.table.notes")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{readings.map((reading) => {
							const status = getValueStatus(reading.glucose_value, reading.measurement_type);
							return (
								<TableRow key={reading.id}>
									<TableCell className="font-medium">{format(new Date(reading.measured_at), "MMM dd, yyyy HH:mm", { locale })}</TableCell>
									<TableCell>
										<Badge variant="outline" className="whitespace-nowrap">
											{reading.measurement_type === "fasting" ? t("measurementTypes.fasting") : t("measurementTypes.1hr_after_meal")}
										</Badge>
									</TableCell>
									<TableCell>
										<span className={cn("font-semibold text-lg", getStatusColor(status).split(" ")[0])}>{reading.glucose_value}</span>
									</TableCell>
									<TableCell>
										<Badge className={cn("whitespace-nowrap border", getStatusColor(status))}>
											{status === "in-range" && t("readings.status.inRange")}
											{status === "warning" && t("readings.status.nearLimit")}
											{status === "out-of-range" && t("readings.status.outOfRange")}
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
