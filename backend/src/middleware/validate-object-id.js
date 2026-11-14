const { ObjectId } = require('mongodb');
const { HttpError } = require('./http-error');

function validateObjectId(param = 'id') {
  return (req, _res, next) => {
    const value = req.params[param];
    // ObjectId.isValid() also accepts any 12-char string, so require the 24-hex form.
    if (!/^[a-f\d]{24}$/i.test(value) || !ObjectId.isValid(value)) {
      return next(new HttpError(400, `Invalid ${param}: "${value}" is not a valid ObjectId`));
    }
    req.objectId = new ObjectId(value);
    return next();
  };
}

module.exports = { validateObjectId };
