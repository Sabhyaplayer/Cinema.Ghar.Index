import requests
import time
import re
from urllib.parse import urljoin, urlparse, unquote
import traceback
import sys
import json
import os # To read URL from arguments

# Try importing lxml, fall back to html.parser if not installed
try:
    from bs4 import BeautifulSoup # Must import before setting PARSER
    PARSER = "lxml"
    LXML_AVAILABLE = True
except ImportError:
    from bs4 import BeautifulSoup
    PARSER = "html.parser"
    LXML_AVAILABLE = False
    # Print warning to stderr so it appears in Vercel logs but doesn't break JSON output
    print("Warning: lxml not found, using html.parser. Parsing might be slower or less robust.", file=sys.stderr)

# --- Configuration ---
DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
}
REQUEST_TIMEOUT = 30 # In seconds
DRIVE_PREFERRED_BUTTON_TEXTS = [
    r'Download\s*\[FSL Server\]',
    r'Download\s*File\s*\[\s*\d+(\.\d+)?\s*(GB|MB)\s*\]',
    r'Download\s*\[PixelServer\s*:\s*\d+\]',
    r'Download\s*\[Server\s*:\s*\d+Gbps\]'
]
DRIVE_FINAL_LINK_HINTS = ['r2.dev', 'fsl.pub', '/dl/', '.cdn.', 'storage.', 'pixeldrain.com/api/file/']
DRIVE_INTERMEDIATE_DOMAINS = [
    'gamerxyt.com', 'adf.ly', 'linkvertise.com', 'tinyurl.com',
    'cdn.ampproject.org', 'bloggingvector.shop', 'newssongs.co.in',
]

# --- Helper Functions for 'drive' links ---
def drive_is_intermediate_link(url):
    if not url or not isinstance(url, str) or not url.startswith('http'): return False
    try:
        domain = urlparse(url).netloc.lower()
        return any(domain == intermediate or domain.endswith('.' + intermediate) for intermediate in DRIVE_INTERMEDIATE_DOMAINS)
    except Exception: return False

def drive_extract_final_download_link(soup, base_url, log_entries):
    direct_link = None
    found_link = False
    log_entries.append("(drive) Searching for preferred button text...")
    for pattern in DRIVE_PREFERRED_BUTTON_TEXTS:
        try:
            potential_matches = soup.find_all(['a', 'button'], string=re.compile(pattern, re.IGNORECASE))
            for match in potential_matches:
                href = None
                if match.name == 'a': href = match.get('href')
                elif match.name == 'button':
                    link_inside = match.find('a', href=True)
                    if link_inside: href = link_inside.get('href')
                    else:
                        onclick_attr = match.get('onclick')
                        if onclick_attr and 'window.location' in onclick_attr:
                            href_match = re.search(r"window\.location(?:.href)?\s*=\s*['\"]([^'\"]+)['\"]", onclick_attr)
                            if href_match: href = href_match.group(1)
                if href and isinstance(href, str) and href.strip() and not href.startswith(('#', 'javascript:')):
                    temp_link = urljoin(base_url, href.strip())
                    if any(hint in temp_link for hint in DRIVE_FINAL_LINK_HINTS) and not drive_is_intermediate_link(temp_link):
                        direct_link = temp_link
                        found_link = True
                        log_entries.append(f"(drive) Found via preferred text '{pattern}': {direct_link}")
                        break
                    else: log_entries.append(f"(drive) Found preferred text '{pattern}' but resolved href '{temp_link}' doesn't look final or is intermediate.")
            if found_link: break
        except Exception as e:
            log_entries.append(f"(drive) Error during preferred text search for pattern '{pattern}': {e}")
            continue # Keep trying other patterns

    if not found_link:
        log_entries.append("(drive) Preferred text not found/yielded final link. Searching for links with FINAL_LINK_HINTS...")
        potential_links = soup.find_all('a', href=True)
        for link_tag in potential_links:
            href = link_tag.get('href', '')
            if href and isinstance(href, str):
               href = href.strip()
               if href and any(hint in href for hint in DRIVE_FINAL_LINK_HINTS):
                   abs_href = urljoin(base_url, href)
                   if not drive_is_intermediate_link(abs_href):
                        direct_link = abs_href
                        found_link = True
                        log_entries.append(f"(drive) Found plausible final link via hint in href: {direct_link}")
                        break

    if direct_link:
         if drive_is_intermediate_link(direct_link):
              log_entries.append(f"(drive) Warning: Link '{direct_link}' looked final but resolved to an intermediate domain. Discarding.")
              return None # Return None if it's intermediate
         return direct_link
    else:
        log_entries.append("(drive) No final-looking download link found by drive methods.")
        return None

