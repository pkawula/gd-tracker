import { createClient } from '@supabase/supabase-js';
import type { GlucoseReading } from '../src/types';

// Vite-node should load .env files automatically.
// The variables are available on process.env.

const supabaseUrl = process.env.VITE_SUPABASE_PROJECT_URL;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_KEY;
const userId = 'dfe05a68-0c52-4b90-8b6c-deca75a70c1e';

if (!supabaseUrl || !serviceKey) {
  throw new Error(
    'Missing environment variables. Make sure to create a .env file with VITE_SUPABASE_PROJECT_URL and VITE_SUPABASE_SERVICE_KEY.',
  );
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function getRandomGlucoseValue(type: 'fasting' | '1hr_after_meal') {
  if (type === 'fasting') {
    return Math.floor(Math.random() * (100 - 70 + 1) + 70); // 70-100
  }
  return Math.floor(Math.random() * (140 - 90 + 1) + 90); // 90-140
}

async function seedData() {
  console.log(`Seeding data for user: ${userId}`);

  const readings: GlucoseReading[] = [];
  const startDate = new Date('2025-10-01T00:00:00.000Z');
  const endDate = new Date('2025-11-10T00:00:00.000Z');

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    // 1 fasting reading
    const fastingTime = new Date(d);
    fastingTime.setUTCHours(8, 0, 0, 0);
    readings.push({
      user_id: userId,
      glucose_value: getRandomGlucoseValue('fasting'),
      measurement_type: 'fasting',
      measured_at: fastingTime.toISOString(),
    });

    // 6 meal readings
    const mealTimes = [9, 11, 13, 15, 17, 19];
    for (const hour of mealTimes) {
      const mealTime = new Date(d);
      mealTime.setUTCHours(hour, 0, 0, 0);
      readings.push({
        user_id: userId,
        glucose_value: getRandomGlucoseValue('1hr_after_meal'),
        measurement_type: '1hr_after_meal',
        measured_at: mealTime.toISOString(),
      });
    }
  }

  console.log(`Generated ${readings.length} readings.`);

//   console.log('Deleting existing readings for this user...');
//   const { error: deleteError } = await supabase
//     .from('glucose_readings')
//     .delete()
//     .eq('user_id', userId);

//   if (deleteError) {
//     console.error('Error deleting existing data:', deleteError.message);
//     return;
//   }

  console.log('Inserting new data...');
  const { error } = await supabase.from('glucose_readings').insert(readings);

  if (error) {
    console.error('Error inserting data:', error.message);
  } else {
    console.log('Data seeded successfully!');
  }
}

seedData();
