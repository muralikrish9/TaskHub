import { getAuthHeaders, getAuthToken, clearInvalidToken } from './google-auth.js';

console.log('[Google Tasks] Module loaded');

const TASKS_API_BASE = 'https://tasks.googleapis.com/tasks/v1';

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
      console.log('[Google Tasks] Token expired, retrying with new token');
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

export async function getTaskLists() {
  try {
    const response = await makeRequest(`${TASKS_API_BASE}/users/@me/lists`);
    const data = await response.json();
    console.log('[Google Tasks] ✓ Found', data.items?.length || 0, 'task lists');
    return data.items || [];
  } catch (error) {
    console.error('[Google Tasks] ✗ Failed to fetch task lists:', error);
    return [];
  }
}

export async function createTask(taskListId, taskTitle, taskNotes, dueDate = null) {
  try {
    const taskData = {
      title: taskTitle,
      notes: taskNotes
    };

    if (dueDate) {
      try {
        const date = new Date(dueDate);
        if (!isNaN(date.getTime())) {
          taskData.due = date.toISOString();
        } else {
          console.log('[Google Tasks] Invalid date format, skipping due date:', dueDate);
        }
      } catch (error) {
        console.log('[Google Tasks] Date parsing error, skipping due date:', error);
      }
    }

    console.log('[Google Tasks] Creating task:', taskTitle);

    const response = await makeRequest(
      `${TASKS_API_BASE}/lists/${taskListId}/tasks`,
      {
        method: 'POST',
        body: JSON.stringify(taskData)
      }
    );

    const data = await response.json();
    console.log('[Google Tasks] ✓ Task created:', data.id);
    return data;
  } catch (error) {
    console.error('[Google Tasks] ✗ Failed to create task:', error);
    throw error;
  }
}

export async function getOrCreateDefaultList() {
  try {
    const lists = await getTaskLists();

    const taskHubList = lists.find(list => list.title === 'TaskHub Tasks');
    if (taskHubList) {
      console.log('[Google Tasks] Using existing TaskHub list');
      return taskHubList.id;
    }

    const defaultList = lists.find(list => list.title === 'My Tasks' || list.title === 'Tasks');
    if (defaultList) {
      console.log('[Google Tasks] Using default task list');
      return defaultList.id;
    }

    if (lists.length > 0) {
      console.log('[Google Tasks] Using first available list');
      return lists[0].id;
    }

    throw new Error('No task lists found');
  } catch (error) {
    console.error('[Google Tasks] Failed to get default list:', error);
    throw error;
  }
}

export async function syncTask(task) {
  try {
    console.log('[Google Tasks] Syncing task:', task.task);

    const listId = await getOrCreateDefaultList();

    let notes = `Captured from: ${task.context.url}\n\nOriginal text: ${task.originalText}\n\nPriority: ${task.priority}\nEstimated duration: ${task.estimatedDuration || 30} minutes\nProject: ${task.project || 'General'}`;

    // Add screenshot indicator if task has a screenshot
    if (task.hasScreenshot) {
      notes += '\n\n📸 Screenshot attached (view in extension)';
      console.log('[Google Tasks] Task has screenshot attachment');
    }

    const googleTask = await createTask(
      listId,
      task.task,
      notes,
      task.deadline
    );

    console.log('[Google Tasks] ✓ Task synced successfully');
    return googleTask;
  } catch (error) {
    console.error('[Google Tasks] ✗ Failed to sync task:', error);
    throw error;
  }
}

export async function deleteTask(taskId) {
  try {
    console.log('[Google Tasks] Deleting task:', taskId);

    await makeRequest(
      `${TASKS_API_BASE}/lists/@default/tasks/${taskId}`,
      {
        method: 'DELETE'
      }
    );

    console.log('[Google Tasks] ✓ Task deleted successfully');
    return true;
  } catch (error) {
    console.error('[Google Tasks] ✗ Failed to delete task:', error);
    throw error;
  }
}