# --- Core Function for 'drive' links ---
def handle_drive_link(session, hubcloud_url):
    current_url = hubcloud_url
    log_entries = []
    final_link = None
    try:
        log_entries.append(f"Processing Drive Link: {current_url}")
        initial_headers = DEFAULT_HEADERS.copy(); initial_headers['Referer'] = 'https://google.com/'
        response_get = session.get(current_url, headers=initial_headers, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        response_get.raise_for_status() # Raise exception for bad status codes
        session.headers.update(DEFAULT_HEADERS); session.headers['Referer'] = response_get.url
        soup_get = BeautifulSoup(response_get.text, PARSER)
        current_url = response_get.url
        log_entries.append(f"(drive) Initial page fetched (Status: {response_get.status_code}, URL: {current_url})")

        form_data = {}
        log_entries.append("(drive) Searching for POST form data...")
        form = soup_get.find('form', {'method': re.compile('post', re.IGNORECASE)})
        if form:
            inputs = form.find_all('input', {'type': 'hidden'})
            for input_tag in inputs:
                name = input_tag.get('name'); value = input_tag.get('value')
                if name and value is not None: form_data[name] = value
            log_entries.append(f"(drive) Found form data: {form_data}")

        # Fallback to script extraction if form data is incomplete
        if 'op' not in form_data or 'id' not in form_data:
            log_entries.append("(drive) Form data incomplete, searching scripts...")
            scripts = soup_get.find_all('script')
            script_content = "\n".join([script.string for script in scripts if script.string])
            op_match = re.search(r'["\']op["\']\s*[:=]\s*["\']([^"\']+?)["\']', script_content)
            id_match = re.search(r'["\'](id|file_id)["\']\s*[:=]\s*["\']([^"\']+?)["\']', script_content)
            rand_match = re.search(r'["\']rand["\']\s*[:=]\s*["\']([^"\']+?)["\']', script_content)
            if op_match and 'op' not in form_data: form_data['op'] = op_match.group(1)
            if id_match and 'id' not in form_data: form_data['id'] = id_match.group(2)
            if rand_match and 'rand' not in form_data: form_data['rand'] = rand_match.group(1)

            # Ensure 'op' is suitable for download
            if 'op' not in form_data or form_data.get('op') in ['download0', '']: form_data['op'] = 'download1'

            # Fallback for 'id' from URL path
            if 'id' not in form_data:
                try:
                    parsed_url = urlparse(current_url)
                    path_parts = unquote(parsed_url.path).strip('/').split('/')
                    potential_id = None
                    if len(path_parts) >= 2 and path_parts[0] == 'drive': potential_id = path_parts[1]
                    elif len(path_parts) >= 1 and path_parts[0]: potential_id = path_parts[0]
                    if potential_id:
                        form_data['id'] = potential_id
                        log_entries.append(f"(drive) Extracted 'id' from URL path: {form_data['id']}")
                except Exception as e: log_entries.append(f"(drive) Error extracting 'id' from URL path: {e}")

        # Final check for required data
        if 'op' not in form_data or 'id' not in form_data:
            log_entries.append("Error: Could not find required 'op' and 'id' data for POST.")
            return None, log_entries # Return early

        log_entries.append(f"(drive) Using POST data: {form_data}")

        post_url = current_url
        session.headers['Referer'] = current_url
        # Increase timeout slightly for the POST request which might do more work
        response_post1 = session.post(post_url, data=form_data, timeout=REQUEST_TIMEOUT + 15, allow_redirects=True)
        response_post1.raise_for_status() # Raise exception for bad status codes
        soup_post1 = BeautifulSoup(response_post1.text, PARSER)
        current_url = response_post1.url
        session.headers['Referer'] = current_url
        log_entries.append(f"(drive) POST request successful (Status: {response_post1.status_code}, Landed on URL: {current_url})")

        log_entries.append(f"(drive) Analyzing response from {current_url}...")
        final_link = drive_extract_final_download_link(soup_post1, current_url, log_entries)
        if final_link:
            log_entries.append(f"(drive) Found final link directly after first POST.")
            return final_link, log_entries # Success!

        # If no direct final link, look for an intermediate one
        intermediate_link = None
        potential_links = soup_post1.find_all('a', href=True)
        for link_tag in potential_links:
            href = link_tag.get('href', '')
            if href and isinstance(href, str):
                href = href.strip()
                if href and not href.startswith(('#', 'javascript:')):
                    abs_href = urljoin(current_url, href)
                    if drive_is_intermediate_link(abs_href):
                         intermediate_link = abs_href
                         log_entries.append(f"(drive) Found intermediate link to follow: {intermediate_link}")
                         break # Found one, stop looking

        if intermediate_link:
            log_entries.append(f"(drive) Following intermediate link: {intermediate_link}")
            time.sleep(2) # Small delay before hitting intermediate link
            # Use longer timeout for intermediate links as they can be slow
            response_intermediate = session.get(intermediate_link, timeout=REQUEST_TIMEOUT + 30, allow_redirects=True)
            intermediate_final_url = response_intermediate.url
            session.headers['Referer'] = intermediate_final_url
            content_type = response_intermediate.headers.get('Content-Type', '').lower()

            # Check if the intermediate response is the final file itself
            if 'html' not in content_type:
                log_entries.append(f"(drive) Intermediate link response not HTML ({content_type}). Status: {response_intermediate.status_code}. URL: {intermediate_final_url}")
                if any(hint in intermediate_final_url for hint in DRIVE_FINAL_LINK_HINTS) and not drive_is_intermediate_link(intermediate_final_url):
                        log_entries.append(f"(drive) Intermediate GET redirected directly to final link.")
                        return intermediate_final_url, log_entries # Success!
                # Check redirect header even if status isn't 3xx, sometimes they misuse it
                elif 'Location' in response_intermediate.headers:
                     final_redirect_url = urljoin(intermediate_link, response_intermediate.headers['Location'])
                     if any(hint in final_redirect_url for hint in DRIVE_FINAL_LINK_HINTS) and not drive_is_intermediate_link(final_redirect_url):
                          log_entries.append(f"(drive) Found final link via intermediate redirect header.")
                          return final_redirect_url, log_entries # Success!
                     else: log_entries.append(f"(drive) Intermediate redirect header doesn't look final: {final_redirect_url}")
                else:
                    # Last resort: search non-HTML response body
                    try:
                        response_text = response_intermediate.text
                        url_matches = re.findall(r'https?://[^\s\'"<]+', response_text)
                        for url_match in url_matches:
                             # Be stricter here to avoid false positives
                            if any(hint in url_match for hint in DRIVE_FINAL_LINK_HINTS[-3:]) and not drive_is_intermediate_link(url_match):
                                log_entries.append(f"(drive) Found plausible final link in non-HTML intermediate response.")
                                return url_match, log_entries # Success!
                        log_entries.append(f"(drive) No plausible final link found in non-HTML intermediate response body.")
                    except Exception as decode_err: log_entries.append(f"(drive) Failed to decode/search non-HTML intermediate response: {decode_err}")
                # If we reach here after non-html check, it's likely a failure
                log_entries.append("Error: Intermediate link didn't yield a final file or recognizable redirect.")
                return None, log_entries

            # If it *was* HTML, parse it
            response_intermediate.raise_for_status() # Raise for bad status on HTML page
            soup_intermediate = BeautifulSoup(response_intermediate.text, PARSER)
            log_entries.append(f"(drive) Intermediate page fetched (Status: {response_intermediate.status_code}, Final URL: {intermediate_final_url})")
            final_link = drive_extract_final_download_link(soup_intermediate, intermediate_final_url, log_entries)
            if final_link:
                 log_entries.append(f"(drive) Found final link after following intermediate link.")
                 return final_link, log_entries # Success!
            else:
                 log_entries.append("Error: Could not find final link after following intermediate link.")
                 return None, log_entries # Failure

        else:
             log_entries.append("Error: No final link or recognized intermediate link found in the first POST response.")
             return None, log_entries # Failure

    # Catch specific exceptions for better logging
    except requests.exceptions.Timeout as e:
        log_entries.append(f"Error: Request timed out during process for {hubcloud_url}. Details: {e}")
        return None, log_entries
    except requests.exceptions.HTTPError as e:
         log_entries.append(f"Error: HTTP error occurred processing {hubcloud_url}. Status: {e.response.status_code}. URL: {e.request.url}. Details: {e}")
         return None, log_entries
    except requests.exceptions.RequestException as e:
        log_entries.append(f"Error: Network/Request error processing {hubcloud_url}. Details: {e}")
        return None, log_entries
    except Exception as e:
        # Catch any other unexpected errors
        log_entries.append(f"FATAL ERROR during drive link processing: {e}\n{traceback.format_exc()}")
        return None, log_entries

# --- Helper Functions for 'video' links ---
def video_fetch_and_parse(session, url, referer=None, log_entries=None):
    if log_entries is None: log_entries = []
    log_entries.append(f"(video) Fetching: {url}")
    current_headers = session.headers.copy()
    if referer: current_headers['Referer'] = referer
    try:
        response = session.get(url, headers=current_headers, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        response.raise_for_status()
        raw_html = response.text
        session.headers['Referer'] = response.url # Update referer for next request
        log_entries.append(f"(video) Successfully fetched (Status: {response.status_code}, Landed on: {response.url})")
        soup = BeautifulSoup(raw_html, PARSER)
        return soup, raw_html, response.url, log_entries
    except requests.exceptions.Timeout:
        log_entries.append(f"Error: Request timed out ({REQUEST_TIMEOUT}s) for {url}")
        return None, None, url, log_entries
    except requests.exceptions.HTTPError as http_err:
        log_entries.append(f"Error: HTTP error {http_err.response.status_code} for {url}")
        return None, None, getattr(http_err.response, 'url', url), log_entries
    except requests.exceptions.RequestException as req_err:
        log_entries.append(f"Error: Request error for {url}: {req_err}")
        return None, None, url, log_entries
    except Exception as e:
        log_entries.append(f"Error: Unexpected error parsing {url}: {e}")
        return None, None, url, log_entries

def video_find_intermediate_link(soup, initial_url, log_entries):
    if not soup: return None, log_entries
    log_entries.append("(video) Searching for intermediate 'Generate...' link...")
    generate_link_tag = None
    search_text_pattern = 'Generate Direct Download Link'
    href_pattern = 'gamerxyt.com/hubcloud.php' # Specific intermediate domain
    found = False

    # Look for the link specifically within button/vd divs first for better targeting
    potential_containers = soup.find_all('div', class_=re.compile(r'vd|buttons', re.IGNORECASE))
    if not potential_containers:
        potential_containers = [soup] # Fallback to searching the whole document

    for container in potential_containers:
        # Try finding by exact text first
        generate_link_tag = container.find('a', string=lambda text: text and search_text_pattern in text.strip())
        if generate_link_tag:
            log_entries.append(f"(video) Found intermediate link by text: '{search_text_pattern}'")
            found = True; break
        # If not found by text, try finding by the specific href pattern
        if not generate_link_tag:
             generate_link_tag = container.find('a', href=lambda href: href and href_pattern in href)
             if generate_link_tag:
                 log_entries.append(f"(video) Found intermediate link by href pattern: '{href_pattern}'")
                 found = True; break

    if found and generate_link_tag and generate_link_tag.get('href'):
        intermediate_url = urljoin(initial_url, generate_link_tag.get('href').strip())
        log_entries.append(f"(video) Resolved intermediate link: {intermediate_url}")
        return intermediate_url, log_entries
    else:
        log_entries.append(f"Error: Could not find the intermediate 'Generate' <a> tag using text OR href search.")
        return None, log_entries

def video_find_final_download_link(soup, raw_html, intermediate_url, log_entries):
    if not soup: return None, log_entries
    log_entries.append("(video) Searching for final download link on intermediate page...")
    final_link_tag = None
    link_type = "Unknown"

    # Prioritized search strategies
    search_priorities = [
        {'type': 'PixelDrain Button', 'tag': 'a', 'attrs': {'class': re.compile(r'btn-success', re.I)}, 'text_pattern': r'Download\s*\[PixelServer'},
        {'type': 'FSL Server Button', 'tag': 'a', 'attrs': {'class': re.compile(r'btn-success', re.I)}, 'text_pattern': r'Download\s*\[FSL Server'},
        {'type': 'Download File [Size] Button', 'tag': 'a', 'attrs': {'class': re.compile(r'btn-success', re.I)}, 'text_pattern': r'Download File\s*\['},
        {'type': 'Generic Download Button', 'tag': 'a', 'attrs': {'class': re.compile(r'btn', re.I)}, 'text_pattern': r'^Download( Now)?$'},
        {'type': 'Link with PixelDrain Hint', 'tag': 'a', 'attrs': {'href': re.compile(r'pixel', re.I)}},
        {'type': 'Link with FSL Hint', 'tag': 'a', 'attrs': {'href': re.compile(r'fsl\.pub', re.I)}},
    ]

    for priority in search_priorities:
        link_type = priority['type']
        log_entries.append(f"(video) Trying strategy: {link_type}")
        potential_tags = soup.find_all(priority['tag'], **priority.get('attrs', {}))

        for tag in potential_tags:
            # Check text pattern if specified
            if 'text_pattern' in priority:
                tag_text = tag.get_text(strip=True)
                if not re.search(priority['text_pattern'], tag_text, re.IGNORECASE):
                    continue # Text doesn't match, skip this tag

            # Check href validity
            href_value = tag.get('href','').strip()
            if href_value and not href_value.startswith(('#', 'javascript:')):
                final_link_tag = tag # Found a potential candidate
                break # Stop searching tags for this priority

        if final_link_tag:
            log_entries.append(f"(video) Found potential tag via strategy: {link_type}")
            break # Stop searching priorities

    if final_link_tag:
        href_value = final_link_tag.get('href','').strip()
        final_url = urljoin(intermediate_url, href_value)
        log_entries.append(f"(video) Resolved final link: {final_url}")
        # Add a basic check if the resolved URL looks plausible
        if not urlparse(final_url).scheme or not urlparse(final_url).netloc:
             log_entries.append(f"Error: Resolved final URL '{final_url}' seems invalid.")
             return None, log_entries
        return final_url, log_entries
    else:
        log_entries.append("FAILED TO FIND VIDEO DOWNLOAD LINK")
        log_entries.append("Could not find a usable download link with current methods.")
        # Optional: Log HTML snippet for debugging (can be verbose)
        # log_entries.append("Intermediate Page Snippet:\n" + raw_html[:1000])
        return None, log_entries

# --- Core Function for 'video' links ---
def handle_video_link(session, hubcloud_url):
    final_link = None
    log_entries = []
    try:
        log_entries.append(f"Processing Video Link: {hubcloud_url}")
        session.headers.update(DEFAULT_HEADERS) # Reset headers

        initial_soup, _, initial_final_url, log_entries = video_fetch_and_parse(session, hubcloud_url, log_entries=log_entries)
        if not initial_soup:
            log_entries.append("Error: Failed to fetch or parse initial page.")
            return None, log_entries # Critical failure

        intermediate_link, log_entries = video_find_intermediate_link(initial_soup, initial_final_url, log_entries)
        if not intermediate_link:
            log_entries.append("Error: Could not find the intermediate link.")
            return None, log_entries # Critical failure

        time.sleep(1) # Small delay
        intermediate_soup, intermediate_raw_html, intermediate_final_url, log_entries = video_fetch_and_parse(session, intermediate_link, referer=initial_final_url, log_entries=log_entries)
        if not intermediate_soup:
            log_entries.append("Error: Failed to fetch or parse intermediate page.")
            return None, log_entries # Critical failure

        final_link, log_entries = video_find_final_download_link(intermediate_soup, intermediate_raw_html, intermediate_final_url, log_entries)
        # final_link will be None if it failed

    except Exception as e:
        # Catch any unexpected error during the process
        log_entries.append(f"FATAL ERROR during video link processing: {e}\n{traceback.format_exc()}")
        return None, log_entries # Return None on fatal error

    # Return the final link (which could be None) and the logs
    return final_link, log_entries

# --- Main Execution ---
if __name__ == "__main__":
    # Initialize result structure, always return this
    result = {"success": False, "error": "Script execution failed", "finalUrl": None, "logs": []}
    logs = [] # Local list to collect logs during execution
    hubcloud_link_to_process = None
    final_download_link = None

    try:
        # Check command-line arguments first
        if len(sys.argv) > 1:
            hubcloud_link_to_process = sys.argv[1]
            logs.append(f"Received URL from command line argument: {hubcloud_link_to_process}")
        else:
            # Fallback: Read from environment variable if needed (e.g., for testing)
            hubcloud_link_to_process = os.environ.get('HUBCLOUD_URL_TO_BYPASS')
            if hubcloud_link_to_process:
                 logs.append(f"Received URL from environment variable: {hubcloud_link_to_process}")

        if not hubcloud_link_to_process:
             result["error"] = "No URL provided to script"
             # No 'logs' added yet, but print the result dict
             print(json.dumps(result))
             sys.exit(1) # Exit after printing JSON

        # Validate URL basic format
        parsed_start_url = urlparse(hubcloud_link_to_process)
        if not parsed_start_url.scheme or not parsed_start_url.netloc:
            result["error"] = f"Invalid URL format provided: {hubcloud_link_to_process}"
            logs.append(result["error"])
            result["logs"] = logs
            print(json.dumps(result))
            sys.exit(1) # Exit after printing JSON

        # --- Start Processing ---
        session = requests.Session()
        path = parsed_start_url.path.lower()

        if path.startswith('/drive/'):
            logs.append("Detected '/drive/' link type.")
            final_download_link, script_logs = handle_drive_link(session, hubcloud_link_to_process)
            logs.extend(script_logs) # Add logs from the handler
        elif path.startswith('/video/'):
             logs.append("Detected '/video/' link type.")
             final_download_link, script_logs = handle_video_link(session, hubcloud_link_to_process)
             logs.extend(script_logs) # Add logs from the handler
        else:
             result["error"] = f"Unknown HubCloud URL type (path: {parsed_start_url.path})"
             logs.append(result["error"])
             # final_download_link remains None

        # --- Populate final result ---
        result["logs"] = logs # Add collected logs to the result

        if final_download_link:
            result["success"] = True
            result["finalUrl"] = final_download_link
            result["error"] = None # Clear default error
            print("Script finished successfully.", file=sys.stderr) # Log success to stderr
        else:
            result["success"] = False
            # If no link found, try to set a more specific error message from logs
            if logs:
                # Look for common failure indicators in the last few logs
                failure_indicators = ["Error:", "FATAL ERROR", "FAILED", "Could not find", "timed out"]
                recent_errors = [log for log in logs[-5:] if any(indicator in log for indicator in failure_indicators)]
                if recent_errors:
                     # Extract the most relevant part of the error log
                     extracted_error = recent_errors[-1].split(":", 1)[-1].strip()
                     result["error"] = extracted_error[:150] # Limit error length
                elif not result.get("error"): # Keep existing error if already set (e.g., unknown type)
                     result["error"] = "Extraction Failed (No specific error found in logs)"
            else:
                 result["error"] = "Extraction Failed (No logs generated)"
            print(f"Script finished with failure. Error: {result['error']}", file=sys.stderr) # Log failure to stderr

    except Exception as e:
        # Catch any unexpected fatal error in the main block
        result["success"] = False
        result["error"] = f"Unexpected fatal error in script: {e}"
        # Add traceback to logs for debugging
        logs.append(f"FATAL EXCEPTION in main block: {e}\n{traceback.format_exc()}")
        result["logs"] = logs
        print(f"Script crashed with fatal error: {e}", file=sys.stderr) # Log crash to stderr

    finally:
        # !!! Crucial: Always print the JSON result to stdout !!!
        # Use compact separators for slightly smaller output
        print(json.dumps(result, indent=None, separators=(',', ':')))
