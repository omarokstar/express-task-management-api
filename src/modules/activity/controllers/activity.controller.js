const aSvc = require('../services/activity.service');

async function get_activity(req, res) {
  const x = await aSvc.getAllActivity();
  res.status(200).json({ data: x });
}

async function addActivity(req, res) {
  const bodyData = req.body || {};

  if (typeof bodyData.action !== 'string' || bodyData.action.trim().length === 0) {
    return res.status(400).json({ error: { message: '"action" is required and must be a non-empty string.' } });
  }

  if (bodyData.info !== undefined && typeof bodyData.info !== 'string') {
    return res.status(400).json({ error: { message: '"info" must be a string.' } });
  }

  const payload = {
    action: bodyData.action.trim(),
    info: bodyData.info,
  };

  const made = await aSvc.createNewActivity(payload);
  res.status(201).json(made);
}

module.exports = {
  get_activity,
  addActivity,
};
