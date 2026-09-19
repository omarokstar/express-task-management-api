const path = require('node:path');
const { readJsonArray, mutateJsonArray } = require('../../../utils/jsonStore');

const fp = path.join(process.cwd(), 'data', 'activity.json');

async function getAllActivity() {
  const arr = await readJsonArray(fp);
  return arr;
}

async function createNewActivity(b) {
  const one = {
    id: String(Date.now()),
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
