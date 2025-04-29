# /api/gdflix.py (Version with Enhanced Logging & Checks)

import requests
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
# Attempt to import lxml for better performance and handling of malformed HTML.
# Fall back to html.parser if lxml is not available.
try:
    from bs4 import BeautifulSoup
    PARSER = "lxml"
    LXML_AVAILABLE = True
    # Explicitly print which parser is used to Vercel logs
    print("Using lxml parser.", file=sys.stderr)
except ImportError:
    from bs4 import BeautifulSoup
    PARSER = "html.parser"
    LXML_AVAILABLE = False
    print("Warning: lxml not found, using html.parser.", file=sys.stderr)

# --- Constants ---
# Aggressive timeouts for Vercel Hobby tier (~10-15s max execution)
REQUEST_TIMEOUT = 9      # Max time for a single HTTP request (seconds)
# Reduce total timeout slightly to leave buffer for final response sending
OVERALL_TIMEOUT = 12     # Max total time for the entire function (seconds)
POLL_INTERVAL = 3        # Seconds between polling checks

DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://google.com/' # More standard Referer
}

# --- Core GDFLIX Scraping Logic ---

def get_gdflix_download_link(start_url, logs=None):
    """
    Fetches the final download link for GDFLIX style sites with enhanced logging.
    Returns the final URL string or None if failed.
    """
    if logs is None:
        logs = []

    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)
    final_download_link = None
    overall_start_time = time.time()

    def log_and_check_timeout(message):
        """ Logs a message and checks if the overall timeout is exceeded. """
        current_time = time.time()
        elapsed = current_time - overall_start_time
        logs.append(f"[{elapsed:.2f}s] {message}")
        if elapsed > OVERALL_TIMEOUT:
            logs.append(f"FATAL: Overall timeout ({OVERALL_TIMEOUT}s) exceeded.")
            raise TimeoutError("Overall GDFLIX processing time limit exceeded")

    try:
        # --- Step 1: Fetch initial page ---
        log_and_check_timeout(f"Step 1: Fetching initial URL: {start_url}")
        try:
            response1 = session.get(start_url, allow_redirects=True, timeout=REQUEST_TIMEOUT)
            response1.raise_for_status()
        except requests.exceptions.Timeout:
            logs.append(f"Error: Request timed out while fetching initial URL: {start_url}")
            return None
        except requests.exceptions.RequestException as e:
            logs.append(f"Error fetching initial URL {start_url}: {e}")
            if hasattr(e, 'response') and e.response is not None:
                 logs.append(f"Response Status: {e.response.status_code}")
                 logs.append(f"Response Text Snippet: {e.response.text[:500]}")
            return None

        page1_url = response1.url
        log_and_check_timeout(f"Step 1: Success. Landed on: {page1_url} (Status: {response1.status_code})")

        # --- Step 2: Parse page 1 ---
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

            # --- Step 4: Fetch second page ---
            log_and_check_timeout(f"Step 4: Fetching second page: {second_page_url}")
            try:
                fetch_headers_p2 = {'Referer': page1_url}
                fetch_headers_p2.update(session.headers) # Add session headers too
                response2 = session.get(second_page_url, timeout=REQUEST_TIMEOUT, headers=fetch_headers_p2)
                response2.raise_for_status()
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
            log_and_check_timeout(f"Step 4: Success. Landed on second page: {page2_url} (Status: {response2.status_code})")

            # --- Step 5: Parse page 2 ---
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
                return final_download_link # Success!

            else:
                # --- Step 6b: Find "Generate Cloud Link" ---
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
                    return None # Critical failure

                # --- Step 7: Simulate POST request ---
                log_and_check_timeout(f"Step 7: Found 'Generate' button (by {generate_tag_source}). Simulating POST...")
                # NOTE: This 'key' is likely site-specific and might change or be dynamic. Hardcoding it is fragile.
                post_data = {'action': 'cloud', 'key': '08df4425e31c4330a1a0a3cefc45c19e84d0a192', 'action_token': ''}
                parsed_uri = urlparse(page2_url)
                hostname = parsed_uri.netloc
                # Important: Ensure Referer and potentially x-token match what the browser sends
                post_headers = {'x-token': hostname, 'Referer': page2_url, 'Origin': f"{parsed_uri.scheme}://{hostname}"}
                post_headers.update(session.headers) # Include session cookies

                log_and_check_timeout(f"Step 7: Sending POST to {page2_url} with data: {post_data}")
                page3_url = None
                try:
                    post_response = session.post(page2_url, data=post_data, headers=post_headers, timeout=REQUEST_TIMEOUT)
                    log_and_check_timeout(f"Step 7: POST request completed. Status: {post_response.status_code}")
                    post_response.raise_for_status() # Check HTTP errors

                    content_type = post_response.headers.get('Content-Type', '').lower()
                    log_and_check_timeout(f"Step 7: POST Response Content-Type: {content_type}")

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

                    # Check JSON structure for errors or URL
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

                except requests.exceptions.Timeout:
                    logs.append(f"Error: POST request to {page2_url} timed out.")
                    return None
                except requests.exceptions.RequestException as post_err:
                    logs.append(f"Error during POST request to {page2_url}: {post_err}")
                    if hasattr(post_err, 'response') and post_err.response is not None:
                         logs.append(f"Response Status: {post_err.response.status_code}")
                         logs.append(f"Response Text Snippet: {post_err.response.text[:500]}")
                    return None

                # --- Step 8: Polling Loop ---
                if page3_url:
                    polling_start_time = time.time()
                    log_and_check_timeout(f"Step 8: Starting polling loop for {page3_url} (Interval: {POLL_INTERVAL}s)")
                    polled_resume_tag = None

                    while True: # Loop until success, timeout, or error
                        current_poll_time = time.time()
                        if current_poll_time - overall_start_time > OVERALL_TIMEOUT:
                             log_and_check_timeout("Polling loop breaking due to overall timeout.") # Will raise TimeoutError
                             break # Should be caught by outer try/except

                        remaining_overall = OVERALL_TIMEOUT - (current_poll_time - overall_start_time)
                        wait_time = min(POLL_INTERVAL, remaining_overall)
                        if wait_time <= 0:
                            log_and_check_timeout("Polling loop breaking: No time left.")
                            break

                        log_and_check_timeout(f"Step 8: Waiting {wait_time:.1f}s before polling...")
                        time.sleep(wait_time)
                        log_and_check_timeout(f"Step 8: Polling URL: {page3_url}")

                        try:
                            poll_headers = {'Referer': page3_url} # Referer for polling page
                            poll_headers.update(session.headers)
                            poll_response = session.get(page3_url, timeout=REQUEST_TIMEOUT, headers=poll_headers)
                            log_and_check_timeout(f"Step 8: Poll request completed. Status: {poll_response.status_code}")

                            if poll_response.status_code != 200:
                                log_and_check_timeout(f"Warning: Polling returned status {poll_response.status_code}. Continuing poll.")
                                continue # Try polling again

                            log_and_check_timeout(f"Step 8: Parsing polling response HTML ({len(poll_response.text)} bytes)...")
                            try:
                                poll_soup = BeautifulSoup(poll_response.text, PARSER)
                            except Exception as poll_parse_err:
                                 logs.append(f"Warning: Error parsing polled page HTML: {poll_parse_err}. Continuing poll.")
                                 continue # Try polling again

                            log_and_check_timeout("Step 8: Searching for 'Cloud Resume Download' on polled page...")
                            for tag in poll_soup.find_all(['a', 'button']):
                                tag_text = tag.get_text(strip=True)
                                if resume_text_pattern.search(tag_text):
                                    polled_resume_tag = tag
                                    log_and_check_timeout(f"SUCCESS: Found 'Cloud Resume' after polling: <{tag.name}> Text: '{tag_text}'")
                                    break # Found it! Exit inner loop

                            if polled_resume_tag:
                                break # Exit polling loop (while True)

                            log_and_check_timeout("Step 8: 'Cloud Resume' not found yet on polled page.")

                        except requests.exceptions.Timeout:
                            log_and_check_timeout("Warning: Polling request timed out. Continuing poll.")
                        except requests.exceptions.RequestException as poll_err:
                            log_and_check_timeout(f"Warning: Error during polling request: {poll_err}. Continuing poll.")
                        # Loop continues if no success and no fatal error

                    # --- After Polling Loop ---
                    if polled_resume_tag:
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
                        return final_download_link # Success!
                    else:
                        # Only reachable if loop breaks due to timeout without finding the tag
                        logs.append(f"Error: Polling loop finished after {time.time() - polling_start_time:.1f}s without finding 'Cloud Resume Download'.")
                        logs.append("Hint: Link generation might have failed or taken too long.")
                        return None
                # else: page3_url was None (POST failed), handled above

        # --- Fallback: PixeldrainDL (If Fast Cloud wasn't found initially) ---
        else:
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

            # Extract link from Pixeldrain tag
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
            return pixeldrain_full_url # Success via fallback

    except TimeoutError as te:
         # Already logged within log_and_check_timeout
         return None
    except Exception as e:
        # Catch any other unexpected errors during the process
        logs.append(f"FATAL ERROR during GDFLIX processing: {e}\n{traceback.format_exc()}")
        return None

    # Fallback if something went wrong without returning None explicitly
    logs.append("Error: Reached end of function unexpectedly without finding a link.")
    return None

