import {
  startRecording as startMediaCapture,
  stopRecording as stopMediaCapture,
  reset as resetMediaCapture,
  isMediaRecorderAvailable,
  isCurrentlyRecording as isMediaCaptureActive
} from './audio-capture.js';

let currentStatus = 'todo';
let draggedTaskId = null;

const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;

    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(tc => tc.classList.remove('active'));

    tab.classList.add('active');
    document.getElementById(targetTab).classList.add('active');

    if (targetTab === 'today') {
      loadTasks();
    } else if (targetTab === 'settings') {
      loadSettings();
      checkAIStatus();
    } else if (targetTab === 'summary') {
      loadProjectBreakdown();
    }
  });
});

// Status navigation handlers - using nav buttons
document.addEventListener('click', (e) => {
  const navBtn = e.target.closest('.status-nav-btn');
  if (navBtn && navBtn.dataset.status) {
    const status = navBtn.dataset.status;
    console.log('[Navigation] Switching to:', status);
    switchTaskView(status);
  }
});

async function migrateTasks() {
  const result = await chrome.storage.local.get(['tasks']);
  const tasks = result.tasks || [];
  let needsMigration = false;

  const migratedTasks = tasks.map(task => {
    if (!task.status) {
      task.status = 'todo';
      needsMigration = true;
    }
    if (!task.order) {
      task.order = new Date(task.createdAt).getTime();
      needsMigration = true;
    }
    return task;
  });

  if (needsMigration) {
    await chrome.storage.local.set({ tasks: migratedTasks });
    console.log('[Migration] Tasks migrated with status and order fields');
  }
}

async function loadTasks() {
  console.log('[Popup] Loading tasks...');
  await migrateTasks();

  const result = await chrome.storage.local.get(['tasks']);
  const tasks = result.tasks || [];
  console.log('[Popup] Total tasks in storage:', tasks.length);

  // Update stats
  const todoTasks = tasks.filter(task => task.status === 'todo');
  const inProgressTasks = tasks.filter(task => task.status === 'in_progress');
  const doneTasks = tasks.filter(task => task.status === 'done');

  console.log('[Popup] Tasks by status - Todo:', todoTasks.length, 'In Progress:', inProgressTasks.length, 'Done:', doneTasks.length);

  document.getElementById('todoCount').textContent = todoTasks.length;
  document.getElementById('inProgressCount').textContent = inProgressTasks.length;
  document.getElementById('doneCount').textContent = doneTasks.length;

  // Filter tasks by current status
  const currentTasks = tasks.filter(task => task.status === currentStatus);
  console.log('[Popup] Current status:', currentStatus, 'Tasks for this status:', currentTasks.length);

  const taskList = document.getElementById('taskList');

  if (currentTasks.length === 0) {
    const emptyMessage = currentStatus === 'todo'
      ? 'No tasks to do. Highlight text on any webpage to get started!'
      : currentStatus === 'in_progress'
        ? 'No tasks in progress. Move tasks from Todo to get started!'
        : 'No completed tasks yet. Mark tasks as done to see them here!';

    console.log('[Popup] No tasks for current status, showing empty state');
    taskList.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
    return;
  }

  // Sort by order
  currentTasks.sort((a, b) => (a.order || 0) - (b.order || 0));

  taskList.innerHTML = currentTasks.map(task => renderTaskItem(task)).join('');

  // Add event listeners for all task interactions
  addTaskEventListeners();
}

function renderTaskItem(task) {
  const priorityColors = {
    high: '#ff4757',
    medium: '#ffa502',
    low: '#2ed573'
  };

  const statusIcons = {
    todo: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>',
    in_progress: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    done: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
  };

  const screenshotPreview = task.hasScreenshot && task.screenshot ?
    `<div class="task-screenshot-preview">
       <img src="${task.screenshot}" alt="Screenshot" title="Click to view full size" />
     </div>` : '';

  const screenshotBadge = task.hasScreenshot ?
    '<span class="screenshot-badge" title="Has screenshot"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></span>' : '';

  // Determine priority class
  const priorityClass = `priority-${task.priority || 'medium'}`;

  return `
    <div class="task-item ${priorityClass}" data-task-id="${task.id}" draggable="true">
      <div class="task-header">
        <div class="task-status">
          <span class="status-icon">${statusIcons[task.status]}</span>
          <input type="checkbox" class="task-checkbox" ${task.status === 'done' ? 'checked' : ''}>
        </div>
        <div class="task-content">
          <div class="task-title-row">
            <div class="task-title" contenteditable="true" data-field="task">${escapeHtml(task.task)}</div>
            ${screenshotBadge}
          </div>
          ${screenshotPreview}
          <div class="task-meta">
            <div class="task-field">
              <label>Priority:</label>
              <select class="task-priority" data-field="priority">
                <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low</option>
                <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High</option>
              </select>
            </div>
            <div class="task-field">
              <label>Duration:</label>
              <input type="number" class="task-duration" data-field="estimatedDuration"
                     value="${task.estimatedDuration || 30}" min="5" max="480" step="5">
              <span>min</span>
            </div>
            <div class="task-field">
              <label>Project:</label>
              <input type="text" class="task-project" data-field="project"
                     value="${escapeHtml(task.project || 'General')}" placeholder="Project name">
            </div>
            <div class="task-field">
              <label>Deadline:</label>
              <input type="date" class="task-deadline" data-field="deadline"
                     value="${formatDateForInput(task.deadline)}">
            </div>
          </div>
        </div>
        <div class="task-actions">
          <div class="drag-handle">⋮⋮</div>
          <button class="task-delete" data-task-id="${task.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function addTaskEventListeners() {
  // Checkbox status toggle
  document.querySelectorAll('.task-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const taskItem = e.target.closest('.task-item');
      const taskId = taskItem.dataset.taskId;
      const currentStatus = taskItem.closest('.task-item').dataset.taskId;
      toggleTaskStatus(taskId);
    });
  });

  // Inline editing
  document.querySelectorAll('[data-field]').forEach(field => {
    field.addEventListener('blur', (e) => {
      saveTaskEdit(e.target);
    });

    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.target.matches('select, input[type="date"]')) {
        e.preventDefault();
        e.target.blur();
      }
    });
  });

  // Delete buttons
  document.querySelectorAll('.task-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Use currentTarget to get the button, not the SVG inside it
      const taskId = e.currentTarget.dataset.taskId;
      if (taskId) {
        deleteTask(taskId);
      }
    });
  });

  // Drag and drop
  document.querySelectorAll('.task-item').forEach(item => {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragend', handleDragEnd);
  });
}

async function toggleTaskStatus(taskId) {
  const result = await chrome.storage.local.get(['tasks']);
  const tasks = result.tasks || [];

  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  // Cycle through statuses: todo -> in_progress -> done -> todo
  const statusCycle = ['todo', 'in_progress', 'done'];
  const currentIndex = statusCycle.indexOf(task.status);
  const nextIndex = (currentIndex + 1) % statusCycle.length;
  task.status = statusCycle[nextIndex];

  await chrome.storage.local.set({ tasks });

  // Animate the change
  const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
  if (taskItem) {
    if (statusCycle[nextIndex] === 'done') {
      triggerTaskCelebration();
    }
    taskItem.style.transform = 'scale(0.95)';
    taskItem.style.opacity = '0.7';

    setTimeout(() => {
      loadTasks(); // Reload to show updated status
    }, 150);
  }
}

async function saveTaskEdit(field) {
  const taskItem = field.closest('.task-item');
  const taskId = taskItem.dataset.taskId;
  const fieldName = field.dataset.field;
  let value = field.value;

  // Handle different field types
  if (fieldName === 'task') {
    value = field.textContent.trim();
  } else if (fieldName === 'estimatedDuration') {
    value = parseInt(value) || 30;
  } else if (fieldName === 'deadline') {
    value = value ? new Date(value).toISOString() : null;
  }

  const result = await chrome.storage.local.get(['tasks']);
  const tasks = result.tasks || [];

  const task = tasks.find(t => t.id === taskId);
  if (task) {
    task[fieldName] = value;
    await chrome.storage.local.set({ tasks });

    // Visual feedback
    field.style.backgroundColor = '#e8f5e8';
    setTimeout(() => {
      field.style.backgroundColor = '';
    }, 300);
  }
}

async function deleteTask(taskId) {
  if (!confirm('Are you sure you want to delete this task?')) return;

  const result = await chrome.storage.local.get(['tasks']);
  const tasks = result.tasks || [];

  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
  if (taskItem) {
    // Animate deletion
    taskItem.style.transform = 'translateX(-100%)';
    taskItem.style.opacity = '0';

    setTimeout(async () => {
      // Remove from local storage
      const updatedTasks = tasks.filter(t => t.id !== taskId);
      await chrome.storage.local.set({ tasks: updatedTasks });

      // Delete from Google services if synced
      if (task.syncedToGoogle) {
        try {
          await chrome.runtime.sendMessage({
            action: 'deleteFromGoogle',
            data: { taskId: taskId, task: task }
          });
          console.log('[Delete] Task removed from Google services');
        } catch (error) {
          console.error('[Delete] Failed to remove from Google services:', error);
        }
      }

      loadTasks();
    }, 300);
  }
}

// Show capture notification animation
function showCaptureNotification(message, success = true) {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `capture-notification ${success ? 'success' : 'error'}`;
  notification.innerHTML = `
    <div class="capture-notification-content">
      <div class="capture-spinner"></div>
      <span>${message}</span>
    </div>
  `;

  document.body.appendChild(notification);

  // Trigger animation
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  // Auto remove after 2.5 seconds
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 2500);
}

function triggerTaskCelebration() {
  const container = document.createElement('div');
  container.className = 'celebration-container';
  document.body.appendChild(container);

  const confettiColors = ['#7FB77E', '#E8B86D', '#89A7FF', '#F28B82', '#B388EB'];
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * viewportWidth}px`;
    const startYOffset = -(Math.random() * 200 + 40);
    piece.style.top = `${startYOffset}px`;
    piece.style.background = confettiColors[i % confettiColors.length];
    piece.style.setProperty('--shiftX', `${(Math.random() - 0.5) * viewportWidth * 0.5}px`);
    piece.style.setProperty('--shiftY', `${viewportHeight + Math.random() * 400}px`);
    piece.style.animationDelay = `${Math.random() * 0.3}s`;
    container.appendChild(piece);
  }

  for (let i = 0; i < 24; i++) {
    const sparkle = document.createElement('div');
    sparkle.className = 'sparkle-piece';
    sparkle.style.left = `${Math.random() * viewportWidth}px`;
    sparkle.style.top = `${Math.random() * viewportHeight}px`;
    sparkle.style.animationDelay = `${Math.random() * 0.35}s`;
    container.appendChild(sparkle);
  }

  setTimeout(() => {
    container.remove();
  }, 1600);
}

