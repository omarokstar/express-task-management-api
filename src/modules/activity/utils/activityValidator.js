const HttpError = require('../../../utils/httpError');

function validateCreateActivity(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpError(400, 'Body must be an object.');
  }

  if (typeof payload.action !== 'string' || payload.action.trim().length === 0) {
    throw new HttpError(400, '"action" is required and must be a non-empty string.');
  }

  if (payload.info !== undefined && typeof payload.info !== 'string') {
    throw new HttpError(400, '"info" must be a string.');
  }

  return {
    action: payload.action.trim(),
    info: payload.info,
  };
}

module.exports = {
  validateCreateActivity,
};
