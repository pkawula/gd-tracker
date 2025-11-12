import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import { pl, enUS } from "date-fns/locale";
import { type GlucoseReading, type DateRange, TARGET_RANGES } from "@/types";
import robotoRegular from "@/assets/fonts/Roboto-Regular.ttf?url";
import robotoBold from "@/assets/fonts/Roboto-Bold.ttf?url";

type TranslationFunction = (key: string, params?: Record<string, string | number>) => string;

interface GroupedReadings {
	[date: string]: GlucoseReading[];
}

// Font cache to avoid loading multiple times
let fontLoaded = false;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

async function loadRobotoFont(doc: jsPDF): Promise<void> {
	if (fontLoaded) return;

	try {
		// Load local Roboto Regular font
		const regularResponse = await fetch(robotoRegular);
		const regularData = await regularResponse.arrayBuffer();
		const base64Regular = arrayBufferToBase64(regularData);

		// Load local Roboto Bold font
		const boldResponse = await fetch(robotoBold);
		const boldData = await boldResponse.arrayBuffer();
		const base64Bold = arrayBufferToBase64(boldData);

		// Add fonts to jsPDF
		doc.addFileToVFS("Roboto-Regular.ttf", base64Regular);
		doc.addFileToVFS("Roboto-Bold.ttf", base64Bold);
		doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
		doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");

		fontLoaded = true;
	} catch (error) {
		console.warn("Failed to load Roboto font, falling back to helvetica:", error);
		// Fallback to helvetica if font loading fails
	}
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

export async function generatePDF(readings: GlucoseReading[], dateRange: DateRange, t: TranslationFunction, language: "en" | "pl" = "en") {
	const doc = new jsPDF();
	const locale = language === "pl" ? pl : enUS;

	// Load Roboto font for proper Polish character support
	await loadRobotoFont(doc);
	const fontName = fontLoaded ? "Roboto" : "helvetica";

	// Sort readings ascending (oldest first) for PDF
	const sortedReadings = [...readings].sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());

	// Group by day
	const groupedByDay = groupReadingsByDay(sortedReadings);
	const sortedDates = Object.keys(groupedByDay).sort();

	// Add title
	doc.setFontSize(18);
	doc.setFont(fontName, "bold");
	doc.text(t("pdf.title"), 14, 20);

	// Add date range
	doc.setFontSize(10);
	doc.setFont(fontName, "normal");
	doc.text(`${t("pdf.period")} ${format(dateRange.from, "MMM dd, yyyy", { locale })} - ${format(dateRange.to, "MMM dd, yyyy", { locale })}`, 14, 28);

	// Add target ranges
	doc.setFontSize(9);
	doc.setTextColor(100);
	doc.text(
		t("pdf.targetRanges", {
			fasting: TARGET_RANGES.fasting.toString(),
			meal: TARGET_RANGES["1hr_after_meal"].toString(),
		}),
		14,
		34
	);
	doc.setTextColor(0);

	// Create table data
	const tableData = sortedDates.map((date) => {
		const dayReadings = groupedByDay[date];
		const row: (string | number)[] = [format(parseISO(date), "MMM dd, yyyy", { locale })];

		// Add fasting
		const fasting = dayReadings.find((r) => r.measurement_type === "fasting");
		row.push(fasting ? fasting.glucose_value : "-");

		// Add up to 5 meals
		const meals = dayReadings.filter((r) => r.measurement_type === "1hr_after_meal");
		for (let i = 0; i < 5; i++) {
			row.push(meals[i] ? meals[i].glucose_value : "-");
		}

		return row;
	});

	// Generate table headers
	const headers = [
		t("pdf.headers.date"),
		t("pdf.headers.fasting"),
		t("pdf.headers.meal", { number: "1" }),
		t("pdf.headers.meal", { number: "2" }),
		t("pdf.headers.meal", { number: "3" }),
		t("pdf.headers.meal", { number: "4" }),
		t("pdf.headers.meal", { number: "5" }),
	];

	// Generate table
	autoTable(doc, {
		startY: 40,
		head: [headers],
		body: tableData,
		theme: "grid",
		headStyles: {
			fillColor: [79, 70, 229], // indigo-600
			textColor: 255,
			fontStyle: "bold",
			fontSize: 10,
			font: fontName,
		},
		bodyStyles: {
			fontSize: 9,
			font: fontName,
		},
		columnStyles: {
			0: { cellWidth: 35, fontStyle: "bold", font: fontName },
			1: { cellWidth: 24, halign: "center", font: fontName },
			2: { cellWidth: 24, halign: "center", font: fontName },
			3: { cellWidth: 24, halign: "center", font: fontName },
			4: { cellWidth: 24, halign: "center", font: fontName },
			5: { cellWidth: 24, halign: "center", font: fontName },
			6: { cellWidth: 24, halign: "center", font: fontName },
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
		doc.setFont(fontName, "normal");
		doc.setTextColor(150);
		doc.text(
			t("pdf.footer", {
				current: i.toString(),
				total: pageCount.toString(),
				date: format(new Date(), "MMM dd, yyyy HH:mm", { locale }),
			}),
			14,
			doc.internal.pageSize.height - 10
		);
	}

	// Save PDF
	doc.save(`glucose-readings-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
