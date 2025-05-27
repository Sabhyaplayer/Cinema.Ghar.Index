// --- START OF script.js (MODIFIED FOR GROUPING + GRID VIEW + ITEM DETAIL VIEW NAVIGATION + TMDB INTEGRATION + ETC. v2) ---
(function() {
    'use strict';

    // ===========================================================
    // JAVASCRIPT SECTION (Updated for Grouping, TMDb Integration & Grid View)
    // ===========================================================
    const config = {
        HDR_LOGO_URL: "https://as1.ftcdn.net/v2/jpg/05/32/83/72/1000_F_532837228_v8CGZRU0jy39uCtqFRnJz6xDntrGuLLx.webp",
        FOURK_LOGO_URL: "https://i.pinimg.com/736x/85/c4/b0/85c4b0a2fb8612825d0cd2f53460925f.jpg",
        ITEMS_PER_PAGE: 50, // For groups if API supported, or files before client-side grouping
        LOCAL_STORAGE_KEY: 'cinemaGharState_v18_grouping', // Incremented version
        PLAYER_VOLUME_KEY: 'cinemaGharPlayerVolume',
        PLAYER_SPEED_KEY: 'cinemaGharPlayerSpeed',
        SEARCH_DEBOUNCE_DELAY: 300,
        SUGGESTIONS_DEBOUNCE_DELAY: 250,
        MAX_SUGGESTIONS: 50,
        UPDATES_PREVIEW_INITIAL_COUNT: 12, // Number of groups
        UPDATES_PREVIEW_LOAD_MORE_COUNT: 12, // Number of groups
        MOVIE_DATA_API_URL: '/api/movies',
        BYPASS_API_URL: 'https://hubcloud-bypass.onrender.com/api/hubcloud',
        GDFLIX_BYPASS_API_URL: 'https://gdflix-bypass.onrender.com/api/gdflix',
        BYPASS_TIMEOUT: 60000,
        TMDB_API_PROXY_URL: '/api/tmdb',
        TMDB_FETCH_TIMEOUT: 15000,
        POSTER_PLACEHOLDER_URL: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'%3E%3Crect width='2' height='3' fill='%23e9ecef'/%3E%3C/svg%3E"
    };

    // --- DOM Element References ---
    const container = document.getElementById('cinemaghar-container');
    const pageLoader = document.getElementById('page-loader');
    const searchFocusArea = document.getElementById('search-focus-area');
    const resultsArea = document.getElementById('results-area');

    const itemDetailView = document.getElementById('item-detail-view');
    const groupInfoArea = document.getElementById('group-info-area');
    const groupFilesListContainer = document.getElementById('group-files-list-container');
    const filesListHeading = document.getElementById('files-list-heading');
    const selectedFileActionsWrapper = document.getElementById('selected-file-actions-wrapper');
    const itemDetailContent = document.getElementById('item-detail-content'); // For selected file actions

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

    const allFilesGridContainer = document.getElementById('allFilesGridContainer');
    const moviesGridContainer = document.getElementById('moviesGridContainer');
    const seriesGridContainer = document.getElementById('seriesGridContainer');

    const allFilesPaginationControls = document.getElementById('allFilesPaginationControls');
    const moviesPaginationControls = document.getElementById('moviesPaginationControls');
    const seriesPaginationControls = document.getElementById('seriesPaginationControls');

    const backToHomeButtonResults = document.getElementById('backToHomeButtonResults');
    const backToHomeButtonShared = document.getElementById('backToHomeButtonShared'); // For shared group links
    const backToResultsOrGroupListButton = document.getElementById('backToResultsOrGroupListButton');

    const pageFooter = document.getElementById('page-footer');
    const playerCustomUrlSection = document.getElementById('playerCustomUrlSection');
    const playerCustomUrlInput = document.getElementById('playerCustomUrlInput');
    const playerPlayCustomUrlButton = document.getElementById('playerPlayCustomUrlButton');
    const playerCustomUrlFeedback = playerCustomUrlSection?.querySelector('.player-custom-url-feedback');
    const playCustomUrlGlobalButton = document.getElementById('playCustomUrlGlobalButton');

    // --- State Variables ---
    let allFetchedFilesData = []; // All individual files fetched from API
    let localGroupedSuggestionData = []; // Grouped data for suggestions/updates
    let currentGroupedSearchResultsData = []; // Grouped data for search results
    let weeklyGroupedUpdatesData = []; // Grouped data for updates preview

    let currentViewGroupData = null; // Holds the currently displayed group object
    let currentItemDetailData = null; // Holds the specific FILE object whose actions are shown

    let updatesPreviewShownCount = 0; // Count of groups shown in updates
    let uniqueQualities = new Set();
    let copyFeedbackTimeout;
    let bypassFeedbackTimeout;
    let suggestionDebounceTimeout;
    let searchAbortController = null;
    let groupDetailAbortController = null; // For fetching group TMDb details
    let isInitialLoad = true;
    let currentViewMode = 'homepage'; // 'homepage', 'search', 'groupDetail'
    let isShareMode = false; // If a group is loaded via share link
    let activeResultsTab = 'allFiles';
    let lastFocusedElement = null;
    let isGlobalCustomUrlMode = false;

    let currentState = {
        searchTerm: '',
        qualityFilter: '',
        typeFilter: '', // 'movies', 'series', or '' for all
        sortColumn: 'lastUpdated', // Sort key for groups (based on most recent file in group)
        sortDirection: 'desc',
        currentPage: 1,
        limit: config.ITEMS_PER_PAGE, // Files to fetch from API to form groups
        currentGroupKey: null, // Key of the group being viewed
        currentSelectedFileId: null, // Original ID of the file selected within a group
    };

    const tabMappings = {
        allFiles: { button: document.getElementById('allFilesTabButton'), panel: document.getElementById('allFilesTabPanel'), gridContainer: allFilesGridContainer, pagination: allFilesPaginationControls, typeFilter: '' },
        movies: { button: document.getElementById('moviesTabButton'), panel: document.getElementById('moviesTabPanel'), gridContainer: moviesGridContainer, pagination: moviesPaginationControls, typeFilter: 'movies' },
        series: { button: document.getElementById('seriesTabButton'), panel: document.getElementById('seriesTabPanel'), gridContainer: seriesGridContainer, pagination: seriesPaginationControls, typeFilter: 'series' }
    };

    // --- Utility Functions ---
    const sanitize = (str) => { if (str === null || typeof str === 'undefined') return ""; const temp = document.createElement('div'); temp.textContent = String(str); return temp.innerHTML; };
    const TimeAgo = { MINUTE: 60, HOUR: 3600, DAY: 86400, WEEK: 604800, MONTH: 2592000, YEAR: 31536000, format: (isoString) => { if (!isoString) return 'N/A'; try { const date = new Date(isoString); const seconds = Math.floor((new Date() - date) / 1000); if (isNaN(seconds) || seconds < 0) { return TimeAgo.formatFullDate(date); } if (seconds < 2) return "just now"; if (seconds < TimeAgo.MINUTE) return `${seconds} sec${seconds > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.HOUR) return `${Math.floor(seconds / TimeAgo.MINUTE)} min${Math.floor(seconds / TimeAgo.MINUTE) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY) return `${Math.floor(seconds / TimeAgo.HOUR)} hr${Math.floor(seconds / TimeAgo.HOUR) > 1 ? 's' : ''} ago`; if (seconds < TimeAgo.DAY * 2) return "Yesterday"; if (seconds < TimeAgo.WEEK) return `${Math.floor(seconds / TimeAgo.DAY)} days ago`; if (seconds < TimeAgo.MONTH) return `${Math.floor(seconds / TimeAgo.WEEK)} wk${Math.floor(seconds / TimeAgo.WEEK) > 1 ? 's' : ''} ago`; return TimeAgo.formatFullDate(date, true); } catch (e) { return 'Invalid Date'; } }, formatFullDate: (date, short = false) => { if (!(date instanceof Date) || isNaN(date.getTime())) return 'Invalid Date'; const optsDate = short ? { year: '2-digit', month: 'numeric', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }; const optsTime = { hour: 'numeric', minute: '2-digit', hour12: true }; try { return `${date.toLocaleDateString(undefined, optsDate)}${short ? '' : ', ' + date.toLocaleTimeString(undefined, optsTime)}`; } catch (e) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; } } };
    function extractSizeData(inputString) { if (!inputString) return { value: 0, unit: '', display: 'N/A', bytes: 0 }; const r = /(?<size>[\d.]+)\s?(?<unit>GB|MB)/i; const m = String(inputString).match(r); if (m?.groups?.size && m?.groups?.unit) { const value = parseFloat(m.groups.size); const unit = m.groups.unit.toUpperCase(); if (!isNaN(value)) { const bytes = unit === 'GB' ? value * 1024 * 1024 * 1024 : value * 1024 * 1024; return { value: value, unit: unit, display: `${value} ${unit}`, bytes: isNaN(bytes) ? 0 : bytes }; } } return { value: 0, unit: '', display: 'N/A', bytes: 0 }; }
    function getMimeTypeFromUrl(url) { if (!url) return 'video/*'; const m = url.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/); if (!m) return 'video/*'; const ext = m[1].toLowerCase(); const mimeMap = { 'mkv': 'video/x-matroska', 'mp4': 'video/mp4', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo', 'webm': 'video/webm', 'wmv': 'video/x-ms-wmv', 'flv': 'video/x-flv', 'ts': 'video/mp2t', 'm4v': 'video/x-m4v', 'ogv': 'video/ogg' }; return mimeMap[ext] || 'video/*'; }
    function handleVideoError(event) { console.error("HTML5 Video Error:", event, videoElement?.error); let msg = "An unknown error occurred while trying to play the video."; if (videoElement?.error) { switch (videoElement.error.code) { case MediaError.MEDIA_ERR_ABORTED: msg = 'Playback was aborted.'; break; case MediaError.MEDIA_ERR_NETWORK: msg = 'A network error caused the video download to fail.'; break; case MediaError.MEDIA_ERR_DECODE: msg = 'Video decoding error (unsupported codec or corrupt file?).'; break; case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = 'Video format not supported or server/network failed.'; break; default: msg = `An unknown video error occurred (Code: ${videoElement.error.code}).`; break; } } if (audioWarningDiv) { audioWarningDiv.innerHTML = `<strong>Playback Error:</strong> ${sanitize(msg)} <br>Consider using 'Copy URL' with an external player (VLC/MX), 'Play in VLC or MX Player' (Android), or the 'Play Custom URL' option below.`; audioWarningDiv.style.display = 'block'; }
        // Logic for showing custom URL input on error if a file was playing
        if (!isGlobalCustomUrlMode && currentViewMode === 'groupDetail' && currentItemDetailData && itemDetailContent) {
            const customUrlToggleButton = itemDetailContent.querySelector('.custom-url-toggle-button');
            if (customUrlToggleButton) {
                customUrlToggleButton.style.display = 'inline-flex';
                if (playerCustomUrlSection && playerCustomUrlSection.style.display === 'none') {
                    toggleCustomUrlInput(customUrlToggleButton, true); // true for triggeredByError
                }
                setTimeout(() => { customUrlToggleButton.focus(); }, 100);
            }
        } else if (isGlobalCustomUrlMode) {
            if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'flex';
            if (videoElement) videoElement.style.display = 'none';
            if (customControlsContainer) customControlsContainer.style.display = 'none';
        }
    }
    function extractQualityFromFilename(filename) { if (!filename) return null; const safeFilename = String(filename); const patterns = [ /(?:^|\.|\[|\(|\s|_|-)((?:4k|2160p|1080p|720p|480p))(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(WEB-?DL|WEBRip|BluRay|BDRip|BRRip|HDTV|HDRip|DVDrip|DVDScr|HDCAM|HC|TC|TS|CAM)(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(HDR|DV|Dolby.?Vision|HEVC|x265)(?=$|\.|\]|\)|\s|_|-)/i ]; let foundQuality = null; for (const regex of patterns) { const match = safeFilename.match(regex); if (match && match[1]) { let quality = match[1].toUpperCase(); quality = quality.replace(/WEB-?DL/i, 'WEBDL'); quality = quality.replace(/BLURAY/i, 'BluRay'); quality = quality.replace(/DVDRIP/i, 'DVD'); quality = quality.replace(/DOLBY.?VISION/i, 'Dolby Vision'); if (quality === '2160P') quality = '4K'; if (patterns.indexOf(regex) < 2) return quality; if (patterns.indexOf(regex) === 2 && !foundQuality) foundQuality = quality; } } return foundQuality; }
    function normalizeTextForSearch(text) { if (!text) return ""; return String(text).toLowerCase().replace(/[.\-_\(\)\[\]]/g, '').replace(/\s+/g, ' ').trim(); }
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    async function copyToClipboard(text, feedbackSpan) { let success = false; if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) { try { await navigator.clipboard.writeText(text); success = true; } catch (err) { success = false; } } if (!success) { const textArea = document.createElement("textarea"); textArea.value = text; textArea.style.position = "fixed"; textArea.style.top = "-9999px"; textArea.style.left = "-9999px"; textArea.style.opacity = "0"; textArea.setAttribute("readonly", ""); document.body.appendChild(textArea); try { textArea.select(); textArea.setSelectionRange(0, textArea.value.length); success = document.execCommand('copy'); } catch (err) { success = false; } finally { document.body.removeChild(textArea); } } if (success) { if (feedbackSpan) showCopyFeedback(feedbackSpan, 'Copied!', false); } else { if (feedbackSpan) showCopyFeedback(feedbackSpan, 'Copy Failed!', true); else alert("Copy failed."); } return success; }

    // --- Data Preprocessing & Grouping ---
    function preprocessMovieData(movie) { // Processes a single FILE item
        const processed = { ...movie };
        processed.id = movie.original_id; // IMPORTANT: Use original_id from DB as the unique file ID
        processed.url = (movie.url && typeof movie.url === 'string' && movie.url.toLowerCase() !== 'null' && movie.url.trim() !== '') ? movie.url : null;
        if (processed.url) { processed.url = processed.url.replace(/ /g, '%20');}
        processed.hubcloud_link = (movie.hubcloud_link && typeof movie.hubcloud_link === 'string' && movie.hubcloud_link.toLowerCase() !== 'null' && movie.hubcloud_link.trim() !== '') ? movie.hubcloud_link : null;
        processed.gdflix_link = (movie.gdflix_link && typeof movie.gdflix_link === 'string' && movie.gdflix_link.toLowerCase() !== 'null' && movie.gdflix_link.trim() !== '') ? movie.gdflix_link : null;
        processed.displayFilename = sanitize(movie.filename || '');
        processed.sizeData = extractSizeData(movie.size_display);
        if (!processed.size_bytes && processed.sizeData.bytes > 0) { processed.size_bytes = processed.sizeData.bytes; }
        processed.displayQuality = sanitize(movie.quality || extractQualityFromFilename(movie.filename) || 'N/A');
        if (processed.displayQuality && processed.displayQuality !== 'N/A') { uniqueQualities.add(processed.displayQuality); }
        const tsString = movie.last_updated_ts;
        let dateObject = null;
        if (tsString) { try { dateObject = new Date(tsString); } catch(e) { console.warn("Date parse error:", e); } }
        processed.lastUpdatedTimestamp = (dateObject && !isNaN(dateObject)) ? dateObject.getTime() : 0;
        processed.searchText = normalizeTextForSearch(`${processed.id || ''} ${processed.displayFilename}`);
        processed.isSeries = !!movie.is_series; // is_series from DB
        processed.extractedTitle = null; processed.extractedYear = null; processed.extractedSeason = null;
        // TMDB details will be attached to the GROUP, not individual files initially

        const filename = processed.displayFilename;
        if (filename) {
            let cleanedName = filename;
            const qualityTagsRegex = /(\b(4k|2160p|1080p|720p|480p|web-?dl|webrip|bluray|bdrip|brrip|hdtv|hdrip|dvdrip|dvdscr|hdcam|hc|tc|ts|cam|hdr|dv|dolby.?vision|hevc|x265)\b)/gi;
            cleanedName = cleanedName.replace(qualityTagsRegex, '');
            const seasonMatch = cleanedName.match(/[. (_-](S(\d{1,2}))(?:E\d{1,2}|[. (_-])/i) || cleanedName.match(/[. (_-](Season[. _]?(\d{1,2}))(?:[. (_]|$)/i);
            if (seasonMatch && (seasonMatch[2] || seasonMatch[3])) {
                processed.extractedSeason = parseInt(seasonMatch[2] || seasonMatch[3], 10);
                if (!processed.isSeries) processed.isSeries = true; // Infer if DB didn't mark it
                const titleEndIndex = seasonMatch.index;
                processed.extractedTitle = cleanedName.substring(0, titleEndIndex).replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
                const yearInTitleMatch = processed.extractedTitle.match(/[.(_[](\d{4})[.)_\]]$/);
                if(yearInTitleMatch && yearInTitleMatch[1]) {
                     const potentialYear = parseInt(yearInTitleMatch[1], 10);
                     if (potentialYear > 1900 && potentialYear < 2050) {
                         processed.extractedYear = potentialYear;
                         processed.extractedTitle = processed.extractedTitle.replace(new RegExp(`[.(_[]${potentialYear}[.)_\]]$`), '').trim();
                     }
                }
            } else {
                if (processed.isSeries && !seasonMatch) { // Is series but no season found, try to get title differently
                     processed.extractedTitle = cleanedName.split(/[\.({\[]/)[0].replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
                } else { // Not a season match, assume movie
                    // processed.isSeries = false; // Don't override if DB says it's a series
                    const yearMatch = cleanedName.match(/[.(_[](\d{4})[.)_\]]/);
                    if (yearMatch && yearMatch[1]) {
                        const year = parseInt(yearMatch[1], 10);
                        if (year > 1900 && year < 2050) {
                            processed.extractedYear = year;
                            const titleEndIndex = yearMatch.index;
                            processed.extractedTitle = cleanedName.substring(0, titleEndIndex).replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
                        }
                    }
                }
            }
            if (!processed.extractedTitle && cleanedName) {
                processed.extractedTitle = cleanedName.split(/[\.({\[]/)[0].replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
            }
            if (processed.extractedTitle) {
                processed.extractedTitle = processed.extractedTitle.replace(/[- ]+$/, '').trim();
                 if (/^\d{4}$/.test(processed.extractedTitle) && !processed.extractedYear) {
                    processed.extractedYear = parseInt(processed.extractedTitle, 10);
                    processed.extractedTitle = null;
                 } else if (/^\d{4}$/.test(processed.extractedTitle) && processed.extractedYear) {
                    processed.extractedTitle = cleanedName.split(/[\.({\[]/)[0].replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
                    if (/^\d{4}$/.test(processed.extractedTitle)) processed.extractedTitle = null;
                 }
            }
            if (!processed.extractedTitle && processed.isSeries) processed.extractedTitle = "Unknown Series";
            else if (!processed.extractedTitle && !processed.isSeries) processed.extractedTitle = "Unknown Movie";
        }
        // Generate a group key
        processed.groupKey = (processed.extractedTitle || 'UNTITLED').toUpperCase() +
                             '_' + (processed.extractedYear || 'NOYEAR') +
                             (processed.isSeries ? '_SERIES' : '_MOVIE') +
                             (processed.isSeries && processed.extractedSeason ? `_S${String(processed.extractedSeason).padStart(2, '0')}` : '');

        return processed;
    }

    function groupProcessedItems(processedFileItems) {
        if (!processedFileItems || processedFileItems.length === 0) return [];
        const groups = new Map();

        processedFileItems.forEach(file => {
            const key = file.groupKey;
            if (!groups.has(key)) {
                groups.set(key, {
                    groupKey: key,
                    representativeItem: file, // First file becomes representative
                    files: [file],
                    tmdbDetails: null, // To be fetched later
                    isSeries: file.isSeries,
                    extractedTitle: file.extractedTitle,
                    extractedYear: file.extractedYear,
                    extractedSeason: file.extractedSeason, // if applicable for series group
                    lastUpdatedTimestamp: file.lastUpdatedTimestamp // Max timestamp for sorting groups
                });
            } else {
                const group = groups.get(key);
                group.files.push(file);
                // Update representative item or group's lastUpdatedTimestamp if this file is newer
                if (file.lastUpdatedTimestamp > group.lastUpdatedTimestamp) {
                    group.lastUpdatedTimestamp = file.lastUpdatedTimestamp;
                    // Optionally update representative item if needed, e.g., to one with better metadata
                    // For now, just update timestamp for sorting
                }
            }
        });
        return Array.from(groups.values());
    }

    // --- HTML Generation ---

    // For displaying TMDb info of a MOVIE/SERIES GROUP in #group-info-area
    function createGroupTmdbHTML(groupData, tmdbDetails) {
        if (!groupData) return '<div class="status-message">Group data not found.</div>';

        const displayTitle = groupData.extractedTitle || "Unknown Title";
        let titleSuffix = "";
        if (groupData.isSeries) {
            titleSuffix = groupData.extractedSeason ? ` (Season ${groupData.extractedSeason})` : " (Series)";
        } else if (groupData.extractedYear) {
            titleSuffix = ` (${groupData.extractedYear})`;
        }

        let tmdbSectionHTML = '';
        if (tmdbDetails && tmdbDetails.id) {
            const posterHTML = tmdbDetails.posterPath ? `<img src="${sanitize(tmdbDetails.posterPath)}" alt="Poster for ${sanitize(tmdbDetails.title || displayTitle)}" class="tmdb-poster" loading="lazy">` : '<div class="tmdb-poster-placeholder">No Poster</div>';
            const ratingHTML = tmdbDetails.voteAverage && tmdbDetails.voteCount ? `<span class="tmdb-rating" title="${tmdbDetails.voteCount} votes">⭐ ${sanitize(tmdbDetails.voteAverage)}/10</span>` : '';
            const genresHTML = tmdbDetails.genres && tmdbDetails.genres.length > 0 ? `<div class="tmdb-genres"><strong>Genres:</strong> ${tmdbDetails.genres.map(g => `<span class="genre-tag">${sanitize(g)}</span>`).join(' ')}</div>` : '';
            const overviewHTML = tmdbDetails.overview ? `<div class="tmdb-overview"><strong>Overview:</strong><p>${sanitize(tmdbDetails.overview)}</p></div>` : '';
            const releaseDateHTML = tmdbDetails.releaseDate ? `<div><strong>Released:</strong> ${sanitize(TimeAgo.formatFullDate(new Date(tmdbDetails.releaseDate), true))}</div>` : '';
            const runtimeHTML = tmdbDetails.runtime ? `<div><strong>Runtime:</strong> ${sanitize(tmdbDetails.runtime)} min</div>` : '';
            const taglineHTML = tmdbDetails.tagline ? `<div class="tmdb-tagline"><em>${sanitize(tmdbDetails.tagline)}</em></div>` : '';
            const actorsHTML = tmdbDetails.actors && tmdbDetails.actors.length > 0 ? `<div class="tmdb-actors"><strong>Starring:</strong><ul>${tmdbDetails.actors.map(actor => `<li>${sanitize(actor.name)} (${sanitize(actor.character)})</li>`).join('')}</ul></div>` : '';

            let externalInfoButtonHTML = '';
             const infoIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"></path></svg>`;
            if (tmdbDetails.tmdbLink) {
                 const tmdbLabel = groupData.isSeries ? "View on TMDb (TV)" : "View on TMDb (Movie)";
                 externalInfoButtonHTML = `<a href="${sanitize(tmdbDetails.tmdbLink)}" target="_blank" rel="noopener noreferrer" class="button tmdb-link-button">${infoIconSVG} ${tmdbLabel}</a>`;
            }

            tmdbSectionHTML = `
                <div class="tmdb-details-container">
                    <div class="tmdb-poster-column">${posterHTML}</div>
                    <div class="tmdb-info-column">
                        <h2 class="tmdb-title">${sanitize(tmdbDetails.title || displayTitle)}${titleSuffix}</h2>
                        ${taglineHTML}
                        <div class="tmdb-meta">${ratingHTML}${releaseDateHTML}${runtimeHTML}</div>
                        ${genresHTML}
                        ${overviewHTML}
                        ${actorsHTML}
                        ${externalInfoButtonHTML ? `<div class="group-external-links" style="margin-top: 15px;">${externalInfoButtonHTML}</div>` : ''}
                    </div>
                </div>`;
        } else {
            tmdbSectionHTML = `<div class="tmdb-fetch-failed">Could not fetch additional details for ${sanitize(displayTitle)}${titleSuffix} from TMDb.</div>`;
        }
        return tmdbSectionHTML;
    }

    // For displaying list of FILES within a group in #group-files-list-container
    function createGroupFilesListHTML(filesArray, groupKey) {
        if (!filesArray || filesArray.length === 0) {
            return '<div class="status-message">No files found for this group.</div>';
        }
        let filesHTML = filesArray.map(file => {
            const displayFilename = file.displayFilename;
            const displaySize = file.sizeData.display;
            const displayQuality = file.displayQuality;
            const fileId = file.id; // This is original_id

            // Add CSS for .file-item-in-group, .file-item-name, .file-item-quality, .file-item-size
            return `
                <div class="file-item-in-group" data-file-id="${sanitize(fileId)}" data-group-key-ref="${sanitize(groupKey)}" role="button" tabindex="0" aria-label="Select file ${sanitize(displayFilename)}">
                    <span class="file-item-name">${sanitize(displayFilename)}</span>
                    <span class="file-item-details">
                        <span class="file-item-quality">${sanitize(displayQuality)}</span>
                        <span class="file-item-size">${sanitize(displaySize)}</span>
                    </span>
                </div>
            `;
        }).join('');
        return filesHTML;
    }


    // For displaying action buttons for a SELECTED FILE in #item-detail-content
    function createItemDetailContentHTML(selectedFile, groupTmdbDetails) { // Takes a single FILE object and group's TMDb
        if (!selectedFile) return '<div class="status-message">No file selected.</div>';

        const movie = selectedFile; // Alias for clarity, as this function was originally for a single movie object
        const displayFilename = movie.displayFilename;
        const displaySize = movie.sizeData.display;
        const displayQuality = movie.displayQuality;
        // Use group's title for context if file's own extracted title is poor
        const streamTitle = (movie.extractedTitle || groupTmdbDetails?.title || displayFilename.split(/[\.\(\[]/)[0].replace(/[_ ]+/g, ' ').trim()) + (displayQuality !== 'N/A' ? ` (${displayQuality})` : '');
        const timestampString = movie.last_updated_ts;
        const formattedDateRelative = TimeAgo.format(timestampString);
        const dateObject = timestampString ? new Date(timestampString) : null;
        const formattedDateFull = (dateObject && !isNaN(dateObject)) ? TimeAgo.formatFullDate(dateObject) : 'N/A';

        let hdrLogoHtml = ''; let fourkLogoHtml = '';
        const lowerFilename = (displayFilename || '').toLowerCase();
        if (displayQuality === '4K' || lowerFilename.includes('2160p') || lowerFilename.includes('.4k.')) { fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo fourk-logo" title="4K Ultra HD" />`; }
        if ((displayQuality || '').includes('HDR') || (displayQuality || '').includes('DOLBY VISION') || displayQuality === 'DV' || lowerFilename.includes('hdr') || lowerFilename.includes('dolby.vision') || lowerFilename.includes('.dv.')) { hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo hdr-logo" title="HDR / Dolby Vision Content" />`; }

        const escapedStreamTitle = streamTitle.replace(/'/g, "\\'");
        const escapedFilename = displayFilename.replace(/'/g, "\\'");
        const escapedUrl = movie.url ? movie.url.replace(/'/g, "\\'") : '';
        const escapedFileId = movie.id ? String(movie.id).replace(/[^a-zA-Z0-9-_]/g, '') : ''; // File's original_id
        const escapedHubcloudUrl = movie.hubcloud_link ? movie.hubcloud_link.replace(/'/g, "\\'") : '';
        const escapedGdflixUrl = movie.gdflix_link ? movie.gdflix_link.replace(/'/g, "\\'") : '';

        let youtubeTrailerButtonHTML = '';
        // YouTube search based on group's info for better trailer results
        if (currentViewGroupData && currentViewGroupData.extractedTitle) {
            let ytSearchTerms = [currentViewGroupData.extractedTitle];
            if (currentViewGroupData.isSeries && currentViewGroupData.extractedSeason) { ytSearchTerms.push(`Season ${currentViewGroupData.extractedSeason}`); }
            else if (!currentViewGroupData.isSeries && currentViewGroupData.extractedYear) { ytSearchTerms.push(String(currentViewGroupData.extractedYear)); }
            ytSearchTerms.push("Official Trailer");
            const includesHindi = (movie.languages || '').toLowerCase().includes('hindi'); // Use file's lang
            if (includesHindi) { ytSearchTerms.push("Hindi"); }
            const youtubeSearchQuery = encodeURIComponent(ytSearchTerms.join(' '));
            const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${youtubeSearchQuery}`;
            const youtubeIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M21.582,6.186c-0.23-0.86-0.908-1.538-1.768-1.768C18.267,4,12,4,12,4S5.733,4,4.186,4.418 c-0.86,0.23-1.538,0.908-1.768,1.768C2,7.734,2,12,2,12s0,4.266,0.418,5.814c0.23,0.86,0.908,1.538,1.768,1.768 C5.733,20,12,20,12,20s6.267,0,7.814-0.418c0.861-0.23,1.538-0.908,1.768-1.768C22,16.266,22,12,22,12S22,7.734,21.582,6.186z M10,15.464V8.536L16,12L10,15.464z"></path></svg>`;
            youtubeTrailerButtonHTML = `<a href="${youtubeSearchUrl}" target="_blank" rel="noopener noreferrer" class="button youtube-button">${youtubeIconSVG} Watch Trailer</a>`;
        }


        let urlDependentButtonsHTML = '';
        let bypassButtonsHTML = '';
        let otherLinkButtonsHTML = '';

        if (movie.url) {
            urlDependentButtonsHTML += `<button class="button play-button" data-action="play" data-title="${escapedStreamTitle}" data-url="${escapedUrl}" data-filename="${escapedFilename}" data-file-id="${escapedFileId}"><span aria-hidden="true">▶️</span> Play here</button>`;
            urlDependentButtonsHTML += `<a class="button download-button" href="${movie.url}" download="${displayFilename}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">💾</span> Direct Download</a>`;
            urlDependentButtonsHTML += `<button class="button vlc-button" data-action="copy-vlc" data-url="${escapedUrl}" data-file-id="${escapedFileId}"><span aria-hidden="true">📋</span> Copy URL (for VLC/MX)</button><span class="copy-feedback" role="status" aria-live="polite">Copied!</span>`;
            if (navigator.userAgent.toLowerCase().includes("android")) {
                urlDependentButtonsHTML += `<button class="button intent-button" data-action="open-intent" data-url="${escapedUrl}" data-file-id="${escapedFileId}"><span aria-hidden="true">📱</span> Play in VLC or MX Player</button>`;
            }
        }

        const movieRefAttr = `data-file-id="${escapedFileId}"`; // Reference the specific file for bypass context
        if (movie.hubcloud_link) { bypassButtonsHTML += `<button class="button hubcloud-bypass-button" data-action="bypass-hubcloud" data-hubcloud-url="${escapedHubcloudUrl}" ${movieRefAttr}><span aria-hidden="true" class="button-icon">☁️</span><span class="button-spinner spinner"></span><span class="button-text">Bypass HubCloud</span></button><span class="bypass-feedback" role="status" aria-live="polite"></span>`; }
        if (movie.gdflix_link) { bypassButtonsHTML += `<button class="button gdflix-bypass-button" data-action="bypass-gdflix" data-gdflix-url="${escapedGdflixUrl}" ${movieRefAttr}><span aria-hidden="true" class="button-icon">🎬</span><span class="button-spinner spinner"></span><span class="button-text">Bypass GDFLIX</span></button><span class="bypass-feedback" role="status" aria-live="polite"></span>`; }

        otherLinkButtonsHTML += youtubeTrailerButtonHTML; // This is based on group info
        // External Info (IMDb/TMDb) button is part of createGroupTmdbHTML, not repeated per file.

        otherLinkButtonsHTML += `<button class="button custom-url-toggle-button" data-action="toggle-custom-url" aria-expanded="false" style="display: none;"><span aria-hidden="true">🔗</span> Play Custom URL</button>`;

        if (movie.telegram_link) { otherLinkButtonsHTML += `<a class="button telegram-button" href="${sanitize(movie.telegram_link)}" target="_blank" rel="noopener noreferrer">Telegram File</a>`; }
        // Direct links if bypass buttons are not rendered (e.g., no bypass needed for this file type)
        if (movie.gdflix_link && !bypassButtonsHTML.includes('gdflix-bypass-button')) { otherLinkButtonsHTML += `<a class="button gdflix-button" href="${sanitize(movie.gdflix_link)}" target="_blank" rel="noopener noreferrer">GDFLIX Link</a>`; }
        if (movie.hubcloud_link && !bypassButtonsHTML.includes('hubcloud-bypass-button')) { otherLinkButtonsHTML += `<a class="button hubcloud-button" href="${sanitize(movie.hubcloud_link)}" target="_blank" rel="noopener noreferrer">HubCloud Link</a>`; }
        if (movie.filepress_link) otherLinkButtonsHTML += `<a class="button filepress-button" href="${sanitize(movie.filepress_link)}" target="_blank" rel="noopener noreferrer">Filepress</a>`;
        if (movie.gdtot_link) otherLinkButtonsHTML += `<a class="button gdtot-button" href="${sanitize(movie.gdtot_link)}" target="_blank" rel="noopener noreferrer">GDToT</a>`;

        // Share button now shares the GROUP, not the individual file
        if (currentViewGroupData && currentViewGroupData.groupKey) {
            const groupShareTitle = currentViewGroupData.extractedTitle || "Content Group";
            otherLinkButtonsHTML += `<button class="button share-button" data-action="share-group" data-group-key="${sanitize(currentViewGroupData.groupKey)}" data-group-title="${sanitize(groupShareTitle)}"><span aria-hidden="true">🔗</span> Share This Movie/Series</button><span class="copy-feedback share-fallback" role="status" aria-live="polite">Link copied!</span>`;
        }


        const internalInfoHTML = `<div class="action-info" data-stream-title="${escapedStreamTitle}"><span class="info-item"><strong>Filename:</strong> ${displayFilename}</span><span class="info-item"><strong>Quality:</strong> ${displayQuality} ${fourkLogoHtml}${hdrLogoHtml}</span><span class="info-item"><strong>Size:</strong> ${displaySize}</span><span class="info-item"><strong>Language:</strong> ${sanitize(movie.languages || 'N/A')}</span><span class="info-item"><strong>Updated:</strong> ${formattedDateFull} (${formattedDateRelative})</span>${movie.originalFilename ? `<span class="info-item"><strong>Original Name:</strong> ${sanitize(movie.originalFilename)}</span>` : ''}</div>`;
        const buttonsHTML = `<div class="action-buttons-container">${urlDependentButtonsHTML}${bypassButtonsHTML}${otherLinkButtonsHTML}</div>`;
        return `${internalInfoHTML}${buttonsHTML}`;
    }


    // --- Grid Item HTML Generation (for GROUPED items) & Fallback Logic ---
    function setupFallbackDisplay(groupData, posterContainer) { // Takes GROUP data
        if (!groupData || !posterContainer) return;
        const img = posterContainer.querySelector('.poster-image');
        const fallbackContent = posterContainer.querySelector('.poster-fallback-content');
        if (!fallbackContent) return;

        const titleEl = fallbackContent.querySelector('.fallback-title');
        const yearEl = fallbackContent.querySelector('.fallback-year');

        if (img) img.style.display = 'none';

        let titleText = groupData.extractedTitle || "Unknown Title";
        if (groupData.isSeries && groupData.representativeItem?.extractedSeason && !titleText.toLowerCase().includes("season")) {
             // Add season to title for series if not already there and representativeItem has it
             // titleText += ` (S${groupData.representativeItem.extractedSeason})`;
        }
        if (titleEl) titleEl.textContent = titleText;

        let yearTextContent = '';
        if (groupData.extractedYear) {
            yearTextContent = String(groupData.extractedYear);
        } else if (groupData.isSeries && groupData.representativeItem?.extractedSeason) {
            yearTextContent = `Season ${groupData.representativeItem.extractedSeason}`;
        }
        if (yearEl) yearEl.textContent = yearTextContent;

        fallbackContent.style.display = 'flex';
    }

    function createMovieGridItemHTML(groupData) { // Takes a GROUP object
        const card = document.createElement('div');
        card.className = (updatesPreviewList && updatesPreviewList.contains(event?.target?.closest('.update-item'))) ? 'update-item' : 'grid-item';

        card.dataset.groupKey = sanitize(groupData.groupKey); // Use groupKey for navigation
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        const baseTitleForAria = groupData.extractedTitle || "Unknown Content";
        card.setAttribute('aria-label', `View details for ${sanitize(baseTitleForAria)}`);

        let fourkLogoHtml = '';
        let hdrLogoHtml = '';
        // Check quality badges based on files within the group
        const has4K = groupData.files.some(file => (file.displayQuality === '4K' || (file.displayFilename || '').toLowerCase().includes('2160p') || (file.displayFilename || '').toLowerCase().includes('.4k.')));
        const hasHDR = groupData.files.some(file => ((file.displayQuality || '').includes('HDR') || (file.displayQuality || '').includes('DOLBY VISION') || file.displayQuality === 'DV' || (file.displayFilename || '').toLowerCase().includes('hdr') || (file.displayFilename || '').toLowerCase().includes('dolby.vision') || (file.displayFilename || '').toLowerCase().includes('.dv.')));

        if (has4K) {
            fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo-badge fourk-logo-badge" title="4K Ultra HD Content Available" />`;
        }
        if (hasHDR) {
            hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo-badge hdr-logo-badge" title="HDR / Dolby Vision Content Available" />`;
        }

        const canAttemptPosterFetch = !!groupData.extractedTitle;
        // Check groupData.tmdbDetails for poster path fetched status
        const initialSpinnerDisplay = (canAttemptPosterFetch && !groupData.tmdbDetails?.posterPathFetched && !groupData.tmdbDetails?.posterPathFetchFailed) ? 'block' : 'none';

        card.innerHTML = `
            <div class="poster-container">
                <img src="${config.POSTER_PLACEHOLDER_URL}" alt="Poster for ${sanitize(baseTitleForAria)}" class="poster-image" loading="lazy">
                <div class="poster-fallback-content" style="display: none;">
                    <h3 class="fallback-title"></h3>
                    <p class="fallback-year"></p>
                </div>
                <div class="poster-spinner spinner" style="display: ${initialSpinnerDisplay};"></div>
                <div class="quality-badges-overlay">${fourkLogoHtml}${hdrLogoHtml}</div>
            </div>
        `;

        const posterContainer = card.querySelector('.poster-container');
        const imgElement = posterContainer.querySelector('.poster-image');
        const spinnerElement = posterContainer.querySelector('.poster-spinner');

        imgElement.onerror = function() {
            this.style.display = 'none';
            const parentPosterContainer = this.closest('.poster-container');
            if (groupData && parentPosterContainer) {
                setupFallbackDisplay(groupData, parentPosterContainer);
            }
            const localSpinner = parentPosterContainer ? parentPosterContainer.querySelector('.poster-spinner') : null;
            if (localSpinner) localSpinner.style.display = 'none';
        };

        if (groupData.tmdbDetails?.posterPath) {
            imgElement.src = groupData.tmdbDetails.posterPath;
            if (spinnerElement) spinnerElement.style.display = 'none';
        } else if (canAttemptPosterFetch && !groupData.tmdbDetails?.posterPathFetched && !groupData.tmdbDetails?.posterPathFetchFailed) {
            fetchPosterForGroup(groupData, imgElement, spinnerElement, posterContainer); // Changed function name
        } else {
            setupFallbackDisplay(groupData, posterContainer);
            if (spinnerElement) spinnerElement.style.display = 'none';
        }
        return card;
    }

    async function fetchPosterForGroup(groupData, imgElement, spinnerElement, posterContainerElement) { // Takes GROUP data
        if (!imgElement || !posterContainerElement) {
            console.warn("fetchPosterForGroup called with invalid elements for group:", groupData?.extractedTitle);
            if (spinnerElement) spinnerElement.style.display = 'none';
            if (groupData && posterContainerElement) setupFallbackDisplay(groupData, posterContainerElement);
            return;
        }
        const fallbackContentElement = posterContainerElement.querySelector('.poster-fallback-content');

        if (!groupData || !groupData.extractedTitle || groupData.tmdbDetails?.posterPathFetched || groupData.tmdbDetails?.posterPathFetchFailed) {
            if (spinnerElement) spinnerElement.style.display = 'none';
            if (groupData?.tmdbDetails?.posterPath) {
                if (imgElement.src !== groupData.tmdbDetails.posterPath) imgElement.src = groupData.tmdbDetails.posterPath;
                imgElement.style.display = 'block';
                if (fallbackContentElement) fallbackContentElement.style.display = 'none';
            } else {
                setupFallbackDisplay(groupData, posterContainerElement);
            }
            return;
        }

        if (spinnerElement) spinnerElement.style.display = 'block';
        imgElement.style.display = 'block';
        if (fallbackContentElement) fallbackContentElement.style.display = 'none';

        try {
            const tmdbQuery = new URLSearchParams();
            tmdbQuery.set('query', groupData.extractedTitle);
            tmdbQuery.set('type', groupData.isSeries ? 'tv' : 'movie');
            if (!groupData.isSeries && groupData.extractedYear) {
                tmdbQuery.set('year', groupData.extractedYear);
            }
            // Don't fetch full details here, only poster for grid
            // tmdbQuery.set('fetchFullDetails', 'false'); // Optional explicit param for API
            const tmdbUrl = `${config.TMDB_API_PROXY_URL}?${tmdbQuery.toString()}`;
            const tmdbController = new AbortController();
            const tmdbTimeoutId = setTimeout(() => tmdbController.abort(), config.TMDB_FETCH_TIMEOUT);

            const tmdbResponse = await fetch(tmdbUrl, { signal: tmdbController.signal });
            clearTimeout(tmdbTimeoutId);

            if (!groupData.tmdbDetails) groupData.tmdbDetails = {};

            if (tmdbResponse.ok) {
                const fetchedTmdbData = await tmdbResponse.json();
                if (fetchedTmdbData && fetchedTmdbData.posterPath) {
                    imgElement.src = fetchedTmdbData.posterPath;
                    imgElement.style.display = 'block';
                    if (fallbackContentElement) fallbackContentElement.style.display = 'none';
                    groupData.tmdbDetails.posterPath = fetchedTmdbData.posterPath;
                    // groupData.tmdbDetails.title = fetchedTmdbData.title; // Use group's own title for consistency in grid
                } else {
                    setupFallbackDisplay(groupData, posterContainerElement);
                    groupData.tmdbDetails.posterPathFetchFailed = true;
                }
            } else {
                setupFallbackDisplay(groupData, posterContainerElement);
                groupData.tmdbDetails.posterPathFetchFailed = true;
            }
            groupData.tmdbDetails.posterPathFetched = true;
        } catch (tmdbError) {
            if (tmdbError.name !== 'AbortError') {
                console.error(`Error fetching TMDb poster for group "${groupData.extractedTitle}":`, tmdbError);
            }
            setupFallbackDisplay(groupData, posterContainerElement);
            if (!groupData.tmdbDetails) groupData.tmdbDetails = {};
            groupData.tmdbDetails.posterPathFetchFailed = true;
            groupData.tmdbDetails.posterPathFetched = true;
        } finally {
            if (spinnerElement) spinnerElement.style.display = 'none';
        }
    }


    // --- View Control ---
    function setViewMode(mode) {
        console.log(`Setting view mode to: ${mode}`);
        const previousMode = currentViewMode;
        currentViewMode = mode;
        if (mode !== previousMode) { closePlayerIfNeeded(null); }

        container.classList.toggle('results-active', mode === 'search');
        container.classList.toggle('item-detail-active', mode === 'groupDetail'); // Use 'groupDetail'

        const showHomepage = mode === 'homepage';
        const showSearch = mode === 'search';
        const showGroupDetail = mode === 'groupDetail';

        if (searchFocusArea) searchFocusArea.style.display = (showHomepage || showSearch) ? 'flex' : 'none';
        if (resultsArea) resultsArea.style.display = showSearch ? 'block' : 'none';
        if (itemDetailView) itemDetailView.style.display = showGroupDetail ? 'block' : 'none';
        if (updatesPreviewSection) updatesPreviewSection.style.display = showHomepage ? 'block' : 'none';
        if (pageFooter) pageFooter.style.display = (showHomepage || showSearch) ? 'flex' : 'none';

        if (showHomepage) {
            if (searchInput) searchInput.value = '';
            currentState.searchTerm = '';
            currentState.currentGroupKey = null;
            currentState.currentSelectedFileId = null;
            currentViewGroupData = null;
            currentItemDetailData = null;
            if (suggestionsContainer) suggestionsContainer.style.display = 'none';
            activeResultsTab = 'allFiles'; currentState.currentPage = 1; currentState.typeFilter = '';
            if (weeklyGroupedUpdatesData.length > 0) { displayInitialUpdates(); }
            else if (localGroupedSuggestionData.length > 0) {
                 if (updatesPreviewList) updatesPreviewList.innerHTML = '<div class="status-message grid-status-message">No recent updates found.</div>';
                 if (showMoreUpdatesButton) showMoreUpdatesButton.style.display = 'none';
            } else {
                if (updatesPreviewList) updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`;
            }
            document.title = "Cinema Ghar Index";
        } else if (showGroupDetail) {
            if (searchFocusArea) searchFocusArea.style.display = 'none';
            if (resultsArea) resultsArea.style.display = 'none';
            if (updatesPreviewSection) updatesPreviewSection.style.display = 'none';
            if (pageFooter) pageFooter.style.display = 'none';
            // Back button visibility handled in displayGroupDetailView
        }
        if (!isInitialLoad) { saveStateToLocalStorage(); }
    }

    window.resetToHomepage = function(event) {
        if (window.history.pushState) { const cleanUrl = window.location.origin + window.location.pathname; if (window.location.search !== '') { window.history.pushState({ path: cleanUrl }, '', cleanUrl); } }
        currentViewGroupData = null; currentItemDetailData = null; isShareMode = false;
        currentState.currentGroupKey = null; currentState.currentSelectedFileId = null;
        if (groupDetailAbortController) { groupDetailAbortController.abort(); groupDetailAbortController = null; }
        lastFocusedElement = event?.target;
        setViewMode('homepage');
        if (searchInput) { setTimeout(() => searchInput.focus(), 100); }
    }

    window.handleBackFromDetailView = function() {
        // If a specific file's actions are shown, go back to the group's file list
        if (selectedFileActionsWrapper && selectedFileActionsWrapper.style.display !== 'none') {
            selectedFileActionsWrapper.style.display = 'none';
            if (itemDetailContent) itemDetailContent.innerHTML = `<div class="status-message">Select a file from the list above.</div>`;
            currentItemDetailData = null;
            currentState.currentSelectedFileId = null;
            if(backToResultsOrGroupListButton) backToResultsOrGroupListButton.textContent = '← Back to Results';
            document.title = `${currentViewGroupData?.extractedTitle || 'Group Details'} - Cinema Ghar`;
            if (groupFilesListContainer) {
                const firstFileItem = groupFilesListContainer.querySelector('.file-item-in-group');
                if (firstFileItem) setTimeout(() => firstFileItem.focus(), 50);
                else groupFilesListContainer.focus();
            }
            saveStateToLocalStorage(); // Save that no file is selected
            // Update URL to remove fileId if it was there
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('fileId')) {
                urlParams.delete('fileId');
                const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
                history.replaceState(null, '', newUrl); // Use replaceState to not add to history
            }

        } else { // Otherwise, go back from group view to search results or homepage
            history.back(); // This should trigger popstate and handleUrlChange
        }
    }

    window.addEventListener('popstate', (event) => { handleUrlChange(true); });

    function handleUrlChange(isPopState = false) {
        if (groupDetailAbortController) { groupDetailAbortController.abort(); groupDetailAbortController = null; }
        const urlParams = new URLSearchParams(window.location.search);
        const groupKey = urlParams.get('groupKey') || urlParams.get('viewGroup'); // support old 'viewId' as groupKey for a bit
        const fileId = urlParams.get('fileId'); // For restoring selected file within a group

        if (groupKey) {
            // If already on this group, and only fileId changed (or removed)
            if (currentViewMode === 'groupDetail' && currentState.currentGroupKey === groupKey) {
                if (fileId && currentState.currentSelectedFileId !== fileId) {
                    handleFileSelectionInGroup(fileId, true); // true for isRestoringFromUrl
                } else if (!fileId && currentState.currentSelectedFileId) {
                    // FileId removed from URL, deselect file
                    if (selectedFileActionsWrapper) selectedFileActionsWrapper.style.display = 'none';
                    if (itemDetailContent) itemDetailContent.innerHTML = `<div class="status-message">Select a file.</div>`;
                    currentItemDetailData = null;
                    currentState.currentSelectedFileId = null;
                    if(backToResultsOrGroupListButton) backToResultsOrGroupListButton.textContent = '← Back to Results';
                }
                return; // Already displaying the correct group, minor adjustment made
            }
            // If not on this group, display it
            displayGroupDetailView(groupKey, urlParams.has('shareGroup'), fileId); // Pass fileId for potential auto-selection
        } else { // No groupKey
            currentViewGroupData = null; currentItemDetailData = null;
            currentState.currentGroupKey = null; currentState.currentSelectedFileId = null;

            if (currentViewMode === 'groupDetail') { // Was on group detail, now going back
                if (isPopState && currentState.searchTerm && previousStateBeforeDetailWasSearch()) {
                    setViewMode('search');
                    fetchAndRenderResults();
                } else {
                    setViewMode('homepage');
                }
            } else if (currentViewMode === 'search' && !currentState.searchTerm && isPopState) {
                 setViewMode('homepage');
            } else if (currentViewMode !== 'homepage' && (isInitialLoad || !isPopState || !currentState.searchTerm) ) {
                 setViewMode('homepage');
            } else if (currentViewMode === 'search' && currentState.searchTerm) {
                setViewMode('search');
                fetchAndRenderResults();
            }
        }
    }

    function previousStateBeforeDetailWasSearch() {
        return !!currentState.searchTerm;
    }


    // --- Search and Suggestions Logic ---
    function handleSearchInput() { clearTimeout(suggestionDebounceTimeout); const searchTerm = searchInput.value.trim(); if (searchTerm.length < 2) { suggestionsContainer.style.display = 'none'; return; } suggestionDebounceTimeout = setTimeout(() => { fetchAndDisplaySuggestions(searchTerm); }, config.SUGGESTIONS_DEBOUNCE_DELAY); }
    function fetchAndDisplaySuggestions(term) {
        const normalizedTerm = normalizeTextForSearch(term);
        if (!normalizedTerm) { suggestionsContainer.style.display = 'none'; return; }

        let matchingItems = [];
        // Search within files of each group in localGroupedSuggestionData
        localGroupedSuggestionData.forEach(group => {
            group.files.forEach(file => {
                if (file.searchText.includes(normalizedTerm)) {
                    // Add the file's display name, but associate with group for potential context
                    matchingItems.push({
                        displayText: file.displayFilename, // Show filename in suggestion
                        groupKey: group.groupKey,       // To potentially navigate to group later
                        groupTitle: group.extractedTitle || "Group"
                    });
                }
            });
        });
        matchingItems = matchingItems.slice(0, config.MAX_SUGGESTIONS);

        suggestionsContainer.innerHTML = '';
        if (matchingItems.length > 0) {
            const fragment = document.createDocumentFragment();
            matchingItems.forEach(item => {
                const div = document.createElement('div');
                let displayText = item.displayText;
                let highlighted = false;
                if (term.length > 0) { try { const safeTerm = escapeRegExp(term); const regex = new RegExp(`(${safeTerm})`, 'i'); if (displayText.match(regex)) { div.innerHTML = displayText.replace(regex, `<strong>$1</strong> (<em>${sanitize(item.groupTitle)}</em>)`); highlighted = true; } } catch (e) { console.warn("Regex error for highlight:", e); } }
                if (!highlighted) { div.textContent = `${displayText} (${sanitize(item.groupTitle)})`; }
                div.title = `${item.displayText} - from ${item.groupTitle}`;
                div.onclick = () => selectSuggestion(item.displayText); // On select, standard search happens
                fragment.appendChild(div);
            });
            suggestionsContainer.appendChild(fragment);
            suggestionsContainer.style.display = 'block';
        } else {
            suggestionsContainer.style.display = 'none';
        }
    }
    function selectSuggestion(selectedValue) { searchInput.value = selectedValue; suggestionsContainer.style.display = 'none'; handleSearchSubmit(); }

    window.handleSearchSubmit = function() {
        if (suggestionsContainer) { suggestionsContainer.style.display = 'none'; }
        const searchTerm = searchInput.value.trim();
        if (searchInput) { searchInput.blur(); }
        if (searchTerm.length === 0 && currentViewMode !== 'homepage') { resetToHomepage(); return; }
        if (searchTerm.length === 0 && currentViewMode === 'homepage') { return; }

        if (currentViewMode === 'groupDetail') {
            if (groupDetailAbortController) { groupDetailAbortController.abort(); groupDetailAbortController = null; }
            currentViewGroupData = null; currentItemDetailData = null; currentState.currentGroupKey = null; currentState.currentSelectedFileId = null;
            const cleanUrl = window.location.origin + window.location.pathname;
            if (window.location.search !== '') { history.pushState({ path: cleanUrl }, '', cleanUrl); }
        }

        setViewMode('search');
        activeResultsTab = 'allFiles'; // Default to all content
        currentState.currentPage = 1;
        currentState.searchTerm = searchTerm;
        currentState.qualityFilter = qualityFilterSelect.value || '';
        currentState.typeFilter = ''; // Reset type filter on new search, tab will set it
        updateActiveTabAndPanel();
        showLoadingStateInGrids(`Searching for "${sanitize(searchTerm)}"...`);
        fetchAndRenderResults();
    }
    function handleSearchClear() { clearTimeout(suggestionDebounceTimeout); suggestionsContainer.style.display = 'none'; setTimeout(() => { if (searchInput.value.trim() === '') { if (currentViewMode === 'search') { resetToHomepage(); } else { currentState.searchTerm = ''; saveStateToLocalStorage(); } } }, 100); }
    function showLoadingStateInGrids(message = 'Loading...') {
        const loadingHTML = `<div class="loading-message grid-status-message"><div class="spinner"></div>${sanitize(message)}</div>`;
        Object.values(tabMappings).forEach(mapping => {
            if (mapping?.gridContainer) {
                mapping.gridContainer.innerHTML = loadingHTML;
            }
            if (mapping?.pagination) {
                mapping.pagination.style.display = 'none';
            }
        });
    }

    // --- Updates Preview Logic (Shows Grouped Posters) ---
    async function loadUpdatesPreview() {
        if (currentViewMode !== 'homepage' || !updatesPreviewList || !showMoreUpdatesButton) return;
        updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`;
        showMoreUpdatesButton.style.display = 'none';
        updatesPreviewShownCount = 0;
        weeklyGroupedUpdatesData = [];
        try {
            // Fetch more individual files to ensure enough groups are formed
            const params = { sort: 'lastUpdated', sortDir: 'desc', limit: (config.UPDATES_PREVIEW_INITIAL_COUNT + config.UPDATES_PREVIEW_LOAD_MORE_COUNT) * 5, page: 1 }; // Fetch 5x files per group approx.
            const data = await fetchApiData(params);
            if (data && data.items && data.items.length > 0) {
                const processedFiles = data.items.map(preprocessMovieData);
                weeklyGroupedUpdatesData = groupProcessedItems(processedFiles)
                    .sort((a, b) => b.lastUpdatedTimestamp - a.lastUpdatedTimestamp); // Sort groups by newest file
                displayInitialUpdates();
            } else {
                updatesPreviewList.innerHTML = '<div class="status-message grid-status-message">No recent updates found.</div>';
                showMoreUpdatesButton.style.display = 'none';
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                updatesPreviewList.innerHTML = `<div class="error-message grid-status-message">Could not load updates. ${error.message}</div>`;
            }
            showMoreUpdatesButton.style.display = 'none';
        }
    }
    function displayInitialUpdates() {
        if (!updatesPreviewList || !showMoreUpdatesButton) return;
        updatesPreviewList.innerHTML = '';
        updatesPreviewShownCount = 0;
        if (weeklyGroupedUpdatesData.length === 0) {
            updatesPreviewList.innerHTML = '<div class="status-message grid-status-message">No recent updates found.</div>';
            showMoreUpdatesButton.style.display = 'none';
            return;
        }
        const initialCount = Math.min(weeklyGroupedUpdatesData.length, config.UPDATES_PREVIEW_INITIAL_COUNT);
        appendUpdatesToPreview(0, initialCount);
        updatesPreviewShownCount = initialCount;
        const potentiallyMore = weeklyGroupedUpdatesData.length > initialCount;
        if (potentiallyMore) {
            showMoreUpdatesButton.style.display = 'block';
            showMoreUpdatesButton.disabled = false;
            showMoreUpdatesButton.textContent = "Show More";
        } else {
            showMoreUpdatesButton.style.display = 'none';
        }
    }
    window.appendMoreUpdates = async function() {
        if (!updatesPreviewList || !showMoreUpdatesButton) return;
        showMoreUpdatesButton.disabled = true;
        showMoreUpdatesButton.textContent = "Loading...";
        const itemsToLoad = weeklyGroupedUpdatesData.slice(updatesPreviewShownCount, updatesPreviewShownCount + config.UPDATES_PREVIEW_LOAD_MORE_COUNT);
        if (itemsToLoad.length > 0) {
            appendUpdatesToPreview(updatesPreviewShownCount, updatesPreviewShownCount + itemsToLoad.length);
            updatesPreviewShownCount += itemsToLoad.length;
            const hasMoreAfterThis = weeklyGroupedUpdatesData.length > updatesPreviewShownCount;
            if (hasMoreAfterThis) {
                showMoreUpdatesButton.disabled = false;
                showMoreUpdatesButton.textContent = "Show More";
            } else {
                showMoreUpdatesButton.textContent = "All Updates Shown";
                showMoreUpdatesButton.disabled = true;
            }
        } else {
            showMoreUpdatesButton.textContent = "No More Updates";
            showMoreUpdatesButton.disabled = true;
        }
    }
    function appendUpdatesToPreview(startIndex, endIndex) { // Appends GROUPED items
        if (!updatesPreviewList) return;
        const fragment = document.createDocumentFragment();
        const groupsToAppend = weeklyGroupedUpdatesData.slice(startIndex, endIndex);

        groupsToAppend.forEach((group) => {
            if (!group || !group.groupKey) return;
            const gridItemElement = createMovieGridItemHTML(group); // Renders a group poster
            fragment.appendChild(gridItemElement);
        });

        const initialLoader = updatesPreviewList.querySelector('.loading-inline-spinner');
        if (initialLoader && startIndex === 0) { initialLoader.remove(); }
        updatesPreviewList.appendChild(fragment);
    }

    // --- Filtering, Sorting (Applies to Groups) ---
    function triggerFilterChange() { if (!qualityFilterSelect || currentViewMode !== 'search') return; const newQualityFilter = qualityFilterSelect.value; if (newQualityFilter !== currentState.qualityFilter) { currentState.qualityFilter = newQualityFilter; currentState.currentPage = 1; closePlayerIfNeeded(null); showLoadingStateInGrids(`Applying filter: ${sanitize(newQualityFilter || 'All Qualities')}...`); fetchAndRenderResults(); } }
    // Sorting logic would need to define how groups are sorted (e.g., by representativeItem's properties or newest file)
    // For now, server-side sort applies to files, then client-side grouping and group sort by lastUpdatedTimestamp.

    // --- Rendering Logic (For Search Results - Grouped Posters) ---
    function renderActiveResultsView(groupedApiResponse) { // Expects already grouped data
         if (currentViewMode !== 'search' || !tabMappings[activeResultsTab]) {
             if (currentViewMode === 'search') { showLoadingStateInGrids('Enter search term above.'); }
             return;
         }
         const { gridContainer, pagination } = tabMappings[activeResultsTab];
         if (!gridContainer || !pagination) { console.error("Missing grid container or pagination for tab:", activeResultsTab); return; }

         // groupedApiResponse should now be an object like: { groups: [], totalGroups: X, page: Y, totalPages: Z }
         // Or, if pagination is still based on files, we adjust here.
         // For simplicity, let's assume pagination is per group page for now if the grouping happens before pagination.
         // But API gives file pagination. So we fetch many files, group, then paginate groups client-side.

         const itemsToRender = groupedApiResponse.groupsToDisplay || []; // Groups for the current page
         const totalGroups = groupedApiResponse.totalGroups || 0;
         const currentPage = groupedApiResponse.currentPageForGroups || 1;
         const totalPagesForGroups = groupedApiResponse.totalPagesForGroups || 1;

         currentGroupedSearchResultsData = groupedApiResponse.allFilteredGroups || []; // Store all groups for current search/filter

         gridContainer.innerHTML = '';
         const fragment = document.createDocumentFragment();

         if (totalGroups === 0) {
             let message = `No ${tabMappings[activeResultsTab].typeFilter || 'content'} found`;
             if (currentState.searchTerm) message += ` matching "${sanitize(currentState.searchTerm)}"`;
             if (currentState.qualityFilter) message += ` with quality "${sanitize(currentState.qualityFilter)}"`;
             message += '.';
             gridContainer.innerHTML = `<div class="status-message grid-status-message">${message}</div>`;
         } else {
             itemsToRender.forEach((group) => {
                 const gridItemElement = createMovieGridItemHTML(group); // Renders a group poster
                 fragment.appendChild(gridItemElement);
             });
             gridContainer.appendChild(fragment);
         }
         renderPaginationControls(pagination, totalGroups, currentPage, totalPagesForGroups, 'changeGroupPage'); // Use new pagination handler
         updateActiveTabAndPanel();
         // updateSortIndicators(tableHead); // Sorting indicators might be less relevant for group grids
         updateFilterIndicator();
     }

    function renderPaginationControls(targetContainer, totalItems, currentPage, totalPages, pageChangeFunctionName = 'changePage') {
        if (!targetContainer) return;
        if (totalItems === 0 || totalPages <= 1) { targetContainer.innerHTML = ''; targetContainer.style.display = 'none'; return; }
        targetContainer.dataset.totalPages = totalPages;
        targetContainer.innerHTML = ''; let paginationHTML = ''; const maxPagesToShow = 5; const halfPages = Math.floor(maxPagesToShow / 2);
        paginationHTML += `<button onclick="${pageChangeFunctionName}(${currentPage - 1})" ${currentPage === 1 ? 'disabled title="First page"' : 'title="Previous page"'}>« Prev</button>`;
        let startPage, endPage;
        if (totalPages <= maxPagesToShow + 2) { startPage = 1; endPage = totalPages; }
        else { startPage = Math.max(2, currentPage - halfPages); endPage = Math.min(totalPages - 1, currentPage + halfPages); if (currentPage - halfPages < 2) { endPage = Math.min(totalPages - 1, maxPagesToShow); } if (currentPage + halfPages > totalPages - 1) { startPage = Math.max(2, totalPages - maxPagesToShow + 1); } }
        if (startPage > 1) { paginationHTML += `<button onclick="${pageChangeFunctionName}(1)" title="Page 1">1</button>`; if (startPage > 2) { paginationHTML += `<span class="page-info" title="Skipped pages">...</span>`; } }
        for (let i = startPage; i <= endPage; i++) { paginationHTML += (i === currentPage) ? `<span class="current-page">${i}</span>` : `<button onclick="${pageChangeFunctionName}(${i})" title="Page ${i}">${i}</button>`; }
        if (endPage < totalPages) { if (endPage < totalPages - 1) { paginationHTML += `<span class="page-info" title="Skipped pages">...</span>`; } paginationHTML += `<button onclick="${pageChangeFunctionName}(${totalPages})" title="Page ${totalPages}">${totalPages}</button>`; }
        paginationHTML += `<button onclick="${pageChangeFunctionName}(${currentPage + 1})" ${currentPage === totalPages ? 'disabled title="Last page"' : 'title="Next page"'}>Next »</button>`;
        targetContainer.innerHTML = paginationHTML; targetContainer.style.display = 'block';
    }

    function updateFilterIndicator() { if(qualityFilterSelect) { qualityFilterSelect.classList.toggle('filter-active', !!currentState.qualityFilter); } }
    function updateActiveTabAndPanel() { Object.keys(tabMappings).forEach(tabId => { const mapping = tabMappings[tabId]; const isActive = tabId === activeResultsTab; if (mapping?.button) mapping.button.classList.toggle('active', isActive); if (mapping?.panel) mapping.panel.classList.toggle('active', isActive); }); }

    // --- Pagination and Tab Switching ---
    // API pagination still fetches FILES. Client-side pagination for GROUPS.
    window.changePage = async function(newPage) { // This is for API file pagination
        if (currentViewMode !== 'search' || newPage < 1 || newPage === currentState.currentPage) return;
        // const currentPagination = tabMappings[activeResultsTab]?.pagination;
        // if(currentPagination && currentPagination.dataset.totalPages) {
        // const totalP = parseInt(currentPagination.dataset.totalPages, 10); // This is total FILE pages
        // if(newPage > totalP) return;
        // }
        currentState.currentPage = newPage; // API page
        closePlayerIfNeeded(null);
        await fetchAndRenderResults(); // Fetches files, groups, then renders current group page
        const activeGridContainer = tabMappings[activeResultsTab]?.gridContainer;
        scrollToTopOfActiveGrid(activeGridContainer);
        saveStateToLocalStorage();
    }

    window.changeGroupPage = function(newGroupPage) { // For client-side group pagination
        if (currentViewMode !== 'search' || newGroupPage < 1) return;
        const groupsPerPage = config.ITEMS_PER_PAGE; // Or a new config for groups per page
        const totalGroups = currentGroupedSearchResultsData.length;
        const totalGroupPages = Math.ceil(totalGroups / groupsPerPage);
        if (newGroupPage > totalGroupPages) return;

        const startIndex = (newGroupPage - 1) * groupsPerPage;
        const endIndex = startIndex + groupsPerPage;
        const groupsForPage = currentGroupedSearchResultsData.slice(startIndex, endIndex);

        renderActiveResultsView({
            groupsToDisplay: groupsForPage,
            totalGroups: totalGroups,
            currentPageForGroups: newGroupPage,
            totalPagesForGroups: totalGroupPages,
            allFilteredGroups: currentGroupedSearchResultsData // Pass this through
        });
        const activeGridContainer = tabMappings[activeResultsTab]?.gridContainer;
        scrollToTopOfActiveGrid(activeGridContainer);
        // Note: currentState.currentPage still refers to API file page.
        // We might need a currentState.currentGroupDisplayPage if we want to save this.
    };


    function scrollToTopOfActiveGrid(gridContainerElement) {
        if (!gridContainerElement) return;
        let stickyHeaderHeight = 0;
        if (container.classList.contains('results-active')) {
            const searchBarArea = container.querySelector('#search-focus-area');
            const backButtonElem = resultsArea.querySelector('#backToHomeButtonResults');
            const filterAreaElem = resultsArea.querySelector('.results-filter-area');
            const tabNavElem = resultsArea.querySelector('.tab-navigation');
            stickyHeaderHeight = (searchBarArea?.offsetHeight || 0) +
                                 (backButtonElem?.offsetHeight || 0) +
                                 (backButtonElem ? parseFloat(getComputedStyle(backButtonElem).marginBottom) : 0) +
                                 (filterAreaElem?.offsetHeight || 0) +
                                 (tabNavElem?.offsetHeight || 0);
        }
        const elementTop = gridContainerElement.getBoundingClientRect().top + window.pageYOffset;
        const scrollPosition = elementTop - stickyHeaderHeight - 20;
        window.scrollTo({ top: scrollPosition, behavior: 'smooth' });
    }

    window.switchTab = function(tabId) {
        if (currentViewMode !== 'search' || tabId === activeResultsTab || !tabMappings[tabId]) return;
        activeResultsTab = tabId;
        currentState.currentPage = 1; // Reset API file page
        currentState.typeFilter = tabMappings[tabId].typeFilter;
        closePlayerIfNeeded(null);
        updateActiveTabAndPanel();
        showLoadingStateInGrids(`Loading ${tabMappings[tabId].typeFilter || 'all content'}...`);
        fetchAndRenderResults(); // This will fetch, group, and then display the first page of groups
        saveStateToLocalStorage();
    }

    // --- Navigation to Group Detail View ---
    function navigateToGroupView(groupKey) {
        if (!groupKey) return;
        lastFocusedElement = document.activeElement;
        if (groupDetailAbortController) { groupDetailAbortController.abort(); groupDetailAbortController = null; }

        const newUrl = `${window.location.origin}${window.location.pathname}?groupKey=${encodeURIComponent(groupKey)}`;
        const currentParams = new URLSearchParams(window.location.search);
        const isSameView = currentParams.get('groupKey') === String(groupKey) && !currentParams.has('shareGroup'); // Check against shareGroup
        if (!isSameView) {
            try {
                history.pushState({ groupKey: groupKey }, '', newUrl);
            } catch (e) { console.error("History pushState failed:", e); }
        }
        displayGroupDetailView(groupKey, false); // false for isFromShareLink
    }

    // --- Share Logic (Shares Group) ---
    async function handleShareGroupClick(buttonElement) {
        const groupKey = buttonElement.dataset.groupKey;
        const groupTitle = buttonElement.dataset.groupTitle || "Cinema Ghar Content";
        if (!groupKey) { alert("Cannot share: Group Key missing."); return; }

        const shareUrl = `${window.location.origin}${window.location.pathname}?shareGroup=true&groupKey=${encodeURIComponent(groupKey)}`;
        const shareText = `Check out: ${groupTitle}`;
        const feedbackSpan = buttonElement.nextElementSibling;

        if (navigator.share) {
            try {
                await navigator.share({ title: groupTitle, text: shareText, url: shareUrl });
            } catch (error) {
                if (error.name !== 'AbortError') {
                    if (feedbackSpan) showCopyFeedback(feedbackSpan, 'Share failed!', true);
                    else alert(`Share failed: ${error.message}`);
                }
            }
        } else {
            await copyToClipboard(shareUrl, feedbackSpan);
        }
    }


    // --- Group Detail Display Logic ---
    async function displayGroupDetailView(groupKey, isFromShareLink, autoSelectFileId = null) {
        if (!groupKey || !itemDetailView || !groupInfoArea || !groupFilesListContainer) return;
        if (groupDetailAbortController) { groupDetailAbortController.abort(); groupDetailAbortController = null; }
        groupDetailAbortController = new AbortController();
        const signal = groupDetailAbortController.signal;

        isShareMode = isFromShareLink; // For group share
        setViewMode('groupDetail');
        currentState.currentGroupKey = groupKey;
        currentState.currentSelectedFileId = null; // Reset selected file
        currentItemDetailData = null; // Clear previous specific file actions

        groupInfoArea.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading details for group...</span></div>`;
        groupFilesListContainer.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading files...</span></div>`;
        if (filesListHeading) filesListHeading.style.display = 'none';
        if (selectedFileActionsWrapper) selectedFileActionsWrapper.style.display = 'none';
        if (itemDetailContent) itemDetailContent.innerHTML = ''; // Clear old file actions


        if (backToHomeButtonShared) backToHomeButtonShared.style.display = isShareMode ? 'inline-flex' : 'none';
        if (backToResultsOrGroupListButton) {
            backToResultsOrGroupListButton.style.display = 'inline-flex';
            backToResultsOrGroupListButton.textContent = '← Back to Results';
        }

        try {
            // Try to find group in existing data first (search results, updates)
            let groupData = findGroupInLoadedData(groupKey);

            if (!groupData && isFromShareLink) { // If shared and not found, fetch its files by representative info
                // This part is tricky: a share link only has groupKey. We need to guess search terms.
                // For a robust share, the API might need to resolve a groupKey to its files.
                // Simplification: Assume groupKey contains enough info to search, or it won't work well.
                // Or, the share link could contain more info for fetching.
                // For now, if shared and not in loaded data, it might fail or show limited info.
                // Let's try to fetch files based on a "search by group title" if groupKey is parsable
                const guessedTitle = groupKey.split('_')[0].replace(/-/g, ' '); // Very rough guess
                const apiResponse = await fetchApiData({ search: guessedTitle, limit: 200 }); // Fetch many files for this title
                if (apiResponse && apiResponse.items) {
                    const processed = apiResponse.items.map(preprocessMovieData);
                    const groups = groupProcessedItems(processed);
                    groupData = groups.find(g => g.groupKey === groupKey);
                }
            }
            
            if (!groupData) { // If still not found after potential fetch for share link
                 // Attempt to fetch files that could belong to this groupKey
                // This requires a more sophisticated API or client-side search through all files
                // For now, let's assume if it's not in current search/updates, it's an issue.
                console.warn(`Group data for key ${groupKey} not found in loaded data. Share links might be incomplete without more context.`);
                 // Try to fetch the specific files if groupKey implies one file (e.g. ID was part of old key)
                const potentialFileId = groupKey.startsWith('ID_') ? groupKey.substring(3) : null;
                if (potentialFileId) {
                    const fileData = await fetchApiData({id: potentialFileId}, signal);
                    if (fileData && fileData.items && fileData.items.length > 0) {
                        const processed = fileData.items.map(preprocessMovieData);
                        const groups = groupProcessedItems(processed);
                        groupData = groups.find(g => g.groupKey === groupKey || g.files.some(f => f.id == potentialFileId));
                    }
                }
            }


            if (groupData) {
                currentViewGroupData = groupData;
                document.title = `${groupData.extractedTitle || 'Details'} - Cinema Ghar`;

                // Fetch TMDb details for the group if not already present or forced
                if (!groupData.tmdbDetails || !groupData.tmdbDetails.posterPathFetched) { // Fetch if no details or poster not attempted
                    const tmdbQuery = new URLSearchParams();
                    tmdbQuery.set('query', groupData.extractedTitle);
                    tmdbQuery.set('type', groupData.isSeries ? 'tv' : 'movie');
                    if (!groupData.isSeries && groupData.extractedYear) {
                        tmdbQuery.set('year', groupData.extractedYear);
                    }
                    tmdbQuery.set('fetchFullDetails', 'true'); // Get all details for group view
                    const tmdbUrl = `${config.TMDB_API_PROXY_URL}?${tmdbQuery.toString()}`;
                    const tmdbController = new AbortController(); // Use groupDetailAbortController's signal
                    const tmdbTimeoutId = setTimeout(() => tmdbController.abort(), config.TMDB_FETCH_TIMEOUT);

                    try {
                        const tmdbResponse = await fetch(tmdbUrl, { signal: signal || tmdbController.signal });
                        clearTimeout(tmdbTimeoutId);
                        if (tmdbResponse.ok) {
                            groupData.tmdbDetails = await tmdbResponse.json();
                            groupData.tmdbDetails.posterPathFetched = true; // Mark as fetched
                        } else {
                            groupData.tmdbDetails = groupData.tmdbDetails || {};
                            groupData.tmdbDetails.posterPathFetchFailed = true;
                        }
                    } catch (tmdbError) {
                        clearTimeout(tmdbTimeoutId);
                        if (tmdbError.name !== 'AbortError') console.error("Error fetching TMDb details for group view:", tmdbError);
                        groupData.tmdbDetails = groupData.tmdbDetails || {};
                        groupData.tmdbDetails.posterPathFetchFailed = true;
                    }
                }
                if (signal.aborted) return;

                groupInfoArea.innerHTML = createGroupTmdbHTML(groupData, groupData.tmdbDetails);
                groupFilesListContainer.innerHTML = createGroupFilesListHTML(groupData.files, groupKey);
                if(filesListHeading) filesListHeading.style.display = 'block';

                if (autoSelectFileId) {
                    handleFileSelectionInGroup(autoSelectFileId, true);
                }

            } else {
                groupInfoArea.innerHTML = `<div class="error-message" role="alert">Error: Content group with key <strong>${sanitize(groupKey)}</strong> was not found.</div>`;
                groupFilesListContainer.innerHTML = '';
                if(filesListHeading) filesListHeading.style.display = 'none';
                document.title = "Content Not Found - Cinema Ghar";
                currentViewGroupData = null;
            }

        } catch (error) {
            if (signal.aborted || error.name === 'AbortError') {
                console.log(`Group detail fetch aborted for key: ${groupKey}.`);
            } else {
                groupInfoArea.innerHTML = `<div class="error-message" role="alert">Error loading group details for <strong>${sanitize(groupKey)}</strong>: ${sanitize(error.message)}.</div>`;
                groupFilesListContainer.innerHTML = '';
                if(filesListHeading) filesListHeading.style.display = 'none';
                document.title = "Error Loading Content - Cinema Ghar";
                currentViewGroupData = null;
            }
        } finally {
            if (groupDetailAbortController && groupDetailAbortController.signal === signal && !signal.aborted) {
                groupDetailAbortController = null;
            }
            if ((groupInfoArea.innerHTML && !groupInfoArea.querySelector('.loading-inline-spinner')) ||
                (groupFilesListContainer.innerHTML && !groupFilesListContainer.querySelector('.loading-inline-spinner'))) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            if (pageLoader && pageLoader.style.display !== 'none') {
                pageLoader.style.display = 'none';
            }
        }
        saveStateToLocalStorage();
    }

    function findGroupInLoadedData(groupKey) {
        let group = currentGroupedSearchResultsData.find(g => g.groupKey === groupKey);
        if (group) return group;
        group = weeklyGroupedUpdatesData.find(g => g.groupKey === groupKey);
        if (group) return group;
        group = localGroupedSuggestionData.find(g => g.groupKey === groupKey); // all fetched initial data
        return group;
    }

    function handleFileSelectionInGroup(fileId, isRestoringFromUrl = false) {
        if (!currentViewGroupData || !fileId) return;

        const selectedFile = currentViewGroupData.files.find(f => String(f.id) === String(fileId));

        if (selectedFile) {
            currentItemDetailData = selectedFile;
            currentState.currentSelectedFileId = selectedFile.id;
            if (itemDetailContent) {
                itemDetailContent.innerHTML = createItemDetailContentHTML(selectedFile, currentViewGroupData.tmdbDetails);
            }
            if (selectedFileActionsWrapper) selectedFileActionsWrapper.style.display = 'block';
            if (backToResultsOrGroupListButton) backToResultsOrGroupListButton.textContent = '← Back to File List';
            document.title = `${selectedFile.displayFilename} - ${currentViewGroupData.extractedTitle || 'Group'} - Cinema Ghar`;

            // Highlight the selected file in the list
            const allFileItems = groupFilesListContainer.querySelectorAll('.file-item-in-group');
            allFileItems.forEach(item => item.classList.remove('selected'));
            const selectedFileElement = groupFilesListContainer.querySelector(`.file-item-in-group[data-file-id="${fileId}"]`);
            if (selectedFileElement) {
                selectedFileElement.classList.add('selected');
                 if (!isRestoringFromUrl) { // Don't scroll if just restoring from URL
                    selectedFileElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    setTimeout(() => {
                        const firstButtonInActions = selectedFileActionsWrapper.querySelector('.button');
                        if (firstButtonInActions) firstButtonInActions.focus();
                        else selectedFileElement.focus();
                    }, 100);
                 }
            }
            if (!isRestoringFromUrl) {
                // Update URL with fileId
                const urlParams = new URLSearchParams(window.location.search);
                urlParams.set('fileId', fileId);
                const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
                history.pushState({ ...history.state, fileId: fileId }, '', newUrl);
            }

        } else {
            console.warn(`File with ID ${fileId} not found in current group ${currentViewGroupData.groupKey}`);
            if (itemDetailContent) itemDetailContent.innerHTML = `<div class="error-message">Selected file not found.</div>`;
            if (selectedFileActionsWrapper) selectedFileActionsWrapper.style.display = 'block'; // Show error
            currentItemDetailData = null;
            currentState.currentSelectedFileId = null;
        }
        saveStateToLocalStorage();
    }


    function updateItemDetailAfterBypass(encodedFinalUrl) {
        if (!currentItemDetailData || !itemDetailContent || !currentViewGroupData) return;
        // currentItemDetailData is the specific FILE that was bypassed
        currentItemDetailData.url = encodedFinalUrl;
        // Re-render the actions for this specific file
        const contentHTML = createItemDetailContentHTML(currentItemDetailData, currentViewGroupData.tmdbDetails);
        itemDetailContent.innerHTML = contentHTML;
        const playButton = itemDetailContent.querySelector('.play-button');
        if(playButton) { setTimeout(() => playButton.focus(), 50); }

        // Ensure video player is correctly placed if it was open
        if (videoContainer.parentElement && videoContainer.style.display !== 'none') {
            // Video player is already part of selectedFileActionsWrapper's sub-tree or managed globally
            // No re-parenting needed here as itemDetailContent is inside selectedFileActionsWrapper
        }
    }

    // --- Player Logic ---
    function streamVideo(title, url, filenameForAudioCheck, isFromCustom = false) {
        let currentActionContainerContext = null;
        if (isGlobalCustomUrlMode) {
            // Global mode, videoContainer is child of main #cinemaghar-container
        } else if (currentViewMode === 'groupDetail' && selectedFileActionsWrapper && selectedFileActionsWrapper.style.display !== 'none') {
            currentActionContainerContext = selectedFileActionsWrapper; // Player is related to selected file actions
        } else {
            // Fallback or unexpected state, maybe hide player or log error
            console.warn("StreamVideo called in unexpected context. Player might not display correctly.");
            return;
        }

        if (!videoContainer || !videoElement) return;
        if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none';
        if (videoElement) videoElement.style.display = 'block';
        if (customControlsContainer) customControlsContainer.style.display = 'flex';
        if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; }
        if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; }
        clearCopyFeedback();

        if (!isGlobalCustomUrlMode && currentActionContainerContext && videoContainer.parentElement !== currentActionContainerContext) {
            // Place video player within the selectedFileActionsWrapper, typically after itemDetailContent
            if (videoContainer.parentElement) { videoContainer.parentElement.removeChild(videoContainer); }
            // Insert videoContainer after itemDetailContent inside selectedFileActionsWrapper
            if (itemDetailContent && itemDetailContent.parentNode === currentActionContainerContext) {
                 currentActionContainerContext.insertBefore(videoContainer, itemDetailContent.nextSibling);
            } else {
                currentActionContainerContext.appendChild(videoContainer); // Fallback append
            }
             if (videoElement.hasAttribute('src')) { videoElement.pause(); videoElement.removeAttribute('src'); videoElement.currentTime = 0; videoElement.load(); }
             if (vlcBox) vlcBox.style.display = 'none';
        }

        const savedVolume = localStorage.getItem(config.PLAYER_VOLUME_KEY);
        const savedSpeed = localStorage.getItem(config.PLAYER_SPEED_KEY);
        videoElement.volume = (savedVolume !== null) ? Math.max(0, Math.min(1, parseFloat(savedVolume))) : 1;
        if (volumeSlider) volumeSlider.value = videoElement.volume;
        videoElement.muted = (videoElement.volume === 0);
        videoElement.playbackRate = (savedSpeed !== null) ? parseFloat(savedSpeed) : 1;
        if(playbackSpeedSelect) playbackSpeedSelect.value = String(videoElement.playbackRate);
        updateMuteButton();
        videoElement.currentTime = 0;

        const ddp51Regex = /\bDDP?([ ._-]?5\.1)?\b/i; const advancedAudioRegex = /\b(DTS|ATMOS|TrueHD)\b/i; const multiAudioHintRegex = /\b(Multi|Dual)[ ._-]?Audio\b/i; let warningText = "";
        if (filenameForAudioCheck && !isFromCustom) { const lowerFilename = (filenameForAudioCheck || '').toLowerCase(); if (ddp51Regex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DDP audio might not work. Use external player."; } else if (advancedAudioRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DTS/Atmos/TrueHD audio likely unsupported. Use external player."; } else if (multiAudioHintRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> May contain multiple audio tracks. Use selector below or external player."; } }
        if (warningText && audioWarningDiv) { audioWarningDiv.innerHTML = warningText; audioWarningDiv.style.display = 'block'; }

        if (videoTitle) videoTitle.innerText = title || "Video";
        if (vlcText) vlcText.innerText = url;
        if (vlcBox) vlcBox.style.display = 'block';
        videoElement.src = url; videoElement.load(); videoElement.play().catch(e => { console.warn("Video play failed:", e); });
        if (videoContainer.style.display === 'none') { videoContainer.style.display = 'flex'; }

        if (!isGlobalCustomUrlMode) {
            const closeButton = videoContainer.querySelector('.close-btn');
            if (closeButton) { setTimeout(() => closeButton.focus(), 100); }
            setTimeout(() => { videoContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150);
        }
    }
    window.closePlayer = function(elementToFocusAfter = null) { if (elementToFocusAfter instanceof Event) { elementToFocusAfter = elementToFocusAfter?.target; } if (!videoContainer || !videoElement) return; const parentContainer = videoContainer.parentElement; const wasGlobalMode = isGlobalCustomUrlMode; try { const fsElement = document.fullscreenElement || document.webkitFullscreenElement; if (fsElement && (fsElement === videoElement || fsElement === videoContainer)) { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } } catch(err) {} videoElement.pause(); videoElement.removeAttribute('src'); videoElement.currentTime = 0; videoElement.load(); videoContainer.style.display = 'none'; videoContainer.classList.remove('global-custom-url-mode', 'is-fullscreen'); isGlobalCustomUrlMode = false; if (vlcBox) vlcBox.style.display = 'none'; if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; } if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; } if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none'; if (playerCustomUrlInput) playerCustomUrlInput.value = ''; if (playerCustomUrlFeedback) playerCustomUrlFeedback.textContent = ''; clearCopyFeedback(); clearBypassFeedback(); if (videoTitle) videoTitle.innerText = ''; if (parentContainer && parentContainer.contains(videoContainer)) { parentContainer.removeChild(videoContainer); }
        if (wasGlobalMode) { resetToHomepage(); lastFocusedElement = null; return; }

        let finalFocusTarget = elementToFocusAfter || lastFocusedElement;
        if (!wasGlobalMode && currentViewMode === 'groupDetail' && selectedFileActionsWrapper && selectedFileActionsWrapper.style.display !== 'none') {
            const playButton = selectedFileActionsWrapper.querySelector('.play-button');
            if (playButton) finalFocusTarget = playButton;
            else {
                const firstButton = selectedFileActionsWrapper.querySelector('.button');
                if (firstButton) finalFocusTarget = firstButton;
                else finalFocusTarget = selectedFileActionsWrapper;
            }
        }
        if (finalFocusTarget && typeof finalFocusTarget.focus === 'function') { setTimeout(() => { try { finalFocusTarget.focus({preventScroll: true}); } catch(e) {} }, 50); }
        lastFocusedElement = null;
    }
    function closePlayerIfNeeded(elementToFocusAfter = null) { if (videoContainer?.style.display !== 'none') { closePlayer(elementToFocusAfter); } }
    window.seekVideo = function(seconds) { if (videoElement) videoElement.currentTime += seconds; }
    window.toggleMute = function() { if (videoElement) videoElement.muted = !videoElement.muted; }
    window.setVolume = function(value) { if (videoElement) { const vol = parseFloat(value); videoElement.volume = vol; videoElement.muted = (vol === 0); } }
    window.setPlaybackSpeed = function(value) { if (videoElement) videoElement.playbackRate = parseFloat(value); }
    window.toggleFullscreen = function() { const elementToMakeFullscreen = videoContainer; if (!elementToMakeFullscreen) return; const fsElement = document.fullscreenElement || document.webkitFullscreenElement; try { if (!fsElement) { if (elementToMakeFullscreen.requestFullscreen) elementToMakeFullscreen.requestFullscreen(); else if (elementToMakeFullscreen.webkitRequestFullscreen) elementToMakeFullscreen.webkitRequestFullscreen(); } else { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } } catch (err) { alert("Fullscreen mode failed."); } }
    window.changeAudioTrack = function(selectElement) { if (!videoElement || !videoElement.audioTracks) return; const selectedTrackValue = selectElement.value; const tracks = videoElement.audioTracks; for (let i = 0; i < tracks.length; i++) { const track = tracks[i]; const isSelectedTrack = (track.id && track.id === selectedTrackValue) || String(i) === selectedTrackValue; if (track.enabled !== isSelectedTrack) { try { track.enabled = isSelectedTrack; } catch (e) {} } } }
    function togglePlayPause() { if (videoElement) { if (videoElement.paused || videoElement.ended) videoElement.play().catch(e => {}); else videoElement.pause(); } }
    function updateMuteButton() { if (!videoElement || !muteButton) return; const isMuted = videoElement.muted || videoElement.volume === 0; muteButton.textContent = isMuted ? "Unmute" : "Mute"; muteButton.setAttribute('aria-pressed', String(isMuted)); if (volumeSlider) { volumeSlider.style.opacity = isMuted ? '0.5' : '1'; volumeSlider.disabled = isMuted; if (!isMuted && videoElement.volume === 0) { const defaultUnmuteVolume = 0.5; videoElement.volume = defaultUnmuteVolume; volumeSlider.value = defaultUnmuteVolume; } } }
    function handleFullscreenChange() { const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement); if (!videoContainer) return; videoContainer.classList.toggle('is-fullscreen', isFullscreen); }
    function populateAudioTrackSelector() { if (!videoElement || typeof videoElement.audioTracks === 'undefined' || !audioTrackSelect) { if(audioTrackSelect) audioTrackSelect.style.display = 'none'; return; } const tracks = videoElement.audioTracks; audioTrackSelect.innerHTML = ''; if (tracks.length <= 1) { audioTrackSelect.style.display = 'none'; return; } let hasEnabledTrack = false; for (let i = 0; i < tracks.length; i++) { if (tracks[i].enabled) hasEnabledTrack = true; } if (!hasEnabledTrack && tracks.length > 0) { try { tracks[0].enabled = true; } catch(e) {} } let preferredTrackIndex = -1; for (let i = 0; i < tracks.length; i++) { const track = tracks[i]; const option = document.createElement('option'); const trackValue = track.id || i; option.value = trackValue; let label = track.label || `Track ${i + 1}`; let languageName = ''; if (track.language) { try { languageName = new Intl.DisplayNames(['en'], { type: 'language' }).of(track.language.split('-')[0]); label += ` (${languageName || track.language})`; } catch (e) { label += ` (${track.language})`; } } option.textContent = label; option.selected = track.enabled; option.disabled = track.readyState === 'ended'; audioTrackSelect.appendChild(option); const lang = track.language?.toLowerCase(); const lbl = label.toLowerCase(); if (preferredTrackIndex === -1 && (lang?.startsWith('hi') || lbl.includes('hindi') || languageName?.toLowerCase() === 'hindi')) { preferredTrackIndex = i; } } if (preferredTrackIndex !== -1) { try { for (let i = 0; i < tracks.length; i++) { tracks[i].enabled = (i === preferredTrackIndex); } audioTrackSelect.value = tracks[preferredTrackIndex].id || preferredTrackIndex; } catch(e) {} } else { for (let i = 0; i < tracks.length; i++) { if (tracks[i].enabled) { audioTrackSelect.value = tracks[i].id || i; break; } } } audioTrackSelect.style.display = 'inline-block'; try { if (tracks.onchange === null) tracks.onchange = populateAudioTrackSelector; } catch(e) {} }
    function openWithIntent(url) { if (!url) return; const mime = getMimeTypeFromUrl(url); const titleEncoded = encodeURIComponent(videoTitle?.innerText || document.title || 'Video'); const intentUri = `intent:${url}#Intent;type=${mime};action=android.intent.action.VIEW;S.title=${titleEncoded};end`; window.location.href = intentUri; }
    function copyVLCLink(buttonElement, url) { if (!url) { alert("Cannot copy: URL missing."); return; } const feedbackSpan = buttonElement.nextElementSibling; copyToClipboard(url, feedbackSpan).catch(err => { if (feedbackSpan) { feedbackSpan.classList.remove('show', 'error'); feedbackSpan.style.display = 'none'; } }); }
    function showCopyFeedback(spanElement, message = 'Copied!', isError = false) { if (!spanElement) return; clearTimeout(copyFeedbackTimeout); spanElement.textContent = message; spanElement.classList.toggle('error', isError); spanElement.classList.remove('share-fallback'); if (spanElement.classList.contains('share-fallback')) { spanElement.classList.add('share-fallback'); } spanElement.style.display = 'inline-block'; spanElement.classList.add('show'); copyFeedbackTimeout = setTimeout(() => { spanElement.classList.remove('show', 'error'); setTimeout(() => { if (!spanElement.classList.contains('show')) { spanElement.style.display = 'none'; spanElement.textContent = spanElement.classList.contains('share-fallback') ? 'Link copied!' : 'Copied!'; } }, 300); }, 2500); }
    function clearCopyFeedback() { clearTimeout(copyFeedbackTimeout); document.querySelectorAll('.copy-feedback.show').forEach(span => { span.classList.remove('show', 'error'); span.style.display = 'none'; span.textContent = span.classList.contains('share-fallback') ? 'Link copied!' : 'Copied!'; }); }
    function clearBypassFeedback() { clearTimeout(bypassFeedbackTimeout); document.querySelectorAll('.bypass-feedback.show').forEach(span => { span.classList.remove('show', 'error', 'loading'); span.style.display = 'none'; span.textContent = ''; }); }
    function highlightVlcText() { const currentVlcText = itemDetailContent?.querySelector('#vlcBox code'); if (currentVlcText && currentVlcText.closest('#vlcBox')?.style.display !== 'none') { try { const range = document.createRange(); range.selectNodeContents(currentVlcText); const selection = window.getSelection(); if (selection) { selection.removeAllRanges(); selection.addRange(range); } } catch (selectErr) {} } }
    function handlePlayerKeyboardShortcuts(event) { if (!videoContainer || videoContainer.style.display === 'none' || !videoElement) return; const targetTagName = event.target.tagName.toLowerCase(); if (targetTagName === 'input' || targetTagName === 'select' || targetTagName === 'textarea') return; const key = event.key; let prevented = false; switch (key) { case ' ': case 'k': togglePlayPause(); prevented = true; break; case 'ArrowLeft': seekVideo(-10); prevented = true; break; case 'ArrowRight': seekVideo(10); prevented = true; break; case 'ArrowUp': setVolume(Math.min(videoElement.volume + 0.05, 1)); if(volumeSlider) volumeSlider.value = videoElement.volume; prevented = true; break; case 'ArrowDown': setVolume(Math.max(videoElement.volume - 0.05, 0)); if(volumeSlider) volumeSlider.value = videoElement.volume; prevented = true; break; case 'm': toggleMute(); prevented = true; break; case 'f': toggleFullscreen(); prevented = true; break; } if (prevented) event.preventDefault(); }

    // --- State Persistence ---
    function saveStateToLocalStorage() {
        try {
            const stateToSave = {
                viewMode: currentViewMode, // Save current view
                searchTerm: currentState.searchTerm,
                qualityFilter: currentState.qualityFilter,
                typeFilter: currentState.typeFilter,
                activeTab: activeResultsTab,
                currentPage: currentState.currentPage, // API file page
                // Add group-specific state if in groupDetail view
                currentGroupKey: currentViewMode === 'groupDetail' ? currentState.currentGroupKey : null,
                currentSelectedFileId: currentViewMode === 'groupDetail' ? currentState.currentSelectedFileId : null,
                // Sort state (less critical for group view now, but can keep for file API fetches)
                sortColumn: currentState.sortColumn,
                sortDirection: currentState.sortDirection
            };
            localStorage.setItem(config.LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
        } catch (e) { console.error("Failed to save state to local storage:", e); }
    }
    function loadStateFromLocalStorage() {
        try {
            const savedStateString = localStorage.getItem(config.LOCAL_STORAGE_KEY);
            if (savedStateString) {
                const parsedState = JSON.parse(savedStateString);
                currentState.searchTerm = parsedState.searchTerm || '';
                currentState.qualityFilter = parsedState.qualityFilter || '';
                currentState.typeFilter = parsedState.typeFilter || '';
                activeResultsTab = parsedState.activeTab || 'allFiles';
                currentState.currentPage = parsedState.currentPage || 1;
                currentViewMode = parsedState.viewMode || 'homepage'; // Default to homepage if not specified

                // Restore group/file state if applicable
                currentState.currentGroupKey = parsedState.currentGroupKey || null;
                currentState.currentSelectedFileId = parsedState.currentSelectedFileId || null;

                currentState.sortColumn = parsedState.sortColumn || 'lastUpdated';
                currentState.sortDirection = parsedState.sortDirection || 'desc';

                // If restoring to search, set search input
                if (currentViewMode === 'search' && currentState.searchTerm && searchInput) {
                    searchInput.value = currentState.searchTerm;
                }
                // If restoring to group detail, it will be handled by handleUrlChange
                // if no URL params are present but state indicates groupDetail, might need to reset.
                const urlParams = new URLSearchParams(window.location.search);
                if (currentViewMode === 'groupDetail' && !urlParams.has('groupKey') && !urlParams.has('viewGroup')) {
                    // Invalid state, reset to homepage if URL doesn't support groupDetail
                    console.warn("LocalStorage state for groupDetail, but URL doesn't match. Resetting.");
                    currentViewMode = 'homepage';
                    currentState.currentGroupKey = null;
                    currentState.currentSelectedFileId = null;
                }


            } else {
                resetToDefaultState();
            }
        } catch (e) {
            console.error("Failed to load state from local storage:", e);
            localStorage.removeItem(config.LOCAL_STORAGE_KEY);
            resetToDefaultState();
        }
        currentViewGroupData = null; currentItemDetailData = null; lastFocusedElement = null;
    }
    function resetToDefaultState() {
        currentState.searchTerm = ''; currentState.qualityFilter = ''; currentState.typeFilter = '';
        activeResultsTab = 'allFiles'; currentState.currentPage = 1;
        currentViewMode = 'homepage';
        currentState.currentGroupKey = null; currentState.currentSelectedFileId = null;
        currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc';
    }


    // --- Initial Data Loading and Setup ---
    async function fetchApiData(params = {}, signal = null) { // Fetches FILES from API
        if (!params.id && searchAbortController) { searchAbortController.abort(); }
        let currentSignal = signal;
        if (!currentSignal && !params.id) { searchAbortController = new AbortController(); currentSignal = searchAbortController.signal; }
        else if (signal) {}
        else { const tempController = new AbortController(); currentSignal = tempController.signal; }

        const query = new URLSearchParams();
        if (!params.id) { // List fetch
            query.set('page', params.page || currentState.currentPage);
            query.set('limit', params.limit || currentState.limit);
            query.set('sort', params.sort || currentState.sortColumn); // API sorts files
            query.set('sortDir', params.sortDir || currentState.sortDirection);
            const searchTerm = params.search !== undefined ? params.search : currentState.searchTerm;
            if (searchTerm) query.set('search', searchTerm);
            const qualityFilter = params.quality !== undefined ? params.quality : currentState.qualityFilter;
            if (qualityFilter) query.set('quality', qualityFilter);
            const typeFilter = params.type !== undefined ? params.type : currentState.typeFilter;
            if (typeFilter) query.set('type', typeFilter); // API filters files by type
        } else { // Specific file fetch
            query.set('id', params.id);
        }
        const url = `${config.MOVIE_DATA_API_URL}?${query.toString()}`;
        try {
            const response = await fetch(url, { signal: currentSignal });
            if (!response.ok) { let errorBody = null; try { errorBody = await response.json(); } catch (_) {} const errorDetails = errorBody?.error || errorBody?.details || `Status: ${response.status}`; throw new Error(`API Error: ${errorDetails}`); }
            const data = await response.json(); // Returns { items: [fileObjects], totalItems, page, totalPages, limit }
            // Pagination data here refers to FILES from API
            if (!params.id && tabMappings[activeResultsTab]) {
                const activePagination = tabMappings[activeResultsTab]?.pagination;
                if (activePagination && data.totalPages !== undefined) {
                    // This is total FILE pages. We'll manage group pagination client-side.
                    // activePagination.dataset.totalPages = data.totalPages; // Might not use this directly for group pagination display
                }
            }
            return data;
        } catch (error) { if (error.name === 'AbortError') { return null; } throw error;
        } finally { if (currentSignal === searchAbortController?.signal && !signal) { searchAbortController = null; } }
    }

    async function fetchAndRenderResults() { // Fetches FILES, groups them, then renders GROUP posters
        if (currentViewMode !== 'search') return;
        try {
            // Fetch ALL relevant files based on search/filter (potentially multiple API pages)
            // For simplicity, this example might only fetch one page of files then group.
            // A more robust solution would fetch all files matching criteria before grouping.
            // Let's assume for now API limit is high enough for typical searches to get enough diversity for grouping.
            const apiFileResponse = await fetchApiData({limit: 200}); // Fetch more files to make groups
            if (apiFileResponse === null || !apiFileResponse.items) return;

            const processedFiles = apiFileResponse.items.map(preprocessMovieData);
            let allFilteredGroups = groupProcessedItems(processedFiles)
                .sort((a, b) => b.lastUpdatedTimestamp - a.lastUpdatedTimestamp); // Sort groups

            // Apply type filter to groups client-side if tab is 'movies' or 'series'
            if (currentState.typeFilter === 'movies') {
                allFilteredGroups = allFilteredGroups.filter(group => !group.isSeries);
            } else if (currentState.typeFilter === 'series') {
                allFilteredGroups = allFilteredGroups.filter(group => group.isSeries);
            }
            // Quality filter is applied at API level for files, then groups are formed.

            const groupsPerPage = config.ITEMS_PER_PAGE; // Or a new config for groups per page
            const totalGroups = allFilteredGroups.length;
            const totalPagesForGroups = Math.ceil(totalGroups / groupsPerPage);
            const currentPageForGroups = 1; // Always start at page 1 of groups for a new fetch/filter
            const startIndex = (currentPageForGroups - 1) * groupsPerPage;
            const endIndex = startIndex + groupsPerPage;
            const groupsForPage = allFilteredGroups.slice(startIndex, endIndex);

            currentGroupedSearchResultsData = allFilteredGroups; // Store all for client-side paging

            renderActiveResultsView({
                groupsToDisplay: groupsForPage,
                totalGroups: totalGroups,
                currentPageForGroups: currentPageForGroups,
                totalPagesForGroups: totalPagesForGroups,
                allFilteredGroups: allFilteredGroups // Store for client-side group pagination
            });
            saveStateToLocalStorage();
        } catch (error) {
            if (error.name !== 'AbortError') {
                const { gridContainer } = tabMappings[activeResultsTab];
                if (gridContainer) { gridContainer.innerHTML = `<div class="error-message grid-status-message">Error loading results: ${error.message}. Please try again.</div>`; }
                Object.values(tabMappings).forEach(m => { if(m.pagination) m.pagination.style.display = 'none'; });
            }
        }
    }


    function populateQualityFilter(fileItems = []) { // Takes array of individual file items
        if (!qualityFilterSelect) return;
        const currentSelectedValue = qualityFilterSelect.value;
        fileItems.forEach(item => { // item here is a preprocessed file
            if (item.displayQuality && item.displayQuality !== 'N/A') {
                uniqueQualities.add(item.displayQuality);
            }
        });
        const sortedQualities = [...uniqueQualities].sort((a, b) => { const getScore = (q) => { q = String(q || '').toUpperCase().trim(); const resMatch = q.match(/^(\d{3,4})P$/); if (q === '4K' || q === '2160P') return 100; if (resMatch) return parseInt(resMatch[1], 10); if (q === '1080P') return 90; if (q === '720P') return 80; if (q === '480P') return 70; if (['WEBDL', 'BLURAY', 'BDRIP', 'BRRIP'].includes(q)) return 60; if (['WEBIP', 'HDTV', 'HDRIP'].includes(q)) return 50; if (['DVD', 'DVDRIP'].includes(q)) return 40; if (['DVDSCR', 'HC', 'HDCAM', 'TC', 'TS', 'CAM'].includes(q)) return 30; if (['HDR', 'DOLBY VISION', 'DV', 'HEVC', 'X265'].includes(q)) return 20; return 0; }; const scoreA = getScore(a); const scoreB = getScore(b); if (scoreA !== scoreB) return scoreB - scoreA; return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' }); });
        while (qualityFilterSelect.options.length > 1) { qualityFilterSelect.remove(1); }
        sortedQualities.forEach(quality => { if (quality && quality !== 'N/A') { const option = document.createElement('option'); option.value = quality; option.textContent = quality; qualityFilterSelect.appendChild(option); } });
        qualityFilterSelect.value = [...qualityFilterSelect.options].some(opt => opt.value === currentSelectedValue) ? currentSelectedValue : "";
        updateFilterIndicator();
    }

    function displayLoadError(message) { const errorHtml = `<div class="error-container" role="alert">${sanitize(message)}</div>`; if (searchFocusArea) searchFocusArea.innerHTML = ''; searchFocusArea.style.display = 'none'; if (resultsArea) resultsArea.innerHTML = ''; resultsArea.style.display = 'none'; if (updatesPreviewSection) updatesPreviewSection.innerHTML = ''; updatesPreviewSection.style.display = 'none'; if (itemDetailView) itemDetailView.innerHTML = ''; itemDetailView.style.display = 'none'; if (pageFooter) pageFooter.style.display = 'none'; container.classList.remove('results-active', 'item-detail-active'); if (mainErrorArea) { mainErrorArea.innerHTML = errorHtml; } else if (container) { container.insertAdjacentHTML('afterbegin', errorHtml); } if (pageLoader) pageLoader.style.display = 'none'; }

    async function initializeApp() {
        isInitialLoad = true;
        if (pageLoader) pageLoader.style.display = 'flex';
        loadStateFromLocalStorage(); // Sets currentViewMode, currentState vars
        if (qualityFilterSelect) { qualityFilterSelect.value = currentState.qualityFilter || ''; updateFilterIndicator(); }

        // Fetch initial data for suggestions and quality filter population
        // This fetches FILES, then groups them for localGroupedSuggestionData
        try {
            const initialFileLimit = 500; // Fetch a good number of recent files for suggestions and updates
            const initialApiData = await fetchApiData({ limit: initialFileLimit, sort: 'lastUpdated', sortDir: 'desc' });
            if (initialApiData && initialApiData.items) {
                allFetchedFilesData = initialApiData.items.map(preprocessMovieData);
                populateQualityFilter(allFetchedFilesData); // Populate from all unique file qualities
                localGroupedSuggestionData = groupProcessedItems(allFetchedFilesData)
                    .sort((a, b) => b.lastUpdatedTimestamp - a.lastUpdatedTimestamp);

                if (currentViewMode === 'homepage') {
                    weeklyGroupedUpdatesData = localGroupedSuggestionData; // Use the already fetched and grouped data
                    displayInitialUpdates();
                }
            } else if (currentViewMode === 'homepage' && updatesPreviewList && !updatesPreviewList.hasChildNodes()) {
                updatesPreviewList.innerHTML = '<div class="status-message grid-status-message">Could not load recent updates.</div>';
            }
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.error("Error fetching initial data:", e);
                if (currentViewMode === 'homepage' && updatesPreviewList && !updatesPreviewList.hasChildNodes()) {
                    updatesPreviewList.innerHTML = `<div class="error-message grid-status-message">Error loading updates: ${e.message}.</div>`;
                }
            }
        }

        handleUrlChange(); // Sets view based on URL or restored state (search/groupDetail) AFTER initial data may be loaded

        if (currentViewMode === 'search' && currentState.searchTerm) {
            if(searchInput) searchInput.value = currentState.searchTerm;
            showLoadingStateInGrids(`Loading search results for "${sanitize(currentState.searchTerm)}"...`);
            await fetchAndRenderResults(); // Fetches files, groups, then renders group posters
        } else if (currentViewMode === 'groupDetail' && currentState.currentGroupKey) {
            // displayGroupDetailView is called by handleUrlChange if groupKey is in URL
            // If restoring from localStorage without URL param, handleUrlChange should reset or display
        }


        if (pageLoader && pageLoader.style.display !== 'none' && currentViewMode !== 'groupDetail') {
            // Keep loader if going straight to groupDetail until its content loads
            pageLoader.style.display = 'none';
        }
        isInitialLoad = false;
    }

    // --- Event Handling Setup ---
    function handleActionClick(event) { // For buttons within #item-detail-content (selected file actions)
        const target = event.target;
        // Ensure context is a selected file's actions
        if (!currentItemDetailData || !target.closest('#item-detail-content')) return;

        const button = target.closest('#item-detail-content .button:not(.close-btn):not(.vlc-button):not(.intent-button):not(.download-button):not(.share-button):not(.youtube-button):not(.tmdb-link-button):not(.imdb-button):not(.telegram-button):not(.gdflix-button):not(.hubcloud-button):not(.filepress-button):not(.gdtot-button), #playerCustomUrlSection .button');
        const copyButton = target.closest('#item-detail-content .vlc-button[data-action="copy-vlc"]');
        const intentButton = target.closest('#item-detail-content .intent-button[data-action="open-intent"]');
        const shareGroupButton = target.closest('#item-detail-content .share-button[data-action="share-group"]'); // Share group button
        const customUrlToggle = target.closest('#item-detail-content .custom-url-toggle-button[data-action="toggle-custom-url"]');
        const bypassHubCloudButton = target.closest('#item-detail-content .hubcloud-bypass-button[data-action="bypass-hubcloud"]');
        const bypassGdflixButton = target.closest('#item-detail-content .gdflix-bypass-button[data-action="bypass-gdflix"]');
        const playButton = target.closest('#item-detail-content .play-button[data-action="play"]');

        let actionHandled = false;
        if (playButton) {
            const url = playButton.dataset.url; const title = playButton.dataset.title; const filename = playButton.dataset.filename;
            if (url) { event.preventDefault(); lastFocusedElement = playButton; isGlobalCustomUrlMode = false; streamVideo(title, url, filename); actionHandled = true; }
        } else if (copyButton) {
            const url = copyButton.dataset.url;
            if (url) { event.preventDefault(); lastFocusedElement = copyButton; copyVLCLink(copyButton, url); actionHandled = true; }
        } else if (intentButton) {
            const url = intentButton.dataset.url;
            if (url) { event.preventDefault(); lastFocusedElement = intentButton; openWithIntent(url); actionHandled = true; }
        } else if (shareGroupButton) { // Changed from shareButton to shareGroupButton
            const groupKey = shareGroupButton.dataset.groupKey;
            if (groupKey) { event.preventDefault(); lastFocusedElement = shareGroupButton; handleShareGroupClick(shareGroupButton); actionHandled = true; }
        } else if (customUrlToggle) {
            event.preventDefault(); lastFocusedElement = customUrlToggle; toggleCustomUrlInput(customUrlToggle); actionHandled = true;
        } else if (bypassHubCloudButton) {
            event.preventDefault(); lastFocusedElement = bypassHubCloudButton; triggerHubCloudBypass(bypassHubCloudButton); actionHandled = true;
        } else if (bypassGdflixButton) {
            event.preventDefault(); lastFocusedElement = bypassGdflixButton; triggerGDFLIXBypass(bypassGdflixButton); actionHandled = true;
        } else if (button && button.matches('#playerPlayCustomUrlButton')) {
            event.preventDefault(); lastFocusedElement = button;
            if (isGlobalCustomUrlMode) { handleGlobalPlayCustomUrl(event); }
            else { playFromCustomUrlInput(event.target); }
            actionHandled = true;
        }
        // Other direct links (download, telegram, etc.) are handled by browser
    }

    function handleGlobalCustomUrlClick(event) { event.preventDefault(); lastFocusedElement = event.target; if (!container || !videoContainer || !playerCustomUrlSection || !playerCustomUrlInput) return; closePlayerIfNeeded(null); if (videoContainer.parentElement !== container) { if (videoContainer.parentElement) { videoContainer.parentElement.removeChild(videoContainer); } container.appendChild(videoContainer); } else { if (!container.contains(videoContainer)) { container.appendChild(videoContainer); } } if(resultsArea) resultsArea.style.display = 'none'; if(itemDetailView) itemDetailView.style.display = 'none'; if(searchFocusArea) searchFocusArea.style.display = 'none'; if(pageFooter) pageFooter.style.display = 'none'; isGlobalCustomUrlMode = true; videoContainer.classList.add('global-custom-url-mode'); if (videoElement) videoElement.style.display = 'none'; if (customControlsContainer) customControlsContainer.style.display = 'none'; if (videoTitle) videoTitle.innerText = 'Play Custom URL'; if (vlcBox) vlcBox.style.display = 'none'; if (audioWarningDiv) audioWarningDiv.style.display = 'none'; playerCustomUrlSection.style.display = 'flex'; if (playerCustomUrlInput) playerCustomUrlInput.value = ''; if (playerCustomUrlFeedback) playerCustomUrlFeedback.textContent = ''; videoContainer.style.display = 'flex'; if (playerCustomUrlInput) { setTimeout(() => playerCustomUrlInput.focus(), 50); } }
    function handleGlobalPlayCustomUrl(event) { event.preventDefault(); if (!playerCustomUrlInput || !playerCustomUrlFeedback) return; const customUrlRaw = playerCustomUrlInput.value.trim(); playerCustomUrlFeedback.textContent = ''; if (!customUrlRaw) { playerCustomUrlFeedback.textContent = 'Please enter a URL.'; playerCustomUrlInput.focus(); return; } let customUrlEncoded = customUrlRaw; try { new URL(customUrlRaw); customUrlEncoded = customUrlRaw.replace(/ /g, '%20'); } catch (e) { playerCustomUrlFeedback.textContent = 'Invalid URL format.'; playerCustomUrlInput.focus(); return; } if(playerCustomUrlSection) playerCustomUrlSection.style.display = 'none'; if(videoElement) videoElement.style.display = 'block'; if(customControlsContainer) customControlsContainer.style.display = 'flex'; streamVideo("Custom URL Video", customUrlEncoded, null, true); }
    function toggleCustomUrlInput(toggleButton, triggeredByError = false) {
        // Context is now selectedFileActionsWrapper for the custom URL toggle related to a playing file
        const contextContainer = toggleButton.closest('#selected-file-actions-wrapper') || toggleButton.closest('#videoContainer');
        if (!contextContainer || !videoContainer || !playerCustomUrlSection || !videoElement || !customControlsContainer) return;

        // If toggling from item detail, ensure video player is a child of selectedFileActionsWrapper
        if (contextContainer.id === 'selected-file-actions-wrapper' && videoContainer.parentElement !== contextContainer) {
            if (videoContainer.parentElement) videoContainer.parentElement.removeChild(videoContainer);
             if (itemDetailContent && itemDetailContent.parentNode === contextContainer) { // Insert after file actions
                 contextContainer.insertBefore(videoContainer, itemDetailContent.nextSibling);
            } else {
                contextContainer.appendChild(videoContainer);
            }
            if (videoElement.hasAttribute('src')) { videoElement.pause(); videoElement.removeAttribute('src'); videoElement.currentTime = 0; videoElement.load(); }
            if (vlcBox) vlcBox.style.display = 'none';
            if (audioWarningDiv) audioWarningDiv.style.display = 'none';
            if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; }
            clearCopyFeedback();
        }

        const isHidden = playerCustomUrlSection.style.display === 'none';
        playerCustomUrlSection.style.display = isHidden ? 'flex' : 'none';
        videoElement.style.display = isHidden ? 'none' : 'block'; // Hide video if showing custom URL input
        customControlsContainer.style.display = isHidden ? 'none' : 'flex';
        if(vlcBox) vlcBox.style.display = isHidden ? 'none' : 'block';

        if(audioWarningDiv) {
            if (isHidden && audioWarningDiv.style.display !== 'none' && !audioWarningDiv.innerHTML.includes('Playback Error:')) {
                audioWarningDiv.style.display = 'none';
            } else if (!isHidden && audioWarningDiv.style.display === 'none' && currentItemDetailData) { // If showing video player again
                const fileData = currentItemDetailData; // Currently selected file
                if (fileData && fileData.displayFilename) {
                    const ddp51Regex = /\bDDP?([ ._-]?5\.1)?\b/i; const advancedAudioRegex = /\b(DTS|ATMOS|TrueHD)\b/i; const multiAudioHintRegex = /\b(Multi|Dual)[ ._-]?Audio\b/i; let warningText = ""; const lowerFilename = fileData.displayFilename.toLowerCase();
                    if (ddp51Regex.test(lowerFilename)) warningText = "<strong>Audio Note:</strong> DDP audio might not work. Use external player.";
                    else if (advancedAudioRegex.test(lowerFilename)) warningText = "<strong>Audio Note:</strong> DTS/Atmos/TrueHD audio likely unsupported. Use external player.";
                    else if (multiAudioHintRegex.test(lowerFilename)) warningText = "<strong>Audio Note:</strong> May contain multiple audio tracks. Use external player.";
                    if(warningText) { audioWarningDiv.innerHTML = warningText; audioWarningDiv.style.display = 'block'; }
                }
            }
        }

        if (videoContainer.style.display === 'none') videoContainer.style.display = 'flex';
        toggleButton.setAttribute('aria-expanded', String(isHidden));
        toggleButton.innerHTML = isHidden ? '<span aria-hidden="true">🔼</span> Hide Custom URL Input' : '<span aria-hidden="true">🔗</span> Play Custom URL';
        if (isHidden && !triggeredByError) { if (playerCustomUrlInput) setTimeout(() => playerCustomUrlInput.focus(), 50); }
        else if (!isHidden) { setTimeout(() => toggleButton.focus(), 50); }
        setTimeout(() => { videoContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150);
    }
    function playFromCustomUrlInput(playButton) { const container = playButton.closest('#playerCustomUrlSection'); if (!container) return; const inputField = container.querySelector('#playerCustomUrlInput'); const feedbackSpan = container.querySelector('.player-custom-url-feedback'); const titleRef = "Custom URL Video"; if (!inputField || !feedbackSpan) return; const customUrlRaw = inputField.value.trim(); feedbackSpan.textContent = ''; if (!customUrlRaw) { feedbackSpan.textContent = 'Please enter a URL.'; inputField.focus(); return; } let customUrlEncoded = customUrlRaw; try { new URL(customUrlRaw); customUrlEncoded = customUrlRaw.replace(/ /g, '%20'); } catch (e) { feedbackSpan.textContent = 'Invalid URL format.'; inputField.focus(); return; } isGlobalCustomUrlMode = false; if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none'; if (videoElement) videoElement.style.display = 'block'; if (customControlsContainer) customControlsContainer.style.display = 'flex'; streamVideo(titleRef, customUrlEncoded, null, true); }

    // --- HubCloud/GDFLIX Bypass Logic (Operates on currentItemDetailData - the selected file) ---
    async function triggerHubCloudBypass(buttonElement) {
        const hubcloudUrl = buttonElement.dataset.hubcloudUrl;
        const fileId = buttonElement.dataset.fileId; // Get file ID from button
        if (!hubcloudUrl) { setBypassButtonState(buttonElement, 'error', 'Missing URL'); return; }
        if (!currentItemDetailData || String(currentItemDetailData.id) !== String(fileId)) {
            setBypassButtonState(buttonElement, 'error', 'Context Error (File mismatch)'); return;
        }
        setBypassButtonState(buttonElement, 'loading');
        const apiController = new AbortController(); const timeoutId = setTimeout(() => { apiController.abort(); setBypassButtonState(buttonElement, 'error', 'Timeout'); }, config.BYPASS_TIMEOUT);
        try {
            const response = await fetch(config.BYPASS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hubcloudUrl }), signal: apiController.signal }); clearTimeout(timeoutId); if (!response.ok) { let errorDetails = `HTTP Error: ${response.status}`; try { errorDetails = (await response.json()).details || errorDetails; } catch (_) {} throw new Error(errorDetails); }
            const result = await response.json(); if (result.success && result.finalUrl) { const encodedFinalUrl = result.finalUrl.replace(/ /g, '%20'); setBypassButtonState(buttonElement, 'success', 'Success!'); updateItemDetailAfterBypass(encodedFinalUrl); } else { throw new Error(result.details || result.error || 'Unknown HubCloud bypass failure'); }
        } catch (error) { clearTimeout(timeoutId); if (error.name === 'AbortError' && !apiController.signal.aborted) { setBypassButtonState(buttonElement, 'error', 'Timeout'); } else if (error.name === 'AbortError') { setBypassButtonState(buttonElement, 'idle'); } else { setBypassButtonState(buttonElement, 'error', `Failed: ${error.message.substring(0, 50)}`); } }
    }
    async function triggerGDFLIXBypass(buttonElement) {
        const gdflixUrl = buttonElement.dataset.gdflixUrl;
        const fileId = buttonElement.dataset.fileId; // Get file ID
        if (!gdflixUrl) { setBypassButtonState(buttonElement, 'error', 'Missing URL'); return; }
        if (!currentItemDetailData || String(currentItemDetailData.id) !== String(fileId)) {
            setBypassButtonState(buttonElement, 'error', 'Context Error (File mismatch)'); return;
        }
        setBypassButtonState(buttonElement, 'loading');
        const apiController = new AbortController(); const timeoutId = setTimeout(() => { apiController.abort(); setBypassButtonState(buttonElement, 'error', 'Timeout'); }, config.BYPASS_TIMEOUT);
        try {
            const response = await fetch(config.GDFLIX_BYPASS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gdflixUrl }), signal: apiController.signal }); clearTimeout(timeoutId); if (!response.ok) { let errorDetails = `HTTP Error: ${response.status}`; try { errorDetails = (await response.json()).error || errorDetails; } catch (_) {} throw new Error(errorDetails); }
            const result = await response.json(); if (result.success && result.finalUrl) { const encodedFinalUrl = result.finalUrl.replace(/ /g, '%20'); setBypassButtonState(buttonElement, 'success', 'Success!'); updateItemDetailAfterBypass(encodedFinalUrl); } else { throw new Error(result.error || 'Unknown GDFLIX bypass failure'); }
        } catch (error) { clearTimeout(timeoutId); if (error.name === 'AbortError' && !apiController.signal.aborted) { setBypassButtonState(buttonElement, 'error', 'Timeout'); } else if (error.name === 'AbortError') { setBypassButtonState(buttonElement, 'idle'); } else { setBypassButtonState(buttonElement, 'error', `Failed: ${error.message.substring(0, 50)}`); } }
    }
    function setBypassButtonState(buttonElement, state, message = null) { if (!buttonElement) return; const feedbackSpan = buttonElement.nextElementSibling; const iconSpan = buttonElement.querySelector('.button-icon'); const spinnerSpan = buttonElement.querySelector('.button-spinner'); const textSpan = buttonElement.querySelector('.button-text'); const isHubCloud = buttonElement.classList.contains('hubcloud-bypass-button'); const defaultText = isHubCloud ? 'Bypass HubCloud' : 'Bypass GDFLIX'; const defaultIconHTML = isHubCloud ? '☁️' : '🎬'; buttonElement.classList.remove('loading', 'error', 'success'); buttonElement.disabled = false; if (feedbackSpan) { feedbackSpan.style.display = 'none'; feedbackSpan.className = 'bypass-feedback'; } if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; clearTimeout(bypassFeedbackTimeout); switch (state) { case 'loading': buttonElement.classList.add('loading'); buttonElement.disabled = true; if (textSpan) textSpan.textContent = 'Bypassing...'; if (spinnerSpan) spinnerSpan.style.display = 'inline-block'; if (iconSpan) iconSpan.style.display = 'none'; if (feedbackSpan) { feedbackSpan.textContent = 'Please wait...'; feedbackSpan.classList.add('loading', 'show'); feedbackSpan.style.display = 'inline-block'; } break; case 'success': buttonElement.classList.add('success'); buttonElement.disabled = true; if (textSpan) textSpan.textContent = 'Success!'; if (iconSpan) iconSpan.innerHTML = '✅'; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.textContent = message || 'Success!'; feedbackSpan.classList.add('success', 'show'); feedbackSpan.style.display = 'inline-block'; } break; case 'error': buttonElement.classList.add('error'); buttonElement.disabled = false; if (textSpan) textSpan.textContent = defaultText; if (iconSpan) iconSpan.innerHTML = defaultIconHTML; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.textContent = message || 'Failed'; feedbackSpan.classList.add('error', 'show'); feedbackSpan.style.display = 'inline-block'; bypassFeedbackTimeout = setTimeout(() => { if (feedbackSpan.classList.contains('show')) { feedbackSpan.classList.remove('show', 'error', 'loading'); feedbackSpan.style.display = 'none'; feedbackSpan.textContent = ''; } }, 4000); } break; case 'idle': default: buttonElement.disabled = false; if (textSpan) textSpan.textContent = defaultText; if (iconSpan) iconSpan.innerHTML = defaultIconHTML; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.classList.remove('show', 'error', 'loading'); feedbackSpan.style.display = 'none'; feedbackSpan.textContent = ''; } break; } }

    // --- Event Delegation Setup ---
     function handleContentClick(event) {
         const target = event.target;
         // 1. Grid item (group poster) click
         const gridItemTrigger = target.closest('.grid-item, .update-item');
         if (gridItemTrigger) {
             event.preventDefault();
             const groupKey = gridItemTrigger.dataset.groupKey;
             if (groupKey) {
                 navigateToGroupView(groupKey);
             } else { console.error("Could not find group key for grid item navigation."); }
             return;
         }

         // 2. File item click within a group's file list
         const fileItemInGroupTrigger = target.closest('.file-item-in-group');
         if (fileItemInGroupTrigger && fileItemInGroupTrigger.closest('#group-files-list-container')) {
             event.preventDefault();
             const fileId = fileItemInGroupTrigger.dataset.fileId;
             if (fileId) {
                 handleFileSelectionInGroup(fileId);
             } else { console.error("Could not find file ID for file item selection."); }
             return;
         }

         // 3. Action button click (for selected file)
         if (target.closest('#item-detail-content')) { // This is now #selected-file-actions-wrapper's child
             handleActionClick(event); // This function now expects currentItemDetailData to be set
             return;
         }

         // 4. Player close button
         if (target.matches('.close-btn') && target.closest('#videoContainer')) {
             event.preventDefault(); lastFocusedElement = target; closePlayer(lastFocusedElement); return;
         }

         // 5. Sorting (if you re-add table headers for sorting groups)
         // if (target.closest('th.sortable')) { handleSort(event); return; }
    }

    // --- Add Event Listeners ---
    document.addEventListener('DOMContentLoaded', async () => {
         await initializeApp();
         if (searchInput) { searchInput.addEventListener('input', handleSearchInput); searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSearchSubmit(); } else if (event.key === 'Escape') { suggestionsContainer.style.display = 'none'; } }); searchInput.addEventListener('search', handleSearchClear); searchInput.addEventListener('blur', () => { setTimeout(() => { const searchButton = document.getElementById('searchSubmitButton'); if (document.activeElement !== searchInput && !suggestionsContainer.contains(document.activeElement) && document.activeElement !== searchButton) { suggestionsContainer.style.display = 'none'; } }, 150); }); }
         if (qualityFilterSelect) { qualityFilterSelect.addEventListener('change', triggerFilterChange); }
         if (container) { container.addEventListener('click', handleContentClick); } // Main click delegation
         if (playCustomUrlGlobalButton) { playCustomUrlGlobalButton.addEventListener('click', handleGlobalCustomUrlClick); }
         document.addEventListener('keydown', handlePlayerKeyboardShortcuts);
         document.addEventListener('click', (event) => { // For closing suggestions/player on outside click
            if (searchInput && suggestionsContainer && suggestionsContainer.style.display === 'block') { const searchWrapper = searchInput.closest('.search-input-wrapper'); if (searchWrapper && !searchWrapper.contains(event.target)) { suggestionsContainer.style.display = 'none'; } }
            if (videoContainer && videoContainer.style.display !== 'none' && !isGlobalCustomUrlMode) {
                const clickedInsidePlayer = videoContainer.contains(event.target);
                // Check if clicked inside the broader item detail view that might host the player
                const clickedInsideItemDetail = itemDetailView && itemDetailView.style.display !== 'none' && itemDetailView.contains(event.target);
                if (!clickedInsidePlayer && !clickedInsideItemDetail) {
                    let clickedOnPotentialTrigger = false; if (lastFocusedElement) { clickedOnPotentialTrigger = lastFocusedElement === event.target || lastFocusedElement.contains(event.target); }
                    if (!clickedOnPotentialTrigger) closePlayer(event.target);
                }
            } else if (videoContainer && videoContainer.style.display !== 'none' && isGlobalCustomUrlMode) {
                const clickedInsidePlayer = videoContainer.contains(event.target); const clickedOnGlobalTrigger = playCustomUrlGlobalButton && playCustomUrlGlobalButton.contains(event.target);
                if (!clickedInsidePlayer && !clickedOnGlobalTrigger) closePlayer(event.target);
            }
         }, false);
         if(videoElement) { videoElement.addEventListener('volumechange', () => { if (volumeSlider && Math.abs(parseFloat(volumeSlider.value) - videoElement.volume) > 0.01) { volumeSlider.value = videoElement.volume; } updateMuteButton(); try { localStorage.setItem(config.PLAYER_VOLUME_KEY, String(videoElement.volume)); } catch (e) {} }); videoElement.addEventListener('ratechange', () => { if(playbackSpeedSelect && playbackSpeedSelect.value !== String(videoElement.playbackRate)) { playbackSpeedSelect.value = String(videoElement.playbackRate); } try { localStorage.setItem(config.PLAYER_SPEED_KEY, String(videoElement.playbackRate)); } catch (e) {} }); videoElement.addEventListener('loadedmetadata', populateAudioTrackSelector); videoElement.removeEventListener('error', handleVideoError); videoElement.addEventListener('error', handleVideoError); }
         document.addEventListener('fullscreenchange', handleFullscreenChange); document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
     });

})();
// --- END OF script.js (GROUPING v2) ---
