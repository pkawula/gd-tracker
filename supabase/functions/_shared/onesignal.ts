/**
 * Shared OneSignal utilities for sending push notifications
 * Uses OneSignal REST API to send reminders to users by external_user_id
 * Supports localized messages in English and Polish
 */

interface OneSignalConfig {
  appId: string;
  restApiKey: string;
}

interface NotificationPayload {
  externalUserId: string;
  headings: Record<string, string>;
  contents: Record<string, string>;
  data?: Record<string, unknown>;
}

interface OneSignalResponse {
  id?: string;
  recipients?: number;
  errors?: unknown;
}

/**
 * Localized notification translations
 * Structure mirrors src/locales/*.json for consistency
 */
const translations = {
  en: {
    fasting: {
      heading: "🩸 Fasting Glucose Reminder",
      content: "Time to measure your fasting glucose level",
    },
    "1hr_after_meal": {
      heading: "🩸 Post-Meal Glucose Reminder",
      content: "Time to measure your glucose level (1hr after meal)",
    },
  },
  pl: {
    fasting: {
      heading: "🩸 Przypomnienie o pomiarze na czczo",
      content: "Czas zmierzyć poziom glukozy na czczo",
    },
    "1hr_after_meal": {
      heading: "🩸 Przypomnienie o pomiarze po posiłku",
      content: "Czas zmierzyć poziom glukozy (1h po posiłku)",
    },
  },
};

/**
 * Send a push notification via OneSignal REST API
 * @param config OneSignal credentials
 * @param payload Notification content and recipient (with localized headings/contents)
 * @returns OneSignal notification ID if successful
 * @throws Error if OneSignal API returns an error
 */
export async function sendPushNotification(
  config: OneSignalConfig,
  payload: NotificationPayload,
): Promise<string> {
  const url = "https://api.onesignal.com/notifications?c=push";

  const body = {
    app_id: config.appId,
    // Use include_aliases with external_id array, not include_external_user_ids
    include_aliases: {
      external_id: [payload.externalUserId],
    },
    target_channel: "push",
    headings: payload.headings, // ensure same languages as contents if provided
    contents: payload.contents, // must include 'en'
    data: payload.data ?? {},
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Per spec: Authorization header with "Key " prefix
      Authorization: `Key ${config.restApiKey}`, // ensure this is the App API key
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as OneSignalResponse;

  if (!response.ok) {
    throw new Error(
      `OneSignal API error (${response.status}): ${
        JSON.stringify(
          (data as any).errors ?? data,
        )
      }`,
    );
  }

  if (!data.id) {
    // id is empty string when not sent
    throw new Error("OneSignal response missing notification ID");
  }

  return data.id;
}

/**
 * Get localized notification messages for both supported languages
 * OneSignal will display the message in the user's device language
 *
 * @param measurementType Type of glucose measurement
 * @param userLanguage User's preferred language (used as primary)
 * @returns Headings and contents for both languages
 */
export function getNotificationMessages(
  measurementType: "fasting" | "1hr_after_meal",
): {
  headings: Record<string, string>;
  contents: Record<string, string>;
} {
  return {
    headings: {
      en: translations.en[measurementType].heading,
      pl: translations.pl[measurementType].heading,
    },
    contents: {
      en: translations.en[measurementType].content,
      pl: translations.pl[measurementType].content,
    },
  };
}
