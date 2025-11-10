# 📋 Complete Implementation Plan: Gestational Diabetes Tracker MVP with React 19

## Tech Stack Summary

- **Frontend**: React 19 + TypeScript + Vite
- **UI**: shadcn/ui + Tailwind CSS
- **Backend**: Supabase (Auth + Database)
- **PDF Generation**: jsPDF + jsPDF-AutoTable
- **PWA**: vite-plugin-pwa
- **Deployment**: Static hosting

---

## 🗂️ Database Schema (Supabase)

```sql
-- Table: glucose_readings
CREATE TABLE glucose_readings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  glucose_value INTEGER NOT NULL,
  measurement_type TEXT NOT NULL CHECK (measurement_type IN ('fasting', '1hr_after_meal')),
  measured_at TIMESTAMPTZ NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX idx_glucose_readings_user_measured
  ON glucose_readings(user_id, measured_at DESC);

-- Row Level Security
ALTER TABLE glucose_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own readings"
  ON glucose_readings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own readings"
  ON glucose_readings FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

---

## 📁 Project Structure

```text
gestational-diabetes-tracker/
├── public/
│   ├── manifest.json
│   └── icons/ (PWA icons in various sizes)
├── src/
│   ├── components/
│   │   ├── ui/ (shadcn components)
│   │   ├── AddRecordButton.tsx
│   │   ├── AddRecordDialog.tsx
│   │   ├── Dashboard.tsx
│   │   ├── ReadingsTable.tsx
│   │   ├── DateRangeFilter.tsx
│   │   ├── ExportPDFButton.tsx
│   │   └── Header.tsx
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── utils.ts
│   │   └── pdf-generator.ts
│   ├── hooks/
│   │   └── useReadings.ts
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── .env.local
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## 🔧 Phase 1: Project Setup (Day 1)

### 1. Initialize Project with React 19

```bash
npm create vite@latest gd-tracker -- --template react-ts
cd gd-tracker
npm install react@19 react-dom@19
```

### 2. Install Dependencies

```bash
# UI & Styling
npm install @radix-ui/react-dialog @radix-ui/react-select @radix-ui/react-label
npm install tailwindcss postcss autoprefixer
npm install class-variance-authority clsx tailwind-merge
npm install lucide-react date-fns

# Supabase
npm install @supabase/supabase-js

# PDF Generation
npm install jspdf jspdf-autotable
npm install -D @types/jspdf-autotable

# PWA
npm install -D vite-plugin-pwa
```

### 3. Setup Tailwind

```bash
npx tailwindcss init -p
```

**Update `tailwind.config.js`:**

```js
/** @type {import('tailwindcss').Config} */
export default {
	darkMode: ["class"],
	content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
	theme: {
		extend: {},
	},
	plugins: [],
};
```

**Update `src/index.css`:**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
	:root {
		--background: 0 0% 100%;
		--foreground: 222.2 84% 4.9%;
		--card: 0 0% 100%;
		--card-foreground: 222.2 84% 4.9%;
		--popover: 0 0% 100%;
		--popover-foreground: 222.2 84% 4.9%;
		--primary: 222.2 47.4% 11.2%;
		--primary-foreground: 210 40% 98%;
		--secondary: 210 40% 96.1%;
		--secondary-foreground: 222.2 47.4% 11.2%;
		--muted: 210 40% 96.1%;
		--muted-foreground: 215.4 16.3% 46.9%;
		--accent: 210 40% 96.1%;
		--accent-foreground: 222.2 47.4% 11.2%;
		--destructive: 0 84.2% 60.2%;
		--destructive-foreground: 210 40% 98%;
		--border: 214.3 31.8% 91.4%;
		--input: 214.3 31.8% 91.4%;
		--ring: 222.2 84% 4.9%;
		--radius: 0.5rem;
	}
}

@layer base {
	* {
		@apply border-border;
	}
	body {
		@apply bg-background text-foreground;
	}
}
```

### 4. Setup shadcn

```bash
npx shadcn-ui@latest init
```

### 5. Install shadcn components

```bash
npx shadcn-ui@latest add button dialog label input select card table badge textarea
```

---

## 🔧 Phase 2: Supabase Configuration (Day 1)

### 1. Create Supabase Project

- Go to [supabase.com](https://supabase.com) and create new project
- Navigate to Authentication → Providers
- Enable Google OAuth provider
- Add authorized redirect URLs:
  - Development: `http://localhost:5173/`
  - Production: `https://yourdomain.com/`

