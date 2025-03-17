const { igdl, ttdl, twitter, youtube } = require("aetherz-downloader");
const fbDownloader = require("fb-downloader-new");
const { alldl } = require('rahad-all-downloader');
const axios = require("axios");
const puppeteer = require("puppeteer");

exports.fetchVideo = async (url, platform) => {
    switch (platform.toLowerCase()) {
        case "instagram":
            return await igdl(url);
        case "tiktok":
            return await ttdl(url);
        case "facebook":
            return await fbDownloader(url);
        case "twitter":
            return await twitter(url);
        case "youtube":
            return await alldl(url);
        case "reddit":
            return await fetchRedditVideo(url);
            case "pinterest":
                let browser; 
                try {
                    browser = await puppeteer.launch({ 
                        headless: "new",
                        args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process']
                    });
                    const page = await browser.newPage();
                    
                    // Set user agent to avoid detection
                    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
                    
                    // Navigate to the page
                    await page.goto(url, {
                        waitUntil: "networkidle2",
                        timeout: 60000,
                    });
                                                
                    const videoInfo = await page.evaluate(async () => {
                        await new Promise(r => setTimeout(r, 5000)); // Increased wait time
                                           
                        // First check for HLS streams (m3u8)
                        const getHlsUrl = () => {
                            const scripts = document.querySelectorAll('script');
                            for (const script of scripts) {
                                if (!script.textContent) continue;
                                const m3u8Match = script.textContent.match(/"(https:\/\/[^"]*\.m3u8[^"]*)"/);
                                if (m3u8Match && m3u8Match[1]) {
                                    return {
                                        url: m3u8Match[1],
                                        title: document.title || "pinterest_video",
                                        format: "hls"
                                    };
                                }
                            }
                            return null;
                        };
                        
                        const hlsInfo = getHlsUrl();
                        if (hlsInfo) return hlsInfo;
                        
                        // Get the best quality MP4 URL
                        const videoElements = Array.from(document.querySelectorAll('video'));
                        for (const video of videoElements) {
                            if (video.src && !video.src.startsWith('blob:')) {
                                return {
                                    url: video.src,
                                    title: document.title || "pinterest_video",
                                    format: "mp4"
                                };
                            }
                        }
                        
                        const sources = Array.from(document.querySelectorAll('video source'));
                        for (const source of sources) {
                            if (source.src && !source.src.startsWith('blob:')) {
                                return {
                                    url: source.src,
                                    title: document.title || "pinterest_video",
                                    format: source.type || "mp4"
                                };
                            }
                        }
                        
                        try {
                            const scripts = Array.from(document.querySelectorAll('script[type="application/json"], script:not([type])'));
                            for (const script of scripts) {
                                if (!script.textContent) continue;
                                
                                try {
                                    const data = JSON.parse(script.textContent);
                                    const findVideoUrls = (obj) => {
                                        if (!obj || typeof obj !== 'object') return null;
                                        
                                        // Check for V_HLSV4 first (highest quality)
                                        if (obj.video_list && obj.video_list.V_HLSV4) {
                                            return {
                                                url: obj.video_list.V_HLSV4.url,
                                                title: obj.title || document.title || "pinterest_video",
                                                format: "hls"
                                            };
                                        }
                                        
                                        // Then check for V_720P
                                        if (obj.video_list && obj.video_list.V_720P) {
                                            return {
                                                url: obj.video_list.V_720P.url,
                                                title: obj.title || document.title || "pinterest_video",
                                                format: "mp4"
                                            };
                                        }
                                        
                                        // Then check for video_list in nested objects
                                        if (obj.videos && obj.videos.video_list) {
                                            if (obj.videos.video_list.V_HLSV4) {
                                                return {
                                                    url: obj.videos.video_list.V_HLSV4.url,
                                                    title: obj.title || document.title || "pinterest_video",
                                                    format: "hls"
                                                };
                                            }
                                            if (obj.videos.video_list.V_720P) {
                                                return {
                                                    url: obj.videos.video_list.V_720P.url,
                                                    title: obj.title || document.title || "pinterest_video",
                                                    format: "mp4"
                                                };
                                            }
                                        }
                                        
                                        // Look for any URL that seems to be a video
                                        if (obj.url && typeof obj.url === 'string') {
                                            if (obj.url.includes('.mp4')) {
                                                return {
                                                    url: obj.url,
                                                    title: obj.title || document.title || "pinterest_video",
                                                    format: "mp4"
                                                };
                                            }
                                            if (obj.url.includes('.m3u8')) {
                                                return {
                                                    url: obj.url,
                                                    title: obj.title || document.title || "pinterest_video",
                                                    format: "hls"
                                                };
                                            }
                                        }
                                        
                                        // Recursively search in child objects
                                        for (const key in obj) {
                                            const result = findVideoUrls(obj[key]);
                                            if (result) return result;
                                        }
                                        
                                        return null;
                                    };
                                    
                                    const videoInfo = findVideoUrls(data);
                                    if (videoInfo) return videoInfo;
                                } catch (e) {
                                    // Silent catch for JSON parsing errors
                                }
                            }
                        } catch (e) {
                            console.error("Error parsing JSON data:", e);
                        }
                        
                        // Check meta tags
                        const metaTags = document.querySelectorAll('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"]');
                        for (const meta of metaTags) {
                            const content = meta.getAttribute('content');
                            if (content && !content.startsWith('blob:')) {
                                return {
                                    url: content,
                                    title: document.title || "pinterest_video",
                                    format: content.includes('.m3u8') ? "hls" : "mp4"
                                };
                            }
                        }
                        
                        // If we get here, check for blob URLs as a last resort
                        const videoWithBlob = document.querySelector('video[src^="blob:"]');
                        if (videoWithBlob) {
                            return "BLOB_URL_DETECTED";
                        }
                        
                        return null;
                    });
                    
                    await browser.close();
                    
                    if (!videoInfo) {
                        return { 
                            success: false,
                            error: "Pinterest video URL not found" 
                        };
                    }
                    
                    if (videoInfo === "BLOB_URL_DETECTED") {
                        return { 
                            success: false,
                            error: "Pinterest is using blob URLs which cannot be directly downloaded",
                            suggestion: "You may need to use screen recording or browser automation that can handle blob URLs"
                        };
                    }
            
                    // For HLS streams, we need to handle them differently
                    if (videoInfo.format === "hls") {
                        // If you have an HLS to MP4 converter or proxy, use it here
                        // For now, just return the HLS URL with a flag
                        return {
                            success: true,
                            video_url: videoInfo.url,
                            videoUrl: videoInfo.url,
                            title: videoInfo.title,
                            isHls: true,
                            format: "hls",
                            note: "This is an HLS stream and may require special handling to play or download"
                        };
                    }
                    
                    // For MP4 and other direct formats
                    return {
                        success: true,
                        video_url: videoInfo.url,
                        videoUrl: videoInfo.url,
                        title: videoInfo.title,
                        isHls: false,
                        format: videoInfo.format || "mp4"
                    };
                
                } catch (error) {
                    console.error("Pinterest Error:", error);
                    
                    if (browser) await browser.close();
                    
                    return {
                        success: false,
                        error: "Failed to fetch video",
                        details: error.message,
                        message: "Please check if the URL is correct and the video is publicly available",
                    };
                }
                break;
        case "snapchat":
            return await fetchSnapchatVideo(url);
        default:
            throw new Error("Invalid platform");
    }
};