function switchTaskView(status) {
  currentStatus = status;

  // Update status nav buttons
  document.querySelectorAll('.status-nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.querySelector(`.status-nav-btn[data-status="${status}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  // Animate content transition
  const taskList = document.getElementById('taskList');
  if (taskList) {
    taskList.style.opacity = '0';
    taskList.style.transform = 'translateY(10px)';

    setTimeout(() => {
      loadTasks();
      taskList.style.opacity = '1';
      taskList.style.transform = 'translateY(0)';
    }, 150);
  } else {
    loadTasks();
  }
}

// Drag and Drop Implementation
function handleDragStart(e) {
  draggedTaskId = e.target.dataset.taskId;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const taskItem = e.target.closest('.task-item');
  if (taskItem && taskItem.dataset.taskId !== draggedTaskId) {
    taskItem.classList.add('drag-over');
  }
}

function handleDrop(e) {
  e.preventDefault();

  const targetTaskItem = e.target.closest('.task-item');
  if (!targetTaskItem || !draggedTaskId) return;

  const targetTaskId = targetTaskItem.dataset.taskId;

  if (targetTaskId === draggedTaskId) return;

  // Remove drag classes
  document.querySelectorAll('.task-item').forEach(item => {
    item.classList.remove('drag-over');
  });

  // Reorder tasks
  reorderTasks(draggedTaskId, targetTaskId);
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.task-item').forEach(item => {
    item.classList.remove('drag-over');
  });
  draggedTaskId = null;
}

async function reorderTasks(draggedId, targetId) {
  const result = await chrome.storage.local.get(['tasks']);
  const tasks = result.tasks || [];

  const draggedTask = tasks.find(t => t.id === draggedId);
  const targetTask = tasks.find(t => t.id === targetId);

  if (!draggedTask || !targetTask) return;

  // Update order values
  const draggedOrder = draggedTask.order;
  const targetOrder = targetTask.order;

  draggedTask.order = targetOrder;
  targetTask.order = draggedOrder;

  await chrome.storage.local.set({ tasks });

  // Animate the reorder
  const draggedElement = document.querySelector(`[data-task-id="${draggedId}"]`);
  if (draggedElement) {
    draggedElement.style.transform = 'scale(1.02)';
    setTimeout(() => {
      loadTasks();
    }, 100);
  }
}

// 3-dots menu dropdown handler
const moreActionsBtn = document.getElementById('moreActionsBtn');
const actionsDropdown = document.getElementById('actionsDropdown');
const manualTaskBtn = document.getElementById('manualTaskBtn');
const manualTaskModal = document.getElementById('manualTaskModal');
const manualTaskForm = document.getElementById('manualTaskForm');
const manualTaskError = document.getElementById('manualTaskError');
const manualTaskTitle = document.getElementById('manualTaskTitle');
const manualTaskDuration = document.getElementById('manualTaskDuration');
const manualTaskProject = document.getElementById('manualTaskProject');
const manualTaskDeadline = document.getElementById('manualTaskDeadline');
const manualTaskTags = document.getElementById('manualTaskTags');
const manualTaskPriority = document.getElementById('manualTaskPriority');
const closeManualTaskModalBtn = document.getElementById('closeManualTaskModal');
const cancelManualTaskBtn = document.getElementById('cancelManualTask');

if (moreActionsBtn && actionsDropdown) {
  moreActionsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = actionsDropdown.style.display === 'block';
    actionsDropdown.style.display = isVisible ? 'none' : 'block';
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!actionsDropdown.contains(e.target) && !moreActionsBtn.contains(e.target)) {
      actionsDropdown.style.display = 'none';
    }
  });

  // Close dropdown after clicking an item
  actionsDropdown.addEventListener('click', () => {
    actionsDropdown.style.display = 'none';
  });
}

function resetManualTaskForm() {
  if (manualTaskForm) {
    manualTaskForm.reset();
  }
  if (manualTaskError) {
    manualTaskError.style.display = 'none';
    manualTaskError.textContent = '';
  }
}

async function populateManualDefaults() {
  try {
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || {};
    if (manualTaskDuration && settings.defaultDuration) {
      manualTaskDuration.value = settings.defaultDuration;
    } else if (manualTaskDuration) {
      manualTaskDuration.value = 30;
    }
    if (manualTaskProject) {
      manualTaskProject.value = settings.defaultProject || '';
    }
  } catch (error) {
    console.error('Failed to load manual task defaults:', error);
    if (manualTaskDuration && !manualTaskDuration.value) {
      manualTaskDuration.value = 30;
    }
  }
}

function openManualTaskModal() {
  if (!manualTaskModal) return;
  resetManualTaskForm();
  manualTaskModal.style.display = 'flex';
  populateManualDefaults().finally(() => {
    setTimeout(() => {
      manualTaskTitle?.focus();
    }, 50);
  });
}

function closeManualTaskModal() {
  if (!manualTaskModal) return;
  manualTaskModal.style.display = 'none';
  resetManualTaskForm();
}

if (manualTaskBtn) {
  manualTaskBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openManualTaskModal();
  });
}

if (closeManualTaskModalBtn) {
  closeManualTaskModalBtn.addEventListener('click', () => {
    closeManualTaskModal();
  });
}

if (cancelManualTaskBtn) {
  cancelManualTaskBtn.addEventListener('click', () => {
    closeManualTaskModal();
  });
}

