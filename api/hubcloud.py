# api/hubcloud.py
# Note: This script assumes 'requests' and 'beautifulsoup4' are installed
# in the Vercel Python runtime environment. Add them to requirements.txt.
# For lxml, add 'lxml' to requirements.txt as well.

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
    # We can't print warnings easily in serverless, rely on logs if needed

# --- Configuration (Copied from your provided script) ---
DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
}
REQUEST_TIMEOUT = 30
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

# --- Helper Functions for 'drive' links (Copied from your script) ---
def drive_is_intermediate_link(url):
    if not url or not isinstance(url, str) or not url.startswith('http'): return False
    try:
        domain = urlparse(url).netloc.lower()
        return any(domain == intermediate or domain.endswith('.' + intermediate) for intermediate in DRIVE_INTERMEDIATE_DOMAINS)
    except Exception: return False

def drive_extract_final_download_link(soup, base_url, log_prefix="    (drive)"):
    direct_link = None
    found_link = False
    # print(f"{log_prefix}[*] Searching for preferred button text...") # Logging removed for serverless
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
                        # print(f"{log_prefix}[+] Found via preferred text '{pattern}': {direct_link}")
                        break
                    # else: print(f"{log_prefix}[!] Found preferred text '{pattern}' but resolved href '{temp_link}' doesn't look final or is intermediate.")
            if found_link: break
        except Exception as e:
            # print(f"{log_prefix}[!] Error during preferred text search for pattern '{pattern}': {e}")
            continue
    if not found_link:
        # print(f"{log_prefix}[*] Preferred text not found/yielded final link. Searching for links with FINAL_LINK_HINTS...")
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
                        # print(f"{log_prefix}[+] Found plausible final link via hint in href: {direct_link}")
                        break
    if direct_link:
         if drive_is_intermediate_link(direct_link):
              # print(f"{log_prefix}[!] Warning: Link '{direct_link}' looked final but resolved to an intermediate domain. Discarding.")
              return None
         return direct_link
    else:
        # print(f"{log_prefix}[!] No final-looking download link found by drive methods.")
        return None

