// Vercel Serverless Function for GDFLIX Bypass
// Adapted from the Node.js/Express version.

const axios = require('axios');
const cheerio = require('cheerio');

// --- Configuration ---
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://google.com'
};
const GENERATION_TIMEOUT = 40 * 1000; // In milliseconds
const POLL_INTERVAL = 5 * 1000;      // In milliseconds
const REQUEST_TIMEOUT = 30 * 1000;   // In milliseconds
const MAX_REDIRECT_HOPS = 5;

// --- Utility Functions ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- Core GDFLIX Bypass Function (The "Engine") ---
async function getGdflixDownloadLink(startUrl) {
    const session = axios.create({
        headers: HEADERS,
        timeout: REQUEST_TIMEOUT,
        maxRedirects: 5
    });
    const logs = [];
    let currentUrl = startUrl;
    let hopsCount = 0;
    
    let page2_drivebot_url, html_content_p2_drivebot, page3_drivebot_url, html_content_p3_drivebot;

    try {
        while (hopsCount < MAX_REDIRECT_HOPS) {
            logs.push(`[Hop ${hopsCount}] Fetching/Checking URL: ${currentUrl}`);
            let response;
            try {
                response = await session.get(currentUrl, { validateStatus: () => true });
                if (response.status >= 400) {
                     logs.push(`  Error fetching ${currentUrl}: Status ${response.status}`);
                     return { finalLink: null, logs };
                }
            } catch (e) {
                logs.push(`  Error fetching ${currentUrl}: ${e.message}`);
                return { finalLink: null, logs };
            }
            const landedUrl = response.request.res.responseUrl || currentUrl;
            const htmlContent = response.data;
            logs.push(`  Landed on: ${landedUrl} (Status: ${response.status})`);
            let nextHopUrl = null;
            let isSecondaryRedirect = false;
            const metaMatch = htmlContent.match(/<meta\s+http-equiv="refresh"\s+content="[^"]*url=([^"]+)"/i);
            if (metaMatch) {
                const extractedUrl = metaMatch[1].trim().split(';')[0];
                const potentialNext = new URL(extractedUrl, landedUrl).href;
                if (potentialNext.split('#')[0] !== landedUrl.split('#')[0]) {
                    nextHopUrl = potentialNext;
                    logs.push(`  Detected META refresh redirect to: ${nextHopUrl}`);
                    isSecondaryRedirect = true;
                }
            }
            if (!isSecondaryRedirect) {
                const jsMatch = htmlContent.match(/location\.replace\(['"]([^'"]+)['"]/i);
                if (jsMatch) {
                    const extractedUrl = jsMatch[1].trim().split('+document.location.hash')[0].replace(/['"\s]/g, '');
                    const potentialNext = new URL(extractedUrl, landedUrl).href;
                    if (potentialNext.split('#')[0] !== landedUrl.split('#')[0]) {
                        nextHopUrl = potentialNext;
                        logs.push(`  Detected JS location.replace redirect to: ${nextHopUrl}`);
                        isSecondaryRedirect = true;
                    }
                }
            }
            if (isSecondaryRedirect && nextHopUrl) {
                logs.push(`  Following secondary redirect...`);
                currentUrl = nextHopUrl;
                hopsCount++;
                await sleep(500);
            } else {
                logs.push(`  No further actionable secondary redirect found. Proceeding with content analysis.`);
                currentUrl = landedUrl;
                logs.push(`--- Final Content Page HTML Snippet (URL: ${currentUrl}) ---`);
                logs.push(String(htmlContent).substring(0, 3000) + '...');
                logs.push(`--- End Final Content Page HTML Snippet ---`);
                const $1 = cheerio.load(htmlContent);
                const page1Url = currentUrl;
                const possibleTagsP1 = $1('a, button');
                logs.push(`Found ${possibleTagsP1.length} potential link/button tags on final content page (${page1Url}).`);
                
                // --- PRIORITY 1: Pixeldrain
                let pixeldrainLinkTag = null;
                possibleTagsP1.each((i, el) => {
                    if (/pixeldrain\s*(dl)?/i.test($1(el).text().trim())) {
                        pixeldrainLinkTag = el;
                        return false;
                    }
                });
                if (pixeldrainLinkTag) {
                    let pixeldrainHref = $1(pixeldrainLinkTag).attr('href') || $1(pixeldrainLinkTag).closest('form').attr('action');
                    if (pixeldrainHref) {
                        const pixeldrainFullUrl = new URL(pixeldrainHref, page1Url).href;
                        logs.push(`Success: Found Pixeldrain link URL: ${pixeldrainFullUrl}`);
                        return { finalLink: pixeldrainFullUrl, logs };
                    }
                }

                // --- PRIORITY 2: CLOUD DOWNLOAD [R2]
                let cloudR2LinkTag = null;
                possibleTagsP1.each((i, el) => {
                    if (/cloud\s+download\s+\[R2\]/i.test($1(el).text().trim())) {
                        cloudR2LinkTag = el;
                        return false;
                    }
                });
                 if (cloudR2LinkTag) {
                    let cloudR2Href = $1(cloudR2LinkTag).attr('href') || $1(cloudR2LinkTag).closest('form').attr('action');
                    if (cloudR2Href) {
                        const finalDownloadLink = new URL(cloudR2Href, page1Url).href;
                        logs.push(`Success: Found R2 download link: ${finalDownloadLink}`);
                        return { finalLink: finalDownloadLink, logs };
                    }
                }

                // --- PRIORITY 3: Fast Cloud Download
                let fastCloudLinkTag = null;
                possibleTagsP1.each((i, el) => {
                    if (/fast\s*cloud\s*(download|dl)/i.test($1(el).text().trim())) {
                        fastCloudLinkTag = el;
                        return false;
                    }
                });

                if (fastCloudLinkTag) {
                    let fastCloudHref = $1(fastCloudLinkTag).attr('href') || $1(fastCloudLinkTag).closest('form').attr('action');
                    if (fastCloudHref) {
                        const intermediateUrl = new URL(fastCloudHref, page1Url).href;
                        await sleep(1000);
                        const responseIntermediate = await session.get(intermediateUrl, { headers: { 'Referer': page1Url } });
                        const page2Url = responseIntermediate.request.res.responseUrl || intermediateUrl;
                        const $2 = cheerio.load(responseIntermediate.data);

                        let resumeLinkTag = null;
                        $2('a, button').each((i, el) => {
                            if (/cloud\s+resume\s+download/i.test($2(el).text().trim())) {
                                resumeLinkTag = el;
                                return false;
                            }
                        });
                        if (resumeLinkTag) {
                            let finalLinkHref = $2(resumeLinkTag).attr('href') || $2(resumeLinkTag).closest('form').attr('action');
                            if (finalLinkHref) {
                                const finalDownloadLink = new URL(finalLinkHref, page2Url).href;
                                return { finalLink: finalDownloadLink, logs };
                            }
                        }

                        let generateTag = $2('button#cloud').get(0);
                        if (!generateTag) {
                             $2('a, button').each((i, el) => {
                                if (/generate\s+cloud\s+link/i.test($2(el).text().trim())) {
                                    generateTag = el; return false;
                                }
                            });
                        }

                        if (generateTag) {
                            const postData = {};
                            $2(generateTag).closest('form').find('input[type="hidden"]').each((i, input) => {
                                const name = $2(input).attr('name');
                                if(name) postData[name] = $2(input).attr('value') || '';
                            });
                            const finalPostData = { ...{ action: 'cloud', key: '08df4425e31c4330a1a0a3cefc45c19e84d0a192', action_token: '' }, ...postData };
                            const postBody = new URLSearchParams(finalPostData).toString();
                            const postResponse = await session.post(page2Url, postBody, { headers: { 'Referer': page2Url, 'x-token': new URL(page2Url).hostname, 'X-Requested-With': 'XMLHttpRequest' } });
                            let responseData = postResponse.data;
                             if (typeof responseData !== 'object') { try { responseData = JSON.parse(responseData); } catch (e) { responseData = null; } }
                            
                            if (responseData && (responseData.visit_url || responseData.url)) {
                                const page3FcUrl = new URL(responseData.visit_url || responseData.url, page2Url).href;
                                const startTime = Date.now();
                                while (Date.now() - startTime < GENERATION_TIMEOUT) {
                                    await sleep(POLL_INTERVAL);
                                    const pollResponse = await session.get(page3FcUrl, { headers: { 'Referer': page3FcUrl } });
                                    const pollLandedUrl = pollResponse.request.res.responseUrl || page3FcUrl;
                                    const pollSoup = cheerio.load(pollResponse.data);
                                    let polledResumeTag = null;
                                    pollSoup('a, button').each((i, el) => {
                                        if (/cloud\s+resume\s+download/i.test(pollSoup(el).text().trim())) {
                                            polledResumeTag = el; return false;
                                        }
                                    });
                                    if (polledResumeTag) {
                                        let finalLinkHref = pollSoup(polledResumeTag).attr('href') || pollSoup(polledResumeTag).closest('form').attr('action');
                                        if (finalLinkHref) {
                                            return { finalLink: new URL(finalLinkHref, pollLandedUrl).href, logs };
                                        }
                                    }
                                }
                                logs.push('Error: Link generation timed out.');
                            }
                        }
                    }
                }

                // --- PRIORITY 4: Drivebot
                let drivebotInitialTag = null;
                possibleTagsP1.each((i, el) => { if(/DRIVEBOT/i.test($1(el).text().trim())) { drivebotInitialTag = el; return false; } });
                
                if (drivebotInitialTag) {
                    let drivebotInitialHref = $1(drivebotInitialTag).attr('href') || $1(drivebotInitialTag).closest('form').attr('action');
                    if(drivebotInitialHref){
                        const drivebotStep1Url = new URL(drivebotInitialHref, page1Url).href;
                        const res_db_s1 = await session.get(drivebotStep1Url, { headers: { 'Referer': page1Url } });
                        page2_drivebot_url = res_db_s1.request.res.responseUrl || drivebotStep1Url;
                        const $d2 = cheerio.load(res_db_s1.data);
                        let serverChoiceTag = null;
                        $d2('a, button').each((i, el) => { if(/DRIVEBOT\s*1/i.test($d2(el).text().trim())){ serverChoiceTag = el; return false; } });
                        if(!serverChoiceTag) $d2('a, button').each((i, el) => { if(/DRIVEBOT/i.test($d2(el).text().trim())){ serverChoiceTag = el; return false; } });

                        if(serverChoiceTag){
                            let nextUrl, payload = {}, method = 'GET';
                            const $serverTag = $d2(serverChoiceTag);
                            const parentForm = $serverTag.closest('form');
                            if(parentForm.length > 0){
                                nextUrl = new URL(parentForm.attr('action') || '', page2_drivebot_url).href;
                                method = (parentForm.attr('method') || 'GET').toUpperCase();
                                parentForm.find('input').each((i, input) => {
                                    const name = $d2(input).attr('name');
                                    if(name) payload[name] = $d2(input).attr('value') || '';
                                });
                            } else if (serverChoiceTag.name === 'a') {
                                nextUrl = new URL($serverTag.attr('href'), page2_drivebot_url).href;
                            }

                            if(nextUrl){
                                const res_db_s2 = method === 'POST' ? await session.post(nextUrl, new URLSearchParams(payload).toString(), { headers: { 'Referer': page2_drivebot_url } }) : await session.get(nextUrl, { params: payload, headers: { 'Referer': page2_drivebot_url } });
                                page3_drivebot_url = res_db_s2.request.res.responseUrl || nextUrl;
                                const $d3 = cheerio.load(res_db_s2.data);
                                let genLinkButton = null;
                                $d3('a, button, input').each((i, el) => { if(/Generate Link/i.test($d3(el).text().trim() || $d3(el).attr('value'))) { genLinkButton = el; return false; } });

                                if(genLinkButton){
                                    let postUrlGen = page3_drivebot_url, postDataGen = {}, httpMethodGen = 'POST';
                                    const parentFormGen = $d3(genLinkButton).closest('form');
                                    if(parentFormGen.length > 0) {
                                        postUrlGen = new URL(parentFormGen.attr('action') || '', page3_drivebot_url).href;
                                        httpMethodGen = (parentFormGen.attr('method') || 'POST').toUpperCase();
                                        parentFormGen.find('input').each((i, input) => {
                                            const name = $d3(input).attr('name');
                                            if(name) postDataGen[name] = $d3(input).attr('value') || '';
                                        });
                                    }
                                    const resGen = httpMethodGen === 'POST' ? await session.post(postUrlGen, new URLSearchParams(postDataGen).toString(), { headers: { 'Referer': page3_drivebot_url } }) : await session.get(postUrlGen, { params: postDataGen, headers: { 'Referer': page3_drivebot_url } });
                                    const $d4 = cheerio.load(resGen.data);
                                    let finalDlLink = null;
                                    const linkPattern = /https?:\/\/[^\s"'`]*\.gdindex\.lol[^\s"'`]*/;
                                    const linkInputTag = $d4('input').filter((i, el) => linkPattern.test($d4(el).attr('value')));
                                    if(linkInputTag.length > 0) finalDlLink = linkInputTag.attr('value').trim();
                                    if(!finalDlLink){
                                        const linkAnchorTag = $d4('a').filter((i, el) => linkPattern.test($d4(el).attr('href')));
                                        if (linkAnchorTag.length > 0) finalDlLink = linkAnchorTag.attr('href').trim();
                                    }
                                    if (finalDlLink) return { finalLink: finalDlLink, logs };
                                }
                            }
                        }
                    }
                }

                logs.push("Error: All prioritized search attempts failed to yield a download link.");
                return { finalLink: null, logs };
            }
        }
        if (hopsCount >= MAX_REDIRECT_HOPS) {
            logs.push(`Error: Exceeded maximum redirect hops (${MAX_REDIRECT_HOPS}).`);
        }
    } catch (e) {
        logs.push(`FATAL: An unexpected error occurred: ${e.message}\n${e.stack}`);
        return { finalLink: null, logs };
    }
    return { finalLink: null, logs };
}

// --- Vercel Serverless Function Handler ---
export default async function handler(request, response) {
    // Set CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*'); // Or a specific domain
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    if (request.method !== 'POST') {
        response.setHeader('Allow', ['POST']);
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    let scriptLogs = [];
    const result = { success: false, error: "Request processing failed", finalUrl: null, logs: scriptLogs };
    let statusCode = 500;

    try {
        const { gdflixUrl } = request.body;
        if (!gdflixUrl) {
            result.error = "Invalid or missing JSON (expected {'gdflixUrl': '...' })";
            return response.status(400).json(result);
        }
        scriptLogs.push(`Received gdflixUrl: ${gdflixUrl}`);

        const { finalLink, logs: scriptLogsFromFunc } = await getGdflixDownloadLink(gdflixUrl);
        scriptLogs.push(...scriptLogsFromFunc);

        if (finalLink) {
            scriptLogs.push("Bypass process completed successfully.");
            result.success = true;
            result.finalUrl = finalLink;
            result.error = null;
            statusCode = 200;
        } else {
            scriptLogs.push("Bypass process failed to find the final download link.");
            result.success = false;
            let extractedError = "GDFLIX Extraction Failed (Check logs for details)";
            // Simple error extraction for now
             const lastErrorLog = scriptLogs.filter(log => /Error:/i.test(log)).pop() || '';
             if (lastErrorLog) {
                 extractedError = lastErrorLog.split(/Error:\s*/i)[1] || lastErrorLog;
             }
            result.error = extractedError.substring(0, 250);
            statusCode = 200; // Return 200 on "user error" like a failed bypass
        }
    } catch (e) {
        console.error(`FATAL API Handler Error: ${e.message}`, e.stack);
        scriptLogs.push(`FATAL API Handler Error: An unexpected server error occurred.`);
        result.error = "Internal server error processing the request.";
        statusCode = 500;
    } finally {
        result.logs = scriptLogs;
        response.status(statusCode).json(result);
    }
}