if (manualTaskModal) {
  manualTaskModal.addEventListener('click', (event) => {
    if (event.target === manualTaskModal) {
      closeManualTaskModal();
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && manualTaskModal && manualTaskModal.style.display === 'flex') {
    closeManualTaskModal();
  }
});

function showManualTaskError(message) {
  if (!manualTaskError) return;
  if (!message) {
    manualTaskError.textContent = '';
    manualTaskError.style.display = 'none';
    return;
  }
  manualTaskError.textContent = message;
  manualTaskError.style.display = 'block';
}

if (manualTaskForm) {
  manualTaskForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!manualTaskTitle || !manualTaskPriority || !manualTaskDuration) {
      return;
    }

    const taskTitle = manualTaskTitle.value.trim();
    if (!taskTitle) {
      showManualTaskError('Please enter a task description.');
      manualTaskTitle.focus();
      return;
    }

    let duration = parseInt(manualTaskDuration.value, 10);
    if (Number.isNaN(duration) || duration < 5) {
      showManualTaskError('Duration must be at least 5 minutes.');
      manualTaskDuration.focus();
      return;
    }
    duration = Math.min(duration, 480);

    const project = manualTaskProject?.value.trim() || 'General';
    const tagsRaw = manualTaskTags?.value || '';
    const tags = tagsRaw
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    const deadlineValue = manualTaskDeadline?.value;
    let deadline = null;
    if (deadlineValue) {
      const parsed = new Date(`${deadlineValue}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) {
        deadline = parsed.toISOString();
      }
    }

    const submitBtn = manualTaskForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
    }
    showManualTaskError('');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'manualCreateTask',
        data: {
          task: taskTitle,
          priority: manualTaskPriority.value || 'medium',
          estimatedDuration: duration,
          project,
          deadline,
          tags,
          source: 'manual',
          originalText: taskTitle,
          context: {
            title: 'Manual Entry',
            url: 'manual-entry',
            timestamp: new Date().toISOString()
          }
        }
      });

      if (response?.success) {
        closeManualTaskModal();
        showCaptureNotification('Task added manually!');
        await loadTasks();
      } else {
        const errorMessage = response?.error || 'Failed to save task. Please try again.';
        showManualTaskError(errorMessage);
      }
    } catch (error) {
      console.error('Manual task creation failed:', error);
      showManualTaskError(error.message || 'Failed to save task. Please try again.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Task';
      }
    }
  });
}

// Auto task capture handler
const autoTaskCaptureBtn = document.getElementById('autoTaskCaptureBtn');
if (autoTaskCaptureBtn) {
  autoTaskCaptureBtn.addEventListener('click', async () => {
    const button = autoTaskCaptureBtn;
    const originalHTML = button.innerHTML;
    button.innerHTML = '<span style="display: flex; align-items: center; gap: 10px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Capturing...</span>';
    button.disabled = true;

    // Show capturing notification
    showCaptureNotification('Capturing tasks from page...');

    try {
      // Request to capture tasks from the current page
      const response = await chrome.runtime.sendMessage({ action: 'autoCapturePage' });

      if (response?.success && (response.task || (response.tasks && response.tasks.length > 0))) {
        // Reload tasks to show the newly captured tasks
        await loadTasks();

        const count = response.tasks?.length || 1;
        showCaptureNotification(`Captured ${count} task${count === 1 ? '' : 's'} from this page!`);
      } else {
        const errorMessage = response?.error || 'Unable to capture tasks from this page.';
        showCaptureNotification(errorMessage, false);
        alert(errorMessage);
      }
    } catch (error) {
      console.error('Auto capture failed:', error);
      showCaptureNotification('Capture failed', false);
      alert('Failed to capture tasks from page. Please try again.');
    } finally {
      button.innerHTML = originalHTML;
      button.disabled = false;
    }
  });
}

// Screenshot capture from popup
const captureScreenshotBtn = document.getElementById('captureScreenshotBtn');
if (captureScreenshotBtn) {
  captureScreenshotBtn.addEventListener('click', async () => {
    const button = captureScreenshotBtn;
    const originalHTML = button.innerHTML;
    button.disabled = true;

    // Show capturing notification
    showCaptureNotification('📸 Capturing screenshot...');

    try {
      const response = await chrome.runtime.sendMessage({ action: 'captureScreenshot' });

      if (response.success) {
        // Reload tasks to show the newly captured task
        await loadTasks();

        // Show success notification
        showCaptureNotification('Screenshot captured!');
      } else {
        showCaptureNotification('Failed to capture screenshot', false);
        alert('Failed to capture screenshot: ' + (response.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      showCaptureNotification('Capture failed', false);
      alert('Failed to capture screenshot. Please try again.');
    } finally {
      button.disabled = false;
    }
  });
}

// Summary functionality (unchanged)
document.getElementById('generateSummaryBtn').addEventListener('click', async () => {
  const button = document.getElementById('generateSummaryBtn');
  button.textContent = 'Generating...';
  button.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ action: 'generateSummary' });

    if (response.success) {
      const summaryContent = document.getElementById('summaryContent');
      summaryContent.textContent = response.summary;

      document.getElementById('copySummaryBtn').style.display = 'inline-block';
      document.getElementById('exportMarkdownBtn').style.display = 'inline-block';

      await loadProjectBreakdown();
    }
  } catch (error) {
    console.error('Failed to generate summary:', error);
    alert('Failed to generate summary. Please try again.');
  } finally {
    button.textContent = 'Generate Summary';
    button.disabled = false;
  }
});

document.getElementById('copySummaryBtn').addEventListener('click', () => {
  const summary = document.getElementById('summaryContent').textContent;
  navigator.clipboard.writeText(summary);

  const button = document.getElementById('copySummaryBtn');
  const originalText = button.textContent;
  button.textContent = 'Copied!';
  setTimeout(() => {
    button.textContent = originalText;
  }, 2000);
});

document.getElementById('exportMarkdownBtn').addEventListener('click', () => {
  const summary = document.getElementById('summaryContent').textContent;
  const blob = new Blob([`# ${summary}`], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `daily-summary-${new Date().toISOString().split('T')[0]}.md`;
  a.click();
  URL.revokeObjectURL(url);
});

async function loadProjectBreakdown() {
  const result = await chrome.storage.local.get(['tasks']);
  const tasks = result.tasks || [];

  const today = new Date().toDateString();
  const todayTasks = tasks.filter(task =>
    new Date(task.createdAt).toDateString() === today
  );

  const projectGroups = {};
  todayTasks.forEach(task => {
    const project = task.project || 'General';
    if (!projectGroups[project]) {
      projectGroups[project] = { tasks: [], minutes: 0 };
    }
    projectGroups[project].tasks.push(task);
    projectGroups[project].minutes += task.estimatedDuration || 30;
  });

  const breakdown = document.getElementById('projectBreakdown');
  const highlights = document.getElementById('summaryHighlights');

  if (highlights) {
    if (todayTasks.length === 0) {
      highlights.innerHTML = '<p class="empty-state">Capture tasks to see your daily stats</p>';
    }
  }

  if (!breakdown) {
    return;
  }

  if (Object.keys(projectGroups).length === 0) {
    breakdown.innerHTML = '<p class="empty-state">Project time tracking will appear here</p>';
    if (highlights) {
      highlights.innerHTML = '<p class="empty-state">Capture tasks to see your daily stats</p>';
    }
    return;
  }

  const sortedProjects = Object.entries(projectGroups)
    .sort((a, b) => b[1].minutes - a[1].minutes);

  const totalMinutes = sortedProjects.reduce((sum, [, data]) => sum + data.minutes, 0) || 0;
  const totalTasks = todayTasks.length;
  const completedTasks = todayTasks.filter(task => task.status === 'done').length;
  const highPriorityTasks = todayTasks.filter(task => (task.priority || 'medium').toLowerCase() === 'high').length;
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
  const averageMinutes = totalTasks ? Math.round(totalMinutes / totalTasks) : 0;
  const topProject = sortedProjects[0];
  const topProjectName = topProject ? topProject[0] : 'Focus';
  const topProjectMinutes = topProject ? topProject[1].minutes : 0;
  const topProjectHours = Math.round((topProjectMinutes / 60) * 10) / 10;
  const topProjectPercent = totalMinutes ? Math.round((topProjectMinutes / totalMinutes) * 100) : 0;

  if (highlights) {
    highlights.innerHTML = `
      <div class="summary-highlight-card">
        <span class="summary-highlight-label">Tasks Captured</span>
        <span class="summary-highlight-value">${totalTasks}</span>
        <span class="summary-highlight-footnote">${completedTasks > 0 ? `${completedTasks} completed` : 'No completions yet'}</span>
      </div>
      <div class="summary-highlight-card">
        <span class="summary-highlight-label">Deep Work Time</span>
        <span class="summary-highlight-value">${totalHours}h</span>
        <span class="summary-highlight-footnote">${averageMinutes || 0} min avg • ${highPriorityTasks} high priority</span>
      </div>
      <div class="summary-highlight-card">
        <span class="summary-highlight-label">Top Focus</span>
        <span class="summary-highlight-value">${escapeHtml(topProjectName)}</span>
        <span class="summary-highlight-footnote">${topProjectHours}h • ${topProjectPercent}% of day</span>
      </div>
    `;
  }

  breakdown.innerHTML = sortedProjects.map(([project, data], index) => {
    const hours = Math.round((data.minutes / 60) * 10) / 10;
    const percent = totalMinutes ? Math.round((data.minutes / totalMinutes) * 100) : 0;
    const taskLabel = data.tasks.length === 1 ? 'task' : 'tasks';
    const tooltipItems = data.tasks.slice(0, 4).map(task => {
      const priorityRaw = (task.priority || 'medium').toString().toLowerCase();
      const priority = ['low', 'medium', 'high'].includes(priorityRaw) ? priorityRaw : 'medium';
      return `<li>
        <span class="project-tooltip-task">${escapeHtml(task.task)}</span>
        <span class="project-tooltip-priority project-tooltip-priority--${priority}">
          ${priority.charAt(0).toUpperCase() + priority.slice(1)}
        </span>
      </li>`;
    });

    if (tooltipItems.length === 0) {
      tooltipItems.push('<li class="project-tooltip-empty">No detailed tasks logged yet</li>');
    }

    const remaining = data.tasks.length - tooltipItems.length;
    if (remaining > 0) {
      tooltipItems.push(`<li class="project-tooltip-more">+${remaining} more</li>`);
    }

    return `
      <div class="project-item ${index === 0 ? 'project-item--lead' : ''}">
        <div class="project-item-header">
          <span class="project-chip">${escapeHtml(project)}</span>
          <span class="project-time-badge">${hours}h</span>
        </div>
        <div class="project-progress" aria-hidden="true">
          <div class="project-progress-bar" style="width: ${Math.min(percent, 100)}%;"></div>
        </div>
        <div class="project-item-meta">
          <span>${data.tasks.length} ${taskLabel}</span>
          <span>${percent}% of today</span>
        </div>
        <div class="project-tooltip">
          <p class="project-tooltip-title">${escapeHtml(project)}</p>
          <ul class="project-tooltip-list">
            ${tooltipItems.join('')}
          </ul>
        </div>
      </div>
    `;
  }).join('');
}

async function loadSettings() {
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {
    googleSyncEnabled: true,
    defaultDuration: 30,
    productiveHours: 8,
    workStartTime: '09:00',
    aiEnabled: true,
    translationEnabled: false,
    translationLanguage: 'en'
  };

  const googleSyncCheckbox = document.getElementById('googleSyncEnabled');
  const defaultDurationInput = document.getElementById('defaultDuration');
  const productiveHoursInput = document.getElementById('productiveHours');
  const workStartTimeInput = document.getElementById('workStartTime');
  const aiCheckbox = document.getElementById('aiEnabled');
  const translationCheckbox = document.getElementById('translationEnabled');
  const translationLanguageSelect = document.getElementById('translationLanguage');

  if (googleSyncCheckbox) googleSyncCheckbox.checked = settings.googleSyncEnabled !== false;
  if (defaultDurationInput) defaultDurationInput.value = settings.defaultDuration || 30;
  if (productiveHoursInput) productiveHoursInput.value = settings.productiveHours || 8;
  if (workStartTimeInput) workStartTimeInput.value = settings.workStartTime || '09:00';
  if (aiCheckbox) aiCheckbox.checked = settings.aiEnabled !== false;
  if (translationCheckbox) translationCheckbox.checked = settings.translationEnabled || false;
  if (translationLanguageSelect) translationLanguageSelect.value = settings.translationLanguage || 'en';

  // Update toggle visual states
  await updateToggleStates();
  await checkGoogleAuthStatus();
}

async function saveSettings() {
  const googleSyncCheckbox = document.getElementById('googleSyncEnabled');
  const defaultDurationInput = document.getElementById('defaultDuration');
  const productiveHoursInput = document.getElementById('productiveHours');
  const workStartTimeInput = document.getElementById('workStartTime');
  const aiCheckbox = document.getElementById('aiEnabled');
  const translationCheckbox = document.getElementById('translationEnabled');
  const translationLanguageSelect = document.getElementById('translationLanguage');

  const settings = {
    googleSyncEnabled: googleSyncCheckbox ? googleSyncCheckbox.checked : true,
    defaultDuration: defaultDurationInput ? parseInt(defaultDurationInput.value) : 30,
    productiveHours: productiveHoursInput ? parseFloat(productiveHoursInput.value) : 8,
    workStartTime: workStartTimeInput ? workStartTimeInput.value : '09:00',
    aiEnabled: aiCheckbox ? aiCheckbox.checked : true,
    translationEnabled: translationCheckbox ? translationCheckbox.checked : false,
    translationLanguage: translationLanguageSelect ? translationLanguageSelect.value : 'en'
  };

  await chrome.storage.local.set({ settings });

  // Reinitialize AI with new translation language if changed
  if (settings.translationEnabled) {
    await chrome.runtime.sendMessage({ action: 'checkAI' });
  }

  // Show translation status
  if (settings.translationEnabled && settings.translationLanguage !== 'en') {
    console.log('Translation enabled: text will be translated to', settings.translationLanguage);
  } else if (settings.translationEnabled && settings.translationLanguage === 'en') {
    console.log('Translation enabled but target is English: no translation needed');
  }
}

async function checkGoogleAuthStatus() {
  const statusText = document.getElementById('googleAuthStatus');
  statusText.textContent = 'Checking Google account status...';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkGoogleAuth' });

    const signedOutView = document.getElementById('signedOutView');
    const signedInView = document.getElementById('signedInView');

    if (response.signedIn) {
      signedOutView.style.display = 'none';
      signedInView.style.display = 'block';
      document.getElementById('googleEmail').textContent = response.email || 'Unknown';
      statusText.textContent = 'Google account connected. Tasks will sync to Google Tasks and Calendar.';
      statusText.style.color = '#4caf50';

      // Hide local-only mode banner if visible
      hideLocalOnlyBanner();
    } else {
      signedOutView.style.display = 'block';
      signedInView.style.display = 'none';
      statusText.textContent = 'Sign in to sync tasks to Google Tasks and Calendar.';
      statusText.style.color = '#666';

      // Show local-only mode banner
      showLocalOnlyBanner();
    }
  } catch (error) {
    console.error('Failed to check Google auth status:', error);
    statusText.textContent = 'Failed to check Google account status.';
    statusText.style.color = '#f44336';

    // Show local-only mode banner on error
    showLocalOnlyBanner();
  }
}

