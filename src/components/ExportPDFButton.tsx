import { Button } from "./ui/button";
import { Download } from "lucide-react";
import { generatePDF } from "@/lib/pdf-generator";
import type { GlucoseReading, DateRange } from "@/types";

interface ExportPDFButtonProps {
	readings: GlucoseReading[];
	dateRange: DateRange;
}

export function ExportPDFButton({ readings, dateRange }: ExportPDFButtonProps) {
	function handleExport() {
		if (readings.length === 0) {
			alert("No readings to export");
			return;
		}
		generatePDF(readings, dateRange);
	}

	return (
		<Button variant="outline" size="lg" onClick={handleExport} className="gap-2" disabled={readings.length === 0}>
			<Download className="h-5 w-5" />
			Export PDF
		</Button>
	);
}
