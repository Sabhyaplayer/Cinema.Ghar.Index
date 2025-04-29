# /api/gdflix.py

import requests
from urllib.parse import urljoin, urlparse
import time
import re
import json
import traceback
import sys
import os
from http.server import BaseHTTPRequestHandler
import cgi # For parsing POST body

# Try importing lxml, fall back to html.parser if not installed
try:
    from bs4 import BeautifulSoup
    PARSER = "lxml"
    LXML_AVAILABLE = True
except ImportError:
    from bs4 import BeautifulSoup
    PARSER = "html.parser"
    LXML_AVAILABLE = False
    # Print warning to stderr so it appears in Vercel logs
    print("Warning: lxml not found, using html.parser.", file=sys.stderr)


# --- Constants ---
# Vercel Hobby tier has ~10-15s timeout for sync functions.
# These timeouts MUST be aggressive to avoid Vercel killing the function.
# This might mean the bypass fails if the target site is slow,
# but it's necessary for this environment.
REQUEST_TIMEOUT = 9      # Max time for a single HTTP request (seconds)
GENERATION_TIMEOUT = 12  # Max total time allowed for polling link generation (seconds)
POLL_INTERVAL = 3        # Seconds between polling checks

DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://google.com' # Generic Referer sometimes helps
}

# --- Core GDFLIX Scraping Logic (Modified for Logging & Timeouts) ---

