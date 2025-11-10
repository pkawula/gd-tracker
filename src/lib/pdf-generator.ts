import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import { type GlucoseReading, type DateRange, TARGET_RANGES } from "@/types";

interface GroupedReadings {
	[date: string]: GlucoseReading[];
}

function groupReadingsByDay(readings: GlucoseReading[]): GroupedReadings {
	const grouped: GroupedReadings = {};

	readings.forEach((reading) => {
		const date = format(parseISO(reading.measured_at), "yyyy-MM-dd");
		if (!grouped[date]) {
			grouped[date] = [];
		}
		grouped[date].push(reading);
	});

	// Sort each day's readings by time
	Object.keys(grouped).forEach((date) => {
		grouped[date].sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());
	});

	return grouped;
}

export function generatePDF(readings: GlucoseReading[], dateRange: DateRange) {
	const doc = new jsPDF();

	// Sort readings ascending (oldest first) for PDF
	const sortedReadings = [...readings].sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());

	// Group by day
	const groupedByDay = groupReadingsByDay(sortedReadings);
	const sortedDates = Object.keys(groupedByDay).sort();

	// Add title
	doc.setFontSize(18);
	doc.setFont("helvetica", "bold");
	doc.text("Glucose Readings Report", 14, 20);

	// Add date range
	doc.setFontSize(10);
	doc.setFont("helvetica", "normal");
	doc.text(`Period: ${format(dateRange.from, "MMM dd, yyyy")} - ${format(dateRange.to, "MMM dd, yyyy")}`, 14, 28);

	// Add target ranges
	doc.setFontSize(9);
	doc.setTextColor(100);
	doc.text(`Target Ranges: Fasting <${TARGET_RANGES.fasting} mg/dL | 1hr After Meal <${TARGET_RANGES["1hr_after_meal"]} mg/dL`, 14, 34);
	doc.setTextColor(0);

	// Create table data
	const tableData = sortedDates.map((date) => {
		const dayReadings = groupedByDay[date];
		const row: (string | number)[] = [format(parseISO(date), "MMM dd, yyyy")];

		// Add fasting
		const fasting = dayReadings.find((r) => r.measurement_type === "fasting");
		row.push(fasting ? fasting.glucose_value : "-");

		// Add up to 3 meals
		const meals = dayReadings.filter((r) => r.measurement_type === "1hr_after_meal");
		for (let i = 0; i < 3; i++) {
			row.push(meals[i] ? meals[i].glucose_value : "-");
		}

		return row;
	});

	// Generate table
	autoTable(doc, {
		startY: 40,
		head: [["Date", "Fasting", "Meal 1", "Meal 2", "Meal 3"]],
		body: tableData,
		theme: "grid",
		headStyles: {
			fillColor: [79, 70, 229], // indigo-600
			textColor: 255,
			fontStyle: "bold",
			fontSize: 10,
		},
		bodyStyles: {
			fontSize: 9,
		},
		columnStyles: {
			0: { cellWidth: 40, fontStyle: "bold" },
			1: { cellWidth: 25, halign: "center" },
			2: { cellWidth: 25, halign: "center" },
			3: { cellWidth: 25, halign: "center" },
			4: { cellWidth: 25, halign: "center" },
		},
		didParseCell: function (data) {
			// Color code values
			if (data.section === "body" && data.column.index > 0) {
				const value = data.cell.raw;
				if (typeof value === "number") {
					const isFastingColumn = data.column.index === 1;
					const target = isFastingColumn ? TARGET_RANGES.fasting : TARGET_RANGES["1hr_after_meal"];

					if (value < target) {
						data.cell.styles.textColor = [22, 163, 74]; // green-600
					} else if (value <= target + 5) {
						data.cell.styles.textColor = [217, 119, 6]; // amber-600
					} else {
						data.cell.styles.textColor = [220, 38, 38]; // red-600
					}
					data.cell.styles.fontStyle = "bold";
				}
			}
		},
		margin: { top: 40 },
	});

	// Add footer
	const pageCount = doc.getNumberOfPages();
	for (let i = 1; i <= pageCount; i++) {
		doc.setPage(i);
		doc.setFontSize(8);
		doc.setTextColor(150);
		doc.text(`Page ${i} of ${pageCount} | Generated on ${format(new Date(), "MMM dd, yyyy HH:mm")}`, 14, doc.internal.pageSize.height - 10);
	}

	// Save PDF
	doc.save(`glucose-readings-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
