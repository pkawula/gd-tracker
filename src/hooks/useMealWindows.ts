import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { MealWindow } from "@/types";

interface UseMealWindowsReturn {
	mealWindows: MealWindow[] | null;
	loading: boolean;
	error: Error | null;
	updateMealWindow: (window: Partial<MealWindow> & { id: string }) => Promise<void>;
	updateMealWindows: (windows: Partial<MealWindow>[]) => Promise<void>;
	seedDefaultWindows: () => Promise<void>;
}

export const useMealWindows = (): UseMealWindowsReturn => {
	const [mealWindows, setMealWindows] = useState<MealWindow[] | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	// Fetch meal windows on mount
	useEffect(() => {
		const fetchMealWindows = async () => {
			try {
				setLoading(true);
				const {
					data: { user },
				} = await supabase.auth.getUser();

				if (!user) {
					throw new Error("User not authenticated");
				}

				// Fetch all meal windows for the user
				const { data: windows, error: fetchError } = await supabase
					.from("user_meal_windows")
					.select("*")
					.eq("user_id", user.id)
					.order("day_of_week", { ascending: true })
					.order("time_start", { ascending: true });

				if (fetchError) {
					throw fetchError;
				}

				// If no windows exist, seed defaults
				if (!windows || windows.length === 0) {
					if (import.meta.env.DEV) {
						console.log("No meal windows found, seeding defaults...");
					}
					await seedDefaultWindowsInternal(user.id);
					
					// Fetch again after seeding
					const { data: seededWindows, error: refetchError } = await supabase
						.from("user_meal_windows")
						.select("*")
						.eq("user_id", user.id)
						.order("day_of_week", { ascending: true })
						.order("time_start", { ascending: true });

					if (refetchError) throw refetchError;
					setMealWindows(seededWindows || []);
				} else {
					setMealWindows(windows);
				}
			} catch (err) {
				if (import.meta.env.DEV) {
					console.error("Error fetching meal windows:", err);
				}
				setError(err instanceof Error ? err : new Error("Failed to fetch meal windows"));
			} finally {
				setLoading(false);
			}
		};

		void fetchMealWindows();
	}, []);

	// Internal function to seed default windows
	const seedDefaultWindowsInternal = async (userId: string) => {
		const { error: callError } = await supabase.rpc(
			"seed_user_meal_windows_for_user",
			{ target_user_id: userId }
		);

		if (callError) {
			throw callError;
		}
	};

	// Public function to reseed defaults (e.g., "Reset to defaults" button)
	const seedDefaultWindows = useCallback(async () => {
		try {
			const {
				data: { user },
			} = await supabase.auth.getUser();

			if (!user) {
				throw new Error("User not authenticated");
			}

			// Delete existing windows
			const { error: deleteError } = await supabase
				.from("user_meal_windows")
				.delete()
				.eq("user_id", user.id);

			if (deleteError) throw deleteError;

			// Seed defaults
			await seedDefaultWindowsInternal(user.id);

			// Fetch fresh data
			const { data: windows, error: fetchError } = await supabase
				.from("user_meal_windows")
				.select("*")
				.eq("user_id", user.id)
				.order("day_of_week", { ascending: true })
				.order("time_start", { ascending: true });

			if (fetchError) throw fetchError;
			
			setMealWindows(windows || []);
		} catch (err) {
			if (import.meta.env.DEV) {
				console.error("Error seeding default windows:", err);
			}
			throw err;
		}
	}, []);

	// Update a single meal window
	const updateMealWindow = useCallback(
		async (window: Partial<MealWindow> & { id: string }) => {
			try {
				const {
					data: { user },
				} = await supabase.auth.getUser();

				if (!user) {
					throw new Error("User not authenticated");
				}

				// Optimistic update
				setMealWindows((prev) => {
					if (!prev) return prev;
					return prev.map((w) => (w.id === window.id ? { ...w, ...window } : w));
				});

				// Update in database
				const { error: updateError } = await supabase
					.from("user_meal_windows")
					.update(window)
					.eq("id", window.id)
					.eq("user_id", user.id);

				if (updateError) {
					// Revert optimistic update on error
					const { data: windows, error: fetchError } = await supabase
						.from("user_meal_windows")
						.select("*")
						.eq("user_id", user.id)
						.order("day_of_week", { ascending: true })
						.order("time_start", { ascending: true });

					if (!fetchError && windows) {
						setMealWindows(windows);
					}
					
					throw updateError;
				}
			} catch (err) {
				if (import.meta.env.DEV) {
					console.error("Error updating meal window:", err);
				}
				throw err;
			}
		},
		[]
	);

	// Batch update multiple meal windows (useful for "Apply to all days")
	const updateMealWindows = useCallback(
		async (windows: Partial<MealWindow>[]) => {
			try {
				const {
					data: { user },
				} = await supabase.auth.getUser();

				if (!user) {
					throw new Error("User not authenticated");
				}

				// Update each window individually
				// Note: Supabase doesn't support batch updates with different IDs
				// This approach ensures each window is updated separately
				for (const window of windows) {
					if (!window.id) {
						throw new Error("Window ID is required for update");
					}

					const { error: updateError } = await supabase
						.from("user_meal_windows")
						.update(window)
						.eq("id", window.id)
						.eq("user_id", user.id);

					if (updateError) throw updateError;
				}

				// Fetch updated data
				const { data: updatedWindows, error: fetchError } = await supabase
					.from("user_meal_windows")
					.select("*")
					.eq("user_id", user.id)
					.order("day_of_week", { ascending: true })
					.order("time_start", { ascending: true });

				if (fetchError) throw fetchError;
				
				setMealWindows(updatedWindows || []);
			} catch (err) {
				if (import.meta.env.DEV) {
					console.error("Error updating meal windows:", err);
				}
				throw err;
			}
		},
		[]
	);

	return {
		mealWindows,
		loading,
		error,
		updateMealWindow,
		updateMealWindows,
		seedDefaultWindows,
	};
};

