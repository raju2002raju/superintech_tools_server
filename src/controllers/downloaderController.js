const videoService = require("../services/videoService");
const { convertToAudio } = require("../utils/ffmpegHelper");
const { downloadPinterestHls, cleanupTempFile } = require("../utils/pinterest-handler");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { spawn } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const os = require('os');

exports.downloadVideo = async (req, res) => {
    const { url, platform } = req.body;
    if (!url || !platform) {
        return res.status(400).json({ message: "URL and platform are required" });
    }

    try {
        const data = await videoService.fetchVideo(url, platform);
        res.json({ message: "Download data fetched!", data });
    } catch (error) {
        console.error("Download Error:", error);
        res.status(500).json({ error: "Failed to download video", details: error.message });
    }
};

// Function to stream a file and clean up after
const streamFileAndCleanup = (filePath, response, contentType, filename) => {
    if (!fs.existsSync(filePath)) {
        return response.status(500).json({ message: "Generated file not found" });
    }

    const stat = fs.statSync(filePath);
    
    if (stat.size === 0) {
        cleanupTempFile(filePath);
        return response.status(500).json({ message: "Generated file is empty" });
    }
    
    console.log(`Streaming file: ${filePath}, Size: ${stat.size} bytes, Type: ${contentType}`);
    
    response.setHeader("Content-Length", stat.size);
    response.setHeader("Content-Type", contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const fileStream = fs.createReadStream(filePath);
    
    fileStream.on("error", (error) => {
        console.error("File stream error:", error);
        cleanupTempFile(filePath);
        if (!response.headersSent) {
            response.status(500).json({ message: "Error streaming file", error: error.message });
        }
    });

    fileStream.on("end", () => {
        console.log(`File streaming completed: ${filePath}`);
        // Clean up the temporary file after streaming
        cleanupTempFile(filePath);
    });

    response.on("close", () => {
        console.log(`Response closed, cleaning up: ${filePath}`);
        fileStream.destroy();
        cleanupTempFile(filePath);
    });
    
    fileStream.pipe(response);
};

// Direct download function as last resort
const directDownloadHls = async (hlsUrl, outputPath) => {
    return new Promise((resolve, reject) => {
        console.log(`Attempting direct HLS download: ${hlsUrl}`);
        
        const args = [
            '-y',
            '-loglevel', 'info',
            '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\nReferer: https://www.pinterest.com/\r\n',
            '-i', hlsUrl,
            '-c', 'copy',
            '-bsf:a', 'aac_adtstoasc',
            outputPath
        ];
        
        const ffmpegProcess = spawn(ffmpegPath, args);
        let stderrData = '';
        
        ffmpegProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
            console.log(`Direct download stderr: ${data}`);
        });
        
        ffmpegProcess.on('close', (code) => {
            if (code === 0) {
                console.log(`Direct download succeeded: ${outputPath}`);
                resolve();
            } else {
                console.error(`Direct download failed with code ${code}`);
                reject(new Error(`Direct download failed with code ${code}`));
            }
        });
    });
};

exports.proxyDownload = async (req, res) => {
    const fileUrl = req.query.url;
    const fileType = req.query.fileType?.toLowerCase(); 
    let fileName = req.query.fileName;
    const isHls = req.query.isHls === "true";
    const isPinterest = req.query.platform === "pinterest" || 
                        (fileUrl && (fileUrl.includes("pinimg.com") || fileUrl.includes("pinterest")));

    if (!fileUrl) {
        return res.status(400).json({ message: "File URL is required" });
    }

    if (typeof fileUrl !== "string") {
        return res.status(400).json({ message: "File URL must be a string" });
    }

    // Clean up fileName
    if (!fileName) {
        fileName = fileType === "audio" ? "audio.mp3" : "video.mp4";
    } else {
        // Remove invalid characters
        fileName = fileName.replace(/[^\w\s.-]/g, '');
        
        const ext = path.extname(fileName);
        if (!ext) {
            fileName += fileType === "audio" ? ".mp3" : ".mp4";
        }
    }

    try {
        // Handle Pinterest HLS streams
        if ((isHls || fileUrl.includes('.m3u8'))) {
            console.log(`HLS stream detected: ${fileUrl}, isPinterest: ${isPinterest}`);
            
            try {
                // Use our specialized handler
                const mp4FilePath = await downloadPinterestHls(fileUrl, fileName);
                return streamFileAndCleanup(mp4FilePath, res, "video/mp4", fileName);
            } catch (error) {
                console.error("Primary HLS download method failed:", error);
                
                // Try fallback direct method as last resort
                try {
                    console.log("Trying fallback direct method...");
                    const tempOutputPath = path.join(os.tmpdir(), `fallback-${Date.now()}.mp4`);
                    await directDownloadHls(fileUrl, tempOutputPath);
                    
                    if (fs.existsSync(tempOutputPath) && fs.statSync(tempOutputPath).size > 0) {
                        console.log("Fallback method successful!");
                        return streamFileAndCleanup(tempOutputPath, res, "video/mp4", fileName);
                    } else {
                        throw new Error("Fallback method failed to produce valid output");
                    }
                } catch (fallbackError) {
                    console.error("All HLS download methods failed:", fallbackError);
                    return res.status(500).json({ 
                        message: "Failed to download HLS stream after multiple attempts", 
                        error: error.message,
                        url: fileUrl
                    });
                }
            }
        }
        // Handle regular video/audio files
        console.log(`Regular file download: ${fileUrl}`);
        const response = await axios({
            url: fileUrl,
            method: "GET",
            responseType: "stream",
            timeout: 60000, // Increase timeout for large files
            headers: { 
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                "Referer": new URL(fileUrl).origin
            }
        });

        // For audio conversion
        if (fileType === "audio") {
            try {
                res.setHeader("Content-Type", "audio/mpeg");
                res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
                
                const audioStream = await convertToAudio(response.data);

                audioStream.on("error", (error) => {
                    console.error("Audio stream error:", error);
                    if (!res.headersSent) {
                        return res.status(500).json({ message: "Audio conversion failed", error: error.message });
                    }
                });

                audioStream.pipe(res);
            } catch (error) {
                console.error("Audio conversion error:", error);
                if (!res.headersSent) {
                    return res.status(500).json({ message: "Audio conversion failed", error: error.message });
                }
            }
        } else {
            // Direct video download
            res.setHeader("Content-Type", "video/mp4");
            res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

            response.data.on("error", (error) => {
                console.error("Video stream error:", error);
                if (!res.headersSent) {
                    return res.status(500).json({ message: "Video stream failed", error: error.message });
                }
            });

            response.data.pipe(res);
        }

        req.on("close", () => {
            if (response.data) {
                response.data.destroy();
            }
        });

    } catch (error) {
        console.error("Download failed:", error);
        if (!res.headersSent) {
            return res.status(500).json({ 
                message: "File download failed", 
                error: error.message,
                url: fileUrl
            });
        }
    }
};
