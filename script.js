// --- START OF SCRIPT.JS (RESTRUCTURED FOR GROUPING, GROUP DETAIL VIEW, AND FILE ACTIONS) ---
(function() {
    'use strict';

    // ===========================================================
    // JAVASCRIPT SECTION (Restructured for Grouping & New Views)
    // ===========================================================
    const config = {
        HDR_LOGO_URL: "https://as1.ftcdn.net/v2/jpg/05/32/83/72/1000_F_532837228_v8CGZRU0jy39uCtqFRnJz6xDntrGuLLx.webp",
        FOURK_LOGO_URL: "https://i.pinimg.com/736x/85/c4/b0/85c4b0a2fb8612825d0cd2f53460925f.jpg",
        ITEMS_PER_PAGE: 50, // This will now apply to groups per page
        LOCAL_STORAGE_KEY: 'cinemaGharState_v18_grouping', // Incremented version
        PLAYER_VOLUME_KEY: 'cinemaGharPlayerVolume',
        PLAYER_SPEED_KEY: 'cinemaGharPlayerSpeed',
        SEARCH_DEBOUNCE_DELAY: 300,
        SUGGESTIONS_DEBOUNCE_DELAY: 250,
        MAX_SUGGESTIONS: 50, // Suggestions will still be based on individual files
        UPDATES_PREVIEW_INITIAL_COUNT: 12, // Groups for preview
        UPDATES_PREVIEW_LOAD_MORE_COUNT: 12, // Groups for load more
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
    const itemDetailView = document.getElementById('item-detail-view'); // Will be mostly unused or repurposed
    const itemDetailContent = document.getElementById('item-detail-content'); // Will be mostly unused

    // NEW: Group Detail View Elements
    const groupDetailView = document.getElementById('group-detail-view');
    const groupDetailHeaderContent = document.getElementById('group-detail-header-content');
    const groupDetailFileList = document.getElementById('group-detail-file-list');
    const groupDetailFileActionsContainer = document.getElementById('group-detail-file-actions-container');
    const groupDetailFileActionsContent = document.getElementById('group-detail-file-actions-content');
    const backToResultsFromGroupButton = document.getElementById('backToResultsFromGroupButton');
    const backToHomeFromGroupButton = document.getElementById('backToHomeFromGroupButton');


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

    const allFilesGridContainer = document.getElementById('allFilesGridContainer');
    const moviesGridContainer = document.getElementById('moviesGridContainer');
    const seriesGridContainer = document.getElementById('seriesGridContainer');

    const allFilesPaginationControls = document.getElementById('allFilesPaginationControls');
    const moviesPaginationControls = document.getElementById('moviesPaginationControls');
    const seriesPaginationControls = document.getElementById('seriesPaginationControls');
    const backToHomeButtonResults = document.getElementById('backToHomeButtonResults');
    // const backToHomeButtonShared = document.getElementById('backToHomeButtonShared'); // Less relevant now
    // const backToResultsButton = document.getElementById('backToResultsButton'); // Less relevant now
    const pageFooter = document.getElementById('page-footer');
    const playerCustomUrlSection = document.getElementById('playerCustomUrlSection');
    const playerCustomUrlInput = document.getElementById('playerCustomUrlInput');
    const playerPlayCustomUrlButton = document.getElementById('playerPlayCustomUrlButton');
    const playerCustomUrlFeedback = playerCustomUrlSection?.querySelector('.player-custom-url-feedback');
    const playCustomUrlGlobalButton = document.getElementById('playCustomUrlGlobalButton');

    // --- State Variables ---
    let rawFetchedFilesData = []; // Stores raw files from API before grouping for current search
    let groupedDataForCurrentView = []; // Stores the GROUPS for the current search/tab
    let weeklyUpdatesGroupedData = []; // Stores GROUPS for updates preview
    let currentGroupDetailData = null; // Stores the currently viewed GROUP object
    let currentSelectedFileForActions = null; // Stores the FILE object selected within a group for actions

    let localSuggestionData = []; // For search suggestions, still based on individual filenames
    // let currentSearchResultsData = []; // Replaced by groupedDataForCurrentView
    // let weeklyUpdatesData = []; // Replaced by weeklyUpdatesGroupedData
    // let currentItemDetailData = null; // Replaced by currentGroupDetailData and currentSelectedFileForActions

    let updatesPreviewShownCount = 0; // Tracks number of groups shown in preview
    let uniqueQualities = new Set();
    let copyFeedbackTimeout;
    let bypassFeedbackTimeout;
    let suggestionDebounceTimeout;
    let searchAbortController = null;
    let detailFetchAbortController = null; // For fetching details of a group or file
    let isInitialLoad = true;
    let currentViewMode = 'homepage'; // 'homepage', 'search', 'groupDetail'
    // let isShareMode = false; // Share logic might need rethinking with groups
    let activeResultsTab = 'allFiles';
    let lastFocusedElement = null;
    let isGlobalCustomUrlMode = false;
    let globalTmdbCache = new Map(); // Cache for TMDb group details

    let currentState = {
        searchTerm: '',
        qualityFilter: '',
        typeFilter: '', // 'movies', 'series', or ''
        sortColumn: 'lastUpdated', // Sorting might apply to groups based on representative file
        sortDirection: 'desc',
        currentPage: 1, // For paginating groups
        limit: config.ITEMS_PER_PAGE, // Groups per page
        activeGroupKey: null, // For remembering which group detail page we are on
        selectedFileIdInGroup: null // For remembering which file was selected for actions
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
        // NEW: Toggle custom URL input within the group detail file actions if error
        if (!isGlobalCustomUrlMode && currentViewMode === 'groupDetail' && groupDetailFileActionsContent) {
            const customUrlToggleButton = groupDetailFileActionsContent.querySelector('.custom-url-toggle-button');
            if (customUrlToggleButton) {
                customUrlToggleButton.style.display = 'inline-flex';
                if (playerCustomUrlSection && playerCustomUrlSection.style.display === 'none') {
                    // This needs careful handling: toggleCustomUrlInput now acts on playerCustomUrlSection within videoContainer
                    // We need to ensure videoContainer is correctly placed if not already.
                    // For simplicity, we assume player is already visible or streamVideo was called.
                    toggleCustomUrlInputVisibility(true); // Directly manage visibility for this case
                }
                setTimeout(() => { customUrlToggleButton.focus(); }, 100);
            }
        } else if (isGlobalCustomUrlMode) { if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'flex'; if (videoElement) videoElement.style.display = 'none'; if (customControlsContainer) customControlsContainer.style.display = 'none'; }
    }
    function extractQualityFromFilename(filename) { if (!filename) return null; const safeFilename = String(filename); const patterns = [ /(?:^|\.|\[|\(|\s|_|-)((?:4k|2160p|1080p|720p|480p))(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(WEB-?DL|WEBRip|BluRay|BDRip|BRRip|HDTV|HDRip|DVDrip|DVDScr|HDCAM|HC|TC|TS|CAM)(?=$|\.|\]|\)|\s|_|-)/i, /(?:^|\.|\[|\(|\s|_-)(HDR|DV|Dolby.?Vision|HEVC|x265)(?=$|\.|\]|\)|\s|_|-)/i ]; let foundQuality = null; for (const regex of patterns) { const match = safeFilename.match(regex); if (match && match[1]) { let quality = match[1].toUpperCase(); quality = quality.replace(/WEB-?DL/i, 'WEBDL'); quality = quality.replace(/BLURAY/i, 'BluRay'); quality = quality.replace(/DVDRIP/i, 'DVD'); quality = quality.replace(/DOLBY.?VISION/i, 'Dolby Vision'); if (quality === '2160P') quality = '4K'; if (patterns.indexOf(regex) < 2) return quality; if (patterns.indexOf(regex) === 2 && !foundQuality) foundQuality = quality; } } return foundQuality; }
    function normalizeTextForSearch(text) { if (!text) return ""; return String(text).toLowerCase().replace(/[.\-_\(\)\[\]]/g, '').replace(/\s+/g, ' ').trim(); }
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    async function copyToClipboard(text, feedbackSpan) { let success = false; if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) { try { await navigator.clipboard.writeText(text); success = true; } catch (err) { success = false; } } if (!success) { const textArea = document.createElement("textarea"); textArea.value = text; textArea.style.position = "fixed"; textArea.style.top = "-9999px"; textArea.style.left = "-9999px"; textArea.style.opacity = "0"; textArea.setAttribute("readonly", ""); document.body.appendChild(textArea); try { textArea.select(); textArea.setSelectionRange(0, textArea.value.length); success = document.execCommand('copy'); } catch (err) { success = false; } finally { document.body.removeChild(textArea); } } if (success) { if (feedbackSpan) showCopyFeedback(feedbackSpan, 'Copied!', false); } else { if (feedbackSpan) showCopyFeedback(feedbackSpan, 'Copy Failed!', true); else alert("Copy failed."); } return success; }

    // --- Data Preprocessing and Grouping ---
    function preprocessMovieData(movie) {
        const processed = { ...movie };
        processed.id = movie.original_id || movie.id; // Ensure 'id' is consistently original_id
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
        processed.numericId = typeof processed.id === 'number' ? processed.id : Infinity;
        processed.searchText = normalizeTextForSearch(`${processed.id || ''} ${processed.displayFilename}`);
        processed.isSeries = !!movie.is_series; // Use is_series from DB if available
        processed.extractedTitle = null; processed.extractedYear = null; processed.extractedSeason = null;
        processed.tmdbDetails = movie.tmdbDetails || null; // This will be for the group, not individual file initially

        const filename = processed.displayFilename;
        if (filename) {
            let cleanedName = filename;
            const qualityTagsRegex = /(\b(4k|2160p|1080p|720p|480p|web-?dl|webrip|bluray|bdrip|brrip|hdtv|hdrip|dvdrip|dvdscr|hdcam|hc|tc|ts|cam|hdr|dv|dolby.?vision|hevc|x265)\b)/gi;
            cleanedName = cleanedName.replace(qualityTagsRegex, '');
            const seasonEpisodeMatch = cleanedName.match(/[. (_-](S(\d{1,2}))(?:E(\d{1,3}))?/i) || cleanedName.match(/[. (_-](Season[. _]?(\d{1,2}))(?:[. _-]?Episode[. _]?(\d{1,3}))?/i);

            if (seasonEpisodeMatch) {
                processed.extractedSeason = parseInt(seasonEpisodeMatch[2] || seasonEpisodeMatch[4], 10);
                // processed.extractedEpisode = (seasonEpisodeMatch[3] || seasonEpisodeMatch[5]) ? parseInt(seasonEpisodeMatch[3] || seasonEpisodeMatch[5], 10) : null;
                processed.isSeries = true;
                const titleEndIndex = seasonEpisodeMatch.index;
                processed.extractedTitle = cleanedName.substring(0, titleEndIndex).replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
                const yearInTitleMatch = processed.extractedTitle.match(/[.(_[](\d{4})[.)_\]]$/);
                if (yearInTitleMatch && yearInTitleMatch[1]) {
                    const potentialYear = parseInt(yearInTitleMatch[1], 10);
                    if (potentialYear > 1900 && potentialYear < 2050) {
                        processed.extractedYear = potentialYear;
                        processed.extractedTitle = processed.extractedTitle.replace(new RegExp(`[.(_[]${potentialYear}[.)_\]]$`), '').trim();
                    }
                }
            } else { // Not a season match, assume movie or series without SxxExx
                processed.isSeries = !!movie.is_series; // Rely on DB flag first for non SxxExx
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
        }
        // Create a normalized key for grouping
        processed.groupKey = createNormalizedGroupKey(processed);
        return processed;
    }

    // NEW: Create a normalized key for grouping movies/series
    function createNormalizedGroupKey(movie) {
        let title = (movie.extractedTitle || 'untitled').toLowerCase().replace(/[^a-z0-9]/g, '');
        let year = movie.extractedYear || 'noyear';
        let type = movie.isSeries ? 'tv' : 'movie';
        // For series, a season number might be part of the key if we want to group by season eventually
        // For now, just title, year, type for main grouping.
        // let season = movie.isSeries && movie.extractedSeason ? `s${movie.extractedSeason}` : 'noseason';
        // return `${type}_${title}_${year}_${season}`;
        return `${type}_${title}_${year}`;
    }

    // NEW: Group files by their normalized title key
    function groupFilesByTitle(filesArray) {
        if (!filesArray || filesArray.length === 0) return [];
        const groups = new Map();
        filesArray.forEach(file => {
            const key = file.groupKey;
            if (!groups.has(key)) {
                groups.set(key, {
                    groupKey: key,
                    displayTitle: file.extractedTitle || file.displayFilename.split(/[\.\(\[]/)[0].trim(),
                    year: file.extractedYear,
                    isSeries: file.isSeries,
                    // Find a representative file for TMDb lookup, preferably one with a good title extraction
                    representativeFile: file, // Can be refined to pick "best" file
                    files: [],
                    tmdbDetails: null, // Placeholder for TMDb data for the group
                    lastUpdatedTimestamp: 0 // To be set by the most recent file in the group
                });
            }
            const group = groups.get(key);
            group.files.push(file);
            if (file.lastUpdatedTimestamp > group.lastUpdatedTimestamp) {
                group.lastUpdatedTimestamp = file.lastUpdatedTimestamp;
                group.representativeFile = file; // Update representative if this file is newer
            }
        });

        // Sort files within each group (e.g., by filename, quality, or season/episode if available)
        groups.forEach(group => {
            group.files.sort((a, b) => {
                // Example: sort by season, then episode, then filename
                if (a.isSeries && b.isSeries) {
                    if (a.extractedSeason !== b.extractedSeason) {
                        return (a.extractedSeason || 0) - (b.extractedSeason || 0);
                    }
                    // Add episode sorting if extractedEpisode becomes available
                    // if (a.extractedEpisode !== b.extractedEpisode) {
                    // return (a.extractedEpisode || 0) - (b.extractedEpisode || 0);
                    // }
                }
                return a.displayFilename.localeCompare(b.displayFilename);
            });
        });
        return Array.from(groups.values());
    }

    // --- HTML Generation ---

    // NEW: HTML for a group item in the grid
    function createGroupGridItemHTML(group) {
        const card = document.createElement('div');
        card.className = 'grid-item'; // Use 'update-item' class if for updates preview for shared styles
        if (updatesPreviewList && updatesPreviewList.contains(event?.target?.closest('.update-item'))) {
            card.classList.add('update-item');
        }

        card.dataset.groupKey = sanitize(group.groupKey);
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        const baseTitleForAria = group.displayTitle || 'Unknown Title';
        card.setAttribute('aria-label', `View details for ${sanitize(baseTitleForAria)}`);

        let fourkLogoHtml = '';
        let hdrLogoHtml = '';
        // Check representative file or all files in group for quality badges
        const has4K = group.files.some(f => f.displayQuality === '4K' || (f.displayFilename || '').toLowerCase().includes('2160p') || (f.displayFilename || '').toLowerCase().includes('.4k.'));
        const hasHDR = group.files.some(f => (f.displayQuality || '').includes('HDR') || (f.displayQuality || '').includes('DOLBY VISION') || f.displayQuality === 'DV' || (f.displayFilename || '').toLowerCase().includes('hdr'));

        if (has4K) {
            fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo-badge fourk-logo-badge" title="4K Ultra HD Available" />`;
        }
        if (hasHDR) {
            hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo-badge hdr-logo-badge" title="HDR / Dolby Vision Content Available" />`;
        }

        const initialSpinnerDisplay = (!group.tmdbDetails?.posterPathFetched && !group.tmdbDetails?.posterPathFetchFailed) ? 'block' : 'none';

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
            if (group && parentPosterContainer) {
                setupFallbackDisplayForGroup(group, parentPosterContainer);
            }
            const localSpinner = parentPosterContainer ? parentPosterContainer.querySelector('.poster-spinner') : null;
            if (localSpinner) localSpinner.style.display = 'none';
        };

        if (group.tmdbDetails?.posterPath) {
            imgElement.src = group.tmdbDetails.posterPath;
            if (spinnerElement) spinnerElement.style.display = 'none';
        } else if (!group.tmdbDetails?.posterPathFetched && !group.tmdbDetails?.posterPathFetchFailed) {
            fetchPosterForGroup(group, imgElement, spinnerElement, posterContainer);
        } else {
            setupFallbackDisplayForGroup(group, posterContainer);
            if (spinnerElement) spinnerElement.style.display = 'none';
        }
        return card;
    }

    // NEW: Setup fallback display for a group
    function setupFallbackDisplayForGroup(group, posterContainer) {
        if (!group || !posterContainer) return;
        const img = posterContainer.querySelector('.poster-image');
        const fallbackContent = posterContainer.querySelector('.poster-fallback-content');
        if (!fallbackContent) return;

        const titleEl = fallbackContent.querySelector('.fallback-title');
        const yearEl = fallbackContent.querySelector('.fallback-year');

        if (img) img.style.display = 'none';

        if (titleEl) titleEl.textContent = group.displayTitle || 'Unknown Title';
        if (yearEl) yearEl.textContent = group.year ? String(group.year) : (group.isSeries ? 'Series' : '');

        fallbackContent.style.display = 'flex';
    }


    // MODIFIED: Fetch poster for a group using its representative file
    async function fetchPosterForGroup(group, imgElement, spinnerElement, posterContainerElement) {
        if (!imgElement || !posterContainerElement) {
            console.warn("fetchPosterForGroup called with invalid elements for group:", group?.displayTitle);
            if (spinnerElement) spinnerElement.style.display = 'none';
            if (group && posterContainerElement) setupFallbackDisplayForGroup(group, posterContainerElement);
            return;
        }
        const fallbackContentElement = posterContainerElement.querySelector('.poster-fallback-content');

        if (!group || !group.representativeFile || !group.representativeFile.extractedTitle || group.tmdbDetails?.posterPathFetched || group.tmdbDetails?.posterPathFetchFailed) {
            if (spinnerElement) spinnerElement.style.display = 'none';
            if (group?.tmdbDetails?.posterPath) {
                if (imgElement.src !== group.tmdbDetails.posterPath) imgElement.src = group.tmdbDetails.posterPath;
                imgElement.style.display = 'block';
                if (fallbackContentElement) fallbackContentElement.style.display = 'none';
            } else {
                 if (group) setupFallbackDisplayForGroup(group, posterContainerElement);
            }
            return;
        }

        if (spinnerElement) spinnerElement.style.display = 'block';
        imgElement.style.display = 'block';
        if (fallbackContentElement) fallbackContentElement.style.display = 'none';

        // Check global cache first
        if (globalTmdbCache.has(group.groupKey) && globalTmdbCache.get(group.groupKey).posterPath) {
            group.tmdbDetails = globalTmdbCache.get(group.groupKey);
            imgElement.src = group.tmdbDetails.posterPath;
            imgElement.style.display = 'block';
            if (spinnerElement) spinnerElement.style.display = 'none';
            return;
        }


        try {
            const tmdbQuery = new URLSearchParams();
            tmdbQuery.set('query', group.representativeFile.extractedTitle);
            tmdbQuery.set('type', group.isSeries ? 'tv' : 'movie');
            if (!group.isSeries && group.year) {
                tmdbQuery.set('year', group.year);
            }
            // Important: For group detail view, we want more data
            tmdbQuery.set('fetchFullDetails', 'true');
            const tmdbUrl = `${config.TMDB_API_PROXY_URL}?${tmdbQuery.toString()}`;
            const tmdbController = new AbortController();
            const tmdbTimeoutId = setTimeout(() => tmdbController.abort(), config.TMDB_FETCH_TIMEOUT);

            const tmdbResponse = await fetch(tmdbUrl, { signal: tmdbController.signal });
            clearTimeout(tmdbTimeoutId);

            if (!group.tmdbDetails) group.tmdbDetails = {};

            if (tmdbResponse.ok) {
                const fetchedTmdbData = await tmdbResponse.json();
                if (fetchedTmdbData) {
                    group.tmdbDetails = fetchedTmdbData; // Store all fetched data (poster, overview, etc.)
                    globalTmdbCache.set(group.groupKey, fetchedTmdbData); // Update cache

                    if (fetchedTmdbData.posterPath) {
                        imgElement.src = fetchedTmdbData.posterPath;
                        imgElement.style.display = 'block';
                        if (fallbackContentElement) fallbackContentElement.style.display = 'none';
                    } else {
                        setupFallbackDisplayForGroup(group, posterContainerElement);
                    }
                } else {
                    setupFallbackDisplayForGroup(group, posterContainerElement);
                    group.tmdbDetails.posterPathFetchFailed = true;
                }
            } else {
                setupFallbackDisplayForGroup(group, posterContainerElement);
                group.tmdbDetails.posterPathFetchFailed = true;
            }
            group.tmdbDetails.posterPathFetched = true;
        } catch (tmdbError) {
            if (tmdbError.name !== 'AbortError') {
                console.error(`Error fetching TMDb poster for group "${group.displayTitle}":`, tmdbError);
            }
            setupFallbackDisplayForGroup(group, posterContainerElement);
            if (!group.tmdbDetails) group.tmdbDetails = {};
            group.tmdbDetails.posterPathFetchFailed = true;
            group.tmdbDetails.posterPathFetched = true;
        } finally {
            if (spinnerElement) spinnerElement.style.display = 'none';
        }
    }

    // NEW: HTML for the header of the Group Detail view (TMDb info)
    // NEW: HTML for the header of the Group Detail view (TMDb info)
function createGroupDetailHeaderHTML(group) {
    if (!group || !group.tmdbDetails) {
        // Try to use group's own displayTitle if TMDb details are missing
        const fallbackTitle = group.displayTitle || 'Unknown Item';
        return `<div class="tmdb-fetch-failed">Could not load details for ${sanitize(fallbackTitle)}.</div>`;
    }
    const tmdbDetails = group.tmdbDetails;
    const posterHTML = tmdbDetails.posterPath ? `<img src="${sanitize(tmdbDetails.posterPath)}" alt="Poster for ${sanitize(tmdbDetails.title || group.displayTitle)}" class="tmdb-poster">` : '<div class="tmdb-poster-placeholder">No Poster</div>';
    const ratingHTML = tmdbDetails.voteAverage && tmdbDetails.voteCount ? `<span class="tmdb-rating" title="${tmdbDetails.voteCount} votes">⭐ ${sanitize(tmdbDetails.voteAverage)}/10</span>` : '';
    const genresHTML = tmdbDetails.genres && tmdbDetails.genres.length > 0 ? `<div class="tmdb-genres"><strong>Genres:</strong> ${tmdbDetails.genres.map(g => `<span class="genre-tag">${sanitize(g)}</span>`).join(' ')}</div>` : '';
    const overviewHTML = tmdbDetails.overview ? `<div class="tmdb-overview"><strong>Overview:</strong><p>${sanitize(tmdbDetails.overview)}</p></div>` : '';
    const releaseDateHTML = tmdbDetails.releaseDate ? `<div><strong>Released:</strong> ${sanitize(TimeAgo.formatFullDate(new Date(tmdbDetails.releaseDate), true))}</div>` : '';
    const runtimeHTML = tmdbDetails.runtime ? `<div><strong>Runtime:</strong> ${sanitize(tmdbDetails.runtime)} min</div>` : '';
    const taglineHTML = tmdbDetails.tagline ? `<div class="tmdb-tagline"><em>${sanitize(tmdbDetails.tagline)}</em></div>` : '';
    const actorsHTML = tmdbDetails.actors && tmdbDetails.actors.length > 0 ? `<div class="tmdb-actors"><strong>Starring:</strong><ul>${tmdbDetails.actors.map(actor => `<li>${sanitize(actor.name)} (${sanitize(actor.character)})</li>`).join('')}</ul></div>` : '';

    // --- YOUTUBE TRAILER & TMDB LINK BUTTONS ---
    let externalLinksHTML = '<div class="group-external-links">';
    const groupTitleForSearch = tmdbDetails.title || group.displayTitle || group.representativeFile?.extractedTitle;

    if (groupTitleForSearch) {
        // YouTube Trailer Button
        let ytSearchTerms = [groupTitleForSearch];
        if (group.isSeries && group.representativeFile?.extractedSeason) { // Use representative file for season if available
            // ytSearchTerms.push(`Season ${group.representativeFile.extractedSeason}`); // Less specific for group trailer
        } else if (!group.isSeries && group.year) {
            ytSearchTerms.push(String(group.year));
        }
        ytSearchTerms.push("Official Trailer");
        // Check if any file in the group has Hindi language (simple check)
        const includesHindi = group.files.some(f => (f.languages || '').toLowerCase().includes('hindi'));
        if (includesHindi) { ytSearchTerms.push("Hindi"); }

        const youtubeSearchQuery = encodeURIComponent(ytSearchTerms.join(' '));
        const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${youtubeSearchQuery}`;
        const youtubeIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M21.582,6.186c-0.23-0.86-0.908-1.538-1.768-1.768C18.267,4,12,4,12,4S5.733,4,4.186,4.418 c-0.86,0.23-1.538,0.908-1.768,1.768C2,7.734,2,12,2,12s0,4.266,0.418,5.814c0.23,0.86,0.908,1.538,1.768,1.768 C5.733,20,12,20,12,20s6.267,0,7.814-0.418c0.861-0.23,1.538-0.908,1.768-1.768C22,16.266,22,12,22,12S22,7.734,21.582,6.186z M10,15.464V8.536L16,12L10,15.464z"></path></svg>`;
        externalLinksHTML += `<a href="${youtubeSearchUrl}" target="_blank" rel="noopener noreferrer" class="button youtube-button">${youtubeIconSVG} Watch Trailer</a>`;
    }

    // TMDb Link Button
    if (tmdbDetails.tmdbLink) {
        const infoIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"></path></svg>`;
        const tmdbLabel = group.isSeries ? "View on TMDb (TV)" : "View on TMDb (Movie)";
        externalLinksHTML += `<a href="${sanitize(tmdbDetails.tmdbLink)}" target="_blank" rel="noopener noreferrer" class="button tmdb-link-button">${infoIconSVG} ${tmdbLabel}</a>`;
    } else if (groupTitleForSearch) { // Fallback to IMDb search if no direct TMDb link
        const infoIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"></path></svg>`;
        let imdbQueryTerms = [`"${groupTitleForSearch}"`];
        if (!group.isSeries && group.year) { imdbQueryTerms.push(String(group.year)); }
        imdbQueryTerms.push("IMDb");
        const imdbSearchQuery = imdbQueryTerms.join(' ');
        const imdbSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(imdbSearchQuery)}&btnI=1`; // "I'm feeling lucky" for IMDb
        externalLinksHTML += `<a href="${imdbSearchUrl}" target="_blank" rel="noopener noreferrer" class="button imdb-button">${infoIconSVG} Find on IMDb</a>`;
    }
    externalLinksHTML += '</div>';
    // --- END YOUTUBE TRAILER & TMDB LINK BUTTONS ---

    return `
        <div class="tmdb-details-container">
            <div class="tmdb-poster-column">${posterHTML}</div>
            <div class="tmdb-info-column">
                <h2 class="tmdb-title">${sanitize(tmdbDetails.title || group.displayTitle || 'Unknown Title')}</h2>
                ${taglineHTML}
                <div class="tmdb-meta">${ratingHTML}${releaseDateHTML}${runtimeHTML}</div>
                ${genresHTML}
                ${overviewHTML}
                ${actorsHTML}
                ${externalLinksHTML} {/* Inserted here */}
            </div>
        </div>
    `;
}

    // NEW: HTML for the list of files in Group Detail view
    function createGroupDetailFileListHTML(group) {
        if (!group || !group.files || group.files.length === 0) {
            return `<p class="status-message">No files available for this item.</p>`;
        }
        let filesHTML = '<ul class="file-list-ul">';
        group.files.forEach((file, index) => {
            const displayFilename = file.displayFilename;
            const displaySize = file.sizeData.display;
            const displayQuality = file.displayQuality;
            const formattedDateRelative = TimeAgo.format(file.last_updated_ts);

            // Add SxxExx to display if available
            let seasonEpisodeInfo = '';
            if (file.isSeries && file.extractedSeason) {
                seasonEpisodeInfo += `S${String(file.extractedSeason).padStart(2, '0')}`;
                // if (file.extractedEpisode) {
                //     seasonEpisodeInfo += `E${String(file.extractedEpisode).padStart(2, '0')}`;
                // }
                seasonEpisodeInfo += ' - ';
            }


            filesHTML += `
                <li class="file-list-item" data-file-id="${sanitize(file.id)}" data-file-index="${index}" role="button" tabindex="0" aria-label="Select file: ${sanitize(displayFilename)}">
                    <span class="file-name">${sanitize(seasonEpisodeInfo)}${sanitize(displayFilename)}</span>
                    <span class="file-meta">
                        <span class="file-quality">${sanitize(displayQuality)}</span>
                        <span class="file-size">${sanitize(displaySize)}</span>
                        <span class="file-date" title="${TimeAgo.formatFullDate(new Date(file.last_updated_ts))}">${sanitize(formattedDateRelative)}</span>
                    </span>
                </li>
            `;
        });
        filesHTML += '</ul>';
        return filesHTML;
    }

    // MODIFIED/NEW: HTML for action buttons for a *specific file* (used in Group Detail)
// Takes the file object and tmdbDetails of the PARENT GROUP
function createFileActionsHTML(file, groupTmdbDetails) { // groupTmdbDetails is for the parent group
    const displayFilename = file.displayFilename;
    const displaySize = file.sizeData.display;
    const displayQuality = file.displayQuality;

    // Use group's title for stream, but file's quality
    const streamTitle = (groupTmdbDetails?.title || file.extractedTitle || displayFilename.split(/[\.\(\[]/)[0].replace(/[_ ]+/g, ' ').trim()) + (displayQuality !== 'N/A' ? ` (${displayQuality})` : '');

    const timestampString = file.last_updated_ts;
    const formattedDateRelative = TimeAgo.format(timestampString);
    const dateObject = timestampString ? new Date(timestampString) : null;
    const formattedDateFull = (dateObject && !isNaN(dateObject)) ? TimeAgo.formatFullDate(dateObject) : 'N/A';

    let hdrLogoHtml = ''; let fourkLogoHtml = '';
    const lowerFilename = (displayFilename || '').toLowerCase();
    if (displayQuality === '4K' || lowerFilename.includes('2160p') || lowerFilename.includes('.4k.')) { fourkLogoHtml = `<img src="${config.FOURK_LOGO_URL}" alt="4K" class="quality-logo fourk-logo" title="4K Ultra HD" />`; }
    if ((displayQuality || '').includes('HDR') || (displayQuality || '').includes('DOLBY VISION') || displayQuality === 'DV' || lowerFilename.includes('hdr') || lowerFilename.includes('dolby.vision') || lowerFilename.includes('.dv.')) { hdrLogoHtml = `<img src="${config.HDR_LOGO_URL}" alt="HDR/DV" class="quality-logo hdr-logo" title="HDR / Dolby Vision Content" />`; }

    const escapedStreamTitle = streamTitle.replace(/'/g, "\\'");
    const escapedFilename = displayFilename.replace(/'/g, "\\'");
    const escapedUrl = file.url ? file.url.replace(/'/g, "\\'") : '';
    const escapedId = file.id ? String(file.id).replace(/[^a-zA-Z0-9-_]/g, '') : ''; // File's own ID
    const escapedHubcloudUrl = file.hubcloud_link ? file.hubcloud_link.replace(/'/g, "\\'") : '';
    const escapedGdflixUrl = file.gdflix_link ? file.gdflix_link.replace(/'/g, "\\'") : '';

    let urlDependentButtonsHTML = '';
    let bypassButtonsHTML = '';
    let otherLinkButtonsHTML = '';

    if (file.url) {
        urlDependentButtonsHTML += `<button class="button play-button" data-action="play" data-title="${escapedStreamTitle}" data-url="${escapedUrl}" data-filename="${escapedFilename}"><span aria-hidden="true">▶️</span> Play File</button>`;
        urlDependentButtonsHTML += `<a class="button download-button" href="${file.url}" download="${displayFilename}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">💾</span> Direct Download</a>`;
        urlDependentButtonsHTML += `<button class="button vlc-button" data-action="copy-vlc" data-url="${escapedUrl}"><span aria-hidden="true">📋</span> Copy URL (for VLC/MX)</button><span class="copy-feedback" role="status" aria-live="polite">Copied!</span>`;
        if (navigator.userAgent.toLowerCase().includes("android")) {
            urlDependentButtonsHTML += `<button class="button intent-button" data-action="open-intent" data-url="${escapedUrl}"><span aria-hidden="true">📱</span> Play in VLC or MX Player</button>`;
        }
    }

    const fileRefAttr = `data-file-id-ref="${escapedId}"`; // For bypass to know which file to update

    // --- MODIFIED BYPASS BUTTONS ---
    // HubCloud Button
    const hubcloudDisabled = !file.hubcloud_link;
    bypassButtonsHTML += `
        <button class="button hubcloud-bypass-button ${hubcloudDisabled ? 'disabled-visual' : ''}" 
                data-action="bypass-hubcloud" 
                data-hubcloud-url="${escapedHubcloudUrl}" 
                ${fileRefAttr} 
                ${hubcloudDisabled ? 'disabled title="HubCloud link not available for this file"' : 'title="Bypass HubCloud link for this file"'}>
            <span aria-hidden="true" class="button-icon">☁️</span>
            <span class="button-spinner spinner"></span>
            <span class="button-text">Bypass HubCloud</span>
        </button>
        <span class="bypass-feedback" role="status" aria-live="polite"></span>`;

    // GDFLIX Button
    const gdflixDisabled = !file.gdflix_link;
    bypassButtonsHTML += `
        <button class="button gdflix-bypass-button ${gdflixDisabled ? 'disabled-visual' : ''}" 
                data-action="bypass-gdflix" 
                data-gdflix-url="${escapedGdflixUrl}" 
                ${fileRefAttr}
                ${gdflixDisabled ? 'disabled title="GDFLIX link not available for this file"' : 'title="Bypass GDFLIX link for this file"'}>
            <span aria-hidden="true" class="button-icon">🎬</span>
            <span class="button-spinner spinner"></span>
            <span class="button-text">Bypass GDFLIX</span>
        </button>
        <span class="bypass-feedback" role="status" aria-live="polite"></span>`;
    // --- END MODIFIED BYPASS BUTTONS ---


    otherLinkButtonsHTML += `<button class="button custom-url-toggle-button" data-action="toggle-custom-url-input" aria-expanded="false" style="display: none;"><span aria-hidden="true">🔗</span> Play Custom URL for this player</button>`;
    if (file.telegram_link) { otherLinkButtonsHTML += `<a class="button telegram-button" href="${sanitize(file.telegram_link)}" target="_blank" rel="noopener noreferrer">Telegram File</a>`; }

    // Raw links (these are fine, they are only shown if bypass buttons AREN'T there)
    if (file.gdflix_link && !bypassButtonsHTML.includes('data-action="bypass-gdflix"')) { // Check if bypass button was already added
         if (!gdflixDisabled) otherLinkButtonsHTML += `<a class="button gdflix-button" href="${sanitize(file.gdflix_link)}" target="_blank" rel="noopener noreferrer">GDFLIX Link</a>`;
    }
    if (file.hubcloud_link && !bypassButtonsHTML.includes('data-action="bypass-hubcloud"')) {
         if (!hubcloudDisabled) otherLinkButtonsHTML += `<a class="button hubcloud-button" href="${sanitize(file.hubcloud_link)}" target="_blank" rel="noopener noreferrer">HubCloud Link</a>`;
    }


    if (file.id) {
         const groupShareUrl = `${window.location.origin}${window.location.pathname}?groupKey=${encodeURIComponent(currentGroupDetailData.groupKey)}&fileId=${escapedId}`;
        otherLinkButtonsHTML += `<button class="button share-button" data-action="share-file" data-share-url="${groupShareUrl}" data-share-title="${escapedStreamTitle}" data-share-text="Check out this file: ${escapedFilename}"><span aria-hidden="true">🔗</span> Share This File</button><span class="copy-feedback share-fallback" role="status" aria-live="polite">Link copied!</span>`;
    }


    const internalInfoHTML = `
        <div class="action-info" data-stream-title="${escapedStreamTitle}">
            <span class="info-item"><strong>File:</strong> ${displayFilename}</span>
            <span class="info-item"><strong>Quality:</strong> ${displayQuality} ${fourkLogoHtml}${hdrLogoHtml}</span>
            <span class="info-item"><strong>Size:</strong> ${displaySize}</span>
            <span class="info-item"><strong>Language:</strong> ${sanitize(file.languages || 'N/A')}</span>
            <span class="info-item"><strong>Updated:</strong> ${formattedDateFull} (${formattedDateRelative})</span>
            ${file.originalFilename ? `<span class="info-item"><strong>Original Name:</strong> ${sanitize(file.originalFilename)}</span>` : ''}
        </div>`;
    const buttonsHTML = `<div class="action-buttons-container">${urlDependentButtonsHTML}${bypassButtonsHTML}${otherLinkButtonsHTML}</div>`;
    return `${internalInfoHTML}${buttonsHTML}`;
}


    // --- View Control ---
    function setViewMode(mode) {
        console.log(`Setting view mode to: ${mode}`);
        const previousMode = currentViewMode;
        currentViewMode = mode;

        if (mode !== previousMode) { closePlayerIfNeeded(null); }

        container.classList.toggle('results-active', mode === 'search');
        container.classList.toggle('group-detail-active', mode === 'groupDetail'); // New class for styling
        // container.classList.toggle('item-detail-active', mode === 'itemDetail'); // Old item detail view might be deprecated

        const showHomepage = mode === 'homepage';
        const showSearch = mode === 'search';
        const showGroupDetail = mode === 'groupDetail';

        if (searchFocusArea) searchFocusArea.style.display = (showHomepage || showSearch) ? 'flex' : 'none';
        if (resultsArea) resultsArea.style.display = showSearch ? 'block' : 'none';
        if (groupDetailView) groupDetailView.style.display = showGroupDetail ? 'block' : 'none';
        if (itemDetailView) itemDetailView.style.display = 'none'; // Hide old item detail view

        if (updatesPreviewSection) updatesPreviewSection.style.display = showHomepage ? 'block' : 'none';
        if (pageFooter) pageFooter.style.display = (showHomepage || showSearch) ? 'flex' : 'none'; // Footer only on home/search

        if (showHomepage) {
            if (searchInput) searchInput.value = '';
            currentState.searchTerm = '';
            currentState.activeGroupKey = null;
            currentState.selectedFileIdInGroup = null;
            if (suggestionsContainer) suggestionsContainer.style.display = 'none';
            activeResultsTab = 'allFiles'; currentState.currentPage = 1; currentState.typeFilter = '';
            if (weeklyUpdatesGroupedData.length > 0) { displayInitialUpdatesPreview(); } // Uses grouped data
            else if (localSuggestionData.length > 0) { // localSuggestionData is still for individual files
                 if (updatesPreviewList) updatesPreviewList.innerHTML = '<div class="status-message grid-status-message">No recent updates found.</div>';
                 if (showMoreUpdatesButton) showMoreUpdatesButton.style.display = 'none';
            } else {
                if (updatesPreviewList) updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`;
            }
            document.title = "Cinema Ghar Index";
        } else if (showSearch) {
            document.title = `Search: ${currentState.searchTerm || 'Results'} - Cinema Ghar Index`;
            currentState.activeGroupKey = null;
            currentState.selectedFileIdInGroup = null;
        } else if (showGroupDetail) {
            if (searchFocusArea) searchFocusArea.style.display = 'none';
            if (resultsArea) resultsArea.style.display = 'none';
            if (updatesPreviewSection) updatesPreviewSection.style.display = 'none';
            if (pageFooter) pageFooter.style.display = 'none';
            // Title set in displayGroupDetail
        }
        if (!isInitialLoad) { saveStateToLocalStorage(); }
    }

    window.resetToHomepage = function(event) {
        if (window.history.pushState) { const cleanUrl = window.location.origin + window.location.pathname; if (window.location.search !== '') { window.history.pushState({ path: cleanUrl }, '', cleanUrl); } }
        currentGroupDetailData = null;
        currentSelectedFileForActions = null;
        if (detailFetchAbortController) { detailFetchAbortController.abort(); detailFetchAbortController = null; }
        lastFocusedElement = event?.target;
        setViewMode('homepage');
        if (searchInput) { setTimeout(() => searchInput.focus(), 100); }
    }

    // For back button from Group Detail to Search Results
    window.goBackToResultsFromGroup = function() {
        currentGroupDetailData = null;
        currentSelectedFileForActions = null;
        currentState.activeGroupKey = null;
        currentState.selectedFileIdInGroup = null;
        if (detailFetchAbortController) { detailFetchAbortController.abort(); detailFetchAbortController = null; }
        history.back(); // Should trigger popstate and handleUrlChange
    }

    // Back button from OLD item detail (may remove if #item-detail-view is fully deprecated)
    window.goBackToResults = function() { // This likely refers to back from old item detail view
        // currentItemDetailData = null; isShareMode = false;
        if (detailFetchAbortController) { detailFetchAbortController.abort(); detailFetchAbortController = null; }
        history.back();
    }

    window.addEventListener('popstate', (event) => { handleUrlChange(true); });

    function handleUrlChange(isPopState = false) {
        if (detailFetchAbortController) { detailFetchAbortController.abort(); detailFetchAbortController = null; }

        const urlParams = new URLSearchParams(window.location.search);
        const groupKeyParam = urlParams.get('groupKey');
        const fileIdParam = urlParams.get('fileId'); // For pre-selecting a file in group view
        const shareIdParam = urlParams.get('shareId'); // Old share param, might deprecate or adapt

        if (groupKeyParam) {
            if (currentViewMode !== 'groupDetail' || !currentGroupDetailData || currentGroupDetailData.groupKey !== groupKeyParam) {
                displayGroupDetail(groupKeyParam, fileIdParam); // Pass fileIdParam for auto-selection
            } else { // Already on the correct group detail page
                setViewMode('groupDetail'); // Ensure correct classes
                if (fileIdParam && (!currentSelectedFileForActions || currentSelectedFileForActions.id !== fileIdParam)) {
                    // If fileId is in URL and not currently selected, select it
                    const fileToSelect = currentGroupDetailData.files.find(f => String(f.id) === fileIdParam);
                    if (fileToSelect) {
                        displayFileActionsInGroup(fileToSelect);
                    }
                } else if (!fileIdParam && currentSelectedFileForActions) {
                     // If no fileId in URL but one is selected, clear selection
                    clearFileActionsInGroup();
                }
            }
        } else if (shareIdParam) { // Handle old share links if needed, might redirect to group view
            console.warn("Old shareId param detected. Consider updating sharing logic.");
            // Attempt to find the file and its group, then navigate to group view
            // This requires fetching all data or having a mapping, complex.
            // For now, could try to display old item detail view or just go home.
            // displayItemDetail(shareIdParam, true); // Using old function, potentially problematic
            resetToHomepage();

        } else { // No groupKey or specific shareId
            if (currentViewMode === 'groupDetail') { // Was on group detail, now going back
                currentGroupDetailData = null;
                currentSelectedFileForActions = null;
                currentState.activeGroupKey = null;
                currentState.selectedFileIdInGroup = null;
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
         if (pageLoader && pageLoader.style.display !== 'none' && currentViewMode !== 'groupDetail' && !groupKeyParam) {
            pageLoader.style.display = 'none';
        }
    }

    function previousStateBeforeDetailWasSearch() {
        return !!currentState.searchTerm;
    }


    // --- Search and Suggestions Logic ---
    function handleSearchInput() { clearTimeout(suggestionDebounceTimeout); const searchTerm = searchInput.value.trim(); if (searchTerm.length < 2) { suggestionsContainer.style.display = 'none'; return; } suggestionDebounceTimeout = setTimeout(() => { fetchAndDisplaySuggestions(searchTerm); }, config.SUGGESTIONS_DEBOUNCE_DELAY); }
    function fetchAndDisplaySuggestions(term) { const normalizedTerm = normalizeTextForSearch(term); if (!normalizedTerm) { suggestionsContainer.style.display = 'none'; return; } const matchingItems = localSuggestionData.filter(movie => movie.searchText.includes(normalizedTerm)).slice(0, config.MAX_SUGGESTIONS); suggestionsContainer.innerHTML = ''; if (matchingItems.length > 0) { const fragment = document.createDocumentFragment(); matchingItems.forEach(item => { const div = document.createElement('div'); let displayText = item.displayFilename; let highlighted = false; if (term.length > 0) { try { const safeTerm = escapeRegExp(term); const regex = new RegExp(`(${safeTerm})`, 'i'); if ((item.displayFilename || '').match(regex)) { div.innerHTML = (item.displayFilename || '').replace(regex, '<strong>$1</strong>'); highlighted = true; } } catch (e) { console.warn("Regex error for highlight:", e); } } if (!highlighted) { div.textContent = item.displayFilename; } div.title = item.displayFilename; div.onclick = () => selectSuggestion(item.displayFilename); fragment.appendChild(div); }); suggestionsContainer.appendChild(fragment); suggestionsContainer.style.display = 'block'; } else { suggestionsContainer.style.display = 'none'; } }
    function selectSuggestion(selectedValue) { searchInput.value = selectedValue; suggestionsContainer.style.display = 'none'; handleSearchSubmit(); }

    window.handleSearchSubmit = function() {
        if (suggestionsContainer) suggestionsContainer.style.display = 'none';
        const searchTerm = searchInput.value.trim();
        if (searchInput) searchInput.blur();

        if (searchTerm.length === 0 && currentViewMode !== 'homepage') {
            resetToHomepage(); return;
        }
        if (searchTerm.length === 0 && currentViewMode === 'homepage') { return; }

        if (currentViewMode === 'groupDetail') { // If searching from group detail view
            if (detailFetchAbortController) { detailFetchAbortController.abort(); detailFetchAbortController = null; }
            currentGroupDetailData = null;
            currentSelectedFileForActions = null;
            const cleanUrl = window.location.origin + window.location.pathname;
            if (window.location.search !== '') { history.pushState({ path: cleanUrl }, '', cleanUrl); }
        }

        setViewMode('search');
        activeResultsTab = 'allFiles'; // Default to all files tab on new search
        currentState.currentPage = 1;
        currentState.searchTerm = searchTerm;
        currentState.qualityFilter = qualityFilterSelect.value || '';
        currentState.typeFilter = tabMappings[activeResultsTab].typeFilter; // Set typeFilter for the active tab
        currentState.activeGroupKey = null;
        currentState.selectedFileIdInGroup = null;

        updateActiveTabAndPanel();
        showLoadingStateInGrids(`Searching for "${sanitize(searchTerm)}"...`);
        fetchAndRenderResults(); // This will fetch files, then group them, then render groups
    }
    function handleSearchClear() { clearTimeout(suggestionDebounceTimeout); suggestionsContainer.style.display = 'none'; setTimeout(() => { if (searchInput.value.trim() === '') { if (currentViewMode === 'search') { resetToHomepage(); } else { currentState.searchTerm = ''; saveStateToLocalStorage(); } } }, 100); }
    function showLoadingStateInGrids(message = 'Loading...') { const loadingHTML = `<div class="loading-message grid-status-message"><div class="spinner"></div>${sanitize(message)}</div>`; Object.values(tabMappings).forEach(mapping => { if (mapping?.gridContainer) { mapping.gridContainer.innerHTML = loadingHTML; } if (mapping?.pagination) { mapping.pagination.style.display = 'none'; } }); }

    // --- Updates Preview Logic (Now for Groups) ---
    async function loadUpdatesPreview() {
        if (currentViewMode !== 'homepage' || !updatesPreviewList || !showMoreUpdatesButton) return;
        updatesPreviewList.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading updates...</span></div>`;
        showMoreUpdatesButton.style.display = 'none';
        updatesPreviewShownCount = 0;
        weeklyUpdatesGroupedData = [];
        try {
            // Fetch more individual files initially to ensure enough groups for preview + load more
            const filesLimit = (config.UPDATES_PREVIEW_INITIAL_COUNT + config.UPDATES_PREVIEW_LOAD_MORE_COUNT) * 5; // Heuristic: 5 files per group avg
            const params = { sort: 'lastUpdated', sortDir: 'desc', limit: filesLimit, page: 1 };
            const data = await fetchApiData(params); // Fetches raw files
            if (data && data.items && data.items.length > 0) {
                const processedFiles = data.items.map(preprocessMovieData);
                weeklyUpdatesGroupedData = groupFilesByTitle(processedFiles);
                // Sort groups by their most recent file's timestamp
                weeklyUpdatesGroupedData.sort((a,b) => b.lastUpdatedTimestamp - a.lastUpdatedTimestamp);
                displayInitialUpdatesPreview();
            } else {
                updatesPreviewList.innerHTML = '<div class="status-message grid-status-message">No recent updates found.</div>';
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                updatesPreviewList.innerHTML = `<div class="error-message grid-status-message">Could not load updates. ${error.message}</div>`;
            }
        } finally {
             if (showMoreUpdatesButton.textContent === "Loading...") { // Reset if it was stuck
                showMoreUpdatesButton.disabled = weeklyUpdatesGroupedData.length <= updatesPreviewShownCount;
                showMoreUpdatesButton.textContent = weeklyUpdatesGroupedData.length <= updatesPreviewShownCount ? "All Updates Shown" : "Show More";
             }
        }
    }

    function displayInitialUpdatesPreview() {
        if (!updatesPreviewList || !showMoreUpdatesButton) return;
        updatesPreviewList.innerHTML = '';
        updatesPreviewShownCount = 0;
        if (weeklyUpdatesGroupedData.length === 0) {
            updatesPreviewList.innerHTML = '<div class="status-message grid-status-message">No recent updates found.</div>';
            showMoreUpdatesButton.style.display = 'none';
            return;
        }
        const initialCount = Math.min(weeklyUpdatesGroupedData.length, config.UPDATES_PREVIEW_INITIAL_COUNT);
        appendGroupsToPreview(0, initialCount);
        updatesPreviewShownCount = initialCount;
        const potentiallyMore = weeklyUpdatesGroupedData.length > initialCount;
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
        const groupsToLoad = weeklyUpdatesGroupedData.slice(updatesPreviewShownCount, updatesPreviewShownCount + config.UPDATES_PREVIEW_LOAD_MORE_COUNT);
        if (groupsToLoad.length > 0) {
            appendGroupsToPreview(updatesPreviewShownCount, updatesPreviewShownCount + groupsToLoad.length);
            updatesPreviewShownCount += groupsToLoad.length;
            const hasMoreAfterThis = weeklyUpdatesGroupedData.length > updatesPreviewShownCount;
            if (hasMoreAfterThis) {
                showMoreUpdatesButton.disabled = false;
                showMoreUpdatesButton.textContent = "Show More";
            } else {
                showMoreUpdatesButton.textContent = "All Updates Shown";
                showMoreUpdatesButton.disabled = true; // Remains disabled
            }
        } else {
            showMoreUpdatesButton.textContent = "No More Updates";
            showMoreUpdatesButton.disabled = true; // Remains disabled
        }
    }

    function appendGroupsToPreview(startIndex, endIndex) {
        if (!updatesPreviewList) return;
        const fragment = document.createDocumentFragment();
        const groupsToAppend = weeklyUpdatesGroupedData.slice(startIndex, endIndex);

        groupsToAppend.forEach((group) => {
            if (!group || !group.groupKey) return;
            const gridItemElement = createGroupGridItemHTML(group); // Use new function for groups
            fragment.appendChild(gridItemElement);
        });

        const initialLoader = updatesPreviewList.querySelector('.loading-inline-spinner');
        if (initialLoader && startIndex === 0) { initialLoader.remove(); }
        updatesPreviewList.appendChild(fragment);
    }

    // --- Filtering, Sorting (Sorting now applies to groups based on representative file) ---
    function triggerFilterChange() { if (!qualityFilterSelect || currentViewMode !== 'search') return; const newQualityFilter = qualityFilterSelect.value; if (newQualityFilter !== currentState.qualityFilter) { currentState.qualityFilter = newQualityFilter; currentState.currentPage = 1; closePlayerIfNeeded(null); showLoadingStateInGrids(`Applying filter: ${sanitize(newQualityFilter || 'All Qualities')}...`); fetchAndRenderResults(); } }
    // Sorting by table headers is removed as grid view doesn't have them.
    // If sorting controls are added elsewhere, their handlers would call fetchAndRenderResults.

    // --- Rendering Logic (Now for Groups) ---
    function renderActiveResultsView(apiResponse) { // apiResponse here contains raw files
         if (currentViewMode !== 'search' || !tabMappings[activeResultsTab]) {
             if (currentViewMode === 'search') { showLoadingStateInGrids('Enter search term above.'); }
             return;
         }
         const { gridContainer, pagination } = tabMappings[activeResultsTab];
         if (!gridContainer || !pagination) { console.error("Missing grid container or pagination for tab:", activeResultsTab); return; }

         const rawFiles = apiResponse.items || [];
         // Process and group files
         const processedFiles = rawFiles.map(preprocessMovieData);
         groupedDataForCurrentView = groupFilesByTitle(processedFiles);

         // Sort groups by their most recent file's timestamp or other criteria if needed
         // For now, API sorting of files should roughly translate to group order.
         // Could add explicit group sorting:
         groupedDataForCurrentView.sort((a,b) => {
            // Example: sort by last updated timestamp of the group
            if (currentState.sortColumn === 'lastUpdated') {
                const dir = currentState.sortDirection === 'asc' ? 1 : -1;
                return (a.lastUpdatedTimestamp - b.lastUpdatedTimestamp) * dir;
            }
            // Example: sort by title
            if (currentState.sortColumn === 'filename') { // 'filename' sort key now means group title
                const dir = currentState.sortDirection === 'asc' ? 1 : -1;
                return (a.displayTitle || '').localeCompare(b.displayTitle || '') * dir;
            }
            // Add more sorting criteria for groups if needed
            return 0;
         });


         gridContainer.innerHTML = '';
         const fragment = document.createDocumentFragment();

         const totalGroups = apiResponse.totalItems; // This is total FILES, not groups.
                                                    // We need a way to get total groups, or paginate based on groups client-side after fetching all files.
                                                    // For true server-side pagination of groups, API needs to support it.
                                                    // For now, let's assume apiResponse.totalItems refers to files and pagination might be approximate.
                                                    // OR, we fetch ALL files, then paginate groups client-side.
                                                    // Let's assume ITEMS_PER_PAGE is for groups for now.
                                                    // The totalPages calculation from API response is for files.

         if (groupedDataForCurrentView.length === 0) {
             let message = `No ${tabMappings[activeResultsTab].typeFilter || 'items'} found`;
             if (currentState.searchTerm) message += ` matching "${sanitize(currentState.searchTerm)}"`;
             if (currentState.qualityFilter) message += ` with quality "${sanitize(currentState.qualityFilter)}"`;
             message += '.';
             gridContainer.innerHTML = `<div class="status-message grid-status-message">${message}</div>`;
             renderPaginationControls(pagination, 0, 1, 0); // No groups, no pages
         } else {
             groupedDataForCurrentView.forEach((group) => {
                 const gridItemElement = createGroupGridItemHTML(group); // Use new function
                 fragment.appendChild(gridItemElement);
             });
             gridContainer.appendChild(fragment);
             // Pagination: apiResponse.totalPages is for files. If we show groups per page,
             // totalPages for groups needs to be calculated based on groupedDataForCurrentView.length
             // This assumes ITEMS_PER_PAGE is now for groups.
             const totalGroupPages = Math.ceil(apiResponse.totalItems / config.ITEMS_PER_PAGE); // This is still file based.

             // For client-side pagination of groups (if all files fetched):
             // const totalGroupPages = Math.ceil(groupedDataForCurrentView.length / config.ITEMS_PER_PAGE);
             // For now, use the file-based totalPages from API as an approximation or until API supports group counts
             renderPaginationControls(pagination, apiResponse.totalItems, apiResponse.page, apiResponse.totalPages);
         }
         updateActiveTabAndPanel();
         updateFilterIndicator();
     }

    function renderPaginationControls(targetContainer, totalItems, currentPage, totalPages) { if (!targetContainer) return; if (totalItems === 0 || totalPages <= 1) { targetContainer.innerHTML = ''; targetContainer.style.display = 'none'; return; } targetContainer.dataset.totalPages = totalPages; targetContainer.innerHTML = ''; let paginationHTML = ''; const maxPagesToShow = 5; const halfPages = Math.floor(maxPagesToShow / 2); paginationHTML += `<button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled title="First page"' : 'title="Previous page"'}>« Prev</button>`; let startPage, endPage; if (totalPages <= maxPagesToShow + 2) { startPage = 1; endPage = totalPages; } else { startPage = Math.max(2, currentPage - halfPages); endPage = Math.min(totalPages - 1, currentPage + halfPages); if (currentPage - halfPages < 2) { endPage = Math.min(totalPages - 1, maxPagesToShow); } if (currentPage + halfPages > totalPages - 1) { startPage = Math.max(2, totalPages - maxPagesToShow + 1); } } if (startPage > 1) { paginationHTML += `<button onclick="changePage(1)" title="Page 1">1</button>`; if (startPage > 2) { paginationHTML += `<span class="page-info" title="Skipped pages">...</span>`; } } for (let i = startPage; i <= endPage; i++) { paginationHTML += (i === currentPage) ? `<span class="current-page">${i}</span>` : `<button onclick="changePage(${i})" title="Page ${i}">${i}</button>`; } if (endPage < totalPages) { if (endPage < totalPages - 1) { paginationHTML += `<span class="page-info" title="Skipped pages">...</span>`; } paginationHTML += `<button onclick="changePage(${totalPages})" title="Page ${totalPages}">${totalPages}</button>`; } paginationHTML += `<button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled title="Last page"' : 'title="Next page"'}>Next »</button>`; targetContainer.innerHTML = paginationHTML; targetContainer.style.display = 'block'; }
    function updateFilterIndicator() { if(qualityFilterSelect) { qualityFilterSelect.classList.toggle('filter-active', !!currentState.qualityFilter); } }
    function updateActiveTabAndPanel() { Object.keys(tabMappings).forEach(tabId => { const mapping = tabMappings[tabId]; const isActive = tabId === activeResultsTab; if (mapping?.button) mapping.button.classList.toggle('active', isActive); if (mapping?.panel) mapping.panel.classList.toggle('active', isActive); }); }

    // --- Pagination and Tab Switching ---
    window.changePage = function(newPage) { if (currentViewMode !== 'search' || newPage < 1 || newPage === currentState.currentPage) { return; } const currentPagination = tabMappings[activeResultsTab]?.pagination; if(currentPagination && currentPagination.dataset.totalPages) { const totalP = parseInt(currentPagination.dataset.totalPages, 10); if(newPage > totalP) { return; } } currentState.currentPage = newPage; closePlayerIfNeeded(null); fetchAndRenderResults().then(() => { const activeGridContainer = tabMappings[activeResultsTab]?.gridContainer; scrollToTopOfActiveGrid(activeGridContainer); }); saveStateToLocalStorage(); }
    function scrollToTopOfActiveGrid(gridContainerElement) { if (!gridContainerElement) return; let stickyHeaderHeight = 0; if (container.classList.contains('results-active')) { const searchBarArea = container.querySelector('#search-focus-area'); const backButtonElem = resultsArea.querySelector('#backToHomeButtonResults'); const filterAreaElem = resultsArea.querySelector('.results-filter-area'); const tabNavElem = resultsArea.querySelector('.tab-navigation'); stickyHeaderHeight = (searchBarArea?.offsetHeight || 0) + (backButtonElem?.offsetHeight || 0) + (backButtonElem ? parseFloat(getComputedStyle(backButtonElem).marginBottom) : 0) + (filterAreaElem?.offsetHeight || 0) + (tabNavElem?.offsetHeight || 0); } const elementTop = gridContainerElement.getBoundingClientRect().top + window.pageYOffset; const scrollPosition = elementTop - stickyHeaderHeight - 20; window.scrollTo({ top: scrollPosition, behavior: 'smooth' }); }
    window.switchTab = function(tabId) { if (currentViewMode !== 'search' || tabId === activeResultsTab || !tabMappings[tabId]) { return; } activeResultsTab = tabId; currentState.currentPage = 1; currentState.typeFilter = tabMappings[tabId].typeFilter; closePlayerIfNeeded(null); updateActiveTabAndPanel(); showLoadingStateInGrids(`Loading ${tabMappings[tabId].typeFilter || 'all files'}...`); fetchAndRenderResults(); saveStateToLocalStorage(); }

    // --- Navigation to Group Detail View ---
    function navigateToGroupView(groupKey) {
        if (!groupKey) return;
        lastFocusedElement = document.activeElement;
        if (detailFetchAbortController) { detailFetchAbortController.abort(); detailFetchAbortController = null; }

        const newUrl = `${window.location.origin}${window.location.pathname}?groupKey=${encodeURIComponent(groupKey)}`;
        const currentParams = new URLSearchParams(window.location.search);
        const isSameView = currentParams.get('groupKey') === groupKey;

        if (!isSameView || currentViewMode !== 'groupDetail') {
            try {
                history.pushState({ groupKey: groupKey }, '', newUrl);
            } catch (e) {
                console.error("History pushState failed for group view:", e);
            }
        }
        displayGroupDetail(groupKey);
    }

    // --- Share Logic (Needs update for groups/files within groups) ---
    async function handleShareFileClick(buttonElement) {
        const shareUrl = buttonElement.dataset.shareUrl;
        const itemTitle = buttonElement.dataset.shareTitle || "Cinema Ghar Item";
        const shareText = buttonElement.dataset.shareText || `Check out: ${itemTitle}`;

        if (!shareUrl) { alert("Cannot share: URL missing."); return; }
        const feedbackSpan = buttonElement.nextElementSibling;

        if (navigator.share) {
            try {
                await navigator.share({ title: itemTitle, text: shareText, url: shareUrl });
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
    async function displayGroupDetail(groupKey, preselectFileId = null) {
        if (!groupKey || !groupDetailView || !groupDetailHeaderContent || !groupDetailFileList) return;

        if (detailFetchAbortController) { detailFetchAbortController.abort(); detailFetchAbortController = null; }
        detailFetchAbortController = new AbortController();
        const signal = detailFetchAbortController.signal;

        currentGroupDetailData = null; // Reset before fetching/finding
        currentSelectedFileForActions = null; // Reset selected file
        currentState.activeGroupKey = groupKey;
        currentState.selectedFileIdInGroup = preselectFileId;

        setViewMode('groupDetail');
        groupDetailHeaderContent.innerHTML = `<div class="loading-inline-spinner" role="status" aria-live="polite"><div class="spinner"></div><span>Loading details for group ${sanitize(groupKey)}...</span></div>`;
        groupDetailFileList.innerHTML = '';
        if(groupDetailFileActionsContainer) groupDetailFileActionsContainer.style.display = 'none';
        if(groupDetailFileActionsContent) groupDetailFileActionsContent.innerHTML = '';

        // Try to find the group in already loaded data (e.g., weeklyUpdatesGroupedData or groupedDataForCurrentView)
        let groupData = weeklyUpdatesGroupedData.find(g => g.groupKey === groupKey) ||
                        groupedDataForCurrentView.find(g => g.groupKey === groupKey);

        if (groupData) {
            currentGroupDetailData = groupData;
            await renderGroupDetailPageContent(groupData, preselectFileId, signal);
        } else {
            // If group not found in existing client-side data, we might need to fetch it.
            // This implies the API needs to be able to return a specific group or all files for a groupKey.
            // For now, let's assume the groupKey was derived from a search, so its files should be in rawFetchedFilesData
            // If not, this is a deep link, and we need a strategy.
            // Simplification: If not found client-side, show error or try to fetch ALL files for that title/year/type.
            // This is complex. For now, rely on it being in current search results or updates.
            console.warn(`Group with key ${groupKey} not found in current data. Deep link might require specific API endpoint.`);
            // As a fallback, try to fetch all files matching the search term that might have produced this groupKey.
            // This is tricky because groupKey is abstract. Best to ensure it's from a list we already have.
            // For now, if we fetch all by ID for first file, we can then construct the group
             try {
                // This is a placeholder. A robust solution would involve fetching based on groupKey attributes.
                // Or, if groupKey was an ID of a "master" entry.
                // For now, if a single file ID was part of groupKey (e.g. original share link) try fetching that one file
                // and then try to find its siblings. This is very heuristic.
                const representativeFileIdIfKnown = groupKey.split('_').pop(); // Highly speculative
                if (/^\d+$/.test(representativeFileIdIfKnown)){
                    const fileData = await fetchApiData({ id: representativeFileIdIfKnown }, signal);
                    if (fileData && fileData.items && fileData.items.length > 0) {
                        const processedFile = preprocessMovieData(fileData.items[0]);
                        // Now, we'd ideally fetch ALL files that would belong to this processedFile's groupKey
                        // This part is non-trivial without an API that supports "get all files for group X"
                        // For this example, we'll assume this one file IS the group (not ideal)
                        const tempGroup = groupFilesByTitle([processedFile])[0];
                        if (tempGroup) {
                            currentGroupDetailData = tempGroup;
                             await renderGroupDetailPageContent(tempGroup, preselectFileId, signal);
                        } else {
                             throw new Error("Could not reconstruct group from single file.");
                        }
                    } else {
                        throw new Error("File for group key not found via ID.");
                    }
                } else {
                    throw new Error("Group key not in a recognizable format for individual fetch.");
                }

            } catch (error) {
                if (signal.aborted) return;
                groupDetailHeaderContent.innerHTML = `<div class="error-message" role="alert">Error: Group with key <strong>${sanitize(groupKey)}</strong> details could not be loaded. ${sanitize(error.message)}</div>`;
                document.title = "Group Not Found - Cinema Ghar Index";
            }
        }
         if (pageLoader && pageLoader.style.display !== 'none' && !signal.aborted) {
            pageLoader.style.display = 'none';
        }
    }

    async function renderGroupDetailPageContent(groupData, preselectFileId, signal) {
        document.title = `${groupData.displayTitle || 'Group Detail'} - Cinema Ghar Index`;

        // Fetch TMDb details for the group header if not already present or if forced
        if (!groupData.tmdbDetails || !groupData.tmdbDetails.posterPathFetched) { // fetch if no details or not even attempted
            if (globalTmdbCache.has(groupData.groupKey)){
                groupData.tmdbDetails = globalTmdbCache.get(groupData.groupKey);
            } else {
                const tmdbQuery = new URLSearchParams();
                tmdbQuery.set('query', groupData.representativeFile.extractedTitle);
                tmdbQuery.set('type', groupData.isSeries ? 'tv' : 'movie');
                if (!groupData.isSeries && groupData.year) {
                    tmdbQuery.set('year', groupData.year);
                }
                tmdbQuery.set('fetchFullDetails', 'true'); // Get all details for header
                const tmdbUrl = `${config.TMDB_API_PROXY_URL}?${tmdbQuery.toString()}`;
                const tmdbController = new AbortController();
                const tmdbTimeoutId = setTimeout(() => tmdbController.abort(), config.TMDB_FETCH_TIMEOUT);
                try {
                    const tmdbResponse = await fetch(tmdbUrl, { signal: tmdbController.signal });
                    clearTimeout(tmdbTimeoutId);
                    if (tmdbResponse.ok) {
                        groupData.tmdbDetails = await tmdbResponse.json();
                        globalTmdbCache.set(groupData.groupKey, groupData.tmdbDetails); // Cache it
                    } else {
                        groupData.tmdbDetails = { posterPathFetchFailed: true }; // Mark as failed
                    }
                    groupData.tmdbDetails.posterPathFetched = true; // Mark as attempted
                } catch (tmdbError) {
                    clearTimeout(tmdbTimeoutId);
                    if (tmdbError.name !== 'AbortError' && !signal.aborted) console.error("Error fetching TMDb details for group detail view:", tmdbError);
                    if (!groupData.tmdbDetails) groupData.tmdbDetails = {};
                    groupData.tmdbDetails.posterPathFetchFailed = true;
                    groupData.tmdbDetails.posterPathFetched = true;
                }
            }
        }

        if (signal.aborted) return;

        groupDetailHeaderContent.innerHTML = createGroupDetailHeaderHTML(groupData);
        groupDetailFileList.innerHTML = createGroupDetailFileListHTML(groupData);

        if (preselectFileId) {
            const fileToSelect = groupData.files.find(f => String(f.id) === String(preselectFileId));
            if (fileToSelect) {
                displayFileActionsInGroup(fileToSelect);
                const selectedListItem = groupDetailFileList.querySelector(`.file-list-item[data-file-id="${fileToSelect.id}"]`);
                if (selectedListItem) {
                    selectedListItem.classList.add('selected');
                    setTimeout(() => selectedListItem.focus(), 50);
                }
            }
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (detailFetchAbortController && detailFetchAbortController.signal === signal && !signal.aborted) {
            detailFetchAbortController = null;
        }
    }

    // NEW: Display action buttons for a selected file within the Group Detail view
    function displayFileActionsInGroup(fileObject) {
        if (!fileObject || !currentGroupDetailData || !groupDetailFileActionsContainer || !groupDetailFileActionsContent) return;
        currentSelectedFileForActions = fileObject;
        currentState.selectedFileIdInGroup = fileObject.id;

        // Update URL to reflect selected file without full navigation
        const url = new URL(window.location);
        url.searchParams.set('fileId', fileObject.id);
        history.replaceState(history.state, '', url.toString());


        groupDetailFileActionsContent.innerHTML = createFileActionsHTML(fileObject, currentGroupDetailData.tmdbDetails);
        groupDetailFileActionsContainer.style.display = 'block';
        // Highlight selected file in the list
        groupDetailFileList.querySelectorAll('.file-list-item.selected').forEach(el => el.classList.remove('selected'));
        const selectedListItem = groupDetailFileList.querySelector(`.file-list-item[data-file-id="${fileObject.id}"]`);
        if (selectedListItem) selectedListItem.classList.add('selected');

        // Scroll to actions if they are off-screen
        setTimeout(() => {
            groupDetailFileActionsContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            const firstButton = groupDetailFileActionsContent.querySelector('button, a');
            if(firstButton) firstButton.focus();
        }, 100);
        saveStateToLocalStorage(); // Save selected file
    }

    // NEW: Clear file actions display
    function clearFileActionsInGroup() {
        currentSelectedFileForActions = null;
        currentState.selectedFileIdInGroup = null;
        if (groupDetailFileActionsContainer) groupDetailFileActionsContainer.style.display = 'none';
        if (groupDetailFileActionsContent) groupDetailFileActionsContent.innerHTML = '';
        groupDetailFileList.querySelectorAll('.file-list-item.selected').forEach(el => el.classList.remove('selected'));

        const url = new URL(window.location);
        url.searchParams.delete('fileId');
        history.replaceState(history.state, '', url.toString());
        saveStateToLocalStorage();
    }


    // MODIFIED: Update file details after bypass (targets specific file in group)
    function updateFileAfterBypass(fileId, encodedFinalUrl) {
        if (!currentGroupDetailData || !currentSelectedFileForActions || String(currentSelectedFileForActions.id) !== String(fileId)) {
            console.warn("Bypass update context mismatch or file not selected:", fileId, currentSelectedFileForActions);
            return;
        }
        // Update the file object in the group's files array
        const fileIndex = currentGroupDetailData.files.findIndex(f => String(f.id) === String(fileId));
        if (fileIndex > -1) {
            currentGroupDetailData.files[fileIndex].url = encodedFinalUrl;
            // Also update the currently selected file object if it's the one
            if (String(currentSelectedFileForActions.id) === String(fileId)) {
                currentSelectedFileForActions.url = encodedFinalUrl;
            }
             // Re-render the action buttons for this file
            displayFileActionsInGroup(currentGroupDetailData.files[fileIndex]);
            const playButton = groupDetailFileActionsContent.querySelector('.play-button');
            if(playButton) setTimeout(() => playButton.focus(), 50);
        }

        // If player is open and playing this bypassed file, update its src
        if (videoContainer.style.display !== 'none' && videoElement.dataset.playingFileId === fileId) {
            console.log("Player was active for bypassed file, attempting to update src");
            // streamVideo might be too much, just update src if title and filename are same
            if(videoElement.src !== encodedFinalUrl) {
                 videoElement.src = encodedFinalUrl;
                 videoElement.load();
                 videoElement.play().catch(e => console.warn("Video play after bypass update failed:", e));
            }
             if (vlcText) vlcText.innerText = encodedFinalUrl;
        }
    }

    // --- Player Logic ---
    function streamVideo(title, url, filenameForAudioCheck, isFromCustom = false, fileIdPlaying = null) {
        let playerPlacementTarget = null;
        if (isGlobalCustomUrlMode) {
            playerPlacementTarget = container; // Global mode attaches to main container
        } else if (currentViewMode === 'groupDetail' && groupDetailFileActionsContainer) {
            playerPlacementTarget = groupDetailFileActionsContainer; // Place player near file actions
        } else {
            console.warn("Cannot determine where to place the video player.");
            return;
        }

        if (!videoContainer || !videoElement || !playerPlacementTarget) return;
        if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none'; // Hide custom URL input by default
        if (videoElement) videoElement.style.display = 'block';
        if (customControlsContainer) customControlsContainer.style.display = 'flex';
        if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; }
        if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; }
        clearCopyFeedback();

        if (videoContainer.parentElement !== playerPlacementTarget) {
            if (videoContainer.parentElement) videoContainer.parentElement.removeChild(videoContainer);
            // Insert player before action content or at the end of the target.
            if (playerPlacementTarget.firstChild && playerPlacementTarget.id === 'group-detail-file-actions-container') {
                 playerPlacementTarget.insertBefore(videoContainer, playerPlacementTarget.firstChild);
            } else {
                playerPlacementTarget.appendChild(videoContainer);
            }
        }
        if (videoElement.hasAttribute('src')) { videoElement.pause(); videoElement.removeAttribute('src'); videoElement.currentTime = 0; videoElement.load(); }
        if (vlcBox) vlcBox.style.display = 'none'; // Hide VLC box until stream starts

        const savedVolume = localStorage.getItem(config.PLAYER_VOLUME_KEY);
        const savedSpeed = localStorage.getItem(config.PLAYER_SPEED_KEY);
        videoElement.volume = (savedVolume !== null) ? Math.max(0, Math.min(1, parseFloat(savedVolume))) : 1;
        if (volumeSlider) volumeSlider.value = videoElement.volume;
        videoElement.muted = (videoElement.volume === 0);
        videoElement.playbackRate = (savedSpeed !== null) ? parseFloat(savedSpeed) : 1;
        if(playbackSpeedSelect) playbackSpeedSelect.value = String(videoElement.playbackRate);
        updateMuteButton();
        videoElement.currentTime = 0;

        videoElement.dataset.playingFileId = fileIdPlaying || ''; // Store ID of file being played

        const ddp51Regex = /\bDDP?([ ._-]?5\.1)?\b/i; const advancedAudioRegex = /\b(DTS|ATMOS|TrueHD)\b/i; const multiAudioHintRegex = /\b(Multi|Dual)[ ._-]?Audio\b/i; let warningText = "";
        if (filenameForAudioCheck && !isFromCustom) { const lowerFilename = (filenameForAudioCheck || '').toLowerCase(); if (ddp51Regex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DDP audio might not work. Use external player."; } else if (advancedAudioRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> DTS/Atmos/TrueHD audio likely unsupported. Use external player."; } else if (multiAudioHintRegex.test(lowerFilename)) { warningText = "<strong>Audio Note:</strong> May contain multiple audio tracks. Use selector below or external player."; } }
        if (warningText && audioWarningDiv) { audioWarningDiv.innerHTML = warningText; audioWarningDiv.style.display = 'block'; }

        if (videoTitle) videoTitle.innerText = title || "Video";
        if (vlcText) vlcText.innerText = url;
        if (vlcBox) vlcBox.style.display = 'block';

        videoElement.src = url;
        videoElement.load();
        videoElement.play().catch(e => { console.warn("Video play failed:", e); handleVideoError(e); }); // Call handleVideoError on initial play fail
        if (videoContainer.style.display === 'none') { videoContainer.style.display = 'flex'; }

        if (!isGlobalCustomUrlMode) {
            const closeButton = videoContainer.querySelector('.close-btn');
            if (closeButton) { setTimeout(() => closeButton.focus(), 100); }
            setTimeout(() => { videoContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150);
        }
    }
    window.closePlayer = function(elementToFocusAfter = null) { /* ... (Keep existing closePlayer logic, ensure lastFocusedElement behavior is fine) ... */
        if (elementToFocusAfter instanceof Event) { elementToFocusAfter = elementToFocusAfter?.target; }
        if (!videoContainer || !videoElement) return;
        const parentContainer = videoContainer.parentElement;
        const wasGlobalMode = isGlobalCustomUrlMode;
        try { const fsElement = document.fullscreenElement || document.webkitFullscreenElement; if (fsElement && (fsElement === videoElement || fsElement === videoContainer)) { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } } catch(err) {}
        videoElement.pause(); videoElement.removeAttribute('src'); videoElement.currentTime = 0; videoElement.load(); delete videoElement.dataset.playingFileId;
        videoContainer.style.display = 'none'; videoContainer.classList.remove('global-custom-url-mode', 'is-fullscreen');
        isGlobalCustomUrlMode = false;
        if (vlcBox) vlcBox.style.display = 'none';
        if (audioWarningDiv) { audioWarningDiv.style.display = 'none'; audioWarningDiv.innerHTML = ''; }
        if (audioTrackSelect) { audioTrackSelect.innerHTML = ''; audioTrackSelect.style.display = 'none'; }
        if (playerCustomUrlSection) playerCustomUrlSection.style.display = 'none';
        if (playerCustomUrlInput) playerCustomUrlInput.value = '';
        if (playerCustomUrlFeedback) playerCustomUrlFeedback.textContent = '';
        clearCopyFeedback(); clearBypassFeedback();
        if (videoTitle) videoTitle.innerText = '';
        if (parentContainer && parentContainer.contains(videoContainer)) { parentContainer.removeChild(videoContainer); }

        if (wasGlobalMode) {
            resetToHomepage(); lastFocusedElement = null; return;
        }

        let finalFocusTarget = elementToFocusAfter || lastFocusedElement;
        // NEW: Focus logic for group detail view
        if (!wasGlobalMode && currentViewMode === 'groupDetail' && groupDetailFileActionsContent) {
            const playButton = groupDetailFileActionsContent.querySelector('.play-button');
            if (playButton) {
                finalFocusTarget = playButton;
            } else {
                const firstButtonInActions = groupDetailFileActionsContent.querySelector('.button');
                if (firstButtonInActions) finalFocusTarget = firstButtonInActions;
                else { // Fallback to the selected file list item or the list itself
                    const selectedFileItem = groupDetailFileList.querySelector('.file-list-item.selected');
                    finalFocusTarget = selectedFileItem || groupDetailFileList.querySelector('.file-list-item') || groupDetailFileList;
                }
            }
        }
        // Fallback to old item detail view focus if somehow active (should be rare)
        else if (!wasGlobalMode && currentViewMode === 'itemDetail' && itemDetailContent) {
            const playButton = itemDetailContent.querySelector('.play-button');
            if (playButton) finalFocusTarget = playButton;
            else { const firstButton = itemDetailContent.querySelector('.button'); if (firstButton) finalFocusTarget = firstButton; else finalFocusTarget = itemDetailContent; }
        }


        if (finalFocusTarget && typeof finalFocusTarget.focus === 'function') { setTimeout(() => { try { finalFocusTarget.focus({preventScroll: true}); } catch(e) {} }, 50); }
        lastFocusedElement = null;
    }
    function closePlayerIfNeeded(elementToFocusAfter = null) { if (videoContainer?.style.display !== 'none') { closePlayer(elementToFocusAfter); } }
    // ... (seekVideo, toggleMute, setVolume, setPlaybackSpeed, toggleFullscreen, changeAudioTrack, etc. remain largely the same) ...
    // Make sure they target videoElement correctly.

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
    // function highlightVlcText() { /* ... */ } // This might be less relevant or needs context
    function handlePlayerKeyboardShortcuts(event) { if (!videoContainer || videoContainer.style.display === 'none' || !videoElement) return; const targetTagName = event.target.tagName.toLowerCase(); if (targetTagName === 'input' || targetTagName === 'select' || targetTagName === 'textarea') return; const key = event.key; let prevented = false; switch (key) { case ' ': case 'k': togglePlayPause(); prevented = true; break; case 'ArrowLeft': seekVideo(-10); prevented = true; break; case 'ArrowRight': seekVideo(10); prevented = true; break; case 'ArrowUp': setVolume(Math.min(videoElement.volume + 0.05, 1)); if(volumeSlider) volumeSlider.value = videoElement.volume; prevented = true; break; case 'ArrowDown': setVolume(Math.max(videoElement.volume - 0.05, 0)); if(volumeSlider) volumeSlider.value = videoElement.volume; prevented = true; break; case 'm': toggleMute(); prevented = true; break; case 'f': toggleFullscreen(); prevented = true; break; } if (prevented) event.preventDefault(); }


    // --- State Persistence ---
    function saveStateToLocalStorage() {
        try {
            const stateToSave = {
                sortColumn: currentState.sortColumn,
                sortDirection: currentState.sortDirection,
                qualityFilter: currentState.qualityFilter,
                searchTerm: currentState.searchTerm,
                viewMode: currentViewMode, // Save current view
                activeTab: activeResultsTab,
                currentPage: currentState.currentPage,
                activeGroupKey: currentState.activeGroupKey, // Save active group
                selectedFileIdInGroup: currentState.selectedFileIdInGroup // Save selected file in group
            };
            localStorage.setItem(config.LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
        } catch (e) { console.warn("Failed to save state to localStorage:", e); }
    }
    function loadStateFromLocalStorage() {
        try {
            const savedState = localStorage.getItem(config.LOCAL_STORAGE_KEY);
            if (savedState) {
                const parsedState = JSON.parse(savedState);
                currentState.sortColumn = parsedState.sortColumn || 'lastUpdated';
                currentState.sortDirection = ['asc', 'desc'].includes(parsedState.sortDirection) ? parsedState.sortDirection : 'desc';
                currentState.qualityFilter = parsedState.qualityFilter || '';
                currentState.searchTerm = parsedState.searchTerm || '';
                currentViewMode = ['homepage', 'search', 'groupDetail'].includes(parsedState.viewMode) ? parsedState.viewMode : 'homepage';
                activeResultsTab = parsedState.activeTab || 'allFiles';
                currentState.currentPage = parsedState.currentPage || 1;
                currentState.activeGroupKey = parsedState.activeGroupKey || null;
                currentState.selectedFileIdInGroup = parsedState.selectedFileIdInGroup || null;

                // If loading into search, set typeFilter from activeTab
                if (currentViewMode === 'search') {
                    currentState.typeFilter = tabMappings[activeResultsTab]?.typeFilter || '';
                    if(searchInput) searchInput.value = currentState.searchTerm;
                } else if (currentViewMode === 'groupDetail' && currentState.activeGroupKey) {
                    // If loading into groupDetail, search term from previous search might be relevant
                    // but typeFilter and currentPage for search results list are less so.
                } else { // Homepage or other non-search/group view
                     resetToDefaultState(); // Apply full defaults if not search or groupDetail
                }
            } else {
                resetToDefaultState();
            }
        } catch (e) {
            console.warn("Failed to load state from localStorage:", e);
            localStorage.removeItem(config.LOCAL_STORAGE_KEY);
            resetToDefaultState();
        }
        currentGroupDetailData = null;
        currentSelectedFileForActions = null;
        lastFocusedElement = null;
    }
    function resetToDefaultState() {
        currentState.sortColumn = 'lastUpdated'; currentState.sortDirection = 'desc';
        currentState.qualityFilter = ''; currentState.searchTerm = '';
        currentState.currentPage = 1; currentState.typeFilter = '';
        currentViewMode = 'homepage'; activeResultsTab = 'allFiles';
        currentState.activeGroupKey = null; currentState.selectedFileIdInGroup = null;
    }


    // --- Initial Data Loading and Setup ---
    async function fetchApiData(params = {}, signal = null) {
        if (!params.id && !params.groupKey && searchAbortController) { // groupKey is not an API param yet
            searchAbortController.abort();
        }
        let currentSignal = signal;
        if (!currentSignal && !params.id && !params.groupKey) {
            searchAbortController = new AbortController();
            currentSignal = searchAbortController.signal;
        } else if (signal) {
            // Use provided signal
        } else { // For ID or groupKey fetches if no signal provided
            const tempController = new AbortController();
            currentSignal = tempController.signal;
        }

        const query = new URLSearchParams();
        if (params.id) { // Fetching specific file by its ID
            query.set('id', params.id);
        } else { // Fetching a list of files (for search, updates, etc.)
            query.set('page', params.page || currentState.currentPage);
            query.set('limit', params.limit || currentState.limit);
            query.set('sort', params.sort || currentState.sortColumn);
            query.set('sortDir', params.sortDir || currentState.sortDirection);
            const searchTerm = params.search !== undefined ? params.search : currentState.searchTerm;
            if (searchTerm) query.set('search', searchTerm);
            const qualityFilter = params.quality !== undefined ? params.quality : currentState.qualityFilter;
            if (qualityFilter) query.set('quality', qualityFilter);
            const typeFilter = params.type !== undefined ? params.type : currentState.typeFilter;
            if (typeFilter) query.set('type', typeFilter);
        }

        const url = `${config.MOVIE_DATA_API_URL}?${query.toString()}`;
        try {
            const response = await fetch(url, { signal: currentSignal });
            if (!response.ok) {
                let errorBody = null; try { errorBody = await response.json(); } catch (_) {}
                const errorDetails = errorBody?.error || errorBody?.details || `Status: ${response.status}`;
                throw new Error(`API Error: ${errorDetails}`);
            }
            const data = await response.json();
            // Store raw files if this is for current search view, before grouping
            if (!params.id && currentViewMode === 'search' && params.search === currentState.searchTerm) {
                 rawFetchedFilesData = data.items || [];
            }

            if (!params.id && tabMappings[activeResultsTab]) {
                const activePagination = tabMappings[activeResultsTab]?.pagination;
                if (activePagination && data.totalPages !== undefined) {
                    activePagination.dataset.totalPages = data.totalPages;
                }
            }
            return data;
        } catch (error) {
            if (error.name === 'AbortError') { return null; }
            throw error;
        } finally {
            if (currentSignal === searchAbortController?.signal && !signal) {
                searchAbortController = null;
            }
        }
    }

    async function fetchAndRenderResults() { // Fetches files, then calls renderActiveResultsView which groups them
        if (currentViewMode !== 'search') return;
        try {
            const apiResponse = await fetchApiData(); // Fetches raw files
            if (apiResponse === null) return; // Aborted
            renderActiveResultsView(apiResponse); // This function will group and render
            saveStateToLocalStorage();
        } catch (error) {
            if (error.name !== 'AbortError') {
                const { gridContainer } = tabMappings[activeResultsTab];
                if (gridContainer) { gridContainer.innerHTML = `<div class="error-message grid-status-message">Error loading results: ${error.message}. Please try again.</div>`; }
                Object.values(tabMappings).forEach(m => { if(m.pagination) m.pagination.style.display = 'none'; });
            }
        }
    }

    function populateQualityFilter(filesOrGroups = []) { // Can take files or groups (if groups store qualities)
        if (!qualityFilterSelect) return;
        const currentSelectedValue = qualityFilterSelect.value;
        uniqueQualities.clear(); // Clear before repopulating

        filesOrGroups.forEach(item => {
            if (item.files && Array.isArray(item.files)) { // It's a group
                item.files.forEach(file => {
                    if (file.displayQuality && file.displayQuality !== 'N/A') {
                        uniqueQualities.add(file.displayQuality);
                    }
                });
            } else if (item.displayQuality && item.displayQuality !== 'N/A') { // It's a file
                uniqueQualities.add(item.displayQuality);
            }
        });

        const sortedQualities = [...uniqueQualities].sort((a, b) => { /* ... (keep existing sort logic) ... */
            const getScore = (q) => { q = String(q || '').toUpperCase().trim(); const resMatch = q.match(/^(\d{3,4})P$/); if (q === '4K' || q === '2160P') return 100; if (resMatch) return parseInt(resMatch[1], 10); if (q === '1080P') return 90; if (q === '720P') return 80; if (q === '480P') return 70; if (['WEBDL', 'BLURAY', 'BDRIP', 'BRRIP'].includes(q)) return 60; if (['WEBIP', 'HDTV', 'HDRIP'].includes(q)) return 50; if (['DVD', 'DVDRIP'].includes(q)) return 40; if (['DVDSCR', 'HC', 'HDCAM', 'TC', 'TS', 'CAM'].includes(q)) return 30; if (['HDR', 'DOLBY VISION', 'DV', 'HEVC', 'X265'].includes(q)) return 20; return 0; }; const scoreA = getScore(a); const scoreB = getScore(b); if (scoreA !== scoreB) return scoreB - scoreA; return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
        });
        while (qualityFilterSelect.options.length > 1) { qualityFilterSelect.remove(1); }
        sortedQualities.forEach(quality => { if (quality && quality !== 'N/A') { const option = document.createElement('option'); option.value = quality; option.textContent = quality; qualityFilterSelect.appendChild(option); } });
        qualityFilterSelect.value = [...qualityFilterSelect.options].some(opt => opt.value === currentSelectedValue) ? currentSelectedValue : "";
        updateFilterIndicator();
    }
    function displayLoadError(message) { /* ... (keep existing logic) ... */ }

    async function initializeApp() {
        isInitialLoad = true;
        if (pageLoader) pageLoader.style.display = 'flex';
        loadStateFromLocalStorage(); // Sets currentViewMode, searchTerm, activeGroupKey etc.

        if (qualityFilterSelect) {
            qualityFilterSelect.value = currentState.qualityFilter || '';
            updateFilterIndicator();
        }

        // Fetch suggestion data (individual files for search autocomplete)
        // And data for quality filter population, using a large limit once.
        try {
            // Fetch a decent amount of recent files for suggestions and initial quality population.
            // For suggestions, it might be better to fetch ALL distinct filenames if possible, or a very large recent set.
            // For this example, using a fixed large limit.
            const initialFilesData = await fetchApiData({ limit: 5000, sort: 'lastUpdated', sortDir: 'desc' });
            if (initialFilesData && initialFilesData.items) {
                localSuggestionData = initialFilesData.items.map(preprocessMovieData); // For suggestions
                populateQualityFilter(localSuggestionData); // Populate quality filter from these files
            }
        } catch (e) {
            if (e.name !== 'AbortError') console.error("Error fetching initial data for suggestions/quality filter:", e);
        }

        // Handle URL determines the initial view based on params or saved state
        handleUrlChange(); // This will call displayGroupDetail or fetchAndRenderResults if needed

        // If after handleUrlChange, we are on homepage and updates are not loaded, load them.
        if (currentViewMode === 'homepage' && weeklyUpdatesGroupedData.length === 0) {
            await loadUpdatesPreview(); // This fetches files, groups them, and displays
        }

        // Hide page loader if not already hidden by handleUrlChange (e.g. if going to homepage)
        if (pageLoader && pageLoader.style.display !== 'none' && currentViewMode !== 'groupDetail') {
            pageLoader.style.display = 'none';
        }
        isInitialLoad = false;
    }

    // --- Event Handling Setup ---
    function handleActionClick(event) { // This is now for buttons INSIDE file actions or player
        const target = event.target;
        const actionButtonContainer = target.closest('#group-detail-file-actions-content'); // Actions within group detail
        const playerButtonContainer = target.closest('#playerCustomUrlSection'); // Custom URL within player

        if (!actionButtonContainer && !playerButtonContainer) return;

        const button = target.closest('.button');
        if (!button) return;

        const action = button.dataset.action;
        let actionHandled = false;

        if (action === 'play') {
            const url = button.dataset.url;
            const title = button.dataset.title || currentSelectedFileForActions?.displayFilename;
            const filename = button.dataset.filename || currentSelectedFileForActions?.displayFilename;
            const fileId = currentSelectedFileForActions?.id;
            if (url && currentSelectedFileForActions) {
                event.preventDefault(); lastFocusedElement = button; isGlobalCustomUrlMode = false;
                streamVideo(title, url, filename, false, fileId);
                actionHandled = true;
            }
        } else if (action === 'copy-vlc') {
            const url = button.dataset.url;
            if (url) { event.preventDefault(); lastFocusedElement = button; copyVLCLink(button, url); actionHandled = true; }
        } else if (action === 'open-intent') {
            const url = button.dataset.url;
            if (url) { event.preventDefault(); lastFocusedElement = button; openWithIntent(url); actionHandled = true; }
        } else if (action === 'share-file') { // Updated for specific file share
             event.preventDefault(); lastFocusedElement = button; handleShareFileClick(button); actionHandled = true;
        } else if (action === 'toggle-custom-url-input') { // Toggle custom URL input within player
            event.preventDefault(); lastFocusedElement = button;
            toggleCustomUrlInputVisibility(); // This toggles the section INSIDE the video player
            actionHandled = true;
        } else if (action === 'bypass-hubcloud') {
            event.preventDefault(); lastFocusedElement = button; triggerHubCloudBypass(button); actionHandled = true;
        } else if (action === 'bypass-gdflix') {
            event.preventDefault(); lastFocusedElement = button; triggerGDFLIXBypass(button); actionHandled = true;
        } else if (button.matches('#playerPlayCustomUrlButton')) { // Play from custom URL input inside player
            event.preventDefault(); lastFocusedElement = button;
            if (isGlobalCustomUrlMode) { handleGlobalPlayCustomUrl(event); }
            else { playFromCustomUrlInput(event.target); }
            actionHandled = true;
        }
    }

    function handleGlobalCustomUrlClick(event) { /* ... (Keep existing logic, ensure player is appended to main 'container') ... */
        event.preventDefault(); lastFocusedElement = event.target; if (!container || !videoContainer || !playerCustomUrlSection || !playerCustomUrlInput) return; closePlayerIfNeeded(null); if (videoContainer.parentElement !== container) { if (videoContainer.parentElement) { videoContainer.parentElement.removeChild(videoContainer); } container.appendChild(videoContainer); } else { if (!container.contains(videoContainer)) { container.appendChild(videoContainer); } } if(resultsArea) resultsArea.style.display = 'none'; if(itemDetailView) itemDetailView.style.display = 'none'; if(groupDetailView) groupDetailView.style.display = 'none'; if(searchFocusArea) searchFocusArea.style.display = 'none'; if(pageFooter) pageFooter.style.display = 'none'; isGlobalCustomUrlMode = true; videoContainer.classList.add('global-custom-url-mode'); if (videoElement) videoElement.style.display = 'none'; if (customControlsContainer) customControlsContainer.style.display = 'none'; if (videoTitle) videoTitle.innerText = 'Play Custom URL'; if (vlcBox) vlcBox.style.display = 'none'; if (audioWarningDiv) audioWarningDiv.style.display = 'none'; playerCustomUrlSection.style.display = 'flex'; if (playerCustomUrlInput) playerCustomUrlInput.value = ''; if (playerCustomUrlFeedback) playerCustomUrlFeedback.textContent = ''; videoContainer.style.display = 'flex'; if (playerCustomUrlInput) { setTimeout(() => playerCustomUrlInput.focus(), 50); }
    }
    function handleGlobalPlayCustomUrl(event) { /* ... (Keep existing logic) ... */
        event.preventDefault(); if (!playerCustomUrlInput || !playerCustomUrlFeedback) return; const customUrlRaw = playerCustomUrlInput.value.trim(); playerCustomUrlFeedback.textContent = ''; if (!customUrlRaw) { playerCustomUrlFeedback.textContent = 'Please enter a URL.'; playerCustomUrlInput.focus(); return; } let customUrlEncoded = customUrlRaw; try { new URL(customUrlRaw); customUrlEncoded = customUrlRaw.replace(/ /g, '%20'); } catch (e) { playerCustomUrlFeedback.textContent = 'Invalid URL format.'; playerCustomUrlInput.focus(); return; } if(playerCustomUrlSection) playerCustomUrlSection.style.display = 'none'; if(videoElement) videoElement.style.display = 'block'; if(customControlsContainer) customControlsContainer.style.display = 'flex'; streamVideo("Custom URL Video", customUrlEncoded, null, true);
    }

    // NEW: Toggle for custom URL input section *within the video player*
    function toggleCustomUrlInputVisibility(forceShow = null) {
        if (!videoContainer || !playerCustomUrlSection || !videoElement || !customControlsContainer) return;

        // Ensure player is visible if we are showing custom URL input
        if ((forceShow === true || (forceShow === null && playerCustomUrlSection.style.display === 'none')) && videoContainer.style.display === 'none') {
            videoContainer.style.display = 'flex';
        }

        const isHiddenCurrently = playerCustomUrlSection.style.display === 'none';
        const show = forceShow !== null ? forceShow : isHiddenCurrently;

        playerCustomUrlSection.style.display = show ? 'flex' : 'none';
        videoElement.style.display = show ? 'none' : 'block'; // Hide video if custom URL input is shown
        customControlsContainer.style.display = show ? 'none' : 'flex';
        if(vlcBox) vlcBox.style.display = show ? 'none' : 'block'; // Or hide if custom URL input shown

        // Update the toggle button text if one exists in the file actions
        const customUrlToggleButtonInActions = groupDetailFileActionsContent?.querySelector('.custom-url-toggle-button');
        if (customUrlToggleButtonInActions) {
            customUrlToggleButtonInActions.setAttribute('aria-expanded', String(show));
            customUrlToggleButtonInActions.innerHTML = show ? '<span aria-hidden="true">🔼</span> Hide Custom URL Input' : '<span aria-hidden="true">🔗</span> Play Custom URL for this player';
        }

        if (show) {
            if (playerCustomUrlInput) setTimeout(() => playerCustomUrlInput.focus(), 50);
        } else {
            if (customUrlToggleButtonInActions) setTimeout(() => customUrlToggleButtonInActions.focus(), 50);
        }
    }

    function playFromCustomUrlInput(playButton) { /* ... (Keep existing logic - this is for player's own custom URL input) ... */
        const container = playButton.closest('#playerCustomUrlSection'); if (!container) return; const inputField = container.querySelector('#playerCustomUrlInput'); const feedbackSpan = container.querySelector('.player-custom-url-feedback'); const titleRef = "Custom URL Video"; if (!inputField || !feedbackSpan) return; const customUrlRaw = inputField.value.trim(); feedbackSpan.textContent = ''; if (!customUrlRaw) { feedbackSpan.textContent = 'Please enter a URL.'; inputField.focus(); return; } let customUrlEncoded = customUrlRaw; try { new URL(customUrlRaw); customUrlEncoded = customUrlRaw.replace(/ /g, '%20'); } catch (e) { feedbackSpan.textContent = 'Invalid URL format.'; inputField.focus(); return; }
        // isGlobalCustomUrlMode is already set if this button is part of global flow.
        // If not global, this means it was triggered from a file's actions.
        if(playerCustomUrlSection) playerCustomUrlSection.style.display = 'none';
        if(videoElement) videoElement.style.display = 'block';
        if(customControlsContainer) customControlsContainer.style.display = 'flex';
        streamVideo(titleRef, customUrlEncoded, null, true, null); // fileIdPlaying is null for custom URLs
    }

    // --- HubCloud/GDFLIX Bypass Logic ---
    async function triggerHubCloudBypass(buttonElement) {
        const hubcloudUrl = buttonElement.dataset.hubcloudUrl;
        const fileIdRef = buttonElement.dataset.fileIdRef; // Get the file ID
        if (!hubcloudUrl) { setBypassButtonState(buttonElement, 'error', 'Missing URL'); return; }
        if (!fileIdRef || !currentSelectedFileForActions || String(currentSelectedFileForActions.id) !== fileIdRef) {
            setBypassButtonState(buttonElement, 'error', 'Context Error'); return;
        }
        setBypassButtonState(buttonElement, 'loading');
        const apiController = new AbortController();
        const timeoutId = setTimeout(() => { apiController.abort(); setBypassButtonState(buttonElement, 'error', 'Timeout'); }, config.BYPASS_TIMEOUT);
        try {
            const response = await fetch(config.BYPASS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hubcloudUrl }), signal: apiController.signal });
            clearTimeout(timeoutId);
            if (!response.ok) { let errorDetails = `HTTP Error: ${response.status}`; try { errorDetails = (await response.json()).details || errorDetails; } catch (_) {} throw new Error(errorDetails); }
            const result = await response.json();
            if (result.success && result.finalUrl) {
                const encodedFinalUrl = result.finalUrl.replace(/ /g, '%20');
                setBypassButtonState(buttonElement, 'success', 'Success!');
                updateFileAfterBypass(fileIdRef, encodedFinalUrl); // Pass fileIdRef
            } else { throw new Error(result.details || result.error || 'Unknown HubCloud bypass failure'); }
        } catch (error) { clearTimeout(timeoutId); if (error.name === 'AbortError' && !apiController.signal.aborted) { setBypassButtonState(buttonElement, 'error', 'Timeout'); } else if (error.name === 'AbortError') { setBypassButtonState(buttonElement, 'idle'); } else { setBypassButtonState(buttonElement, 'error', `Failed: ${error.message.substring(0, 50)}`); } }
    }
    async function triggerGDFLIXBypass(buttonElement) {
        const gdflixUrl = buttonElement.dataset.gdflixUrl;
        const fileIdRef = buttonElement.dataset.fileIdRef; // Get the file ID
        if (!gdflixUrl) { setBypassButtonState(buttonElement, 'error', 'Missing URL'); return; }
        if (!fileIdRef || !currentSelectedFileForActions || String(currentSelectedFileForActions.id) !== fileIdRef) {
            setBypassButtonState(buttonElement, 'error', 'Context Error'); return;
        }
        setBypassButtonState(buttonElement, 'loading');
        const apiController = new AbortController();
        const timeoutId = setTimeout(() => { apiController.abort(); setBypassButtonState(buttonElement, 'error', 'Timeout'); }, config.BYPASS_TIMEOUT);
        try {
            const response = await fetch(config.GDFLIX_BYPASS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gdflixUrl }), signal: apiController.signal });
            clearTimeout(timeoutId);
            if (!response.ok) { let errorDetails = `HTTP Error: ${response.status}`; try { errorDetails = (await response.json()).error || errorDetails; } catch (_) {} throw new Error(errorDetails); }
            const result = await response.json();
            if (result.success && result.finalUrl) {
                const encodedFinalUrl = result.finalUrl.replace(/ /g, '%20');
                setBypassButtonState(buttonElement, 'success', 'Success!');
                updateFileAfterBypass(fileIdRef, encodedFinalUrl); // Pass fileIdRef
            } else { throw new Error(result.error || 'Unknown GDFLIX bypass failure'); }
        } catch (error) { clearTimeout(timeoutId); if (error.name === 'AbortError' && !apiController.signal.aborted) { setBypassButtonState(buttonElement, 'error', 'Timeout'); } else if (error.name === 'AbortError') { setBypassButtonState(buttonElement, 'idle'); } else { setBypassButtonState(buttonElement, 'error', `Failed: ${error.message.substring(0, 50)}`); } }
    }
    function setBypassButtonState(buttonElement, state, message = null) { /* ... (Keep existing logic) ... */
        if (!buttonElement) return; const feedbackSpan = buttonElement.nextElementSibling; const iconSpan = buttonElement.querySelector('.button-icon'); const spinnerSpan = buttonElement.querySelector('.button-spinner'); const textSpan = buttonElement.querySelector('.button-text'); const isHubCloud = buttonElement.classList.contains('hubcloud-bypass-button'); const defaultText = isHubCloud ? 'Bypass HubCloud' : 'Bypass GDFLIX'; const defaultIconHTML = isHubCloud ? '☁️' : '🎬'; buttonElement.classList.remove('loading', 'error', 'success'); buttonElement.disabled = false; if (feedbackSpan) { feedbackSpan.style.display = 'none'; feedbackSpan.className = 'bypass-feedback'; } if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; clearTimeout(bypassFeedbackTimeout); switch (state) { case 'loading': buttonElement.classList.add('loading'); buttonElement.disabled = true; if (textSpan) textSpan.textContent = 'Bypassing...'; if (spinnerSpan) spinnerSpan.style.display = 'inline-block'; if (iconSpan) iconSpan.style.display = 'none'; if (feedbackSpan) { feedbackSpan.textContent = 'Please wait...'; feedbackSpan.classList.add('loading', 'show'); feedbackSpan.style.display = 'inline-block'; } break; case 'success': buttonElement.classList.add('success'); buttonElement.disabled = true; if (textSpan) textSpan.textContent = 'Success!'; if (iconSpan) iconSpan.innerHTML = '✅'; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.textContent = message || 'Success!'; feedbackSpan.classList.add('success', 'show'); feedbackSpan.style.display = 'inline-block'; } break; case 'error': buttonElement.classList.add('error'); buttonElement.disabled = false; if (textSpan) textSpan.textContent = defaultText; if (iconSpan) iconSpan.innerHTML = defaultIconHTML; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.textContent = message || 'Failed'; feedbackSpan.classList.add('error', 'show'); feedbackSpan.style.display = 'inline-block'; bypassFeedbackTimeout = setTimeout(() => { if (feedbackSpan.classList.contains('show')) { feedbackSpan.classList.remove('show', 'error', 'loading'); feedbackSpan.style.display = 'none'; feedbackSpan.textContent = ''; } }, 4000); } break; case 'idle': default: buttonElement.disabled = false; if (textSpan) textSpan.textContent = defaultText; if (iconSpan) iconSpan.innerHTML = defaultIconHTML; if (spinnerSpan) spinnerSpan.style.display = 'none'; if (iconSpan) iconSpan.style.display = 'inline-block'; if (feedbackSpan) { feedbackSpan.classList.remove('show', 'error', 'loading'); feedbackSpan.style.display = 'none'; feedbackSpan.textContent = ''; } break; }
    }

    // --- Event Delegation Setup ---
     function handleContentClick(event) {
         const target = event.target;
         // Click on a group card in search results or updates preview
         const groupCardTrigger = target.closest('.grid-item, .update-item');
         if (groupCardTrigger && groupCardTrigger.dataset.groupKey) {
             event.preventDefault();
             navigateToGroupView(groupCardTrigger.dataset.groupKey);
             return;
         }

         // Click on a file within the Group Detail file list
         const fileListItemTrigger = target.closest('#group-detail-file-list .file-list-item');
         if (fileListItemTrigger && currentGroupDetailData) {
             event.preventDefault();
             const fileId = fileListItemTrigger.dataset.fileId;
             // const fileIndex = parseInt(fileListItemTrigger.dataset.fileIndex, 10); // Can use index if ID not reliable
             const fileObject = currentGroupDetailData.files.find(f => String(f.id) === fileId);
             if (fileObject) {
                 lastFocusedElement = fileListItemTrigger;
                 displayFileActionsInGroup(fileObject);
             }
             return;
         }

         // Click on an action button within the Group Detail file actions area or player
         if (target.closest('#group-detail-file-actions-content') || target.closest('#playerCustomUrlSection')) {
             handleActionClick(event); // Centralized handler for these buttons
             return;
         }

          if (target.matches('.close-btn') && target.closest('#videoContainer')) {
              event.preventDefault(); lastFocusedElement = target; closePlayer(lastFocusedElement); return;
          }
          // Sorting by table headers is removed.
    }

    // --- Add Event Listeners ---
    document.addEventListener('DOMContentLoaded', async () => {
         await initializeApp(); // Initializes state, loads initial data/suggestions
         if (searchInput) { searchInput.addEventListener('input', handleSearchInput); searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); handleSearchSubmit(); } else if (event.key === 'Escape') { suggestionsContainer.style.display = 'none'; } }); searchInput.addEventListener('search', handleSearchClear); searchInput.addEventListener('blur', () => { setTimeout(() => { const searchButton = document.getElementById('searchSubmitButton'); if (document.activeElement !== searchInput && !suggestionsContainer.contains(document.activeElement) && document.activeElement !== searchButton) { suggestionsContainer.style.display = 'none'; } }, 150); }); }
         if (qualityFilterSelect) { qualityFilterSelect.addEventListener('change', triggerFilterChange); }
         if (container) { container.addEventListener('click', handleContentClick); } // Main click delegator
         if (playCustomUrlGlobalButton) { playCustomUrlGlobalButton.addEventListener('click', handleGlobalCustomUrlClick); }
         document.addEventListener('keydown', handlePlayerKeyboardShortcuts);

         document.addEventListener('click', (event) => { // For closing suggestions/player on outside click
            if (searchInput && suggestionsContainer && suggestionsContainer.style.display === 'block') { const searchWrapper = searchInput.closest('.search-input-wrapper'); if (searchWrapper && !searchWrapper.contains(event.target)) { suggestionsContainer.style.display = 'none'; } }
            if (videoContainer && videoContainer.style.display !== 'none') {
                const clickedInsidePlayer = videoContainer.contains(event.target);
                let clickedOnPotentialTrigger = false; // Check if click was on element that opened player
                if (lastFocusedElement && (lastFocusedElement === event.target || lastFocusedElement.contains(event.target))) {
                    clickedOnPotentialTrigger = true;
                }
                 // Specific check for global custom URL button
                const clickedOnGlobalCustomURLButton = playCustomUrlGlobalButton && playCustomUrlGlobalButton.contains(event.target);

                if (isGlobalCustomUrlMode) {
                    if (!clickedInsidePlayer && !clickedOnGlobalCustomURLButton) {
                        closePlayer(event.target);
                    }
                } else { // Player active in group detail view or (old) item detail
                    // Determine if click was inside the view that hosts the player actions
                    const clickedInsideGroupDetailActions = groupDetailFileActionsContainer && groupDetailFileActionsContainer.contains(event.target);
                    // const clickedInsideOldItemDetail = itemDetailContent && itemDetailContent.contains(event.target);

                    if (!clickedInsidePlayer && !clickedOnPotentialTrigger && !clickedInsideGroupDetailActions /* && !clickedInsideOldItemDetail */ ) {
                        closePlayer(event.target);
                    }
                }
            }
         }, false);

         if(videoElement) { videoElement.addEventListener('volumechange', () => { if (volumeSlider && Math.abs(parseFloat(volumeSlider.value) - videoElement.volume) > 0.01) { volumeSlider.value = videoElement.volume; } updateMuteButton(); try { localStorage.setItem(config.PLAYER_VOLUME_KEY, String(videoElement.volume)); } catch (e) {} }); videoElement.addEventListener('ratechange', () => { if(playbackSpeedSelect && playbackSpeedSelect.value !== String(videoElement.playbackRate)) { playbackSpeedSelect.value = String(videoElement.playbackRate); } try { localStorage.setItem(config.PLAYER_SPEED_KEY, String(videoElement.playbackRate)); } catch (e) {} }); videoElement.addEventListener('loadedmetadata', populateAudioTrackSelector); videoElement.removeEventListener('error', handleVideoError); videoElement.addEventListener('error', handleVideoError); }
         document.addEventListener('fullscreenchange', handleFullscreenChange); document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
     });

})();
// --- END OF SCRIPT.JS ---
