function successResponse(res, data, message = 'Success') {
    res.status(200).json({ message, data });
  }
  
  function errorResponse(res, message = 'An error occurred', status = 500) {
    res.status(status).json({ error: message });
  }
  
  module.exports = { successResponse, errorResponse };
  