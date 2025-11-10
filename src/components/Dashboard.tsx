import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Header } from "./Header";
import { AddRecordDialog } from "./AddRecordDialog";
import { ReadingsTable } from "./ReadingsTable";
import { DateRangeFilter } from "./DateRangeFilter";
import { ExportPDFButton } from "./ExportPDFButton";
import { useReadings } from "@/hooks/useReadings";
import type { DateRange } from "@/types";
import { startOfDay, subDays } from "date-fns";

interface DashboardProps {
	session: Session;
	onSignOut: () => void;
}

export default function Dashboard({ session, onSignOut }: DashboardProps) {
	const [dateRange, setDateRange] = useState<DateRange>({
		from: subDays(startOfDay(new Date()), 6),
		to: startOfDay(new Date()),
	});

	const { readings, loading, error, refetch } = useReadings(dateRange);

	return (
		<div className="min-h-screen bg-gray-50">
			<Header userName={session.user.user_metadata.full_name || session.user.email} onSignOut={onSignOut} />

			<main className="container mx-auto px-4 py-8">
				<div className="space-y-6">
					{/* Action Bar */}
					<div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
						<div>
							<h2 className="text-2xl font-bold">Your Readings</h2>
							<p className="text-muted-foreground">Target: Fasting &lt;91 mg/dL, 1hr After Meal &lt;140 mg/dL</p>
						</div>
						<div className="flex gap-2">
							<ExportPDFButton readings={readings} dateRange={dateRange} />
							<AddRecordDialog onSuccess={refetch} />
						</div>
					</div>

					{/* Filters */}
					<DateRangeFilter dateRange={dateRange} onDateRangeChange={setDateRange} />

					{/* Error State */}
					{error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">Error loading readings: {error}</div>}

					{/* Loading State */}
					{loading && (
						<div className="text-center py-12">
							<div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600"></div>
							<p className="mt-2 text-muted-foreground">Loading readings...</p>
						</div>
					)}

					{/* Readings Table */}
					{!loading && <ReadingsTable readings={readings} />}
				</div>
			</main>
		</div>
	);
}
