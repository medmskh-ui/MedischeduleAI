
import { Doctor, ScheduleConfig, DailySchedule } from '../types';

export const generateScheduleWithGemini = async (
  doctors: Doctor[],
  config: ScheduleConfig
): Promise<DailySchedule[]> => {
  // Call the backend API (server-side generation)
  // This allows keeping the API Key secure on the server/Vercel env
  const response = await fetch('/api/generate-schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doctors, config })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `API Error: ${response.status}`;
    try {
        const json = JSON.parse(errorText);
        if (json.error) errorMessage = json.error;
    } catch (e) {
        errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  return response.json();
};