const fetchRedditVideo = async (url) => {
    const response = await axios.get(`${url}.json`, { headers: { "User-Agent": "Mozilla/5.0" } });
    const postData = response.data[0]?.data?.children[0]?.data;
    if (postData?.is_video) {
        return { success: true, videoUrl: postData.media.reddit_video.fallback_url };
    }
    throw new Error("No video found on Reddit post");
};

// const fetchPinterestVideo = async (url) => {
//     let browser;
//     try {
//         browser = await puppeteer.launch({
//             headless: "new",
//             args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process']
//         });
//         const page = await browser.newPage();

//         // Navigate to the page
//         await page.goto(url, {
//             waitUntil: "networkidle2",
//             timeout: 60000,
//         });

//         const videoInfo = await page.evaluate(async () => {
//             await new Promise(r => setTimeout(r, 3000));

//             const videoElements = Array.from(document.querySelectorAll('video'));
//             for (const video of videoElements) {
//                 if (video.src && !video.src.startsWith('blob:')) {
//                     return {
//                         url: video.src,
//                         title: document.title || "pinterest_video"
//                     };
//                 }
//             }

//             const sources = Array.from(document.querySelectorAll('video source'));
//             for (const source of sources) {
//                 if (source.src && !source.src.startsWith('blob:')) {
//                     return {
//                         url: source.src,
//                         title: document.title || "pinterest_video"
//                     };
//                 }
//             }

