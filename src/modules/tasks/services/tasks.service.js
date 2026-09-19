const path = require('node:path');

const { createId } = require('../../../utils/id');
const { readJsonArray, writeJsonArray, mutateJsonArray } = require('../../../utils/jsonStore');
const HttpError = require('../../../utils/httpError');

const TASKS_FILE_PATH = path.join(__dirname, '../../../../data/tasks.json');

function buildTaskRecord(payload) {
  const now = new Date().toISOString();

  return {
    id: createId(),
    title: payload.title,
    completed: payload.completed,
    createdAt: now,
    updatedAt: now,
  };
}

function getIndex(tasks) {
  if (!tasks.__indexMap) {
    Object.defineProperty(tasks, '__indexMap', {
      value: new Map(tasks.map((t, i) => [t.id, i])),
      enumerable: false,
      writable: true,
    });
  }
  return tasks.__indexMap;
}

async function getAllTasks() {
  return readJsonArray(TASKS_FILE_PATH);
}

async function getTaskById(taskId) {
  const tasks = await readJsonArray(TASKS_FILE_PATH);
  const indexMap = getIndex(tasks);
  const index = indexMap.get(taskId);

  if (index === undefined) {
    throw new HttpError(404, 'Task not found.');
  }

  return tasks[index];
}

async function createTask(payload) {
  const newTask = buildTaskRecord(payload);

  await mutateJsonArray(TASKS_FILE_PATH, (tasks) => {
    const indexMap = getIndex(tasks);
    tasks.push(newTask);
    indexMap.set(newTask.id, tasks.length - 1);
  });

  return newTask;
}

async function updateTask(taskId, updates) {
  return await mutateJsonArray(TASKS_FILE_PATH, (tasks) => {
    const indexMap = getIndex(tasks);
    const taskIndex = indexMap.get(taskId);

    if (taskIndex === undefined) {
      throw new HttpError(404, 'Task not found.');
    }

    const existingTask = tasks[taskIndex];
    const updatedTask = {
      ...existingTask,
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.completed !== undefined && { completed: updates.completed }),
      updatedAt: new Date().toISOString(),
    };

    tasks[taskIndex] = updatedTask;
    return updatedTask;
  });
}

async function deleteTask(taskId) {
  return await mutateJsonArray(TASKS_FILE_PATH, (tasks) => {
    const indexMap = getIndex(tasks);
    const taskIndex = indexMap.get(taskId);

    if (taskIndex === undefined) {
      throw new HttpError(404, 'Task not found.');
    }

    const [removedTask] = tasks.splice(taskIndex, 1);
    
    // Rebuild index for shifted elements
    tasks.__indexMap = null;

    return removedTask;
  });
}

module.exports = {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
};