### 2. Run Database Schema

- Go to SQL Editor in Supabase dashboard
- Run the database schema from above

### 3. Create `.env.local`

```bash
VITE_SUPABASE_PROJECT_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 4. Create `src/lib/supabase.ts`

```ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_PROJECT_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### 5. Create `src/lib/utils.ts`

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
```

---

## 🔧 Phase 3: Core Types & Utilities (Day 1)

### `src/types/index.ts`

```ts
export type MeasurementType = "fasting" | "1hr_after_meal";

export interface GlucoseReading {
	id: string;
	user_id: string;
	glucose_value: number;
	measurement_type: MeasurementType;
	measured_at: string;
	comment?: string;
	created_at: string;
}

export interface DateRange {
	from: Date;
	to: Date;
}

export const TARGET_RANGES = {
	fasting: 91,
	"1hr_after_meal": 140,
} as const;

export type DateRangePreset = "today" | "7days" | "30days" | "custom";
```

---

## 🔧 Phase 4: Authentication with React 19 (Day 2)

### `src/App.tsx`

```tsx
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { Session } from "@supabase/supabase-js";
import Dashboard from "./components/Dashboard";
import { Button } from "./components/ui/button";

function App() {
	const [session, setSession] = useState<Session | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		supabase.auth.getSession().then(({ data: { session } }) => {
			setSession(session);
			setLoading(false);
		});

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, session) => {
			setSession(session);
		});

		return () => subscription.unsubscribe();
	}, []);

	async function handleSignIn() {
		await supabase.auth.signInWithOAuth({
			provider: "google",
			options: {
				redirectTo: window.location.origin,
			},
		});
	}

	async function handleSignOut() {
		await supabase.auth.signOut();
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-muted-foreground">Loading...</div>
			</div>
		);
	}

	if (!session) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
				<div className="text-center space-y-6 p-8 bg-white rounded-lg shadow-lg">
					<div className="space-y-2">
						<h1 className="text-3xl font-bold text-gray-900">GD Tracker</h1>
						<p className="text-muted-foreground">Track your gestational diabetes glucose readings</p>
					</div>
					<Button onClick={handleSignIn} size="lg" className="w-full">
						<svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
							<path
								fill="currentColor"
								d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
							/>
							<path
								fill="currentColor"
								d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
							/>
							<path
								fill="currentColor"
								d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
							/>
							<path
								fill="currentColor"
								d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
							/>
						</svg>
						Sign in with Google
					</Button>
				</div>
			</div>
		);
	}

	return <Dashboard onSignOut={handleSignOut} session={session} />;
}