async function handleGoogleSignIn() {
  const button = document.getElementById('googleSignInBtn');
  button.textContent = 'Signing in...';
  button.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ action: 'googleSignIn' });

    if (response.success) {
      await checkGoogleAuthStatus();
      // Don't show alert - just update UI silently
      showCaptureNotification('Successfully signed in to Google!');
    } else {
      // Handle user cancellation gracefully
      if (response.error && (response.error.includes('cancelled') || response.error.includes('USER_CANCELLED'))) {
        // User cancelled - don't show error, just keep local-only mode
        showLocalOnlyBanner();
      } else {
        showCaptureNotification('Failed to sign in: ' + (response.error || 'Unknown error'), false);
      }
      await checkGoogleAuthStatus();
    }
  } catch (error) {
    console.error('Google sign in failed:', error);
    showCaptureNotification('Failed to sign in to Google. Please try again.', false);
    await checkGoogleAuthStatus();
  } finally {
    button.textContent = 'Sign in with Google';
    button.disabled = false;
  }
}

async function handleGoogleSignOut() {
  if (!confirm('Are you sure you want to sign out of Google? Future tasks will not sync until you sign in again.')) {
    return;
  }

  const button = document.getElementById('googleSignOutBtn');
  button.textContent = 'Signing out...';
  button.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ action: 'googleSignOut' });

    if (response.success) {
      await checkGoogleAuthStatus();
      showCaptureNotification('Successfully signed out of Google.');
    } else {
      showCaptureNotification('Failed to sign out: ' + (response.error || 'Unknown error'), false);
    }
  } catch (error) {
    console.error('Google sign out failed:', error);
    showCaptureNotification('Failed to sign out. Please try again.', false);
  } finally {
    button.textContent = 'Sign Out';
    button.disabled = false;
  }
}

