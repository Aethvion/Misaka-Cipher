/**
 * Aethvion Kanban - Frontend
 */

let boardData = {
    columns: []
};

let currentEditingTask = null;
let currentEditingColumnId = null;

// --- DOM Elements ---
const boardEl = document.getElementById('kb-board');
const btnAddColumn = document.getElementById('btn-add-column');
const btnSaveBoard = document.getElementById('btn-save');
const taskModal = document.getElementById('task-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnSaveTask = document.getElementById('btn-save-task');
const btnDeleteTask = document.getElementById('btn-delete-task');

const inputTaskName = document.getElementById('task-name');
const inputTaskDesc = document.getElementById('task-desc');
const inputTaskPriority = document.getElementById('task-priority');

// --- Initialization ---
async function init() {
    await loadBoard();
    renderBoard();
    setupEventListeners();
}

async function loadBoard() {
    try {
        const resp = await fetch('/api/board');
        boardData = await resp.json();
    } catch (err) {
        console.error('Failed to load board:', err);
    }
}

async function saveBoard() {
    try {
        await fetch('/api/board', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(boardData)
        });
        showNotification('Board saved successfully');
    } catch (err) {
        console.error('Failed to save board:', err);
        showNotification('Failed to save board', 'error');
    }
}

// --- Rendering ---
function renderBoard() {
    boardEl.innerHTML = '';
    
    boardData.columns.forEach(col => {
        const colEl = document.createElement('div');
        colEl.className = 'kb-column';
        colEl.dataset.id = col.id;
        
        colEl.innerHTML = `
            <div class="kb-column-header">
                <span class="kb-column-title">${col.title}</span>
                <button class="kb-btn-icon btn-del-col" data-id="${col.id}"><i class="fas fa-ellipsis-v"></i></button>
            </div>
            <div class="kb-task-list" data-id="${col.id}"></div>
            <div class="kb-column-footer">
                <button class="kb-btn btn-add-task" data-id="${col.id}">
                    <i class="fas fa-plus"></i> Add Task
                </button>
            </div>
        `;
        
        const taskListEl = colEl.querySelector('.kb-task-list');
        col.tasks.forEach(task => {
            const cardEl = createTaskCard(task, col.id);
            taskListEl.appendChild(cardEl);
        });
        
        // Drag & Drop events for column
        taskListEl.addEventListener('dragover', e => {
            e.preventDefault();
            taskListEl.classList.add('drag-over');
        });
        
        taskListEl.addEventListener('dragleave', () => {
            taskListEl.classList.remove('drag-over');
        });
        
        taskListEl.addEventListener('drop', e => {
            e.preventDefault();
            taskListEl.classList.remove('drag-over');
            const taskId = e.dataTransfer.getData('text/plain');
            const sourceColId = e.dataTransfer.getData('source-col');
            moveTask(taskId, sourceColId, col.id);
        });
        
        boardEl.appendChild(colEl);
    });
    
    // Add Task buttons
    document.querySelectorAll('.btn-add-task').forEach(btn => {
        btn.onclick = () => openTaskModal(null, btn.dataset.id);
    });
}

function createTaskCard(task, colId) {
    const card = document.createElement('div');
    card.className = 'kb-card';
    card.draggable = true;
    card.dataset.id = task.id;
    
    card.innerHTML = `
        <div class="kb-card-priority priority-${task.priority}"></div>
        <div class="kb-card-title">${task.title}</div>
        <div class="kb-card-meta">
            <span><i class="far fa-comment-alt"></i> ${task.description ? '1' : '0'}</span>
            <span>${task.priority}</span>
        </div>
    `;
    
    card.onclick = () => openTaskModal(task, colId);
    
    card.addEventListener('dragstart', e => {
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.setData('source-col', colId);
    });
    
    card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
    });
    
    return card;
}

// --- Actions ---
function openTaskModal(task, colId) {
    currentEditingTask = task;
    currentEditingColumnId = colId;
    
    if (task) {
        document.getElementById('modal-title').innerText = 'Edit Task';
        inputTaskName.value = task.title;
        inputTaskDesc.value = task.description || '';
        inputTaskPriority.value = task.priority;
        btnDeleteTask.classList.remove('hidden');
    } else {
        document.getElementById('modal-title').innerText = 'New Task';
        inputTaskName.value = '';
        inputTaskDesc.value = '';
        inputTaskPriority.value = 'medium';
        btnDeleteTask.classList.add('hidden');
    }
    
    taskModal.classList.remove('hidden');
}

function closeTaskModal() {
    taskModal.classList.add('hidden');
    currentEditingTask = null;
    currentEditingColumnId = null;
}

function saveTask() {
    const title = inputTaskName.value.trim();
    if (!title) return;
    
    const col = boardData.columns.find(c => c.id === currentEditingColumnId);
    if (!col) return;
    
    if (currentEditingTask) {
        // Update
        currentEditingTask.title = title;
        currentEditingTask.description = inputTaskDesc.value;
        currentEditingTask.priority = inputTaskPriority.value;
    } else {
        // Create
        const newTask = {
            id: 't-' + Date.now(),
            title: title,
            description: inputTaskDesc.value,
            priority: inputTaskPriority.value,
            tags: []
        };
        col.tasks.push(newTask);
    }
    
    renderBoard();
    closeTaskModal();
    saveBoard();
}

function deleteTask() {
    if (!currentEditingTask) return;
    
    const col = boardData.columns.find(c => c.id === currentEditingColumnId);
    if (col) {
        col.tasks = col.tasks.filter(t => t.id !== currentEditingTask.id);
    }
    
    renderBoard();
    closeTaskModal();
    saveBoard();
}

function moveTask(taskId, fromColId, toColId) {
    if (fromColId === toColId) return;
    
    const fromCol = boardData.columns.find(c => c.id === fromColId);
    const toCol = boardData.columns.find(c => c.id === toColId);
    
    const taskIdx = fromCol.tasks.findIndex(t => t.id === taskId);
    const [task] = fromCol.tasks.splice(taskIdx, 1);
    
    toCol.tasks.push(task);
    
    renderBoard();
    saveBoard();
}

function addColumn() {
    const title = prompt('Column Title:');
    if (!title) return;
    
    const id = title.toLowerCase().replace(/\s+/g, '-');
    boardData.columns.push({
        id: id + '-' + Date.now(),
        title: title,
        tasks: []
    });
    
    renderBoard();
    saveBoard();
}

function setupEventListeners() {
    btnAddColumn.onclick = addColumn;
    btnSaveBoard.onclick = saveBoard;
    btnCloseModal.onclick = closeTaskModal;
    btnSaveTask.onclick = saveTask;
    btnDeleteTask.onclick = deleteTask;
    
    window.onclick = (e) => {
        if (e.target === taskModal) closeTaskModal();
    };
}

function showNotification(msg, type = 'success') {
    // Simple console log for now, could be a toast
    console.log(`[${type.toUpperCase()}] ${msg}`);
}

// Start
init();
