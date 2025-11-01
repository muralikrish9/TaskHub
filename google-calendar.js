import { getAuthHeaders, getAuthToken, clearInvalidToken } from './google-auth.js';

console.log('[Google Calendar] Module loaded');

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * Make API request with 401 retry logic
 */
async function makeRequest(url, options = {}, retryOn401 = true) {
  let headers = await getAuthHeaders(false);
  
  // If no auth headers, skip request
  if (!headers.Authorization) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers
    }
  });

  // Handle 401 by clearing token and retrying once
  if (response.status === 401 && retryOn401) {
    const oldToken = await getAuthToken(false).catch(() => null);
    if (oldToken) {
      await clearInvalidToken(oldToken);
      console.log('[Google Calendar] Token expired, retrying with new token');
      // Retry once with new token
      headers = await getAuthHeaders(false);
      if (headers.Authorization) {
        const retryResponse = await fetch(url, {
          ...options,
          headers: {
            ...headers,
            ...options.headers
          }
        });
        if (!retryResponse.ok) {
          throw new Error(`HTTP error! status: ${retryResponse.status}`);
        }
        return retryResponse;
      }
    }
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response;
}

export async function getCalendars() {
  try {
    const response = await makeRequest(`${CALENDAR_API_BASE}/users/me/calendarList`);
    const data = await response.json();
    console.log('[Google Calendar] ✓ Found', data.items?.length || 0, 'calendars');
    return data.items || [];
  } catch (error) {
    console.error('[Google Calendar] ✗ Failed to fetch calendars:', error);
    return [];
  }
}

export async function createEvent(calendarId, eventData) {
  try {
    console.log('[Google Calendar] Creating event:', eventData.summary);

    const response = await makeRequest(
      `${CALENDAR_API_BASE}/calendars/${calendarId}/events`,
      {
        method: 'POST',
        body: JSON.stringify(eventData)
      }
    );

    const data = await response.json();
    console.log('[Google Calendar] ✓ Event created:', data.id);
    return data;
  } catch (error) {
    console.error('[Google Calendar] ✗ Failed to create event:', error);
    throw error;
  }
}

