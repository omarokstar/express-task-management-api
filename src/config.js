const path = require('node:path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');

module.exports = {
  TASKS_FILE: path.join(DATA_DIR, 'tasks.json'),
  ACTIVITY_FILE: path.join(DATA_DIR, 'activity.json'),
};
