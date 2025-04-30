// --- START OF script.js (MODIFIED FOR ITEM DETAIL PAGE NAVIGATION) ---
(function() {
    'use strict';

    // ===========================================================
    // JAVASCRIPT SECTION (Updated for Item Detail Page Navigation)
    // ===========================================================
    const config = {
        HDR_LOGO_URL: "https://as1.ftcdn.net/v2/jpg/05/32/83/72/1000_F_532837228_v8CGZRU0jy39uCtqFRnJz6xDntrGuLLx.webp",
        FOURK_LOGO_URL: "https://i.pinimg.com/736x/85/c4/b0/85c4b0a2fb8612825d0cd2f53460925f.jpg",
        ITEMS_PER_PAGE: 50,
        LOCAL_STORAGE_KEY: 'cinemaGharState_v14_detailpage', // Incremented version
        PLAYER_VOLUME_KEY: 'cinemaGharPlayerVolume',
        PLAYER_SPEED_KEY: 'cinemaGharPlayerSpeed',
        SEARCH_DEBOUNCE_DELAY: 300,
        SUGGESTIONS_DEBOUNCE_DELAY: 250,
        MAX_SUGGESTIONS: 50,
        UPDATES_PREVIEW_INITIAL_COUNT: 10,
        UPDATES_PREVIEW_LOAD_MORE_COUNT: 10,
        MOVIE_DATA_API_URL: '/api/movies',
        BYPASS_API_URL: 'https://hubcloud-bypass.onrender.com/api/hubcloud',
        GDFLIX_BYPASS_API_URL: 'https://gdflix-bypass.onrender.com/api/gdflix',
        BYPASS_TIMEOUT: 60000
    };

    // --- DOM Element References ---
    const container = document.getElementById('cinemaghar-container');
    const pageLoader = document.getElementById('page-loader');
    const searchFocusArea = document.getElementById('search-focus-area');
    const resultsArea = document.getElementById('results-area');
    // RENAMED shared-item-view conceptually to item-detail-view, but keeping IDs for now
    const itemViewArea = document.getElementById('shared-item-view'); // Was: sharedItemView
    const itemViewContent = document.getElementById('shared-item-content'); // Was: sharedItemContent
    const searchInput = document.getElementById('mainSearchInput');
    const suggestionsContainer = document.getElementById('searchInputSuggestions');
    const qualityFilterSelect = document.getElementById('mainQualityFilterSelect');
    const mainErrorArea = document.getElementById('main-error-area');
    const updatesPreviewSection = document.getElementById('updates-preview-section');
    const updatesPreviewList = document.getElementById('updates-preview-list');
    const showMoreUpdatesButton = document.getElementById('showMoreUpdatesButton');
    const videoContainer = document.getElementById('videoContainer');
    const videoElement = document.getElementById('html5VideoPlayer');
    const videoTitle = document.getElementById('videoTitle');
    const vlcBox = document.getElementById('vlcBox');
    const vlcText = document.getElementById('vlcText');
    const audioWarningDiv = document.getElementById('audioWarning');
    const muteButton = document.getElementById('muteButton');
    const volumeSlider = document.getElementById('volumeSlider');
    const playbackSpeedSelect = document.getElementById('playbackSpeedSelect');
    const customControlsContainer = document.getElementById('customControlsContainer');
    const audioTrackSelect = document.getElementById('audioTrackSelect');
    const tabNavigation = document.querySelector('.tab-navigation');
    const tabContent = document.querySelector('.tab-content');
    const allFilesTabButton = document.getElementById('allFilesTabButton');
    const moviesTabButton = document.getElementById('moviesTabButton');
    const seriesTabButton = document.getElementById('seriesTabButton');
    const allFilesTabPanel = document.getElementById('allFilesTabPanel');
    const moviesTabPanel = document.getElementById('moviesTabPanel');
    const seriesTabPanel = document.getElementById('seriesTabPanel');
    const allFilesTableBody = document.getElementById('allFilesTableBody');
    const moviesTableBody = document.getElementById('moviesTableBody');
    const seriesTableBody = document.getElementById('seriesTableBody');
    const allFilesTableHead = document.querySelector('#allFilesTable thead');
    const moviesTableHead = document.querySelector('#moviesTable thead');
    const seriesTableHead = document.querySelector('#seriesTable thead');
    const allFilesPaginationControls = document.getElementById('allFilesPaginationControls');
    const moviesPaginationControls = document.getElementById('moviesPaginationControls');
    const seriesPaginationControls = document.getElementById('seriesPaginationControls');
    const backToHomeButtonResults = document.getElementById('backToHomeButtonResults');
    const backToItemViewButton = document.getElementById('backToHomeButtonShared'); // Renamed conceptually
    const pageFooter = document.getElementById('page-footer');
    // Player Custom URL section elements
    const playerCustomUrlSection = document.getElementById('playerCustomUrlSection');
    const playerCustomUrlInput = document.getElementById('playerCustomUrlInput');
    const playerPlayCustomUrlButton = document.getElementById('playerPlayCustomUrlButton');
    const playerCustomUrlFeedback = playerCustomUrlSection?.querySelector('.player-custom-url-feedback');
    // Global Custom URL button
    const playCustomUrlGlobalButton = document.getElementById('playCustomUrlGlobalButton');

    // --- State Variables ---
    let localSuggestionData = [];
    let currentViewData = []; // Holds data for the *currently displayed* results tab
    let weeklyUpdatesData = []; // Holds data specifically for the homepage preview
    let viewedItemData = null; // Holds the data for the currently displayed item detail view
    let updatesPreviewShownCount = 0;
    let uniqueQualities = new Set();
    // REMOVED: activeTableActionRow, activePreviewActionRow
    let copyFeedbackTimeout;
    let bypassFeedbackTimeout;
    let suggestionDebounceTimeout;
    let searchAbortController = null;
    let isDirectShareLoad = false; // If page loaded directly via ?shareId=
    let currentViewMode = 'homepage'; // 'homepage', 'search', 'itemView'
    let activeResultsTab = 'allFiles';
    let lastFocusedElement = null;
    let isGlobalCustomUrlMode = false;

    let currentState = {
        searchTerm: '',
        qualityFilter: '',
        typeFilter: '',
        sortColumn: 'lastUpdated',
        sortDirection: 'desc',
        currentPage: 1,
        limit: config.ITEMS_PER_PAGE,
    };

    const tabMappings = {
        allFiles: { button: allFilesTabButton, panel: allFilesTabPanel, tableBody: allFilesTableBody, pagination: allFilesPaginationControls, typeFilter: '', tableHead: allFilesTableHead },
        movies: { button: moviesTabButton, panel: moviesTabPanel, tableBody: moviesTableBody, pagination: moviesPaginationControls, typeFilter: 'movies', tableHead: moviesTableHead },
        series: { button: seriesTabButton, panel: seriesTabPanel, tableBody: seriesTableBody, pagination: seriesPaginationControls, typeFilter: 'series', tableHead: seriesTableHead }
    };

    // --- Utility Functions (Unchanged unless noted) ---
    const sanitize = (str) => { if (str === null || typeof str === 'undefined') return ""; const temp = document.createElement('div'); temp.textContent = String(str); return temp.innerHTML; };
    const TimeAgo = { MINUTE: 60, HOUR: 3600, DAY: 86400, WEEK: 604800, MONTH: 2592000, YEAR: 31536000, format: (isoString) => { if (!isoString) return 'N/A'; try { const date = new Date(isoString); const seconds = Math.floor((new Date() - date) / 1000); if (isNaN(seconds) || seconds < 0) { console.warn(`TimeAgo: Invalid seconds calculation for ${isoString}. Parsed date: ${date}. Returning full date.`); return TimeAgo.formatFullDate(date); } if (seconds < 2) return "just now"; if (seconds < TimeAgo.MINUTE) return `${seconds} sec${seconds > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.HOUR) return `${Math.floor(seconds / TimeAgo.MINUTE)} min${Math.floor(seconds / TimeAgo.MINUTE) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY) return `${Math.floor(seconds / TimeAgo.HOUR)} hr${Math.floor(seconds / TimeAgo.HOUR) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY * 2) return "Yesterday"; if (seconds < TimeAgo.WEEK) return `${Math.floor(seconds / TimeAgo.DAY)} days ago`; if (seconds < TimeAgo.MONTH) return `${Math.floor(seconds / TimeAgo.WEEK)} wk${Math.floor(seconds / TimeAgo.WEEK) > 1 ? 's' : ''} ago`; return TimeAgo.formatFullDate(date, true); } catch (e) { console.error("Date Format Error (TimeAgo):", isoString, e); return 'Invalid Date'; } }, formatFullDate: (date, short = false) => { if (!(date instanceof Date) || isNaN(date.getTime())) return 'Invalid Date'; const optsDate = short ? { year: '2-digit', month: 'numeric', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }; const optsTime = { hour: 'numeric', minute: '2-digit', hour12: true }; try { return `${date.toLocaleDateString(undefined, optsDate)}${short ? '' : ', ' + date.toLocaleTimeString(undefined, optsTime)}`; } catch (e) { console.error("toLocaleDateString/Time failed:", e); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; } } };
    function extractSizeData(inputString) { if (!inputString) return { value: 0, unit: '', display: 'N/A', bytes: 0 }; const r = /(?<size>[\d.]+)\s?(?<unit>GB|MB)/i; const m = String(inputString).match(r); if (m?.groups?.size && m?.groups?.unit) { const value = parseFloat(m.groups.size); const unit = m.groups.unit.toUpperCase(); if (!isNaN(value)) { const bytes = unit === 'GB' ? value * 1024 * 1024 * 1024 : value * 1024 * 1024; return { value: value, unit: unit, display: `${value} ${unit}`, bytes: isNaN(bytes) ? 0 : bytes }; } } return { value: 0, unit: '', display: 'N/A', bytes: 0 }; }
    function getMimeTypeFromUrl(url) { if (!url) return 'video/*'; const m = url.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/); if (!m) return 'video/*'; const ext = m[1].toLowerCase(); const mimeMap = { 'mkv': 'video/x-matroska', 'mp4': 'video/mp4', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo', 'webm': 'video/webm', 'wmv': 'video/x-ms-wmv', 'flv': 'video/x-flv', 'ts': 'video/mp2t', 'm4v': 'video/x-m4v', 'ogv': 'video/ogg' }; return mimeMap[ext] || 'video/*'; }
    function handleVideoError(event) {
         console.error("HTML5 Video Error:", event, videoElement?.error);
         let msg = "An unknown error occurred while trying to play the video.";
         if (videoElement?.error) {
             switch (videoElement.error.code) {
                 case MediaError.MEDIA_ERR_ABORTED: msg = 'Playback was aborted.'; break;
                 case MediaError.MEDIA_ERR_NETWORK: msg = 'A network error caused the video download to fail.'; break;
                 case MediaError.MEDIA_ERR_DECODE: msg = 'Video decoding error (unsupported codec or corrupt file?).'; break;
                 case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = 'Video format not supported or server/network failed.'; break;
                 default: msg = `An unknown video error occurred (Code: ${videoElement.error.code}).`; break;
             }
         }
         if (audioWarningDiv) {
             audioWarningDiv.innerHTML = `<strong>Playback Error:</strong> ${sanitize(msg)} <br>Consider using 'Copy URL' with an external player (VLC/MX), 'Play in VLC or MX Player' (Android), or the 'Play Custom URL' option below.`;
             audioWarningDiv.style.display = 'block';
         }
         // Show custom URL toggle ONLY if player is associated with the item view area
         if (!isGlobalCustomUrlMode && itemViewContent && videoContainer?.parentElement === itemViewContent) {
              const customUrlToggleButton = itemViewContent.querySelector('.custom-url-toggle-button');
              if (customUrlToggleButton) {
                  console.log("Playback error occurred in item view, showing custom URL toggle button.");
                  customUrlToggleButton.style.display = 'inline-flex';
                  if (playerCustomUrlSection && playerCustomUrlSection.style.display === 'none') {
                     toggleCustomUrlInput(customUrlToggleButton, true); // Pass true to indicate it was triggered by error
                  }
                  setTimeout(() => { customUrlToggleButton.focus(); }, 100);
              } else { console.warn("Could not find custom URL toggle button in the item view content after video error."); }
         } else if (isGlobalCustomUrlMode) {
              if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'flex';
              if (videoElement) videoElement.style.display = 'none';
              if (customControlsContainer) customControlsContainer.style.display = 'none';
         }
     }
    function extractQualityFromFilename(filename) { if (!filename) return null; const safeFilename = String(filename); const patterns = [ /(?:^|\.|\[|\(|\s|_|-)((?:4k|2160p|1080p|720p|480p))(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(WEB-?DL|WEBRip|BluRay|BDRip|BRRip|HDTV|HDRip|DVDrip|DVDScr|HDCAM|HC|TC|TS|CAM)(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(HDR|DV|Dolby.?Vision|HEVC|x265)(?=$|\.|\]|\)|\s|_|-)/i ]; let foundQuality = null; for (const regex of patterns) { const match = safeFilename.match(regex); if (match && match[1]) { let quality = match[1].toUpperCase(); quality = quality.replace(/WEB-?DL/i, 'WEBDL'); quality = quality.replace(/BLURAY/i, 'BluRay'); quality = quality.replace(/DVDRIP/i, 'DVD'); quality = quality.replace(/DOLBY.?VISION/i, 'Dolby Vision'); if (quality === '2160P') quality = '4K'; if (patterns.indexOf(regex) < 2) return quality; // Return resolution/primary source immediately
                if (patterns.indexOf(regex) === 2 && !foundQuality) foundQuality = quality; // Store HDR/HEVC if no primary found yet
            } } return foundQuality; } // Return HDR/HEVC if nothing else matched
    function normalizeTextForSearch(text) { if (!text) return ""; return String(text) .toLowerCase() .replace(/[.\-_\(\)\[\]]/g, '') .replace(/\s+/g, ' ') .trim(); }
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    async function copyToClipboard(text, feedbackSpan) { console.log("Attempting to copy:", text); let success = false; if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) { try { await navigator.clipboard.writeText(text); success = true; console.log("navigator.clipboard.writeText SUCCEEDED"); } catch (err) { console.error("Async clipboard write failed:", err); success = false; } } if (!success) { console.warn("Using fallback copy method (execCommand)."); const textArea = document.createElement("textarea"); textArea.value = text; textArea.style.position = "fixed"; textArea.style.top = "-9999px"; textArea.style.left = "-9999px"; textArea.style.opacity = "0"; textArea.setAttribute("readonly", ""); document.body.appendChild(textArea); try { textArea.select(); textArea.setSelectionRange(0, textArea.value.length); success = document.execCommand('copy'); console.log("Fallback execCommand result:", success); } catch (err) { console.error('Fallback copy execCommand failed:', err); success = false; } finally { document.body.removeChild(textArea); } } if (success) { console.log("Copy successful!"); if (feedbackSpan) { showCopyFeedback(feedbackSpan, 'Copied!', false); } } else { console.error("Copy FAILED."); if (feedbackSpan) { showCopyFeedback(feedbackSpan, 'Copy Failed!', true); } else { alert("Copy failed. Please try again or copy manually. Check console for errors (F12)."); } } return success; }

    // --- Data Preprocessing (Unchanged) ---
    function preprocessMovieData(movie) {
        const processed = { ...movie };
        processed.id = movie.original_id;
        processed.url = (movie.url && typeof movie.url === 'string' && movie.url.toLowerCase() !== 'null' && movie.url.trim() !== '') ? movie.url : null;
        if (processed.url) {
            processed.url = processed.url.replace(/ /g, '%20'); // Encode spaces
        }
        processed.hubcloud_link = (movie.hubcloud_link && typeof movie.hubcloud_link === 'string' && movie.hubcloud_link.toLowerCase() !== 'null' && movie.hubcloud_link.trim() !== '') ? movie.hubcloud_link : null;
        processed.gdflix_link = (movie.gdflix_link && typeof movie.gdflix_link === 'string' && movie.gdflix_link.toLowerCase() !== 'null' && movie.gdflix_link.trim() !== '') ? movie.gdflix_link : null;

        processed.displayFilename = sanitize(movie.filename || '');
        processed.sizeData = extractSizeData(movie.size_display);
        if (!processed.size_bytes && processed.sizeData.bytes > 0) { processed.size_bytes = processed.sizeData.bytes; }
        // Use extracted quality if API quality is missing/generic, but prefer API if available
        processed.displayQuality = sanitize(movie.quality || extractQualityFromFilename(movie.filename) || 'N/A');
        if (processed.displayQuality && processed.displayQuality !== 'N/A') { uniqueQualities.add(processed.displayQuality); }
        const tsString = movie.last_updated_ts;
        let dateObject = null;
        if (tsString) { try { dateObject = new Date(tsString); } catch(e) { console.warn("Date parse error in preprocessMovieData:", e); } }
        processed.lastUpdatedTimestamp = (dateObject && !isNaN(dateObject)) ? dateObject.getTime() : 0;
        if (processed.lastUpdatedTimestamp === 0 && tsString) { console.warn(`Invalid date format received for movie ID ${processed.id}, filename "${processed.displayFilename}":`, tsString); }
        processed.numericId = typeof processed.id === 'number' ? processed.id : Infinity;
        processed.searchText = normalizeTextForSearch(`${processed.id || ''} ${processed.displayFilename}`);
        processed.isSeries = !!movie.is_series;
        processed.extractedTitle = null; processed.extractedYear = null; processed.extractedSeason = null;
        const filename = processed.displayFilename;
        if (filename) {
            const seasonMatch = filename.match(/[. ]S(\d{1,2})(?:E\d{1,2}|[. ])/i);
            if (seasonMatch && seasonMatch[1]) {
                processed.extractedSeason = parseInt(seasonMatch[1], 10);
                processed.isSeries = true; // Mark as series if season found
                const titleEndIndex = seasonMatch.index;
                processed.extractedTitle = filename.substring(0, titleEndIndex).replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
            }
            // Only look for year if it's not already identified as a series by season
            if (!processed.extractedSeason) {
                const yearMatch = filename.match(/[.(_[](\d{4})[.)_\]]/);
                if (yearMatch && yearMatch[1]) {
                    const year = parseInt(yearMatch[1], 10);
                    // Basic sanity check for year
                    if (year > 1900 && year < (new Date().getFullYear() + 5)) {
                        processed.extractedYear = year;
                        const titleEndIndex = yearMatch.index;
                        // Avoid grabbing year as part of title if it's right before
                        processed.extractedTitle = filename.substring(0, titleEndIndex).replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
                    }
                }
            }
            // Fallback title extraction if others failed
            if (!processed.extractedTitle) {
                processed.extractedTitle = filename.split(/[\.({\[]/)[0].replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
            }
            // Clean up common quality tags from the end of the extracted title
            if (processed.extractedTitle) {
                processed.extractedTitle = processed.extractedTitle.replace(/ (4k|2160p|1080p|720p|480p|web-?dl|webrip|bluray|bdrip|brrip|hdtv|hdrip|dvdrip|dvdscr|hdcam|hc|tc|ts|cam|hdr|dv|dolby.?vision|hevc|x265)$/i, '').trim();
            }
        }
        return processed;
    }

    // --- HTML Generation (For Item Detail View ONLY) ---
    // This function now ONLY generates the content for the item detail page (#itemViewContent)
    function createItemDetailContentHTML(movie) {
        const displayFilename = movie.displayFilename;
        const displaySize = movie.sizeData.display;
        const displayQuality = movie.displayQuality;
        const streamTitle = (movie.extractedTitle || displayFilename || '').split(/[\.\(\[]/)[0].replace(/[_ ]+/g, ' ').trim() + (displayQuality !== 'N/A' ? ` (${displayQuality})` : '');
        const timestampString = movie.last_updated_ts;
        const formattedDateRelative = TimeAgo.format(timestampString);
        const dateObject = timestampString ? new Date(timestampString) : null;
        const formattedDateFull = (dateObject && !isNaN(dateObject)) ? TimeAgo.formatFullDate(dateObject) : 'N/A';
        let hdrLogoHtml = ''; let fourkLogoHtml = '';
        const lowerFilename = (displayFilename || '').toLowerCase();
        const lowerQuality = (displayQuality || '').toLowerCase();
        if (lowerQuality === '4k' || lowerQuality.includes('2160p') || lowerFilename.includes('2160p') || lowerFilename.includes('.4k.')) { fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo fourk-logo" title="4K Ultra HD" />`; }
        if (lowerQuality.includes('hdr') || lowerQuality.includes('dolby vision') || lowerQuality === 'dv' || lowerFilename.includes('.hdr') || lowerFilename.includes('dolby.vision') || lowerFilename.includes('.dv.')) { hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo hdr-logo" title="HDR / Dolby Vision Content" />`; }

        // Escape values for use in HTML attributes
        const escapedStreamTitle = sanitize(streamTitle);
        const escapedFilename = sanitize(displayFilename);
        const escapedUrl = movie.url ? sanitize(movie.url) : ''; // Already space-encoded if needed
        const escapedId = movie.id ? sanitize(String(movie.id).replace(/[^a-zA-Z0-9-_]/g, '')) : '';
        const escapedHubcloudUrl = movie.hubcloud_link ? sanitize(movie.hubcloud_link) : '';
        const escapedGdflixUrl = movie.gdflix_link ? sanitize(movie.gdflix_link) : '';

        // Trailer Link Logic (Unchanged)
        let youtubeTrailerButtonHTML = '';
        const titleForSearch = movie.extractedTitle || streamTitle;
        const yearForSearch = movie.extractedYear;
        const seasonForSearch = movie.extractedSeason;
        const languages = (movie.languages || '').toLowerCase();
        const includesHindi = languages.includes('hindi');
        if (titleForSearch) {
            let searchTerms = [titleForSearch];
            if (movie.isSeries && seasonForSearch) { searchTerms.push(`Season ${seasonForSearch}`); }
            else if (!movie.isSeries && yearForSearch) { searchTerms.push(String(yearForSearch)); }
            searchTerms.push("Official Trailer");
            if (includesHindi) { searchTerms.push("Hindi"); }
            const youtubeSearchQuery = encodeURIComponent(searchTerms.join(' '));
            const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${youtubeSearchQuery}`;
            const youtubeIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M21.582,6.186c-0.23-0.86-0.908-1.538-1.768-1.768C18.267,4,12,4,12,4S5.733,4,4.186,4.418 c-0.86,0.23-1.538,0.908-1.768,1.768C2,7.734,2,12,2,12s0,4.266,0.418,5.814c0.23,0.86,0.908,1.538,1.768,1.768 C5.733,20,12,20,12,20s6.267,0,7.814-0.418c0.861-0.23,1.538-0.908,1.768-1.768C22,16.266,22,12,22,12S22,7.734,21.582,6.186z M10,15.464V8.536L16,12L10,15.464z"></path></svg>`;
            youtubeTrailerButtonHTML = `<a href="${youtubeSearchUrl}" target="_blank" rel="noopener noreferrer" class="button youtube-button">${youtubeIconSVG} Watch Trailer</a>`;
        }

        // IMDb Link Logic (Unchanged)
        let imdbSearchButtonHTML = '';
        if (movie.extractedTitle) {
            let imdbQueryTerms = [`"${movie.extractedTitle}"`];
            if (!movie.isSeries && movie.extractedYear) { imdbQueryTerms.push(String(movie.extractedYear)); }
            else if (movie.isSeries && seasonForSearch) { imdbQueryTerms.push(`Season ${seasonForSearch}`); }
            imdbQueryTerms.push("IMDb");
            const imdbSearchQuery = imdbQueryTerms.join(' ');
            const imdbSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(imdbSearchQuery)}&btnI=1`; // Using "I'm Feeling Lucky"
            const imdbIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true" focusable="false" style="width:1em; height:1em; vertical-align: text-bottom; margin-right: 4px;"><path fill="#F5C518" d="M42,42H6V6h36V42z M15.3,34.2h4.7V14.8h-4.7V34.2z M25.8,34.2h4.7V14.8h-4.7V34.2z M36.3,34.2h4.7V14.8h-4.7 V34.2z"></path></svg>`;
            imdbSearchButtonHTML = `<a href="${imdbSearchUrl}" target="_blank" rel="noopener noreferrer" class="button imdb-button" style="background-color: var(--button-imdb-bg);">${imdbIconSVG} View IMDb</a>`;
        }


        // --- Button Logic ---
        let urlDependentButtonsHTML = '';
        let bypassButtonsHTML = '';
        let otherLinkButtonsHTML = '';

        // 1. URL Dependent Buttons (Play, Download, Copy, Intent)
        if (movie.url) { // Use the potentially bypassed and encoded URL
            urlDependentButtonsHTML += `<button class="button play-button" data-action="play" data-title="${escapedStreamTitle}" data-url="${escapedUrl}" data-filename="${escapedFilename}"><span aria-hidden="true">▶️</span> Play here</button>`;
            urlDependentButtonsHTML += `<a class="button download-button" href="${movie.url}" download="${displayFilename}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">💾</span> Direct Download</a>`;
            urlDependentButtonsHTML += `<button class="button vlc-button" data-action="copy-vlc" data-url="${escapedUrl}"><span aria-hidden="true">📋</span> Copy URL (for VLC/MX)</button><span class="copy-feedback" role="status" aria-live="polite">Copied!</span>`;
            if (navigator.userAgent.toLowerCase().includes("android")) {
                urlDependentButtonsHTML += `<button class="button intent-button" data-action="open-intent" data-url="${escapedUrl}"><span aria-hidden="true">📱</span> Play in VLC or MX Player</button>`;
            }
        }
        // Wrap these buttons for structure on the detail page
        urlDependentButtonsHTML = `<div class="url-actions-container" id="url-actions-container-${escapedId}">${urlDependentButtonsHTML}</div>`;


        // 2. Bypass Buttons (HubCloud and GDFLIX)
        // The movie reference is always 'itemView' when generating for the detail page
        const movieRefAttr = 'data-movie-ref="itemView"'; // Use 'itemView'

        if (movie.hubcloud_link) {
            bypassButtonsHTML += `
                <button class="button hubcloud-bypass-button"
                        data-action="bypass-hubcloud"
                        data-hubcloud-url="${escapedHubcloudUrl}"
                        ${movieRefAttr}>
                    <span aria-hidden="true" class="button-icon">☁️</span>
                    <span class="button-spinner spinner"></span>
                    <span class="button-text">Bypass HubCloud</span>
                </button>
                <span class="bypass-feedback" role="status" aria-live="polite"></span>
            `;
        }
        if (movie.gdflix_link) {
             bypassButtonsHTML += `
                <button class="button gdflix-bypass-button"
                        data-action="bypass-gdflix"
                        data-gdflix-url="${escapedGdflixUrl}"
                        ${movieRefAttr}>
                    <span aria-hidden="true" class="button-icon">🎬</span>
                    <span class="button-spinner spinner"></span>
                    <span class="button-text">Bypass GDFLIX</span>
                </button>
                <span class="bypass-feedback" role="status" aria-live="polite"></span>
            `;
        }
        // Wrap bypass buttons for layout
        bypassButtonsHTML = `<div class="bypass-actions-container" id="bypass-actions-container-${escapedId}">${bypassButtonsHTML}</div>`;


        // 3. Other Link Buttons (Trailer, IMDb, Original Links, Custom URL, Share)
        otherLinkButtonsHTML += youtubeTrailerButtonHTML;
        otherLinkButtonsHTML += imdbSearchButtonHTML;
        // Custom URL Toggle Button (Only shown if needed, e.g., on playback error)
        otherLinkButtonsHTML += `<button class="button custom-url-toggle-button" data-action="toggle-custom-url" aria-expanded="false" style="display: none;"><span aria-hidden="true">🔗</span> Play Custom URL</button>`;
        // Original Links
        if (movie.telegram_link && movie.telegram_link.toLowerCase() !== 'null') otherLinkButtonsHTML += `<a class="button telegram-button" href="${sanitize(movie.telegram_link)}" target="_blank" rel="noopener noreferrer">Telegram File</a>`;
        if (movie.gdflix_link && !movie.gdflix_link.toLowerCase().includes('example.com')) otherLinkButtonsHTML += `<a class="button gdflix-button" href="${sanitize(movie.gdflix_link)}" target="_blank" rel="noopener noreferrer">GDFLIX Link</a>`;
        if (movie.hubcloud_link && movie.hubcloud_link.toLowerCase() !== 'null' && !movie.hubcloud_link.toLowerCase().includes('example.com')) {
            otherLinkButtonsHTML += `<a class="button hubcloud-button" href="${sanitize(movie.hubcloud_link)}" target="_blank" rel="noopener noreferrer">HubCloud Link</a>`;
        }
        if (movie.filepress_link && !movie.filepress_link.toLowerCase().includes('example.com')) otherLinkButtonsHTML += `<a class="button filepress-button" href="${sanitize(movie.filepress_link)}" target="_blank" rel="noopener noreferrer">Filepress</a>`;
        if (movie.gdtot_link && !movie.gdtot_link.toLowerCase().includes('example.com')) otherLinkButtonsHTML += `<a class="button gdtot-button" href="${sanitize(movie.gdtot_link)}" target="_blank" rel="noopener noreferrer">GDToT</a>`;
        // Share Button
        if (movie.id) { otherLinkButtonsHTML += `<button class="button share-button" data-action="share" data-id="${escapedId}" data-title="${escapedStreamTitle}" data-filename="${escapedFilename}"><span aria-hidden="true">🔗</span> Share This Page</button><span class="copy-feedback share-fallback" role="status" aria-live="polite">Link copied!</span>`; }
        // Wrap other links
        otherLinkButtonsHTML = `<div class="other-actions-container" id="other-actions-container-${escapedId}">${otherLinkButtonsHTML}</div>`;


        // Combine all parts for the detail view
        const detailContentHTML = `
            <div class="action-info" data-stream-title="${escapedStreamTitle}">
                <span class="info-item filename"><strong>Filename:</strong> ${displayFilename}</span>
                <span class="info-item quality"><strong>Quality:</strong> ${displayQuality} ${fourkLogoHtml}${hdrLogoHtml}</span>
                <span class="info-item size"><strong>Size:</strong> ${displaySize}</span>
                <span class="info-item lang"><strong>Language:</strong> ${sanitize(movie.languages || 'N/A')}</span>
                <span class="info-item updated" title="${formattedDateFull}"><strong>Updated:</strong> ${formattedDateRelative}</span>
                ${movie.originalFilename ? `<span class="info-item orig-name"><strong>Original Name:</strong> ${sanitize(movie.originalFilename)}</span>` : ''}
            </div>
            <div class="action-buttons-container">
                ${urlDependentButtonsHTML}
                ${bypassButtonsHTML}
                ${otherLinkButtonsHTML}
            </div>
             <!-- Video player will be appended here by JS if needed -->
            `;
        return detailContentHTML;
    }


    // --- Table Row HTML (Updated) ---
    function createMovieTableRowHTML(movie, dataIndex) { // Removed actionRowId parameter
        const displayFilename = movie.displayFilename;
        const displaySize = movie.sizeData.display;
        const displayQuality = movie.displayQuality;
        const timestampString = movie.last_updated_ts;
        const formattedDateRelative = TimeAgo.format(timestampString);
        const dateObject = timestampString ? new Date(timestampString) : null;
        const formattedDateFull = (dateObject && !isNaN(dateObject)) ? TimeAgo.formatFullDate(dateObject) : 'N/A';
        let hdrLogoHtml = ''; let fourkLogoHtml = '';
        const lowerFilename = (displayFilename || '').toLowerCase();
        const lowerQuality = (displayQuality || '').toLowerCase();
        if (lowerQuality === '4k' || lowerQuality.includes('2160p') || lowerFilename.includes('2160p') || lowerFilename.includes('.4k.')) { fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo fourk-logo" title="4K Ultra HD" />`; }
        if (lowerQuality.includes('hdr') || lowerQuality.includes('dolby vision') || lowerQuality === 'dv' || lowerFilename.includes('.hdr') || lowerFilename.includes('dolby.vision') || lowerFilename.includes('.dv.')) { hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo hdr-logo" title="HDR / Dolby Vision Content" />`; }

        // Create the URL for the item detail page
        const detailViewUrl = movie.id ? `${window.location.pathname}?shareId=${encodeURIComponent(movie.id)}` : '#'; // Use shareId parameter
        const titleAttr = `View details for: ${sanitize(displayFilename)}`;

        const mainRowHTML = `
            <tr class="movie-data-row" data-index="${dataIndex}" data-id="${sanitize(movie.id || '')}">
                <td class="col-id">${sanitize(movie.id || 'N/A')}</td>
                <td class="col-filename">
                    <a href="${detailViewUrl}" title="${titleAttr}" class="filename-link">
                      ${displayFilename}${fourkLogoHtml}${hdrLogoHtml}
                    </a>
                </td>
                <td class="col-size">${displaySize}</td>
                <td class="col-quality">${displayQuality}</td>
                <td class="col-updated" title="${formattedDateFull}">${formattedDateRelative}</td>
                <td class="col-view">
                    <a href="${detailViewUrl}" class="button view-button-link" title="${titleAttr}" aria-label="View Details">View</a>
                </td>
            </tr>`;
        return mainRowHTML;
    }


    // --- View Control (Updated) ---
    function setViewMode(mode) { // mode: 'homepage', 'search', 'itemView'
        console.log("Setting view mode to:", mode);
        const previousMode = currentViewMode;
        currentViewMode = mode;

        // Close player *before* changing layout classes if switching away from item view
        if (previousMode === 'itemView' && mode !== 'itemView') {
            closePlayerIfNeeded(null);
        }

        container.classList.toggle('results-active', mode === 'search');
        container.classList.toggle('shared-view-active', mode === 'itemView'); // Use shared-view-active class for item view

        const showHomepage = mode === 'homepage';
        const showSearch = mode === 'search';
        const showItemView = mode === 'itemView';

        if (searchFocusArea) searchFocusArea.style.display = (showHomepage || showSearch) ? 'flex' : 'none';
        if (resultsArea) resultsArea.style.display = showSearch ? 'block' : 'none';
        if (itemViewArea) itemViewArea.style.display = showItemView ? 'block' : 'none'; // Use itemViewArea here
        if (updatesPreviewSection) updatesPreviewSection.style.display = showHomepage ? 'block' : 'none';
        if (pageFooter) pageFooter.style.display = (showHomepage || showSearch) ? 'flex' : 'none';

        if (showHomepage) {
            if (searchInput) searchInput.value = currentState.searchTerm || ''; // Keep search term if returning via back? No, clear it.
            if (searchInput) searchInput.value = '';
            currentState.searchTerm = '';
            if (suggestionsContainer) suggestionsContainer.style.display = 'none';
            activeResultsTab = 'allFiles';
            currentState.currentPage = 1;
            currentState.typeFilter = '';
            viewedItemData = null; // Clear item data when returning home
            if (weeklyUpdatesData.length > 0) {
                displayInitialUpdates(); // Re-render updates if data exists
            } else if (localSuggestionData.length > 0) { // If no updates, show message
                if (updatesPreviewList) updatesPreviewList.innerHTML = '<div class="status-message" style="text-align:center; padding: 15px 0;">No recent updates found.</div>';
                if (showMoreUpdatesButton) showMoreUpdatesButton.style.display = 'none';
            } else { // Still loading? Show loading spinner
                 if (updatesPreviewList) updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`;
            }
            document.title = "Cinema Ghar Index";
            // Explicitly remove shareId from URL when navigating home
             if (window.history.pushState && window.location.search.includes('shareId=')) {
                 const cleanUrl = window.location.origin + window.location.pathname;
                 window.history.pushState({ path: cleanUrl }, '', cleanUrl);
                 console.log("Cleared shareId from URL on home navigation.");
             }
        } else if (showSearch) {
            viewedItemData = null; // Clear item data when going to search results
            document.title = currentState.searchTerm ? `Search: ${currentState.searchTerm} - Cinema Ghar` : "Search - Cinema Ghar Index";
             // If returning to search view (e.g. via back button), re-fetch might be needed if state changed
             // This is handled by popstate calling initializeApp which checks the URL
        } else if (showItemView) {
             // Item title is set dynamically in displayItemDetails
        }
        saveStateToLocalStorage(); // Save non-URL state like sort/filter
    }


    window.goHome = function(event) {
        if (event) event.preventDefault();
        console.log("Navigating home explicitly.");
        // Set view mode first, which handles clearing shareId from URL
        setViewMode('homepage');
        // No need to re-focus search input here, just go home.
    }

    // New function for the back button on the item detail page
    window.goBack = function(event) {
        event.preventDefault();
        console.log("Navigating back using history.");
        // Move player back before navigating away
        closePlayerIfNeeded(null); // Close player first

        window.history.back();
        // The popstate listener will handle calling initializeApp to update the view based on the new URL
    }

    // --- Search and Suggestions Logic (Unchanged) ---
    function handleSearchInput() { clearTimeout(suggestionDebounceTimeout); const searchTerm = searchInput.value.trim(); if (searchTerm.length < 2) { suggestionsContainer.style.display = 'none'; return; } suggestionDebounceTimeout = setTimeout(() => { fetchAndDisplaySuggestions(searchTerm); }, config.SUGGESTIONS_DEBOUNCE_DELAY); }
    function fetchAndDisplaySuggestions(term) { const normalizedTerm = normalizeTextForSearch(term); if (!normalizedTerm) { suggestionsContainer.style.display = 'none'; return; } const matchingItems = localSuggestionData.filter(movie => movie.searchText.includes(normalizedTerm)).slice(0, config.MAX_SUGGESTIONS); suggestionsContainer.innerHTML = ''; if (matchingItems.length > 0) { const fragment = document.createDocumentFragment(); matchingItems.forEach(item => { const div = document.createElement('div'); let displayText = item.displayFilename; let highlighted = false; if (term.length > 0) { try { const safeTerm = escapeRegExp(term); const regex = new RegExp(`(${safeTerm})`, 'i'); if ((item.displayFilename || '').match(regex)) { div.innerHTML = (item.displayFilename || '').replace(regex, '<strong>$1</strong>'); highlighted = true; } } catch (e) { console.warn("Regex error during highlighting:", e); } } if (!highlighted) { div.textContent = item.displayFilename; } div.title = item.displayFilename; div.onclick = () => selectSuggestion(item.displayFilename); fragment.appendChild(div); }); suggestionsContainer.appendChild(fragment); suggestionsContainer.style.display = 'block'; } else { suggestionsContainer.style.display = 'none'; } }
    function selectSuggestion(selectedValue) { searchInput.value = selectedValue; suggestionsContainer.style.display = 'none'; handleSearchSubmit(); }
    window.handleSearchSubmit = function() { if (suggestionsContainer) { suggestionsContainer.style.display = 'none'; } const searchTerm = searchInput.value.trim(); console.log("Handling search submit for:", searchTerm); if (searchInput) { searchInput.blur(); } // If search term is empty, go home
        if (searchTerm.length === 0) {
            goHome();
            return;
        }
        // If already on search page with the same term, don't re-search unless filter changes
        if (currentViewMode === 'search' && currentState.searchTerm === searchTerm && currentState.qualityFilter === (qualityFilterSelect?.value || '')) {
            console.log("Search term and filters haven't changed, not re-searching.");
            return;
        }

        setViewMode('search');
        activeResultsTab = 'allFiles'; // Always start search on 'allFiles' tab
        currentState.currentPage = 1;
        currentState.searchTerm = searchTerm;
        currentState.qualityFilter = qualityFilterSelect?.value || '';
        currentState.typeFilter = ''; // Reset type filter for new search

        updateActiveTabAndPanel(); // Ensure 'allFiles' tab is visually selected
        showLoadingStateInTables(`Searching for "${sanitize(searchTerm)}"...`);
        fetchAndRenderResults(); // This will save state internally
        // Clear shareId from URL if present when starting a new search
        if (window.history.pushState && window.location.search.includes('shareId=')) {
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.pushState({ path: cleanUrl }, '', cleanUrl);
            console.log("Cleared shareId from URL on new search.");
        }
    }
    function handleSearchClear() { clearTimeout(suggestionDebounceTimeout); if(suggestionsContainer) suggestionsContainer.style.display = 'none'; // Always hide suggestions
        // Use setTimeout to check value after browser's 'clear' action finishes
        setTimeout(() => {
            if (searchInput && searchInput.value.trim() === '') {
                console.log("Search input cleared via 'x', resetting to homepage.");
                goHome();
            }
        }, 50);
    }
    function showLoadingStateInTables(message = 'Loading...') { const loadingHTML = `<tr><td colspan="6" class="loading-message" role="status" aria-live="polite"><div class="spinner"></div>${sanitize(message)}</td></tr>`; Object.values(tabMappings).forEach(mapping => { if (mapping?.tableBody) { mapping.tableBody.innerHTML = loadingHTML; } if (mapping?.pagination) { mapping.pagination.style.display = 'none'; } }); }

    // --- Updates Preview Logic (Updated - Uses Links) ---
    async function loadUpdatesPreview() { if (isDirectShareLoad || !updatesPreviewSection || !updatesPreviewList || !showMoreUpdatesButton) return; updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`; showMoreUpdatesButton.style.display = 'none'; updatesPreviewShownCount = 0; weeklyUpdatesData = []; try { const params = { sort: 'lastUpdated', sortDir: 'desc', limit: config.UPDATES_PREVIEW_INITIAL_COUNT, page: 1 }; const data = await fetchApiData(params); if (data && data.items && data.items.length > 0) { weeklyUpdatesData = data.items.map(preprocessMovieData); displayInitialUpdates(); console.log(`Loaded initial ${weeklyUpdatesData.length} updates. Total pages from API: ${data.totalPages}`); } else { updatesPreviewList.innerHTML = '<div class="status-message" style="text-align:center; padding: 15px 0;">No recent updates found.</div>'; showMoreUpdatesButton.style.display = 'none'; } } catch (error) { console.error("Failed to load updates preview:", error); updatesPreviewList.innerHTML = `<div class="error-message" style="text-align:center; padding: 15px 0;">Could not load updates. ${error.message}</div>`; showMoreUpdatesButton.style.display = 'none'; } }
    function displayInitialUpdates() { if (!updatesPreviewList || !showMoreUpdatesButton) return; updatesPreviewList.innerHTML = ''; updatesPreviewShownCount = 0; if (weeklyUpdatesData.length === 0) { updatesPreviewList.innerHTML = '<div class="status-message" style="text-align:center; padding: 15px 0;">No recent updates found.</div>'; showMoreUpdatesButton.style.display = 'none'; return; } const initialCount = Math.min(weeklyUpdatesData.length, config.UPDATES_PREVIEW_INITIAL_COUNT); appendUpdatesToPreview(0, initialCount); updatesPreviewShownCount = initialCount; // Check if there *might* be more based on initial load vs request count
        const potentiallyMore = weeklyUpdatesData.length >= config.UPDATES_PREVIEW_INITIAL_COUNT; if (potentiallyMore) { showMoreUpdatesButton.style.display = 'block'; showMoreUpdatesButton.disabled = false; showMoreUpdatesButton.textContent = "Show More"; } else { showMoreUpdatesButton.style.display = 'none'; } }
    window.appendMoreUpdates = async function() { if (!updatesPreviewList || !showMoreUpdatesButton) return; showMoreUpdatesButton.disabled = true; showMoreUpdatesButton.textContent = "Loading..."; // Calculate next page based on total items loaded so far vs load more count
        const itemsCurrentlyLoaded = weeklyUpdatesData.length; const currentPage = Math.ceil(itemsCurrentlyLoaded / config.UPDATES_PREVIEW_LOAD_MORE_COUNT); const nextPage = currentPage + 1; console.log(`Attempting to load page ${nextPage} for updates preview.`); try { const params = { sort: 'lastUpdated', sortDir: 'desc', limit: config.UPDATES_PREVIEW_LOAD_MORE_COUNT, page: nextPage }; const data = await fetchApiData(params); if (data && data.items && data.items.length > 0) { const newItems = data.items.map(preprocessMovieData); const startIndex = weeklyUpdatesData.length; weeklyUpdatesData.push(...newItems); appendUpdatesToPreview(startIndex, weeklyUpdatesData.length); updatesPreviewShownCount = weeklyUpdatesData.length; console.log(`Loaded ${newItems.length} more updates. Total now: ${updatesPreviewShownCount}. Current API page: ${data.page}, Total API pages: ${data.totalPages}`); // Check if the page loaded is the last page
            if (data.page >= data.totalPages) { showMoreUpdatesButton.textContent = "All Updates Shown"; } else { showMoreUpdatesButton.disabled = false; showMoreUpdatesButton.textContent = "Show More"; } } else { console.log("No more updates found from API."); showMoreUpdatesButton.textContent = "No More Updates"; } } catch (error) { console.error("Failed to load more updates:", error); showMoreUpdatesButton.textContent = "Error Loading"; showMoreUpdatesButton.disabled = false; } }
    function appendUpdatesToPreview(startIndex, endIndex) {
        if (!updatesPreviewList) return;
        const fragment = document.createDocumentFragment();
        const itemsToAppend = weeklyUpdatesData.slice(startIndex, endIndex);
        itemsToAppend.forEach((movie, indexInSlice) => {
            const overallIndex = startIndex + indexInSlice;
            if (!movie || !movie.id) return; // Skip if no ID for linking

            const itemDiv = document.createElement('div');
            itemDiv.className = 'update-item';
            itemDiv.dataset.index = overallIndex; // Keep index if needed elsewhere
            itemDiv.dataset.id = movie.id; // Add ID for potential focus tracking

            let hdrLogoHtml = ''; let fourkLogoHtml = '';
            const lowerFilename = (movie.displayFilename || '').toLowerCase();
            const lowerQuality = (movie.displayQuality || '').toLowerCase();
            if (lowerQuality === '4k' || lowerQuality.includes('2160p') || lowerFilename.includes('2160p') || lowerFilename.includes('.4k.')) { fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo fourk-logo" title="4K Ultra HD" />`; }
            if (lowerQuality.includes('hdr') || lowerQuality.includes('dolby vision') || lowerQuality === 'dv' || lowerFilename.includes('.hdr') || lowerFilename.includes('dolby.vision') || lowerFilename.includes('.dv.')) { hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo hdr-logo" title="HDR / Dolby Vision Content" />`; }


            const timestampString = movie.last_updated_ts;
            const formattedDateRelative = TimeAgo.format(timestampString);
            const dateObject = timestampString ? new Date(timestampString) : null;
            const formattedDateFull = (dateObject && !isNaN(dateObject)) ? TimeAgo.formatFullDate(dateObject) : 'N/A';

            // Create the URL for the item detail page
            const detailViewUrl = `${window.location.pathname}?shareId=${encodeURIComponent(movie.id)}`;
            const titleAttr = `View details for: ${sanitize(movie.displayFilename)}`;

            itemDiv.innerHTML = `
                <div class="preview-col-id" title="ID: ${sanitize(movie.id || 'N/A')}">${sanitize(movie.id || 'N/A')}</div>
                <div class="preview-col-filename">
                    <a href="${detailViewUrl}" title="${titleAttr}" class="filename-link">
                       ${sanitize(movie.displayFilename)}${fourkLogoHtml}${hdrLogoHtml}
                    </a>
                </div>
                <div class="preview-col-date" title="${formattedDateFull}"> ${formattedDateRelative} </div>
                <div class="preview-col-view">
                    <a href="${detailViewUrl}" class="button view-button-link" title="${titleAttr}" aria-label="View Details">View</a>
                </div>
            `;
            fragment.appendChild(itemDiv);
             // REMOVED: Creation of the actionRowDiv
        });

        const initialLoader = updatesPreviewList.querySelector('.loading-inline-spinner');
        if (initialLoader && startIndex === 0) { initialLoader.remove(); }
        updatesPreviewList.appendChild(fragment);
    }

    // --- Filtering, Sorting (Unchanged) ---
    function triggerFilterChange() { if (!qualityFilterSelect || currentViewMode !== 'search') return; const newQualityFilter = qualityFilterSelect.value; if (newQualityFilter !== currentState.qualityFilter) { currentState.qualityFilter = newQualityFilter; currentState.currentPage = 1; closePlayerIfNeeded(null); showLoadingStateInTables(`Applying filter: ${sanitize(newQualityFilter || 'All Qualities')}...`); fetchAndRenderResults(); } }
    function handleSort(event) { const header = event.target.closest('th.sortable'); if (!header || currentViewMode !== 'search') return; const sortKey = header.dataset.sortKey; if (!sortKey) return; const oldSortColumn = currentState.sortColumn; const oldSortDirection = currentState.sortDirection; if (currentState.sortColumn === sortKey) { currentState.sortDirection = currentState.sortDirection === 'asc' ? 'desc' : 'asc'; } else { currentState.sortColumn = sortKey; currentState.sortDirection = ['filename', 'quality'].includes(sortKey) ? 'asc' : 'desc'; // Default sort for text is asc, others desc
        } if (oldSortColumn !== currentState.sortColumn || oldSortDirection !== currentState.sortDirection) { currentState.currentPage = 1; closePlayerIfNeeded(null); showLoadingStateInTables(`Sorting by ${sanitize(sortKey)} (${currentState.sortDirection})...`); fetchAndRenderResults(); } }


    // --- Rendering Logic (Updated - Uses Links) ---
    function renderActiveResultsView(apiResponse) {
         if (currentViewMode !== 'search' || !tabMappings[activeResultsTab]) {
             if (currentViewMode === 'search') { showLoadingStateInTables('Enter search term above.'); }
             return;
         }
         console.log(`Rendering results for tab: ${activeResultsTab}`, apiResponse);
         console.time("renderActiveResultsView");
         const { tableBody, pagination, tableHead } = tabMappings[activeResultsTab];
         if (!tableBody || !pagination) { console.error("Missing table body or pagination controls for tab:", activeResultsTab); console.timeEnd("renderActiveResultsView"); return; }

         const itemsToRender = apiResponse.items || [];
         const totalItems = apiResponse.totalItems || 0;
         const currentPage = apiResponse.page || 1;
         const totalPages = apiResponse.totalPages || 1;

         currentViewData = itemsToRender.map(preprocessMovieData); // Still preprocess for potential future use/sorting

         let tableHtml = '';
         if (totalItems === 0) {
             let message = `No ${tabMappings[activeResultsTab].typeFilter || 'files'} found`;
             if (currentState.searchTerm) message += ` matching "${sanitize(currentState.searchTerm)}"`;
             if (currentState.qualityFilter) message += ` with quality "${sanitize(currentState.qualityFilter)}"`;
             message += '.';
             tableHtml = `<tr><td colspan="6" class="status-message">${message}</td></tr>`;
         } else {
             currentViewData.forEach((movie, indexOnPage) => {
                 // Call the updated function which returns HTML with <a> links
                 tableHtml += createMovieTableRowHTML(movie, indexOnPage);
             });
         }

         tableBody.innerHTML = tableHtml;
         renderPaginationControls(pagination, totalItems, currentPage, totalPages);
         updateActiveTabAndPanel();
         if (tableHead) updateSortIndicators(tableHead);
         updateFilterIndicator();
         // No action row closing needed
         console.timeEnd("renderActiveResultsView");
    }
    // --- renderPaginationControls, updateSortIndicators, updateFilterIndicator, updateActiveTabAndPanel (Unchanged) ---
    function renderPaginationControls(targetContainer, totalItems, currentPage, totalPages) { if (!targetContainer) return; if (totalItems === 0 || totalPages <= 1) { targetContainer.innerHTML = ''; targetContainer.style.display = 'none'; return; } targetContainer.dataset.totalPages = totalPages; targetContainer.innerHTML = ''; let paginationHTML = ''; const maxPagesToShow = 5; // Number of page links between Prev/Next and ellipses
        const halfPages = Math.floor(maxPagesToShow / 2); paginationHTML += `<button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled title="First page"' : 'title="Previous page"'} aria-label="Previous Page">« Prev</button>`; let startPage, endPage; if (totalPages <= maxPagesToShow + 2) { // Show all pages if total is small
            startPage = 1; endPage = totalPages; } else { // Calculate range with ellipses
            startPage = Math.max(2, currentPage - halfPages); endPage = Math.min(totalPages - 1, currentPage + halfPages); // Adjust range if near the ends
            if (currentPage - halfPages < 2) { // Near beginning
                endPage = Math.min(totalPages - 1, maxPagesToShow); } if (currentPage + halfPages > totalPages - 1) { // Near end
                startPage = Math.max(2, totalPages - maxPagesToShow + 1); } } // Add first page link if needed
        if (startPage > 1) { paginationHTML += `<button onclick="changePage(1)" title="Page 1" aria-label="Page 1">1</button>`; // Add ellipsis if gap after first page
            if (startPage > 2) { paginationHTML += `<span class="page-info" title="Skipped pages" aria-hidden="true">...</span>`; } } // Add page number links in the calculated range
        for (let i = startPage; i <= endPage; i++) { paginationHTML += (i === currentPage) ? `<span class="current-page" aria-current="page" aria-label="Page ${i}">${i}</span>` : `<button onclick="changePage(${i})" title="Page ${i}" aria-label="Page ${i}">${i}</button>`; } // Add last page link if needed
        if (endPage < totalPages) { // Add ellipsis if gap before last page
            if (endPage < totalPages - 1) { paginationHTML += `<span class="page-info" title="Skipped pages" aria-hidden="true">...</span>`; } paginationHTML += `<button onclick="changePage(${totalPages})" title="Page ${totalPages}" aria-label="Page ${totalPages}">${totalPages}</button>`; } paginationHTML += `<button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled title="Last page"' : 'title="Next page"'} aria-label="Next Page">Next »</button>`; targetContainer.innerHTML = paginationHTML; targetContainer.style.display = 'flex'; // Use flex for better alignment
    }
    function updateSortIndicators(tableHeadElement) { if (!tableHeadElement) return; tableHeadElement.querySelectorAll('th.sortable').forEach(th => { th.classList.remove('sort-asc', 'sort-desc'); const sortKey = th.dataset.sortKey; if (sortKey === currentState.sortColumn) { const directionClass = currentState.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc'; th.classList.add(directionClass); th.setAttribute('aria-sort', currentState.sortDirection === 'asc' ? 'ascending' : 'descending'); } else { th.removeAttribute('aria-sort'); } }); }
    function updateFilterIndicator() { if(qualityFilterSelect) { qualityFilterSelect.classList.toggle('filter-active', !!currentState.qualityFilter); } }
    function updateActiveTabAndPanel() { Object.keys(tabMappings).forEach(tabId => { const mapping = tabMappings[tabId]; const isActive = tabId === activeResultsTab; if (mapping?.button) { mapping.button.classList.toggle('active', isActive); mapping.button.setAttribute('aria-selected', isActive); } if (mapping?.panel) { mapping.panel.classList.toggle('active', isActive); mapping.panel.setAttribute('aria-hidden', !isActive); } }); }

    // --- Pagination and Tab Switching (Unchanged) ---
    window.changePage = function(newPage) { if (currentViewMode !== 'search' || newPage < 1 || newPage === currentState.currentPage) { return; } const currentPagination = tabMappings[activeResultsTab]?.pagination; if(currentPagination && currentPagination.dataset.totalPages) { const totalP = parseInt(currentPagination.dataset.totalPages, 10); if(newPage > totalP) { console.log(`Change page request to ${newPage} denied, exceeds total pages (${totalP}).`); return; } } currentState.currentPage = newPage; closePlayerIfNeeded(null); fetchAndRenderResults().then(() => { const activeTableBody = tabMappings[activeResultsTab]?.tableBody; scrollToTopOfActiveTable(activeTableBody); }); saveStateToLocalStorage(); }
    function scrollToTopOfActiveTable(tableBodyElement) { if (!tableBodyElement) return; const tableContainer = tableBodyElement.closest('.table-container'); if (tableContainer) { const searchBarArea = container.querySelector('#search-focus-area'); const backButtonElem = resultsArea.querySelector('#backToHomeButtonResults'); const filterArea = resultsArea.querySelector('.results-filter-area'); const tabNav = resultsArea.querySelector('.tab-navigation'); let stickyHeaderHeight = 0; if (container.classList.contains('results-active')) { // Calculate combined height of sticky elements above the table
            stickyHeaderHeight = (searchBarArea?.offsetHeight || 0) + (backButtonElem?.offsetHeight || 0) + (backButtonElem ? parseFloat(getComputedStyle(backButtonElem).marginBottom || '0') : 0) + (filterArea?.offsetHeight || 0) + (tabNav?.offsetHeight || 0); } const elementTop = tableContainer.getBoundingClientRect().top + window.scrollY; // Use scrollY for consistency
        const scrollPosition = elementTop - stickyHeaderHeight - 20; // Add small buffer
        window.scrollTo({ top: scrollPosition, behavior: 'smooth' }); } }
    window.switchTab = function(tabId) { if (currentViewMode !== 'search' || tabId === activeResultsTab || !tabMappings[tabId]) { return; } activeResultsTab = tabId; currentState.currentPage = 1; currentState.typeFilter = tabMappings[tabId].typeFilter; closePlayerIfNeeded(null); // No action row closing
        updateActiveTabAndPanel(); showLoadingStateInTables(`Loading ${tabMappings[tabId].typeFilter || 'all files'}...`); fetchAndRenderResults(); saveStateToLocalStorage(); }

    // --- Action Row Logic (REMOVED) ---

    // --- Share Logic (Unchanged, button is now on item detail page) ---
    async function handleShareClick(buttonElement) { const itemId = buttonElement.dataset.id; const itemTitle = buttonElement.dataset.title || "Cinema Ghar Item"; const itemFilename = buttonElement.dataset.filename || ""; if (!itemId) { console.error("Share failed: Item ID missing."); alert("Cannot share this item (missing ID)."); return; } const shareUrl = `${window.location.origin}${window.location.pathname}?shareId=${encodeURIComponent(itemId)}`; const shareText = `Check out: ${itemTitle}\n${itemFilename ? `(${itemFilename})\n` : ''}`; const feedbackSpan = buttonElement.nextElementSibling; if (!feedbackSpan || !feedbackSpan.classList.contains('copy-feedback')) { console.warn("Share fallback feedback span not found next to button:", buttonElement); } if (navigator.share) { try { await navigator.share({ title: itemTitle, text: shareText, url: shareUrl, }); console.log('Successful share'); } catch (error) { console.error('Error sharing:', error); if (error.name !== 'AbortError') { // Don't show error if user cancelled share
                if (feedbackSpan) { showCopyFeedback(feedbackSpan, 'Share failed!', true); } else { alert(`Share failed: ${error.message}`); } } } } else { console.log('Web Share API not supported, falling back to copy.'); await copyToClipboard(shareUrl, feedbackSpan); } }

    // --- Item Detail Display Logic (Updated) ---
    async function displayItemDetails(itemId) {
        if (!itemId || !itemViewArea || !itemViewContent) {
            console.error("Cannot display item details: Missing itemId or DOM elements.");
            // Optionally show a generic error or redirect home
            displayLoadError(`Error: Could not display item details. Required elements missing.`);
            return;
        }

        itemViewContent.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading item details...</span></div>`;
        setViewMode('itemView'); // Set the view mode FIRST
        viewedItemData = null; // Reset previous item data

        try {
            const params = { id: itemId };
            const data = await fetchApiData(params);

            if (data && data.items && data.items.length > 0) {
                const itemRaw = data.items[0];
                viewedItemData = preprocessMovieData(itemRaw); // Store data for this view
                console.log("Displaying item details:", viewedItemData.displayFilename);

                const actionHTML = createItemDetailContentHTML(viewedItemData); // Use the dedicated function
                itemViewContent.innerHTML = actionHTML;
                document.title = `${viewedItemData.displayFilename || 'Item Details'} - Cinema Ghar`;

                // Ensure player is hidden initially when loading item details
                 closePlayerIfNeeded(null); // Make sure any previous instance is fully closed

                // Move player container into the item view content area *structurally* if not already there
                // It will be hidden until 'Play' is clicked
                if (videoContainer && itemViewContent && videoContainer.parentElement !== itemViewContent) {
                     console.log("Moving video container structure into item view content.");
                     itemViewContent.appendChild(videoContainer);
                     videoContainer.style.display = 'none'; // Ensure it's hidden
                }

            } else {
                console.error("Item not found via API for ID:", itemId);
                itemViewContent.innerHTML = `<div class="error-message" role="alert">Error: Item with ID ${sanitize(itemId)} was not found. It might have been removed or the link is incorrect.</div>`;
                document.title = "Item Not Found - Cinema Ghar Index";
                viewedItemData = null; // Ensure no stale data
            }
        } catch (error) {
            console.error("Failed to fetch item details:", error);
            itemViewContent.innerHTML = `<div class="error-message" role="alert">Error loading item: ${error.message}. Please try again or go back.</div>`;
            document.title = "Error Loading Item - Cinema Ghar Index";
            viewedItemData = null; // Ensure no stale data
        } finally {
            // Ensure view mode is correct even if errors occurred (already set at start)
            window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to top of item view
        }
    }


    // --- Player Logic (Updated Context) ---
    function streamVideo(title, url, filenameForAudioCheck, isFromCustom = false) {
        let playerParentContainer = null;
        if (isGlobalCustomUrlMode) {
            // Player uses fixed positioning, parent is less critical but ideally body/main container
            playerParentContainer = container || document.body;
        } else if (currentViewMode === 'itemView' && itemViewContent) {
            playerParentContainer = itemViewContent; // Player should be inside the item view
        } else {
             console.error("Cannot stream video: Invalid view mode or required content area not found.");
             showErrorInPlayer("Error: Cannot initialize player in the current view.");
             return;
        }

        if (!videoContainer || !videoElement) {
            console.error("Cannot stream: player or video element missing.");
            // Attempt to show error message if possible
            if (itemViewContent && currentViewMode === 'itemView') {
                itemViewContent.innerHTML += `<div class="error-message">Player elements missing. Cannot play video.</div>`;
            }
            return;
        }

        // Reset player state FIRST
        if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; }
        if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; }
        clearCopyFeedback();
        clearBypassFeedback(); // Clear bypass feedback when playing
        // Hide custom URL input if it was open (unless this IS a custom URL play)
        if (playerCustomUrlSection && !isFromCustom) {
             playerCustomUrlSection.style.display = 'none';
             const toggleButton = itemViewContent?.querySelector('.custom-url-toggle-button[aria-expanded="true"]');
             if (toggleButton) { // Reset toggle button state if needed
                 toggleButton.setAttribute('aria-expanded', 'false');
                 toggleButton.innerHTML = '<span aria-hidden="true">🔗</span> Play Custom URL';
             }
        }

        // Ensure player is structurally inside the correct container
        if (videoContainer.parentElement !== playerParentContainer) {
            console.log(`Moving video container to: ${playerParentContainer.id || playerParentContainer.tagName}`);
             // Pause/reset before moving if it was somehow playing elsewhere
             if (videoElement.hasAttribute('src') && !videoElement.paused) {
                 videoElement.pause();
                 videoElement.removeAttribute('src');
                 videoElement.currentTime = 0;
                 videoElement.load(); // Reset fully
             }
             if (vlcBox) vlcBox.style.display = 'none'; // Hide VLC info if moving
            playerParentContainer.appendChild(videoContainer);
        }

        // Make player elements visible
        videoContainer.style.display = 'flex'; // Show the main container
        videoElement.style.display = 'block'; // Show the video element itself
        if (customControlsContainer) customControlsContainer.style.display = 'flex'; // Show controls

        // Set volume/speed from storage
        const savedVolume = localStorage.getItem(config.PLAYER_VOLUME_KEY); const savedSpeed = localStorage.getItem(config.PLAYER_SPEED_KEY);
        videoElement.volume = (savedVolume !== null) ? Math.max(0, Math.min(1, parseFloat(savedVolume))) : 1;
        if (volumeSlider) volumeSlider.value = videoElement.volume; videoElement.muted = (videoElement.volume === 0);
        videoElement.playbackRate = (savedSpeed !== null) ? parseFloat(savedSpeed) : 1;
        if(playbackSpeedSelect) playbackSpeedSelect.value = String(videoElement.playbackRate); updateMuteButton(); videoElement.currentTime = 0;

        // Audio warning logic (Unchanged, check only non-custom URLs)
        let warningText = "";
        if (filenameForAudioCheck && !isFromCustom) {
            const lowerFilename = String(filenameForAudioCheck).toLowerCase();
            const ddp51Regex = /\bDDP?([ ._-]?5\.1)?\b/i;
            const advancedAudioRegex = /\b(DTS|ATMOS|TrueHD)\b/i;
            const multiAudioHintRegex = /\b(Multi|Dual)[ ._-]?Audio\b/i;
            if (ddp51Regex.test(lowerFilename)) {
                warningText = "<strong>Audio Note:</strong> DDP audio might not work in browser. Use 'Copy URL' or 'Play in VLC or MX Player'.";
            } else if (advancedAudioRegex.test(lowerFilename)) {
                warningText = "<strong>Audio Note:</strong> DTS/Atmos/TrueHD audio likely unsupported. Use external player.";
            } else if (multiAudioHintRegex.test(lowerFilename)) {
                warningText = "<strong>Audio Note:</strong> May contain multiple audio tracks. Check selector below or use external player.";
            }
        }
        if (warningText && audioWarningDiv) { audioWarningDiv.innerHTML = warningText; audioWarningDiv.style.display = 'block'; }

        // Set title, URL, play
        if (videoTitle) videoTitle.innerText = title || "Video";
        if (vlcText) vlcText.innerText = url; // Display the URL for copying
        if (vlcBox) vlcBox.style.display = 'block'; // Show the VLC info box
        videoElement.src = url; videoElement.load(); // Load the new source
        videoElement.play().catch(e => {
            console.warn("Autoplay was prevented or failed:", e.message);
            // Don't show an error here, user can click play manually. Error handler catches real issues.
        });

        // Scroll into view and focus
        if (!isGlobalCustomUrlMode) {
            // Focus the close button for accessibility
            const closeButton = videoContainer.querySelector('.close-btn');
            if (closeButton) { setTimeout(() => closeButton.focus(), 150); } // Delay focus slightly
            // Scroll the player container into view smoothly
            setTimeout(() => {
                 videoContainer?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        } else {
             // Global mode player is fixed, no scroll needed, focus depends on flow
             // Focus was likely handled when opening the global custom URL input
        }
    }

    function showErrorInPlayer(message) {
        if (!videoContainer) return;
        // Hide video/controls, show error message
        if(videoElement) videoElement.style.display = 'none';
        if(customControlsContainer) customControlsContainer.style.display = 'none';
        if(vlcBox) vlcBox.style.display = 'none';
        if(audioWarningDiv) {
            audioWarningDiv.innerHTML = `<div class="error-message">${sanitize(message)}</div>`;
            audioWarningDiv.style.display = 'block';
        }
        videoContainer.style.display = 'flex'; // Keep container visible for error message
    }

    // --- closePlayer (minor adjustments for context) ---
    window.closePlayer = function(elementToFocusAfter = null) {
         // If called from an event handler, use the event target if no specific element is given
         if (elementToFocusAfter instanceof Event) { elementToFocusAfter = elementToFocusAfter?.target; }
         if (!videoContainer || !videoElement || videoContainer.style.display === 'none') return; // Exit if already hidden

         const wasPlaying = !videoElement.paused;
         const wasGlobalMode = isGlobalCustomUrlMode;
         const playerParentBeforeClose = videoContainer.parentElement; // Remember where it was

         console.log(`Closing player. Was global: ${wasGlobalMode}, Parent before close: ${playerParentBeforeClose?.id || playerParentBeforeClose?.tagName}`);

         // Exit fullscreen if active
         try { const fsElement = document.fullscreenElement || document.webkitFullscreenElement; if (fsElement && (fsElement === videoElement || fsElement === videoContainer)) { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } } catch(err) { console.error("Error exiting fullscreen:", err); }

         // Stop video and reset src COMPLETELY
         videoElement.pause();
         videoElement.removeAttribute('src'); // Crucial: remove src to stop network requests
         videoElement.load(); // Request browser stop loading previous source
         videoElement.currentTime = 0;

         // Hide player and reset state visually
         videoContainer.style.display = 'none';
         videoContainer.classList.remove('global-custom-url-mode', 'is-fullscreen');


         // Clean up player elements
         if (vlcBox) vlcBox.style.display = 'none';
         if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; }
         if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; }
         if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none';
         if (playerCustomUrlInput) playerCustomUrlInput.value = '';
         if (playerCustomUrlFeedback) playerCustomUrlFeedback.textContent = '';
         if (videoTitle) videoTitle.innerText = '';
         clearCopyFeedback();
         clearBypassFeedback();

         // Reset the global mode flag AFTER potential focus logic uses it
         const previousGlobalModeState = isGlobalCustomUrlMode;
         isGlobalCustomUrlMode = false;


         // Determine focus target
         let finalFocusTarget = elementToFocusAfter || lastFocusedElement; // Prioritize explicit target, fallback to last focused

         // If closed from within item view, try to focus the related Play button or Back button
         if (!previousGlobalModeState && playerParentBeforeClose === itemViewContent) {
             // If elementToFocusAfter was the close button itself, find a better target within item view
             if (finalFocusTarget && finalFocusTarget.matches('.close-btn')) {
                 const playButton = itemViewContent?.querySelector('.play-button[data-url]'); // Find the main play button
                 finalFocusTarget = playButton || backToItemViewButton; // Fallback to back button
             } else if (!finalFocusTarget || !itemViewContent?.contains(finalFocusTarget)) {
                 // If no target or target is outside item view, use Play or Back as default
                 const playButton = itemViewContent?.querySelector('.play-button[data-url]');
                 finalFocusTarget = playButton || backToItemViewButton;
             }
         } else if (previousGlobalModeState) {
             // If closed from global mode, focus the global trigger button
             finalFocusTarget = playCustomUrlGlobalButton;
         }

         // Apply focus if a target is determined and valid
         if (finalFocusTarget && typeof finalFocusTarget.focus === 'function' && document.contains(finalFocusTarget)) {
             console.log("Returning focus to:", finalFocusTarget);
             setTimeout(() => {
                 // Check again if element is still focusable and visible
                 if (document.contains(finalFocusTarget) && typeof finalFocusTarget.focus === 'function' && finalFocusTarget.offsetParent !== null) {
                    finalFocusTarget.focus();
                 } else {
                    console.warn("Focus target became invalid or hidden before focus could be set.");
                    // Fallback focus if original target disappeared
                    if (previousGlobalModeState && playCustomUrlGlobalButton) playCustomUrlGlobalButton.focus();
                    else if (!previousGlobalModeState && backToItemViewButton) backToItemViewButton.focus();
                 }
             }, 50); // Small delay helps ensure DOM updates are processed
         } else {
             console.log("No specific valid element to focus after closing player.");
             // Fallback focus
             if (previousGlobalModeState && playCustomUrlGlobalButton) playCustomUrlGlobalButton.focus();
             else if (!previousGlobalModeState && backToItemViewButton) backToItemViewButton.focus();
         }
         lastFocusedElement = null; // Reset last focused element tracker

         // Move player back to the main container *after* focus logic, ensuring it's ready for next use
         const mainAppContainer = document.getElementById('cinemaghar-container');
         if (mainAppContainer && videoContainer.parentElement !== mainAppContainer) {
             console.log("Moving video player structure back to main container after closing.");
             mainAppContainer.appendChild(videoContainer);
         } else if (!mainAppContainer && document.body && videoContainer.parentElement !== document.body) {
             console.warn("Main container #cinemaghar-container not found, moving player to body.");
             document.body.appendChild(videoContainer);
         }

    }
    // Helper to ensure player is closed cleanly before certain actions
    function closePlayerIfNeeded(elementToFocusAfter = null) {
        if (videoContainer && videoContainer.style.display !== 'none') {
            closePlayer(elementToFocusAfter);
        }
    }
    // --- Other Player functions (seekVideo, toggleMute, etc.) are largely unchanged but context matters ---
    window.seekVideo = function(seconds) { if (videoElement) videoElement.currentTime += seconds; }
    window.toggleMute = function() { if (videoElement) { videoElement.muted = !videoElement.muted; updateMuteButton(); /* Update UI immediately */ } }
    window.setVolume = function(value) { if (videoElement) { const vol = parseFloat(value); videoElement.volume = vol; videoElement.muted = (vol === 0); /* Mute if volume is 0 */ updateMuteButton(); /* Update UI immediately */ } }
    window.setPlaybackSpeed = function(value) { if (videoElement) videoElement.playbackRate = parseFloat(value); }
    window.toggleFullscreen = function() { const elementToMakeFullscreen = videoContainer; // Fullscreen the whole container
        if (!elementToMakeFullscreen) return; const fsElement = document.fullscreenElement || document.webkitFullscreenElement; try { if (!fsElement) { if (elementToMakeFullscreen.requestFullscreen) elementToMakeFullscreen.requestFullscreen(); else if (elementToMakeFullscreen.webkitRequestFullscreen) elementToMakeFullscreen.webkitRequestFullscreen(); } else { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } } catch (err) { console.error("Fullscreen API error:", err); alert("Fullscreen mode failed. Browser might block it or it's not supported."); } }
    window.changeAudioTrack = function(selectElement) { if (!videoElement || !videoElement.audioTracks) return; const selectedTrackValue = selectElement.value; const tracks = videoElement.audioTracks; let trackChanged = false; console.log(`Attempting to switch to audio track value: ${selectedTrackValue}`); for (let i = 0; i < tracks.length; i++) { const track = tracks[i]; // Match by index (stringified) or by track ID if available
        const isSelectedTrack = (track.id && track.id === selectedTrackValue) || String(i) === selectedTrackValue; if (track.enabled !== isSelectedTrack) { try { track.enabled = isSelectedTrack; if (isSelectedTrack) console.log(`Enabled audio track: ${i} - ${track.label || track.language || track.id}`); trackChanged = true; } catch (e) { console.error(`Error changing audio track state for track ${i}:`, track.id || i, e); } } } if (!trackChanged) console.warn("Selected audio track already active or no change applied."); }
    function togglePlayPause() { if (videoElement) { if (videoElement.paused || videoElement.ended) videoElement.play().catch(e => { console.warn("Play error on toggle:", e.message); handleVideoError(e); /* Show error if play fails */ }); else videoElement.pause(); } }
    function updateMuteButton() { if (!videoElement || !muteButton) return; const isMuted = videoElement.muted || videoElement.volume === 0; muteButton.textContent = isMuted ? "Unmute" : "Mute"; muteButton.setAttribute('aria-pressed', String(isMuted)); if (volumeSlider) { volumeSlider.style.opacity = isMuted ? '0.5' : '1'; volumeSlider.disabled = isMuted; // If unmuting and volume was 0, set to a default
            if (!isMuted && videoElement.volume === 0) { const defaultUnmuteVolume = 0.5; videoElement.volume = defaultUnmuteVolume; volumeSlider.value = defaultUnmuteVolume; } } }
    function handleFullscreenChange() { const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement); if (!videoContainer) return; videoContainer.classList.toggle('is-fullscreen', isFullscreen); console.log("Fullscreen state changed:", isFullscreen); }
    function populateAudioTrackSelector() { if (!videoElement || typeof videoElement.audioTracks === 'undefined' || !audioTrackSelect) { if(audioTrackSelect) audioTrackSelect.style.display = 'none'; return; } const tracks = videoElement.audioTracks; audioTrackSelect.innerHTML = ''; if (tracks.length <= 1) { audioTrackSelect.style.display = 'none'; console.log("Only one or zero audio tracks found."); return; } console.log(`Found ${tracks.length} audio tracks.`); // Ensure at least one track is enabled if possible
        let hasEnabledTrack = false; for (let i = 0; i < tracks.length; i++) { if (tracks[i].enabled) hasEnabledTrack = true; } if (!hasEnabledTrack && tracks.length > 0) { try { tracks[0].enabled = true; console.log("Auto-enabled first audio track as none were enabled."); } catch(e) { console.warn("Could not auto-enable first audio track:", e); } } let preferredTrackIndex = -1; const preferredLanguages = ['hi', 'hin', 'hindi']; // Prioritize Hindi
        for (let i = 0; i < tracks.length; i++) { const track = tracks[i]; const option = document.createElement('option'); const trackValue = track.id || String(i); // Use index as string if ID is missing
            option.value = trackValue; let label = track.label || `Track ${i + 1}`; let languageName = ''; if (track.language) { try { // Try to get full language name
                    languageName = new Intl.DisplayNames(['en'], { type: 'language' }).of(track.language.split('-')[0]); label += ` (${languageName || track.language})`; } catch (e) { label += ` (${track.language})`; } // Fallback to code
            } option.textContent = label; option.selected = track.enabled; option.disabled = track.readyState === 'ended'; // Disable if track ended?
            audioTrackSelect.appendChild(option); const lang = track.language?.toLowerCase(); const lbl = (track.label || '').toLowerCase(); // Check for preferred language/label
            if (preferredTrackIndex === -1 && (preferredLanguages.some(prefLang => lang?.startsWith(prefLang)) || preferredLanguages.some(prefLang => lbl.includes(prefLang)) || languageName?.toLowerCase() === 'hindi')) { preferredTrackIndex = i; } } // Auto-select preferred track if found and not already selected
        if (preferredTrackIndex !== -1) { const preferredTrackValue = tracks[preferredTrackIndex].id || String(preferredTrackIndex); if (!tracks[preferredTrackIndex].enabled) { console.log(`Preferred track found at index ${preferredTrackIndex}. Attempting auto-selection.`); try { let trackChanged = false; for (let i = 0; i < tracks.length; i++) { const shouldBeEnabled = (i === preferredTrackIndex); if (tracks[i].enabled !== shouldBeEnabled) { tracks[i].enabled = shouldBeEnabled; trackChanged = true; } } if (trackChanged) { audioTrackSelect.value = preferredTrackValue; console.log("Successfully auto-selected preferred track."); } } catch(e) { console.error("Error auto-selecting preferred audio track:", e); } } else { // Preferred track was already enabled, just ensure dropdown matches
                audioTrackSelect.value = preferredTrackValue; console.log("Preferred track was already enabled."); } } else { console.log("No preferred audio track found. Using default enabled track."); // Ensure dropdown reflects the currently enabled track if no preference matched
            for (let i = 0; i < tracks.length; i++) { if (tracks[i].enabled) { audioTrackSelect.value = tracks[i].id || String(i); break; } } } audioTrackSelect.style.display = 'inline-block'; // Add listener for future changes if supported
        try { if (tracks.onchange === null || typeof tracks.onchange === 'undefined') { tracks.onchange = populateAudioTrackSelector; } } catch(e) { console.warn("Browser might not support 'onchange' on AudioTrackList", e)} }
    function openWithIntent(url) { if (!url) return; const mime = getMimeTypeFromUrl(url); const titleEncoded = encodeURIComponent(videoTitle?.innerText || document.title || 'Video'); // Create intent URL
        const intentUri = `intent:${url}#Intent;type=${mime};action=android.intent.action.VIEW;S.title=${titleEncoded};end`; console.log("Intent:", intentUri); // Attempt to navigate - Android handles this
        window.location.href = intentUri; }
    function copyVLCLink(buttonElement, url) { console.log("Copy VLC button clicked. URL:", url); if (!url) { console.error("copyVLCLink: No URL provided."); alert("Cannot copy: URL is missing."); return; } // Find the feedback span reliably (next sibling expected)
        const feedbackSpan = buttonElement.nextElementSibling; if (!feedbackSpan || !feedbackSpan.classList.contains('copy-feedback')) { console.warn("copyVLCLink: Could not find feedback span immediately after the button:", buttonElement); copyToClipboard(url, null); // Attempt copy without feedback span
            return; } copyToClipboard(url, feedbackSpan).catch(err => { console.error("Error during copyVLCLink process:", err); alert("Copy failed. Please try again."); if (feedbackSpan) { // Reset feedback on error
                feedbackSpan.classList.remove('show', 'error'); feedbackSpan.style.display = 'none'; } }); }
    function showCopyFeedback(spanElement, message = 'Copied!', isError = false) { if (!spanElement) return; clearTimeout(copyFeedbackTimeout); spanElement.textContent = message; spanElement.classList.toggle('error', isError); // Reset fallback class state correctly
        const wasFallback = spanElement.classList.contains('share-fallback'); spanElement.classList.remove('share-fallback'); if (wasFallback) spanElement.classList.add('share-fallback'); spanElement.style.display = 'inline-block'; spanElement.classList.add('show'); // Clear after timeout
        copyFeedbackTimeout = setTimeout(() => { spanElement.classList.remove('show', 'error'); setTimeout(() => { // Use another short timeout to reset text after fade out
                if (!spanElement.classList.contains('show')) { spanElement.style.display = 'none'; spanElement.textContent = spanElement.classList.contains('share-fallback') ? 'Link copied!' : 'Copied!'; } }, 300); }, 2500); }
    function clearCopyFeedback() { clearTimeout(copyFeedbackTimeout); document.querySelectorAll('.copy-feedback.show').forEach(span => { span.classList.remove('show', 'error'); span.style.display = 'none'; span.textContent = span.classList.contains('share-fallback') ? 'Link copied!' : 'Copied!'; }); }
    function clearBypassFeedback() { clearTimeout(bypassFeedbackTimeout); document.querySelectorAll('.bypass-feedback.show').forEach(span => { span.classList.remove('show', 'error', 'loading'); span.style.display = 'none'; span.textContent = ''; }); }
    function highlightVlcText() { // This function likely only makes sense within the item detail view now
         if (currentViewMode !== 'itemView' || !itemViewContent) return;
         const currentVlcBox = itemViewContent.querySelector('#vlcBox'); // Look within itemViewContent
         const currentVlcCode = currentVlcBox?.querySelector('code');
         if (currentVlcCode && currentVlcBox?.style.display !== 'none') {
             try { const range = document.createRange(); range.selectNodeContents(currentVlcCode); const selection = window.getSelection(); if (selection) { selection.removeAllRanges(); selection.addRange(range); } console.log("Highlighted VLC text as fallback."); }
             catch (selectErr) { console.warn("Could not highlight VLC text:", selectErr); }
         }
     }
    function handlePlayerKeyboardShortcuts(event) { // Only act if player is visible and target isn't an input
        if (!videoContainer || videoContainer.style.display === 'none' || !videoElement) return; const targetTagName = event.target.tagName.toLowerCase(); if (targetTagName === 'input' || targetTagName === 'select' || targetTagName === 'textarea' || event.target.isContentEditable) return; const key = event.key; let prevented = false; switch (key) { case ' ': case 'k': togglePlayPause(); prevented = true; break; case 'ArrowLeft': seekVideo(-10); prevented = true; break; case 'ArrowRight': seekVideo(10); prevented = true; break; case 'ArrowUp': setVolume(Math.min(videoElement.volume + 0.05, 1)); if(volumeSlider) volumeSlider.value = videoElement.volume; prevented = true; break; case 'ArrowDown': setVolume(Math.max(videoElement.volume - 0.05, 0)); if(volumeSlider) volumeSlider.value = videoElement.volume; prevented = true; break; case 'm': toggleMute(); prevented = true; break; case 'f': toggleFullscreen(); prevented = true; break; } if (prevented) event.preventDefault(); }

    // --- State Persistence (Unchanged) ---
    function saveStateToLocalStorage() { try { const stateToSave = {}; // Only save non-default sort/filter settings
        if (currentState.sortColumn !== 'lastUpdated') stateToSave.sortColumn = currentState.sortColumn; if (currentState.sortDirection !== 'desc') stateToSave.sortDirection = currentState.sortDirection; if (currentState.qualityFilter !== '') stateToSave.qualityFilter = currentState.qualityFilter; if (Object.keys(stateToSave).length > 0) { localStorage.setItem(config.LOCAL_STORAGE_KEY, JSON.stringify(stateToSave)); console.log("Saved state:", stateToSave); } else { localStorage.removeItem(config.LOCAL_STORAGE_KEY); console.log("State is default, removed saved state."); } } catch (e) { console.error("Failed to save state to localStorage:", e); } }
    function loadStateFromLocalStorage() { try { const savedState = localStorage.getItem(config.LOCAL_STORAGE_KEY); if (savedState) { const parsedState = JSON.parse(savedState); currentState.sortColumn = typeof parsedState.sortColumn === 'string' ? parsedState.sortColumn : 'lastUpdated'; currentState.sortDirection = (typeof parsedState.sortDirection === 'string' && ['asc', 'desc'].includes(parsedState.sortDirection)) ? parsedState.sortDirection : 'desc'; currentState.qualityFilter = typeof parsedState.qualityFilter === 'string' ? parsedState.qualityFilter : ''; console.log("Loaded state:", { sortColumn: currentState.sortColumn, sortDirection: currentState.sortDirection, qualityFilter: currentState.qualityFilter }); } else { // Set defaults if no saved state
            currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc'; currentState.qualityFilter = ''; console.log("No saved state found, using defaults."); } } catch (e) { console.error("Failed to load or parse state from localStorage:", e); localStorage.removeItem(config.LOCAL_STORAGE_KEY); // Clear corrupted state
        currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc'; currentState.qualityFilter = ''; } // Reset other state variables not persisted in localStorage
        currentState.searchTerm = ''; currentState.currentPage = 1; currentState.typeFilter = ''; activeResultsTab = 'allFiles'; lastFocusedElement = null; }


    // --- Initial Data Loading and Setup (Updated) ---
    async function fetchApiData(params = {}) { if (searchAbortController) { console.log("Aborting previous API request."); searchAbortController.abort(); } searchAbortController = new AbortController(); const signal = searchAbortController.signal; const query = new URLSearchParams(); // Set pagination, sort, filter from current state or overrides
        query.set('page', String(params.page || currentState.currentPage)); query.set('limit', String(params.limit || currentState.limit)); query.set('sort', params.sort || currentState.sortColumn); query.set('sortDir', params.sortDir || currentState.sortDirection); // Apply search, quality, type filters
        const searchTerm = params.search !== undefined ? params.search : currentState.searchTerm; if (searchTerm) query.set('search', searchTerm); const qualityFilter = params.quality !== undefined ? params.quality : currentState.qualityFilter; if (qualityFilter) query.set('quality', qualityFilter); const typeFilter = params.type !== undefined ? params.type : currentState.typeFilter; if (typeFilter) query.set('type', typeFilter); // Special case: Fetching a single item by ID
        if (params.id) { console.log(`Fetching single item by ID: ${params.id}`); query.set('id', params.id); // Remove conflicting list parameters
            query.delete('search'); query.delete('quality'); query.delete('type'); query.delete('page'); query.delete('limit'); query.delete('sort'); query.delete('sortDir'); } const url = `${config.MOVIE_DATA_API_URL}?${query.toString()}`; console.log(`Fetching API: ${url}`); try { const response = await fetch(url, { signal }); if (!response.ok) { let errorBody = null; let errorDetails = `Status: ${response.status}`; try { errorBody = await response.json(); errorDetails = errorBody?.error || errorBody?.details || errorDetails; } catch (_) {} throw new Error(`API Error: ${errorDetails}`); } const data = await response.json(); console.log(`API data received (First few items):`, data?.items?.slice(0,3), `Total: ${data?.totalItems}`); // Update total pages in pagination element if relevant
            const activePagination = tabMappings[activeResultsTab]?.pagination; if(activePagination && data.totalPages !== undefined && currentViewMode === 'search' && !params.id) { activePagination.dataset.totalPages = data.totalPages; } return data; } catch (error) { if (error.name === 'AbortError') { console.log('API fetch aborted.'); return null; // Return null specifically for aborted requests
            } console.error(`Error fetching data from ${url}:`, error); throw error; // Re-throw other errors
        } finally { // Clear the controller reference if this was the latest request
            if (signal === searchAbortController?.signal) { searchAbortController = null; } } }
    async function fetchAndRenderResults() { if (currentViewMode !== 'search') { console.log("Not in search mode, skipping fetch/render."); return; } try { const apiResponse = await fetchApiData(); // Pass current state implicitly
        if (apiResponse === null) return; // Aborted request, do nothing
        renderActiveResultsView(apiResponse); saveStateToLocalStorage(); // Save sort/filter state
    } catch (error) { console.error("Failed to fetch/render search results:", error); const { tableBody } = tabMappings[activeResultsTab] || {}; if (tableBody) { tableBody.innerHTML = `<tr><td colspan="6" class="error-message">Error loading results: ${error.message}. Please try searching again.</td></tr>`; } // Hide pagination on error
        Object.values(tabMappings).forEach(m => { if(m.pagination) m.pagination.style.display = 'none'; }); } }
    // --- populateQualityFilter, displayLoadError (Unchanged) ---
    function populateQualityFilter(items = []) { if (!qualityFilterSelect) return; const currentSelectedValue = qualityFilterSelect.value; // Add qualities from the provided items
        items.forEach(item => { if (item.displayQuality && item.displayQuality !== 'N/A') { uniqueQualities.add(item.displayQuality); } }); // Sort qualities logically (roughly by resolution, then source type)
        const sortedQualities = [...uniqueQualities].sort((a, b) => { const getScore = (q) => { q = String(q || '').toUpperCase().trim(); const resMatch = q.match(/^(\d{3,4})P$/); if (q === '4K' || q === '2160P') return 100; if (resMatch) return parseInt(resMatch[1], 10); if (q === '1080P') return 90; if (q === '720P') return 80; if (q === '480P') return 70; if (['WEBDL', 'BLURAY', 'BDRIP', 'BRRIP'].includes(q)) return 60; if (['WEBIP', 'HDTV', 'HDRIP'].includes(q)) return 50; if (['DVD', 'DVDRIP'].includes(q)) return 40; if (['DVDSCR', 'HC', 'HDCAM', 'TC', 'TS', 'CAM'].includes(q)) return 30; if (['HDR', 'DOLBY VISION', 'DV', 'HEVC', 'X265'].includes(q)) return 20; // Lower score for encoding/meta tags
                return 0; }; const scoreA = getScore(a); const scoreB = getScore(b); if (scoreA !== scoreB) return scoreB - scoreA; // Higher score first
            return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' }); // Alphabetical fallback
        }); // Clear existing options (except the "All Qualities" default)
        while (qualityFilterSelect.options.length > 1) { qualityFilterSelect.remove(1); } // Add sorted qualities
        sortedQualities.forEach(quality => { if (quality && quality !== 'N/A') { const option = document.createElement('option'); option.value = quality; option.textContent = quality; qualityFilterSelect.appendChild(option); } }); // Restore previous selection if still valid, otherwise keep "All"
        qualityFilterSelect.value = [...qualityFilterSelect.options].some(opt => opt.value === currentSelectedValue) ? currentSelectedValue : ""; updateFilterIndicator(); }
    function displayLoadError(message) { const errorHtml = `<div class="error-container" role="alert"><h2>Initialization Failed</h2><p>${sanitize(message)}</p><p>Please try refreshing the page. If the problem persists, check the console (F12) for more details.</p></div>`; // Hide main content areas
        if (searchFocusArea) searchFocusArea.style.display = 'none'; if (resultsArea) resultsArea.style.display = 'none'; if (updatesPreviewSection) updatesPreviewSection.style.display = 'none'; if (itemViewArea) itemViewArea.style.display = 'none'; if (pageFooter) pageFooter.style.display = 'none'; container.classList.remove('results-active', 'shared-view-active'); // Display error message
        if (mainErrorArea) { mainErrorArea.innerHTML = errorHtml; mainErrorArea.style.display = 'block'; } else if (container) { // Fallback: insert at top of container
            container.insertAdjacentHTML('afterbegin', errorHtml); } else { // Last resort: alert
            alert(`Initialization Failed: ${message}`); } // Hide page loader
        if (pageLoader) pageLoader.style.display = 'none'; }
    // --- initializeApp (Updated for URL routing) ---
    async function initializeApp() {
         console.log("--- Initializing App ---");
         if (pageLoader) pageLoader.style.display = 'flex'; // Show loader

         // Always reset essential states on initialization/navigation
         closePlayerIfNeeded(null);
         clearCopyFeedback();
         clearBypassFeedback();
         viewedItemData = null; // Clear any previously viewed item
         lastFocusedElement = null; // Reset focus tracking

         // Move player to main container initially, ready to be moved if needed
         // Ensure it's hidden and reset
         if (videoContainer && container && videoContainer.parentElement !== container) {
             container.appendChild(videoContainer);
             videoContainer.style.display = 'none';
         } else if (videoContainer) {
              videoContainer.style.display = 'none'; // Ensure hidden even if already in container
         }

         const urlParams = new URLSearchParams(window.location.search);
         const itemId = urlParams.get('shareId'); // Use same param for direct view or share
         isDirectShareLoad = !!itemId; // Track if loaded directly to an item

         try {
             if (itemId) {
                 console.log("Item ID detected in URL:", itemId);
                 // Directly display the item details
                 await displayItemDetails(itemId); // This sets view mode to 'itemView' internally
                 // Fetch quality data in background for filter (optional, but good for consistency)
                 fetchApiData({limit: 200, sort: 'quality', sortDir: 'asc'}) // Fetch a reasonable number for qualities
                     .then(data => { if (data && data.items) { populateQualityFilter(data.items); } }) // Use preprocess inside populateQualityFilter implicitly
                     .catch(e => console.warn("Background quality fetch failed during item view", e));
             } else {
                 console.log("No item ID in URL, preparing homepage/search view.");

                 // Set default structure visibility for homepage/search
                 if (searchFocusArea) searchFocusArea.style.display = 'flex';
                 if (pageFooter) pageFooter.style.display = 'flex';
                 if (resultsArea) resultsArea.style.display = 'none'; // Hide results initially
                 if (itemViewArea) itemViewArea.style.display = 'none'; // Hide item view

                 // Clear results tables and hide pagination
                 const defaultMessageHTML = `<tr><td colspan="6" class="status-message">Enter search term above or browse recent updates.</td></tr>`;
                 Object.values(tabMappings).forEach(mapping => {
                     if (mapping?.tableBody) mapping.tableBody.innerHTML = defaultMessageHTML;
                     if (mapping?.pagination) mapping.pagination.style.display = 'none';
                 });

                 loadStateFromLocalStorage(); // Load saved sort/filter preferences BEFORE fetching data

                 // Fetch initial data needed for homepage (suggestions, updates, quality filter)
                 console.log("Fetching initial data for suggestions, updates, quality...");
                 // Combine requests for efficiency if possible, or run concurrently
                 const suggestionPromise = fetchApiData({ limit: 5000, sort: 'lastUpdated', sortDir: 'desc' }); // For suggestions
                 const updatesPromise = loadUpdatesPreview(); // For homepage updates display
                 const qualityPromise = fetchApiData({ limit: 200, sort: 'quality', sortDir: 'asc' }); // For quality filter population

                 // Wait for suggestion data first as it's used for filter population too
                 const suggestionData = await suggestionPromise;
                 if(suggestionData && suggestionData.items) {
                     localSuggestionData = suggestionData.items.map(preprocessMovieData); // Preprocess needed here
                     console.log(`Loaded ${localSuggestionData.length} items for suggestions.`);
                     // Populate quality filter using suggestion data as a base
                     populateQualityFilter(localSuggestionData);
                 } else {
                     console.warn("Could not load initial data for suggestions.");
                 }

                 // Wait for quality data (might add more unique qualities)
                 try {
                     const qualityData = await qualityPromise;
                     if (qualityData && qualityData.items) {
                         populateQualityFilter(qualityData.items); // Add any additional qualities
                     }
                 } catch (e) { console.warn("Quality filter population fetch failed:", e); }

                 // Wait for updates preview to finish loading/rendering
                 await updatesPromise;

                 setViewMode('homepage'); // Set initial view mode to homepage
             }

             // Apply loaded/default quality filter state to the dropdown
             if (qualityFilterSelect) {
                 qualityFilterSelect.value = currentState.qualityFilter || '';
                 updateFilterIndicator();
             }

             // Ensure back button onclick handler is correctly set (using history.back)
             if (backToItemViewButton) {
                 backToItemViewButton.onclick = goBack; // Set to use history.back
             }
             // Ensure home buttons/links work correctly
             const homeTitle = document.querySelector('.simple-title a'); // Assuming title is wrapped in <a>
             if (homeTitle) {
                 homeTitle.onclick = (e) => { e.preventDefault(); goHome(); }; // Prevent default link nav, use JS
             }
             if (backToHomeButtonResults) {
                backToHomeButtonResults.onclick = goHome;
             }

         } catch (error) {
             console.error("Critical error during initialization:", error);
             displayLoadError(error.message || "An unknown error occurred during setup.");
         } finally {
             if (pageLoader) pageLoader.style.display = 'none'; // Hide loader regardless of outcome
             console.log("--- App Initialization Complete ---");
         }
     }


    // --- Event Handling Setup (Updated for View Modes) ---
    function handleActionClick(event) { // Handles clicks INSIDE #itemViewContent for buttons
         const target = event.target;
         // Look for buttons within the item view's content area, EXCLUDING player controls
         const button = target.closest('#shared-item-content .action-buttons-container .button');

         if (button) {
            // Prevent clicks on disabled buttons
            if (button.disabled || button.classList.contains('loading')) {
                event.preventDefault();
                return;
            }

            const action = button.dataset.action;
            const url = button.dataset.url;
            let title = button.dataset.title || viewedItemData?.extractedTitle || viewedItemData?.displayFilename || "Video"; // Use best available title
            const filename = button.dataset.filename || viewedItemData?.displayFilename; // Use item data filename
            const id = button.dataset.id; // Usually for share button
            lastFocusedElement = button; // Track focus origin

            // Allow default behavior for standard links within buttons (e.g., trailer, IMDb)
            if (button.tagName === 'A' && button.href && button.target === '_blank' && !action) {
                console.log("Allowing default A tag navigation for:", button.href);
                return;
            }

            event.preventDefault(); // Prevent default for JS-handled button actions
            console.log(`Action clicked inside item view: ${action}`);

            // Handle specific actions
            switch (action) {
                case 'play':
                    if (url) {
                        isGlobalCustomUrlMode = false; // Ensure not global mode
                        streamVideo(title, url, filename);
                    } else { console.warn("Play action missing URL."); }
                    break;
                case 'copy-vlc':
                    if (url) { copyVLCLink(button, url); }
                    else { console.warn("Copy VLC action missing URL."); }
                    break;
                case 'open-intent':
                    if (url) { openWithIntent(url); }
                    else { console.warn("Open Intent action missing URL."); }
                    break;
                case 'share':
                    if (id) { handleShareClick(button); }
                    else { console.warn("Share action missing ID."); }
                    break;
                case 'toggle-custom-url':
                    toggleCustomUrlInput(button);
                    break;
                case 'bypass-hubcloud':
                    triggerHubCloudBypass(button);
                    break;
                case 'bypass-gdflix':
                    triggerGDFLIXBypass(button);
                    break;
                default:
                    console.warn(`Unhandled action button click: ${action}`);
            }
         }
         // Clicks on player controls (like close button) are handled by their specific listeners or the player container listener
    }

    // --- handleGlobalCustomUrlClick, handleGlobalPlayCustomUrl (Unchanged) ---
    function handleGlobalCustomUrlClick(event) {
         event.preventDefault(); lastFocusedElement = event.target;
         if (!videoContainer || !playerCustomUrlSection || !playerCustomUrlInput) return;
         console.log("Global Play Custom URL clicked."); closePlayerIfNeeded(lastFocusedElement); // Close any existing player first, attempt focus back here
         // No action rows to close
         isGlobalCustomUrlMode = true; videoContainer.classList.add('global-custom-url-mode');
         // Ensure player is in main container or body for fixed positioning
         const mainAppContainer = container || document.body;
         if (videoContainer.parentElement !== mainAppContainer) {
             mainAppContainer.appendChild(videoContainer);
         }
         // Reset player display for custom URL input
         if (videoElement) videoElement.style.display = 'none'; if (customControlsContainer) customControlsContainer.style.display = 'none';
         if (videoTitle) videoTitle.innerText = 'Play Custom URL'; if (vlcBox) vlcBox.style.display = 'none'; if (audioWarningDiv) audioWarningDiv.style.display = 'none';
         playerCustomUrlSection.style.display = 'flex'; playerCustomUrlInput.value = '';
         if (playerCustomUrlFeedback) playerCustomUrlFeedback.textContent = ''; videoContainer.style.display = 'flex'; // Show container
         setTimeout(() => playerCustomUrlInput.focus(), 50);
    }
    function handleGlobalPlayCustomUrl(event) {
         event.preventDefault(); if (!playerCustomUrlInput || !playerCustomUrlFeedback) return;
         const customUrlRaw = playerCustomUrlInput.value.trim(); playerCustomUrlFeedback.textContent = '';
         if (!customUrlRaw) { playerCustomUrlFeedback.textContent = 'Please enter a URL.'; playerCustomUrlInput.focus(); return; }
         let customUrlEncoded = customUrlRaw;
         try { new URL(customUrlRaw); customUrlEncoded = customUrlRaw.replace(/ /g, '%20'); } catch (e) { playerCustomUrlFeedback.textContent = 'Invalid URL format.'; playerCustomUrlInput.focus(); return; }
         console.log(`Attempting to play global custom URL: ${customUrlEncoded}`);
         // Hide custom input section, show player elements
         if(playerCustomUrlSection) playerCustomUrlSection.style.display = 'none'; if(videoElement) videoElement.style.display = 'block'; if(customControlsContainer) customControlsContainer.style.display = 'flex';
         // Stream video (isGlobalCustomUrlMode is already true)
         streamVideo("Custom URL Video", customUrlEncoded, null, true);
    }
    // --- toggleCustomUrlInput (Context is now only item view) ---
    function toggleCustomUrlInput(toggleButton, triggeredByError = false) {
         // Context is always the item view content now
         if (currentViewMode !== 'itemView' || !itemViewContent) {
             console.error("Cannot toggle custom URL input: Not in item view mode.");
             return;
         }
         // Ensure player container and custom section exist
         if (!videoContainer || !playerCustomUrlSection || !playerCustomUrlInput) {
             console.error("Cannot toggle custom URL input: missing player elements.");
             return;
         }

         // Ensure player is inside the item view content if not already
         if (videoContainer.parentElement !== itemViewContent) {
             console.warn("Player not in item view container, moving it for custom URL toggle.");
             itemViewContent.appendChild(videoContainer);
             // Reset player state if it was playing something else (unless triggered by error)
             if (videoElement && videoElement.hasAttribute('src') && !videoElement.paused && !triggeredByError) {
                 videoElement.pause(); videoElement.removeAttribute('src'); videoElement.currentTime = 0; videoElement.load();
             }
             if (vlcBox) vlcBox.style.display = 'none';
             if (audioWarningDiv && !triggeredByError) audioWarningDiv.style.display = 'none'; // Hide normal warnings
             if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; }
             clearCopyFeedback();
         }

         const isHidden = playerCustomUrlSection.style.display === 'none';
         // Toggle visibility: Show input, hide player OR hide input, show player
         playerCustomUrlSection.style.display = isHidden ? 'flex' : 'none';
         videoElement.style.display = isHidden ? 'none' : 'block';
         customControlsContainer.style.display = isHidden ? 'none' : 'flex';
         if(vlcBox) vlcBox.style.display = isHidden ? 'none' : 'block'; // Hide/show VLC info with player

         // Manage audio warning visibility carefully
         if (audioWarningDiv) {
             const hasPlaybackError = audioWarningDiv.innerHTML.includes('Playback Error:');
             if (isHidden) { // Showing custom input
                 // Hide normal audio warning, keep playback error
                 if (!hasPlaybackError) {
                     audioWarningDiv.style.display = 'none';
                 } else {
                      audioWarningDiv.style.display = 'block'; // Ensure error stays visible
                 }
                 if (playerCustomUrlFeedback) playerCustomUrlFeedback.textContent = ''; // Clear feedback
             } else { // Hiding custom input, showing player
                 // If a playback error exists, keep showing it.
                 if (hasPlaybackError) {
                      audioWarningDiv.style.display = 'block';
                 } else {
                     // Otherwise, check if we need to show a *normal* audio warning based on filename
                     const movieData = viewedItemData; // Use data for the current item view
                     let warningText = "";
                     if (movieData && movieData.displayFilename) {
                         const lowerFilename = movieData.displayFilename.toLowerCase();
                         const ddp51Regex = /\bDDP?([ ._-]?5\.1)?\b/i; const advancedAudioRegex = /\b(DTS|ATMOS|TrueHD)\b/i; const multiAudioHintRegex = /\b(Multi|Dual)[ ._-]?Audio\b/i;
                         if (ddp51Regex.test(lowerFilename)) warningText = "<strong>Audio Note:</strong> DDP audio might not work in browser. Use 'Copy URL' or 'Play in VLC or MX Player'.";
                         else if (advancedAudioRegex.test(lowerFilename)) warningText = "<strong>Audio Note:</strong> DTS/Atmos/TrueHD audio likely unsupported. Use external player.";
                         else if (multiAudioHintRegex.test(lowerFilename)) warningText = "<strong>Audio Note:</strong> May contain multiple audio tracks. Check selector below or use external player.";
                     }
                     if(warningText) { audioWarningDiv.innerHTML = warningText; audioWarningDiv.style.display = 'block'; }
                     else { audioWarningDiv.style.display = 'none'; } // No warning needed
                 }
             }
         }

         // Ensure the main video container itself is visible when either player or input is shown
         videoContainer.style.display = 'flex';

         // Update toggle button state and text
         toggleButton.setAttribute('aria-expanded', String(isHidden));
         toggleButton.innerHTML = isHidden ? '<span aria-hidden="true">🔼</span> Hide Custom URL Input' : '<span aria-hidden="true">🔗</span> Play Custom URL';

         // Focus management
         if (isHidden && playerCustomUrlInput) {
             setTimeout(() => playerCustomUrlInput.focus(), 50);
         } else if (!isHidden) {
             setTimeout(() => toggleButton.focus(), 50); // Focus back on the toggle button
         }

         // Scroll player/input section into view
         setTimeout(() => {
             const elementToScroll = isHidden ? playerCustomUrlSection : videoElement;
             elementToScroll?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
         }, 150);
    }
    // --- playFromCustomUrlInput (Context is item view player) ---
    function playFromCustomUrlInput(playButton) {
         const container = playButton.closest('#playerCustomUrlSection'); if (!container) { console.error("Could not find custom URL section container."); return; }
         const inputField = container.querySelector('#playerCustomUrlInput'); const feedbackSpan = container.querySelector('.player-custom-url-feedback');
         const titleRef = "Custom URL Video"; if (!inputField || !feedbackSpan) { console.error("Could not find custom URL input or feedback span."); return; }
         const customUrlRaw = inputField.value.trim(); feedbackSpan.textContent = ''; if (!customUrlRaw) { feedbackSpan.textContent = 'Please enter a URL.'; inputField.focus(); return; }
         let customUrlEncoded = customUrlRaw;
         try { new URL(customUrlRaw); customUrlEncoded = customUrlRaw.replace(/ /g, '%20'); } catch (e) { feedbackSpan.textContent = 'Invalid URL format.'; inputField.focus(); return; }
         console.log(`Attempting to play custom URL from item context: ${customUrlEncoded}`); isGlobalCustomUrlMode = false; // Ensure not in global mode

         // Ensure player is in the item view content
         if (currentViewMode !== 'itemView' || !itemViewContent) { console.error("Not in item view mode for custom URL play."); return; }
         if (videoContainer.parentElement !== itemViewContent) { console.warn("Player wasn't in the item view container, moving it."); itemViewContent.appendChild(videoContainer); }

         // Hide custom input section, show player elements
         if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none'; if (videoElement) videoElement.style.display = 'block'; if (customControlsContainer) customControlsContainer.style.display = 'flex';

         // Reset the toggle button state if it exists
         const toggleButton = itemViewContent.querySelector('.custom-url-toggle-button[aria-expanded="true"]');
         if (toggleButton) {
             toggleButton.setAttribute('aria-expanded', 'false');
             toggleButton.innerHTML = '<span aria-hidden="true">🔗</span> Play Custom URL';
         }

         // Stream the video
         streamVideo(titleRef, customUrlEncoded, null, true); // Mark as custom URL source
    }
    // REMOVED: getMovieDataFromActionContainer

    // --- HubCloud/GDFLIX Bypass Logic (Updated Context) ---
    async function triggerHubCloudBypass(buttonElement) {
         const hubcloudUrl = buttonElement.dataset.hubcloudUrl;
         // Reference should always be 'itemView' when triggered from detail page
         const movieRef = buttonElement.dataset.movieRef;
         if (!hubcloudUrl) { console.error("Bypass failed: HubCloud URL missing from button data."); setBypassButtonState(buttonElement, 'error', 'Missing URL'); return; }
         if (movieRef !== 'itemView') { console.warn(`Unexpected movieRef '${movieRef}' during HubCloud bypass in item view.`); }
         if (!viewedItemData) { console.error("Bypass failed: No viewedItemData available."); setBypassButtonState(buttonElement, 'error', 'Internal Error'); return; }


         console.log(`Attempting HubCloud bypass for: ${hubcloudUrl}`); setBypassButtonState(buttonElement, 'loading');
         const apiController = new AbortController(); const timeoutId = setTimeout(() => { apiController.abort(); /* Abort fetch on timeout */ }, config.BYPASS_TIMEOUT);

         try {
             const response = await fetch(config.BYPASS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hubcloudUrl }), signal: apiController.signal });
             clearTimeout(timeoutId); // Clear timeout if fetch completes

             if (!response.ok) { let errorDetails = `HTTP Error: ${response.status}`; try { errorDetails = (await response.json()).details || errorDetails; } catch (_) {} throw new Error(errorDetails); }
             const result = await response.json();
             if (result.success && result.finalUrl) {
                 console.log(`HubCloud Bypass successful! Raw Final URL: ${result.finalUrl}`); const encodedFinalUrl = result.finalUrl.replace(/ /g, '%20'); console.log(`Encoded Final URL: ${encodedFinalUrl}`);
                 setBypassButtonState(buttonElement, 'success', 'Success!');
                 updateItemViewAfterBypass(encodedFinalUrl); // Update the current item view
             } else { throw new Error(result.details || result.error || 'Unknown HubCloud bypass failure'); }
         } catch (error) {
             clearTimeout(timeoutId); // Ensure timeout is cleared on error too
             if (error.name === 'AbortError') { // Check if abort was due to timeout or manual abort
                 if (!apiController.signal.aborted) { // Signal not aborted means timeout triggered it
                     console.error(`HubCloud Bypass API call timed out after ${config.BYPASS_TIMEOUT / 1000}s`);
                     setBypassButtonState(buttonElement, 'error', 'Timeout');
                 } else { // Manually aborted (e.g., navigating away)
                     console.log("HubCloud Bypass fetch aborted.");
                     setBypassButtonState(buttonElement, 'idle'); // Reset if manually aborted
                 }
             }
             else { console.error("HubCloud Bypass failed:", error); setBypassButtonState(buttonElement, 'error', `Failed: ${error.message.substring(0, 50)}`); }
         }
     }
    async function triggerGDFLIXBypass(buttonElement) {
         const gdflixUrl = buttonElement.dataset.gdflixUrl;
         const movieRef = buttonElement.dataset.movieRef; // Should be 'itemView'
         if (!gdflixUrl) { console.error("Bypass failed: GDFLIX URL missing from button data."); setBypassButtonState(buttonElement, 'error', 'Missing URL'); return; }
         if (movieRef !== 'itemView') { console.warn(`Unexpected movieRef '${movieRef}' during GDFLIX bypass in item view.`); }
         if (!viewedItemData) { console.error("Bypass failed: No viewedItemData available."); setBypassButtonState(buttonElement, 'error', 'Internal Error'); return; }

         console.log(`Attempting GDFLIX bypass for: ${gdflixUrl}`); setBypassButtonState(buttonElement, 'loading');
         const apiController = new AbortController(); const timeoutId = setTimeout(() => { apiController.abort(); }, config.BYPASS_TIMEOUT);
         try {
             const response = await fetch(config.GDFLIX_BYPASS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gdflixUrl }), signal: apiController.signal });
             clearTimeout(timeoutId);
             if (!response.ok) { let errorDetails = `HTTP Error: ${response.status}`; try { errorDetails = (await response.json()).error || errorDetails; } catch (_) {} throw new Error(errorDetails); }
             const result = await response.json();
             if (result.success && result.finalUrl) {
                 console.log(`GDFLIX Bypass successful! Raw Final URL: ${result.finalUrl}`); const encodedFinalUrl = result.finalUrl.replace(/ /g, '%20'); console.log(`Encoded Final URL: ${encodedFinalUrl}`);
                 setBypassButtonState(buttonElement, 'success', 'Success!');
                  updateItemViewAfterBypass(encodedFinalUrl); // Update the current item view
             } else { throw new Error(result.error || 'Unknown GDFLIX bypass failure'); }
         } catch (error) {
             clearTimeout(timeoutId);
             if (error.name === 'AbortError') {
                  if (!apiController.signal.aborted) {
                     console.error(`GDFLIX Bypass API call timed out after ${config.BYPASS_TIMEOUT / 1000}s`);
                     setBypassButtonState(buttonElement, 'error', 'Timeout');
                 } else {
                     console.log("GDFLIX Bypass fetch aborted.");
                     setBypassButtonState(buttonElement, 'idle');
                 }
             }
             else { console.error("GDFLIX Bypass failed:", error); setBypassButtonState(buttonElement, 'error', `Failed: ${error.message.substring(0, 50)}`); }
         }
     }
    // --- updateActionRowAfterBypass (Renamed and Simplified) ---
    function updateItemViewAfterBypass(encodedFinalUrl) {
         // Ensure we are in item view mode and have the necessary data/elements
         if (currentViewMode !== 'itemView' || !viewedItemData || !itemViewContent) {
             console.error("Cannot update item view after bypass: wrong view mode, missing data or container.");
             alert("An error occurred updating the page after bypass. Please try playing the link manually or refresh.");
             return;
         }
         viewedItemData.url = encodedFinalUrl; // Update the in-memory data's URL
         console.log(`Updated viewedItemData (ID: ${viewedItemData.id}) in memory with bypassed URL.`);

         // Re-render the content of the item view area using the updated data
         const actionHTML = createItemDetailContentHTML(viewedItemData);
         // Preserve scroll position if possible (might jump slightly)
         const scrollY = window.scrollY;
         itemViewContent.innerHTML = actionHTML; // Replace the entire content
         window.scrollTo(0, scrollY); // Attempt to restore scroll position

         // Re-append the player container (it's hidden initially after re-render)
         if (videoContainer && itemViewContent && videoContainer.parentElement !== itemViewContent) {
            console.log("Re-appending video container after bypass update.");
            itemViewContent.appendChild(videoContainer);
            videoContainer.style.display = 'none'; // Ensure it stays hidden
         } else if (videoContainer) {
             videoContainer.style.display = 'none'; // Ensure hidden even if already there
         }


         console.log(`Successfully re-rendered item view content for movie ID: ${viewedItemData.id} after bypass.`);
         // Focus the new Play button for usability
         const playButton = itemViewContent.querySelector('.play-button[data-url]'); // Ensure it finds the button with a URL
         if (playButton) {
             setTimeout(() => playButton.focus(), 100); // Delay focus slightly
         } else {
             console.warn("Could not find Play button to focus after bypass update.");
         }
     }
    // --- setBypassButtonState (Unchanged) ---
    function setBypassButtonState(buttonElement, state, message = null) { if (!buttonElement) return; const feedbackSpan = buttonElement.nextElementSibling?.classList.contains('bypass-feedback') ? buttonElement.nextElementSibling : null; // More robust feedback span finder
        const iconSpan = buttonElement.querySelector('.button-icon'); const spinnerSpan = buttonElement.querySelector('.button-spinner'); const textSpan = buttonElement.querySelector('.button-text'); const isHubCloud = buttonElement.classList.contains('hubcloud-bypass-button'); const defaultText = isHubCloud ? 'Bypass HubCloud' : 'Bypass GDFLIX'; const defaultIconHTML = isHubCloud ? '☁️' : '🎬'; const successIconHTML = '✅'; const errorIconHTML = defaultIconHTML; // Revert to default icon on error
        buttonElement.classList.remove('loading', 'error', 'success'); buttonElement.disabled = false; if (feedbackSpan) feedbackSpan.style.display = 'none'; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) { iconSpan.style.display = 'inline-block'; iconSpan.innerHTML = defaultIconHTML; } clearTimeout(bypassFeedbackTimeout); switch (state) { case 'loading': buttonElement.classList.add('loading'); buttonElement.disabled = true; if (textSpan) textSpan.textContent = 'Bypassing...'; if (spinnerSpan) spinnerSpan.style.display = 'inline-block'; if (iconSpan) iconSpan.style.display = 'none'; if (feedbackSpan) { feedbackSpan.textContent = 'Please wait...'; feedbackSpan.className = 'bypass-feedback loading show'; feedbackSpan.style.display = 'inline-block'; } break; case 'success': buttonElement.classList.add('success'); buttonElement.disabled = true; // Keep disabled on success to prevent re-click
            if (textSpan) textSpan.textContent = 'Success!'; if (iconSpan) iconSpan.innerHTML = successIconHTML; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.textContent = message || 'Success! Play/Copy link updated.'; feedbackSpan.className = 'bypass-feedback success show'; feedbackSpan.style.display = 'inline-block'; } break; case 'error': buttonElement.classList.add('error'); buttonElement.disabled = false; // Re-enable on error
            if (textSpan) textSpan.textContent = defaultText; if (iconSpan) iconSpan.innerHTML = errorIconHTML; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.textContent = message || 'Failed'; feedbackSpan.className = 'bypass-feedback error show'; feedbackSpan.style.display = 'inline-block'; bypassFeedbackTimeout = setTimeout(() => { feedbackSpan.classList.remove('show', 'error', 'loading'); feedbackSpan.style.display = 'none'; feedbackSpan.textContent = ''; buttonElement.classList.remove('error'); }, 5000); } else { // Fallback alert if no feedback span
                alert(`Bypass Error: ${message || 'Failed'}`); } break; case 'idle': default: buttonElement.disabled = false; if (textSpan) textSpan.textContent = defaultText; if (iconSpan) iconSpan.innerHTML = defaultIconHTML; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.classList.remove('show', 'error', 'loading'); feedbackSpan.style.display = 'none'; feedbackSpan.textContent = ''; } break; } }

    // --- Event Delegation Setup (Simplified for View Modes) ---
    function setupEventListeners() {
        console.log("Setting up event listeners...");

        // --- Search Input & Filter ---
        if (searchInput) {
            searchInput.addEventListener('input', handleSearchInput);
            searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSearchSubmit(); } else if (event.key === 'Escape') { if(suggestionsContainer) suggestionsContainer.style.display = 'none'; } });
            // Use 'search' event for the 'x' button in input type="search"
            searchInput.addEventListener('search', handleSearchClear);
            searchInput.addEventListener('blur', () => { // Hide suggestions on blur, unless focus moves to suggestions or search button
                setTimeout(() => { const searchButton = document.getElementById('searchSubmitButton'); if (document.activeElement !== searchInput && !suggestionsContainer?.contains(document.activeElement) && document.activeElement !== searchButton) { if(suggestionsContainer) suggestionsContainer.style.display = 'none'; } }, 150); });
        }
        if (qualityFilterSelect) { qualityFilterSelect.addEventListener('change', triggerFilterChange); }

        // --- Results Area (Sorting and Links) ---
        if (resultsArea) {
            resultsArea.addEventListener('click', (event) => {
                // Handle sorting clicks on table headers
                if (event.target.closest('th.sortable')) {
                    handleSort(event);
                }
                // Handle clicks on pagination buttons (already have onclick, but delegate just in case)
                else if (event.target.closest('.pagination-controls button')) {
                    // Let inline onclick handle it - changePage(pageNumber)
                }
                // Handle clicks on Tab buttons
                else if (event.target.closest('.tab-navigation button')) {
                    const tabId = event.target.closest('button').id.replace('TabButton', '');
                    if (tabId && tabMappings[tabId]) {
                       switchTab(tabId);
                    }
                }
                // Clicks on filename/view links (<a> tags) are handled by browser navigation
            });
        }

        // --- Updates Preview Area (Links) ---
        // Clicks on filename/view links (<a> tags) are handled by browser navigation
        // Clicks on "Show More" button have inline onclick handler

        // --- Item Detail View Area (Action Buttons) ---
        if (itemViewArea) {
            // Use the handleActionClick function for specific buttons inside this area
            itemViewArea.addEventListener('click', handleActionClick);
            // Also handle clicks on the VLC text box for highlighting
            itemViewArea.addEventListener('click', (event) => {
                if (event.target.closest('#vlcBox code')) {
                   highlightVlcText();
                }
            });
        }

        // --- Player Container Controls ---
        if (videoContainer) {
            // Handle player controls that aren't simple window functions
            videoContainer.addEventListener('click', (event) => {
                 const button = event.target.closest('button');
                 if (!button) return; // Ignore clicks not on buttons

                 lastFocusedElement = button; // Track focus

                 // Play/Pause Button
                 if (button.classList.contains('play-pause-btn')) {
                     togglePlayPause();
                 }
                 // Mute Button
                 else if (button.id === 'muteButton') {
                     toggleMute();
                 }
                 // Fullscreen Button
                 else if (button.classList.contains('fullscreen-btn')) {
                     toggleFullscreen();
                 }
                 // Seek Buttons
                 else if (button.dataset.seek) {
                     seekVideo(parseFloat(button.dataset.seek));
                 }
                 // Close Button
                 else if (button.classList.contains('close-btn')) {
                     closePlayer(button); // Pass button as element to focus after close (or its replacement)
                 }
                 // Play button within player's custom URL section
                 else if (button.id === 'playerPlayCustomUrlButton') {
                    if (isGlobalCustomUrlMode) {
                        handleGlobalPlayCustomUrl(event);
                    } else {
                        playFromCustomUrlInput(button);
                    }
                 }
            });
            // Handle input changes for sliders/selects within player
            videoContainer.addEventListener('input', (event) => {
                const target = event.target;
                if (target.id === 'volumeSlider') {
                    setVolume(target.value);
                } else if (target.id === 'playbackSpeedSelect') {
                    setPlaybackSpeed(target.value);
                } else if (target.id === 'audioTrackSelect') {
                    changeAudioTrack(target);
                }
            });
        }


        // --- Global Buttons/Actions ---
        if (playCustomUrlGlobalButton) { playCustomUrlGlobalButton.addEventListener('click', handleGlobalCustomUrlClick); }

        // --- Document/Window Level Listeners ---
        // Keyboard Shortcuts for Player
        document.addEventListener('keydown', handlePlayerKeyboardShortcuts);

        // Click Outside Suggestions
         document.addEventListener('click', (event) => {
             if (searchInput && suggestionsContainer && suggestionsContainer.style.display === 'block') { const searchWrapper = searchInput.closest('.search-input-wrapper'); // Check if click is outside the search input wrapper AND the suggestions container
                 if (searchWrapper && !searchWrapper.contains(event.target) && !suggestionsContainer.contains(event.target)) { suggestionsContainer.style.display = 'none'; } }
             // Click outside player logic - REMOVED aggressive closing on outside click. Rely on close button.
         }, true); // Use capture phase to potentially catch clicks sooner

        // Video Element Specific Events
        if(videoElement) {
            videoElement.addEventListener('volumechange', () => { if (volumeSlider && Math.abs(parseFloat(volumeSlider.value) - videoElement.volume) > 0.01) { volumeSlider.value = videoElement.volume; } updateMuteButton(); try { localStorage.setItem(config.PLAYER_VOLUME_KEY, String(videoElement.volume)); } catch (e) { console.warn("LocalStorage volume save failed", e); } });
            videoElement.addEventListener('ratechange', () => { if(playbackSpeedSelect && playbackSpeedSelect.value !== String(videoElement.playbackRate)) { playbackSpeedSelect.value = String(videoElement.playbackRate); } try { localStorage.setItem(config.PLAYER_SPEED_KEY, String(videoElement.playbackRate)); } catch (e) { console.warn("LocalStorage speed save failed", e); } });
            videoElement.addEventListener('loadedmetadata', populateAudioTrackSelector);
            videoElement.removeEventListener('error', handleVideoError); // Remove previous listener if any
            videoElement.addEventListener('error', handleVideoError); // Add current listener
            // Listen for time updates to potentially update progress bar (if added later)
            // videoElement.addEventListener('timeupdate', handleTimeUpdate);
            // Listen for play/pause state changes to update play/pause button icon (if added later)
            // videoElement.addEventListener('play', updatePlayPauseButton);
            // videoElement.addEventListener('pause', updatePlayPauseButton);
        }

        // Fullscreen Change Listener
        document.addEventListener('fullscreenchange', handleFullscreenChange); document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

        // Back/Forward Navigation Listener (Popstate)
        window.addEventListener('popstate', (event) => {
            console.log("Popstate event triggered:", window.location.href, event.state);
            // Re-initialize the app based on the new URL state. This will read the shareId param.
            // initializeApp handles closing players, resetting state, and showing the correct view.
            initializeApp();
        });

        console.log("Event listeners setup complete.");
    }


    // --- Add Event Listeners on DOMContentLoaded ---
    // Ensure DOM is fully loaded AND parsed before initializing and setting up listeners.
    // Use an async function to allow awaiting initializeApp.
    document.addEventListener('DOMContentLoaded', async () => {
         console.log("DOMContentLoaded event fired.");
         try {
             await initializeApp(); // Initialize first (fetches data, sets up initial view based on URL)
             setupEventListeners(); // THEN setup listeners on the elements created/shown by initializeApp
         } catch (error) {
             console.error("Error during DOMContentLoaded initialization sequence:", error);
             // DisplayLoadError might have already been called by initializeApp, but call again as fallback
             displayLoadError(error.message || "An unexpected error occurred on page load.");
         }
     }); // End DOMContentLoaded

})(); // End of IIFE
// --- END OF script.js ---
