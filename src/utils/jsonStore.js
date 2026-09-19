const fs = require('node:fs/promises');

let taskQueue = Promise.resolve();
const cache = new Map();

async function mutateJsonArray(filePath, mutatorFn) {
  const data = await readJsonArray(filePath);
  const result = await mutatorFn(data);
  cache.set(filePath, data);

  // Queue disk write asynchronously without blocking the response
  taskQueue = taskQueue.then(() =>
    fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
  ).catch(console.error);

  return result;
}

async function readJsonArray(filePath) {
  if (cache.has(filePath)) {
    return cache.get(filePath);
  }

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    if (!raw.trim()) {
      cache.set(filePath, []);
      return [];
    }

    const parsed = JSON.parse(raw);
    const result = Array.isArray(parsed) ? parsed : [];
    cache.set(filePath, result);
    return result;
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(filePath, '[]\n', 'utf-8');
      cache.set(filePath, []);
      return [];
    }

    throw error;
  }
}

async function writeJsonArray(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

function clearCache() {
  cache.clear();
}

module.exports = {
  readJsonArray,
  writeJsonArray,
  mutateJsonArray,
  clearCache,
};
