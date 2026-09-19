const path = require('node:path');
const { readJsonArray, mutateJsonArray } = require('../../../utils/jsonStore');
const { createId } = require('../../../utils/id');

const fp = path.join(process.cwd(), 'data', 'activity.json');

async function getAllActivity() {
  const arr = await readJsonArray(fp);
  return arr;
}

async function createNewActivity(b) {
  const one = {
    id: createId(),
    action: b.action,
    info: b.info,
    when: new Date().toISOString(),
  };

  await mutateJsonArray(fp, (list) => {
    list.push(one);
  });
  
  return one;
}

module.exports = {
  getAllActivity,
  createNewActivity,
};
