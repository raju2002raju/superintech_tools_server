// ffmpegHelper.js - Complete rewrite
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

ffmpeg.setFfmpegPath(ffmpegPath);

// Direct FFmpeg command for HLS to MP4 conversion - bypassing fluent-ffmpeg for better control
exports.convertHlsToMp4Direct = async (hlsUrl) => {
    return new Promise((resolve, reject) => {
        const tempOutputPath = path.join(os.tmpdir(), `pinterest-${Date.now()}.mp4`);
        console.log(`Starting direct FFmpeg conversion to ${tempOutputPath}`);

        // Arguments optimized for Pinterest HLS streams
        const args = [
            '-y',
            '-timeout', '30000000',
            '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            '-i', hlsUrl,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-bsf:a', 'aac_adtstoasc',
            '-max_muxing_queue_size', '9999',
            '-movflags', 'faststart',
            tempOutputPath
        ];

        console.log(`FFmpeg command: ${ffmpegPath} ${args.join(' ')}`);
        
        const process = spawn(ffmpegPath, args);
        let stdoutData = '';
        let stderrData = '';

        process.stdout.on('data', (data) => {
            stdoutData += data.toString();
            console.log(`FFmpeg stdout: ${data}`);
        });

        process.stderr.on('data', (data) => {
            stderrData += data.toString();
            console.log(`FFmpeg progress: ${data}`);
        });

        process.on('close', (code) => {
            if (code === 0) {
                console.log(`FFmpeg process completed successfully: ${tempOutputPath}`);
                resolve(tempOutputPath);
            } else {
                console.error(`FFmpeg process failed with code ${code}`);
                console.error(`stdout: ${stdoutData}`);
                console.error(`stderr: ${stderrData}`);
                reject(new Error(`FFmpeg process failed with code ${code}`));
            }
        });
    });
};

// Fallback to using fluent-ffmpeg if the direct method fails
exports.convertHlsToMp4 = async (hlsUrl) => {
    try {
        return await exports.convertHlsToMp4Direct(hlsUrl);
    } catch (directError) {
        console.error(`Direct FFmpeg conversion failed, trying fluent-ffmpeg: ${directError.message}`);
        
        return new Promise((resolve, reject) => {
            const tempOutputPath = path.join(os.tmpdir(), `pinterest-fallback-${Date.now()}.mp4`);

            ffmpeg()
                .input(hlsUrl)
                .inputOptions([
                    '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    '-timeout', '30000000'
                ])
                .outputOptions([
                    '-c:v', 'copy',
                    '-c:a', 'aac',
                    '-bsf:a', 'aac_adtstoasc',
                    '-max_muxing_queue_size', '9999',
                    '-movflags', 'faststart'
                ])
                .output(tempOutputPath)
                .on('start', (commandLine) => {
                    console.log(`Fallback FFmpeg process started: ${commandLine}`);
                })
                .on('progress', (progress) => {
                    console.log(`Processing: ${progress.percent ? progress.percent.toFixed(2) + '%' : 'N/A'}`);
                })
                .on('end', () => {
                    console.log(`Fallback FFmpeg process completed: ${tempOutputPath}`);
                    resolve(tempOutputPath);
                })
                .on('error', (err) => {
                    console.error(`Fallback FFmpeg error: ${err.message}`);
                    reject(err);
                })
                .run();
        });
    }
};

exports.convertToAudio = async (inputStream) => {
    return new Promise((resolve, reject) => {
        const passThrough = new require('stream').PassThrough();
        ffmpeg()
            .input(inputStream)
            .toFormat('mp3')
            .audioCodec('libmp3lame')
            .audioBitrate('192k')
            .on('end', () => resolve(passThrough))
            .on('error', reject)
            .writeToStream(passThrough);
    });
};

exports.cleanupTempFile = (filePath) => {
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) console.error(`Error deleting temp file: ${err.message}`);
            else console.log(`Temp file deleted: ${filePath}`);
        });
    }
};