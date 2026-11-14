const { HttpError } = require('./http-error');

function notFound(req, _res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }
  res.status(status).json({
    status,
    error: status >= 500 ? 'Internal Server Error' : err.message,
  });
}

module.exports = { notFound, errorHandler };
