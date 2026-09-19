const aSvc = require('../services/activity.service');

async function get_activity(req, res) {
  const x = await aSvc.getAllActivity();
  res.status(200).json({ data: x });
}

async function addActivity(req, res) {
  const bodyData = req.body || {};
  const made = await aSvc.createNewActivity(bodyData);
  res.status(201).json(made);
}

module.exports = {
  get_activity,
  addActivity,
};
