const { readJsonArray } = require('../../../utils/jsonStore');
const { TASKS_FILE, ACTIVITY_FILE } = require('../../../config');

async function generateTasksSummary() {
  const [tasks, activity] = await Promise.all([
    readJsonArray(TASKS_FILE),
    readJsonArray(ACTIVITY_FILE),
  ]);

  const summary = {
    total: tasks.length,
    byStatus: {
      todo: 0,
      'in-progress': 0,
      done: 0,
    },
    recentActivityCount: 0,
  };

  for (const task of tasks) {
    if (task.completed) {
      summary.byStatus.done++;
    } else if (task.createdAt === task.updatedAt) {
      summary.byStatus.todo++;
    } else {
      summary.byStatus['in-progress']++;
    }
  }

  const recentThreshold = Date.now() - (24 * 60 * 60 * 1000);
  for (const act of activity) {
    const actTime = new Date(act.when).getTime();
    if (actTime >= recentThreshold) {
      summary.recentActivityCount++;
    }
  }

  return summary;
}

module.exports = {
  generateTasksSummary,
};
