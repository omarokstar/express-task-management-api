const express = require('express');

const asyncHandler = require('../../../middleware/asyncHandler');
const c = require('../controllers/activity.controller');

const activityRouter = express.Router();

activityRouter.get('/', asyncHandler(c.get_activity));
activityRouter.post('/', asyncHandler(c.addActivity));

module.exports = activityRouter;
