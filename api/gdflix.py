# /api/gdflix.py
from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import urljoin, urlparse, parse_qs
import time
import re
import cloudscraper # Use cloudscraper instead of requests
from bs4 import BeautifulSoup
# ---- ADD THIS LINE ----
from requests.exceptions import Timeout, RequestException # Import specific exceptions

# --- Constants ---
GENERATION_TIMEOUT = 40
POLL_INTERVAL = 5
DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
}

# --- GDFLIX Bypass Logic (adapted to use cloudscraper) ---
def get_gdflix_download_link_with_scraper(scraper, start_url):
    """
    Fetches the final download link using a cloudscraper instance.
    Handles 'Generate' button by mimicking its POST request.
    """
    print(f"GDFLIX Bypass: Starting for URL: {start_url}")
    page1_url = start_url
    try:
        # --- Step 1 & 2 --- (Fetch and parse page 1)
        print(f"GDFLIX Bypass: Fetching initial URL: {page1_url}")
        response1 = scraper.get(page1_url, allow_redirects=True, timeout=30)
        response1.raise_for_status()
        page1_url = response1.url
        print(f"GDFLIX Bypass: Redirected to/Landed on: {page1_url}")
        soup1 = BeautifulSoup(response1.text, 'lxml')
        possible_tags_p1 = soup1.find_all(['a', 'button'])

        # --- Step 3 --- (Find Fast Cloud)
        fast_cloud_link_tag = None
        fast_cloud_pattern = re.compile(r'fast\s+cloud\s+download', re.IGNORECASE)
        for tag in possible_tags_p1:
            if fast_cloud_pattern.search(tag.get_text(strip=True)):
                fast_cloud_link_tag = tag
                print(f"GDFLIX Bypass: Found primary target (Fast Cloud): {tag.name}...")
                break

        # --- If Fast Cloud Found ---
        if fast_cloud_link_tag:
            # --- Steps 3a, 4, 5 --- (Getting to page 2)
            fast_cloud_href = fast_cloud_link_tag.get('href')
            if not fast_cloud_href and fast_cloud_link_tag.name == 'button':
                parent_form = fast_cloud_link_tag.find_parent('form')
                if parent_form: fast_cloud_href = parent_form.get('action')
            if not fast_cloud_href:
                print("GDFLIX Bypass Error: Found 'Fast Cloud Download' but couldn't get URL.")
                return None, "Fast Cloud element found, but no link associated."

            second_page_url = urljoin(page1_url, fast_cloud_href)
            print(f"GDFLIX Bypass: Found Fast Cloud link URL: {second_page_url}")
            time.sleep(1)

            print(f"GDFLIX Bypass: Fetching second page URL (Generate button page): {second_page_url}")
            fetch_headers_p2 = {'Referer': page1_url}
            response2 = scraper.get(second_page_url, timeout=30, headers=fetch_headers_p2)
            response2.raise_for_status()
            page2_url = response2.url
            print(f"GDFLIX Bypass: Landed on second page: {page2_url}")
            soup2 = BeautifulSoup(response2.text, 'lxml')
            possible_tags_p2 = soup2.find_all(['a', 'button'])

            # --- Step 6 --- (Find Cloud Resume Download)
            resume_link_tag = None
            resume_text_pattern = re.compile(r'cloud\s+resume\s+download', re.IGNORECASE)
            for tag in possible_tags_p2:
                 if resume_text_pattern.search(tag.get_text(strip=True)):
                    resume_link_tag = tag
                    print(f"GDFLIX Bypass: Found final link tag directly (Cloud Resume): {tag.name}...")
                    break

            # --- Step 6a --- (If found directly)
            if resume_link_tag:
                final_link_href = resume_link_tag.get('href')
                if not final_link_href and resume_link_tag.name == 'button':
                     parent_form = resume_link_tag.find_parent('form')
                     if parent_form: final_link_href = parent_form.get('action')
                if not final_link_href:
                    print("GDFLIX Bypass Error: Found 'Cloud Resume' but no href/action.")
                    return None, "Cloud Resume element found, but no link."
                final_download_link = urljoin(page2_url, final_link_href)
                print(f"GDFLIX Bypass: Found final Cloud Resume link URL: {final_download_link}")
                return final_download_link, None

            # --- Step 6b --- (If not found directly, check for Generate button by ID/Text)
            else:
                print("GDFLIX Bypass Info: 'Cloud Resume Download' not found directly. Checking for 'Generate Cloud Link' button...")
                generate_tag = soup2.find('button', id='cloud')
                if not generate_tag:
                    generate_pattern = re.compile(r'generate\s+cloud\s+link', re.IGNORECASE)
                    for tag in possible_tags_p2:
                        if generate_pattern.search(tag.get_text(strip=True)):
                            generate_tag = tag
                            break

                # --- If Generate button is found, MIMIC THE POST REQUEST ---
                if generate_tag:
                    print(f"GDFLIX Bypass: Found 'Generate Cloud Link' button: {generate_tag.name} id='{generate_tag.get('id', 'N/A')}'")
                    print("GDFLIX Bypass Info: Attempting to mimic the JavaScript POST request...")

                    post_data = {'action': 'cloud', 'key': '08df4425e31c4330a1a0a3cefc45c19e84d0a192', 'action_token': ''}
                    parsed_uri = urlparse(page2_url)
                    hostname = parsed_uri.netloc
                    post_headers = {'x-token': hostname, 'Referer': page2_url}

                    print(f"GDFLIX Bypass Info: Sending POST request to {page2_url}...")
                    page3_url = None
                    try:
                        post_response = scraper.post(page2_url, data=post_data, headers=post_headers, timeout=30)
                        post_response.raise_for_status()

                        try:
                            response_data = post_response.json()
                            print(f"GDFLIX Bypass Info: POST response JSON: {response_data}")
                            page3_url_relative = response_data.get('visit_url') or response_data.get('url')
                            if page3_url_relative:
                                page3_url = urljoin(page2_url, page3_url_relative)
                                print(f"GDFLIX Bypass Info: POST successful. Need to poll new URL: {page3_url}")
                            elif response_data.get('error'):
                                error_msg = response_data.get('message', 'Unknown POST error')
                                print(f"GDFLIX Bypass Error from POST request: {error_msg}")
                                return None, f"POST Error: {error_msg}"
                            else:
                                print("GDFLIX Bypass Error: POST response JSON format unknown.")
                                return None, "Unknown POST response format."
                        except json.JSONDecodeError:
                             if 300 <= post_response.status_code < 400 and 'location' in post_response.headers:
                                page3_url = urljoin(page2_url, post_response.headers['location'])
                                print(f"GDFLIX Bypass Info: POST resulted in redirect to: {page3_url}. Polling this.")
                             else:
                                print(f"GDFLIX Bypass Error: Failed to decode JSON response from POST. Status: {post_response.status_code}")
                                print("Response text (first 500 chars):", post_response.text[:500])
                                if "cloudflare" in post_response.text.lower() or "captcha" in post_response.text.lower():
                                    print("GDFLIX Bypass Hint: Cloudflare/Captcha challenge likely blocked the POST request.")
                                    return None, "Cloudflare/Captcha Blocked POST"
                                else:
                                    return None, f"Non-JSON POST response (Status: {post_response.status_code})"

                    except cloudscraper.exceptions.CloudflareException as cf_err:
                         print(f"GDFLIX Bypass Error: Cloudflare challenge during POST: {cf_err}")
                         return None, "Cloudflare Blocked POST"
                    # Use imported RequestException here
                    except RequestException as post_err:
                         print(f"GDFLIX Bypass Error during POST request: {post_err}")
                         return None, f"POST Network Error: {post_err}"

                    # --- If POST was successful and we have page3_url, START POLLING ---
                    if page3_url:
                        print(f"GDFLIX Bypass Info: Starting polling loop for {page3_url}...")
                        start_time = time.time()
                        while time.time() - start_time < GENERATION_TIMEOUT:
                            elapsed_time = time.time() - start_time
                            remaining_time = GENERATION_TIMEOUT - elapsed_time
                            if remaining_time <= 0: break

                            wait_time = min(POLL_INTERVAL, remaining_time)
                            print(f"GDFLIX Bypass Info: Waiting {wait_time:.1f}s before checking {page3_url}...")
                            time.sleep(wait_time)

                            try:
                                poll_headers = {'Referer': page3_url}
                                poll_response = scraper.get(page3_url, timeout=30, headers=poll_headers)
                                if poll_response.status_code != 200:
                                    print(f"GDFLIX Bypass Warning: Polling status {poll_response.status_code}. Retrying.")
                                    continue

                                poll_soup = BeautifulSoup(poll_response.text, 'lxml')
                                polled_resume_tag = None
                                for tag in poll_soup.find_all(['a', 'button']):
                                    if resume_text_pattern.search(tag.get_text(strip=True)):
                                        polled_resume_tag = tag
                                        print(f"\nGDFLIX Bypass Success: Found 'Cloud Resume Download' after polling!")
                                        break

                                if polled_resume_tag:
                                    final_link_href = polled_resume_tag.get('href')
                                    if not final_link_href and polled_resume_tag.name == 'button':
                                        parent_form = polled_resume_tag.find_parent('form')
                                        if parent_form: final_link_href = parent_form.get('action')
                                    if not final_link_href:
                                        print("GDFLIX Bypass Error: Found polled 'Cloud Resume' but no href/action.")
                                        return None, "Polled Cloud Resume found, but no link."
                                    final_download_link = urljoin(page3_url, final_link_href)
                                    print(f"GDFLIX Bypass: Found final Cloud Resume link URL after polling: {final_download_link}")
                                    return final_download_link, None

                            # Use imported RequestException here
                            except RequestException as poll_err:
                                print(f"GDFLIX Bypass Warning: Error during polling request: {poll_err}. Will retry.")
                            except Exception as parse_err:
                                print(f"GDFLIX Bypass Warning: Error parsing polled page: {parse_err}. Will retry.")

                        print(f"GDFLIX Bypass Error: Link generation timed out after {GENERATION_TIMEOUT}s.")
                        return None, f"Link is generating. Try again after a few minutes. (Timeout: {GENERATION_TIMEOUT}s)"

                else:
                    print("GDFLIX Bypass Error: Neither 'Cloud Resume Download' nor 'Generate Cloud Link' button found on the second page.")
                    return None, "Required button not found on intermediate page."

        # --- Step 3b: Fallback - PixeldrainDL on page 1 ---
        else:
            print("GDFLIX Bypass Info: 'Fast Cloud Download' not found. Checking for 'PixeldrainDL'...")
            pixeldrain_link_tag = None
            pixeldrain_pattern = re.compile(r'pixeldrain\s*dl', re.IGNORECASE)
            for tag in possible_tags_p1:
                if pixeldrain_pattern.search(tag.get_text(strip=True)):
                    pixeldrain_link_tag = tag
                    print(f"GDFLIX Bypass: Found fallback tag (Pixeldrain): {tag.name}...")
                    break

            if pixeldrain_link_tag:
                pixeldrain_href = pixeldrain_link_tag.get('href')
                if not pixeldrain_href and pixeldrain_link_tag.name == 'button':
                    parent_form = pixeldrain_link_tag.find_parent('form')
                    if parent_form: pixeldrain_href = parent_form.get('action')

                if pixeldrain_href:
                    pixeldrain_full_url = urljoin(page1_url, pixeldrain_href)
                    print(f"GDFLIX Bypass: Found Pixeldrain link URL: {pixeldrain_full_url}")
                    return pixeldrain_full_url, None
                else:
                    print("GDFLIX Bypass Error: Found Pixeldrain element but couldn't get href/action.")
                    return None, "Pixeldrain found, but no link."

            print("GDFLIX Bypass Error: Neither 'Fast Cloud Download' nor 'PixeldrainDL' link found/processed on the first page.")
            return None, "Primary and fallback links not found."


    except cloudscraper.exceptions.CloudflareException as cf_err:
        print(f"GDFLIX Bypass Error: Cloudflare challenge encountered: {cf_err}")
        return None, "Cloudflare protection blocked access."
    # Use imported Timeout and RequestException here
    except Timeout:
        print("GDFLIX Bypass Error: Request timed out.")
        return None, "Request timed out."
    except RequestException as e:
        print(f"GDFLIX Bypass Error: Network error during requests: {e}")
        return None, f"Network Error: {e}"
    except Exception as e:
        import traceback
        print(f"GDFLIX Bypass Error: An unexpected error occurred: {e}")
        traceback.print_exc()
        return None, f"Unexpected Error: {e}"

