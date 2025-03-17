const express = require('express');
const { plotGenerator } = require('../controllers/plotController');

const router = express.Router();

router.post('/plot-generator', plotGenerator);

module.exports = router;
