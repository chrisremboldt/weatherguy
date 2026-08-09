import type { WeatherAlert } from "./types";

const SEVERITY_PRIORITY = ["Extreme", "Severe", "Moderate", "Minor", "Unknown"];
const URGENCY_PRIORITY = ["Immediate", "Expected", "Future", "Past", "Unknown"];

function priority(value: string, order: string[]) {
  const index = order.indexOf(value);
  return index === -1 ? order.length : index;
}

export function sortWeatherAlerts(alerts: WeatherAlert[]) {
  return [...alerts].sort((left, right) => {
    const severity = priority(left.severity, SEVERITY_PRIORITY) - priority(right.severity, SEVERITY_PRIORITY);
    if (severity !== 0) return severity;
    const urgency = priority(left.urgency, URGENCY_PRIORITY) - priority(right.urgency, URGENCY_PRIORITY);
    if (urgency !== 0) return urgency;
    return Date.parse(left.effective) - Date.parse(right.effective);
  });
}
