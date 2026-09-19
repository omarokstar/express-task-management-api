const path = require('node:path');
const { readJsonArray, writeJsonArray } = require('../../../utils/jsonStore');

const fp = path.join(process.cwd(), 'data', 'activity.json');

async function getAllActivity() {
  const arr = await readJsonArray(fp);
  return arr;
}

async function createNewActivity(b) {
  const list = await readJsonArray(fp);
  const one = {
    id: String(Date.now()),
    action: b.action,
    info: b.info,
    when: new Date().toISOString(),
  };

  list.push(one);
  await writeJsonArray(fp, list);
  return one;
}

module.exports = {
  getAllActivity,
  createNewActivity,
};
