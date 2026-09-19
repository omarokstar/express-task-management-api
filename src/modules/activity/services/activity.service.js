const { readJsonArray, mutateJsonArray } = require('../../../utils/jsonStore');
const { createId } = require('../../../utils/id');
const { ACTIVITY_FILE } = require('../../../config');

async function getAllActivity() {
  const arr = await readJsonArray(ACTIVITY_FILE);
  return arr;
}

async function createNewActivity(payload) {
  const newActivity = {
    id: createId(),
    action: payload.action,
    info: payload.info,
    when: new Date().toISOString(),
  };

  await mutateJsonArray(ACTIVITY_FILE, (list) => {
    list.push(newActivity);
  });
  
  return newActivity;
}

module.exports = {
  getAllActivity,
  createNewActivity,
};
