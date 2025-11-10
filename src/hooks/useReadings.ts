import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { startOfDay, endOfDay } from "date-fns";
import type { GlucoseReading, DateRange } from "@/types";

export function useReadings(dateRange: DateRange) {
	const [readings, setReadings] = useState<GlucoseReading[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchReadings = useCallback(async () => {
		setLoading(true);
		setError(null);

		const { data, error: fetchError } = await supabase
			.from("glucose_readings")
			.select("*")
			.gte("measured_at", startOfDay(dateRange.from).toISOString())
			.lte("measured_at", endOfDay(dateRange.to).toISOString())
			.order("measured_at", { ascending: false });

		if (fetchError) {
			setError(fetchError.message);
			setLoading(false);
			return;
		}

		setReadings(data || []);
		setLoading(false);
	}, [dateRange.from, dateRange.to]);

	useEffect(() => {
		fetchReadings();
	}, [fetchReadings]);

	return { readings, loading, error, refetch: fetchReadings };
}