import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isMobileDevice(): boolean {
	if (typeof window === "undefined") return false;
	
	const userAgent = navigator.userAgent || navigator.vendor || (window as Window & { opera?: { version: string } }).opera?.version;

  console.log(userAgent);
	// Check for common mobile device patterns
	const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
	return mobileRegex.test(userAgent || "");
}
