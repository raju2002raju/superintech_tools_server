const express = require("express");
const { downloadVideo, proxyDownload } = require("../controllers/downloaderController");

const router = express.Router();

router.post("/video-downloader", downloadVideo);
router.get("/proxy-download", proxyDownload);

module.exports = router;