def get_gdflix_download_link(start_url, logs=None):
    """
    Fetches the final download link for GDFLIX style sites.
    Logs progress to the provided list.
    Returns the final URL string or None if failed.
    Designed with Vercel time limits in mind.
    """
    if logs is None:
        logs = []

    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS) # Set default headers for session
    final_download_link = None
    overall_start_time = time.time()

    def log_and_check_timeout(message):
        logs.append(message)
        if time.time() - overall_start_time > GENERATION_TIMEOUT - 1: # Check against overall limit - buffer
            logs.append(f"Warning: Approaching overall timeout ({GENERATION_TIMEOUT}s). Aborting early.")
            raise TimeoutError("Overall GDFLIX processing time limit exceeded")

    try:
        # --- Step 1 & 2 --- (Fetch and parse page 1)
        log_and_check_timeout(f"Step 1: Fetching initial URL: {start_url} (Timeout: {REQUEST_TIMEOUT}s)")
        response1 = session.get(start_url, allow_redirects=True, timeout=REQUEST_TIMEOUT)
        response1.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
        page1_url = response1.url
        log_and_check_timeout(f"Step 1: Initial fetch successful. Landed on: {page1_url}")

        log_and_check_timeout(f"Step 2: Parsing page 1 HTML (using {PARSER})...")
        try:
            soup1 = BeautifulSoup(response1.text, PARSER)
        except Exception as parse_err:
            logs.append(f"Error: Failed to parse page 1 HTML: {parse_err}")
            logs.append(f"Page 1 Text Snippet (first 500): {response1.text[:500]}")
            return None
        possible_tags_p1 = soup1.find_all(['a', 'button'])
        log_and_check_timeout(f"Step 2: Found {len(possible_tags_p1)} potential link/button tags on page 1.")

        # --- Step 3 --- (Find Fast Cloud)
        fast_cloud_link_tag = None
        fast_cloud_pattern = re.compile(r'fast\s+cloud\s+download', re.IGNORECASE)
        log_and_check_timeout("Step 3: Searching for 'Fast Cloud Download' link/button...")
        for tag in possible_tags_p1:
            tag_text = tag.get_text(strip=True)
            if fast_cloud_pattern.search(tag_text):
                fast_cloud_link_tag = tag
                log_and_check_timeout(f"Step 3: Found 'Fast Cloud' element: <{tag.name}> Text: '{tag_text}'")
                break

        # --- If Fast Cloud Found ---
        if fast_cloud_link_tag:
            # --- Steps 3a, 4, 5 --- (Getting to page 2)
            fast_cloud_href = fast_cloud_link_tag.get('href')
            if not fast_cloud_href and fast_cloud_link_tag.name == 'button':
                parent_form = fast_cloud_link_tag.find_parent('form')
                if parent_form: fast_cloud_href = parent_form.get('action')

            if not fast_cloud_href:
                logs.append("Error: Found 'Fast Cloud Download' element but couldn't get URL (href/action).")
                return None

            second_page_url = urljoin(page1_url, fast_cloud_href.strip())
            log_and_check_timeout(f"Step 3a: Resolved 'Fast Cloud' target URL: {second_page_url}")
            # time.sleep(1) # Remove sleep to save time on Vercel

            log_and_check_timeout(f"Step 4: Fetching second page (Generate/Resume): {second_page_url} (Timeout: {REQUEST_TIMEOUT}s)")
            fetch_headers_p2 = {'Referer': page1_url}
            response2 = session.get(second_page_url, timeout=REQUEST_TIMEOUT, headers=fetch_headers_p2)
            response2.raise_for_status()
            page2_url = response2.url
            log_and_check_timeout(f"Step 4: Landed on second page: {page2_url}")

            log_and_check_timeout(f"Step 5: Parsing page 2 HTML (using {PARSER})...")
            try:
                soup2 = BeautifulSoup(response2.text, PARSER)
            except Exception as parse_err:
                logs.append(f"Error: Failed to parse page 2 HTML: {parse_err}")
                logs.append(f"Page 2 Text Snippet (first 500): {response2.text[:500]}")
                return None
            possible_tags_p2 = soup2.find_all(['a', 'button'])
            log_and_check_timeout(f"Step 5: Found {len(possible_tags_p2)} potential link/button tags on page 2.")


            # --- Step 6 --- (Find Cloud Resume Download)
            resume_link_tag = None
            resume_text_pattern = re.compile(r'cloud\s+resume\s+download', re.IGNORECASE)
            log_and_check_timeout("Step 6: Searching for 'Cloud Resume Download' link/button...")
            for tag in possible_tags_p2:
                 tag_text = tag.get_text(strip=True)
                 if resume_text_pattern.search(tag_text):
                    resume_link_tag = tag
                    log_and_check_timeout(f"Step 6a: Found 'Cloud Resume' element directly: <{tag.name}> Text: '{tag_text}'")
                    break

            # --- Step 6a --- (If found directly)
            if resume_link_tag:
                final_link_href = resume_link_tag.get('href')
                if not final_link_href and resume_link_tag.name == 'button':
                     parent_form = resume_link_tag.find_parent('form')
                     if parent_form: final_link_href = parent_form.get('action')

                if not final_link_href:
                    logs.append("Error: Found 'Cloud Resume' element but couldn't get URL (href/action).")
                    return None

                final_download_link = urljoin(page2_url, final_link_href.strip())
                logs.append(f"SUCCESS: Found final link directly: {final_download_link}")
                return final_download_link # Return success immediately

            # --- Step 6b --- (If not found directly, check for Generate button)
            else:
                log_and_check_timeout("Info: 'Cloud Resume Download' not found directly. Checking for 'Generate Cloud Link' button (ID='cloud' or by text)...")
                generate_tag = soup2.find('button', id='cloud')
                if not generate_tag: # Fallback search by text if ID fails
                    generate_pattern = re.compile(r'generate\s+cloud\s+link', re.IGNORECASE)
                    for tag in possible_tags_p2:
                        tag_text = tag.get_text(strip=True)
                        if generate_pattern.search(tag_text):
                            generate_tag = tag
                            log_and_check_timeout(f"Step 6b: Found 'Generate Cloud Link' by text: <{tag.name}> Text: '{tag_text}'")
                            break

                # --- If Generate button is found, MIMIC THE POST REQUEST ---
                if generate_tag:
                    log_and_check_timeout(f"Info: Found 'Generate Cloud Link' button: <{generate_tag.name} id='{generate_tag.get('id', 'N/A')}'>. Attempting POST.")

                    # Data observed - may need adjustment for site variants
                    # NOTE: 'key' might be dynamic, this could be a failure point
                    post_data = {'action': 'cloud', 'key': '08df4425e31c4330a1a0a3cefc45c19e84d0a192', 'action_token': ''}
                    parsed_uri = urlparse(page2_url)
                    hostname = parsed_uri.netloc
                    post_headers = {'x-token': hostname, 'Referer': page2_url}
                    post_headers.update(session.headers) # Include session cookies etc.

                    log_and_check_timeout(f"Info: Sending POST request to {page2_url} with data: {post_data} (Timeout: {REQUEST_TIMEOUT}s)...")
                    page3_url = None # URL to poll
                    try:
                        post_response = session.post(page2_url, data=post_data, headers=post_headers, timeout=REQUEST_TIMEOUT)
                        log_and_check_timeout(f"Info: POST request completed with status: {post_response.status_code}")
                        post_response.raise_for_status() # Check for HTTP errors on POST

                        # Try parsing response as JSON
                        try:
                            response_data = post_response.json()
                            log_and_check_timeout(f"Info: POST response JSON: {response_data}")
                            # Check for expected keys containing the polling URL
                            if response_data.get('error'):
                                logs.append(f"Error from POST request: {response_data.get('message', 'Unknown error in JSON response')}")
                                return None # POST returned an error state
                            elif response_data.get('visit_url'):
                                page3_url = urljoin(page2_url, response_data['visit_url'])
                            elif response_data.get('url'):
                                page3_url = urljoin(page2_url, response_data['url'])
                            else:
                                logs.append("Error: POST response JSON format unknown or missing URL key (visit_url/url).")
                                return None

                            if page3_url:
                                log_and_check_timeout(f"Info: POST successful. Need to poll new URL: {page3_url}")

                        except json.JSONDecodeError:
                            logs.append(f"Error: Failed to decode JSON response from POST. Status: {post_response.status_code}")
                            logs.append(f"Response text (first 500 chars): {post_response.text[:500]}")
                            if "cloudflare" in post_response.text.lower() or "captcha" in post_response.text.lower():
                                logs.append("Hint: Cloudflare/Captcha challenge likely blocked the POST request.")
                            return None # Cannot proceed without JSON response

                    except requests.exceptions.RequestException as post_err:
                        logs.append(f"Error during POST request: {post_err}")
                        return None # POST request failed

                    # --- If POST was successful and we have page3_url, START POLLING ---
                    if page3_url:
                        polling_start_time = time.time()
                        log_and_check_timeout(f"Info: Starting polling loop for {page3_url} (Timeout: {GENERATION_TIMEOUT}s total, Poll Interval: {POLL_INTERVAL}s)...")
                        polled_resume_tag = None

                        while time.time() - overall_start_time < GENERATION_TIMEOUT: # Check against overall limit
                            loop_start_time = time.time()
                            # Calculate remaining time and sleep
                            remaining_overall_time = GENERATION_TIMEOUT - (time.time() - overall_start_time)
                            wait_time = min(POLL_INTERVAL, remaining_overall_time)
                            if wait_time <= 0: break # Timeout reached

                            log_and_check_timeout(f"Info: Waiting {wait_time:.1f}s before polling (Overall time left: {remaining_overall_time:.1f}s)...")
                            time.sleep(wait_time)
                            log_and_check_timeout(f"Polling URL: {page3_url} (Timeout: {REQUEST_TIMEOUT}s)")

                            try:
                                # Use the same session to maintain cookies
                                poll_headers = {'Referer': page3_url} # Referer is often important
                                poll_response = session.get(page3_url, timeout=REQUEST_TIMEOUT, headers=poll_headers)

                                if poll_response.status_code != 200:
                                    log_and_check_timeout(f"Warning: Polling returned status {poll_response.status_code}. Retrying...")
                                    continue # Skip parsing if status is not OK

                                log_and_check_timeout("Polling: Parsing response HTML...")
                                try:
                                    poll_soup = BeautifulSoup(poll_response.text, PARSER)
                                except Exception as poll_parse_err:
                                     logs.append(f"Warning: Error parsing polled page HTML: {poll_parse_err}. Retrying...")
                                     continue

                                # Search for the 'Cloud Resume Download' button again on the polled page
                                log_and_check_timeout("Polling: Searching for 'Cloud Resume Download' element...")
                                for tag in poll_soup.find_all(['a', 'button']):
                                    tag_text = tag.get_text(strip=True)
                                    if resume_text_pattern.search(tag_text):
                                        polled_resume_tag = tag
                                        log_and_check_timeout(f"SUCCESS: Found 'Cloud Resume Download' element after polling: <{tag.name}> Text: '{tag_text}'")
                                        break # Found it

                                if polled_resume_tag: break # Exit polling loop if found
                                else:
                                    log_and_check_timeout("Polling: 'Cloud Resume Download' not found yet.")

                            except requests.exceptions.Timeout:
                                log_and_check_timeout("Warning: Polling request timed out. Retrying...")
                            except requests.exceptions.RequestException as poll_err:
                                log_and_check_timeout(f"Warning: Error during polling request: {poll_err}. Retrying...")
                            # If button not found or error occurred, the loop continues until timeout

                        # --- After Polling Loop ---
                        if polled_resume_tag:
                            final_link_href = polled_resume_tag.get('href')
                            if not final_link_href and polled_resume_tag.name == 'button':
                                parent_form = polled_resume_tag.find_parent('form')
                                if parent_form: final_link_href = parent_form.get('action')

                            if not final_link_href:
                                logs.append("Error: Found polled 'Cloud Resume' element but couldn't get URL (href/action).")
                                return None

                            final_download_link = urljoin(page3_url, final_link_href.strip())
                            logs.append(f"SUCCESS: Found final link after polling: {final_download_link}")
                            return final_download_link # Return success

                        else: # Polling Timeout
                            logs.append(f"Error: Link generation polling timed out after {time.time() - polling_start_time:.1f}s (Overall time: {time.time() - overall_start_time:.1f}s).")
                            logs.append("Hint: Link might still be generating or process took too long for Vercel limits.")
                            return None # Timeout occurred

                    # else: # POST failed, already returned None above

                else: # Generate button wasn't found at all on page 2
                    logs.append("Error: Neither 'Cloud Resume Download' nor 'Generate Cloud Link' button found on the second page.")
                    logs.append(f"Page 2 Body Snippet (first 1000 chars):\n{response2.text[:1000]}")
                    return None # Failed to find necessary buttons

        # --- Step 3b: Fallback - PixeldrainDL on page 1 ---
        else:
            log_and_check_timeout("Info: 'Fast Cloud Download' not found. Checking for 'PixeldrainDL' as fallback...")
            pixeldrain_link_tag = None
            pixeldrain_pattern = re.compile(r'pixeldrain\s*dl', re.IGNORECASE)
            for tag in possible_tags_p1:
                tag_text = tag.get_text(strip=True)
                if pixeldrain_pattern.search(tag_text):
                    pixeldrain_link_tag = tag
                    log_and_check_timeout(f"Fallback: Found 'PixeldrainDL' element: <{tag.name}> Text: '{tag_text}'")
                    break

            if pixeldrain_link_tag:
                pixeldrain_href = pixeldrain_link_tag.get('href')
                if not pixeldrain_href and pixeldrain_link_tag.name == 'button':
                    parent_form = pixeldrain_link_tag.find_parent('form')
                    if parent_form: pixeldrain_href = parent_form.get('action')

                if pixeldrain_href:
                    pixeldrain_full_url = urljoin(page1_url, pixeldrain_href.strip())
                    log_and_check_timeout(f"SUCCESS: Found Pixeldrain link URL as fallback: {pixeldrain_full_url}")
                    return pixeldrain_full_url # Return success
                else:
                    logs.append("Error: Found Pixeldrain element but couldn't get its URL (href/action).")
                    return None
            else:
                # If Pixeldrain also fails or not found
                logs.append("Error: Neither 'Fast Cloud Download' nor 'PixeldrainDL' link found/processed on the first page.")
                logs.append(f"Page 1 Body Snippet (first 1000 chars):\n{response1.text[:1000]}")
                return None

    except TimeoutError as te: # Catch our custom overall timeout
         logs.append(f"Error: Processing aborted due to overall timeout: {te}")
         return None
    except requests.exceptions.Timeout as e:
        logs.append(f"Error: Request timed out. URL: {e.request.url if e.request else 'N/A'}. Details: {e}")
        return None
    except requests.exceptions.HTTPError as e:
        logs.append(f"Error: HTTP error occurred. Status: {e.response.status_code}. URL: {e.request.url}. Details: {e}")
        # Log response body for HTTP errors if possible
        try:
            logs.append(f"HTTP Error Response Snippet: {e.response.text[:500]}")
        except Exception:
            pass
        return None
    except requests.exceptions.RequestException as e:
        logs.append(f"Error: Network/Request error. Details: {e}")
        return None
    except Exception as e:
        logs.append(f"FATAL ERROR during GDFLIX processing: {e}\n{traceback.format_exc()}")
        return None

    # Should have returned earlier if successful or failed specifically
    logs.append("Error: Reached end of function without finding a link or explicit failure.")
    return None


