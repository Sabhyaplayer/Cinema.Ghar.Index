# /api/gdflix.py (Version using cloudscraper for 403)

# --- Use cloudscraper ---
import cloudscraper # Use cloudscraper instead of requests directly
# Keep other imports
from urllib.parse import urljoin, urlparse
import time
import re
import json
import traceback
import sys
import os
from http.server import BaseHTTPRequestHandler
import cgi

# --- Dependency Check & Parser Selection ---
try:
    from bs4 import BeautifulSoup
    PARSER = "lxml"
    LXML_AVAILABLE = True
    print("Using lxml parser.", file=sys.stderr)
except ImportError:
    from bs4 import BeautifulSoup
    PARSER = "html.parser"
    LXML_AVAILABLE = False
    print("Warning: lxml not found, using html.parser.", file=sys.stderr)

# --- Constants ---
REQUEST_TIMEOUT = 15     # Can potentially increase slightly with cloudscraper, but still watch Vercel limits
OVERALL_TIMEOUT = 25     # Increase slightly, Cloudflare challenges take time
POLL_INTERVAL = 3

# --- Headers (cloudscraper manages User-Agent internally, but we can add others) ---
DEFAULT_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'TE': 'trailers'
    # 'Referer' will be set dynamically
}


# --- Core GDFLIX Scraping Logic ---
def get_gdflix_download_link(start_url, logs=None):
    if logs is None:
        logs = []

    # --- Use cloudscraper session ---
    # delay is optional, helps avoid rate limits if making many requests quickly
    scraper = cloudscraper.create_scraper(
        browser=DEFAULT_HEADERS['User-Agent'], # Pass our desired UA
        delay=2 # Add a small delay between challenge solving and request
    )
    # Apply other default headers
    scraper.headers.update(DEFAULT_HEADERS)
    # -----------------------------

    final_download_link = None
    overall_start_time = time.time()

    def log_and_check_timeout(message):
        current_time = time.time()
        elapsed = current_time - overall_start_time
        logs.append(f"[{elapsed:.2f}s] {message}")
        if elapsed > OVERALL_TIMEOUT:
            logs.append(f"FATAL: Overall timeout ({OVERALL_TIMEOUT}s) exceeded.")
            raise TimeoutError("Overall GDFLIX processing time limit exceeded")

    try:
        # --- Step 1: Fetch initial page ---
        log_and_check_timeout(f"Step 1: Fetching initial URL with cloudscraper: {start_url}")
        initial_request_headers = scraper.headers.copy()
        if 'Referer' in initial_request_headers:
             del initial_request_headers['Referer'] # No referer for first hit

        try:
            # Use the scraper session like the requests session
            response1 = scraper.get(
                start_url,
                allow_redirects=True,
                timeout=REQUEST_TIMEOUT,
                headers=initial_request_headers
            )
            log_and_check_timeout(f"Step 1: Initial request status: {response1.status_code}")
            # Cloudscraper might return 200 even if challenge failed internally sometimes,
            # but raise_for_status() is still good practice.
            response1.raise_for_status()

        # cloudscraper might raise its own exceptions for challenge failures
        except cloudscraper.exceptions.CloudflareChallengeError as cce:
             logs.append(f"Error: Cloudflare challenge detected and could not be solved: {cce}")
             return None
        except requests.exceptions.Timeout: # Still catch standard timeouts
            logs.append(f"Error: Request timed out while fetching initial URL: {start_url}")
            return None
        except requests.exceptions.RequestException as e: # Catch 403, etc.
            logs.append(f"Error fetching initial URL {start_url}: {e}")
            if hasattr(e, 'response') and e.response is not None:
                 logs.append(f"Response Status: {e.response.status_code}")
                 logs.append(f"Response Text Snippet: {e.response.text[:500]}")
            return None

        page1_url = response1.url
        log_and_check_timeout(f"Step 1: Success. Landed on: {page1_url}")

        # Update Referer in scraper session
        scraper.headers.update({'Referer': page1_url, 'Sec-Fetch-Site': 'same-origin'})

        # --- Step 2: Parse page 1 ---
        # ... (Rest of the logic remains largely the same, just use 'scraper' instead of 'session') ...
        log_and_check_timeout(f"Step 2: Parsing page 1 HTML ({len(response1.text)} bytes) using {PARSER}...")
        try:
            soup1 = BeautifulSoup(response1.text, PARSER)
        except Exception as parse_err:
            logs.append(f"Error: Failed to parse page 1 HTML: {parse_err}")
            logs.append(f"Page 1 Text Snippet (first 500): {response1.text[:500]}")
            return None
        possible_tags_p1 = soup1.find_all(['a', 'button'])
        log_and_check_timeout(f"Step 2: Found {len(possible_tags_p1)} potential link/button tags.")


        # --- Step 3: Find "Fast Cloud Download" ---
        # ... (logic unchanged) ...
        fast_cloud_link_tag = None
        fast_cloud_pattern = re.compile(r'fast\s+cloud\s+download', re.IGNORECASE)
        log_and_check_timeout("Step 3: Searching for 'Fast Cloud Download'...")
        for tag in possible_tags_p1:
            tag_text = tag.get_text(strip=True)
            if fast_cloud_pattern.search(tag_text):
                fast_cloud_link_tag = tag
                log_and_check_timeout(f"Step 3: Found 'Fast Cloud' element: <{tag.name}> Text: '{tag_text}'")
                break


        # --- Action based on finding Fast Cloud ---
        if fast_cloud_link_tag:
            # ... (logic unchanged, extract href) ...
            log_and_check_timeout("Step 3a: 'Fast Cloud' found. Proceeding to extract link...")
            fast_cloud_href = fast_cloud_link_tag.get('href')
            if not fast_cloud_href and fast_cloud_link_tag.name == 'button':
                parent_form = fast_cloud_link_tag.find_parent('form')
                if parent_form:
                    fast_cloud_href = parent_form.get('action')
                    log_and_check_timeout("Step 3a: Extracted href from parent form action.")
                else:
                     log_and_check_timeout("Step 3a: Button found, but no href or parent form action.")
            elif fast_cloud_href:
                log_and_check_timeout("Step 3a: Extracted href directly from tag.")
            if not fast_cloud_href:
                logs.append("Error: Found 'Fast Cloud' element but failed to extract URL (href/action).")
                return None
            second_page_url = urljoin(page1_url, fast_cloud_href.strip())
            log_and_check_timeout(f"Step 3a: Resolved target URL: {second_page_url}")

            # --- Step 4: Fetch second page (use scraper) ---
            log_and_check_timeout(f"Step 4: Fetching second page: {second_page_url}")
            try:
                # Scraper session headers already include Referer: page1_url
                response2 = scraper.get(second_page_url, timeout=REQUEST_TIMEOUT)
                log_and_check_timeout(f"Step 4: Second page request status: {response2.status_code}")
                response2.raise_for_status()
            except cloudscraper.exceptions.CloudflareChallengeError as cce:
                 logs.append(f"Error: Cloudflare challenge detected on second page fetch: {cce}")
                 return None
            except requests.exceptions.Timeout:
                logs.append(f"Error: Request timed out while fetching second page: {second_page_url}")
                return None
            except requests.exceptions.RequestException as e:
                logs.append(f"Error fetching second page {second_page_url}: {e}")
                if hasattr(e, 'response') and e.response is not None:
                     logs.append(f"Response Status: {e.response.status_code}")
                     logs.append(f"Response Text Snippet: {e.response.text[:500]}")
                return None

            page2_url = response2.url
            log_and_check_timeout(f"Step 4: Success. Landed on second page: {page2_url}")
            scraper.headers.update({'Referer': page2_url}) # Update referer

            # --- Step 5: Parse page 2 ---
            # ... (logic unchanged) ...
            log_and_check_timeout(f"Step 5: Parsing page 2 HTML ({len(response2.text)} bytes) using {PARSER}...")
            try:
                soup2 = BeautifulSoup(response2.text, PARSER)
            except Exception as parse_err:
                logs.append(f"Error: Failed to parse page 2 HTML: {parse_err}")
                logs.append(f"Page 2 Text Snippet (first 500): {response2.text[:500]}")
                return None
            possible_tags_p2 = soup2.find_all(['a', 'button'])
            log_and_check_timeout(f"Step 5: Found {len(possible_tags_p2)} potential link/button tags.")


            # --- Step 6: Find "Cloud Resume Download" ---
            # ... (logic unchanged) ...
            resume_link_tag = None
            resume_text_pattern = re.compile(r'cloud\s+resume\s+download', re.IGNORECASE)
            log_and_check_timeout("Step 6: Searching for 'Cloud Resume Download'...")
            for tag in possible_tags_p2:
                 tag_text = tag.get_text(strip=True)
                 if resume_text_pattern.search(tag_text):
                    resume_link_tag = tag
                    log_and_check_timeout(f"Step 6a: Found 'Cloud Resume' directly: <{tag.name}> Text: '{tag_text}'")
                    break

            if resume_link_tag:
                # ... (extract final link href as before) ...
                log_and_check_timeout("Step 6a: Extracting final link from 'Cloud Resume'...")
                final_link_href = resume_link_tag.get('href')
                if not final_link_href and resume_link_tag.name == 'button':
                     parent_form = resume_link_tag.find_parent('form')
                     if parent_form: final_link_href = parent_form.get('action')

                if not final_link_href:
                    logs.append("Error: Found 'Cloud Resume' element but failed to extract URL (href/action).")
                    return None

                final_download_link = urljoin(page2_url, final_link_href.strip())
                logs.append(f"SUCCESS: Found final link directly on page 2: {final_download_link}")
                return final_download_link

            else:
                # --- Step 6b: Find "Generate Cloud Link" ---
                # ... (logic unchanged) ...
                log_and_check_timeout("Step 6b: 'Cloud Resume' not found. Searching for 'Generate Cloud Link' (ID='cloud' or text)...")
                generate_tag = soup2.find('button', id='cloud')
                generate_tag_source = "ID='cloud'"
                if not generate_tag:
                    generate_pattern = re.compile(r'generate\s+cloud\s+link', re.IGNORECASE)
                    for tag in possible_tags_p2:
                        tag_text = tag.get_text(strip=True)
                        if generate_pattern.search(tag_text):
                            generate_tag = tag
                            generate_tag_source = "Text Match"
                            log_and_check_timeout(f"Step 6b: Found 'Generate Cloud Link' by text: <{tag.name}> Text: '{tag_text}'")
                            break

                if not generate_tag:
                    logs.append("Error: Failed to find EITHER 'Cloud Resume Download' OR 'Generate Cloud Link' on page 2.")
                    logs.append(f"Page 2 Body Snippet (first 1000 chars):\n{response2.text[:1000]}")
                    return None

                # --- Step 7: Simulate POST request (use scraper) ---
                log_and_check_timeout(f"Step 7: Found 'Generate' button (by {generate_tag_source}). Simulating POST...")
                post_data = {'action': 'cloud', 'key': '08df4425e31c4330a1a0a3cefc45c19e84d0a192', 'action_token': ''}
                parsed_uri = urlparse(page2_url)
                hostname = parsed_uri.netloc
                # Use scraper's current headers (includes cookies, Referer: page2_url)
                post_headers = {'x-token': hostname, 'Origin': f"{parsed_uri.scheme}://{hostname}"}
                # Do not update scraper.headers directly here, pass explicitly
                current_scraper_headers = scraper.headers.copy()
                current_scraper_headers.update(post_headers)

                log_and_check_timeout(f"Step 7: Sending POST to {page2_url} with data: {post_data}")
                page3_url = None
                try:
                    post_response = scraper.post(page2_url, data=post_data, headers=current_scraper_headers, timeout=REQUEST_TIMEOUT)
                    log_and_check_timeout(f"Step 7: POST request completed. Status: {post_response.status_code}")
                    post_response.raise_for_status()

                    content_type = post_response.headers.get('Content-Type', '').lower()
                    log_and_check_timeout(f"Step 7: POST Response Content-Type: {content_type}")
                    # ... (JSON parsing and URL extraction logic unchanged) ...
                    if 'application/json' not in content_type:
                         logs.append(f"Error: POST response was not JSON (Content-Type: {content_type}). Cannot proceed.")
                         logs.append(f"POST Response Text Snippet: {post_response.text[:500]}")
                         if "cloudflare" in post_response.text.lower() or "captcha" in post_response.text.lower():
                              logs.append("Hint: Cloudflare/Captcha likely blocked the POST request.")
                         return None
                    try:
                        response_data = post_response.json()
                        log_and_check_timeout(f"Step 7: POST response JSON: {response_data}")
                    except json.JSONDecodeError as json_err:
                        logs.append(f"Error: Failed to decode JSON response from POST: {json_err}")
                        logs.append(f"POST Response Text (as received): {post_response.text[:500]}")
                        return None

                    if response_data.get('error'):
                        logs.append(f"Error reported in POST JSON response: {response_data.get('message', 'Unknown error')}")
                        return None
                    elif response_data.get('visit_url'):
                        page3_url = urljoin(page2_url, response_data['visit_url'])
                    elif response_data.get('url'):
                        page3_url = urljoin(page2_url, response_data['url'])
                    else:
                        logs.append("Error: POST response JSON missing expected 'error', 'visit_url', or 'url' key.")
                        return None
                    log_and_check_timeout(f"Step 7: POST successful. Polling URL obtained: {page3_url}")
                    scraper.headers.update({'Referer': page3_url}) # Update referer for polling

                except cloudscraper.exceptions.CloudflareChallengeError as cce:
                    logs.append(f"Error: Cloudflare challenge detected during POST request: {cce}")
                    return None
                except requests.exceptions.Timeout:
                    logs.append(f"Error: POST request to {page2_url} timed out.")
                    return None
                except requests.exceptions.RequestException as post_err:
                    logs.append(f"Error during POST request to {page2_url}: {post_err}")
                    if hasattr(post_err, 'response') and post_err.response is not None:
                         logs.append(f"Response Status: {post_err.response.status_code}")
                         logs.append(f"Response Text Snippet: {post_err.response.text[:500]}")
                    return None

                # --- Step 8: Polling Loop (use scraper) ---
                if page3_url:
                    # ... (polling logic unchanged, but use scraper.get) ...
                    polling_start_time = time.time()
                    log_and_check_timeout(f"Step 8: Starting polling loop for {page3_url} (Interval: {POLL_INTERVAL}s)")
                    polled_resume_tag = None
                    while True:
                        current_poll_time = time.time()
                        if current_poll_time - overall_start_time > OVERALL_TIMEOUT:
                             log_and_check_timeout("Polling loop breaking due to overall timeout.")
                             break
                        remaining_overall = OVERALL_TIMEOUT - (current_poll_time - overall_start_time)
                        wait_time = min(POLL_INTERVAL, remaining_overall)
                        if wait_time <= 0:
                            log_and_check_timeout("Polling loop breaking: No time left.")
                            break
                        log_and_check_timeout(f"Step 8: Waiting {wait_time:.1f}s before polling...")
                        time.sleep(wait_time)
                        log_and_check_timeout(f"Step 8: Polling URL: {page3_url}")
                        try:
                            # Use scraper session (includes Referer: page3_url)
                            poll_response = scraper.get(page3_url, timeout=REQUEST_TIMEOUT)
                            log_and_check_timeout(f"Step 8: Poll request completed. Status: {poll_response.status_code}")
                            if poll_response.status_code != 200:
                                log_and_check_timeout(f"Warning: Polling returned status {poll_response.status_code}. Continuing poll.")
                                continue
                            log_and_check_timeout(f"Step 8: Parsing polling response HTML ({len(poll_response.text)} bytes)...")
                            try:
                                poll_soup = BeautifulSoup(poll_response.text, PARSER)
                            except Exception as poll_parse_err:
                                 logs.append(f"Warning: Error parsing polled page HTML: {poll_parse_err}. Continuing poll.")
                                 continue
                            log_and_check_timeout("Step 8: Searching for 'Cloud Resume Download' on polled page...")
                            for tag in poll_soup.find_all(['a', 'button']):
                                tag_text = tag.get_text(strip=True)
                                if resume_text_pattern.search(tag_text):
                                    polled_resume_tag = tag
                                    log_and_check_timeout(f"SUCCESS: Found 'Cloud Resume' after polling: <{tag.name}> Text: '{tag_text}'")
                                    break
                            if polled_resume_tag:
                                break
                            log_and_check_timeout("Step 8: 'Cloud Resume' not found yet on polled page.")
                        except cloudscraper.exceptions.CloudflareChallengeError as cce:
                            logs.append(f"Warning: Cloudflare challenge detected during polling: {cce}. Continuing poll.")
                        except requests.exceptions.Timeout:
                            log_and_check_timeout("Warning: Polling request timed out. Continuing poll.")
                        except requests.exceptions.RequestException as poll_err:
                            log_and_check_timeout(f"Warning: Error during polling request: {poll_err}. Continuing poll.")

                    # After Polling Loop
                    if polled_resume_tag:
                        # ... (extract final link href as before) ...
                        log_and_check_timeout("Step 8: Extracting final link from polled 'Cloud Resume'...")
                        final_link_href = polled_resume_tag.get('href')
                        if not final_link_href and polled_resume_tag.name == 'button':
                            parent_form = polled_resume_tag.find_parent('form')
                            if parent_form: final_link_href = parent_form.get('action')
                        if not final_link_href:
                            logs.append("Error: Found polled 'Cloud Resume' element but failed to extract URL (href/action).")
                            return None
                        final_download_link = urljoin(page3_url, final_link_href.strip())
                        logs.append(f"SUCCESS: Found final link after polling: {final_download_link}")
                        return final_download_link
                    else:
                        logs.append(f"Error: Polling loop finished after {time.time() - polling_start_time:.1f}s without finding 'Cloud Resume Download'.")
                        logs.append("Hint: Link generation might have failed or taken too long.")
                        return None
                # else: page3_url was None (POST failed), handled above

        # --- Fallback: PixeldrainDL ---
        else:
            # ... (Pixeldrain logic unchanged) ...
            log_and_check_timeout("Step 3b: 'Fast Cloud' not found on page 1. Checking for 'PixeldrainDL' fallback...")
            pixeldrain_link_tag = None
            pixeldrain_pattern = re.compile(r'pixeldrain\s*dl', re.IGNORECASE)
            for tag in possible_tags_p1:
                tag_text = tag.get_text(strip=True)
                if pixeldrain_pattern.search(tag_text):
                    pixeldrain_link_tag = tag
                    log_and_check_timeout(f"Step 3b: Found fallback 'PixeldrainDL' element: <{tag.name}> Text: '{tag_text}'")
                    break
            if not pixeldrain_link_tag:
                 logs.append("Error: Failed to find EITHER 'Fast Cloud Download' OR 'PixeldrainDL' on page 1.")
                 logs.append(f"Page 1 Body Snippet (first 1000 chars):\n{response1.text[:1000]}")
                 return None
            log_and_check_timeout("Step 3b: Extracting link from 'PixeldrainDL'...")
            pixeldrain_href = pixeldrain_link_tag.get('href')
            if not pixeldrain_href and pixeldrain_link_tag.name == 'button':
                parent_form = pixeldrain_link_tag.find_parent('form')
                if parent_form: pixeldrain_href = parent_form.get('action')
            if not pixeldrain_href:
                logs.append("Error: Found 'PixeldrainDL' element but failed to extract URL (href/action).")
                return None
            pixeldrain_full_url = urljoin(page1_url, pixeldrain_href.strip())
            logs.append(f"SUCCESS: Found Pixeldrain link as fallback: {pixeldrain_full_url}")
            return pixeldrain_full_url

    except TimeoutError as te:
         return None # Already logged
    except Exception as e:
        logs.append(f"FATAL ERROR during GDFLIX processing: {e}\n{traceback.format_exc()}")
        return None

    logs.append("Error: Reached end of function unexpectedly without finding a link.")
    return None