export default App;
```

---

## 🔧 Phase 5: Main Features with React 19 (Days 3-4)

### 1. `src/hooks/useReadings.ts`

```ts
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { GlucoseReading, DateRange } from "@/types";
import { startOfDay, endOfDay } from "date-fns";

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
```

### 2. `src/components/AddRecordDialog.tsx`

```tsx
import { useState, useActionState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { supabase } from "@/lib/supabase";
import { Plus } from "lucide-react";
import { MeasurementType } from "@/types";

async function addReadingAction(prevState: any, formData: FormData) {
	const glucoseValue = parseInt(formData.get("glucose_value") as string);
	const measurementType = formData.get("measurement_type") as MeasurementType;
	const measuredAt = formData.get("measured_at") as string;
	const comment = formData.get("comment") as string;

	// Validation
	if (!glucoseValue || glucoseValue < 0 || glucoseValue > 500) {
		return { error: "Glucose value must be between 0 and 500", success: false };
	}

	if (!measurementType) {
		return { error: "Measurement type is required", success: false };
	}

	const { error } = await supabase.from("glucose_readings").insert({
		glucose_value: glucoseValue,
		measurement_type: measurementType,
		measured_at: measuredAt,
		comment: comment || null,
	});

	if (error) {
		return { error: error.message, success: false };
	}

	return { error: null, success: true };
}

export function AddRecordDialog({ onSuccess }: { onSuccess: () => void }) {
	const [open, setOpen] = useState(false);
	const [measurementType, setMeasurementType] = useState<MeasurementType>("fasting");
	const [state, submitAction, isPending] = useActionState(addReadingAction, {
		error: null,
		success: false,
	});

	// Get current datetime in local format for input
	const now = new Date();
	const localDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

	// Close dialog and refresh on success
	if (state.success && open) {
		setOpen(false);
		onSuccess();
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="lg" className="gap-2">
					<Plus className="h-5 w-5" />
					Add Reading
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Add Glucose Reading</DialogTitle>
				</DialogHeader>
				<form action={submitAction} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="glucose_value">Glucose Level (mg/dL) *</Label>
						<Input id="glucose_value" name="glucose_value" type="number" required min="0" max="500" placeholder="Enter glucose value" autoFocus />
					</div>

					<div className="space-y-2">
						<Label htmlFor="measurement_type">Measurement Type *</Label>
						<Select name="measurement_type" value={measurementType} onValueChange={(value) => setMeasurementType(value as MeasurementType)} required>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="fasting">Fasting</SelectItem>
								<SelectItem value="1hr_after_meal">1hr After Meal</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="measured_at">Date & Time *</Label>
						<Input id="measured_at" name="measured_at" type="datetime-local" defaultValue={localDatetime} required />
					</div>

					<div className="space-y-2">
						<Label htmlFor="comment">Notes (Optional)</Label>
						<Textarea id="comment" name="comment" placeholder="Add any relevant notes..." rows={3} />
					</div>

					{state.error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">{state.error}</div>}

					<div className="flex gap-2">
						<Button type="submit" disabled={isPending} className="flex-1">
							{isPending ? "Adding..." : "Add Reading"}
						</Button>
						<Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
							Cancel
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
```

### 3. `src/components/ReadingsTable.tsx`

```tsx
import { GlucoseReading, TARGET_RANGES } from "@/types";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { cn } from "@/lib/utils";

interface ReadingsTableProps {
	readings: GlucoseReading[];
}

function getValueStatus(value: number, type: GlucoseReading["measurement_type"]) {
	const target = TARGET_RANGES[type];
	if (value < target) return "in-range";
	if (value <= target + 5) return "warning";
	return "out-of-range";
}

function getStatusColor(status: string) {
	switch (status) {
		case "in-range":
			return "text-green-600 bg-green-50 border-green-200";
		case "warning":
			return "text-amber-600 bg-amber-50 border-amber-200";
		case "out-of-range":
			return "text-red-600 bg-red-50 border-red-200";
		default:
			return "";
	}
}

export function ReadingsTable({ readings }: ReadingsTableProps) {
	if (readings.length === 0) {
		return (
			<Card className="p-12 text-center">
				<div className="space-y-2">
					<p className="text-lg font-medium text-muted-foreground">No readings found</p>
					<p className="text-sm text-muted-foreground">Add your first reading to get started</p>
				</div>
			</Card>
		);
	}

	return (
		<Card>
			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[180px]">Date & Time</TableHead>
							<TableHead className="w-[140px]">Type</TableHead>
							<TableHead className="w-[120px]">Glucose (mg/dL)</TableHead>
							<TableHead className="w-[140px]">Status</TableHead>
							<TableHead>Notes</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{readings.map((reading) => {
							const status = getValueStatus(reading.glucose_value, reading.measurement_type);
							return (
								<TableRow key={reading.id}>
									<TableCell className="font-medium">{format(new Date(reading.measured_at), "MMM dd, yyyy HH:mm")}</TableCell>
									<TableCell>
										<Badge variant="outline" className="whitespace-nowrap">
											{reading.measurement_type === "fasting" ? "Fasting" : "1hr After Meal"}
										</Badge>
									</TableCell>
									<TableCell>
										<span className={cn("font-semibold text-lg", getStatusColor(status).split(" ")[0])}>{reading.glucose_value}</span>
									</TableCell>
									<TableCell>
										<Badge className={cn("whitespace-nowrap border", getStatusColor(status))}>
											{status === "in-range" && "✓ In Range"}
											{status === "warning" && "⚠ Near Limit"}
											{status === "out-of-range" && "✗ Out of Range"}
										</Badge>
									</TableCell>
									<TableCell className="text-muted-foreground text-sm max-w-xs truncate">{reading.comment || "—"}</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>
		</Card>
	);
}
```

### 4. `src/components/DateRangeFilter.tsx`

```tsx
import { useState } from "react";
import { DateRange, DateRangePreset } from "@/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import { startOfDay, subDays, format } from "date-fns";
import { Calendar } from "lucide-react";

interface DateRangeFilterProps {
	dateRange: DateRange;
	onDateRangeChange: (range: DateRange) => void;
}

export function DateRangeFilter({ dateRange, onDateRangeChange }: DateRangeFilterProps) {
	const [preset, setPreset] = useState<DateRangePreset>("7days");
	const [showCustom, setShowCustom] = useState(false);

	function handlePresetChange(newPreset: DateRangePreset) {
		setPreset(newPreset);
		setShowCustom(false);

		const today = startOfDay(new Date());

		switch (newPreset) {
			case "today":
				onDateRangeChange({ from: today, to: today });
				break;
			case "7days":
				onDateRangeChange({ from: subDays(today, 6), to: today });
				break;
			case "30days":
				onDateRangeChange({ from: subDays(today, 29), to: today });
				break;
			case "custom":
				setShowCustom(true);
				break;
		}
	}

	function handleCustomRangeChange(type: "from" | "to", value: string) {
		const newDate = startOfDay(new Date(value));
		onDateRangeChange({
			...dateRange,
			[type]: newDate,
		});
	}

	return (
		<Card className="p-4">
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<Calendar className="h-4 w-4 text-muted-foreground" />
					<h3 className="font-medium">Date Range</h3>
				</div>

				<div className="flex flex-wrap gap-2">
					<Button variant={preset === "today" ? "default" : "outline"} size="sm" onClick={() => handlePresetChange("today")}>
						Today
					</Button>
					<Button variant={preset === "7days" ? "default" : "outline"} size="sm" onClick={() => handlePresetChange("7days")}>
						Last 7 Days
					</Button>
					<Button variant={preset === "30days" ? "default" : "outline"} size="sm" onClick={() => handlePresetChange("30days")}>
						Last 30 Days
					</Button>
					<Button variant={preset === "custom" ? "default" : "outline"} size="sm" onClick={() => handlePresetChange("custom")}>
						Custom Range
					</Button>
				</div>

				{showCustom && (
					<div className="grid grid-cols-2 gap-4 pt-2 border-t">
						<div className="space-y-2">
							<Label htmlFor="from-date">From</Label>
							<Input
								id="from-date"
								type="date"
								value={format(dateRange.from, "yyyy-MM-dd")}
								onChange={(e) => handleCustomRangeChange("from", e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="to-date">To</Label>
							<Input
								id="to-date"
								type="date"
								value={format(dateRange.to, "yyyy-MM-dd")}
								onChange={(e) => handleCustomRangeChange("to", e.target.value)}
							/>
						</div>
					</div>
				)}

				<div className="text-sm text-muted-foreground pt-2 border-t">
					Showing: {format(dateRange.from, "MMM dd, yyyy")} - {format(dateRange.to, "MMM dd, yyyy")}
				</div>
			</div>
		</Card>
	);
}
```

### 5. `src/components/Header.tsx`

```tsx
import { Button } from "./ui/button";
import { LogOut } from "lucide-react";

interface HeaderProps {
	userName?: string;
	onSignOut: () => void;
}

export function Header({ userName, onSignOut }: HeaderProps) {
	return (
		<header className="border-b bg-white">
			<div className="container mx-auto px-4 py-4 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
						<span className="text-white font-bold text-xl">GD</span>
					</div>
					<div>
						<h1 className="text-xl font-bold">GD Tracker</h1>
						<p className="text-xs text-muted-foreground">Gestational Diabetes Monitor</p>
					</div>
				</div>

				<div className="flex items-center gap-4">
					{userName && <span className="text-sm text-muted-foreground">{userName}</span>}
					<Button variant="ghost" size="sm" onClick={onSignOut} className="gap-2">
						<LogOut className="h-4 w-4" />
						Sign Out
					</Button>
				</div>
			</div>
		</header>
	);
}
```

### 6. `src/components/Dashboard.tsx`

```tsx
import { useState } from "react";
import { Session } from "@supabase/supabase-js";
import { Header } from "./Header";
import { AddRecordDialog } from "./AddRecordDialog";
import { ReadingsTable } from "./ReadingsTable";
import { DateRangeFilter } from "./DateRangeFilter";
import { ExportPDFButton } from "./ExportPDFButton";
import { useReadings } from "@/hooks/useReadings";
import { DateRange } from "@/types";
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
```

---

## 🔧 Phase 6: PDF Export (Day 5)

### 1. `src/lib/pdf-generator.ts`

```ts
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import { GlucoseReading, DateRange } from "@/types";

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
	doc.text("Target Ranges: Fasting <91 mg/dL | 1hr After Meal <140 mg/dL", 14, 34);
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
					const isFirstCol = data.column.index === 1;
					const target = isFirstCol ? 91 : 140;

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
```

### 2. `src/components/ExportPDFButton.tsx`

```tsx
import { Button } from "./ui/button";
import { Download } from "lucide-react";
import { GlucoseReading, DateRange } from "@/types";
import { generatePDF } from "@/lib/pdf-generator";

interface ExportPDFButtonProps {
	readings: GlucoseReading[];
	dateRange: DateRange;
}

export function ExportPDFButton({ readings, dateRange }: ExportPDFButtonProps) {
	function handleExport() {
		if (readings.length === 0) {
			alert("No readings to export");
			return;
		}
		generatePDF(readings, dateRange);
	}

	return (
		<Button variant="outline" size="lg" onClick={handleExport} className="gap-2" disabled={readings.length === 0}>
			<Download className="h-5 w-5" />
			Export PDF
		</Button>
	);
}
```

---

## 🔧 Phase 7: PWA Setup (Day 6)

### 1. Update `vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
	plugins: [
		react(),
		VitePWA({
			registerType: "autoUpdate",
			includeAssets: ["favicon.ico", "apple-touch-icon.png", "mask-icon.svg"],
			manifest: {
				name: "GD Tracker - Gestational Diabetes Monitor",
				short_name: "GD Tracker",
				description: "Track your gestational diabetes glucose readings",
				theme_color: "#4f46e5",
				background_color: "#ffffff",
				display: "standalone",
				orientation: "portrait",
				icons: [
					{
						src: "/icon-192.png",
						sizes: "192x192",
						type: "image/png",
						purpose: "any",
					},
					{
						src: "/icon-512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "any",
					},
					{
						src: "/icon-maskable-192.png",
						sizes: "192x192",
						type: "image/png",
						purpose: "maskable",
					},
					{
						src: "/icon-maskable-512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
			workbox: {
				globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
				runtimeCaching: [
					{
						urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
						handler: "NetworkFirst",
						options: {
							cacheName: "supabase-cache",
							expiration: {
								maxEntries: 50,
								maxAgeSeconds: 60 * 60 * 24, // 24 hours
							},
							cacheableResponse: {
								statuses: [0, 200],
							},
						},
					},
				],
			},
		}),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
```

### 2. Update `tsconfig.json`

```json
{
	"compilerOptions": {
		"target": "ES2020",
		"useDefineForClassFields": true,
		"lib": ["ES2020", "DOM", "DOM.Iterable"],
		"module": "ESNext",
		"skipLibCheck": true,
		"moduleResolution": "bundler",
		"allowImportingTsExtensions": true,
		"resolveJsonModule": true,
		"isolatedModules": true,
		"noEmit": true,
		"jsx": "react-jsx",
		"strict": true,
		"noUnusedLocals": true,
		"noUnusedParameters": true,
		"noFallthroughCasesInSwitch": true,
		"baseUrl": ".",
		"paths": {
			"@/*": ["./src/*"]
		}
	},
	"include": ["src"],
	"references": [{ "path": "./tsconfig.node.json" }]
}
```

### 3. Create PWA Icons

You'll need to create the following icon files in the `public` folder:

- `icon-192.png` (192x192)
- `icon-512.png` (512x512)
- `icon-maskable-192.png` (192x192 with safe zone)
- `icon-maskable-512.png` (512x512 with safe zone)

Use a tool like [PWA Asset Generator](https://github.com/elegantapp/pwa-asset-generator) or create them manually.

---

## 🎨 Color Coding Implementation

Already implemented in `ReadingsTable.tsx` with:

- **In Range**: `text-green-600 bg-green-50 border-green-200`
- **Warning** (within 5 of limit): `text-amber-600 bg-amber-50 border-amber-200`
- **Out of Range**: `text-red-600 bg-red-50 border-red-200`

---

## ✅ Testing Checklist

### Authentication

- [ ] Google OAuth login works
- [ ] Session persists on page refresh
- [ ] Sign out works correctly

### Adding Readings

- [ ] Add reading with all fields
- [ ] Date/time defaults to current time
- [ ] Validation works (0-500 range)
- [ ] Dialog closes on success
- [ ] Table updates immediately after adding

### Viewing Readings

- [ ] Readings display sorted newest first
- [ ] Color coding appears correctly
- [ ] All measurement types display properly
- [ ] Notes/comments display correctly
- [ ] Empty state shows when no readings

### Filters

- [ ] "Today" filter works
- [ ] "Last 7 Days" filter works
- [ ] "Last 30 Days" filter works
- [ ] Custom date range works
- [ ] Date range display updates correctly

### PDF Export

- [ ] PDF generates successfully
- [ ] PDF contains correct date range
- [ ] Readings sorted ascending (oldest first)
- [ ] Day grouping works correctly
- [ ] Color coding appears in PDF
- [ ] Empty meals show as "-"
- [ ] Multiple pages work if needed

### PWA

- [ ] App installs on mobile
- [ ] App icon displays correctly
- [ ] Splash screen shows on launch
- [ ] Offline mode works (cached pages)
- [ ] Standalone mode works

### Multi-User

- [ ] Each user sees only their data
- [ ] Cannot access other users' readings
- [ ] RLS policies work correctly

---

## 🚀 Deployment Checklist

### Pre-Deployment

1. [ ] Build project: `npm run build`
2. [ ] Test build locally: `npm run preview`
3. [ ] Verify all environment variables
4. [ ] Update Supabase redirect URLs with production domain
5. [ ] Test PWA installation in build mode

### Production Environment Variables

Create `.env.production`:

```bash
VITE_SUPABASE_PROJECT_URL=your_production_supabase_url
VITE_SUPABASE_ANON_KEY=your_production_anon_key
```

### Deployment Steps

1. [ ] Deploy `dist` folder to static hosting
2. [ ] Configure custom domain (if applicable)
3. [ ] Add production URL to Supabase OAuth settings
4. [ ] Test login on production
5. [ ] Test PWA installation on production
6. [ ] Verify HTTPS is enabled

### Post-Deployment

1. [ ] Test all features on production
2. [ ] Share with testers
3. [ ] Monitor Supabase logs
4. [ ] Collect feedback

---

## 🎯 React 19 Specific Features Used

1. **`useActionState`** - Form submission with pending states in `AddRecordDialog`
2. **Form Actions** - Server-like form handling in client components
3. **Improved TypeScript** - Better type inference throughout
4. **`ref` as prop** - Cleaner component APIs (used in shadcn components)

---

## 📚 Additional Resources

- [React 19 Documentation](https://react.dev)
- [Supabase Documentation](https://supabase.com/docs)
- [shadcn/ui Components](https://ui.shadcn.com)
- [Vite PWA Plugin](https://vite-pwa-org.netlify.app)
- [jsPDF Documentation](https://github.com/parallax/jsPDF)

---

## 🐛 Troubleshooting

### Build Issues

- Ensure all dependencies are installed
- Check Node version (recommend v18+)
- Clear `node_modules` and reinstall if needed

### Supabase Issues

- Verify environment variables are set
- Check RLS policies are enabled
- Ensure OAuth redirect URLs match exactly

### PWA Issues

- HTTPS required for PWA features
- Clear browser cache and service workers
- Check manifest.json is accessible
