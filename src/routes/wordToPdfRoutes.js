const express = require("express");
const { wordToPdfHandler } = require("../controllers/wordToPdfController");

const router = express.Router();

// Route for Word to PDF conversion
router.post("/word-to-pdf", wordToPdfHandler);

module.exports = router;
