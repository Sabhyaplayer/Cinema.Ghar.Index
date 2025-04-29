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
DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
}
REQUEST_TIMEOUT = 30 # Request timeout
GENERATION_TIMEOUT = 45 # Max wait time for the link generation polling
POLL_INTERVAL = 5 # Seconds between polling checks

# --- Core GDFLIX Scraping Logic (Modified for Logging) ---

def get_gdflix_download_link(start_url, logs=None):
    """
    Fetches the final download link for GDFLIX style sites.
    Logs progress to the provided list.
    Returns the final URL string or None if failed.
    """
    if logs is None:
        logs = []

    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS) # Set default headers for session
    final_download_link = None

    try:
        # --- Step 1 & 2 --- (Fetch and parse page 1)
        logs.append(f"Fetching initial URL: {start_url}")
        response1 = session.get(start_url, allow_redirects=True, timeout=REQUEST_TIMEOUT)
        response1.raise_for_status()
        page1_url = response1.url
        logs.append(f"Initial fetch successful. Landed on: {page1_url}")
        soup1 = BeautifulSoup(response1.text, PARSER)
        possible_tags_p1 = soup1.find_all(['a', 'button'])

        # --- Step 3 --- (Find Fast Cloud)
        fast_cloud_link_tag = None
        fast_cloud_pattern = re.compile(r'fast\s+cloud\s+download', re.IGNORECASE)
        logs.append("Searching for 'Fast Cloud Download' link/button...")
        for tag in possible_tags_p1:
            if fast_cloud_pattern.search(tag.get_text(strip=True)):
                fast_cloud_link_tag = tag
                logs.append(f"Found 'Fast Cloud' element: <{tag.name}>")
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
                return None # Return None as link wasn't found

            second_page_url = urljoin(page1_url, fast_cloud_href.strip())
            logs.append(f"Resolved 'Fast Cloud' target URL: {second_page_url}")
            time.sleep(1) # Small delay

            logs.append(f"Fetching second page (Generate/Resume): {second_page_url}")
            fetch_headers_p2 = {'Referer': page1_url}
            response2 = session.get(second_page_url, timeout=REQUEST_TIMEOUT, headers=fetch_headers_p2)
            response2.raise_for_status()
            page2_url = response2.url
            logs.append(f"Landed on second page: {page2_url}")
            soup2 = BeautifulSoup(response2.text, PARSER)
            possible_tags_p2 = soup2.find_all(['a', 'button'])

            # --- Step 6 --- (Find Cloud Resume Download)
            resume_link_tag = None
            resume_text_pattern = re.compile(r'cloud\s+resume\s+download', re.IGNORECASE)
            logs.append("Searching for 'Cloud Resume Download' link/button...")
            for tag in possible_tags_p2:
                 if resume_text_pattern.search(tag.get_text(strip=True)):
                    resume_link_tag = tag
                    logs.append(f"Found 'Cloud Resume' element directly: <{tag.name}>")
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
                # return final_download_link # Don't return yet, let it fall through to the end

            # --- Step 6b --- (If not found directly, check for Generate button by ID)
            else:
                logs.append("Info: 'Cloud Resume Download' not found directly. Checking for 'Generate Cloud Link' button...")
                generate_tag = soup2.find('button', id='cloud')
                if not generate_tag: # Fallback search by text if ID fails
                    generate_pattern = re.compile(r'generate\s+cloud\s+link', re.IGNORECASE)
                    for tag in possible_tags_p2:
                        if generate_pattern.search(tag.get_text(strip=True)):
                            generate_tag = tag
                            break

                # --- If Generate button is found, MIMIC THE POST REQUEST ---
                if generate_tag:
                    logs.append(f"Found 'Generate Cloud Link' button: <{generate_tag.name} id='{generate_tag.get('id', 'N/A')}'>")
                    logs.append("Info: Attempting to mimic the JavaScript POST request...")

                    # Data observed from GDFLIX network analysis - may need adjustment for variants
                    post_data = {'action': 'cloud', 'key': '08df4425e31c4330a1a0a3cefc45c19e84d0a192', 'action_token': ''}
                    parsed_uri = urlparse(page2_url)
                    hostname = parsed_uri.netloc
                    # Headers observed from GDFLIX network analysis
                    post_headers = {'x-token': hostname, 'Referer': page2_url}
                    post_headers.update(session.headers) # Include session cookies etc.

                    logs.append(f"Info: Sending POST request to {page2_url}...")
                    page3_url = None # URL to poll
                    try:
                        post_response = session.post(page2_url, data=post_data, headers=post_headers, timeout=REQUEST_TIMEOUT)
                        post_response.raise_for_status()

                        # Try parsing response as JSON
                        try:
                            response_data = post_response.json()
                            logs.append(f"Info: POST response JSON: {response_data}")
                            # Check for expected keys containing the polling URL
                            if response_data.get('visit_url'):
                                page3_url = urljoin(page2_url, response_data['visit_url'])
                            elif response_data.get('url'):
                                page3_url = urljoin(page2_url, response_data['url'])
                            elif response_data.get('error'):
                                logs.append(f"Error from POST request: {response_data.get('message', 'Unknown error')}")
                                return None # POST returned an error state
                            else:
                                logs.append("Error: POST response JSON format unknown or missing URL key.")
                                return None

                            if page3_url:
                                logs.append(f"Info: POST successful. Need to poll new URL: {page3_url}")

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
                        logs.append(f"Info: Starting polling loop for {page3_url} (Timeout: {GENERATION_TIMEOUT}s)...")
                        start_time = time.time()
                        polled_resume_tag = None

                        while time.time() - start_time < GENERATION_TIMEOUT:
                            # Calculate remaining time and sleep
                            remaining_time = GENERATION_TIMEOUT - (time.time() - start_time)
                            wait_time = min(POLL_INTERVAL, remaining_time)
                            if wait_time <= 0: break # Timeout reached

                            logs.append(f"Info: Waiting {wait_time:.1f}s before polling...")
                            time.sleep(wait_time)

                            logs.append(f"Polling URL: {page3_url}")
                            try:
                                # Use the same session to maintain cookies
                                poll_headers = {'Referer': page3_url} # Referer is often important
                                poll_response = session.get(page3_url, timeout=REQUEST_TIMEOUT, headers=poll_headers)

                                if poll_response.status_code != 200:
                                    logs.append(f"Warning: Polling returned status {poll_response.status_code}. Retrying...")
                                    continue # Skip parsing if status is not OK

                                poll_soup = BeautifulSoup(poll_response.text, PARSER)

                                # Search for the 'Cloud Resume Download' button again on the polled page
                                for tag in poll_soup.find_all(['a', 'button']):
                                    if resume_text_pattern.search(tag.get_text(strip=True)):
                                        polled_resume_tag = tag
                                        logs.append(f"SUCCESS: Found 'Cloud Resume Download' element after polling: <{tag.name}>")
                                        break # Found it

                                if polled_resume_tag: break # Exit polling loop if found

                            except requests.exceptions.Timeout:
                                logs.append("Warning: Polling request timed out. Retrying...")
                            except requests.exceptions.RequestException as poll_err:
                                logs.append(f"Warning: Error during polling request: {poll_err}. Retrying...")
                            except Exception as parse_err:
                                logs.append(f"Warning: Error parsing polled page: {parse_err}. Retrying...")
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
                            # return final_download_link # Don't return yet

                        else: # Polling Timeout
                            logs.append(f"Error: Link generation timed out after {GENERATION_TIMEOUT}s.")
                            # Changed timeout message as requested in the original script example
                            logs.append("Hint: Link might still be generating. Try again after a few minutes.")
                            return None # Timeout occurred

                    # else: # POST failed, already returned None above

                else: # Generate button wasn't found at all on page 2
                    logs.append("Error: Neither 'Cloud Resume Download' nor 'Generate Cloud Link' button found on the second page.")
                    body_tag_p2 = soup2.find('body')
                    logs.append("Second page body snippet (first 1000 chars):\n" + (str(body_tag_p2)[:1000] if body_tag_p2 else response2.text[:1000]))
                    return None # Failed to find necessary buttons

        # --- Step 3b: Fallback - PixeldrainDL on page 1 ---
        else:
            logs.append("Info: 'Fast Cloud Download' not found. Checking for 'PixeldrainDL' as fallback...")
            pixeldrain_link_tag = None
            pixeldrain_pattern = re.compile(r'pixeldrain\s*dl', re.IGNORECASE)
            for tag in possible_tags_p1:
                if pixeldrain_pattern.search(tag.get_text(strip=True)):
                    pixeldrain_link_tag = tag
                    logs.append(f"Found fallback 'PixeldrainDL' element: <{tag.name}>")
                    break

            if pixeldrain_link_tag:
                pixeldrain_href = pixeldrain_link_tag.get('href')
                if not pixeldrain_href and pixeldrain_link_tag.name == 'button':
                    parent_form = pixeldrain_link_tag.find_parent('form')
                    if parent_form: pixeldrain_href = parent_form.get('action')

                if pixeldrain_href:
                    pixeldrain_full_url = urljoin(page1_url, pixeldrain_href.strip())
                    logs.append(f"SUCCESS: Found Pixeldrain link URL as fallback: {pixeldrain_full_url}")
                    final_download_link = pixeldrain_full_url # Assign to final variable
                    # return pixeldrain_full_url # Don't return yet
                else:
                    logs.append("Error: Found Pixeldrain element but couldn't get its URL (href/action).")
                    return None
            else:
                # If Pixeldrain also fails or not found
                logs.append("Error: Neither 'Fast Cloud Download' nor 'PixeldrainDL' link found/processed on the first page.")
                return None


    except requests.exceptions.Timeout as e:
        logs.append(f"Error: Request timed out. Details: {e}")
        return None
    except requests.exceptions.HTTPError as e:
        logs.append(f"Error: HTTP error occurred. Status: {e.response.status_code}. URL: {e.request.url}. Details: {e}")
        return None
    except requests.exceptions.RequestException as e:
        logs.append(f"Error: Network/Request error. Details: {e}")
        return None
    except Exception as e:
        logs.append(f"FATAL ERROR during GDFLIX processing: {e}\n{traceback.format_exc()}")
        return None

    # Return the final link (could be None if processing failed at any step)
    return final_download_link


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
        result = {"success": False, "error": "Request processing failed", "finalUrl": None, "logs": logs}
        gdflix_url = None
        final_download_link = None

        try:
            # --- Get POST data ---
            content_type, pdict = cgi.parse_header(self.headers.get('content-type'))
            if content_type == 'application/json':
                content_length = int(self.headers.get('content-length', 0))
                post_body = self.rfile.read(content_length)
                logs.append("Received JSON POST body.")
                try:
                    data = json.loads(post_body)
                    gdflix_url = data.get('gdflixUrl') # Expecting this key
                except json.JSONDecodeError as e:
                    logs.append(f"Error: Invalid JSON received: {e}")
                    result["error"] = "Invalid JSON in request body"
                    self._set_headers(400)
                    self.wfile.write(json.dumps(result).encode('utf-8'))
                    return
            else:
                logs.append(f"Error: Unsupported Content-Type: {content_type}")
                result["error"] = "Unsupported Content-Type. Please send application/json."
                self._set_headers(415) # Unsupported Media Type
                self.wfile.write(json.dumps(result).encode('utf-8'))
                return

            # --- Validate URL ---
            if not gdflix_url or not isinstance(gdflix_url, str):
                logs.append("Error: gdflixUrl missing or invalid in request.")
                result["error"] = "Missing or invalid gdflixUrl in request body"
                self._set_headers(400)
                self.wfile.write(json.dumps(result).encode('utf-8'))
                return

            logs.append(f"Processing GDFLIX URL: {gdflix_url}")
            parsed_start_url = urlparse(gdflix_url)
            if not parsed_start_url.scheme or not parsed_start_url.netloc:
                 logs.append(f"Error: Invalid URL format: {gdflix_url}")
                 result["error"] = f"Invalid URL format provided: {gdflix_url}"
                 self._set_headers(400)
                 self.wfile.write(json.dumps(result).encode('utf-8'))
                 return

            # --- Perform Scraping by calling the core function ---
            # Pass the logs list to the function
            final_download_link = get_gdflix_download_link(gdflix_url, logs=logs)

            # --- Prepare Response ---
            if final_download_link:
                result["success"] = True
                result["finalUrl"] = final_download_link
                result["error"] = None
                self._set_headers(200)
            else:
                result["success"] = False
                # Try extracting specific error if not already set during processing
                if not result.get("error"):
                     failure_indicators = ["Error:", "FATAL ERROR", "FAILED", "Could not find", "timed out", "Hint:"]
                     # Look backwards through logs for the last failure message
                     final_error_log = "Extraction Failed (Check logs)" # Default if no specific log found
                     for log_entry in reversed(logs):
                         if any(indicator in log_entry for indicator in failure_indicators):
                             # Try to clean up the log entry slightly
                             cleaned_error = log_entry.split(":", 1)[-1].strip() if ":" in log_entry else log_entry
                             final_error_log = cleaned_error[:150] # Limit length
                             break
                     result["error"] = final_error_log

                self._set_headers(500) # Indicate backend failure

        except Exception as e:
            # Catch unexpected errors in the handler itself
            print(f"FATAL GDFLIX Handler Error: {e}", file=sys.stderr)
            logs.append(f"FATAL Handler Error: {e}\n{traceback.format_exc()}")
            result["success"] = False
            result["error"] = "Internal server error processing GDFLIX request."
            self._set_headers(500)

        finally:
            # Ensure logs are included and send response
            result["logs"] = logs
            # Use compact JSON encoding for potentially smaller response size
            self.wfile.write(json.dumps(result, indent=None, separators=(',', ':')).encode('utf-8'))

# Note: The Vercel Python runtime will automatically pick up the 'handler'
# class and use it to serve requests for /api/gdflix (if saved as gdflix.py)
