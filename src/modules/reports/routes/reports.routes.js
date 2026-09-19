const express = require('express');

const asyncHandler = require('../../../middleware/asyncHandler');
const reportsController = require('../controllers/reports.controller');

const reportsRouter = express.Router();

reportsRouter.get('/tasks-summary', asyncHandler(reportsController.getTasksSummary));

reportsRouter.all('/tasks-summary', (req, res) => {
  res.set('Allow', 'GET')
     .status(405)
     .json({ error: { message: `Method ${req.method} not allowed.` } });
});

module.exports = reportsRouter;