# --- API Handler Class (remains the same) ---
class handler(BaseHTTPRequestHandler):

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            self._send_response(400, {"success": False, "error": "Missing request body"})
            return

        try:
            body = self.rfile.read(content_length)
            data = json.loads(body)
        except json.JSONDecodeError:
            self._send_response(400, {"success": False, "error": "Invalid JSON format"})
            return
        except Exception as e:
             self._send_response(400, {"success": False, "error": f"Error reading request body: {e}"})
             return

        gdflix_url = data.get('gdflixUrl')
        if not gdflix_url:
            self._send_response(400, {"success": False, "error": "Missing 'gdflixUrl' in request body"})
            return

        scraper = None
        try:
            print("GDFLIX API: Creating cloudscraper instance...")
            scraper = cloudscraper.create_scraper(
                 browser={
                    'browser': 'chrome',
                    'platform': 'windows',
                    'mobile': False
                }
            )
            scraper.headers.update(DEFAULT_HEADERS)
            print("GDFLIX API: Starting bypass process...")
            final_url, error_message = get_gdflix_download_link_with_scraper(scraper, gdflix_url)
            print("GDFLIX API: Bypass process finished.")

            if final_url:
                self._send_response(200, {"success": True, "finalUrl": final_url})
            else:
                status_code = 500
                if "Timeout" in (error_message or "") or "generating" in (error_message or ""):
                    status_code = 504
                elif "Cloudflare" in (error_message or "") or "Captcha" in (error_message or ""):
                     status_code = 503
                elif "not found" in (error_message or "").lower() or "no link" in (error_message or "").lower():
                     status_code = 404

                self._send_response(status_code, {"success": False, "error": error_message or "Bypass failed for unknown reason."})

        except Exception as e:
            import traceback
            print("GDFLIX API: Unhandled exception during bypass!")
            traceback.print_exc()
            self._send_response(500, {"success": False, "error": f"Internal server error: {e}"})
        finally:
             if scraper:
                 print("GDFLIX API: cloudscraper instance cleanup (automatic).")
                 pass


    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, x-token, User-Agent, Accept')
        self.send_header('Access-Control-Max-Age', '86400')
        self.end_headers()

    def _send_response(self, status_code, response_data):
        self.send_response(status_code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(response_data).encode('utf-8'))