// Local-only mode banner functions
function showLocalOnlyBanner() {
  let banner = document.getElementById('localOnlyBanner');
  if (!banner) {
    // Create banner if it doesn't exist
    banner = document.createElement('div');
    banner.id = 'localOnlyBanner';
    banner.className = 'local-only-banner';
    banner.innerHTML = `
      <div class="local-only-content">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        <div class="local-only-text">
          <strong>Local-only mode:</strong> Tasks saved locally. <button id="connectGoogleBtn" class="link-button">Connect Google</button> to sync.
        </div>
        <button id="dismissLocalOnlyBanner" class="local-only-close" title="Dismiss">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    // Insert at the top of settings tab
    const settingsTab = document.getElementById('settings');
    if (settingsTab) {
      settingsTab.insertBefore(banner, settingsTab.firstChild);

      // Add event listeners
      document.getElementById('connectGoogleBtn')?.addEventListener('click', () => {
        hideLocalOnlyBanner();
        handleGoogleSignIn();
      });

      document.getElementById('dismissLocalOnlyBanner')?.addEventListener('click', () => {
        hideLocalOnlyBanner();
        // Remember dismissal for this session
        sessionStorage.setItem('localOnlyBannerDismissed', 'true');
      });
    }
  }

  // Only show if not dismissed this session
  if (sessionStorage.getItem('localOnlyBannerDismissed') !== 'true') {
    banner.style.display = 'block';
  }
}

function hideLocalOnlyBanner() {
  const banner = document.getElementById('localOnlyBanner');
  if (banner) {
    banner.style.display = 'none';
  }
}

document.getElementById('googleSignInBtn').addEventListener('click', handleGoogleSignIn);
document.getElementById('googleSignOutBtn').addEventListener('click', handleGoogleSignOut);

// Add event listeners safely
const googleSyncCheckbox = document.getElementById('googleSyncEnabled');
if (googleSyncCheckbox) googleSyncCheckbox.addEventListener('change', saveSettings);

const defaultDurationInput = document.getElementById('defaultDuration');
if (defaultDurationInput) defaultDurationInput.addEventListener('change', saveSettings);

const productiveHoursInput = document.getElementById('productiveHours');
if (productiveHoursInput) productiveHoursInput.addEventListener('change', saveSettings);

const workStartTimeInput = document.getElementById('workStartTime');
if (workStartTimeInput) workStartTimeInput.addEventListener('change', saveSettings);

const aiCheckbox = document.getElementById('aiEnabled');
if (aiCheckbox) aiCheckbox.addEventListener('change', saveSettings);

const translationCheckbox = document.getElementById('translationEnabled');
if (translationCheckbox) translationCheckbox.addEventListener('change', saveSettings);

const translationLanguageSelect = document.getElementById('translationLanguage');
if (translationLanguageSelect) translationLanguageSelect.addEventListener('change', saveSettings);

async function checkAIStatus() {
  const response = await chrome.runtime.sendMessage({ action: 'checkAI' });

  const statusDiv = document.getElementById('aiStatus');

  if (response.available) {
    statusDiv.className = 'ai-status available';
    statusDiv.innerHTML = `
      <p><strong>Chrome AI Available</strong></p>
      <p>Prompt API: ${response.hasPrompt ? 'Yes' : 'No'}</p>
      <p>Summarizer API: ${response.hasSummarizer ? 'Yes' : 'No'}</p>
      <p>Writer API: ${response.hasWriter ? 'Yes' : 'No'}</p>
      <p>Rewriter API: ${response.hasRewriter ? 'Yes' : 'No'}</p>
      <p>Translator API: ${response.hasTranslator ? 'Yes' : 'No'}</p>
    `;
  } else {
    statusDiv.className = 'ai-status unavailable';
    statusDiv.innerHTML = `
      <p><strong>Chrome AI Not Available</strong></p>
      <p>Make sure you're using Chrome Canary or Dev with AI features enabled.</p>
      <p><a href="https://developer.chrome.com/docs/ai/join-epp" target="_blank">Join Early Preview Program</a></p>
    `;
  }
}

document.getElementById('clearDataBtn').addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      tasks: [],
      settings: {
        googleSyncEnabled: true,
        defaultDuration: 30,
        productiveHours: 8,
        workStartTime: '09:00',
        aiEnabled: true,
        translationEnabled: false,
        translationLanguage: 'en'
      }
    });
    await loadTasks();
    alert('All data cleared.');
  }
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDateForInput(value) {
  try {
    if (!value) return '';
    // Accept ISO strings or natural language; try Date parse but guard invalid
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    // Return yyyy-mm-dd
    return date.toISOString().split('T')[0];
  } catch (e) {
    return '';
  }
}

// Toggle Switch Handlers
function setupToggleSwitches() {
  // Google Sync Toggle
  const toggleGoogleSync = document.getElementById('toggleGoogleSync');
  if (toggleGoogleSync && !toggleGoogleSync.dataset.listener) {
    toggleGoogleSync.dataset.listener = 'true';
    toggleGoogleSync.addEventListener('click', () => {
      const checkbox = document.getElementById('googleSyncEnabled');
      const newState = !checkbox.checked;
      checkbox.checked = newState;
      toggleGoogleSync.classList.toggle('active', newState);
      saveSettings();
    });
  }

  // AI Toggle
  const toggleAI = document.getElementById('toggleAI');
  if (toggleAI && !toggleAI.dataset.listener) {
    toggleAI.dataset.listener = 'true';
    toggleAI.addEventListener('click', () => {
      const checkbox = document.getElementById('aiEnabled');
      const newState = !checkbox.checked;
      checkbox.checked = newState;
      toggleAI.classList.toggle('active', newState);
      const statusText = document.getElementById('aiStatusText');
      if (statusText) {
        statusText.textContent = newState ? 'Active' : 'Disabled';
      }
      saveSettings();
    });
  }

  // Translation Toggle
  const toggleTranslation = document.getElementById('toggleTranslation');
  if (toggleTranslation && !toggleTranslation.dataset.listener) {
    toggleTranslation.dataset.listener = 'true';
    toggleTranslation.addEventListener('click', () => {
      const checkbox = document.getElementById('translationEnabled');
      const newState = !checkbox.checked;
      checkbox.checked = newState;
      toggleTranslation.classList.toggle('active', newState);

      // Show/hide language dropdown
      const langSection = document.getElementById('translationLanguageSection');
      if (langSection) {
        langSection.style.display = newState ? 'block' : 'none';
      }

      saveSettings();
    });
  }
}

// Update toggle states when settings load
async function updateToggleStates() {
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || { googleSyncEnabled: true, aiEnabled: true, translationEnabled: false };

  // Update Google Sync toggle
  const toggleGoogleSync = document.getElementById('toggleGoogleSync');
  const googleSyncCheckbox = document.getElementById('googleSyncEnabled');
  if (toggleGoogleSync && googleSyncCheckbox) {
    const isChecked = settings.googleSyncEnabled !== false;
    toggleGoogleSync.classList.toggle('active', isChecked);
    googleSyncCheckbox.checked = isChecked;
  }

  // Update AI toggle
  const toggleAI = document.getElementById('toggleAI');
  const aiCheckbox = document.getElementById('aiEnabled');
  if (toggleAI && aiCheckbox) {
    const isChecked = settings.aiEnabled !== false;
    toggleAI.classList.toggle('active', isChecked);
    aiCheckbox.checked = isChecked;
    const statusText = document.getElementById('aiStatusText');
    if (statusText) {
      statusText.textContent = isChecked ? 'Active' : 'Disabled';
    }
  }

  // Update Translation toggle
  const toggleTranslation = document.getElementById('toggleTranslation');
  const translationCheckbox = document.getElementById('translationEnabled');
  if (toggleTranslation && translationCheckbox) {
    const isChecked = settings.translationEnabled === true;
    toggleTranslation.classList.toggle('active', isChecked);
    translationCheckbox.checked = isChecked;

    // Show/hide language dropdown
    const langSection = document.getElementById('translationLanguageSection');
    if (langSection) {
      langSection.style.display = isChecked ? 'block' : 'none';
    }
  }
}

// Productivity Quote Feature
async function generateProductivityQuote() {
  const quoteElement = document.getElementById('productivityQuote');
  const quoteText = document.getElementById('quoteText');

  try {
    // Check if user has dismissed the quote for this session
    const result = await chrome.storage.local.get(['quoteHidden']);
    if (result.quoteHidden) {
      console.log('[Quote] User dismissed quote, not showing');
      return;
    }

    // Request quote from background script using Prompt API
    console.log('[Quote] Requesting productivity quote...');
    const response = await chrome.runtime.sendMessage({ action: 'generateQuote' });

    if (response.success && response.quote) {
      quoteText.textContent = `"${response.quote}"`;
      quoteElement.style.display = 'flex';
      console.log('[Quote] ✓ Quote displayed:', response.quote);
    } else {
      console.log('[Quote] Failed to generate quote:', response.error);
      // Fallback to a hardcoded quote if AI fails
      const fallbackQuotes = [
        "The secret to getting ahead is getting started.",
        "Focus on being productive instead of busy.",
        "Done is better than perfect.",
        "Start where you are. Use what you have. Do what you can.",
        "Small daily improvements lead to stunning results.",
        "Action is the foundational key to all success.",
        "The only way to do great work is to love what you do."
      ];
      const randomQuote = fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
      quoteText.textContent = `"${randomQuote}"`;
      quoteElement.style.display = 'flex';
    }
  } catch (error) {
    console.error('[Quote] Error generating quote:', error);
  }
}

// Handle quote close button
const closeQuoteBtn = document.getElementById('closeQuote');
if (closeQuoteBtn) {
  closeQuoteBtn.addEventListener('click', async () => {
    const quoteElement = document.getElementById('productivityQuote');
    quoteElement.style.opacity = '0';
    quoteElement.style.transform = 'translateY(-10px)';

    setTimeout(() => {
      quoteElement.style.display = 'none';
      quoteElement.style.opacity = '1';
      quoteElement.style.transform = 'translateY(0)';
    }, 200);

    // Store that user dismissed the quote for this session
    await chrome.storage.local.set({ quoteHidden: true });
    console.log('[Quote] User dismissed quote');
  });
}

// Reset quote hidden state when popup opens (so user gets new quote each time)
chrome.storage.local.remove('quoteHidden');

// Theme System
let currentTheme = 'light';

async function loadTheme() {
  const result = await chrome.storage.local.get(['selectedTheme']);
  currentTheme = result.selectedTheme || 'light';
  document.body.setAttribute('data-theme', currentTheme);

  // Update active theme option
  document.querySelectorAll('.theme-option').forEach(option => {
    option.classList.remove('active');
    if (option.dataset.theme === currentTheme) {
      option.classList.add('active');
    }
  });

  console.log('[Theme] Loaded theme:', currentTheme);
}

async function setTheme(theme) {
  currentTheme = theme;
  document.body.setAttribute('data-theme', theme);
  await chrome.storage.local.set({ selectedTheme: theme });

  // Update active theme option
  document.querySelectorAll('.theme-option').forEach(option => {
    option.classList.remove('active');
    if (option.dataset.theme === theme) {
      option.classList.add('active');
    }
  });

  console.log('[Theme] Set theme to:', theme);
}

// Theme Toggle Button
const themeToggleBtn = document.getElementById('themeToggle');
const themeModal = document.getElementById('themeModal');
const closeThemeModalBtn = document.getElementById('closeThemeModal');

if (themeToggleBtn && themeModal) {
  themeToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = themeModal.style.display === 'block';
    themeModal.style.display = isVisible ? 'none' : 'block';
  });

  // Close modal when clicking outside
  document.addEventListener('click', (e) => {
    if (themeModal && !themeModal.contains(e.target) && !themeToggleBtn.contains(e.target)) {
      themeModal.style.display = 'none';
    }
  });

  // Close button
  if (closeThemeModalBtn) {
    closeThemeModalBtn.addEventListener('click', () => {
      themeModal.style.display = 'none';
    });
  }

  // Theme option click handlers
  document.querySelectorAll('.theme-option').forEach(option => {
    option.addEventListener('click', async () => {
      const theme = option.dataset.theme;
      await setTheme(theme);

      // Close modal after short delay for visual feedback
      setTimeout(() => {
        themeModal.style.display = 'none';
      }, 300);
    });
  });
}

// Initialize
loadTheme();
loadTasks();

// Set up toggles
setupToggleSwitches();

// Generate productivity quote when popup opens
generateProductivityQuote();

// Initialize toggle states after a short delay to ensure DOM is ready
setTimeout(() => {
  updateToggleStates();
}, 200);

// Listen for popup focus to refresh tasks
window.addEventListener('focus', () => {
  loadTasks();
  updateToggleStates();
});

// Re-setup toggles when clicking settings tab (in case DOM changed)
tabs.forEach(tab => {
  if (tab.dataset.tab === 'settings') {
    tab.addEventListener('click', () => {
      setTimeout(() => {
        setupToggleSwitches();
        updateToggleStates();
      }, 150);
    });
  }
});

// Listen for storage changes to refresh tasks
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.tasks) {
    console.log('[Popup] Tasks changed, refreshing...');
    console.log('[Popup] New tasks count:', changes.tasks.newValue?.length || 0);
    loadTasks();
  }
});

// Audio Recording Functionality
let currentAudioMode = 'quick';
let recordingStartTime = null;
let recordingTimerInterval = null;
let extractedAudioTasks = [];
let meetingSummary = null;
let isSpeechRecording = false;
let speechRecognition = null;
let transcript = '';
let lastAudioDataUrl = null;
let attemptedMultimodal = false;
let audioMultimodalAvailable = true;

// Speech recognition runs directly in popup (not offscreen)
async function startSpeechRecognition(mode) {
  console.log('[Popup] Starting speech recognition in mode:', mode);

  transcript = '';

  // Initialize Web Speech API in popup context
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    throw new Error('Speech Recognition not supported in this browser');
  }

  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;
  speechRecognition.lang = 'en-US';
  speechRecognition.maxAlternatives = 1;

  speechRecognition.onstart = () => {
    isSpeechRecording = true;
    console.log('[Popup] ✓ Speech recognition started');
  };

  speechRecognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcriptPiece = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcriptPiece + ' ';
      } else {
        interimTranscript += transcriptPiece;
      }
    }

    if (finalTranscript) {
      transcript += finalTranscript;
      console.log('[Popup] Speech recognized:', finalTranscript);
    }

    // Update live transcript display
    const transcriptBox = document.getElementById('liveTranscript');
    if (transcriptBox && isSpeechRecording) {
      const currentText = transcript + interimTranscript;
      transcriptBox.innerHTML = `
        <p class="transcribing">Listening...</p>
        <p class="transcript-${finalTranscript ? 'final' : 'interim'}">"${currentText}"</p>
      `;
    }
  };

  speechRecognition.onerror = (event) => {
    console.error('[Popup] Speech recognition error:', event.error);

    if (event.error === 'not-allowed') {
      isSpeechRecording = false;
      throw new Error('Microphone permission denied. Please allow microphone access.');
    }
  };

  speechRecognition.onend = () => {
    console.log('[Popup] Speech recognition ended');
    if (isSpeechRecording) {
      // Auto-restart if still recording
      try {
        speechRecognition.start();
      } catch (e) {
        console.error('[Popup] Failed to restart:', e);
      }
    }
  };

  speechRecognition.start();
  isSpeechRecording = true;
}

async function stopSpeechRecognition() {
  console.log('[Popup] Stopping speech recognition');

  if (speechRecognition) {
    speechRecognition.stop();
    isSpeechRecording = false;
  }

  console.log('[Popup] Final transcript:', transcript);
  return transcript.trim();
}

function isSpeechCurrentlyRecording() {
  return isSpeechRecording;
}

// Audio mode selector
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentAudioMode = btn.dataset.mode;
    console.log('[Audio] Mode switched to:', currentAudioMode);

    // Reset preview if switching modes (only if not currently recording)
    const recording = isSpeechCurrentlyRecording() || isMediaCaptureActive();
    if (!recording) {
      document.getElementById('audioTasksPreview').innerHTML = '';
      document.getElementById('saveAudioTasksBtn').disabled = true;
      document.getElementById('copyMeetingSummaryBtn').disabled = true;
    }
  });
});

// Start recording
document.getElementById('startAudioBtn').addEventListener('click', async () => {
  const startBtn = document.getElementById('startAudioBtn');
  const stopBtn = document.getElementById('stopAudioBtn');
  const cancelBtn = document.getElementById('cancelAudioBtn');
  const transcriptBox = document.getElementById('liveTranscript');
  const timer = document.getElementById('recordingTimer');

  try {
    console.log('[Audio] Preparing audio capture...');
    attemptedMultimodal = false;
    lastAudioDataUrl = null;

    if (audioMultimodalAvailable && isMediaRecorderAvailable()) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        await startMediaCapture(currentAudioMode, stream);
        attemptedMultimodal = true;
        console.log('[Audio] ✓ MediaRecorder capture started');
      } catch (mediaError) {
        attemptedMultimodal = false;
        console.warn('[Audio] MediaRecorder unavailable, falling back to transcript only:', mediaError.message || mediaError);
      }
    } else {
      console.log('[Audio] MediaRecorder not available in this environment');
    }

    await startSpeechRecognition(currentAudioMode);

    // Hide permission section and show transcript box if needed
    const permissionSection = document.getElementById('micPermissionSection');
    if (permissionSection) {
      permissionSection.style.display = 'none';
    }
    if (transcriptBox) {
      transcriptBox.style.display = 'block';
      if (attemptedMultimodal) {
        transcriptBox.innerHTML = '<p class="transcribing">Recording started... speak naturally. We\'re capturing audio and transcript.</p>';
      } else if (!audioMultimodalAvailable) {
        transcriptBox.innerHTML = '<p class="transcribing">Recording started... speak now. (Chrome AI audio not yet available; using transcript)</p>';
      } else {
        transcriptBox.innerHTML = '<p class="transcribing">Recording started... speak now.</p>';
      }
    }

    // Update UI
    startBtn.disabled = true;
    stopBtn.disabled = false;
    cancelBtn.disabled = false;

    timer.textContent = '00:00';
    recordingStartTime = Date.now();

    // Start timer
    recordingTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      timer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);

    console.log('[Audio] Recording started in', currentAudioMode, 'mode');
  } catch (error) {
    console.error('[Audio] Failed to start recording:', error);
    console.error('[Audio] Error name:', error.name);
    console.error('[Audio] Error message:', error.message);

    if (attemptedMultimodal) {
      resetMediaCapture();
      attemptedMultimodal = false;
    }

    // Check if it's a permission error
    if (error.message && error.message.includes('PERMISSION_DENIED')) {
      // Show the permission instructions section
      const permissionSection = document.getElementById('micPermissionSection');
      const transcriptBox = document.getElementById('liveTranscript');

      if (permissionSection) {
        permissionSection.style.display = 'block';
      }
      if (transcriptBox) {
        transcriptBox.style.display = 'none';
      }

      return; // Exit early, don't show alert
    }

    let errorMessage = '';
    let showSettingsOption = false;

    if (error.name === 'NotAllowedError') {
      if (error.message === 'Permission dismissed' || error.message.includes('Permission')) {
        errorMessage = 'Microphone permission was dismissed.\n\nTo enable:\n1. Click the lock icon in your browser bar\n2. Allow microphone access\n3. Or go to chrome://settings/content/microphone\n\nThen try recording again.';
        showSettingsOption = true;
      } else {
        errorMessage = 'Microphone access denied. Please allow microphone access and try again.';
      }
    } else if (error.name === 'NotFoundError') {
      errorMessage = 'No microphone found. Please connect a microphone.';
    } else if (error.name === 'NotSupportedError') {
      errorMessage = 'Audio recording not supported. Please use Chrome or Edge.';
    } else if (error.name === 'DOMException') {
      errorMessage = `Microphone access error: ${error.message}`;
    } else {
      errorMessage = error.message || 'Unknown error occurred';
    }

    // Check if it's a permission error
    if (error.name === 'NotAllowedError' || error.message.includes('Permission') || error.message === 'PERMISSION_DENIED' || error.message.includes('PERMISSION_DENIED')) {
      // Show helpful instructions in the UI
      const transcriptBox = document.getElementById('liveTranscript');
      transcriptBox.innerHTML = `
        <div style="padding: 15px; text-align: left;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 10px;"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          <p style="font-weight: 600; margin-bottom: 15px; color: #f44336; font-size: 16px;">Microphone Permission Required</p>
          <p style="font-size: 13px; line-height: 1.6; color: #666; margin-bottom: 15px;">
            Chrome needs microphone permission to record audio. To fix this:
          </p>
          <ol style="font-size: 12px; line-height: 2; color: #666; margin-left: 20px; margin-bottom: 15px;">
            <li>Make sure you have a tab open in your browser</li>
            <li>The extension captures audio from your current tab</li>
            <li>Try recording again - Chrome will show a permission prompt</li>
            <li>Grant microphone access when asked</li>
          </ol>
          <button id="resetMicrophonePermissionBtn" class="btn-primary" style="margin-top: 15px; padding: 10px; width: 90%;">
            📹 Capture Tab Audio
          </button>
          <p style="font-size: 11px; color: #999; margin-top: 10px; text-align: center;">
            This will reset Chrome's microphone permission so it asks again
          </p>
        </div>
      `;

      // Add click handler for reset button
      document.getElementById('resetMicrophonePermissionBtn')?.addEventListener('click', async () => {
        transcriptBox.innerHTML = '<p class="transcribing">Preparing to capture tab audio...</p>';

        // Try to start recording - this will trigger the permission prompt
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (isMediaRecorderAvailable()) {
            await startMediaCapture(currentAudioMode, stream);
            attemptedMultimodal = true;
          }
          await startSpeechRecognition(currentAudioMode);
          // If we get here, recording started successfully
          transcriptBox.innerHTML = '<p class="transcribing">Recording started! Speak now.</p>';
        } catch (error) {
          resetMediaCapture();
          attemptedMultimodal = false;
          transcriptBox.innerHTML = `
            <div style="padding: 15px; text-align: center;">
              <p style="font-weight: 600; margin-bottom: 10px; color: #f44336;">Failed to start recording</p>
              <p style="font-size: 12px; color: #666; line-height: 1.6;">
                Error: ${error.message}
              </p>
              <p style="font-size: 11px; color: #999; margin-top: 10px;">
                Make sure you have a tab open and grant microphone permission when asked.
              </p>
            </div>
          `;
        }
      });
    } else {
      // Other errors
      alert(errorMessage);
    }
  }
});

// Stop recording
document.getElementById('stopAudioBtn').addEventListener('click', async () => {
  const startBtn = document.getElementById('startAudioBtn');
  const stopBtn = document.getElementById('stopAudioBtn');
  const cancelBtn = document.getElementById('cancelAudioBtn');
  const saveBtn = document.getElementById('saveAudioTasksBtn');
  const transcriptBox = document.getElementById('liveTranscript');
  const tasksPreview = document.getElementById('audioTasksPreview');
  const timer = document.getElementById('recordingTimer');

  // Stop timer
  if (recordingTimerInterval) {
    clearInterval(recordingTimerInterval);
    recordingTimerInterval = null;
  }

  // Update UI
  startBtn.disabled = false;
  stopBtn.disabled = true;

  try {
    const capturedTranscript = await stopSpeechRecognition();
    console.log('[Speech] Recording stopped');
    console.log('[Speech] Transcript:', capturedTranscript);

    let audioDataUrl = null;
    if (attemptedMultimodal) {
      try {
        audioDataUrl = await stopMediaCapture();
        lastAudioDataUrl = audioDataUrl;
        console.log('[Audio] ✓ Captured audio data for multimodal processing');
      } catch (audioStopError) {
        console.warn('[Audio] Failed to retrieve audio data, continuing with transcript:', audioStopError);
        resetMediaCapture();
      }
    } else {
      resetMediaCapture();
    }
    attemptedMultimodal = false;

    if (!capturedTranscript && !audioDataUrl) {
      // No transcript and no audio - offer manual input
      transcriptBox.innerHTML = `
        <div style="padding: 16px; text-align: center;">
          <p style="color: #f59e0b; margin-bottom: 12px; font-weight: 500;">
            ⚠️ No speech detected
          </p>
          <p style="color: #666; font-size: 13px; margin-bottom: 16px; line-height: 1.6;">
            Speak louder or type your task manually:
          </p>
          <textarea id="manualTaskInput" 
                    placeholder="Type your task here (e.g., 'Buy groceries tomorrow')"
                    style="width: 100%; min-height: 80px; padding: 10px; border: 2px solid #88AB8E; 
                           border-radius: 8px; font-family: 'Office Code Pro', 'Courier New', monospace; font-size: 14px; 
                           resize: vertical; margin-bottom: 12px;"></textarea>
          <button id="processManualTask" class="btn-primary" style="width: 100%;">
            Extract Task from Text
          </button>
        </div>
      `;

      document.getElementById('processManualTask')?.addEventListener('click', async () => {
        const manualText = document.getElementById('manualTaskInput')?.value?.trim();
        if (!manualText) {
          alert('Please enter a task description');
          return;
        }

        transcriptBox.innerHTML = '<p class="transcribing">Extracting task with AI...</p>';
        await processRecordingData(manualText, null);
      });

      cancelBtn.disabled = true;
      return;
    }

    if (audioDataUrl) {
      transcriptBox.innerHTML = `
        <p class="transcribing">Processing audio with Chrome AI...</p>
        ${capturedTranscript ? `<p class="transcript-preview">Transcript preview: "${capturedTranscript}"</p>` : ''}
      `;
    } else {
      transcriptBox.innerHTML = `
        <p class="transcript-final">"${capturedTranscript}"</p>
        <p class="transcribing" style="margin-top: 12px;">Speech-to-text complete | Extracting task with AI...</p>
      `;
    }

    cancelBtn.disabled = true;

    // Process recording (audio-first, transcript as fallback)
    await processRecordingData(capturedTranscript, audioDataUrl);

  } catch (error) {
    console.error('[Speech] Failed to stop recording:', error);
    transcriptBox.innerHTML = `<p class="empty-state">Error: ${error.message}</p>`;
  }
});

// Cancel recording
document.getElementById('cancelAudioBtn').addEventListener('click', () => {
  if (isSpeechCurrentlyRecording()) {
    stopSpeechRecognition();
  }
  resetMediaCapture();
  attemptedMultimodal = false;
  lastAudioDataUrl = null;

  if (recordingTimerInterval) {
    clearInterval(recordingTimerInterval);
    recordingTimerInterval = null;
  }

  resetAudioUI();
});

// Open Chrome Settings for microphone permission
const openChromeSettingsBtn = document.getElementById('openChromeSettings');
if (openChromeSettingsBtn) {
  openChromeSettingsBtn.addEventListener('click', () => {
    console.log('[Audio] Opening Chrome settings for extension');
    // Open Chrome extensions page
    chrome.tabs.create({ url: 'chrome://extensions/' });
  });
}

// Save audio tasks
document.getElementById('saveAudioTasksBtn').addEventListener('click', async () => {
  if (extractedAudioTasks.length === 0) {
    alert('No tasks to save');
    return;
  }

  const saveBtn = document.getElementById('saveAudioTasksBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'saveAudioTasks',
      data: { tasks: extractedAudioTasks, mode: currentAudioMode }
    });

    if (response.success) {
      console.log('[Audio] Tasks saved successfully');
      alert(`${response.tasks.length} task(s) saved successfully!`);

      // Refresh task list if on Today tab
      if (document.querySelector('[data-tab="today"]').classList.contains('active')) {
        loadTasks();
      }

      resetAudioUI();
    } else {
      alert('Failed to save tasks: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('[Audio] Failed to save tasks:', error);
    alert('Failed to save tasks. Please try again.');
  } finally {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Save Tasks';
  }
});

// Copy meeting summary
document.getElementById('copyMeetingSummaryBtn').addEventListener('click', async () => {
  if (!meetingSummary) {
    alert('No meeting summary to copy');
    return;
  }

  try {
    await navigator.clipboard.writeText(meetingSummary);
    const btn = document.getElementById('copyMeetingSummaryBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  } catch (error) {
    console.error('[Audio] Failed to copy summary:', error);
    alert('Failed to copy summary to clipboard');
  }
});

async function processRecordingData(transcript, audioDataUrl) {
  console.log('[Speech] Processing recording with AI');
  console.log('[Speech] Transcript length:', transcript ? transcript.length : 0, '| Audio available:', !!audioDataUrl);

  const saveBtn = document.getElementById('saveAudioTasksBtn');
  const copyBtn = document.getElementById('copyMeetingSummaryBtn');
  const tasksPreview = document.getElementById('audioTasksPreview');
  const transcriptBox = document.getElementById('liveTranscript');

  try {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Processing with AI...';
    tasksPreview.innerHTML = `
      <div class="audio-preview-skeleton">
        <div class="skeleton-bar" style="width: 80%;"></div>
        <div class="skeleton-bar short"></div>
        <div class="skeleton-meta"></div>
      </div>
      <div class="audio-preview-skeleton">
        <div class="skeleton-bar" style="width: 70%;"></div>
        <div class="skeleton-bar short" style="width: 40%;"></div>
        <div class="skeleton-meta" style="width: 55%;"></div>
      </div>
    `;

    let response = null;
    let usedAudioPipeline = false;

    if (audioDataUrl) {
      try {
        const audioResponse = await chrome.runtime.sendMessage({
          action: 'processAudioRecording',
          data: {
            audioDataUrl,
            transcript,
            mode: currentAudioMode
          }
        });
        response = audioResponse;
        usedAudioPipeline = audioResponse?.usedAudio === true;
        if (usedAudioPipeline) {
          console.log('[Audio] ✓ Multimodal audio extraction succeeded');
        } else {
          console.warn('[Audio] Multimodal extraction failed, will try transcript fallback:', audioResponse?.error);
        }
      } catch (audioError) {
        console.error('[Audio] Multimodal extraction threw error:', audioError);
      }
    }

    if (!response || !response.success) {
      if (!transcript || !transcript.trim()) {
        transcriptBox.innerHTML = '<p class="empty-state">Could not process audio. Please try again or type your notes manually.</p>';
        tasksPreview.innerHTML = '<p class="empty-state">No tasks extracted</p>';
        return false;
      }

      console.log('[Audio] Falling back to transcript-based extraction');
      response = await chrome.runtime.sendMessage({
        action: 'processTranscript',
        data: {
          transcript,
          mode: currentAudioMode
        }
      });
    }

    if (response.success) {
      extractedAudioTasks = response.tasks;
      meetingSummary = response.summary;

      console.log('[Audio] Extracted', extractedAudioTasks.length, 'tasks');

      const allFallback = response.fallbackUsed || extractedAudioTasks.every(task => task.source === 'fallback');

      if (allFallback) {
        audioMultimodalAvailable = response.audioUnsupported ? false : audioMultimodalAvailable;
        transcriptBox.innerHTML = '<p class="empty-state">Could not extract actionable items from audio. Try speaking clearer or enter notes manually.</p>';
        tasksPreview.innerHTML = '<p class="empty-state">No tasks extracted</p>';
        saveBtn.disabled = true;
        saveBtn.textContent = 'Save Tasks';
        copyBtn.disabled = true;
        extractedAudioTasks = [];
        return false;
      }

      // Show preview
      tasksPreview.innerHTML = extractedAudioTasks.map((task, i) => `
        <div class="audio-task-preview">
          <div class="audio-task-number">${i + 1}</div>
          <div class="audio-task-content">
            <div class="audio-task-title">${escapeHtml(task.task)}</div>
            <div class="audio-task-meta">
              Priority: ${task.priority} | Duration: ${task.estimatedDuration || 30} min
            </div>
          </div>
        </div>
      `).join('');

      const fallbackNote = (!usedAudioPipeline && audioDataUrl)
        ? '<p class="audio-fallback-note">Audio AI not available – used transcript fallback.</p>'
        : '';
      transcriptBox.innerHTML = (usedAudioPipeline
        ? '<div class="transcript-final"><strong>Audio processed with Chrome AI!</strong><br>Extracted ' + extractedAudioTasks.length + ' task(s)</div>'
        : '<div class="transcript-final"><strong>Transcript processed successfully!</strong><br>Extracted ' + extractedAudioTasks.length + ' task(s)</div>') + fallbackNote;

      saveBtn.disabled = false;
      saveBtn.textContent = `Save ${extractedAudioTasks.length} Task(s)`;

      if (currentAudioMode === 'meeting' && meetingSummary) {
        copyBtn.disabled = false;
      }

      if (response.audioUnsupported) {
        audioMultimodalAvailable = false;
        const notice = document.createElement('p');
        notice.className = 'audio-fallback-note';
        notice.textContent = 'Chrome AI audio analysis is not yet available; using transcript-based extraction.';
        transcriptBox.appendChild(notice);
      }

      console.log('[Audio] ✓ Processing complete');
      return true; // Success
    } else {
      console.error('[Audio] Processing failed:', response.error);
      transcriptBox.innerHTML = '<p class="empty-state">Failed to process audio</p>';
      tasksPreview.innerHTML = '<p class="empty-state">Failed to extract tasks</p>';
      return false; // Failure
    }
  } catch (error) {
    console.error('[Audio] Failed to process audio:', error);
    transcriptBox.innerHTML = '<p class="empty-state">Processing failed</p>';
    tasksPreview.innerHTML = '<p class="empty-state">Processing failed</p>';
    return false; // Failure
  } finally {
    if (saveBtn.textContent === 'Processing with AI...') {
      saveBtn.textContent = 'Save Tasks';
    }
  }
}

function resetAudioUI() {
  document.getElementById('startAudioBtn').disabled = false;
  document.getElementById('stopAudioBtn').disabled = true;
  document.getElementById('cancelAudioBtn').disabled = true;
  document.getElementById('saveAudioTasksBtn').disabled = true;
  document.getElementById('copyMeetingSummaryBtn').disabled = true;
  document.getElementById('recordingTimer').textContent = '00:00';
  document.getElementById('liveTranscript').innerHTML = '<p class="empty-state">Click "Start Recording" to begin.</p><p class="privacy-note">Audio is processed with AI and not stored</p>';
  document.getElementById('audioTasksPreview').innerHTML = '';

  extractedAudioTasks = [];
  meetingSummary = null;
  recordingStartTime = null;
  attemptedMultimodal = false;
  lastAudioDataUrl = null;
  resetMediaCapture();
}
