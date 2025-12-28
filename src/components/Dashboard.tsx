import { useState, useRef, useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { Header } from "./Header";
import { RecordDialog } from "./RecordDialog";
import { ReadingsTable } from "./ReadingsTable";
import { DateRangeFilter } from "./DateRangeFilter";
import { ExportPDFButton } from "./ExportPDFButton";
import { useReadings } from "@/hooks/useReadings";
import { useTranslation } from "@/lib/i18n";
import { isMobileDevice } from "@/lib/utils";
import type { DateRange, GlucoseReading, MeasurementType } from "@/types";
import { startOfDay, subDays } from "date-fns";
import { Plus } from "lucide-react";
import { Button } from "./ui/button";

interface DashboardProps {
	session: Session;
	onSignOut: () => void;
}

export default function Dashboard({ session, onSignOut }: DashboardProps) {
	const { t } = useTranslation();
	const [dateRange, setDateRange] = useState<DateRange>({
		from: subDays(startOfDay(new Date()), 6),
		to: startOfDay(new Date()),
	});
	const [editDialogOpen, setEditDialogOpen] = useState(false);
	const [addDialogOpen, setAddDialogOpen] = useState(false);
	const [selectedReading, setSelectedReading] = useState<GlucoseReading | null>(null);
	const [isMobile, setIsMobile] = useState(false);
	const scrollPositionRef = useRef<number>(0);

	const { readings, loading, error, refetch, deleteReading } = useReadings(dateRange);

	useEffect(() => {
		setIsMobile(isMobileDevice());
	}, []);

	const handleEdit = (reading: GlucoseReading) => {
		// Save current scroll position
		scrollPositionRef.current = window.scrollY;
		setSelectedReading(reading);
		setEditDialogOpen(true);
	};

	const handleEditSuccess = () => {
		setEditDialogOpen(false);
		refetch().then(() => {
			// Restore scroll position after a brief delay to allow DOM update
			setTimeout(() => {
				window.scrollTo({ top: scrollPositionRef.current, behavior: "instant" });
			}, 100);
		});
		setSelectedReading(null);
	};

	const handleAddSuccess = () => {
		setAddDialogOpen(false);
		refetch();
	};

	// Smart button logic
	const now = new Date();
	const isBeforeTenAM = now.getHours() < 10;

	// Filter readings for today
	const todayStart = startOfDay(new Date());
	const hasReadingsToday = readings.some((r) => new Date(r.measured_at) >= todayStart);

	// Determine smart button text
	const addButtonText = !hasReadingsToday && isBeforeTenAM ? t("readings.addFasting") : t("readings.add");

	// Determine prefill measurement type
	const prefillMeasurementType: MeasurementType = isBeforeTenAM ? "fasting" : "1hr_after_meal";

	return (
		<div className="min-h-screen bg-background">
			<Header userName={session.user.user_metadata.full_name || session.user.email} onSignOut={onSignOut} />

			<main className="container mx-auto px-4 py-8">
				<div className="space-y-6">
					{/* Action Bar */}
					<div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
						<div>
							<h2 className="text-2xl font-bold">{t("dashboard.title")}</h2>
							<p className="text-muted-foreground">{t("dashboard.target")}</p>
						</div>
						<div className="flex gap-2">
							<ExportPDFButton readings={readings} dateRange={dateRange} />
							<Button size="lg" className="gap-2" onClick={() => setAddDialogOpen(true)}>
								<Plus className="h-5 w-5" />
								{addButtonText}
							</Button>
						</div>
					</div>

					{/* Filters */}
					<DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} />

					{/* Error State */}
					{error && (
						<div className="bg-destructive/10 dark:bg-destructive/20 border border-destructive/20 text-destructive px-4 py-3 rounded-md">
							{t("dashboard.errorLoading")} {error}
						</div>
					)}

					{/* Loading State */}
					{loading && (
						<div className="text-center py-12">
							<div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-muted border-t-primary"></div>
							<p className="mt-2 text-muted-foreground">{t("dashboard.loadingReadings")}</p>
						</div>
					)}

					{/* Readings Table */}
					{!loading && <ReadingsTable readings={readings} onDelete={deleteReading} onEdit={handleEdit} />}

					{/* Edit Dialog */}
					{selectedReading && (
						<RecordDialog
							mode="edit"
							reading={selectedReading}
							open={editDialogOpen}
							onOpenChange={setEditDialogOpen}
							onSuccess={handleEditSuccess}
						/>
					)}

					{/* Add Dialog */}
					<RecordDialog
						mode="add"
						open={addDialogOpen}
						onOpenChange={setAddDialogOpen}
						onSuccess={handleAddSuccess}
						initialMeasurementType={prefillMeasurementType}
					/>
				</div>
			</main>

			{/* Floating Action Button - Mobile Devices Only */}
			{isMobile && (
				<Button
					onClick={() => setAddDialogOpen(true)}
					className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
					size="icon"
					aria-label={addButtonText}
				>
					<Plus className="h-6 w-6" />
				</Button>
			)}
		</div>
	);
}