export async function getEventsForDateRange(calendarId, timeMin, timeMax) {
  try {
    const url = new URL(`${CALENDAR_API_BASE}/calendars/${calendarId}/events`);
    url.searchParams.append('timeMin', timeMin);
    url.searchParams.append('timeMax', timeMax);
    url.searchParams.append('singleEvents', 'true');
    url.searchParams.append('orderBy', 'startTime');

    console.log('[Google Calendar] Fetching events from', timeMin, 'to', timeMax);

    const response = await makeRequest(url.toString());

    const data = await response.json();
    console.log('[Google Calendar] ✓ Found', data.items?.length || 0, 'events in range');
    return data.items || [];
  } catch (error) {
    console.error('[Google Calendar] ✗ Failed to fetch events:', error);
    return [];
  }
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

function getNextWorkday(date) {
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(0, 0, 0, 0);

  // Skip weekends
  while (isWeekend(nextDay)) {
    nextDay.setDate(nextDay.getDate() + 1);
  }

  return nextDay;
}

function calculateAvailableMinutes(date, events, productiveHours, workStartTime) {
  console.log('[Calendar] Calculating available minutes for', date.toDateString());

  // Skip weekends
  if (isWeekend(date)) {
    console.log('[Calendar] Weekend day, returning 0 available minutes');
    return 0;
  }

  // Parse work start time (e.g., "09:00")
  const [startHour, startMinute] = workStartTime.split(':').map(Number);

  // Create start and end times for the work day
  const workStart = new Date(date);
  workStart.setHours(startHour, startMinute, 0, 0);

  const workEnd = new Date(workStart);
  workEnd.setMinutes(workEnd.getMinutes() + productiveHours * 60);

  console.log('[Calendar] Work day:', workStart.toLocaleTimeString(), 'to', workEnd.toLocaleTimeString());

  // Calculate total booked time
  let bookedMinutes = 0;
  events.forEach(event => {
    if (event.start?.dateTime && event.end?.dateTime) {
      const eventStart = new Date(event.start.dateTime);
      const eventEnd = new Date(event.end.dateTime);

      // Only count events that overlap with our work day
      if (eventEnd > workStart && eventStart < workEnd) {
        const overlapStart = eventStart < workStart ? workStart : eventStart;
        const overlapEnd = eventEnd > workEnd ? workEnd : eventEnd;
        const overlapMinutes = (overlapEnd - overlapStart) / 60000;

        if (overlapMinutes > 0) {
          bookedMinutes += overlapMinutes;
          console.log('[Calendar] Event:', event.summary, '- booked', Math.round(overlapMinutes), 'minutes');
        }
      }
    }
  });

  const totalMinutes = productiveHours * 60;
  const availableMinutes = totalMinutes - bookedMinutes;

  console.log('[Calendar] Total:', totalMinutes, 'min, Booked:', Math.round(bookedMinutes), 'min, Available:', Math.round(availableMinutes), 'min');

  return availableMinutes;
}

async function findNextAvailableSlot(taskDuration, productiveHours, workStartTime) {
  console.log('[Calendar] Finding next available slot for', taskDuration, 'minute task');

  let searchDate = new Date();
  searchDate.setHours(0, 0, 0, 0);

  // Search up to 30 days ahead
  for (let i = 0; i < 30; i++) {
    // Skip weekends
    if (isWeekend(searchDate)) {
      console.log('[Calendar] Skipping weekend:', searchDate.toDateString());
      searchDate = getNextWorkday(searchDate);
      continue;
    }

    // Get events for this day
    const dayStart = new Date(searchDate);
    const [startHour, startMinute] = workStartTime.split(':').map(Number);
    dayStart.setHours(startHour, startMinute, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setMinutes(dayEnd.getMinutes() + productiveHours * 60);

    const events = await getEventsForDateRange(
      'primary',
      dayStart.toISOString(),
      dayEnd.toISOString()
    );

    const availableMinutes = calculateAvailableMinutes(
      searchDate,
      events,
      productiveHours,
      workStartTime
    );

    if (availableMinutes >= taskDuration) {
      console.log('[Calendar] ✓ Found available slot on', searchDate.toDateString());

      // Find the actual time slot
      const slots = [];
      let currentTime = new Date(dayStart);

      // If it's today and we're past the work start time, use current time
      const now = new Date();
      if (searchDate.toDateString() === now.toDateString() && now > currentTime) {
        currentTime = new Date(now);
        // Round up to next 15 minutes
        const minutes = currentTime.getMinutes();
        const roundedMinutes = Math.ceil(minutes / 15) * 15;
        currentTime.setMinutes(roundedMinutes, 0, 0);
      }

      // Sort events by start time
      const sortedEvents = events.sort((a, b) => {
        const aTime = new Date(a.start?.dateTime || 0);
        const bTime = new Date(b.start?.dateTime || 0);
        return aTime - bTime;
      });

      // Find gaps between events
      for (const event of sortedEvents) {
        const eventStart = new Date(event.start?.dateTime);
        const eventEnd = new Date(event.end?.dateTime);

        // Check if there's a gap before this event
        if (eventStart > currentTime) {
          const gapMinutes = (eventStart - currentTime) / 60000;
          if (gapMinutes >= taskDuration) {
            return {
              start: currentTime,
              end: new Date(currentTime.getTime() + taskDuration * 60000)
            };
          }
        }

        // Move currentTime to end of this event
        if (eventEnd > currentTime) {
          currentTime = new Date(eventEnd);
        }
      }

      // Check if there's time after all events
      if (currentTime < dayEnd) {
        const remainingMinutes = (dayEnd - currentTime) / 60000;
        if (remainingMinutes >= taskDuration) {
          return {
            start: currentTime,
            end: new Date(currentTime.getTime() + taskDuration * 60000)
          };
        }
      }
    }

    // Move to next work day
    searchDate = getNextWorkday(searchDate);
  }

  // Fallback: schedule for now if no slot found
  console.log('[Calendar] ⚠ No available slot found in next 30 days, scheduling immediately');
  const now = new Date();
  return {
    start: now,
    end: new Date(now.getTime() + taskDuration * 60000)
  };
}

export async function syncTaskToCalendar(task) {
  try {
    console.log('[Google Calendar] Syncing task to calendar with smart scheduling:', task.task);

    // Get settings for productive hours and work start time
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || {
      productiveHours: 8,
      workStartTime: '09:00'
    };

    const duration = task.estimatedDuration || 30;

    // Find next available slot based on priority and available time
    const slot = await findNextAvailableSlot(
      duration,
      settings.productiveHours,
      settings.workStartTime
    );

    const event = {
      summary: `[Task] ${task.task}`,
      description: `Captured from: ${task.context.url}\n\nOriginal text: ${task.originalText}\n\nPriority: ${task.priority}\nProject: ${task.project || 'General'}\n\nTags: ${task.tags?.join(', ') || 'None'}`,
      start: {
        dateTime: slot.start.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: slot.end.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      colorId: task.priority === 'high' ? '11' : task.priority === 'medium' ? '5' : '2',
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 10 }
        ]
      }
    };

    if (task.deadline) {
      event.description += `\n\nDeadline: ${task.deadline}`;
    }

    const calendarEvent = await createEvent('primary', event);

    console.log('[Google Calendar] ✓ Task scheduled for', slot.start.toLocaleString());
    return calendarEvent;
  } catch (error) {
    console.error('[Google Calendar] ✗ Failed to sync task to calendar:', error);
    throw error;
  }
}

export async function deleteEvent(eventId) {
  try {
    console.log('[Google Calendar] Deleting event:', eventId);

    await makeRequest(
      `${CALENDAR_API_BASE}/calendars/primary/events/${eventId}`,
      {
        method: 'DELETE'
      }
    );

    console.log('[Google Calendar] ✓ Event deleted successfully');
    return true;
  } catch (error) {
    console.error('[Google Calendar] ✗ Failed to delete event:', error);
    throw error;
  }
}
