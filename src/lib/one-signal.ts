import { useCallback, useEffect, useRef, useState } from "react";
import OneSignal from "react-onesignal";
import { useTranslation } from "./i18n";
import { supabase } from "./supabase";

export const useOneSignal = () => {
  const serviceInitialized = useRef(false);
  const initializationPromise = useRef<Promise<void> | null>(null);
  const [isReady, setIsReady] = useState(false);

  const { language, t } = useTranslation();

  useEffect(() => {
    if (isReady) {
      OneSignal.User.setLanguage(language);
    }
  }, [isReady, language]);

  useEffect(() => {
    const initializeService = async () => {
      // Prevent multiple initializations
      if (serviceInitialized.current || initializationPromise.current) {
        return;
      }

      const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
      if (!appId || typeof window === "undefined") {
        return;
      }
      
      // Get theme preference for styling
      const isDarkMode = document.documentElement.classList.contains("dark");

      try {
        // Store the promise to prevent concurrent initializations
        initializationPromise.current = OneSignal.init({
          appId,
          safari_web_id: import.meta.env.VITE_ONESIGNAL_SAFARI_WEB_ID,
          serviceWorkerPath: "push/onesignal/OneSignalSDKWorker.js",
          serviceWorkerParam: { scope: "/push/onesignal/js/" },
          allowLocalhostAsSecureOrigin: import.meta.env.DEV,
          welcomeNotification: {
            message: t("notifications.welcome.message"),
            title: t("notifications.welcome.title"),
            url: window.location.origin,
          },
          promptOptions: {
            slidedown: {
              prompts: [
                {
                  autoPrompt: true,
                  categories: [
                    {
                      tag: "notifications",
                      label: t("notifications.categories.reminders"),
                    },
                    {
                      tag: "updates",
                      label: t("notifications.categories.updates"),
                    }
                  ],
                  delay: {
                    pageViews: 1,
                  },
                  text: {
                    actionMessage: t("notifications.prompt.message"),
                    acceptButton: t("notifications.prompt.allow"),
                    cancelMessage: t("notifications.prompt.notNow"),
                    confirmMessage: t("notifications.prompt.enable"),
                    negativeUpdateButton: t("notifications.prompt.disable"),
                    positiveUpdateButton: t("notifications.prompt.enable"),
                    updateMessage: t("notifications.prompt.explanation"),
                  },
                  type: "push",
                }
              ]
            }
          }
        });

        await initializationPromise.current;

        serviceInitialized.current = true;
        setIsReady(true);

        // Register permission change listener to sync with Supabase
        OneSignal.Notifications.addEventListener("permissionChange", async (granted) => {
          try {
            const {
              data: { user },
            } = await supabase.auth.getUser();

            if (!user) return;

            // When user grants permission, update settings in Supabase
            if (granted) {
              const { error } = await supabase
                .from("user_settings")
                .upsert(
                  {
                    user_id: user.id,
                    push_notifications_enabled: true,
                  },
                  {
                    onConflict: "user_id",
                  }
                );

              if (error && import.meta.env.DEV) {
                console.error("Error syncing permission to Supabase:", error);
              }
            }
          } catch (error) {
            if (import.meta.env.DEV) {
              console.error("Error in permission change handler:", error);
            }
          }
        });

        // Check initial permission state and sync to DB
        const initialPermission = OneSignal.Notifications.permission;
        if (initialPermission) {
          try {
            const {
              data: { user },
            } = await supabase.auth.getUser();

            if (user) {
              await supabase
                .from("user_settings")
                .upsert(
                  {
                    user_id: user.id,
                    push_notifications_enabled: initialPermission,
                  },
                  {
                    onConflict: "user_id",
                  }
                );
            }
          } catch (error) {
            if (import.meta.env.DEV) {
              console.error("Error syncing initial permission:", error);
            }
          }
        }

        // Apply custom styling to match project UI
        // We'll inject styles after OneSignal loads to ensure proper override
        let styleApplied = false;
        
        const applyCustomStyles = () => {
          // Only apply once - check if style element already exists
          if (document.getElementById("gd-tracker-onesignal-custom")) {
            return;
          }

          const style = document.createElement("style");
          style.id = "gd-tracker-onesignal-custom";
          style.textContent = `
            /* OneSignal Slidedown Customization - GD Tracker Theme */
            /* Using same specificity as OneSignal: #container #dialog */
            
            #onesignal-slidedown-container {
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
              z-index: 999999 !important;
            }
            
            /* Dialog container - matching OneSignal's #container #dialog specificity */
            #onesignal-slidedown-container #onesignal-slidedown-dialog {
              background: ${isDarkMode ? "oklch(0.18 0.05 265)" : "oklch(1 0 0)"} !important;
              border: 1px solid ${isDarkMode ? "oklch(0.25 0.05 265)" : "oklch(0.92 0.02 265)"} !important;
              border-radius: 0.75rem !important;
              padding: 1.5rem !important;
              box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1) !important;
              max-width: 450px !important;
              margin: 0 auto !important;
              box-sizing: border-box !important;
            }
            
            /* Text content */
            #onesignal-slidedown-container #onesignal-slidedown-dialog .slidedown-body,
            #onesignal-slidedown-container #onesignal-slidedown-dialog .slidedown-body-message {
              color: ${isDarkMode ? "oklch(0.98 0.01 165)" : "oklch(0.20 0.06 265)"} !important;
              font-size: 0.95rem !important;
              line-height: 1.6 !important;
              margin-bottom: 1.25rem !important;
              padding: 0 0 0 1em !important;
            }
            
            /* Primary "Allow" button - Mint Green */
            #onesignal-slidedown-container #onesignal-slidedown-dialog .onesignal-slidedown-allow-button,
            #onesignal-slidedown-container #onesignal-slidedown-dialog .primary.slidedown-button,
            #onesignal-slidedown-container #onesignal-slidedown-dialog button.primary {
              background: oklch(0.78 0.13 165) !important;
              background-color: oklch(0.78 0.13 165) !important;
              color: oklch(0.20 0.06 265) !important;
              border: none !important;
              border-radius: 0.5rem !important;
              font-weight: 500 !important;
              padding: 0.625rem 1.5rem !important;
              transition: all 0.15s ease !important;
              font-size: 0.9rem !important;
              cursor: pointer !important;
              box-shadow: none !important;
            }
            
            #onesignal-slidedown-container #onesignal-slidedown-dialog .onesignal-slidedown-allow-button:hover,
            #onesignal-slidedown-container #onesignal-slidedown-dialog .primary.slidedown-button:hover {
              background: oklch(0.72 0.13 165) !important;
              background-color: oklch(0.72 0.13 165) !important;
              transform: translateY(-1px) !important;
              box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1) !important;
            }
            
            #onesignal-slidedown-container #onesignal-slidedown-dialog .onesignal-slidedown-allow-button:active {
              transform: translateY(0) !important;
            }
            
            /* Secondary "Cancel" button */
            #onesignal-slidedown-container #onesignal-slidedown-dialog .onesignal-slidedown-cancel-button,
            #onesignal-slidedown-container #onesignal-slidedown-dialog .secondary.slidedown-button,
            #onesignal-slidedown-container #onesignal-slidedown-dialog button.secondary {
              background: transparent !important;
              background-color: transparent !important;
              color: ${isDarkMode ? "oklch(0.70 0.04 265)" : "oklch(0.55 0.04 265)"} !important;
              border: 1px solid ${isDarkMode ? "oklch(0.25 0.05 265)" : "oklch(0.92 0.02 265)"} !important;
              border-radius: 0.5rem !important;
              font-weight: 500 !important;
              padding: 0.625rem 1.5rem !important;
              transition: all 0.15s ease !important;
              font-size: 0.9rem !important;
              cursor: pointer !important;
              box-shadow: none !important;
            }
            
            #onesignal-slidedown-container #onesignal-slidedown-dialog .onesignal-slidedown-cancel-button:hover,
            #onesignal-slidedown-container #onesignal-slidedown-dialog .secondary.slidedown-button:hover {
              background: ${isDarkMode ? "oklch(0.25 0.05 265)" : "oklch(0.97 0.01 265)"} !important;
              background-color: ${isDarkMode ? "oklch(0.25 0.05 265)" : "oklch(0.97 0.01 265)"} !important;
              border-color: ${isDarkMode ? "oklch(0.28 0.05 265)" : "oklch(0.88 0.02 265)"} !important;
            }
            
            /* Button container */
            #onesignal-slidedown-container #onesignal-slidedown-dialog .slidedown-button-container {
              display: flex !important;
              gap: 0.75rem !important;
              margin-top: 1rem !important;
              flex-wrap: wrap !important;
            }
            
            /* Icon styling */
            #onesignal-slidedown-container #onesignal-slidedown-dialog .slidedown-body-icon {
              filter: ${isDarkMode ? "brightness(1.2)" : "brightness(1)"} !important;
            }
          `;
          
          // Append to end of head to ensure it comes after OneSignal's styles
          document.head.appendChild(style);
          styleApplied = true;
        };

        // Watch for OneSignal DOM changes and apply styles once when slidedown appears
        let observerDisconnected = false;
        const observer = new MutationObserver((mutations) => {
          if (styleApplied || observerDisconnected) {
            return;
          }

          for (const mutation of mutations) {
            if (mutation.type === "childList") {
              const addedNodes = Array.from(mutation.addedNodes);
              // Check if OneSignal slidedown was added
              const hasSlidedown = addedNodes.some(
                (node) =>
                  node instanceof HTMLElement &&
                  (node.id === "onesignal-slidedown-container" ||
                    node.className?.includes("onesignal-slidedown"))
              );
              
              if (hasSlidedown) {
                // Apply styles once when slidedown appears
                setTimeout(() => {
                  applyCustomStyles();
                  // Disconnect observer after applying styles
                  observer.disconnect();
                  observerDisconnected = true;
                }, 50);
                break;
              }
            }
          }
        });

        // Observe document for OneSignal slidedown
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error("Error initializing OneSignal:", error);
        }
        // Reset on error to allow retry
        initializationPromise.current = null;
      }
    };

    void initializeService();
  }, [t]);

  const loginUserToOneSignal = useCallback(
    async (externalUserId: string) => {
      try {
        // Wait for initialization if it's in progress
        if (initializationPromise.current && !serviceInitialized.current) {
          await initializationPromise.current;
        }

        if (!serviceInitialized.current) {
          if (import.meta.env.DEV) {
            console.warn("OneSignal not initialized, cannot login user");
          }
          return;
        }

        await OneSignal.login(externalUserId);

        OneSignal.User.setLanguage(language);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error("Error logging in to OneSignal:", error);
        }
      }
    },
    [language]
  );

  const logoutUserFromOneSignal = useCallback(async () => {
    try {
      if (!serviceInitialized.current) {
        return;
      }

      OneSignal.User.removeTag("email");
      await OneSignal.logout();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error logging out of OneSignal:", error);
      }
    }
  }, []);

  return {
    loginUserToOneSignal,
    logoutUserFromOneSignal,
    isReady,
  };
};