# --- Vercel Serverless Function Handler ---
class handler(BaseHTTPRequestHandler):

    def _set_headers(self, status_code=200, content_type='application/json'):
        # Check if headers are already sent before trying to send again
        if hasattr(self, '_headers_sent') and self._headers_sent:
             print("DEBUG: Headers already sent, skipping _set_headers.", file=sys.stderr)
             return
        try:
            self.send_response(status_code)
            self.send_header('Content-type', content_type)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            # Content-Length will be added just before writing body
            self._headers_to_be_ended = True # Mark that end_headers needs to be called
        except Exception as e:
            print(f"ERROR setting headers: {e}", file=sys.stderr)


    def _end_headers_if_needed(self):
         if hasattr(self, '_headers_to_be_ended') and self._headers_to_be_ended:
             try:
                 self.end_headers()
                 self._headers_sent = True # Mark headers as sent
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
            # --- Get POST data ---
            content_type, pdict = cgi.parse_header(self.headers.get('content-type', ''))
            if content_type != 'application/json':
                logs.append(f"Error: Unsupported Content-Type: {content_type}")
                result["error"] = "Unsupported Content-Type. Please send application/json."
                status_code = 415 # Unsupported Media Type
                self._set_headers(status_code) # Set headers before returning early
                response_body_bytes = json.dumps(result, separators=(',', ':')).encode('utf-8')
                self.send_header('Content-Length', str(len(response_body_bytes)))
                self._end_headers_if_needed()
                self.wfile.write(response_body_bytes)
                return

            content_length = int(self.headers.get('content-length', 0))
            if content_length == 0:
                 logs.append("Error: Received empty POST body.")
                 result["error"] = "Empty request body received"
                 status_code = 400 # Bad Request
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

            # --- Validate URL ---
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

            # --- Perform Scraping ---
            final_download_link = get_gdflix_download_link(gdflix_url, logs=logs)
            processing_time = time.time() - start_handle_time
            logs.append(f"Total GDFLIX processing time: {processing_time:.2f} seconds.")

            # --- Prepare Response ---
            if final_download_link:
                result["success"] = True
                result["finalUrl"] = final_download_link
                result["error"] = None
                status_code = 200
            else:
                result["success"] = False
                status_code = 500 # Internal Server Error / Backend Failure
                # Extract specific error from logs if possible
                failure_indicators = ["error:", "fatal:", "failed:", "could not find", "timed out", "hint:", "warning:"]
                final_error_log = None
                priority_error = None # For critical errors like timeout/cloudflare

                for log_entry in reversed(logs):
                    log_lower = log_entry.lower()
                    is_priority = False
                    if "cloudflare" in log_lower or "captcha" in log_lower:
                        priority_error = "Potential Cloudflare/Captcha block"
                        is_priority = True
                    elif "timeout" in log_lower or "timed out" in log_lower:
                         priority_error = "Operation Timed Out"
                         is_priority = True

                    if priority_error: break # Stop if we found a critical error

                    # If no priority error yet, find the first relevant non-priority error
                    if any(indicator in log_lower for indicator in failure_indicators):
                        cleaned_error = log_entry.split(":", 1)[-1].strip() if ":" in log_entry else log_entry
                        final_error_log = cleaned_error[:150] # Limit length
                        break # Found the most recent relevant log

                # Set the error message, prioritizing critical errors
                result["error"] = priority_error if priority_error else (final_error_log if final_error_log else "GDFLIX extraction failed (Unknown reason)")

            # Set headers for the final response status
            self._set_headers(status_code)

        except Exception as e:
            # Catch unexpected errors in the handler itself
            print(f"FATAL GDFLIX Handler Error: {e}\n{traceback.format_exc()}", file=sys.stderr)
            logs.append(f"FATAL Handler Error: {e}") # Keep it brief for the response log
            result["success"] = False
            result["error"] = "Internal server error during request handling."
            # Ensure headers are set even if error happens early
            if not hasattr(self, '_headers_to_be_ended') or not self._headers_to_be_ended:
                 self._set_headers(500)

        finally:
            # Ensure logs are included and send response
            result["logs"] = logs
            response_body_bytes = json.dumps(result, indent=None, separators=(',', ':')).encode('utf-8')
            # Add content length header for the final response
            self.send_header('Content-Length', str(len(response_body_bytes)))
            self._end_headers_if_needed() # Call end_headers only once before writing body
            try:
                self.wfile.write(response_body_bytes)
            except Exception as write_err:
                 print(f"Error writing response body: {write_err}", file=sys.stderr)