//             try {
//                 const scripts = Array.from(document.querySelectorAll('script[type="application/json"]'));
//                 for (const script of scripts) {
//                     if (!script.textContent) continue;

//                     const data = JSON.parse(script.textContent);
//                     const findVideoUrls = (obj) => {
//                         if (!obj || typeof obj !== 'object') return null;

//                         if (obj.video_list && obj.video_list.V_720P) {
//                             return {
//                                 url: obj.video_list.V_720P.url,
//                                 title: obj.title || document.title || "pinterest_video"
//                             };
//                         }

//                         if (obj.videos && obj.videos.video_list && obj.videos.video_list.V_720P) {
//                             return {
//                                 url: obj.videos.video_list.V_720P.url,
//                                 title: obj.title || document.title || "pinterest_video"
//                             };
//                         }

//                         if (obj.url && typeof obj.url === 'string' &&
//                             (obj.url.includes('.mp4') || obj.url.includes('/videos/') || obj.url.includes('.m3u8'))) {
//                             return {
//                                 url: obj.url,
//                                 title: obj.title || document.title || "pinterest_video"
//                             };
//                         }

//                         for (const key in obj) {
//                             const result = findVideoUrls(obj[key]);
//                             if (result) return result;
//                         }

//                         return null;
//                     };

//                     const videoInfo = findVideoUrls(data);
//                     if (videoInfo) return videoInfo;
//                 }
//             } catch (e) {
//                 console.error("Error parsing JSON data:", e);
//             }

//             const metaTags = document.querySelectorAll('meta[property="og:video"], meta[property="og:video:url"]');
//             for (const meta of metaTags) {
//                 const content = meta.getAttribute('content');
//                 if (content && !content.startsWith('blob:')) {
//                     return {
//                         url: content,
//                         title: document.title || "pinterest_video"
//                     };
//                 }
//             }

//             const videoWithBlob = document.querySelector('video[src^="blob:"]');
//             if (videoWithBlob) {
//                 return "BLOB_URL_DETECTED";
//             }

//             return null;
//         });

//         await browser.close();

//         if (!videoInfo) {
//             return res.status(400).json({ error: "Pinterest video URL not found" });
//         }

//         if (videoInfo === "BLOB_URL_DETECTED") {
//             return res.status(400).json({
//                 error: "Pinterest is using blob URLs which cannot be directly downloaded",
//                 suggestion: "You may need to use screen recording or browser automation that can handle blob URLs"
//             });
//         }

//         data = {
//             success: true,
//             video_url: videoInfo.url,
//             title: videoInfo.title,
//             isHls: videoInfo.url.includes('.m3u8')
//         };

//     } catch (error) {
//         console.error("Pinterest Error:", error);

//         if (browser) await browser.close();

//         return res.status(500).json({
//             error: "Failed to fetch video",
//             details: error.message,
//             step: "Please check if the URL is correct and the video is publicly available",
//         });
//     }


// };


const fetchSnapchatVideo = async (url) => {
    let browser;
    try {
        browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

        const videoUrl = await page.evaluate(() => document.querySelector("video")?.src);
        await browser.close();

        if (!videoUrl) throw new Error("No video found on Snapchat");
        return { success: true, videoUrl };

    } catch (error) {
        if (browser) await browser.close();
        return { success: false, error: "Failed to fetch Snapchat video", details: error.message };
    }
};
