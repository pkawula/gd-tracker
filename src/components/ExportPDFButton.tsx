import { Button } from "./ui/button";
import { Download } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { generatePDF } from "@/lib/pdf-generator";
import type { GlucoseReading, DateRange } from "@/types";

interface ExportPDFButtonProps {
	readings: GlucoseReading[];
	dateRange: DateRange;
}

export function ExportPDFButton({ readings, dateRange }: ExportPDFButtonProps) {
	const { t, language } = useTranslation();

	async function handleExport() {
		if (readings.length === 0) {
			alert(t("export.noReadings"));
			return;
		}
		await generatePDF(readings, dateRange, t, language);
	}

	return (
		<Button variant="outline" size="lg" onClick={handleExport} className="gap-2" disabled={readings.length === 0}>
			<Download className="h-5 w-5" />
			{t("export.pdf")}
		</Button>
	);
}