# --- Vercel Serverless Function Handler ---
class handler(BaseHTTPRequestHandler):

    def _set_headers(self, status_code=200, content_type='application/json'):
        self.send_response(status_code)
        self.send_header('Content-type', content_type)
        # CORS Headers - Adjust '*' in production if needed for security
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_OPTIONS(self):
        # Handle CORS preflight requests
        self._set_headers(200)

    def do_POST(self):
        logs = []
        start_handle_time = time.time()
        result = {"success": False, "error": "Request processing failed", "finalUrl": None, "logs": logs}
        gdflix_url = None
        final_download_link = None

        try:
            # --- Get POST data ---
            content_type, pdict = cgi.parse_header(self.headers.get('content-type'))
            if content_type == 'application/json':
                content_length = int(self.headers.get('content-length', 0))
                if content_length == 0:
                     logs.append("Error: Received empty POST body.")
                     result["error"] = "Empty request body received"
                     self._set_headers(400)
                     self.wfile.write(json.dumps(result, separators=(',', ':')).encode('utf-8'))
                     return

                post_body = self.rfile.read(content_length)
                logs.append("Received JSON POST body.")
                try:
                    data = json.loads(post_body)
                    gdflix_url = data.get('gdflixUrl') # Expecting this key
                except json.JSONDecodeError as e:
                    logs.append(f"Error: Invalid JSON received: {e}")
                    logs.append(f"Received Body: {post_body.decode('utf-8', errors='ignore')}") # Log raw body on JSON error
                    result["error"] = "Invalid JSON in request body"
                    self._set_headers(400)
                    self.wfile.write(json.dumps(result, separators=(',', ':')).encode('utf-8'))
                    return
            else:
                logs.append(f"Error: Unsupported Content-Type: {content_type}")
                result["error"] = "Unsupported Content-Type. Please send application/json."
                self._set_headers(415) # Unsupported Media Type
                self.wfile.write(json.dumps(result, separators=(',', ':')).encode('utf-8'))
                return

            # --- Validate URL ---
            if not gdflix_url or not isinstance(gdflix_url, str):
                logs.append("Error: gdflixUrl missing or invalid in request.")
                result["error"] = "Missing or invalid gdflixUrl in request body"
                self._set_headers(400)
                self.wfile.write(json.dumps(result, separators=(',', ':')).encode('utf-8'))
                return

            logs.append(f"Processing GDFLIX URL: {gdflix_url}")
            try:
                parsed_start_url = urlparse(gdflix_url)
                if not parsed_start_url.scheme or not parsed_start_url.netloc:
                     raise ValueError("Invalid URL format (missing scheme or netloc)")
            except Exception as url_err:
                 logs.append(f"Error: Invalid URL format: {gdflix_url}. Details: {url_err}")
                 result["error"] = f"Invalid URL format provided: {gdflix_url}"
                 self._set_headers(400)
                 self.wfile.write(json.dumps(result, separators=(',', ':')).encode('utf-8'))
                 return

            # --- Perform Scraping ---
            final_download_link = get_gdflix_download_link(gdflix_url, logs=logs)
            processing_time = time.time() - start_handle_time
            logs.append(f"Total processing time: {processing_time:.2f} seconds.")

            # --- Prepare Response ---
            if final_download_link:
                result["success"] = True
                result["finalUrl"] = final_download_link
                result["error"] = None
                self._set_headers(200)
            else:
                result["success"] = False
                # --- Improved Error Extraction ---
                failure_indicators = ["error:", "fatal error", "failed:", "could not find", "timed out", "hint:", "warning:"]
                final_error_log = None # Start with None
                for log_entry in reversed(logs):
                    log_lower = log_entry.lower()
                    if any(indicator in log_lower for indicator in failure_indicators):
                        # Try to clean up the log entry slightly
                        cleaned_error = log_entry.split(":", 1)[-1].strip() if ":" in log_entry else log_entry
                        # Prioritize certain errors
                        if "cloudflare" in log_lower or "captcha" in log_lower:
                             final_error_log = "Potential Cloudflare/Captcha block"
                             break # High priority error
                        elif "timeout" in log_lower or "timed out" in log_lower:
                             final_error_log = "Operation Timed Out"
                             break # High priority error
                        else:
                            final_error_log = cleaned_error[:150] # Limit length
                            break # Found the most recent relevant log

                # If no specific error found in logs, use a better default
                result["error"] = final_error_log if final_error_log else "GDFLIX extraction failed (Unknown reason)"
                # --- End Improved Error Extraction ---
                self._set_headers(500) # Indicate backend failure

        except Exception as e:
            # Catch unexpected errors in the handler itself
            print(f"FATAL GDFLIX Handler Error: {e}\n{traceback.format_exc()}", file=sys.stderr)
            logs.append(f"FATAL Handler Error: {e}\n{traceback.format_exc()}")
            result["success"] = False
            result["error"] = "Internal server error during request handling."
            # Ensure headers aren't sent twice if error occurs after _set_headers
            if not self.headers_sent:
                 self._set_headers(500)

        finally:
            # Ensure logs are included and send response
            result["logs"] = logs
            response_body = json.dumps(result, indent=None, separators=(',', ':')).encode('utf-8')
            # Add content length header for the final response
            self.send_header('Content-Length', str(len(response_body)))
            self.end_headers() # End headers *after* setting Content-Length
            self.wfile.write(response_body)