# --- Vercel Serverless Function Handler (Unchanged) ---
class handler(BaseHTTPRequestHandler):
    # ... (Keep the same handler class from the previous version) ...
    # ... (It correctly handles logging, status codes, extracting errors from logs, etc.) ...
    def _set_headers(self, status_code=200, content_type='application/json'):
        if hasattr(self, '_headers_sent') and self._headers_sent:
             print("DEBUG: Headers already sent, skipping _set_headers.", file=sys.stderr)
             return
        try:
            self.send_response(status_code)
            self.send_header('Content-type', content_type)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self._headers_to_be_ended = True
        except Exception as e:
            print(f"ERROR setting headers: {e}", file=sys.stderr)

    def _end_headers_if_needed(self):
         if hasattr(self, '_headers_to_be_ended') and self._headers_to_be_ended:
             try:
                 self.end_headers()
                 self._headers_sent = True
                 self._headers_to_be_ended = False
             except Exception as e:
                 print(f"ERROR calling end_headers: {e}", file=sys.stderr)

    def do_OPTIONS(self):
        self._set_headers(204) # Use 204 No Content for OPTIONS
        self._end_headers_if_needed()

    def do_POST(self):
        logs = []
        start_handle_time = time.time()
        result = {"success": False, "error": "Request processing failed", "finalUrl": None, "logs": logs}
        status_code = 500 # Default to internal server error
        response_body_bytes = b''

        try:
            content_type, pdict = cgi.parse_header(self.headers.get('content-type', ''))
            if content_type != 'application/json':
                logs.append(f"Error: Unsupported Content-Type: {content_type}")
                result["error"] = "Unsupported Content-Type. Please send application/json."
                status_code = 415
                self._set_headers(status_code)
                response_body_bytes = json.dumps(result, separators=(',', ':')).encode('utf-8')
                self.send_header('Content-Length', str(len(response_body_bytes)))
                self._end_headers_if_needed()
                self.wfile.write(response_body_bytes)
                return

            content_length = int(self.headers.get('content-length', 0))
            if content_length == 0:
                 logs.append("Error: Received empty POST body.")
                 result["error"] = "Empty request body received"
                 status_code = 400
                 self._set_headers(status_code)
                 response_body_bytes = json.dumps(result, separators=(',', ':')).encode('utf-8')
                 self.send_header('Content-Length', str(len(response_body_bytes)))
                 self._end_headers_if_needed()
                 self.wfile.write(response_body_bytes)
                 return

            post_body = self.rfile.read(content_length)
            logs.append("Received JSON POST body.")
            try:
                data = json.loads(post_body)
                gdflix_url = data.get('gdflixUrl')
            except json.JSONDecodeError as e:
                logs.append(f"Error: Invalid JSON received: {e}")
                logs.append(f"Received Body: {post_body.decode('utf-8', errors='ignore')}")
                result["error"] = "Invalid JSON in request body"
                status_code = 400
                self._set_headers(status_code)
                response_body_bytes = json.dumps(result, separators=(',', ':')).encode('utf-8')
                self.send_header('Content-Length', str(len(response_body_bytes)))
                self._end_headers_if_needed()
                self.wfile.write(response_body_bytes)
                return

            if not gdflix_url or not isinstance(gdflix_url, str):
                logs.append("Error: gdflixUrl missing or invalid in request.")
                result["error"] = "Missing or invalid gdflixUrl in request body"
                status_code = 400
                self._set_headers(status_code)
                response_body_bytes = json.dumps(result, separators=(',', ':')).encode('utf-8')
                self.send_header('Content-Length', str(len(response_body_bytes)))
                self._end_headers_if_needed()
                self.wfile.write(response_body_bytes)
                return

            logs.append(f"Processing GDFLIX URL: {gdflix_url}")
            try:
                parsed_start_url = urlparse(gdflix_url)
                if not parsed_start_url.scheme or not parsed_start_url.netloc:
                     raise ValueError("Invalid URL format (missing scheme or netloc)")
            except Exception as url_err:
                 logs.append(f"Error: Invalid URL format: {gdflix_url}. Details: {url_err}")
                 result["error"] = f"Invalid URL format provided: {gdflix_url}"
                 status_code = 400
                 self._set_headers(status_code)
                 response_body_bytes = json.dumps(result, separators=(',', ':')).encode('utf-8')
                 self.send_header('Content-Length', str(len(response_body_bytes)))
                 self._end_headers_if_needed()
                 self.wfile.write(response_body_bytes)
                 return

            final_download_link = get_gdflix_download_link(gdflix_url, logs=logs)
            processing_time = time.time() - start_handle_time
            logs.append(f"Total GDFLIX processing time: {processing_time:.2f} seconds.")

            if final_download_link:
                result["success"] = True
                result["finalUrl"] = final_download_link
                result["error"] = None
                status_code = 200
            else:
                result["success"] = False
                status_code = 500
                failure_indicators = ["error:", "fatal:", "failed:", "could not find", "timed out", "hint:", "warning:"]
                final_error_log = None
                priority_error = None
                for log_entry in reversed(logs):
                    log_lower = log_entry.lower()
                    is_priority = False
                    # Prioritize specific known failure modes
                    if "cloudflare challenge" in log_lower:
                        priority_error = "Cloudflare challenge failed"
                        is_priority = True
                    elif "cloudflare" in log_lower or "captcha" in log_lower:
                        priority_error = "Potential Cloudflare/Captcha block"
                        is_priority = True
                    elif "403" in log_lower and ("forbidden" in log_lower or "client error" in log_lower):
                         priority_error = "Access Denied (403 Forbidden)"
                         is_priority = True
                    elif "timeout" in log_lower or "timed out" in log_lower:
                         priority_error = "Operation Timed Out"
                         is_priority = True

                    if priority_error: break # Stop if we found a critical error

                    if any(indicator in log_lower for indicator in failure_indicators):
                        cleaned_error = log_entry.split(":", 1)[-1].strip() if ":" in log_entry else log_entry
                        final_error_log = cleaned_error[:150]
                        break
                result["error"] = priority_error if priority_error else (final_error_log if final_error_log else "GDFLIX extraction failed (Unknown reason)")

            self._set_headers(status_code)

        except Exception as e:
            print(f"FATAL GDFLIX Handler Error: {e}\n{traceback.format_exc()}", file=sys.stderr)
            logs.append(f"FATAL Handler Error: {e}")
            result["success"] = False
            result["error"] = "Internal server error during request handling."
            if not hasattr(self, '_headers_to_be_ended') or not self._headers_to_be_ended:
                 self._set_headers(500)

        finally:
            result["logs"] = logs
            response_body_bytes = json.dumps(result, indent=None, separators=(',', ':')).encode('utf-8')
            self.send_header('Content-Length', str(len(response_body_bytes)))
            self._end_headers_if_needed()
            try:
                self.wfile.write(response_body_bytes)
            except Exception as write_err:
                 print(f"Error writing response body: {write_err}", file=sys.stderr)
