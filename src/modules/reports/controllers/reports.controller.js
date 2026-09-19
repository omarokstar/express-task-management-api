const reportsService = require('../services/reports.service');

async function getTasksSummary(_req, res) {
  const summary = await reportsService.generateTasksSummary();
  // Returning unwrapped exactly as specified in the feature requirements
  res.status(200).json(summary);
}

module.exports = {
  getTasksSummary,
};