# --- Core Function for 'drive' links (Copied, logging reduced) ---
def handle_drive_link(session, hubcloud_url):
    current_url = hubcloud_url
    log_entries = [] # Collect logs instead of printing
    try:
        log_entries.append(f"Processing Drive Link: {current_url}")
        initial_headers = DEFAULT_HEADERS.copy(); initial_headers['Referer'] = 'https://google.com/'
        response_get = session.get(current_url, headers=initial_headers, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        response_get.raise_for_status()
        session.headers.update(DEFAULT_HEADERS); session.headers['Referer'] = response_get.url
        soup_get = BeautifulSoup(response_get.text, PARSER)
        current_url = response_get.url
        log_entries.append(f"Initial page fetched (Status: {response_get.status_code}, URL: {current_url})")

        form_data = {}
        log_entries.append(f"Searching for POST form data...")
        form = soup_get.find('form', {'method': re.compile('post', re.IGNORECASE)})
        if form:
            inputs = form.find_all('input', {'type': 'hidden'})
            for input_tag in inputs:
                name = input_tag.get('name'); value = input_tag.get('value')
                if name and value is not None: form_data[name] = value
            log_entries.append(f"Found form data: {form_data}")
        if 'op' not in form_data or 'id' not in form_data:
            scripts = soup_get.find_all('script')
            script_content = "\n".join([script.string for script in scripts if script.string])
            op_match = re.search(r'["\']op["\']\s*[:=]\s*["\']([^"\']+?)["\']', script_content)
            id_match = re.search(r'["\'](id|file_id)["\']\s*[:=]\s*["\']([^"\']+?)["\']', script_content)
            rand_match = re.search(r'["\']rand["\']\s*[:=]\s*["\']([^"\']+?)["\']', script_content)
            if op_match and 'op' not in form_data: form_data['op'] = op_match.group(1)
            if id_match and 'id' not in form_data: form_data['id'] = id_match.group(2)
            if rand_match and 'rand' not in form_data: form_data['rand'] = rand_match.group(1)
            if 'op' not in form_data or form_data.get('op') in ['download0', '']: form_data['op'] = 'download1'
            if 'id' not in form_data:
                try:
                    parsed_url = urlparse(current_url)
                    path_parts = unquote(parsed_url.path).strip('/').split('/')
                    potential_id = None
                    if len(path_parts) >= 2 and path_parts[0] == 'drive': potential_id = path_parts[1]
                    elif len(path_parts) >= 1 and path_parts[0]: potential_id = path_parts[0]
                    if potential_id: form_data['id'] = potential_id; log_entries.append(f"Extracted 'id' from URL path: {form_data['id']}")
                except Exception as e: log_entries.append(f"Error extracting 'id' from URL path: {e}")
        if 'op' not in form_data or 'id' not in form_data:
            log_entries.append(f"Error: Could not find required 'op' and 'id' data.")
            return None, log_entries
        log_entries.append(f"Using POST data: {form_data}")

        post_url = current_url
        session.headers['Referer'] = current_url
        response_post1 = session.post(post_url, data=form_data, timeout=REQUEST_TIMEOUT + 15, allow_redirects=True)
        response_post1.raise_for_status()
        soup_post1 = BeautifulSoup(response_post1.text, PARSER)
        current_url = response_post1.url
        session.headers['Referer'] = current_url
        log_entries.append(f"POST request successful (Status: {response_post1.status_code}, Landed on URL: {current_url})")

        log_entries.append(f"Analyzing response from {current_url}...")
        final_link = drive_extract_final_download_link(soup_post1, current_url)
        if final_link:
            log_entries.append(f"Found final link directly after first POST: {final_link}")
            return final_link, log_entries

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
                         log_entries.append(f"Found intermediate link to follow: {intermediate_link}")
                         break
        if intermediate_link:
            log_entries.append(f"Following intermediate link: {intermediate_link}")
            time.sleep(2)
            try:
                response_intermediate = session.get(intermediate_link, timeout=REQUEST_TIMEOUT + 30, allow_redirects=True)
                intermediate_final_url = response_intermediate.url
                session.headers['Referer'] = intermediate_final_url
                content_type = response_intermediate.headers.get('Content-Type', '').lower()
                if 'html' not in content_type:
                    log_entries.append(f"Intermediate link response not HTML ({content_type}). Status: {response_intermediate.status_code}. URL: {intermediate_final_url}")
                    if any(hint in intermediate_final_url for hint in DRIVE_FINAL_LINK_HINTS) and not drive_is_intermediate_link(intermediate_final_url):
                            log_entries.append(f"Intermediate GET redirected directly to final link: {intermediate_final_url}")
                            return intermediate_final_url, log_entries
                    elif 300 <= response_intermediate.status_code < 400 and 'Location' in response_intermediate.headers:
                         final_redirect_url = urljoin(intermediate_link, response_intermediate.headers['Location'])
                         if any(hint in final_redirect_url for hint in DRIVE_FINAL_LINK_HINTS) and not drive_is_intermediate_link(final_redirect_url):
                              log_entries.append(f"Found final link via intermediate redirect header: {final_redirect_url}")
                              return final_redirect_url, log_entries
                         else: log_entries.append(f"Intermediate redirect header doesn't look final: {final_redirect_url}")
                    else:
                        try:
                            response_text = response_intermediate.text
                            url_matches = re.findall(r'https?://[^\s\'"<]+', response_text)
                            for url_match in url_matches:
                                if any(hint in url_match for hint in DRIVE_FINAL_LINK_HINTS) and not drive_is_intermediate_link(url_match):
                                    log_entries.append(f"Found plausible final link in non-HTML intermediate response: {url_match}")
                                    return url_match, log_entries
                            log_entries.append(f"No plausible final link found in non-HTML intermediate response body.")
                        except Exception as decode_err: log_entries.append(f"Failed to decode/search non-HTML intermediate response: {decode_err}")
                    return None, log_entries
                response_intermediate.raise_for_status()
                soup_intermediate = BeautifulSoup(response_intermediate.text, PARSER)
                log_entries.append(f"Intermediate page fetched (Status: {response_intermediate.status_code}, Final URL: {intermediate_final_url})")
                final_link = drive_extract_final_download_link(soup_intermediate, intermediate_final_url)
                if final_link:
                     log_entries.append(f"Found final link after following intermediate link: {final_link}")
                     return final_link, log_entries
                else:
                     log_entries.append(f"Error: Could not find final link after following intermediate link.")
                     return None, log_entries
            except requests.exceptions.Timeout: log_entries.append(f"Error: Timed out fetching intermediate link: {intermediate_link}"); return None, log_entries
            except requests.exceptions.RequestException as e: log_entries.append(f"Network/HTTP Error fetching intermediate link {intermediate_link}: {e}"); return None, log_entries
            except Exception as e: log_entries.append(f"Unexpected error processing intermediate link {intermediate_link}: {e}"); return None, log_entries
        else:
             log_entries.append(f"Error: No final link or recognized intermediate link found in the first POST response.")
             return None, log_entries
    except requests.exceptions.Timeout: log_entries.append(f"Error: Request timed out during process for {hubcloud_url}"); return None, log_entries
    except requests.exceptions.RequestException as e: log_entries.append(f"Network/HTTP Error processing {hubcloud_url}: {e}"); return None, log_entries
    except Exception as e: log_entries.append(f"An unexpected error occurred for {hubcloud_url}: {e}"); return None, log_entries
    finally: log_entries.append(f"Finished Processing Drive Link: {hubcloud_url}")

# --- Helper Functions for 'video' links (Copied, logging reduced) ---
def video_fetch_and_parse(session, url, referer=None, log_entries=None):
    if log_entries is None: log_entries = []
    log_entries.append(f"Fetching: {url}")
    current_headers = session.headers.copy()
    if referer: current_headers['Referer'] = referer
    try:
        response = session.get(url, headers=current_headers, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        response.raise_for_status()
        raw_html = response.text
        session.headers['Referer'] = response.url
        log_entries.append(f"Successfully fetched (Status: {response.status_code}, Landed on: {response.url})")
        soup = BeautifulSoup(raw_html, PARSER)
        return soup, raw_html, response.url, log_entries
    except requests.exceptions.Timeout: log_entries.append(f"Request timed out ({REQUEST_TIMEOUT}s) for {url}"); return None, None, url, log_entries
    except requests.exceptions.HTTPError as http_err: log_entries.append(f"HTTP error {http_err.response.status_code} for {url}"); return None, None, getattr(http_err.response, 'url', url), log_entries
    except requests.exceptions.RequestException as req_err: log_entries.append(f"Request error for {url}: {req_err}"); return None, None, url, log_entries
    except Exception as e: log_entries.append(f"Unexpected error parsing {url}: {e}"); return None, None, url, log_entries

def video_find_intermediate_link(soup, initial_url, log_entries=None):
    if log_entries is None: log_entries = []
    if not soup: return None, log_entries
    log_entries.append("Searching for intermediate 'Generate...' link...")
    generate_link_tag = None; search_text_pattern = 'Generate Direct Download Link'; href_pattern = 'gamerxyt.com/hubcloud.php'
    potential_containers = soup.find_all('div', class_=re.compile(r'vd|buttons')); found = False
    if not potential_containers: potential_containers = [soup]
    for container in potential_containers:
        generate_link_tag = container.find('a', string=lambda text: text and search_text_pattern in text.strip())
        if generate_link_tag: log_entries.append(f"Found intermediate link by text: '{search_text_pattern}'"); found = True; break
        if not generate_link_tag:
             generate_link_tag = container.find('a', href=lambda href: href and href_pattern in href)
             if generate_link_tag: log_entries.append(f"Found intermediate link by href pattern: '{href_pattern}'"); found = True; break
    if found and generate_link_tag and generate_link_tag.get('href'):
        intermediate_url = urljoin(initial_url, generate_link_tag.get('href').strip())
        log_entries.append(f"Resolved intermediate link: {intermediate_url}")
        return intermediate_url, log_entries
    else:
        log_entries.append(f"Could not find the intermediate <a> tag using text OR href search.")
        return None, log_entries

def video_find_final_download_link(soup, raw_html, intermediate_url, log_entries=None):
    if log_entries is None: log_entries = []
    if not soup: return None, log_entries
    log_entries.append("Searching for final download link on intermediate page...")
    final_link_tag = None; link_type = None
    search_priorities = [
        {'type': 'PixelDrain', 'text_pattern': 'Download [PixelServer', 'href_hint': 'pixel'},
        {'type': 'FSL Server', 'text_pattern': 'Download [FSL Server]', 'href_hint': 'fsl.pub'},
        {'type': 'Download File [Size]', 'text_regex': r'Download File\s*\[.+\]', 'class_hint': 'btn-success'},
        {'type': 'Download [Server : Speed]', 'text_pattern': 'Download [Server :', 'href_hint': None},
        {'type': 'Generic Download Button', 'text_pattern': r'^Download( Now)?$', 'class_hint': 'btn'},
    ]
    for priority in search_priorities:
        link_type = priority['type']
        if priority.get('text_pattern'):
            final_link_tag = soup.find('a', string=lambda t: t and priority['text_pattern'] in t.strip())
            if final_link_tag: break
        if not final_link_tag and priority.get('text_regex'):
             elements_to_search = soup; class_hint = priority.get('class_hint')
             if class_hint: potential_buttons = soup.find_all('a', class_=class_hint); elements_to_search = potential_buttons if potential_buttons else soup.find_all('a')
             else: elements_to_search = soup.find_all('a')
             for element in elements_to_search:
                  element_text = element.get_text(strip=True)
                  if re.search(priority['text_regex'], element_text, re.IGNORECASE): final_link_tag = element; break
             if final_link_tag: break
        if not final_link_tag and priority.get('href_hint'):
             final_link_tag = soup.find('a', href=lambda h: h and priority['href_hint'] in h.lower())
             if final_link_tag: break
    if final_link_tag and final_link_tag.get('href'):
        href_value = final_link_tag.get('href','').strip()
        if href_value and not href_value.startswith(('#', 'javascript:')):
            final_url = urljoin(intermediate_url, href_value)
            log_entries.append(f"Found '{link_type}' link: {final_url}")
            return final_url, log_entries
        else: log_entries.append(f"Found tag for '{link_type}' but href was invalid: '{href_value}'"); final_link_tag = None
    if not final_link_tag:
        log_entries.append("FAILED TO FIND VIDEO DOWNLOAD LINK")
        log_entries.append("Could not find a usable download link with current methods.")
        # Log snippet of HTML for debugging in serverless logs
        # log_entries.append("Intermediate Page Snippet:\n" + raw_html[:1000])
        return None, log_entries

# --- Core Function for 'video' links (Copied, logging reduced) ---
def handle_video_link(session, hubcloud_url):
    final_link = None
    log_entries = []
    try:
        log_entries.append(f"Processing Video Link: {hubcloud_url}")
        session.headers.update(DEFAULT_HEADERS)
        initial_soup, _, initial_final_url, log_entries = video_fetch_and_parse(session, hubcloud_url, log_entries=log_entries)
        if not initial_soup:
            log_entries.append("Failed to fetch or parse initial page.")
            return None, log_entries

        intermediate_link, log_entries = video_find_intermediate_link(initial_soup, initial_final_url, log_entries=log_entries)
        if not intermediate_link:
            log_entries.append("Could not find the intermediate link.")
            return None, log_entries

        time.sleep(1)
        intermediate_soup, intermediate_raw_html, intermediate_final_url, log_entries = video_fetch_and_parse(session, intermediate_link, log_entries=log_entries)
        if not intermediate_soup:
            log_entries.append("Failed to fetch or parse intermediate page.")
            return None, log_entries

        final_link, log_entries = video_find_final_download_link(intermediate_soup, intermediate_raw_html, intermediate_final_url, log_entries=log_entries)

    except Exception as e:
        log_entries.append(f"FATAL ERROR during video link processing: {e}\n{traceback.format_exc()}")
        return None, log_entries
    finally: log_entries.append(f"Finished Processing Video Link: {hubcloud_url}")

    return final_link, log_entries

# --- Main Execution for Serverless/Script Usage ---
if __name__ == "__main__":
    result = {"success": False, "error": "No URL provided", "finalUrl": None, "logs": []}
    hubcloud_link_to_process = None

    # Check command-line arguments first
    if len(sys.argv) > 1:
        hubcloud_link_to_process = sys.argv[1]
    else:
        # Fallback: Read from environment variable if needed (e.g., for testing)
        hubcloud_link_to_process = os.environ.get('HUBCLOUD_URL_TO_BYPASS')

    if not hubcloud_link_to_process:
         print(json.dumps(result)) # Output JSON error if no URL
         sys.exit(1)

    try:
        parsed_start_url = urlparse(hubcloud_link_to_process)
        if not parsed_start_url.scheme or not parsed_start_url.netloc:
            result["error"] = f"Invalid URL format: {hubcloud_link_to_process}"
            print(json.dumps(result))
            sys.exit(1)

        session = requests.Session()
        path = parsed_start_url.path.lower()
        final_download_link = None
        logs = []

        if path.startswith('/drive/'):
            final_download_link, logs = handle_drive_link(session, hubcloud_link_to_process)
        elif path.startswith('/video/'):
             final_download_link, logs = handle_video_link(session, hubcloud_link_to_process)
        else:
             result["error"] = f"Unknown HubCloud URL type (path: {parsed_start_url.path})"
             result["logs"] = logs

        result["logs"] = logs # Add logs regardless of success/failure
        if final_download_link:
            result["success"] = True
            result["finalUrl"] = final_download_link
            result["error"] = None
        else:
            result["success"] = False
            # Try to extract a more specific error from the last few log entries
            if logs:
                recent_errors = [log for log in logs[-5:] if "Error:" in log or "FATAL ERROR" in log or "FAILED" in log]
                result["error"] = recent_errors[-1] if recent_errors else "Extraction Failed (Check logs for details)"
            else:
                 result["error"] = "Extraction Failed (No logs generated)"

    except Exception as e:
        result["success"] = False
        result["error"] = f"Unexpected fatal error in script: {e}"
        result["logs"].append(f"Traceback:\n{traceback.format_exc()}")

    # Ensure output is valid JSON printed to stdout
    print(json.dumps(result, indent=None)) # No indent for cleaner parsing
