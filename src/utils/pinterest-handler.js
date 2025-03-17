// pinterest-handler.js
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const os = require('os');
const url = require('url');

// Function to directly download HLS segments and combine them
exports.downloadPinterestHls = async (hlsUrl, outputFileName = null) => {
    if (!outputFileName) {
        outputFileName = `pinterest-video-${Date.now()}.mp4`;
    }
    
    const tempOutputPath = path.join(os.tmpdir(), outputFileName);
    console.log(`Processing Pinterest HLS: ${hlsUrl}`);
    console.log(`Output path: ${tempOutputPath}`);
    
    try {
        // Get M3U8 content
        const m3u8Response = await axios.get(hlsUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://www.pinterest.com/'
            }
        });
        
        // Check if we got valid response
        if (!m3u8Response.data || typeof m3u8Response.data !== 'string') {
            throw new Error('Invalid M3U8 response');
        }
        
        // Get the base URL for resolving relative paths
        const parsedUrl = new URL(hlsUrl);
        const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname.substring(0, parsedUrl.pathname.lastIndexOf('/') + 1)}`;
        console.log(`Base URL for relative paths: ${baseUrl}`);
        
        // Fix relative paths in the M3U8 content
        let fixedM3u8Content = m3u8Response.data;
        
        // Replace relative URLs with absolute URLs
        fixedM3u8Content = fixedM3u8Content.replace(/(#EXT-X-MEDIA:.*URI=")((?!https?:\/\/).+?)(".*)/g, 
                                                  (match, prefix, relPath, suffix) => {
            return `${prefix}${baseUrl}${relPath}${suffix}`;
        });
        
        // Replace relative segment paths
        fixedM3u8Content = fixedM3u8Content.replace(/(^(?!#)(?!https?:\/\/).*$)/gm, 
                                                  (match) => {
            return `${baseUrl}${match}`;
        });
        
        console.log("Fixed M3U8 content with absolute paths");
        
        // Save fixed M3U8 to temp file
        const m3u8TempPath = path.join(os.tmpdir(), `pinterest-${Date.now()}.m3u8`);
        fs.writeFileSync(m3u8TempPath, fixedM3u8Content);
        console.log(`Fixed M3U8 file saved to ${m3u8TempPath}`);
        
        // Use direct FFmpeg command
        return new Promise((resolve, reject) => {
            // FFmpeg command for Pinterest HLS streams
            const args = [
                '-y',
                '-loglevel', 'info',
                '-i', m3u8TempPath,
                '-c:v', 'copy',
                '-c:a', 'copy',
                '-bsf:a', 'aac_adtstoasc',
                '-movflags', 'faststart',
                tempOutputPath
            ];
            
            console.log(`Running FFmpeg command: ${ffmpegPath} ${args.join(' ')}`);
            
            const ffmpegProcess = spawn(ffmpegPath, args);
            let stdoutData = '';
            let stderrData = '';

            ffmpegProcess.stdout.on('data', (data) => {
                stdoutData += data.toString();
                console.log(`FFmpeg output: ${data}`);
            });

            ffmpegProcess.stderr.on('data', (data) => {
                stderrData += data.toString();
                console.log(`FFmpeg stderr: ${data}`);
            });

            ffmpegProcess.on('close', (code) => {
                // Clean up the temporary M3U8 file
                try {
                    fs.unlinkSync(m3u8TempPath);
                    console.log(`Deleted temporary M3U8 file: ${m3u8TempPath}`);
                } catch (unlinkError) {
                    console.error(`Failed to delete M3U8 file: ${unlinkError.message}`);
                }
                
                if (code === 0) {
                    console.log(`FFmpeg completed successfully. Output: ${tempOutputPath}`);
                    
                    // Verify the output file
                    if (fs.existsSync(tempOutputPath) && fs.statSync(tempOutputPath).size > 0) {
                        resolve(tempOutputPath);
                    } else {
                        reject(new Error('FFmpeg completed but output file is empty or missing'));
                    }
                } else {
                    console.error(`FFmpeg failed with code ${code}`);
                    console.error(`FFmpeg stderr: ${stderrData}`);
                    
                    // Try a more aggressive approach if the first one fails
                    console.log("First approach failed, trying alternative method...");
                    
                    // For some Pinterest videos, we need a different approach
                    const altArgs = [
                        '-y',
                        '-loglevel', 'info',
                        '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\nReferer: https://www.pinterest.com/\r\n',
                        '-i', hlsUrl,  // Use the original URL directly
                        '-c', 'copy',
                        tempOutputPath
                    ];
                    
                    console.log(`Running alternative FFmpeg command: ${ffmpegPath} ${altArgs.join(' ')}`);
                    
                    const altProcess = spawn(ffmpegPath, altArgs);
                    let altStderrData = '';
                    
                    altProcess.stderr.on('data', (data) => {
                        altStderrData += data.toString();
                        console.log(`Alt FFmpeg stderr: ${data}`);
                    });
                    
                    altProcess.on('close', (altCode) => {
                        if (altCode === 0) {
                            console.log(`Alternative FFmpeg approach succeeded: ${tempOutputPath}`);
                            
                            if (fs.existsSync(tempOutputPath) && fs.statSync(tempOutputPath).size > 0) {
                                resolve(tempOutputPath);
                            } else {
                                reject(new Error('Alternative FFmpeg completed but output file is empty'));
                            }
                        } else {
                            console.error(`Alternative FFmpeg approach failed with code ${altCode}`);
                            console.error(`Alternative FFmpeg stderr: ${altStderrData}`);
                            reject(new Error(`All FFmpeg approaches failed. Last error code: ${altCode}`));
                        }
                    });
                }
            });
        });
    } catch (error) {
        console.error(`Pinterest HLS download failed: ${error.message}`);
        throw error;
    }
};

// Function to clean up temporary files
exports.cleanupTempFile = (filePath) => {
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) console.error(`Error deleting temp file: ${err.message}`);
            else console.log(`Temp file deleted: ${filePath}`);
        });
    }
};