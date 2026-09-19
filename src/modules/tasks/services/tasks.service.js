const path = require('node:path');

const { createId } = require('../../../utils/id');
const { readJsonArray, writeJsonArray, mutateJsonArray } = require('../../../utils/jsonStore');
const HttpError = require('../../../utils/httpError');

const TASKS_FILE_PATH = path.join(process.cwd(), 'data', 'tasks.json');

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

async function getAllTasks() {
  return readJsonArray(TASKS_FILE_PATH);
}

async function getTaskById(taskId) {
  const tasks = await readJsonArray(TASKS_FILE_PATH);
  const task = tasks.find((item) => item.id === taskId);

  if (!task) {
    throw new HttpError(404, 'Task not found.');
  }

  return task;
}

async function createTask(payload) {
  if (!payload.title || typeof payload.title !== 'string') {
    throw new HttpError(400, 'Invalid title.');
  }

  if (payload.completed !== undefined && typeof payload.completed !== 'boolean') {
    throw new HttpError(400, 'Invalid completed value.');
  }

  if (payload.completed === undefined) {
    payload.completed = false;
  }

  const newTask = buildTaskRecord(payload);

  await mutateJsonArray(TASKS_FILE_PATH, (tasks) => {
    tasks.push(newTask);
  });

  return newTask;
}

async function updateTask(taskId, updates) {
  if (typeof updates.title === 'string' && updates.title.length < 2) {
    throw new HttpError(400, 'Title is too short.');
  }

  if (updates.completed !== undefined && typeof updates.completed !== 'boolean') {
    throw new HttpError(400, 'completed must be boolean');
  }

  return await mutateJsonArray(TASKS_FILE_PATH, (tasks) => {
    const taskIndex = tasks.findIndex((item) => item.id === taskId);

    if (taskIndex === -1) {
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
    const taskIndex = tasks.findIndex((item) => item.id === taskId);

    if (taskIndex === -1) {
      throw new HttpError(404, 'Task not found.');
    }

    const [removedTask] = tasks.splice(taskIndex, 1);
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
