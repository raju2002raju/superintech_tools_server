require("dotenv").config();
const convertapi = require("convertapi")(process.env.CONVERTAPI_KEY);

module.exports = convertapi;
