const fs = require('node:fs/promises');

let taskQueue = Promise.resolve();

async function mutateJsonArray(filePath, mutatorFn) {
  taskQueue = taskQueue.then(async () => {
    const data = await readJsonArray(filePath);
    const result = await mutatorFn(data);
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
    return result;
  });
  return taskQueue;
}

async function readJsonArray(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    if (!raw.trim()) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(filePath, '[]\n', 'utf-8');
      return [];
    }

    throw error;
  }
}

async function writeJsonArray(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

module.exports = {
  readJsonArray,
  writeJsonArray,
  mutateJsonArray,
};
