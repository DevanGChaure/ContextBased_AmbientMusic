"""
Shared HTTP retry logic for the Director's cloud API calls.

Free-tier Gemini/Groq keys have low requests-per-minute limits — a 429 here
almost never means "you're out of quota for the day", it means "you sent
requests too close together". The right response is to wait and retry, not
crash the whole book-processing run over a transient rate limit.
"""

import time

import requests


class RateLimitExceeded(RuntimeError):
    pass


def post_with_retry(url, headers=None, json_payload=None, timeout=60,
                     max_retries=5, base_delay=10):
    """
    POSTs with retry-on-429 (and on 5xx, which are usually also transient).
    Honors a Retry-After header if the API sends one; otherwise backs off
    exponentially (base_delay, base_delay*2, base_delay*4, ...).
    Raises RateLimitExceeded if still failing after max_retries.
    """
    last_error = None

    for attempt in range(max_retries + 1):
        try:
            resp = requests.post(url, headers=headers, json=json_payload, timeout=timeout)
        except requests.RequestException as e:
            last_error = e
            if attempt == max_retries:
                raise RateLimitExceeded(f"Request failed after {max_retries} retries: {e}") from e
            time.sleep(base_delay * (2 ** attempt))
            continue

        if resp.status_code == 200:
            return resp

        if resp.status_code == 429 or resp.status_code >= 500:
            retry_after = resp.headers.get("Retry-After")
            if retry_after:
                try:
                    delay = float(retry_after)
                except ValueError:
                    delay = base_delay * (2 ** attempt)
            else:
                delay = base_delay * (2 ** attempt)

            if attempt == max_retries:
                raise RateLimitExceeded(
                    f"Still getting HTTP {resp.status_code} after {max_retries} retries. "
                    f"You're likely hitting a per-minute rate limit on the free tier — "
                    f"check your provider's current rate limits, or slow down requests "
                    f"(e.g. add a delay between chunks, or reduce book size with --limit). "
                    f"Last response: {resp.text[:300]}"
                )
            print(f"  [rate limited: HTTP {resp.status_code}, "
                  f"retrying in {delay:.0f}s (attempt {attempt + 1}/{max_retries})]")
            time.sleep(delay)
            continue

        # Non-retryable error (4xx other than 429) — fail immediately with detail
        resp.raise_for_status()

    raise RateLimitExceeded(f"Request failed after {max_retries} retries: {last_error}")