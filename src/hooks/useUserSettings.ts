import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { UserSettings } from "@/types";
import OneSignal from "react-onesignal";

interface UseUserSettingsReturn {
	settings: UserSettings | null;
	loading: boolean;
	error: Error | null;
	updateSettings: (enabled: boolean) => Promise<void>;
}

export const useUserSettings = (): UseUserSettingsReturn => {
	const [settings, setSettings] = useState<UserSettings | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	// Fetch settings on mount
	useEffect(() => {
		const fetchSettings = async () => {
			try {
				setLoading(true);
				const {
					data: { user },
				} = await supabase.auth.getUser();

				if (!user) {
					throw new Error("User not authenticated");
				}

				// Try to get existing settings
				const { data: existingSettings, error: fetchError } = await supabase
					.from("user_settings")
					.select("*")
					.eq("user_id", user.id)
					.single();

				if (fetchError && fetchError.code !== "PGRST116") {
					// PGRST116 = not found
					throw fetchError;
				}

				// If no settings exist, create default settings
				if (!existingSettings) {
					const newSettings: Partial<UserSettings> = {
						user_id: user.id,
						push_notifications_enabled: false,
					};

					const { data: createdSettings, error: createError } = await supabase
						.from("user_settings")
						.insert(newSettings)
						.select()
						.single();

					if (createError) throw createError;

					setSettings(createdSettings);
				} else {
					setSettings(existingSettings);
				}
			} catch (err) {
				if (import.meta.env.DEV) {
					console.error("Error fetching user settings:", err);
				}
				setError(err instanceof Error ? err : new Error("Failed to fetch settings"));
			} finally {
				setLoading(false);
			}
		};

		void fetchSettings();
	}, []);

	const updateSettings = useCallback(
		async (enabled: boolean) => {
			try {
				const {
					data: { user },
				} = await supabase.auth.getUser();

				if (!user) {
					throw new Error("User not authenticated");
				}

				// Update Supabase
				const { data: updatedSettings, error: updateError } = await supabase
					.from("user_settings")
					.update({ push_notifications_enabled: enabled })
					.eq("user_id", user.id)
					.select()
					.single();

				if (updateError) throw updateError;

				setSettings(updatedSettings);

			// Sync with OneSignal
			try {
				// Check if OneSignal is initialized before trying to use it
				if (typeof OneSignal !== "undefined" && OneSignal.User) {
					if (enabled) {
						// Enable notifications
						await OneSignal.User.PushSubscription.optIn();
						if (import.meta.env.DEV) {
							console.log("OneSignal: Opted in to push notifications");
						}
					} else {
						// Disable notifications
						await OneSignal.User.PushSubscription.optOut();
						if (import.meta.env.DEV) {
							console.log("OneSignal: Opted out of push notifications");
						}
					}
				} else {
					if (import.meta.env.DEV) {
						console.warn("OneSignal not initialized yet, skipping opt-in/out");
					}
				}
			} catch (oneSignalError) {
				if (import.meta.env.DEV) {
					console.error("Error syncing with OneSignal:", oneSignalError);
				}
				// Don't throw - we want the DB update to succeed even if OneSignal fails
			}
			} catch (err) {
				if (import.meta.env.DEV) {
					console.error("Error updating user settings:", err);
				}
				throw err;
			}
		},
		[]
	);

	return {
		settings,
		loading,
		error,
		updateSettings,
	};
};

