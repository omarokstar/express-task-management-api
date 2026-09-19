const express = require('express');

const asyncHandler = require('../../../middleware/asyncHandler');
const activityController = require('../controllers/activity.controller');

const activityRouter = express.Router();

activityRouter.get('/', asyncHandler(activityController.getActivity));
activityRouter.post('/', asyncHandler(activityController.addActivity));

activityRouter.all('/', (req, res) => {
  res.set('Allow', 'GET, POST')
     .status(405)
     .json({ error: { message: `Method ${req.method} not allowed.` } });
});

module.exports = activityRouter;
